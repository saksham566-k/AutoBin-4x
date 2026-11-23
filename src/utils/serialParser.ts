import {
  AiClassification,
  AiValidity,
  CATEGORY_META,
  HardwareSnapshot,
  SortStage,
  WasteCategory,
} from '../types/telemetry';

export interface ParsedLineResult {
  eventCategory?: WasteCategory;
  isErrorEvent?: boolean;
  errorReason?: string;
  isTestSource?: boolean;
  servo1Angle?: number;
  servo2Angle?: number;
  distanceCm?: number;
  aiDryActive?: boolean;
  aiWetActive?: boolean;
  aiClassification?: AiClassification;
  aiValidity?: AiValidity;
  metalAdc?: number;
  metalThreshold?: number;
  metalContact?: boolean;
  metalLatched?: boolean;
  stage?: SortStage;
  isResetAck?: boolean;
}

function normalizeCategory(raw: string): WasteCategory | undefined {
  const upper = raw.trim().toUpperCase();
  if (upper === 'METAL' || upper === 'NOT WET + METAL') return 'METAL';
  if (upper === 'DRY' || upper === 'NON_METAL' || upper === 'NOT WET + NO METAL') return 'DRY';
  if (upper === 'WET') return 'WET';
  if (upper === 'SANITARY' || upper === 'BIO' || upper === 'HAZARD') return 'SANITARY';
  return undefined;
}

function normalizeAiClass(raw: string): AiClassification | undefined {
  const upper = raw.trim().toUpperCase();
  if (upper === 'DRY') return 'DRY';
  if (upper === 'WET') return 'WET';
  if (upper === 'UNKNOWN') return 'UNKNOWN';
  if (upper === 'CONFLICT' || upper === 'INVALID') return 'CONFLICT';
  if (upper === 'NONE' || upper === 'IDLE') return 'NONE';
  return undefined;
}

function normalizeAiValidity(raw: string): AiValidity | undefined {
  const upper = raw.trim().toUpperCase();
  if (upper === 'VALID') return 'VALID';
  if (upper === 'UNKNOWN') return 'UNKNOWN';
  if (upper === 'CONFLICT' || upper === 'INVALID') return 'CONFLICT';
  if (upper === 'IDLE' || upper === 'NONE') return 'IDLE';
  return undefined;
}

function normalizeStage(raw: string): SortStage | undefined {
  const upper = raw.trim().toUpperCase();
  if (upper === 'IDLE') return 'IDLE';
  if (upper === 'OBJECT_DETECTED') return 'OBJECT_DETECTED';
  if (upper === 'CHECKING_AI') return 'CHECKING_AI';
  if (upper === 'CHECKING_METAL') return 'CHECKING_METAL';
  if (upper === 'SORTING') return 'SORTING';
  if (upper === 'AI_ERROR') return 'AI_ERROR';
  if (upper === 'RETURNING_HOME') return 'RETURNING_HOME';
  return undefined;
}

function deriveAiFromPins(dry: boolean, wet: boolean): {
  cls: AiClassification;
  validity: AiValidity;
} {
  if (dry && !wet) return { cls: 'DRY', validity: 'VALID' };
  if (wet && !dry) return { cls: 'WET', validity: 'VALID' };
  if (dry && wet) return { cls: 'CONFLICT', validity: 'CONFLICT' };
  return { cls: 'UNKNOWN', validity: 'IDLE' };
}

/**
 * Parses incoming Arduino Uno Serial lines for Auto Bin 4x (WitBlox AI Vision + Two-Plate Metal A1):
 * - EVENT:METAL|DIST:7|AI:DRY|VALID:VALID|METAL_ADC:920|METAL:1|S1:120|S2:150
 * - EVENT:DRY|DIST:7|AI:DRY|VALID:VALID|METAL_ADC:120|METAL:0|S1:120|S2:30
 * - EVENT:WET|DIST:6|AI:WET|VALID:VALID|METAL_ADC:35|METAL:0|S1:30|S2:90
 * - EVENT:ERROR|REASON:AI_UNKNOWN|DIST:6|AI:UNKNOWN|VALID:UNKNOWN|METAL_ADC:40|METAL:0|S1:90|S2:90
 * - AI:DRY=1|WET=0|CLASS=DRY|VALID=VALID (or AI:DRY=1|AI:WET=0, AI:CLASS=DRY)
 * - METAL:ADC=920|THR=700|CONTACT=1|LATCHED=1 (or METAL:ADC=920|METAL=1)
 * - CAL:ADC=42|THR=700|CONTACT=0|LATCHED=0|AI_DRY=0|AI_WET=0
 * - STAGE:CHECKING_AI | STAGE:CHECKING_METAL | STAGE:AI_ERROR | STAGE:IDLE
 * - SENSOR:DIST=7
 * - SERVO:S1=120|S2=90 | SERVO:HOME:S1=90|S2=90
 * - ACK:THRESHOLD=700 | ACK:RESET
 * - Also preserves JSON line & legacy Action: parsing for backwards compatibility.
 */
