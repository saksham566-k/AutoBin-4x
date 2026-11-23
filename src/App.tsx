import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CATEGORY_META,
  ChamberCounts,
  ConnectionState,
  HardwareSnapshot,
  SegregationEvent,
  SerialLogEntry,
  WasteCategory,
} from './types/telemetry';
import { parseSerialLine } from './utils/serialParser';
import { ChamberCards } from './components/ChamberCards';
import { HardwareVisualizer } from './components/HardwareVisualizer';
import { ActivityAndSerialPanel } from './components/ActivityAndSerialPanel';
import { ArduinoSketchView } from './components/ArduinoSketchView';
import { SetupGuideView } from './components/SetupGuideView';
import { generateStandaloneHtml } from './data/arduinoSketch';
import {
  AlertCircle,
  Download,
  Play,
  RotateCcw,
  Square,
  Usb,
} from 'lucide-react';

type ActiveTab = 'monitor' | 'sketch' | 'setup';

const INITIAL_COUNTS: ChamberCounts = {
  METAL: 0,
  DRY: 0,
  WET: 0,
  SANITARY: 0,
};

const INITIAL_SNAPSHOT: HardwareSnapshot = {
  distanceCm: null,
  aiDryActive: null,
  aiWetActive: null,
  aiClassification: 'NONE',
  aiValidity: 'IDLE',
  metalAdc: null,
  metalThreshold: 700,
  metalContact: false,
  metalLatched: false,
  servo1Angle: 90,
  servo2Angle: 90,
  stage: 'IDLE',
  lastCategory: null,
  lastEventTimestamp: null,
  lastErrorReason: null,
  errorCount: 0,
};

