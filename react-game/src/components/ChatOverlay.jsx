import React, { useEffect, useRef } from 'react';

// TV-lower-third-style overlay showing the most recent YouTube live chat
// messages, newest at the bottom, auto-scrolling. Elevated above the bottom
// eliminated bar with a premium frosted-glass aesthetic.
export default function ChatOverlay({ messages, commentVotes = {}, targetVotes = 4, eliminatedList = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="relative w-full md:w-[320px] h-auto md:h-full bg-[#090e1a]/90 backdrop-blur-md border border-amber-500/30 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] flex flex-col overflow-hidden z-30 pointer-events-auto transition-all mx-auto">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 py-1.5 border-b border-amber-500/15 bg-black/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] sm:text-[10px] font-bold tracking-[1.5px] uppercase text-amber-300">Live Chat</span>
        </div>
        <span className="text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-200/80 border border-amber-400/20 font-medium">
          Interactive
        </span>
      </div>

      {/* Message List */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-amber-500/20 scrollbar-track-transparent"
      >
        {messages.length === 0 && (
          <div className="text-[10px] text-amber-100/30 italic py-2 px-1 text-center">
            Waiting for live comments & votes…
          </div>
        )}
        {messages.map((m, index) => {
          const isSuper = Boolean(m.superChat);
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
                <span className={isSuper ? 'text-pink-300 font-bold' : 'text-amber-300 font-bold'}>
                  {m.author}:
                </span>
                <span className="text-gray-200/90 break-words">{m.text}</span>
              </div>
              {m.vote && (() => {
                const upperCode = (m.vote.code || '').toUpperCase();
                const isElim = eliminatedList.some((e) => (e.code || '').toUpperCase() === upperCode);
                const votes = commentVotes[upperCode] || 0;
                const remaining = Math.max(0, targetVotes - votes);

                if (isElim) {
                  return (
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.5)] border border-amber-300">
                        <span>⚡ REVIVE:</span>
                        <span>{m.vote.countryName}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 bg-black/80 text-amber-300 border border-amber-500/40 text-[8px] font-extrabold px-1.5 py-0.5 rounded">
                        <span>{votes}/{targetVotes}</span>
                        <span className="text-[7px] text-gray-400 font-medium">({remaining > 0 ? `${remaining} more to revive` : 'REVIVED!'})</span>
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[8px] font-extrabold tracking-wider px-1.5 py-0.5 rounded shadow-[0_2px_6px_rgba(16,185,129,0.3)] border border-emerald-400/30">
                      <span>🛡️ STEER:</span>
                      <span>{m.vote.countryName}</span>
                      <span className="text-emerald-100/90 font-normal">(Steered toward center)</span>
                      {m.vote.weight > 1 && <span className="text-yellow-300">×{m.vote.weight}</span>}
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
