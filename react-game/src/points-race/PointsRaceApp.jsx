import React, { useState, useEffect, useRef, useMemo } from 'react';
import { COUNTRIES } from '../data/countries.js';
import { pointsAudio } from './pointsAudio.js';
import { loadPointsRaceState, savePointsRaceState } from './pointsStorage.js';
import './pointsRace.css';

// SVG Icons (Zero Missing Glyphs Guarantee)
const CrownSvg = () => (
  <svg className="pr-crown-svg" viewBox="0 0 24 24" fill="url(#crownGrad)">
    <defs>
      <linearGradient id="crownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
  </svg>
);

const TrophySvg = () => (
  <svg className="pr-victory-trophy" viewBox="0 0 24 24" fill="url(#trophyGrad)">
    <defs>
      <linearGradient id="trophyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="45%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
    </defs>
    <path d="M19 4h-3V2H8v2H5c-1.1 0-2 .9-2 2v2c0 2.5 1.9 4.6 4.3 4.9.7 1.4 1.9 2.5 3.4 2.9V18H8v2h8v-2h-2.7v-2.2c1.5-.4 2.7-1.5 3.4-2.9 2.4-.3 4.3-2.4 4.3-4.9V6c0-1.1-.9-2-2-2zM5 8V6h3v4.8C6.3 10.4 5 9.4 5 8zm14 0c0 1.4-1.3 2.4-3 2.8V6h3v2z" />
  </svg>
);

const FlameSvg = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="#f97316" style={{ display: 'inline-block', verticalAlign: '-1.5px', marginRight: '3px' }}>
    <path d="M12 23c-4.97 0-9-4.03-9-9 0-3.66 2.22-6.84 5.39-8.23.47-.2.77.34.46.72C7.75 7.84 7.5 9.38 8 10.74c.26.7.99 1.15 1.74.97.87-.21 1.46-.99 1.46-1.89V3.5c0-.46.52-.72.87-.43C15.86 6.06 21 10.97 21 14c0 4.97-4.03 9-9 9z" />
  </svg>
);

