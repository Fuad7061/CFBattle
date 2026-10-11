import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HEROES, findHeroFromComment } from './heroData.js';
import { heroAudio } from './heroAudio.js';
import './heroTournament.css';

// Realistic Simulated Chatters for Auto-Voter when real chat is idle
const SIMULATED_HERO_FANS = [
  { name: '@SpideyFan_NY', heroId: 'spidey' },
  { name: '@DarkKnight_Gotham', heroId: 'batman' },
  { name: '@Chimichanga_Wade', heroId: 'deadpool' },
  { name: '@WeaponX_Logan', heroId: 'wolverine' },
  { name: '@StarkIndustries3000', heroId: 'ironman' },
  { name: '@AsgardThunderer', heroId: 'thor' },
  { name: '@KryptonSon', heroId: 'superman' },
  { name: '@MadTitanThanos', heroId: 'thanos' },
  { name: '@Sorcerer_Stephen', heroId: 'doctorstrange' },
  { name: '@SymbioteVenom', heroId: 'venom' },
  { name: '@GammaSmash99', heroId: 'hulk' },
  { name: '@FirstAvengerCap', heroId: 'captainamerica' },
  { name: '@WakandaKing', heroId: 'blackpanther' },
  { name: '@SpeedForceBarry', heroId: 'flash' },
  { name: '@MischiefLoki', heroId: 'loki' },
  { name: '@JokerLaughs', heroId: 'joker' }
];

