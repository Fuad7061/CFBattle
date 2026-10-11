import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HEROES, findHeroFromComment } from './heroData.js';
import { heroAudio } from './heroAudio.js';
import './heroTournament.css';

// Realistic Simulated Chatters for Auto-Voter when real chat is idle
const SIMULATED_HERO_FANS = [
  { name: 'SpideyFan_NY', heroId: 'spidey' },
  { name: 'DarkKnight_Gotham', heroId: 'batman' },
  { name: 'Chimichanga_Wade', heroId: 'deadpool' },
  { name: 'WeaponX_Logan', heroId: 'wolverine' },
  { name: 'StarkIndustries3000', heroId: 'ironman' },
  { name: 'AsgardThunderer', heroId: 'thor' },
  { name: 'KryptonSon', heroId: 'superman' },
  { name: 'MadTitanThanos', heroId: 'thanos' },
  { name: 'Sorcerer_Stephen', heroId: 'doctorstrange' },
  { name: 'SymbioteVenom', heroId: 'venom' },
  { name: 'GammaSmash99', heroId: 'hulk' },
  { name: 'FirstAvengerCap', heroId: 'captainamerica' },
  { name: 'WakandaKing', heroId: 'blackpanther' },
  { name: 'SpeedForceBarry', heroId: 'flash' },
  { name: 'MischiefLoki', heroId: 'loki' },
  { name: 'JokerLaughs', heroId: 'joker' }
];

// Helper to guarantee clean single '@' on all usernames
const cleanUser = (u) => {
  const str = String(u || 'Viewer').trim();
  return '@' + str.replace(/^@+/, '');
};

