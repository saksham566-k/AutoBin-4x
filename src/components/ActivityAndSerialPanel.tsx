import React, { useEffect, useRef, useState } from 'react';
import {
  CATEGORY_META,
  ConnectionState,
  SegregationEvent,
  SerialLogEntry,
  WasteCategory,
} from '../types/telemetry';
import { Download, Send, Trash2 } from 'lucide-react';

interface ActivityAndSerialPanelProps {
  events: SegregationEvent[];
  serialLogs: SerialLogEntry[];
  connectionState: ConnectionState;
  demoMode: boolean;
  showSanitaryChamber: boolean;
  onClearEvents: () => void;
  onExportCsv: () => void;
  onClearSerial: () => void;
  onSendCommand: (command: string) => void;
}

export const ActivityAndSerialPanel: React.FC<ActivityAndSerialPanelProps> = ({
  events,
  serialLogs,
  connectionState,
  demoMode,
  showSanitaryChamber,
  onClearEvents,
  onExportCsv,
  onClearSerial,
  onSendCommand,
}) => {
  const [filter, setFilter] = useState<'ALL' | WasteCategory>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [commandInput, setCommandInput] = useState('');
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [serialLogs, autoScroll]);

  const filteredEvents =
    filter === 'ALL' ? events : events.filter((item) => item.category === filter);

  const filterOptions: Array<{ key: 'ALL' | WasteCategory; label: string }> = [
    { key: 'ALL', label: 'All' },
    { key: 'METAL', label: 'Metal' },
    { key: 'DRY', label: 'Dry' },
    { key: 'WET', label: 'Wet' },
    ...(showSanitaryChamber ? [{ key: 'SANITARY' as const, label: 'Sanitary' }] : []),
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    onSendCommand(trimmed);
    setCommandInput('');
  };

  const canSendCommands = connectionState === 'connected' || demoMode;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Live Activity & Segregation Log */}
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live Activity & Segregation Log
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'} shown
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onExportCsv}
              disabled={events.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={onClearEvents}
              disabled={events.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Log
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-3 flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === opt.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Event Stream List */}
        <div className="mt-3 flex-1 min-h-[290px] max-h-[360px] overflow-y-auto serial-scroll divide-y divide-slate-100">
          {filteredEvents.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-medium text-slate-700">
                No segregation events recorded yet
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Connect your Arduino Uno via USB Serial or enable Demo Mode to watch live sorting
                events stream into the chambers.
              </p>
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const meta = CATEGORY_META[ev.category];
              return (
                <div
                  key={ev.id}
                  className="py-2.5 flex items-start justify-between gap-4 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">
                      <span className={meta.accentText}>1 {meta.label} item</span> detected &
                      segregated &rarr; {ev.chamberLabel}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                      Servo {ev.servoAngle}°
                      {ev.distanceCm !== null ? ` · Dist ${ev.distanceCm} cm` : ''}
                      {ev.wetAnalog !== null ? ` · AO ${ev.wetAnalog}` : ''}
                      {' · '}
                      {ev.source === 'arduino' ? 'USB Serial' : 'Simulated'}
                    </div>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0 pt-0.5">
                    {ev.timestamp}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Raw Serial Monitor Console */}
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Raw Serial Monitor</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live RX / TX stream for hardware debugging
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              Auto-scroll
            </label>
            <button
              type="button"
              onClick={onClearSerial}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Console Viewport */}
        <div className="mt-3 bg-slate-900 text-slate-100 rounded-lg p-3 h-[265px] overflow-y-auto serial-scroll font-mono text-xs leading-relaxed">
          {serialLogs.length === 0 ? (
            <div className="text-slate-400">
              Serial console ready. Waiting for 9600 baud lines from Arduino Uno...
            </div>
          ) : (
            serialLogs.map((log) => (
              <div key={log.id} className="whitespace-pre-wrap break-all py-0.5">
                <span className="text-slate-500 tabular-nums">[{log.timestamp}]</span>{' '}
                <span
                  className={
                    log.direction === 'tx'
                      ? 'text-amber-400 font-semibold'
                      : log.direction === 'sys'
                      ? 'text-sky-400 font-semibold'
                      : 'text-emerald-400 font-semibold'
                  }
                >
                  {log.direction.toUpperCase()}
                </span>{' '}
                <span className="text-slate-100">{log.text}</span>
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>

        {/* Quick TX Commands */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {['PING', 'TEST_METAL', 'TEST_DRY', 'TEST_WET', 'HOME'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={!canSendCommands}
              onClick={() => onSendCommand(cmd)}
              className="px-2 py-1 text-[11px] font-mono font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Custom Serial Input */}
        <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            disabled={!canSendCommands}
            placeholder={
              canSendCommands
                ? 'Send serial command (e.g. PING, DEMO_ON)...'
                : 'Connect Arduino or enable Demo Mode to send commands'
            }
            className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={!canSendCommands || !commandInput.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </form>
      </section>
    </div>
  );
};
