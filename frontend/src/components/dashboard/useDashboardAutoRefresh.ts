import { useEffect, useRef } from 'react';
import { Api } from '../../api';

export function useDashboardAutoRefresh(isAuthenticated: boolean, autoRefresh: boolean, setCacheSummary: any, setCacheStatus: any, setDbStats: any) {
  const inFlightRef = useRef(false);
  const REFRESH_INTERVAL_MS = 1000;

  useEffect(() => {
    if (!autoRefresh || !isAuthenticated) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (inFlightRef.current) {
        setTimeout(tick, REFRESH_INTERVAL_MS);
        return;
      }
      inFlightRef.current = true;
      try {
        const [summary, status, db] = await Promise.all([
          Api.cacheSummary(),
          Api.cacheStatus(),
          Api.databaseStats()
        ]);
        if (!cancelled) {
          setCacheSummary(summary);
          setCacheStatus(status);
          setDbStats(db);
        }
      } catch {
        // swallow errors to keep loop running
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setTimeout(tick, REFRESH_INTERVAL_MS);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [autoRefresh, isAuthenticated, setCacheSummary, setCacheStatus, setDbStats]);
}
