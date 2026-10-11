import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HEROES, findHeroFromComment } from './heroData.js';
import { heroAudio } from './heroAudio.js';
import './heroTournament.css';

// Realistic Simulated Chatters for Auto-Voter when real chat is idle
const SIMULATED_HERO_FANS = [
  { name: 'SpideyFan_NY', heroId: 'spidey' },
  { name: 'ReedRichards_F4', heroId: 'reed' },
  { name: 'WandaMaximoff_Hex', heroId: 'wanda' },
  { name: 'Logan_WeaponX', heroId: 'wolverine' },
  { name: 'Deadpool_Wade', heroId: 'deadpool' },
  { name: 'Strange_KamarTaj', heroId: 'doctorstrange' },
  { name: 'TonyStark_3000', heroId: 'ironman' },
  { name: 'Thor_Asgard', heroId: 'thor' },
  { name: 'Loki_GodOfStories', heroId: 'loki' },
  { name: 'Banner_Smash', heroId: 'hulk' },
  { name: 'SteveRogers_Cap', heroId: 'captainamerica' },
  { name: 'Shuri_Wakanda', heroId: 'blackpanther' },
  { name: 'JohnnyStorm_Flame', heroId: 'torch' },
  { name: 'GhostRider_Blaze', heroId: 'ghostrider' },
  { name: 'Venom_Eddie', heroId: 'venom' },
  { name: 'Thanos_Titan', heroId: 'thanos' }
];

