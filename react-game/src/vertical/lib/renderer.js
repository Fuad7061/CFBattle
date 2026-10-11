/**
 * Renderer — Custom canvas drawing layer with floating country nameplates for Top 5,
 * dramatic Top 3 suspense spotlight, and ping-pong visual motion effects.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas       = canvas;
    this.ctx          = canvas ? canvas.getContext('2d') : null;
    this.W            = 540;            // logical width
    this.H            = 960;            // logical height
    this.dprX         = canvas ? canvas.width / 540 : 1;
    this.dprY         = canvas ? canvas.height / 960 : 1;
    this.FW           = 28;             // flag width (larger, royal-style scale)
    this.FH           = 18;             // flag height (3:2 ratio)
    this.particles    = [];
    this.fallingFlags = [];             // eliminated flags tumbling away
    this.chatFloaters = [];             // floating viewer reaction badges
    this.shockwaves   = [];             // expanding energetic impact shockwaves
    this._frame       = 0;

    // Suspense lighting state
    this.suspenseIntensity = 0; // 0 to 1

    this._initShadowCache();

    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      try { this.ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    }
  }

  updateScale(dprX, dprY) {
    this.dprX = dprX || 1;
    this.dprY = dprY || 1;
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      try { this.ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    }
    this._initShadowCache();
  }

  _initShadowCache() {
    try {
      const fw = this.FW, fh = this.FH;
      const pad = 12;
      const canvas = document.createElement('canvas');
      canvas.width = fw + pad * 2;
      canvas.height = fh + pad * 2;
      const ctx = canvas.getContext('2d');
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(pad, pad, fw, fh, 2);
      else ctx.rect(pad, pad, fw, fh);
      ctx.fill();
      this._shadowCanvas = canvas;
      this._shadowPad = pad;
    } catch (e) {
      this._shadowCanvas = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  MAIN RENDER                                                        */
  /* ------------------------------------------------------------------ */

  frame(physics, flags, images) {
    this._frame++;
    const ctx = this.ctx;
    if (!ctx) return;
    const aliveCount = flags.filter(f => !f.eliminated).length;

    // Smoothly transition suspense intensity based on alive count
    const targetIntensity = aliveCount <= 2 ? 1.0 : (aliveCount === 3 ? 0.8 : (aliveCount <= 5 ? 0.35 : 0.0));
    this.suspenseIntensity += (targetIntensity - this.suspenseIntensity) * 0.05;

    ctx.save();
    ctx.setTransform(this.dprX, 0, 0, this.dprY, 0, 0);
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}

    this._drawBg(ctx, this.suspenseIntensity, physics);
    this._drawArena(ctx, physics, this.suspenseIntensity);
    this._drawShockwaves(ctx);
    this._drawFlags(ctx, flags, images, aliveCount);
    this._drawFallingFlags(ctx);
    this._drawParticles(ctx);
    this._drawChatFloaters(ctx);
    this._drawDramaticVignette(ctx, this.suspenseIntensity);
    this._drawBorderGlow(ctx, this.suspenseIntensity);

    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  BACKGROUND & SUSPENSE SPOTLIGHT                                    */
  /* ------------------------------------------------------------------ */

  _drawBg(ctx, suspense, physics) {
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
    const cy = (physics && physics.cy) ? physics.cy : 490;

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

      // Soft grounded shadow beneath the flag (high performance pre-rendered depth)
      if (aliveCount <= 48 && this._shadowCanvas) {
        ctx.drawImage(this._shadowCanvas, -fw / 2 - this._shadowPad, -fh / 2 - this._shadowPad, fw + this._shadowPad * 2, fh + this._shadowPad * 2);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(-fw / 2, -fh / 2 + 1, fw, fh);
      }

      const img = images[f.country.code];
      const hasImg = img && (img.width > 0 || img.naturalWidth > 0);
      if (hasImg) {
        if (aliveCount <= 5) {
          // Finalists: gentle flutter cloth wave effect
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 2);
          else ctx.rect(-fw / 2, -fh / 2, fw, fh);
          ctx.clip();
          this._drawWavingFlag(ctx, img, fw, fh, f);
          ctx.restore();
        } else {
          // Ultra-fast direct draw: flag texture has pre-baked rounded corners in offscreen cache!
          ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
        }
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
    const S = fw >= 24 ? 6 : 4;
    const t = this._frame;
    const seed = (f.country.code.charCodeAt(0) * 0.37) % (Math.PI * 2);
    const amp = Math.min(1.4, fw * 0.05);
    const sliceW = fw / S;
    for (let i = 0; i < S; i++) {
      const u0 = i / S, u1 = (i + 1) / S;
      const wave = Math.sin(t * 0.11 + seed + u0 * 5.0);
      const dy = wave * amp * u0;
      const dx = Math.sin(t * 0.09 + seed) * 0.4 * u0;
      ctx.drawImage(
        img,
        u0 * iw, 0, (u1 - u0) * iw, ih,
        -fw / 2 + i * sliceW + dx,
        -fh / 2 + dy,
        sliceW + 0.2, fh,
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
  /*  CHAT REACTION FLOATERS & SHOCKWAVES                                */
  /* ------------------------------------------------------------------ */

  addChatFloater(targetOrX, authorOrY, labelOrAuthor, colorOrLabel, maybeColor) {
    if (this.chatFloaters.length > 30) this.chatFloaters.shift();

    let target = null;
    let x = this.W / 2;
    let y = this.H / 2;
    let author = 'CHAT';
    let label = '+1';
    let color = '#4ade80';

    if (typeof targetOrX === 'object' && targetOrX !== null) {
      target = targetOrX;
      author = String(authorOrY || 'CHAT').trim();
      label = String(labelOrAuthor || '+1').trim();
      color = colorOrLabel || '#4ade80';
      const b = target.body || target;
      x = (b.position ? b.position.x : b.x) || (this.W / 2);
      y = (b.position ? b.position.y : b.y) || (this.H / 2);
    } else {
      x = Number(targetOrX) || (this.W / 2);
      y = Number(authorOrY) || (this.H / 2);
      author = String(labelOrAuthor || 'CHAT').trim();
      label = String(colorOrLabel || '+1').trim();
      color = maybeColor || '#4ade80';
    }

    // Consistent vibrant avatar color generated from author's username
    let hash = 0;
    for (let i = 0; i < author.length; i++) hash = ((hash << 5) - hash) + author.charCodeAt(i);
    const avatarColor = `hsl(${Math.abs(hash) % 360}, 80%, 48%)`;
    const initial = (author.charAt(0) || '★').toUpperCase();

    this.chatFloaters.push({
      target,
      x,
      y,
      author: author.slice(0, 16),
      initial,
      avatarColor,
      label: label.slice(0, 14),
      color,
      frame: 0,
      maxFrames: 170,    // ~2.8s total duration at 60fps
      pinnedFrames: 110, // Locks/tethers directly to the ball for ~1.8s
      floatY: 0,
    });
  }

  _drawChatFloaters(ctx) {
    if (!this.chatFloaters.length) return;
    ctx.save();

    for (let i = this.chatFloaters.length - 1; i >= 0; i--) {
      const f = this.chatFloaters[i];
      f.frame++;

      if (f.frame >= f.maxFrames) {
        this.chatFloaters.splice(i, 1);
        continue;
      }

      // While in pinned duration, anchor position to the ball
      if (f.target) {
        const b = f.target.body || f.target;
        const tx = b.position ? b.position.x : b.x;
        const ty = b.position ? b.position.y : b.y;
        if (typeof tx === 'number' && typeof ty === 'number') {
          f.x = tx;
          f.y = ty - (this.FH ? (this.FH / 2 + 16) : 24);
        }
      }

      // Past pinned frames, gently drift upward while fading out
      if (f.frame > f.pinnedFrames) {
        f.floatY -= 0.65;
      }

      // Opacity calculation
      let alpha = 1.0;
      if (f.frame > f.pinnedFrames) {
        alpha = Math.max(0, 1 - (f.frame - f.pinnedFrames) / (f.maxFrames - f.pinnedFrames));
      } else if (f.frame < 10) {
        alpha = f.frame / 10;
      }

      const drawX = Math.max(65, Math.min(this.W - 65, f.x));
      const drawY = Math.max(22, Math.min(this.H - 22, f.y + f.floatY));

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.font = 'bold 9.5px "Outfit", "Inter", sans-serif';
      const nameWidth = ctx.measureText(f.author).width;
      ctx.font = 'bold 8.5px "Outfit", "Inter", sans-serif';
      const labelWidth = ctx.measureText(f.label).width;

      const avatarR = 6.5;
      const avatarW = avatarR * 2;
      const pillPad = 5;
      const pillW = labelWidth + pillPad * 2;
      const badgeH = 20;
      const badgeW = avatarW + 6 + nameWidth + 8 + pillW + 8;
      const bx = drawX - badgeW / 2;
      const by = drawY - badgeH / 2;

      // Downward pointer arrow connecting badge directly to flag ball
      if (f.frame <= f.pinnedFrames + 20) {
        ctx.beginPath();
        ctx.moveTo(drawX - 4, by + badgeH);
        ctx.lineTo(drawX + 4, by + badgeH);
        ctx.lineTo(drawX, by + badgeH + 5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(12, 18, 30, 0.92)';
        ctx.fill();
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Glassmorphic tag badge container
      ctx.fillStyle = 'rgba(10, 16, 28, 0.92)';
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, badgeW, badgeH, 10);
      else ctx.rect(bx, by, badgeW, badgeH);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 1. Avatar circle with user's initial
      const avCenterX = bx + 4 + avatarR;
      const avCenterY = drawY;
      ctx.beginPath();
      ctx.arc(avCenterX, avCenterY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = f.avatarColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.font = 'bold 8px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(f.initial, avCenterX, avCenterY + 0.5);

      // 2. Author username
      ctx.font = 'bold 9.5px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      const nameX = avCenterX + avatarR + 5;
      ctx.fillText(f.author, nameX, drawY);

      // 3. Action pill badge
      const pillX = nameX + nameWidth + 5;
      const pillY = drawY - 7;
      const pillH = 14;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, pillH, 7);
      else ctx.rect(pillX, pillY, pillW, pillH);
      ctx.fill();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.font = 'bold 8.5px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = f.color;
      ctx.fillText(f.label, pillX + pillW / 2, drawY + 0.5);

      ctx.restore();
    }
    ctx.restore();
  }

  addShockwave(x, y, color = 'rgba(255, 215, 0, 0.8)') {
    if (this.shockwaves.length > 15) this.shockwaves.shift();
    this.shockwaves.push({
      x, y,
      r: 12,
      maxR: 45,
      color,
      life: 1.0,
      decay: 0.035
    });
  }

  _drawShockwaves(ctx) {
    if (!this.shockwaves.length) return;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += (sw.maxR - sw.r) * 0.15 + 1.2;
      sw.life -= sw.decay;
      if (sw.life <= 0 || sw.r >= sw.maxR) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, sw.life * 0.7);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 2.5 * sw.life;
      ctx.shadowBlur = 10;
      ctx.shadowColor = sw.color;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawDramaticVignette(ctx, suspense) {
    if (suspense < 0.2) return;
    ctx.save();
    const cx = this.W / 2;
    const cy = this.H / 2;
    const grad = ctx.createRadialGradient(cx, cy, 140, cx, cy, this.W * 0.75);
    const pulse = 0.5 + Math.sin(this._frame * 0.1) * 0.2;
    const alpha = (suspense * 0.65) * pulse;
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(180, 20, 20, ${alpha.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  clearEffects() {
    this.particles = [];
    this.fallingFlags = [];
    this.chatFloaters = [];
    this.shockwaves = [];
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
