import React from 'react';
import { Api } from '../api';

export function ForumThreadLink() {
  const [threadId, setThreadId] = React.useState<string | null>(null);
  React.useEffect(() => {
    Api.getForumThreadId().then(id => setThreadId(id || null));
  }, []);
  if (!threadId) return null;
  const url = `https://www.pathofexile.com/forum/view-thread/${threadId}`;
  const length = 50;
  const display = url.length > length ? url.slice(0, length - 3) + '...' : url;
  return (
    <div style={{ marginBottom: 16 }}>
  <span className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Forum Thread</span>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', wordBreak: 'break-all', color: 'var(--accent)' }}>{display}</a>
    </div>
  );
}
