/**
 * UIManager — All HTML/CSS HUD overlay control, including Top 5 Finalist cards,
 * Top Supporters leaderboard, live viewer counter, engagement CTAs,
 * milestone celebrations, and champion podium.
 */
import { getFlagUrl } from './countries.js';

export class UIManager {
  constructor() {
    this.$ = id => document.getElementById(id);
    this._timerHandle    = null;
    this._timerStart     = 0;
    this._qualifiedCount = 0;

    // Engagement state
    this._engageInterval = null;
    this._engageIndex    = 0;
    this._nextTournamentTimer = null;

    // Fake supporters pool
    this._supporters = [];
  }

  /* ------------------------------------------------------------------ */
  /*  ROUND HEADER                                                       */
  /* ------------------------------------------------------------------ */

  setRound(n)    { this.$('round-label').textContent = `ROUND ${n}`; }

  setPhase(text) {
    this.$('phase-label').textContent     = text;
    this.$('qualifying-text').textContent = text;
  }

  /* Round header: main label (e.g. "CAMPAIGN 1 · GRAND FINAL") + phase line. */
  setRoundHeader(roundText, phaseText) {
    const rl = this.$('round-label');
    if (rl) rl.textContent = roundText;
    const pl = this.$('phase-label');
    if (pl) pl.textContent = phaseText;
    const qt = this.$('qualifying-text');
    if (qt) qt.textContent = phaseText;
  }

  /* Back-compat alias. */
  setTournamentHeader(campaign, round, totalRounds, target) {
    const label = totalRounds ? `CAMPAIGN ${campaign} \u00b7 ROUND ${round}/${totalRounds}` : `CAMPAIGN ${campaign}`;
    const phase = target <= 1 ? 'GRAND FINAL' : `QUALIFY TOP ${target}`;
    this.setRoundHeader(label, phase);
  }

  /* ------------------------------------------------------------------ */
  /*  TIMER                                                              */
  /* ------------------------------------------------------------------ */

  startTimer() {
    this._timerStart = Date.now();
    clearInterval(this._timerHandle);
    this._timerHandle = setInterval(() => {
      const ms = Date.now() - this._timerStart;
      const m  = String(Math.floor(ms / 60000)).padStart(2, '0');
      const s  = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      const t  = `${m}:${s}`;
      this.$('timer-display').textContent    = t;
      this.$('qualifying-timer').textContent = `\u00b7 ${t}`;
    }, 500);
  }

  stopTimer() {
    clearInterval(this._timerHandle);
  }

  /* ------------------------------------------------------------------ */
  /*  TOP SUPPORTERS LEADERBOARD                                        */
  /* ------------------------------------------------------------------ */

  startSupporters() {
    this._supporters = [];
    this._updateSupportersUI();
  }

  stopSupporters() {
    // No longer an interval
  }

  recordSupporterVote(author, weight) {
    const name = author || 'Viewer';
    const w = Math.max(0, Number(weight) || 0);
    if (w === 0) return;
    const existing = this._supporters.find(s => s.name === name);
    if (existing) {
      existing.gifts += w;
    } else {
      this._supporters.push({ name, gifts: w });
    }
    this._supporters.sort((a, b) => b.gifts - a.gifts);
    this._supporters = this._supporters.slice(0, 20);
    this._updateSupportersUI();
  }

  _updateSupportersUI() {
    const list = this.$('supporters-list');
    if (!list) return;
    if (this._supporters.length === 0) {
      list.innerHTML = '<div class="sup-empty">No supporters yet</div>';
      return;
    }
    list.innerHTML = this._supporters.slice(0, 5).map((s, i) => `
      <div class="sup-row">
        <span class="sup-rank">${i + 1}</span>
        <span class="sup-name">${s.name}</span>
        <span class="sup-gifts">\u2605 ${Math.round(s.gifts)}</span>
      </div>
    `).join('');
  }

  resetSupporters() {
    this._supporters = [];
    this._updateSupportersUI();
  }

  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /*  ENGAGEMENT CTA BANNER (rotating messages)                         */
  /* ------------------------------------------------------------------ */

