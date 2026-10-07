/**
 * PhysicsEngine — Matter.js rotating circular arena with leak-proof containment,
 * ping-pong floating physics, and YouTube audience retention engagement mechanics.
 *
 * KEY FEATURES:
 *  1. Ping Pong Floating Physics: high restitution (0.80), low friction, and kinetic tumbler agitation.
 *  2. Leak-Proof Boundaries: thick 30px walls with synchronized angle tracking and clamp enforcement.
 *  3. Audience Retention Mechanics: clutch near-miss deflections for popular YouTube audience countries.
 *  4. TimeScale / Matrix Slow-Motion for Top 3 suspense.
 */
class PhysicsEngine {
  constructor(cx, cy, R) {
    this.cx = cx;   // arena center X (270)
    this.cy = cy;   // arena center Y (445)
    this.R  = R;    // visible ring radius (205)

    // Arena geometry
    this.NUM_SEGS      = 60;
    this.step          = (Math.PI * 2) / this.NUM_SEGS;
    this.wallThickness = 30;
    this.R_inner       = this.R - 6;    // ~199px
    this.R_wall        = this.R_inner + this.wallThickness / 2; // ~214px
    this.R_kill        = this.R + 20;   // ~225px

    // Matter.js engine with high-fidelity solver iterations
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 0.0 },
      positionIterations: 12,
      velocityIterations: 10,
      constraintIterations: 4,
      enableSleeping: false,
    });
    this.world = this.engine.world;

    // Arena segments
    this.segments   = [];
    this.arenaAngle = 0;
    this.rotSpeed   = 0.0028;  // rad per physics step (~9.6 deg/sec at 60fps)
    this.stepsPerFrame = 1;
    this.timeScale     = 1.0;  // Support for slow-motion suspense

    // Audience retention bias setting
    this.audienceBiasEnabled = true;

    // Callbacks
    this.onNearMiss = null; // function(body)

    // Flag rigid bodies
    this.flagBodies = [];

    this._buildArena();
  }

  /* ------------------------------------------------------------------ */
  /*  ARENA BUILD                                                        */
  /* ------------------------------------------------------------------ */

  _buildArena() {
    const N      = this.NUM_SEGS;
    const segLen = this.R_wall * this.step * 1.18; // Overlapping segments prevent seam leaks
    const segH   = this.wallThickness;

    // 4 Permanent Pockets (Pockets are 3 segments wide)
    const pocketSize = 3;
    const pocketSpacing = N / 4;

    for (let i = 0; i < N; i++) {
      const midAngle = (i + 0.5) * this.step;
      const x = this.cx + Math.cos(midAngle) * this.R_wall;
      const y = this.cy + Math.sin(midAngle) * this.R_wall;

      const seg = Matter.Bodies.rectangle(x, y, segLen, segH, {
        isStatic:    true,
        friction:    0.015,     // Low wall friction for ping-pong slide
        restitution: 0.75,      // High bounciness on rim
        slop:        0.01,
        label:       `seg-${i}`,
        collisionFilter: { category: 0x0002, mask: 0x0001 },
      });

      seg.segIndex = i;
      
      // Determine if this segment is part of a permanent pocket
      seg.isOpen = false;
      for (let p = 0; p < 4; p++) {
        const pStart = p * pocketSpacing;
        if (i >= pStart && i < pStart + pocketSize) {
          seg.isOpen = true;
          break;
        }
      }

      seg.closeAt  = Infinity;
      
      if (seg.isOpen) {
        Matter.Body.setPosition(seg, { x: 9999, y: 9999 });
      } else {
        Matter.Body.setAngle(seg, midAngle + Math.PI / 2);
      }

      this.segments.push(seg);
      if (!seg.isOpen) {
        Matter.World.add(this.world, seg);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  ARENA ROTATION                                                     */
  /* ------------------------------------------------------------------ */

  _rotateArena() {
    this.arenaAngle += this.rotSpeed * this.timeScale;

    for (const seg of this.segments) {
      if (seg.isOpen) continue;

      const midAngle = (seg.segIndex + 0.5) * this.step + this.arenaAngle;
      const newX     = this.cx + Math.cos(midAngle) * this.R_wall;
      const newY     = this.cy + Math.sin(midAngle) * this.R_wall;

      const oldX = seg.position.x;
      const oldY = seg.position.y;

      Matter.Body.setPosition(seg, { x: newX, y: newY });
      seg.positionPrev.x = oldX;
      seg.positionPrev.y = oldY;
      Matter.Body.setAngle(seg, midAngle + Math.PI / 2);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  HOLES                                                              */
  /* ------------------------------------------------------------------ */

  openRandomHole(durationMs = 3500) {
    // Disabled for 4 permanent pockets
  }

  _closeExpiredHoles() {
    // Disabled for permanent pockets
  }

  _nudgeAwayFromSegment(angle) {
    for (const b of this.flagBodies) {
      if (b.eliminated) continue;
      const dx = b.position.x - this.cx;
      const dy = b.position.y - this.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.R_inner - 16 && dist < this.R_wall + 12) {
        const flagAngle = Math.atan2(dy, dx);
        let diff = Math.abs(flagAngle - angle);
        while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
        if (diff < this.step * 1.5) {
          const safeR = this.R_inner - 16;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          Matter.Body.setPosition(b, {
            x: this.cx + nx * safeR,
            y: this.cy + ny * safeR
          });
          Matter.Body.setVelocity(b, { x: -nx * 3, y: -ny * 3 });
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  HOLE DETECTION AT ANGLE                                            */
  /* ------------------------------------------------------------------ */

  isHoleAtAngle(rad) {
    const rel = ((rad - this.arenaAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.floor(rel / this.step) % this.NUM_SEGS;
    if (this.segments[idx]?.isOpen) return true;
    const prev = (idx - 1 + this.NUM_SEGS) % this.NUM_SEGS;
    const next = (idx + 1) % this.NUM_SEGS;
    return !!(this.segments[prev]?.isOpen || this.segments[next]?.isOpen);
  }

  /* ------------------------------------------------------------------ */
  /*  PING PONG FLAG SPAWN                                               */
  /* ------------------------------------------------------------------ */

  spawnFlag(x, y, w, h, country) {
    const body = Matter.Bodies.rectangle(x, y, w, h, {
      restitution: 0.99,      // Perfectly elastic bounce (Newton's 3rd Law)
      friction:    0,         // No surface friction
      frictionAir: 0,         // No air resistance
      density:     0.0012,    // Lightweight
      slop:        0.01,
      label:       `flag-${country.code}`,
      collisionFilter: { category: 0x0001, mask: 0x0001 | 0x0002 },
    });

    body.country       = country;
    body.eliminated    = false;
    body.fw            = w;
    body.fh            = h;
    body.nearMissCount = 0;

    // Energetic initial ping-pong velocity (explosive burst)
    Matter.Body.setVelocity(body, {
      x: (Math.random() - 0.5) * 14.0,
      y: (Math.random() - 0.5) * 14.0,
    });
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.4);

    this.flagBodies.push(body);
    Matter.World.add(this.world, body);
    return body;
  }

  /* ------------------------------------------------------------------ */
  /*  PING PONG TUMBLER AGITATION                                       */
  /* ------------------------------------------------------------------ */

  _applyPingPongAgitation() {
    // Pure Newtonian Motion - Only intervene if a flag loses too much energy from micro-collisions
    for (const b of this.flagBodies) {
      if (b.eliminated) continue;
      
      const speedSq = b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y;
      if (speedSq < 16.0) {
         // Boost it slightly in its current direction to maintain kinetic energy
         const speed = Math.sqrt(speedSq);
         const angle = speed > 0.1 ? Math.atan2(b.velocity.y, b.velocity.x) : Math.random() * Math.PI * 2;
         Matter.Body.applyForce(b, b.position, {
            x: Math.cos(angle) * 0.0005,
            y: Math.sin(angle) * 0.0005,
         });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  LEAK-PROOF CONTAINMENT & AUDIENCE BIAS                             */
  /* ------------------------------------------------------------------ */

  _enforceContainment() {
    const eliminated  = [];
    const maxSpeed    = 15;
    const aliveTotal  = this.flagBodies.filter(b => !b.eliminated).length;

    for (const b of this.flagBodies) {
      if (b.eliminated) continue;

      // 1. Velocity Clamping
      const spd = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
      if (spd > maxSpeed) {
        const factor = maxSpeed / spd;
        Matter.Body.setVelocity(b, {
          x: b.velocity.x * factor,
          y: b.velocity.y * factor,
        });
      }

      const dx   = b.position.x - this.cx;
      const dy   = b.position.y - this.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 2. Check boundary approach
      const safeRadius = this.R_inner - 13;
      if (dist > safeRadius) {
        const angle   = Math.atan2(dy, dx);
        const hasHole = this.isHoleAtAngle(angle);

        if (hasHole) {
          // Check audience bias for top YouTube countries
          const popularCodes = ['in', 'us', 'id', 'br', 'mx', 'jp', 'de', 'vn', 'ph', 'tr', 'pk', 'gb', 'fr', 'bd', 'eg', 'th', 'kr', 'it', 'es', 'ca'];
          if (this.audienceBiasEnabled && popularCodes.includes(b.country.code.toLowerCase()) && b.nearMissCount < 4) {
             // 90% chance to magically bounce out of the hole (clutch survival)
             if (Math.random() < 0.90) {
               b.nearMissCount++;
               const nx = dx / (dist || 1);
               const ny = dy / (dist || 1);
               
               Matter.Body.setPosition(b, {
                 x: this.cx + nx * safeRadius,
                 y: this.cy + ny * safeRadius,
               });
               
               const vDotN = b.velocity.x * nx + b.velocity.y * ny;
               if (vDotN > 0) {
                 Matter.Body.setVelocity(b, {
                   x: (b.velocity.x - 2.0 * vDotN * nx) * 1.5,
                   y: (b.velocity.y - 2.0 * vDotN * ny) * 1.5,
                 });
               }
               if (this.onNearMiss) this.onNearMiss(b);
               continue; // Survived!
             }
          }

          if (dist > this.R_wall - 10) {
            // Flag has passed outside through the hole
            b.eliminated = true;
            eliminated.push(b);
            Matter.World.remove(this.world, b);
          }
        } else {
          // Closed wall: strictly enforce containment, NO leaks!
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          Matter.Body.setPosition(b, {
            x: this.cx + nx * safeRadius,
            y: this.cy + ny * safeRadius,
          });

          // Perfect elastic bounce reflection (Newton's 3rd Law)
          const vDotN = b.velocity.x * nx + b.velocity.y * ny;
          if (vDotN > 0) {
            Matter.Body.setVelocity(b, {
              x: (b.velocity.x - 2.0 * vDotN * nx) * 0.99,
              y: (b.velocity.y - 2.0 * vDotN * ny) * 0.99,
            });
          }
        }
      }
    }
    return eliminated;
  }

  /* ------------------------------------------------------------------ */
  /*  MAIN UPDATE (called with fixed timestep deltaMs)                  */
  /* ------------------------------------------------------------------ */

  update(deltaMs = 16.667) {
    const allEliminated = [];
    const effDelta = deltaMs * this.timeScale;

    for (let s = 0; s < this.stepsPerFrame; s++) {
      this._rotateArena();
      this._applyPingPongAgitation();

      // 2 sub-steps per frame for ultra-accurate rigid body physics
      const subDelta = effDelta / 2;
      Matter.Engine.update(this.engine, subDelta);
      Matter.Engine.update(this.engine, subDelta);

      const elim = this._enforceContainment();
      if (elim.length) allEliminated.push(...elim);
    }

    this._closeExpiredHoles();
    return allEliminated;
  }

  /* ------------------------------------------------------------------ */
  /*  RESET                                                              */
  /* ------------------------------------------------------------------ */

  reset() {
    for (const b of this.flagBodies) Matter.World.remove(this.world, b);
    this.flagBodies = [];

    // Permanent pockets are preserved (do not close them on reset)
    this.arenaAngle = 0;
    this.timeScale  = 1.0;
  }

  /* ------------------------------------------------------------------ */
  /*  SETTERS & GETTERS                                                  */
  /* ------------------------------------------------------------------ */

  setRotSpeed(v)     { this.rotSpeed = v; }
  setGravity(y)      { this.engine.gravity.y = y; }
  setStepsPerFrame(n){ this.stepsPerFrame = Math.max(1, n); }
  setTimeScale(ts)   { this.timeScale = Math.max(0.1, ts); }

  getAlive() { return this.flagBodies.filter(b => !b.eliminated); }
}
