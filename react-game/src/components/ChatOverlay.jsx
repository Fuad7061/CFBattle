import React, { useEffect, useRef } from 'react';

// Interaction feed rather than a chat mirror: raw YouTube chat already runs on
// the stream, so this panel only surfaces the moments that change the battle —
// country votes (SAVE / REVIVE), paid powers (freeze, slow, shield, quake,
// boost, nuke, revive) and Super Chats. Newest at the bottom, auto-scrolling.

// Label + palette for each paid power the engine can fire.
const POWER_INFO = {
  freeze: { icon: '❄️', label: 'FREEZE', ring: 'from-sky-500 to-cyan-400', border: 'border-sky-400/45', text: 'text-sky-100' },
  slow: { icon: '🐌', label: 'SLOW-MO', ring: 'from-indigo-500 to-violet-400', border: 'border-indigo-400/45', text: 'text-indigo-100' },
  shield: { icon: '🛡️', label: 'SHIELD', ring: 'from-teal-500 to-emerald-400', border: 'border-teal-400/45', text: 'text-teal-100' },
  quake: { icon: '🌋', label: 'QUAKE', ring: 'from-orange-500 to-amber-400', border: 'border-orange-400/45', text: 'text-orange-100' },
  boost: { icon: '🚀', label: 'BOOST', ring: 'from-fuchsia-500 to-pink-400', border: 'border-fuchsia-400/45', text: 'text-fuchsia-100' },
  nuke: { icon: '☢️', label: 'NUKE', ring: 'from-red-600 to-rose-500', border: 'border-red-500/50', text: 'text-red-100' },
  revive: { icon: '⚡', label: 'REVIVE', ring: 'from-amber-500 to-yellow-400', border: 'border-amber-400/50', text: 'text-amber-100' },
};
const FALLBACK_POWER = { icon: '✨', label: 'POWER', ring: 'from-purple-500 to-fuchsia-400', border: 'border-purple-400/45', text: 'text-purple-100' };

