# Implementation Design & Engineering Decisions

High-density technical architecture, code design patterns, and engineering rationale for every item in `todo.md`.

---

## 1. [P0] WebSocket Server on Port 9099 (`voicyd`)
- **What it does**: Binds an async TCP WebSocket listener on `0.0.0.0:9099` to accept JSON control messages and binary PCM streams from remote clients.
- **Design in Code**:
  ```rust
  // tokio::spawn running alongside main sync worker via std::sync::mpsc crossbeam bridge
  let listener = TcpListener::bind("0.0.0.0:9099").await?;
  while let Ok((stream, _)) = listener.accept().await {
      let ws_stream = tokio_tungstenite::accept_async(stream).await?;
      let (mut ws_tx, mut ws_rx) = ws_stream.split();
      // Forward JSON commands to existing daemon internal channel tx_worker
      // Stream binary PCM (0x02) into an atomic AudioSource ringbuffer
  }
  ```
- **Rationale**: Reuses `voicyd`'s existing internal worker pipeline without rewriting the synchronous Whisper and audio capture threads. WebSocket avoids HTTP polling overhead and natively handles mixed UTF-8 JSON controls with binary audio frames over a single multiplexed TCP connection.

---

## 2. [P0] UDP Beacon Discovery on Port 9098
- **What it does**: Listens on broadcast UDP socket `0.0.0.0:9098` for discovery ping and returns daemon host info and WebSocket port.
- **Design in Code**:
  ```rust
  let socket = UdpSocket::bind("0.0.0.0:9098")?;
  socket.set_broadcast(true)?;
  let mut buf = [0u8; 256];
  loop {
      let (len, src) = socket.recv_from(&mut buf)?;
      if let Ok(msg) = serde_json::from_slice::<DiscoverQuery>(&buf[..len]) {
          if msg.cmd == "VOICY_DISCOVER" {
              let beacon = json!({"cmd": "VOICY_BEACON", "port": 9099, "hostname": get_hostname(), "target": *target.lock().unwrap()});
              socket.send_to(beacon.to_string().as_bytes(), src)?;
          }
      }
  }
  ```
- **Rationale**: Eliminates entering LAN IP addresses manually every time router DHCP assigns a new local IP. UDP broadcast is zero-overhead and instant (<5ms response).

---

## 3. [P0] Remote Keypress Dispatch (`Enter`, `Escape`, `Ctrl+C`, `Alt+M`)
- **What it does**: Dispatches virtual keystrokes received over WebSocket directly into the active tmux pane (`%18`) or Wayland desktop via `wtype`.
- **Design in Code**:
  ```rust
  pub fn send_remote_key(key: &str, target: Option<&str>) {
      match target {
          Some(t) if t.starts_with('%') => {
              // Direct tmux target pane execution
              let tmux_key = match key {
                  "Enter" => "Enter",
                  "Escape" => "Escape",
                  "Ctrl+C" => "C-c",
                  "Alt+M" => "M-m",
                  _ => return,
              };
              let _ = Command::new("tmux").args(["send-keys", "-t", t, tmux_key]).status();
          }
          _ => {
              // Focused window execution under Wayland
              let wtype_arg = match key {
                  "Enter" => vec!["-k", "Return"],
                  "Escape" => vec!["-k", "Escape"],
                  "Ctrl+C" => vec!["-M", "ctrl", "-k", "c", "-m", "ctrl"],
                  "Alt+M" => vec!["-M", "alt", "-k", "m", "-m", "alt"],
                  _ => return,
              };
              let _ = Command::new("wtype").args(&wtype_arg).status();
          }
      }
  }
  ```
- **Rationale**: Decouples terminal interaction from speech. Allows interrupting long-running LLM generation (`Ctrl+C`), submitting prompts (`Enter`), and exiting prompts (`Escape`) directly from the phone without touching the computer keyboard.

---

## 4. [P0] Mobile Mic Audio Stream (`src/App.tsx` & Tauri Bridge)
- **What it does**: Captures 16kHz mono 16-bit PCM audio from the microphone and streams binary frames over the WebSocket during active recording.
- **Design in Code**:
  ```typescript
  // Tauri Rust command or Web Audio AudioWorklet:
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(micStream);
  const processor = audioCtx.createScriptProcessor(1024, 1, 1);
  processor.onaudioprocess = (e) => {
    if (!isRecording.current) return;
    const inputData = e.inputBuffer.getChannelData(0);
    // Convert Float32 to Int16 Little-Endian
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
    }
    const frame = new Uint8Array(1 + pcm16.buffer.byteLength);
    frame[0] = 0x02; // Upstream mic opcode
    frame.set(new Uint8Array(pcm16.buffer), 1);
    ws.send(frame);
  };
  ```
