import React from 'react';

export default function Header({ flagCount, onNewRound, onShrinkArena, onToggleSound, soundEnabled }) {
  return (
    <div className="relative flex-none text-center px-0 pt-2.5 pb-1">
      {/* Controls removed - now accessible via Dashboard UI via /api/control */}

      <div className="absolute top-2.5 right-3.5 bg-accent-crimson text-white text-[9px] font-bold tracking-wide px-2 py-[3px] rounded flex items-center gap-1">
        <span className="live-dot w-1.5 h-1.5 rounded-full bg-white inline-block" />
        LIVE
      </div>

      <h1
        className="m-0 text-[26px] tracking-wide font-bold uppercase text-text-soft"
        style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
      >
        <span>{flagCount}</span> FLAGS <span className="text-accent-gold">BATTLE</span>
      </h1>
      <p className="m-0 mt-0.5 text-[9px] tracking-[3px] uppercase text-text-soft/60">One World ★ One Champion</p>
    </div>
  );
}
