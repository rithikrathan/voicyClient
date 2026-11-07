# Voicy Daemon I/O & Socket Interface Specification

Complete technical specification of all communication channels, socket endpoints, command structures, binary streams, and broadcast events supported by the `voicyd` daemon.

---

## 1. Interface Architecture Overview

The Voicy daemon exposes two complementary layers of communication:

```
+-----------------------------------------------------------------------------------------+
|                                    VOICY DAEMON                                         |
|                                                                                         |
|  [Unix Domain Sockets (Local IPC)]           [Network Socket (Remote Mobile Client)]     |
|   - Control: /run/user/1000/voicy.sock         - Realtime: WebSocket 0.0.0.0:9099       |
|   - Events:  /run/user/1000/voicy-events.sock    (Configured via manual IP/port in UI)  |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Unix Domain Sockets (Local IPC)

Located in `$XDG_RUNTIME_DIR` (`/run/user/1000/` or `/run/user/0/` in root containers).

### A. Control Socket (`/run/user/1000/voicy.sock`)
- **Protocol**: Text-based line-delimited request-response (`\n`).
- **Connection Model**: Client opens connection, sends single command line with trailing newline, reads reply, closes socket.
- **Suffix Modifier**: Appending `:DICTATE` (e.g. `START:DICTATE`, `TOGGLE:DICTATE`) forces raw text injection directly into active window/pane, bypassing prompt wrapping.

#### Supported Commands:

| Command | Arguments / Payload | Daemon Response | Description |
| :--- | :--- | :--- | :--- |
| `START` | None (or `:DICTATE`) | `recording\n` or `already_recording\n` or `error: <msg>\n` | Pauses media players, plays start chime, begins audio recording and VAD chunking. |
| `STOP` | None | `queued\n` or `idle\n` | Stops audio capture, resumes media players, and queues commit task to transcribe & deliver text. |
| `TOGGLE` | None (or `:DICTATE`) | `recording\n` or `queued\n` or `error: <msg>\n` | Toggles state between `START` and `STOP`. |
| `CANCEL` | None | `canceled_recording\n` or `canceled_transcription\n` or `idle\n` | Drops active recording immediately with zero transcription. If transcribing, suppresses output typing. |
| `STATUS` | None | `idle\n` \| `recording\n` \| `transcribing\n` \| `typing\n` \| `speaking\n` | Queries instantaneous internal daemon state. |
| `TARGET` | `TARGET` (query) or `TARGET:<pane_id>` or `TARGET:none` | `Target: <id>\n` or `Active target set to: '<id>'\n` or `Target cleared...\n` | Gets or sets target window/pane. If `%<num>`, delivers via `tmux send-keys`. If `none`, types into focused window. |
| `SPEAK:<text>` | Text string or JSON payload | `ok\n` or `error: <msg>\n` | Enqueues text to local Phonon TTS engine with lookahead background synthesis. |
| `STOP_TTS` | None | `ok\n` | Stops active TTS playback immediately without clearing subsequent queued speech jobs. |
| `TTS_CLEAR_AND_STOP` | None | `ok\n` | Halts active playback AND flushes all pending speech jobs from lookahead queue. Resumes media players. |
| `CLIENT:ON` | None | `client_enabled\n` | Turns on client remote processing; accepts WebSocket incoming input from mobile client. |
| `CLIENT:OFF` | None | `client_disabled\n` | Turns off client remote processing; ignores or disconnects mobile client inputs. |
| `CLIENT:STATUS` | None | `{"enabled": true, "connected": true, "mode": "remote"}\n` | Returns current mobile client connection state, toggle status, and active operational mode. |
| `MODE:COMPUTE` | None | `mode_set:compute\n` | Instructs daemon to set client mode to Compute Mode (phone executes models). |
| `MODE:REMOTE` | None | `mode_set:remote\n` | Instructs daemon to set client mode to Remote Mode (phone acts as remote I/O). |

---

### B. Event Broadcaster Socket (`/run/user/1000/voicy-events.sock`)
- **Protocol**: Push-only line-delimited JSON stream (`\n`).
- **Connection Model**: Long-lived read-only subscription (used by status bars, waybar, eww, and CLI watchers).

#### Broadcast Event Schemas:

1. **State Change Event**:
```json
{
  "type": "state",
  "data": "idle" | "recording" | "transcribing" | "typing" | "speaking"
}
```

2. **Partial Transcription Event (Streaming VAD Chunks)**:
```json
{
  "type": "partial",
  "data": "recognized words so far"
}
```

3. **Final Transcription Event (Committed Session)**:
```json
{
  "type": "transcription",
  "data": {
    "text": "final recognized text sentence.",
    "target": "%18",
    "duration_ms": 1420
  }
}
```

4. **Client State Event**:
```json
{
  "type": "client",
  "data": {
    "enabled": true,
    "mode": "remote" | "compute",
    "connected": true
  }
}
```

---

## 3. Network Socket: WebSocket Bridge (Port 9099)

- **Transport**: Bidirectional WebSocket (`ws://<daemon_host>:<port>/ws`).
- **Connection Address**: Configured by user in client Settings screen (manual IP and port, default `9099`).
- **Framing**:
  - **Text Frames**: UTF-8 JSON control messages and status updates.
  - **Binary Frames**: Raw 16kHz 16-bit Little-Endian mono PCM audio chunks with a 1-byte opcode prefix.

