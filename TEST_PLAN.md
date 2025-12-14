# Claude Dashboard - Comprehensive Test Plan

## Overview
This test plan covers manual testing procedures, edge cases, error scenarios, and performance testing for the Claude Dashboard application. The dashboard consists of a CLI tool, backend server, and React frontend that visualize Claude Code session logs in real-time.

## Test Environment Setup

### Prerequisites
- Node.js >= 18.0.0
- Claude Code installed with existing session files
- ANTHROPIC_API_KEY configured in .env file (for Haiku narrator mode)
- Session files in `~/.claude/projects/**/*.jsonl`

### Test Data Requirements
- At least one active Claude Code session
- At least one completed Claude Code session
- Session files with agent spawns (Task tool usage)
- Session files with file operations (Read/Write/Edit)
- Session files with various sizes (empty, small <1KB, medium 1-10KB, large >10KB)

---

## 1. Manual Tests

### 1.1 CLI Functionality

#### Test 1.1.1: CLI Startup
**Steps:**
1. Run `npm start` from project directory
2. Observe session scanning output
3. Verify session count matches actual JSONL files in `~/.claude/projects/`

**Expected:**
- CLI displays colored banner "Claude Dashboard CLI"
- Shows "Scanning voor sessie bestanden..." message
- Lists found sessions count
- No error messages

#### Test 1.1.2: Session Selection Menu
**Steps:**
1. Start CLI
2. Review the session list in interactive menu
3. Navigate using arrow keys
4. Verify session information display

**Expected:**
- Sessions displayed with: project path, session ID, time ago, file size
- Sessions sorted by most recent first
- Menu is navigable with arrow keys
- Session details are readable and formatted correctly

#### Test 1.1.3: Session Loading
**Steps:**
1. Select a session from menu
2. Observe backend server startup
3. Observe Vite dev server startup
4. Wait for browser to open automatically

**Expected:**
- Backend server starts on port 3001
- Vite detects and uses an available port (5173 or next available)
- CLI displays detected port number
- Browser opens automatically to correct URL with session parameter
- Dashboard loads and displays session data

#### Test 1.1.4: Process Management
**Steps:**
1. Start dashboard
2. Wait for complete initialization
3. Press Ctrl+C to stop

**Expected:**
- "Stopping servers..." message displayed
- Both backend and Vite processes terminate gracefully
- "Goodbye!" message appears
- CLI exits cleanly without hanging

#### Test 1.1.5: Health Checks
**Steps:**
1. Start dashboard
2. Manually verify health endpoint: `curl http://localhost:3001/health`

**Expected:**
- Returns JSON: `{"status":"ok","timestamp":"..."}`
- Timestamp is current ISO format

### 1.2 Backend Server Functionality

#### Test 1.2.1: Session Data Endpoint
**Steps:**
1. Start backend server
2. Test endpoint: `curl "http://localhost:3001/api/session?path=/path/to/session.jsonl"`

**Expected:**
- Returns JSON with: path, messageCount, agents, orchestrator, markers, events
- Data structure matches expected format
- No parsing errors in console

#### Test 1.2.2: Sessions List Endpoint
**Steps:**
1. Start backend server
2. Test endpoint: `curl http://localhost:3001/api/sessions`

**Expected:**
- Returns array of sessions with deduplication applied
- Each session has: id, path, name, projectName, projectPath, relativePath, size, lastUpdate, sessionCount
- Sessions sorted by lastUpdate (most recent first)

#### Test 1.2.3: WebSocket Connection
**Steps:**
1. Start dashboard
2. Open browser developer tools
3. Check Network tab for WebSocket connection
4. Monitor Console for connection messages

**Expected:**
- WebSocket connects to ws://localhost:3001
- "Connected to dashboard server" logged
- Initial session list emitted
- API status emitted

#### Test 1.2.4: File Watching
**Steps:**
1. Load a session in dashboard
2. In another terminal, append a line to the session JSONL file
3. Observe dashboard updates

**Expected:**
- Dashboard receives 'update' event via WebSocket
- UI updates to reflect new data
- No page refresh required

#### Test 1.2.5: Agent File Parsing
**Steps:**
1. Load a session that has agent files (agent-*.jsonl)
2. Verify agent actions and messages appear in UI

**Expected:**
- Agent cards show actions from agent-*.jsonl files
- Actions include file paths and timestamps
- Messages from agents displayed
- Agent count matches number of agent files

