/**
 * Renderer — Custom canvas drawing layer with floating country nameplates for Top 5,
 * dramatic Top 3 suspense spotlight, and ping-pong visual motion effects.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas       = canvas;
    this.ctx          = canvas.getContext('2d');
    this.W            = canvas.width;   // 540
    this.H            = canvas.height;  // 960
    this.FW           = 20;             // flag width
    this.FH           = 13;             // flag height (3:2 ratio)
    this.particles    = [];
    this.fallingFlags = [];             // eliminated flags tumbling away
    this._frame       = 0;

    // Suspense lighting state
    this.suspenseIntensity = 0; // 0 to 1

    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  MAIN RENDER                                                        */
  /* ------------------------------------------------------------------ */

  frame(physics, flags, images) {
    this._frame++;
    const ctx = this.ctx;
    const aliveCount = flags.filter(f => !f.eliminated).length;

    // Smoothly transition suspense intensity based on alive count
    const targetIntensity = aliveCount <= 2 ? 1.0 : (aliveCount === 3 ? 0.8 : (aliveCount <= 5 ? 0.35 : 0.0));
    this.suspenseIntensity += (targetIntensity - this.suspenseIntensity) * 0.05;

    this._drawBg(ctx, this.suspenseIntensity);
    this._drawArena(ctx, physics, this.suspenseIntensity);
    this._drawFlags(ctx, flags, images, aliveCount);
    this._drawFallingFlags(ctx);
    this._drawParticles(ctx);
    this._drawBorderGlow(ctx, this.suspenseIntensity);
  }

  /* ------------------------------------------------------------------ */
  /*  BACKGROUND & SUSPENSE SPOTLIGHT                                    */
  /* ------------------------------------------------------------------ */

  _drawBg(ctx, suspense) {
    // Deep dark background
    ctx.fillStyle = '#05050c';
    ctx.fillRect(0, 0, this.W, this.H);

    // Repeated angled background watermark
    if (this.watermarkText) {
      ctx.save();
      
      let baseSize = this.watermarkSize ?? 36;
      ctx.font = `bold ${baseSize}px "Arial Black", Impact, sans-serif`;
      
      // Ensure text fits within canvas width
      const textWidth = ctx.measureText(this.watermarkText).width;
      let fontSize = baseSize;
      if (textWidth > this.W * 0.95) {
        fontSize = Math.floor(baseSize * (this.W * 0.95) / textWidth);
        ctx.font = `bold ${fontSize}px "Arial Black", Impact, sans-serif`;
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const opacity = this.watermarkOpacity ?? 0.15;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      
      const count = this.watermarkCount ?? 3;
      const angle = (this.watermarkAngle ?? 0) * (Math.PI / 180); // convert deg to rad
      
      const step = this.H / count;
      for (let i = 0; i < count; i++) {
        const y = step / 2 + i * step;
        ctx.save();
        ctx.translate(this.W / 2, y);
        ctx.rotate(angle);
        ctx.fillText(this.watermarkText, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    const cx = this.W / 2;
    const cy = 445;

    // Radial arena glow (shifts to dramatic amber/crimson spotlight during Top 3)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 380);
    if (suspense > 0.5) {
      // Dramatic high-contrast suspense spotlight
      const p = 0.5 + 0.5 * Math.sin(this._frame * 0.1);
      g.addColorStop(0,    `rgba(100, 10, 10, ${0.55 + 0.15 * p})`);
      g.addColorStop(0.40, `rgba(45, 5, 5, ${0.35 + 0.1 * p})`);
      g.addColorStop(0.75, 'rgba(10, 0, 2, 0.7)');
      g.addColorStop(1,    'rgba(0, 0, 0, 0.95)');
    } else {
      g.addColorStop(0,    'rgba(65, 8, 8, 0.40)');
      g.addColorStop(0.55, 'rgba(25, 4, 4, 0.20)');
      g.addColorStop(1,    'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  /* ------------------------------------------------------------------ */
  /*  ARENA RING                                                         */
  /* ------------------------------------------------------------------ */

  _drawArena(ctx, physics, suspense) {
    const { cx, cy, R, segments, NUM_SEGS, arenaAngle, step } = physics;
    ctx.save();
    ctx.lineCap = 'butt';

    // 1. Dark metallic outer track
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = suspense > 0.5 ? 'rgba(35, 10, 10, 0.9)' : 'rgba(22, 14, 14, 0.75)';
    ctx.lineWidth   = 22;
    ctx.stroke();

    // 2. Soft inner bowl shadow
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6, 0, Math.PI * 2);
    ctx.fillStyle = suspense > 0.5 ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 5, 0.25)';
    ctx.fill();

    // Simple, clean, professional neon ring
    const strokeColor = suspense > 0.5 ? 'rgba(255, 80, 80, 0.95)' : 'rgba(230, 245, 255, 0.95)';
    const glowColor   = suspense > 0.5 ? 'rgba(255, 0, 0, 0.5)' : 'rgba(100, 150, 255, 0.4)';

    // Helper to draw clean continuous arcs for solid sections
    const drawSpans = (lineWidth, strokeStyle, shadowBlur = 0, shadowColor = 'transparent') => {
      let startIdx = -1;
      for (let i = 0; i < NUM_SEGS; i++) {
         if (!segments[i].isOpen && segments[(i - 1 + NUM_SEGS) % NUM_SEGS].isOpen) {
             startIdx = i; break;
         }
      }
      
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowColor = shadowColor;
      
      if (startIdx === -1) {
         if (!segments[0].isOpen) {
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.stroke();
         }
      } else {
         let i = startIdx;
         let count = 0;
         while (count < NUM_SEGS) {
            if (!segments[i % NUM_SEGS].isOpen) {
               let spanStart = i;
               let spanCount = 0;
               while (!segments[i % NUM_SEGS].isOpen && count < NUM_SEGS) {
                  spanCount++; i++; count++;
               }
               const a0 = spanStart * step + arenaAngle;
               const a1 = a0 + spanCount * step;
               ctx.beginPath();
               ctx.arc(cx, cy, R, a0, a1);
               ctx.stroke();
            } else {
               i++; count++;
            }
         }
      }
    };

    // Draw wide glow
    drawSpans(suspense > 0.5 ? 20 : 16, glowColor, 0, 'transparent');

    // Draw main rail
    drawSpans(8, strokeColor, suspense > 0.5 ? 22 : 14, glowColor);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  ACTIVE FLAGS & TOP 5 FLOATING NAMEPLATES                           */
  /* ------------------------------------------------------------------ */

  _drawFlags(ctx, flags, images, aliveCount) {
    const fw = this.FW, fh = this.FH;
    const isTop5 = aliveCount <= 5;
    const isTop3 = aliveCount <= 3;

    for (const f of flags) {
      if (f.eliminated) continue;
      const { position: p, angle } = f.body;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);

      // Clean standard drop shadow for all flags (removed confusing heavy glow/sparks)
      ctx.shadowBlur    = 4;
      ctx.shadowColor   = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowOffsetX = 1.5;
      ctx.shadowOffsetY = 1.5;

      const img = images[f.country.code];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 2);
        else ctx.rect(-fw / 2, -fh / 2, fw, fh);
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
        ctx.restore();
      } else {
        ctx.fillStyle = this._codeColor(f.country.code);
        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
        ctx.shadowBlur   = 0;
        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 8px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.country.code.slice(0, 2).toUpperCase(), 0, 0);
      }

      // Subtle border or Glow
      ctx.shadowBlur  = 0;
      
      let isReviving = f.reviveEffectEnd && f.reviveEffectEnd > Date.now();
      let isBoosted = f.chatBoostEnd && f.chatBoostEnd > Date.now();
      
      if (isReviving) {
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ffff00';
      } else if (isBoosted) {
          ctx.strokeStyle = '#33ccff';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#33ccff';
      } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
          ctx.lineWidth   = 0.8;
      }
      
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
      }

      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // TOP 5 FLOATING NAMEPLATE (Upright badge floating above flag)
      // ─────────────────────────────────────────────────────────────
      if (isTop5) {
        this._drawFlagNameplate(ctx, p.x, p.y, f.country, isTop3);
      }
    }
  }

  _drawFlagNameplate(ctx, x, y, country, isTop3) {
    ctx.save();
    ctx.translate(x, y - 24);

    const name = country.name.toUpperCase();
    ctx.font = 'bold 9px "Rajdhani", sans-serif';
    const textWidth = ctx.measureText(name).width;
    const badgeW    = textWidth + 14;
    const badgeH    = 15;

    // Drop shadow
    ctx.shadowBlur    = 6;
    ctx.shadowColor   = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Glassmorphic pill badge
    ctx.fillStyle = isTop3 ? 'rgba(15, 5, 5, 0.92)' : 'rgba(8, 4, 12, 0.88)';
    ctx.strokeStyle = isTop3 ? '#ffcc00' : 'rgba(255, 160, 40, 0.85)';
    ctx.lineWidth   = isTop3 ? 1.4 : 1.0;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 4);
    else ctx.rect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    ctx.fill();
    ctx.stroke();

    // Little pointer arrow connecting badge to flag
    ctx.beginPath();
    ctx.moveTo(-3, badgeH / 2);
    ctx.lineTo(0, badgeH / 2 + 4);
    ctx.lineTo(3, badgeH / 2);
    ctx.fillStyle = isTop3 ? '#ffcc00' : 'rgba(255, 160, 40, 0.85)';
    ctx.fill();

    // Name text
    ctx.shadowBlur   = 0;
    ctx.fillStyle    = isTop3 ? '#ffffff' : '#f0f0f5';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 0, 0);

    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  FALLING / ELIMINATED FLAGS                                         */
  /* ------------------------------------------------------------------ */

  addFallingFlag(country, x, y, vx, vy, angle, img) {
    this.fallingFlags.push({
      country,
      x, y,
      vx: vx * 0.7 + (Math.random() - 0.5) * 1.5,
      vy: Math.max(vy, 1.6),
      angle,
      vAngle: (Math.random() - 0.5) * 0.15,
      alpha: 1.0,
      img,
    });
  }

  clearFallingFlags() {
    this.fallingFlags = [];
  }

  _drawFallingFlags(ctx) {
    const fw = this.FW, fh = this.FH;

    for (let i = this.fallingFlags.length - 1; i >= 0; i--) {
      const f = this.fallingFlags[i];
      f.x  += f.vx;
      f.y  += f.vy;
      f.vy += 0.28; // Smooth gravity
      f.vx *= 0.98; // Air drag
      f.angle += f.vAngle;
      f.alpha -= 0.020;

      if (f.alpha <= 0 || f.y > this.H + 40) {
        this.fallingFlags.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);

      // Glowing aura for falling eliminated flags
      ctx.shadowBlur  = 8;
      ctx.shadowColor = 'rgba(255, 60, 20, 0.6)';

      if (f.img && f.img.complete && f.img.naturalWidth > 0) {
        ctx.drawImage(f.img, -fw / 2, -fh / 2, fw, fh);
      } else {
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
      }

      ctx.strokeStyle = 'rgba(255, 80, 40, 0.7)';
      ctx.lineWidth   = 0.8;
      ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  PARTICLES                                                          */
  /* ------------------------------------------------------------------ */

  addBurst(x, y, color = null) {
    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 4.5;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: 0.024 + Math.random() * 0.025,
        r: 2 + Math.random() * 4,
        color: color || `hsl(${Math.random() < 0.6 ? 25 : 45}, 100%, 55%)`,
      });
    }
  }

  _drawParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.12;
      p.vx *= 0.96;
      p.life -= p.decay;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  OUTER BORDER GLOW                                                  */
  /* ------------------------------------------------------------------ */

  _drawBorderGlow(ctx, suspense) {
    ctx.save();
    ctx.strokeStyle = suspense > 0.5 ? 'rgba(255, 40, 40, 0.85)' : 'rgba(175, 12, 12, 0.72)';
    ctx.lineWidth   = 5;
    ctx.shadowBlur  = suspense > 0.5 ? 24 : 16;
    ctx.shadowColor = suspense > 0.5 ? 'rgba(255, 0, 0, 0.75)' : 'rgba(220, 0, 0, 0.5)';
    ctx.strokeRect(2.5, 2.5, this.W - 5, this.H - 5);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  WINNER FLASH                                                       */
  /* ------------------------------------------------------------------ */

  winnerFlash(alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = 'rgba(255, 210, 0, 0.45)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  UTILITY                                                            */
  /* ------------------------------------------------------------------ */

  _codeColor(code) {
    let h = 0;
    for (const c of code) h = ((h << 5) - h) + c.charCodeAt(0);
    return `hsl(${Math.abs(h) % 360}, 65%, 37%)`;
  }
}