export function parseSerialLine(
  rawLine: string,
  currentSnapshot?: HardwareSnapshot
): ParsedLineResult {
  const line = rawLine.trim();
  if (!line) return {};

  const result: ParsedLineResult = {};
  const upperLine = line.toUpperCase();

  // 1. JSON Line format
  if (line.startsWith('{') && line.endsWith('}')) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.event === 'string') {
        if (parsed.event.trim().toUpperCase() === 'ERROR') {
          result.isErrorEvent = true;
          result.stage = 'AI_ERROR';
          result.errorReason = typeof parsed.reason === 'string' ? parsed.reason : 'AI_ERROR';
        } else {
          const cat = normalizeCategory(parsed.event);
          if (cat) {
            result.eventCategory = cat;
            result.stage = 'SORTING';
            result.servo1Angle =
              typeof parsed.s1 === 'number' ? parsed.s1 : CATEGORY_META[cat].servo1Target;
            result.servo2Angle =
              typeof parsed.s2 === 'number' ? parsed.s2 : CATEGORY_META[cat].servo2Target;
            result.metalLatched = cat === 'METAL';
          }
        }
      }
      if (typeof parsed.dist === 'number') result.distanceCm = parsed.dist;
      if (typeof parsed.metal_adc === 'number') result.metalAdc = parsed.metal_adc;
      if (typeof parsed.thr === 'number') result.metalThreshold = parsed.thr;
      if (typeof parsed.s1 === 'number') result.servo1Angle = parsed.s1;
      if (typeof parsed.s2 === 'number') result.servo2Angle = parsed.s2;
      if (typeof parsed.ai === 'string') {
        const cls = normalizeAiClass(parsed.ai);
        if (cls) result.aiClassification = cls;
      }
      return result;
    } catch {
      // Fall through to text parsers
    }
  }

  // 2. EVENT:* format (including EVENT:ERROR and SOURCE:TEST)
  if (upperLine.startsWith('EVENT:')) {
    const segments = line.split('|');
    for (const seg of segments) {
      const colonIdx = seg.indexOf(':');
      if (colonIdx === -1) continue;
      const key = seg.slice(0, colonIdx).trim().toUpperCase();
      const val = seg.slice(colonIdx + 1).trim();

      if (key === 'EVENT') {
        if (val.toUpperCase() === 'ERROR' || val.toUpperCase() === 'UNKNOWN') {
          result.isErrorEvent = true;
          result.stage = 'AI_ERROR';
        } else {
          const cat = normalizeCategory(val);
          if (cat) {
            result.eventCategory = cat;
            result.stage = 'SORTING';
            result.metalLatched = cat === 'METAL';
            if (result.servo1Angle === undefined) {
              result.servo1Angle = CATEGORY_META[cat].servo1Target;
            }
            if (result.servo2Angle === undefined) {
              result.servo2Angle = CATEGORY_META[cat].servo2Target;
            }
          }
        }
      } else if (key === 'REASON') {
        result.errorReason = val;
      } else if (key === 'SOURCE') {
        if (val.toUpperCase() === 'TEST') result.isTestSource = true;
      } else if (key === 'DIST') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.distanceCm = num;
      } else if (key === 'AI') {
        const cls = normalizeAiClass(val);
        if (cls) {
          result.aiClassification = cls;
          if (cls === 'DRY' || cls === 'WET') {
            result.aiValidity = 'VALID';
          } else if (cls === 'CONFLICT') {
            result.aiValidity = 'CONFLICT';
          } else if (cls === 'UNKNOWN') {
            result.aiValidity = 'UNKNOWN';
          }
        }
      } else if (key === 'VALID') {
        const validity = normalizeAiValidity(val);
        if (validity) result.aiValidity = validity;
      } else if (key === 'METAL_ADC') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.metalAdc = num;
      } else if (key === 'METAL') {
        const isMet = val === '1' || val.toUpperCase() === 'TRUE';
        result.metalLatched = isMet;
        result.metalContact = isMet;
      } else if (key === 'S1') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.servo1Angle = num;
      } else if (key === 'S2') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.servo2Angle = num;
      }
    }
    return result;
  }

  // 3. AI:* telemetry lines (e.g. AI:DRY=1|WET=0|CLASS=DRY|VALID=VALID or AI:DRY=1|AI:WET=0 or AI:CLASS=DRY)
  if (upperLine.startsWith('AI:')) {
    const dryMatch = line.match(/(?:AI:)?DRY\s*[:=]\s*([01])/i);
    const wetMatch = line.match(/(?:AI:)?WET\s*[:=]\s*([01])/i);
    const classMatch = line.match(/CLASS\s*[:=]\s*([A-Za-z]+)/i);
    const validMatch = line.match(/VALID\s*[:=]\s*([A-Za-z]+)/i);

    if (dryMatch) result.aiDryActive = dryMatch[1] === '1';
    if (wetMatch) result.aiWetActive = wetMatch[1] === '1';

    if (classMatch) {
      const cls = normalizeAiClass(classMatch[1]);
      if (cls) result.aiClassification = cls;
    }
    if (validMatch) {
      const validity = normalizeAiValidity(validMatch[1]);
      if (validity) result.aiValidity = validity;
    }

    if (result.aiDryActive !== undefined && result.aiWetActive !== undefined) {
      const derived = deriveAiFromPins(result.aiDryActive, result.aiWetActive);
      if (!result.aiClassification) result.aiClassification = derived.cls;
      if (!result.aiValidity) result.aiValidity = derived.validity;
    } else if (result.aiClassification && !result.aiValidity) {
      if (result.aiClassification === 'DRY' || result.aiClassification === 'WET') {
        result.aiValidity = 'VALID';
      } else if (result.aiClassification === 'CONFLICT') {
        result.aiValidity = 'CONFLICT';
      } else if (result.aiClassification === 'UNKNOWN') {
        result.aiValidity = 'UNKNOWN';
      }
    }
    return result;
  }

  // 4. METAL:* telemetry lines (e.g. METAL:ADC=920|THR=700|CONTACT=1|LATCHED=1 or METAL:ADC=920|METAL=1)
  if (upperLine.startsWith('METAL:')) {
    const adcMatch = line.match(/ADC\s*[:=]\s*(\d+)/i);
    const thrMatch = line.match(/THR\s*[:=]\s*(\d+)/i);
    const contactMatch = line.match(/CONTACT\s*[:=]\s*([01])/i);
    const latchedMatch = line.match(/(?:LATCHED|METAL)\s*[:=]\s*([01])/i);

    if (adcMatch) result.metalAdc = Number.parseInt(adcMatch[1], 10);
    if (thrMatch) result.metalThreshold = Number.parseInt(thrMatch[1], 10);
    if (contactMatch) result.metalContact = contactMatch[1] === '1';
    if (latchedMatch) {
      result.metalLatched = latchedMatch[1] === '1';
      if (result.metalContact === undefined) {
        result.metalContact = result.metalLatched;
      }
    }
    return result;
  }

  // 5. CAL:* live calibration heartbeat (e.g. CAL:ADC=42|THR=700|CONTACT=0|LATCHED=0|AI_DRY=0|AI_WET=0)
  if (upperLine.startsWith('CAL:')) {
    const adcMatch = line.match(/ADC\s*[:=]\s*(\d+)/i);
    const thrMatch = line.match(/THR\s*[:=]\s*(\d+)/i);
    const contactMatch = line.match(/CONTACT\s*[:=]\s*([01])/i);
    const latchedMatch = line.match(/LATCHED\s*[:=]\s*([01])/i);
    const dryMatch = line.match(/AI_DRY\s*[:=]\s*([01])/i);
    const wetMatch = line.match(/AI_WET\s*[:=]\s*([01])/i);

    if (adcMatch) result.metalAdc = Number.parseInt(adcMatch[1], 10);
    if (thrMatch) result.metalThreshold = Number.parseInt(thrMatch[1], 10);
    if (contactMatch) result.metalContact = contactMatch[1] === '1';
    if (latchedMatch) result.metalLatched = latchedMatch[1] === '1';
    if (dryMatch) result.aiDryActive = dryMatch[1] === '1';
    if (wetMatch) result.aiWetActive = wetMatch[1] === '1';

    if (result.aiDryActive !== undefined && result.aiWetActive !== undefined) {
      const derived = deriveAiFromPins(result.aiDryActive, result.aiWetActive);
      result.aiClassification = derived.cls;
      result.aiValidity = derived.validity;
    }
    return result;
  }

  // 6. STAGE:* lines
  if (upperLine.startsWith('STAGE:')) {
    const stageVal = line.slice(6).trim();
    const stage = normalizeStage(stageVal);
    if (stage) {
      result.stage = stage;
      if (stage === 'IDLE') {
        result.metalLatched = false;
        result.metalContact = false;
      }
    }
    return result;
  }

  // 7. SENSOR:DIST=*
  if (upperLine.startsWith('SENSOR:')) {
    const distMatch = line.match(/DIST\s*=\s*(-?\d+)/i);
    if (distMatch) {
      result.distanceCm = Number.parseInt(distMatch[1], 10);
      result.stage = 'OBJECT_DETECTED';
      result.metalLatched = false;
    }
    return result;
  }

  // 8. SERVO:* lines
  if (upperLine.startsWith('SERVO:')) {
    const s1Match = line.match(/S1[:=](\d+)/i);
    const s2Match = line.match(/S2[:=](\d+)/i);
    if (s1Match) result.servo1Angle = Number.parseInt(s1Match[1], 10);
    if (s2Match) result.servo2Angle = Number.parseInt(s2Match[1], 10);

    if (upperLine.includes('HOME')) {
      const homeAngle = line.match(/HOME[:=](\d+)/i);
      const val = homeAngle ? Number.parseInt(homeAngle[1], 10) : 90;
      if (!s1Match) result.servo1Angle = val;
      if (!s2Match) result.servo2Angle = val;
      result.stage = 'RETURNING_HOME';
      result.metalLatched = false;
    }
    return result;
  }

  // 9. Acknowledgements & info
  const thrAckMatch = line.match(/ACK:THRESHOLD\s*=\s*(\d+)/i);
  if (thrAckMatch) {
    result.metalThreshold = Number.parseInt(thrAckMatch[1], 10);
    return result;
  }

  const bootThrMatch = line.match(/INFO:BOOT.*\|THR\s*=\s*(\d+)/i);
  if (bootThrMatch) {
    result.metalThreshold = Number.parseInt(bootThrMatch[1], 10);
    result.stage = 'IDLE';
    result.metalLatched = false;
    return result;
  }

  if (/ACK:RESET/i.test(line)) {
    result.isResetAck = true;
    return result;
  }

  if (/Ready for next object|Auto Bin 4x ready/i.test(line)) {
    result.stage = 'IDLE';
    result.metalLatched = false;
    result.metalContact = false;
    return result;
  }

  // 10. Legacy Action:* fallback if an older sketch is momentarily connected
  const actionMatch = line.match(/Action:\s*([A-Za-z0-9_+\s-]+?)\s*->\s*Servo to\s*(\d+)\s*deg/i);
  if (actionMatch) {
    const cat = normalizeCategory(actionMatch[1]);
    const angle = Number.parseInt(actionMatch[2], 10);
    if (cat) {
      result.eventCategory = cat;
      result.stage = 'SORTING';
      result.metalLatched = cat === 'METAL';
      result.servo1Angle =
        cat === 'WET' || cat === 'SANITARY'
          ? Number.isNaN(angle)
            ? CATEGORY_META[cat].servo1Target
            : angle
          : CATEGORY_META[cat].servo1Target;
      result.servo2Angle =
        cat === 'WET' || cat === 'SANITARY'
          ? 90
          : Number.isNaN(angle)
          ? CATEGORY_META[cat].servo2Target
          : angle;
      if (currentSnapshot && result.distanceCm === undefined) {
        result.distanceCm = currentSnapshot.distanceCm ?? undefined;
      }
    }
    return result;
  }

  return result;
}