#### Test 1.2.6: Narrator Endpoint (Optional)
**Steps:**
1. Ensure ANTHROPIC_API_KEY is configured
2. Test: `curl -X POST http://localhost:3001/api/narrate -H "Content-Type: application/json" -d '{"text":"Running bash command","language":"nl"}'`

**Expected:**
- Returns JSON with narrated text
- Narration is in requested language
- Narration is concise (max ~20 words)

### 1.3 Frontend UI Functionality

#### Test 1.3.1: Initial Load
**Steps:**
1. Open dashboard with session parameter in URL
2. Observe initial render

**Expected:**
- Session loads automatically from URL parameter
- Orchestrator card displays if session has data
- Agent cards display if agents exist
- Timeline renders with markers

#### Test 1.3.2: Session Selector
**Steps:**
1. Open session selector dropdown
2. Review available sessions
3. Select different session

**Expected:**
- Dropdown shows all available sessions
- Sessions display with relative path and time ago
- Selecting new session loads it and updates URL
- Previous session data clears before new data loads

#### Test 1.3.3: Orchestrator Card
**Steps:**
1. Load session with orchestrator data
2. Review orchestrator card content

**Expected:**
- Shows "Orchestrator" title
- Displays avatar (DiceBear bottts style)
- Shows active agents count
- Shows completed tasks count
- Displays mission (if available, collapsible)
- Shows current task in speech bubble
- Shows thinking section (if available, collapsible)
- Status pulse animation visible

#### Test 1.3.4: Agent Cards
**Steps:**
1. Load session with multiple agents
2. Review agent cards

**Expected:**
- Each agent has unique avatar (DiceBear)
- Agent name/type displayed
- Status indicator (active/done) with appropriate color
- Active agents show status pulse animation
- Task description visible
- Duration calculated and displayed
- Actions list shows recent actions with icons
- Messages list shows recent messages
- Completed agents shown in collapsed view

#### Test 1.3.5: Timeline
**Steps:**
1. Load session with events
2. Interact with timeline

**Expected:**
- Timeline shows session start and end times
- Markers appear for events (agent spawns, file operations, errors)
- Different marker colors for different event types
- Hover over marker shows tooltip with details
- Event count displayed
- Zoom controls work (All/Day/Hour)

#### Test 1.3.6: Live Mode
**Steps:**
1. Load active session
2. Verify "LIVE" indicator shows
3. Make changes to session file
4. Observe automatic updates

**Expected:**
- "LIVE" indicator is green and visible
- Dashboard auto-updates when session file changes
- No manual refresh needed

#### Test 1.3.7: Narrator Mode Toggle
**Steps:**
1. Click "Mode" button to toggle between Raw and Haiku
2. Observe task descriptions change

**Expected:**
- Button toggles between "Raw" and "Haiku"
- In Raw mode: technical task descriptions shown
- In Haiku mode: narrated, user-friendly descriptions shown
- Mode preference persists in localStorage
- If API key missing in Haiku mode, warning banner appears

#### Test 1.3.8: Language Toggle
**Steps:**
1. Click "Language" button to toggle NL/EN
2. Observe UI language changes

**Expected:**
- Button toggles between "NL" and "EN"
- UI labels update to selected language
- Agent status text changes language
- Timeline labels change language
- Language preference persists in localStorage

#### Test 1.3.9: Theme Toggle
**Steps:**
1. Click theme button (🖥️/☀️/🌙) to cycle through themes
2. Observe visual changes

**Expected:**
- Button cycles through: System → Light → Dark → System
- Icon changes to indicate current theme
- Page appearance changes appropriately
- System theme respects OS preference
- Theme preference persists in localStorage

---

## 2. Edge Cases to Check

### 2.1 File System Edge Cases

#### Test 2.1.1: Empty .claude Directory
**Scenario:** `~/.claude/projects/` doesn't exist
**Expected:** CLI shows error message and exits gracefully

#### Test 2.1.2: No Session Files
**Scenario:** `.claude/projects/` exists but contains no .jsonl files
**Expected:** CLI shows "Geen sessie bestanden gevonden" and exits

#### Test 2.1.3: Only Agent Files
**Scenario:** Directory only contains agent-*.jsonl files, no main sessions
**Expected:** CLI shows "Geen hoofdsessie bestanden gevonden" and exits

#### Test 2.1.4: Corrupted JSONL File
**Scenario:** Session file contains malformed JSON lines
**Expected:** Parser skips unparseable lines, processes valid lines, no crash

