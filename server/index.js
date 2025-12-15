import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      // Allow any localhost port
      if (origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

// Narration cache: Map<string, { narration: string, timestamp: number }>
// Cache key format: `${text}::${language}`
const narrationCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_MARKERS = 1000;

app.use(cors());
app.use(express.json());

// Parse agent JSONL file
function parseAgentFile(agentFilePath) {
  if (!fs.existsSync(agentFilePath)) {
    return null;
  }

  const content = fs.readFileSync(agentFilePath, 'utf-8');
  const lines = content.trim().split('\n');

  let agentId = null;
  const actions = [];
  const messages = [];
  let isCompleted = false;
  let lastStopReason = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const record = JSON.parse(line);

      // Extract agentId from the record
      if (!agentId && record.agentId) {
        agentId = record.agentId;
      }

      // Parse assistant messages
      if (record.type === 'assistant' && record.message?.content) {
        const content = record.message.content;

        // Check for stop_reason to detect completion
        if (record.message.stop_reason) {
          lastStopReason = record.message.stop_reason;
        }

        if (Array.isArray(content)) {
          for (const block of content) {
            // Extract tool_use blocks as actions
            if (block.type === 'tool_use') {
              const filePath = block.input?.file_path || block.input?.path;
              actions.push({
                name: block.name,
                filePath: filePath || null,
                input: block.input,
                timestamp: record.timestamp
              });
            }

            // Extract text blocks as messages
            if (block.type === 'text' && block.text) {
              messages.push({
                text: block.text,
                timestamp: record.timestamp
              });
            }
          }
        }
      }
    } catch (e) {
      // Skip unparseable lines
    }
  }

  // Determine if agent has completed
  // Agent is done if we found "end_turn", still active if last stop_reason is "tool_use"
  if (lastStopReason === 'end_turn') {
    isCompleted = true;
  }

  return { agentId, actions, messages, isCompleted, lastStopReason };
}

// Process agents based on freshness
// - Fresh agents: Keep full data (actions, messages)
// - Stale agents: Keep basic info only (id, name, task, timestamps), mark as stale
const FRESH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes - keep completed agents with full data
const STALE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes - "active" agents without activity are stale

function processAgentFreshness(agents) {
  const now = Date.now();

  return agents.map(agent => {
    let isStale = false;

    // For "active" agents, check if they have recent activity
    // Agents spawned long ago with no recent activity are probably dead/stuck
    if (agent.status !== 'done') {
      const lastActivity = agent.lastActivityTime || agent.startTime;
      if (lastActivity) {
        const lastActivityMs = new Date(lastActivity).getTime();
        const timeSinceActivity = now - lastActivityMs;

        if (timeSinceActivity > STALE_WINDOW_MS) {
          console.log(`Marking agent ${agent.id} as stale: no activity for ${Math.floor(timeSinceActivity / 1000)}s`);
          isStale = true;
        }
      }
    } else {
      // For completed agents, check if they finished recently
      if (agent.endTime) {
        const endTimeMs = new Date(agent.endTime).getTime();
        const timeSinceCompletion = now - endTimeMs;
        const isRecent = timeSinceCompletion <= FRESH_WINDOW_MS;

        if (!isRecent) {
          console.log(`Marking agent ${agent.id} as stale: completed ${Math.floor(timeSinceCompletion / 1000)}s ago`);
          isStale = true;
        }
      } else {
        // If no endTime but agent is done, mark as stale (old agent)
        console.log(`Marking agent ${agent.id} as stale: done but no endTime`);
        isStale = true;
      }
    }

    if (isStale) {
      // Return minimal agent info for stale agents (collapsed view)
      return {
        id: agent.id,
        name: agent.name,
        status: agent.status === 'done' ? 'done' : 'stale', // Mark abandoned active agents as stale
        currentTask: agent.currentTask,
        startTime: agent.startTime,
        endTime: agent.endTime,
        lastActivityTime: agent.lastActivityTime,
        firstActivityTime: agent.firstActivityTime,
        realAgentId: agent.realAgentId,
        isStale: true,
        // Clear history to save memory
        actions: [],
        messages: []
      };
    }

    // Fresh agent - return full data
    return agent;
  });
}

