import React from 'react';
import MiniFlag from './MiniFlag.jsx';

// Vertical-parity "TOP 5 FINALISTS" leaderboard. Shown once the qualifier
// narrows to five or fewer surviving flags, mirroring the vertical HUD.
export default function Top5Tracker({ rows, engineRef }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="flex-none px-3.5 pt-1.5 pb-2 bg-bg-deep/70 border border-accent-gold/60 rounded-md shadow-[0_0_18px_rgba(233,188,115,0.25)]">
      <div className="text-[10px] tracking-[1.2px] uppercase text-accent-gold text-center mb-1">
        ⚡ TOP {rows.length} FINALISTS — WHO WILL WIN? ⚡
      </div>
      <div>
        {rows.map((entry, i) => (
          <div key={entry.code} className="h-[20px] flex items-center gap-1.5 text-[11px] text-text-soft mt-0.5">
            <span className="flex-none w-5 text-accent-gold font-black">#{i + 1}</span>
            <MiniFlag code={entry.code} engineRef={engineRef} width={22} height={14} />
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{entry.name}</span>
            <span className="flex-none text-[#5fd68a] text-[9px] tracking-wide">🟢 ALIVE</span>
          </div>
        ))}
      </div>
    </div>
  );
}
