/**
 * Stream scheduler for the Flag Battle broadcast.
 *
 * Owns *when* the RTMP push should start and stop, independent of *how* it is
 * started. The server injects the actual start/stop operations, so this module
 * stays free of ffmpeg/puppeteer concerns and can be unit-tested on its own.
 *
 * Two modes, matching what the dashboard exposes:
 *
 *   mode "schedule"  go live at `startAt`, run for `durationMinutes`, repeat
 *                    on `repeat` (`none` | `daily` | `weekly` + `repeatDays`).
 *   mode "now"       go live immediately and auto-stop after `durationMinutes`.
 *
 * Repeat semantics: the first occurrence is the absolute `startAt` instant.
 * Later occurrences keep the *server-local* weekday + time-of-day of that
 * instant, so "every day at 20:00" stays at 20:00 across DST changes rather
 * than drifting by 24h.
 *
 * Design notes:
 *  - The stop decision is anchored to the *actual* start, not the scheduled
 *    one. A browser that takes 20s to boot must not shorten the slot.
 *  - Missed slots are skipped, never back-filled. If the server was asleep at
 *    20:00 it does not wake at 03:00 and start a 3-hour broadcast.
 *  - A slot is identified by its exact occurrence instant (`lastFiredAt`), so a
 *    slot can never fire twice across ticks or restarts.
 *  - The scheduler only stops runs it owns (`activeRun`). A stream started by
 *    hand from the dashboard is never killed by a stale schedule.
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    enabled: false,
    mode: 'schedule',        // 'schedule' | 'now'
    startAt: null,           // ISO string of the first occurrence
    durationMinutes: 60,
    repeat: 'none',          // 'none' | 'daily' | 'weekly'
    repeatDays: [],          // [0..6] with 0 = Sunday, used when repeat === 'weekly'
    graceMinutes: 5          // how late a slot may still fire before being skipped
};

const VALID_REPEAT = new Set(['none', 'daily', 'weekly']);

function pad(n) { return String(n).padStart(2, '0'); }

/** Same calendar day + clock time as `ref`, on the date `onDate`. */
function atTimeOfDay(onDate, ref) {
    const d = new Date(onDate);
    d.setHours(ref.getHours(), ref.getMinutes(), 0, 0);
    return d;
}

class StreamScheduler {
    constructor(opts = {}) {
        this.filePath = opts.filePath;
        this.tickMs = opts.tickMs || 15000;
        this.graceMinutes = opts.graceMinutes != null ? opts.graceMinutes : DEFAULTS.graceMinutes;
        this.onStart = opts.onStart || (async () => ({ ok: false, error: 'no onStart handler' }));
        this.onStop = opts.onStop || (async () => ({ ok: true }));
        this.onLog = opts.onLog || (() => {});
        this.isStreaming = opts.isStreaming || (() => false);
        this.now = opts.now || (() => new Date());

        this.timer = null;
        this.busy = false;
        this.config = { ...DEFAULTS };
        this.activeRun = null;   // { startedAt, endsAt } ISO strings
        this.lastFiredAt = null; // ISO of the occurrence we last started
        this.lastAttemptAt = null; // ISO of the last start attempt (backoff)
        this.lastResult = null;  // human-readable outcome of the last transition
    }

    // ---------------------------------------------------------------- storage

    load() {
        if (!this.filePath || !fs.existsSync(this.filePath)) return false;
        try {
            const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            this.config = { ...DEFAULTS, ...(raw.config || {}) };
            this.activeRun = raw.activeRun || null;
            this.lastFiredAt = raw.lastFiredAt || null;
            this.lastResult = raw.lastResult || null;
            return true;
        } catch (err) {
            this.onLog(`Scheduler: could not read schedule file (${err.message}). Starting fresh.`, true);
            return false;
        }
    }

