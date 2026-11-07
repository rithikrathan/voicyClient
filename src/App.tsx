import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Settings,
  ArrowLeft,
  Server,
  Lock,
  Unlock,
  CornerDownLeft,
  XOctagon,
  RotateCcw,
  Volume2,
  Check,
  Radio,
  Wifi,
  WifiOff,
  SlidersHorizontal
} from 'lucide-react';

export default function App() {
  // Connection and Settings
  const [daemonHost, setDaemonHost] = useState(() => localStorage.getItem('voicy_host') || '192.168.1.100');
  const [daemonPort, setDaemonPort] = useState(() => localStorage.getItem('voicy_port') || '9099');
  const [showSettings, setShowSettings] = useState(false);
  const [connected, setConnected] = useState(false);

  // Daemon-controlled Mode and Client Status
  const [mode, setMode] = useState<'remote' | 'compute'>('remote');
  const [clientEnabled, setClientEnabled] = useState(true);
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing' | 'speaking'>('idle');

  // Mic and Gesture State
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [dragProgress, setDragProgress] = useState(0); // 0 to 1 for visual lock zone
  const touchStartYRef = useRef<number | null>(null);

  // Transcript Display
  const [liveText, setLiveText] = useState('');
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState('Connected to Voicy Daemon');
  const [activeVoice, setActiveVoice] = useState('Alba');
  const [volume, setVolume] = useState(100);

  // Refs for Web Audio & WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);

  const favoriteVoices = ['Alba', 'Noa', 'Aldo', 'Teddy', 'Spencer', 'Alfie', 'Edwin', 'Hugh', 'Toby'];

  // Save Settings
  const saveHostSettings = (host: string, port: string) => {
    setDaemonHost(host);
    setDaemonPort(port);
    localStorage.setItem('voicy_host', host);
    localStorage.setItem('voicy_port', port);
  };

  // WebSocket Connection Management
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let activeWs: WebSocket | null = null;

    const connectWs = () => {
      try {
        const url = `ws://${daemonHost}:${daemonPort}`;
        const ws = new WebSocket(url);
        activeWs = ws;
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setLastAction('WebSocket bridge active');
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              switch (data.type) {
                case 'CLIENT_STATUS':
                  setClientEnabled(Boolean(data.enabled));
                  if (!data.enabled) {
                    setLastAction('Client disabled by daemon command');
                  }
                  break;
                case 'MODE_CHANGE':
                  if (data.mode === 'compute' || data.mode === 'remote') {
                    setMode(data.mode);
                    setLastAction(`Mode updated by daemon: ${data.mode.toUpperCase()}`);
                  }
                  break;
                case 'STATUS_UPDATE':
                  if (data.state) {
                    setStatus(data.state);
                  }
                  break;
                case 'PARTIAL_TEXT':
                  if (data.text) {
                    setLiveText(data.text);
                  }
                  break;
                case 'COMMITTED_TEXT':
                  if (data.text) {
                    setLiveText('');
                    setTranscriptHistory((prev) => [data.text, ...prev.slice(0, 19)]);
                    setLastAction(`Committed: "${data.text.slice(0, 30)}..."`);
                  }
                  break;
                case 'TTS_PROMPT':
                  if (data.text && 'speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(data.text);
                    utterance.volume = volume / 100;
                    window.speechSynthesis.speak(utterance);
                    setLastAction(`TTS: "${data.text.slice(0, 25)}..."`);
                  }
                  break;
                case 'ERROR':
                  setLastAction(`Daemon Error: ${data.message || 'unknown'}`);
                  break;
                default:
                  break;
              }
            } catch {
              // Non-JSON frame
            }
          }
        };

        ws.onclose = () => {
          setConnected(false);
          setLastAction('Disconnected from daemon. Reconnecting...');
          reconnectTimeout = setTimeout(connectWs, 2000);
        };

        ws.onerror = () => {
          setConnected(false);
        };
      } catch {
        reconnectTimeout = setTimeout(connectWs, 2500);
      }
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimeout);
      if (activeWs) {
        activeWs.close();
      }
    };
  }, [daemonHost, daemonPort, volume]);

  // Client-Side Audio Capture & Arithmetic VAD
  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      // 480-sample frames for 30ms arithmetic VAD
      const FRAME_SIZE = 480;
      let frameAcc: number[] = [];
      const silenceThreshold = 0.015;
      let trailingSilence = 0;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        for (let i = 0; i < inputData.length; i++) {
          frameAcc.push(inputData[i]);

          if (frameAcc.length === FRAME_SIZE) {
            // Arithmetic RMS calculation: sqrt(sum(s^2) / N)
            let sumSq = 0;
            for (let j = 0; j < FRAME_SIZE; j++) {
              sumSq += frameAcc[j] * frameAcc[j];
            }
            const rms = Math.sqrt(sumSq / FRAME_SIZE);

            if (rms >= silenceThreshold) {
              trailingSilence = 0;
            } else {
              trailingSilence += 1;
            }

            // Stream PCM audio chunk over WebSocket if open
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              const pcm16 = new Int16Array(FRAME_SIZE);
              for (let j = 0; j < FRAME_SIZE; j++) {
                pcm16[j] = Math.max(-32768, Math.min(32767, Math.floor(frameAcc[j] * 32767)));
              }
              const packet = new Uint8Array(1 + pcm16.byteLength);
              packet[0] = 0x02; // Upstream 16kHz PCM opcode
              new Uint8Array(packet.buffer, 1).set(new Uint8Array(pcm16.buffer));
              wsRef.current.send(packet);
            }

            frameAcc = [];
          }
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      setLastAction(`Microphone access error: ${err}`);
    }
  };

  const stopAudioCapture = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  };

  // Recording Controls
  const startRecording = () => {
    if (!clientEnabled) {
      setLastAction('Cannot record: Client disabled by daemon');
      return;
    }
    setIsRecording(true);
    setStatus('recording');
    setLastAction('Listening via phone microphone...');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'RECORD_START' }));
    }
    startAudioCapture();
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setIsLocked(false);
    setDragProgress(0);
    setStatus('transcribing');
    setLastAction('Finalizing dictation and transcribing...');

    stopAudioCapture();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'RECORD_STOP' }));
    }
  };

  const cancelRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setIsLocked(false);
    setDragProgress(0);
    setStatus('idle');
    setLiveText('');
    setLastAction('Recording discarded (RECORD_CANCEL)');

    stopAudioCapture();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'RECORD_CANCEL' }));
    }
  };

  // Touch Gesture Handling for Bottom-Center Mic Button (Push-to-Talk + Swipe-Up Lock)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    if (!isLocked) {
      startRecording();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartYRef.current - currentY; // Upward drag is positive
    const progress = Math.min(1, Math.max(0, deltaY / 65));
    setDragProgress(progress);

    if (deltaY > 60 && !isLocked) {
      setIsLocked(true);
      setLastAction('Listening mode locked on');
    }
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
    setDragProgress(0);
    // If locked into continuous listening, do NOT stop recording on touch release
    if (!isLocked) {
      stopRecording();
    }
  };

  // Mouse fallback for desktop testing
  const handleMouseDown = () => {
    if (!isLocked) {
      startRecording();
    } else {
      // Tap while locked stops recording
      stopRecording();
    }
  };

  const handleMouseUp = () => {
    if (!isLocked) {
      stopRecording();
    }
  };

  // Remote Virtual Keys
  const sendRemoteKey = (key: string, label: string) => {
    if (!clientEnabled) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'KEY_PRESS', key }));
      setLastAction(`Executed remote key: ${label}`);
    } else {
      setLastAction(`Failed: Not connected to daemon`);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white select-none overflow-hidden justify-between">
      {/* Top Header */}
      <header className="pt-10 pb-3 px-6 border-b border-zinc-900 bg-black/95 backdrop-blur z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-red-500 animate-pulse' : 'bg-zinc-700'}`} />
            </div>
            <span className="font-black tracking-wider text-sm uppercase text-red-500">
              VOICY<span className="text-zinc-600 font-normal ml-1">CLIENT</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Indicator Badge (Daemon Controlled) */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300">
              <Radio size={11} className={mode === 'remote' ? 'text-red-500' : 'text-blue-400'} />
              <span>{mode === 'remote' ? 'Remote Mode' : 'Compute Mode'}</span>
            </div>

            {/* Settings Toggle Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-red-900/50 text-zinc-400 hover:text-red-400 transition active:scale-95"
              aria-label="Settings"
            >
              {showSettings ? <ArrowLeft size={16} /> : <Settings size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Body */}
      {!showSettings ? (
        <main className="flex-1 flex flex-col items-center justify-between px-6 pt-4 pb-4 relative overflow-hidden">
          {/* Daemon Status Bar */}
          <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-900">
            <div className="flex items-center gap-2">
              {connected ? <Wifi size={14} className="text-red-500" /> : <WifiOff size={14} className="text-zinc-600" />}
              <span className="text-xs font-mono text-zinc-400">
                {connected ? `${daemonHost}:${daemonPort}` : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                !clientEnabled
                  ? 'bg-red-950/80 text-red-400 border border-red-800'
                  : status === 'recording'
                  ? 'bg-red-900/50 text-red-300 animate-pulse'
                  : 'bg-zinc-900 text-zinc-400'
              }`}>
                {!clientEnabled ? 'DISABLED' : status}
              </span>
            </div>
          </div>

          {/* Transcript & Feedback Area */}
          <div className="flex-1 w-full flex flex-col justify-end py-6 overflow-hidden">
            <div className="space-y-3 overflow-y-auto max-h-[35vh] pr-1">
              {/* Live in-flight transcript */}
              {liveText && (
                <div className="p-4 rounded-2xl bg-zinc-950 border border-red-900/40 text-red-300 text-sm font-mono leading-relaxed animate-pulse">
                  {liveText}
                </div>
              )}

              {/* Recent transcript history */}
              {transcriptHistory.map((text, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-zinc-950/40 border border-zinc-900/60 text-zinc-300 text-xs font-mono leading-relaxed"
                >
                  {text}
                </div>
              ))}

              {transcriptHistory.length === 0 && !liveText && (
                <div className="text-center py-10 text-zinc-600 text-xs font-mono">
                  Press and hold the bottom microphone to dictate.
                  <br />
                  Swipe upward into the lock zone for continuous listening.
                </div>
              )}
            </div>

            {/* Status footer message */}
            <div className="mt-3 text-center text-[11px] font-mono text-zinc-500 truncate">
              {lastAction}
            </div>
          </div>

          {/* Bottom Interaction Section: Mic Button & Action Key Bar */}
          <div className="w-full flex flex-col items-center gap-4">
            {/* Visual Lock Indicator glyph above mic button */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase transition-all duration-200 ${
                isLocked
                  ? 'bg-red-950 border border-red-600 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : dragProgress > 0.4
                  ? 'bg-zinc-800 border border-zinc-600 text-white scale-105'
                  : 'text-zinc-600'
              }`}
            >
              {isLocked ? <Lock size={11} className="text-red-500" /> : <Unlock size={11} />}
              <span>{isLocked ? 'Locked Continuous' : dragProgress > 0 ? 'Swipe Up To Lock' : 'Push To Talk'}</span>
            </div>

            {/* Bottom-Center Primary Mic Button */}
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing ring while recording */}
              {isRecording && (
                <div className="absolute w-28 h-28 rounded-full bg-red-600/20 animate-ping pointer-events-none" />
              )}

              <button
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                disabled={!clientEnabled}
                className={`relative w-24 h-24 rounded-full flex items-center justify-center border-2 transition-all duration-200 shadow-2xl active:scale-95 ${
                  !clientEnabled
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-700 cursor-not-allowed'
                    : isRecording
                    ? 'bg-red-600 border-red-400 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)]'
                    : 'bg-zinc-950 border-zinc-800 hover:border-red-900/60 text-red-500 hover:text-red-400'
                }`}
                aria-label="Microphone"
              >
                {isRecording ? <Mic size={36} /> : <MicOff size={36} />}
              </button>
            </div>

            {/* Bottom Action Key Bar (Enter, Esc, Ctrl+C, Alt+M, and Discard) */}
            <div className="w-full grid grid-cols-5 gap-2 pt-2 pb-2">
              <button
                onClick={() => sendRemoteKey('Enter', 'Enter')}
                className="py-3 rounded-xl bg-zinc-950 border border-zinc-900 hover:border-zinc-800 active:border-red-600 text-zinc-300 font-mono text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition"
              >
                <CornerDownLeft size={14} className="text-zinc-400" />
                <span className="text-[10px]">Enter</span>
              </button>

              <button
                onClick={() => sendRemoteKey('Escape', 'Esc')}
                className="py-3 rounded-xl bg-zinc-950 border border-zinc-900 hover:border-zinc-800 active:border-red-600 text-zinc-300 font-mono text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition"
              >
                <span className="text-xs font-bold text-zinc-400">ESC</span>
                <span className="text-[10px]">Abort</span>
              </button>

              <button
                onClick={() => sendRemoteKey('Ctrl+C', 'Ctrl+C')}
                className="py-3 rounded-xl bg-zinc-950 border border-zinc-900 hover:border-zinc-800 active:border-red-600 text-zinc-300 font-mono text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition"
              >
                <XOctagon size={14} className="text-red-500" />
                <span className="text-[10px]">Ctrl+C</span>
              </button>

              <button
                onClick={() => sendRemoteKey('Alt+M', 'Alt+M')}
                className="py-3 rounded-xl bg-zinc-950 border border-zinc-900 hover:border-zinc-800 active:border-red-600 text-zinc-300 font-mono text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition"
              >
                <SlidersHorizontal size={14} className="text-zinc-400" />
                <span className="text-[10px]">Alt+M</span>
              </button>

              <button
                onClick={cancelRecording}
                disabled={!isRecording}
                className={`py-3 rounded-xl border font-mono text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition ${
                  isRecording
                    ? 'bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/50'
                    : 'bg-zinc-950/40 border-zinc-900 text-zinc-600 cursor-not-allowed'
                }`}
              >
                <RotateCcw size={14} />
                <span className="text-[10px]">Discard</span>
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* Settings Screen: Manual IP & Port Configuration */
        <div className="flex-1 flex flex-col justify-between px-6 py-6 space-y-6 overflow-y-auto">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
              <h2 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
                <Server size={15} /> Daemon Connection Settings
              </h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                    Daemon IP Address / Host
                  </label>
                  <input
                    type="text"
                    value={daemonHost}
                    onChange={(e) => saveHostSettings(e.target.value, daemonPort)}
                    className="w-full mt-1.5 px-3 py-2 bg-black border border-zinc-800 rounded-lg text-xs font-mono text-red-400 focus:outline-none focus:border-red-600"
                    placeholder="e.g. 192.168.1.50 or localhost"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                    Daemon WebSocket Port
                  </label>
                  <input
                    type="text"
                    value={daemonPort}
                    onChange={(e) => saveHostSettings(daemonHost, e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 bg-black border border-zinc-800 rounded-lg text-xs font-mono text-red-400 focus:outline-none focus:border-red-600"
                    placeholder="9099"
                  />
                </div>
              </div>
            </div>

            {/* Active Mode Info */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Current Operational Mode</div>
              <div className="text-xs font-mono text-white flex items-center justify-between">
                <span>{mode === 'remote' ? 'Remote Mode (Phone I/O)' : 'Compute Mode (On-Device Models)'}</span>
                <span className="text-[10px] text-zinc-500 font-mono">Managed by Daemon</span>
              </div>
            </div>

            {/* Voice & TTS Settings */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
                <Volume2 size={15} /> TTS Voice Selection
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {favoriteVoices.map((voice) => (
                  <button
                    key={voice}
                    onClick={() => setActiveVoice(voice)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition active:scale-95 ${
                      activeVoice === voice
                        ? 'bg-red-950/40 border-red-600 text-red-300'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{voice}</span>
                    {activeVoice === voice && <Check size={12} className="text-red-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Volume Slider */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
                <Volume2 size={15} /> Audio Volume ({volume}%)
              </h3>
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-900">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-red-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Done Button */}
          <div className="pt-4 border-t border-zinc-900 flex justify-center pb-8">
            <button
              onClick={() => setShowSettings(false)}
              className="px-8 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs tracking-wider uppercase active:scale-95 transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
