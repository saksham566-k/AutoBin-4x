/*
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

  String cmd = Serial.readStringUntil('\n');
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
