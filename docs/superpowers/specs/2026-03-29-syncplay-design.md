# SyncPlay Integration

Date: 2026-03-29

## Goal

Add synchronized group playback to Fable using Jellyfin's built-in SyncPlay API. Users can create or join watch sessions so everyone's playback stays in sync — play, pause, seek all happen together.

## Non-goals

- Invite/access control system (Jellyfin's SyncPlay has none — groups are open to all server users)
- Sync correction settings page (SpeedToSync, SkipToSync tuning — use Jellyfin defaults, add later if drift is a problem)
- Chat or reactions during playback
- Watch Party listing/browse page

---

## Architecture

### The command guard pattern

SyncPlay sits as a thin layer between user actions and the PlaybackManager. When in a SyncPlay group:

- User presses pause → `syncPlayApi.syncPlayPause()` → Jellyfin server → WebSocket `SyncPlayCommand(Pause)` → all clients call `manager.pause()`
- User seeks → `syncPlayApi.syncPlaySeek(ticks)` → server → WebSocket `SyncPlayCommand(Seek)` → all clients call `manager.seek(ticks)`

When NOT in a group, actions go directly to the manager as they do now.

### Feedback loop prevention

A `serverCommandInFlight` ref on the SyncPlayProvider tracks whether the current action originated from the server. When the SyncPlayProvider receives a WebSocket command and calls `manager.pause()`, it sets this ref to `true` before the call and resets it after. The guard hook checks this ref — if it's `true`, the action came from the server and must not be sent back to the SyncPlay API.

This is safe because the manager methods are synchronous state updates. The ref is set → manager method called → state updates → ref is cleared, all within one synchronous frame. The existing `reportPlaybackProgress()` REST call that happens inside `manager.pause()` is fine — it's a Jellyfin session report, not a SyncPlay command, so it doesn't create a loop.

Playback rate changes are blocked while in a SyncPlay group — changing speed on one client would desynchronize everyone.

### WebSocket connection

Fable currently has no WebSocket connection to Jellyfin. SyncPlay requires one for real-time group commands and state updates.

A persistent WebSocket connects to `{serverUrl}/socket?api_key={token}&deviceId={deviceId}`. It receives two SyncPlay message types:

- `SyncPlayCommand` — synchronized playback commands (play, pause, seek, stop) with a `When` timestamp for coordinated execution
- `SyncPlayGroupUpdate` — group state changes (user joined/left, queue changed, state changed, errors)

**Lifecycle:**
- Connects when user is authenticated (gated on auth state in the layout, not on app load)
- Disconnects on logout
- Auto-reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Pauses reconnection attempts when `document.visibilityState === "hidden"`, reconnects immediately when visible again
- On auth token refresh: close and reopen with new token
- KeepAlive message every 30s to prevent server timeout

### Buffering coordination

When a client is buffering, it reports `syncPlayBuffering()` to the server. The server tells all other clients to pause and wait. When the buffering client reports `syncPlayReady()`, the server tells everyone to resume at the synchronized position.

**Prerequisite:** The HTMLVideoPlayer currently doesn't report buffering state. The `isBuffering` field exists in `PlaybackState` but nothing ever sets it. Implementation must add `waiting` and `playing` event listeners to `HTMLVideoPlayer.tsx`:

- `waiting` event → `onBufferingChange(true)` callback → `manager.reportState({ isBuffering: true })`
- `playing` event → `onBufferingChange(false)` callback → `manager.reportState({ isBuffering: false })`

This follows the same callback pattern as `onTimeUpdate`, `onDurationChange`, etc.

### Ping and time synchronization

Clients periodically report their ping via `syncPlayPing()` on a 10-second interval. The server uses ping data to calculate time offsets for synchronized command execution.

When executing timed commands (`Unpause`, `Seek`), the SyncPlayProvider applies the server's time offset when calculating `delay = When - (now + offset)`. The offset is derived from the ping round-trip: `offset = (serverTime - clientTime) - (pingMs / 2)`. This is tracked as a running average across the last 5 pings.

### Progress reporting interaction

The existing 10-second `reportPlaybackProgress()` interval in usePlaybackManager (line 720) continues to run when in a SyncPlay group. This is correct — Jellyfin uses progress reports for session tracking independent of SyncPlay. SyncPlay has its own state reporting via `syncPlayReady()`, `syncPlayBuffering()`, and `syncPlayPing()`. These are separate concerns and don't conflict.

---

## Components

### 1. WebSocket service (`src/lib/jellyfin-ws.ts`)

Singleton WebSocket manager. Connects to `{serverUrl}/socket?api_key={token}&deviceId={deviceId}`.

Responsibilities:
- Establish and maintain connection with auto-reconnect (exponential backoff with visibility awareness)
- Parse incoming JSON messages and dispatch by `MessageType`
- Expose `subscribe(messageType, callback)` → returns unsubscribe function
- Expose `sendMessage(messageType, data)` for outbound messages (KeepAlive)
- Expose `reconnect(serverUrl, token, deviceId)` for auth token refresh
- Expose `disconnect()` for logout cleanup
- KeepAlive every 30 seconds to prevent server timeout

Not a React component — a plain TypeScript class instantiated once. Shared across the app.

### 2. SyncPlay context (`src/contexts/syncplay-context.tsx`)

Provides SyncPlay state and actions to the entire app. Wraps inside PlaybackProvider in the layout (SyncPlayProvider consumes PlaybackContext; PlaybackProvider must never depend on SyncPlay).

**State:**
```typescript
interface SyncPlayContextType {
  // Group state
  isInGroup: boolean;
  currentGroup: GroupInfoDto | null;
  availableGroups: GroupInfoDto[];
  error: string | null;

  // Actions
  createGroup: (groupName: string) => Promise<void>;
  joinGroup: (groupId: string) => Promise<void>;
  leaveGroup: () => Promise<void>;
  refreshGroups: () => Promise<void>;

  // Guarded playback actions (route through SyncPlay when in group)
  syncPlay: () => Promise<void>;
  syncPause: () => Promise<void>;
  syncSeek: (positionTicks: number) => Promise<void>;
  syncStop: () => Promise<void>;
  syncNext: () => Promise<void>;
  syncPrevious: () => Promise<void>;

  // Playlist actions
  setQueue: (itemIds: string[], startIndex?: number) => Promise<void>;
  queueNext: (itemIds: string[]) => Promise<void>;
}
```

**Error handling:** API call failures (network errors, group-not-found, etc.) set the `error` field and show a toast notification via Sonner. Errors are cleared on the next successful action.

**Initialization:** Subscribes to WebSocket `SyncPlayCommand` and `SyncPlayGroupUpdate` messages. On `SyncPlayCommand`, sets `serverCommandInFlight` ref, executes the command on the PlaybackManager, then clears the ref. On `SyncPlayGroupUpdate`, updates group state.

**Group polling:** Calls `syncPlayGetGroups()` every 15 seconds when not in a group (to show available groups in the OSD dropdown). Stops polling when in a group (WebSocket handles updates).

**PlayQueue handling:** When a `PlayQueue` group update arrives with a new item, the provider fetches the full `BaseItemDto` via `fetchMediaDetails(itemId)` (existing action) and passes it to `manager.play()`. This reuses the existing stream URL resolution, media source selection, and subtitle setup flow.

### 3. SyncPlay guard hook (`src/playback/hooks/useSyncPlayGuard.ts`)

Used by the player/OSD to get the right action handlers. Returns either direct manager methods or SyncPlay-guarded methods depending on group membership.

```typescript
function useSyncPlayGuard() {
  const manager = usePlayback();
  const syncPlay = useSyncPlay();

  return {
    play: syncPlay.isInGroup ? syncPlay.syncPlay : manager.unpause,
    pause: syncPlay.isInGroup ? syncPlay.syncPause : manager.pause,
    seek: syncPlay.isInGroup ? syncPlay.syncSeek : manager.seek,
    stop: syncPlay.isInGroup ? syncPlay.syncStop : manager.stop,
    next: syncPlay.isInGroup ? syncPlay.syncNext : manager.next,
    previous: syncPlay.isInGroup ? syncPlay.syncPrevious : manager.previous,
    isInGroup: syncPlay.isInGroup,
    canChangeRate: !syncPlay.isInGroup,
  };
}
```

### 4. OSD SyncPlay button (`src/playback/components/osd/SyncPlayButton.tsx`)

Button in the player OSD (top-right area, matching Jellyfin's placement). Click opens a popover.

**When not in a group — "Join a group" view:**
- List of available groups: group name, participant count, group state (playing/paused/waiting)
- Click a group to join
- "+ New group" option at the bottom — prompts for a group name, creates and joins

**When in a group — "In group" view:**
- Group name
- Participant list (usernames)
- "Leave group" button

Styled with existing shadcn/ui Popover + Button components, matching the current OSD aesthetic.

### 5. "Watch Together" button on detail pages (`src/components/media-actions.tsx`)

Alongside the existing "Watch Now" button on movie/series/episode detail pages.

Behavior:
1. Creates a SyncPlay group (name defaults to the item title)
2. Calls `syncPlay.setQueue([itemId])` to set the item as the play queue
3. Starts playback via the existing `usePlayback().play()` flow (which handles episode resolution, media source fetching, subtitle selection, etc.)

The item passed to `setQueue` is the resolved item ID from the detail page, not a raw search result. Others see the new group in their OSD dropdown and can join.

### 6. Sidebar SyncPlay indicator (`src/components/app-sidebar.tsx`)

When the user is in a SyncPlay group, show a small pulsing dot or badge near the user avatar area. Subtle — just awareness that sync is active.

---

## WebSocket message handling

### Inbound: `SyncPlayCommand`

```typescript
{
  MessageType: "SyncPlayCommand",
  Data: {
    GroupId: string,
    Command: "Pause" | "Unpause" | "Stop" | "Seek",
    When: string,        // UTC ISO timestamp — when to execute
    PositionTicks: number | null,
    EmittedAt: string,
    PlaylistItemId: string,
  }
}
```

**Execution with time offset:**

```
serverTimeOffset = running average of (serverTime - clientTime - pingMs/2) from last 5 pings
adjustedNow = Date.now() + serverTimeOffset
delay = max(0, new Date(When).getTime() - adjustedNow)
```

For Pause and Stop, execute immediately (no timing needed). For Unpause and Seek, schedule via `setTimeout(execute, delay)`.

### Inbound: `SyncPlayGroupUpdate`

**Handling by type:**
- `GroupJoined` — update `currentGroup`, set `isInGroup: true`
- `GroupLeft` — clear `currentGroup`, set `isInGroup: false`
- `UserJoined` / `UserLeft` — update participants list
- `PlayQueue` — fetch `BaseItemDto` for current item via `fetchMediaDetails()`, start playback if not already playing the same item
- `StateUpdate` — update group state (playing/paused/waiting)
- `NotInGroup` / `GroupDoesNotExist` — clear group state, show toast error

### Outbound: Buffering/Ready

When the player's `isBuffering` state changes (only when in a SyncPlay group):
- `true` → call `syncPlayBuffering({ When: now, PositionTicks, IsPlaying, PlaylistItemId })`
- `false` → call `syncPlayReady({ When: now, PositionTicks, IsPlaying, PlaylistItemId })`

---

## Call sites requiring guard integration

Every place that currently calls `manager.*()` directly for play/pause/seek/stop/next/previous needs to use the guard instead. Exhaustive list:

| File | Call sites | Change |
|------|-----------|--------|
| `src/playback/components/JellyfinPlayer.tsx` | Lines 123-145: keyboard shortcuts (ArrowLeft/Right seek, Space play/pause, Escape stop) | Use `useSyncPlayGuard()` methods |
| `src/playback/components/VideoOSD.tsx` | `handleOverlayClick()` (play/pause toggle), scrubbing (seek) | Use guard, pass guarded callbacks to sub-components |
| `src/playback/components/osd/VideoOSDTransport.tsx` | Play/pause button, next/previous episode buttons | Receive guarded callbacks from parent (VideoOSD) |
| `src/playback/components/osd/VideoOSDTimeline.tsx` | Click-to-seek, drag-to-seek | Receive guarded seek from parent (VideoOSD) |
| `src/playback/components/osd/VideoOSDSkipButtons.tsx` | `manager.seek()` for intro skip, `manager.pause()` | Receive guarded callbacks from parent |
| `src/playback/components/PlaybackControls.tsx` | Audio player play/pause, seek | Receive guarded callbacks from JellyfinPlayer |

**Strategy:** VideoOSD is the top-level OSD component. It calls `useSyncPlayGuard()` once and passes guarded methods down as props. Sub-components don't need the hook — they receive callbacks from their parent. Same for JellyfinPlayer passing to PlaybackControls.

---

## File inventory

### New files

| File | Purpose | Est. lines |
|------|---------|-----------|
| `src/lib/jellyfin-ws.ts` | WebSocket connection manager | ~150 |
| `src/contexts/syncplay-context.tsx` | SyncPlay state, group management, command handling | ~320 |
| `src/playback/hooks/useSyncPlayGuard.ts` | Action router (direct vs SyncPlay-guarded) | ~35 |
| `src/playback/components/osd/SyncPlayButton.tsx` | OSD button with group popover | ~220 |

### Modified files

| File | Change |
|------|--------|
| `app/(main)/layout.tsx` | Add SyncPlayProvider (inside PlaybackProvider) |
| `src/playback/players/HTMLVideoPlayer.tsx` | Add `waiting`/`playing` event listeners for buffering state, add `onBufferingChange` callback prop |
| `src/playback/components/VideoOSD.tsx` | Add SyncPlayButton to header, use `useSyncPlayGuard`, pass guarded callbacks to sub-components |
| `src/playback/components/JellyfinPlayer.tsx` | Use `useSyncPlayGuard` for keyboard shortcuts and PlaybackControls callbacks |
| `src/playback/components/osd/VideoOSDTransport.tsx` | Accept guarded callbacks from parent instead of calling manager directly |
| `src/playback/components/osd/VideoOSDTimeline.tsx` | Accept guarded seek from parent |
| `src/playback/components/osd/VideoOSDSkipButtons.tsx` | Accept guarded seek/pause from parent |
| `src/playback/components/PlaybackControls.tsx` | Accept guarded callbacks |
| `src/components/media-actions.tsx` | Add "Watch Together" button |
| `src/components/app-sidebar.tsx` | Add SyncPlay active indicator |

### Estimated total: ~725 new lines, ~120 lines modified