// Check if an agent file change should trigger an update
// Returns true if the agent is fresh (active or recently completed)
//
// Logic:
// 1. NEW agents (not in map yet) → ALWAYS allow (need to be processed/mapped)
// 2. ACTIVE agents (status !== 'done' OR no endTime) → ALWAYS allow
// 3. COMPLETED agents (status === 'done' AND has endTime) → Only allow if within FRESH_WINDOW_MS
// 4. OLD COMPLETED agents (finished > FRESH_WINDOW_MS ago) → Block updates
function shouldProcessAgentFileChange(agentFilePath, agentsMap) {
  const agentData = parseAgentFile(agentFilePath);

  if (!agentData || !agentData.agentId) {
    console.log(`[Filter] Cannot parse agent file ${agentFilePath}, skipping`);
    return false; // Can't identify agent
  }

  // Find the agent in our map by matching realAgentId
  let matchedAgent = null;
  for (const [toolUseId, agent] of agentsMap.entries()) {
    if (agent.realAgentId === agentData.agentId) {
      matchedAgent = agent;
      break;
    }
  }

  // NEW: If agent is not in our map, it's a NEW agent that hasn't been mapped yet
  // ALWAYS allow updates for new agents - they need to be processed to get mapped
  if (!matchedAgent) {
    console.log(`[Filter] NEW agent detected (${agentData.agentId}), allowing updates (not yet mapped)`);
    return true; // ALWAYS process new agents
  }

  // If agent is still active (no endTime or status not 'done'), ALWAYS process
  if (matchedAgent.status !== 'done' || !matchedAgent.endTime) {
    console.log(`[Filter] Agent ${agentData.agentId} is ACTIVE (status: ${matchedAgent.status}), allowing updates`);
    return true;
  }

  // For completed agents with endTime, check if they finished recently
  if (matchedAgent.endTime) {
    const now = Date.now();
    const endTimeMs = new Date(matchedAgent.endTime).getTime();
    const timeSinceCompletion = now - endTimeMs;
    const isFresh = timeSinceCompletion <= FRESH_WINDOW_MS;

    if (isFresh) {
      console.log(`[Filter] Agent ${agentData.agentId} is DONE but recent (${Math.floor(timeSinceCompletion / 1000)}s ago), allowing updates`);
    } else {
      console.log(`[Filter] Agent ${agentData.agentId} is OLD (completed ${Math.floor(timeSinceCompletion / 1000)}s ago), blocking updates`);
    }

    return isFresh;
  }

  // Fallback: shouldn't reach here, but allow updates to be safe
  console.log(`[Filter] Agent ${agentData.agentId} status unclear, allowing updates (safe default)`);
  return true;
}

