import React, { useState, useCallback, useEffect } from 'react';
import { useEngine } from './hooks/useEngine.js';
import { useYoutubeChat } from './hooks/useYoutubeChat.js';
import QualifiedPanel from './components/QualifiedPanel.jsx';
import TopSupportersPanel from './components/TopSupportersPanel.jsx';
import TeamsPanel from './components/TeamsPanel.jsx';
import Top5Tracker from './components/Top5Tracker.jsx';
import Arena from './components/Arena.jsx';
import ChatOverlay from './components/ChatOverlay.jsx';
import ReviveTrackers from './components/ReviveTrackers.jsx';
import ControlsOverlay from './components/ControlsOverlay.jsx';
import './landscape.css';

// Landscape "live broadcast" view. The gameplay canvas fills the whole frame
// (like the vertical 9:16 view) and every HUD element is layered on top and
// anchored to the edges — round header up top, campaign winners / supporters /
// elimination feed on the left, top-5 / revive trackers / live chat on the
// right, and the active-countries roster along the bottom. The engine, campaign
// flow, chat, teams and tournament logic are this project's own.
export default function App() {
  const params = new URLSearchParams(window.location.search);
  // Match the vertical app: `stream` is what OBS/the recorder loads, so the
  // control bar must stay hidden for it too — not just for headless/clean.
  const isStream =
    params.get('headless') === 'true' ||
    params.get('stream') === 'true' ||
    params.get('clean') === 'true';

  const {
    canvasRef,
    engineRef,
    hudState,
    winnerState,
    stageAnnouncement,
    eliminatedList,
    qualifiedDisplayList,
    commentVotes,
    targetReviveVotes,
    teamStats,
    top5,
    controls,
  } = useEngine();

  const [chatMessages, setChatMessages] = useState([]);
  const [running, setRunning] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  // Keep the paused/playing state in step with the engine without re-rendering
  // on every frame.
  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (e) setRunning((prev) => (prev === e.running ? prev : e.running));
    }, 400);
    return () => clearInterval(id);
  }, [engineRef]);

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
      if (bestCode) controls.applyVoteBoost(bestCode, 1.4, 5000);
    },
    [controls]
  );

  const [topSupporters, setTopSupporters] = useState([]);
  const [latestShoutout, setLatestShoutout] = useState(null);

  const processedPowerIds = React.useRef(new Set());

  useYoutubeChat({
    onMessage: (msg) => {
      if (msg.type === 'SETTINGS_UPDATE' || msg.type === 'SYNC_STATE') {
        if (engineRef.current && msg.settings) {
          const e = engineRef.current;
          const s = msg.settings;
          e.settings = { ...e.settings, ...s };
          // Same mapping the dashboard preview and the stream boot use:
          // `speed` is gameplay speed, `rotSpeed` is arena rotation.
          if (s.speed !== undefined) e.settings.speedMult = Number(s.speed);
          if (s.rotSpeed !== undefined) {
            e.settings.rotSpeed = Number(s.rotSpeed);
            e.GATE_SPIN = Number(s.rotSpeed);
          }
          if (s.gravity !== undefined) e.settings.gravity = Number(s.gravity);
          if (s.bias !== undefined) e.settings.bias = s.bias;
        }
        if (msg.type === 'SETTINGS_UPDATE') return;
      }
      if ((msg.type === 'POWER' || msg.power) && engineRef.current?.applyPower) {
        const pKey = msg.id || `${msg.author || ''}_${msg.power?.power || msg.power || ''}_${msg.power?.code || msg.code || ''}_${msg.timestamp || ''}`;
        if (!processedPowerIds.current.has(pKey)) {
          processedPowerIds.current.add(pKey);
          if (processedPowerIds.current.size > 200) {
            const first = processedPowerIds.current.values().next().value;
            processedPowerIds.current.delete(first);
          }
          const p = msg.power ? { ...msg.power, author: msg.author } : { ...msg, author: msg.author };
          engineRef.current.applyPower(p);
        }
      }
      // The stream already shows raw YouTube chat, so this panel is an
      // interaction feed: only votes, paid powers and Super Chats earn a row.
      if (msg.type !== 'VIEWER_COUNT' && (msg.vote || msg.power || msg.superChat)) {
        setChatMessages((prev) => [...prev.slice(-49), msg]);
      }
      if (msg.vote) {
        controls.instantPush(msg.vote.code, msg.vote.weight || 1, msg.author, Boolean(msg.vote.superChat));
      }
    },
    onVoteTally: handleVoteTally,
    onTopSupporters: (supporters, shoutout) => {
      if (Array.isArray(supporters)) {
        setTopSupporters(supporters);
      } else if (supporters && typeof supporters === 'object') {
        const sorted = Object.entries(supporters)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, weight]) => ({ name, points: weight, weight }));
        setTopSupporters(sorted);
      }
      if (shoutout) {
        setLatestShoutout(shoutout);
      }
    },
  });

  const isFinal = hudState.phase === 'final';
  const feedRows = [...eliminatedList].reverse().slice(0, 7);
  const rosterRows = hudState.rosterRows || [];

  // Eliminated flags currently being voted back in (votes but not yet saved).
  const revivePending = eliminatedList
    .map((e) => ({
      code: e.code,
      name: e.name || e.code,
      votes: commentVotes[(e.code || '').toUpperCase()] || 0,
    }))
    .filter((e) => e.votes > 0 && e.votes < targetReviveVotes)
    .slice(-3)
    .reverse();

  return (
    <div className="landscape-shell">
      <div className="arena-stage">
        <Arena
          canvasRef={canvasRef}
          winnerState={winnerState}
          stageAnnouncement={stageAnnouncement}
          engineRef={engineRef}
        />
        {!running && (
          <div className="arena-center-hint">
            <span>THE STAGE IS SET</span>
            <strong>Let the world collide.</strong>
          </div>
        )}
        <ReviveTrackers items={revivePending} target={targetReviveVotes} />
      </div>

      <div className="hud">
        <div className="hud-top">
          <div className="rh-left">
            <span className="rh-label">ROUND {String(hudState.campaignNum || 1).padStart(2, '0')}</span>
            <span className="rh-sep">🔥</span>
            <span className="rh-timer">{hudState.alive || 0} IN ARENA</span>
            <span className="rh-sep">·</span>
            <span className="rh-phase">{isFinal ? 'GRAND FINAL' : 'QUALIFYING'}</span>
          </div>
          <div className="hud-top-center">
            {isFinal ? 'ONE SURVIVOR · SLOW MOTION · CROWN A CHAMPION' : 'LAST FLAG STANDING TAKES THE ROUND'}
          </div>
          <div className="rh-right">
            <span className="live-dot" />
            {running ? 'LIVE' : 'PAUSED'} · BATTLE MOD · ENDLESS
          </div>
        </div>

        <div className="hud-rails">
          <aside className="rail rail-left">
            <QualifiedPanel
              title={qualifiedDisplayList.title}
              rows={qualifiedDisplayList.rows}
              engineRef={engineRef}
            />
            <TeamsPanel teams={teamStats} />
            <TopSupportersPanel supporters={topSupporters} latestShoutout={latestShoutout} />

            <div className="elim-feed">
              {feedRows.map((f, i) => (
                <div className="elim-toast" key={`${f.code}-${i}`}>
                  <img src={`/flags/${(f.code || '').toLowerCase()}.svg`} alt="" />
                  <span>{(f.name || f.code || '').toUpperCase()}</span> ELIMINATED
                </div>
              ))}
            </div>
          </aside>

          <div className="rail-center" />

          <aside className="rail rail-right">
            {top5?.show && <Top5Tracker rows={top5.rows} engineRef={engineRef} />}

            <div className="chat-cta">Comment Your Country Flag Name To Save</div>

            <div className="rail-chat">
              <ChatOverlay
                messages={chatMessages}
                commentVotes={commentVotes}
                targetVotes={targetReviveVotes}
                eliminatedList={eliminatedList}
              />
            </div>
          </aside>
        </div>

        <div className="hud-bottom">
          <div className="counter-row">
            <div className="progress-bg">
              <div className="progress-fill" style={{ width: `${hudState.progressPct}%` }} />
            </div>
            <span className="counter-text">
              {hudState.alive || 0} / {hudState.total || rosterRows.length || 0} FLAGS
            </span>
          </div>
          <div className="roster-section">
            <div className="roster-header">Active Countries</div>
            <div className="roster-grid">
              {rosterRows.map((f) => (
                <img
                  key={f.code}
                  className={f.alive ? '' : 'dead'}
                  src={`/flags/${(f.code || '').toLowerCase()}.svg`}
                  alt=""
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="portrait-chat-toggle"
        onClick={() => setChatOpen((v) => !v)}
        aria-label="Toggle vote actions"
      >
        VOTE ACTIONS
      </button>

      {chatOpen && (
        <div className="portrait-chat-sheet">
          <div className="pcs-head">
            <span className="pcs-title">Vote Actions</span>
            <button type="button" className="pcs-close" onClick={() => setChatOpen(false)} aria-label="Close chat">
              Close
            </button>
          </div>
          <div className="chat-cta">Comment Your Country Flag Name To Save</div>
          <div className="pcs-body">
            <ChatOverlay
              messages={chatMessages}
              commentVotes={commentVotes}
              targetVotes={targetReviveVotes}
              eliminatedList={eliminatedList}
            />
          </div>
        </div>
      )}

      <ControlsOverlay engineRef={engineRef} isStream={isStream} />
    </div>
  );
}
