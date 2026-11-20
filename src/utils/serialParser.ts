import { CATEGORY_META, HardwareSnapshot, SortStage, WasteCategory } from '../types/telemetry';

export interface ParsedLineResult {
  eventCategory?: WasteCategory;
  servo1Angle?: number;
  servo2Angle?: number;
  distanceCm?: number;
  wetDigital?: number;
  wetAnalog?: number;
  metalDetected?: boolean;
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

/**
 * Parses incoming Arduino Uno Serial lines for Dual-Servo Auto Bin 4x:
 * Supports:
 * 1) Dual-servo structured telemetry: EVENT:METAL|DIST:7|DO:1|AO:860|S1:120|S2:150
 * 2) Simple event tokens: EVENT:WET, EVENT:DRY, EVENT:METAL, EVENT:SANITARY
 * 3) Intermediate servo updates: SERVO:S1:120, SERVO:S2:150, SERVO:HOME:90
 * 4) JSON lines: {"event":"METAL","dist":7,"ao":820,"do":1,"s1":120,"s2":150}
 * 5) Original single/legacy serial strings:
 *    - "Object detected at 7 cm."
 *    - "LM393 DO: 0 | AO: 312"
 *    - "Action: WET -> Servo to 30 deg"
 *    - "Action: NOT WET + METAL -> Servo to 150 deg"
 *    - "Action: NOT WET + NO METAL -> Servo to 120 deg"
 *    - "Returning servo to Home (90 deg)"
 */
export function parseSerialLine(rawLine: string, currentSnapshot?: HardwareSnapshot): ParsedLineResult {
  const line = rawLine.trim();
  if (!line) return {};

  const result: ParsedLineResult = {};

  // 1. JSON Line format
  if (line.startsWith('{') && line.endsWith('}')) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.event === 'string') {
        const cat = normalizeCategory(parsed.event);
        if (cat) {
          result.eventCategory = cat;
          result.stage = 'SORTING';
          result.servo1Angle =
            typeof parsed.s1 === 'number' ? parsed.s1 : CATEGORY_META[cat].servo1Target;
          result.servo2Angle =
            typeof parsed.s2 === 'number' ? parsed.s2 : CATEGORY_META[cat].servo2Target;
          result.metalDetected = cat === 'METAL';
        }
      }
      if (typeof parsed.dist === 'number') result.distanceCm = parsed.dist;
      if (typeof parsed.ao === 'number') result.wetAnalog = parsed.ao;
      if (typeof parsed.do === 'number') result.wetDigital = parsed.do;
      if (typeof parsed.s1 === 'number') result.servo1Angle = parsed.s1;
      if (typeof parsed.s2 === 'number') result.servo2Angle = parsed.s2;
      return result;
    } catch {
      // Fall through to text parsers
    }
  }

  // 2. Structured Telemetry or Simple EVENT:* format
  // e.g. EVENT:METAL|DIST:6|DO:1|AO:890|S1:120|S2:150
  if (line.toUpperCase().startsWith('EVENT:')) {
    const segments = line.split('|');
    for (const seg of segments) {
      const colonIdx = seg.indexOf(':');
      if (colonIdx === -1) continue;
      const key = seg.slice(0, colonIdx).trim().toUpperCase();
      const val = seg.slice(colonIdx + 1).trim();

      if (key === 'EVENT') {
        const cat = normalizeCategory(val);
        if (cat) {
          result.eventCategory = cat;
          result.stage = 'SORTING';
          result.metalDetected = cat === 'METAL';
          if (result.servo1Angle === undefined) {
            result.servo1Angle = CATEGORY_META[cat].servo1Target;
          }
          if (result.servo2Angle === undefined) {
            result.servo2Angle = CATEGORY_META[cat].servo2Target;
          }
        }
      } else if (key === 'DIST') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.distanceCm = num;
      } else if (key === 'AO') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.wetAnalog = num;
      } else if (key === 'DO') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.wetDigital = num;
      } else if (key === 'S1') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.servo1Angle = num;
      } else if (key === 'S2') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.servo2Angle = num;
      } else if (key === 'ANGLE') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) {
          if (result.eventCategory === 'WET' || result.eventCategory === 'SANITARY') {
            result.servo1Angle = num;
          } else {
            result.servo2Angle = num;
          }
        }
      }
    }
    return result;
  }

  // 3. Sensor / Servo standalone telemetry lines
  if (line.toUpperCase().startsWith('SENSOR:')) {
    const distMatch = line.match(/DIST\s*=\s*(-?\d+)/i);
    const aoMatch = line.match(/AO\s*=\s*(\d+)/i);
    const doMatch = line.match(/DO\s*=\s*(\d+)/i);
    if (distMatch) {
      result.distanceCm = Number.parseInt(distMatch[1], 10);
      result.stage = 'OBJECT_DETECTED';
    }
    if (aoMatch) result.wetAnalog = Number.parseInt(aoMatch[1], 10);
    if (doMatch) result.wetDigital = Number.parseInt(doMatch[1], 10);
    return result;
  }

  if (line.toUpperCase().startsWith('SERVO:')) {
    const upper = line.toUpperCase();
    const s1Match = line.match(/S1[:=](\d+)/i);
    const s2Match = line.match(/S2[:=](\d+)/i);
    if (s1Match) result.servo1Angle = Number.parseInt(s1Match[1], 10);
    if (s2Match) result.servo2Angle = Number.parseInt(s2Match[1], 10);

    if (upper.includes('HOME')) {
      const homeAngle = line.match(/HOME[:=](\d+)/i);
      const val = homeAngle ? Number.parseInt(homeAngle[1], 10) : 90;
      if (!s1Match) result.servo1Angle = val;
      if (!s2Match) result.servo2Angle = val;
      result.stage = 'RETURNING_HOME';
    } else if (s1Match && !s2Match) {
      result.stage = 'CHECKING_METAL';
    }
    return result;
  }

  // 4. Legacy / Original sketch line patterns
  const objMatch = line.match(/Object detected at\s+(\d+)\s*cm/i);
  if (objMatch) {
    result.distanceCm = Number.parseInt(objMatch[1], 10);
    result.stage = 'OBJECT_DETECTED';
    result.metalDetected = false;
    return result;
  }

  const lmMatch = line.match(/LM393\s+DO:\s*(\d+)\s*\|\s*AO:\s*(\d+)/i);
  if (lmMatch) {
    result.wetDigital = Number.parseInt(lmMatch[1], 10);
    result.wetAnalog = Number.parseInt(lmMatch[2], 10);
    result.stage = 'CHECKING_MOISTURE';
    return result;
  }

  if (/waiting before metal check/i.test(line)) {
    result.stage = 'CHECKING_METAL';
    result.servo1Angle = CATEGORY_META.DRY.servo1Target;
    return result;
  }

  const actionMatch = line.match(/Action:\s*([A-Za-z0-9_+\s-]+?)\s*->\s*Servo to\s*(\d+)\s*deg/i);
  if (actionMatch) {
    const rawLabel = actionMatch[1];
    const angle = Number.parseInt(actionMatch[2], 10);
    const cat = normalizeCategory(rawLabel);
    if (cat) {
      result.eventCategory = cat;
      result.stage = 'SORTING';
      result.metalDetected = cat === 'METAL';
      if (cat === 'WET' || cat === 'SANITARY') {
        result.servo1Angle = Number.isNaN(angle) ? CATEGORY_META[cat].servo1Target : angle;
        result.servo2Angle = 90;
      } else {
        result.servo1Angle = CATEGORY_META[cat].servo1Target;
        result.servo2Angle = Number.isNaN(angle) ? CATEGORY_META[cat].servo2Target : angle;
      }
      if (currentSnapshot && result.distanceCm === undefined) {
        result.distanceCm = currentSnapshot.distanceCm ?? undefined;
      }
    }
    return result;
  }

  const homeMatch = line.match(/Returning servo to Home\s*\((\d+)\s*deg\)/i);
  if (homeMatch) {
    const val = Number.parseInt(homeMatch[1], 10);
    result.servo1Angle = val;
    result.servo2Angle = val;
    result.stage = 'RETURNING_HOME';
    return result;
  }

  if (/Ready for next object|System ready/i.test(line)) {
    result.stage = 'IDLE';
    result.metalDetected = false;
    return result;
  }

  if (/ACK:RESET/i.test(line)) {
    result.isResetAck = true;
    return result;
  }

  return result;
}