// Parse JSONL file and extract agents
function parseSession(filepath) {
  if (!fs.existsSync(filepath)) {
    return { events: [], agents: [], orchestrator: null, markers: [] };
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const events = [];
  const agentsMap = new Map();
  let orchestrator = null;
  let mission = null;
  const markers = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      events.push(event);

      // Extract mission from first meaningful user message
      if (!mission && event.type === 'user' && event.message?.content) {
        const content = event.message.content;
        // Skip meta messages and command messages
        if (typeof content === 'string' &&
            !event.isMeta &&
            !content.includes('Caveat:') &&
            !content.startsWith('<')) {
          mission = content.substring(0, 500); // Keep first 500 chars as mission
        }
      }

      // Track orchestrator (main session)
      if (event.sessionId && !orchestrator) {
        orchestrator = {
          id: event.sessionId,
          name: 'Orchestrator',
          status: 'active',
          currentTask: 'Coordinating agents...',
          activeAgents: 0,
          tasksCompleted: 0,
          mission: null, // Will be set later
          goals: [],
          thinking: null
        };
      }

      // Extract orchestrator thinking blocks and goals
      if (event.type === 'assistant' && event.message?.content && orchestrator) {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            // Extract thinking blocks
            if (block.type === 'thinking' && block.thinking) {
              // Keep only the latest thinking, truncated
              orchestrator.thinking = block.thinking.substring(0, 300);
            }

            // Extract TodoWrite tool calls to get goals (always replace with latest)
            if (block.type === 'tool_use' && block.name === 'TodoWrite' && block.input?.todos) {
              orchestrator.goals = block.input.todos.map(todo => ({
                content: todo.content,
                status: todo.status
              }));
            }
          }
        }
      }

      // Track subagents (Task tool calls)
      if (event.type === 'assistant' && event.message?.content) {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use' && block.name === 'Task') {
              const agentType = block.input?.subagent_type || 'general-purpose';
              const agentId = block.id;
              const description = block.input?.description || 'Unknown task';

              console.log('Agent created:', agentId, agentType);

              agentsMap.set(agentId, {
                id: agentId,
                name: agentType,
                status: 'active',
                currentTask: description,
                actions: [],
                messages: [],
                startTime: event.timestamp
              });

              markers.push({
                timestamp: event.timestamp,
                type: 'agent_spawn',
                agentId,
                agentType
              });
            }

            // Note: Text messages and tool_use blocks here are from the orchestrator,
            // NOT from subagents. Subagents run in separate processes and their
            // internal activity is not visible in the orchestrator's log file.
            // We only see Task spawn and Task completion for subagents.

            // Track file operations as markers (these are orchestrator actions)
            if (block.type === 'tool_use') {
              const filePath = block.input?.file_path || block.input?.path;
              if (filePath) {
                let markerType = null;

                if (block.name === 'Read') {
                  markerType = 'read';
                } else if (block.name === 'Write') {
                  markerType = 'write';
                } else if (block.name === 'Edit') {
                  markerType = 'edit';
                }

                if (markerType) {
                  const filename = path.basename(filePath);
                  markers.push({
                    timestamp: event.timestamp,
                    type: markerType,
                    file: filePath,
                    filename: filename
                  });
                }
              }
            }
          }
        }
      }

      // Track Task completion (tool_result for Task)
      // Only mark as 'done' if the toolUseResult has status: 'completed'
      if (event.type === 'user' && event.message?.content) {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              console.log('Tool result for:', block.tool_use_id, 'agents tracked:', Array.from(agentsMap.keys()));

              // Check if this tool_result matches a Task agent we're tracking
              const agent = agentsMap.get(block.tool_use_id);
              if (agent) {
                // Only mark as done if toolUseResult indicates completion
                const isCompleted = event.toolUseResult?.status === 'completed';

                if (isCompleted) {
                  agent.status = 'done';
                  agent.endTime = event.timestamp;

                  // Add completion marker
                  markers.push({
                    timestamp: event.timestamp,
                    type: 'agent_complete',
                    agentId: block.tool_use_id,
                    agentType: agent.name
                  });

                  console.log('Agent marked as done:', block.tool_use_id);
                } else {
                  // Keep agent as active if not completed
                  console.log('Agent still active:', block.tool_use_id, 'status:', event.toolUseResult?.status);
                }

                // Extract summary from result (whether completed or not)
                if (Array.isArray(block.content)) {
                  // Content can be an array of text blocks
                  const textContent = block.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join(' ');
                  agent.result = textContent.substring(0, 200);
                } else if (typeof block.content === 'string') {
                  agent.result = block.content.substring(0, 200);
                }
              }
            }
          }
        }
      }

      // Extract real agentId from toolUseResult (for mapping to agent files)
      if (event.type === 'user' && event.toolUseResult?.agentId && event.message?.content) {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const agent = agentsMap.get(block.tool_use_id);
              if (agent) {
                // Store the real agentId (the hash used in agent-*.jsonl filename)
                agent.realAgentId = event.toolUseResult.agentId;
                console.log('Mapped tool_use_id', block.tool_use_id, 'to real agentId:', event.toolUseResult.agentId);
              }
            }
          }
        }
      }

      // Track errors
      if (event.type === 'tool_result' && event.message?.is_error) {
        markers.push({
          timestamp: event.timestamp,
          type: 'error',
          content: event.message?.content
        });
      }

    } catch (e) {
      // Skip unparseable lines
    }
  }

  // After parsing the main session, scan for agent files in the same directory
  const sessionDir = path.dirname(filepath);
  const agentFiles = fs.readdirSync(sessionDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));

  console.log(`Found ${agentFiles.length} agent files in ${sessionDir}`);
  console.log(`Agents in map with realAgentId:`, Array.from(agentsMap.entries()).filter(([k,v]) => v.realAgentId).map(([k,v]) => ({ toolUseId: k.substring(0,15), realAgentId: v.realAgentId })));

  // Parse each agent file and match to agents in agentsMap
  for (const agentFile of agentFiles) {
    const agentFilePath = path.join(sessionDir, agentFile);
    const agentData = parseAgentFile(agentFilePath);

    if (agentData && agentData.agentId) {
      console.log(`Processing agent file with agentId: ${agentData.agentId}`);

      // Find the agent that has this realAgentId
      // The agentsMap is keyed by tool_use_id, but we need to find by realAgentId
      let matchedAgent = null;
      for (const [toolUseId, agent] of agentsMap.entries()) {
        console.log(`  Checking agent with tool_use_id ${toolUseId}, realAgentId: ${agent.realAgentId}`);
        if (agent.realAgentId === agentData.agentId) {
          matchedAgent = agent;
          console.log(`  ✓ Matched!`);
          break;
        }
      }

      if (matchedAgent) {
        console.log(`✓ Matched agent ${agentData.agentId} with ${agentData.actions.length} actions and ${agentData.messages.length} messages`);

        // Add actions and messages to the agent
        matchedAgent.actions = agentData.actions;
        matchedAgent.messages = agentData.messages;
        console.log(`  → Agent now has ${matchedAgent.actions.length} actions and ${matchedAgent.messages.length} messages`);

        // Calculate first and last activity times from actual record timestamps
        const allRecords = [...agentData.actions, ...agentData.messages];
        if (allRecords.length > 0) {
          const timestamps = allRecords
            .map(r => r.timestamp)
            .filter(t => t)
            .map(t => new Date(t).getTime())
            .sort((a, b) => a - b);

          if (timestamps.length > 0) {
            matchedAgent.firstActivityTime = new Date(timestamps[0]).toISOString();
            matchedAgent.lastActivityTime = new Date(timestamps[timestamps.length - 1]).toISOString();
            console.log(`Agent ${agentData.agentId} activity: first=${matchedAgent.firstActivityTime}, last=${matchedAgent.lastActivityTime}`);
          }
        }

        // Update agent status based on completion
        // IMPORTANT: Main session file is the source of truth for completion status!
        // The main session has toolUseResult.status === 'completed' when an agent finishes.
        // Agent file's stop_reason is NOT reliable (many agents don't have end_turn).

        // If main session already marked agent as done, don't override it!
        if (matchedAgent.status === 'done') {
          console.log(`Agent ${agentData.agentId} already marked as done from main session, keeping status`);
          // Make sure we have a valid endTime
          if (!matchedAgent.endTime && matchedAgent.lastActivityTime) {
            matchedAgent.endTime = matchedAgent.lastActivityTime;
            console.log(`  Set endTime from lastActivityTime: ${matchedAgent.endTime}`);
          }
        } else if (agentData.isCompleted) {
          // Agent file says it's done (has end_turn)
          matchedAgent.status = 'done';
          if (matchedAgent.lastActivityTime) {
            matchedAgent.endTime = matchedAgent.lastActivityTime;
          }
          console.log(`Agent ${agentData.agentId} marked as done from agent file (end_turn)`);
        }
        // Otherwise keep status as-is (active or whatever was set from main session)

        // Add markers for agent actions
        for (const action of agentData.actions) {
          if (action.filePath) {
            let markerType = null;

            if (action.name === 'Read') {
              markerType = 'read';
            } else if (action.name === 'Write') {
              markerType = 'write';
            } else if (action.name === 'Edit') {
              markerType = 'edit';
            }

            if (markerType) {
              const filename = path.basename(action.filePath);
              markers.push({
                timestamp: action.timestamp,
                type: markerType,
                file: action.filePath,
                filename: filename,
                agentId: agentData.agentId
              });
            }
          }
        }
      } else {
        console.log(`No agent found in agentsMap for agentId ${agentData.agentId}`);
        console.log(`Available agents in map:`, Array.from(agentsMap.entries()).map(([k, v]) => ({ toolUseId: k, realAgentId: v.realAgentId })));
      }
    }
  }

  const allAgents = Array.from(agentsMap.values());

  // Process agents - fresh ones keep full data, stale ones get minimal data
  const agents = processAgentFreshness(allAgents);

  const freshCount = agents.filter(a => !a.isStale).length;
  const staleCount = agents.filter(a => a.isStale).length;
  console.log(`Processed agents: ${freshCount} fresh, ${staleCount} stale out of ${allAgents.length} total`);

  // Debug: log agent data being sent
  agents.forEach(a => {
    console.log(`  Agent ${a.id}: actions=${a.actions?.length || 0}, messages=${a.messages?.length || 0}, status=${a.status}`);
  });

  if (orchestrator) {
    orchestrator.activeAgents = agents.filter(a => a.status === 'active').length;
    orchestrator.tasksCompleted = agents.filter(a => a.status === 'done').length;

    // Set mission from first user message
    orchestrator.mission = mission;

    // Update orchestrator task from last assistant message
    const lastAssistant = events.filter(e => e.type === 'assistant').pop();
    if (lastAssistant?.message?.content) {
      const textContent = lastAssistant.message.content.find(c => c.type === 'text');
      if (textContent?.text) {
        orchestrator.currentTask = textContent.text.substring(0, 200) + '...';
      }
    }
  }

  // Limit markers to most recent MAX_MARKERS
  const limitedMarkers = markers.length > MAX_MARKERS
    ? markers.slice(-MAX_MARKERS)
    : markers;

  return { events: [], agents, orchestrator, markers: limitedMarkers };
}

