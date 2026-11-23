export const ARDUINO_SKETCH_FILENAME = 'AutoBin4x_Telemetry.ino';

export const ARDUINO_SKETCH_CODE = `/*
 * Auto Bin 4x — WitBlox AI Vision + Two-Plate Analog Metal Telemetry Firmware
 * Compatible with Arduino Uno + Web Serial Live Dashboard (9600 baud)
 *
 * Architecture:
 * 1. HC-SR04 Ultrasonic Sensor (D6 TRIG, D7 ECHO):
 *    - Detects object arrival within 4..12 cm (ignores 0..3 cm near-field ringing).
 *    - Uses 3-ping median filtering + 3 consecutive confirmations before starting a cycle.
 * 2. WitBlox AI Vision Blox (Phone -> WitBlox Blox -> Arduino D4/D5):
 *    - Trained with two labels: DRY and WET.
 *    - D4 (AI_DRY_PIN) = DRY signal, D5 (AI_WET_PIN) = WET signal.
 *    - IMPORTANT: Verify your exact WitBlox Blox hardware revision's output voltage
 *      (must be 5V-safe / compatible with Uno logic) and polarity before wiring!
 *    - Requires multiple consistent samples; rejects both-active (CONFLICT) and
 *      neither-active timeout (UNKNOWN) safely without defaulting to DRY.
 * 3. Two-Plate Conductive Metal Sensor (Analog A1):
 *    - Protected circuit: 5V -> 1 kOhm resistor -> Plate A | Plate B -> A1 | 10 kOhm A1 -> GND.
 *    - Uses 5-sample median filtering + debounce + cycle latch (detect once -> METAL).
 * 4. Dual-Servo Sorting Mechanism:
 *    - Servo 1 (Pin D9):  30 deg = Wet | 60 deg = Sanitary (opt.) | 90 deg = Home | 120 deg = Dry Pass
 *    - Servo 2 (Pin D10): 30 deg = Dry | 90 deg = Home | 150 deg = Metal
 *    - Power both servos from an external 5V-6V (2A-3A) supply with common GND.
 */

#include <Servo.h>

// ============================================================================
// 1. PIN DEFINITIONS
// ============================================================================
const int AI_DRY_PIN        = 4;   // WitBlox AI Vision Output 1 (DRY) — verify electrical compatibility
const int AI_WET_PIN        = 5;   // WitBlox AI Vision Output 2 (WET) — verify electrical compatibility
const int TRIG_PIN          = 6;   // HC-SR04 Trig
const int ECHO_PIN          = 7;   // HC-SR04 Echo
const int SANITARY_PIN      = 8;   // Optional 4th chamber input (disabled by default)
const int SERVO_WET_DRY_PIN = 9;   // Servo 1: Wet / Dry Pass diverter
const int SERVO_METAL_PIN   = 10;  // Servo 2: Metal / Dry diverter
const int METAL_ANALOG_PIN  = A1;  // Two-plate metal contact sensing input

// Optional 4th chamber switch (kept off by default so it never interferes with 3-way flow)
const bool ENABLE_4WAY_SANITARY = false;
const int SANITARY_ACTIVE_STATE = LOW;

// ============================================================================
// 2. SIGNAL POLARITY & CALIBRATION CONSTANTS
// ============================================================================
// Configurable WitBlox active states (starting assumption: HIGH; flip to LOW if inverted)
const int AI_DRY_ACTIVE_STATE = HIGH;
const int AI_WET_ACTIVE_STATE = HIGH;

// Two-plate metal sensing defaults (calibrate with your physical plates & resistors)
const int METAL_ADC_THRESHOLD = 700;  // Default trigger threshold (0..1023)
const int METAL_SAMPLE_COUNT  = 5;    // Median filter sample count per reading

// ============================================================================
// 3. TIMING & FILTERING CONSTANTS
// ============================================================================
const int MIN_DISTANCE_CM                    = 4;     // Ignore 0-3 cm near-field ringing
const int TARGET_DISTANCE_CM                 = 12;    // Detection range: 4..12 cm
const int REQUIRED_CONFIRMATIONS             = 3;     // Ultrasonic cycles in a row to start
const int CLEAR_CONFIRMATIONS_REQUIRED       = 3;     // Cycles clear before re-arming

const unsigned long AI_SETTLE_MS             = 250;   // Stabilization wait before sampling AI
const unsigned long AI_SAMPLE_INTERVAL_MS    = 35;    // Interval between AI pin samples
const int AI_REQUIRED_STABLE_SAMPLES         = 4;     // Consecutive matching AI samples required
const unsigned long AI_CLASSIFICATION_TIMEOUT_MS = 2500; // Timeout -> UNKNOWN / CONFLICT

const unsigned long METAL_WAIT_MS            = 2000;  // Window to monitor plates at Stage 2
const unsigned long METAL_DEBOUNCE_MS        = 15;    // Debounce hold to confirm real bridge
const unsigned long METAL_POST_LATCH_HOLD_MS = 250;   // Brief settle after metal latch
const unsigned long MOVE_HOLD_MS             = 1500;  // Hold servos in target chute position
const unsigned long COOLDOWN_MS              = 1000;  // Post-home cooldown
const unsigned long TELEMETRY_HEARTBEAT_MS   = 400;   // Live calibration/sensor stream interval

// ============================================================================
// 4. SERVO CALIBRATION ANGLES
// ============================================================================
const int S1_HOME     = 90;
const int S1_WET      = 30;
const int S1_SANITARY = 60;
const int S1_DRY_PASS = 120;

const int S2_HOME     = 90;
const int S2_DRY      = 30;
const int S2_METAL    = 150;

// ============================================================================
// 5. STATE MACHINE & RUNTIME VARIABLES
// ============================================================================
enum SystemState {
  STATE_IDLE,
  STATE_SETTLE_AI,
  STATE_CHECK_AI,
  STATE_CHECK_METAL,
  STATE_HOLD_SORT,
  STATE_COOLDOWN,
  STATE_WAIT_CLEAR
};

enum AiClass {
  AI_CLASS_NONE,
  AI_CLASS_DRY,
  AI_CLASS_WET,
  AI_CLASS_UNKNOWN,
  AI_CLASS_CONFLICT
};

Servo wetDryServo;
Servo metalServo;

SystemState currentState = STATE_IDLE;
unsigned long stateStartMs = 0;
unsigned long lastSampleMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastDemoTickMs = 0;

int activeMetalThreshold = METAL_ADC_THRESHOLD;
int confirmCount = 0;
int clearCount = 0;
int activeDistanceCm = -1;

// AI classification tracking for active cycle
AiClass lastAiCandidate = AI_CLASS_NONE;
int aiStableCount = 0;
int lastReportedDry = -1;
int lastReportedWet = -1;

// Metal plate tracking for active cycle
bool metalLatched = false;
bool metalDebouncing = false;
unsigned long metalDebounceStartMs = 0;
int peakMetalAdc = 0;
int lastReportedMetalContact = -1;

// Optional serial demo mode
bool serialDemoMode = false;
int demoStep = 0;

// ============================================================================
// 6. SENSOR FILTERING HELPERS
// ============================================================================
int readSinglePingCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000); // 25 ms timeout
  if (duration == 0) {
    return -1;
  }
  int cm = (int)((duration * 0.0343) / 2.0);
  if (cm < MIN_DISTANCE_CM || cm > 200) {
    return -1;
  }
  return cm;
}

int readFilteredDistanceCm() {
  int readings[3];
  int validCount = 0;

  for (int i = 0; i < 3; i++) {
    int d = readSinglePingCm();
    if (d > 0) {
      readings[validCount++] = d;
    }
    delay(15);
  }

  if (validCount < 2) {
    return -1;
  }
  if (validCount == 2) {
    return (readings[0] + readings[1]) / 2;
  }

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

// Reads METAL_SAMPLE_COUNT ADC samples and returns the median value (0..1023)
int readFilteredMetalAdc() {
  int samples[METAL_SAMPLE_COUNT];
  for (int i = 0; i < METAL_SAMPLE_COUNT; i++) {
    samples[i] = analogRead(METAL_ANALOG_PIN);
    delayMicroseconds(200);
  }

  for (int i = 0; i < METAL_SAMPLE_COUNT - 1; i++) {
    for (int j = i + 1; j < METAL_SAMPLE_COUNT; j++) {
      if (samples[j] < samples[i]) {
        int tmp = samples[i];
        samples[i] = samples[j];
        samples[j] = tmp;
      }
    }
  }
  return samples[METAL_SAMPLE_COUNT / 2];
}

void readAiInputs(bool &dryActive, bool &wetActive) {
  dryActive = (digitalRead(AI_DRY_PIN) == AI_DRY_ACTIVE_STATE);
  wetActive = (digitalRead(AI_WET_PIN) == AI_WET_ACTIVE_STATE);
}

AiClass evaluateAiPins(bool dryActive, bool wetActive) {
  if (dryActive && !wetActive) return AI_CLASS_DRY;
  if (wetActive && !dryActive) return AI_CLASS_WET;
  if (dryActive && wetActive) return AI_CLASS_CONFLICT;
  return AI_CLASS_UNKNOWN;
}

const char* aiClassToString(AiClass cls) {
  switch (cls) {
    case AI_CLASS_DRY:      return "DRY";
    case AI_CLASS_WET:      return "WET";
    case AI_CLASS_CONFLICT: return "CONFLICT";
    case AI_CLASS_UNKNOWN:  return "UNKNOWN";
    default:                return "NONE";
  }
}

const char* aiClassValidity(AiClass cls) {
  switch (cls) {
    case AI_CLASS_DRY:
    case AI_CLASS_WET:      return "VALID";
    case AI_CLASS_CONFLICT: return "CONFLICT";
    case AI_CLASS_UNKNOWN:  return "UNKNOWN";
    default:                return "IDLE";
  }
}

// ============================================================================
// 7. TELEMETRY & SERVO HELPERS
// ============================================================================
void returnServosHome() {
  wetDryServo.write(S1_HOME);
  metalServo.write(S2_HOME);
  Serial.print(F("SERVO:HOME:S1="));
  Serial.print(S1_HOME);
  Serial.print(F("|S2="));
  Serial.println(S2_HOME);
}

void emitAiTelemetry(bool dryActive, bool wetActive, AiClass cls) {
  Serial.print(F("AI:DRY="));
  Serial.print(dryActive ? 1 : 0);
  Serial.print(F("|WET="));
  Serial.print(wetActive ? 1 : 0);
  Serial.print(F("|CLASS="));
  Serial.print(aiClassToString(cls));
  Serial.print(F("|VALID="));
  Serial.println(aiClassValidity(cls));
}

void emitMetalTelemetry(int adcVal, bool contactNow, bool latchedNow) {
  Serial.print(F("METAL:ADC="));
  Serial.print(adcVal);
  Serial.print(F("|THR="));
  Serial.print(activeMetalThreshold);
  Serial.print(F("|CONTACT="));
  Serial.print(contactNow ? 1 : 0);
  Serial.print(F("|LATCHED="));
  Serial.println(latchedNow ? 1 : 0);
}

void emitIdleCalibrationHeartbeat() {
  bool dryActive = false;
  bool wetActive = false;
  readAiInputs(dryActive, wetActive);
  int adcVal = readFilteredMetalAdc();
  bool contactNow = (adcVal >= activeMetalThreshold);

  Serial.print(F("CAL:ADC="));
  Serial.print(adcVal);
  Serial.print(F("|THR="));
  Serial.print(activeMetalThreshold);
  Serial.print(F("|CONTACT="));
  Serial.print(contactNow ? 1 : 0);
  Serial.print(F("|LATCHED="));
  Serial.print(metalLatched ? 1 : 0);
  Serial.print(F("|AI_DRY="));
  Serial.print(dryActive ? 1 : 0);
  Serial.print(F("|AI_WET="));
  Serial.println(wetActive ? 1 : 0);
}

void emitSortEvent(
  const char* eventKey,
  int s1Target,
  int s2Target,
  int distCm,
  const char* aiLabel,
  const char* validLabel,
  int metalAdc,
  bool isMetal,
  bool isTestCommand,
  const char* errorReason
) {
  Serial.print(F("EVENT:"));
  Serial.print(eventKey);
  if (errorReason != nullptr) {
    Serial.print(F("|REASON:"));
    Serial.print(errorReason);
  }
  Serial.print(F("|DIST:"));
  Serial.print(distCm);
  Serial.print(F("|AI:"));
  Serial.print(aiLabel);
  Serial.print(F("|VALID:"));
  Serial.print(validLabel);
  Serial.print(F("|METAL_ADC:"));
  Serial.print(metalAdc);
  Serial.print(F("|METAL:"));
  Serial.print(isMetal ? 1 : 0);
  Serial.print(F("|S1:"));
  Serial.print(s1Target);
  Serial.print(F("|S2:"));
  Serial.print(s2Target);
  if (isTestCommand) {
    Serial.print(F("|SOURCE:TEST"));
  }
  Serial.println();
}

void resetCycleData() {
  metalLatched = false;
  metalDebouncing = false;
  peakMetalAdc = 0;
  lastReportedMetalContact = -1;
  lastAiCandidate = AI_CLASS_NONE;
  aiStableCount = 0;
  lastReportedDry = -1;
  lastReportedWet = -1;
}

void enterState(SystemState next) {
  currentState = next;
  stateStartMs = millis();
  lastSampleMs = 0;
}

void actuateAndHold(const char* eventKey, int s1Target, int s2Target, int distCm, const char* aiLabel, const char* validLabel, int metalAdc, bool isMetal, bool isTest) {
  emitSortEvent(eventKey, s1Target, s2Target, distCm, aiLabel, validLabel, metalAdc, isMetal, isTest, nullptr);
  wetDryServo.write(s1Target);
  metalServo.write(s2Target);
  enterState(STATE_HOLD_SORT);
}

// ============================================================================
// 8. SERIAL COMMAND HANDLER
// ============================================================================
void checkSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  String upper = cmd;
  upper.toUpperCase();

  if (upper == "PING") {
    Serial.println(F("ACK:PONG|AUTO_BIN_4X_WITBLOX_A1"));
  } else if (upper == "HOME") {
    returnServosHome();
    resetCycleData();
    enterState(STATE_IDLE);
  } else if (upper == "READ_SENSORS") {
    bool dryActive = false;
    bool wetActive = false;
    readAiInputs(dryActive, wetActive);
    emitAiTelemetry(dryActive, wetActive, evaluateAiPins(dryActive, wetActive));
    int adcVal = readFilteredMetalAdc();
    emitMetalTelemetry(adcVal, adcVal >= activeMetalThreshold, metalLatched);
  } else if (upper.startsWith("SET_METAL_THRESHOLD:")) {
    int parsed = cmd.substring(20).toInt();
    if (parsed >= 50 && parsed <= 1000) {
      activeMetalThreshold = parsed;
      Serial.print(F("ACK:THRESHOLD="));
      Serial.println(activeMetalThreshold);
      int adcVal = readFilteredMetalAdc();
      emitMetalTelemetry(adcVal, adcVal >= activeMetalThreshold, metalLatched);
    } else {
      Serial.println(F("ERR:INVALID_THRESHOLD_RANGE_50_1000"));
    }
  } else if (upper == "TEST_WET") {
    actuateAndHold("WET", S1_WET, S2_HOME, 6, "WET", "VALID", readFilteredMetalAdc(), false, true);
  } else if (upper == "TEST_DRY") {
    wetDryServo.write(S1_DRY_PASS);
    Serial.print(F("SERVO:S1="));
    Serial.print(S1_DRY_PASS);
    Serial.print(F("|S2="));
    Serial.println(S2_HOME);
    delay(350);
    actuateAndHold("DRY", S1_DRY_PASS, S2_DRY, 7, "DRY", "VALID", 80, false, true);
  } else if (upper == "TEST_METAL") {
    wetDryServo.write(S1_DRY_PASS);
    Serial.print(F("SERVO:S1="));
    Serial.print(S1_DRY_PASS);
    Serial.print(F("|S2="));
    Serial.println(S2_HOME);
    delay(350);
    actuateAndHold("METAL", S1_DRY_PASS, S2_METAL, 6, "DRY", "VALID", 920, true, true);
  } else if (upper == "TEST_SANITARY") {
    actuateAndHold("SANITARY", S1_SANITARY, S2_HOME, 6, "SANITARY", "VALID", readFilteredMetalAdc(), false, true);
  } else if (upper == "DEMO_ON") {
    serialDemoMode = true;
    lastDemoTickMs = millis();
    Serial.println(F("INFO:DEMO_ON"));
  } else if (upper == "DEMO_OFF") {
    serialDemoMode = false;
    Serial.println(F("INFO:DEMO_OFF"));
  } else if (upper == "RESET") {
    resetCycleData();
    confirmCount = 0;
    clearCount = 0;
    returnServosHome();
    enterState(STATE_IDLE);
    Serial.println(F("ACK:RESET"));
  }
}

void runSerialDemoTick() {
  if (!serialDemoMode || currentState != STATE_IDLE) return;
  if (millis() - lastDemoTickMs < 4000) return;
  lastDemoTickMs = millis();

  if (demoStep == 0) {
    actuateAndHold("METAL", S1_DRY_PASS, S2_METAL, 6, "DRY", "VALID", 910, true, false);
  } else if (demoStep == 1) {
    actuateAndHold("DRY", S1_DRY_PASS, S2_DRY, 7, "DRY", "VALID", 45, false, false);
  } else {
    actuateAndHold("WET", S1_WET, S2_HOME, 5, "WET", "VALID", 32, false, false);
  }
  demoStep = (demoStep + 1) % 3;
}

// ============================================================================
// 9. SETUP & MAIN NON-BLOCKING STATE MACHINE LOOP
// ============================================================================
void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50);

  pinMode(AI_DRY_PIN, INPUT);
  pinMode(AI_WET_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(METAL_ANALOG_PIN, INPUT);
  if (ENABLE_4WAY_SANITARY) {
    pinMode(SANITARY_PIN, INPUT_PULLUP);
  }

  wetDryServo.attach(SERVO_WET_DRY_PIN);
  metalServo.attach(SERVO_METAL_PIN);
  returnServosHome();
  delay(400);

  Serial.print(F("INFO:BOOT|AI_DRY_PIN=D"));
  Serial.print(AI_DRY_PIN);
  Serial.print(F("|AI_WET_PIN=D"));
  Serial.print(AI_WET_PIN);
  Serial.print(F("|METAL_PIN=A1|THR="));
  Serial.println(activeMetalThreshold);
  emitIdleCalibrationHeartbeat();
  Serial.println(F("STAGE:IDLE"));
  Serial.println(F("Auto Bin 4x ready (WitBlox AI + Two-Plate Metal)."));
}

void loop() {
  checkSerialCommands();
  runSerialDemoTick();

  unsigned long now = millis();

  switch (currentState) {
    case STATE_IDLE: {
      if (now - lastHeartbeatMs >= TELEMETRY_HEARTBEAT_MS) {
        lastHeartbeatMs = now;
        emitIdleCalibrationHeartbeat();
      }

      int dist = readFilteredDistanceCm();
      if (dist >= MIN_DISTANCE_CM && dist <= TARGET_DISTANCE_CM) {
        confirmCount++;
      } else {
        confirmCount = 0;
      }

      if (confirmCount >= REQUIRED_CONFIRMATIONS) {
        confirmCount = 0;
        activeDistanceCm = dist;
        resetCycleData();

        Serial.print(F("SENSOR:DIST="));
        Serial.println(activeDistanceCm);
        Serial.println(F("STAGE:CHECKING_AI"));

        if (ENABLE_4WAY_SANITARY && digitalRead(SANITARY_PIN) == SANITARY_ACTIVE_STATE) {
          actuateAndHold("SANITARY", S1_SANITARY, S2_HOME, activeDistanceCm, "SANITARY", "VALID", readFilteredMetalAdc(), false, false);
        } else {
          enterState(STATE_SETTLE_AI);
        }
      }
      delay(20);
      break;
    }

    case STATE_SETTLE_AI: {
      if (now - stateStartMs >= AI_SETTLE_MS) {
        enterState(STATE_CHECK_AI);
      }
      break;
    }

    case STATE_CHECK_AI: {
      if (now - lastSampleMs >= AI_SAMPLE_INTERVAL_MS) {
        lastSampleMs = now;

        bool dryActive = false;
        bool wetActive = false;
        readAiInputs(dryActive, wetActive);
        AiClass candidate = evaluateAiPins(dryActive, wetActive);

        if ((dryActive ? 1 : 0) != lastReportedDry || (wetActive ? 1 : 0) != lastReportedWet) {
          lastReportedDry = dryActive ? 1 : 0;
          lastReportedWet = wetActive ? 1 : 0;
          emitAiTelemetry(dryActive, wetActive, candidate);
        }

        if ((candidate == AI_CLASS_DRY || candidate == AI_CLASS_WET) && candidate == lastAiCandidate) {
          aiStableCount++;
        } else {
          lastAiCandidate = candidate;
          aiStableCount = (candidate == AI_CLASS_DRY || candidate == AI_CLASS_WET) ? 1 : 0;
        }

        // Valid stable classification achieved
        if (aiStableCount >= AI_REQUIRED_STABLE_SAMPLES) {
          emitAiTelemetry(dryActive, wetActive, candidate);

          if (candidate == AI_CLASS_WET) {
            // WET path: route directly to Wet chamber (do NOT enter metal detection)
            actuateAndHold("WET", S1_WET, S2_HOME, activeDistanceCm, "WET", "VALID", readFilteredMetalAdc(), false, false);
            break;
          }

          if (candidate == AI_CLASS_DRY) {
            // DRY path: move Servo 1 to pass item to Stage 2 metal plates
            wetDryServo.write(S1_DRY_PASS);
            metalServo.write(S2_HOME);
            Serial.print(F("SERVO:S1="));
            Serial.print(S1_DRY_PASS);
            Serial.print(F("|S2="));
            Serial.println(S2_HOME);
            Serial.println(F("STAGE:CHECKING_METAL"));
            enterState(STATE_CHECK_METAL);
            break;
          }
        }
      }

      // Classification timeout -> UNKNOWN or CONFLICT (NEVER default to DRY)
      if (now - stateStartMs >= AI_CLASSIFICATION_TIMEOUT_MS) {
        bool dryActive = false;
        bool wetActive = false;
        readAiInputs(dryActive, wetActive);
        AiClass finalFail = (dryActive && wetActive) ? AI_CLASS_CONFLICT : AI_CLASS_UNKNOWN;

        emitAiTelemetry(dryActive, wetActive, finalFail);
        Serial.println(F("STAGE:AI_ERROR"));
        emitSortEvent(
          "ERROR",
          S1_HOME,
          S2_HOME,
          activeDistanceCm,
          aiClassToString(finalFail),
          aiClassValidity(finalFail),
          readFilteredMetalAdc(),
          false,
          false,
          finalFail == AI_CLASS_CONFLICT ? "AI_CONFLICT" : "AI_UNKNOWN"
        );
        returnServosHome();
        resetCycleData();
        enterState(STATE_COOLDOWN);
      }
      break;
    }

    case STATE_CHECK_METAL: {
      int adcVal = readFilteredMetalAdc();
      if (adcVal > peakMetalAdc) {
        peakMetalAdc = adcVal;
      }

      bool contactNow = (adcVal >= activeMetalThreshold);

      if (contactNow) {
        if (!metalDebouncing) {
          metalDebouncing = true;
          metalDebounceStartMs = now;
        } else if (!metalLatched && (now - metalDebounceStartMs >= METAL_DEBOUNCE_MS)) {
          metalLatched = true;
          emitMetalTelemetry(adcVal, true, true);
        }
      } else {
        metalDebouncing = false;
      }

      if ((now - lastSampleMs >= 120) || ((contactNow ? 1 : 0) != lastReportedMetalContact)) {
        lastSampleMs = now;
        lastReportedMetalContact = contactNow ? 1 : 0;
        emitMetalTelemetry(adcVal, contactNow, metalLatched);
      }

      bool metalWindowDone = (now - stateStartMs >= METAL_WAIT_MS);
      bool latchedSettled = metalLatched && (now - metalDebounceStartMs >= METAL_POST_LATCH_HOLD_MS);

      if (latchedSettled || metalWindowDone) {
        if (metalLatched) {
          actuateAndHold("METAL", S1_DRY_PASS, S2_METAL, activeDistanceCm, "DRY", "VALID", peakMetalAdc, true, false);
        } else {
          actuateAndHold("DRY", S1_DRY_PASS, S2_DRY, activeDistanceCm, "DRY", "VALID", peakMetalAdc, false, false);
        }
      }
      break;
    }

    case STATE_HOLD_SORT: {
      if (now - stateStartMs >= MOVE_HOLD_MS) {
        returnServosHome();
        resetCycleData();
        enterState(STATE_COOLDOWN);
      }
      break;
    }

    case STATE_COOLDOWN: {
      if (now - stateStartMs >= COOLDOWN_MS) {
        clearCount = 0;
        enterState(STATE_WAIT_CLEAR);
      }
      break;
    }

    case STATE_WAIT_CLEAR: {
      int dist = readFilteredDistanceCm();
      if (dist < MIN_DISTANCE_CM || dist > TARGET_DISTANCE_CM) {
        clearCount++;
      } else {
        clearCount = 0;
        if (now - lastHeartbeatMs >= 800) {
          lastHeartbeatMs = now;
          emitIdleCalibrationHeartbeat();
        }
      }

      if (clearCount >= CLEAR_CONFIRMATIONS_REQUIRED) {
        clearCount = 0;
        activeDistanceCm = -1;
        Serial.println(F("STAGE:IDLE"));
        Serial.println(F("Ready for next object..."));
        enterState(STATE_IDLE);
      } else {
        delay(20);
      }
      break;
    }
  }
}
`;

