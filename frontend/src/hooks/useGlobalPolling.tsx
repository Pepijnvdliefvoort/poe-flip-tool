import { useEffect, useRef } from 'react'
import { Api } from '../api'

/**
 * Global polling service that runs independent of page navigation.
 * 
 * Unified Polling Strategy:
 * - Polls backend at configured interval (CACHE_CHECK_INTERVAL_SECONDS from backend .env, default 30s)
 * - Backend returns only EXPIRED cache entries
 * - Refreshes up to 2 expired pairs per check to avoid rate limiting
 * - Pairs refresh independently based on their individual expiry times
 * - Portfolio snapshots taken at the same interval (backend handles 15-minute snapshots automatically)
 */
export function useGlobalPolling(isAuthenticated: boolean) {
  const cacheCheckTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(false)
  const checkIntervalRef = useRef<number>(30000) // Default 30s, will be updated from backend

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timers when not authenticated
      if (cacheCheckTimerRef.current !== null) {
        clearInterval(cacheCheckTimerRef.current)
        cacheCheckTimerRef.current = null
      }
      isMountedRef.current = false
      return
    }

    // Prevent double initialization
    if (isMountedRef.current) return
    isMountedRef.current = true

    console.log('[GlobalPolling] Starting polling timers')

    // Cache expiry check - checks for expired pairs and refreshes them
    const checkExpiredCache = async () => {
      try {
        console.log('[GlobalPolling] Checking for expired cache entries...')
        const response = await Api.cacheExpiring()
        
        // Update check interval from backend
        if (response.check_interval_seconds) {
          const newInterval = response.check_interval_seconds * 1000
          if (newInterval !== checkIntervalRef.current) {
            console.log(`[GlobalPolling] Updating check interval to ${response.check_interval_seconds}s`)
            checkIntervalRef.current = newInterval
            // Restart timer with new interval
            if (cacheCheckTimerRef.current !== null) {
              clearInterval(cacheCheckTimerRef.current)
              cacheCheckTimerRef.current = window.setInterval(checkExpiredCache, newInterval)
            }
          }
        }
        
        if (response.count > 0) {
          // Limit to 2 pairs per check to avoid rate limiting
          const pairsToRefresh = response.pairs.slice(0, 2)
          const remaining = response.count - pairsToRefresh.length
          
          console.log(`[GlobalPolling] Found ${response.count} expired pairs, refreshing ${pairsToRefresh.length}${remaining > 0 ? ` (${remaining} will be refreshed next cycle)` : ''}:`, 
            pairsToRefresh.map(p => `${p.have}->${p.want}`))
          
          // Refresh each pair with a delay between each to spread load
          for (const pair of pairsToRefresh) {
            try {
              await Api.refreshOne(pair.index, 5)
              console.log(`[GlobalPolling] Refreshed expired pair ${pair.index}: ${pair.have}->${pair.want}`)
              // 2 second delay between refreshes to respect rate limits
              await new Promise(resolve => setTimeout(resolve, 2000))
            } catch (error) {
              console.error(`[GlobalPolling] Failed to refresh pair ${pair.index}:`, error)
            }
          }
        } else {
          console.log('[GlobalPolling] No expired pairs found')
        }
      } catch (error) {
        console.error('[GlobalPolling] Cache check failed:', error)
      }
    }

    // Start cache check timer - backend handles portfolio snapshots automatically
    cacheCheckTimerRef.current = window.setInterval(checkExpiredCache, checkIntervalRef.current)

    console.log('[GlobalPolling] Cache check timer initialized')

    // Cleanup on unmount or auth change
    return () => {
      console.log('[GlobalPolling] Cleaning up global polling timer')
      if (cacheCheckTimerRef.current !== null) {
        clearInterval(cacheCheckTimerRef.current)
        cacheCheckTimerRef.current = null
      }
      isMountedRef.current = false
    }
  }, [isAuthenticated])
}
