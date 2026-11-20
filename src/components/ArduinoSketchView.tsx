import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ARDUINO_SKETCH_CODE,
  ARDUINO_SKETCH_FILENAME,
  generateStandaloneHtml,
} from '../data/arduinoSketch';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';

export const ArduinoSketchView: React.FC = () => {
  const [copiedSketch, setCopiedSketch] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);

  const handleCopySketch = async () => {
    try {
      await navigator.clipboard.writeText(ARDUINO_SKETCH_CODE);
      setCopiedSketch(true);
      setTimeout(() => setCopiedSketch(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleDownloadIno = () => {
    const blob = new Blob([ARDUINO_SKETCH_CODE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ARDUINO_SKETCH_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStandaloneHtml = () => {
    const html = generateStandaloneHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-bin-4x-dashboard.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyStandaloneHtml = async () => {
    try {
      await navigator.clipboard.writeText(generateStandaloneHtml());
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const pinMappings = [
    { component: 'HC-SR04 Ultrasonic (Trig)', pin: 'D6', notes: 'Trigger pulse (10 µs)' },
    { component: 'HC-SR04 Ultrasonic (Echo)', pin: 'D7', notes: '30 ms echo timeout (~10 cm threshold)' },
    { component: 'LM393 Moisture (Digital DO)', pin: 'D4', notes: 'Active LOW when wet (configurable)' },
    { component: 'LM393 Moisture (Analog AO)', pin: 'A0', notes: '0–1023 analog moisture telemetry' },
    { component: 'Metal Touch Sensor', pin: 'D2', notes: 'Active HIGH after 2s settle wait' },
    { component: 'Servo 1: Wet / Dry Chute', pin: 'D9', notes: '30° Wet · 60° Sanitary · 90° Home · 120° Dry Pass' },
    { component: 'Servo 2: Metal / Dry Chute', pin: 'D10', notes: '30° Dry (Non-Metal) · 90° Home · 150° Metal' },
    { component: 'Optional 4-Way Sanitary Input', pin: 'D5', notes: 'Enable ENABLE_4WAY_SANITARY = true to activate' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* Header & Actions */}
      <div className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Upgraded Arduino Uno Telemetry Sketch
            </h1>
            <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
              Built directly from your original sensor & servo code. It preserves every pin
              definition, timing delay, and sorting angle while adding structured{' '}
              <code className="font-mono text-xs bg-slate-800 text-sky-300 px-1.5 py-0.5 rounded">
                EVENT:&lt;CATEGORY&gt;
              </code>{' '}
              packets at 9600 baud and remote test commands (<code className="font-mono text-xs text-slate-200">PING</code>,{' '}
              <code className="font-mono text-xs text-slate-200">TEST_METAL</code>,{' '}
              <code className="font-mono text-xs text-slate-200">DEMO_ON</code>). This dashboard also parses your
              original unmodified <code className="font-mono text-xs text-slate-200">Action: ...</code> serial
              lines automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopySketch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedSketch ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSketch ? 'Copied Sketch' : 'Copy Sketch'}
            </button>
            <button
              type="button"
              onClick={handleDownloadIno}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download .ino
            </button>
          </div>
        </div>

        {/* Code Viewer */}
        <div className="mt-5 bg-[#050811] text-slate-100 rounded-lg border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/70 border-b border-slate-800 text-xs font-mono text-slate-400">
            <span>{ARDUINO_SKETCH_FILENAME}</span>
            <span>9600 baud · Arduino Uno</span>
          </div>
          <pre className="p-4 overflow-x-auto serial-scroll text-xs font-mono leading-relaxed max-h-[460px] text-slate-200">
            <code>{ARDUINO_SKETCH_CODE}</code>
          </pre>
        </div>
      </div>

      {/* Pinout + Single-File HTML Export Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <h2 className="text-base font-semibold text-white">
            Pinout & Serial Protocol Reference
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Hardware Module</th>
                  <th className="py-2 pr-4 font-medium">Uno Pin</th>
                  <th className="py-2 font-medium">Behavior / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {pinMappings.map((row) => (
                  <tr key={row.component}>
                    <td className="py-2.5 pr-4 font-medium text-slate-100">{row.component}</td>
                    <td className="py-2.5 pr-4 font-mono text-sky-400">{row.pin}</td>
                    <td className="py-2.5 text-slate-400">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-6 flex flex-col justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-sky-400" />
              <h2 className="text-base font-semibold text-white">
                Single-File HTML Dashboard Export
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Need an offline, self-contained single-file <code className="font-mono text-xs text-sky-300">.html</code>{' '}
              version with embedded CSS, JavaScript, Web Serial API, and Demo Mode? Download or copy it
              to run locally in Chrome or Edge.
            </p>
            <div className="mt-4 p-3 bg-[#050811] border border-slate-800 rounded-md text-xs font-mono text-slate-400 space-y-1">
              <div>Supports: EVENT:METAL · EVENT:DRY · EVENT:WET · EVENT:SANITARY</div>
              <div>Also parses: Action: WET / NOT WET + METAL / NO METAL</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadStandaloneHtml}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Single-File HTML
            </button>
            <button
              type="button"
              onClick={handleCopyStandaloneHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedHtml ? 'Copied HTML' : 'Copy HTML Source'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
