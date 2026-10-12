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

const ShieldSvg = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="#38bdf8" style={{ display: 'inline-block', verticalAlign: '-1.5px', marginRight: '4px' }}>
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
  </svg>
);

// Continental / Team Alliances for Teamup Tournament Gameplay
export const ALLIANCES = [
  {
    id: 'AMER',
    name: 'Americas',
    fullName: 'Team Americas 🌎',
    icon: '🌎',
    color: '#38bdf8',
    gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)',
    border: '#38bdf8',
    countries: ['US', 'BR', 'MX', 'CA', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'JM', 'TT', 'HT', 'BS', 'BB', 'BZ', 'GY', 'SR']
  },
  {
    id: 'ASIA',
    name: 'Asia-Oceania',
    fullName: 'Team Asia & Oceania 🌏',
    icon: '🌏',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #d97706, #fbbf24)',
    border: '#f59e0b',
    countries: ['BD', 'IN', 'ID', 'PK', 'PH', 'VN', 'JP', 'KR', 'CN', 'TH', 'MY', 'AU', 'NZ', 'NP', 'LK', 'MM', 'KH', 'SG', 'MN', 'AF', 'UZ', 'KZ', 'LA', 'TW', 'HK', 'PG', 'FJ', 'BT', 'MV']
  },
  {
    id: 'EURO',
    name: 'Europe',
    fullName: 'Team Europe 🌍',
    icon: '🌍',
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, #7e22ce, #c084fc)',
    border: '#a855f7',
    countries: ['GB', 'DE', 'FR', 'IT', 'ES', 'TR', 'RU', 'NL', 'UA', 'PL', 'RO', 'BE', 'CZ', 'GR', 'PT', 'SE', 'HU', 'BY', 'AT', 'CH', 'BG', 'DK', 'FI', 'SK', 'NO', 'IE', 'HR', 'BA', 'RS', 'AL', 'XK', 'LT', 'SI', 'LV', 'EE', 'CY', 'LU', 'MT', 'IS', 'MD', 'GE', 'AM', 'AZ']
  },
  {
    id: 'AFME',
    name: 'Africa & MidEast',
    fullName: 'Team Africa & Mid-East 🌍',
    icon: '🌍',
    color: '#22c55e',
    gradient: 'linear-gradient(135deg, #15803d, #4ade80)',
    border: '#22c55e',
    countries: ['EG', 'NG', 'ZA', 'DZ', 'MA', 'SA', 'AE', 'KE', 'GH', 'ET', 'TZ', 'UG', 'AO', 'MZ', 'CI', 'SN', 'CM', 'ZW', 'ZM', 'TN', 'LY', 'SD', 'SO', 'IQ', 'IR', 'IL', 'JO', 'LB', 'SY', 'YE', 'QA', 'KW', 'OM', 'BH']
  }
];

