import { CATEGORY_META, HardwareSnapshot, SortStage, WasteCategory } from '../types/telemetry';

export interface ParsedLineResult {
  eventCategory?: WasteCategory;
  servoAngle?: number;
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
 * Parses incoming Arduino Uno Serial lines.
 * Supports:
 * 1) Structured pipe telemetry: EVENT:METAL|DIST:7|DO:1|AO:820|ANGLE:150
 * 2) Simple event tokens: EVENT:WET, EVENT:DRY, EVENT:METAL, EVENT:SANITARY
 * 3) JSON lines: {"event":"METAL","dist":7,"ao":820,"do":1,"angle":150}
 * 4) Original user sketch serial lines verbatim:
 *    - "Object detected at 7 cm."
 *    - "LM393 DO: 0 | AO: 312"
 *    - "Not wet. Waiting before metal check..."
 *    - "Action: WET -> Servo to 30 deg"
 *    - "Action: NOT WET + METAL -> Servo to 150 deg"
 *    - "Action: NOT WET + NO METAL -> Servo to 120 deg"
 *    - "Returning servo to Home (90 deg)"
 *    - "Ready for next object..."
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
          result.servoAngle =
            typeof parsed.angle === 'number'
              ? parsed.angle
              : CATEGORY_META[cat].defaultAngle;
          result.metalDetected = cat === 'METAL';
        }
      }
      if (typeof parsed.dist === 'number') result.distanceCm = parsed.dist;
      if (typeof parsed.ao === 'number') result.wetAnalog = parsed.ao;
      if (typeof parsed.do === 'number') result.wetDigital = parsed.do;
      if (typeof parsed.angle === 'number') result.servoAngle = parsed.angle;
      return result;
    } catch {
      // Fall through to text parsers if malformed JSON
    }
  }

  // 2. Structured Telemetry or Simple EVENT:* format
  // e.g. EVENT:METAL|DIST:6|DO:1|AO:890|ANGLE:150
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
          if (result.servoAngle === undefined) {
            result.servoAngle = CATEGORY_META[cat].defaultAngle;
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
      } else if (key === 'ANGLE') {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) result.servoAngle = num;
      }
    }
    return result;
  }

  // 3. Sensor / Servo standalone telemetry lines from upgraded sketch
  // e.g. SENSOR:DIST=7 or SERVO:HOME:90
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
    const angleMatch = line.match(/(\d+)/);
    if (angleMatch) {
      result.servoAngle = Number.parseInt(angleMatch[1], 10);
    }
    if (line.toUpperCase().includes('HOME')) {
      result.stage = 'RETURNING_HOME';
    }
    return result;
  }

  // 4. Original user Arduino sketch line patterns
  // "Object detected at 7 cm."
  const objMatch = line.match(/Object detected at\s+(\d+)\s*cm/i);
  if (objMatch) {
    result.distanceCm = Number.parseInt(objMatch[1], 10);
    result.stage = 'OBJECT_DETECTED';
    result.metalDetected = false;
    return result;
  }

  // "LM393 DO: 0 | AO: 312"
  const lmMatch = line.match(/LM393\s+DO:\s*(\d+)\s*\|\s*AO:\s*(\d+)/i);
  if (lmMatch) {
    result.wetDigital = Number.parseInt(lmMatch[1], 10);
    result.wetAnalog = Number.parseInt(lmMatch[2], 10);
    result.stage = 'CHECKING_MOISTURE';
    return result;
  }

  // "Not wet. Waiting before metal check..."
  if (/waiting before metal check/i.test(line)) {
    result.stage = 'CHECKING_METAL';
    return result;
  }

  // "Action: WET -> Servo to 30 deg"
  // "Action: NOT WET + METAL -> Servo to 150 deg"
  // "Action: NOT WET + NO METAL -> Servo to 120 deg"
  // "Action: SANITARY -> Servo to 60 deg"
  const actionMatch = line.match(/Action:\s*([A-Za-z0-9_+\s-]+?)\s*->\s*Servo to\s*(\d+)\s*deg/i);
  if (actionMatch) {
    const rawLabel = actionMatch[1];
    const angle = Number.parseInt(actionMatch[2], 10);
    const cat = normalizeCategory(rawLabel);
    if (cat) {
      result.eventCategory = cat;
      result.servoAngle = Number.isNaN(angle) ? CATEGORY_META[cat].defaultAngle : angle;
      result.stage = 'SORTING';
      result.metalDetected = cat === 'METAL';
      if (currentSnapshot && result.distanceCm === undefined) {
        result.distanceCm = currentSnapshot.distanceCm ?? undefined;
      }
    }
    return result;
  }

  // "Returning servo to Home (90 deg)"
  const homeMatch = line.match(/Returning servo to Home\s*\((\d+)\s*deg\)/i);
  if (homeMatch) {
    result.servoAngle = Number.parseInt(homeMatch[1], 10);
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
