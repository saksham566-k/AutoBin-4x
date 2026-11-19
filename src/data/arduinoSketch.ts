export const ARDUINO_SKETCH_FILENAME = 'AutoBin4x_Telemetry.ino';

export const ARDUINO_SKETCH_CODE = `/*
 * Auto Bin 4x — Smart Waste Segregation Telemetry Firmware
 * Compatible with Arduino Uno + Web Serial Live Dashboard (9600 baud)
 *
 * Upgraded from your original sensor & servo sketch:
 * - Preserves all original pins, timings, and active states
 * - Emits structured EVENT:<CATEGORY>|DIST:<cm>|DO:<0/1>|AO:<0-1023>|ANGLE:<deg>
 * - Supports interactive serial test commands from the web dashboard:
 *     PING | HOME | TEST_WET | TEST_METAL | TEST_DRY | TEST_SANITARY | DEMO_ON | DEMO_OFF
 */

#include <Servo.h>

// --- Pin Definitions (Matches Your Wiring) ---
const int TRIG_PIN       = 6;   // HC-SR04 Trig
const int ECHO_PIN       = 7;   // HC-SR04 Echo
const int LM393_DO_PIN   = 4;   // LM393 digital output for wet/dry check
const int LM393_AO_PIN   = A0;  // LM393 analog output (0 - 1023)
const int METAL_PIN      = 2;   // Metal touch sensor signal pin
const int SERVO_PIN      = 9;   // MG996R servo signal pin

// Optional 4th chamber input (e.g. IR / push switch for Sanitary chute)
const bool ENABLE_4WAY_SANITARY = false;
const int SANITARY_PIN          = 5;
const int SANITARY_ACTIVE_STATE = LOW;

// --- Distance & Timing Settings ---
const int TARGET_DISTANCE_CM       = 10;    // Trigger when object is within ~10 cm
const unsigned long METAL_WAIT_MS  = 2000;  // Wait 2 seconds before checking metal
const unsigned long MOVE_HOLD_MS   = 1500;  // Hold servo in target position
const unsigned long COOLDOWN_MS    = 1000;  // Pause before next scan

// --- Active States (Flip HIGH/LOW to match your sensors) ---
const int WET_ACTIVE_STATE   = LOW;   // Many LM393 modules pull DO LOW when wet
const int METAL_ACTIVE_STATE = HIGH;  // Change to LOW if your touch sensor is active-LOW

// --- Servo Angles (Adjust to match your mechanical setup) ---
const int ANGLE_HOME      = 90;   // Neutral / center position
const int ANGLE_WET       = 30;   // Chamber 1: Wet waste
const int ANGLE_SANITARY  = 60;   // Chamber 4: Optional Sanitary waste
const int ANGLE_NON_METAL = 120;  // Chamber 3: Dry (Not Wet + No Metal)
const int ANGLE_METAL     = 150;  // Chamber 2: Metal (Not Wet + Metal)

Servo sorterServo;
bool serialDemoMode = false;
unsigned long lastDemoTickMs = 0;
int demoStep = 0;

int readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30 ms timeout
  if (duration == 0) {
    return -1;
  }
  return (int)((duration * 0.0343) / 2.0);
}

void segregateAndReport(const char* eventKey, int targetAngle, int distCm, int doVal, int aoVal) {
  // Structured telemetry packet read by the Web Serial dashboard
  Serial.print(F("EVENT:"));
  Serial.print(eventKey);
  Serial.print(F("|DIST:"));
  Serial.print(distCm);
  Serial.print(F("|DO:"));
  Serial.print(doVal);
  Serial.print(F("|AO:"));
  Serial.print(aoVal);
  Serial.print(F("|ANGLE:"));
  Serial.println(targetAngle);

  sorterServo.write(targetAngle);
  delay(MOVE_HOLD_MS);

  sorterServo.write(ANGLE_HOME);
  Serial.print(F("SERVO:HOME:"));
  Serial.println(ANGLE_HOME);
}

void checkSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\\n');
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  if (cmd == "PING") {
    Serial.println(F("ACK:PONG|AUTO_BIN_4X"));
  } else if (cmd == "HOME") {
    sorterServo.write(ANGLE_HOME);
    Serial.print(F("SERVO:HOME:"));
    Serial.println(ANGLE_HOME);
  } else if (cmd == "TEST_WET") {
    segregateAndReport("WET", ANGLE_WET, 6, WET_ACTIVE_STATE, 290);
  } else if (cmd == "TEST_METAL") {
    segregateAndReport("METAL", ANGLE_METAL, 5, !WET_ACTIVE_STATE, 860);
  } else if (cmd == "TEST_DRY") {
    segregateAndReport("DRY", ANGLE_NON_METAL, 7, !WET_ACTIVE_STATE, 910);
  } else if (cmd == "TEST_SANITARY") {
    segregateAndReport("SANITARY", ANGLE_SANITARY, 6, !WET_ACTIVE_STATE, 780);
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

void runSerialDemoTick() {
  if (!serialDemoMode) return;
  if (millis() - lastDemoTickMs < 4000) return;
  lastDemoTickMs = millis();

  if (demoStep == 0) {
    segregateAndReport("METAL", ANGLE_METAL, 5, !WET_ACTIVE_STATE, 880);
  } else if (demoStep == 1) {
    segregateAndReport("DRY", ANGLE_NON_METAL, 7, !WET_ACTIVE_STATE, 920);
  } else if (demoStep == 2) {
    segregateAndReport("WET", ANGLE_WET, 6, WET_ACTIVE_STATE, 305);
  } else {
    segregateAndReport("SANITARY", ANGLE_SANITARY, 6, !WET_ACTIVE_STATE, 790);
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

  sorterServo.attach(SERVO_PIN);
  sorterServo.write(ANGLE_HOME);
  delay(500);

  Serial.println(F("System ready. Waiting for object within 10 cm..."));
}

void loop() {
  checkSerialCommands();
  runSerialDemoTick();

  int distance = readDistanceCm();

  if (distance > 0 && distance <= TARGET_DISTANCE_CM) {
    Serial.print(F("SENSOR:DIST="));
    Serial.println(distance);

    delay(300); // Brief settle time near sensor

    int doReading = digitalRead(LM393_DO_PIN);
    int analogReading = analogRead(LM393_AO_PIN);
    bool isWet = (doReading == WET_ACTIVE_STATE);

    Serial.print(F("LM393 DO: "));
    Serial.print(doReading);
    Serial.print(F(" | AO: "));
    Serial.println(analogReading);

    if (ENABLE_4WAY_SANITARY && digitalRead(SANITARY_PIN) == SANITARY_ACTIVE_STATE) {
      segregateAndReport("SANITARY", ANGLE_SANITARY, distance, doReading, analogReading);
    } else if (isWet) {
      segregateAndReport("WET", ANGLE_WET, distance, doReading, analogReading);
    } else {
      Serial.println(F("Not wet. Waiting before metal check..."));
      delay(METAL_WAIT_MS);

      bool isMetal = (digitalRead(METAL_PIN) == METAL_ACTIVE_STATE);
      if (isMetal) {
        segregateAndReport("METAL", ANGLE_METAL, distance, doReading, analogReading);
      } else {
        segregateAndReport("DRY", ANGLE_NON_METAL, distance, doReading, analogReading);
      }
    }

    delay(COOLDOWN_MS);
    Serial.println(F("Ready for next object..."));
  }

  delay(100);
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
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --metal: #d97706;
      --dry: #059669;
      --wet: #0284c7;
      --sanitary: #7c3aed;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
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
    h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .sub { font-size: 13px; color: var(--muted); }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    select, button, input {
      font: inherit;
      font-size: 13px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      padding: 8px 14px;
      cursor: pointer;
    }
    button.primary {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      font-weight: 600;
    }
    button.primary:hover { background: #1e293b; }
    button.active {
      background: #e0f2fe;
      border-color: #7dd3fc;
      color: #0369a1;
      font-weight: 600;
    }
    .status-line {
      font-size: 13px;
      color: var(--muted);
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
    }
    .card-title { font-size: 13px; font-weight: 600; color: var(--muted); }
    .card-count {
      font-size: 36px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
      margin: 6px 0 4px;
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
    .panel-head h2 { font-size: 15px; font-weight: 600; }
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
      border-bottom: 1px solid #f1f5f9;
    }
    .console {
      background: #0f172a;
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
    .tx-bar input { flex: 1; cursor: text; font-family: monospace; }
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
      <button type="button" onclick="simulateEvent('METAL')">+ Simulate Metal (150°)</button>
      <button type="button" onclick="simulateEvent('DRY')">+ Simulate Dry (120°)</button>
      <button type="button" onclick="simulateEvent('WET')">+ Simulate Wet (30°)</button>
      <button type="button" onclick="simulateEvent('SANITARY')">+ Simulate Sanitary (60°)</button>
    </div>

    <div class="summary">
      <div class="card">
        <div class="card-title">Total Items Segregated</div>
        <div class="card-count" id="totalCount">0</div>
        <div class="card-meta" id="lastCategoryMeta">Last detected: None</div>
      </div>
      <div class="card">
        <div class="card-title">Ultrasonic / Moisture Sensor</div>
        <div class="card-count" id="sensorReadout" style="font-size:24px">-- cm</div>
        <div class="card-meta" id="moistureMeta">LM393 AO: -- · Servo: 90°</div>
      </div>
    </div>

    <div class="grid-4">
      <div class="card">
        <div class="card-title" style="color:var(--metal)">Metal Segregated</div>
        <div class="card-count" id="countMETAL">0</div>
        <div class="card-meta">Servo target: 150° · Metal Chamber</div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--dry)">Dry Segregated</div>
        <div class="card-count" id="countDRY">0</div>
        <div class="card-meta">Servo target: 120° · Dry Chamber</div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--wet)">Wet Segregated</div>
        <div class="card-count" id="countWET">0</div>
        <div class="card-meta">Servo target: 30° · Wet Chamber</div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--sanitary)">Sanitary Segregated</div>
        <div class="card-count" id="countSANITARY">0</div>
        <div class="card-meta">Servo target: 60° · Sanitary Chamber</div>
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
    let lastAngle = 90;

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
        'LM393 AO: ' + (lastAo !== null ? lastAo : '--') + ' · Servo: ' + lastAngle + '°';
    }

    function recordEvent(category, angle, sourceLabel) {
      counts[category]++;
      lastAngle = angle;
      const entry = {
        time: nowTime(),
        category,
        angle,
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
        '<div><strong>1 ' + e.category + ' item detected & segregated</strong> &rarr; ' + chamberMap[e.category] + ' (' + e.angle + '°)</div>' +
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
        const anglePart = parts.find(p => p.toUpperCase().startsWith('ANGLE:'));
        const angle = anglePart ? parseInt(anglePart.split(':')[1], 10) : 90;
        if (counts[ev] !== undefined) recordEvent(ev, angle, 'Arduino');
        return;
      }

      if (/Action:\\s*WET/i.test(line)) {
        recordEvent('WET', 30, 'Arduino');
      } else if (/Action:\\s*NOT WET \\+ METAL/i.test(line)) {
        recordEvent('METAL', 150, 'Arduino');
      } else if (/Action:\\s*NOT WET \\+ NO METAL/i.test(line)) {
        recordEvent('DRY', 120, 'Arduino');
      } else if (/Returning servo to Home/i.test(line) || /SERVO:HOME/i.test(line)) {
        lastAngle = 90;
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
      const angles = { METAL: 150, DRY: 120, WET: 30, SANITARY: 60 };
      lastDist = 4 + Math.floor(Math.random() * 5);
      lastAo = cat === 'WET' ? 280 + Math.floor(Math.random() * 90) : 820 + Math.floor(Math.random() * 140);
      const line = 'EVENT:' + cat + '|DIST:' + lastDist + '|DO:' + (cat === 'WET' ? 0 : 1) + '|AO:' + lastAo + '|ANGLE:' + angles[cat];
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
        statusLine.textContent = 'Status: Demo Stream Active (simulated Arduino events)';
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
      const rows = ['Time,Category,ServoAngle,DistanceCm,MoistureAO,Source',
        ...events.map(e => [e.time, e.category, e.angle, e.dist ?? '', e.ao ?? '', e.source].join(','))
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
