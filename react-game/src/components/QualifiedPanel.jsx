import React from 'react';
import MiniFlag from './MiniFlag.jsx';

export default function QualifiedPanel({ title, rows, engineRef }) {
  const TOTAL_ROWS = 3;
  const placeholders = Math.max(0, TOTAL_ROWS - (rows?.length || 0));

  const cleanTitle = (title || 'CAMPAIGN WINNERS').replace(/🏆\s*/g, '');

  return (
    <div className="flex-none px-3.5 pt-1.5 pb-2 bg-bg-deep/60 border border-accent-gold/30 rounded-md">
      <div className="text-[10px] tracking-[1.3px] uppercase text-accent-gold text-center mb-1 flex items-center justify-center gap-1.5">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="#f59e0b" className="flex-none">
          <path d="M19 4h-3V2H8v2H5c-1.1 0-2 .9-2 2v2c0 2.5 1.9 4.6 4.3 4.9.7 1.4 1.9 2.5 3.4 2.9V18H8v2h8v-2h-2.7v-2.2c1.5-.4 2.7-1.5 3.4-2.9 2.4-.3 4.3-2.4 4.3-4.9V6c0-1.1-.9-2-2-2zM5 8V6h3v4.8C6.3 10.4 5 9.4 5 8zm14 0c0 1.4-1.3 2.4-3 2.8V6h3v2z" />
        </svg>
        <span>{cleanTitle}</span>
      </div>
      <div className="qp-rows">
        {Array.from({ length: placeholders }).map((_, i) => (
          <div key={`ph-${i}`} className="h-[17px]" />
        ))}
        {(rows || []).map((entry) => (
          <div key={entry.idx} className="h-[17px] flex items-center gap-1.5 text-[10px] text-text-soft mt-0.5">
            <span className="flex-none w-6 text-text-soft/50">#{entry.idx}</span>
            <MiniFlag code={entry.code} engineRef={engineRef} />
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
            <span className="flex-none text-[#5fd68a] text-[9px] tracking-wide">✓ Qualified</span>
          </div>
        ))}
      </div>
    </div>
  );
}
