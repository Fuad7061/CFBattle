import { useEffect, useRef, useState, useCallback } from 'react';
import { FlagBattleEngine } from '../lib/engine.js';
import { COUNTRIES } from '../data/countries.js';

// Instantiates a FlagBattleEngine bound to a <canvas> ref, wires its event
// emitter into React state, and exposes UI controls. One instance lives for
// the lifetime of <Arena/>; it is created on mount and stopped on unmount.
export function useEngine() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [hudState, setHudState] = useState({
    alive: 0,
    total: 0,
    progressPct: 100,
    roundNumber: 0,
    stageLabel: 'QUALIFYING',
    qualifiedCount: 0,
    stageTarget: 32,
  });
  const [winnerState, setWinnerState] = useState({ show: false });
  const [stageAnnouncement, setStageAnnouncement] = useState({ show: false });
  const [eliminatedList, setEliminatedList] = useState([]);
  const [qualifiedPanel, setQualifiedPanel] = useState({ title: '', rows: [] });
  const [timer, setTimer] = useState({ mm: '00', ss: '00' });
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [commentVotes, setCommentVotes] = useState({});
  const [targetReviveVotes, setTargetReviveVotes] = useState(4);
  const [teamStats, setTeamStats] = useState(null);
  const [top5, setTop5] = useState({ show: false, rows: [] });
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const engine = new FlagBattleEngine(canvasRef.current, COUNTRIES);
    engineRef.current = engine;
    window.gameInstance = engine; // Expose globally for remote control

    if (engine.settings?.reviveVotes) {
      setTargetReviveVotes(Number(engine.settings.reviveVotes));
    }

    const unsubs = [
      engine.on('hud', setHudState),
      engine.on('winner', setWinnerState),
      engine.on('stage', setStageAnnouncement),
      engine.on('eliminated', setEliminatedList),
      engine.on('qualifiedListChanged', setQualifiedPanel),
      engine.on('timer', setTimer),
      engine.on('soundChanged', ({ enabled }) => setSoundEnabledState(enabled)),
      engine.on('pauseChanged', ({ paused }) => setIsPaused(Boolean(paused))),
      engine.on('commentVotes', setCommentVotes),
      engine.on('teams', setTeamStats),
      engine.on('top5', setTop5),
      engine.on('settingsChanged', (s) => {
        if (s?.reviveVotes) setTargetReviveVotes(Number(s.reviveVotes));
      }),
    ];

    engine.start();

    return () => {
      unsubs.forEach((unsub) => unsub());
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  const newRound = useCallback(() => engineRef.current?.newRound(), []);
  const shrinkArena = useCallback(() => engineRef.current?.shrinkArena(), []);
  const toggleSound = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.primeAudioOnGesture();
    engine.setSoundEnabled(!engine.soundEnabled);
  }, []);
  const applyVoteBoost = useCallback((code, factor, durationMs) => {
    engineRef.current?.applyVoteBoost(code, factor, durationMs);
  }, []);
  const instantPush = useCallback((code, weight, author, superChat) => {
    engineRef.current?.instantPush(code, weight, author, superChat);
  }, []);
  const pause = useCallback(() => engineRef.current?.pause(), []);
  const resume = useCallback(() => engineRef.current?.resume(), []);
  const togglePause = useCallback(() => engineRef.current?.togglePause(), []);

  return {
    canvasRef,
    engineRef,
    hudState,
    winnerState,
    stageAnnouncement,
    eliminatedList,
    qualifiedDisplayList: qualifiedPanel,
    timer,
    commentVotes,
    targetReviveVotes,
    teamStats,
    top5,
    isPaused,
    controls: { newRound, shrinkArena, toggleSound, soundEnabled, applyVoteBoost, instantPush, pause, resume, togglePause, isPaused },
  };
}