export function generateStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Bin 4x — WitBlox AI + Metal A1 Web Serial Dashboard</title>
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
      --err: #fb7185;
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
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
    }
    .card-title { font-size: 13px; font-weight: 600; color: var(--muted); }
    .card-count {
      font-size: 34px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
      margin: 6px 0 4px;
      color: #ffffff;
    }
    .card-meta { font-size: 12px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .panels {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
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
    .log-list { max-height: 360px; overflow-y: auto; font-size: 13px; }
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
        <div class="sub">WitBlox AI Vision (D4/D5) + Two-Plate Metal (A1) · Web Serial Monitor</div>
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
      <button type="button" onclick="simulateEvent('METAL')">+ Sim Metal (S1 120° · S2 150°)</button>
      <button type="button" onclick="simulateEvent('DRY')">+ Sim Dry (S1 120° · S2 30°)</button>
      <button type="button" onclick="simulateEvent('WET')">+ Sim Wet (S1 30°)</button>
      <button type="button" onclick="simulateError('AI_UNKNOWN')">+ Sim AI Unknown Hold</button>
    </div>

    <div class="grid-3">
      <div class="card">
        <div class="card-title">WitBlox AI Inputs (via Arduino D4/D5)</div>
        <div class="card-count" id="aiClassReadout" style="font-size:24px">NONE</div>
        <div class="card-meta" id="aiPinsMeta">D4 DRY: -- · D5 WET: -- · Validity: IDLE</div>
      </div>
      <div class="card">
        <div class="card-title">Two-Plate Metal Contact (A1)</div>
        <div class="card-count" id="metalAdcReadout" style="font-size:24px">-- / 1023</div>
        <div class="card-meta" id="metalMeta">Threshold: 700 · Contact: Open · Latch: Cleared</div>
      </div>
      <div class="card">
        <div class="card-title">Ultrasonic & Dual Servos</div>
        <div class="card-count" id="sensorReadout" style="font-size:24px">-- cm</div>
        <div class="card-meta" id="servoMeta">S1: 90° · S2: 90° · Stage: IDLE</div>
      </div>
    </div>

    <div class="grid-3">
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
          <input id="txInput" type="text" placeholder="PING, READ_SENSORS, SET_METAL_THRESHOLD:700" />
          <button type="button" onclick="sendSerialCommand()">Send</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const counts = { METAL: 0, DRY: 0, WET: 0, SANITARY: 0 };
    const events = [];
    let port = null, reader = null, writer = null, keepReading = false, demoTimer = null;
    const state = {
      dist: null, aiDry: null, aiWet: null, aiClass: 'NONE', aiValid: 'IDLE',
      metalAdc: null, metalThr: 700, metalContact: false, metalLatched: false,
      s1: 90, s2: 90, stage: 'IDLE'
    };

    const connectBtn = document.getElementById('connectBtn');
    const demoBtn = document.getElementById('demoBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusLine = document.getElementById('statusLine');
    const demoActions = document.getElementById('demoActions');
    const activityLog = document.getElementById('activityLog');
    const serialConsole = document.getElementById('serialConsole');

    function nowTime() { return new Date().toLocaleTimeString([], { hour12: false }); }

    function appendConsole(prefix, text) {
      const div = document.createElement('div');
      div.textContent = '[' + nowTime() + '] ' + prefix + ' ' + text;
      serialConsole.appendChild(div);
      serialConsole.scrollTop = serialConsole.scrollHeight;
    }

    function updateUi() {
      document.getElementById('countMETAL').textContent = counts.METAL;
      document.getElementById('countDRY').textContent = counts.DRY;
      document.getElementById('countWET').textContent = counts.WET;
      document.getElementById('aiClassReadout').textContent = state.aiClass;
      document.getElementById('aiPinsMeta').textContent =
        'D4 DRY: ' + (state.aiDry === null ? '--' : state.aiDry ? 'Active' : 'Inactive') +
        ' · D5 WET: ' + (state.aiWet === null ? '--' : state.aiWet ? 'Active' : 'Inactive') +
        ' · Validity: ' + state.aiValid;
      document.getElementById('metalAdcReadout').textContent =
        (state.metalAdc !== null ? state.metalAdc : '--') + ' / 1023';
      document.getElementById('metalMeta').textContent =
        'Threshold: ' + state.metalThr + ' · Contact: ' + (state.metalContact ? 'Bridged' : 'Open') +
        ' · Latch: ' + (state.metalLatched ? 'Latched' : 'Cleared');
      document.getElementById('sensorReadout').textContent = state.dist !== null ? state.dist + ' cm' : '-- cm';
      document.getElementById('servoMeta').textContent =
        'S1: ' + state.s1 + '° · S2: ' + state.s2 + '° · Stage: ' + state.stage;
    }

    function renderEvents() {
      if (!events.length) {
        activityLog.innerHTML = '<div class="sub">Waiting for segregation events from Arduino Uno...</div>';
        return;
      }
      activityLog.innerHTML = events.map(e =>
        '<div class="log-row">' +
        '<div><strong>' + e.title + '</strong> · AI ' + e.ai + ' (' + e.valid + ') · A1 ' +
        (e.adc !== null ? e.adc : '--') + ' · S1 ' + e.s1 + '° · S2 ' + e.s2 + '° · ' + e.source + '</div>' +
        '<div class="sub">' + e.time + '</div>' +
        '</div>'
      ).join('');
    }

    function parseLine(raw) {
      const line = raw.trim();
      if (!line) return;
      appendConsole('RX', line);
      const u = line.toUpperCase();

      if (u.startsWith('SENSOR:')) {
        const m = line.match(/DIST=(-?\\d+)/i);
        if (m) { state.dist = parseInt(m[1], 10); state.stage = 'OBJECT_DETECTED'; state.metalLatched = false; }
      } else if (u.startsWith('STAGE:')) {
        state.stage = line.slice(6).trim();
        if (state.stage === 'IDLE') { state.metalLatched = false; state.metalContact = false; }
      } else if (u.startsWith('AI:')) {
        const d = line.match(/DRY=([01])/i), w = line.match(/WET=([01])/i);
        const c = line.match(/CLASS=([A-Z]+)/i), v = line.match(/VALID=([A-Z]+)/i);
        if (d) state.aiDry = d[1] === '1';
        if (w) state.aiWet = w[1] === '1';
        if (c) state.aiClass = c[1].toUpperCase();
        if (v) state.aiValid = v[1].toUpperCase();
      } else if (u.startsWith('METAL:') || u.startsWith('CAL:')) {
        const a = line.match(/ADC=(\\d+)/i), t = line.match(/THR=(\\d+)/i);
        const ct = line.match(/CONTACT=([01])/i), lt = line.match(/(?:LATCHED|METAL)=([01])/i);
        const ad = line.match(/AI_DRY=([01])/i), aw = line.match(/AI_WET=([01])/i);
        if (a) state.metalAdc = parseInt(a[1], 10);
        if (t) state.metalThr = parseInt(t[1], 10);
        if (ct) state.metalContact = ct[1] === '1';
        if (lt) state.metalLatched = lt[1] === '1';
        if (ad) state.aiDry = ad[1] === '1';
        if (aw) state.aiWet = aw[1] === '1';
      } else if (u.startsWith('SERVO:')) {
        const s1m = line.match(/S1[:=](\\d+)/i), s2m = line.match(/S2[:=](\\d+)/i);
        if (s1m) state.s1 = parseInt(s1m[1], 10);
        if (s2m) state.s2 = parseInt(s2m[1], 10);
        if (u.includes('HOME')) { state.s1 = 90; state.s2 = 90; state.stage = 'RETURNING_HOME'; state.metalLatched = false; }
      } else if (u.startsWith('EVENT:')) {
        const parts = line.split('|');
        const map = {};
        parts.forEach(p => {
          const idx = p.indexOf(':');
          if (idx > -1) map[p.slice(0, idx).trim().toUpperCase()] = p.slice(idx + 1).trim();
        });
        const ev = (map.EVENT || '').toUpperCase();
        const isTest = (map.SOURCE || '').toUpperCase() === 'TEST';
        const s1 = map.S1 ? parseInt(map.S1, 10) : 90;
        const s2 = map.S2 ? parseInt(map.S2, 10) : 90;
        const adc = map.METAL_ADC ? parseInt(map.METAL_ADC, 10) : state.metalAdc;
        const dist = map.DIST ? parseInt(map.DIST, 10) : state.dist;
        state.s1 = s1; state.s2 = s2; state.metalAdc = adc; state.dist = dist;
        if (map.AI) state.aiClass = map.AI.toUpperCase();
        if (map.VALID) state.aiValid = map.VALID.toUpperCase();

        if (ev === 'ERROR') {
          state.stage = 'AI_ERROR';
          events.unshift({
            time: nowTime(), title: 'AI Signal Error (' + (map.REASON || 'UNKNOWN') + ') — Safe Hold 90°',
            category: 'ERROR', ai: state.aiClass, valid: state.aiValid, adc, metal: false, s1: 90, s2: 90, dist, source: 'Arduino'
          });
        } else if (counts[ev] !== undefined) {
          state.stage = 'SORTING';
          if (!isTest) counts[ev]++;
          events.unshift({
            time: nowTime(),
            title: (isTest ? 'Hardware Test -> ' : '1 ' + ev + ' item -> ') + ev + ' Chamber',
            category: ev, ai: state.aiClass, valid: state.aiValid, adc, metal: ev === 'METAL', s1, s2, dist,
            source: isTest ? 'Test' : 'Arduino'
          });
        }
        if (events.length > 200) events.pop();
        renderEvents();
      }
      updateUi();
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
        port = null; reader = null; writer = null;
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
      const dist = 5 + Math.floor(Math.random() * 5);
      parseLine('SENSOR:DIST=' + dist);
      parseLine('STAGE:CHECKING_AI');
      if (cat === 'WET') {
        parseLine('AI:DRY=0|WET=1|CLASS=WET|VALID=VALID');
        parseLine('EVENT:WET|DIST:' + dist + '|AI:WET|VALID:VALID|METAL_ADC:35|METAL:0|S1:30|S2:90');
      } else if (cat === 'METAL') {
        parseLine('AI:DRY=1|WET=0|CLASS=DRY|VALID=VALID');
        parseLine('METAL:ADC=920|THR=' + state.metalThr + '|CONTACT=1|LATCHED=1');
        parseLine('EVENT:METAL|DIST:' + dist + '|AI:DRY|VALID:VALID|METAL_ADC:920|METAL:1|S1:120|S2:150');
      } else {
        parseLine('AI:DRY=1|WET=0|CLASS=DRY|VALID=VALID');
        parseLine('METAL:ADC=48|THR=' + state.metalThr + '|CONTACT=0|LATCHED=0');
        parseLine('EVENT:DRY|DIST:' + dist + '|AI:DRY|VALID:VALID|METAL_ADC:48|METAL:0|S1:120|S2:30');
      }
      setTimeout(() => { parseLine('SERVO:HOME:S1=90|S2=90'); parseLine('STAGE:IDLE'); }, 900);
    }

    function simulateError(reason) {
      parseLine('AI:DRY=0|WET=0|CLASS=UNKNOWN|VALID=UNKNOWN');
      parseLine('EVENT:ERROR|REASON:' + reason + '|DIST:6|AI:UNKNOWN|VALID:UNKNOWN|METAL_ADC:40|METAL:0|S1:90|S2:90');
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
        const cats = ['METAL', 'DRY', 'WET'];
        let i = 0;
        demoBtn.textContent = 'Demo Mode: Active';
        demoBtn.classList.add('active');
        demoActions.classList.add('visible');
        statusLine.textContent = 'Status: Demo Stream Active';
        simulateEvent(cats[0]);
        demoTimer = setInterval(() => { i++; simulateEvent(cats[i % cats.length]); }, 3200);
      }
    });

    resetBtn.addEventListener('click', () => {
      counts.METAL = 0; counts.DRY = 0; counts.WET = 0; counts.SANITARY = 0;
      events.length = 0;
      renderEvents();
      updateUi();
    });

    function clearLogs() { events.length = 0; renderEvents(); }
    function clearConsole() { serialConsole.innerHTML = ''; }

    function exportCsv() {
      if (!events.length) return;
      const rows = ['Time,Title,Category,DistanceCm,AiClass,AiValidity,MetalAdc,MetalDetected,S1,S2,Source',
        ...events.map(e => [e.time, '"' + e.title + '"', e.category, e.dist ?? '', e.ai, e.valid, e.adc ?? '', e.metal ? '1' : '0', e.s1, e.s2, e.source].join(','))
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
