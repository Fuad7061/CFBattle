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
    this.FW           = 28;             // flag width (larger, royal-style scale)
    this.FH           = 18;             // flag height (3:2 ratio)
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
    // Deep slate background
    ctx.fillStyle = '#0d1114';
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
      // Dramatic high-contrast suspense spotlight (warm amber)
      const p = 0.5 + 0.5 * Math.sin(this._frame * 0.1);
      g.addColorStop(0,    `rgba(76, 55, 32, ${0.5 + 0.15 * p})`);
      g.addColorStop(0.40, `rgba(48, 40, 32, ${0.4 + 0.1 * p})`);
      g.addColorStop(0.75, 'rgba(20, 22, 21, 0.7)');
      g.addColorStop(1,    'rgba(9, 11, 12, 0.95)');
    } else {
      g.addColorStop(0,    'rgba(38, 49, 43, 0.5)');
      g.addColorStop(0.55, 'rgba(24, 31, 30, 0.28)');
      g.addColorStop(1,    'rgba(13, 17, 20, 0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  /* ------------------------------------------------------------------ */
  /*  ARENA RING                                                         */
  /* ------------------------------------------------------------------ */

  _drawArena(ctx, physics) {
    const { cx, cy, R, segments, NUM_SEGS, arenaAngle, step } = physics;
    ctx.save();
    ctx.lineCap = 'butt';

    // Collect contiguous closed spans and gate (open) spans
    const closed = [], gaps = [];
    let idx = 0;
    while (idx < NUM_SEGS) {
      const isOpen = segments[idx].isOpen;
      let j = idx;
      while (j < NUM_SEGS && segments[j].isOpen === isOpen) j++;
      (isOpen ? gaps : closed).push([idx * step + arenaAngle, j * step + arenaAngle]);
      idx = j;
    }

    // Wall — single clean stroke with soft glow (royal style)
    ctx.strokeStyle = '#90a58a';
    ctx.lineWidth   = 5;
    ctx.shadowColor = '#95b97844';
    ctx.shadowBlur  = 12;
    for (const [a0, a1] of closed) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Gate breaches — dashed marker outside the wall + endpoint nodes
    for (const [a0, a1] of gaps) {
      ctx.strokeStyle = '#f5b766';
      ctx.lineWidth   = 2;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 9, a0, a1);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffc377';
      for (const a of [a0, a1]) {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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

      // Soft grounded shadow beneath the flag (depth, royal-style)
      ctx.save();
      ctx.shadowBlur    = 6;
      ctx.shadowColor   = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle     = 'rgba(0, 0, 0, 0.92)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 2);
      else ctx.rect(-fw / 2, -fh / 2, fw, fh);
      ctx.fill();
      ctx.restore();

      const img = images[f.country.code];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 2);
        else ctx.rect(-fw / 2, -fh / 2, fw, fh);
        ctx.clip();
        this._drawWavingFlag(ctx, img, fw, fh, f);
        ctx.restore();
      } else {
        ctx.fillStyle = this._codeColor(f.country.code);
        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 9px sans-serif';
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

      // Unrotated status overlays: SHIELD bubble, FREEZE frost ring, SLOW ring
      this._drawFlagStatus(ctx, p.x, p.y, f);

      // ─────────────────────────────────────────────────────────────
      // TOP 5 FLOATING NAMEPLATE (Upright badge floating above flag)
      // ─────────────────────────────────────────────────────────────
      if (isTop5) {
        this._drawFlagNameplate(ctx, p.x, p.y, f.country, isTop3);
      }
    }
  }

  // Textured flag drawn as soft vertical strips with a gentle flutter,
  // mimicking the royal project's cloth-mesh flag look (1px overlap hides seams).
  _drawWavingFlag(ctx, img, fw, fh, f) {
    const iw = img.naturalWidth  || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const S = fw >= 24 ? 6 : 3;
    const t = this._frame;
    const seed = (f.country.code.charCodeAt(0) * 0.37) % (Math.PI * 2);
    const amp = Math.min(1.6, fw * 0.06);
    for (let i = 0; i < S; i++) {
      const u0 = i / S, u1 = (i + 1) / S;
      const wave = Math.sin(t * 0.11 + seed + u0 * 5.0);
      const dy = wave * amp * u0;
      const dx = Math.sin(t * 0.09 + seed) * 0.5 * u0;
      ctx.drawImage(
        img,
        u0 * iw, 0, (u1 - u0) * iw, ih,
        -fw / 2 + u0 * fw + dx,
        -fh / 2 + dy,
        (u1 - u0) * fw + 1, fh,
      );
    }
  }

  // 🛡️ SHIELD bubble + ❄️ FREEZE frost + 🐌 SLOW aura, all in screen space so
  // they stay upright and read clearly at a glance.
  _drawFlagStatus(ctx, x, y, f) {
    const now = Date.now();
    const shielded = f.body.immunityUntil && f.body.immunityUntil > now;
    const frozen = f.body.frozenUntil && f.body.frozenUntil > now;
    const slowed = f.body.slowUntil && f.body.slowUntil > now;
    const base = Math.max(this.FW, this.FH);

    // Colour tint over the flag while CC'd, so it never blends into the arena.
    if (frozen || slowed || shielded) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = shielded ? 'rgba(80, 220, 255, 0.14)'
        : frozen ? 'rgba(140, 215, 255, 0.30)'
                 : 'rgba(170, 120, 255, 0.26)';
      ctx.fillRect(-this.FW / 2, -this.FH / 2, this.FW, this.FH);
      ctx.restore();
    }

    if (shielded) {
      ctx.save();
      const pulse = 1 + Math.sin(now / 180) * 0.06;
      ctx.translate(x, y);
      ctx.rotate(now / 500);
      ctx.strokeStyle = 'rgba(80, 220, 255, 0.95)';
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(80, 220, 255, 0.95)';
      const r = base * 0.9 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Rotating defence spokes
      ctx.rotate(now / 260);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, i * (Math.PI / 2) - 0.28, i * (Math.PI / 2) + 0.28);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (frozen) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 800);
      ctx.strokeStyle = 'rgba(150, 220, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(120, 200, 255, 0.9)';
      const r = base * 0.78;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Crystal spikes
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * (Math.PI / 4);
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6));
      }
      ctx.stroke();
      ctx.restore();
    }

    if (slowed) {
      ctx.save();
      const pulse = 1 + Math.sin(now / 200) * 0.08;
      ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(180, 120, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(180, 120, 255, 0.9)';
      const r = base * 0.75 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawFlagNameplate(ctx, x, y, country, isTop3) {
    ctx.save();
    ctx.translate(x, y - 24);

    const name = country.name.toUpperCase();
    ctx.font = '700 12px "Barlow Condensed", sans-serif';
    const textWidth = ctx.measureText(name).width;
    const badgeW    = textWidth + 14;
    const badgeH    = 16;

    // Drop shadow
    ctx.shadowBlur    = 6;
    ctx.shadowColor   = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Glassmorphic pill badge
    ctx.fillStyle = isTop3 ? 'rgba(21, 27, 30, 0.94)' : 'rgba(15, 20, 23, 0.9)';
    ctx.strokeStyle = isTop3 ? '#e9bc73' : 'rgba(233, 188, 115, 0.8)';
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
    ctx.fillStyle = isTop3 ? '#e9bc73' : 'rgba(233, 188, 115, 0.8)';
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

      // Glowing aura for falling eliminated flags (scorched by the wire)
      ctx.shadowBlur  = 8;
      ctx.shadowColor = 'rgba(255, 168, 88, 0.65)';

      if (f.img && f.img.complete && f.img.naturalWidth > 0) {
        ctx.drawImage(f.img, -fw / 2, -fh / 2, fw, fh);
      } else {
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
      }

      ctx.strokeStyle = 'rgba(255, 190, 110, 0.75)';
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

    // Electric spark streaks — reads as the flag shorting out on the wire wall.
    const sparkCol = color || 'rgba(255, 232, 180, 1)';
    const SPARKS = 9;
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 6;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: 0.05 + Math.random() * 0.05,
        r: 1,
        len: 6 + Math.random() * 10,
        spark: true,
        color: sparkCol,
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

      if (p.spark) {
        const d = Math.hypot(p.vx, p.vy) || 1;
        const ux = p.vx / d, uy = p.vy / d;
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = 1.8 * p.life;
        ctx.shadowBlur  = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * p.len * p.life, p.y - uy * p.len * p.life);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  OUTER BORDER GLOW                                                  */
  /* ------------------------------------------------------------------ */

  _drawBorderGlow(ctx, suspense) {
    ctx.save();
    ctx.strokeStyle = suspense > 0.5 ? 'rgba(239, 140, 103, 0.9)' : 'rgba(233, 188, 115, 0.55)';
    ctx.lineWidth   = 5;
    ctx.shadowBlur  = suspense > 0.5 ? 24 : 16;
    ctx.shadowColor = suspense > 0.5 ? 'rgba(239, 140, 103, 0.8)' : 'rgba(233, 188, 115, 0.45)';
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
