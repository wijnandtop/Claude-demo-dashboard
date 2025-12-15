import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseAgentFile, decodeProjectPath, processAgentFreshness, createSessionCache, readNewLines, processNewLines } from '../server/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('parseAgentFile', () => {
  const testDir = path.join(__dirname, 'temp');

  beforeEach(() => {
    // Create temp directory for test files
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should parse valid agent file with actions and messages', () => {
    const testFile = path.join(testDir, 'agent-test.jsonl');
    const jsonlContent = [
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-123',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-1',
              input: { file_path: '/path/to/file.js' }
            },
            {
              type: 'text',
              text: 'Reading the file now'
            }
          ]
        }
      }),
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-123',
        timestamp: '2025-12-15T10:01:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              id: 'tool-2',
              input: { file_path: '/path/to/output.js' }
            }
          ]
        }
      })
    ].join('\n');

    fs.writeFileSync(testFile, jsonlContent);

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBe('agent-123');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].name).toBe('Read');
    expect(result.actions[0].filePath).toBe('/path/to/file.js');
    expect(result.actions[1].name).toBe('Write');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('Reading the file now');
  });

  it('should detect completion with stop_reason: end_turn', () => {
    const testFile = path.join(testDir, 'agent-completed.jsonl');
    const jsonlContent = [
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-456',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'Task completed'
            }
          ],
          stop_reason: 'end_turn'
        }
      })
    ].join('\n');

    fs.writeFileSync(testFile, jsonlContent);

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBe('agent-456');
    expect(result.isCompleted).toBe(true);
    expect(result.lastStopReason).toBe('end_turn');
  });

  it('should handle empty file', () => {
    const testFile = path.join(testDir, 'agent-empty.jsonl');
    fs.writeFileSync(testFile, '');

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBeNull();
    expect(result.actions).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
    expect(result.isCompleted).toBe(false);
  });

  it('should return null for non-existent file', () => {
    const nonExistentFile = path.join(testDir, 'does-not-exist.jsonl');
    const result = parseAgentFile(nonExistentFile);
    expect(result).toBeNull();
  });

  it('should skip unparseable lines and continue parsing', () => {
    const testFile = path.join(testDir, 'agent-malformed.jsonl');
    const jsonlContent = [
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-789',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'Valid message'
            }
          ]
        }
      }),
      'this is not valid json',
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-789',
        timestamp: '2025-12-15T10:01:00.000Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'Another valid message'
            }
          ]
        }
      })
    ].join('\n');

    fs.writeFileSync(testFile, jsonlContent);

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBe('agent-789');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe('Valid message');
    expect(result.messages[1].text).toBe('Another valid message');
  });
});

describe('decodeProjectPath', () => {
  it('should decode Users-john-Projects-foo to /Users/john/Projects/foo', () => {
    const encoded = 'Users-john-Projects-foo';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/john/Projects/foo');
  });

  it('should decode Users-wijnandtop-Projects-claude_dashboard', () => {
    const encoded = 'Users-wijnandtop-Projects-claude_dashboard';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/wijnandtop/Projects/claude_dashboard');
  });

  it('should decode simple path Users-john-test', () => {
    const encoded = 'Users-john-test';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/john/test');
  });

  it('should handle single segment', () => {
    const encoded = 'Users';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users');
  });

  it('should handle deep nested paths', () => {
    const encoded = 'Users-jane-Documents-Work-Projects-2025-app';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/jane/Documents/Work/Projects/2025/app');
  });
});

