

import { extractErrorMessage } from '../utils/error';
import { useEffect, useRef, useState } from 'react';
import { Api } from '../api';
import type { CacheSummary, CacheStatus, HistoryResponse, ConfigData, DatabaseStats } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useDashboardAutoRefresh } from './dashboard/useDashboardAutoRefresh';
import './SystemDashboard.css';
import { DatabaseStatsSection } from './systemDashboard/DatabaseStatsSection';
import { CacheSummarySection } from './systemDashboard/CacheSummarySection';
import { CacheEntriesTable } from './systemDashboard/CacheEntriesTable';
import { HistoryMiniChart } from './dashboard/HistoryMiniChart';
import { HistoryViewer } from './systemDashboard/HistoryViewer';

export function SystemDashboard({ selectedLeague }: { selectedLeague?: string }) {
  const { isAuthenticated } = useAuth();
  const [cacheSummary, setCacheSummary] = useState<CacheSummary | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ have: string; want: string } | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const inFlightRef = useRef(false);
  const REFRESH_INTERVAL_MS = 1000;

  // Fetch base data
  useEffect(() => {
    if (!isAuthenticated) return;
    const load = async () => {
      try {
        const leagueToLoad = selectedLeague || 'Standard';
        const [cfg, summary, status, db] = await Promise.all([
          Api.getConfig(leagueToLoad),
          Api.cacheSummary(),
          Api.cacheStatus(),
          Api.databaseStats()
        ]);
        setConfig(cfg);
        setCacheSummary(summary);
        setCacheStatus(status);
        setDbStats(db);
        if (cfg.trades.length > 0) {
          setSelectedPair({ have: cfg.trades[0].pay, want: cfg.trades[0].get });
        } else {
          setSelectedPair(null);
        }
      } catch (e: any) {
        setError(extractErrorMessage(e, 'Failed to load data'));
      }
    };
    load();
  }, [isAuthenticated]);

  // Auto refresh summary/status
  useDashboardAutoRefresh(isAuthenticated, autoRefresh, setCacheSummary, setCacheStatus, setDbStats);

  // Fetch history when selection changes
  useEffect(() => {
    if (!isAuthenticated) return;
    const run = async () => {
      if (!selectedPair) return;
      setLoadingHistory(true);
      setError(null);
      try {
        const h = await Api.history(selectedPair.have, selectedPair.want, 120);
        setHistory(h);
      } catch (e: any) {
        setError(extractErrorMessage(e, 'Failed to load history'));
      } finally {
        setLoadingHistory(false);
      }
    };
    run();
  }, [selectedPair, isAuthenticated]);

  const pairs = config?.trades || [];

  return (
    <div className="system-dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">System Dashboard</h2>
        <label className="auto-refresh-toggle">
          <div className="auto-refresh-switch">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              aria-label="Toggle auto refresh"
              className="auto-refresh-checkbox"
            />
            <span
              aria-hidden="true"
              className={`auto-refresh-bg ${autoRefresh ? 'on' : 'off'}`}
            />
            <span
              aria-hidden="true"
              className="auto-refresh-knob"
              style={{ left: autoRefresh ? 22 : 2 }}
            />
          </div>
          <span className="auto-refresh-label">
            <span className="auto-refresh-label-main">Auto Refresh</span>
            <span className="auto-refresh-label-sub">Interval: 1s</span>
          </span>
        </label>
      </div>
      {error && <div className="dashboard-error">{error}</div>}


      {/* Database Stats */}
      <DatabaseStatsSection dbStats={dbStats} />


      {/* Cache Summary */}
      <CacheSummarySection cacheSummary={cacheSummary} />


      {/* Cache Entries Table */}
      <CacheEntriesTable cacheSummary={cacheSummary} setSelectedPair={setSelectedPair} />

      {/* History Viewer */}
      <HistoryViewer
        history={history}
        selectedPair={selectedPair}
        loading={loadingHistory}
        pairs={pairs}
        setSelectedPair={setSelectedPair}
      />
    </div>
  )
}

