import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Cable, CheckCircle2, Usb, Wrench } from 'lucide-react';

export const SetupGuideView: React.FC = () => {
  const wiringConnections = [
    {
      module: 'HC-SR04 Ultrasonic Sensor',
      pins: [
        { from: 'VCC', to: 'Arduino 5V', color: 'text-rose-400' },
        { from: 'GND', to: 'Arduino GND', color: 'text-slate-400' },
        { from: 'TRIG', to: 'Digital Pin D6', color: 'text-sky-400' },
        { from: 'ECHO', to: 'Digital Pin D7', color: 'text-sky-400' },
      ],
      note: 'Detects incoming waste within 10 cm.',
    },
    {
      module: 'LM393 Moisture / Rain Sensor',
      pins: [
        { from: 'VCC', to: 'Arduino 5V', color: 'text-rose-400' },
        { from: 'GND', to: 'Arduino GND', color: 'text-slate-400' },
        { from: 'DO (Digital)', to: 'Digital Pin D4', color: 'text-emerald-400' },
        { from: 'AO (Analog)', to: 'Analog Pin A0', color: 'text-emerald-400' },
      ],
      note: 'Checks if item is wet (DO LOW = wet by default).',
    },
    {
      module: 'Metal Touch / Proximity Sensor',
      pins: [
        { from: 'VCC / +', to: 'Arduino 5V', color: 'text-rose-400' },
        { from: 'GND / -', to: 'Arduino GND', color: 'text-slate-400' },
        { from: 'SIG / OUT', to: 'Digital Pin D2', color: 'text-amber-400' },
      ],
      note: 'Polled after 2s settle delay when object is dry.',
    },
    {
      module: 'Servo 1 · Wet / Dry Diverter',
      pins: [
        { from: 'Signal (Orange/Yellow)', to: 'Digital Pin D9 (PWM)', color: 'text-sky-400' },
        { from: 'VCC (Red)', to: 'External 5V–6V (2A–3A) Supply', color: 'text-rose-400' },
        { from: 'GND (Brown/Black)', to: 'External Supply GND + Arduino GND', color: 'text-slate-400' },
      ],
      note: '30° = Wet Chamber · 90° = Home · 120° = Pass Dry to Stage 2.',
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
  ];

  const steps = [
    {
      num: '01.',
      title: 'Verify Dual-Servo Wiring & External Power',
      body: 'Confirm HC-SR04 (Trig D6, Echo D7), LM393 Moisture (DO D4, AO A0), Metal Sensor (D2), Servo 1 Wet/Dry (D9), and Servo 2 Metal/Dry (D10). Power both servos from an external 5V–6V (2A–3A) supply and tie its GND to Arduino Uno GND so the board never browns out.',
    },
    {
      num: '02.',
      title: 'Upload Firmware via Arduino IDE',
      body: 'Open AutoBin4x_Telemetry.ino in Arduino IDE, select Board: Arduino Uno and your USB COM/tty port, and click Upload.',
    },
    {
      num: '03.',
      title: 'Close the Arduino IDE Serial Monitor',
      body: 'Operating systems allow only one program to hold a serial port open at a time. Before connecting from your browser, close the Arduino IDE Serial Monitor and Serial Plotter completely so the COM port is unlocked.',
    },
    {
      num: '04.',
      title: 'Connect via Web Serial in Chrome or Edge',
      body: 'Use Google Chrome, Microsoft Edge, or Opera on desktop. Keep baud rate at 9600 (matching Serial.begin(9600)), click Connect Arduino, and pick your Arduino Uno / USB-Serial port from the browser prompt.',
    },
  ];

  const troubleshootingItems = [
    {
      issue: '"Failed to open serial port" or port missing',
      cause: 'Arduino IDE Serial Monitor, another browser tab, or a Python/Node script is locking the COM port.',
      fix: 'Close Arduino IDE Serial Monitor, unplug/replug the USB cable, and click Connect Arduino again.',
    },
    {
      issue: 'Garbled characters in Raw Serial Monitor',
      cause: 'Baud rate mismatch between the sketch and the browser selector.',
      fix: 'Ensure the baud dropdown is set to 9600 to match Serial.begin(9600) in your sketch.',
    },
    {
      issue: 'Arduino disconnects when either servo moves',
      cause: 'Dual servo current spikes pull USB 5V low and reset the Uno.',
      fix: 'Power both servos from an external 5V 2A–3A adapter/battery pack with shared common GND.',
    },
    {
      issue: 'Wet / Metal categories trigger backwards',
      cause: 'Sensor module polarity differs (some LM393 or touch sensors are active-HIGH vs active-LOW).',
      fix: 'Flip WET_ACTIVE_STATE or METAL_ACTIVE_STATE between HIGH and LOW at the top of your sketch.',
    },
    {
      issue: 'Web Serial API blocked inside embedded iframe',
      cause: 'Browser security policies can restrict navigator.serial inside third-party preview iframes.',
      fix: 'Open the app directly in its own Chrome/Edge tab, or download the Standalone Single-File HTML from the Arduino Sketch tab.',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* Visual Wiring Schematic & Pinout */}
      <section className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <Cable className="w-4 h-4 text-sky-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">
            Dual-Servo Arduino Uno Wiring Schematic
          </h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-300 max-w-2xl">
          Exact hardware connections matching <code className="font-mono text-xs text-sky-300">AutoBin4x_Telemetry.ino</code>.
          Servo 1 (<code className="font-mono text-xs text-sky-300">D9</code>) handles Wet/Dry and Servo 2 (<code className="font-mono text-xs text-amber-300">D10</code>) handles Metal/Dry. Tie all grounds together.
        </p>

        {/* Schematic SVG */}
        <div className="mt-5 bg-[#050811] border border-slate-800 rounded-lg p-4 overflow-x-auto">
          <svg
            viewBox="0 0 820 340"
            className="w-full min-w-[680px] h-auto"
            role="img"
            aria-label="Dual-servo Arduino Uno wiring diagram for HC-SR04, LM393, Metal Sensor, Servo 1 D9, and Servo 2 D10"
          >
            {/* Arduino Uno Center Block */}
            <rect
              x="315"
              y="35"
              width="190"
              height="270"
              rx="10"
              fill="#0F172A"
              stroke="#38BDF8"
              strokeWidth="1.5"
            />
            <text x="410" y="62" textAnchor="middle" className="fill-white text-[13px] font-bold font-mono">
              ARDUINO UNO
            </text>
            <text x="410" y="78" textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
              USB Serial · 9600 baud
            </text>

            {/* Left Pins on Uno */}
            {[
              { y: 110, label: 'D6 (TRIG)' },
              { y: 136, label: 'D7 (ECHO)' },
              { y: 184, label: 'D4 (LM393 DO)' },
              { y: 210, label: 'A0 (LM393 AO)' },
              { y: 256, label: '5V / GND' },
            ].map((p) => (
              <g key={p.label}>
                <circle cx="315" cy={p.y} r="4" fill="#38BDF8" />
                <text x="326" y={p.y + 4} className="fill-slate-200 text-[10px] font-mono">
                  {p.label}
                </text>
              </g>
            ))}

            {/* Right Pins on Uno */}
            {[
              { y: 105, label: 'D2 (METAL)' },
              { y: 175, label: 'D9 (SERVO 1)' },
              { y: 205, label: 'D10 (SERVO 2)' },
              { y: 245, label: 'GND (COMMON)' },
            ].map((p) => (
              <g key={p.label}>
                <circle cx="505" cy={p.y} r="4" fill="#38BDF8" />
                <text x="494" y={p.y + 4} textAnchor="end" className="fill-slate-200 text-[10px] font-mono">
                  {p.label}
                </text>
              </g>
            ))}

            {/* Left Module 1: HC-SR04 */}
            <rect x="24" y="55" width="180" height="96" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="38" y="78" className="fill-sky-400 text-[11px] font-bold font-mono">
              HC-SR04 ULTRASONIC
            </text>
            <text x="38" y="96" className="fill-slate-400 text-[10px] font-mono">
              VCC → 5V · GND → GND
            </text>
            <text x="38" y="114" className="fill-slate-200 text-[10px] font-mono">
              TRIG → D6
            </text>
            <text x="38" y="132" className="fill-slate-200 text-[10px] font-mono">
              ECHO → D7
            </text>
            <path d="M 204 110 L 311 110" stroke="#38BDF8" strokeWidth="1.75" fill="none" />
            <path d="M 204 136 L 311 136" stroke="#38BDF8" strokeWidth="1.75" fill="none" />

            {/* Left Module 2: LM393 */}
            <rect x="24" y="170" width="180" height="96" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="38" y="193" className="fill-emerald-400 text-[11px] font-bold font-mono">
              LM393 MOISTURE
            </text>
            <text x="38" y="211" className="fill-slate-400 text-[10px] font-mono">
              VCC → 5V · GND → GND
            </text>
            <text x="38" y="229" className="fill-slate-200 text-[10px] font-mono">
              DO → D4 · AO → A0
            </text>
            <text x="38" y="247" className="fill-slate-400 text-[10px] font-mono">
              Active LOW = Wet
            </text>
            <path d="M 204 184 L 311 184" stroke="#34D399" strokeWidth="1.75" fill="none" />
            <path d="M 204 210 L 311 210" stroke="#34D399" strokeWidth="1.75" fill="none" />

            {/* Right Module 1: Metal Sensor */}
            <rect x="616" y="45" width="180" height="82" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="630" y="68" className="fill-amber-400 text-[11px] font-bold font-mono">
              METAL TOUCH SENSOR
            </text>
            <text x="630" y="86" className="fill-slate-400 text-[10px] font-mono">
              VCC → 5V · GND → GND
            </text>
            <text x="630" y="104" className="fill-slate-200 text-[10px] font-mono">
              SIG → D2 (Active HIGH)
            </text>
            <path d="M 509 105 L 616 105" stroke="#FBBF24" strokeWidth="1.75" fill="none" />

            {/* Right Module 2: Dual Servos + External Power */}
            <rect x="616" y="148" width="180" height="152" rx="8" fill="#0B1120" stroke="#334155" />
            <text x="630" y="170" className="fill-sky-400 text-[11px] font-bold font-mono">
              DUAL SERVOS (S1 & S2)
            </text>
            <text x="630" y="188" className="fill-slate-200 text-[10px] font-mono">
              S1 Wet/Dry PWM → D9
            </text>
            <text x="630" y="206" className="fill-amber-300 text-[10px] font-mono">
              S2 Metal/Dry PWM → D10
            </text>
            <text x="630" y="226" className="fill-rose-400 text-[10px] font-mono">
              VCC (Both) → Ext 5V–6V
            </text>
            <text x="630" y="244" className="fill-slate-300 text-[10px] font-mono">
              GND → Ext GND + Uno GND
            </text>
            <text x="630" y="266" className="fill-slate-400 text-[9px] font-mono">
              S1: 30° Wet · 120° Dry Pass
            </text>
            <text x="630" y="280" className="fill-slate-400 text-[9px] font-mono">
              S2: 30° Dry · 150° Metal
            </text>
            <path d="M 509 175 L 616 175" stroke="#38BDF8" strokeWidth="1.75" fill="none" />
            <path d="M 509 205 L 616 205" stroke="#FBBF24" strokeWidth="1.75" fill="none" />
            <path
              d="M 509 245 L 616 245"
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              fill="none"
            />
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
              <p className="mt-2.5 text-xs text-slate-400">{block.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Step-by-step setup */}
      <section className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <Usb className="w-4 h-4 text-sky-400" />
          <h2 className="text-lg font-bold text-white tracking-tight">
            Upload & Browser Connection Steps
          </h2>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
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

        <div className="mt-5 flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Important Port Lock Reminder:</span>{' '}
            Always close the Arduino IDE Serial Monitor before clicking{' '}
            <span className="font-semibold text-white">Connect Arduino</span>. If Arduino IDE has
            the COM port open, Web Serial cannot claim the port.
          </div>
        </div>
      </section>

      {/* Troubleshooting Table */}
      <section className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-sky-400" />
          <h2 className="text-base font-semibold text-white">
            Troubleshooting Common Issues
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
