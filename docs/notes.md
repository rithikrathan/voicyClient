# Voicy Feature Notes & Proposed Commands

## 1. `voicy speak --from-md <file>`
- **Purpose**: Directly consume Markdown documentation files and synthesize clear, continuous speech without markup artifacts.
- **Noise Stripping Specification**:
  - Strip Mermaid diagrams (````mermaid ... ````) and ASCII visual art diagrams.
  - Strip multi-line code fences and inline backticks.
  - Strip Markdown formatting: headings (`#`), bold/italic (`**`, `_`), blockquotes (`>`), horizontal rules (`---`), and bullet list markers.
  - Flatten table grids, converting pipe-separated rows into readable prose phrases.
  - Convert markdown links `[label](url)` into plain spoken labels.
  - Remove LaTeX math blocks, arrows, and directory tree drawing characters (`├──`, `└──`).
- **Streaming Pipeline**:
  - Segment stripped text into cohesive sentences or paragraphs (under 300 characters each).
  - Stream chunks sequentially into the Phonon TTS queue via `/run/user/<uid>/voicy.sock`.
  - Leverages the daemon's lookahead synthesis pipeline for instant, gapless playback.

---

## 2. `voicy -st` / Ambient RMS Threshold Calibration
- **Purpose**: Dynamically calibrate and set the arithmetic Voice Activity Detection (VAD) RMS silence threshold (`silence_threshold`) based on real-time ambient environment acoustics.
- **Calibration Protocol**:
  - Command invocation: `voicy -st` (or `voicy calibrate-st`).
  - Records a 10-second ambient audio sample from the active microphone.
  - Analyzes the room's ambient noise floor by calculating the root-mean-square (RMS) energy distribution across 30ms (480-sample) frames:
    $$\text{RMS}_{\text{ambient}} = \sqrt{\frac{1}{N}\sum_{i=1}^{N} s_i^2}$$
  - Computes the baseline noise floor (e.g., 95th percentile of ambient background noise) and sets the speech threshold safely above it:
    $$\text{threshold}_{\text{calibrated}} = \text{RMS}_{\text{ambient\_95th}} \times \text{margin}$$
  - Dynamically updates the running daemon configuration and persists the calibrated value to `~/.config/voicy/config.toml`.
- **Environmental Adaptation**:
  - Ensures robust, adaptive VAD performance in loud rooms (cafes, transit, server fans) as well as silent rooms without clipping initial consonants or lingering on background hum.