// Narrate using Haiku (optional)
async function narrateTask(text, language = 'nl') {
  console.log('[narrateTask] Called with:', { text, language });

  // Check cache first
  const cacheKey = `${text}::${language}`;
  const cached = narrationCache.get(cacheKey);

  if (cached) {
    const now = Date.now();
    const age = now - cached.timestamp;

    // Check if cache entry is still valid (within TTL)
    if (age < CACHE_TTL_MS) {
      console.log(`[narrateTask] Cache hit (age: ${Math.floor(age / 1000)}s)`);
      return cached.narration;
    } else {
      // Cache entry expired, remove it
      console.log(`[narrateTask] Cache expired (age: ${Math.floor(age / 1000)}s), removing`);
      narrationCache.delete(cacheKey);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[narrateTask] ANTHROPIC_API_KEY is missing');
    return null;
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const prompts = {
      nl: `Je bent een narrator voor een dashboard dat toont wat AI agents aan het doen zijn. Je publiek is niet-technisch en wil begrijpen wat er gebeurt. Vertaal deze technische actie naar een korte, vriendelijke Nederlandse zin (max 20 woorden) die uitlegt wat de agent doet. Geen technisch jargon.

Actie: "${text}"`,
      en: `You are a narrator for a dashboard showing what AI agents are doing. Your audience is non-technical and wants to understand what's happening. Translate this technical action into a short, friendly English sentence (max 20 words) explaining what the agent is doing. No technical jargon.

Action: "${text}"`
    };

    const prompt = prompts[language] || prompts.nl;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const narration = response.content[0]?.text || null;
    console.log('[narrateTask] Response from Anthropic:', narration);

    // Store in cache if successful
    if (narration) {
      narrationCache.set(cacheKey, {
        narration,
        timestamp: Date.now()
      });
      console.log(`[narrateTask] Cached narration (cache size: ${narrationCache.size})`);
    }

    return narration;
  } catch (error) {
    console.error('[narrateTask] Error:', error.message);
    return null;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get session data
app.get('/api/session', async (req, res) => {
  try {
    const sessionPath = req.query.path;

    if (!sessionPath) {
      return res.status(400).json({ error: 'Session path is required' });
    }

    const { events, agents, orchestrator, markers } = parseSession(sessionPath);

    res.json({
      path: sessionPath,
      messageCount: events.length,
      agents,
      orchestrator,
      markers,
      events: []
    });
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decode Claude project directory name to real path
function decodeProjectPath(encodedDir) {
  // Claude encodes paths like: Users-wijnandtop-Projects-foo -> /Users/wijnandtop/Projects/foo
  const decoded = '/' + encodedDir.replace(/-/g, '/');
  return decoded;
}

// Extract readable project info from encoded directory
function extractProjectInfo(encodedDir) {
  const fullPath = decodeProjectPath(encodedDir);
  const parts = fullPath.split('/').filter(Boolean);

  // Get project folder name (last part)
  const projectName = parts[parts.length - 1] || 'Unknown';

  // Get relative path from home (skip Users/username)
  const homeIndex = parts.findIndex(p => p === process.env.USER || p === 'Users');
  let relativePath = fullPath;
  if (homeIndex >= 0 && parts[homeIndex + 1]) {
    relativePath = '~/' + parts.slice(homeIndex + 2).join('/');
  }

  return { projectName, fullPath, relativePath };
}

// Deduplicate sessions by project path, keeping only the most recent per project
function deduplicateSessions(sessions) {
  // Group by relativePath
  const sessionsByProject = new Map();

  for (const session of sessions) {
    const key = session.relativePath;
    if (!sessionsByProject.has(key)) {
      sessionsByProject.set(key, []);
    }
    sessionsByProject.get(key).push(session);
  }

  // For each project, keep only the most recent session and add sessionCount
  const deduplicated = [];
  for (const [relativePath, projectSessions] of sessionsByProject.entries()) {
    // Sort by lastUpdate descending
    projectSessions.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

    // Take the most recent session and add sessionCount
    const mostRecent = {
      ...projectSessions[0],
      sessionCount: projectSessions.length
    };
    deduplicated.push(mostRecent);
  }

  // Sort deduplicated list by lastUpdate descending
  deduplicated.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

  return deduplicated;
}

// List all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const claudeDir = path.join(process.env.HOME, '.claude', 'projects');

    if (!fs.existsSync(claudeDir)) {
      return res.json({ sessions: [] });
    }

    const sessions = [];
    const scanDir = (dir, parentEncodedName = null) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            scanDir(fullPath, entry.name);
          } else if (entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-')) {
            const stats = fs.statSync(fullPath);
            const encodedDir = parentEncodedName || path.basename(dir);
            const { projectName, fullPath: projectPath, relativePath } = extractProjectInfo(encodedDir);

            sessions.push({
              id: fullPath,
              path: fullPath,
              name: entry.name,
              projectName,
              projectPath,
              relativePath,
              size: stats.size,
              lastUpdate: stats.mtime
            });
          }
        }
      } catch (e) {
        // Skip inaccessible directories
      }
    };

    scanDir(claudeDir);

    // Deduplicate sessions by project path
    const deduplicated = deduplicateSessions(sessions);

    res.json({ sessions: deduplicated });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Narrate endpoint
app.post('/api/narrate', async (req, res) => {
  try {
    const { text, language = 'nl' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const narration = await narrateTask(text, language);
    res.json({ narration: narration || text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Per-socket state
  let socketWatcher = null;
  let socketSessionPath = null;

  // Emit API status on connection
  socket.emit('apiStatus', { keyConfigured: !!process.env.ANTHROPIC_API_KEY });

  // Send initial session list
  const claudeDir = path.join(process.env.HOME, '.claude', 'projects');
  if (fs.existsSync(claudeDir)) {
    const sessions = [];
    const scanDir = (dir, parentEncodedName = null) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, entry.name);
          } else if (entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-')) {
            const stats = fs.statSync(fullPath);
            const encodedDir = parentEncodedName || path.basename(dir);
            const { projectName, fullPath: projectPath, relativePath } = extractProjectInfo(encodedDir);
            sessions.push({
              id: fullPath,
              path: fullPath,
              name: entry.name,
              projectName,
              projectPath,
              relativePath,
              lastUpdate: stats.mtime
            });
          }
        }
      } catch (e) {}
    };
    scanDir(claudeDir);

    // Deduplicate sessions by project path
    const deduplicated = deduplicateSessions(sessions);

    socket.emit('sessions', deduplicated);
  }

  // Watch session file
  socket.on('watch', (sessionPath) => {
    console.log('Watching session:', sessionPath);

    // Stop previous watcher for this socket
    if (socketWatcher) {
      socketWatcher.close();
    }

    socketSessionPath = sessionPath;

    // Send initial state
    const state = parseSession(sessionPath);
    socket.emit('update', {
      sessionId: sessionPath,
      ...state
    });

    // Get the directory to watch for agent files
    const sessionDir = path.dirname(sessionPath);

    // Watch for changes to both the session file and any agent files in the directory
    socketWatcher = chokidar.watch([
      sessionPath,
      path.join(sessionDir, 'agent-*.jsonl')
    ], {
      persistent: true,
      usePolling: true,
      interval: 500
    });

    // Debounce timer and pending changes set
    let updateDebounceTimer = null;
    let pendingChanges = new Set();

    socketWatcher.on('change', (changedPath) => {
      console.log('File changed:', changedPath);
      pendingChanges.add(changedPath);

      clearTimeout(updateDebounceTimer);
      updateDebounceTimer = setTimeout(() => {
        console.log(`Processing ${pendingChanges.size} batched changes`);

        // Just parse once and send update
        const newState = parseSession(socketSessionPath);
        socket.emit('update', {
          sessionId: socketSessionPath,
          type: 'update',
          ...newState
        });

        pendingChanges.clear();
      }, 200);
    });

    // Watch for new agent files being created
    socketWatcher.on('add', (addedPath) => {
      if (addedPath.includes('agent-') && addedPath.endsWith('.jsonl')) {
        console.log('New agent file detected:', addedPath);
        const newState = parseSession(socketSessionPath);
        console.log('[Watcher ADD] Sending update with agents:', newState.agents?.map(a => ({
          id: a.id?.substring(0, 15),
          realAgentId: a.realAgentId,
          actions: a.actions?.length || 0,
          messages: a.messages?.length || 0
        })));
        socket.emit('update', {
          sessionId: socketSessionPath,
          type: 'update',
          ...newState
        });
      }
    });
  });

  // Handle narrate socket event
  socket.on('narrate', async ({ text, language = 'nl', timestamp }) => {
    console.log('[Socket] Narrate event received:', { text, language, timestamp });

    // Only narrate recent messages (within last 10 minutes)
    if (timestamp) {
      const now = Date.now();
      const messageTime = new Date(timestamp).getTime();
      const NARRATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

      if (now - messageTime > NARRATION_WINDOW_MS) {
        console.log('[Socket] Skipping narration for old message (age:', Math.floor((now - messageTime) / 1000), 'seconds)');
        // Return the original text without narration for old messages
        socket.emit('narrated', { text, narration: text });
        return;
      }
    }

    try {
      const narration = await narrateTask(text, language);
      console.log('[Socket] Sending narrated response:', { text, narration });
      socket.emit('narrated', { text, narration: narration || text });
    } catch (error) {
      console.error('[Socket] Narrate error:', error.message);
      socket.emit('narrated', { text, narration: text, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socketWatcher) {
      socketWatcher.close();
      socketWatcher = null;
    }
  });
});

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  httpServer.listen(PORT, () => {
    console.log(`Dashboard server running on http://localhost:${PORT}`);
    console.log('WebSocket ready for connections');
  });
}

// Export for testing
export { parseAgentFile, decodeProjectPath, processAgentFreshness };
