import { useRef, useState, useEffect } from 'react'

function Timeline({ events, markers, language = 'nl', onZoomChange }) {
  const timelineRef = useRef(null)
  const [hoveredEvent, setHoveredEvent] = useState(null)
  const [zoomLevel, setZoomLevel] = useState('hour') // '10min', 'hour', 'day', 'all'

  // Notify parent when zoom level changes
  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(zoomLevel)
    }
  }, [zoomLevel, onZoomChange])

  const getMarkerColor = (eventType) => {
    switch(eventType) {
      case 'error':
        return '#ff4444'
      case 'warning':
        return '#ffaa44'
      case 'agent_spawn':
        return '#aa44ff'
      case 'read':
        return '#5a7a9a'
      case 'write':
        return '#5a9a5a'
      case 'edit':
        return '#c9a227'
      default:
        return '#4444ff'
    }
  }

  const getMarkerSize = (eventType) => {
    // File actions are smaller than events
    if (eventType === 'read' || eventType === 'write' || eventType === 'edit') {
      return 'small'
    }
    return 'normal'
  }

  const getMarkerLabel = (marker) => {
    if (marker.type === 'read' || marker.type === 'write' || marker.type === 'edit') {
      return `${marker.type.toUpperCase()}: ${marker.filename || marker.file}`
    }
    return marker.type
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Get filtered markers based on zoom level
  const getFilteredMarkers = () => {
    if (!markers || markers.length === 0) return []

    const tenMinutes = 10 * 60 * 1000
    const oneHour = 60 * 60 * 1000
    const oneDay = 24 * oneHour

    // Use the latest marker as the reference point instead of Date.now()
    // This ensures filtering works for historical sessions
    const latestMarkerTime = Math.max(...markers.map(m => new Date(m.timestamp).getTime()))

    switch (zoomLevel) {
      case '10min':
        return markers.filter(marker => {
          const timestamp = new Date(marker.timestamp).getTime()
          return (latestMarkerTime - timestamp) <= tenMinutes
        })
      case 'hour':
        return markers.filter(marker => {
          const timestamp = new Date(marker.timestamp).getTime()
          return (latestMarkerTime - timestamp) <= oneHour
        })
      case 'day':
        return markers.filter(marker => {
          const timestamp = new Date(marker.timestamp).getTime()
          return (latestMarkerTime - timestamp) <= oneDay
        })
      case 'all':
      default:
        return markers
    }
  }

  // Get time range based on zoom level
  const getTimeRange = () => {
    if (!events || events.length === 0) return { start: 0, end: 0 }
    if (!markers || markers.length === 0) return { start: 0, end: 0 }

    const tenMinutes = 10 * 60 * 1000
    const oneHour = 60 * 60 * 1000
    const oneDay = 24 * oneHour
    const firstEvent = new Date(events[0].timestamp).getTime()
    const lastEvent = new Date(events[events.length - 1].timestamp).getTime()

    // Get the latest marker timestamp (which should be similar to lastEvent but more accurate)
    const latestMarker = Math.max(...markers.map(m => new Date(m.timestamp).getTime()))

    let range
    switch (zoomLevel) {
      case '10min':
        range = {
          start: Math.max(firstEvent, latestMarker - tenMinutes),
          end: latestMarker
        }
        break
      case 'hour':
        range = {
          start: Math.max(firstEvent, latestMarker - oneHour),
          end: latestMarker
        }
        break
      case 'day':
        range = {
          start: Math.max(firstEvent, latestMarker - oneDay),
          end: latestMarker
        }
        break
      case 'all':
      default:
        range = {
          start: firstEvent,
          end: lastEvent
        }
    }

    return range
  }

  const getZoomLabel = (zoom) => {
    const labels = {
      '10min': '10 min',
      hour: language === 'nl' ? 'Uur' : 'Hour',
      day: language === 'nl' ? 'Dag' : 'Day',
      all: language === 'nl' ? 'Alles' : 'All'
    }
    return labels[zoom]
  }


  const getMarkerPosition = (timestamp) => {
    if (!events || events.length === 0) return 0

    const timeRange = getTimeRange()
    if (!timeRange.start || !timeRange.end) return 0

    const range = timeRange.end - timeRange.start
    if (range === 0) return 50

    const timestampMs = new Date(timestamp).getTime()

    // Only show markers within the current time range
    if (timestampMs < timeRange.start || timestampMs > timeRange.end) {
      return -100 // Position off-screen
    }

    const position = ((timestampMs - timeRange.start) / range) * 100
    return position
  }

  const filteredMarkers = getFilteredMarkers()

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h3>{language === 'nl' ? 'Sessie Tijdlijn' : 'Session Timeline'}</h3>
        <div className="timeline-header-controls">
          <div className="zoom-controls">
            {['10min', 'hour', 'day', 'all'].map((zoom) => (
              <button
                key={zoom}
                className={`zoom-button ${zoomLevel === zoom ? 'active' : ''}`}
                onClick={() => {
                  setZoomLevel(zoom)
                }}
              >
                {getZoomLabel(zoom)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="timeline-track"
        ref={timelineRef}
      >
        <div className="timeline-bar">
          {filteredMarkers && filteredMarkers.map((marker, index) => {
            const position = getMarkerPosition(marker.timestamp)
            // Don't render markers that are positioned off-screen
            if (position < 0 || position > 100) return null

            return (
              <div
                key={index}
                className={`timeline-marker timeline-marker-${getMarkerSize(marker.type)}`}
                style={{
                  left: `${position}%`,
                  backgroundColor: getMarkerColor(marker.type)
                }}
                onMouseEnter={() => setHoveredEvent(marker)}
                onMouseLeave={() => setHoveredEvent(null)}
                title={`${getMarkerLabel(marker)} at ${formatTime(marker.timestamp)}`}
              >
                <div className="marker-dot"></div>
              </div>
            )
          })}

        </div>
      </div>

      {hoveredEvent && (
        <div className="timeline-tooltip">
          <strong>{getMarkerLabel(hoveredEvent)}</strong>
          <br />
          <span className="tooltip-time">{formatTime(hoveredEvent.timestamp)}</span>
        </div>
      )}

      <div className="timeline-stats">
        <span>{language === 'nl' ? 'Events' : 'Events'}: {filteredMarkers?.length || 0} / {markers?.length || 0}</span>
        {events && events.length > 0 && (
          <>
            <span>{language === 'nl' ? 'Start' : 'Started'}: {formatTime(events[0]?.timestamp)}</span>
            <span>{language === 'nl' ? 'Laatste' : 'Latest'}: {formatTime(events[events.length - 1]?.timestamp)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default Timeline