describe('processAgentFreshness', () => {
  it('should mark agents older than 30 min as stale', () => {
    const now = Date.now();
    const thirtyOneMinutesAgo = new Date(now - 31 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-1',
        name: 'test-agent',
        status: 'done',
        currentTask: 'Task description',
        startTime: thirtyOneMinutesAgo,
        endTime: thirtyOneMinutesAgo,
        lastActivityTime: thirtyOneMinutesAgo,
        actions: [{ name: 'Read', filePath: '/test.js', timestamp: thirtyOneMinutesAgo }],
        messages: [{ text: 'Test message', timestamp: thirtyOneMinutesAgo }],
        realAgentId: 'real-agent-1'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBe(true);
    expect(result[0].status).toBe('done');
    expect(result[0].actions).toHaveLength(0); // Actions cleared for stale agents
    expect(result[0].messages).toHaveLength(0); // Messages cleared for stale agents
  });

  it('should keep recent agents fresh', () => {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-2',
        name: 'recent-agent',
        status: 'done',
        currentTask: 'Recent task',
        startTime: fiveMinutesAgo,
        endTime: fiveMinutesAgo,
        lastActivityTime: fiveMinutesAgo,
        actions: [{ name: 'Edit', filePath: '/recent.js', timestamp: fiveMinutesAgo }],
        messages: [{ text: 'Recent message', timestamp: fiveMinutesAgo }],
        realAgentId: 'real-agent-2'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBeUndefined(); // Fresh agents don't have isStale flag
    expect(result[0].status).toBe('done');
    expect(result[0].actions).toHaveLength(1); // Actions preserved for fresh agents
    expect(result[0].messages).toHaveLength(1); // Messages preserved for fresh agents
  });

  it('should mark active agents without recent activity as stale', () => {
    const now = Date.now();
    const thirtyOneMinutesAgo = new Date(now - 31 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-3',
        name: 'stuck-agent',
        status: 'active', // Still marked as active but no recent activity
        currentTask: 'Stuck task',
        startTime: thirtyOneMinutesAgo,
        lastActivityTime: thirtyOneMinutesAgo,
        actions: [{ name: 'Read', filePath: '/stuck.js', timestamp: thirtyOneMinutesAgo }],
        messages: [],
        realAgentId: 'real-agent-3'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBe(true);
    expect(result[0].status).toBe('stale'); // Status changed from active to stale
    // Keep actions for agents without endTime (potentially still running)
    expect(result[0].actions).toHaveLength(1);
  });

  it('should keep active agents with recent activity fresh', () => {
    const now = Date.now();
    const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-4',
        name: 'active-agent',
        status: 'active',
        currentTask: 'Current task',
        startTime: twoMinutesAgo,
        lastActivityTime: twoMinutesAgo,
        actions: [{ name: 'Write', filePath: '/active.js', timestamp: twoMinutesAgo }],
        messages: [{ text: 'Working on it', timestamp: twoMinutesAgo }],
        realAgentId: 'real-agent-4'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBeUndefined();
    expect(result[0].status).toBe('active');
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].messages).toHaveLength(1);
  });

  it('should handle multiple agents with mixed freshness', () => {
    const now = Date.now();
    const recentTime = new Date(now - 5 * 60 * 1000).toISOString();
    const oldTime = new Date(now - 35 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-fresh',
        name: 'fresh-agent',
        status: 'done',
        currentTask: 'Fresh task',
        startTime: recentTime,
        endTime: recentTime,
        lastActivityTime: recentTime,
        actions: [{ name: 'Read' }],
        messages: [{ text: 'Fresh' }],
        realAgentId: 'real-fresh'
      },
      {
        id: 'agent-stale',
        name: 'stale-agent',
        status: 'done',
        currentTask: 'Old task',
        startTime: oldTime,
        endTime: oldTime,
        lastActivityTime: oldTime,
        actions: [{ name: 'Write' }],
        messages: [{ text: 'Stale' }],
        realAgentId: 'real-stale'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(2);

    // First agent should be fresh
    expect(result[0].isStale).toBeUndefined();
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].messages).toHaveLength(1);

    // Second agent should be stale
    expect(result[1].isStale).toBe(true);
    expect(result[1].actions).toHaveLength(0);
    expect(result[1].messages).toHaveLength(0);
  });
});

describe('createSessionCache', () => {
  it('should create cache with correct initial structure', () => {
    const cache = createSessionCache();

    expect(cache.lastByteOffset).toBe(0);
    expect(cache.orchestrator).toBeNull();
    expect(cache.agentsMap).toBeInstanceOf(Map);
    expect(cache.agentsMap.size).toBe(0);
    expect(cache.markers).toEqual([]);
    expect(cache.mission).toBeNull();
    expect(cache.knownAgentIds).toBeInstanceOf(Set);
    expect(cache.knownAgentIds.size).toBe(0);
    expect(cache.agentOffsets).toBeInstanceOf(Map);
    expect(cache.agentOffsets.size).toBe(0);
  });
});

