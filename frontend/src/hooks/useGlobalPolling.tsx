import { useEffect, useRef } from 'react'
import { Api } from '../api'

// Portfolio snapshot interval from environment (in milliseconds)
const PORTFOLIO_SNAPSHOT_INTERVAL = parseInt(import.meta.env.VITE_PORTFOLIO_SNAPSHOT_INTERVAL || '900000') // 15 minutes

/**
 * Global polling service that runs independent of page navigation.
 * 
 * Cache Refresh Strategy:
 * - Polls backend at configured interval (CACHE_CHECK_INTERVAL_SECONDS from backend .env)
 * - Backend returns only EXPIRED cache entries
 * - Refreshes up to 2 expired pairs per check to avoid rate limiting
 * - Pairs refresh independently based on their individual expiry times
 * 
 * Portfolio Snapshots:
 * - Takes snapshots at configured interval (VITE_PORTFOLIO_SNAPSHOT_INTERVAL)
 */
export function useGlobalPolling(isAuthenticated: boolean) {
  const cacheCheckTimerRef = useRef<number | null>(null)
  const portfolioTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(false)
  const checkIntervalRef = useRef<number>(120000) // Default 2 minutes, will be updated from backend

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timers when not authenticated
      if (cacheCheckTimerRef.current !== null) {
        clearInterval(cacheCheckTimerRef.current)
        cacheCheckTimerRef.current = null
      }
      if (portfolioTimerRef.current !== null) {
        clearInterval(portfolioTimerRef.current)
        portfolioTimerRef.current = null
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

    // Portfolio snapshot timer - every configured interval
    const takePortfolioSnapshot = async () => {
      try {
        console.log('[GlobalPolling] Taking portfolio snapshot...')
        const snapshot = await Api.portfolioSnapshot()
        console.log(
          `[GlobalPolling] Portfolio snapshot taken: ${snapshot.total_divines.toFixed(3)} Divine Orbs @ ${new Date(snapshot.timestamp).toLocaleTimeString()}`
        )
      } catch (error) {
        console.error('[GlobalPolling] Failed to take portfolio snapshot:', error)
      }
    }

    // Start timers - use backend's check interval for cache checks
    cacheCheckTimerRef.current = window.setInterval(checkExpiredCache, checkIntervalRef.current)
    portfolioTimerRef.current = window.setInterval(takePortfolioSnapshot, PORTFOLIO_SNAPSHOT_INTERVAL)

    console.log('[GlobalPolling] Timers initialized')

    // Cleanup on unmount or auth change
    return () => {
      console.log('[GlobalPolling] Cleaning up global polling timers')
      if (cacheCheckTimerRef.current !== null) {
        clearInterval(cacheCheckTimerRef.current)
        cacheCheckTimerRef.current = null
      }
      if (portfolioTimerRef.current !== null) {
        clearInterval(portfolioTimerRef.current)
        portfolioTimerRef.current = null
      }
      isMountedRef.current = false
    }
  }, [isAuthenticated])
}
