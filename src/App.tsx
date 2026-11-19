import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  wetDigital: null,
  wetAnalog: null,
  metalDetected: false,
  servoAngle: 90,
  stage: 'IDLE',
  lastCategory: null,
  lastEventTimestamp: null,
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
  const [showSanitaryChamber, setShowSanitaryChamber] = useState<boolean>(true);

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
    (direction: 'rx' | 'tx' | 'sys', text: string, category?: WasteCategory) => {
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
      appendSerialLog('rx', trimmed, parsed.eventCategory);

      if (parsed.isResetAck) {
        setCounts(INITIAL_COUNTS);
        setEvents([]);
        setLatestAlertText('Arduino acknowledged counter reset.');
        return;
      }

      setSnapshot((prev) => {
        const next: HardwareSnapshot = {
          ...prev,
          distanceCm: parsed.distanceCm !== undefined ? parsed.distanceCm : prev.distanceCm,
          wetDigital: parsed.wetDigital !== undefined ? parsed.wetDigital : prev.wetDigital,
          wetAnalog: parsed.wetAnalog !== undefined ? parsed.wetAnalog : prev.wetAnalog,
          metalDetected:
            parsed.metalDetected !== undefined ? parsed.metalDetected : prev.metalDetected,
          servoAngle: parsed.servoAngle !== undefined ? parsed.servoAngle : prev.servoAngle,
          stage: parsed.stage !== undefined ? parsed.stage : prev.stage,
        };

        if (parsed.eventCategory) {
          next.lastCategory = parsed.eventCategory;
          next.lastEventTimestamp = formatClockTime();
        }
        return next;
      });

      if (parsed.eventCategory) {
        const cat = parsed.eventCategory;
        const meta = CATEGORY_META[cat];
        const angle = parsed.servoAngle ?? meta.defaultAngle;
        const nowStr = formatClockTime();

        if (cat === 'SANITARY') {
          setShowSanitaryChamber(true);
        }

        setCounts((prev) => ({
          ...prev,
          [cat]: prev[cat] + 1,
        }));

        const distVal =
          parsed.distanceCm !== undefined ? parsed.distanceCm : snapshotRef.current.distanceCm;
        const doVal =
          parsed.wetDigital !== undefined ? parsed.wetDigital : snapshotRef.current.wetDigital;
        const aoVal =
          parsed.wetAnalog !== undefined ? parsed.wetAnalog : snapshotRef.current.wetAnalog;

        const newEvent: SegregationEvent = {
          id: makeId(),
          category: cat,
          chamberLabel: meta.chamberName,
          servoAngle: angle,
          distanceCm: distVal,
          wetDigital: doVal,
          wetAnalog: aoVal,
          timestamp: nowStr,
          isoTime: new Date().toISOString(),
          source,
          rawLine: trimmed,
        };

        setEvents((prev) => [newEvent, ...prev.slice(0, 199)]);
        setLatestAlertText(
          `1 ${meta.label} item detected & segregated -> ${meta.chamberName} (${angle}°) at ${nowStr}`
        );
        triggerFlash(cat);
      }
    },
    [appendSerialLog, triggerFlash]
  );

  const runSimulatedCycle = useCallback(
    (category: WasteCategory) => {
      const dist = 4 + Math.floor(Math.random() * 5);
      const isWet = category === 'WET';
      const doVal = isWet ? 0 : 1;
      const aoVal = isWet
        ? 240 + Math.floor(Math.random() * 110)
        : 810 + Math.floor(Math.random() * 150);
      const angle = CATEGORY_META[category].defaultAngle;

      // Step 1: Object detected
      handleIncomingLine(`SENSOR:DIST=${dist}`, 'demo');

      // Step 2: Moisture reading
      const t1 = window.setTimeout(() => {
        handleIncomingLine(`LM393 DO: ${doVal} | AO: ${aoVal}`, 'demo');
      }, 280);

      // Step 3: Event emission + servo rotation
      const t2 = window.setTimeout(() => {
        handleIncomingLine(
          `EVENT:${category}|DIST:${dist}|DO:${doVal}|AO:${aoVal}|ANGLE:${angle}`,
          'demo'
        );
      }, 650);

      // Step 4: Return servo to home
      const t3 = window.setTimeout(() => {
        handleIncomingLine('SERVO:HOME:90', 'demo');
        handleIncomingLine('Ready for next object...', 'demo');
      }, 1750);

      demoTimersRef.current.push(t1, t2, t3);
    },
    [handleIncomingLine]
  );

  // Automatic Demo Stream Loop
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

    appendSerialLog('sys', 'Demo stream started — emitting simulated Arduino events every 3.2s');
    runSimulatedCycle(sequence[idx]);
    idx = (idx + 1) % sequence.length;

    const intervalId = window.setInterval(() => {
      runSimulatedCycle(sequence[idx]);
      idx = (idx + 1) % sequence.length;
    }, 3200);

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
        handleIncomingLine('ACK:PONG|AUTO_BIN_4X', 'demo');
      } else if (upper === 'TEST_METAL') {
        runSimulatedCycle('METAL');
      } else if (upper === 'TEST_DRY') {
        runSimulatedCycle('DRY');
      } else if (upper === 'TEST_WET') {
        runSimulatedCycle('WET');
      } else if (upper === 'TEST_SANITARY') {
        runSimulatedCycle('SANITARY');
      } else if (upper === 'HOME') {
        handleIncomingLine('SERVO:HOME:90', 'demo');
      } else if (upper === 'RESET') {
        handleIncomingLine('ACK:RESET', 'demo');
      } else {
        appendSerialLog('sys', `Simulated TX echo: ${clean}`);
      }
    }
  };

  const handleResetCounters = () => {
    setCounts(INITIAL_COUNTS);
    setEvents([]);
    setLatestAlertText(null);
    setSnapshot((prev) => ({
      ...prev,
      lastCategory: null,
      lastEventTimestamp: null,
      servoAngle: 90,
      stage: 'IDLE',
    }));
    appendSerialLog('sys', 'Counters and activity log reset.');
    if (connectionState === 'connected') {
      void handleSendSerialCommand('RESET');
    }
  };

  const handleExportCsv = () => {
    if (events.length === 0) return;
    const header = 'Time,Category,Chamber,ServoAngleDeg,DistanceCm,MoistureDO,MoistureAO,Source';
    const rows = events.map((ev) =>
      [
        ev.timestamp,
        ev.category,
        ev.chamberLabel,
        ev.servoAngle,
        ev.distanceCm ?? '',
        ev.wetDigital ?? '',
        ev.wetAnalog ?? '',
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#monitor"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monitor');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Auto Bin 4x
          </a>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="flex items-center gap-6 h-full overflow-x-auto">
            {(
              [
                { id: 'monitor', label: 'Live Monitor' },
                { id: 'sketch', label: 'Arduino Sketch' },
                { id: 'setup', label: 'Setup & Troubleshoot' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-full inline-flex items-center text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={connectArduino}
              disabled={connectionState === 'connecting'}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                connectionState === 'connected'
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
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
        {errorBanner && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-medium text-rose-800 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'monitor' && (
          <>
            {/* Workspace Control & Telemetry Toolbar */}
            <section className="bg-white border border-slate-200 rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              {/* Live Connection Status */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`text-sm font-semibold whitespace-nowrap ${
                    connectionState === 'connected'
                      ? 'text-emerald-700'
                      : demoMode
                      ? 'text-sky-700'
                      : connectionState === 'error'
                      ? 'text-rose-700'
                      : 'text-slate-700'
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
                <span className="text-xs text-slate-500 font-mono truncate">
                  {demoMode ? 'Simulated 9600 baud telemetry stream' : connectionMessage}
                </span>
              </div>

              {/* Hardware & Simulation Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Serial baud rate"
                  value={baudRate}
                  disabled={connectionState === 'connected'}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  <option value={9600}>9600 baud</option>
                  <option value={38400}>38400 baud</option>
                  <option value={57600}>57600 baud</option>
                  <option value={115200}>115200 baud</option>
                </select>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md cursor-pointer select-none whitespace-nowrap shrink-0">
                  <input
                    type="checkbox"
                    checked={showSanitaryChamber}
                    onChange={(e) => setShowSanitaryChamber(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900"
                  />
                  4-Way (Sanitary)
                </label>

                <button
                  type="button"
                  onClick={() => setDemoMode((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    demoMode
                      ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {demoMode ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {demoMode ? 'Stop Demo' : 'Simulate / Demo Mode'}
                </button>

                <button
                  type="button"
                  onClick={handleResetCounters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Counters
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStandaloneHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Download single-file HTML/CSS/JS Web Serial dashboard"
                >
                  <Download className="w-3.5 h-3.5" />
                  Single-File HTML
                </button>
              </div>
            </section>

            {/* Live Segregation Alert Strip */}
            {latestAlertText && (
              <div
                aria-live="polite"
                className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
              >
                <div className="font-medium text-slate-800">
                  <span className="font-mono text-slate-500 mr-2">LIVE EVENT</span>
                  {latestAlertText}
                </div>
                <button
                  type="button"
                  onClick={() => setLatestAlertText(null)}
                  className="text-slate-400 hover:text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}

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