describe('readNewLines', () => {
  const testDir = path.join(__dirname, 'temp');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should read only new lines from offset', () => {
    const testFile = path.join(testDir, 'incremental.jsonl');
    const line1 = JSON.stringify({ type: 'user', message: 'first' });
    const line2 = JSON.stringify({ type: 'assistant', message: 'second' });

    // Write initial content
    fs.writeFileSync(testFile, line1 + '\n');
    const initialSize = fs.statSync(testFile).size;

    // Append new content
    fs.appendFileSync(testFile, line2 + '\n');

    // Read from initial offset - should only get new line
    const result = readNewLines(testFile, initialSize);

    expect(result.needsFullReparse).toBe(false);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('second');
    expect(result.newOffset).toBeGreaterThan(initialSize);
  });

  it('should return empty lines when no new data', () => {
    const testFile = path.join(testDir, 'nochange.jsonl');
    const content = JSON.stringify({ type: 'user', message: 'test' }) + '\n';

    fs.writeFileSync(testFile, content);
    const fileSize = fs.statSync(testFile).size;

    const result = readNewLines(testFile, fileSize);

    expect(result.needsFullReparse).toBe(false);
    expect(result.lines).toHaveLength(0);
    expect(result.newOffset).toBe(fileSize);
  });

  it('should signal full reparse when file is truncated', () => {
    const testFile = path.join(testDir, 'truncated.jsonl');
    const longContent = JSON.stringify({ type: 'user', message: 'long content here' }) + '\n';

    fs.writeFileSync(testFile, longContent);
    const originalSize = fs.statSync(testFile).size;

    // Truncate the file
    fs.writeFileSync(testFile, '{}');

    const result = readNewLines(testFile, originalSize);

    expect(result.needsFullReparse).toBe(true);
    expect(result.newOffset).toBe(0);
  });

  it('should read multiple new lines', () => {
    const testFile = path.join(testDir, 'multiline.jsonl');
    const line1 = JSON.stringify({ id: 1 });

    fs.writeFileSync(testFile, line1 + '\n');
    const initialSize = fs.statSync(testFile).size;

    // Append multiple lines
    const line2 = JSON.stringify({ id: 2 });
    const line3 = JSON.stringify({ id: 3 });
    fs.appendFileSync(testFile, line2 + '\n' + line3 + '\n');

    const result = readNewLines(testFile, initialSize);

    expect(result.needsFullReparse).toBe(false);
    expect(result.lines).toHaveLength(2);
    expect(JSON.parse(result.lines[0]).id).toBe(2);
    expect(JSON.parse(result.lines[1]).id).toBe(3);
  });
});

