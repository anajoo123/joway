export type GamePhase = 'intro' | 'menu' | 'playing' | 'paused' | 'gameover';

export type PlaneId = 'falcon' | 'comet' | 'nighthawk';

export interface PlanePreset {
  id: PlaneId;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;
  canopyColor: number;
  swatchHex: string;
  accentHex: string;
}

export const PLANE_PRESETS: PlanePreset[] = [
  {
    id: 'falcon',
    nameAr: 'صقر الصحراء',
    nameEn: 'Desert Falcon',
    taglineAr: 'توازن مثالي وأجنحة ذهبية',
    primaryColor: 0xd93829,
    secondaryColor: 0xf4f4f6,
    accentColor: 0xf59e0b,
    canopyColor: 0x1e293b,
    swatchHex: '#d93829',
    accentHex: '#f59e0b',
  },
  {
    id: 'comet',
    nameAr: 'الشهاب الأزرق',
    nameEn: 'Blue Comet',
    taglineAr: 'انسيابية فائقة وهيكل بلاتيني',
    primaryColor: 0x0284c7,
    secondaryColor: 0xe2e8f0,
    accentColor: 0x06b6d4,
    canopyColor: 0x0f172a,
    swatchHex: '#0284c7',
    accentHex: '#06b6d4',
  },
  {
    id: 'nighthawk',
    nameAr: 'النسر الليلي',
    nameEn: 'Night Hawk',
    taglineAr: 'تخفي أسود وتوربو عنبري',
    primaryColor: 0x1e2433,
    secondaryColor: 0x475569,
    accentColor: 0xf97316,
    canopyColor: 0x020617,
    swatchHex: '#1e2433',
    accentHex: '#f97316',
  },
];

export type PowerUpType = 'magnet' | 'shield' | 'turbo' | 'multiplier';

export interface ActivePowerUpState {
  type: PowerUpType;
  remaining: number;
  duration: number;
}

export type PuzzleShape = 'triangle' | 'diamond' | 'ring';

export interface HudSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  distance: number;
  coins: number;
  totalCoins: number;
  speedKmh: number;
  boostEnergy: number;
  isBoosting: boolean;
  plasmaAmmo: number;
  maxPlasmaAmmo: number;
  multiplier: number;
  activePowerUps: ActivePowerUpState[];
  hasShield: boolean;
  isNewBest: boolean;
  nearMissCount: number;
  biomeNameAr: string;
  crashReasonAr: string;
  eventBannerAr: string;
  puzzleHintShape: PuzzleShape | null;
}

export type ObstacleKind =
  | 'low_barrier'
  | 'high_gate'
  | 'full_truck'
  | 'ramp'
  | 'catapult'
  | 'boost_pad'
  | 'puzzle_open'
  | 'puzzle_locked';
