import { useEffect, useRef } from 'react';

const SERVER_URL = '';
const MAX_MESSAGES = 200;

// Opens an EventSource to the BFF's SSE chat stream, keeps a capped list of
// recent messages (for ChatOverlay via onMessage), tracks a running vote
// tally client-side from each message's parsed `vote`, and calls
// onVoteTally(tally) whenever it changes so the caller can decide how to
// feed that into the game (see App.jsx's handleVoteTally, which boosts
// whichever code currently has the most votes).
//
// Reconnects automatically (the browser's EventSource does this natively
// on a dropped connection); if the server is simply not running yet, this
// hook fails silently and the overlay just stays empty — the physics
// engine itself never depends on this connection existing.
export function useYoutubeChat({ onMessage, onVoteTally, onTopSupporters } = {}) {
  const tallyRef = useRef({});

  // Purge obsolete legacy localStorage keys that permanently locked old mock/test names
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('fb_top_supporters_map');
        localStorage.removeItem('fb_top_supporters_vertical');
      }
    } catch (e) {}
  }, []);

  const supportersRef = useRef({});
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onVoteTallyRef = useRef(onVoteTally);
  onVoteTallyRef.current = onVoteTally;
  const onTopSupportersRef = useRef(onTopSupporters);
  onTopSupportersRef.current = onTopSupporters;

  // Listen for reset events from parent iframe or dashboard
  useEffect(() => {
    const handleWinMsg = (ev) => {
      if (ev?.data?.type === 'RESET_SUPPORTERS') {
        supportersRef.current = {};
        onTopSupportersRef.current?.([], null);
      }
    };
    window.addEventListener('message', handleWinMsg);
    return () => window.removeEventListener('message', handleWinMsg);
  }, []);

  useEffect(() => {
    let es;
    try {
      es = new EventSource(`${SERVER_URL}/api/chat-stream`);
    } catch (e) {
      console.warn('[useYoutubeChat] Could not open chat stream:', e);
      return undefined;
    }

    // Helper: generate consistent vibrant gradient for avatar bubbles
    const getAvatarGradient = (name = '') => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const h1 = Math.abs(hash) % 360;
      const h2 = (h1 + 45) % 360;
      return `linear-gradient(135deg, hsl(${h1}, 78%, 46%), hsl(${h2}, 85%, 58%))`;
    };

    es.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (msg.type === 'RESET_SUPPORTERS') {
        supportersRef.current = {};
        onTopSupportersRef.current?.([], null);
        return;
      }
      
      if (msg.type === 'SETTINGS_UPDATE' || msg.type === 'SETTINGS' || msg.type === 'VIEWER_COUNT') {
          if (onMessageRef.current) onMessageRef.current(msg);
          return;
      }
      
      onMessageRef.current?.(msg);

      // 1. Tally votes if a valid vote code is present
      if (msg.vote?.code) {
        const tally = { ...tallyRef.current };
        const weight = msg.vote.weight || 1;
        tally[msg.vote.code] = (tally[msg.vote.code] || 0) + weight;
        tallyRef.current = tally;
        onVoteTallyRef.current?.(tally);
      }

      // 2. Track EVERY chatter for Live Shoutouts & Top Supporters Leaderboard
      if (msg.author) {
        const author = String(msg.author).trim();
        let weight = 1;
        let countryCode = null;
        let countryName = null;
        let action = 'Cheered in chat! 💬';

        if (msg.superChat) {
          const amt = (msg.superChat.amountMicros || 2000000) / 1000000;
          weight = Math.max(5, Math.round(amt * 2));
          if (msg.vote?.code) {
            countryCode = (msg.vote.code || '').toUpperCase();
            countryName = msg.vote.name || countryCode;
            action = `Super Chat: Saved ${countryName}! 🌟`;
          } else {
            action = `Super Chat ${msg.superChat.amountDisplayString || '💎'}`;
          }
        } else if (msg.power) {
          weight = msg.power.superChat ? 5 : 3;
          countryCode = (msg.power.code || msg.power.target || '').toUpperCase();
          const pName = (msg.power.power || 'POWER').toUpperCase();
          action = `Used ${pName} on ${countryCode || 'Arena'} ⚡`;
        } else if (msg.vote?.code) {
          weight = msg.vote.weight || 1;
          countryCode = (msg.vote.code || '').toUpperCase();
          countryName = msg.vote.name || countryCode;
          action = `Voted ${countryName}! 🚀`;
        } else if (msg.text) {
          const cleanText = String(msg.text).trim();
          action = cleanText ? `"${cleanText.length > 20 ? cleanText.slice(0, 20) + '…' : cleanText}"` : 'Active in chat! 💬';
        }

        const existing = supportersRef.current[author] || {
          name: author,
          points: 0,
          countryCode: null,
          countryName: null,
          lastAction: action,
          lastActive: 0,
          avatarColor: getAvatarGradient(author),
          initial: (author.charAt(0) || '★').toUpperCase()
        };

        existing.points += weight;
        if (countryCode) {
          existing.countryCode = countryCode;
          if (countryName) existing.countryName = countryName;
        }
        existing.lastAction = action;
        existing.lastActive = Date.now();
        supportersRef.current[author] = existing;

        const latestShoutout = {
          id: msg.id || Date.now(),
          author,
          countryCode: countryCode || existing.countryCode,
          countryName: countryName || existing.countryName,
          action,
          points: weight,
          timestamp: Date.now(),
          avatarColor: existing.avatarColor,
          initial: existing.initial
        };

        // Sort top supporters: highest points first, then most recently active
        const sorted = Object.values(supportersRef.current)
          .sort((a, b) => b.points - a.points || b.lastActive - a.lastActive)
          .slice(0, 5);

        onTopSupportersRef.current?.(sorted, latestShoutout);
      }
    };

    es.onerror = () => {
      // EventSource retries automatically; nothing to do here beyond not
      // crashing the app when the BFF isn't up yet.
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the local tally whenever the server-side one is cleared (e.g. a
  // new round starting) by re-fetching it once on mount and letting the SSE
  // stream build it back up from there. A full reset endpoint call is left
  // to whatever triggers "New Round" in a future wiring — see README.
  useEffect(() => {
    fetch(`${SERVER_URL}/api/votes`)
      .then((r) => r.json())
      .then((tally) => {
        tallyRef.current = tally || {};
      })
      .catch(() => {
        /* server not up yet — ignore */
      });
  }, []);
}