function formatClockTime(): string {
  return new Date().toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState<string>(
    'Ready for USB Serial (Chrome / Edge)'
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [showSanitaryChamber, setShowSanitaryChamber] = useState<boolean>(false);

  const [counts, setCounts] = useState<ChamberCounts>(INITIAL_COUNTS);
  const [snapshot, setSnapshot] = useState<HardwareSnapshot>(INITIAL_SNAPSHOT);
  const [events, setEvents] = useState<SegregationEvent[]>([]);
  const [serialLogs, setSerialLogs] = useState<SerialLogEntry[]>([]);
  const [recentFlashCategory, setRecentFlashCategory] = useState<WasteCategory | null>(null);
  const [latestAlertText, setLatestAlertText] = useState<string | null>(null);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const pipeAbortRef = useRef<AbortController | null>(null);
  const keepReadingRef = useRef<boolean>(false);
  const snapshotRef = useRef<HardwareSnapshot>(INITIAL_SNAPSHOT);
  const flashTimerRef = useRef<number | null>(null);
  const demoTimersRef = useRef<number[]>([]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const appendSerialLog = useCallback(
    (direction: 'rx' | 'tx' | 'sys', text: string, category?: WasteCategory | 'ERROR') => {
      const entry: SerialLogEntry = {
        id: makeId(),
        direction,
        text,
        timestamp: formatClockTime(),
        category,
      };
      setSerialLogs((prev) => [...prev.slice(-249), entry]);
    },
    []
  );

  const triggerFlash = useCallback((category: WasteCategory) => {
    setRecentFlashCategory(category);
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setRecentFlashCategory(null);
    }, 1200);
  }, []);

  const handleIncomingLine = useCallback(
    (rawLine: string, source: 'arduino' | 'demo') => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;

      const parsed = parseSerialLine(trimmed, snapshotRef.current);
      appendSerialLog(
        'rx',
        trimmed,
        parsed.isErrorEvent ? 'ERROR' : parsed.eventCategory
      );

      if (parsed.isResetAck) {
        setCounts(INITIAL_COUNTS);
        setEvents([]);
        setSnapshot((prev) => ({
          ...INITIAL_SNAPSHOT,
          metalThreshold: prev.metalThreshold,
        }));
        setLatestAlertText('Arduino acknowledged counter and state reset.');
        return;
      }

      setSnapshot((prev) => {
        const next: HardwareSnapshot = {
          ...prev,
          distanceCm: parsed.distanceCm !== undefined ? parsed.distanceCm : prev.distanceCm,
          aiDryActive: parsed.aiDryActive !== undefined ? parsed.aiDryActive : prev.aiDryActive,
          aiWetActive: parsed.aiWetActive !== undefined ? parsed.aiWetActive : prev.aiWetActive,
          aiClassification:
            parsed.aiClassification !== undefined
              ? parsed.aiClassification
              : prev.aiClassification,
          aiValidity: parsed.aiValidity !== undefined ? parsed.aiValidity : prev.aiValidity,
          metalAdc: parsed.metalAdc !== undefined ? parsed.metalAdc : prev.metalAdc,
          metalThreshold:
            parsed.metalThreshold !== undefined ? parsed.metalThreshold : prev.metalThreshold,
          metalContact:
            parsed.metalContact !== undefined ? parsed.metalContact : prev.metalContact,
          metalLatched:
            parsed.metalLatched !== undefined ? parsed.metalLatched : prev.metalLatched,
          servo1Angle: parsed.servo1Angle !== undefined ? parsed.servo1Angle : prev.servo1Angle,
          servo2Angle: parsed.servo2Angle !== undefined ? parsed.servo2Angle : prev.servo2Angle,
          stage: parsed.stage !== undefined ? parsed.stage : prev.stage,
        };

        if (parsed.isErrorEvent) {
          next.lastErrorReason = parsed.errorReason ?? 'AI_SIGNAL_ERROR';
          next.errorCount = prev.errorCount + 1;
        } else if (parsed.eventCategory && !parsed.isTestSource) {
          next.lastCategory = parsed.eventCategory;
          next.lastEventTimestamp = formatClockTime();
          next.lastErrorReason = null;
        }
        return next;
      });

      if (parsed.isErrorEvent) {
        const nowStr = formatClockTime();
        const reasonLabel = parsed.errorReason ?? 'AI_UNKNOWN';
        const aiCls = parsed.aiClassification ?? snapshotRef.current.aiClassification;
        const aiVal = parsed.aiValidity ?? snapshotRef.current.aiValidity;
        const distVal =
          parsed.distanceCm !== undefined ? parsed.distanceCm : snapshotRef.current.distanceCm;
        const adcVal =
          parsed.metalAdc !== undefined ? parsed.metalAdc : snapshotRef.current.metalAdc;

        const errorEvent: SegregationEvent = {
          id: makeId(),
          category: 'ERROR',
          chamberLabel: 'Safe Hold (90°)',
          resultLabel: `Safe Hold · ${reasonLabel} (No Default to DRY)`,
          servo1Angle: parsed.servo1Angle ?? 90,
          servo2Angle: parsed.servo2Angle ?? 90,
          distanceCm: distVal,
          aiClassification: aiCls === 'NONE' ? 'UNKNOWN' : aiCls,
          aiValidity: aiVal === 'IDLE' ? 'UNKNOWN' : aiVal,
          metalAdc: adcVal,
          metalDetected: false,
          timestamp: nowStr,
          isoTime: new Date().toISOString(),
          source,
          rawLine: trimmed,
        };

        setEvents((prev) => [errorEvent, ...prev.slice(0, 199)]);
        setErrorBanner(
          `WitBlox AI signal fault (${reasonLabel}) at ${nowStr}. Servos remained safe at 90° and metal sorting was skipped.`
        );
        setLatestAlertText(`AI Signal Error (${reasonLabel}) — safe hold at 90°`);
        return;
      }

      if (parsed.eventCategory) {
        const cat = parsed.eventCategory;
        const meta = CATEGORY_META[cat];
        const s1Angle = parsed.servo1Angle ?? meta.servo1Target;
        const s2Angle = parsed.servo2Angle ?? meta.servo2Target;
        const nowStr = formatClockTime();
        const isTest = Boolean(parsed.isTestSource);

        if (cat === 'SANITARY') {
          setShowSanitaryChamber(true);
        }

        // Physical & demo sorting events increment chamber counters; TX test commands do not
        if (!isTest) {
          setCounts((prev) => ({
            ...prev,
            [cat]: prev[cat] + 1,
          }));
        }

        const distVal =
          parsed.distanceCm !== undefined ? parsed.distanceCm : snapshotRef.current.distanceCm;
        const adcVal =
          parsed.metalAdc !== undefined ? parsed.metalAdc : snapshotRef.current.metalAdc;
        const aiCls =
          parsed.aiClassification ??
          (cat === 'WET' ? 'WET' : cat === 'SANITARY' ? 'NONE' : 'DRY');
        const aiVal =
          parsed.aiValidity ?? (cat === 'SANITARY' ? 'VALID' : 'VALID');
        const metalFlag =
          parsed.metalLatched !== undefined ? parsed.metalLatched : cat === 'METAL';

        const newEvent: SegregationEvent = {
          id: makeId(),
          category: cat,
          chamberLabel: meta.chamberName,
          resultLabel: isTest
            ? `Hardware Test -> ${meta.chamberName} (Counters Unchanged)`
            : `Segregated -> ${meta.chamberName}`,
          servo1Angle: s1Angle,
          servo2Angle: s2Angle,
          distanceCm: distVal,
          aiClassification: aiCls,
          aiValidity: aiVal,
          metalAdc: adcVal,
          metalDetected: metalFlag,
          timestamp: nowStr,
          isoTime: new Date().toISOString(),
          source: isTest ? 'test' : source,
          rawLine: trimmed,
        };

        setEvents((prev) => [newEvent, ...prev.slice(0, 199)]);
        setLatestAlertText(
          isTest
            ? `Hardware Test (${meta.label}) actuated -> S1 ${s1Angle}° · S2 ${s2Angle}° at ${nowStr}`
            : `1 ${meta.label} item segregated -> ${meta.chamberName} (S1 ${s1Angle}° · S2 ${s2Angle}°) at ${nowStr}`
        );
        triggerFlash(cat);
      }
    },
    [appendSerialLog, triggerFlash]
  );

  const runSimulatedCycle = useCallback(
    (category: WasteCategory) => {
      const dist = 5 + Math.floor(Math.random() * 5);
      const thr = snapshotRef.current.metalThreshold;
      const meta = CATEGORY_META[category];
      const s1 = meta.servo1Target;
      const s2 = meta.servo2Target;

      handleIncomingLine(`SENSOR:DIST=${dist}`, 'demo');
      handleIncomingLine('STAGE:CHECKING_AI', 'demo');

      const t1 = window.setTimeout(() => {
        if (category === 'WET') {
          handleIncomingLine('AI:DRY=0|WET=1|CLASS=WET|VALID=VALID', 'demo');
        } else {
          handleIncomingLine('AI:DRY=1|WET=0|CLASS=DRY|VALID=VALID', 'demo');
          if (category === 'METAL' || category === 'DRY') {
            handleIncomingLine(`SERVO:S1=${s1}|S2=90`, 'demo');
            handleIncomingLine('STAGE:CHECKING_METAL', 'demo');
          }
        }
      }, 320);

      const t2 = window.setTimeout(() => {
        if (category === 'METAL') {
          const highAdc = Math.min(1020, Math.max(thr + 120, 880 + Math.floor(Math.random() * 110)));
          handleIncomingLine(`METAL:ADC=${highAdc}|THR=${thr}|CONTACT=1|LATCHED=1`, 'demo');
          handleIncomingLine(
            `EVENT:METAL|DIST:${dist}|AI:DRY|VALID:VALID|METAL_ADC:${highAdc}|METAL:1|S1:${s1}|S2:${s2}`,
            'demo'
          );
        } else if (category === 'DRY') {
          const lowAdc = 25 + Math.floor(Math.random() * 65);
          handleIncomingLine(`METAL:ADC=${lowAdc}|THR=${thr}|CONTACT=0|LATCHED=0`, 'demo');
          handleIncomingLine(
            `EVENT:DRY|DIST:${dist}|AI:DRY|VALID:VALID|METAL_ADC:${lowAdc}|METAL:0|S1:${s1}|S2:${s2}`,
            'demo'
          );
        } else if (category === 'WET') {
          const lowAdc = 20 + Math.floor(Math.random() * 45);
          handleIncomingLine(
            `EVENT:WET|DIST:${dist}|AI:WET|VALID:VALID|METAL_ADC:${lowAdc}|METAL:0|S1:${s1}|S2:${s2}`,
            'demo'
          );
        } else {
          const lowAdc = 20 + Math.floor(Math.random() * 45);
          handleIncomingLine(
            `EVENT:SANITARY|DIST:${dist}|AI:NONE|VALID:VALID|METAL_ADC:${lowAdc}|METAL:0|S1:${s1}|S2:${s2}`,
            'demo'
          );
        }
      }, 950);

      const t3 = window.setTimeout(() => {
        handleIncomingLine('SERVO:HOME:S1=90|S2=90', 'demo');
        handleIncomingLine('STAGE:IDLE', 'demo');
        handleIncomingLine('Ready for next object...', 'demo');
      }, 2150);

      demoTimersRef.current.push(t1, t2, t3);
    },
    [handleIncomingLine]
  );

  useEffect(() => {
    if (!demoMode) {
      demoTimersRef.current.forEach((id) => window.clearTimeout(id));
      demoTimersRef.current = [];
      return;
    }

    const sequence: WasteCategory[] = showSanitaryChamber
      ? ['METAL', 'DRY', 'WET', 'SANITARY']
      : ['METAL', 'DRY', 'WET'];
    let idx = 0;

    appendSerialLog(
      'sys',
      'Demo stream started — simulating WitBlox AI Vision + Two-Plate Metal cycles every 3.5s'
    );
    runSimulatedCycle(sequence[idx]);
    idx = (idx + 1) % sequence.length;

    const intervalId = window.setInterval(() => {
      runSimulatedCycle(sequence[idx]);
      idx = (idx + 1) % sequence.length;
    }, 3500);

    return () => {
      window.clearInterval(intervalId);
      demoTimersRef.current.forEach((id) => window.clearTimeout(id));
      demoTimersRef.current = [];
    };
  }, [demoMode, showSanitaryChamber, runSimulatedCycle, appendSerialLog]);

  const disconnectArduino = useCallback(async () => {
    keepReadingRef.current = false;

    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
        readerRef.current = null;
      }
    } catch {
      // Ignore cancel errors on closed stream
    }

    try {
      if (pipeAbortRef.current) {
        pipeAbortRef.current.abort();
        pipeAbortRef.current = null;
      }
    } catch {
      // Ignore abort errors
    }

    try {
      if (writerRef.current) {
        await writerRef.current.close();
        writerRef.current.releaseLock();
        writerRef.current = null;
      }
    } catch {
      writerRef.current = null;
    }

    try {
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch {
      portRef.current = null;
    }

    setConnectionState('disconnected');
    setConnectionMessage('Disconnected · Ready for USB Serial');
    appendSerialLog('sys', 'Serial connection closed.');
  }, [appendSerialLog]);

  const connectArduino = async () => {
    setErrorBanner(null);

    if (connectionState === 'connected') {
      await disconnectArduino();
      return;
    }

    if (!('serial' in navigator) || !navigator.serial) {
      setConnectionState('error');
      setErrorBanner(
        'Web Serial API is not supported in this browser. Use Google Chrome, Microsoft Edge, or Opera on desktop over HTTPS/localhost, or test with Demo Mode.'
      );
      return;
    }

    try {
      setConnectionState('connecting');
      setConnectionMessage('Waiting for serial port selection...');

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });

      portRef.current = port;
      keepReadingRef.current = true;

      if (demoMode) {
        setDemoMode(false);
      }

      setConnectionState('connected');
      setConnectionMessage(`Connected · ${baudRate} baud`);
      appendSerialLog('sys', `Opened USB Serial port at ${baudRate} baud`);

      if (port.writable) {
        writerRef.current = port.writable.getWriter();
      }

      if (port.readable) {
        const decoder = new TextDecoderStream();
        const abortController = new AbortController();
        pipeAbortRef.current = abortController;

        port.readable
          .pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>, {
            signal: abortController.signal,
          })
          .catch(() => {
            // Expected when disconnecting
          });

        const reader = decoder.readable.getReader();
        readerRef.current = reader;

        let lineBuffer = '';
        while (keepReadingRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            lineBuffer += value;
            const lines = lineBuffer.split(/\r?\n/);
            lineBuffer = lines.pop() ?? '';
            for (const line of lines) {
              handleIncomingLine(line, 'arduino');
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('no port selected') || msg.toLowerCase().includes('cancelled')) {
        setConnectionState('disconnected');
        setConnectionMessage('Port selection cancelled · Ready');
        return;
      }

      setConnectionState('error');
      if (msg.toLowerCase().includes('permissions policy') || msg.toLowerCase().includes('disallowed')) {
        setErrorBanner(
          'Browser iframe policy blocked Web Serial access here. Open the app in a standalone tab or download the Single-File HTML Dashboard from the Arduino Sketch tab.'
        );
      } else {
        setErrorBanner(
          `Could not open serial port (${msg}). Make sure the Arduino IDE Serial Monitor is closed so the COM port is unlocked.`
        );
      }
      setConnectionMessage('Connection error');
      appendSerialLog('sys', `Connection error: ${msg}`);
    }
  };

  useEffect(() => {
    return () => {
      if (portRef.current) {
        void disconnectArduino();
      }
    };
  }, [disconnectArduino]);

  const handleSendSerialCommand = async (command: string) => {
    const clean = command.trim();
    if (!clean) return;

    if (connectionState === 'connected' && writerRef.current) {
      try {
        const encoder = new TextEncoder();
        await writerRef.current.write(encoder.encode(`${clean}\n`));
        appendSerialLog('tx', clean);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendSerialLog('sys', `TX failed: ${msg}`);
      }
      return;
    }

    if (demoMode) {
      appendSerialLog('tx', clean);
      const upper = clean.toUpperCase();
      if (upper === 'PING') {
        handleIncomingLine('ACK:PONG|AUTO_BIN_4X_WITBLOX_A1', 'demo');
      } else if (upper === 'READ_SENSORS') {
        const adc = 38 + Math.floor(Math.random() * 25);
        handleIncomingLine('AI:DRY=0|WET=0|CLASS=UNKNOWN|VALID=IDLE', 'demo');
        handleIncomingLine(
          `METAL:ADC=${adc}|THR=${snapshotRef.current.metalThreshold}|CONTACT=0|LATCHED=0`,
          'demo'
        );
      } else if (upper.startsWith('SET_METAL_THRESHOLD:')) {
        const val = Number.parseInt(upper.slice(20), 10);
        if (!Number.isNaN(val) && val >= 50 && val <= 1000) {
          handleIncomingLine(`ACK:THRESHOLD=${val}`, 'demo');
        }
      } else if (upper === 'TEST_METAL') {
        handleIncomingLine(
          'EVENT:METAL|DIST:6|AI:DRY|VALID:VALID|METAL_ADC:920|METAL:1|S1:120|S2:150|SOURCE:TEST',
          'demo'
        );
      } else if (upper === 'TEST_DRY') {
        handleIncomingLine(
          'EVENT:DRY|DIST:7|AI:DRY|VALID:VALID|METAL_ADC:80|METAL:0|S1:120|S2:30|SOURCE:TEST',
          'demo'
        );
      } else if (upper === 'TEST_WET') {
        handleIncomingLine(
          'EVENT:WET|DIST:6|AI:WET|VALID:VALID|METAL_ADC:35|METAL:0|S1:30|S2:90|SOURCE:TEST',
          'demo'
        );
      } else if (upper === 'TEST_SANITARY') {
        handleIncomingLine(
          'EVENT:SANITARY|DIST:6|AI:NONE|VALID:VALID|METAL_ADC:35|METAL:0|S1:60|S2:90|SOURCE:TEST',
          'demo'
        );
      } else if (upper === 'HOME') {
        handleIncomingLine('SERVO:HOME:S1=90|S2=90', 'demo');
        handleIncomingLine('STAGE:IDLE', 'demo');
      } else if (upper === 'RESET') {
        handleIncomingLine('ACK:RESET', 'demo');
      } else {
        appendSerialLog('sys', `Simulated TX echo: ${clean}`);
      }
    }
  };

  const handleApplyMetalThreshold = (threshold: number) => {
    const clamped = Math.max(50, Math.min(1000, Math.round(threshold)));
    setSnapshot((prev) => ({
      ...prev,
      metalThreshold: clamped,
      metalContact: prev.metalAdc !== null ? prev.metalAdc >= clamped : prev.metalContact,
    }));
    setLatestAlertText(`Metal A1 threshold set to ${clamped} / 1023.`);

    if (connectionState === 'connected' || demoMode) {
      void handleSendSerialCommand(`SET_METAL_THRESHOLD:${clamped}`);
    } else {
      appendSerialLog(
        'sys',
        `Local metal threshold updated to ${clamped} (connect Arduino to sync via SET_METAL_THRESHOLD:${clamped})`
      );
    }
  };

  const handleRequestSensorRead = () => {
    if (connectionState === 'connected' || demoMode) {
      void handleSendSerialCommand('READ_SENSORS');
    }
  };

  const handleResetCounters = () => {
    setCounts(INITIAL_COUNTS);
    setEvents([]);
    setLatestAlertText(null);
    setErrorBanner(null);
    setSnapshot((prev) => ({
      ...INITIAL_SNAPSHOT,
      metalThreshold: prev.metalThreshold,
    }));
    appendSerialLog('sys', 'Counters and activity log reset.');
    if (connectionState === 'connected') {
      void handleSendSerialCommand('RESET');
    }
  };

  const handleExportCsv = () => {
    if (events.length === 0) return;
    const header =
      'Time,Result,Category,Chamber,DistanceCm,AiClassification,AiValidity,MetalAdc,MetalDetected,Servo1AngleDeg,Servo2AngleDeg,Source';
    const rows = events.map((ev) =>
      [
        ev.timestamp,
        `"${ev.resultLabel.replace(/"/g, '""')}"`,
        ev.category,
        ev.chamberLabel,
        ev.distanceCm ?? '',
        ev.aiClassification,
        ev.aiValidity,
        ev.metalAdc ?? '',
        ev.metalDetected ? '1' : '0',
        ev.servo1Angle,
        ev.servo2Angle,
        ev.source,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-bin-4x-log-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const isStreaming = connectionState === 'connected' || demoMode;

  return (
    <div className="min-h-screen bg-[#060913] telemetry-grid-bg text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-14 bg-[#060913]/85 backdrop-blur-md border-b border-slate-800/90 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#monitor"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monitor');
            }}
            className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Auto Bin 4x
          </a>

          {/* Zone 2: Clean Single-Line Nav Links with Shared Spring Indicator */}
          <nav className="flex items-center gap-6 h-full overflow-x-auto">
            {(
              [
                { id: 'monitor', label: 'Live Monitor' },
                { id: 'sketch', label: 'Arduino Sketch' },
                { id: 'setup', label: 'Setup & Troubleshoot' },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative h-full inline-flex items-center text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <motion.span
                      layoutId="top-nav-underline"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={connectArduino}
              disabled={connectionState === 'connecting'}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                connectionState === 'connected'
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'bg-sky-400 text-slate-950 hover:bg-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.25)]'
              } disabled:opacity-60`}
            >
              <Usb className="w-3.5 h-3.5" />
              {connectionState === 'connected'
                ? 'Disconnect Serial'
                : connectionState === 'connecting'
                ? 'Connecting...'
                : 'Connect Arduino'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Error / Warning Banner */}
        <AnimatePresence>
          {errorBanner && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex items-start justify-between gap-4 p-4 bg-rose-500/10 border border-rose-500/35 rounded-lg text-sm text-rose-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-xs font-medium text-rose-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'monitor' && (
          <>
            {/* Workspace Control & Telemetry Toolbar */}
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              {/* Live Connection Status */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`text-sm font-semibold whitespace-nowrap ${
                    connectionState === 'connected'
                      ? 'text-emerald-400'
                      : demoMode
                      ? 'text-sky-400'
                      : connectionState === 'error'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {isStreaming ? '● ' : '○ '}
                  {connectionState === 'connected'
                    ? 'Arduino Connected'
                    : demoMode
                    ? 'Demo Mode Active'
                    : connectionState === 'error'
                    ? 'Serial Error'
                    : 'Disconnected'}
                </span>
                <span className="text-xs text-slate-400 font-mono truncate">
                  {demoMode ? 'Simulated 9600 baud WitBlox AI + Metal A1 stream' : connectionMessage}
                </span>
              </div>

              {/* Hardware & Simulation Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Serial baud rate"
                  value={baudRate}
                  disabled={connectionState === 'connected'}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-mono bg-[#050811] border border-slate-800 rounded-md text-slate-200 disabled:opacity-50 cursor-pointer"
                >
                  <option value={9600}>9600 baud</option>
                  <option value={38400}>38400 baud</option>
                  <option value={57600}>57600 baud</option>
                  <option value={115200}>115200 baud</option>
                </select>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#050811] border border-slate-800 rounded-md cursor-pointer select-none whitespace-nowrap shrink-0">
                  <input
                    type="checkbox"
                    checked={showSanitaryChamber}
                    onChange={(e) => setShowSanitaryChamber(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-sky-400"
                  />
                  4-Way (Sanitary)
                </label>

                <button
                  type="button"
                  onClick={() => setDemoMode((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                    demoMode
                      ? 'bg-sky-500/15 border-sky-400/50 text-sky-300 hover:bg-sky-500/25'
                      : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {demoMode ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {demoMode ? 'Stop Demo' : 'Simulate / Demo Mode'}
                </button>

                <button
                  type="button"
                  onClick={handleResetCounters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-700 active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Counters
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStandaloneHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-700 active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  title="Download single-file HTML/CSS/JS Web Serial dashboard"
                >
                  <Download className="w-3.5 h-3.5" />
                  Single-File HTML
                </button>
              </div>
            </motion.section>

            {/* Live Segregation Alert Strip */}
            <AnimatePresence>
              {latestAlertText && (
                <motion.div
                  aria-live="polite"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="bg-sky-500/10 border border-sky-400/35 rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="font-medium text-slate-100">
                    <span className="font-mono text-sky-400 mr-2">LIVE EVENT</span>
                    {latestAlertText}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLatestAlertText(null)}
                    className="text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Clear
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chamber Counters & Summary KPIs */}
            <ChamberCards
              counts={counts}
              snapshot={snapshot}
              recentFlashCategory={recentFlashCategory}
              showSanitaryChamber={showSanitaryChamber}
              onSimulateCategory={runSimulatedCycle}
            />

            {/* Servo Dial & Sensor Telemetry */}
            <HardwareVisualizer
              snapshot={snapshot}
              showSanitaryChamber={showSanitaryChamber}
              connectionState={connectionState}
              demoMode={demoMode}
              onApplyMetalThreshold={handleApplyMetalThreshold}
              onRequestSensorRead={handleRequestSensorRead}
            />

            {/* Live Segregation Log & Raw Serial Console */}
            <ActivityAndSerialPanel
              events={events}
              serialLogs={serialLogs}
              connectionState={connectionState}
              demoMode={demoMode}
              showSanitaryChamber={showSanitaryChamber}
              onClearEvents={() => setEvents([])}
              onExportCsv={handleExportCsv}
              onClearSerial={() => setSerialLogs([])}
              onSendCommand={handleSendSerialCommand}
            />
          </>
        )}

        {activeTab === 'sketch' && <ArduinoSketchView />}

        {activeTab === 'setup' && <SetupGuideView />}
      </main>
    </div>
  );
}
