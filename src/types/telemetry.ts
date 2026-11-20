export type WasteCategory = 'METAL' | 'DRY' | 'WET' | 'SANITARY';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type SortStage =
  | 'IDLE'
  | 'OBJECT_DETECTED'
  | 'CHECKING_MOISTURE'
  | 'CHECKING_METAL'
  | 'SORTING'
  | 'RETURNING_HOME';

export interface ChamberCounts {
  METAL: number;
  DRY: number;
  WET: number;
  SANITARY: number;
}

export interface SegregationEvent {
  id: string;
  category: WasteCategory;
  chamberLabel: string;
  servo1Angle: number;
  servo2Angle: number;
  distanceCm: number | null;
  wetDigital: number | null;
  wetAnalog: number | null;
  timestamp: string;
  isoTime: string;
  source: 'arduino' | 'demo';
  rawLine: string;
}

export interface SerialLogEntry {
  id: string;
  direction: 'rx' | 'tx' | 'sys';
  text: string;
  timestamp: string;
  category?: WasteCategory;
}

export interface HardwareSnapshot {
  distanceCm: number | null;
  wetDigital: number | null;
  wetAnalog: number | null;
  metalDetected: boolean;
  servo1Angle: number; // Pin D9: Wet / Dry Stage
  servo2Angle: number; // Pin D10: Metal / Non-Metal Stage
  stage: SortStage;
  lastCategory: WasteCategory | null;
  lastEventTimestamp: string | null;
}

export interface CategoryMeta {
  id: WasteCategory;
  label: string;
  chamberName: string;
  servo1Target: number;
  servo2Target: number;
  routeLabel: string;
  description: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  barColor: string;
  strokeHex: string;
  glowStyle: string;
}

export const CATEGORY_META: Record<WasteCategory, CategoryMeta> = {
  METAL: {
    id: 'METAL',
    label: 'Metal',
    chamberName: 'Metal Chamber',
    servo1Target: 120,
    servo2Target: 150,
    routeLabel: 'S1 120° · S2 150°',
    description: 'Dry pass on Servo 1 + metal divert on Servo 2',
    accentText: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-400/50',
    barColor: 'bg-amber-400',
    strokeHex: '#F59E0B',
    glowStyle: '0 0 28px rgba(245, 158, 11, 0.22)',
  },
  DRY: {
    id: 'DRY',
    label: 'Dry',
    chamberName: 'Dry Chamber',
    servo1Target: 120,
    servo2Target: 30,
    routeLabel: 'S1 120° · S2 30°',
    description: 'Dry pass on Servo 1 + non-metal divert on Servo 2',
    accentText: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-400/50',
    barColor: 'bg-emerald-400',
    strokeHex: '#10B981',
    glowStyle: '0 0 28px rgba(16, 185, 129, 0.22)',
  },
  WET: {
    id: 'WET',
    label: 'Wet',
    chamberName: 'Wet Chamber',
    servo1Target: 30,
    servo2Target: 90,
    routeLabel: 'S1 30° · S2 90°',
    description: 'LM393 moisture active state on Servo 1',
    accentText: 'text-sky-400',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-sky-400/50',
    barColor: 'bg-sky-400',
    strokeHex: '#38BDF8',
    glowStyle: '0 0 28px rgba(56, 189, 248, 0.22)',
  },
  SANITARY: {
    id: 'SANITARY',
    label: 'Sanitary',
    chamberName: 'Sanitary Chamber',
    servo1Target: 60,
    servo2Target: 90,
    routeLabel: 'S1 60° · S2 90°',
    description: '4-way sanitary chute on Servo 1',
    accentText: 'text-violet-400',
    accentBg: 'bg-violet-500/10',
    accentBorder: 'border-violet-400/50',
    barColor: 'bg-violet-400',
    strokeHex: '#A78BFA',
    glowStyle: '0 0 28px rgba(167, 139, 250, 0.22)',
  },
};
