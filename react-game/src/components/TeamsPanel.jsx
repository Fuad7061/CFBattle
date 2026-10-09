import React from 'react';

// Team Up Mode leaderboard (vertical parity). Renders nothing in solo mode.
export default function TeamsPanel({ teams }) {
  if (!teams || teams.length === 0) return null;

  const ranked = [...teams].sort((a, b) => b.alive - a.alive || a.name.localeCompare(b.name));

  return (
    <div className="flex-none px-3.5 pt-1.5 pb-2 bg-bg-deep/70 border border-accent-gold/30 rounded-md">
      <div className="text-[10px] tracking-[1.3px] uppercase text-accent-gold text-center mb-1">🛡 TEAM UP MODE</div>
      <div>
        {ranked.map((t, i) => (
          <div
            key={t.id}
            className={'h-[18px] flex items-center gap-1.5 text-[10px] mt-0.5 ' + (t.alive === 0 ? 'opacity-40' : 'text-text-soft')}
          >
            <span className="flex-none w-4 text-text-soft/50">#{i + 1}</span>
            <span className="flex-none w-2 h-2 rounded-full" style={{ background: t.color }} />
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
              {t.emoji ? t.emoji + ' ' : ''}{t.name}
            </span>
            <span className="flex-none text-[9px] tracking-wide font-bold" style={{ color: t.color }}>
              {t.alive}<span className="text-text-soft/40 font-normal">/{t.total}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
