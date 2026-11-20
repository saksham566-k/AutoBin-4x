/*
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

  String cmd = Serial.readStringUntil('\n');
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
