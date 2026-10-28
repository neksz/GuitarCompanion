---
name: web-debug
description: >-
  Use this skill whenever you need to visually inspect, debug, test, or iterate on the GuitarCompanion UI using the web version of the app and the Chrome DevTools MCP plugin. Explains how to start the web dev server (`npm run dev:web`) and bypass Mega authentication using the built-in dev mock service (`?mock=1`).
---

# Web UI Visual Debugging & Iteration (`web-debug`)

GuitarCompanion includes a development-only mock backend ([`MockMegaService`](../../../src/renderer/src/services/MockMegaService.ts)) wired into [`api.ts`](../../../src/renderer/src/services/api.ts) that activates when you open the web dev server with `?mock=1` (or `?mock=login` to test the login screen). This lets you inspect and interact with every screen in the app using the **Chrome DevTools MCP** plugin without needing live Mega.nz credentials.

## Step-by-Step Workflow with Chrome DevTools MCP

### 1. Ensure the Web Dev Server is Running

Check if port `5173` is already listening, or start the Vite web dev server as a background daemon (`IsDaemon: true`):

```powershell
npm run dev:web
```

The server listens at `http://localhost:5173/GuitarCompanion/`.

### 2. Open the App in Chrome DevTools MCP with `?mock=1`

Use the Chrome DevTools MCP tools (`list_pages`, `navigate_page`, or `new_page`):

- **Authenticated Library & Full App (`MockMegaService`)**:
  Navigate to `http://localhost:5173/GuitarCompanion/?mock=1`
- **Unauthenticated Login Screen (`<Login />`)**:
  Navigate to `http://localhost:5173/GuitarCompanion/?mock=login`
- **Real Mega Service (`WebMegaService`)**:
  Navigate to `http://localhost:5173/GuitarCompanion/?mock=0`

> [!NOTE]
> Visiting `?mock=1` persists `sessionStorage.setItem('gc_mock', '1')` for that browser tab, so subsequent page reloads stay in mock mode automatically.

### 3. Inspect, Interact, and Iterate

Use the Chrome DevTools MCP tools to drive and inspect the UI:

1. **Discover elements (`take_snapshot`)**: Get the accessibility/DOM tree with element `uid`s.
2. **Interact (`click`, `fill`, `hover`, `press_key`)**:
   - **FileBrowser (`My Library`)**: Default landing view at `?mock=1` with 6 mock `.gp5`, `.pdf`, and `.txt` tabs, tags, tunings, capo, and tempo badges.
   - **TabContextMenu**: Right-click a tab row or click its `More options` (`⋮`) button.
   - **GpViewer (alphaTab)**: Click `Metallica - Master of Puppets` (or any `.gp5` row) to open the interactive multi-track AlphaTex score in [`GpViewer`](../../../src/renderer/src/features/GpViewer.tsx).
   - **PdfViewer (pdfjs-dist)**: Click `Eagles - Hotel California` (or any `.pdf` row) to open the 2-page PDF in [`PdfViewer`](../../../src/renderer/src/features/PdfViewer.tsx).
   - **StatisticsPage**: Click `Statistics` in the sidebar to inspect practice streaks, Recharts bar charts, and leaderboards.
   - **MetronomeModal**: Click `Metronome` in the sidebar or press `m`.
   - **SettingsModal**: Click `Settings` in the sidebar.
3. **Visual verification (`take_screenshot`)**: Capture screenshots before/after UI changes to verify layout, alignment, overflow, and colors.
4. **CSS & runtime state (`get_css_styles`, `evaluate_script`, `list_console_messages`)**:
   - Check console warnings/errors via `list_console_messages`.
   - Inspect live mock state via `window.__DEBUG__` (`window.__DEBUG__.getMockTabs()`, `window.__DEBUG__.getMockSettings()`, `window.__DEBUG__.getMockSessions()`).