### A. Daemon-to-Client JSON Messages

1. **Mode Notification**:
   Informs client of mode switch governed by the daemon:
```json
{
  "type": "MODE_CHANGE",
  "mode": "remote" | "compute"
}
```

2. **Client Enable / Disable Status**:
   Informs client whether daemon has turned client on or off via socket command:
```json
{
  "type": "CLIENT_STATUS",
  "enabled": true
}
```

3. **Status Synchronization**:
```json
{
  "type": "STATUS_UPDATE",
  "state": "idle" | "recording" | "transcribing" | "typing" | "speaking"
}
```

4. **Transcribed Text Events**:
```json
{
  "type": "PARTIAL_TEXT",
  "text": "in-flight recognition..."
}
```
```json
{
  "type": "COMMITTED_TEXT",
  "text": "delivered sentence."
}
```

5. **Text-to-Speech Prompt (Remote Mode)**:
   Daemon pushes text to client for client-side TTS playback:
```json
{
  "type": "TTS_PROMPT",
  "text": "Task finished successfully.",
  "voice": "Alba"
}
```

6. **Error Event**:
```json
{
  "type": "ERROR",
  "message": "Client is currently disabled by daemon"
}
```

---

### B. Client-to-Daemon JSON Messages

1. **Push-to-Talk & Lock Recording Controls**:
```json
{"type": "RECORD_START"}
{"type": "RECORD_STOP"}
{"type": "RECORD_CANCEL"}
```

2. **Direct Keystroke Injections (Daemon Routes to Active Target)**:
```json
{"type": "KEY_PRESS", "key": "Enter" | "Escape" | "Ctrl+C" | "Alt+M"}
```

3. **Direct Text Delivery (Remote & Compute Modes)**:
   Transcribed speech text delivered to daemon for injection into active tmux pane / Wayland window:
```json
{"type": "DELIVER_TEXT", "text": "transcribed text from phone"}
```

4. **Text-to-Speech Control**:
```json
{"type": "TTS_SPEAK", "text": "Hello world", "voice": "Alba", "volume": 100}
{"type": "TTS_STOP"}
{"type": "TTS_CLEAR_AND_STOP"}
```

---

### C. Binary Stream Protocol

- **Upstream Mic Audio (Client -> Daemon)**:
  - Header byte: `0x02`
  - Payload: Raw 16kHz mono signed 16-bit PCM frames.
  - Used when audio streaming to daemon is active.
- **Downstream Speaker Audio (Daemon -> Client)**:
  - Header byte: `0x01`
  - Payload: Raw synthesized 24kHz/16kHz PCM audio chunks.
