# Implementation Design & Engineering Decisions

High-density technical architecture, code design patterns, and engineering rationale for the simplified two-mode Voicy system.

---

## 1. The Two-Mode Operational Architecture

### Design & Rationale
The previous 4-mode layout introduced unnecessary complexity and ambiguity regarding network roles. The revised architecture streamlines operations into two distinct modes:

1. **Compute Mode (Phone as Compute Engine)**:
   - Phone runs on-device models (Sherpa-ONNX STT and Phonon TTS).
   - Offloads compute workloads from the host machine to the phone hardware.
2. **Remote Mode (Phone as Remote I/O)**:
   - Phone serves as handheld mic, speaker, and action button bar.
   - Audio is filtered through client-side **arithmetic VAD** matching the daemon.
   - Exchanges data with the daemon **strictly in text** (`DELIVER_TEXT` for STT delivery, `TTS_PROMPT` for TTS synthesis).

### Mode Switching Authority
**The daemon is the absolute authority for mode switching.** The client never chooses its mode unilaterally; the daemon sends a `MODE_CHANGE` WebSocket frame (`remote` or `compute`) whenever the active profile changes.

---

## 2. Daemon Ownership & Unix Socket Client Controls

### Daemon Unix Socket Commands
In `src/ipc.rs` and `src/main.rs` of the daemon:
```rust
match command {
    "CLIENT:ON" => {
        client_enabled.store(true, Ordering::SeqCst);
        broadcast_client_status(true);
        "client_enabled\n"
    }
    "CLIENT:OFF" => {
        client_enabled.store(false, Ordering::SeqCst);
        broadcast_client_status(false);
        "client_disabled\n"
    }
    "CLIENT:STATUS" => {
        // Return JSON with enabled, connected, and current mode
    }
    "MODE:COMPUTE" => {
        current_mode.store(Mode::Compute, Ordering::SeqCst);
        broadcast_mode_change("compute");
        "mode_set:compute\n"
    }
    "MODE:REMOTE" => {
        current_mode.store(Mode::Remote, Ordering::SeqCst);
        broadcast_mode_change("remote");
        "mode_set:remote\n"
    }
    // ...
}
```

### Engineering Rationale
Allows local automation (scripts, shortcuts, or desktop keybindings) to toggle client listening on and off via Unix socket without requiring network hops or client-side toggles.

---

## 3. Manual Connection Configuration (IP & Port Settings)

### Design
- **Elimination of UDP Discovery**: UDP broadcasts are unreliable across complex Wi-Fi subnets, mesh routers, and Android battery optimizations.
- **Settings Screen**:
  - A clean Settings modal accessible via a gear icon in the header.
  - Form fields for `daemonHost` (e.g. `192.168.1.50`) and `daemonPort` (default `9099`).
  - Saved to `localStorage` under `voicy_daemon_host` and `voicy_daemon_port`.
  - On change or initial mount, attempts WebSocket connection to `ws://${daemonHost}:${daemonPort}/ws`.

---

## 4. Mic Button Layout & Swipe-Up Lock Gesture

### UI Layout
- The primary microphone button is placed in the **bottom center**, positioned directly above the horizontal bar of action buttons (`Enter`, `Esc`, `Ctrl+C`, `Alt+M`).
- A visual "Lock" indicator glyph sits directly above the mic button.

```
       [  Lock  ]  <-- Lights up when dragged into lock zone
           ^
         (   )     <-- Bottom-center Mic Button
  [Enter] [Esc] [Ctrl+C] [Alt+M]  <-- Bottom action bar
```

### Gesture State Machine
```
   [ TOUCH START ]  -->  Start recording (Push-to-Talk)
          │
          ├──> [ DRAG UP > 60px ]  -->  Enter LOCKED state (Continuous Listening)
          │                                  │
          │                                  └──> [ TOUCH END ] --> Remains recording!
          │                                                            │
          │                                                            └──> [ TAP MIC / DISCARD ] --> Stop
          │
          └──> [ TOUCH END (without drag) ]  -->  Stop recording & commit (Push-to-Talk)
```

### Touch Handling Implementation Pattern
```typescript
let startY = 0;
let isDragging = false;

const onTouchStart = (e: React.TouchEvent) => {
  startY = e.touches[0].clientY;
  if (!isLocked) {
    startRecording();
  }
};

const onTouchMove = (e: React.TouchEvent) => {
  const currentY = e.touches[0].clientY;
  const deltaY = startY - currentY;
  if (deltaY > 60 && !isLocked) {
    setIsLocked(true); // Locks recording on
  }
};

const onTouchEnd = () => {
  if (!isLocked) {
    stopRecording();
  }
};
```

---

## 5. Client Arithmetic VAD Specification (Remote Mode)

### Rationale
To prevent streaming gigabytes of silent audio or wasting phone battery, the client implements the exact same arithmetic VAD algorithm utilized by the Rust `voicy` daemon:

1. **Audio Capture**: 16kHz mono 16-bit PCM stream via Web Audio `AudioContext`.
2. **Frame Slicing**: Audio buffers sliced into 480-sample blocks (30ms per frame).
3. **RMS Energy Calculation**:
   $$\text{RMS} = \sqrt{\frac{1}{480} \sum_{i=0}^{479} s_i^2}$$
4. **Silence & Hangover Rules**:
   - Frames with `RMS > 0.015` are marked as speech.
   - Non-speech frames increment a silence counter.
   - When silence counter reaches `20` consecutive frames (~600ms), speech chunk is finalized.
   - Hard maximum cap of 24 seconds continuous speech to ensure low latency.

---

## 6. Remote Action Key Grid & Immediate Discard

### Action Key Dispatch
Action buttons reside beneath the mic button:
- `Enter`: `KEY_PRESS` with `key: "Enter"`
- `Escape`: `KEY_PRESS` with `key: "Escape"`
- `Ctrl+C`: `KEY_PRESS` with `key: "Ctrl+C"`
- `Alt+M`: `KEY_PRESS` with `key: "Alt+M"`

The daemon inspects `active_target`:
- If `Some(target)` starts with `%`, executes `tmux send-keys -t <target> <key>`.
- If `None`, executes `wtype` to emit the keycode to the focused Wayland window.
- The client has zero knowledge of pane IDs or window targets.

### Discard Guarantee
Swiping to discard or pressing the cancel button sends:
```json
{"type": "RECORD_CANCEL"}
```
The daemon drops the recording buffer immediately with zero typing, ensuring instant cancellation.
