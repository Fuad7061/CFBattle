import React, { useEffect, useRef } from 'react';

// Small canvas that renders a country flag via the engine's sprite pipeline.
// Sprites load asynchronously, so we keep re-drawing for a few frames until
// the real flag is ready instead of showing the placeholder forever.
export default function MiniFlag({ code, engineRef, width = 20, height = 13, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf;
    let attempts = 0;
    const draw = () => {
      const engine = engineRef.current;
      if (engine) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        engine.drawFlagInto(ctx, code, 0, 0, canvas.width, canvas.height);
        attempts++;
      }
      if (attempts < 40) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => raf && cancelAnimationFrame(raf);
  }, [code, engineRef]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={'flex-none rounded-[1px] block ' + className}
    />
  );
}