export default function HeroTournamentApp() {
  // Target points for qualification and finals (default 50)
  const [targetPoints, setTargetPoints] = useState(50);

  // Tournament Stage: 'qualifiers' -> 'teamup' -> 'finals' -> 'celebration'
  const [stage, setStage] = useState('qualifiers');

  // Music & Audio State
  const [musicActive, setMusicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Scores State: { [heroId]: points }
  const [qualifierScores, setQualifierScores] = useState(() => {
    const initial = {};
    HEROES.forEach(h => { initial[h.id] = 0; });
    return initial;
  });

  // Top 4 Qualified Heroes
  const [qualifiers, setQualifiers] = useState([]);

  // Tag-Teams for Phase 2:
  // Team 1: qualifiers[0] + qualifiers[3]
  // Team 2: qualifiers[1] + qualifiers[2]
  const [teamupScores, setTeamupScores] = useState({ team1: 0, team2: 0 });

  // Finalists (2 heroes from winning tag-team or playoff)
  const [finalists, setFinalists] = useState([]);
  const [finalsScores, setFinalsScores] = useState({});

  // Champion
  const [champion, setChampion] = useState(null);
  const [resetCountdown, setResetCountdown] = useState(12);

  // Supporter Shoutouts Circular Buffer
  const [recentShoutouts, setRecentShoutouts] = useState([]);

  // Supporter Totals Map: username -> { points, heroName }
  const [supporterTotals, setSupporterTotals] = useState({});

  // Last bumped hero for animation
  const [bumpedHeroId, setBumpedHeroId] = useState(null);
  const [lastVoters, setLastVoters] = useState({});

  // Real vs Auto-voter timing reference
  const lastRealChatRef = useRef(Date.now());
  const tournamentStageRef = useRef(stage);
  tournamentStageRef.current = stage;
  const qualifiersRef = useRef(qualifiers);
  qualifiersRef.current = qualifiers;
  const finalistsRef = useRef(finalists);
  finalistsRef.current = finalists;
  const targetPointsRef = useRef(targetPoints);
  targetPointsRef.current = targetPoints;

  // --------------------------------------------------------------------------
  // AUDIO & BGM INITIALIZATION
  // --------------------------------------------------------------------------
  const startAudioEngine = () => {
    heroAudio.ensureContext();
    if (!heroAudio.isMuted()) {
      heroAudio.playBgMusic();
      setMusicActive(true);
      setIsMuted(false);
    }
  };

  const toggleMusic = () => {
    heroAudio.ensureContext();
    if (musicActive) {
      heroAudio.pauseBgMusic();
      setMusicActive(false);
    } else {
      heroAudio.playBgMusic();
      setMusicActive(true);
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const muted = heroAudio.toggleMute();
    setIsMuted(muted);
    setMusicActive(!muted && heroAudio.musicEnabled);
  };

  // Auto-start music and audio on first user click anywhere in the window
  useEffect(() => {
    const handleGesture = () => {
      startAudioEngine();
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
    window.addEventListener('click', handleGesture);
    window.addEventListener('keydown', handleGesture);

    // Also attempt automatic BGM start if query param allows
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const musicParam = params.get('music');
      if (musicParam !== '0' && musicParam !== 'false') {
        try {
          heroAudio.playBgMusic();
          setMusicActive(true);
        } catch (e) {}
      }
    }

    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
      heroAudio.pauseBgMusic();
    };
  }, []);

  // Update audio music intensity whenever tournament stage transitions
  useEffect(() => {
    heroAudio.setMusicIntensity(stage);
  }, [stage]);

  // Sync settings with /api/status if director changes them
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.settings?.gameSettings?.pointsTarget) {
          setTargetPoints(Number(data.settings.gameSettings.pointsTarget) || 50);
        }
        if (data.settings?.gameSettings?.customMusicUrl) {
          heroAudio.loadBgMusic(data.settings.gameSettings.customMusicUrl);
        }
      })
      .catch(() => {});
  }, []);

  // --------------------------------------------------------------------------
  // EXPOSE GLOBAL API FOR DIRECTOR & EMBEDDED DASHBOARD CONTROLS
  // --------------------------------------------------------------------------
  useEffect(() => {
    window.heroTournament = {
      reset: () => {
        const fresh = {};
        HEROES.forEach(h => { fresh[h.id] = 0; });
        setQualifierScores(fresh);
        setQualifiers([]);
        setTeamupScores({ team1: 0, team2: 0 });
        setFinalists([]);
        setFinalsScores({});
        setChampion(null);
        setStage('qualifiers');
        heroAudio.playBoost();
        heroAudio.speak('Tournament reset! Multiverse qualifiers begin now!');
      },
      toggleMusic: () => {
        toggleMusic();
      },
      toggleMute: () => {
        toggleMute();
      },
      setVolume: (vol) => {
        heroAudio.setVolume(vol);
      },
      setTargetPoints: (pts) => {
        setTargetPoints(Number(pts) || 50);
      },
      voteHero: (heroNameOrId, points = 1, author = 'Viewer') => {
        const h = findHeroFromComment(heroNameOrId);
        if (h) processHeroVote(h, points, author);
      }
    };

    const handleMsg = (e) => {
      if (!e.data) return;
      if (e.data.type === 'DIRECTOR_CMD') {
        const cmd = e.data.cmd;
        if (cmd === 'reset') window.heroTournament?.reset();
        else if (cmd === 'mute') toggleMute();
      } else if (e.data.type === 'LIVE_SETTINGS_UPDATE' && e.data.settings) {
        const s = e.data.settings;
        if (s.pointsTarget !== undefined) setTargetPoints(Number(s.pointsTarget) || 50);
        if (s.musicVol !== undefined) heroAudio.setVolume(Number(s.musicVol));
        if (s.customMusicUrl) {
          heroAudio.loadBgMusic(s.customMusicUrl);
          heroAudio.playBgMusic();
          setMusicActive(true);
        }
      } else if (e.data.type === 'MUSIC_UPDATE' && e.data.src) {
        heroAudio.loadBgMusic(e.data.src);
        heroAudio.playBgMusic();
        setMusicActive(true);
      }
    };

    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [musicActive, targetPoints]);

  // --------------------------------------------------------------------------
  // CORE VOTE PROCESSOR: Adds points, triggers audio, shoutouts & phase gates
  // --------------------------------------------------------------------------
  const processHeroVote = (hero, points = 1, author = 'Viewer', isSuperChat = false) => {
    if (!hero) return;
    const heroId = hero.id;
    const formattedUser = cleanUser(author);

    // Trigger Sound
    if (isSuperChat) heroAudio.playSuperBoost();
    else heroAudio.playBoost(hero.color);

    // Visual Bump
    setBumpedHeroId(heroId);
    setTimeout(() => setBumpedHeroId(null), 180);

    // Save Last Voter for hero row tag
    setLastVoters(prev => ({ ...prev, [heroId]: formattedUser }));

    // Update Shoutout Feed (max 3 items for sleek vertical fit)
    const shoutoutItem = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      user: formattedUser,
      heroName: hero.name,
      heroColor: hero.color,
      attackName: hero.attackName,
      points
    };
    setRecentShoutouts(prev => [shoutoutItem, ...prev.slice(0, 2)]);

    // Update Leaderboard Stats for Podium
    setSupporterTotals(prev => ({
      ...prev,
      [formattedUser]: {
        points: (prev[formattedUser]?.points || 0) + points,
        heroName: hero.name
      }
    }));

    const currentStage = tournamentStageRef.current;
    const currentQualifiers = qualifiersRef.current;
    const currentFinalists = finalistsRef.current;
    const currentTarget = targetPointsRef.current;

    // PHASE 1: QUALIFIERS
    if (currentStage === 'qualifiers') {
      setQualifierScores(prev => {
        const curScore = prev[heroId] || 0;
        const newScore = curScore + points;

        // Check if this hero just crossed the qualification threshold
        if (newScore >= currentTarget && curScore < currentTarget) {
          setQualifiers(qPrev => {
            if (qPrev.length < 4 && !qPrev.some(h => h.id === heroId)) {
              const updated = [...qPrev, hero];
              qualifiersRef.current = updated;
              heroAudio.playQualifiedBell();
              heroAudio.speak(`${hero.name} has qualified!`);

              // If 4 heroes qualified, advance to Phase 2 (Teamup)
              if (updated.length >= 4) {
                setTimeout(() => {
                  setStage('teamup');
                  tournamentStageRef.current = 'teamup';
                  heroAudio.playTeamupGong();
                  heroAudio.speak(`Tag team round active! Vote your hero to boost the team!`);
                }, 1000);
              }
              return updated;
            }
            return qPrev;
          });
        }

        return { ...prev, [heroId]: newScore };
      });
    }

    // PHASE 2: TEAMUP (2v2 ALLIANCE CLASH)
    else if (currentStage === 'teamup' && currentQualifiers.length >= 4) {
      const isTeam1 = currentQualifiers[0]?.id === heroId || currentQualifiers[3]?.id === heroId;
      const isTeam2 = currentQualifiers[1]?.id === heroId || currentQualifiers[2]?.id === heroId;

      if (isTeam1 || isTeam2) {
        setTeamupScores(prev => {
          const tKey = isTeam1 ? 'team1' : 'team2';
          const newTeamScore = prev[tKey] + points;

          if (newTeamScore >= currentTarget) {
            // Winning team sends both members to the Grand Final 1v1!
            const winningTeamHeroes = isTeam1
              ? [currentQualifiers[0], currentQualifiers[3]]
              : [currentQualifiers[1], currentQualifiers[2]];

            setTimeout(() => {
              setFinalists(winningTeamHeroes);
              finalistsRef.current = winningTeamHeroes;
              const initFinals = {};
              initFinals[winningTeamHeroes[0].id] = 0;
              initFinals[winningTeamHeroes[1].id] = 0;
              setFinalsScores(initFinals);
              setStage('finals');
              tournamentStageRef.current = 'finals';
              heroAudio.playTeamupGong();
              heroAudio.speak(`Grand Final! ${winningTeamHeroes[0].name} versus ${winningTeamHeroes[1].name}!`);
            }, 800);
          }

          return { ...prev, [tKey]: newTeamScore };
        });
      }
    }

    // PHASE 3: GRAND FINAL (1v1 SHOWDOWN)
    else if (currentStage === 'finals' && currentFinalists.length === 2) {
      if (currentFinalists.some(h => h.id === heroId)) {
        setFinalsScores(prev => {
          const newScore = (prev[heroId] || 0) + points;

          if (newScore >= currentTarget) {
            // Champion Crowned!
            setTimeout(() => {
              setChampion(hero);
              setStage('celebration');
              tournamentStageRef.current = 'celebration';
              heroAudio.playVictoryFanfare();
              heroAudio.speak(`${hero.name} is the Multiverse Champion!`);
            }, 600);
          }

          return { ...prev, [heroId]: newScore };
        });
      }
    }
  };

  // --------------------------------------------------------------------------
  // SSE CHAT STREAM LISTENER: Listens to live YouTube chat from server.js
  // --------------------------------------------------------------------------
  useEffect(() => {
    let sse;
    try {
      sse = new EventSource('/api/chat-stream');
      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!msg || (!msg.text && !msg.vote)) return;

          // Check if message text matches any hero
          const hero = findHeroFromComment(msg.text || msg.vote?.countryName || '');
          if (hero) {
            lastRealChatRef.current = Date.now();
            let points = 1;
            let isSuperChat = false;

            if (msg.superChat) {
              isSuperChat = true;
              const amt = (msg.superChat.amountMicros || 2000000) / 1000000;
              if (amt >= 10) points = targetPoints;
              else if (amt >= 5) points = Math.min(targetPoints, 25);
              else points = 10;
            }

            processHeroVote(hero, points, msg.author || 'Viewer', isSuperChat);
          }
        } catch (e) {}
      };
    } catch (e) {}

    return () => {
      if (sse) sse.close();
    };
  }, [targetPoints, qualifiers, finalists]);

  // --------------------------------------------------------------------------
  // BUILT-IN AUTO VOTER (Keeps stream high-energy when real chat is quiet)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const autoVoteInterval = setInterval(() => {
      if (tournamentStageRef.current === 'celebration') return;

      // Yield 100% to real viewers if real chat arrived in the last 12 seconds
      const timeSinceRealChat = Date.now() - lastRealChatRef.current;
      if (timeSinceRealChat < 12000) return;

      const currentStage = tournamentStageRef.current;
      let targetHero = null;
      const fan = SIMULATED_HERO_FANS[Math.floor(Math.random() * SIMULATED_HERO_FANS.length)];

      if (currentStage === 'qualifiers') {
        // Pick an uncompleted hero
        const available = HEROES.filter(h => (qualifierScores[h.id] || 0) < targetPoints);
        if (available.length > 0) {
          targetHero = available[Math.floor(Math.random() * available.length)];
        }
      } else if (currentStage === 'teamup' && qualifiers.length >= 4) {
        // Pick from active tag-team heroes
        targetHero = qualifiers[Math.floor(Math.random() * qualifiers.length)];
      } else if (currentStage === 'finals' && finalists.length === 2) {
        targetHero = finalists[Math.floor(Math.random() * finalists.length)];
      }

      if (targetHero) {
        processHeroVote(targetHero, 1, fan.name, false);
      }
    }, 2800);

    return () => clearInterval(autoVoteInterval);
  }, [qualifierScores, qualifiers, finalists, targetPoints]);

  // --------------------------------------------------------------------------
  // RESTART CYCLE TIMER: Resets tournament after Champion Celebration
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (stage !== 'celebration') return;

    setResetCountdown(12);
    const countTimer = setInterval(() => {
      setResetCountdown(c => {
        if (c <= 1) {
          clearInterval(countTimer);
          // Reset all state for new tournament
          const fresh = {};
          HEROES.forEach(h => { fresh[h.id] = 0; });
          setQualifierScores(fresh);
          setQualifiers([]);
          setTeamupScores({ team1: 0, team2: 0 });
          setFinalists([]);
          setFinalsScores({});
          setChampion(null);
          setStage('qualifiers');
          heroAudio.playBoost();
          heroAudio.speak('New Multiverse Tournament starting now! Vote your hero!');
          return 12;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(countTimer);
  }, [stage]);

  // Sorted Heroes for Qualifier Tracks (highest points at the top)
  const sortedHeroes = useMemo(() => {
    return [...HEROES].sort((a, b) => {
      const diff = (qualifierScores[b.id] || 0) - (qualifierScores[a.id] || 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [qualifierScores]);

  // Top Supporters for Podium
  const topPodiumSupporters = useMemo(() => {
    return Object.entries(supporterTotals)
      .map(([user, data]) => ({ user, ...data }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);
  }, [supporterTotals]);

  return (
    <div className="ht-container">
      <div className="ht-nebula-bg" />

      {/* ----------------- TOP BROADCAST HEADER & CONTROLS ----------------- */}
      <header className="ht-header">
        <div className="ht-title-strip">
          <div className="ht-title-left">
            <span className="ht-title-badge">⚡</span>
            <div className="ht-title-meta">
              <span className="ht-title-text">MULTIVERSE TOURNAMENT</span>
              <span className="ht-stage-pill">
                {stage === 'qualifiers' && `PHASE 1: QUALIFIERS (GOAL: ${targetPoints})`}
                {stage === 'teamup' && `PHASE 2: TAG-TEAM CLASH`}
                {stage === 'finals' && `PHASE 3: GRAND FINAL 1V1`}
                {stage === 'celebration' && `MULTIVERSE CHAMPION!`}
              </span>
            </div>
          </div>

          {/* On-screen Music & Audio Controller */}
          <div className="ht-controls-right">
            <button
              className={`ht-sound-toggle-btn ${musicActive ? 'active' : 'muted'}`}
              onClick={toggleMusic}
              title={musicActive ? 'Music Playing (Click to Pause)' : 'Music Paused (Click to Play)'}
            >
              <span className="ht-sound-icon">{musicActive ? '🔊' : '🔇'}</span>
              <span className="ht-sound-label">{musicActive ? 'MUSIC ON' : 'MUSIC OFF'}</span>
              {musicActive && (
                <div className="ht-sound-bars">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* ----------------- PROMINENT STREAMLINED VOTING TICKER ----------------- */}
        <div className="ht-join-banner">
          <div className="ht-join-inner">
            <div className="ht-join-cue">
              <span className="ht-chat-icon">💬</span>
              <span>HOW TO VOTE:</span>
            </div>
            <div className="ht-join-keywords">
              <span className="ht-kw-pill">SPIDEY</span>
              <span className="ht-kw-pill">BATMAN</span>
              <span className="ht-kw-pill">DEADPOOL</span>
              <span className="ht-kw-pill">IRON MAN</span>
              <span className="ht-kw-pill">JOKER</span>
              <span className="ht-kw-pill">THOR</span>
            </div>
          </div>
        </div>
      </header>

      {/* ----------------- QUALIFIERS SLOTS (TOP 4 ADVANCE TO FINALS) ----------------- */}
      {stage === 'qualifiers' && (
        <div className="ht-bracket-strip">
          {[0, 1, 2, 3].map(idx => {
            const qualifiedHero = qualifiers[idx];
            return (
              <div key={idx} className={`ht-bracket-slot ${qualifiedHero ? 'filled' : ''}`}>
                <div className="ht-slot-badge">#{idx + 1}</div>
                {qualifiedHero ? (
                  <div className="ht-slot-hero">
                    <div
                      className="ht-slot-avatar"
                      style={{ background: qualifiedHero.gradient }}
                    >
                      <svg viewBox="0 0 24 24"><path d={qualifiedHero.iconSvg} /></svg>
                    </div>
                    <span className="ht-slot-name">{qualifiedHero.name}</span>
                  </div>
                ) : (
                  <div className="ht-slot-placeholder">SPOT #{idx + 1}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------- PHASE 1: 16-HERO QUALIFIER LEADERBOARD ----------------- */}
      {stage === 'qualifiers' && (
        <div className="ht-tracks-container">
          {sortedHeroes.map((hero, idx) => {
            const pts = qualifierScores[hero.id] || 0;
            const pct = Math.min(100, Math.round((pts / targetPoints) * 100));
            const isQualified = qualifiers.some(q => q.id === hero.id);
            const isBumped = bumpedHeroId === hero.id;
            const voter = lastVoters[hero.id];
            const isTop4 = idx < 4;

            return (
              <React.Fragment key={hero.id}>
                {/* Visual Cutoff Banner between #4 and #5 */}
                {idx === 4 && (
                  <div className="ht-cutoff-divider">
                    <div className="ht-cutoff-line" />
                    <span className="ht-cutoff-label">⚡ TOP 4 ADVANCE TO FINALS ⚡</span>
                    <div className="ht-cutoff-line" />
                  </div>
                )}

                <div
                  className={`ht-hero-row ${isBumped ? 'bump' : ''} ${isQualified ? 'qualified' : ''} ${isTop4 ? 'qualifying-zone' : ''}`}
                  style={{
                    boxShadow: isBumped ? `0 0 16px ${hero.glow}` : 'none'
                  }}
                >
                  {/* Background Progress Fill with smooth gradient */}
                  <div
                    className="ht-row-progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: hero.gradient
                    }}
                  />

                  {/* Rank Pill: Gold for Top 4, Slate for rest */}
                  <div className={`ht-hero-rank-pill ${isTop4 ? 'rank-gold' : ''}`}>
                    #{idx + 1}
                  </div>

                  {/* Hero Avatar Emblem */}
                  <div
                    className="ht-hero-avatar-box"
                    style={{ background: hero.gradient }}
                  >
                    <svg viewBox="0 0 24 24"><path d={hero.iconSvg} /></svg>
                  </div>

                  {/* Hero Name — ONLY SHOWN ONCE, BOLD AND CRISP */}
                  <div className="ht-hero-identity">
                    <span className="ht-hero-name">{hero.name}</span>
                    {/* Live Voter Shoutout Chip directly on Hero Card */}
                    {voter && (
                      <span className="ht-hero-voter-chip" title={`Latest voter: ${voter}`}>
                        👤 {voter}
                      </span>
                    )}
                  </div>

                  {/* Right Score Progress: Numerical Counter & Mini Meter */}
                  <div className="ht-hero-score-block">
                    <div className="ht-score-values">
                      <span className="ht-score-current">{pts}</span>
                      <span className="ht-score-target">/{targetPoints}</span>
                    </div>

                    <div className="ht-mini-meter">
                      <div
                        className="ht-mini-meter-fill"
                        style={{ width: `${pct}%`, background: hero.gradient }}
                      />
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ----------------- PHASE 2: TAG-TEAM MULTIVERSE CLASH ----------------- */}
      {stage === 'teamup' && qualifiers.length >= 4 && (
        <div className="ht-teamup-container">
          <div className="ht-phase-title-badge">⚡ TAG-TEAM ALLIANCE CLASH ⚡</div>

          {/* Team Alpha */}
          <div className="ht-team-card" style={{ borderColor: qualifiers[0].color }}>
            <div className="ht-team-header">
              <div className="ht-team-heroes">
                <div className="ht-team-avatar-duo">
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[0].gradient, width: 38, height: 38 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[0].iconSvg} /></svg>
                  </div>
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[3].gradient, width: 38, height: 38 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[3].iconSvg} /></svg>
                  </div>
                </div>
                <div>
                  <div className="ht-team-title">TEAM ALPHA: {qualifiers[0].name} &amp; {qualifiers[3].name}</div>
                  <div className="ht-team-cues">Comment <b>{qualifiers[0].name}</b> or <b>{qualifiers[3].name}</b> to vote!</div>
                </div>
              </div>
              <div className="ht-team-score-num">{teamupScores.team1} / {targetPoints}</div>
            </div>

            <div className="ht-team-meter-bg">
              <div
                className="ht-team-meter-fill"
                style={{
                  width: `${Math.min(100, (teamupScores.team1 / targetPoints) * 100)}%`,
                  background: `linear-gradient(90deg, ${qualifiers[0].color}, ${qualifiers[3].color})`
                }}
              />
            </div>
          </div>

          <div className="ht-vs-divider">⚔️ VS ⚔️</div>

          {/* Team Omega */}
          <div className="ht-team-card" style={{ borderColor: qualifiers[1].color }}>
            <div className="ht-team-header">
              <div className="ht-team-heroes">
                <div className="ht-team-avatar-duo">
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[1].gradient, width: 38, height: 38 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[1].iconSvg} /></svg>
                  </div>
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[2].gradient, width: 38, height: 38 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[2].iconSvg} /></svg>
                  </div>
                </div>
                <div>
                  <div className="ht-team-title">TEAM OMEGA: {qualifiers[1].name} &amp; {qualifiers[2].name}</div>
                  <div className="ht-team-cues">Comment <b>{qualifiers[1].name}</b> or <b>{qualifiers[2].name}</b> to vote!</div>
                </div>
              </div>
              <div className="ht-team-score-num">{teamupScores.team2} / {targetPoints}</div>
            </div>

            <div className="ht-team-meter-bg">
              <div
                className="ht-team-meter-fill"
                style={{
                  width: `${Math.min(100, (teamupScores.team2 / targetPoints) * 100)}%`,
                  background: `linear-gradient(90deg, ${qualifiers[1].color}, ${qualifiers[2].color})`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ----------------- PHASE 3: GRAND FINAL 1v1 SHOWDOWN ----------------- */}
      {stage === 'finals' && finalists.length === 2 && (
        <div className="ht-final-container">
          <div className="ht-phase-title-badge">👑 GRAND FINAL SHOWDOWN 👑</div>

          {/* Finalist 1 */}
          <div className="ht-finalist-card" style={{ borderColor: finalists[0].color }}>
            <div className="ht-finalist-top">
              <div className="ht-finalist-left">
                <div className="ht-hero-avatar-box" style={{ background: finalists[0].gradient, width: 48, height: 48 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }}><path d={finalists[0].iconSvg} /></svg>
                </div>
                <div>
                  <div className="ht-finalist-name">{finalists[0].name}</div>
                  <div className="ht-finalist-sub">Type <b>{finalists[0].name}</b> to vote!</div>
                </div>
              </div>
              <div className="ht-finalist-pts">{finalsScores[finalists[0].id] || 0} / {targetPoints}</div>
            </div>

            <div className="ht-team-meter-bg">
              <div
                className="ht-team-meter-fill"
                style={{
                  width: `${Math.min(100, ((finalsScores[finalists[0].id] || 0) / targetPoints) * 100)}%`,
                  background: finalists[0].gradient
                }}
              />
            </div>
          </div>

          <div className="ht-versus-badge">⚡ V E R S U S ⚡</div>

          {/* Finalist 2 */}
          <div className="ht-finalist-card" style={{ borderColor: finalists[1].color }}>
            <div className="ht-finalist-top">
              <div className="ht-finalist-left">
                <div className="ht-hero-avatar-box" style={{ background: finalists[1].gradient, width: 48, height: 48 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }}><path d={finalists[1].iconSvg} /></svg>
                </div>
                <div>
                  <div className="ht-finalist-name">{finalists[1].name}</div>
                  <div className="ht-finalist-sub">Type <b>{finalists[1].name}</b> to vote!</div>
                </div>
              </div>
              <div className="ht-finalist-pts">{finalsScores[finalists[1].id] || 0} / {targetPoints}</div>
            </div>

            <div className="ht-team-meter-bg">
              <div
                className="ht-team-meter-fill"
                style={{
                  width: `${Math.min(100, ((finalsScores[finalists[1].id] || 0) / targetPoints) * 100)}%`,
                  background: finalists[1].gradient
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ----------------- RECENT HERO BOOSTERS (LIVE COMMENTER SHOUTOUTS) ----------------- */}
      <footer className="ht-footer-shoutout">
        <div className="ht-shoutout-header">
          <span className="ht-shoutout-title">📡 LIVE SHOUTOUTS</span>
          <span className="ht-shoutout-cta">COMMENT ANY HERO TO APPEAR ON STREAM</span>
        </div>

        <div className="ht-shoutout-ticker">
          {recentShoutouts.length === 0 ? (
            <div className="ht-shoutout-waiting">
              💬 Waiting for live comments... Type any superhero name in chat!
            </div>
          ) : (
            recentShoutouts.map(item => (
              <div key={item.id} className="ht-shoutout-item">
                <div className="ht-shoutout-left">
                  <span className="ht-shoutout-user">{item.user}</span>
                  <span className="ht-shoutout-hero" style={{ color: item.heroColor }}>
                    boosted {item.heroName}
                  </span>
                </div>
                <span className="ht-shoutout-attack">+{item.points} {item.attackName}</span>
              </div>
            ))
          )}
        </div>
      </footer>

      {/* ----------------- CHAMPION PODIUM OVERLAY ----------------- */}
      {stage === 'celebration' && champion && (
        <div className="ht-victory-overlay">
          <div className="ht-victory-trophy">🏆</div>
          <div className="ht-victory-title">MULTIVERSE TOURNAMENT CHAMPION</div>
          <div className="ht-champion-name">{champion.name}</div>

          <div className="ht-supporters-podium">
            <div className="ht-podium-header">👑 TOP HERO BACKERS (PODIUM OF HONOR)</div>
            {topPodiumSupporters.map((s, idx) => (
              <div key={idx} className="ht-supporter-row">
                <span className="ht-supporter-user">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️'} {s.user}
                </span>
                <span className="ht-supporter-pts">+{s.points} pts</span>
              </div>
            ))}
          </div>

          <div className="ht-reset-countdown">
            Next Tournament Begins in <b>{resetCountdown}</b> seconds...
          </div>
        </div>
      )}
    </div>
  );
}
