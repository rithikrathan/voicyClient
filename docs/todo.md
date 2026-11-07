# Voicy Remote Implementation Plan & Todo

Prioritized implementation tasks for Voicy Daemon network layer and Tauri Android WebView mobile client.

---

## Prioritized Implementation Plan

1. **[P0] Daemon Network Bridge (Port 9099)**: Implement WebSocket server in `voicyd` to accept control JSON messages, binary audio streaming, and execute remote virtual keys (`Enter`, `Esc`, `Ctrl+C`, `Alt+M`) using daemon active routing target.
2. **[P0] UDP Broadcast Auto-Discovery (Port 9098)**: Implement zero-config UDP beacon handshake between mobile client and daemon with manual IP fallback.
3. **[P0] Client Audio Streaming (Mode 1)**: Capture 16kHz PCM from Tauri WebView / Rust audio bridge and stream over WebSocket with immediate `RECORD_CANCEL` discard support.
4. **[P1] Bidirectional Audio Pipeline (Mode 2)**: Stream synthesized TTS audio from daemon back to phone speaker/headset with headset media button toggle.
5. **[P1] Tauri Android Wrapper & Foreground Service**: Configure Tauri mobile project with Android Foreground Service, `PARTIAL_WAKE_LOCK`, and persistent notification for screen-off execution.
6. **[P2] Local Authentication & Traffic Security**: Add pre-shared key (PSK) pairing handshake and payload rate limiting to prevent unauthorized LAN access.
7. **[P3] On-Device Phone Inference Engine (Modes 3 & 4)**: Bundle on-device Sherpa-ONNX STT and Phonon TTS for standalone mobile processing and daemon compute offloading.

---

## Todo List

- [ ] **[P0]** Add WebSocket server on port `9099` to `voicyd` daemon
- [ ] **[P0]** Add UDP beacon discovery listener on port `9098`
- [ ] **[P0]** Implement remote keypress dispatch (`Enter`, `Escape`, `Ctrl+C`, `Alt+M`) using daemon active routing target
- [ ] **[P0]** Wire mobile mic stream to WebSocket in `src/App.tsx` / Tauri bridge
- [ ] **[P0]** Connect client discard button to `RECORD_CANCEL`
- [ ] **[P1]** Add reverse audio playback for Mode 2 TTS on phone
- [ ] **[P1]** Scaffold Tauri Android native container with persistent Foreground Service
- [ ] **[P2]** Implement PSK authentication handshake on connection
- [ ] **[P3]** Integrate on-device Sherpa-ONNX mobile engine for Modes 3 & 4
