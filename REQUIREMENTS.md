# VoicyClient (Android) - Product Requirements & Architecture

## Overview
A lightweight, distraction-free mobile client for the Voicy Linux STT & TTS daemon.

## UI Design & UX Requirements
- **Single Page Primary View**:
  - Prominent central/bottom-middle interactive microphone button (Push-to-Talk / Toggle recording).
  - Minimalist live status indicator (Connecting, Idle, Recording, Transcribing, Delivering, Speaking).
  - Subtle audio waveform / ripple feedback when active.
  - Recent transcription feed / delivery preview card.
- **Dedicated Settings Page (Accessible via header gear icon)**:
  - Daemon host connection settings (Host IP / Hostname, Port, Authentication token).
  - TTS Controls & Voice Selector:
    - Default voice picker (Alba, Noa, Aldo, Teddy, Spencer, Alfie, Edwin, Hugh, Toby, etc.).
    - Playback volume slider (0–100%).
    - "Test Voice" button to verify audio directly from mobile or desktop.
  - Target routing indicator (tmux pane %ID, focused Wayland window, clipboard-only).

## Technology Stack
- **Framework**: Tauri v2 Mobile / Vite + React 19 + TypeScript.
- **Styling**: Tailwind CSS + Shadcn design patterns (Dark mode native, high-contrast, clean typography).
- **Icons**: Lucide Icons.
- **Communication Protocol**: WebSocket / secure TCP stream directly to `voicyd`.
