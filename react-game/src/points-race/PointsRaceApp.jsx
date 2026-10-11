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
  <svg viewBox="0 0 24 24" width="13" height="13" fill="#f97316" style={{ display: 'inline-block', verticalAlign: '-1.5px', marginRight: '4px' }}>
    <path d="M12 23c-4.97 0-9-4.03-9-9 0-3.66 2.22-6.84 5.39-8.23.47-.2.77.34.46.72C7.75 7.84 7.5 9.38 8 10.74c.26.7.99 1.15 1.74.97.87-.21 1.46-.99 1.46-1.89V3.5c0-.46.52-.72.87-.43C15.86 6.06 21 10.97 21 14c0 4.97-4.03 9-9 9z" />
  </svg>
);

const SwordsSvg = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="#ef4444" style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '4px' }}>
    <path d="M19.7 4.3c-.4-.4-1-.4-1.4 0L14 8.6 11.4 6 10 7.4l2.6 2.6-7.3 7.3V20h2.7l7.3-7.3 2.6 2.6 1.4-1.4-2.6-2.6 4.3-4.3c.4-.4.4-1 0-1.4l-1.3-1.3z" />
  </svg>
);

// High-Engagement YouTube Stream Countries (Audience Priority List)
// Ensures top streaming audience countries are near the top even at 0 points
const POPULAR_COUNTRIES_PRIORITY = [
  'ID', // Indonesia (Huge live audience)
  'BR', // Brazil (Huge live audience)
  'US', // United States
  'BD', // Bangladesh (Top viewer base)
  'IN', // India
  'MX', // Mexico
  'PH', // Philippines
  'PK', // Pakistan
  'TR', // Turkey
  'VN', // Vietnam
  'EG', // Egypt
  'NG', // Nigeria
  'AR', // Argentina
  'CO', // Colombia
  'TH', // Thailand
  'MA', // Morocco
  'IQ', // Iraq
  'RU', // Russia
  'DE', // Germany
  'GB', // United Kingdom
  'FR', // France
  'IT', // Italy
  'ES', // Spain
  'CA', // Canada
  'SA', // Saudi Arabia
  'JP', // Japan
  'KR', // South Korea
  'DZ', // Algeria
  'PE', // Peru
  'MY', // Malaysia
  'PL', // Poland
  'UA', // Ukraine
  'CL', // Chile
  'RO', // Romania
  'NL', // Netherlands
  'AU', // Australia
  'PT', // Portugal
  'ZA', // South Africa
  'SE', // Sweden
  'NP', // Nepal
  'UZ', // Uzbekistan
  'KZ', // Kazakhstan
  'AZ', // Azerbaijan
  'BA', // Bosnia and Herzegovina
  'AL', // Albania
  'IR', // Iran
  'PS', // Palestine
  'EC', // Ecuador
  'CU', // Cuba
  'SV', // El Salvador
  'ET', // Ethiopia
  'GH', // Ghana
  'KE', // Kenya
  'AE', // United Arab Emirates
  'NO', // Norway
  'CH', // Switzerland
  'AT', // Austria
  'BE', // Belgium
  'NZ', // New Zealand
  'IL', // Israel
  'HR', // Croatia
  'RS', // Serbia
  'GR', // Greece
  'CR', // Costa Rica
  'GT', // Guatemala
  'PA', // Panama
  'HN', // Honduras
  'VE', // Venezuela
  'BG', // Bulgaria
  'TN', // Tunisia
  'CZ', // Czechia
  'UY', // Uruguay
  'AM', // Armenia
  'DK', // Denmark
  'IE', // Ireland
  'FI', // Finland
  'SK', // Slovakia
  'BY', // Belarus
  'QA', // Qatar
  'KW', // Kuwait
  'OM', // Oman
  'JO', // Jordan
  'LB', // Lebanon
  'LK', // Sri Lanka
  'MM', // Myanmar
  'KH', // Cambodia
  'MN', // Mongolia
  'BO', // Bolivia
  'PY', // Paraguay
  'GE', // Georgia
  'MD', // Moldova
  'CY', // Cyprus
  'SI', // Slovenia
  'ME', // Montenegro
  'MK', // North Macedonia
  'JM', // Jamaica
  'UG', // Uganda
  'SN', // Senegal
  'CI', // Ivory Coast
  'CM', // Cameroon
  'AO', // Angola
  'MZ', // Mozambique
  'ZW', // Zimbabwe
  'ZM', // Zambia
  'BW', // Botswana
  'SO', // Somalia
  'SD', // Sudan
  'LY', // Libya
  'SY', // Syria
  'YE', // Yemen
  'AF'  // Afghanistan
];

