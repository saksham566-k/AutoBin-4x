import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  METAL: <Hammer className="w-4 h-4 text-amber-400" />,
  DRY: <Leaf className="w-4 h-4 text-emerald-400" />,
  WET: <Droplets className="w-4 h-4 text-sky-400" />,
  SANITARY: <ShieldAlert className="w-4 h-4 text-violet-400" />,
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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="text-xs font-medium text-slate-400">Total Items Segregated</div>
          <div className="mt-2 flex items-baseline gap-2 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={totalItems}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="text-3xl font-bold font-mono tabular-nums text-white inline-block"
              >
                {totalItems}
              </motion.span>
            </AnimatePresence>
            <span className="text-xs font-mono text-slate-500">items</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 tabular-nums">
            {showSanitaryChamber ? '4-way sorting' : '3-way sorting'} · {counts.METAL} metal ·{' '}
            {counts.DRY} dry · {counts.WET} wet
            {showSanitaryChamber ? ` · ${counts.SANITARY} sanitary` : ''}
            {snapshot.errorCount > 0 ? ` · ${snapshot.errorCount} AI hold` : ''}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="text-xs font-medium text-slate-400">Last Segregated Category</div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={snapshot.stage === 'AI_ERROR' ? 'error' : lastMeta ? lastMeta.id : 'none'}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.18 }}
                className={`text-2xl font-bold tracking-tight ${
                  snapshot.stage === 'AI_ERROR'
                    ? 'text-rose-400'
                    : lastMeta
                    ? lastMeta.accentText
                    : 'text-slate-500'
                }`}
              >
                {snapshot.stage === 'AI_ERROR'
                  ? 'AI Safe Hold'
                  : lastMeta
                  ? lastMeta.label
                  : 'Awaiting Item'}
              </motion.span>
            </AnimatePresence>
            {snapshot.stage !== 'AI_ERROR' && lastMeta && (
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {lastMeta.chamberName}
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-mono tabular-nums truncate">
            {snapshot.stage === 'AI_ERROR' && snapshot.lastErrorReason
              ? `Fault: ${snapshot.lastErrorReason} (servos kept at 90°)`
              : snapshot.lastEventTimestamp
              ? `Updated ${snapshot.lastEventTimestamp}`
              : 'No physical segregation events recorded yet'}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="bg-[#0B1120]/90 border border-slate-800/90 rounded-lg p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="text-xs font-medium text-slate-400">
            WitBlox AI · Metal A1 · Dual Servos
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold font-mono tabular-nums text-white">
              {snapshot.distanceCm !== null ? `${snapshot.distanceCm} cm` : '-- cm'}
            </span>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              AI {snapshot.aiClassification} · A1{' '}
              {snapshot.metalAdc !== null ? snapshot.metalAdc : '--'} · S1 {snapshot.servo1Angle}° ·
              S2 {snapshot.servo2Angle}°
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Stage:{' '}
            <span
              className={`font-mono ${
                snapshot.stage === 'AI_ERROR'
                  ? 'text-rose-400'
                  : snapshot.stage === 'CHECKING_METAL'
                  ? 'text-amber-300'
                  : 'text-sky-300'
              }`}
            >
              {snapshot.stage.replace(/_/g, ' ')}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Segregation Chamber Cards */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          showSanitaryChamber ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } gap-4`}
      >
        {visibleCategories.map((cat, index) => {
          const meta = CATEGORY_META[cat];
          const count = counts[cat];
          const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;
          const isFlashing = recentFlashCategory === cat;

          return (
            <motion.div
              key={cat}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: isFlashing ? 1.015 : 1,
              }}
              transition={{ duration: 0.22, delay: index * 0.04 }}
              style={{
                boxShadow: isFlashing
                  ? meta.glowStyle
                  : 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              className={`bg-[#0B1120]/90 border rounded-lg p-5 transition-colors duration-200 ${
                isFlashing
                  ? `${meta.accentBorder} ${meta.accentBg}`
                  : 'border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {CHAMBER_ICONS[cat]}
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    {meta.label} Segregated
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                  {meta.routeLabel}
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-2 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="text-4xl font-bold font-mono tabular-nums text-white inline-block"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {pct}% share
                </span>
              </div>

              <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${meta.barColor}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                <span className="text-xs text-slate-400 truncate" title={meta.description}>
                  {meta.chamberName}
                </span>
                <button
                  type="button"
                  onClick={() => onSimulateCategory(cat)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-700 hover:text-white active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  title={`Simulate 1 ${meta.label} item detection`}
                >
                  <Plus className="w-3 h-3" />
                  Sim {meta.label}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