export function getCountryAlliance(code) {
  const c = (code || '').toUpperCase();
  for (const a of ALLIANCES) {
    if (a.countries.includes(c)) return a;
  }
  const idx = ((c.charCodeAt(0) || 0) + (c.charCodeAt(1) || 0)) % ALLIANCES.length;
  return ALLIANCES[idx];
}

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

  // Target points to qualify / win — defaults to 50 as requested!
  const targetPoints = persistentState.targetPoints || 50;

  // ── TOURNAMENT STAGES: 'qualifiers' (Stage 1) | 'playoffs' (Stage 2) | 'finals' (Stage 3) | 'celebrating' (Stage 4) ──
  const [tournamentStage, setTournamentStage] = useState('qualifiers');
  const [qualifiers, setQualifiers] = useState([]); // 4 continental qualified nations
  const [finalists, setFinalists] = useState([]);   // 2 grand finalists
  const [playoffScores, setPlayoffScores] = useState({});
  const [finalsScores, setFinalsScores] = useState({});

  // Flash Announcement Banner Toast
  const [stageBanner, setStageBanner] = useState({
    title: 'STAGE 1: TEAMUP QUALIFIERS',
    subtitle: `First Country from Each Continent to ${targetPoints} PTS Advances!`,
    color: '#38bdf8'
  });

  // Auto-hide stage announcement banner after 3.8s
  useEffect(() => {
    if (!stageBanner) return;
    const t = setTimeout(() => setStageBanner(null), 3800);
    return () => clearTimeout(t);
  }, [stageBanner]);

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

  // Build sorted country leaderboard with audience popularity tiebreaker (Stage 1)
  const sortedCountries = useMemo(() => {
    return [...COUNTRIES].sort((a, b) => {
      const ptsA = roundScores[a.code] || 0;
      const ptsB = roundScores[b.code] || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
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

  // Continental Alliances Summary (Stage 1)
  const allianceLeaderboard = useMemo(() => {
    return ALLIANCES.map(alliance => {
      const members = COUNTRIES.filter(c => alliance.countries.includes(c.code));
      let leader = members[0];
      let maxPts = -1;
      members.forEach(m => {
        const pts = roundScores[m.code] || 0;
        if (pts > maxPts) {
          maxPts = pts;
          leader = m;
        }
      });
      const isQual = qualifiers.some(q => q.allianceId === alliance.id);
      const qualObj = qualifiers.find(q => q.allianceId === alliance.id);
      return {
        alliance,
        leader: qualObj ? qualObj : leader,
        points: qualObj ? targetPoints : Math.max(0, maxPts),
        isQualified: isQual
      };
    });
  }, [roundScores, qualifiers, targetPoints]);

  // Dynamic Audio Intensity based on Stage
  useEffect(() => {
    if (tournamentStage === 'finals' || tournamentStage === 'playoffs') {
      pointsAudio.setMusicIntensity('showdown');
    } else {
      pointsAudio.setMusicIntensity('normal');
    }
  }, [tournamentStage]);

  // Podium (Top 12) & Grids for Stage 1
  const top12 = useMemo(() => sortedCountries.slice(0, 12), [sortedCountries]);
  const midTierGrid = useMemo(() => sortedCountries.slice(12, 108), [sortedCountries]);
  const lowerTierGrid = useMemo(() => sortedCountries.slice(108, 180), [sortedCountries]);

  // Check overtake for sound effects in Stage 1
  useEffect(() => {
    if (tournamentStage === 'qualifiers' && top1 && top1.code !== prevLeaderRef.current) {
      if (prevLeaderRef.current !== null && top1Points > 0) {
        pointsAudio.playOvertakeChime();
      }
      prevLeaderRef.current = top1.code;
    }
  }, [tournamentStage, top1, top1Points]);

  // Transition Stage 1 -> Stage 2 (Playoffs)
  const transitionToPlayoffs = (qualsList) => {
    let finalQuals = [...(qualsList || [])];
    if (finalQuals.length < 4) {
      ALLIANCES.forEach(alliance => {
        if (!finalQuals.some(q => q.allianceId === alliance.id)) {
          const members = COUNTRIES.filter(c => alliance.countries.includes(c.code));
          const leader = members.sort((a,b) => (roundScores[b.code]||0) - (roundScores[a.code]||0))[0] || members[0];
          finalQuals.push({
            ...leader,
            allianceId: alliance.id,
            allianceName: alliance.name,
            allianceColor: alliance.color,
            qualifierPoints: roundScores[leader.code] || 1
          });
        }
      });
    }
    const initPlayoffs = {};
    finalQuals.slice(0, 4).forEach(q => { initPlayoffs[q.code] = 0; });
    setQualifiers(finalQuals.slice(0, 4));
    setPlayoffScores(initPlayoffs);
    setTournamentStage('playoffs');
    pointsAudio.playShowdownAlarm();
    setStageBanner({
      title: 'STAGE 2: QUALIFIERS PLAYOFF',
      subtitle: `4 Continental Champions Battle to ${targetPoints} Points!`,
      color: '#f59e0b'
    });
  };

  // Transition Stage 2 -> Stage 3 (Finals)
  const transitionToFinals = (finList) => {
    let finalFin = [...(finList || [])];
    if (finalFin.length < 2) {
      const sortedQ = [...qualifiers].sort((a,b) => (playoffScores[b.code]||0) - (playoffScores[a.code]||0));
      finalFin = [sortedQ[0] || qualifiers[0], sortedQ[1] || qualifiers[1]];
    }
    const initFinals = {};
    finalFin.slice(0, 2).forEach(f => { initFinals[f.code] = 0; });
    setFinalists(finalFin.slice(0, 2));
    setFinalsScores(initFinals);
    setTournamentStage('finals');
    pointsAudio.playShowdownAlarm();
    setStageBanner({
      title: 'STAGE 3: GRAND FINAL SHOWDOWN',
      subtitle: `${finalFin[0]?.name || 'Finalist 1'} VS ${finalFin[1]?.name || 'Finalist 2'} — 1v1 DUEL TO ${targetPoints}!`,
      color: '#ef4444'
    });
  };

  // Grand Champion Celebration
  const triggerGrandChampion = (winningCountry, mvpUser, finalPoints) => {
    setTournamentStage('celebrating');
    setWinnerInfo({
      country: winningCountry,
      mvp: mvpUser,
      points: finalPoints,
      round: persistentState.round || 1
    });
    pointsAudio.playVictoryFanfare();
    launchConfetti();

    setPersistentState(prev => {
      const code = winningCountry.code;
      const champList = [...(prev.champions || [])];
      const existingChamp = champList.find(c => c.code === code);
      if (existingChamp) {
        existingChamp.winCount = (existingChamp.winCount || 1) + 1;
      } else {
        champList.unshift({ code, winCount: 1 });
      }
      const updatedAllTime = { ...(prev.allTimeScores || {}) };
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

    let countdown = 10;
    setNextTimer(countdown);
    const interval = setInterval(() => {
      countdown -= 1;
      setNextTimer(countdown);
      if (countdown <= 0) {
        clearInterval(interval);
        // Reset scores and restart next tournament
        const freshScores = {};
        COUNTRIES.forEach(c => { freshScores[c.code] = 1; });
        setRoundScores(freshScores);
        setQualifiers([]);
        setFinalists([]);
        setPlayoffScores({});
        setFinalsScores({});
        setTournamentStage('qualifiers');
        setWinnerInfo(null);
        setStageBanner({
          title: 'STAGE 1: TEAMUP QUALIFIERS',
          subtitle: `First to ${targetPoints} Points from Each Continent Advances!`,
          color: '#38bdf8'
        });
      }
    }, 1000);
  };

  // Handle Score Vote Core Engine
  const handleScoreVote = (countryCode, pointsToAdd, authorName = 'Chatter', isSuperChat = false) => {
    if (tournamentStage === 'celebrating' || isPaused) return;
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

    // Sound effects
    if (isSuperChat) {
      pointsAudio.playSuperChatFanfare();
    } else if (isStreak) {
      pointsAudio.playStreakChime();
    } else {
      pointsAudio.playVoteChime();
    }

    // Reaction pill
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

    // Spotlight banner
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

    // ── MULTI-STAGE LOGIC ──────────────────────────────────
    if (tournamentStage === 'qualifiers') {
      // STAGE 1: TEAMUP QUALIFIERS (First to targetPoints qualifies)
      setRoundScores(prev => {
        const current = prev[code] || 0;
        const nextScore = current + finalPoints;
        const alliance = getCountryAlliance(code);

        if (nextScore >= targetPoints) {
          setQualifiers(qPrev => {
            const alreadyHasAlliance = qPrev.some(q => q.allianceId === alliance.id);
            if (!alreadyHasAlliance) {
              const newQual = {
                ...country,
                allianceId: alliance.id,
                allianceName: alliance.name,
                allianceColor: alliance.color,
                qualifierPoints: nextScore
              };
              pointsAudio.playQualifierChime();
              setStageBanner({
                title: `🎉 ${country.name.toUpperCase()} QUALIFIED!`,
                subtitle: `Clinches the ${alliance.fullName} Playoff Spot!`,
                color: alliance.color
              });

              const updatedQ = [...qPrev, newQual];
              if (updatedQ.length >= 4) {
                setTimeout(() => transitionToPlayoffs(updatedQ), 1200);
              }
              return updatedQ;
            }
            return qPrev;
          });
        }
        return { ...prev, [code]: nextScore };
      });
    } else if (tournamentStage === 'playoffs') {
      // STAGE 2: QUALIFIERS PLAYOFF (4 Continents battle to targetPoints)
      const isQualifier = qualifiers.some(q => q.code === code);
      if (isQualifier) {
        setPlayoffScores(prev => {
          const current = prev[code] || 0;
          const nextScore = current + finalPoints;

          if (nextScore >= targetPoints) {
            setFinalists(fPrev => {
              const alreadyFinalist = fPrev.some(f => f.code === code);
              if (!alreadyFinalist) {
                const contenderObj = qualifiers.find(q => q.code === code) || country;
                pointsAudio.playQualifierChime();
                setStageBanner({
                  title: `🏅 ${country.name.toUpperCase()} ADVANCES TO GRAND FINAL!`,
                  subtitle: `Reached ${targetPoints} Points in Playoff!`,
                  color: '#f59e0b'
                });
                const updatedF = [...fPrev, { ...contenderObj, playoffScore: nextScore }];
                if (updatedF.length >= 2) {
                  setTimeout(() => transitionToFinals(updatedF), 1200);
                }
                return updatedF;
              }
              return fPrev;
            });
          }
          return { ...prev, [code]: nextScore };
        });
      } else {
        // Boost alliance qualifier if non-qualifier was cheered
        const cAlliance = getCountryAlliance(code);
        const allianceChamp = qualifiers.find(q => q.allianceId === cAlliance.id);
        if (allianceChamp) {
          setPlayoffScores(prev => ({
            ...prev,
            [allianceChamp.code]: (prev[allianceChamp.code] || 0) + 1
          }));
        }
      }
    } else if (tournamentStage === 'finals') {
      // STAGE 3: GRAND FINAL SHOWDOWN (1v1 Duel to targetPoints)
      const isFinalist = finalists.some(f => f.code === code);
      if (isFinalist) {
        setFinalsScores(prev => {
          const current = prev[code] || 0;
          const nextScore = current + finalPoints;
          if (nextScore >= targetPoints) {
            setTimeout(() => triggerGrandChampion(country, authorName, nextScore), 50);
          }
          return { ...prev, [code]: nextScore };
        });
      }
    }
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
    const profileParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('profile') : null;
    const streamUrl = profileParam ? `/api/chat-stream?profile=${encodeURIComponent(profileParam)}` : '/api/chat-stream';
    const sse = new EventSource(streamUrl);
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
          if (amt >= 10) points = targetPoints; // Instant Qualification / Win
          else if (amt >= 5) points = Math.min(targetPoints, 25);
          else points = 10;
        }

        if (code) {
          lastRealChatTimeRef.current = Date.now();
          handleScoreVote(code, points, msg.author || 'Viewer', isSuperChat);
        }
      } catch (e) {}
    };

    return () => sse.close();
  }, [tournamentStage, targetPoints, roundScores, playoffScores, finalsScores, isPaused, qualifiers, finalists]);

  // Background Simulated Chat Hype Loop (Multi-Stage Aware)
  useEffect(() => {
    if (!hypeEnabled || tournamentStage === 'celebrating' || isPaused) return;

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

    const baseDelay = (2200 + Math.random() * 1200) / (speedMultiplier || 1);
    const hypeTimer = setInterval(() => {
      if (isPaused) return;
      const timeSinceReal = Date.now() - (lastRealChatTimeRef.current || 0);
      if (timeSinceReal < 15000) return;

      const chatter = SIMULATED_CHATTERS[Math.floor(Math.random() * SIMULATED_CHATTERS.length)];
      let targetCode;
      let fanName = chatter.name;

      if (tournamentStage === 'qualifiers') {
        const unqualAlliances = ALLIANCES.filter(a => !qualifiers.some(q => q.allianceId === a.id));
        if (unqualAlliances.length > 0) {
          const chosenAlliance = unqualAlliances[Math.floor(Math.random() * unqualAlliances.length)];
          const members = COUNTRIES.filter(c => chosenAlliance.countries.includes(c.code));
          if (Math.random() < 0.65) {
            const sortedM = [...members].sort((a,b) => (roundScores[b.code]||0) - (roundScores[a.code]||0));
            const pick = sortedM[Math.floor(Math.random() * Math.min(3, sortedM.length))];
            targetCode = pick.code;
            fanName = `@${pick.name.replace(/\s+/g, '')}Fan`;
          } else {
            const pick = members[Math.floor(Math.random() * members.length)];
            targetCode = pick.code;
          }
        } else {
          targetCode = chatter.bias[Math.floor(Math.random() * chatter.bias.length)];
        }
      } else if (tournamentStage === 'playoffs' && qualifiers.length > 0) {
        const pick = qualifiers[Math.floor(Math.random() * qualifiers.length)];
        targetCode = pick.code;
        fanName = `@${pick.name.replace(/\s+/g, '')}Fan`;
      } else if (tournamentStage === 'finals' && finalists.length > 0) {
        const pick = finalists[Math.floor(Math.random() * finalists.length)];
        targetCode = pick.code;
        fanName = `@${pick.name.replace(/\s+/g, '')}Fan`;
      } else {
        targetCode = chatter.bias[Math.floor(Math.random() * chatter.bias.length)];
      }

      if (targetCode) {
        handleScoreVote(targetCode, 1, fanName, false);
      }
    }, Math.max(400, baseDelay));

    return () => clearInterval(hypeTimer);
  }, [hypeEnabled, tournamentStage, isPaused, speedMultiplier, qualifiers, finalists, roundScores, playoffScores, finalsScores]);

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
        setQualifiers([]);
        setFinalists([]);
        setPlayoffScores({});
        setFinalsScores({});
        setTournamentStage('qualifiers');
        setWinnerInfo(null);
        setIsPaused(false);
      },
      nextStage: () => {
        if (tournamentStage === 'qualifiers') {
          transitionToPlayoffs(qualifiers);
        } else if (tournamentStage === 'playoffs') {
          transitionToFinals(finalists);
        } else if (tournamentStage === 'finals') {
          const sortedF = [...finalists].sort((a,b) => (finalsScores[b.code]||0) - (finalsScores[a.code]||0));
          triggerGrandChampion(sortedF[0] || finalists[0], 'DirectorAdvance', targetPoints);
        }
      },
      resetSupporters: () => {
        const freshState = {
          round: 1,
          targetPoints: 50,
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
        triggerGrandChampion(c, 'MVP_SuperFan', targetPoints);
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
  }, [tournamentStage, targetPoints, roundScores, playoffScores, finalsScores, qualifiers, finalists, isPaused]);

  // Listen to parent Director messages (postMessage)
  useEffect(() => {
    const handleMsg = (e) => {
      if (!e.data) return;
      if (e.data.type === 'DIRECTOR_CMD') {
        const cmd = e.data.cmd;
        if (cmd === 'start') window.pointsRace?.resume();
        else if (cmd === 'pause') window.pointsRace?.togglePause();
        else if (cmd === 'reset') window.pointsRace?.reset();
        else if (cmd === 'next_stage') window.pointsRace?.nextStage();
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
  }, [tournamentStage, qualifiers, finalists, playoffScores, finalsScores]);

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

        {/* Stage Announcement Flash Toast */}
        {stageBanner && (
          <div className="pr-stage-banner-toast" style={{ borderColor: stageBanner.color || '#f59e0b' }}>
            <div className="pr-stage-banner-title" style={{ color: stageBanner.color || '#fef08a' }}>
              {stageBanner.title}
            </div>
            <div className="pr-stage-banner-sub">
              {stageBanner.subtitle}
            </div>
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
          <h1 className="pr-title">
            {tournamentStage === 'qualifiers' && (
              top1Points > 0
                ? `${top1.name} ${top1Points} / ${targetPoints}`
                : `QUALIFIERS: FIRST TO ${targetPoints} PTS`
            )}
            {tournamentStage === 'playoffs' && `PLAYOFFS: TOP 4 BATTLE TO ${targetPoints}`}
            {tournamentStage === 'finals' && `GRAND FINAL: 1V1 DUEL TO ${targetPoints}`}
            {tournamentStage === 'celebrating' && `ROUND ${persistentState.round || 1} CHAMPION`}
          </h1>

          {/* Tournament Stage Indicator Strip */}
          <div className="pr-stage-indicator-strip">
            <div className={`pr-stage-pill s1 ${tournamentStage === 'qualifiers' ? 'active' : 'completed'}`}>
              <ShieldSvg />
              {tournamentStage !== 'qualifiers' ? '✓ ' : '1. '}QUALIFIERS ({targetPoints} PTS)
            </div>
            <div className={`pr-stage-pill s2 ${tournamentStage === 'playoffs' ? 'active' : (tournamentStage === 'finals' || tournamentStage === 'celebrating' ? 'completed' : '')}`}>
              <FlameSvg />
              {tournamentStage === 'finals' || tournamentStage === 'celebrating' ? '✓ ' : '2. '}PLAYOFFS (TOP 4)
            </div>
            <div className={`pr-stage-pill s3 ${tournamentStage === 'finals' ? 'active' : ''}`}>
              <SwordsSvg />
              3. GRAND FINAL (1V1)
            </div>
          </div>

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

        {/* ── 2. Continental Alliances Strip (Stage 1 Only) ─────── */}
        {tournamentStage === 'qualifiers' && (
          <div className="pr-alliances-strip">
            {allianceLeaderboard.map(({ alliance, leader, points, isQualified }) => (
              <div
                key={alliance.id}
                className={`pr-alliance-box ${isQualified ? 'qualified' : ''}`}
                style={{ borderTopColor: alliance.color }}
              >
                <div className="pr-alliance-header" style={{ color: alliance.color }}>
                  <span>{alliance.icon} {alliance.name}</span>
                  <span>{points}/{targetPoints}</span>
                </div>
                <div className="pr-alliance-leader-row">
                  <img
                    src={`/flags/${leader.code.toLowerCase()}.svg`}
                    className="pr-alliance-leader-flag"
                    alt={leader.name}
                  />
                  <span className="pr-alliance-leader-name">{leader.name}</span>
                  <span className="pr-alliance-leader-pts">{points}</span>
                </div>
                <div className="pr-alliance-bar-wrap">
                  <div
                    className="pr-alliance-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, (points / targetPoints) * 100))}%`,
                      background: alliance.gradient
                    }}
                  />
                </div>
                <div className={`pr-alliance-status-badge ${isQualified ? 'done' : 'racing'}`}>
                  {isQualified ? 'QUALIFIED ✓' : 'RACING'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 3. Top Fans & Round Info Row ────────────────────── */}
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

        {/* ── 4. Main Battle Arena According to Stage ─────────── */}
        {tournamentStage === 'qualifiers' && (
          <main className="pr-body">
            {/* Top 10 Row (Podium Row) */}
            <section className="pr-podium-row">
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
                    TYPE YOUR COUNTRY OR <img src="/flags/bd.svg" className="pr-cta-inline-flag" alt="BD" /> ➔ +1 POINT (FIRST TO {targetPoints} QUALIFIES!)
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
        )}

        {/* ── STAGE 2: Playoff Arena (4-Way Contenders Showdown) ── */}
        {tournamentStage === 'playoffs' && (
          <div className="pr-playoff-arena">
            <div className="pr-playoff-cards-grid">
              {qualifiers.map((c, i) => {
                const pts = playoffScores[c.code] || 0;
                const isFinalistSecured = finalists.some(f => f.code === c.code) || pts >= targetPoints;
                const pct = Math.min(100, Math.round((pts / targetPoints) * 100));
                return (
                  <div
                    key={c.code}
                    className={`pr-contender-card ${i === 0 ? 'rank-1' : ''} ${isFinalistSecured ? 'finalist-secured' : ''}`}
                    style={{ borderTopColor: c.allianceColor || '#f59e0b' }}
                  >
                    <div className="pr-contender-card-top">
                      <span
                        className="pr-contender-alliance-pill"
                        style={{ background: c.allianceColor || '#f59e0b' }}
                      >
                        {c.allianceName || 'Continental'}
                      </span>
                      <span className="pr-contender-rank-badge">#{i + 1}</span>
                    </div>
                    <div className="pr-contender-flag-box">
                      <img src={`/flags/${c.code.toLowerCase()}.svg`} className="pr-contender-flag" alt={c.name} />
                      <div className="pr-contender-name">{c.name}</div>
                    </div>
                    <div className="pr-contender-score-section">
                      <div className="pr-contender-pts-row">
                        <span className="pr-contender-pts-val">{pts}</span>
                        <span className="pr-contender-goal-val">/ {targetPoints} PTS</span>
                      </div>
                      <div className="pr-contender-bar-wrap">
                        <div
                          className="pr-contender-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: isFinalistSecured ? '#22c55e' : (c.allianceColor || '#f59e0b')
                          }}
                        />
                      </div>
                      <div className={`pr-contender-status-tag ${isFinalistSecured ? 'advance' : 'fighting'}`}>
                        {isFinalistSecured ? 'FINALIST SECURED 🏅' : `NEEDS ${Math.max(0, targetPoints - pts)} PTS`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Central Spotlight / CTA Bar in Playoff */}
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
                  <span>COMMENT YOUR QUALIFIED COUNTRY TO SEND THEM TO GRAND FINAL!</span>
                </>
              )}
            </div>

            {/* Cheering Nations Footer */}
            <div className="pr-playoff-cheer-strip">
              <span className="pr-cheer-title">WORLD CHEERING:</span>
              <div className="pr-cheer-flags-scroll">
                {sortedCountries.slice(4, 28).map(c => (
                  <img
                    key={c.code}
                    src={`/flags/${c.code.toLowerCase()}.svg`}
                    className="pr-cheer-flag-item"
                    alt={c.name}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STAGE 3: Grand Final 1v1 Duel Arena ─────────────── */}
        {tournamentStage === 'finals' && finalists.length >= 2 && (() => {
          const f1 = finalists[0];
          const f2 = finalists[1];
          const pts1 = finalsScores[f1.code] || 0;
          const pts2 = finalsScores[f2.code] || 0;
          const total = pts1 + pts2 || 1;
          const pct1 = Math.min(95, Math.max(5, (pts1 / total) * 100));
          return (
            <div className="pr-finals-arena">
              <div className="pr-finals-faceoff">
                <div className="pr-finalist-card" style={{ borderColor: f1.allianceColor || '#38bdf8' }}>
                  <img src={`/flags/${f1.code.toLowerCase()}.svg`} className="pr-finalist-flag" alt={f1.name} />
                  <div className="pr-finalist-name">{f1.name}</div>
                  <div className="pr-finalist-alliance">{f1.allianceName || 'Finalist'}</div>
                  <div className="pr-finalist-pts">{pts1}</div>
                </div>
                <div className="pr-finals-vs-col">
                  <div className="pr-finals-vs-badge">VS</div>
                  <div className="pr-finals-goal-badge">DUEL TO {targetPoints}</div>
                </div>
                <div className="pr-finalist-card" style={{ borderColor: f2.allianceColor || '#f59e0b' }}>
                  <img src={`/flags/${f2.code.toLowerCase()}.svg`} className="pr-finalist-flag" alt={f2.name} />
                  <div className="pr-finalist-name">{f2.name}</div>
                  <div className="pr-finalist-alliance">{f2.allianceName || 'Finalist'}</div>
                  <div className="pr-finalist-pts">{pts2}</div>
                </div>
              </div>

              <div className="pr-finals-meter-box">
                <div className="pr-finals-meter-bar">
                  <div
                    className="pr-finals-meter-fill-a"
                    style={{ width: `${pct1}%`, background: f1.allianceColor || '#38bdf8' }}
                  />
                  <div
                    className="pr-finals-meter-fill-b"
                    style={{ width: `${100 - pct1}%`, background: f2.allianceColor || '#f59e0b' }}
                  />
                </div>
              </div>

              {/* Central Spotlight in Finals */}
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
                    <SwordsSvg />
                    <span>WHO WILL BE CROWNED CHAMPION? VOTE FOR {f1.name.toUpperCase()} OR {f2.name.toUpperCase()}!</span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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
        {tournamentStage === 'celebrating' && winnerInfo && (
          <div className="pr-victory-overlay">
            <h2 className="pr-victory-title">ROUND {winnerInfo.round} TOURNAMENT CHAMPION!</h2>
            <TrophySvg />
            <img
              className="pr-victory-flag"
              src={`/flags/${winnerInfo.country.code.toLowerCase()}.svg`}
              alt={winnerInfo.country.name}
            />
            <div className="pr-victory-name">{winnerInfo.country.name}</div>
            <div className="pr-victory-mvp">
              TOURNAMENT MVP: <b>@{winnerInfo.mvp}</b> ({winnerInfo.points} PTS)
            </div>
            <div className="pr-victory-next">
              NEXT TOURNAMENT IN <span>{nextTimer}</span>S
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
