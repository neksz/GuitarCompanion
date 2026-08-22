# 🎸 Guitar Companion

> **The ultimate modern guitar tablature and sheet music manager, practice tracker, and player.**  
> Built with **React 19**, **TypeScript**, **Electron**, and **PWA** support with seamless **MEGA Cloud Sync**.

---

## 📖 Overview

**Guitar Companion** is a dedicated music library app designed for guitarists, bassists, and musicians. It brings all your guitar tabs (PDFs, Guitar Pro files, and chord sheets) together in one clean, responsive workspace.

It uses your own MEGA cloud storage for synchronization and backups. All tabs and metadata are stored in your cloud. It's all client side, the app never touches your files directly, only via MEGA service.

---

## ✨ Key Features

### 🎼 Interactive Guitar Pro Player

- **Universal Format Support**: Opens and plays `.gp3`, `.gp4`, `.gp5`, `.gpx`, and modern `.gp` files.
- **Audio Synthesizer & Soundfonts**: Realistic instrument audio playback powered by AlphaTab and custom soundfonts.
- **Multi-Track Mixing**: Switch between lead guitar, rhythm guitar, bass, drums, keyboards, and vocal lines on the fly.
- **Practice Controls**:
  - Variable speed playback (from 50% half-speed up to 150% double-speed).
  - Interactive playback timeline scrubbing, seeking, and section navigation.
- **Stage & Night Themes**: Toggle between Light, Dark OLED (Stage), and Warm Sepia reading modes.

### 📄 Advanced PDF Sheet Music Reader

- **Flexible Reading Layouts**:
  - **Single Page Mode**: Fit height/width for focused reading.
  - **Double Page Mode**: Side-by-side book-spread layout for desktop and wide screens.
  - **Continuous Scroll Mode**: Smooth vertical scroll for fast skimming.
- **Touch & Gesture Navigation**: Swipe left/right on touchscreens to flip pages smoothly.
- **Page Rotation & Smooth Zoom**: 50% to 250% zoom with quick keyboard shortcuts.
- **Dark & Sepia Inversion**: Inverted night mode for comfortable low-light stage practice.

### 🔍 Smart Tab Analyzer

- **Automatic Metadata Extraction**: Automatically parses uploaded PDFs and Guitar Pro files to detect:
  - **Tuning** (_Standard, Drop D, Drop C, DADGAD, Open G, Open D, Half-Step Down, etc._)
  - **Capo Position** (_Capo 1–12 or No Capo_)
  - **Song Title & Artist Metadata**
  - **First-page visual preview thumbnail**

### ⏱️ Practice Tracker & Analytics

- **Live Practice Timer**: Tracks exact seconds spent practicing each piece.
- **Lifetime Statistics**: Logs total cumulative practice hours and times played.
- **Status Badges**: Tag and organize songs by `Favorite`, `Learning`, or `Learned`.

### ☁️ Secure Cloud Sync (MEGA)

- Direct integration with **MEGA Cloud Storage** using client-side encryption.
- **2FA / MFA Support**: Secure two-factor authentication login.
- **Cross-Device Sync**: Keep your library, progress, custom attributes, and settings in sync across all your devices.

### 🔎 Search, Filter & Sort

- **Instant Search**: Search by song title, artist, or filename.
- **Multi-Filter**: Filter by file type (`PDF`, `Guitar Pro`, `Text`), learning status, tuning, or capo position.
- **Sorting Options**:
  - Alphabetical (A–Z / Z–A)
  - Practice Time (Most time practiced)
  - Most Played (Times opened)
  - Recently Accessed
  - Date Added / Created

---

## 🛠️ Technology Stack

- **Framework**: [Electron](https://www.electronjs.org/) + [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Music Score & Sound Engine**: [@coderline/alphatab](https://alphatab.net/)
- **PDF Engine**: [pdfjs-dist](https://mozilla.github.io/pdf.js/)
- **Cloud Storage**: [megajs](https://github.com/tonistiigi/megajs) + Web MEGA Service
- **Icons**: [Lucide React](https://lucide.dev/)
- **PWA & Offline**: Custom Service Worker + Web App Manifest + Screen Wake Lock API

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v18.0.0` or newer (LTS recommended)
- **npm**: `v9.0.0` or newer

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/GuitarCompanion.git
cd GuitarCompanion

# Install dependencies
npm install
```

### Running Locally

```bash
# Start development server (Desktop Electron & Web renderer)
npm run dev
```

### Quality & Diagnostics

```bash
# Run TypeScript compilation check
npm run typecheck

# Run ESLint validation
npm run lint

# Format codebase with Prettier
npm run format
```

### Packaging & Builds

```bash
# Build for Windows installer / portable executable
npm run build:win

# Build for macOS (.dmg / .zip)
npm run build:mac

# Build for Linux (.AppImage / .deb)
npm run build:linux

# Build static PWA web app bundle
npm run build:web
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