#### Test 2.1.5: Empty Session File
**Scenario:** Session JSONL file exists but is 0 bytes
**Expected:** Dashboard loads with empty state, shows "No data" placeholders

#### Test 2.1.6: Very Long File Path
**Scenario:** Session file path exceeds typical length limits
**Expected:** Path is decoded correctly, displayed truncated in UI with full path in tooltip

#### Test 2.1.7: Special Characters in Path
**Scenario:** Project path contains spaces, unicode, or special characters
**Expected:** Path decoding handles characters correctly, no display issues

### 2.2 Data Edge Cases

#### Test 2.2.1: Session Without Orchestrator
**Scenario:** JSONL file has no sessionId
**Expected:** Orchestrator section shows placeholder "Selecteer een sessie..."

#### Test 2.2.2: Session Without Agents
**Scenario:** Session has no Task tool calls
**Expected:** Agents section shows "No subagents active"

#### Test 2.2.3: Agent Without Real Agent ID
**Scenario:** Agent spawned but no toolUseResult with agentId
**Expected:** Agent tracked but no detailed actions/messages available

#### Test 2.2.4: Mission Extraction Failure
**Scenario:** No suitable user message for mission extraction
**Expected:** Orchestrator mission section not displayed

#### Test 2.2.5: Timestamp Edge Cases
**Scenario:** Missing or invalid timestamps in events
**Expected:** Default to epoch or current time, no crash, display "Unknown"

#### Test 2.2.6: Large Message Content
**Scenario:** Single message with >10,000 characters
**Expected:** Content truncated appropriately, UI remains responsive

#### Test 2.2.7: Many Agents (>50)
**Scenario:** Session spawns 50+ agents
**Expected:** All agents rendered, scrollable grid, no performance degradation

#### Test 2.2.8: Rapid Agent Spawning
**Scenario:** Multiple agents spawned within milliseconds
**Expected:** All agents tracked correctly, no race conditions

### 2.3 Network Edge Cases

#### Test 2.3.1: Backend Not Ready
**Scenario:** Vite starts before backend is ready
**Expected:** CLI waits for backend health check before starting Vite

#### Test 2.3.2: Port Already in Use
**Scenario:** Port 3001 is already occupied
**Expected:** Backend fails to start with clear error message

#### Test 2.3.3: Vite Port Detection Timeout
**Scenario:** Vite takes >30 seconds to start
**Expected:** CLI shows timeout error, processes terminated

#### Test 2.3.4: WebSocket Disconnection
**Scenario:** Backend crashes while frontend is connected
**Expected:** Frontend shows disconnection state, attempts reconnection

#### Test 2.3.5: Slow Network Response
**Scenario:** Narrator API takes >10 seconds to respond
**Expected:** UI remains responsive, timeout after reasonable period

### 2.4 UI Edge Cases

#### Test 2.4.1: Browser Window Resize
**Scenario:** Resize browser from desktop to mobile width
**Expected:** Layout adapts responsively, all content remains accessible

#### Test 2.4.2: No JavaScript
**Scenario:** Load page with JavaScript disabled
**Expected:** Shows appropriate fallback message

#### Test 2.4.3: Very Long Agent Name
**Scenario:** Agent type name >100 characters
**Expected:** Name truncates with ellipsis, full name in tooltip

#### Test 2.4.4: Zero Duration Agent
**Scenario:** Agent starts and completes in <1 second
**Expected:** Duration shows "0s" or "< 1s"

#### Test 2.4.5: Future Timestamp
**Scenario:** Event has timestamp in the future
**Expected:** Displays as "just now" or handles gracefully

---

## 3. Error Scenarios to Test

### 3.1 CLI Error Scenarios

#### Test 3.1.1: Node Version Mismatch
**Scenario:** Run with Node.js <18.0.0
**Expected:** npm shows engine compatibility error

#### Test 3.1.2: Missing Dependencies
**Scenario:** Delete node_modules and run without npm install
**Expected:** Clear error about missing dependencies

#### Test 3.1.3: Permission Denied
**Scenario:** No read permissions on ~/.claude directory
**Expected:** Error message about permissions, graceful exit

#### Test 3.1.4: Ctrl+C During Startup
**Scenario:** Press Ctrl+C while servers are starting
**Expected:** Cleanup runs, partial processes terminated, clean exit