describe('processNewLines', () => {
  it('should detect and track new agent spawn', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'toolu_abc123',
              input: {
                subagent_type: 'general-purpose',
                description: 'Test task'
              }
            }
          ]
        }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    expect(cache.agentsMap.size).toBe(1);
    expect(cache.agentsMap.has('toolu_abc123')).toBe(true);

    const agent = cache.agentsMap.get('toolu_abc123');
    expect(agent.name).toBe('general-purpose');
    expect(agent.currentTask).toBe('Test task');
    expect(agent.status).toBe('active');
  });

  it('should track agent completion', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    // First spawn the agent
    cache.agentsMap.set('toolu_abc123', {
      id: 'toolu_abc123',
      name: 'general-purpose',
      status: 'active',
      currentTask: 'Test',
      actions: [],
      messages: [],
      startTime: '2025-12-15T10:00:00.000Z'
    });

    // Then complete it
    const lines = [
      JSON.stringify({
        type: 'user',
        timestamp: '2025-12-15T10:01:00.000Z',
        toolUseResult: {
          agentId: 'real123',
          status: 'completed'
        },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_abc123',
              content: 'Task completed'
            }
          ]
        }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    const agent = cache.agentsMap.get('toolu_abc123');
    expect(agent.status).toBe('done');
    expect(agent.realAgentId).toBe('real123');
    expect(cache.knownAgentIds.has('real123')).toBe(true);
  });

  it('should initialize orchestrator from sessionId', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'user',
        sessionId: 'session-uuid-123',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: { content: 'Hello' }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    expect(cache.orchestrator).not.toBeNull();
    expect(cache.orchestrator.id).toBe('session-uuid-123');
    expect(cache.orchestrator.name).toBe('Orchestrator');
  });

  it('should extract mission from first user message', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'user',
        sessionId: 'session-1',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: { content: 'Build a dashboard for monitoring' }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    expect(cache.mission).toBe('Build a dashboard for monitoring');
  });

  it('should track file operation markers', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-1',
              input: { file_path: '/path/to/file.js' }
            }
          ]
        }
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-12-15T10:00:01.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              id: 'tool-2',
              input: { file_path: '/path/to/output.js' }
            }
          ]
        }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    expect(cache.markers).toHaveLength(2);
    expect(cache.markers[0].type).toBe('read');
    expect(cache.markers[0].filename).toBe('file.js');
    expect(cache.markers[1].type).toBe('write');
    expect(cache.markers[1].filename).toBe('output.js');
  });

  it('should limit markers to MAX_MARKERS', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    // Pre-fill with 999 markers
    for (let i = 0; i < 999; i++) {
      cache.markers.push({ type: 'read', timestamp: `2025-12-15T10:00:${i}.000Z`, file: `/file${i}.js`, filename: `file${i}.js` });
    }

    // Add 5 more via processNewLines
    const lines = [];
    for (let i = 0; i < 5; i++) {
      lines.push(JSON.stringify({
        type: 'assistant',
        timestamp: `2025-12-15T11:00:${i}.000Z`,
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: `tool-new-${i}`,
              input: { file_path: `/new/file${i}.js` }
            }
          ]
        }
      }));
    }

    processNewLines(lines, cache, sessionDir);

    // Should be capped at 1000
    expect(cache.markers.length).toBe(1000);
    // Last marker should be from the new batch
    expect(cache.markers[999].file).toBe('/new/file4.js');
  });

  it('should update orchestrator goals from TodoWrite', () => {
    const cache = createSessionCache();
    cache.orchestrator = {
      id: 'session-1',
      name: 'Orchestrator',
      goals: []
    };
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'TodoWrite',
              id: 'todo-1',
              input: {
                todos: [
                  { content: 'First task', status: 'completed' },
                  { content: 'Second task', status: 'in_progress' }
                ]
              }
            }
          ]
        }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    expect(cache.orchestrator.goals).toHaveLength(2);
    expect(cache.orchestrator.goals[0].content).toBe('First task');
    expect(cache.orchestrator.goals[0].status).toBe('completed');
    expect(cache.orchestrator.goals[1].content).toBe('Second task');
    expect(cache.orchestrator.goals[1].status).toBe('in_progress');
  });

  it('should add agent_spawn marker when Task is called', () => {
    const cache = createSessionCache();
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'toolu_spawn1',
              input: {
                subagent_type: 'Explore',
                description: 'Explore codebase'
              }
            }
          ]
        }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    const spawnMarkers = cache.markers.filter(m => m.type === 'agent_spawn');
    expect(spawnMarkers).toHaveLength(1);
    expect(spawnMarkers[0].agentId).toBe('toolu_spawn1');
    expect(spawnMarkers[0].agentType).toBe('Explore');
  });

  it('should add agent_complete marker on completion', () => {
    const cache = createSessionCache();
    cache.agentsMap.set('toolu_xyz', {
      id: 'toolu_xyz',
      name: 'general-purpose',
      status: 'active'
    });
    const sessionDir = '/tmp/test';

    const lines = [
      JSON.stringify({
        type: 'user',
        timestamp: '2025-12-15T10:01:00.000Z',
        toolUseResult: { status: 'completed' },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_xyz'
            }
          ]
        }
      })
    ];

    processNewLines(lines, cache, sessionDir);

    const completeMarkers = cache.markers.filter(m => m.type === 'agent_complete');
    expect(completeMarkers).toHaveLength(1);
    expect(completeMarkers[0].agentId).toBe('toolu_xyz');
  });
});
