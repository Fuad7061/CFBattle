import React, { useEffect, useRef } from 'react';

// Vertical-parity revive popup: a compact floating stack of per-country revive
// counters (flag + "2/4 REVIVE"). Each country keeps one entry that pops when a
// new vote lands, and only the 3 most recently active countries stay visible.
export default function ReviveTrackers({ items = [], target = 4 }) {
  const prevVotes = useRef({});

  useEffect(() => {
    const next = {};
    items.forEach((it) => {
      next[it.code] = it.votes;
    });
    prevVotes.current = next;
  }, [items]);

  if (!items.length) return null;

  return (
    <div className="revive-trackers" role="status" aria-live="polite">
      {items.map((it) => (
        <div
          key={`${it.code}-${it.votes}`}
          className="revive-progress-item pop"
          data-code={it.code}
        >
          <img src={`/flags/${(it.code || '').toLowerCase()}.svg`} alt="" />
          <span className="revive-text">
            {it.votes}/{target} REVIVE
          </span>
          <span className="revive-name">{(it.name || it.code || '').toUpperCase()}</span>
          <div className="revive-meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (it.votes / Math.max(1, target)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
