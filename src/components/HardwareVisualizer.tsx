import React from 'react';
import { CATEGORY_META, HardwareSnapshot } from '../types/telemetry';

interface HardwareVisualizerProps {
  snapshot: HardwareSnapshot;
  showSanitaryChamber: boolean;
}

export const HardwareVisualizer: React.FC<HardwareVisualizerProps> = ({
  snapshot,
  showSanitaryChamber,
}) => {
  // Map servo angle (0..180) to SVG arc coordinates (center 160, 145, radius 95)
  // 0 deg = left (180 deg math), 90 deg = top (90 deg math), 180 deg = right (0 deg math)
  const angleToCoords = (servoDeg: number, radius: number) => {
    const rad = ((180 - servoDeg) * Math.PI) / 180;
    return {
      x: 160 + radius * Math.cos(rad),
      y: 145 - radius * Math.sin(rad),
    };
  };

  const needleTip = angleToCoords(snapshot.servoAngle, 80);

  const targets = [
    { deg: 30, label: 'Wet', color: CATEGORY_META.WET.strokeHex },
    ...(showSanitaryChamber
      ? [{ deg: 60, label: 'Sanitary', color: CATEGORY_META.SANITARY.strokeHex }]
      : []),
    { deg: 90, label: 'Home', color: '#475569' },
    { deg: 120, label: 'Dry', color: CATEGORY_META.DRY.strokeHex },
    { deg: 150, label: 'Metal', color: CATEGORY_META.METAL.strokeHex },
  ];

  const distancePct =
    snapshot.distanceCm !== null
      ? Math.max(0, Math.min(100, Math.round((snapshot.distanceCm / 30) * 100)))
      : 0;
  const isWithinTrigger = snapshot.distanceCm !== null && snapshot.distanceCm <= 10;

  const moisturePct =
    snapshot.wetAnalog !== null
      ? Math.max(0, Math.min(100, Math.round((snapshot.wetAnalog / 1023) * 100)))
      : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Hardware Sensor & Servo Telemetry
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Arduino Uno Pinout · HC-SR04 (D6/D7) · LM393 (D4/A0) · Metal (D2) · MG996R Servo (D9)
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">Active Servo Angle</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
            {snapshot.servoAngle}°
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Servo Dial Schematic */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-lg p-4">
          <svg
            viewBox="0 0 320 180"
            className="w-full max-w-[320px] h-auto"
            role="img"
            aria-label={`MG996R servo angle gauge currently at ${snapshot.servoAngle} degrees`}
          >
            {/* Outer Reference Arc (0° to 180°) */}
            <path
              d="M 65 145 A 95 95 0 0 1 255 145"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Target angle markers */}
            {targets.map((t) => {
              const outer = angleToCoords(t.deg, 108);
              const dot = angleToCoords(t.deg, 95);
              const isCurrent = Math.abs(snapshot.servoAngle - t.deg) <= 5;
              return (
                <g key={t.deg}>
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r={isCurrent ? 6 : 4}
                    fill={t.color}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                  <text
                    x={outer.x}
                    y={outer.y - 2}
                    textAnchor="middle"
                    className="fill-slate-600 text-[9px] font-mono font-medium"
                  >
                    {t.label} {t.deg}°
                  </text>
                </g>
              );
            })}

            {/* Center hub & animated needle */}
            <line
              x1="160"
              y1="145"
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="#0F172A"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="160" cy="145" r="8" fill="#0F172A" />
            <circle cx="160" cy="145" r="3" fill="#F8FAFC" />

            <text
              x="160"
              y="170"
              textAnchor="middle"
              className="fill-slate-500 text-[10px] font-mono"
            >
              MG996R CHUTE SERVO · PIN D9
            </text>
          </svg>
        </div>

        {/* Sensor Telemetry Table */}
        <div className="lg:col-span-7 space-y-4">
          {/* HC-SR04 Ultrasonic */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-700">
                HC-SR04 Ultrasonic Distance{' '}
                <span className="font-mono text-slate-400">D6/D7</span>
              </span>
              <span className="font-mono tabular-nums text-slate-900 font-semibold">
                {snapshot.distanceCm !== null ? `${snapshot.distanceCm} cm` : '-- cm'}{' '}
                <span className="font-normal text-slate-500">
                  ({isWithinTrigger ? 'Trigger <= 10 cm' : 'Threshold 10 cm'})
                </span>
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
              <div
                className={`h-full transition-all duration-200 ${
                  isWithinTrigger ? 'bg-sky-600' : 'bg-slate-400'
                }`}
                style={{ width: `${distancePct}%` }}
              />
            </div>
          </div>

          {/* LM393 Moisture Sensor */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-700">
                LM393 Moisture Sensor{' '}
                <span className="font-mono text-slate-400">DO D4 / AO A0</span>
              </span>
              <span className="font-mono tabular-nums text-slate-900 font-semibold">
                AO: {snapshot.wetAnalog !== null ? snapshot.wetAnalog : '--'} / 1023 · DO:{' '}
                {snapshot.wetDigital !== null ? snapshot.wetDigital : '--'}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  snapshot.wetDigital === 0 ? 'bg-sky-600' : 'bg-emerald-600'
                }`}
                style={{ width: `${moisturePct}%` }}
              />
            </div>
          </div>

          {/* Digital State Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            <div className="border border-slate-200 rounded-md px-3 py-2.5 bg-slate-50">
              <div className="text-[11px] text-slate-500 font-mono">METAL PIN D2</div>
              <div className="mt-1 text-sm font-semibold font-mono text-slate-900">
                {snapshot.metalDetected ? 'HIGH (Metal)' : 'IDLE / LOW'}
              </div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2.5 bg-slate-50">
              <div className="text-[11px] text-slate-500 font-mono">WET DO PIN D4</div>
              <div className="mt-1 text-sm font-semibold font-mono text-slate-900">
                {snapshot.wetDigital === 0
                  ? 'LOW (Wet)'
                  : snapshot.wetDigital === 1
                  ? 'HIGH (Dry)'
                  : '--'}
              </div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2.5 bg-slate-50 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-500 font-mono">PIPELINE STAGE</div>
              <div className="mt-1 text-sm font-semibold font-mono text-slate-900 truncate">
                {snapshot.stage.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
