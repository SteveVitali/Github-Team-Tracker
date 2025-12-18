import { useState, useEffect } from 'react'
import { api } from '../api'
import './RequestCounter.css'

export function RequestCounter() {
  const [stats, setStats] = useState({ active: 0, queued: 0, total: 0 })

  useEffect(() => {
    // Subscribe to stats changes
    const unsubscribe = api.onStatsChange((newStats) => {
      setStats(newStats)
    })

    // Cleanup subscription on unmount
    return unsubscribe
  }, [])

  // Always show the counter with queued count
  return (
    <div className="request-counter">
      <span className="counter-icon">🔄</span>
      <span className="counter-stats">
        <span className="counter-queued">{stats.queued} queued</span>
        {stats.active > 0 && (
          <>
            <span className="counter-separator">, </span>
            <span className="counter-active">{stats.active} active</span>
          </>
        )}
      </span>
    </div>
  )
}
