# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time visualization dashboard for Claude Code JSONL session logs. Displays orchestrator activity, spawned agents, file operations, and task progress with live updates.

## Commands

```bash
npm start        # Interactive CLI: scans ~/.claude/projects/**/*.jsonl, starts backend + Vite, opens browser
npm run dev      # Vite dev server only (port auto-detected, typically 5173)
npm run server   # Backend server only (port 3001)
npm run build    # Production build with Vite
```

## Architecture

Three-tier system:

1. **CLI Layer** (`cli.js`)
   - Scans `~/.claude/projects/**/*.jsonl` for session files
   - Filters out agent files (`agent-*.jsonl`), shows only main orchestrator sessions
   - Interactive selection menu with project metadata
   - Spawns backend and Vite processes, waits for readiness, opens browser with session path

2. **Backend Layer** (`server/index.js`, port 3001)
   - Express server with Socket.IO for WebSocket connections
   - Parses JSONL session files and extracts orchestrator state, agents, events
   - Watches session files + agent files with chokidar, triggers full re-parse on changes
   - Matches agent files to spawned agents via `tool_use_id` → `realAgentId` mapping
   - Optional Haiku narrator: translates technical actions to human-friendly descriptions (requires `ANTHROPIC_API_KEY` in `.env`)

3. **Frontend Layer** (`src/App.jsx`, `src/components/`)
   - React app connects to backend via WebSocket
   - Displays orchestrator panel with mission, thinking blocks, goals (from TodoWrite)
   - Shows spawned agents with their actions and messages
   - Timeline with file operation markers (read/write/edit)
   - Real-time updates when session files change

## Key Patterns

**Agent File Mapping:**
- Agent files named `agent-{agentId}.jsonl` are matched to orchestrator's Task spawn events
- Mapping: orchestrator's `tool_use_id` → `toolUseResult.agentId` → agent file `agentId`
- Agent files contain full internal activity (tool calls, messages) not visible in orchestrator log

**Path Encoding:**
- Claude encodes project paths in directory names: `Users-wijnandtop-Projects-foo` → `/Users/wijnandtop/Projects/foo`
- Decoding: replace hyphens with slashes, prepend `/`

**Real-time Watching:**
- Backend watches both main session file and `agent-*.jsonl` pattern in same directory
- On file change: full re-parse of session + all agent files, emit complete state via WebSocket
- Frontend receives updates and triggers UI re-render

**Localization & Theming:**
- Multi-language support (Dutch/English) stored in `localStorage` as `language`
- Theme support (system/light/dark) stored in `localStorage` as `theme`
- Narrator mode (raw/narrated) stored in `localStorage` as `narratorMode`

**Haiku Narrator Mode:**
- Optional feature requiring `ANTHROPIC_API_KEY` in `.env`
- Uses `claude-haiku-4-5-20251001` to translate technical actions to friendly descriptions
- Enabled via UI toggle when API key is present

## File Structure

```
cli.js              # Entry point: session selection → spawn servers → open browser
server/index.js     # Backend: JSONL parsing, file watching, Socket.IO, Haiku narrator
src/
  App.jsx           # Main React component, WebSocket connection, state management
  components/
    Orchestrator.jsx    # Orchestrator panel: mission, thinking, goals
    Agent.jsx           # Agent card: status, actions, messages
    SessionSelector.jsx # Project/session picker
    Timeline.jsx        # File operation timeline with markers
```

## Environment

`.env` file (optional):
```
ANTHROPIC_API_KEY=sk-ant-...  # Required only for Haiku narrator mode
```

## Data Flow

1. User selects session in CLI → backend receives `watch` event with session path
2. Backend parses session JSONL, extracts orchestrator + agents, emits initial `update`
3. Frontend displays orchestrator + agent cards
4. On file change: backend re-parses → emits `update` → frontend re-renders
5. Agent files matched by `tool_use_id` → adds internal actions/messages to agent cards

## Way of Working

### Rollen & Agents

| Agent Type | Gebruik voor | Voorbeeld |
|------------|--------------|-----------|
| `Explore` | Codebase vragen, architectuur begrip | "Hoe werkt de WebSocket flow?" |
| `Plan` | Architectuur beslissingen, grote features | "Plan de refactoring van session handling" |
| `general-purpose` | Implementatie van code wijzigingen | "Fix de bug in Agent.jsx" |

### Quality Gates

Elke code wijziging MOET door deze stappen:

1. **Pre-implementation**
   - Explore agent: begrijp de huidige code
   - Identificeer impact op andere delen

2. **Implementation**
   - general-purpose agent: voer wijziging uit
   - Agent MOET zelf valideren:
     - `node --check server/index.js` (server syntax)
     - Controleer of imports correct zijn

3. **Post-implementation (VERPLICHT)**
   - Start server: `node server/index.js &`
   - Start frontend: `npm run dev &`
   - Verifieer in browser dat wijziging werkt
   - Check browser console op errors
   - Test regression: werkt bestaande functionaliteit nog?

4. **Alleen NA succesvolle test**: rapporteer aan gebruiker

### Defintion of Done

Een taak is PAS klaar als:
- [ ] Code compileert zonder errors
- [ ] Server start zonder crashes
- [ ] Frontend toont geen console errors
- [ ] Gewijzigde functionaliteit werkt
- [ ] Bestaande functionaliteit werkt nog

### Niet doen
- Nooit code "klaar" melden zonder te testen
- Nooit direct code schrijven - altijd via agents
- Nooit meerdere grote wijzigingen tegelijk zonder tussentijdse test