export default function PointsRaceApp() {
  const [persistentState, setPersistentState] = useState(loadPointsRaceState);
  const [roundScores, setRoundScores] = useState(() => {
    // Initialize initial scores (clean slate for current round)
    const initial = {};
    COUNTRIES.forEach(c => {
      initial[c.code] = 0;
    });
    return initial;
  });

  const [floatingTags, setFloatingTags] = useState([]);
  const [spotlightUser, setSpotlightUser] = useState(null);
  const [gameState, setGameState] = useState('running'); // 'running' | 'celebrating'
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [nextTimer, setNextTimer] = useState(10);

  const prevLeaderRef = useRef(null);
  const userStreakRef = useRef({});
  const confettiCanvasRef = useRef(null);

  const targetPoints = persistentState.targetPoints || 1000;

  // Build sorted country leaderboard
  const sortedCountries = useMemo(() => {
    return [...COUNTRIES].sort((a, b) => {
      const ptsA = roundScores[a.code] || 0;
      const ptsB = roundScores[b.code] || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return a.name.localeCompare(b.name);
    });
  }, [roundScores]);

  const top1 = sortedCountries[0];
  const top2 = sortedCountries[1];
  const top3 = sortedCountries[2];
  const top4 = sortedCountries[3];
  const restCountries = useMemo(() => sortedCountries.slice(4), [sortedCountries]);

  // Check overtake for sound effects
  useEffect(() => {
    if (top1 && top1.code !== prevLeaderRef.current) {
      if (prevLeaderRef.current !== null && (roundScores[top1.code] || 0) > 0) {
        pointsAudio.playOvertakeChime();
      }
      prevLeaderRef.current = top1.code;
    }
  }, [top1, roundScores]);

  // Handle Score Addition Core Logic
  const handleScoreVote = (countryCode, pointsToAdd, authorName = 'Chatter', isSuperChat = false) => {
    if (gameState === 'celebrating') return;
    const code = countryCode.toUpperCase();
    const country = COUNTRIES.find(c => c.code === code);
    if (!country) return;

    // Check streak
    const now = Date.now();
    const lastVote = userStreakRef.current[authorName] || 0;
    let finalPoints = pointsToAdd;
    let isStreak = false;

    if (!isSuperChat && now - lastVote < 8000) {
      finalPoints = Math.max(2, pointsToAdd * 2);
      isStreak = true;
    }
    userStreakRef.current[authorName] = now;

    // Play corresponding sound
    if (isSuperChat) {
      pointsAudio.playSuperChatFanfare();
    } else if (isStreak) {
      pointsAudio.playStreakChime();
    } else {
      pointsAudio.playVoteChime();
    }

    // Add floating tag
    const tagId = `${Date.now()}_${Math.random()}`;
    const newTag = {
      id: tagId,
      code,
      author: authorName,
      points: finalPoints,
      isSuperChat,
      isStreak
    };
    setFloatingTags(prev => [...prev.slice(-12), newTag]);
    setTimeout(() => {
      setFloatingTags(prev => prev.filter(t => t.id !== tagId));
    }, 1300);

    // Update Round Scores
    setRoundScores(prev => {
      const current = prev[code] || 0;
      const nextScore = current + finalPoints;

      // Check for round win!
      if (nextScore >= targetPoints && gameState === 'running') {
        setTimeout(() => triggerRoundWin(country, authorName, nextScore), 50);
      }
      return { ...prev, [code]: nextScore };
    });

    // Update Spotlight Banner
    setSpotlightUser({
      name: authorName,
      countryCode: code,
      countryName: country.name,
      points: finalPoints,
      action: isSuperChat ? 'Super Chat Boost!' : (isStreak ? '2x Streak Bonus!' : 'Voted +1 Point')
    });

    // Update Persistent Top Fans
    setPersistentState(prev => {
      const fans = [...(prev.topFans || [])];
      const existing = fans.find(f => f.name.toLowerCase() === authorName.toLowerCase());
      if (existing) {
        existing.points += finalPoints;
        existing.flagCode = code;
      } else {
        fans.push({ name: authorName, points: finalPoints, flagCode: code });
      }
      fans.sort((a, b) => b.points - a.points);
      const updated = { ...prev, topFans: fans.slice(0, 5) };
      savePointsRaceState(updated);
      return updated;
    });
  };

  // Trigger Victory Fanfare & Round Transition
  const triggerRoundWin = (winningCountry, mvpUser, finalPoints) => {
    setGameState('celebrating');
    setWinnerInfo({
      country: winningCountry,
      mvp: mvpUser,
      points: finalPoints,
      round: persistentState.round
    });
    pointsAudio.playVictoryFanfare();

    // Spawn Confetti
    launchConfetti();

    // Update Historical Champions & All-Time Scores
    setPersistentState(prev => {
      const code = winningCountry.code;
      const champList = [...(prev.champions || [])];
      const existingChamp = champList.find(c => c.code === code);
      if (existingChamp) {
        existingChamp.winCount = (existingChamp.winCount || 1) + 1;
      } else {
        champList.unshift({ code, winCount: 1 });
      }

      // Add round points to all-time
      const updatedAllTime = { ...(prev.allTimeScores || {}) };
      Object.entries(roundScores).forEach(([cCode, pts]) => {
        updatedAllTime[cCode] = (updatedAllTime[cCode] || 0) + pts;
      });
      updatedAllTime[code] = (updatedAllTime[code] || 0) + finalPoints;

      const newState = {
        ...prev,
        round: (prev.round || 1) + 1,
        champions: champList.slice(0, 15),
        allTimeScores: updatedAllTime
      };
      savePointsRaceState(newState);
      return newState;
    });

    // Countdown 10 seconds to Next Round
    let countdown = 10;
    setNextTimer(countdown);
    const interval = setInterval(() => {
      countdown -= 1;
      setNextTimer(countdown);
      if (countdown <= 0) {
        clearInterval(interval);
        // Reset scores and begin next round
        const freshScores = {};
        COUNTRIES.forEach(c => { freshScores[c.code] = 0; });
        setRoundScores(freshScores);
        setGameState('running');
        setWinnerInfo(null);
      }
    }, 1000);
  };

  // Confetti Particle System
  const launchConfetti = () => {
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 540;
    canvas.height = 960;
    const particles = [];
    const colors = ['#f59e0b', '#ef4444', '#38bdf8', '#22c55e', '#ec4899', '#ffffff'];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * 540,
        y: Math.random() * -960,
        w: 5 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.2,
        opacity: 0.9
      });
    }

    let frame = 0;
    const anim = () => {
      frame++;
      ctx.clearRect(0, 0, 540, 960);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (frame < 260) requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, 540, 960);
    };
    requestAnimationFrame(anim);
  };

  // SSE Live Chat Stream Listener
  useEffect(() => {
    const sse = new EventSource('/api/chat-stream');
    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg) return;

        // Check if vote code exists
        let code = msg.vote?.code;
        let points = msg.vote?.weight || 1;
        let isSuperChat = false;

        if (msg.superChat) {
          isSuperChat = true;
          const amt = (msg.superChat.amountMicros || 2000000) / 1000000;
          if (amt >= 10) points = 1000; // Instant Victory
          else if (amt >= 5) points = 300;
          else points = 50;
        }

        if (code) {
          handleScoreVote(code, points, msg.author || 'Viewer', isSuperChat);
        }
      } catch (e) {}
    };

    return () => sse.close();
  }, [gameState, targetPoints, roundScores]);

  // Expose test hooks for automated verification & simulation
  useEffect(() => {
    window.pointsRace = {
      addPoints: (cCode, pts = 1, author = 'TestFan', isSuper = false) => {
        handleScoreVote(cCode, pts, author, isSuper);
      },
      triggerWinner: (cCode = 'CA') => {
        const c = COUNTRIES.find(x => x.code === cCode.toUpperCase()) || COUNTRIES[0];
        triggerRoundWin(c, 'MVP_SuperFan', targetPoints);
      }
    };
  }, [gameState, targetPoints, roundScores]);

  const leaderPoints = top1 ? (roundScores[top1.code] || 0) : 0;
  const isClimax = leaderPoints >= targetPoints * 0.85;

  return (
    <div className="pr-root">
      {/* ── Top Header ────────────────────────────────────── */}
      <header className="pr-header">
        <h1 className={`pr-title ${isClimax ? 'climax' : ''}`}>
          {leaderPoints > 0
            ? `${top1.name} ${leaderPoints} / ${targetPoints}`
            : `FIRST TO ${targetPoints} POINTS`}
        </h1>
      </header>

      {/* ── Round & Champions Past Strip ──────────────────── */}
      <div className="pr-subbar">
        <span className="pr-round-badge">ROUND {persistentState.round || 1}</span>
        <span className="pr-champions-label">CHAMPIONS</span>
        <div className="pr-champions-strip">
          {(persistentState.champions || []).map((champ, idx) => (
            <div key={`${champ.code}-${idx}`} className="pr-champ-item" title={`${champ.code}: ${champ.winCount || 1} Wins`}>
              <img className="pr-champ-flag" src={`/flags/${champ.code.toLowerCase()}.svg`} alt="" />
              {(champ.winCount || 1) > 1 && (
                <span className="pr-champ-count">x{champ.winCount}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── All-Time Hall of Fame Ticker ──────────────────── */}
      <div className="pr-alltime-bar">
        <span className="pr-alltime-label">ALL TIME:</span>
        <div className="pr-alltime-list">
          {Object.entries(persistentState.allTimeScores || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([code, pts]) => (
              <span key={code} className="pr-alltime-item">
                <img src={`/flags/${code.toLowerCase()}.svg`} alt="" />
                <span>{pts.toLocaleString()}</span>
              </span>
            ))}
        </div>
      </div>

      {/* ── Top Fans MVP Strip ────────────────────────────── */}
      {(persistentState.topFans || []).length > 0 && (
        <div className="pr-topfans-bar">
          {persistentState.topFans.slice(0, 5).map((fan, i) => (
            <div key={i} className="pr-topfan-card" title={fan.name}>
              <div
                className="pr-topfan-avatar"
                style={{
                  background: `linear-gradient(135deg, hsl(${(i * 70) % 360}, 80%, 45%), hsl(${((i * 70) + 40) % 360}, 85%, 60%))`
                }}
              >
                {(fan.name.charAt(0) || '★').toUpperCase()}
              </div>
              <span className="pr-topfan-name">{fan.name}</span>
              <span className="pr-topfan-pts">{fan.points.toLocaleString()} PTS</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Content Leaderboard ──────────────────────── */}
      <main className="pr-body">
        {/* Top 4 Podium Showcase */}
        <section className="pr-podium-showcase">
          {/* #2 Sub-Flag */}
          {top2 && (
            <div className="pr-sub-flag rank-2">
              <div className="pr-flag-box">
                <img src={`/flags/${top2.code.toLowerCase()}.svg`} alt={top2.name} />
              </div>
              <span className="pr-sub-points">{roundScores[top2.code] || 0}</span>
              <span className="pr-sub-name">{top2.name}</span>
            </div>
          )}

          {/* #1 Leader Hero Flag */}
          {top1 && (
            <div className="pr-hero-flag">
              <CrownSvg />
              <div className="pr-flag-box">
                <img src={`/flags/${top1.code.toLowerCase()}.svg`} alt={top1.name} />
              </div>
              <span className="pr-hero-points">{roundScores[top1.code] || 0}</span>
              <span className="pr-hero-name">{top1.name}</span>
            </div>
          )}

          {/* #3 Sub-Flag */}
          {top3 && (
            <div className="pr-sub-flag rank-3">
              <div className="pr-flag-box">
                <img src={`/flags/${top3.code.toLowerCase()}.svg`} alt={top3.name} />
              </div>
              <span className="pr-sub-points">{roundScores[top3.code] || 0}</span>
              <span className="pr-sub-name">{top3.name}</span>
            </div>
          )}

          {/* #4 Sub-Flag */}
          {top4 && (
            <div className="pr-sub-flag rank-4">
              <div className="pr-flag-box">
                <img src={`/flags/${top4.code.toLowerCase()}.svg`} alt={top4.name} />
              </div>
              <span className="pr-sub-points">{roundScores[top4.code] || 0}</span>
              <span className="pr-sub-name">{top4.name}</span>
            </div>
          )}
        </section>

        {/* Mid-Tier Grid (Rows 1 & 2) */}
        <section className="pr-grid-tier">
          {restCountries.slice(0, 18).map(c => (
            <div key={c.code} className="pr-card">
              <div className="pr-card-flag">
                <img src={`/flags/${c.code.toLowerCase()}.svg`} alt={c.name} />
              </div>
              <span className="pr-card-pts">{roundScores[c.code] || 0}</span>
              <span className="pr-card-name">{c.name}</span>
            </div>
          ))}
        </section>

        {/* Central Spotlight / CTA Bar */}
        <div className={`pr-shoutout-bar ${spotlightUser ? '' : 'cta-idle'}`}>
          {spotlightUser ? (
            <>
              <img
                className="pr-shoutout-flag"
                src={`/flags/${spotlightUser.countryCode.toLowerCase()}.svg`}
                alt=""
              />
              <span className="pr-shoutout-user">@{spotlightUser.name}</span>
              <span>·</span>
              <span className="pr-shoutout-pts">+{spotlightUser.points} PTS</span>
            </>
          ) : (
            <>
              <FlameSvg />
              <span>TYPE YOUR COUNTRY OR 🇩🇴 ➔ +1 POINT</span>
            </>
          )}
        </div>

        {/* Lower Tier Grid (Underdog flags) */}
        <section className="pr-grid-tier">
          {restCountries.slice(18, 36).map(c => (
            <div key={c.code} className="pr-card">
              <div className="pr-card-flag">
                <img src={`/flags/${c.code.toLowerCase()}.svg`} alt={c.name} />
              </div>
              <span className="pr-card-pts">{roundScores[c.code] || 0}</span>
              <span className="pr-card-name">{c.name}</span>
            </div>
          ))}
        </section>
      </main>

      {/* ── Floating Live Chat Tags Overlay ───────────────── */}
      <div className="pr-floating-container">
        {floatingTags.map(tag => (
          <div
            key={tag.id}
            className={`pr-float-tag ${tag.isSuperChat ? 'superchat' : ''}`}
            style={{
              top: `${35 + Math.random() * 40}%`,
              left: `${20 + Math.random() * 55}%`
            }}
          >
            <img
              src={`/flags/${tag.code.toLowerCase()}.svg`}
              alt=""
              style={{ width: '12px', height: '8px', borderRadius: '1px' }}
            />
            <span>@{tag.author}</span>
            <span style={{ color: tag.isSuperChat ? '#fef08a' : '#38bdf8' }}>+{tag.points}</span>
          </div>
        ))}
      </div>

      {/* ── Victory Celebration Overlay ───────────────────── */}
      {gameState === 'celebrating' && winnerInfo && (
        <div className="pr-victory-overlay">
          <h2 className="pr-victory-title">ROUND {winnerInfo.round} CHAMPION!</h2>
          <TrophySvg />
          <img
            className="pr-victory-flag"
            src={`/flags/${winnerInfo.country.code.toLowerCase()}.svg`}
            alt={winnerInfo.country.name}
          />
          <div className="pr-victory-name">{winnerInfo.country.name}</div>
          <div className="pr-victory-mvp">
            ROUND MVP: <b>@{winnerInfo.mvp}</b> ({winnerInfo.points} PTS)
          </div>
          <div className="pr-victory-next">
            NEXT ROUND IN <span>{nextTimer}</span>S
          </div>
        </div>
      )}

      {/* Canvas for Confetti */}
      <canvas
        ref={confettiCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 90
        }}
      />
    </div>
  );
}
