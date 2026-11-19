import React from 'react';
import { CATEGORY_META, ChamberCounts, HardwareSnapshot, WasteCategory } from '../types/telemetry';
import { Droplets, Hammer, Leaf, Plus, ShieldAlert } from 'lucide-react';

interface ChamberCardsProps {
  counts: ChamberCounts;
  snapshot: HardwareSnapshot;
  recentFlashCategory: WasteCategory | null;
  showSanitaryChamber: boolean;
  onSimulateCategory: (category: WasteCategory) => void;
}

const CHAMBER_ICONS: Record<WasteCategory, React.ReactNode> = {
  METAL: <Hammer className="w-4 h-4 text-amber-700" />,
  DRY: <Leaf className="w-4 h-4 text-emerald-700" />,
  WET: <Droplets className="w-4 h-4 text-sky-700" />,
  SANITARY: <ShieldAlert className="w-4 h-4 text-violet-700" />,
};

export const ChamberCards: React.FC<ChamberCardsProps> = ({
  counts,
  snapshot,
  recentFlashCategory,
  showSanitaryChamber,
  onSimulateCategory,
}) => {
  const visibleCategories: WasteCategory[] = showSanitaryChamber
    ? ['METAL', 'DRY', 'WET', 'SANITARY']
    : ['METAL', 'DRY', 'WET'];

  const totalItems =
    counts.METAL + counts.DRY + counts.WET + (showSanitaryChamber ? counts.SANITARY : 0);

  const lastMeta = snapshot.lastCategory ? CATEGORY_META[snapshot.lastCategory] : null;

  return (
    <div className="space-y-4">
      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Total Items Segregated</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
              {totalItems}
            </span>
            <span className="text-xs font-mono text-slate-500">items</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {showSanitaryChamber ? '4-way active sorting' : '3-way active sorting'} ·{' '}
            {counts.METAL} metal · {counts.DRY} dry · {counts.WET} wet
            {showSanitaryChamber ? ` · ${counts.SANITARY} sanitary` : ''}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Last Detected Category</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tracking-tight ${
                lastMeta ? lastMeta.accentText : 'text-slate-400'
              }`}
            >
              {lastMeta ? lastMeta.label : 'Awaiting Item'}
            </span>
            {lastMeta && (
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {lastMeta.chamberName}
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            {snapshot.lastEventTimestamp
              ? `Updated ${snapshot.lastEventTimestamp}`
              : 'No segregation events recorded yet'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Current Sensor & Servo State</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {snapshot.distanceCm !== null ? `${snapshot.distanceCm} cm` : '-- cm'}
            </span>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              AO {snapshot.wetAnalog !== null ? snapshot.wetAnalog : '--'} · Servo{' '}
              {snapshot.servoAngle}°
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Stage:{' '}
            <span className="font-mono text-slate-700">
              {snapshot.stage.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Segregation Chamber Cards */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          showSanitaryChamber ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } gap-4`}
      >
        {visibleCategories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const count = counts[cat];
          const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;
          const isFlashing = recentFlashCategory === cat;

          return (
            <div
              key={cat}
              className={`bg-white border rounded-lg p-5 transition-colors duration-200 ${
                isFlashing
                  ? `${meta.accentBorder} ${meta.accentBg}`
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {CHAMBER_ICONS[cat]}
                  <h3 className="text-sm font-semibold text-slate-900 truncate">
                    {meta.label} Segregated
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                  {meta.defaultAngle}°
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-2">
                <span className="text-4xl font-bold font-mono tabular-nums text-slate-900">
                  {count}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {pct}% share
                </span>
              </div>

              <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${meta.barColor} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-500 truncate">{meta.chamberName}</span>
                <button
                  type="button"
                  onClick={() => onSimulateCategory(cat)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title={`Simulate 1 ${meta.label} item detection`}
                >
                  <Plus className="w-3 h-3" />
                  Test {meta.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
