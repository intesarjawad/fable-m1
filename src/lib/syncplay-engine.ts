/**
 * SyncPlay Engine — Core synchronization logic ported from jellyfin-web.
 *
 * Handles: NTP-style time sync, command scheduling at precise timestamps,
 * sync correction (SpeedToSync/SkipToSync), buffering coordination.
 *
 * This is a plain TypeScript class, not a React component. The React context
 * wraps it and bridges to the PlaybackManager.
 */

const TICKS_PER_MS = 10000;

// --- Time Sync ---

interface TimeMeasurement {
  requestSent: number;
  requestReceived: number;
  responseSent: number;
  responseReceived: number;
}

function measurementOffset(m: TimeMeasurement): number {
  return ((m.requestReceived - m.requestSent) + (m.responseSent - m.responseReceived)) / 2;
}

function measurementDelay(m: TimeMeasurement): number {
  return (m.responseReceived - m.requestSent) - (m.responseSent - m.requestReceived);
}

function measurementPing(m: TimeMeasurement): number {
  return measurementDelay(m) / 2;
}

export class TimeSync {
  private measurements: TimeMeasurement[] = [];
  private bestMeasurement: TimeMeasurement | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pings = 0;
  private stopped = false;
  private fetchTimeFromServer: () => Promise<{ RequestReceptionTime: string; ResponseTransmissionTime: string }>;

  onUpdate?: (offset: number, ping: number) => void;

  constructor(
    fetchTimeFromServer: () => Promise<{ RequestReceptionTime: string; ResponseTransmissionTime: string }>,
  ) {
    this.fetchTimeFromServer = fetchTimeFromServer;
  }

  start() {
    this.stopped = false;
    this.pings = 0;
    this.measurements = [];
    this.poll();
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getOffset(): number {
    return this.bestMeasurement ? measurementOffset(this.bestMeasurement) : 0;
  }

  getPing(): number {
    return this.bestMeasurement ? measurementPing(this.bestMeasurement) : 0;
  }

  /** Convert server UTC time to local time */
  remoteToLocal(remoteMs: number): number {
    return remoteMs - this.getOffset();
  }

  /** Convert local time to server UTC time */
  localToRemote(localMs: number): number {
    return localMs + this.getOffset();
  }

  forceUpdate() {
    this.pings = 0;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.poll();
  }

  private poll() {
    if (this.stopped) return;

    const interval = this.pings >= 3 ? 60000 : 1000;

    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      try {
        const requestSent = Date.now();
        const data = await this.fetchTimeFromServer();
        const responseReceived = Date.now();

        const measurement: TimeMeasurement = {
          requestSent,
          requestReceived: new Date(data.RequestReceptionTime).getTime(),
          responseSent: new Date(data.ResponseTransmissionTime).getTime(),
          responseReceived,
        };

        this.measurements.push(measurement);
        if (this.measurements.length > 8) {
          this.measurements.shift();
        }

        // Pick measurement with lowest delay (best estimate)
        this.bestMeasurement = [...this.measurements].sort(
          (a, b) => measurementDelay(a) - measurementDelay(b),
        )[0];

        this.pings++;
        this.onUpdate?.(this.getOffset(), this.getPing());
      } catch {
        // Silent fail — will retry on next poll
      }

      this.poll();
    }, interval);
  }
}

// --- Playback Core ---

interface PlayerActions {
  pause: () => void;
  unpause: () => void;
  seek: (ticks: number) => void;
  stop: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTimeTicks: () => number;
  isPlaying: () => boolean;
}

interface SyncPlayCommand {
  Command: string;
  When: string;
  PositionTicks: number | null;
  PlaylistItemId: string;
  EmittedAt: string;
}

export class PlaybackCore {
  private timeSync: TimeSync;
  private player: PlayerActions;
  private scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private syncEnabled = false;
  private lastCommand: SyncPlayCommand | null = null;
  private lastSyncTime = 0;
  private syncAttempts = 0;

  // Callbacks
  onSeekComplete?: () => void;

  // Sync correction settings (defaults from official client)
  enableSyncCorrection = false;
  useSpeedToSync = true;
  useSkipToSync = true;
  minDelaySpeedToSync = 60;      // ms
  maxDelaySpeedToSync = 3000;    // ms
  speedToSyncDuration = 1000;    // ms
  minDelaySkipToSync = 400;      // ms

  constructor(timeSync: TimeSync, player: PlayerActions) {
    this.timeSync = timeSync;
    this.player = player;
  }

  applyCommand(cmd: SyncPlayCommand) {
    const when = new Date(cmd.When).getTime();
    const positionTicks = cmd.PositionTicks != null ? parseInt(String(cmd.PositionTicks), 10) : null;

    // Duplicate detection
    if (
      this.lastCommand &&
      new Date(this.lastCommand.When).getTime() === when &&
      this.lastCommand.PositionTicks === positionTicks &&
      this.lastCommand.Command === cmd.Command &&
      this.lastCommand.PlaylistItemId === cmd.PlaylistItemId
    ) {
      // Same command — only correct if needed
      const whenLocal = this.timeSync.remoteToLocal(when);
      if (whenLocal > Date.now()) return; // Still scheduled

      switch (cmd.Command) {
        case "Unpause":
          if (!this.player.isPlaying()) {
            this.scheduleUnpause(when, positionTicks || 0);
          }
          break;
        case "Pause":
          this.schedulePause(when, positionTicks || 0);
          break;
        case "Seek":
          this.scheduleSeek(when, positionTicks || 0);
          break;
      }
      return;
    }

    this.lastCommand = cmd;

    switch (cmd.Command) {
      case "Unpause":
        this.scheduleUnpause(when, positionTicks || 0);
        break;
      case "Pause":
        this.schedulePause(when, positionTicks || 0);
        break;
      case "Stop":
        this.clearScheduled();
        this.player.stop();
        break;
      case "Seek":
        this.scheduleSeek(when, positionTicks || 0);
        break;
    }
  }

