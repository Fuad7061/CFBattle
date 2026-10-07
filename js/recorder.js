/**
 * Recorder — MediaRecorder wrapper for canvas capture + WebM download
 */
class Recorder {
  constructor(canvas) {
    this.canvas   = canvas;
    this._chunks  = [];
    this._rec     = null;
    this._url     = null;
  }

  async start(fps = 30) {
    this._chunks = [];
    if (this._url) { URL.revokeObjectURL(this._url); this._url = null; }

    try {
      // Use getDisplayMedia to record the entire browser tab, not just the canvas!
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: fps },
        audio: true
      });
      
      // Hide controls during recording
      document.body.classList.add('recording-active');

      // Stop recording if user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        this.stop();
        document.getElementById('btn-stop').click(); // trigger UI reset
      };

      // Try MKV (avc1/h264 is MP4-compatible), fallback to webm
      let mimeType = 'video/x-matroska;codecs=avc1';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      this._rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      this._rec.ondataavailable = e => { if (e.data.size > 0) this._chunks.push(e.data); };
      
      this._rec.onstop = () => {
        // Restore controls
        document.body.classList.remove('recording-active');
        // Stop all tracks to remove the recording icon
        stream.getTracks().forEach(track => track.stop());
      };
      
      this._rec.start(500); // collect chunks every 500ms
    } catch (err) {
      console.error('[Recorder] Failed to start:', err);
      alert('Screen recording was cancelled or is not supported.');
      document.body.classList.remove('recording-active');
      throw err; // throw so game.js knows it failed
    }
  }

  stop() {
    if (this._rec && this._rec.state !== 'inactive') {
      this._rec.stop();
    }
  }

  download(filename = 'flag-battle.mkv') {
    if (!this._chunks.length) { alert('No recording data yet — click STOP first.'); return; }
    
    // Output format based on what was actually recorded
    const isMkv = this._rec.mimeType.includes('matroska');
    const ext = isMkv ? '.mkv' : '.webm';
    filename = filename.replace('.webm', ext);

    const blob = new Blob(this._chunks, { type: this._rec.mimeType });
    this._url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = this._url;
    a.download = filename;
    a.click();
  }
}