  startEngagementCTA() {
    const messages = [
      '\ud83d\udc4d LIKE IF YOUR COUNTRY IS STILL ALIVE!',
      '\ud83d\udd14 SUBSCRIBE \u2014 A NEW BATTLE STARTS SOON!',
      '\ud83d\udcac TYPE YOUR COUNTRY NAME TO SAVE IT!',
      '\ud83c\udf81 SUPER CHAT = INSTANT REVIVE!',
      '\ud83d\udd25 SHARE THIS LIVE WITH A FRIEND!',
      '\ud83c\udfc6 TOP 5 REACH THE FINAL \u2014 PUSH YOUR FLAG!',
    ];
    const el = this.$('engagement-cta');
    if (!el) return;
    
    const show = () => {
      el.textContent = messages[this._engageIndex % messages.length];
      el.classList.remove('hidden');
      this._engageIndex++;
      setTimeout(() => el.classList.add('hidden'), 6000);
    };
    
    setTimeout(() => {
      show();
      this._engageInterval = setInterval(show, 45000);
    }, 15000);
  }

  stopEngagementCTA() {
    clearInterval(this._engageInterval);
    const el = this.$('engagement-cta');
    if (el) el.classList.add('hidden');
  }

  /* ------------------------------------------------------------------ */
  /*  MILESTONE CELEBRATIONS                                            */
  /* ------------------------------------------------------------------ */