#### Test 3.1.5: Backend Crash After Start
**Scenario:** Kill backend process manually after dashboard starts
**Expected:** CLI detects crash, runs cleanup, exits with error code

#### Test 3.1.6: Vite Crash After Start
**Scenario:** Kill Vite process manually after dashboard starts
**Expected:** CLI detects crash, runs cleanup, exits with error code

### 3.2 Backend Error Scenarios

#### Test 3.2.1: Invalid Session Path Query
**Scenario:** Request /api/session without path parameter
**Expected:** Returns 400 Bad Request with error message

#### Test 3.2.2: Non-existent Session Path
**Scenario:** Request /api/session?path=/nonexistent/file.jsonl
**Expected:** Returns 500 with appropriate error message

#### Test 3.2.3: File Permission Error
**Scenario:** Session file exists but is not readable
**Expected:** Server returns error, doesn't crash

#### Test 3.2.4: Malformed Narrate Request
**Scenario:** POST /api/narrate without text field
**Expected:** Returns 400 Bad Request

#### Test 3.2.5: Anthropic API Error
**Scenario:** Invalid API key or API is down
**Expected:** Narration falls back to original text, logs error

#### Test 3.2.6: CORS Violation
**Scenario:** Request from non-localhost origin
**Expected:** Request blocked with CORS error

#### Test 3.2.7: File Watch Error
**Scenario:** Session file deleted while being watched
**Expected:** Watcher handles error, doesn't crash server

#### Test 3.2.8: Memory Leak Test
**Scenario:** Watch and unwatch multiple sessions repeatedly
**Expected:** Memory usage remains stable, watchers properly closed

### 3.3 Frontend Error Scenarios

#### Test 3.3.1: Backend Unreachable on Load
**Scenario:** Start frontend without backend running
**Expected:** Shows connection error, retry mechanism attempts reconnection

#### Test 3.3.2: Invalid Session Parameter
**Scenario:** Load with ?session=invalid-path
**Expected:** Shows error state or empty state gracefully

#### Test 3.3.3: WebSocket Disconnect Mid-Session
**Scenario:** Stop backend while viewing active session
**Expected:** Shows disconnect indicator, data remains until refresh

#### Test 3.3.4: Malformed WebSocket Data
**Scenario:** Backend sends invalid JSON via WebSocket
**Expected:** Error logged, UI doesn't crash, previous state retained

#### Test 3.3.5: localStorage Full
**Scenario:** Simulate localStorage quota exceeded
**Expected:** Preferences fail to save but app continues functioning

#### Test 3.3.6: Missing Avatar Image
**Scenario:** DiceBear API unreachable
**Expected:** Shows fallback avatar or graceful degradation

#### Test 3.3.7: Race Condition on Session Switch
**Scenario:** Rapidly switch between sessions
**Expected:** Only latest session's data displayed, no mixed state

---

## 4. Performance Tests

### 4.1 Load Performance

#### Test 4.1.1: Large Session File
**Test:** Load session file with >10,000 JSONL entries
**Metrics:**
- Initial load time < 5 seconds
- Memory usage < 500MB
- No UI freezing

**Expected:** Page remains responsive, data loads incrementally if needed

#### Test 4.1.2: Many Agents
**Test:** Load session with 100+ agents
**Metrics:**
- Initial render time < 3 seconds
- Scroll performance smooth (60fps)
- Memory usage stable

**Expected:** Grid layout remains performant, virtual scrolling may be needed

#### Test 4.1.3: Large Timeline
**Test:** Session with 1,000+ timeline markers
**Metrics:**
- Timeline renders in < 2 seconds
- Zoom/filter operations instant (< 100ms)
- No janky animations

**Expected:** Markers may need clustering or virtualization

#### Test 4.1.4: Deep Directory Scanning
**Test:** Scan ~/.claude/projects with 100+ subdirectories
**Metrics:**
- Scan completes in < 10 seconds
- Progress indicator shown if > 2 seconds
- No stack overflow errors

**Expected:** Recursive scan completes successfully

### 4.2 Real-time Performance

#### Test 4.2.1: Rapid Updates
**Test:** Session file updated 10 times per second
**Metrics:**
- UI updates smoothly without lag
- No missed updates
- CPU usage < 50%

**Expected:** Debouncing/throttling prevents excessive re-renders

#### Test 4.2.2: File Watch Responsiveness
**Test:** Measure delay between file change and UI update
**Metrics:**
- Update received within 500ms (polling interval)
- UI renders update within 100ms of receiving

