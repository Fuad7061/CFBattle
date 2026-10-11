import React from 'react';

/**
 * TopSupportersPanel — Broadcast-grade live viewer recognition & shoutouts.
 * Showcases top chat supporters with podium medals, dynamic avatar bubbles,
 * country flag chips, point counters, and an instant "LATEST SHOUTOUT" spotlight
 * to maximize stream interactivity and comment velocity.
 */
export default function TopSupportersPanel({ supporters = [], latestShoutout = null }) {
  const topList = (supporters || []).slice(0, 3);
  const now = Date.now();

  const getRankBadge = (idx) => {
    if (idx === 0) return { label: '1', color: 'text-amber-950', bg: 'bg-gradient-to-br from-amber-200 to-amber-500 shadow-[0_1px_4px_rgba(245,158,11,0.5)]' };
    if (idx === 1) return { label: '2', color: 'text-slate-950', bg: 'bg-gradient-to-br from-slate-100 to-slate-400 shadow-[0_1px_4px_rgba(148,163,184,0.5)]' };
    if (idx === 2) return { label: '3', color: 'text-amber-950', bg: 'bg-gradient-to-br from-orange-200 to-amber-600 shadow-[0_1px_4px_rgba(217,119,6,0.5)]' };
    return { label: `#${idx + 1}`, color: 'text-white/80', bg: 'bg-white/10' };
  };

  const getAvatarGradient = (name = '', fallbackColor) => {
    if (fallbackColor) return fallbackColor;
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash) % 360;
    const h2 = (h1 + 45) % 360;
    return `linear-gradient(135deg, hsl(${h1}, 80%, 48%), hsl(${h2}, 85%, 60%))`;
  };

  return (
    <div className="flex-none px-2.5 pt-2 pb-2.5 bg-[#0e1422]/90 border border-amber-400/35 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all duration-300">
      {/* Header with Live Indicator */}
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-white/10">
        <div className="flex items-center gap-1.5 text-[9.5px] tracking-[1.4px] font-black uppercase text-amber-300 drop-shadow-[0_1px_4px_rgba(245,158,11,0.4)]">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="#fbbf24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>
          <span>TOP SUPPORTERS</span>
        </div>
        <div className="flex items-center gap-1 text-[8.5px] font-mono text-cyan-300/90 font-bold bg-cyan-950/60 border border-cyan-400/30 px-1.5 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>SHOUTOUT</span>
        </div>
      </div>

      {/* Leaderboard or Empty CTA */}
      {topList.length === 0 ? (
        <div className="py-2.5 px-2 text-center rounded-md bg-gradient-to-r from-amber-500/10 via-cyan-500/10 to-amber-500/10 border border-dashed border-amber-400/30 my-1">
          <div className="text-[10px] text-amber-300 font-black tracking-wide mb-0.5 flex items-center justify-center gap-1">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="#fcd34d"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            <span>GET YOUR SHOUTOUT!</span>
          </div>
          <div className="text-[8.5px] text-white/70 leading-snug font-medium">
            Comment your country in chat to appear live on stream!
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {topList.map((entry, idx) => {
            const badge = getRankBadge(idx);
            const isLive = entry.lastActive && (now - entry.lastActive < 35000);
            const pts = entry.points ?? entry.weight ?? 1;
            const initial = (entry.initial || entry.name?.charAt(0) || '★').toUpperCase();
            const bgGrad = getAvatarGradient(entry.name, entry.avatarColor);

            return (
              <div
                key={entry.name || idx}
                className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-white/[0.04] border ${
                  idx === 0 ? 'border-amber-400/40 bg-amber-500/[0.06]' : 'border-white/[0.08]'
                } transition-transform hover:scale-[1.01]`}
              >
                {/* Left: Rank & Avatar */}
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black shrink-0 ${badge.bg} ${badge.color}`}>
                    {badge.label}
                  </span>

                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] font-black text-white shrink-0 shadow-sm border border-white/20"
                    style={{ background: bgGrad }}
                    title={entry.name}
                  >
                    {initial}
                  </div>

                  <span className="text-[9.5px] font-bold text-white truncate flex-1 min-w-0 tracking-[-0.2px]" title={entry.name}>
                    {entry.name}
                  </span>

                  {entry.countryCode && (
                    <img
                      src={`/flags/${entry.countryCode.toLowerCase()}.svg`}
                      alt={entry.countryCode}
                      className="w-3.5 h-2.5 rounded-sm object-cover border border-white/20 shrink-0"
                      title={entry.countryName || entry.countryCode}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}

                  {isLive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" title="Active now" />
                  )}
                </div>

                {/* Right: Points Badge */}
                <div className="shrink-0 text-right">
                  <span className="text-[8.5px] font-black text-amber-300 bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.5 rounded tracking-tight inline-flex items-center gap-1">
                    <svg viewBox="0 0 24 24" width="8" height="8" fill="#fcd34d"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                    <span>{pts} PTS</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LATEST SHOUTOUT SPOTLIGHT BAR: Rewards every single commenter instantly */}
      {latestShoutout && (
        <div className="mt-2 pt-1.5 border-t border-white/10">
          <div className="flex items-center justify-between text-[8px] font-extrabold tracking-wider text-cyan-400 uppercase mb-1">
            <span className="flex items-center gap-1">
              <svg viewBox="0 0 24 24" width="9" height="9" fill="#22d3ee"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
              <span>LATEST SHOUTOUT</span>
            </span>
            <span className="text-white/40 text-[7.5px] font-mono">JUST NOW</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gradient-to-r from-cyan-950/60 to-blue-950/40 border border-cyan-400/40 shadow-inner">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] font-black text-white shrink-0 shadow-sm border border-white/20"
              style={{ background: getAvatarGradient(latestShoutout.author, latestShoutout.avatarColor) }}
            >
              {(latestShoutout.initial || latestShoutout.author?.charAt(0) || '★').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="flex items-center gap-1">
                <span className="font-extrabold text-white text-[10px] truncate">
                  {latestShoutout.author}
                </span>
                {latestShoutout.countryCode && (
                  <img
                    src={`/flags/${latestShoutout.countryCode.toLowerCase()}.svg`}
                    alt=""
                    className="w-3.5 h-2.5 rounded-sm object-cover border border-white/20 shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
              <div className="text-cyan-300 text-[8px] font-semibold truncate mt-0.5">
                {latestShoutout.action || 'Cheered in chat!'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
