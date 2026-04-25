# Ultimate Voice Bridge (UVB) — KnightBot AI Assistant

<div align="center">

**A modular, extensible AI-Human interface suite with a stunning galaxy-themed UI**

*Jack of all trades, master of... also, all trades.*

</div>

---

## Overview

The **Ultimate Voice Bridge** is a web-based AI assistant interface that bridges the gap between the immense power of local Large Language Models and the diverse ways humans communicate. Built around the **KnightBot AI Assistant**, it provides a unified, beautiful frontend for multi-modal AI interaction — text chat, voice analysis, image/video understanding, podcast creation, and persistent memory.

Designed to run on high-end consumer hardware with local LLMs (LM Studio, Ollama), the UVB keeps everything on your machine — no cloud dependencies required.

## Current Local Cockpit Status

UVB is now wired for the local KnightBot stack:

- Chat uses an OpenAI-compatible local model endpoint, defaulting to `http://127.0.0.1:8003/v1`.
- Dashboard voice recording uses local Faster Whisper at `http://127.0.0.1:8001/v1/audio/transcriptions`.
- Spoken replies use local Kokoro TTS at `http://127.0.0.1:8880/v1/audio/speech`.
- The top-right health badge checks LLM, STT, TTS, Qdrant, and reranker services.
- Settings can export/import the UVB model and voice profile for quick recovery by another agent.
- Runtime model/voice defaults are saved under ignored `.uvb/` files so local workers can share the dashboard configuration.

## Fast Local Launch

```powershell
cd D:\UVB-KnightBot-Export
.\scripts\start-uvb.ps1
```

To recreate the desktop shortcut:

```powershell
cd D:\UVB-KnightBot-Export
.\scripts\create-desktop-shortcut.ps1
```

The shortcut opens UVB at `http://localhost:3010` and starts the Telegram worker unless `-SkipTelegram` is used.

## Telegram Bridge

Telegram secrets stay in `.env.local`, which is intentionally ignored by git. Use `.env.example` as the safe template.

```powershell
cd D:\UVB-KnightBot-Export
notepad .env.local
```

Required values:

- `TELEGRAM_BOT_TOKEN`: token from BotFather.
- `TELEGRAM_ALLOWED_CHAT_ID`: the personal chat ID allowed to control UVB.
- `UVB_PUBLIC_URL`: usually `http://127.0.0.1:3010` for local polling.

Run only the Telegram worker:

```powershell
cd D:\UVB-KnightBot-Export
bun run telegram
```

## Features

### KnightBot Chat
- Multi-modal input: text, local voice transcription, staged image/video/file attachments
- Thread-based conversation management with auto-naming
- OpenAI-compatible model bridge with configurable backend
- Typing indicators, message actions (copy, regenerate, bookmark)
- Kokoro spoken replies with configurable voice and volume

### Voice Analysis
- Real-time recording and file upload (WAV, MP3, FLAC, OGG, M4A)
- Scientific metrics: fundamental frequency, spectral centroid, RMS energy, zero-crossing rate, spectral rolloff, MFCC coefficients
- Waveform visualization with animated bars
- Voice quality assessment: jitter, shimmer, HNR
- Audio restoration and noise reduction tools

### Media Studio
- **Image Captioning**: detailed descriptions, object detection, scene classification, OCR, dominant color analysis
- **Video Understanding**: scene segmentation with timestamps, key frame analysis, audio track analysis, transcription
- Drag-and-drop upload with animated analysis states

### Podcast Studio
- Up to 6 individually configurable seats
- Voice profile selection: default, presets, or custom zero-shot clones
- Zero-shot voice cloning: 3-5 second sample requirement
- Mix controls: master volume, output format, noise gate
- Real-time voice visualization per seat

### Memory Bank (RAG)
- Persistent local memory with semantic search
- 1536-dimension vector embeddings for retrieval
- Category filters: conversation, knowledge, context, preference
- Search by title, content, and tags
- RAG stats: dimensions, recall rate, retrieval latency

### Settings
- **Profile**: display name, email, password management
- **Voice & Audio**: TTS/STT engine selection, speech rate, barge-in toggle
- **Appearance**: theme (Galaxy Dark, Deep Space, Neon Night), accent colors, particle effects
- **AI Settings**: model backend (LM Studio/Ollama/API), context window, temperature, CoT, RAG
- **Security**: local-only data, AES-256 encryption, auto-save, telemetry toggle
- **Notifications**: configurable alerts for tasks, voice, system events

## Design System

