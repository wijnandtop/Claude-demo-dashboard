import { useEffect, useRef, memo, useState } from 'react'
import { formatDuration as formatDurationUtil } from '../utils/formatters'

const Agent = memo(function Agent({ agent, narratorMode, language = 'nl' }) {
  const avatarSeed = agent.id || `${agent.name}-${Math.random()}`
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`
  const isDone = agent.status === 'done'
  const isStale = agent.isStale || agent.status === 'stale'
  const messagesEndRef = useRef(null)
  const actionsEndRef = useRef(null)

  // Force re-render every second to update duration display and check collapse timing
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!isDone && !isStale) return // Only need interval for done/stale agents

    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [isDone, isStale])

  // Check if agent completed recently (within 5 minutes) - show full view instead of collapsed
  const isRecentlyDone = () => {
    if (!isDone || !agent.endTime) return false
    const endTime = new Date(agent.endTime).getTime()
    const now = Date.now()
    const COLLAPSE_DELAY_MS = 5 * 60 * 1000
    return (now - endTime) < COLLAPSE_DELAY_MS
  }

  const getStatusClass = () => {
    if (isStale) return 'status-stale'
    switch(agent.status) {
      case 'active':
        return 'status-active'
      case 'waiting':
        return 'status-waiting'
      case 'done':
        return 'status-done'
      default:
        return 'status-idle'
    }
  }

  const getDisplayText = () => {
    if (narratorMode === 'haiku') {
      return agent.narratedTask || agent.currentTask || (language === 'nl' ? 'Wacht op taak...' : 'Waiting for task...')
    }
    return agent.currentTask || (language === 'nl' ? 'Inactief' : 'Idle')
  }

  const getStatusText = () => {
    if (isStale) {
      return language === 'nl' ? 'Oud' : 'Old'
    }
    if (agent.status === 'active') {
      return language === 'nl' ? 'Bezig...' : 'Working...'
    }
    if (agent.status === 'done') {
      return language === 'nl' ? 'Klaar' : 'Done'
    }
    return language === 'nl' ? 'Wachtend' : 'Waiting'
  }

  // For done agents: show time SINCE completion (counting up)
  // For stale agents: show time since last activity
  // For active agents: show time spent working so far
  const formatDuration = () => {
    // For stale agents: show time since last activity
    if (isStale) {
      const lastActivity = agent.lastActivityTime || agent.endTime || agent.startTime
      if (!lastActivity) return null
      const lastActivityMs = new Date(lastActivity).getTime()
      const now = Date.now()
      const diffMs = now - lastActivityMs
      return formatDurationUtil(diffMs)
    }

    if (isDone && agent.endTime) {
      // Time since completion - this counts UP
      const endTime = new Date(agent.endTime).getTime()
      const now = Date.now()
      const diffMs = now - endTime
      return formatDurationUtil(diffMs)
    }

    // For active agents: show how long they've been working
    const startTimeSource = agent.firstActivityTime || agent.startTime
    if (!startTimeSource) return null

    const start = new Date(startTimeSource)
    const end = new Date()
    const diffMs = end - start
    return formatDurationUtil(diffMs)
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const getActionIcon = (actionName) => {
    const iconMap = {
      'Read': '\u{1F4D6}',
      'Write': '\u{270D}\uFE0F',
      'Edit': '\u{270F}\uFE0F',
      'Bash': '\u{26A1}',
      'Grep': '\u{1F50D}'
    }
    return iconMap[actionName] || '\u{1F4DD}'
  }

  // Auto-scroll to bottom when new messages or actions arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [agent.messages])

  useEffect(() => {
    if (actionsEndRef.current) {
      actionsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [agent.actions])

  // Collapsed view for done agents (but show full view if recently completed)
  // Also show collapsed view for stale agents
  const shouldShowCollapsed = isStale || (isDone && !isRecentlyDone())

  if (shouldShowCollapsed) {
    const taskText = getDisplayText()
    // Show at least 80 characters, or full text if shorter
    const displayTask = taskText.length > 120 ? taskText.substring(0, 120) + '...' : taskText
    const duration = formatDuration()

    // Determine badge text based on status
    const getBadgeText = () => {
      if (isStale && agent.status !== 'done') {
        return language === 'nl' ? 'Verlopen' : 'Stale'
      }
      return language === 'nl' ? 'Klaar' : 'Done'
    }

    return (
      <div className={`agent ${isStale ? 'agent-stale' : 'agent-done'}`}>
        <div className="agent-card agent-card-collapsed">
          <div className="avatar-container avatar-small">
            <img
              src={avatarUrl}
              alt={agent.name}
              className="avatar"
            />
            <div className={`status-indicator ${getStatusClass()}`}></div>
          </div>
          <span className="agent-name-inline">{agent.name}</span>
          <span className="agent-task-inline" title={taskText}>{displayTask}</span>
          <span className={`agent-done-badge ${isStale ? 'agent-stale-badge' : ''}`}>
            {getBadgeText()}
            {duration && <span className="agent-duration"> ({duration})</span>}
          </span>
        </div>
      </div>
    )
  }

  const duration = formatDuration()

  return (
    <div className="agent">
      <div className="agent-card">
        <div className="agent-header">
          <div className="avatar-container">
            <img
              src={avatarUrl}
              alt={agent.name}
              className="avatar"
            />
            <div className={`status-indicator ${getStatusClass()}`}></div>
            {agent.status === 'active' && <div className="status-pulse"></div>}
          </div>
          <div className="agent-header-info">
            <h3 className="agent-name">{agent.name}</h3>
            <span className="agent-status-text">
              {getStatusText()}
              {duration && <span className="agent-duration"> ({duration})</span>}
            </span>
          </div>
        </div>

        {agent.currentTask && (
          <div className="agent-task">
            <h4 className="task-title">{language === 'nl' ? 'Opdracht' : 'Task'}</h4>
            <p className="task-text">{getDisplayText()}</p>
          </div>
        )}

        {agent.messages && agent.messages.length > 0 && (
          <div className="agent-messages">
            <h4 className="messages-title">{language === 'nl' ? 'Berichten' : 'Messages'}</h4>
            <div className="messages-list">
              {agent.messages.slice(-5).map((message, index) => (
                <div key={index} className="message-item">
                  <span className="message-timestamp">{formatTimestamp(message.timestamp)}</span>
                  <span className="message-text">{message.text}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {agent.actions && agent.actions.length > 0 && (
          <div className="agent-actions">
            <h4 className="actions-title">{language === 'nl' ? 'Acties' : 'Actions'}</h4>
            <div className="actions-list">
              {agent.actions.slice(-5).map((action, index) => (
                <div key={index} className="action-item">
                  <span className="action-icon">{getActionIcon(action.name)}</span>
                  <span className="action-name">{action.name}</span>
                  {action.filePath && (
                    <span className="action-filepath" title={action.filePath}>
                      {action.filePath.split('/').pop()}
                    </span>
                  )}
                  <span className="action-timestamp">{formatTimestamp(action.timestamp)}</span>
                </div>
              ))}
              <div ref={actionsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default Agent
