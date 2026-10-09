import React, { useState, useCallback } from 'react';
import { useEngine } from './hooks/useEngine.js';
import { useYoutubeChat } from './hooks/useYoutubeChat.js';
import { COUNTRIES } from './data/countries.js';
import Header from './components/Header.jsx';
import QualifiedPanel from './components/QualifiedPanel.jsx';
import TopSupportersPanel from './components/TopSupportersPanel.jsx';
import RoundInfo from './components/RoundInfo.jsx';
import Arena from './components/Arena.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import EliminatedBar from './components/EliminatedBar.jsx';
import ChatOverlay from './components/ChatOverlay.jsx';
import ControlsOverlay from './components/ControlsOverlay.jsx';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const isStream = params.get('headless') === 'true' || params.get('clean') === 'true';
  const {
    canvasRef,
    engineRef,
    hudState,
    winnerState,
    stageAnnouncement,
    eliminatedList,
    qualifiedDisplayList,
    timer,
    commentVotes,
    targetReviveVotes,
    controls,
  } = useEngine();

  const [chatMessages, setChatMessages] = useState([]);

  // Simple, clearly-scoped vote -> gameplay hook: every time the tally
  // updates, boost whichever country currently has the most votes. If that
  // country isn't among the flags still alive in the current mini-battle,
  // applyVoteBoost is a harmless no-op (the engine only reads a code's
  // boost for flags that are actually in play). Exact game-balance tuning
  // (factor, duration, decay curve) is intentionally left for later.
  const handleVoteTally = useCallback(
    (tally) => {
      let bestCode = null;
      let bestCount = 0;
      Object.entries(tally).forEach(([code, count]) => {
        if (count > bestCount) {
          bestCount = count;
          bestCode = code;
        }
      });
      if (bestCode) {
        controls.applyVoteBoost(bestCode, 1.4, 5000);
      }
    },
    [controls]
  );

  const [topSupporters, setTopSupporters] = useState([]);

  useYoutubeChat({
    onMessage: (msg) => {
      if (msg.type === 'SETTINGS_UPDATE' || msg.type === 'SYNC_STATE') {
          if (engineRef.current && msg.settings) {
              engineRef.current.settings = { ...engineRef.current.settings, ...msg.settings };
              if (msg.settings.rotSpeed !== undefined) {
                  engineRef.current.GATE_SPIN = Number(msg.settings.rotSpeed);
              }
          }
          if (msg.type === 'SETTINGS_UPDATE') return;
      }
      if (msg.type === 'VIEWER_COUNT') {
        // forward if engine/UI cares
      }
      if (msg.type === 'POWER' && engineRef.current?.applyPower) {
        engineRef.current.applyPower({ ...msg.power, ...msg, author: msg.author });
      }
      setChatMessages((prev) => [...prev.slice(-49), msg]);
      if (msg.vote) {
        controls.instantPush(msg.vote.code, msg.vote.weight || 1, msg.author, Boolean(msg.vote.superChat));
      }
    },
    onVoteTally: handleVoteTally,
    onTopSupporters: (supporters) => {
        const sorted = Object.entries(supporters)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, weight]) => ({ name, weight }));
        setTopSupporters(sorted);
    }
  });

  return (
    <div className="stadium-backdrop flex flex-col h-full relative">
      <Header
        flagCount={COUNTRIES.length}
        onNewRound={controls.newRound}
        onShrinkArena={controls.shrinkArena}
        onToggleSound={controls.toggleSound}
        soundEnabled={controls.soundEnabled}
      />

      <div className="flex px-4 justify-between" style={{ gap: '10px' }}>
        <div className="flex-1 mx-0 mt-1">
            <QualifiedPanel title={qualifiedDisplayList.title} rows={qualifiedDisplayList.rows} engineRef={engineRef} />
        </div>
        <div className="flex-1 mx-0 mt-1">
            <TopSupportersPanel supporters={topSupporters} />
        </div>
      </div>

      <RoundInfo
        roundNumber={hudState.roundNumber}
        stageLabel={hudState.stageLabel}
        qualifiedCount={hudState.qualifiedCount}
        stageTarget={hudState.stageTarget}
        timer={timer}
      />

      <div className="relative flex flex-col md:flex-row flex-1 min-h-0">
        <div className="w-full md:w-auto md:absolute md:inset-y-2 md:left-4 z-40 order-2 md:order-none px-2 py-1 md:p-0 flex-none flex items-stretch">
          <ChatOverlay 
            messages={chatMessages} 
            commentVotes={commentVotes} 
            targetVotes={targetReviveVotes}
            eliminatedList={eliminatedList}
          />
        </div>
        <Arena canvasRef={canvasRef} winnerState={winnerState} stageAnnouncement={stageAnnouncement} engineRef={engineRef} />
      </div>

      <ProgressBar alive={hudState.alive} total={hudState.total} progressPct={hudState.progressPct} />

      <EliminatedBar 
        eliminatedList={eliminatedList} 
        engineRef={engineRef} 
        commentVotes={commentVotes}
        targetVotes={targetReviveVotes}
      />
      
      <ControlsOverlay engineRef={engineRef} isStream={isStream} />
    </div>
  );
}
