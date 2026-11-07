# Voicy Daemon I/O & Socket Interface Specification

Complete technical specification of all communication channels, socket endpoints, command structures, binary streams, and broadcast events supported by the `voicyd` daemon.

---

## 1. Interface Architecture Overview

The Voicy daemon exposes two complementary layers of communication:

```
+-----------------------------------------------------------------------------------------+
|                                    VOICY DAEMON                                         |
|                                                                                         |
|  [Unix Domain Sockets (Local IPC)]           [Network Sockets (Remote Multi-Device)]    |
|   - Control: /run/user/1000/voicy.sock         - Discovery: UDP 0.0.0.0:9098            |
|   - Events:  /run/user/1000/voicy-events.sock  - Realtime:  WebSocket 0.0.0.0:9099      |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Unix Domain Sockets (Local IPC)

Located in `$XDG_RUNTIME_DIR` (`/run/user/1000/` by default).

### A. Control Socket (`/run/user/1000/voicy.sock`)
- **Protocol**: Text-based line-delimited request-response (`\n`).
- **Connection Model**: Client opens connection, sends single command line with trailing newline, reads reply, closes socket.
- **Suffix Modifier**: Appending `:DICTATE` (e.g. `START:DICTATE`, `TOGGLE:DICTATE`) forces raw text injection directly into active window/pane, bypassing prompt wrapping.

#### Supported Commands:

| Command | Arguments / Payload | Daemon Response | Description |
| :--- | :--- | :--- | :--- |
| `START` | None (or `:DICTATE`) | `recording\n` or `already_recording\n` or `error: <msg>\n` | Pauses media players via MPRIS, plays start chime, begins audio recording and VAD chunking. |
| `STOP` | None | `queued\n` or `idle\n` | Stops audio capture, resumes media players, and queues commit task to transcribe & deliver text. |
| `TOGGLE` | None (or `:DICTATE`) | `recording\n` or `queued\n` or `error: <msg>\n` | Toggles state between `START` and `STOP`. |
| `CANCEL` | None | `canceled_recording\n` or `canceled_transcription\n` or `idle\n` | Drops active recording immediately with zero transcription. If transcribing, suppresses output typing. |
| `STATUS` | None | `idle\n` \| `recording\n` \| `transcribing\n` \| `typing\n` \| `speaking\n` | Queries instantaneous internal daemon state. |
| `TARGET` | `TARGET` (query) or `TARGET:<pane_id>` or `TARGET:none` | `Target: <id>\n` or `Active target set to: '<id>'\n` or `Target cleared...\n` | Gets or sets target window/pane. If `%<num>`, delivers via `tmux send-keys`. If `none`, types into focused window. |
| `SPEAK:<json>` | JSON payload: `{"text": "...", "voice": "...", "volume": 1.0}` or plain text string | `ok\n` or `error: <msg>\n` | Enqueues text to local Phonon TTS engine with lookahead background synthesis. |
| `STOP_TTS` | None | `ok\n` | Stops active TTS playback immediately without clearing subsequent queued speech jobs. |
| `TTS_CLEAR_AND_STOP` | None | `ok\n` | Halts active playback AND flushes all pending speech jobs from lookahead queue. Resumes media players. |

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

---

## 3. Network Sockets (Remote Android & Multi-Device)

### A. UDP Auto-Discovery Beacon (Port 9098)
- **Transport**: UDP broadcast on LAN (`0.0.0.0:9098`).

#### Discovery Flow:
1. **Client Broadcast Query**:
```json
{
  "cmd": "VOICY_DISCOVER",
  "client": "voicy-mobile-tauri",
  "version": "1.0"
}
```
2. **Daemon Unicast Response**:
```json
{
  "cmd": "VOICY_BEACON",
  "hostname": "xps-linux",
  "ws_port": 9099,
  "active_target": "%18",
  "tts_enabled": true,
  "auth_required": false
}
```

---

### B. WebSocket Control & Audio Bridge (Port 9099)
- **Transport**: Bidirectional WebSocket (`ws://<daemon_ip>:9099/ws`).
- **Framing**:
  - **Text Frames**: UTF-8 JSON control messages and status updates.
  - **Binary Frames**: Raw 16kHz 16-bit Little-Endian mono PCM audio chunks with a 1-byte opcode prefix.

#### 1. Client-to-Daemon JSON Messages:

```json
// Push-to-Talk Controls
{"type": "RECORD_START", "mode": "wireless_mic" | "full_phone_io"}
{"type": "RECORD_STOP"}
{"type": "RECORD_CANCEL"}

// Direct Keystroke Injections (Target: "%18" or "focused")
{"type": "KEY_PRESS", "key": "Enter" | "Escape" | "Ctrl+C" | "Alt+M", "target": "%18"}

// Direct Text Injection (Used in Mode 3 when phone computes STT)
{"type": "DELIVER_TEXT", "text": "transcribed text from phone", "target": "%18"}

// Target Switching
{"type": "SET_TARGET", "target": "%18" | "none"}

// Text-to-Speech Requests
{"type": "TTS_SPEAK", "text": "Hello world", "voice": "Alba", "volume": 1.0}
{"type": "TTS_STOP"}
{"type": "TTS_CLEAR_AND_STOP"}
```

#### 2. Daemon-to-Client JSON Messages:

```json
// Status Synchronizations
{"type": "STATUS_UPDATE", "state": "idle" | "recording" | "transcribing" | "typing" | "speaking"}
{"type": "TARGET_UPDATE", "target": "%18"}
{"type": "PARTIAL_TEXT", "text": "in-flight recognition..."}
{"type": "COMMITTED_TEXT", "text": "delivered sentence.", "target": "%18"}
{"type": "ERROR", "message": "error description"}
```

#### 3. Binary Stream Protocol:

- **Upstream Mic Audio (Client -> Daemon)**:
  - Header byte: `0x02`
  - Payload: Raw 16kHz mono signed 16-bit PCM chunks (e.g. 512–2048 samples per frame).
  - Used in **Mode 1 (Wireless Mic)** and **Mode 2 (Full Phone I/O - Daemon Compute)**.
- **Downstream Speaker Audio (Daemon -> Client)**:
  - Header byte: `0x01`
  - Payload: Raw synthesized Phonon TTS audio chunks.
  - Used in **Mode 2 (Full Phone I/O - Daemon Compute)** to route daemon voice directly into phone headphones.
