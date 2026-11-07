# Voicy Remote Architecture, Modes & Implementation Roadmap

High-density technical specification for multi-device voice dictation, speech synthesis, and remote control between the Android client and the headless `voicyd` daemon.

---

## 1. The Four Operational Modes

### Mode 1: Wireless Mic Mode (Daemon Compute, Desktop Output)
- **Audio Capture**: Android device microphone / connected Bluetooth headset.
- **Audio Output**: Daemon host system speakers.
- **Compute**: Voicy Daemon host processes raw audio via speech-to-text model.
- **Transport**: 16kHz mono 16-bit PCM chunks streamed over WebSocket (`0x02` binary frames).
- **Execution Target**: Text injected directly into locked tmux pane (`%18`) or active Wayland window via `wtype`.
- **Resource Footprint**: Minimal mobile CPU and battery footprint; best for light phone overhead while dictating around the room.

### Mode 2: Full Phone I/O (Daemon Compute, Phone Audio)
- **Audio Capture**: Android device microphone.
- **Audio Output**: Android device speaker / connected Bluetooth headset.
- **Compute**: Voicy Daemon processes both speech-to-text and text-to-speech.
- **Transport**: 
  - Upstream: Phone streams mic PCM audio to Daemon over WebSocket (`0x02` binary frames).
  - Downstream: Daemon streams synthesized TTS PCM audio back to Phone over WebSocket (`0x01` binary frames).
- **Execution Target**: Daemon types text to `%18` and returns synthesized voice directly to user's pocket/ears.

### Mode 3: Full Phone I/O (Phone Compute, Autonomous Audio)
- **Audio Capture**: Android device microphone.
- **Audio Output**: Android device speaker / Bluetooth headset.
- **Compute**: Android device executes on-device Sherpa-ONNX STT and Phonon TTS models locally in background.
- **Transport**: Pure text JSON packets exchanged over WebSocket (`DELIVER_TEXT` to Daemon, `TTS_PROMPT` to Phone).
- **Execution Target**: Voicy Daemon receives finalized text and types it into `%18`. Zero audio bandwidth across Wi-Fi.

### Mode 4: Wireless API Mode (Phone Compute Engine)
- **Compute Role**: Android device functions as an autonomous remote compute engine for the Voicy Daemon.
- **Background Execution**: Runs inside an Android Foreground Service with CPU and Wi-Fi wake-locks.
- **Workload**: Daemon offloads heavy STT and TTS batch tasks to the phone's NPU/CPU to conserve desktop resources.
- **Transport**: Daemon streams raw audio / text requests to phone; phone returns transcribed text / synthesized audio chunks.

---

## 2. Remote Virtual Keys & Discard Protocol

- **Key Injections (Port 9099)**:
  - `Enter`: Injects carriage return into target pane/window.
  - `Escape`: Aborts vi mode command or cancels editor selection.
  - `Ctrl+C`: Halts active running terminal process or agent generation.
  - `Alt+M`: Toggles daemon mic or custom application key binding.
- **Immediate Discard Guarantee**:
  - `RECORD_CANCEL`: Drops recorded audio buffer instantly without transcribing, typing, or outputting text.

---

## 3. Zero-Config LAN Discovery & Networking

1. **UDP Broadcast Auto-Discovery (Port 9098)**:
   - Mobile sends `{"cmd": "VOICY_DISCOVER"}` to `255.255.255.255:9098`.
   - Daemon replies with unicast JSON: `{"cmd": "VOICY_BEACON", "port": 9099, "hostname": "<name>", "target": "%18"}`.
   - Client automatically initiates WebSocket handshake.
2. **Manual Override**:
   - Permanent IP:Port input in UI settings for subnets or routers blocking UDP broadcasts.

---

## 4. Security Considerations & Threat Model

1. **Unauthenticated Local Network Access**:
   - *Risk*: Anyone connected to the same LAN or guest Wi-Fi could connect to port `9099` and inject arbitrary keystrokes (`Ctrl+C`, `Enter`, text) into the active terminal session.
   - *Mitigation Plan*:
     - Phase 1: Local subnet binding + Pre-Shared Key (PSK) or pairing PIN token exchanged during initial handshake.
     - Phase 2: TLS encryption over WebSocket (`wss://`) with self-signed certificate pinned on mobile client to prevent packet snooping of voice streams.
2. **Denial of Service (DoS) via Audio Flooding**:
   - *Risk*: Malicious LAN devices flooding the audio port could exhaust desktop memory or thread pool.
   - *Mitigation Plan*: Maximum connection concurrency limit (1 active client) and strict payload size checks on PCM frames.
3. **Android Keystore & Permission Scoping**:
   - Store pairing credentials in Android EncryptedSharedPreferences / Keystore.
   - Restrict background microphone recording permissions strictly behind active foreground service notification.

---

## 5. Implementation Roadmap for Tomorrow

- [ ] **Step 1: Voicy Daemon Network Bridge**:
  - Add WebSocket listener on port `9099` using `tokio-tungstenite` in `voicyd`.
  - Add UDP auto-discovery responder on port `9098`.
  - Route incoming network control packets (`KEY_PRESS`, `RECORD_START`, `RECORD_STOP`, `RECORD_CANCEL`) into `voicyd` internal channel.
- [ ] **Step 2: Client WebSocket Audio Streaming**:
  - Implement browser `AudioContext` 16kHz PCM stream in `src/App.tsx`.
  - Connect WebSocket client to daemon IP for real-time dictation and remote key presses.
- [ ] **Step 3: Android Mobile Wrapper & Foreground Service**:
  - Scaffold Capacitor / Tauri Mobile Android wrapper.
  - Implement Android Foreground Service notification, `PARTIAL_WAKE_LOCK`, and `WIFI_MODE_FULL_HIGH_PERF`.
- [ ] **Step 4: On-Device Compute Integration**:
  - Integrate Sherpa-ONNX WebAssembly / native Android bindings for Mode 3 and Mode 4 execution.
