function SessionSelector({ sessions, currentSession, onSelect, language = 'nl' }) {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (language === 'nl') {
      if (minutes < 1) return 'zojuist'
      if (minutes < 60) return `${minutes}m geleden`
      if (hours < 24) return `${hours}u geleden`
      if (days < 7) return `${days}d geleden`
    } else {
      if (minutes < 1) return 'just now'
      if (minutes < 60) return `${minutes}m ago`
      if (hours < 24) return `${hours}h ago`
      if (days < 7) return `${days}d ago`
    }

    return date.toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatSessionLabel = (session) => {
    const time = formatTimestamp(session.lastUpdate)
    const path = session.relativePath || session.projectName || 'Unknown'
    return `${path} (${time})`
  }

  return (
    <div className="session-selector">
      <label htmlFor="session-select" className="selector-label">
        {language === 'nl' ? 'Sessie:' : 'Session:'}
      </label>
      <select
        id="session-select"
        className="session-dropdown"
        value={currentSession || ''}
        onChange={(e) => onSelect(e.target.value)}
        title={sessions.find(s => s.id === currentSession)?.projectPath || ''}
      >
        {sessions.length === 0 && (
          <option value="">{language === 'nl' ? 'Geen sessies beschikbaar' : 'No sessions available'}</option>
        )}
        {sessions.map((session) => (
          <option key={session.id} value={session.id} title={session.projectPath}>
            {formatSessionLabel(session)}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SessionSelector
