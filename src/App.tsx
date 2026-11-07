import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Settings,
  Volume2,
  ArrowLeft,
  Radio,
  Check,
  Server,
  CornerDownLeft,
  XOctagon,
  Sparkles,
  Cpu,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Layers
} from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoDiscover, setAutoDiscover] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [daemonHost, setDaemonHost] = useState('192.168.1.100:9099');
  const [discoveredHost, setDiscoveredHost] = useState('10.67.0.31:9099 (xps)');
  const [activeVoice, setActiveVoice] = useState('Alba');
  const [volume, setVolume] = useState(100);
  const [executionMode, setExecutionMode] = useState<'wireless_mic' | 'phone_compute' | 'reverse_compute'>('wireless_mic');
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing' | 'speaking'>('idle');
  const [lastAction, setLastAction] = useState('Ready for input');

  const favoriteVoices = ['Alba', 'Noa', 'Aldo', 'Teddy', 'Spencer', 'Alfie', 'Edwin', 'Hugh', 'Toby'];

  const modeLabels: Record<string, string> = {
    wireless_mic: 'Wireless Mic',
    phone_compute: 'Phone Compute',
    reverse_compute: 'Reverse Compute'
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setStatus('transcribing');
      setLastAction('Delivering transcription to %18');
      setTimeout(() => {
        setStatus('idle');
      }, 1000);
    } else {
      setIsRecording(true);
      setStatus('recording');
      setLastAction('Listening to microphone...');
    }
  };

  const cancelRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setStatus('idle');
    setLastAction('Recording discarded');
  };

  // Cycle mode directly from header badge
  const cycleMode = () => {
    const modes: ('wireless_mic' | 'phone_compute' | 'reverse_compute')[] = [
      'wireless_mic',
      'phone_compute',
      'reverse_compute'
    ];
    const nextIdx = (modes.indexOf(executionMode) + 1) % modes.length;
    setExecutionMode(modes[nextIdx]);
    setLastAction(`Mode set to ${modeLabels[modes[nextIdx]]}`);
  };

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => toggleRecording());
      navigator.mediaSession.setActionHandler('pause', () => toggleRecording());
    }
  }, [isRecording]);

  const sendRemoteKey = (key: string, label: string) => {
    setLastAction(`Executed: ${label}`);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white select-none overflow-hidden justify-between">
      {/* Top Header / Generous status bar clearance for mobile camera cutout */}
      <header className="pt-12 pb-3 px-6 border-b border-red-950/30 bg-black/95 backdrop-blur z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-ping' : 'bg-red-600'}`} />
              <div className="absolute w-2 h-2 rounded-full bg-red-500" />
            </div>
            <span className="font-black tracking-wider text-sm uppercase text-red-500">
              VOICY<span className="text-zinc-600 font-normal ml-1">CLIENT</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick interactive Mode Switcher pill */}
            <button
              onClick={cycleMode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-800 hover:border-red-900/50 text-[11px] font-mono text-zinc-300 transition active:scale-95"
              title="Click to cycle execution mode"
            >
              <Layers size={11} className="text-red-500" />
              <span>{modeLabels[executionMode]}</span>
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-red-900/50 text-zinc-400 hover:text-red-400 transition active:scale-95"
              aria-label="Settings"
            >
              {showSettings ? <ArrowLeft size={16} /> : <Settings size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Body */}
      {!showSettings ? (
        <main className="flex-1 flex flex-col items-center justify-between px-6 relative overflow-hidden">
          {/* Subtle Target Daemon Pane Status */}
          <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/20 border border-red-900/20 text-[11px] font-mono text-red-400/80">
            <Radio size={11} className={isRecording ? 'text-red-500 animate-pulse' : 'text-zinc-600'} />
            <span>Target: <strong>tmux %18</strong></span>
            <span className="text-zinc-800">|</span>
            <span className="uppercase text-[10px] tracking-widest text-zinc-500">{status}</span>
          </div>

          {/* Central Radial Stage shifted slightly upward */}
          <div className="relative flex-1 flex flex-col items-center justify-center w-full -mt-8">
            {/* The Unified Center Assembly */}
            <div className="relative flex items-center justify-center">
              {/* Radiating concentric sound wave ripples - nested directly inside the button wrapper */}
              {isRecording && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {/* Outward propagating harmonic rings perfectly concentric */}
                  <span className="absolute w-32 h-32 rounded-full border border-red-500/70 animate-pulse-ring-1" />
                  <span className="absolute w-32 h-32 rounded-full border border-red-500/50 animate-pulse-ring-2" />
                  <span className="absolute w-32 h-32 rounded-full border border-red-600/40 animate-pulse-ring-3" />
                  <span className="absolute w-32 h-32 rounded-full border border-red-700/30 animate-pulse-ring-4" />
                  {/* Deep background organic glow */}
                  <div className="absolute w-56 h-56 rounded-full bg-red-600/15 blur-3xl animate-pulse" />

                  {/* Orbiting Radial Wave Bars surrounding mic */}
                  {[...Array(32)].map((_, i) => {
                    const deg = (i / 32) * 360;
                    const delay = (i % 8) * 0.12;
                    return (
                      <div
                        key={i}
                        className="absolute w-1 rounded-full bg-gradient-to-t from-red-700 via-red-500 to-rose-400 origin-center transition-all"
                        style={{
                          transform: `rotate(${deg}deg) translateY(-74px)`,
                          height: `${14 + Math.sin(i * 0.8) * 12}px`,
                          animation: 'wave-bounce 1.2s ease-in-out infinite alternate',
                          animationDelay: `${delay}s`,
                          opacity: 0.85
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Main Circular Mic Trigger */}
              <button
                onClick={toggleRecording}
                className={`relative z-10 flex items-center justify-center w-32 h-32 rounded-full transition-all duration-300 active:scale-90 ${
                  isRecording
                    ? 'bg-gradient-to-br from-red-600 via-red-600 to-red-800 text-white animate-glow scale-105'
                    : 'bg-zinc-950 border-2 border-red-950/80 text-red-500 hover:border-red-800 hover:text-red-400 shadow-[0_0_30px_rgba(0,0,0,0.9)]'
                }`}
                aria-label={isRecording ? 'Submit recording' : 'Start recording'}
              >
                {isRecording ? <MicOff size={46} /> : <Mic size={46} />}
              </button>

              {/* Immediate Discard / Trash Button attached to center */}
              {isRecording && (
                <button
                  onClick={cancelRecording}
                  className="absolute -right-20 z-20 p-3.5 rounded-full bg-zinc-950 border border-red-900/60 text-red-400 hover:text-white hover:bg-red-950/60 transition active:scale-90 shadow-xl"
                  title="Discard Recording"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>

            {/* Status Feedback readout */}
            <p className="mt-12 text-xs font-mono text-zinc-400 tracking-wider text-center px-4 max-w-xs">
              {lastAction}
            </p>
          </div>

          {/* Bottom Virtual Keys & Ample Safe Space for Navigation Pill / Gesture Bar */}
          <div className="w-full max-w-sm pb-14 pt-2">
            <div className="grid grid-cols-4 gap-2.5">
              <button
                onClick={() => sendRemoteKey('Enter', 'Enter')}
                className="flex flex-col items-center justify-center py-3 rounded-2xl bg-zinc-950 border border-zinc-900 hover:border-red-900/60 text-zinc-300 hover:text-white transition active:scale-95"
              >
                <CornerDownLeft size={16} className="text-red-400" />
                <span className="text-[10px] font-mono mt-1 text-zinc-400">Enter</span>
              </button>

              <button
                onClick={() => sendRemoteKey('Escape', 'Escape')}
                className="flex flex-col items-center justify-center py-3 rounded-2xl bg-zinc-950 border border-zinc-900 hover:border-red-900/60 text-zinc-300 hover:text-white transition active:scale-95"
              >
                <RotateCcw size={16} className="text-red-400" />
                <span className="text-[10px] font-mono mt-1 text-zinc-400">Esc</span>
              </button>

              <button
                onClick={() => sendRemoteKey('Ctrl+C', 'Ctrl+C')}
                className="flex flex-col items-center justify-center py-3 rounded-2xl bg-zinc-950 border border-zinc-900 hover:border-red-900/60 text-zinc-300 hover:text-white transition active:scale-95"
              >
                <XOctagon size={16} className="text-red-400" />
                <span className="text-[10px] font-mono mt-1 text-zinc-400">Ctrl+C</span>
              </button>

              <button
                onClick={() => sendRemoteKey('Alt+M', 'Alt+M')}
                className="flex flex-col items-center justify-center py-3 rounded-2xl bg-zinc-950 border border-zinc-900 hover:border-red-900/60 text-zinc-300 hover:text-white transition active:scale-95"
              >
                <SlidersHorizontal size={16} className="text-red-400" />
                <span className="text-[10px] font-mono mt-1 text-zinc-400">Alt+M</span>
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* Settings View */
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
              <Cpu size={15} /> Execution Pipeline
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'wireless_mic', label: 'Wireless Mic', desc: 'Stream phone mic to laptop Whisper' },
                { id: 'phone_compute', label: 'Phone Compute', desc: 'Transcribe on phone, send text to laptop' },
                { id: 'reverse_compute', label: 'Reverse Compute', desc: 'Laptop mic audio processed on phone' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setExecutionMode(m.id as any);
                    setLastAction(`Mode set to ${m.label}`);
                  }}
                  className={`flex flex-col text-left p-3 rounded-xl border text-xs transition active:scale-98 ${
                    executionMode === m.id
                      ? 'bg-red-950/30 border-red-600/50 text-white'
                      : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-[11px] text-zinc-500 mt-0.5">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
                <Server size={15} /> Connection & Pairing
              </h2>
              <button
                onClick={() => setAutoDiscover(!autoDiscover)}
                className="text-[10px] font-mono text-zinc-400 hover:text-red-400"
              >
                {autoDiscover ? 'Auto (UDP)' : 'Manual Override'}
              </button>
            </div>

            {autoDiscover ? (
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-900 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Discovered via UDP</div>
                  <div className="text-xs font-mono text-red-400 font-semibold mt-0.5">{discoveredHost}</div>
                </div>
                <button
                  onClick={() => {
                    setIsDiscovering(true);
                    setTimeout(() => setIsDiscovering(false), 900);
                  }}
                  className={`px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono transition active:scale-95 ${
                    isDiscovering ? 'text-red-400 animate-pulse' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {isDiscovering ? 'Scanning...' : 'Rescan'}
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-900">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-1.5">Manual Host Address</div>
                <input
                  type="text"
                  value={daemonHost}
                  onChange={(e) => setDaemonHost(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-800 rounded-lg text-xs font-mono text-red-400 focus:outline-none focus:border-red-600"
                  placeholder="192.168.1.x:9099"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
              <Sparkles size={15} /> TTS Voice
            </h2>
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

          <div className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider text-red-500 uppercase flex items-center gap-2">
              <Volume2 size={15} /> Volume ({volume}%)
            </h2>
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

          <div className="pt-3 border-t border-zinc-900 flex justify-center pb-12">
            <button
              onClick={() => setShowSettings(false)}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs tracking-wider uppercase active:scale-95 transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
