export const ARDUINO_SKETCH_FILENAME = 'AutoBin4x_Telemetry.ino';

export const ARDUINO_SKETCH_CODE = `/*
 * Auto Bin 4x — Dual-Servo Smart Waste Segregation Telemetry Firmware
 * Compatible with Arduino Uno + Web Serial Live Dashboard (9600 baud)
 *
 * Fixes & Upgrades:
 * 1. Ultrasonic Anti-Phantom Filter:
 *    - Ignores 0-3 cm near-field ringing/wall reflections (MIN_DISTANCE_CM = 4)
 *    - Uses 3-ping median filtering + 3 consecutive confirmations before triggering
 * 2. Latched Metal Detection ("detect once -> treat as metal"):
 *    - Continuously polls METAL_PIN every 5 ms across the entire detection & wait window
 *    - Momentary contact (>= 5 ms) permanently latches metalLatched = true for that item
 * 3. Dual-Servo Routing:
 *    - Servo 1 (Pin D9):  Wet / Dry Diverter (30 deg = Wet | 90 deg = Home | 120 deg = Dry Pass)
 *    - Servo 2 (Pin D10): Metal / Dry Diverter (30 deg = Dry | 90 deg = Home | 150 deg = Metal)
 */

#include <Servo.h>

// --- Pin Definitions ---
const int TRIG_PIN          = 6;   // HC-SR04 Trig
const int ECHO_PIN          = 7;   // HC-SR04 Echo
const int LM393_DO_PIN      = 4;   // LM393 digital output for wet/dry check
const int LM393_AO_PIN      = A0;  // LM393 analog output (0 - 1023)
const int METAL_PIN         = 2;   // Metal touch sensor signal pin
const int SERVO_WET_DRY_PIN = 9;   // Servo 1: Wet / Dry chute
const int SERVO_METAL_PIN   = 10;  // Servo 2: Metal / Non-Metal chute

// Optional 4th chamber input (e.g. IR / push switch for Sanitary chute)
const bool ENABLE_4WAY_SANITARY = false;
const int SANITARY_PIN          = 5;
const int SANITARY_ACTIVE_STATE = LOW;

// --- Distance & Anti-False-Trigger Settings ---
const int MIN_DISTANCE_CM          = 4;     // Ignore 0-3 cm phantom ringing / close reflections
const int TARGET_DISTANCE_CM       = 12;    // Trigger when object is within 4..12 cm
const int REQUIRED_CONFIRMATIONS   = 3;     // Must see object 3 cycles in a row to trigger
const unsigned long METAL_WAIT_MS  = 2000;  // Window to continuously poll & latch metal touch
const unsigned long MOVE_HOLD_MS   = 1500;  // Hold servo in target position
const unsigned long COOLDOWN_MS    = 1000;  // Pause before next scan

// --- Active States (Flip HIGH/LOW to match your sensors) ---
const int WET_ACTIVE_STATE   = LOW;   // Many LM393 modules pull DO LOW when wet
const int METAL_ACTIVE_STATE = HIGH;  // Change to LOW if your touch sensor outputs LOW when touched

// --- Servo 1 Angles (Wet / Dry Stage - Pin D9) ---
const int S1_HOME     = 90;   // Neutral / center position
const int S1_WET      = 30;   // Divert directly to Wet chamber
const int S1_SANITARY = 60;   // Optional 4-way Sanitary chute
const int S1_DRY_PASS = 120;  // Route dry waste to Stage 2 (Metal sensor)

// --- Servo 2 Angles (Metal / Dry Stage - Pin D10) ---
const int S2_HOME     = 90;   // Neutral / center position
const int S2_DRY      = 30;   // Divert non-metal to Dry chamber
const int S2_METAL    = 150;  // Divert metallic item to Metal chamber

Servo wetDryServo;
Servo metalServo;

bool serialDemoMode = false;
unsigned long lastDemoTickMs = 0;
int demoStep = 0;
int confirmCount = 0;

int readSinglePingCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000); // 25 ms timeout (~425 cm max)
  if (duration == 0) {
    return -1;
  }
  int cm = (int)((duration * 0.0343) / 2.0);
  if (cm < MIN_DISTANCE_CM || cm > 200) {
    return -1; // Reject 0-3 cm phantom spikes and out-of-range noise
  }
  return cm;
}

// Takes 3 pings and returns the median valid reading to eliminate stray 2-3 cm spikes
int readFilteredDistanceCm() {
  int readings[3];
  int validCount = 0;

  for (int i = 0; i < 3; i++) {
    int d = readSinglePingCm();
    if (d > 0) {
      readings[validCount++] = d;
    }
    delay(20);
  }

  if (validCount < 2) {
    return -1; // Require at least 2 valid echoes out of 3 pings
  }

  if (validCount == 2) {
    return (readings[0] + readings[1]) / 2;
  }

  // Sort 3 values to pick median
  for (int i = 0; i < 2; i++) {
    for (int j = i + 1; j < 3; j++) {
      if (readings[j] < readings[i]) {
        int tmp = readings[i];
        readings[i] = readings[j];
        readings[j] = tmp;
      }
    }
  }
  return readings[1];
}

void returnServosHome() {
  wetDryServo.write(S1_HOME);
  metalServo.write(S2_HOME);
  Serial.print(F("SERVO:HOME:S1="));
  Serial.print(S1_HOME);
  Serial.print(F("|S2="));
  Serial.println(S2_HOME);
}

void reportAndActuate(const char* eventKey, int s1Target, int s2Target, int distCm, int doVal, int aoVal) {
  Serial.print(F("EVENT:"));
  Serial.print(eventKey);
  Serial.print(F("|DIST:"));
  Serial.print(distCm);
  Serial.print(F("|DO:"));
  Serial.print(doVal);
  Serial.print(F("|AO:"));
  Serial.print(aoVal);
  Serial.print(F("|S1:"));
  Serial.print(s1Target);
  Serial.print(F("|S2:"));
  Serial.println(s2Target);

  wetDryServo.write(s1Target);
  metalServo.write(s2Target);
  delay(MOVE_HOLD_MS);

  returnServosHome();
}

void checkSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\\n');
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  if (cmd == "PING") {
    Serial.println(F("ACK:PONG|AUTO_BIN_4X_DUAL_SERVO"));
  } else if (cmd == "HOME") {
    returnServosHome();
  } else if (cmd == "TEST_WET") {
    reportAndActuate("WET", S1_WET, S2_HOME, 6, WET_ACTIVE_STATE, 290);
  } else if (cmd == "TEST_METAL") {
    wetDryServo.write(S1_DRY_PASS);
    Serial.print(F("SERVO:S1="));
    Serial.println(S1_DRY_PASS);
    delay(400);
    reportAndActuate("METAL", S1_DRY_PASS, S2_METAL, 5, !WET_ACTIVE_STATE, 860);
  } else if (cmd == "TEST_DRY") {
    wetDryServo.write(S1_DRY_PASS);
    Serial.print(F("SERVO:S1="));
    Serial.println(S1_DRY_PASS);
    delay(400);
    reportAndActuate("DRY", S1_DRY_PASS, S2_DRY, 7, !WET_ACTIVE_STATE, 910);
  } else if (cmd == "TEST_SANITARY") {
    reportAndActuate("SANITARY", S1_SANITARY, S2_HOME, 6, !WET_ACTIVE_STATE, 780);
  } else if (cmd == "DEMO_ON") {
    serialDemoMode = true;
    lastDemoTickMs = millis();
    Serial.println(F("INFO:DEMO_ON"));
  } else if (cmd == "DEMO_OFF") {
    serialDemoMode = false;
    Serial.println(F("INFO:DEMO_OFF"));
  } else if (cmd == "RESET") {
    Serial.println(F("ACK:RESET"));
  }
}

// Continuously polls METAL_PIN every 5 ms; latches true on even a single touch
bool pollAndLatchMetal(unsigned long windowMs, bool alreadyLatched) {
  bool metalLatched = alreadyLatched;
  unsigned long startMs = millis();

  while (millis() - startMs < windowMs) {
    checkSerialCommands();
    if (digitalRead(METAL_PIN) == METAL_ACTIVE_STATE) {
      if (!metalLatched) {
        metalLatched = true;
        Serial.println(F("INFO:METAL_LATCHED"));
      }
      // Once metal is latched, hold briefly for chute settle then sort immediately
      delay(300);
      return true;
    }
    delay(5);
  }
  return metalLatched;
}

void runSerialDemoTick() {
  if (!serialDemoMode) return;
  if (millis() - lastDemoTickMs < 4000) return;
  lastDemoTickMs = millis();

  if (demoStep == 0) {
    reportAndActuate("METAL", S1_DRY_PASS, S2_METAL, 5, !WET_ACTIVE_STATE, 880);
  } else if (demoStep == 1) {
    reportAndActuate("DRY", S1_DRY_PASS, S2_DRY, 7, !WET_ACTIVE_STATE, 920);
  } else if (demoStep == 2) {
    reportAndActuate("WET", S1_WET, S2_HOME, 6, WET_ACTIVE_STATE, 305);
  } else {
    reportAndActuate("SANITARY", S1_SANITARY, S2_HOME, 6, !WET_ACTIVE_STATE, 790);
  }
  demoStep = (demoStep + 1) % 4;
}

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LM393_DO_PIN, INPUT);
  pinMode(LM393_AO_PIN, INPUT);
  pinMode(METAL_PIN, INPUT);
  if (ENABLE_4WAY_SANITARY) {
    pinMode(SANITARY_PIN, INPUT_PULLUP);
  }

  wetDryServo.attach(SERVO_WET_DRY_PIN);
  metalServo.attach(SERVO_METAL_PIN);
  wetDryServo.write(S1_HOME);
  metalServo.write(S2_HOME);
  delay(500);

  Serial.print(F("INFO:IDLE_PINS|DO="));
  Serial.print(digitalRead(LM393_DO_PIN));
  Serial.print(F("|METAL="));
  Serial.println(digitalRead(METAL_PIN));
  Serial.println(F("Dual-servo system ready. Waiting for object within 4-12 cm..."));
}

void loop() {
  checkSerialCommands();
  runSerialDemoTick();

  int distance = readFilteredDistanceCm();

  if (distance >= MIN_DISTANCE_CM && distance <= TARGET_DISTANCE_CM) {
    confirmCount++;
  } else {
    confirmCount = 0;
  }

  if (confirmCount >= REQUIRED_CONFIRMATIONS) {
    confirmCount = 0;

    Serial.print(F("SENSOR:DIST="));
    Serial.println(distance);

    // Latch metal even during the initial 300ms settle window
    bool metalLatched = false;
    unsigned long settleStart = millis();
    while (millis() - settleStart < 300) {
      if (digitalRead(METAL_PIN) == METAL_ACTIVE_STATE) {
        metalLatched = true;
      }
      delay(5);
    }

    int doReading = digitalRead(LM393_DO_PIN);
    int analogReading = analogRead(LM393_AO_PIN);
    bool isWet = (doReading == WET_ACTIVE_STATE);

    Serial.print(F("LM393 DO: "));
    Serial.print(doReading);
    Serial.print(F(" | AO: "));
    Serial.print(analogReading);
    Serial.print(F(" | METAL_PIN: "));
    Serial.println(digitalRead(METAL_PIN));

    if (ENABLE_4WAY_SANITARY && digitalRead(SANITARY_PIN) == SANITARY_ACTIVE_STATE) {
      reportAndActuate("SANITARY", S1_SANITARY, S2_HOME, distance, doReading, analogReading);
    } else if (isWet) {
      reportAndActuate("WET", S1_WET, S2_HOME, distance, doReading, analogReading);
    } else {
      // Stage 1 passes dry item to Stage 2 metal sensor
      wetDryServo.write(S1_DRY_PASS);
      Serial.print(F("SERVO:S1="));
      Serial.println(S1_DRY_PASS);
      Serial.println(F("Not wet. Polling metal sensor (latch enabled)..."));

      // Poll continuously for 2 seconds; if touched even once, treat as METAL
      metalLatched = pollAndLatchMetal(METAL_WAIT_MS, metalLatched);

      if (metalLatched) {
        reportAndActuate("METAL", S1_DRY_PASS, S2_METAL, distance, doReading, analogReading);
      } else {
        reportAndActuate("DRY", S1_DRY_PASS, S2_DRY, distance, doReading, analogReading);
      }
    }

    delay(COOLDOWN_MS);
    Serial.println(F("Ready for next object..."));
  }

  delay(40);
}
`;

