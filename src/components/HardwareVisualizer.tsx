import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CATEGORY_META, ConnectionState, HardwareSnapshot } from '../types/telemetry';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';

interface HardwareVisualizerProps {
  snapshot: HardwareSnapshot;
  showSanitaryChamber: boolean;
  connectionState: ConnectionState;
  demoMode: boolean;
  onApplyMetalThreshold: (threshold: number) => void;
  onRequestSensorRead: () => void;
}

interface ServoTarget {
  deg: number;
  label: string;
  color: string;
}

interface SingleServoDialProps {
  title: string;
  subtitle: string;
  angle: number;
  targets: ServoTarget[];
  activeColor: string;
  pulseActive: boolean;
}

const SingleServoDial: React.FC<SingleServoDialProps> = ({
  title,
  subtitle,
  angle,
  targets,
  activeColor,
  pulseActive,
}) => {
  const cx = 135;
  const cy = 128;
  const radius = 78;

  const angleToCoords = (servoDeg: number, r: number) => {
    const rad = ((180 - servoDeg) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy - r * Math.sin(rad),
    };
  };

  const armRotation = angle - 90;

  return (
    <div className="bg-[#060913] border border-slate-800 rounded-lg p-3.5 flex flex-col items-center">
      <div className="w-full flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-slate-200">{title}</span>
        <span className="font-mono font-bold tabular-nums" style={{ color: activeColor }}>
          {angle}°
        </span>
      </div>

      <svg
        viewBox="0 0 270 160"
        className="w-full max-w-[260px] h-auto"
        role="img"
        aria-label={`${title} currently at ${angle} degrees`}
      >
        <circle
          cx={cx}
          cy={cy}
          r="30"
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeDasharray="3 3"
        />
        <circle
          cx={cx}
          cy={cy}
          r="55"
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeDasharray="3 3"
        />

        {pulseActive && (
          <motion.circle
            cx={cx}
            cy={cy}
            r="20"
            fill="none"
            stroke={activeColor}
            strokeWidth="1.5"
            initial={{ r: 18, opacity: 0.7 }}
            animate={{ r: 76, opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* Arc Track */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#1E293B"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* Target Markers */}
        {targets.map((t) => {
          const outer = angleToCoords(t.deg, radius + 16);
          const dot = angleToCoords(t.deg, radius);
          const isCurrent = Math.abs(angle - t.deg) <= 5;
          return (
            <g key={t.deg}>
              {isCurrent && (
                <motion.circle
                  cx={dot.x}
                  cy={dot.y}
                  r={8}
                  fill={t.color}
                  initial={{ opacity: 0.45, r: 6 }}
                  animate={{ opacity: [0.45, 0.12, 0.45], r: [6, 11, 6] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <circle
                cx={dot.x}
                cy={dot.y}
                r={isCurrent ? 5 : 3.5}
                fill={t.color}
                stroke="#060913"
                strokeWidth="1.75"
              />
              <text
                x={outer.x}
                y={outer.y - 1}
                textAnchor="middle"
                className={`text-[8.5px] font-mono ${
                  isCurrent ? 'fill-white font-semibold' : 'fill-slate-400'
                }`}
              >
                {t.label} {t.deg}°
              </text>
            </g>
          );
        })}

        {/* Spring-Animated Arm anchored strictly at bottom hub (cx, cy) */}
        <g transform={`translate(${cx}, ${cy})`}>
          <motion.g
            initial={false}
            animate={{ rotate: armRotation }}
            transition={{ type: 'spring', stiffness: 170, damping: 18, mass: 0.8 }}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            <rect
              x="-74"
              y="-74"
              width="148"
              height="148"
              fill="transparent"
              stroke="none"
              pointerEvents="none"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="-68"
              stroke={activeColor}
              strokeWidth="5"
              strokeLinecap="round"
              opacity="0.28"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="-67"
              stroke="#F8FAFC"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="0" cy="-67" r="3.5" fill={activeColor} />
          </motion.g>
        </g>

        {/* Bottom Pivot Hub */}
        <circle cx={cx} cy={cy} r="8.5" fill="#0F172A" stroke="#334155" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="3.5" fill={activeColor} />

        <text
          x={cx}
          y="152"
          textAnchor="middle"
          className="fill-slate-400 text-[9px] font-mono tracking-wider"
        >
          {subtitle}
        </text>
      </svg>
    </div>
  );
};

export const HardwareVisualizer: React.FC<HardwareVisualizerProps> = ({
  snapshot,
  showSanitaryChamber,
  connectionState,
  demoMode,
  onApplyMetalThreshold,
  onRequestSensorRead,
}) => {
  const [draftThreshold, setDraftThreshold] = useState<number>(snapshot.metalThreshold);
  const [openPlateAdc, setOpenPlateAdc] = useState<number | null>(null);
  const [bridgedPlateAdc, setBridgedPlateAdc] = useState<number | null>(null);

  useEffect(() => {
    setDraftThreshold(snapshot.metalThreshold);
  }, [snapshot.metalThreshold]);

  const servo1Targets: ServoTarget[] = [
    { deg: 30, label: 'Wet', color: CATEGORY_META.WET.strokeHex },
    ...(showSanitaryChamber
      ? [{ deg: 60, label: 'Sanitary', color: CATEGORY_META.SANITARY.strokeHex }]
      : []),
    { deg: 90, label: 'Home', color: '#94A3B8' },
    { deg: 120, label: 'Dry Pass', color: CATEGORY_META.DRY.strokeHex },
  ];

  const servo2Targets: ServoTarget[] = [
    { deg: 30, label: 'Dry', color: CATEGORY_META.DRY.strokeHex },
    { deg: 90, label: 'Home', color: '#94A3B8' },
    { deg: 150, label: 'Metal', color: CATEGORY_META.METAL.strokeHex },
  ];

  const servo1Color =
    snapshot.servo1Angle <= 45
      ? CATEGORY_META.WET.strokeHex
      : snapshot.servo1Angle <= 75
      ? CATEGORY_META.SANITARY.strokeHex
      : snapshot.servo1Angle >= 105
      ? CATEGORY_META.DRY.strokeHex
      : '#38BDF8';

  const servo2Color =
    snapshot.servo2Angle <= 55
      ? CATEGORY_META.DRY.strokeHex
      : snapshot.servo2Angle >= 125
      ? CATEGORY_META.METAL.strokeHex
      : '#38BDF8';

  const distancePct =
    snapshot.distanceCm !== null
      ? Math.max(0, Math.min(100, Math.round((snapshot.distanceCm / 30) * 100)))
      : 0;
  const isWithinTrigger =
    snapshot.distanceCm !== null && snapshot.distanceCm >= 4 && snapshot.distanceCm <= 12;

  const metalAdcPct =
    snapshot.metalAdc !== null
      ? Math.max(0, Math.min(100, Math.round((snapshot.metalAdc / 1023) * 100)))
      : 0;
  const thresholdPct = Math.max(
    0,
    Math.min(100, Math.round((snapshot.metalThreshold / 1023) * 100))
  );

  const isSortingOrDetected =
    isWithinTrigger ||
    snapshot.stage === 'OBJECT_DETECTED' ||
    snapshot.stage === 'CHECKING_AI' ||
    snapshot.stage === 'CHECKING_METAL' ||
    snapshot.stage === 'SORTING';

  const isConnectedOrDemo = connectionState === 'connected' || demoMode;

  const suggestedMidpoint =
    openPlateAdc !== null && bridgedPlateAdc !== null && bridgedPlateAdc > openPlateAdc
      ? Math.round((openPlateAdc + bridgedPlateAdc) / 2)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.12 }}
      className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-white">
            Dual-Servo & Sensor Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            HC-SR04 (D6/D7) · WitBlox AI Vision Inputs (D4 DRY / D5 WET) · Two-Plate Metal (A1) · Servos (D9/D10)
          </p>
        </div>
        <div className="flex items-center gap-5 shrink-0 font-mono tabular-nums">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Servo 1 (Wet/Dry)</div>
            <div className="text-base font-bold" style={{ color: servo1Color }}>
              {snapshot.servo1Angle}°
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Servo 2 (Metal/Dry)</div>
            <div className="text-base font-bold" style={{ color: servo2Color }}>
              {snapshot.servo2Angle}°
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Servo Dials + Live Sensor Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Dual Servo Dials */}
        <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SingleServoDial
            title="Servo 1 · Wet / Dry"
            subtitle="STAGE 1 CHUTE · PIN D9"
            angle={snapshot.servo1Angle}
            targets={servo1Targets}
            activeColor={servo1Color}
            pulseActive={isSortingOrDetected && snapshot.servo1Angle !== 90}
          />
          <SingleServoDial
            title="Servo 2 · Metal / Dry"
            subtitle="STAGE 2 CHUTE · PIN D10"
            angle={snapshot.servo2Angle}
            targets={servo2Targets}
            activeColor={servo2Color}
            pulseActive={
              (snapshot.stage === 'CHECKING_METAL' || snapshot.servo2Angle !== 90) &&
              isSortingOrDetected
            }
          />
        </div>

        {/* Sensor Telemetry Readout Column */}
        <div className="xl:col-span-6 space-y-4">
          {/* HC-SR04 Ultrasonic */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-200">
                HC-SR04 Ultrasonic Distance{' '}
                <span className="font-mono text-slate-500">D6/D7</span>
              </span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {snapshot.distanceCm !== null ? `${snapshot.distanceCm} cm` : '-- cm'}{' '}
                <span className="font-normal text-slate-400">
                  ({isWithinTrigger ? 'Trigger 4–12 cm' : 'Window 4–12 cm'})
                </span>
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${isWithinTrigger ? 'bg-sky-400' : 'bg-slate-500'}`}
                initial={{ width: 0 }}
                animate={{ width: `${distancePct}%` }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          {/* Two-Plate Analog Metal Sensor (A1) */}
          <div
            className={`border rounded-lg p-3.5 transition-colors ${
              snapshot.stage === 'CHECKING_METAL'
                ? 'border-amber-400/60 bg-amber-500/5'
                : 'border-slate-800 bg-[#060913]/80'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
              <span className="font-medium text-slate-200">
                Two-Plate Metal Contact{' '}
                <span className="font-mono text-slate-500">Analog A1</span>
                {snapshot.stage === 'CHECKING_METAL' && (
                  <span className="ml-2 font-mono text-amber-300">· Checking Plates</span>
                )}
              </span>
              <span className="font-mono tabular-nums text-white font-semibold">
                ADC: {snapshot.metalAdc !== null ? snapshot.metalAdc : '--'} / 1023{' '}
                <span className="font-normal text-slate-400">
                  (Threshold {snapshot.metalThreshold})
                </span>
              </span>
            </div>

            {/* ADC Bar with Threshold Marker */}
            <div className="relative h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${
                  snapshot.metalLatched || snapshot.metalContact
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${metalAdcPct}%` }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/90"
                style={{ left: `${thresholdPct}%` }}
                title={`Configured threshold: ${snapshot.metalThreshold}`}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-500 block text-[10px]">CONTACT NOW</span>
                <span
                  className={
                    snapshot.metalContact ? 'text-amber-400 font-semibold' : 'text-slate-300'
                  }
                >
                  {snapshot.metalContact ? 'Bridged' : 'Open'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">CYCLE LATCH</span>
                <span
                  className={
                    snapshot.metalLatched ? 'text-amber-400 font-semibold' : 'text-slate-300'
                  }
                >
                  {snapshot.metalLatched ? 'Latched (Metal)' : 'Cleared'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">THRESHOLD</span>
                <span className="text-sky-300 font-semibold">{snapshot.metalThreshold}</span>
              </div>
            </div>
          </div>

          {/* WitBlox AI Vision Digital Inputs (Read via Arduino) */}
          <div
            className={`border rounded-lg p-3.5 transition-colors ${
              snapshot.stage === 'AI_ERROR'
                ? 'border-rose-500/50 bg-rose-500/5'
                : snapshot.stage === 'CHECKING_AI'
                ? 'border-sky-400/50 bg-sky-500/5'
                : 'border-slate-800 bg-[#060913]/80'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="text-xs font-medium text-slate-200">
                WitBlox AI Vision Inputs{' '}
                <span className="text-slate-400 font-normal">(via Arduino D4 / D5)</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {connectionState === 'connected'
                  ? 'Arduino Link Active'
                  : demoMode
                  ? 'Simulated Signals'
                  : 'Arduino Offline'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="border-t border-slate-800 pt-2">
                <div className="text-[10px] text-slate-500">DRY PIN D4</div>
                <div
                  className={`mt-0.5 font-semibold ${
                    snapshot.aiDryActive ? 'text-emerald-400' : 'text-slate-300'
                  }`}
                >
                  {snapshot.aiDryActive === null
                    ? '--'
                    : snapshot.aiDryActive
                    ? 'Active'
                    : 'Inactive'}
                </div>
              </div>
              <div className="border-t border-slate-800 pt-2">
                <div className="text-[10px] text-slate-500">WET PIN D5</div>
                <div
                  className={`mt-0.5 font-semibold ${
                    snapshot.aiWetActive ? 'text-sky-400' : 'text-slate-300'
                  }`}
                >
                  {snapshot.aiWetActive === null
                    ? '--'
                    : snapshot.aiWetActive
                    ? 'Active'
                    : 'Inactive'}
                </div>
              </div>
              <div className="border-t border-slate-800 pt-2">
                <div className="text-[10px] text-slate-500">AI CLASS</div>
                <div
                  className={`mt-0.5 font-semibold ${
                    snapshot.aiClassification === 'WET'
                      ? 'text-sky-400'
                      : snapshot.aiClassification === 'DRY'
                      ? 'text-emerald-400'
                      : snapshot.aiClassification === 'CONFLICT' ||
                        snapshot.aiClassification === 'UNKNOWN'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {snapshot.aiClassification}
                </div>
              </div>
              <div className="border-t border-slate-800 pt-2">
                <div className="text-[10px] text-slate-500">VALIDITY</div>
                <div
                  className={`mt-0.5 font-semibold ${
                    snapshot.aiValidity === 'VALID'
                      ? 'text-emerald-400'
                      : snapshot.aiValidity === 'CONFLICT' || snapshot.aiValidity === 'UNKNOWN'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {snapshot.aiValidity}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metal Plate Calibration Strip */}
      <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>Two-Plate Metal Calibration (A1)</span>
          </div>
          <p className="text-xs text-slate-400">
            Capture baseline readings with plates open vs bridged by metal, then apply your threshold explicitly.
            {openPlateAdc !== null && (
              <span className="font-mono text-slate-300 ml-2 tabular-nums">
                Open: {openPlateAdc}
              </span>
            )}
            {bridgedPlateAdc !== null && (
              <span className="font-mono text-amber-300 ml-2 tabular-nums">
                Bridged: {bridgedPlateAdc}
              </span>
            )}
            {suggestedMidpoint !== null && (
              <button
                type="button"
                onClick={() => setDraftThreshold(suggestedMidpoint)}
                className="ml-2 font-mono text-sky-400 hover:underline cursor-pointer"
              >
                Use midpoint ({suggestedMidpoint})
              </button>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!isConnectedOrDemo}
            onClick={onRequestSensorRead}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-700 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Read A1
          </button>

          <button
            type="button"
            disabled={snapshot.metalAdc === null}
            onClick={() => snapshot.metalAdc !== null && setOpenPlateAdc(snapshot.metalAdc)}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-700 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
          >
            Capture Open
          </button>

          <button
            type="button"
            disabled={snapshot.metalAdc === null}
            onClick={() => snapshot.metalAdc !== null && setBridgedPlateAdc(snapshot.metalAdc)}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-700 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
          >
            Capture Bridged
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <label htmlFor="metalThresholdInput" className="text-xs text-slate-400 whitespace-nowrap">
              Threshold
            </label>
            <input
              id="metalThresholdInput"
              type="number"
              min={50}
              max={1000}
              step={10}
              value={draftThreshold}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setDraftThreshold(v);
              }}
              className="w-20 px-2.5 py-1 text-xs font-mono tabular-nums bg-[#050811] border border-slate-700 rounded-md text-slate-100"
            />
            <button
              type="button"
              onClick={() =>
                onApplyMetalThreshold(Math.max(50, Math.min(1000, draftThreshold || 700)))
              }
              className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-md hover:bg-amber-300 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Apply Threshold
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
