import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import { ARDUINO_SKETCH_CODE, generateStandaloneHtml } from '../data/arduinoSketch';
import { parseSerialLine } from './serialParser';

function runTests() {
  // 1. Verify .ino file and ARDUINO_SKETCH_CODE are 100% synced
  const inoPath = path.resolve(
    process.cwd(),
    'arduino/AutoBin4x_Telemetry/AutoBin4x_Telemetry.ino'
  );
  const inoContent = fs.readFileSync(inoPath, 'utf8');
  assert.equal(
    ARDUINO_SKETCH_CODE,
    inoContent,
    'ARDUINO_SKETCH_CODE must match AutoBin4x_Telemetry.ino identically'
  );

  // 2. Verify WET event parsing
  const wetEv = parseSerialLine(
    'EVENT:WET|DIST:6|AI:WET|VALID:VALID|METAL_ADC:32|METAL:0|S1:30|S2:90'
  );
  assert.equal(wetEv.eventCategory, 'WET');
  assert.equal(wetEv.distanceCm, 6);
  assert.equal(wetEv.aiClassification, 'WET');
  assert.equal(wetEv.aiValidity, 'VALID');
  assert.equal(wetEv.metalAdc, 32);
  assert.equal(wetEv.metalLatched, false);
  assert.equal(wetEv.servo1Angle, 30);
  assert.equal(wetEv.servo2Angle, 90);
  assert.equal(wetEv.isTestSource, undefined);

  // 3. Verify DRY event parsing
  const dryEv = parseSerialLine(
    'EVENT:DRY|DIST:7|AI:DRY|VALID:VALID|METAL_ADC:48|METAL:0|S1:120|S2:30'
  );
  assert.equal(dryEv.eventCategory, 'DRY');
  assert.equal(dryEv.aiClassification, 'DRY');
  assert.equal(dryEv.servo1Angle, 120);
  assert.equal(dryEv.servo2Angle, 30);
  assert.equal(dryEv.metalLatched, false);

  // 4. Verify METAL event parsing
  const metalEv = parseSerialLine(
    'EVENT:METAL|DIST:7|AI:DRY|VALID:VALID|METAL_ADC:920|METAL:1|S1:120|S2:150'
  );
  assert.equal(metalEv.eventCategory, 'METAL');
  assert.equal(metalEv.aiClassification, 'DRY');
  assert.equal(metalEv.metalAdc, 920);
  assert.equal(metalEv.metalLatched, true);
  assert.equal(metalEv.servo1Angle, 120);
  assert.equal(metalEv.servo2Angle, 150);

  // 5. Verify UNKNOWN and CONFLICT AI error events (must NOT classify as DRY)
  const unknownEv = parseSerialLine(
    'EVENT:ERROR|REASON:AI_UNKNOWN|DIST:6|AI:UNKNOWN|VALID:UNKNOWN|METAL_ADC:40|METAL:0|S1:90|S2:90'
  );
  assert.equal(unknownEv.isErrorEvent, true);
  assert.equal(unknownEv.eventCategory, undefined);
  assert.equal(unknownEv.errorReason, 'AI_UNKNOWN');
  assert.equal(unknownEv.aiClassification, 'UNKNOWN');
  assert.equal(unknownEv.aiValidity, 'UNKNOWN');
  assert.equal(unknownEv.servo1Angle, 90);
  assert.equal(unknownEv.servo2Angle, 90);

  const conflictEv = parseSerialLine(
    'EVENT:ERROR|REASON:AI_CONFLICT|DIST:8|AI:CONFLICT|VALID:CONFLICT|METAL_ADC:45|METAL:0|S1:90|S2:90'
  );
  assert.equal(conflictEv.isErrorEvent, true);
  assert.equal(conflictEv.errorReason, 'AI_CONFLICT');
  assert.equal(conflictEv.aiClassification, 'CONFLICT');
  assert.equal(conflictEv.aiValidity, 'CONFLICT');

  // 6. Verify AI live pin telemetry formats (both combined & example syntax)
  const aiLine1 = parseSerialLine('AI:DRY=1|AI:WET=0');
  assert.equal(aiLine1.aiDryActive, true);
  assert.equal(aiLine1.aiWetActive, false);
  assert.equal(aiLine1.aiClassification, 'DRY');
  assert.equal(aiLine1.aiValidity, 'VALID');

  const aiConflict = parseSerialLine('AI:DRY=1|WET=1|CLASS=CONFLICT|VALID=CONFLICT');
  assert.equal(aiConflict.aiDryActive, true);
  assert.equal(aiConflict.aiWetActive, true);
  assert.equal(aiConflict.aiClassification, 'CONFLICT');
  assert.equal(aiConflict.aiValidity, 'CONFLICT');

  // 7. Verify Metal ADC telemetry & latch reset on STAGE:IDLE / HOME
  const metalTelemetry = parseSerialLine('METAL:ADC=845|THR=700|CONTACT=1|LATCHED=1');
  assert.equal(metalTelemetry.metalAdc, 845);
  assert.equal(metalTelemetry.metalThreshold, 700);
  assert.equal(metalTelemetry.metalContact, true);
  assert.equal(metalTelemetry.metalLatched, true);

  const stageIdle = parseSerialLine('STAGE:IDLE');
  assert.equal(stageIdle.stage, 'IDLE');
  assert.equal(stageIdle.metalLatched, false);
  assert.equal(stageIdle.metalContact, false);

  // 8. Verify Calibration heartbeat & Threshold ACK
  const calLine = parseSerialLine('CAL:ADC=39|THR=650|CONTACT=0|LATCHED=0|AI_DRY=0|AI_WET=0');
  assert.equal(calLine.metalAdc, 39);
  assert.equal(calLine.metalThreshold, 650);
  assert.equal(calLine.aiDryActive, false);
  assert.equal(calLine.aiWetActive, false);

  const thrAck = parseSerialLine('ACK:THRESHOLD=620');
  assert.equal(thrAck.metalThreshold, 620);

  // 9. Verify TEST command SOURCE:TEST separation
  const testLine = parseSerialLine(
    'EVENT:METAL|DIST:6|AI:DRY|VALID:VALID|METAL_ADC:920|METAL:1|S1:120|S2:150|SOURCE:TEST'
  );
  assert.equal(testLine.eventCategory, 'METAL');
  assert.equal(testLine.isTestSource, true);

  // 10. Verify standalone HTML output & inline script syntax check
  const standalone = generateStandaloneHtml();
  assert.ok(standalone.includes('WitBlox AI Vision'), 'Standalone HTML includes WitBlox AI UI');
  assert.ok(standalone.includes('Two-Plate Metal Contact'), 'Standalone HTML includes Metal A1 UI');
  const scriptMatch = standalone.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch && scriptMatch[1], 'Standalone HTML contains script block');
  new Function(scriptMatch[1]); // Throws SyntaxError if standalone JS has any syntax error

  // 11. Verify React <App /> renders without throwing
  const ssrHtml = renderToString(React.createElement(App));
  assert.ok(ssrHtml.includes('Auto Bin 4x'));
  assert.ok(ssrHtml.includes('WitBlox AI Vision Inputs'));
  assert.ok(ssrHtml.includes('Two-Plate Metal Contact'));

  console.log('All 11 Auto Bin 4x integration tests passed!');
}

runTests();
