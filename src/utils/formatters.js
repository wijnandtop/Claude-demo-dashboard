/**
 * Format a duration in milliseconds to a human-readable string
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted duration string (e.g., "30s", "1m 30s", "1h 0m")
 */
export function formatDuration(durationMs) {
  if (durationMs == null || durationMs < 0) return null

  const diffSec = Math.floor(durationMs / 1000)

  // Less than 60 seconds: show just seconds
  if (diffSec < 60) {
    return `${diffSec}s`
  }

  const diffMin = Math.floor(diffSec / 60)

  // Less than 60 minutes: show minutes and seconds
  if (diffMin < 60) {
    const remainingSec = diffSec % 60
    return `${diffMin}m ${remainingSec}s`
  }

  // 60+ minutes: show hours and minutes
  const diffHours = Math.floor(diffMin / 60)
  const remainingMin = diffMin % 60
  return `${diffHours}h ${remainingMin}m`
}

/**
 * Get the zoom window duration in milliseconds based on zoom level
 * @param {string} zoom - Zoom level ('10min', 'hour', 'day', 'all')
 * @returns {number} Duration in milliseconds (or Infinity for 'all')
 */
export function getZoomWindowMs(zoom) {
  switch (zoom) {
    case '10min':
      return 10 * 60 * 1000
    case 'hour':
      return 60 * 60 * 1000
    case 'day':
      return 24 * 60 * 60 * 1000
    case 'all':
    default:
      return Infinity
  }
}

/**
 * Filter markers based on zoom level and time window
 * @param {Array} markers - Array of marker objects with timestamp property
 * @param {string} zoomLevel - Zoom level ('10min', 'hour', 'day', 'all')
 * @returns {Array} Filtered array of markers within the zoom window
 */
export function getFilteredMarkers(markers, zoomLevel) {
  if (!markers || markers.length === 0) return []

  // 'all' zoom level shows all markers
  if (zoomLevel === 'all') return markers

  const zoomWindowMs = getZoomWindowMs(zoomLevel)

  // Use the latest marker as the reference point instead of Date.now()
  // This ensures filtering works for historical sessions
  const latestMarkerTime = Math.max(...markers.map(m => new Date(m.timestamp).getTime()))

  return markers.filter(marker => {
    const timestamp = new Date(marker.timestamp).getTime()
    return (latestMarkerTime - timestamp) <= zoomWindowMs
  })
}
