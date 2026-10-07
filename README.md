# 🏳 Flag Battle Simulation

A YouTube-ready flag battle physics simulation — 200+ country flags compete inside a rotating arena. Flags fall through gaps and are eliminated until one winner survives per round.

## 🚀 Quick Start

```bash
# Option 1: Open directly (Chrome works for most features)
open index.html

# Option 2: Serve locally (recommended — avoids CORS issues)
npx serve .
# then open http://localhost:3000
```

> ⚠️ **Recommended**: Use a local server (`npx serve .`) so flag images load correctly via CORS.

---

## 📁 Project Structure

```
flag-battle/
├── index.html          # Main HTML + HUD overlay structure
├── css/
│   └── style.css       # Dark theme, animations, layout
├── js/
│   ├── countries.js    # 240+ countries with ISO codes
│   ├── physics.js      # Matter.js engine — rotating arena, holes, flags
│   ├── renderer.js     # Custom canvas draw loop (flags, glow, particles)
│   ├── ui.js           # HUD: leaderboard, counter, roster, winner screen
│   ├── audio.js        # TTS (Browser / Gemini API) + sound effects
│   ├── recorder.js     # MediaRecorder video capture → .webm download
│   └── game.js         # Main controller — game loop, rounds, events
└── assets/
    └── audio/          # Drop custom background music here
```

---

## 🎮 Controls

| Button | Action |
|--------|--------|
| ▶ START | Start the first qualifying round |
| ↺ RESET | Clear all rounds and winners |
| ⏺ RECORD | Begin capturing canvas video |
| ⏹ STOP | End recording |
| ⬇ DOWNLOAD | Save the `.webm` video file |
| Speed 1–5× | Control simulation speed |
| ⚙ SETTINGS | Open settings panel |

---

## ⚙ Settings

### Channel Name
Change `@FlagsBattleSimulator` to your own channel name — it appears as the bottom watermark.

### Physics
| Setting | Description |
|---------|-------------|
| Rotation Speed | How fast the arena spins (default `0.003` rad/frame) |
| Gravity | How hard flags fall (default `1.2`) |
| Hole Frequency | How often gaps open (1=rare → 5=constant) |

### TTS (Voice Announcement)
| Option | Notes |
|--------|-------|
| **Browser (Web Speech API)** | Free, works offline, uses your browser's built-in voices |
| **Google Cloud TTS (Gemini key)** | Realistic voice, requires API key from [console.cloud.google.com](https://console.cloud.google.com) |

To get a Gemini TTS key:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable "Cloud Text-to-Speech API"
3. Create an API key → paste it in Settings

### Background Music
Upload any `.mp3`, `.ogg`, or `.wav` file as background music. Adjust volume in settings.

---

## 🎬 Recording Videos

1. Click **⚙ SETTINGS** → configure your channel name
2. Click **▶ START** to begin the simulation
3. Click **⏺ RECORD** when you're ready to capture
4. Click **⏹ STOP** when the round ends
5. Click **⬇ DOWNLOAD** to save as `.webm`

> **Convert to MP4**: Use [HandBrake](https://handbrake.fr) (free) or `ffmpeg -i flag-battle.webm output.mp4`

### For 1080p Recording (YouTube quality):
Edit `game.js` and change canvas dimensions:
```js
this.CANVAS_W = 1080;
this.CANVAS_H = 1920;
```

---

## 🔊 Winner Voice Announcement

When the last flag survives, the simulation says **"{Country} wins!"** using your configured TTS engine.

---

## 🌍 Flag Images

Flags are loaded from [flagcdn.com](https://flagcdn.com) — a free, public CDN.
No API key or download required. Images load automatically via CORS.

---

## 🛠 Extending

### Add more countries
Edit `js/countries.js` and add entries to the `COUNTRIES` array:
```js
{ name: "Your Country", code: "xx" }  // ISO 3166-1 alpha-2
```

### Custom flag images
Replace CDN URLs in `getFlagUrl()` to use local images:
```js
function getFlagUrl(code, size = 80) {
  return `assets/flags/${code}.png`;  // local folder
}
```

### Change arena style
Edit `renderer.js → _drawArena()` — modify colors, glow, thickness.

---

## 📋 Tech Stack

| Component | Technology |
|-----------|-----------|
| Physics | [Matter.js 0.19](https://brm.io/matter-js/) |
| Canvas | HTML5 Canvas 2D API |
| Voice | Web Speech API / Google Cloud TTS |
| Recording | MediaRecorder API → WebM |
| Flags | [flagcdn.com](https://flagcdn.com) |
| Fonts | Google Fonts (Orbitron, Rajdhani) |

---

## ❓ Troubleshooting

**Flags not loading?** → Use `npx serve .` instead of opening the file directly.

**No voice?** → Click anywhere on the page first (browsers require user interaction before audio).

**Recording looks choppy?** → Reduce flag count or lower canvas resolution.

**Physics too slow?** → Increase the Speed slider (up to 5×).