// Menacing Doctor Doom taunts for interactive popup events
const DOOM_TAUNTS = [
  { quote: "NONE SHALL SURPASS DOOM!", sub: "Doctor Doom's shield resists the multiverse!" },
  { quote: "DOOM IS INEVITABLE!", sub: "Can any hero breach the Latverian throne?" },
  { quote: "YOUR HEROES WILL FALL!", sub: "Vote in chat to empower your champion!" },
  { quote: "THE MULTIVERSE KNEELS TO DOOM!", sub: "Type your hero's name to strike Doom!" }
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

  // Engaging Popups State (Milestones, Doom Taunts, Level-Ups)
  const [activePopup, setActivePopup] = useState(null);
  const [floatingDamage, setFloatingDamage] = useState([]);

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
  // AUDIO & BGM INITIALIZATION (Automatic Background Playback)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const startAudioEngine = () => {
      heroAudio.ensureContext();
      heroAudio.playBgMusic();
      window.removeEventListener('click', startAudioEngine);
      window.removeEventListener('keydown', startAudioEngine);
    };
    window.addEventListener('click', startAudioEngine);
    window.addEventListener('keydown', startAudioEngine);

    // Auto-start music if possible
    try {
      heroAudio.playBgMusic();
    } catch (e) {}

    return () => {
      window.removeEventListener('click', startAudioEngine);
      window.removeEventListener('keydown', startAudioEngine);
      heroAudio.pauseBgMusic();
    };
  }, []);

  // Sync music intensity with stage
  useEffect(() => {
    heroAudio.setMusicIntensity(stage);
  }, [stage]);

  // Periodic Doctor Doom Taunt Popup (adds dynamic stream excitement)
  useEffect(() => {
    const tauntInterval = setInterval(() => {
      if (tournamentStageRef.current === 'celebration') return;
      const randomTaunt = DOOM_TAUNTS[Math.floor(Math.random() * DOOM_TAUNTS.length)];
      try {
        heroAudio.playBoost('#10b981');
        heroAudio.speak(`Doctor Doom warns: ${randomTaunt.quote}`);
      } catch (e) {}
      triggerPopup({
        id: 'doom-' + Date.now(),
        icon: '💀',
        badge: 'DOCTOR DOOM LATVERIAN COMMAND',
        title: randomTaunt.quote,
        subtitle: randomTaunt.sub,
        color: '#10b981',
        type: 'doom'
      }, 3400);
    }, 22000);

    return () => clearInterval(tauntInterval);
  }, []);

  // Popup Trigger Helper
  const triggerPopup = (popupData, duration = 3000) => {
    setActivePopup(popupData);
    setTimeout(() => {
      setActivePopup(current => (current?.id === popupData.id ? null : current));
    }, duration);
  };

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
  // EXPOSE GLOBAL API FOR DIRECTOR CONTROLS
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
        heroAudio.speak('Avengers Doomsday gauntlet reset! Who will defeat Doctor Doom?');
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
        else if (cmd === 'mute') heroAudio.toggleMute();
      } else if (e.data.type === 'LIVE_SETTINGS_UPDATE' && e.data.settings) {
        const s = e.data.settings;
        if (s.pointsTarget !== undefined) setTargetPoints(Number(s.pointsTarget) || 50);
        if (s.musicVol !== undefined) heroAudio.setVolume(Number(s.musicVol));
        if (s.customMusicUrl) {
          heroAudio.loadBgMusic(s.customMusicUrl);
          heroAudio.playBgMusic();
        }
      } else if (e.data.type === 'MUSIC_UPDATE' && e.data.src) {
        heroAudio.loadBgMusic(e.data.src);
        heroAudio.playBgMusic();
      }
    };

    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [targetPoints]);

  // --------------------------------------------------------------------------
  // CORE VOTE PROCESSOR: Adds points, triggers audio, shoutouts, popups & gates
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

    // Spawn Floating Attack Particle
    const damageId = Date.now() + Math.random().toString(36).slice(2, 6);
    setFloatingDamage(prev => [
      ...prev.slice(-3),
      { id: damageId, heroId, text: `+${points} ${hero.attackName}`, color: hero.color }
    ]);
    setTimeout(() => {
      setFloatingDamage(prev => prev.filter(d => d.id !== damageId));
    }, 900);

    // Update Shoutout Feed (max 2 items for sleek fit)
    const shoutoutItem = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      user: formattedUser,
      heroName: hero.name,
      heroColor: hero.color,
      attackName: hero.attackName,
      points
    };
    setRecentShoutouts(prev => [shoutoutItem, ...prev.slice(0, 1)]);

    // Update Leaderboard Stats for Podium
    setSupporterTotals(prev => ({
      ...prev,
      [formattedUser]: {
        points: (prev[formattedUser]?.points || 0) + points,
        heroName: hero.name
      }
    }));

    // Trigger Engaging Combo Popup on Multi-point strikes or SuperChats
    if (points >= 3 || isSuperChat) {
      triggerPopup({
        id: 'combo-' + heroId + '-' + Date.now(),
        icon: '💥',
        badge: isSuperChat ? '💎 SUPERCHAT ULTRA STRIKE' : '⚡ POWER COMBO STRIKE',
        title: `+${points} STRIKE BY ${formattedUser}!`,
        subtitle: `${hero.name} unleashed ${hero.attackName} on Doctor Doom!`,
        color: hero.color,
        type: 'combo'
      }, 2500);
    }

    const currentStage = tournamentStageRef.current;
    const currentQualifiers = qualifiersRef.current;
    const currentFinalists = finalistsRef.current;
    const currentTarget = targetPointsRef.current;

    // PHASE 1: QUALIFIERS (DOOMSDAY GAUNTLET)
    if (currentStage === 'qualifiers') {
      setQualifierScores(prev => {
        const curScore = prev[heroId] || 0;
        const newScore = curScore + points;

        // Milestone 1: 15 Points (Defense Shield Cracked)
        if (curScore < 15 && newScore >= 15 && newScore < Math.floor(currentTarget / 2)) {
          triggerPopup({
            id: 'm15-' + heroId,
            icon: '⚡',
            badge: 'DEFENSE SHIELD CRACKED',
            title: `${hero.name.toUpperCase()} REACHED 15 PTS!`,
            subtitle: `${formattedUser} landed a powerful strike on Doom!`,
            color: hero.color,
            type: 'milestone'
          }, 2400);
        }

        // Milestone 2: Halfway point (25 points)
        else if (curScore < Math.floor(currentTarget / 2) && newScore >= Math.floor(currentTarget / 2) && newScore < currentTarget - 8) {
          triggerPopup({
            id: 'half-' + heroId,
            icon: '💥',
            badge: 'CRITICAL STRIKE ON DOOM',
            title: `${hero.name.toUpperCase()} HALFWAY TO QUALIFY!`,
            subtitle: `${formattedUser} powered up ${hero.name}!`,
            color: hero.color,
            type: 'milestone'
          }, 2600);
        }

        // Milestone 3: 40 Points (Final Push)
        else if (curScore < currentTarget - 10 && newScore >= currentTarget - 10 && newScore < currentTarget) {
          triggerPopup({
            id: 'near-' + heroId,
            icon: '🔥',
            badge: 'FINAL STRIKE INCOMING',
            title: `${hero.name.toUpperCase()} ONLY 10 PTS TO QUALIFY!`,
            subtitle: `Type ${hero.name} now in chat to secure the spot!`,
            color: hero.color,
            type: 'milestone'
          }, 2600);
        }

        // Check if this hero just crossed the qualification threshold (50 points)
        if (newScore >= currentTarget && curScore < currentTarget) {
          setQualifiers(qPrev => {
            if (qPrev.length < 4 && !qPrev.some(h => h.id === heroId)) {
              const updated = [...qPrev, hero];
              qualifiersRef.current = updated;
              heroAudio.playQualifiedBell();
              heroAudio.speak(`${hero.name} has breached Doctor Doom's shield!`);

              // Trigger Hero Qualification Popup
              triggerPopup({
                id: 'qual-' + heroId,
                icon: '👑',
                badge: `STRIKE FORCE SLOT #${updated.length} LOCKED`,
                title: `${hero.name.toUpperCase()} ADVANCES!`,
                subtitle: `Breached Doctor Doom's defenses!`,
                color: '#f59e0b',
                type: 'qualify'
              }, 3200);

              // If 4 heroes qualified, advance to Phase 2 (Teamup Strike)
              if (updated.length >= 4) {
                setTimeout(() => {
                  setStage('teamup');
                  tournamentStageRef.current = 'teamup';
                  heroAudio.playTeamupGong();
                  heroAudio.speak(`Alliance strike force engaged! Vote your hero to attack Doctor Doom!`);
                  triggerPopup({
                    id: 'stage-teamup',
                    icon: '⚔️',
                    badge: 'PHASE 2 ENGAGED',
                    title: 'ALLIANCE STRIKE FORCE!',
                    subtitle: 'Vote your heroes to lead the assault on Doom!',
                    color: '#10b981',
                    type: 'stage'
                  }, 3500);
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

    // PHASE 2: TEAMUP (2v2 ALLIANCE STRIKE FORCE AGAINST DOOM)
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
              heroAudio.speak(`Grand Final! Who will deliver the death blow to Doctor Doom?`);
              triggerPopup({
                id: 'stage-finals',
                icon: '🔥',
                badge: 'PHASE 3: GRAND FINAL',
                title: 'FINAL STAND AGAINST DOOM!',
                subtitle: `${winningTeamHeroes[0].name} vs ${winningTeamHeroes[1].name}!`,
                color: '#ef4444',
                type: 'stage'
              }, 3500);
            }, 800);
          }

          return { ...prev, [tKey]: newTeamScore };
        });
      }
    }

    // PHASE 3: GRAND FINAL (1v1 SHOWDOWN — WHO DELIVERS THE FINAL BLOW TO DOOM?)
    else if (currentStage === 'finals' && currentFinalists.length === 2) {
      if (currentFinalists.some(h => h.id === heroId)) {
        setFinalsScores(prev => {
          const newScore = (prev[heroId] || 0) + points;

          if (newScore >= currentTarget) {
            // Champion Crowned! Doctor Doom is defeated!
            setTimeout(() => {
              setChampion(hero);
              setStage('celebration');
              tournamentStageRef.current = 'celebration';
              heroAudio.playVictoryFanfare();
              heroAudio.speak(`${hero.name} has slain Doctor Doom and saved the Multiverse!`);
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
        const available = HEROES.filter(h => (qualifierScores[h.id] || 0) < targetPoints);
        if (available.length > 0) {
          targetHero = available[Math.floor(Math.random() * available.length)];
        }
      } else if (currentStage === 'teamup' && qualifiers.length >= 4) {
        targetHero = qualifiers[Math.floor(Math.random() * qualifiers.length)];
      } else if (currentStage === 'finals' && finalists.length === 2) {
        targetHero = finalists[Math.floor(Math.random() * finalists.length)];
      }

      if (targetHero) {
        // Occasionally simulate a 2-point strike or 3-point critical strike (1 in 5 votes) to showcase dynamic particle animations
        const pts = Math.random() < 0.22 ? (Math.random() < 0.5 ? 2 : 3) : 1;
        processHeroVote(targetHero, pts, fan.name, false);
      }
    }, 2400);

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
          heroAudio.speak('Avengers Doomsday returns! Who will defeat Doctor Doom?');
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
      {/* Doctor Doom Stained-Glass Ambient Glow */}
      <div className="ht-stained-glass-bg" />
      <div className="ht-nebula-bg" />

      {/* ----------------- DYNAMIC ENGAGING POPUP NOTIFICATION ----------------- */}
      {activePopup && (
        <div
          key={activePopup.id}
          className={`ht-popup-overlay ht-popup-${activePopup.type}`}
          style={{ '--popup-accent': activePopup.color }}
        >
          <div className="ht-popup-card">
            <div className="ht-popup-icon-glow">{activePopup.icon}</div>
            <div className="ht-popup-body">
              <span className="ht-popup-badge">{activePopup.badge}</span>
              <span className="ht-popup-title">{activePopup.title}</span>
              <span className="ht-popup-sub">{activePopup.subtitle}</span>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TOP BROADCAST HEADER (DOCTOR DOOM THEME) ----------------- */}
      <header className="ht-header">
        <div className="ht-title-strip">
          <div className="ht-title-left">
            <span className="ht-title-doom-icon">💀</span>
            <div className="ht-title-meta">
              <span className="ht-title-text">AVENGERS: DOOMSDAY</span>
              <span className="ht-stage-pill">
                {stage === 'qualifiers' && `WHO CAN DEFEAT DOCTOR DOOM? (GOAL: ${targetPoints})`}
                {stage === 'teamup' && `ALLIANCE STRIKE FORCE AGAINST DOOM`}
                {stage === 'finals' && `FINAL STAND: WHO DEFEATS DOOM?`}
                {stage === 'celebration' && `DOCTOR DOOM IS SLAIN!`}
              </span>
            </div>
          </div>

          {/* Clean Latverian Boss Threat Pill (Zero clickable buttons) */}
          <div className="ht-doom-threat-badge">
            <span className="ht-doom-target-icon">🎯</span>
            <span className="ht-doom-target-text">DOOM'S SHIELD: {targetPoints}P</span>
          </div>
        </div>

        {/* ----------------- PROMINENT STREAMLINED VOTING TICKER ----------------- */}
        <div className="ht-join-banner">
          <div className="ht-join-inner">
            <div className="ht-join-cue">
              <span className="ht-chat-icon">💬</span>
              <span>WHO BEATS DOOM?</span>
            </div>
            <div className="ht-join-keywords">
              <span className="ht-kw-pill">SPIDEY</span>
              <span className="ht-kw-pill">REED</span>
              <span className="ht-kw-pill">WANDA</span>
              <span className="ht-kw-pill">WOLVERINE</span>
              <span className="ht-kw-pill">DEADPOOL</span>
              <span className="ht-kw-pill">STRANGE</span>
              <span className="ht-kw-pill">THOR</span>
            </div>
          </div>
        </div>
      </header>

      {/* ----------------- QUALIFIERS SLOTS (TOP 4 TO FACE DOCTOR DOOM) ----------------- */}
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
                  <div className="ht-slot-placeholder">STRIKE #{idx + 1}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------- PHASE 1: 16-HERO DOOMSDAY GAUNTLET ----------------- */}
      {stage === 'qualifiers' && (
        <div className="ht-tracks-container">
          {sortedHeroes.map((hero, idx) => {
            const pts = qualifierScores[hero.id] || 0;
            const pct = Math.min(100, Math.round((pts / targetPoints) * 100));
            const isQualified = qualifiers.some(q => q.id === hero.id);
            const isBumped = bumpedHeroId === hero.id;
            const voter = lastVoters[hero.id];
            const isTop4 = idx < 4;
            const heroDamage = floatingDamage.find(d => d.heroId === hero.id);

            return (
              <React.Fragment key={hero.id}>
                {/* Visual Cutoff Banner between #4 and #5 */}
                {idx === 4 && (
                  <div className="ht-cutoff-divider">
                    <div className="ht-cutoff-line" />
                    <span className="ht-cutoff-label">💀 TOP 4 ADVANCE TO FACE DOCTOR DOOM 💀</span>
                    <div className="ht-cutoff-line" />
                  </div>
                )}

                <div
                  className={`ht-hero-row ${isBumped ? 'bump' : ''} ${isQualified ? 'qualified' : ''} ${isTop4 ? 'qualifying-zone' : ''}`}
                  style={{
                    boxShadow: isBumped ? `0 0 16px ${hero.glow}` : 'none'
                  }}
                >
                  {/* Floating Damage Popup on Hero Row */}
                  {heroDamage && (
                    <div
                      key={heroDamage.id}
                      className="ht-damage-float"
                      style={{ color: heroDamage.color }}
                    >
                      {heroDamage.text}
                    </div>
                  )}

                  {/* Background Progress Fill with smooth gradient */}
                  <div
                    className="ht-row-progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: hero.gradient
                    }}
                  />

                  {/* Rank Pill: Latverian Gold for Top 4, Dark Slate for rest */}
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

      {/* ----------------- PHASE 2: ALLIANCE STRIKE FORCE AGAINST DOOM ----------------- */}
      {stage === 'teamup' && qualifiers.length >= 4 && (
        <div className="ht-teamup-container">
          <div className="ht-phase-title-badge">⚔️ ALLIANCE STRIKE FORCE AGAINST DOCTOR DOOM ⚔️</div>

          {/* Team Alpha */}
          <div className="ht-team-card" style={{ borderColor: qualifiers[0].color }}>
            <div className="ht-team-header">
              <div className="ht-team-heroes">
                <div className="ht-team-avatar-duo">
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[0].gradient, width: 44, height: 44 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[0].iconSvg} /></svg>
                  </div>
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[3].gradient, width: 44, height: 44 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[3].iconSvg} /></svg>
                  </div>
                </div>
                <div>
                  <div className="ht-team-title">TEAM ALPHA: {qualifiers[0].name} &amp; {qualifiers[3].name}</div>
                  <div className="ht-team-cues">Type <b>{qualifiers[0].name}</b> or <b>{qualifiers[3].name}</b> to strike!</div>
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

          <div className="ht-vs-divider">⚡ ALLIANCE CLASH ⚡</div>

          {/* Team Omega */}
          <div className="ht-team-card" style={{ borderColor: qualifiers[1].color }}>
            <div className="ht-team-header">
              <div className="ht-team-heroes">
                <div className="ht-team-avatar-duo">
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[1].gradient, width: 44, height: 44 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[1].iconSvg} /></svg>
                  </div>
                  <div className="ht-hero-avatar-box" style={{ background: qualifiers[2].gradient, width: 44, height: 44 }}>
                    <svg viewBox="0 0 24 24"><path d={qualifiers[2].iconSvg} /></svg>
                  </div>
                </div>
                <div>
                  <div className="ht-team-title">TEAM OMEGA: {qualifiers[1].name} &amp; {qualifiers[2].name}</div>
                  <div className="ht-team-cues">Type <b>{qualifiers[1].name}</b> or <b>{qualifiers[2].name}</b> to strike!</div>
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

      {/* ----------------- PHASE 3: FINAL STAND (WHO DELIVERS THE FINAL BLOW TO DOOM?) ----------------- */}
      {stage === 'finals' && finalists.length === 2 && (
        <div className="ht-final-container">
          <div className="ht-phase-title-badge">👑 FINAL STAND: WHO DELIVERS THE FINAL BLOW TO DOOM? 👑</div>

          {/* Finalist 1 */}
          <div className="ht-finalist-card" style={{ borderColor: finalists[0].color }}>
            <div className="ht-finalist-top">
              <div className="ht-finalist-left">
                <div className="ht-hero-avatar-box" style={{ background: finalists[0].gradient, width: 48, height: 48 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }}><path d={finalists[0].iconSvg} /></svg>
                </div>
                <div>
                  <div className="ht-finalist-name">{finalists[0].name}</div>
                  <div className="ht-finalist-sub">Type <b>{finalists[0].name}</b> to strike Doctor Doom!</div>
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
                  <div className="ht-finalist-sub">Type <b>{finalists[1].name}</b> to strike Doctor Doom!</div>
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
          <span className="ht-shoutout-title">📡 LIVE HERO STRIKES AGAINST DOCTOR DOOM</span>
          <span className="ht-shoutout-cta">TYPE IN CHAT TO APPEAR ON STREAM</span>
        </div>

        <div className="ht-shoutout-ticker">
          {recentShoutouts.length === 0 ? (
            <div className="ht-shoutout-waiting">
              💬 Who can defeat Doctor Doom? Type any hero name in chat!
            </div>
          ) : (
            recentShoutouts.map(item => (
              <div key={item.id} className="ht-shoutout-item">
                <div className="ht-shoutout-left">
                  <span className="ht-shoutout-user">{item.user}</span>
                  <span className="ht-shoutout-hero" style={{ color: item.heroColor }}>
                    struck with {item.heroName}
                  </span>
                </div>
                <span className="ht-shoutout-attack">+{item.points} {item.attackName}</span>
              </div>
            ))
          )}
        </div>
      </footer>

      {/* ----------------- DOCTOR DOOM SLAIN (CHAMPION CELEBRATION) ----------------- */}
      {stage === 'celebration' && champion && (
        <div className="ht-victory-overlay">
          <div className="ht-victory-trophy">🏆</div>
          <div className="ht-victory-title">DOCTOR DOOM HAS BEEN DEFEATED!</div>
          <div className="ht-champion-name">{champion.name} SAVED THE MULTIVERSE!</div>

          <div className="ht-supporters-podium">
            <div className="ht-podium-header">👑 TOP HERO SAVIORS (HONOR PODIUM)</div>
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
            Next Doomsday Battle Begins in <b>{resetCountdown}</b> seconds...
          </div>
        </div>
      )}
    </div>
  );
}
