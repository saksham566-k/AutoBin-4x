import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Cable, CheckCircle2, Cpu, ShieldAlert, Usb, Wrench } from 'lucide-react';

export const SetupGuideView: React.FC = () => {
  const wiringConnections = [
    {
      module: 'WitBlox AI Vision Blox (DRY / WET)',
      pins: [
        { from: 'Output 1 (DRY)', to: 'Digital Pin D4 (verify first)', color: 'text-emerald-400' },
        { from: 'Output 2 (WET)', to: 'Digital Pin D5 (verify first)', color: 'text-sky-400' },
        { from: 'Power / GND', to: 'Verify Blox datasheet & common GND', color: 'text-amber-300' },
      ],
      note: 'Phone runs WitBlox AI training/detection and drives the Blox physical outputs. Verify output voltage & polarity before wiring to Arduino D4/D5.',
    },
    {
      module: 'Two-Plate Metal Contact Sensor (A1)',
      pins: [
        { from: 'Plate A (Sensing Feed)', to: 'Arduino 5V via 1 kΩ resistor', color: 'text-rose-400' },
        { from: 'Plate B (Sense Return)', to: 'Arduino Analog Pin A1', color: 'text-amber-400' },
        { from: 'Pull-Down Resistor', to: '10 kΩ from A1 to Arduino GND', color: 'text-slate-300' },
      ],
      note: 'Pull-down keeps A1 near 0 when open and prevents floating noise; 1 kΩ limits current when metal bridges both plates.',
    },
    {
      module: 'HC-SR04 Ultrasonic Sensor',
      pins: [
        { from: 'VCC', to: 'Arduino 5V', color: 'text-rose-400' },
        { from: 'GND', to: 'Arduino GND', color: 'text-slate-400' },
        { from: 'TRIG', to: 'Digital Pin D6', color: 'text-sky-400' },
        { from: 'ECHO', to: 'Digital Pin D7', color: 'text-sky-400' },
      ],
      note: 'Detects incoming waste within 4–12 cm (3-ping median + 3-confirmation filter).',
    },
    {
      module: 'Servo 1 · Wet / Dry Diverter',
      pins: [
        { from: 'Signal (Orange/Yellow)', to: 'Digital Pin D9 (PWM)', color: 'text-sky-400' },
        { from: 'VCC (Red)', to: 'External 5V–6V (2A–3A) Supply', color: 'text-rose-400' },
        { from: 'GND (Brown/Black)', to: 'External Supply GND + Arduino GND', color: 'text-slate-400' },
      ],
      note: '30° = Wet Chamber · 90° = Home · 120° = Pass Dry/Metal to Stage 2.',
    },
    {
      module: 'Servo 2 · Metal / Dry Diverter',
      pins: [
        { from: 'Signal (Orange/Yellow)', to: 'Digital Pin D10 (PWM)', color: 'text-amber-400' },
        { from: 'VCC (Red)', to: 'External 5V–6V (2A–3A) Supply', color: 'text-rose-400' },
        { from: 'GND (Brown/Black)', to: 'External Supply GND + Arduino GND', color: 'text-slate-400' },
      ],
      note: '30° = Dry Chamber · 90° = Home · 150° = Metal Chamber.',
    },
    {
      module: 'Optional 4-Way Sanitary Input',
      pins: [
        { from: 'Signal Switch (Optional)', to: 'Digital Pin D8 (INPUT_PULLUP)', color: 'text-violet-400' },
        { from: 'Default State', to: 'ENABLE_4WAY_SANITARY = false', color: 'text-slate-400' },
      ],
      note: 'Kept disabled by default so 3-way WET / DRY / METAL sorting works without interference.',
    },
  ];

  const steps = [
    {
      num: '01.',
      title: 'Train WitBlox AI Vision on Your Phone',
      body: 'Open the WitBlox AI Vision app/training page connected to your Blox. Create exactly two classes: DRY and WET. Capture diverse lighting angles of dry packaging/paper and wet organic waste, then map DRY to Output 1 and WET to Output 2.',
    },
    {
      num: '02.',
      title: 'Verify Blox Output Voltage & Polarity First',
      body: 'Before connecting the WitBlox AI Vision Blox to Arduino D4 and D5, test Output 1 and Output 2 with a multimeter or LED/resistor while triggering DRY and WET on your phone. Confirm voltage is 5V-safe (0–5V or 3.3V-HIGH compatible) and check whether outputs are active-HIGH or active-LOW, plus whether shared GND is permitted by your Blox hardware revision.',
    },
    {
      num: '03.',
      title: 'Build the Protected Metal Plate Circuit (A1)',
      body: 'Wire Arduino 5V through a 1 kΩ current-limiting resistor to Plate A. Wire Plate B to Arduino A1, and install a 10 kΩ pull-down resistor from A1 to Arduino GND so A1 sits cleanly near 0 when no metal bridges the plates.',
    },
    {
      num: '04.',
      title: 'Calibrate Threshold & Connect via Web Serial',
      body: 'Power both servos from an external 5V–6V (2A–3A) supply with common GND (never Arduino 5V or Blox outputs). Upload AutoBin4x_Telemetry.ino, close Arduino IDE Serial Monitor, connect in Chrome/Edge at 9600 baud, and use Two-Plate Metal Calibration in the Live Monitor to verify Open vs Bridged ADC values.',
    },
  ];

  const troubleshootingItems = [
    {
      issue: 'Dashboard logs "AI Signal Error (UNKNOWN)" and servos stay at 90°',
      cause: 'Neither WitBlox output (D4 or D5) became active within the 2.5s window, or AI_DRY_ACTIVE_STATE / AI_WET_ACTIVE_STATE polarity is inverted.',
      fix: 'Check WitBlox phone recognition and test D4/D5 voltage/polarity. Flip AI_DRY_ACTIVE_STATE / AI_WET_ACTIVE_STATE between HIGH and LOW if needed. The system intentionally holds safe at 90° instead of guessing DRY.',
    },
    {
      issue: 'Dashboard logs "AI Signal Error (CONFLICT)"',
      cause: 'Both D4 (DRY) and D5 (WET) are reading active at the same time.',
      fix: 'Confirm the WitBlox Blox is not driving both outputs simultaneously, and verify D4/D5 are not shorted or floating.',
    },
    {
      issue: 'Metal A1 reads random values (300–900) when nothing touches plates',
      cause: 'Analog pin A1 is floating because the 10 kΩ pull-down resistor to GND is missing or loose.',
      fix: 'Install a 10 kΩ resistor firmly between A1 and Arduino GND, and verify A1 drops below 50 with plates open.',
    },
    {
      issue: 'Brief metallic touch fails to trigger Metal Chamber',
      cause: 'Contact bridge ADC reading stayed below METAL_ADC_THRESHOLD (default 700), or oxidized plate surface increased contact resistance.',
      fix: 'Clean the plate contact surfaces, check Live A1 ADC during a bridge using Read A1 / Capture Bridged, and apply a lower calibrated threshold (midpoint between Open and Bridged).',
    },
    {
      issue: 'Ultrasonic stays stuck at 2–3 cm or ignores objects',
      cause: 'Near-field transducer ringing within 3 cm or chute wall reflection inside 4–12 cm.',
      fix: 'Firmware filters out 0–3 cm noise via MIN_DISTANCE_CM = 4 and requires 3 consecutive valid pings in 4–12 cm. Keep chute walls clear of the sensor beam.',
    },
    {
      issue: 'Arduino resets or disconnects when Servo 1 or Servo 2 moves',
      cause: 'Servos are drawing high stall current from Arduino 5V / USB instead of an external supply.',
      fix: 'Power both servos exclusively from an external 5V–6V (2A–3A) adapter/battery pack with common GND tied to Arduino GND.',
    },
    {
      issue: '"Failed to open serial port" in Chrome / Edge',
      cause: 'Arduino IDE Serial Monitor or another tab is holding the COM port open.',
      fix: 'Close Arduino IDE Serial Monitor completely before clicking Connect Arduino.',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* Electrical Verification Safety Notice */}
      <section className="bg-amber-500/10 border border-amber-500/35 rounded-lg p-5 flex items-start gap-3 text-sm text-amber-100">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-300">
            Mandatory WitBlox Hardware Verification Before Wiring
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            WitBlox AI Vision Blox revisions differ in connector pinouts and output voltage levels.
            Do <strong>not</strong> connect WitBlox power pins blindly, do <strong>not</strong> apply
            any voltage above 5V to Arduino pins <code className="font-mono">D4</code> /{' '}
            <code className="font-mono">D5</code> / <code className="font-mono">A1</code>, only tie a
            common GND when the Blox output interface documents/permits a shared electrical reference,
            and never power servos from the Blox or Arduino 5V pin.
          </p>
        </div>
      </section>

      {/* Visual Wiring Schematic & Pinout */}
      <section className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <Cable className="w-4 h-4 text-sky-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">
            WitBlox AI + Two-Plate Metal Arduino Uno Wiring Schematic
          </h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-300 max-w-3xl">
          Hardware architecture matching <code className="font-mono text-xs text-sky-300">AutoBin4x_Telemetry.ino</code>.
          WitBlox AI Vision drives <code className="font-mono text-xs text-emerald-300">D4</code> (DRY) and{' '}
          <code className="font-mono text-xs text-sky-300">D5</code> (WET), protected metal plates feed{' '}
          <code className="font-mono text-xs text-amber-300">A1</code>, HC-SR04 triggers on{' '}
          <code className="font-mono text-xs text-sky-300">D6/D7</code>, and dual servos run on{' '}
          <code className="font-mono text-xs text-sky-300">D9/D10</code> via external power.
        </p>

        {/* Schematic SVG */}
        <div className="mt-5 bg-[#050811] border border-slate-800 rounded-lg p-4 overflow-x-auto">
          <svg
            viewBox="0 0 860 365"
            className="w-full min-w-[720px] h-auto"
            role="img"
            aria-label="Arduino Uno wiring diagram for WitBlox AI Vision D4/D5, Two-Plate Metal A1 with 1k and 10k resistors, HC-SR04 D6/D7, and Dual Servos D9/D10"
          >
            {/* Arduino Uno Center Block */}
            <rect
              x="325"
              y="35"
              width="210"
              height="295"
              rx="10"
              fill="#0F172A"
              stroke="#38BDF8"
              strokeWidth="1.5"
            />
            <text x="430" y="62" textAnchor="middle" className="fill-white text-[13px] font-bold font-mono">
              ARDUINO UNO
            </text>
            <text x="430" y="78" textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
              USB Serial · 9600 baud
            </text>

            {/* Left Pins on Uno */}
            {[
              { y: 108, label: 'D6 (TRIG)' },
              { y: 132, label: 'D7 (ECHO)' },
              { y: 185, label: 'D4 (AI DRY)' },
              { y: 211, label: 'D5 (AI WET)' },
              { y: 245, label: 'GND (VERIFY)' },
              { y: 288, label: '5V / GND' },
            ].map((p) => (
              <g key={p.label}>
                <circle cx="325" cy={p.y} r="4" fill="#38BDF8" />
                <text x="336" y={p.y + 4} className="fill-slate-200 text-[10px] font-mono">
                  {p.label}
                </text>
              </g>
            ))}

            {/* Right Pins on Uno */}
            {[
              { y: 105, label: '5V (1kΩ FEED)' },
              { y: 132, label: 'A1 (METAL + 10kΩ)' },
              { y: 160, label: 'GND (PULL-DOWN)' },
              { y: 215, label: 'D9 (SERVO 1)' },
              { y: 245, label: 'D10 (SERVO 2)' },
              { y: 285, label: 'GND (COMMON)' },
            ].map((p) => (
              <g key={p.label}>
                <circle cx="535" cy={p.y} r="4" fill="#38BDF8" />
                <text x="524" y={p.y + 4} textAnchor="end" className="fill-slate-200 text-[10px] font-mono">
                  {p.label}
                </text>
              </g>
            ))}

            {/* Left Module 1: HC-SR04 */}
            <rect x="20" y="52" width="205" height="96" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="34" y="74" className="fill-sky-400 text-[11px] font-bold font-mono">
              HC-SR04 ULTRASONIC
            </text>
            <text x="34" y="92" className="fill-slate-400 text-[10px] font-mono">
              VCC → 5V · GND → GND
            </text>
            <text x="34" y="110" className="fill-slate-200 text-[10px] font-mono">
              TRIG → D6
            </text>
            <text x="34" y="128" className="fill-slate-200 text-[10px] font-mono">
              ECHO → D7
            </text>
            <path d="M 225 108 L 321 108" stroke="#38BDF8" strokeWidth="1.75" fill="none" />
            <path d="M 225 132 L 321 132" stroke="#38BDF8" strokeWidth="1.75" fill="none" />

            {/* Left Module 2: WitBlox AI Vision Blox */}
            <rect x="20" y="164" width="205" height="140" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="34" y="186" className="fill-emerald-400 text-[11px] font-bold font-mono">
              WITBLOX AI VISION BLOX
            </text>
            <text x="34" y="202" className="fill-slate-400 text-[9.5px] font-mono">
              Phone App/Web → Blox Outputs
            </text>
            <text x="34" y="220" className="fill-emerald-300 text-[10px] font-mono">
              OUT 1 (DRY) → D4
            </text>
            <text x="34" y="238" className="fill-sky-300 text-[10px] font-mono">
              OUT 2 (WET) → D5
            </text>
            <text x="34" y="258" className="fill-amber-300 text-[9.5px] font-mono">
              GND → Verify compatibility
            </text>
            <text x="34" y="276" className="fill-slate-400 text-[9px] font-mono">
              Verify 5V logic & polarity
            </text>
            <text x="34" y="290" className="fill-slate-400 text-[9px] font-mono">
              before connecting pins
            </text>
            <path d="M 225 185 L 321 185" stroke="#34D399" strokeWidth="1.75" fill="none" />
            <path d="M 225 211 L 321 211" stroke="#38BDF8" strokeWidth="1.75" fill="none" />
            <path d="M 225 245 L 321 245" stroke="#FBBF24" strokeWidth="1.4" strokeDasharray="4 3" fill="none" />

            {/* Right Module 1: Two-Plate Metal Contact Circuit */}
            <rect x="635" y="42" width="205" height="132" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="649" y="64" className="fill-amber-400 text-[11px] font-bold font-mono">
              TWO-PLATE METAL (A1)
            </text>
            <text x="649" y="84" className="fill-rose-300 text-[10px] font-mono">
              5V → [1 kΩ] → Plate A
            </text>
            <text x="649" y="104" className="fill-amber-300 text-[10px] font-mono">
              Plate B → A1
            </text>
            <text x="649" y="124" className="fill-slate-300 text-[10px] font-mono">
              A1 → [10 kΩ] → GND
            </text>
            <text x="649" y="146" className="fill-slate-400 text-[9px] font-mono">
              Metal bridges Plate A + B
            </text>
            <text x="649" y="160" className="fill-slate-400 text-[9px] font-mono">
              Default threshold: 700 / 1023
            </text>
            <path d="M 539 105 L 635 105" stroke="#F87171" strokeWidth="1.75" fill="none" />
            <path d="M 539 132 L 635 132" stroke="#FBBF24" strokeWidth="1.75" fill="none" />
            <path d="M 539 160 L 635 160" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />

            {/* Right Module 2: Dual Servos + External Power */}
            <rect x="635" y="190" width="205" height="150" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="649" y="212" className="fill-sky-400 text-[11px] font-bold font-mono">
              DUAL SERVOS (S1 & S2)
            </text>
            <text x="649" y="232" className="fill-slate-200 text-[10px] font-mono">
              S1 Wet/Dry PWM → D9
            </text>
            <text x="649" y="250" className="fill-amber-300 text-[10px] font-mono">
              S2 Metal/Dry PWM → D10
            </text>
            <text x="649" y="270" className="fill-rose-400 text-[10px] font-mono">
              VCC (Both) → Ext 5V–6V (2–3A)
            </text>
            <text x="649" y="288" className="fill-slate-300 text-[10px] font-mono">
              GND → Ext GND + Uno GND
            </text>
            <text x="649" y="310" className="fill-slate-400 text-[9px] font-mono">
              S1: 30° Wet · 120° Dry Pass
            </text>
            <text x="649" y="324" className="fill-slate-400 text-[9px] font-mono">
              S2: 30° Dry · 150° Metal
            </text>
            <path d="M 539 215 L 635 215" stroke="#38BDF8" strokeWidth="1.75" fill="none" />
            <path d="M 539 245 L 635 245" stroke="#FBBF24" strokeWidth="1.75" fill="none" />
            <path d="M 539 285 L 635 285" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
          </svg>
        </div>

        {/* Pin-by-Pin Cards */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wiringConnections.map((block) => (
            <div key={block.module} className="border border-slate-800 rounded-lg p-4 bg-[#050811]/80">
              <div className="text-sm font-semibold text-white">{block.module}</div>
              <div className="mt-2.5 space-y-1.5">
                {block.pins.map((pin) => (
                  <div
                    key={pin.from}
                    className="flex items-center justify-between text-xs font-mono border-b border-slate-800/60 pb-1 last:border-b-0 last:pb-0 gap-2"
                  >
                    <span className="text-slate-300">{pin.from}</span>
                    <span className={`${pin.color} text-right`}>{pin.to}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-xs text-slate-400 leading-relaxed">{block.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Setup, Training & Sorting Logic */}
      <section className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] space-y-5">
        <div className="flex items-center gap-2">
          <Usb className="w-4 h-4 text-sky-400" />
          <h2 className="text-lg font-bold text-white tracking-tight">
            WitBlox AI Training, Metal Calibration & Setup
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {steps.map((step) => (
            <div
              key={step.num}
              className="border border-slate-800 rounded-lg p-5 bg-[#050811]/80"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="font-mono text-sky-400">{step.num}</span>
                <span>{step.title}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>

        {/* Exact Sorting Sequence Reference */}
        <div className="border border-slate-800 rounded-lg p-5 bg-[#050811]/80 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span>3-Stage Sorting Logic (State Machine)</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed">
            <li>
              <strong>Stage 1 — Ultrasonic Arrival (D6/D7):</strong> Confirms object within 4–12 cm
              across 3 filtered cycles and resets the cycle metal latch.
            </li>
            <li>
              <strong>Stage 2 — WitBlox AI Vision (D4/D5):</strong> Waits 250 ms settle, requires 4
              consistent AI samples within 2.5 s. If <strong>WET</strong>, Servo 1 moves to 30°
              (Servo 2 stays 90°) and skips metal detection. If <strong>UNKNOWN</strong> or{' '}
              <strong>CONFLICT</strong>, servos remain safe at 90° and log an AI Signal Error.
            </li>
            <li>
              <strong>Stage 3 — Two-Plate Metal Check (A1, only when DRY):</strong> Servo 1 moves to
              120° to pass the item onto the metal plates. A1 is polled continuously with 5-sample
              median filtering; bridging the plates once latches METAL (Servo 2 → 150°), otherwise it
              routes to DRY (Servo 2 → 30°) before returning both servos home to 90°.
            </li>
          </ol>
        </div>

        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Port Lock Reminder:</span> Always close
            the Arduino IDE Serial Monitor before clicking{' '}
            <span className="font-semibold text-white">Connect Arduino</span>, and click{' '}
            <span className="font-semibold text-white">Disconnect Serial</span> before uploading new
            firmware in Arduino IDE.
          </div>
        </div>
      </section>

      {/* Troubleshooting Table */}
      <section className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-sky-400" />
          <h2 className="text-base font-semibold text-white">
            Troubleshooting & Diagnostics
          </h2>
        </div>

        <div className="mt-4 divide-y divide-slate-800/80">
          {troubleshootingItems.map((item) => (
            <div key={item.issue} className="py-4 grid grid-cols-1 lg:grid-cols-12 gap-3 text-sm">
              <div className="lg:col-span-4 font-semibold text-slate-100">{item.issue}</div>
              <div className="lg:col-span-4 text-slate-400">
                <span className="text-xs font-medium text-slate-500 block mb-0.5">Likely Cause</span>
                {item.cause}
              </div>
              <div className="lg:col-span-4 text-slate-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-medium text-slate-500 block mb-0.5">Resolution</span>
                  {item.fix}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  );
};