export default function ChatOverlay({ messages, commentVotes = {}, targetVotes = 4, eliminatedList = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const elimCodes = new Set(eliminatedList.map((e) => (e.code || '').toUpperCase()));

  // Collapse repeat votes for the same country into one row carrying a running
  // count, instead of one revive block per chat message. The newest message for
  // a country owns the badge; earlier duplicates render as plain text.
  const rows = [];
  const lastIndexByCode = new Map();
  const seenByCode = new Map();
  messages.forEach((m, index) => {
    const code = (m.vote?.code || '').toUpperCase();
    if (!code) {
      rows.push({ m, index, voteCount: 0, isReviveVote: false });
      return;
    }
    const isReviveVote = elimCodes.has(code);
    const count = (seenByCode.get(code) || 0) + 1;
    seenByCode.set(code, count);
    lastIndexByCode.set(code, rows.length);
    rows.push({ m, index, voteCount: count, isReviveVote, showBadge: true });
  });
  // Only the last row for a country keeps its vote badge.
  lastIndexByCode.forEach((rowIdx, code) => {
    const codeRows = rows.filter((r) => (r.m.vote?.code || '').toUpperCase() === code);
    codeRows.forEach((r, i) => {
      r.showBadge = i === codeRows.length - 1;
    });
  });
  rows.forEach((r) => {
    if (!r.m.vote) return;
    const code = (r.m.vote.code || '').toUpperCase();
    r.voteTotal = seenByCode.get(code) || 1;
    if (r.isReviveVote) r.votes = commentVotes[code] || 0;
  });

  return (
    <div className="relative w-full md:w-[320px] h-auto md:max-h-full bg-[#090e1a]/90 backdrop-blur-md border border-amber-500/30 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] flex flex-col overflow-hidden z-30 pointer-events-auto transition-all mx-auto">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 py-1.5 border-b border-amber-500/15 bg-black/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] sm:text-[10px] font-bold tracking-[1.5px] uppercase text-amber-300">Vote Actions</span>
        </div>
        <span className="text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-200/80 border border-amber-400/20 font-medium">
          Votes · Powers · Super Chats
        </span>
      </div>

      {/* Message List */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-amber-500/20 scrollbar-track-transparent"
      >
        {rows.length === 0 && (
          <div className="text-[10px] text-amber-100/30 italic py-2 px-1 text-center">
            Waiting for votes, powers &amp; Super Chats…
          </div>
        )}
        {rows.map((row) => {
          const { m, index } = row;
          const isSuper = Boolean(m.superChat);
          const author = (m.author || '').trim();
          const text = (m.text || '').trim();
          // Ignore empty/system ticks — never render a bare ": " row.
          if (!author && !text) return null;
          const hiddenOnMobile = index < messages.length - 1 ? 'hidden md:block ' : '';
          return (
            <div
              key={m.id}
              className={
                hiddenOnMobile + 'text-[9px] sm:text-[10px] leading-relaxed animate-[elim-in_0.35s_ease_forwards] opacity-0 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 ' +
                (isSuper
                  ? 'bg-gradient-to-r from-pink-900/30 via-purple-900/25 to-black/40 border border-pink-500/40 shadow-[0_2px_10px_rgba(236,72,153,0.15)]'
                  : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07]')
              }
              style={{ animationFillMode: 'forwards' }}
            >
              {isSuper && (
                <div className="mb-1">
                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[8px] font-black tracking-wide px-1.5 py-0.5 rounded shadow">
                    ★ {m.superChat?.amountDisplayString || 'SUPER CHAT'}
                  </span>
                </div>
              )}
              <div className="flex items-baseline flex-wrap gap-1">
                {author && (
                  <span className={isSuper ? 'text-pink-300 font-bold' : 'text-amber-300 font-bold'}>
                    {author}:
                  </span>
                )}
                {text && <span className="text-gray-200/90 break-words">{text}</span>}
              </div>
              {m.vote && row.showBadge && (() => {
                if (row.isReviveVote) {
                  const votes = row.votes || 0;
                  const remaining = Math.max(0, targetVotes - votes);
                  return (
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.5)] border border-amber-300">
                        <span>⚡ REVIVE:</span>
                        <span>{m.vote.countryName}</span>
                        {row.voteTotal > 1 && (
                          <span className="bg-black/70 text-amber-200 px-1 rounded">×{row.voteTotal}</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 bg-black/80 text-amber-300 border border-amber-500/40 text-[8px] font-extrabold px-1.5 py-0.5 rounded">
                        <span>{votes}/{targetVotes}</span>
                        <span className="text-[7px] text-gray-400 font-medium">
                          ({remaining > 0 ? `${remaining} more to revive` : 'REVIVED!'})
                        </span>
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[8px] font-extrabold tracking-wider px-1.5 py-0.5 rounded shadow-[0_2px_6px_rgba(16,185,129,0.3)] border border-emerald-400/30">
                      <span>↩️ SAVE:</span>
                      <span>{m.vote.countryName}</span>
                      <span className="text-emerald-100/90 font-normal">(Reversed &amp; slowed)</span>
                      {m.vote.weight > 1 && <span className="text-yellow-300">×{m.vote.weight}</span>}
                    </span>
                  </div>
                );
              })()}
              {m.power && (() => {
                const info = POWER_INFO[m.power.power] || FALLBACK_POWER;
                const target = m.power.countryName || (m.power.code ? (m.power.codeName || m.power.code) : 'WHOLE ARENA');
                return (
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={
                        'inline-flex items-center gap-1 bg-gradient-to-r text-black text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded border shadow-[0_0_8px_rgba(255,255,255,0.12)] ' +
                        info.ring + ' ' + info.border
                      }
                    >
                      <span>{info.icon}</span>
                      <span>{info.label}:</span>
                      <span>{target}</span>
                      {m.power.weight > 1 && <span className="bg-black/70 text-white px-1 rounded">×{m.power.weight}</span>}
                    </span>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
