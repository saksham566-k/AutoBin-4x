import React from 'react';
import { motion } from 'motion/react';
import { CATEGORY_META, HardwareSnapshot } from '../types/telemetry';

interface HardwareVisualizerProps {
  snapshot: HardwareSnapshot;
  showSanitaryChamber: boolean;
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
}) => {
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
  const isWithinTrigger = snapshot.distanceCm !== null && snapshot.distanceCm <= 10;

  const moisturePct =
    snapshot.wetAnalog !== null
      ? Math.max(0, Math.min(100, Math.round((snapshot.wetAnalog / 1023) * 100)))
      : 0;

  const isSortingOrDetected =
    isWithinTrigger || snapshot.stage === 'OBJECT_DETECTED' || snapshot.stage === 'SORTING';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.12 }}
      className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-white">
            Dual-Servo & Sensor Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            HC-SR04 (D6/D7) · LM393 (D4/A0) · Metal (D2) · Servo 1 Wet/Dry (D9) · Servo 2 Metal/Dry (D10)
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
            <div className="text-[11px] text-slate-400">Servo 2 (Metal)</div>
            <div className="text-base font-bold" style={{ color: servo2Color }}>
              {snapshot.servo2Angle}°
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-12 gap-5 items-center">
        {/* Dual Servo Dials */}
        <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* Sensor Telemetry Readout Bars */}
        <div className="xl:col-span-5 space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-200">
                HC-SR04 Ultrasonic Distance{' '}
                <span className="font-mono text-slate-500">D6/D7</span>
              </span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {snapshot.distanceCm !== null ? `${snapshot.distanceCm} cm` : '-- cm'}{' '}
                <span className="font-normal text-slate-400">
                  ({isWithinTrigger ? 'Trigger <= 10 cm' : 'Threshold 10 cm'})
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

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-200">
                LM393 Moisture Sensor{' '}
                <span className="font-mono text-slate-500">DO D4 / AO A0</span>
              </span>
              <span className="font-mono tabular-nums text-white font-semibold">
                AO: {snapshot.wetAnalog !== null ? snapshot.wetAnalog : '--'} / 1023 · DO:{' '}
                {snapshot.wetDigital !== null ? snapshot.wetDigital : '--'}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${
                  snapshot.wetDigital === 0 ? 'bg-sky-400' : 'bg-emerald-400'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${moisturePct}%` }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="border border-slate-800 rounded-md px-3 py-2.5 bg-[#060913]/80">
              <div className="text-[11px] text-slate-400 font-mono">METAL PIN D2</div>
              <div
                className={`mt-1 text-sm font-semibold font-mono ${
                  snapshot.metalDetected ? 'text-amber-400' : 'text-slate-200'
                }`}
              >
                {snapshot.metalDetected ? 'HIGH (Metal)' : 'IDLE / LOW'}
              </div>
            </div>
            <div className="border border-slate-800 rounded-md px-3 py-2.5 bg-[#060913]/80">
              <div className="text-[11px] text-slate-400 font-mono">WET DO PIN D4</div>
              <div
                className={`mt-1 text-sm font-semibold font-mono ${
                  snapshot.wetDigital === 0
                    ? 'text-sky-400'
                    : snapshot.wetDigital === 1
                    ? 'text-emerald-400'
                    : 'text-slate-200'
                }`}
              >
                {snapshot.wetDigital === 0
                  ? 'LOW (Wet)'
                  : snapshot.wetDigital === 1
                  ? 'HIGH (Dry)'
                  : '--'}
              </div>
            </div>
            <div className="border border-slate-800 rounded-md px-3 py-2.5 bg-[#060913]/80 col-span-2">
              <div className="text-[11px] text-slate-400 font-mono">PIPELINE STAGE</div>
              <div className="mt-1 text-sm font-semibold font-mono text-sky-300 truncate">
                {snapshot.stage.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