  private scheduleUnpause(whenRemoteMs: number, positionTicks: number) {
    this.clearScheduled();
    const whenLocal = this.timeSync.remoteToLocal(whenRemoteMs);
    const now = Date.now();
    const enableSyncDelay = this.maxDelaySpeedToSync / 2;

    if (whenLocal > now) {
      const delay = whenLocal - now;

      // Pre-seek if noticeably off
      const currentTicks = this.player.getCurrentTimeTicks();
      if (Math.abs(currentTicks - positionTicks) > this.minDelaySkipToSync * TICKS_PER_MS) {
        this.player.seek(positionTicks);
      }

      this.scheduledTimeout = setTimeout(() => {
        this.player.unpause();
        this.syncTimeout = setTimeout(() => {
          this.syncEnabled = true;
        }, enableSyncDelay);
      }, delay);
    } else {
      // Already past scheduled time — unpause now at estimated position
      const serverPositionTicks = this.estimateCurrentTicks(positionTicks, whenRemoteMs);
      this.player.unpause();
      this.player.seek(serverPositionTicks);

      this.syncTimeout = setTimeout(() => {
        this.syncEnabled = true;
      }, enableSyncDelay);
    }
  }

  private schedulePause(whenRemoteMs: number, positionTicks: number) {
    this.clearScheduled();
    const whenLocal = this.timeSync.remoteToLocal(whenRemoteMs);
    const now = Date.now();

    const doPause = () => {
      this.player.pause();
      // Seek to exact position after pause settles
      setTimeout(() => {
        this.player.seek(positionTicks);
      }, 50);
    };

    if (whenLocal > now) {
      this.scheduledTimeout = setTimeout(doPause, whenLocal - now);
    } else {
      doPause();
    }
  }

  private scheduleSeek(whenRemoteMs: number, positionTicks: number) {
    this.clearScheduled();
    const whenLocal = this.timeSync.remoteToLocal(whenRemoteMs);
    const now = Date.now();

    const doSeek = () => {
      this.player.seek(positionTicks);
      // Disable sync correction after seek — the lastCommand's position
      // is stale and would cause the engine to seek back. Sync re-enables
      // on the next Unpause command.
      this.syncEnabled = false;
      // Also call the onSeekComplete callback so the context can report Ready
      this.onSeekComplete?.();
    };

    if (whenLocal > now) {
      this.scheduledTimeout = setTimeout(doSeek, whenLocal - now);
    } else {
      doSeek();
    }
  }

  private clearScheduled() {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.syncEnabled = false;
    this.player.setPlaybackRate(1.0);
  }

  /** Called on every timeupdate — runs sync correction */
  onTimeUpdate(currentTimeMs: number, currentPositionMs: number) {
    if (!this.lastCommand || this.lastCommand.Command !== "Unpause") return;
    if (!this.syncEnabled || !this.enableSyncCorrection) return;

    const currentPositionTicks = currentPositionMs * TICKS_PER_MS;
    const serverPositionTicks = this.estimateCurrentTicks(
      parseInt(String(this.lastCommand.PositionTicks || 0), 10),
      new Date(this.lastCommand.When).getTime(),
    );

    const diffMs = (serverPositionTicks - currentPositionTicks) / TICKS_PER_MS;
    const absDiffMs = Math.abs(diffMs);

    // Rate-limit sync checks
    const elapsed = currentTimeMs - this.lastSyncTime;
    if (elapsed < this.maxDelaySpeedToSync / 2) return;
    this.lastSyncTime = currentTimeMs;

    // SpeedToSync
    if (
      this.useSpeedToSync &&
      absDiffMs >= this.minDelaySpeedToSync &&
      absDiffMs < this.maxDelaySpeedToSync
    ) {
      let duration = this.speedToSyncDuration;
      const minSpeed = 0.2;
      if (diffMs <= -duration * minSpeed) {
        duration = Math.abs(diffMs) / (1.0 - minSpeed);
      }

      const speed = 1 + diffMs / duration;
      this.player.setPlaybackRate(speed);
      this.syncEnabled = false;
      this.syncAttempts++;

      this.syncTimeout = setTimeout(() => {
        this.player.setPlaybackRate(1.0);
        this.syncEnabled = true;
      }, duration);
      return;
    }

    // SkipToSync
    if (this.useSkipToSync && absDiffMs >= this.minDelaySkipToSync) {
      this.player.seek(serverPositionTicks);
      this.syncEnabled = false;
      this.syncAttempts++;

      this.syncTimeout = setTimeout(() => {
        this.syncEnabled = true;
      }, this.maxDelaySpeedToSync / 2);
      return;
    }

    // In sync
    this.syncAttempts = 0;
  }

  private estimateCurrentTicks(ticks: number, whenRemoteMs: number): number {
    const nowRemote = this.timeSync.localToRemote(Date.now());
    return ticks + (nowRemote - whenRemoteMs) * TICKS_PER_MS;
  }

  destroy() {
    this.clearScheduled();
    this.lastCommand = null;
  }
}
