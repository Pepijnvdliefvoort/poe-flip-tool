import React from 'react';
import { Button } from '../ui/Button';

interface SnapshotStatusBarProps {
  snapshot: any;
  snapshotAge: string;
  nextCountdown: string;
  loading: boolean;
  takeSnapshot: (source: string) => void;
}

const SnapshotStatusBar: React.FC<SnapshotStatusBarProps> = ({ snapshot, snapshotAge, nextCountdown, loading, takeSnapshot }) => (
  <div style={{ display:'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, maxWidth: 800, paddingRight:'13px'}}>
    {snapshot && (
      <div style={{ display:'flex', alignItems:'center', gap:8, background:'linear-gradient(90deg, rgba(30,41,59,0.7), rgba(15,23,42,0.7))', border:'1px solid #334155', padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:500, letterSpacing:'.3px', boxShadow:'0 2px 4px rgba(0,0,0,0.4)' }}>
        <span style={{ opacity:0.65 }}>Last Snapshot:</span>
        <span style={{ color:'#38bdf8', fontVariant:'tabular-nums' }}>{new Date(snapshot.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
        <span style={{ opacity:0.6 }}>({snapshotAge})</span>
        <span style={{ opacity:0.35 }}>•</span>
        <span style={{ opacity:0.65 }}>Next:</span>
        <span style={{ color:'#94a3b8', fontVariant:'tabular-nums' }}>{nextCountdown}</span>
      </div>
    )}
    <Button
      onClick={() => takeSnapshot('initial')}
      loading={loading}
      style={{
        padding: '6px 14px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-end',
      }}
      variant="ghost"
    >
      <span style={{ fontSize: 16 }}>↻</span>
      Refresh Now
    </Button>
  </div>
);

export default SnapshotStatusBar;
