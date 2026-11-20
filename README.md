# Auto Bin 4x — Smart Waste Segregation Monitor

Real-time **Web Serial API** monitoring dashboard and dual-servo **Arduino Uno** telemetry firmware for the **Auto Bin 4x** smart waste sorting project.

## Features

- **Live USB Serial Telemetry (9600 baud)**: Connects directly from Google Chrome or Microsoft Edge over HTTPS / `localhost` using the Web Serial API.
- **Dual-Servo Animated Visualizer**: Tracks **Servo 1 (Wet/Dry · Pin D9)** and **Servo 2 (Metal/Dry · Pin D10)** with live HC-SR04 ultrasonic distance and LM393 moisture readouts.
- **Chamber Counters & Activity Log**: Real-time counts for **Metal**, **Dry**, **Wet**, and optional **Sanitary** waste, filterable event history, and CSV export.
- **Raw Serial Monitor & TX Commands**: Live RX/TX debug terminal supporting `PING`, `TEST_METAL`, `TEST_DRY`, `TEST_WET`, `HOME`, and `RESET`.
- **Demo / Simulation Mode**: Test the entire sorting sequence in the browser before plugging in hardware.

---

## Hardware Wiring (Arduino Uno)

| Component | Pin | Notes |
| :--- | :--- | :--- |
| HC-SR04 Trig / Echo | `D6` / `D7` | Object trigger within `<= 10 cm` |
| LM393 Moisture DO / AO | `D4` / `A0` | Digital (`LOW` = wet) + Analog (`0–1023`) |
| Metal Touch Sensor | `D2` | Active `HIGH` after 2s dry settle |
| Servo 1 (Wet / Dry) | `D9` | `30°` Wet · `90°` Home · `120°` Dry Pass |
| Servo 2 (Metal / Dry) | `D10` | `30°` Dry · `90°` Home · `150°` Metal |
| Servo Power (`VCC` / `GND`) | External `5V–6V (2A–3A)` | Tie external `GND` to Arduino `GND` |

Open `arduino/AutoBin4x_Telemetry/AutoBin4x_Telemetry.ino` in Arduino IDE and upload it to your Arduino Uno.

---

## Publish to GitHub Pages

This repository includes `.github/workflows/deploy.yml` and relative asset paths (`base: './'` in `vite.config.ts`) so it deploys automatically to **GitHub Pages** over HTTPS (required for Web Serial API).

1. **Create a new repository on GitHub** (e.g., `auto-bin-4x`).
2. **Push this project** to `main`:
   ```bash
   git init
   git add .
   git commit -m "Initial Auto Bin 4x dashboard"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/auto-bin-4x.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Open your repository on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment → Source**, select **GitHub Actions**.
4. Wait ~1 minute for the **Deploy Auto Bin 4x to GitHub Pages** workflow to finish, then open your live site at:
   `https://<YOUR_USERNAME>.github.io/auto-bin-4x/`

---

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome or Edge. Remember to **close the Arduino IDE Serial Monitor** before clicking **Connect Arduino** so the COM port is unlocked.
