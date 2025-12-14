import React from 'react'

function Orchestrator({ data, narratorMode, language = 'nl' }) {
  const avatarUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=orchestrator'
  const [missionExpanded, setMissionExpanded] = React.useState(false)

  if (!data) {
    return null
  }

  const getDisplayText = () => {
    if (narratorMode === 'haiku') {
      return data.narratedStatus || data.currentTask || (language === 'nl' ? 'Coordinating Agents...' : 'Coordinating Agents...')
    }
    return data.currentTask || (language === 'nl' ? 'Idle' : 'Idle')
  }

  return (
    <div className="orchestrator">
      <div className="orchestrator-card">
        <div className="avatar-container master">
          <img
            src={avatarUrl}
            alt="Orchestrator"
            className="avatar"
          />
          <div className="status-pulse"></div>
        </div>
        <div className="orchestrator-content">
          <div className="orchestrator-header">
            <h2 className="orchestrator-title">Orchestrator</h2>
            <div className="orchestrator-stats">
              <span className="stat">
                {data.activeAgents || 0} Active
              </span>
              <span className="stat">
                {data.tasksCompleted || 0} Done
              </span>
            </div>
          </div>

          {data.mission && (
            <details
              className="orchestrator-mission"
              open={missionExpanded}
              onToggle={(e) => setMissionExpanded(e.target.open)}
            >
              <summary className="mission-summary">Mission</summary>
              <div className="mission-content">{data.mission}</div>
            </details>
          )}

          <div className="speech-bubble master-bubble">
            {getDisplayText()}
          </div>

          {data.thinking && (
            <details className="orchestrator-thinking">
              <summary className="thinking-summary">View reasoning</summary>
              <div className="thinking-content">
                {data.thinking}
                {data.thinking.length >= 300 && '...'}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

export default Orchestrator
