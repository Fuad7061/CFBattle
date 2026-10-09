import React, { useEffect, useRef } from 'react';

function EliminatedFlag({ code, engineRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let attempts = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      engine.drawFlagInto(ctx, code, 0, 0, canvas.width, canvas.height);
      attempts++;
      if (attempts < 30) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => raf && cancelAnimationFrame(raf);
  }, [code, engineRef]);
  return <canvas ref={canvasRef} width={16} height={11} className="rounded-[2px]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />;
}

export default function EliminatedBar({ eliminatedList, engineRef, commentVotes = {}, targetVotes = 4 }) {
  const activeRevivals = Object.entries(commentVotes)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => {
      const entry = eliminatedList.find((e) => (e.code || '').toUpperCase() === code);
      return {
        code,
        name: entry?.name || code,
        count,
        remaining: Math.max(0, targetVotes - count),
      };
    });

  return (
    <div className="relative flex-none w-full h-[90px] overflow-hidden box-border bg-black/[0.65] border-t border-accent-gold/20 z-[15]">
      {/* Left Label & Hint */}
      <div className="absolute top-0 left-0 bottom-0 w-[72px] pt-[6px] px-1.5 flex flex-col justify-between border-r border-accent-gold/20 bg-black/60 box-border text-center z-10">
        <div>
          <div className="text-accent-crimson text-[8px] font-black tracking-wider uppercase">Eliminated</div>
          <div className="text-[7.5px] text-amber-300 font-bold tracking-tight mt-0.5">
            {activeRevivals.length > 0 ? `⚡ ${activeRevivals.length} in race` : `Revive: ${targetVotes}`}
          </div>
        </div>
        <div className="text-[6.5px] text-gray-400/80 leading-tight pb-1 font-medium">
          Comment flag to revive
        </div>
      </div>

      {/* Absolute-positioned scroll container */}
      <div 
        className="absolute top-0 left-[74px] right-0 bottom-0 overflow-y-auto box-border px-2 py-1.5" 
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {/* Active Revive Tracker Header */}
        {activeRevivals.length > 0 && (
          <div className="w-full flex items-center gap-1.5 pb-1 mb-1 border-b border-amber-500/25 overflow-x-auto flex-nowrap scrollbar-none">
            <span className="text-[7.5px] font-black uppercase text-amber-300 flex-none tracking-wider flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              REVIVE RACE:
            </span>
            {activeRevivals.map((cand) => (
              <div
                key={`race-${cand.code}`}
                className="flex-none flex items-center gap-1 bg-gradient-to-r from-amber-500/25 to-yellow-500/15 border border-amber-400/80 rounded px-1.5 py-0.5 shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse"
              >
                <EliminatedFlag code={cand.code} engineRef={engineRef} />
                <span className="text-[8px] font-extrabold text-amber-200">{cand.name}</span>
                <span className="bg-amber-400 text-black text-[7.5px] font-black px-1 rounded-sm leading-tight">
                  {cand.count}/{targetVotes}
                </span>
                <span className="text-[7px] text-amber-200/90 font-medium">({cand.remaining} more needed)</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1 content-start">
          {eliminatedList.map((f, i) => {
            const upperCode = (f.code || '').toUpperCase();
            const votes = commentVotes[upperCode] || 0;
            const hasVotes = votes > 0;
            const remaining = Math.max(0, targetVotes - votes);

            return (
              <div
                key={`${f.code}-${i}`}
                title={hasVotes ? `${f.name || f.code}: ${votes}/${targetVotes} votes (${remaining} more to revive!)` : (f.name || f.code)}
                className={
                  'eliminated-item relative flex flex-col items-center gap-[1px] transition-all ' +
                  (hasVotes
                    ? 'p-0.5 rounded bg-amber-500/20 border border-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse scale-105'
                    : '')
                }
              >
                <div className="relative">
                  <EliminatedFlag code={f.code} engineRef={engineRef} />
                  {hasVotes && (
                    <span className="absolute -top-1 -right-1 bg-amber-400 text-black font-black text-[6px] px-1 rounded-full shadow-[0_0_4px_#f59e0b] leading-tight">
                      {votes}/{targetVotes}
                    </span>
                  )}
                </div>
                <div
                  className={
                    'text-[6px] tracking-[0.3px] font-mono ' +
                    (hasVotes ? 'text-amber-300 font-bold' : 'text-text-soft/45')
                  }
                >
                  {f.code}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