const POPULARITY_INDEX = {};
POPULAR_COUNTRIES_PRIORITY.forEach((code, i) => {
  POPULARITY_INDEX[code] = i;
});

// Default active supporters when starting fresh
const DEFAULT_TOP_FANS = [
  { name: '@AlphaFan', points: 4240, flagCode: 'BD' },
  { name: '@StreamKing', points: 3480, flagCode: 'US' },
  { name: '@FlagMaster', points: 2500, flagCode: 'BR' },
  { name: '@MegaViewer', points: 2320, flagCode: 'ID' },
  { name: '@LiveBooster', points: 2210, flagCode: 'IN' }
];

export default function PointsRaceApp() {
  const [persistentState, setPersistentState] = useState(() => {
    const loaded = loadPointsRaceState();
    if (!loaded.topFans || loaded.topFans.length === 0) {
      loaded.topFans = DEFAULT_TOP_FANS;
    }
    return loaded;
  });

  // Fair play start: every nation in the world has at least 1 point
  const [roundScores, setRoundScores] = useState(() => {
    const initial = {};
    COUNTRIES.forEach(c => {
      initial[c.code] = 1;
    });
    return initial;
  });

  const [floatingTags, setFloatingTags] = useState([]);
  const [spotlightUser, setSpotlightUser] = useState(null);
  const [gameState, setGameState] = useState('running'); // 'running' | 'celebrating'
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [nextTimer, setNextTimer] = useState(10);
  const [isPaused, setIsPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  // Responsive scale hook for 100% fit on any screen / preview iframe without cutoffs
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / 540, h / 960);
      setScale(s > 0 ? s : 1);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Watermark state (synced with settings and live preview)
  const [watermark, setWatermark] = useState(() => {
    if (typeof window !== 'undefined' && window.__liveSettings) {
      const s = window.__liveSettings;
      return {
        text: s.watermark || '@FlagsBattleLive',
        opacity: s.wmOpacity !== undefined ? Number(s.wmOpacity) : 0.15,
        size: s.wmSize !== undefined ? Number(s.wmSize) : 32,
        count: s.wmCount !== undefined ? Number(s.wmCount) : 3,
        angle: s.wmAngle !== undefined ? Number(s.wmAngle) : -15
      };
    }
    return {
      text: '@FlagsBattleLive',
      opacity: 0.15,
      size: 32,
      count: 3,
      angle: -15
    };
  });

  const [hypeEnabled, setHypeEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('hype') === '0' || params.get('hype') === 'false') return false;
      return true; // enabled by default to keep stream active
    }
    return true;
  });

  const [musicActive, setMusicActive] = useState(false);

  const prevLeaderRef = useRef(null);
  const userStreakRef = useRef({});
  const confettiCanvasRef = useRef(null);
  const hasTriggeredShowdownRef = useRef(false);
  const lastRealChatTimeRef = useRef(0);

  const targetPoints = persistentState.targetPoints || 1000;

  // Background Music auto-start & cleanup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const musicParam = params.get('music');
    if (musicParam !== '0' && musicParam !== 'false') {
      const enableMusic = () => {
        pointsAudio.playBgMusic();
        setMusicActive(true);
        window.removeEventListener('click', enableMusic);
      };
      window.addEventListener('click', enableMusic);
      try {
        pointsAudio.playBgMusic();
        setMusicActive(true);
      } catch (e) {}
    }
    return () => pointsAudio.pauseBgMusic();
  }, []);

  // Build sorted country leaderboard with audience popularity tiebreaker
  const sortedCountries = useMemo(() => {
    return [...COUNTRIES].sort((a, b) => {
      const ptsA = roundScores[a.code] || 0;
      const ptsB = roundScores[b.code] || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      // High-engagement countries stay near the top for viewers
      const popA = POPULARITY_INDEX[a.code] ?? 999;
      const popB = POPULARITY_INDEX[b.code] ?? 999;
      if (popA !== popB) return popA - popB;
      return a.name.localeCompare(b.name);
    });
  }, [roundScores]);

  const top1 = sortedCountries[0];
  const top2 = sortedCountries[1];
  const top1Points = top1 ? (roundScores[top1.code] || 0) : 0;
  const top2Points = top2 ? (roundScores[top2.code] || 0) : 0;

  // Roundup Match condition: Leader >= 750 (75%) or close top-2 duel >= 600
  const isRoundupShowdown = top1Points >= (targetPoints * 0.75) || (top1Points >= 600 && (top1Points - top2Points <= 50));
  const isClimax = top1Points >= (targetPoints * 0.90);

  // Escalate music BPM during Roundup Showdown
  useEffect(() => {
    if (isRoundupShowdown) {
      pointsAudio.setMusicIntensity('showdown');
    } else {
      pointsAudio.setMusicIntensity('normal');
    }
  }, [isRoundupShowdown]);

  // Trigger showdown audio alert once
  useEffect(() => {
    if (isRoundupShowdown && !hasTriggeredShowdownRef.current) {
      hasTriggeredShowdownRef.current = true;
      pointsAudio.playShowdownAlarm();
    } else if (!isRoundupShowdown) {
      hasTriggeredShowdownRef.current = false;
    }
  }, [isRoundupShowdown]);

  // Podium (Top 12): #1 Leader + Ranks 2-12
  const top12 = useMemo(() => sortedCountries.slice(0, 12), [sortedCountries]);
  // Mid Tier Grid: Ranks 13-108 (96 flags = 8 rows × 12 columns)
  const midTierGrid = useMemo(() => sortedCountries.slice(12, 108), [sortedCountries]);
  // Lower Tier Grid: Ranks 109-180 (72 flags = 6 rows × 12 columns)
  const lowerTierGrid = useMemo(() => sortedCountries.slice(108, 180), [sortedCountries]);

  // Check overtake for sound effects
  useEffect(() => {
    if (top1 && top1.code !== prevLeaderRef.current) {
      if (prevLeaderRef.current !== null && top1Points > 0) {
        pointsAudio.playOvertakeChime();
      }
      prevLeaderRef.current = top1.code;
    }
  }, [top1, top1Points]);

  // Handle Score Addition Core Logic
  const handleScoreVote = (countryCode, pointsToAdd, authorName = 'Chatter', isSuperChat = false) => {
    if (gameState === 'celebrating' || isPaused) return;
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

    // Add floating tag reaction pill
    const tagId = `${Date.now()}_${Math.random()}`;
    const newTag = {
      id: tagId,
      code,
      countryName: country.name,
      author: authorName,
      points: finalPoints,
      isSuperChat,
      isStreak
    };
    setFloatingTags(prev => [...prev.slice(-8), newTag]);
    setTimeout(() => {
      setFloatingTags(prev => prev.filter(t => t.id !== tagId));
    }, 1400);

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
      round: persistentState.round || 1
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
        // Reset scores and begin next round (All flags get 1 point for fair play)
        const freshScores = {};
        COUNTRIES.forEach(c => { freshScores[c.code] = 1; });
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
          lastRealChatTimeRef.current = Date.now();
          handleScoreVote(code, points, msg.author || 'Viewer', isSuperChat);
        }
      } catch (e) {}
    };

    return () => sse.close();
  }, [gameState, targetPoints, roundScores, isPaused]);

  // Background Simulated Chat Hype Loop
  // Creates live social proof, competition, and ensures ALL flags receive points for fair gameplay
  useEffect(() => {
    if (!hypeEnabled || gameState === 'celebrating' || isPaused) return;

    const SIMULATED_CHATTERS = [
      { name: '@DamianEdwards-B72', bias: ['PH', 'US', 'CA'] },
      { name: '@UttamDas-qj8li', bias: ['IN', 'BD', 'NP'] },
      { name: '@ShymayGordon', bias: ['PH', 'GB', 'AU'] },
      { name: '@Дружбу', bias: ['AM', 'KZ', 'RU'] },
      { name: '@Rahim_BD', bias: ['BD', 'PK', 'TR'] },
      { name: '@Carlos_BR', bias: ['BR', 'MX', 'PT'] },
      { name: '@Mustafa_TR', bias: ['TR', 'AZ', 'DE'] },
      { name: '@Farhan_PK', bias: ['PK', 'SA', 'AE'] },
      { name: '@Eko_ID', bias: ['ID', 'MY', 'VN'] },
      { name: '@Ahmed_EG', bias: ['EG', 'DZ', 'MA'] }
    ];

    const baseDelay = (2500 + Math.random() * 1500) / (speedMultiplier || 1);
    const hypeTimer = setInterval(() => {
      if (isPaused) return;
      // If a real human chatted within the last 15 seconds, pause simulation
      const timeSinceReal = Date.now() - (lastRealChatTimeRef.current || 0);
      if (timeSinceReal < 15000) return;

      const chatter = SIMULATED_CHATTERS[Math.floor(Math.random() * SIMULATED_CHATTERS.length)];
      
      // Fair gameplay check: prioritize flags that currently have 1 point or less
      const lowScoreCountries = COUNTRIES.filter(c => (roundScores[c.code] || 0) <= 1);
      let targetCode;
      let fanName = chatter.name;

      if (lowScoreCountries.length > 0 && Math.random() < 0.45) {
        const pick = lowScoreCountries[Math.floor(Math.random() * lowScoreCountries.length)];
        targetCode = pick.code;
        fanName = `@${pick.name.replace(/\s+/g, '')}Fan`;
      } else if (Math.random() < 0.65 && top1) {
        const contenders = [top1.code, top2?.code, sortedCountries[2]?.code, sortedCountries[3]?.code].filter(Boolean);
        targetCode = contenders[Math.floor(Math.random() * contenders.length)];
      } else {
        targetCode = chatter.bias[Math.floor(Math.random() * chatter.bias.length)];
      }

      handleScoreVote(targetCode, 1, fanName, false);
    }, Math.max(500, baseDelay));

    return () => clearInterval(hypeTimer);
  }, [hypeEnabled, gameState, isPaused, speedMultiplier, top1, top2, sortedCountries, roundScores]);

  // Expose comprehensive Director hooks & parent window message bus
  useEffect(() => {
    window.pointsRace = {
      start: () => setIsPaused(false),
      resume: () => setIsPaused(false),
      pause: () => setIsPaused(true),
      togglePause: () => {
        let next;
        setIsPaused(prev => { next = !prev; return next; });
        return next;
      },
      reset: () => {
        const freshScores = {};
        COUNTRIES.forEach(c => { freshScores[c.code] = 1; });
        setRoundScores(freshScores);
        setGameState('running');
        setWinnerInfo(null);
        setIsPaused(false);
      },
      resetSupporters: () => {
        const freshState = {
          round: 1,
          targetPoints: 1000,
          champions: [],
          topFans: DEFAULT_TOP_FANS,
          allTimeScores: {}
        };
        setPersistentState(freshState);
        savePointsRaceState(freshState);
      },
      setSpeed: (val) => {
        setSpeedMultiplier(Number(val) || 1);
      },
      setWatermark: (wm) => {
        setWatermark(prev => ({ ...prev, ...wm }));
      },
      setSettings: (s) => {
        if (!s) return;
        if (s.watermark !== undefined) setWatermark(prev => ({ ...prev, text: s.watermark }));
        if (s.wmOpacity !== undefined) setWatermark(prev => ({ ...prev, opacity: Number(s.wmOpacity) }));
        if (s.wmSize !== undefined) setWatermark(prev => ({ ...prev, size: Number(s.wmSize) }));
        if (s.wmCount !== undefined) setWatermark(prev => ({ ...prev, count: Number(s.wmCount) }));
        if (s.wmAngle !== undefined) setWatermark(prev => ({ ...prev, angle: Number(s.wmAngle) }));
        if (s.speed !== undefined) setSpeedMultiplier(Number(s.speed) || 1);
        if (s.targetPoints !== undefined) {
          setPersistentState(prev => {
            const u = { ...prev, targetPoints: Number(s.targetPoints) };
            savePointsRaceState(u);
            return u;
          });
        }
        if (s.musicVol !== undefined) pointsAudio.setBgVolume(Number(s.musicVol));
        if (s.customMusicUrl) {
          pointsAudio.loadBgMusic(s.customMusicUrl);
          pointsAudio.playBgMusic();
          setMusicActive(true);
        }
      },
      addPoints: (cCode, pts = 1, author = 'TestFan', isSuper = false) => {
        handleScoreVote(cCode, pts, author, isSuper);
      },
      triggerWinner: (cCode = 'CA') => {
        const c = COUNTRIES.find(x => x.code === cCode.toUpperCase()) || COUNTRIES[0];
        triggerRoundWin(c, 'MVP_SuperFan', targetPoints);
      },
      toggleMusic: () => {
        const active = pointsAudio.toggleBgMusic();
        setMusicActive(active);
        return active;
      },
      toggleHype: (val) => {
        setHypeEnabled(prev => typeof val === 'boolean' ? val : !prev);
      }
    };
  }, [gameState, targetPoints, roundScores, isPaused]);

  // Listen to parent Director messages (postMessage)
  useEffect(() => {
    const handleMsg = (e) => {
      if (!e.data) return;
      if (e.data.type === 'DIRECTOR_CMD') {
        const cmd = e.data.cmd;
        if (cmd === 'start') window.pointsRace?.resume();
        else if (cmd === 'pause') window.pointsRace?.togglePause();
        else if (cmd === 'reset') window.pointsRace?.reset();
        else if (cmd === 'clear_supporters') window.pointsRace?.resetSupporters();
        else if (cmd === 'mute') pointsAudio.toggleMute();
      } else if (e.data.type === 'LIVE_SETTINGS_UPDATE' && e.data.settings) {
        window.pointsRace?.setSettings(e.data.settings);
      } else if (e.data.type === 'RESET_SUPPORTERS') {
        window.pointsRace?.resetSupporters();
      } else if (e.data.type === 'MUSIC_UPDATE' && e.data.src) {
        pointsAudio.loadBgMusic(e.data.src);
        pointsAudio.playBgMusic();
        setMusicActive(true);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  const isClean = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('clean') === 'true';

  return (
    <div className="pr-viewport">
      <div
        className="pr-root"
        style={{
          width: '540px',
          height: '960px',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0
        }}
      >
        {/* Paused Indicator */}
        {isPaused && (
          <div className="pr-paused-badge">
            <span>⏸ MATCH PAUSED</span>
          </div>
        )}

        {/* Branding & Watermark Layer */}
        {watermark.opacity > 0 && watermark.text && (
          <div className="pr-watermark-layer" style={{ opacity: watermark.opacity }}>
            {Array.from({ length: Math.max(1, watermark.count || 3) }).map((_, i) => (
              <span
                key={i}
                className="pr-watermark-text"
                style={{
                  fontSize: `${watermark.size || 32}px`,
                  transform: `rotate(${watermark.angle || -15}deg)`
                }}
              >
                {watermark.text}
              </span>
            ))}
          </div>
        )}
      {/* ── 1. Top Header ────────────────────────────────────── */}
      <header className="pr-header">
        <h1 className={`pr-title ${isClimax ? 'climax' : ''}`}>
          {top1Points > 0
            ? `${top1.name} ${top1Points} / ${targetPoints}`
            : `FIRST TO ${targetPoints} POINTS`}
        </h1>
        {!isClean && (
          <div className="pr-header-actions">
            <button
              className={`pr-action-btn ${musicActive ? 'active' : ''}`}
              onClick={() => {
                const active = pointsAudio.toggleBgMusic();
                setMusicActive(active);
              }}
              title="Toggle Background Music"
            >
              {musicActive ? '🎵 MUSIC ON' : '🔇 MUSIC OFF'}
            </button>
            <button
              className={`pr-action-btn ${hypeEnabled ? 'active' : ''}`}
              onClick={() => setHypeEnabled(!hypeEnabled)}
              title="Toggle Live Chat Hype Engine"
            >
              {hypeEnabled ? '⚡ HYPE ON' : '💤 HYPE OFF'}
            </button>
          </div>
        )}
      </header>

      {/* ── 2. Top Fans & Round Info Row ────────────────────── */}
      <div className="pr-top-bar">
        <div className="pr-round-col">
          <div className="pr-round-text">ROUND {persistentState.round || 1}</div>
          <div className="pr-topfans-text">TOP FANS</div>
        </div>

        <div className="pr-topfans-row">
          {(persistentState.topFans || DEFAULT_TOP_FANS).slice(0, 5).map((fan, i) => (
            <div key={i} className="pr-topfan-card" title={`${fan.name}: ${fan.points} PTS`}>
              <div
                className="pr-topfan-avatar"
                style={{
                  background: `linear-gradient(135deg, hsl(${(i * 68 + 20) % 360}, 80%, 48%), hsl(${(i * 68 + 70) % 360}, 85%, 62%))`
                }}
              >
                {(fan.name.replace(/^@/, '').charAt(0) || '★').toUpperCase()}
              </div>
              <span className="pr-topfan-name">{fan.name}</span>
              <span className="pr-topfan-pts">{fan.points.toLocaleString()} PTS</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Roundup Match Showdown Tug-of-War Bar ────────── */}
      {isRoundupShowdown ? (
        <div className="pr-showdown-bar">
          <div className="pr-showdown-header">
            <SwordsSvg />
            <span>ROUNDUP SHOWDOWN • DUEL TO {targetPoints}</span>
            <SwordsSvg />
          </div>
          <div className="pr-showdown-duel">
            <div className="pr-duel-team team-1">
              <img src={`/flags/${top1.code.toLowerCase()}.svg`} alt="" />
              <span className="pr-duel-name">{top1.name}</span>
              <span className="pr-duel-pts">{top1Points}</span>
            </div>
            <div className="pr-duel-bar-wrap">
              <div
                className="pr-duel-bar-fill"
                style={{
                  width: `${Math.min(95, Math.max(5, (top1Points / (top1Points + top2Points || 1)) * 100))}%`
                }}
              />
              <span className="pr-duel-vs">VS</span>
            </div>
            <div className="pr-duel-team team-2">
              <span className="pr-duel-pts">{top2Points}</span>
              <span className="pr-duel-name">{top2?.name || 'Contender'}</span>
              <img src={`/flags/${(top2?.code || 'US').toLowerCase()}.svg`} alt="" />
            </div>
          </div>
        </div>
      ) : (
        /* Past Champions Mini Ribbon when not in showdown */
        persistentState.champions && persistentState.champions.length > 0 && (
          <div className="pr-champs-ribbon">
            <span className="pr-champs-title">CHAMPIONS:</span>
            <div className="pr-champs-list">
              {persistentState.champions.slice(0, 8).map((champ, idx) => (
                <div key={idx} className="pr-champ-item" title={`${champ.code}: ${champ.winCount || 1} wins`}>
                  <img src={`/flags/${champ.code.toLowerCase()}.svg`} alt="" />
                  {(champ.winCount || 1) > 1 && (
                    <span className="pr-champ-badge">x{champ.winCount}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── 4. Main Battle Arena ────────────────────────────── */}
      <main className="pr-body">
        {/* Top 10 Row (Podium Row) */}
        <section className="pr-podium-row">
          {/* #1 Leader with Crown */}
          {top1 && (
            <div className="pr-podium-leader" title={`#1 ${top1.name} (${top1Points} PTS)`}>
              <CrownSvg />
              <div className="pr-leader-flag-box">
                <img src={`/flags/${top1.code.toLowerCase()}.svg`} alt={top1.name} />
              </div>
              <span className="pr-leader-pts">{top1Points}</span>
              <span className="pr-leader-name">{top1.name}</span>
            </div>
          )}

          {/* Ranks 2 to 12 */}
          <div className="pr-podium-rest">
            {top12.slice(1).map(c => {
              const pts = roundScores[c.code] || 0;
              return (
                <div key={c.code} className="pr-flag-item rank-top" title={`${c.name}: ${pts} PTS`}>
                  <div className="pr-flag-box">
                    <img src={`/flags/${c.code.toLowerCase()}.svg`} alt={c.name} />
                  </div>
                  <span className="pr-flag-pts">{pts}</span>
                  <span className="pr-flag-name">{c.name}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Upper Grid (96 Flags = 8 Rows × 12 Columns) */}
        <section className="pr-grid-tier grid-upper">
          {midTierGrid.map(c => {
            const pts = roundScores[c.code] || 0;
            return (
              <div key={c.code} className="pr-flag-item" title={`${c.name}: ${pts} PTS`}>
                <div className="pr-flag-box">
                  <img src={`/flags/${c.code.toLowerCase()}.svg`} alt={c.name} />
                </div>
                <span className="pr-flag-pts">{pts}</span>
                <span className="pr-flag-name">{c.name}</span>
              </div>
            );
          })}
        </section>

        {/* Central Spotlight / CTA Bar */}
        <div className={`pr-shoutout-bar ${spotlightUser ? 'active-vote' : 'cta-idle'}`}>
          {spotlightUser ? (
            <>
              <img
                className="pr-shoutout-flag"
                src={`/flags/${spotlightUser.countryCode.toLowerCase()}.svg`}
                alt=""
              />
              <span className="pr-shoutout-user">@{spotlightUser.name}</span>
              <span className="pr-shoutout-dot">•</span>
              <span className="pr-shoutout-pts">+{spotlightUser.points} PTS</span>
            </>
          ) : (
            <>
              <FlameSvg />
              <span>
                TYPE YOUR COUNTRY OR <img src="/flags/bd.svg" className="pr-cta-inline-flag" alt="BD" /> ➔ +1 POINT
              </span>
            </>
          )}
        </div>

        {/* Lower Grid (72 Flags = 6 Rows × 12 Columns) */}
        <section className="pr-grid-tier grid-lower">
          {lowerTierGrid.map(c => {
            const pts = roundScores[c.code] || 0;
            return (
              <div key={c.code} className="pr-flag-item" title={`${c.name}: ${pts} PTS`}>
                <div className="pr-flag-box">
                  <img src={`/flags/${c.code.toLowerCase()}.svg`} alt={c.name} />
                </div>
                <span className="pr-flag-pts">{pts}</span>
                <span className="pr-flag-name">{c.name}</span>
              </div>
            );
          })}
        </section>
      </main>

      {/* ── 5. Floating Live Chat Tags Overlay ───────────────── */}
      <div className="pr-floating-container">
        {floatingTags.map(tag => (
          <div
            key={tag.id}
            className={`pr-float-tag ${tag.isSuperChat ? 'superchat' : ''}`}
            style={{
              top: `${26 + Math.random() * 45}%`,
              left: `${15 + Math.random() * 60}%`
            }}
          >
            <img
              src={`/flags/${tag.code.toLowerCase()}.svg`}
              alt=""
              style={{ width: '13px', height: '9px', borderRadius: '1.5px', objectFit: 'cover' }}
            />
            <span>@{tag.author}</span>
            <span style={{ color: tag.isSuperChat ? '#fef08a' : '#38bdf8', fontWeight: 800 }}>+{tag.points}</span>
          </div>
        ))}
      </div>

      {/* ── 6. Victory Celebration Overlay ───────────────────── */}
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
    </div>
  );
}
