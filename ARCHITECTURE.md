# Architecture

## Overview

Three-tier system: CLI → Backend (Express/Socket.IO) → Frontend (React)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI (cli.js)   │────▶│ Backend (:3001)  │◀───▶│ Frontend (Vite) │
│                  │     │ server/index.js  │     │ src/App.jsx     │
│ Session Scanner  │     │ Socket.IO        │     │ WebSocket Client│
│ Process Manager  │     │ File Watcher     │     │ React Components│
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   ~/.claude/projects/     JSONL Parsing           Real-time UI
   *.jsonl files           Haiku Narration         Agent Cards
```

## Data Flow

1. User selects session → Frontend emits `watch` event
2. Backend parses JSONL + agent files → emits `update`
3. Chokidar watches files → on change → re-parse → emit `update`
4. Frontend updates React state → re-renders components

## Known Performance Issues

### Critical

| Issue | Location | Impact |
|-------|----------|--------|
| Full re-parse on every file change | server/index.js:parseSession() | O(n) for n lines |
| Double parsing for agent files | server/index.js:watch handler | 2x CPU |
| No debouncing | server/index.js | 10 changes = 10 parses |
| Memory leak (events array) | App.jsx:setEvents() | Unbounded growth |
| Per-second re-renders | Agent.jsx:setTick() | CPU waste |

### Recommended Fixes (Priority Order)

1. **Debouncing** - 200ms batch window for file changes
2. **Incremental parsing** - Only parse new lines in JSONL
3. **Delta updates** - Only send changed agents via WebSocket
4. **Circular buffer** - Cap events array at 5000 items
5. **Reduce re-renders** - Change 1s interval to 30s or remove

## Component Responsibilities

### Backend (server/index.js)
- Parse JSONL session files
- Watch files with Chokidar (500ms poll)
- Manage per-socket watchers
- Cache Haiku narrations (30min TTL)

### Frontend (src/App.jsx)
- WebSocket connection management
- Session selection and URL sync
- State: agents, orchestrator, events, markers
- Narration request deduplication

### Agent Component (src/components/Agent.jsx)
- Display agent card (expanded/collapsed)
- Duration timer (currently re-renders every 1s)
- Actions and messages list

## State Management

No external state library. Uses React useState/useRef:
- Per-socket state on backend
- Component-level state on frontend
- Refs for mutable values (narratedTexts, currentSessionRef)