- **Rationale**: Streaming uncompressed 16kHz PCM avoids encoding latency and CPU strain from Opus/AAC compression on mobile, consuming only 32 kB/s on the local LAN while keeping Whisper acoustic fidelity identical to the local microphone.

---

## 5. [P0] Immediate Discard Button (`RECORD_CANCEL`)
- **What it does**: Instantly resets client recording state and sends `RECORD_CANCEL` to daemon to discard buffered audio chunks and suppress typing.
- **Design in Code**:
  ```typescript
  const cancelRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    ws.send(JSON.stringify({ type: 'RECORD_CANCEL' }));
    resetVisualizer();
  };
  ```
  ```rust
  // Daemon handling:
  "RECORD_CANCEL" => {
      recorder.cancel(); // Clears raw sample buffer
      let current_tid = task_counter.load(Ordering::SeqCst);
      canceled_task_id.store(current_tid, Ordering::SeqCst); // Drops in-flight worker output
      sink::resume_media();
  }
  ```
- **Rationale**: Prevents erroneous utterances from being transcribed or committed to the active editor. Guarantees that accidental mic taps can be aborted with zero side effects on the desktop.

---

## 6. [P1] Reverse Audio Playback (Mode 2 Phone TTS)
- **What it does**: Receives synthesized Phonon TTS audio chunks from the daemon over WebSocket and plays them through the phone speaker or connected Bluetooth headphones.
- **Design in Code**:
  ```typescript
  ws.onmessage = async (event) => {
    if (event.data instanceof ArrayBuffer) {
      const data = new Uint8Array(event.data);
      if (data[0] === 0x01) { // Downstream TTS opcode
        const pcm16 = new Int16Array(data.buffer, 1);
        playPcmBuffer(pcm16, 24000); // 24kHz Phonon sample rate
      }
    }
  };
  ```
- **Rationale**: Enables fully headless operation where the user wears headphones paired to their mobile phone away from the laptop, hearing both TTS agent feedback and dictating input without needing laptop audio output.

---

## 7. [P1] Tauri Android Foreground Service & Wake-Locks
- **What it does**: Keeps the Android WebView WebSocket connection and audio recording alive when the phone screen turns off or locks in a pocket.
- **Design in Code**:
  ```kotlin
  // Android native foreground service plugin in Tauri:
  val channelId = "voicy_service_channel"
  val notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Voicy Remote Active")
      .setContentText("Connected to voicyd - Headset PTT active")
      .setSmallIcon(R.drawable.ic_mic)
      .setOngoing(true)
      .build()
  startForeground(1001, notification)

  val wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Voicy::RemoteWakeLock")
  wakeLock.acquire()
  ```
- **Rationale**: Android OS aggressively kills background WebSockets and suspends JavaScript execution after 15–30 seconds of screen off. A persistent Foreground Service with `PARTIAL_WAKE_LOCK` is the only guaranteed Android architecture for background headless audio tools.

---

## 8. [P2] Local Authentication & Traffic Security (PSK Token)
- **What it does**: Validates a pre-shared pairing token in the WebSocket opening handshake to reject unauthorized devices on the local Wi-Fi.
- **Design in Code**:
  ```rust
  // On WebSocket upgrade request:
  let token = req.headers().get("X-Voicy-Token").and_then(|v| v.to_str().ok());
  if token != Some(&config.network.auth_token) {
      return reject_handshake(StatusCode::UNAUTHORIZED);
  }
  ```
- **Rationale**: Lightweight single-token verification blocks rogue devices on shared Wi-Fi networks (coffee shops, offices) from injecting keystrokes into the host terminal without the complexity of full PKI certificates.

---

## 9. [P3] On-Device Phone Inference Engine (Modes 3 & 4)
- **What it does**: Executes Sherpa-ONNX STT and Phonon TTS models locally on Android hardware via native Rust bindings inside Tauri.
- **Design in Code**:
  ```rust
  // Inside src-tauri/src/lib.rs:
  #[tauri::command]
  fn transcribe_local_pcm(samples: Vec<f32>) -> Result<String, String> {
      let recognizer = get_sherpa_recognizer()?;
      let mut stream = recognizer.create_stream()?;
      stream.accept_waveform(16000, &samples);
      recognizer.decode_stream(&mut stream);
      Ok(stream.get_result().text)
  }
  ```
- **Rationale**: Offloads computation from laptop battery when phone has an NPU (e.g. Snapdragon 8 Gen series, Tensor) and enables standalone speech processing with pure text transmission over the network.
