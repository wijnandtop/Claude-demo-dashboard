import { useState, useEffect, useRef, useMemo } from 'react'
import { io } from 'socket.io-client'
import Orchestrator from './components/Orchestrator'
import Agent from './components/Agent'
import SessionSelector from './components/SessionSelector'
import Timeline from './components/Timeline'
import { getZoomWindowMs } from './utils/formatters'

function App() {
  // Get session from URL query parameter - used for initial state
  const getSessionFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    const sessionPath = params.get('session')
    return sessionPath ? decodeURIComponent(sessionPath) : null
  }

  // Initialize current session from URL immediately (synchronously)
  const [currentSession, setCurrentSession] = useState(() => getSessionFromUrl())
  const [sessions, setSessions] = useState([])
  const [agents, setAgents] = useState([])
  const [orchestrator, setOrchestrator] = useState(null)
  const [isLive, setIsLive] = useState(true)
  const [narratorMode, setNarratorMode] = useState(() => {
    const stored = localStorage.getItem('narratorMode')
    return stored || 'raw'
  })
  const [language, setLanguage] = useState(() => {
    const stored = localStorage.getItem('language')
    return stored || 'nl'
  })
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme')
    return stored || 'system'
  })
  const [apiKeyMissing, setApiKeyMissing] = useState(false)
  const [events, setEvents] = useState([])
  const [currentTime, setCurrentTime] = useState(0)
  const [markers, setMarkers] = useState([])
  const [socket, setSocket] = useState(null)
  const [timelineZoom, setTimelineZoom] = useState('hour') // '10min', 'hour', 'day', 'all'

  // Track the current session for reconnect handling
  const currentSessionRef = useRef(currentSession)
  // Track which texts have already been narrated (to prevent duplicate API calls)
  const narratedTexts = useRef(new Set())
  // Track if we've received the first update (to mark initial data as "already narrated")
  const firstUpdateReceived = useRef(false)

  // Keep the ref in sync with the state
  useEffect(() => {
    currentSessionRef.current = currentSession
  }, [currentSession])

  // Apply theme to document body
  useEffect(() => {
    const applyTheme = () => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.body.className = prefersDark ? '' : 'light-theme'
      } else if (theme === 'light') {
        document.body.className = 'light-theme'
      } else {
        document.body.className = ''
      }
    }

    applyTheme()

    // Listen for system theme changes when in system mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme()
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  // Connect to WebSocket server
  useEffect(() => {
    const newSocket = io('http://localhost:3001')

    newSocket.on('connect', () => {
      console.log('Connected to dashboard server')
      // Always watch current session on (re)connect
      if (currentSessionRef.current) {
        console.log('Watching session on connect:', currentSessionRef.current)
        newSocket.emit('watch', currentSessionRef.current)
      }
    })

    newSocket.on('sessions', (data) => {
      setSessions(data)
      // Auto-select first session if no session is currently selected
      if (!currentSession && data.length > 0) {
        setCurrentSession(data[0].id)
      }
    })

    newSocket.on('update', (data) => {
      console.log('Received update:', data)

      // On FIRST update: mark all existing texts as "already narrated" to prevent spam
      if (!firstUpdateReceived.current) {
        console.log('[Frontend] First update received - marking existing content as already narrated')
        firstUpdateReceived.current = true

        // Add orchestrator task to narrated set
        if (data.orchestrator?.currentTask) {
          narratedTexts.current.add(data.orchestrator.currentTask)
        }

        // Add all agent tasks to narrated set
        if (data.agents) {
          data.agents.forEach(agent => {
            if (agent.currentTask) {
              narratedTexts.current.add(agent.currentTask)
            }
          })
        }

        console.log('[Frontend] Marked', narratedTexts.current.size, 'texts as already narrated')
      }

      setAgents(data.agents || [])
      setOrchestrator(data.orchestrator || null)
      setMarkers(data.markers || [])

      // Add to events timeline
      if (data.markers) {
        setEvents(prev => {
          const newEvents = data.markers.filter(m =>
            !prev.some(p => p.timestamp === m.timestamp && p.type === m.type)
          )
          return [...prev, ...newEvents]
        })
      }
    })

    // Handle narration responses
    newSocket.on('narrated', ({ text, narration }) => {
      console.log('[Frontend] Received narration:', { text, narration })

      // Update agents with narrated text
      setAgents(prevAgents =>
        prevAgents.map(agent =>
          agent.currentTask === text
            ? { ...agent, narratedTask: narration }
            : agent
        )
      )

      // Update orchestrator with narrated text
      setOrchestrator(prev =>
        prev && prev.currentTask === text
          ? { ...prev, narratedStatus: narration }
          : prev
      )
    })

    newSocket.on('apiStatus', (data) => {
      setApiKeyMissing(!data.keyConfigured)
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from dashboard server')
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  // Watch session when it changes
  useEffect(() => {
    if (socket && socket.connected && currentSession) {
      console.log('Watching session:', currentSession)

      // Reset narration tracking for new session
      firstUpdateReceived.current = false
      narratedTexts.current.clear()

      socket.emit('watch', currentSession)
      setEvents([])
      setIsLive(true)
    }
  }, [currentSession, socket])

  // Request narration when agents or orchestrator update and haiku mode is on
  // Only narrate NEW content that we haven't seen before (tracked via narratedTexts Set)
  useEffect(() => {
    // Skip if not in haiku mode or no socket
    if (!socket || narratorMode !== 'haiku') return

    // Helper to request narration only if not already narrated
    const requestNarration = (text) => {
      if (!text) return

      // Skip if already narrated (includes all initial data)
      if (narratedTexts.current.has(text)) {
        return
      }

      // Mark as narrated BEFORE sending request (prevent duplicates)
      narratedTexts.current.add(text)
      console.log('[Frontend] NEW content - requesting narration:', text.substring(0, 50) + '...')

      socket.emit('narrate', { text, language })
    }

    // Narrate orchestrator if we haven't already
    if (orchestrator?.currentTask) {
      requestNarration(orchestrator.currentTask)
    }

    // Narrate active agents we haven't narrated yet
    agents.forEach(agent => {
      if (agent.currentTask && agent.status === 'active') {
        requestNarration(agent.currentTask)
      }
    })
  }, [agents, orchestrator, socket, narratorMode, language])

  const handleSessionSelect = (sessionId) => {
    setCurrentSession(sessionId)
    setAgents([])
    setOrchestrator(null)
    setEvents([])
    setMarkers([])
    setIsLive(true)

    // Reset narration tracking for new session
    firstUpdateReceived.current = false
    narratedTexts.current.clear()

    // Update URL
    const url = new URL(window.location.href)
    url.searchParams.set('session', sessionId)
    window.history.pushState({}, '', url)
  }

  const handleTimelineSeek = (timestamp) => {
    console.log('handleTimelineSeek called:', {
      timestamp: new Date(timestamp).toLocaleTimeString(),
      wasLive: isLive
    })
    setCurrentTime(timestamp)
    setIsLive(false)
  }

  const handleGoLive = () => {
    console.log('Going back to LIVE mode')
    setIsLive(true)
    setCurrentTime(0)
  }

  const toggleNarratorMode = () => {
    setNarratorMode(prev => {
      const newMode = prev === 'raw' ? 'haiku' : 'raw'
      localStorage.setItem('narratorMode', newMode)
      return newMode
    })
  }

  const toggleLanguage = () => {
    setLanguage(prev => {
      const newLang = prev === 'nl' ? 'en' : 'nl'
      localStorage.setItem('language', newLang)
      return newLang
    })
  }

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system'
      localStorage.setItem('theme', newTheme)
      return newTheme
    })
  }

  const getThemeIcon = () => {
    if (theme === 'dark') return '🌙'
    if (theme === 'light') return '☀️'
    return '🖥️'
  }

  // Helper to get last activity time for an agent
  const getLastActivityTime = (agent) => {
    // Use lastActivityTime if available (most accurate)
    if (agent.lastActivityTime) {
      return new Date(agent.lastActivityTime).getTime()
    }
    // For done agents, use endTime
    if (agent.status === 'done' && agent.endTime) {
      return new Date(agent.endTime).getTime()
    }
    // For active agents, use last action timestamp if available
    if (agent.actions && agent.actions.length > 0) {
      const lastAction = agent.actions[agent.actions.length - 1]
      if (lastAction.timestamp) {
        return new Date(lastAction.timestamp).getTime()
      }
    }
    // Fall back to startTime if available
    if (agent.startTime) {
      return new Date(agent.startTime).getTime()
    }
    return 0
  }


  // Memoize filtered and sorted agents based on timeline zoom
  const sortedAgents = useMemo(() => {
    const zoomWindowMs = getZoomWindowMs(timelineZoom)
    const now = Date.now()

    // Filter agents based on zoom level
    const filteredAgents = agents.filter(agent => {
      // 'all' shows everything
      if (timelineZoom === 'all') return true

      const lastActivity = getLastActivityTime(agent)
      if (!lastActivity) return false

      // Show agents with activity within the zoom window
      return (now - lastActivity) <= zoomWindowMs
    })

    // Sort: active first, then by most recent activity
    return filteredAgents.sort((a, b) => {
      // First: sort by status (active before done/stale)
      const isActiveA = a.status === 'active'
      const isActiveB = b.status === 'active'
      if (isActiveA && !isActiveB) return -1
      if (!isActiveA && isActiveB) return 1

      // Second: sort by last activity timestamp (most recent first)
      const timeA = getLastActivityTime(a)
      const timeB = getLastActivityTime(b)
      return timeB - timeA // Most recent first (descending order)
    })
  }, [agents, timelineZoom])

  // Helper to check if agent completed recently (within 5 minutes) - matches Agent.jsx logic
  const isRecentlyDone = (agent) => {
    if (agent.status !== 'done' || !agent.endTime) return false
    const endTime = new Date(agent.endTime).getTime()
    const now = Date.now()
    const COLLAPSE_DELAY_MS = 5 * 60 * 1000
    return (now - endTime) < COLLAPSE_DELAY_MS
  }

  // Split agents into active and inactive groups
  // Active: agents with status 'active' OR recently completed (within 5 minutes)
  // Inactive: agents that are done/stale AND NOT recently completed
  const { activeAgents, inactiveAgents } = useMemo(() => {
    return sortedAgents.reduce(
      (acc, agent) => {
        const isActive = agent.status === 'active' || isRecentlyDone(agent)
        if (isActive) {
          acc.activeAgents.push(agent)
        } else {
          acc.inactiveAgents.push(agent)
        }
        return acc
      },
      { activeAgents: [], inactiveAgents: [] }
    )
  }, [sortedAgents])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Claude Dashboard</h1>
        <div className="header-controls">
          <SessionSelector
            sessions={sessions}
            currentSession={currentSession}
            onSelect={handleSessionSelect}
            language={language}
          />
          <button
            className="narrator-toggle"
            onClick={toggleNarratorMode}
          >
            Mode: {narratorMode === 'raw' ? 'Raw' : 'Haiku'}
          </button>
          <button
            className="language-toggle"
            onClick={toggleLanguage}
          >
            Language: {language === 'nl' ? 'NL' : 'EN'}
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Theme: ${theme}`}
          >
            {getThemeIcon()}
          </button>
          <div
            className={`live-indicator ${isLive ? 'active' : 'clickable'}`}
            onClick={!isLive ? handleGoLive : undefined}
            style={{ cursor: !isLive ? 'pointer' : 'default' }}
            title={!isLive ? (language === 'nl' ? 'Klik om terug te gaan naar LIVE' : 'Click to go back to LIVE') : ''}
          >
            {isLive ? 'LIVE' : 'PLAYBACK'}
          </div>
        </div>
      </header>

      {apiKeyMissing && narratorMode === 'haiku' && (
        <div className="api-warning-banner">
          <strong>{language === 'nl' ? 'Let op:' : 'Warning:'}</strong> {language === 'nl'
            ? 'ANTHROPIC_API_KEY ontbreekt. Kopieer .env.example naar .env en vul je API key in.'
            : 'ANTHROPIC_API_KEY is missing. Copy .env.example to .env and add your API key.'}
          {' '}<a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
            {language === 'nl' ? 'Haal key op' : 'Get key'}
          </a>
        </div>
      )}

      <main className="app-main">
        <section className="orchestrator-section">
          {orchestrator ? (
            <Orchestrator
              data={orchestrator}
              narratorMode={narratorMode}
              language={language}
            />
          ) : (
            <div className="orchestrator-placeholder">
              <p>{language === 'nl' ? 'Selecteer een sessie om te starten...' : 'Select a session to start...'}</p>
            </div>
          )}
        </section>

        <section className="agents-section">
          {agents.length > 0 && (
            <div className="agents-header">
              <span className="agents-count">
                {language === 'nl' ? 'Agents' : 'Agents'}: {sortedAgents.length} / {agents.length}
              </span>
            </div>
          )}

          {sortedAgents.length > 0 ? (
            <>
              {/* Active agents section */}
              {activeAgents.length > 0 && (
                <div className="agents-group">
                  <div className="agents-group-header">
                    <span className="agents-group-title">
                      {language === 'nl' ? 'Actief' : 'Active'}
                    </span>
                    <span className="agents-group-count">{activeAgents.length}</span>
                  </div>
                  <div className="agents-grid">
                    {activeAgents.map((agent) => (
                      <Agent
                        key={agent.id}
                        agent={agent}
                        narratorMode={narratorMode}
                        language={language}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive agents section */}
              {inactiveAgents.length > 0 && (
                <div className="agents-group">
                  <div className="agents-group-header">
                    <span className="agents-group-title">
                      {language === 'nl' ? 'Afgerond' : 'Completed'}
                    </span>
                    <span className="agents-group-count">{inactiveAgents.length}</span>
                  </div>
                  <div className="agents-grid">
                    {inactiveAgents.map((agent) => (
                      <Agent
                        key={agent.id}
                        agent={agent}
                        narratorMode={narratorMode}
                        language={language}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-agents">
              <p>{agents.length > 0
                ? (language === 'nl' ? 'Geen agents in dit tijdvenster' : 'No agents in this time window')
                : (language === 'nl' ? 'Geen subagents actief' : 'No subagents active')
              }</p>
            </div>
          )}
        </section>

        <section className="timeline-section">
          <Timeline
            events={events}
            currentTime={currentTime}
            markers={markers}
            onSeek={handleTimelineSeek}
            onGoLive={handleGoLive}
            isLive={isLive}
            language={language}
            onZoomChange={setTimelineZoom}
          />
        </section>
      </main>
    </div>
  )
}

export default App