### Visual Language
- **Galaxy particle background**: canvas-based animation with mouse-reactive particles and glow connections
- **Glass panels**: frosted blur with neon borders
- **Animated effects**: glow orbs, scan lines, status pulses, laser-sweep loading
- **3D typography**: layered text shadows for display headings

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Neon Green | `#39ff14` | Primary accent, active states, glow effects |
| Steel Blue | `#4a6fa5` | Secondary accent, gradients, icons |
| Deep Teal | `#0d4f4f` | Panels, hover states |
| Royal Purple | `#4a0e78` | Gradients, user avatar |
| Matte Black | `#0a0a0a` | Base background |
| Dark Gray | `#141418` | Cards, surfaces |
| Accent Yellow | `#f5a623` | Warnings, highlights |
| Accent Orange | `#ff6b35` | Contrast elements |

### Typography
| Font | Role | Source |
|------|------|--------|
| Orbitron | Display / Headings | Google Fonts |
| Inter | Body text | Google Fonts |
| JetBrains Mono | Code / Metrics | Google Fonts |

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | React framework with App Router |
| React | 19.x | UI library |
| TypeScript | 5.9.x | Type-safe development |
| Tailwind CSS | 4.x | Utility-first CSS (CSS-first config) |
| Zustand | 5.x | Client state management |
| Framer Motion | 12.x | Animations and transitions |
| Heroicons | 2.x | Primary icon set |
| Lucide React | 1.x | Secondary icon set |
| Headless UI | 2.x | Accessible UI primitives |
| Bun | Latest | Package manager |

## Project Structure

```
src/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # Root layout (Orbitron, Inter, JetBrains Mono)
│   ├── page.tsx                   # Main dashboard shell (section-based SPA)
│   ├── globals.css                # Tailwind v4 @theme + UVB design tokens
│   ├── api/health/route.ts        # Health check endpoint
│   ├── chat/ChatInterface.tsx     # Chat UI with thread management
│   ├── voice-analysis/            # Voice analysis page
│   ├── media/                     # Media studio (image + video)
│   ├── podcast/                   # Podcast creation suite
│   ├── memory/                    # RAG memory bank
│   └── settings/                  # User settings (6 tabs)
├── components/
│   ├── animated/
│   │   ├── GalaxyBackground.tsx   # Canvas particle system
│   │   ├── UIEffects.tsx          # GlowOrb, ScanLine, FloatingDot
│   │   └── VoiceVisualizer.tsx    # Real-time audio bars
│   ├── layout/
│   │   ├── Sidebar.tsx            # Collapsible navigation
│   │   └── Header.tsx             # Top bar with status/search
│   └── ui/                        # Reusable UI components
├── stores/
│   └── appStore.ts                # Zustand global state
└── lib/                           # Utilities
```

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) installed
- Node.js 20+

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/uvb-knightbot.git
cd uvb-knightbot

# Install dependencies
bun install

# Start development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

```bash
bun dev          # Start development server
bun build        # Production build
bun start        # Start production server
bun lint         # Run ESLint
bun typecheck    # Run TypeScript type checking
```

## Architecture Decisions

- **Single-page app shell**: All sections render within one `page.tsx` using Zustand `activeSection` state — no page transitions, instant switching
- **Component-per-section**: Each feature is a self-contained component with local state
- **CSS-first Tailwind v4**: Design tokens defined in `@theme` block, not JS config
- **No backend in Phase 1**: All data is mock/simulated — designed for easy integration with local LLM APIs

## Roadmap

### Phase 1 — Frontend Foundation *(Complete)*
- [x] All 6 main sections with full UI
- [x] Galaxy particle background with animations
- [x] Zustand state management
- [x] Context-aware chat responses
- [x] Design system with Tailwind v4 tokens

### Phase 2 — Backend Integration
- [ ] LM Studio API connection for live LLM chat
- [ ] Web Audio API for real-time voice recording/analysis
- [ ] Vision model integration for image/video processing
- [ ] Drizzle + SQLite for persistent storage
- [ ] WebSocket streaming for real-time AI responses

### Phase 3 — Advanced Features
- [ ] User authentication with password protection
- [ ] Thread branching and conversation trees
- [ ] Voice cloning pipeline integration
- [ ] Podcast recording with multi-track export
- [ ] RAG pipeline with local vector store
- [ ] Browser automation integration

## License

This project uses free/open source code, models, APIs, and solutions designed to bridge the gap between humanity and AI.

---

<div align="center">

**The UVB & KnightBot would be the link. The system that brings it all together.**

*Truly an extensive and elegant swiss army knife in AI-Human interface evolution.*

</div>