export function generateStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Bin 4x — Standalone Web Serial Dashboard</title>
  <style>
    :root {
      --bg: #060913;
      --surface: #0b1120;
      --border: #1e293b;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --metal: #fbbf24;
      --dry: #34d399;
      --wet: #38bdf8;
      --sanitary: #a78bfa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      background-image:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(56, 189, 248, 0.12), transparent 65%),
        linear-gradient(to right, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
      background-size: 100% 100%, 40px 40px, 40px 40px;
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
    }
    h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff; }
    .sub { font-size: 13px; color: var(--muted); }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    select, button, input {
      font: inherit;
      font-size: 13px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0f172a;
      color: var(--text);
      padding: 8px 14px;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }
    button:hover { background: #1e293b; border-color: #334155; }
    button:active { transform: scale(0.97); }
    button.primary {
      background: #38bdf8;
      color: #020617;
      border-color: #38bdf8;
      font-weight: 600;
    }
    button.primary:hover { background: #7dd3fc; }
    button.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.5);
      color: #7dd3fc;
      font-weight: 600;
    }
    .status-line {
      font-size: 13px;
      color: #7dd3fc;
      margin-bottom: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      transition: border-color 0.25s ease, box-shadow 0.25s ease;
    }
    .card-title { font-size: 13px; font-weight: 600; color: var(--muted); }
    .card-count {
      font-size: 36px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
      margin: 6px 0 4px;
      color: #ffffff;
    }
    .card-meta { font-size: 12px; color: var(--muted); }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .panels {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 16px;
    }
    @media (max-width: 900px) { .panels { grid-template-columns: 1fr; } }
    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 8px;
    }
    .panel-head h2 { font-size: 15px; font-weight: 600; color: #ffffff; }
    .log-list {
      max-height: 360px;
      overflow-y: auto;
      font-size: 13px;
    }
    .log-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(30, 41, 59, 0.7);
    }
    .console {
      background: #050811;
      border: 1px solid var(--border);
      color: #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      height: 310px;
      overflow-y: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    .tx-bar { display: flex; gap: 8px; margin-top: 10px; }
    .tx-bar input { flex: 1; cursor: text; font-family: monospace; background: #050811; }
    .demo-actions { display: none; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .demo-actions.visible { display: flex; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Auto Bin 4x</h1>
        <div class="sub">Smart Waste Segregation Monitor · Web Serial API</div>
      </div>
      <div class="controls">
        <select id="baudSelect" aria-label="Baud rate">
          <option value="9600" selected>9600 baud</option>
          <option value="57600">57600 baud</option>
          <option value="115200">115200 baud</option>
        </select>
        <button id="demoBtn" type="button">Demo Mode: Off</button>
        <button id="resetBtn" type="button">Reset Counters</button>
        <button id="connectBtn" class="primary" type="button">Connect Arduino</button>
      </div>
    </header>

    <div class="status-line" id="statusLine">Status: Disconnected · Ready for USB Serial (Chrome / Edge)</div>

    <div class="demo-actions" id="demoActions">
      <button type="button" onclick="simulateEvent('METAL')">+ Simulate Metal (S1 120° · S2 150°)</button>
      <button type="button" onclick="simulateEvent('DRY')">+ Simulate Dry (S1 120° · S2 30°)</button>
      <button type="button" onclick="simulateEvent('WET')">+ Simulate Wet (S1 30°)</button>
      <button type="button" onclick="simulateEvent('SANITARY')">+ Simulate Sanitary (S1 60°)</button>
    </div>

    <div class="summary">
      <div class="card">
        <div class="card-title">Total Items Segregated</div>
        <div class="card-count" id="totalCount">0</div>
        <div class="card-meta" id="lastCategoryMeta">Last detected: None</div>
      </div>
      <div class="card">
        <div class="card-title">Ultrasonic / Dual-Servo State</div>
        <div class="card-count" id="sensorReadout" style="font-size:24px">-- cm</div>
        <div class="card-meta" id="moistureMeta">AO: -- · S1: 90° · S2: 90°</div>
      </div>
    </div>

    <div class="grid-4">
      <div class="card">
        <div class="card-title" style="color:var(--metal)">Metal Segregated</div>
        <div class="card-count" id="countMETAL">0</div>
        <div class="card-meta">S1 120° · S2 150° · Metal Chamber</div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--dry)">Dry Segregated</div>
        <div class="card-count" id="countDRY">0</div>
        <div class="card-meta">S1 120° · S2 30° · Dry Chamber</div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--wet)">Wet Segregated</div>
        <div class="card-count" id="countWET">0</div>
        <div class="card-meta">S1 30° · S2 90° · Wet Chamber</div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--sanitary)">Sanitary Segregated</div>
        <div class="card-count" id="countSANITARY">0</div>
        <div class="card-meta">S1 60° · S2 90° · Sanitary Chamber</div>
      </div>
    </div>

    <div class="panels">
      <div class="card">
        <div class="panel-head">
          <h2>Live Activity & Segregation Log</h2>
          <div>
            <button type="button" onclick="exportCsv()">Export CSV</button>
            <button type="button" onclick="clearLogs()">Clear</button>
          </div>
        </div>
        <div class="log-list" id="activityLog">
          <div class="sub">Waiting for segregation events from Arduino Uno...</div>
        </div>
      </div>

      <div class="card">
        <div class="panel-head">
          <h2>Raw Serial Monitor</h2>
          <button type="button" onclick="clearConsole()">Clear Console</button>
        </div>
        <div class="console" id="serialConsole"></div>
        <div class="tx-bar">
          <input id="txInput" type="text" placeholder="Send command (e.g. PING, TEST_METAL, HOME)" />
          <button type="button" onclick="sendSerialCommand()">Send</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const counts = { METAL: 0, DRY: 0, WET: 0, SANITARY: 0 };
    const events = [];
    let port = null;
    let reader = null;
    let writer = null;
    let keepReading = false;
    let demoTimer = null;
    let lastDist = null;
    let lastAo = null;
    let lastS1 = 90;
    let lastS2 = 90;

    const connectBtn = document.getElementById('connectBtn');
    const demoBtn = document.getElementById('demoBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusLine = document.getElementById('statusLine');
    const demoActions = document.getElementById('demoActions');
    const activityLog = document.getElementById('activityLog');
    const serialConsole = document.getElementById('serialConsole');

    function nowTime() {
      return new Date().toLocaleTimeString([], { hour12: false });
    }

    function appendConsole(prefix, text) {
      const div = document.createElement('div');
      div.textContent = '[' + nowTime() + '] ' + prefix + ' ' + text;
      serialConsole.appendChild(div);
      serialConsole.scrollTop = serialConsole.scrollHeight;
    }

    function updateUi(lastCat) {
      document.getElementById('countMETAL').textContent = counts.METAL;
      document.getElementById('countDRY').textContent = counts.DRY;
      document.getElementById('countWET').textContent = counts.WET;
      document.getElementById('countSANITARY').textContent = counts.SANITARY;
      const total = counts.METAL + counts.DRY + counts.WET + counts.SANITARY;
      document.getElementById('totalCount').textContent = total;
      if (lastCat) {
        document.getElementById('lastCategoryMeta').textContent =
          'Last detected: ' + lastCat + ' at ' + nowTime();
      }
      document.getElementById('sensorReadout').textContent =
        lastDist !== null ? lastDist + ' cm' : '-- cm';
      document.getElementById('moistureMeta').textContent =
        'AO: ' + (lastAo !== null ? lastAo : '--') + ' · S1: ' + lastS1 + '° · S2: ' + lastS2 + '°';
    }

    function recordEvent(category, s1, s2, sourceLabel) {
      counts[category]++;
      lastS1 = s1;
      lastS2 = s2;
      const entry = {
        time: nowTime(),
        category,
        s1,
        s2,
        dist: lastDist,
        ao: lastAo,
        source: sourceLabel
      };
      events.unshift(entry);
      if (events.length > 200) events.pop();

      const chamberMap = {
        METAL: 'Metal Chamber',
        DRY: 'Dry Chamber',
        WET: 'Wet Chamber',
        SANITARY: 'Sanitary Chamber'
      };

      activityLog.innerHTML = events.map(e =>
        '<div class="log-row">' +
        '<div><strong>1 ' + e.category + ' item detected & segregated</strong> &rarr; ' + chamberMap[e.category] + ' (S1 ' + e.s1 + '° · S2 ' + e.s2 + '°)</div>' +
        '<div class="sub">' + e.time + '</div>' +
        '</div>'
      ).join('');

      updateUi(category);
    }

    function parseLine(raw) {
      const line = raw.trim();
      if (!line) return;
      appendConsole('RX', line);

      const distMatch = line.match(/(?:Object detected at\\s+|DIST[:=])(\\d+)/i);
      if (distMatch) lastDist = parseInt(distMatch[1], 10);

      const aoMatch = line.match(/AO[:=\\s]+(\\d+)/i);
      if (aoMatch) lastAo = parseInt(aoMatch[1], 10);

      if (line.toUpperCase().startsWith('EVENT:')) {
        const parts = line.split('|');
        const ev = parts[0].split(':')[1]?.trim().toUpperCase();
        const s1Part = parts.find(p => p.toUpperCase().startsWith('S1:'));
        const s2Part = parts.find(p => p.toUpperCase().startsWith('S2:'));
        const s1 = s1Part ? parseInt(s1Part.split(':')[1], 10) : (ev === 'WET' ? 30 : 120);
        const s2 = s2Part ? parseInt(s2Part.split(':')[1], 10) : (ev === 'METAL' ? 150 : ev === 'DRY' ? 30 : 90);
        if (counts[ev] !== undefined) recordEvent(ev, s1, s2, 'Arduino');
        return;
      }

      if (/Action:\\s*WET/i.test(line)) {
        recordEvent('WET', 30, 90, 'Arduino');
      } else if (/Action:\\s*NOT WET \\+ METAL/i.test(line)) {
        recordEvent('METAL', 120, 150, 'Arduino');
      } else if (/Action:\\s*NOT WET \\+ NO METAL/i.test(line)) {
        recordEvent('DRY', 120, 30, 'Arduino');
      } else if (/Returning servo to Home/i.test(line) || /SERVO:HOME/i.test(line)) {
        lastS1 = 90;
        lastS2 = 90;
        updateUi(null);
      }
    }

    async function connectArduino() {
      if (!('serial' in navigator)) {
        alert('Web Serial API requires Chrome, Edge, or Opera on desktop over HTTPS or localhost.');
        return;
      }
      if (port) {
        keepReading = false;
        if (reader) await reader.cancel();
        if (writer) writer.releaseLock();
        await port.close();
        port = null;
        reader = null;
        writer = null;
        connectBtn.textContent = 'Connect Arduino';
        statusLine.textContent = 'Status: Disconnected';
        return;
      }

      try {
        const baudRate = parseInt(document.getElementById('baudSelect').value, 10);
        port = await navigator.serial.requestPort();
        await port.open({ baudRate });
        keepReading = true;
        connectBtn.textContent = 'Disconnect';
        statusLine.textContent = 'Status: Connected · ' + baudRate + ' baud';
        appendConsole('SYS', 'Serial port opened at ' + baudRate + ' baud');

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        reader = textDecoder.readable.getReader();
        writer = port.writable.getWriter();

        let buffer = '';
        while (keepReading) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split(/\\r?\\n/);
          buffer = lines.pop() || '';
          lines.forEach(parseLine);
        }
      } catch (err) {
        appendConsole('ERR', err.message || String(err));
        statusLine.textContent = 'Status: Connection error — check COM port lock';
      }
    }

    async function sendSerialCommand() {
      const input = document.getElementById('txInput');
      const text = input.value.trim();
      if (!text || !writer) return;
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(text + '\\n'));
      appendConsole('TX', text);
      input.value = '';
    }

    function simulateEvent(cat) {
      const routes = {
        METAL: { s1: 120, s2: 150 },
        DRY: { s1: 120, s2: 30 },
        WET: { s1: 30, s2: 90 },
        SANITARY: { s1: 60, s2: 90 }
      };
      lastDist = 4 + Math.floor(Math.random() * 5);
      lastAo = cat === 'WET' ? 280 + Math.floor(Math.random() * 90) : 820 + Math.floor(Math.random() * 140);
      const r = routes[cat];
      const line = 'EVENT:' + cat + '|DIST:' + lastDist + '|DO:' + (cat === 'WET' ? 0 : 1) + '|AO:' + lastAo + '|S1:' + r.s1 + '|S2:' + r.s2;
      parseLine(line);
    }

    demoBtn.addEventListener('click', () => {
      if (demoTimer) {
        clearInterval(demoTimer);
        demoTimer = null;
        demoBtn.textContent = 'Demo Mode: Off';
        demoBtn.classList.remove('active');
        demoActions.classList.remove('visible');
        statusLine.textContent = port ? 'Status: Connected' : 'Status: Disconnected';
      } else {
        const cats = ['METAL', 'DRY', 'WET', 'SANITARY'];
        let i = 0;
        demoBtn.textContent = 'Demo Mode: Active';
        demoBtn.classList.add('active');
        demoActions.classList.add('visible');
        statusLine.textContent = 'Status: Demo Stream Active (simulated dual-servo events)';
        demoTimer = setInterval(() => {
          simulateEvent(cats[i % cats.length]);
          i++;
        }, 2800);
      }
    });

    resetBtn.addEventListener('click', () => {
      counts.METAL = 0; counts.DRY = 0; counts.WET = 0; counts.SANITARY = 0;
      events.length = 0;
      activityLog.innerHTML = '<div class="sub">Counters reset. Waiting for events...</div>';
      updateUi(null);
      document.getElementById('lastCategoryMeta').textContent = 'Last detected: None';
    });

    function clearLogs() {
      events.length = 0;
      activityLog.innerHTML = '<div class="sub">Log cleared.</div>';
    }

    function clearConsole() {
      serialConsole.innerHTML = '';
    }

    function exportCsv() {
      if (!events.length) return;
      const rows = ['Time,Category,Servo1Angle,Servo2Angle,DistanceCm,MoistureAO,Source',
        ...events.map(e => [e.time, e.category, e.s1, e.s2, e.dist ?? '', e.ao ?? '', e.source].join(','))
      ].join('\\n');
      const blob = new Blob([rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'auto-bin-4x-log.csv';
      a.click();
      URL.revokeObjectURL(url);
    }

    connectBtn.addEventListener('click', connectArduino);
  </script>
</body>
</html>`;
}
