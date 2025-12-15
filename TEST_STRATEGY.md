# Test Strategy

## Framework
**Vitest** (native Vite integratie) + **React Testing Library** voor components

## Installatie
```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

---

## Unit Tests (HIGH priority)

### Server - Parse Functies (server/index.js)

| Functie | Test Case | Priority | Rationale |
|---------|-----------|----------|-----------|
| `parseAgentFile()` | Parse valid JSONL met tool_use blocks | HIGH | Core parsing logic |
| `parseAgentFile()` | Return null voor non-existent file | HIGH | Error handling |
| `parseAgentFile()` | Extract agentId correct | HIGH | Critical voor agent mapping |
| `parseAgentFile()` | Detect completion via end_turn | HIGH | Status tracking |
| `parseAgentFile()` | Skip unparseable lines | MEDIUM | Robustness |
| `parseSession()` | Extract orchestrator data | HIGH | Main session parsing |
| `parseSession()` | Extract mission from first user message | MEDIUM | User experience |
| `parseSession()` | Map agents via realAgentId | HIGH | Agent linking |

### Server - Helper Functies

| Functie | Test Case | Priority | Rationale |
|---------|-----------|----------|-----------|
| `decodeProjectPath()` | Decode "Users-foo-Projects-bar" to "/Users/foo/Projects/bar" | HIGH | Path conversion critical |
| `extractProjectInfo()` | Extract projectName, relativePath correct | MEDIUM | UI display |
| `deduplicateSessions()` | Keep most recent per project | MEDIUM | Session management |
| `processAgentFreshness()` | Mark stale agents (>30min inactive) | HIGH | Performance optimization |
| `shouldProcessAgentFileChange()` | Block updates for old completed agents | HIGH | Performance critical |

### CLI - Format Functies (cli.js)

| Functie | Test Case | Priority | Rationale |
|---------|-----------|----------|-----------|
| `formatBytes()` | Format 0, 1024, 1048576 bytes | MEDIUM | Simple pure function |
| `formatDate()` | Format "zojuist", "5 min geleden", "2 uur geleden" | MEDIUM | User-facing |
| `decodeProjectPath()` | Same as server version | HIGH | Consistency check |
| `getSessionId()` | Extract first 8 chars from filename | LOW | Trivial |

### Frontend - Format Helpers (Agent.jsx, SessionSelector.jsx)

| Component/Functie | Test Case | Priority | Rationale |
|-------------------|-----------|----------|-----------|
| `Agent.formatDuration()` | Format 30s, 90s (1m 30s), 3600s (1h 0m) | HIGH | Core UI display |
| `Agent.formatTimestamp()` | Format ISO timestamp to HH:MM:SS | MEDIUM | Display consistency |
| `Agent.getStatusClass()` | Return correct class for active/done/stale | MEDIUM | Visual correctness |
| `Agent.isRecentlyDone()` | Return true if <5min since completion | HIGH | UI behavior critical |
| `SessionSelector.formatTimestamp()` | Format relative times (zojuist, Xm geleden) | MEDIUM | User experience |
| `Timeline.getMarkerColor()` | Return correct color per event type | LOW | Visual only |
| `Timeline.getFilteredMarkers()` | Filter markers by zoom level (10min/hour/day/all) | HIGH | Performance impact |

### Frontend - Pure Logic

| Component/Functie | Test Case | Priority | Rationale |
|-------------------|-----------|----------|-----------|
| `App.getLastActivityTime()` | Return lastActivityTime > endTime > last action > startTime | HIGH | Sorting logic |
| `App.getZoomWindowMs()` | Return correct ms for 10min/hour/day/all | MEDIUM | Filter calculation |
| `Orchestrator.getDisplayText()` | Return narratedStatus in haiku mode, currentTask in raw | MEDIUM | Mode switching |

---

## Integration Tests (MEDIUM priority)

### WebSocket + File Watching

| Test Scenario | Description | Priority | Rationale |
|---------------|-------------|----------|-----------|
| Session update flow | Mock file change -> parseSession -> emit update | HIGH | Core functionality |
| Agent file watch | Create agent-XXX.jsonl -> trigger update | HIGH | Real-time updates |
| Stale agent filtering | Old agent file change should be ignored | HIGH | Performance |
| Client reconnect | Disconnect -> reconnect -> re-watch session | MEDIUM | Reliability |

### Narration Cache

| Test Scenario | Description | Priority | Rationale |
|---------------|-------------|----------|-----------|
| Cache hit | Request same text twice -> second is cached | MEDIUM | Performance verification |
| Cache TTL | Cached entry expires after 30min | MEDIUM | Memory management |
| Cache key format | text::language creates unique keys | MEDIUM | Correctness |

---

## Component Tests (MEDIUM priority)

| Component | Test Case | Priority | Rationale |
|-----------|-----------|----------|-----------|
| `Agent` | Render collapsed view for stale agents | MEDIUM | UI state |
| `Agent` | Show full view for recently done (<5min) | MEDIUM | UI behavior |
| `Agent` | Auto-scroll messages on new message | LOW | UX enhancement |
| `Orchestrator` | Expand/collapse mission details | LOW | Simple interaction |
| `Timeline` | Render markers at correct positions | MEDIUM | Visual correctness |
| `SessionSelector` | Select session updates URL | MEDIUM | Navigation |

---

## NIET testen (te complex / weinig waarde)

### Te complex voor weinig waarde
- **Chokidar file watching** - Te veel external dependencies, moeilijk te mocken
- **Socket.IO full connection lifecycle** - Integration test territory, framework-specifiek
- **Vite port detection** - CLI-specifiek, moeilijk reproduceerbaar
- **Process spawning (CLI)** - System-level, moeilijk te testen

### Al goed getest door frameworks
- **Express middleware** - Standaard functionaliteit
- **React rendering basics** - React Testing Library coverage
- **WebSocket reconnect logic** - Socket.IO internals

### Edge cases met lage ROI
- **Malformed JSONL recovery** - `try/catch` blokken zijn al voldoende
- **Browser theme preference detection** - Browser API, moeilijk te mocken
- **Avatar URL generation** - Third-party API

---

## Test Setup Voorbeeld

### vitest.config.js
```javascript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setup.js',
  },
})
```

### test/setup.js
```javascript
import '@testing-library/jest-dom'
```

### package.json scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

## Prioriteit Samenvatting

**Start met deze 10 tests (hoogste ROI):**

1. `parseAgentFile()` - valid JSONL parsing
2. `parseAgentFile()` - extract agentId
3. `parseSession()` - extract orchestrator + agents
4. `decodeProjectPath()` - path conversion
5. `processAgentFreshness()` - mark stale agents
6. `shouldProcessAgentFileChange()` - filter old agents
7. `formatDuration()` (Agent) - time formatting
8. `getFilteredMarkers()` (Timeline) - zoom filtering
9. `getLastActivityTime()` (App) - activity sorting
10. `isRecentlyDone()` (Agent) - collapse timing

Deze 10 tests dekken:
- Core parsing logic (40%)
- Performance-critical filters (30%)
- User-facing display logic (30%)

**Geschatte tijd:** 4-6 uur voor eerste 10 tests + setup
