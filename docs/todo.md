# Voicy Remote Implementation Plan & Todo

Prioritized implementation tasks for Voicy Client (React/TypeScript/Tauri mobile interface) and Voicy Daemon network layer.

---

## Architecture Principles

1. **Two Clean Modes**: Compute Mode (phone executes models) and Remote Mode (phone acts as remote I/O). Mode switching is strictly owned and directed by the daemon.
2. **Daemon-Managed Client Power**: The daemon controls whether the client is active via Unix socket commands (`CLIENT:ON` / `CLIENT:OFF`).
3. **Manual Connection Settings**: User manually inputs Daemon IP and Port in a dedicated Settings panel (no UDP broadcast discovery).
4. **Bottom-Center Mic with Swipe-Up Lock**: Push-to-talk by holding; swiping upward locks into continuous listening mode. Action buttons (`Enter`, `Esc`, `Ctrl+C`, `Alt+M`) reside directly beneath.
5. **Client Arithmetic VAD**: Remote Mode implements the exact arithmetic RMS energy VAD as the daemon before delivering text.

---

## Prioritized Implementation Plan

1. **[P0] Manual Connection Settings Panel**:
   - Provide clean Settings modal in `voicyClient` to enter Daemon IP address and Port (defaults to `9099`).
   - Persist host settings in `localStorage` and initialize WebSocket connection.
2. **[P0] Mic Button Placement & Swipe-Up Lock Gesture**:
   - Position the primary mic button in the bottom center directly above the action buttons.
   - Implement touch handlers:
     - Hold down: Push-to-talk.
     - Swipe up past threshold into middle zone: Lock into continuous listening mode (toggle).
     - Tap while locked or tap discard: Stop recording and commit or cancel.
3. **[P0] Two-Mode Protocol & Daemon State Sync**:
   - Parse `MODE_CHANGE` (`remote` vs `compute`) from daemon over WebSocket.
   - Parse `CLIENT_STATUS` (`enabled: true/false`) from daemon over WebSocket; disable mic and buttons if turned off by daemon.
4. **[P0] Remote Mode Arithmetic VAD & Text Pipeline**:
   - Capture microphone audio at 16kHz mono.
   - Run arithmetic RMS VAD (30ms 480-sample frames, RMS silence threshold, 20-frame silence hangover).
   - In Remote Mode, deliver finalized speech as `DELIVER_TEXT` JSON; handle incoming `TTS_PROMPT` for phone audio playback.
5. **[P0] Daemon Unix Socket Client Controls (`voicy` daemon)**:
   - Add `CLIENT:ON`, `CLIENT:OFF`, `CLIENT:STATUS`, `MODE:COMPUTE`, `MODE:REMOTE` to daemon Unix control socket.
   - Remove deprecated UDP discovery beacon (port 9098).
6. **[P1] Action Button Grid & Discard Protocol**:
   - Layout `Enter`, `Escape`, `Ctrl+C`, `Alt+M` in a clean horizontal bar under the mic button.
   - Dispatch `KEY_PRESS` JSON frames to daemon for active target injection.
   - Wire discard gesture to send `RECORD_CANCEL`.
7. **[P2] On-Device Compute Engine for Compute Mode**:
   - Bundle Sherpa-ONNX and Phonon TTS models on phone for on-device compute execution when switched to Compute Mode.

---

## Todo List

- [x] Set up GitHub Actions CI workflow for `voicyClient` (`.github/workflows/build-test.yml`)
- [x] Fix TypeScript strictness errors in `voicyClient` build
- [x] Document 2-mode architecture, socket interfaces, and UI gesture specification
- [ ] **[P0]** Implement Settings modal in UI for manual IP address and Port configuration
- [ ] **[P0]** Refactor `src/App.tsx` layout: Mic button in bottom center above button bar
- [ ] **[P0]** Implement touch gestures on Mic: Push-to-talk (hold) and Swipe-Up Lock (continuous listening)
- [ ] **[P0]** Implement client-side Arithmetic VAD (RMS 30ms frame accumulation) for Remote Mode
- [ ] **[P0]** Wire WebSocket protocol for `MODE_CHANGE` and `CLIENT_STATUS` events
- [ ] **[P0]** Wire `DELIVER_TEXT` and `TTS_PROMPT` text-based communication in Remote Mode
- [ ] **[P0]** Add `CLIENT:ON`, `CLIENT:OFF`, `MODE:COMPUTE`, `MODE:REMOTE` Unix socket commands in `voicy` daemon
- [ ] **[P0]** Remove UDP discovery listener from `voicy` daemon
- [ ] **[P1]** Wire action buttons (`Enter`, `Esc`, `Ctrl+C`, `Alt+M`) to `KEY_PRESS` socket events
- [ ] **[P1]** Connect discard gesture / button to `RECORD_CANCEL`
- [ ] **[P2]** Bundle on-device Sherpa-ONNX STT and Phonon TTS for Compute Mode
