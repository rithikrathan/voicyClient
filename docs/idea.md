# Voicy Remote Architecture, Modes & Specification

High-density technical specification for multi-device voice dictation, speech synthesis, and remote control between the mobile client and the headless `voicyd` daemon.

---

## 1. The Two Operational Modes

Rather than complex multi-role splits, the system operates in two distinct modes. **Mode switching is strictly controlled by the daemon**; the client does not dictate its mode, but adapts dynamically based on daemon state.

```
+-----------------------------------------------------------------------------+
|                               VOICY DAEMON                                  |
|   (Centrally controls mode switching & owns active target routing)          |
+-----------------------------------------------------------------------------+
               ▲                                            ▲
               │                                            │
               │ [Mode Notification]                        │ [Mode Notification]
               ▼                                            ▼
+-----------------------------+              +--------------------------------+
|     1. COMPUTE MODE         |              |       2. REMOTE MODE           |
|                             |              |                                |
| - Phone acts as compute     |              | - Phone acts as remote I/O     |
|   engine (on-device models) |              | - Speech-to-text / text-to-    |
| - Runs STT & TTS workloads  |              |   speech interface             |
| - Offloads daemon hardware  |              | - Local arithmetic VAD         |
| - Communicates via text &   |              | - Text-only communication with |
|   compute payloads          |              |   daemon for target routing    |
+-----------------------------+              +--------------------------------+
```

### Mode 1: Compute Mode (Phone as Compute Engine)
- **Role**: The mobile device operates as an auxiliary on-device compute engine.
- **Workload**: Executes on-device neural/distilled speech models (Sherpa-ONNX STT and Phonon TTS) on the mobile CPU/NPU, freeing desktop resources.
- **Communication**: Daemon delegates speech tasks to the phone; phone delivers transcribed text or synthesized audio back to the daemon.
- **Daemon Control**: Daemon switches client into Compute Mode when offloading is desired or configured.

### Mode 2: Remote Mode (Phone as Remote I/O)
- **Role**: The mobile device acts as a handheld wireless microphone, speaker, and remote terminal key bar.
- **VAD Processing**: Implements the identical **arithmetic VAD** (RMS frame accumulation and silence counting) as the daemon directly on the phone, preventing unnecessary silence transmission.
- **Communication**: Communication with the daemon is **always in text** (either transcribed text from STT delivered to the daemon, or text sent from daemon to the client for TTS playback).
- **Target Routing**: The daemon maintains absolute ownership of `active_target` (tmux pane `%<id>` or Wayland `wtype`). The client delivers text without target selection logic.

---

## 2. Daemon Ownership & Unix Socket Client Control

The daemon is the single source of truth for client activation and operational mode:
- **Unix Domain Socket Commands**:
  - `CLIENT:ON`: Enables client interaction and instructs daemon to accept client input.
  - `CLIENT:OFF`: Disables client interaction and disconnects/ignores client inputs.
  - `MODE:COMPUTE`: Switches active operational mode to Compute Mode.
  - `MODE:REMOTE`: Switches active operational mode to Remote Mode.
  - `CLIENT:STATUS`: Returns current client connection status and active mode.

The client receives WebSocket notifications when the daemon toggles its enabled status or switches modes, updating its UI state accordingly.

---

## 3. Network Configuration: Direct IP & Port Settings

- **No UDP Discovery**: UDP auto-discovery broadcasting is disabled in favor of clean, direct network setup.
- **Settings Screen**: The client provides a dedicated Settings panel in the UI where the user manually enters:
  - **Daemon Host / IP**: (e.g. `192.168.1.100` or tailscale IP)
  - **Daemon Port**: (defaults to `9099`)
- Settings are persisted in local client storage and automatically loaded on startup.

---

## 4. Mobile UI & Mic Gesture Architecture

```
+-----------------------------------------------------------+
|                      VOICY CLIENT                         |
|                                                           |
|                 [Status & Mode Indicator]                 |
|             "Remote Mode: Connected to 192.168.1.50"       |
|                                                           |
|             +-------------------------------+             |
|             |                               |             |
|             |     Live Text / Dictation     |             |
|             |          Display Area         |             |
|             |                               |             |
|             +-------------------------------+             |
|                                                           |
|                          [ ^ ]                            |
|                       (Lock Zone)                         |
|                                                           |
|                         (( O ))                           |
|                      [MIC BUTTON]                         |
|             (Bottom Center, above buttons)                |
|                                                           |
|     +-----------+   +-----------+   +-----------+         |
|     |   Enter   |   |    Esc    |   |  Ctrl+C   |         |
|     +-----------+   +-----------+   +-----------+         |
+-----------------------------------------------------------+
```

### Mic Button Placement & Gestures
1. **Positioning**: Centered at the bottom of the screen, situated directly above the action key buttons (`Enter`, `Esc`, `Ctrl+C`, `Alt+M`).
2. **Push-to-Talk (Hold)**:
   - Touch down on Mic: Starts audio capture and streaming.
   - Touch release: Stops audio capture, finalizes transcription, commits text.
3. **Swipe-Up Lock (Continuous Listening)**:
   - While pressing the mic button, swiping upward into the lock area toggles continuous listening mode ("locked on").
   - The user can lift their finger; the microphone remains active.
   - Tapping the mic button again or tapping Discard unlocks and stops recording.
4. **Discard Action**:
   - Swiping or pressing Discard triggers `RECORD_CANCEL`, immediately dropping the current audio buffer with zero typing or transcription.

---

## 5. Arithmetic VAD Specification (Remote Mode)

To ensure consistency with the daemon's arithmetic VAD:
- **Frame Size**: 30 milliseconds (480 samples @ 16kHz mono 16-bit PCM).
- **RMS Energy Calculation**:
  $$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=1}^N s_i^2}$$
- **Speech Threshold**: Frames with RMS exceeding `silence_threshold` (default `0.015`) are classified as speech.
- **Hangover Silence**: Requires 20 consecutive silent frames (~600ms) before declaring end-of-speech chunk, preventing mid-sentence clipping.
- **Max Chunk Limit**: 24 seconds continuous speech buffer ceiling to prevent memory starvation before flushing to transcription.
