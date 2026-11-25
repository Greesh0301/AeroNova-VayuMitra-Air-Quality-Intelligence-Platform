# VayuMitra – Intelligent Air Quality Monitoring & Investigation Platform

**VayuMitra – Beyond Air Quality Monitoring** is a multi-page environmental monitoring, pollution investigation, predictive analytics, clean-air routing, and community reporting platform built with **HTML5, CSS3, Vanilla JavaScript, Chart.js, Leaflet.js, TypeScript, Node.js, Express, and an in-memory data store**.

---

## Navigation & Core Modules

Every page shares a responsive 7-section navigation system (**Home**, **Insights**, **Routes**, **Alerts**, **Reports**, **Community**, **Profile**) with a **single global Indian city search bar** in the top navigation bar.

1. **Home – Intelligent Air Dashboard (`frontend/index.html`)**
   - Unblurred animated Indian city backgrounds (Mumbai, Delhi, Bengaluru, Kolkata, Chennai, and pan-India fallback) with ambient leaf drift and time-of-day greeting.
   - Live AQI card supporting **Indian NAQI (0–500)**, **US EPA (0–500)**, and **EU EAQI** standards cleanly separated across **6 semantic AQI levels** (`Good`, `Satisfactory`, `Moderate`, `Poor`, `Very Poor`, `Severe`).
   - Displays PM2.5, PM10, NO2, SO2, CO, O3, weather telemetry (temperature, humidity, wind speed), source attribution, and update timestamps.

2. **Insights – Pollution Intelligence (`frontend/insights.html`)**
   - **Likely Pollution Sources**: Analyzes pollutant ratios (PM2.5/PM10, NO2, SO2, CO, O3), meteorology, and a **Today vs. Past Average** table.
   - **AQI Forecast & 3-Day Outlook**: Combines Open-Meteo recent context (`past_days=3`) with `forecast_days=3` predictions, uncertainty bounds, and a 3-day outlook grid.
   - **Best Outdoor Windows**: Cleanest and highest-pollution hourly windows with practical guidance.
   - **What-If Simulator**: Interactive 5-slider scenario explorer with before/after Chart.js comparison.

3. **Routes – Clean Air Routes (`frontend/routes.html`)**
   - Interactive **Leaflet.js** map comparing **2 clear route ways**: **Ordinary Route** (fastest standard path) vs. **Safe Air Route** (cleanest / hotspot-avoiding corridor) with travel time (`min`), distance (`km`), average AQI, **Nearby Hotspots**, **Incident Updates**, and **Emergency Escape Mode** (`routes.html?escape=1`).

4. **Alerts – Alerts & Precautions (`frontend/alerts.html`)**
   - Location-based pollution advisories, custom AQI/PM2.5 thresholds, 6-level AQI guide (`Good` through `Severe`), quick Escape Route jump, and nearby hotspot/incident updates.

5. **Reports – Reports (`frontend/reports.html`)**
   - Streamlined Daily, Weekly, Monthly, and custom date-range summary with optional side-by-side **Compare City**, 4 key KPIs, AQI Trend & Pollutant Averages charts, Peak Pollution Hours, Print, and CSV download.

6. **Community – Air Guardian Community (`frontend/community.html`)**
   - Color-coded category feed (`Smoke and burning`, `Construction dust`, `Industrial emissions`, `Garbage burning`, `Vehicle-related pollution`, `Other environmental issues`), Guardian impact cards, GPS support, optional photo upload (`PNG/JPG/JPEG/WEBP <= 5 MB`), filters, and status tracking.

7. **Profile – Profile & Personal Air Twin (`frontend/profile.html`)**
   - Save frequent places with daily time spent (`hours/day`), manage daily routines, view weekly exposure & location charts, log Exposure Diary entries, export CSV, and manage concise Profile, AQI Standard, Alert, Privacy, and Password settings.

---

## Backend & Environment Configuration

- The current backend is implemented in **TypeScript** and runs on **Node.js + Express**. Its API routes are defined in `server.ts`; supporting services and the in-memory data store are in `src/`.
- The frontend calls the backend through `frontend/javascript/api.js` using `/api/...` endpoints.
- The default data store is in-memory. Data stored there may reset when the server restarts.
- Zero-key external services include Open-Meteo Air Quality, Open-Meteo Weather & Forecast, Open-Meteo Geocoding, OpenStreetMap Nominatim, and OSRM routing.
- Optional environment variables are listed in `.env.example`. Copy it to `.env` only if you need to configure optional API credentials or a default city. Never commit `.env`.

## Running Locally in VS Code (Windows / macOS / Linux)

1. Install **Node.js 20 or later**.
2. Open the `VayuMitra` folder in VS Code.
3. Open the integrated terminal (`Ctrl + \``).
4. Install the backend dependencies:

   ```bash
   npm install
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open **http://localhost:3000** in your browser.

For a production build, run:

```bash
npm run build
npm start
```

The project currently contains a TypeScript/Express backend. Removing TypeScript and Node.js without first porting the backend would break the existing API-driven features, so these required backend files and dependencies are retained to preserve functionality. No Python/Flask backend was present in the supplied archive.
