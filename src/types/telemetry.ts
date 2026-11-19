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
  servoAngle: number;
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
  servoAngle: number;
  stage: SortStage;
  lastCategory: WasteCategory | null;
  lastEventTimestamp: string | null;
}

export interface CategoryMeta {
  id: WasteCategory;
  label: string;
  chamberName: string;
  defaultAngle: number;
  description: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  barColor: string;
  strokeHex: string;
}

export const CATEGORY_META: Record<WasteCategory, CategoryMeta> = {
  METAL: {
    id: 'METAL',
    label: 'Metal',
    chamberName: 'Metal Chamber',
    defaultAngle: 150,
    description: 'Dry + conductive metal touch detection',
    accentText: 'text-amber-700',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
    barColor: 'bg-amber-500',
    strokeHex: '#D97706',
  },
  DRY: {
    id: 'DRY',
    label: 'Dry',
    chamberName: 'Dry Chamber',
    defaultAngle: 120,
    description: 'Non-wet + non-metallic general dry waste',
    accentText: 'text-emerald-700',
    accentBg: 'bg-emerald-50',
    accentBorder: 'border-emerald-200',
    barColor: 'bg-emerald-600',
    strokeHex: '#059669',
  },
  WET: {
    id: 'WET',
    label: 'Wet',
    chamberName: 'Wet Chamber',
    defaultAngle: 30,
    description: 'LM393 moisture active state triggered',
    accentText: 'text-sky-700',
    accentBg: 'bg-sky-50',
    accentBorder: 'border-sky-200',
    barColor: 'bg-sky-600',
    strokeHex: '#0284C7',
  },
  SANITARY: {
    id: 'SANITARY',
    label: 'Sanitary',
    chamberName: 'Sanitary Chamber',
    defaultAngle: 60,
    description: '4-way sanitary / bio-reject chute',
    accentText: 'text-violet-700',
    accentBg: 'bg-violet-50',
    accentBorder: 'border-violet-200',
    barColor: 'bg-violet-600',
    strokeHex: '#7C3AED',
  },
};