    save() {
        if (!this.filePath) return;
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(
                this.filePath,
                JSON.stringify(
                    { config: this.config, activeRun: this.activeRun, lastFiredAt: this.lastFiredAt, lastResult: this.lastResult },
                    null,
                    2
                )
            );
        } catch (err) {
            this.onLog(`Scheduler: could not persist schedule (${err.message}).`, true);
        }
    }

    // ------------------------------------------------------------- validation

    /**
     * Validate + normalise a user-supplied config.
     * Returns { ok, config } or { ok:false, error }.
     * `now` is injectable so tests can drive a synthetic clock.
     */
    static validate(input = {}, now = new Date()) {
        const mode = input.mode === 'now' ? 'now' : 'schedule';
        const durationMinutes = Math.round(Number(input.durationMinutes));
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
            return { ok: false, error: 'Duration must be a positive number of minutes.' };
        }
        if (durationMinutes > 60 * 24 * 7) {
            return { ok: false, error: 'Duration cannot exceed 7 days.' };
        }

        const repeat = VALID_REPEAT.has(input.repeat) ? input.repeat : 'none';
        let repeatDays = Array.isArray(input.repeatDays)
            ? [...new Set(input.repeatDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
            : [];
        if (repeat === 'weekly' && repeatDays.length === 0) repeatDays = [now.getDay()];

        let startAt = null;
        if (mode === 'now') {
            startAt = now.toISOString();
        } else {
            if (!input.startAt) return { ok: false, error: 'A start date and time is required.' };
            const parsed = new Date(input.startAt);
            if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'Start time could not be understood.' };
            if (parsed.getTime() < now.getTime() - 60 * 1000) {
                return { ok: false, error: 'Start time is in the past. Pick a future time, or use "Go Live Now".' };
            }
            startAt = parsed.toISOString();
        }

        const graceMinutes = Number.isFinite(Number(input.graceMinutes))
            ? Math.max(0, Math.min(120, Math.round(Number(input.graceMinutes))))
            : DEFAULTS.graceMinutes;

        return {
            ok: true,
            config: { enabled: true, mode, startAt, durationMinutes, repeat, repeatDays, graceMinutes }
        };
    }

    // ----------------------------------------------------------------- public

    /** Replace the schedule. Does not start anything by itself. */
    set(input) {
        const res = StreamScheduler.validate(input, this.now());
        if (!res.ok) return res;
        this.config = res.config;
        this.lastFiredAt = null;
        // A new schedule must not inherit the previous one's failure backoff,
        // or its very first slot would be silently skipped.
        this.lastAttemptAt = null;
        this.lastResult = null;
        // A schedule edit invalidates any in-flight run we were tracking.
        this.activeRun = null;
        this.save();
        this.onLog(`Scheduler updated: ${this.describe()}`);
        return { ok: true, config: this.config };
    }

    /** Turn the schedule off entirely. Never touches a running stream. */
    clear() {
        this.config = { ...DEFAULTS };
        this.activeRun = null;
        this.lastFiredAt = null;
        this.lastAttemptAt = null;
        this.lastResult = null;
        this.save();
        this.onLog('Scheduler cleared.');
        return { ok: true };
    }

    /**
     * "Go live now": start immediately (if idle) and arm the auto-stop.
     * Safe to call when a stream is already running - it just arms the timer.
     */
    startNow(durationMinutes) {
        const res = StreamScheduler.validate({ mode: 'now', durationMinutes }, this.now());
        if (!res.ok) return Promise.resolve(res);
        this.config = res.config;
        this.lastFiredAt = null;
        this.lastAttemptAt = null;
        this.lastResult = null;
        this.activeRun = null;
        this.save();
        this.onLog(`Scheduler: go live now for ${durationMinutes} minutes.`);
        // Fire synchronously so the dashboard gets an immediate answer, and
        // propagate a failed start instead of reporting a false success
        // (e.g. missing RTMP credentials).
        return this.tick().then((outcome) => {
            if (outcome && outcome.ok === false) {
                return { ok: false, error: outcome.error, config: this.config };
            }
            return { ok: true, config: this.config };
        });
    }

    /** Human-readable one-liner for logs and the UI. */
    describe() {
        const c = this.config;
        if (!c.enabled) return 'no schedule';
        const dur = `${c.durationMinutes}m`;
        if (c.mode === 'now') return `live now, auto-stop after ${dur}`;
        const when = c.startAt ? new Date(c.startAt).toLocaleString() : '?';
        if (c.repeat === 'daily') return `daily at ${when}, ${dur}`;
        if (c.repeat === 'weekly') return `weekly on [${c.repeatDays.join(',')}] at ${when}, ${dur}`;
        return `once at ${when}, ${dur}`;
    }

    /** Next occurrence after `after`, or null when the schedule is spent. */
    nextOccurrence(after = this.now()) {
        const c = this.config;
        if (!c.enabled || !c.startAt) return null;
        const base = new Date(c.startAt);
        if (Number.isNaN(base.getTime())) return null;

        // A slot is still "ours" for a few minutes after its wall-clock time so
        // it can fire slightly late. Without this, a tick landing exactly on the
        // boundary would skip the slot entirely.
        const graceMs = (c.graceMinutes != null ? c.graceMinutes : DEFAULTS.graceMinutes) * 60000;
        const cutoff = after.getTime() - graceMs;

        if (c.repeat === 'none') {
            // Already consumed? Then there is nothing left to run.
            if (this.lastFiredAt && new Date(this.lastFiredAt).getTime() >= base.getTime()) return null;
            return base;
        }

        // The very first occurrence is whatever datetime the operator picked,
        // even if it does not fall on one of the repeat days. Only *later*
        // occurrences are filtered by repeatDays.
        if (!this.lastFiredAt && base.getTime() > cutoff) return base;

        // Repeating: walk forward day by day looking for a matching weekday.
        const wanted = c.repeat === 'daily' ? null : new Set(c.repeatDays);
        for (let i = 0; i <= 8; i += 1) {
            const day = new Date(after.getTime());
            day.setDate(day.getDate() + i);
            day.setHours(0, 0, 0, 0);
            const matches = wanted === null || wanted.has(day.getDay());
            if (!matches) continue;
            const candidate = atTimeOfDay(day, base);
            if (candidate.getTime() > cutoff) return candidate;
        }
        return null;
    }

    /** Full state for the dashboard / status endpoint. */
    getState() {
        const now = this.now();
        const streaming = this.isStreaming();
        let endsAt = null;
        let remainingMs = null;

        if (this.activeRun && this.activeRun.endsAt) {
            endsAt = this.activeRun.endsAt;
            const diff = new Date(endsAt).getTime() - now.getTime();
            remainingMs = diff > 0 ? diff : 0;
        }

        // A schedule with no remaining occurrence (a spent one-off) is idle,
        // not "scheduled" - otherwise the UI promises a run that cannot happen.
        const nextRunAt = !streaming ? this.nextOccurrence(now) : null;

        let status = 'idle';
        if (streaming && this.activeRun) status = 'live';
        else if (streaming) status = 'running';
        else if (this.config.enabled && nextRunAt) status = 'scheduled';

        return {
            status,
            config: { ...this.config },
            activeRun: this.activeRun ? { ...this.activeRun } : null,
            endsAt,
            remainingMs,
            nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
            nextRunInMs: nextRunAt ? nextRunAt.getTime() - now.getTime() : null,
            lastResult: this.lastResult,
            serverTime: now.toISOString()
        };
    }

    // ------------------------------------------------------------------- loop

    start() {
        if (this.timer) return;
        // A run recorded before a restart is dead: the ffmpeg died with the old
        // container. Drop it rather than pretending it is still running.
        if (this.activeRun) {
            this.onLog('Scheduler: previous run was interrupted by a restart; rolling forward.');
            this.lastResult = 'Previous run interrupted by server restart.';
            this.activeRun = null;
            this.save();
        }
        this.timer = setInterval(() => { this.tick().catch(() => {}); }, this.tickMs);
        if (this.timer.unref) this.timer.unref();
        this.tick().catch(() => {});
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * One decision pass. Re-entrant calls are dropped so a slow start can never
     * overlap the next tick.
     */
    async tick() {
        if (this.busy) return { ok: true, skipped: true };
        this.busy = true;
        try {
            return await this._tick();
        } finally {
            this.busy = false;
        }
    }

    async _tick() {
        const c = this.config;
        const now = this.now();
        const streaming = this.isStreaming();

        // --- 1. Stop a run we own whose time is up -------------------------
        if (streaming && this.activeRun && this.activeRun.endsAt) {
            const end = new Date(this.activeRun.endsAt).getTime();
            if (now.getTime() >= end) {
                const r = await this.onStop('scheduled end time reached');
                this.lastResult = r && r.ok === false
                    ? `Auto-stop failed: ${r.error}`
                    : 'Stream auto-stopped at the scheduled end time.';
                this.onLog(`Scheduler: ${this.lastResult}`);
                this.activeRun = null;
                this.lastFiredAt = new Date(end).toISOString();
                this.save();
                return { ok: true, action: 'stopped' };
            }
        }

        if (!c.enabled) return { ok: true, action: 'idle' };

        // --- 2. Should a new run begin? ------------------------------------
        // A run already in flight but not yet tracked (e.g. the operator
        // started the stream by hand) gets adopted so the end time applies.
        if (streaming && !this.activeRun) {
            this.activeRun = this._makeRun(now);
            this.lastResult = 'Adopted the running stream; auto-stop is armed.';
            this.save();
            return { ok: true, action: 'adopted' };
        }
        if (streaming) return { ok: true, action: 'running' };

        const next = this.nextOccurrence(now);
        if (!next) return { ok: true, action: 'idle' };

        const delayMs = next.getTime() - now.getTime();
        const graceMs = (c.graceMinutes != null ? c.graceMinutes : DEFAULTS.graceMinutes) * 60000;

        // `grace` only buys lateness. A slot 60s in the future must wait for its
        // own tick, otherwise the stream would start a minute early every day.
        if (delayMs > 0) return { ok: true, action: 'waiting', nextRunAt: next.toISOString() };

        if (-delayMs > graceMs) {
            // Slot came and went while we were down/asleep - skip it, never
            // back-fill a broadcast that should have ended hours ago.
            this.lastFiredAt = next.toISOString();
            this.lastResult = `Skipped the ${next.toLocaleString()} slot (missed by more than ${c.graceMinutes} min).`;
            this.onLog(`Scheduler: ${this.lastResult}`);
            this.save();
            return { ok: true, action: 'skipped' };
        }

        // --- 3. Fire -------------------------------------------------------
        // A failed start retries on a later tick, but not every 15s forever.
        const attemptMs = this.config.tickRetryMs || 120000;
        if (this.lastAttemptAt && now.getTime() - new Date(this.lastAttemptAt).getTime() < attemptMs) {
            return { ok: true, action: 'retry-wait' };
        }
        this.lastAttemptAt = now.toISOString();

        const r = await this.onStart('scheduled start');
        if (!r || r.ok === false) {
            this.lastResult = `Start failed: ${(r && r.error) || 'unknown error'}`;
            this.onLog(`Scheduler: ${this.lastResult}`, true);
            // A scheduled slot is worth retrying - the failure is usually
            // transient (Chrome still booting, Xvfb not up yet). An explicit
            // "go live now" is a one-shot human action: if it failed, say so
            // and disarm instead of retrying every 2 minutes forever.
            if (c.mode === 'now') {
                this.lastFiredAt = next.toISOString();
                this.onLog('Scheduler: go-live-now failed, not retrying automatically.');
            }
            return { ok: false, action: 'start-failed', error: this.lastResult };
        }

        this.lastFiredAt = next.toISOString();
        this.activeRun = this._makeRun(new Date(this.now()));
        this.lastResult = 'Stream started on schedule.';
        this.onLog(`Scheduler: started on schedule (${this.describe()}).`);
        this.save();
        return { ok: true, action: 'started' };
    }

    _makeRun(from) {
        const endsAt = new Date(from.getTime() + this.config.durationMinutes * 60000);
        return { startedAt: from.toISOString(), endsAt: endsAt.toISOString() };
    }

    /** Called by the server when the stream dies on its own, so we don't
     *  try to "stop" something that is already gone. */
    handleStreamStopped(reason = 'Stream ended') {
        if (!this.activeRun) return;
        this.activeRun = null;
        this.lastResult = reason;
        this.save();
    }
}

module.exports = { StreamScheduler, DEFAULTS, pad };