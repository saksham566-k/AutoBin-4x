/*
 * Auto Bin 4x — Dual-Servo Smart Waste Segregation Telemetry Firmware
 * Compatible with Arduino Uno + Web Serial Live Dashboard (9600 baud)
 *
 * Dual-Servo Architecture:
 * - Servo 1 (Pin D9):  Wet / Dry Diverter (30 deg = Wet | 90 deg = Home | 120 deg = Dry Pass)
 * - Servo 2 (Pin D10): Metal / Dry Diverter (30 deg = Dry | 90 deg = Home | 150 deg = Metal)
 *
 * Emits structured packets:
 *   EVENT:<CATEGORY>|DIST:<cm>|DO:<0/1>|AO:<0-1023>|S1:<deg>|S2:<deg>
 * Supports interactive serial test commands:
 *   PING | HOME | TEST_WET | TEST_METAL | TEST_DRY | TEST_SANITARY | DEMO_ON | DEMO_OFF
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

// --- Distance & Timing Settings ---
const int TARGET_DISTANCE_CM       = 10;    // Trigger when object is within ~10 cm
const unsigned long METAL_WAIT_MS  = 2000;  // Wait 2 seconds before checking metal
const unsigned long MOVE_HOLD_MS   = 1500;  // Hold servo in target position
const unsigned long COOLDOWN_MS    = 1000;  // Pause before next scan

// --- Active States (Flip HIGH/LOW to match your sensors) ---
const int WET_ACTIVE_STATE   = LOW;   // Many LM393 modules pull DO LOW when wet
const int METAL_ACTIVE_STATE = HIGH;  // Change to LOW if your touch sensor is active-LOW

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

  Serial.println(F("Dual-servo system ready. Waiting for object within 10 cm..."));
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
      reportAndActuate("SANITARY", S1_SANITARY, S2_HOME, distance, doReading, analogReading);
    } else if (isWet) {
      reportAndActuate("WET", S1_WET, S2_HOME, distance, doReading, analogReading);
    } else {
      // Stage 1 passes dry item to Stage 2 metal sensor
      wetDryServo.write(S1_DRY_PASS);
      Serial.print(F("SERVO:S1="));
      Serial.println(S1_DRY_PASS);
      Serial.println(F("Not wet. Waiting before metal check..."));
      delay(METAL_WAIT_MS);

      bool isMetal = (digitalRead(METAL_PIN) == METAL_ACTIVE_STATE);
      if (isMetal) {
        reportAndActuate("METAL", S1_DRY_PASS, S2_METAL, distance, doReading, analogReading);
      } else {
        reportAndActuate("DRY", S1_DRY_PASS, S2_DRY, distance, doReading, analogReading);
      }
    }

    delay(COOLDOWN_MS);
    Serial.println(F("Ready for next object..."));
  }

  delay(100);
}
