import React from 'react';
import { Api } from '../api';

export function ForumThreadLink({ threadId }: { threadId?: string | null }) {
  if (!threadId) return null;
  const url = `https://www.pathofexile.com/forum/view-thread/${threadId}`;
  const length = 50;
  const display = url.length > length ? url.slice(0, length - 3) + '...' : url;
  return (
    <div style={{ marginBottom: 16 }}>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', wordBreak: 'break-all', color: 'var(--accent)' }}>{display}</a>
    </div>
  );
}