**Expected:** Near real-time updates visible to user

#### Test 4.2.3: Memory Leak Detection
**Test:** Run dashboard for 1 hour with active session
**Metrics:**
- Memory growth < 50MB over time
- No increasing event listeners
- WebSocket connections properly managed

**Expected:** Stable memory usage over extended period

#### Test 4.2.4: Concurrent Sessions
**Test:** Open dashboard in 5 browser tabs simultaneously
**Metrics:**
- Backend handles all WebSocket connections
- Each tab receives updates independently
- Server memory usage < 1GB

**Expected:** Multi-client support works correctly

### 4.3 Network Performance

#### Test 4.3.1: Initial Data Transfer
**Test:** Measure data transferred on initial load
**Metrics:**
- HTML/CSS/JS bundle < 500KB
- Initial session data < 1MB
- Total page weight < 2MB

**Expected:** Fast initial load even on slow connections

#### Test 4.3.2: WebSocket Message Size
**Test:** Measure size of update messages
**Metrics:**
- Update messages < 100KB each
- Only changed data sent (not full state)

**Expected:** Efficient incremental updates

#### Test 4.3.3: API Latency
**Test:** Measure /api/session response time
**Metrics:**
- Small files (< 10KB): < 100ms
- Medium files (10-100KB): < 500ms
- Large files (> 100KB): < 2 seconds

**Expected:** Parsing is efficient, scales with file size

#### Test 4.3.4: Narrator API Performance
**Test:** Measure narration request time
**Metrics:**
- Haiku API response: < 3 seconds
- Caching of narrations effective
- No blocking of UI during request

**Expected:** Narrations load asynchronously, don't block UI

### 4.4 Scalability Tests

#### Test 4.4.1: Maximum Agents
**Test:** Find maximum number of agents before performance degrades
**Target:** Handle at least 200 agents

#### Test 4.4.2: Maximum Timeline Events
**Test:** Find maximum timeline markers before performance degrades
**Target:** Handle at least 10,000 markers with zoom/filtering

#### Test 4.4.3: Maximum Session File Size
**Test:** Find maximum session file size that loads successfully
**Target:** Handle at least 50MB files

#### Test 4.4.4: Long-Running Session
**Test:** Test with session running for 24+ hours
**Metrics:**
- Timestamp calculations remain accurate
- No integer overflow issues
- UI remains responsive

---

## 5. Compatibility Testing

### 5.1 Browser Compatibility
**Test in:**
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

**Verify:**
- All features work
- Layout renders correctly
- WebSocket connections stable
- Theme switching works

### 5.2 Operating System Compatibility
**Test on:**
- macOS (primary target based on code)
- Linux
- Windows (via WSL if needed)

**Verify:**
- File path parsing correct
- CLI color codes display properly
- Process management works

### 5.3 Node.js Version Compatibility
**Test with:**
- Node.js 18.x (minimum)
- Node.js 20.x
- Node.js 22.x (latest LTS)

**Verify:**
- All features work
- No deprecation warnings
- ES modules load correctly

---

## 6. Security Testing

### 6.1 Path Traversal
**Test:** Attempt to access files outside Claude directory via API
**Expected:** Requests rejected or sanitized

### 6.2 XSS Prevention
**Test:** Inject script tags in session data
**Expected:** React escapes HTML, no script execution

### 6.3 API Key Security
**Test:** Verify .env file is gitignored
**Expected:** API keys never committed to git

### 6.4 CORS Security
**Test:** Request API from unauthorized origin
**Expected:** CORS blocks request

---

## 7. User Experience Testing

### 7.1 First-Time User Flow
**Test:** User runs dashboard for first time
**Expected:**
- Clear startup messages
- Helpful error messages if setup incomplete
- Intuitive session selection

### 7.2 Error Message Clarity
**Review all error messages:**
- Are they actionable?
- Do they explain what went wrong?
- Do they suggest how to fix?

### 7.3 Visual Feedback
**Verify:**
- Loading states shown during operations
- Success/error states clearly indicated
- Animations enhance UX without being distracting

### 7.4 Accessibility
**Test:**
- Keyboard navigation works
- Color contrast sufficient
- Screen reader compatibility (basic)

---

## 8. Regression Testing Checklist

