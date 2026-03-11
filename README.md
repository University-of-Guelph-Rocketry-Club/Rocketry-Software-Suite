# Rocketry Software Suite — Ground Station

A professional, modular ground station dashboard for high-powered rocketry and High Altitude Balloon (HAB) missions, built with **Tauri 2 + React + TypeScript**.

---

## Features

| Feature | Description |
|---|---|
| **Real-Time 3D View** | Low-poly rocket with quaternion-based orientation (pitch/yaw/roll) and acceleration vectors via Three.js |
| **Dynamic Telemetry Charts** | Live-streaming charts per sensor group; adjustable time windows (15s–5min) |
| **Live Map** | GPS path tracking, auto-following marker, switchable OpenStreetMap tiles |
| **Packet Diagnostics** | Per-source: packet loss %, latency, out-of-order detection, PPS |
| **Replay Mode** | YouTube-style playback with speed (0.25×–10×), scrubber, timestamped annotations & export |
| **Schema-Based Modularity** | All sensors, sources, and checklist items defined in `src/schemas/defaultSchema.json` |
| **Multi-Source Streaming** | Simultaneous WebSocket connections from rocket, payload, and ground cameras |
| **Mission Control** | Pre-flight checklist → in-flight dashboard → recovery, with auto-telemetry validation |
| **Atmospheric Forecasting** | Open-Meteo wind aloft integration + Euler trajectory prediction |
| **No-Fly Zone Overlay** | GeoJSON airspace boundaries on all maps (FAA/NavCan compatible format) |
| **HAB Float Tracker** | Ascent rate calculation, float altitude/duration, drift prediction |

---

## Tech Stack

- **Tauri 2** — Native shell, file I/O commands, small bundle size
- **React 18 + TypeScript** — Frontend UI
- **Three.js / @react-three/fiber** — 3D rocket viewport
- **Recharts** — Telemetry charts
- **React-Leaflet** — Live map with GeoJSON overlays
- **Zustand** — Lightweight state management
- **Open-Meteo API** — Free wind data (no API key required)

---

## Quick Start

### Prerequisites

```bash
# System dependencies (Ubuntu/Debian)
sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev pkg-config

# Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### Run

```bash
# Install frontend dependencies
npm install

# Development (Vite hot-reload, no Tauri window)
npm run dev
# → open http://localhost:1420

# Full Tauri development window
npm run tauri -- dev

# Production build
npm run tauri -- build
```

---

## Configuration

All mission parameters are defined in **`src/schemas/defaultSchema.json`**:

```jsonc
{
  "sources": [                     // WebSocket telemetry endpoints
    { "id": "rocket", "wsUrl": "ws://localhost:8080", "enabled": true }
  ],
  "sensors": [                     // Fields, units, chart colors, alert thresholds
    { "key": "altitude", "label": "Altitude", "unit": "m", "chart": true }
  ],
  "checklistItems": [              // Pre-flight checklist with auto-validation criteria
    { "id": "gps_fix", "passCriteria": "gpsFix === true" }
  ]
}
```

You can load a different schema at runtime (feature-ready via Tauri file commands).

---

## WebSocket Packet Format

The ground station accepts two formats:

**Flat (simple):**
```json
{ "seq": 1234, "ts": 1741737600000, "src": "rocket", "pitch": 45.2, "latitude": 43.5448 }
```

**Envelope (nested):**
```json
{ "seq": 1234, "ts": 1741737600000, "src": "rocket", "data": { "pitch": 45.2 } }
```

---

## Demo Mode

The app launches in **demo mode** by default, feeding a simulated flight profile into the `rocket` source. To connect to real hardware, set `enabled: true` on your sources in the schema and disable the demo simulator in `src/App.tsx`:

```tsx
// Remove or comment this line in App.tsx:
useDemoSimulator('rocket', 10)
```

---

## No-Fly Zones

Edit `src/components/LiveMap/NoFlyZones.tsx` to add real FAA/NavCan airspace GeoJSON.

FAA sources:
- [FAA Digital NOTAM API](https://external-api.faa.gov/notamapi/v1/notams)
- [OpenAIP](https://www.openaip.net/)

---

## Forecasting Module

Uses [Open-Meteo](https://open-meteo.com/) — **no API key required**.

Wind layers fetched: 10m, 80m, 120m, 180m AGL. Trajectory integration uses a simplified ballistic model with atmospheric drag. For higher-accuracy predictions, replace `predictTrajectory` in `src/utils/forecasting.ts` with a GFS/NOAA model integration.

---

## Project Structure

```
src/
├── schemas/defaultSchema.json    # Mission configuration
├── store/                        # Zustand state (telemetry, replay, mission)
├── hooks/                        # useWebSocket, useReplay
├── utils/                        # Forecasting math, packet diagnostics
└── components/
    ├── RocketView3D/             # Three.js 3D viewport
    ├── TelemetryCharts/          # Recharts live charts
    ├── LiveMap/                  # Leaflet map + no-fly zones
    ├── PacketDiagnostics/        # Stream health stats
    ├── ReplayMode/               # Playback + annotations
    ├── MissionControl/           # Checklist + in-flight dashboard
    ├── ForecastingModule/        # Wind + trajectory prediction
    └── FloatTracker/             # HAB float calculations
src-tauri/
├── src/commands.rs               # File I/O commands (schema, session load/save)
└── tauri.conf.json
```

---

## License

MIT — University of Guelph Rocketry Club