export default function HeroTournamentApp() {
  // Target points for qualification and finals (default 50 for fast, high-tension turnover)
  const [targetPoints, setTargetPoints] = useState(50);
  
  // Tournament Stage: 'qualifiers' -> 'teamup' -> 'finals' -> 'celebration'
  const [stage, setStage] = useState('qualifiers');

  // Scores State
  // { [heroId]: points }
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

  // Finalists (2 heroes from the winning tag-team or playoff)
  const [finalists, setFinalists] = useState([]);
  const [finalsScores, setFinalsScores] = useState({});

  // Champion
  const [champion, setChampion] = useState(null);
  const [resetCountdown, setResetCountdown] = useState(12);

  // Supporter Shoutouts Circular Buffer
  const [recentShoutouts, setRecentShoutouts] = useState([]);
  
  // Supporter Totals Map: username -> { points, heroId }
  const [supporterTotals, setSupporterTotals] = useState({});

  // Last bumped hero for animation
  const [bumpedHeroId, setBumpedHeroId] = useState(null);
  const [lastVoters, setLastVoters] = useState({});

  // Real vs Auto-voter timing reference
  const lastRealChatRef = useRef(Date.now());
  const tournamentStageRef = useRef(stage);
  tournamentStageRef.current = stage;

  // Initialize Audio Context on first click/touch
  useEffect(() => {
    const handleGesture = () => {
      heroAudio.ensureContext();
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
    window.addEventListener('click', handleGesture);
    window.addEventListener('keydown', handleGesture);
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  // Sync settings with /api/status if director changes them
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.settings?.gameSettings?.pointsTarget) {
          setTargetPoints(Number(data.settings.gameSettings.pointsTarget) || 50);
        }
      })
      .catch(() => {});
  }, []);

  // --------------------------------------------------------------------------
  // CORE VOTE PROCESSOR: Adds points, triggers audio, shoutouts & phase gates
  // --------------------------------------------------------------------------
  const processHeroVote = (hero, points = 1, author = 'Viewer', isSuperChat = false) => {
    if (!hero) return;
    const heroId = hero.id;

    // Trigger Sound
    if (isSuperChat) heroAudio.playSuperBoost();
    else heroAudio.playBoost(hero.color);

    // Visual Bump
    setBumpedHeroId(heroId);
    setTimeout(() => setBumpedHeroId(null), 180);

    // Save Last Voter for hero row tag
    setLastVoters(prev => ({ ...prev, [heroId]: author }));

    // Update Shoutout Feed
    const shoutoutItem = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      user: author,
      heroName: hero.shortName,
      heroColor: hero.color,
      attackName: hero.attackName,
      points
    };
    setRecentShoutouts(prev => [shoutoutItem, ...prev.slice(0, 4)]);

    // Update Leaderboard Stats for Podium
    setSupporterTotals(prev => ({
      ...prev,
      [author]: {
        points: (prev[author]?.points || 0) + points,
        heroName: hero.shortName
      }
    }));

    const currentStage = tournamentStageRef.current;

    // PHASE 1: QUALIFIERS
    if (currentStage === 'qualifiers') {
      setQualifierScores(prev => {
        const curScore = prev[heroId] || 0;
        const newScore = curScore + points;

        // Check if this hero just crossed the qualification threshold
        if (newScore >= targetPoints && curScore < targetPoints) {
          setQualifiers(qPrev => {
            if (qPrev.length < 4 && !qPrev.some(h => h.id === heroId)) {
              const updated = [...qPrev, hero];
              heroAudio.playQualifiedBell();
              heroAudio.speak(`${hero.name} has qualified!`);

              // If 4 heroes qualified, advance to Phase 2 (Teamup)
              if (updated.length >= 4) {
                setTimeout(() => {
                  setStage('teamup');
                  heroAudio.playTeamupGong();
                  heroAudio.speak(`Teamup round active! Vote either hero to boost the team!`);
                }, 1200);
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
    else if (currentStage === 'teamup' && qualifiers.length >= 4) {
      const isTeam1 = qualifiers[0].id === heroId || qualifiers[3].id === heroId;
      const isTeam2 = qualifiers[1].id === heroId || qualifiers[2].id === heroId;

      if (isTeam1 || isTeam2) {
        setTeamupScores(prev => {
          const tKey = isTeam1 ? 'team1' : 'team2';
          const newTeamScore = prev[tKey] + points;

          if (newTeamScore >= targetPoints) {
            // Winning team sends both members to the Grand Final 1v1!
            const winningTeamHeroes = isTeam1
              ? [qualifiers[0], qualifiers[3]]
              : [qualifiers[1], qualifiers[2]];

            setTimeout(() => {
              setFinalists(winningTeamHeroes);
              const initFinals = {};
              initFinals[winningTeamHeroes[0].id] = 0;
              initFinals[winningTeamHeroes[1].id] = 0;
              setFinalsScores(initFinals);
              setStage('finals');
              heroAudio.playTeamupGong();
              heroAudio.speak(`Grand Final! ${winningTeamHeroes[0].name} versus ${winningTeamHeroes[1].name}!`);
            }, 1000);
          }

          return { ...prev, [tKey]: newTeamScore };
        });
      }
    }

    // PHASE 3: GRAND FINAL (1v1 SHOWDOWN)
    else if (currentStage === 'finals' && finalists.length === 2) {
      if (finalists.some(h => h.id === heroId)) {
        setFinalsScores(prev => {
          const newScore = (prev[heroId] || 0) + points;

          if (newScore >= targetPoints) {
            // Champion Crowned!
            setTimeout(() => {
              setChampion(hero);
              setStage('celebration');
              heroAudio.playVictoryFanfare();
              heroAudio.speak(`${hero.name} is the Multiverse Champion!`);
            }, 800);
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
      if (tournamentStageRef.current === 'celebrating') return;

      // Yield 100% to real viewers if real chat arrived in the last 12 seconds
      const timeSinceRealChat = Date.now() - lastRealChatRef.current;
      if (timeSinceRealChat < 12000) return;

      const currentStage = tournamentStageRef.current;
      let targetHero = null;
      let fan = SIMULATED_HERO_FANS[Math.floor(Math.random() * SIMULATED_HERO_FANS.length)];

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
    }, 2800); // Gentle 2.8s cadence maintains smooth 30 FPS stream flow

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

      {/* ----------------- TOP HEADER & STAGE INDICATOR ----------------- */}
      <header className="ht-header">
        <div className="ht-title-strip">
          <div className="ht-title-left">
            <span className="ht-title-badge">⚡</span>
            <span className="ht-title-text">Multiverse 16-Hero Tournament</span>
          </div>
          <span className="ht-stage-pill">
            {stage === 'qualifiers' && `Phase 1: Qualifiers (First to ${targetPoints})`}
            {stage === 'teamup' && `Phase 2: Tag-Team Alliance Clash`}
            {stage === 'finals' && `Phase 3: Grand Final 1v1`}
            {stage === 'celebration' && `Multiverse Champion!`}
          </span>
        </div>

        {/* ----------------- PROMINENT INSTRUCTION CUE BANNER ----------------- */}
        <div className="ht-join-banner">
          <div className="ht-join-inner">
            <div className="ht-join-cue">
              <span>💬</span> HOW TO VOTE: COMMENT HERO NAME IN CHAT
            </div>
            <div className="ht-join-subtext">
              e.g. <b>SPIDEY</b>, <b>BATMAN</b>, <b>DEADPOOL</b>, <b>IRON MAN</b>
            </div>
          </div>
        </div>
      </header>

      {/* ----------------- QUALIFIERS SLOTS (TOP 4 ADVANCE) ----------------- */}
      {stage === 'qualifiers' && (
        <div className="ht-bracket-strip">
          {[0, 1, 2, 3].map(idx => {
            const qualifiedHero = qualifiers[idx];
            return (
              <div key={idx} className={`ht-bracket-slot ${qualifiedHero ? 'filled' : ''}`}>
                <div className="ht-slot-num">{idx + 1}</div>
                {qualifiedHero ? (
                  <div className="ht-slot-hero">
                    <div className="ht-hero-badge" style={{ background: qualifiedHero.gradient, width: 22, height: 22 }}>
                      <svg viewBox="0 0 24 24"><path d={qualifiedHero.iconSvg} /></svg>
                    </div>
                    <span className="ht-slot-name">{qualifiedHero.shortName}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 10, color: '#64748b' }}>Waiting...</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------- PHASE 1: 16-HERO QUALIFIER TRACKS ----------------- */}
      {stage === 'qualifiers' && (
        <div className="ht-tracks-container">
          {sortedHeroes.map((hero, idx) => {
            const pts = qualifierScores[hero.id] || 0;
            const pct = Math.min(100, Math.round((pts / targetPoints) * 100));
            const isQualified = qualifiers.some(q => q.id === hero.id);
            const isBumped = bumpedHeroId === hero.id;
            const voter = lastVoters[hero.id];

            return (
              <div
                key={hero.id}
                className={`ht-hero-row ${isBumped ? 'bump' : ''} ${isQualified ? 'qualified' : ''}`}
                style={{
                  boxShadow: isBumped ? `0 0 16px ${hero.glow}` : 'none'
                }}
              >
                {/* Background Progress Fill */}
                <div
                  className="ht-row-progress-fill"
                  style={{ width: `${pct}%`, background: hero.gradient }}
                />

                {/* Hero Avatar Emblem */}
                <div className="ht-hero-badge" style={{ background: hero.gradient }}>
                  <svg viewBox="0 0 24 24"><path d={hero.iconSvg} /></svg>
                </div>

                {/* Hero Info & Progress */}
                <div className="ht-hero-details">
                  <div className="ht-hero-title-line">
                    <div className="ht-hero-name-group">
                      <span className="ht-hero-rank">#{idx + 1}</span>
                      <span className="ht-hero-name">{hero.name}</span>
                      <span className="ht-vote-cue">{hero.callout}</span>
                    </div>

                    <div className="ht-hero-points-group">
                      <span className="ht-hero-points">{pts}</span>
                      <span className="ht-hero-target">/{targetPoints}</span>
                    </div>
                  </div>

                  <div className="ht-micro-bar">
                    <div
                      className="ht-micro-fill"
                      style={{ width: `${pct}%`, background: hero.gradient }}
                    />
                  </div>
                </div>

                {/* Last Voter Shoutout Tag on Hero */}
                {voter && (
                  <div className="ht-last-voter-tag">
                    👤 {voter}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------- PHASE 2: TAG-TEAM MULTIVERSE CLASH ----------------- */}
      {stage === 'teamup' && qualifiers.length >= 4 && (
        <div className="ht-teamup-container">
          {/* Team Alpha */}
          <div className="ht-team-card" style={{ borderColor: qualifiers[0].color }}>
            <div className="ht-team-header">
              <div className="ht-team-heroes">
                <div className="ht-team-avatar-duo">
                  <div className="ht-hero-badge" style={{ background: qualifiers[0].gradient }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[0].iconSvg} /></svg>
                  </div>
                  <div className="ht-hero-badge" style={{ background: qualifiers[3].gradient }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[3].iconSvg} /></svg>
                  </div>
                </div>
                <div>
                  <div className="ht-team-title">Team Alpha: {qualifiers[0].shortName} &amp; {qualifiers[3].shortName}</div>
                  <div className="ht-team-cues">Comment <b>{qualifiers[0].callout}</b> or <b>{qualifiers[3].callout}</b></div>
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{teamupScores.team1} / {targetPoints}</div>
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

          <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>⚡ TAG-TEAM CLASH ⚡</div>

          {/* Team Omega */}
          <div className="ht-team-card" style={{ borderColor: qualifiers[1].color }}>
            <div className="ht-team-header">
              <div className="ht-team-heroes">
                <div className="ht-team-avatar-duo">
                  <div className="ht-hero-badge" style={{ background: qualifiers[1].gradient }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[1].iconSvg} /></svg>
                  </div>
                  <div className="ht-hero-badge" style={{ background: qualifiers[2].gradient }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[2].iconSvg} /></svg>
                  </div>
                </div>
                <div>
                  <div className="ht-team-title">Team Omega: {qualifiers[1].shortName} &amp; {qualifiers[2].shortName}</div>
                  <div className="ht-team-cues">Comment <b>{qualifiers[1].callout}</b> or <b>{qualifiers[2].callout}</b></div>
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{teamupScores.team2} / {targetPoints}</div>
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
          <div className="ht-finalist-card" style={{ borderColor: finalists[0].color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="ht-hero-badge" style={{ background: finalists[0].gradient, width: 44, height: 44 }}>
                <svg viewBox="0 0 24 24" style={{ width: 26, height: 26 }}><path d={finalists[0].iconSvg} /></svg>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{finalists[0].name}</div>
                <div style={{ fontSize: 11, color: '#38bdf8' }}>Type {finalists[0].callout}</div>
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{finalsScores[finalists[0].id] || 0} / {targetPoints}</div>
          </div>

          <div className="ht-versus-badge">⚡ V E R S U S ⚡</div>

          <div className="ht-finalist-card" style={{ borderColor: finalists[1].color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="ht-hero-badge" style={{ background: finalists[1].gradient, width: 44, height: 44 }}>
                <svg viewBox="0 0 24 24" style={{ width: 26, height: 26 }}><path d={finalists[1].iconSvg} /></svg>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{finalists[1].name}</div>
                <div style={{ fontSize: 11, color: '#38bdf8' }}>Type {finalists[1].callout}</div>
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{finalsScores[finalists[1].id] || 0} / {targetPoints}</div>
          </div>
        </div>
      )}

      {/* ----------------- RECENT HERO BOOSTERS (COMMENTER SHOUTOUTS) ----------------- */}
      <footer className="ht-footer-shoutout">
        <div className="ht-shoutout-header">
          <span>📡 RECENT HERO BOOSTERS (LIVE SHOUTOUTS)</span>
          <span style={{ color: '#38bdf8' }}>COMMENT TO APPEAR ON STREAM</span>
        </div>

        <div className="ht-shoutout-ticker">
          {recentShoutouts.length === 0 ? (
            <div style={{ fontSize: 11, color: '#64748b', padding: '4px 0' }}>
              Waiting for live comments... Type any superhero name in chat!
            </div>
          ) : (
            recentShoutouts.map(item => (
              <div key={item.id} className="ht-shoutout-item">
                <div className="ht-shoutout-left">
                  <span className="ht-shoutout-user">@{item.user}</span>
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
                <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️'} @{s.user}
                </span>
                <span style={{ color: '#f59e0b', fontWeight: 800 }}>+{s.points} pts</span>
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