Before each release, verify:
- [ ] CLI starts successfully
- [ ] Session scanning works
- [ ] Session selection menu functional
- [ ] Backend server starts on port 3001
- [ ] Vite port detection works
- [ ] Browser opens automatically
- [ ] WebSocket connects successfully
- [ ] Session data loads correctly
- [ ] Orchestrator card displays
- [ ] Agent cards display with correct data
- [ ] Timeline renders with markers
- [ ] File watching updates UI in real-time
- [ ] Session switching works
- [ ] Narrator mode toggle works
- [ ] Language toggle works
- [ ] Theme toggle works
- [ ] Graceful shutdown with Ctrl+C
- [ ] No console errors in normal operation

---

## 9. Test Data Generation

### Creating Test Sessions

#### Minimal Session
```bash
# Create minimal valid session
echo '{"type":"user","message":{"content":"Hello"},"timestamp":"2024-12-14T10:00:00.000Z","sessionId":"test123"}' > ~/.claude/projects/test/minimal.jsonl
```

#### Session with Agents
```bash
# Create session with Task spawn
echo '{"type":"user","message":{"content":"Test task"},"timestamp":"2024-12-14T10:00:00.000Z","sessionId":"test123"}' > ~/.claude/projects/test/with-agent.jsonl
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Task","id":"agent1","input":{"description":"Test agent task","subagent_type":"test-agent"}}]},"timestamp":"2024-12-14T10:00:01.000Z","sessionId":"test123"}' >> ~/.claude/projects/test/with-agent.jsonl
```

#### Corrupted Session
```bash
# Create session with invalid JSON
echo 'INVALID JSON LINE' > ~/.claude/projects/test/corrupted.jsonl
echo '{"type":"user","message":{"content":"Valid line"},"timestamp":"2024-12-14T10:00:00.000Z"}' >> ~/.claude/projects/test/corrupted.jsonl
```

---

## 10. Automated Testing Recommendations

While this is a manual test plan, consider adding automated tests for:

### Unit Tests (Future Enhancement)
- Path decoding functions
- Timestamp formatting functions
- Session parsing logic
- JSONL parsing with malformed data

### Integration Tests (Future Enhancement)
- Backend API endpoints
- WebSocket message flow
- File watching functionality

### E2E Tests (Future Enhancement)
- Full user flow from CLI to dashboard
- Session selection and loading
- Real-time updates
- Theme/language switching

### Tools to Consider
- Vitest for unit/integration tests
- Playwright for E2E tests
- React Testing Library for component tests

---

## Appendix A: Test Execution Log Template

```markdown
## Test Execution Log - [Date]

### Tester: [Name]
### Version: [Version Number]
### Environment: [OS, Node Version, Browser]

### Test Results Summary
- Total Tests:
- Passed:
- Failed:
- Skipped:

### Failed Tests Detail
[Test ID] - [Test Name]
- Expected:
- Actual:
- Screenshots/Logs:
- Severity: Critical/High/Medium/Low
- Reproducible: Yes/No

### Notes
[Additional observations, performance notes, etc.]
```

---

## Appendix B: Common Issues and Solutions

### Issue: Backend doesn't start
**Solution:** Check if port 3001 is already in use: `lsof -i :3001`

### Issue: Vite port detection fails
**Solution:** Manually check Vite output, ensure it's logging to stdout

### Issue: Sessions not found
**Solution:** Verify `~/.claude/projects/` exists and contains .jsonl files

### Issue: WebSocket won't connect
**Solution:** Check backend is running, no CORS issues, correct port

### Issue: Haiku mode shows raw text
**Solution:** Verify ANTHROPIC_API_KEY is set in .env file

### Issue: Timeline markers not showing
**Solution:** Check session has events with timestamps, try zoom controls

---

## Appendix C: Performance Benchmarks

Baseline performance targets:

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| CLI Startup | < 2s | Time from `npm start` to menu display |
| Session Scan (100 files) | < 5s | Time to scan and list all sessions |
| Backend Startup | < 3s | Time to pass health check |
| Frontend Load | < 2s | Time to First Contentful Paint |
| Session Parse (10KB) | < 100ms | Server-side JSONL parsing |
| WebSocket Latency | < 50ms | Round-trip ping/pong |
| UI Update on File Change | < 500ms | From file modification to UI render |
| Memory Usage (idle) | < 200MB | Backend + Frontend combined |
| Memory Usage (large session) | < 500MB | With 50+ agents, 1000+ events |

---

## Document Version
- **Version:** 1.0
- **Date:** 2024-12-14
- **Author:** Test Plan Generator
- **Status:** Draft for Review