  showMilestone(text) {
    const el = this.$('milestone-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'milestoneIn 3s ease forwards';
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  /* ------------------------------------------------------------------ */
  /*  TOP 5 FINALISTS TRACKER                                           */
  /* ------------------------------------------------------------------ */

  showTop5Finalists(countries) {
    const el    = this.$('top5-tracker');
    const cards = this.$('top5-cards');
    const header = this.$('top5-header');
    if (!el || !cards) return;

    // Top 5 tracker takes the Active Countries roster slot (never both at once)
    const roster = this.$('roster-section');
    if (roster) roster.classList.add('hidden');

    if (header) {
        if (countries.length > 5) {
            header.innerHTML = `\u26a1 TOP ${countries.length} FINALISTS \u2014 WHO WILL WIN? \u26a1`;
        } else {
            header.innerHTML = `\u26a1 TOP 5 FINALISTS \u2014 WHO WILL WIN? \u26a1`;
        }
    }

    cards.innerHTML = '';
    countries.forEach(c => {
      const card = document.createElement('div');
      card.className = 't5-card active';
      card.id = `t5-${c.code}`;
      card.innerHTML = `
        <img class="t5-fl" src="${getFlagUrl(c.code, 80)}" alt="${c.name}" crossorigin="anonymous">
        <span class="t5-name" title="${c.name}">${c.name}</span>
        <span class="t5-status">\ud83d\udfe2 ALIVE</span>
      `;
      cards.appendChild(card);
    });

    el.classList.remove('hidden');
  }

  eliminateTop5Card(code, rank) {
    const card = document.getElementById(`t5-${code}`);
    if (card) {
      card.classList.remove('active');
      card.classList.add('out');
      const st = card.querySelector('.t5-status');
      if (st) st.textContent = `\u2715 #${rank}`;
    }
  }

  hideTop5Finalists() {
    const el = this.$('top5-tracker');
    if (el) el.classList.add('hidden');
    // Restore the Active Countries roster in the slot the tracker occupied
    const roster = this.$('roster-section');
    if (roster) roster.classList.remove('hidden');
  }

  /* ------------------------------------------------------------------ */
  /*  CAMPAIGN WINNERS PANEL                                            */
  /* ------------------------------------------------------------------ */

  addWinner(country, smallFlagUrl, campaignNum) {
    this._qualifiedCount++;
    const n = campaignNum != null ? campaignNum : this._qualifiedCount;
    const list = this.$('qualified-list');
    if (!list) return;
    const empty = list.querySelector('.q-empty');
    if (empty) empty.remove();
    // Mark only the newest winner as the "latest" highlight.
    list.querySelectorAll('.q-row.latest').forEach(r => r.classList.remove('latest'));
    const row = document.createElement('div');
    row.className = 'q-row latest';
    row.innerHTML = `
      <span class="q-pos">C${n}</span>
      <img class="q-fl" src="${smallFlagUrl}" alt="" crossorigin="anonymous">
      <span class="q-name">${country.name}</span>
      <span class="q-badge">\ud83c\udfc6 WINNER</span>
    `;
    list.appendChild(row);
    list.scrollTop = 9999;
  }

  clearQualified() {
    this._qualifiedCount = 0;
    const list = this.$('qualified-list');
    if (list) list.innerHTML = '<div class="q-empty">Awaiting first champion\u2026</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  FLAG COUNTER + PROGRESS BAR                                       */
  /* ------------------------------------------------------------------ */

  updateCounter(alive, total) {
    this.$('counter-text').textContent = `${alive} / ${total} FLAGS`;
    const pct = total > 0 ? ((total - alive) / total) * 100 : 0;
    this.$('progress-fill').style.width = `${pct}%`;
  }

  /* ------------------------------------------------------------------ */
  /*  TEAM UP MODE LEADERBOARD                                          */
  /* ------------------------------------------------------------------ */

  updateTeams(teams) {
    const panel = this.$('team-panel');
    const list = this.$('team-list');
    if (!panel || !list) return;
    if (!teams || !teams.length) {
      panel.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    const ranked = [...teams].sort((a, b) => b.alive - a.alive || a.name.localeCompare(b.name));
    list.innerHTML = ranked.map((t, i) => {
      const pct = t.total > 0 ? Math.round((t.alive / t.total) * 100) : 0;
      const dead = t.alive === 0;
      return `<div class="team-row${dead ? ' out' : ''}" style="--team:${t.color}">
        <span class="team-rank">${i + 1}</span>
        <span class="team-dot"></span>
        <span class="team-name">${t.emoji ? t.emoji + ' ' : ''}${t.name}</span>
        <span class="team-bar"><i style="width:${pct}%"></i></span>
        <span class="team-count">${t.alive}<small>/${t.total}</small></span>
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /*  ROSTER GRID                                                        */
  /* ------------------------------------------------------------------ */

  buildRoster(countries) {
    const grid = this.$('roster-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const c of countries) {
      const img = document.createElement('img');
      img.src         = getFlagUrl(c.code, 40);
      img.crossOrigin = 'anonymous';
      img.alt         = c.name;
      img.title       = c.name;
      img.id          = `rf-${c.code}`;
      img.className   = 'rf';
      grid.appendChild(img);
    }
  }

  eliminateFlag(code) {
    const el = document.getElementById(`rf-${code}`);
    if (el) el.classList.add('elim');
  }

  reviveFlag(code) {
    const el = document.getElementById(`rf-${code}`);
    if (el) el.classList.remove('elim');
  }

  reviveTop5Card(code) {
    const card = document.getElementById(`t5-${code}`);
    if (card) {
      card.classList.remove('out');
      card.classList.add('active');
      const st = card.querySelector('.t5-status');
      if (st) st.textContent = '🟢 ALIVE';
    }
  }

  resetRoster() {
    document.querySelectorAll('.rf').forEach(e => e.classList.remove('elim'));
  }

  /* ------------------------------------------------------------------ */
  /*  ELIMINATION FEED                                                   */
  /* ------------------------------------------------------------------ */
  showEliminationToast(country, flagUrl) {
    const feed = this.$('elimination-feed');
    if (!feed) return;
    
    const toast = document.createElement('div');
    toast.className = 'elim-toast';
    toast.innerHTML = `<img src="${flagUrl}" alt=""> <span>ELIMINATED:</span> ${country.name}`;
    
    feed.insertBefore(toast, feed.firstChild);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    
    setTimeout(() => {
      if (toast.parentNode === feed) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }
    }, 2500);
  }

  showChatBoostToast(country, flagUrl) {
    const feed = this.$('elimination-feed');
    if (!feed) return;
    
    const toast = document.createElement('div');
    toast.className = 'elim-toast';
    toast.style.background = 'rgba(10, 25, 40, 0.85)';
    toast.style.borderColor = 'rgba(100, 200, 255, 0.6)';
    toast.innerHTML = `<img src="${flagUrl}" alt=""> <span style="color:#88ccff">\u26a1 CHAT BOOST:</span> ${country.name}`;
    
    feed.insertBefore(toast, feed.firstChild);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    
    setTimeout(() => {
      if (toast.parentNode === feed) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }
    }, 2500);
  }

  // 💚 A plain country-name comment turns the flag around — the "save" move.
  showSaveToast(country, flagUrl, author) {
    const feed = this.$('elimination-feed');
    if (!feed) return;
    const name = country && country.name ? country.name : '';
    const toast = document.createElement('div');
    toast.className = 'elim-toast';
    toast.style.background = 'rgba(8, 35, 18, 0.92)';
    toast.style.borderColor = 'rgba(90, 240, 140, 0.9)';
    toast.innerHTML = `<img src="${flagUrl}" alt=""> <span style="color:#7dffa8">\u21a9\ufe0f SAVED${author ? ' · ' + author : ''}:</span> ${name}`;
    feed.insertBefore(toast, feed.firstChild);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    setTimeout(() => {
      if (toast.parentNode === feed) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }
    }, 2500);
  }


  showPowerToast(label, country, flagUrl, author) {
    const feed = this.$('elimination-feed');
    if (!feed) return;
    const name = country && country.name ? country.name : '';
    const toast = document.createElement('div');
    toast.className = 'elim-toast';
    toast.style.background = 'rgba(30, 15, 45, 0.9)';
    toast.style.borderColor = 'rgba(190, 120, 255, 0.85)';
    toast.innerHTML = `<img src="${flagUrl}" alt=""> <span style="color:#c792ff">${label}${author ? ' · ' + author : ''}:</span> ${name}`;
    feed.insertBefore(toast, feed.firstChild);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    setTimeout(() => {
      if (toast.parentNode === feed) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }
    }, 2800);
  }

  showGlobalPowerToast(label, author) {
    const feed = this.$('elimination-feed');
    if (!feed) return;
    const toast = document.createElement('div');
    toast.className = 'elim-toast';
    toast.style.background = 'rgba(45, 25, 10, 0.92)';
    toast.style.borderColor = 'rgba(255, 170, 60, 0.85)';
    toast.innerHTML = `<span style="color:#ffbb66">${label}${author ? ' · ' + author : ''}</span>`;
    feed.insertBefore(toast, feed.firstChild);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    setTimeout(() => {
      if (toast.parentNode === feed) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }
    }, 2800);
  }

  showReviveProgress(country, flagUrl, current, target) {
    const container = this.$('revive-trackers');
    if (!container) return;

    const trim = () => {
      // Keep only the 3 most-recently-active (different) countries so the
      // preview stays clean. Each country has a unique element, so this shows
      // the latest 3 distinct flag revive counters only.
      while (container.children.length > 3) container.removeChild(container.firstChild);
    };

    let el = this.$(`revive-${country.code}`);
    if (!el) {
      el = document.createElement('div');
      el.id = `revive-${country.code}`;
      el.className = 'revive-progress-item';
      el.innerHTML = `
        <img src="${flagUrl}" alt="">
        <span class="revive-text">${current}/${target} REVIVE</span>
      `;
      container.appendChild(el);
    } else {
      el.querySelector('.revive-text').textContent = `${current}/${target} REVIVE`;
      container.appendChild(el); // bump to newest position
      // pop animation
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    trim();
  }

  hideReviveProgress(code) {
    const el = this.$(`revive-${code}`);
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.8)';
      setTimeout(() => el.remove(), 300);
    }
  }


  showReviveToast(country, flagUrl, author) {
    const feed = this.$('elimination-feed');
    if (!feed) return;
    
    const toast = document.createElement('div');
    toast.className = 'elim-toast';
    toast.style.background = 'rgba(25, 40, 10, 0.95)';
    toast.style.borderColor = 'rgba(100, 255, 150, 0.8)';
    toast.innerHTML = `<img src="${flagUrl}" alt=""> <span style="color:#66ff99">\u26a1 REVIVED BY ${author.toUpperCase()}:</span> ${country.name}`;
    
    feed.insertBefore(toast, feed.firstChild);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    
    setTimeout(() => {
      if (toast.parentNode === feed) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }
    }, 4500);
  }

  /* ------------------------------------------------------------------ */
  /*  WINNER SCREEN (Enhanced Champion Podium)                           */
  /* ------------------------------------------------------------------ */

  showWinner(winner, winnerFlag, second, secondFlag, third, thirdFlag) {
    this.$('winner-flag-img').src     = winnerFlag;
    this.$('winner-name').textContent = winner.name;
    
    this.$('first-flag-img-podium').src = winnerFlag;
    this.$('first-name-podium').textContent = winner.name;
    
    if (second) {
      this.$('second-flag-img').src = secondFlag || '';
      this.$('second-name').textContent = second.name;
    }
    if (third) {
      this.$('third-flag-img').src = thirdFlag || '';
      this.$('third-name').textContent = third.name;
    }
    
    this.$('winner-screen').className = 'visible';
    this._startNextTournament(8);
    this._spawnConfetti();
  }

  _startNextTournament(seconds) {
    const el = this.$('next-tournament');
    const timerEl = this.$('next-timer');
    if (!el || !timerEl) return;
    
    el.classList.remove('hidden');
    let remaining = seconds;
    timerEl.textContent = remaining;
    
    this._nextTournamentTimer = setInterval(() => {
      remaining--;
      timerEl.textContent = remaining;
      if (remaining <= 0) clearInterval(this._nextTournamentTimer);
    }, 1000);
  }

  _spawnConfetti() {
    let confettiCanvas = document.getElementById('confetti-canvas');
    if (!confettiCanvas) {
      confettiCanvas = document.createElement('canvas');
      confettiCanvas.id = 'confetti-canvas';
      confettiCanvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:49;';
      confettiCanvas.width = 540;
      confettiCanvas.height = 960;
      document.getElementById('game-wrapper').appendChild(confettiCanvas);
    }
    
    const ctx = confettiCanvas.getContext('2d');
    const particles = [];
    const colors = ['#f5c518', '#ff3333', '#33aaff', '#33ff55', '#ff66aa', '#ffaa00', '#ffffff'];
    
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * 540,
        y: Math.random() * -960,
        w: 4 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 0.8 + Math.random() * 0.2,
      });
    }
    
    let frame = 0;
    const maxFrames = 300;
    
    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, 540, 960);
      
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        p.vy += 0.05;
        p.vx *= 0.99;
        
        if (frame > maxFrames - 60) p.opacity *= 0.96;
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      
      if (frame < maxFrames) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, 540, 960);
    };
    
    requestAnimationFrame(animate);
  }

  hideWinner() {
    this.$('winner-screen').className = 'hidden';
    clearInterval(this._nextTournamentTimer);
    const el = this.$('next-tournament');
    if (el) el.classList.add('hidden');
    const feed = this.$('elimination-feed');
    if (feed) feed.innerHTML = '';
    
    const confettiCanvas = document.getElementById('confetti-canvas');
    if (confettiCanvas) {
      const ctx = confettiCanvas.getContext('2d');
      ctx.clearRect(0, 0, 540, 960);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  COUNTDOWN OVERLAY                                                  */
  /* ------------------------------------------------------------------ */

  showCountdown(num) {
    const el = this.$('countdown-overlay');
    this.$('countdown-num').textContent = num;
    el.className = '';
    el.style.display = 'flex';
  }

  updateCountdown(num) {
    const numEl = this.$('countdown-num');
    numEl.textContent = num === 0 ? 'GO!' : num;
    numEl.style.animation = 'none';
    numEl.offsetHeight;
    numEl.style.animation = 'countdown-bounce 0.85s ease';
  }

  hideCountdown() {
    const el = this.$('countdown-overlay');
    el.className = 'hidden';
    el.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /*  CHAT BOOST CTA                                                     */
  /* ------------------------------------------------------------------ */
  
  showChatCta(show) {
    const el = this.$('chat-cta');
    if (el) el.className = show ? '' : 'hidden';
  }

  /* ------------------------------------------------------------------ */
  /*  SUSPENSE NOTICE                                                    */
  /* ------------------------------------------------------------------ */

  showSuspense(msg) {
    const el = this.$('suspense-notice');
    el.textContent = msg;
    el.className   = '';
    el.style.display = 'block';
    clearTimeout(this._suspenseTimer);
    this._suspenseTimer = setTimeout(() => {
      el.className = 'hidden';
    }, 3200);
  }

  /* Grand Final lineup: title + one finalist per line so long country names
     stay fully readable inside the 540-wide preview. */
  showFinalLineup(countries) {
    const el = this.$('suspense-notice');
    if (!el || !countries || !countries.length) return;
    const rows = countries.map(c =>
      `<div class="fl-name"><img src="${getFlagUrl(c.code, 80)}" alt="" crossorigin="anonymous"><span>${c.name}</span></div>`
    ).join('');
    el.innerHTML = `<div class="fl-title">\ud83c\udfc6 GRAND FINAL</div>${rows}`;
    el.className = 'final-lineup';
    el.style.display = 'block';
    clearTimeout(this._suspenseTimer);
    this._suspenseTimer = setTimeout(() => {
      el.className = 'hidden';
      el.innerHTML = '';
    }, 5200);
  }

  /* ------------------------------------------------------------------ */
  /*  LOADING OVERLAY                                                    */
  /* ------------------------------------------------------------------ */

  showLoading(msg = 'Loading\u2026') {
    let el = document.getElementById('loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      document.getElementById('game-wrapper').appendChild(el);
    }
    el.style.display = 'flex';
    el.innerHTML = `
      <div class="load-box">
        <div class="spinner"></div>
        <p id="load-msg">${msg}</p>
        <p class="load-sub">Official 195 Worldometer Countries</p>
      </div>`;
  }

  updateLoading(msg) {
    const el = document.getElementById('load-msg');
    if (el) el.textContent = msg;
  }

  hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /*  BRANDING                                                           */
  /* ------------------------------------------------------------------ */

  setBranding(name) {
    this.$('branding').textContent = `\u2605 ${name} \u2605`;
  }
}
