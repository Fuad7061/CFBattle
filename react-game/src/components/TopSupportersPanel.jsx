import React from 'react';

export default function TopSupportersPanel({ supporters }) {
  const TOTAL_ROWS = 3;
  const placeholders = Math.max(0, TOTAL_ROWS - (supporters?.length || 0));

  return (
    <div className="flex-none px-3.5 pt-1.5 pb-2 bg-bg-deep/60 border border-accent-gold/30 rounded-md">
      <div className="text-[10px] tracking-[1.3px] uppercase text-[#6ca5ff] text-center mb-1">💎 TOP SUPPORTERS 💎</div>
      <div className="qp-rows">
        {(supporters || []).length === 0 && (
          <div className="h-[17px] text-center text-[10px] text-text-soft mt-0.5 italic text-white/30">
            No supporters yet
          </div>
        )}
        {(supporters || []).map((entry, idx) => (
          <div key={entry.name} className="h-[17px] flex items-center justify-between text-[10px] text-text-soft mt-0.5">
            <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="flex-none w-4 text-text-soft/50">#{idx + 1}</span>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#6ca5ff] font-bold">{entry.name}</span>
            </div>
            <span className="flex-none text-accent-gold text-[9px] tracking-wide ml-2">{entry.weight} PTS</span>
          </div>
        ))}
        {Array.from({ length: placeholders - (supporters?.length === 0 ? 1 : 0) }).map((_, i) => (
          <div key={`ph-${i}`} className="h-[17px]" />
        ))}
      </div>
    </div>
  );
}
