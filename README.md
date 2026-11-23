# Auto Bin 4x — WitBlox AI Vision + Analog Metal Smart Waste Monitor

Real-time **Web Serial API** monitoring dashboard and state-machine **Arduino Uno** telemetry firmware for the **Auto Bin 4x** smart waste segregation system using **WitBlox AI Vision** (`DRY` / `WET`), a **two-plate analog metal contact sensor** (`A1`), an **HC-SR04 ultrasonic sensor**, and **two sorting servos**.

## Features

- **WitBlox AI Vision Integration (`D4` / `D5`)**: Phone runs WitBlox AI training/detection (`DRY` and `WET`) and drives the Blox physical hardware outputs read by Arduino Uno with stability filtering, conflict detection, and safe `UNKNOWN` / `CONFLICT` hold (never defaulting to `DRY`).
- **Protected Two-Plate Metal Sensing (`A1`)**: Uses `5V → 1 kΩ → Plate A` and `Plate B → A1` with a `10 kΩ` pull-down to `GND`, 5-sample median filtering, debounce, single-contact cycle latching, and live calibration controls in the dashboard.
- **Dual-Servo Animated Visualizer**: Tracks **Servo 1 (Wet/Dry · Pin D9)** and **Servo 2 (Metal/Dry · Pin D10)** with live HC-SR04 distance (`4–12 cm` median + 3 confirmations).
- **Chamber Counters, AI Error Tracking & CSV Export**: Real-time counts for **Metal**, **Dry**, **Wet**, and optional **Sanitary** waste, plus AI fault logs and full CSV export.
- **Raw Serial Monitor & TX Commands**: Live RX/TX console supporting `PING`, `READ_SENSORS`, `SET_METAL_THRESHOLD:<n>`, `TEST_METAL`, `TEST_DRY`, `TEST_WET`, `HOME`, and `RESET`.
- **Demo Mode & Standalone HTML Export**: Test every sorting path without hardware or download a self-contained single-file HTML dashboard.

---

## Hardware Wiring (Arduino Uno)

| Component | Arduino Uno Pin | Notes |
| :--- | :--- | :--- |
| WitBlox AI Vision `DRY` Output | `D4` | Verify Blox voltage/polarity compatibility before wiring |
| WitBlox AI Vision `WET` Output | `D5` | Verify Blox voltage/polarity compatibility before wiring |
| Two-Plate Metal Sensor | `A1` | `5V → 1 kΩ → Plate A`, `Plate B → A1`, `10 kΩ` pull-down `A1 → GND` |
| HC-SR04 `TRIG` / `ECHO` | `D6` / `D7` | 3-ping median filter, triggers in `4–12 cm` (3 confirmations) |
| Servo 1 (Wet / Dry) | `D9` | `30°` Wet · `90°` Home · `120°` Dry Pass |
| Servo 2 (Metal / Dry) | `D10` | `30°` Dry · `90°` Home · `150°` Metal |
| Optional Sanitary Input | `D8` | Disabled by default (`ENABLE_4WAY_SANITARY = false`) |
| Servo Power (`VCC` / `GND`) | External `5V–6V (2A–3A)` | Never power servos from Arduino `5V` or WitBlox pins; tie common `GND` |

Open `arduino/AutoBin4x_Telemetry/AutoBin4x_Telemetry.ino` in Arduino IDE and upload it to your Arduino Uno.

---

## Publish to GitHub Pages

This repository includes `.github/workflows/deploy.yml` so it builds and deploys automatically to **GitHub Pages** over HTTPS (required for Web Serial API).

1. Push your repository to `main`.
2. Open your repository on GitHub → **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Wait for the **Deploy Auto Bin 4x to GitHub Pages** workflow to succeed, then open:
   `https://<YOUR_USERNAME>.github.io/AutoBin-4x/`

---

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome or Edge. Remember to **close the Arduino IDE Serial Monitor** before clicking **Connect Arduino** so the COM port is unlocked.
