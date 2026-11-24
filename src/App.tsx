import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle,
  Coins,
  Crosshair,
  Diamond,
  Film,
  Gauge,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Triangle,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { SkywayEngine } from './game/SkywayEngine';
import {
  HudSnapshot,
  PLANE_PRESETS,
  PlaneId,
  PowerUpType,
  PuzzleShape,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'intro',
  score: 0,
  bestScore: 0,
  distance: 0,
  coins: 0,
  totalCoins: 0,
  speedKmh: 348,
  boostEnergy: 100,
  isBoosting: false,
  plasmaAmmo: 3,
  maxPlasmaAmmo: 3,
  multiplier: 1,
  activePowerUps: [],
  hasShield: false,
  isNewBest: false,
  nearMissCount: 0,
  biomeNameAr: 'جسر الغروب السريع',
  crashReasonAr: '',
  eventBannerAr: '',
  puzzleHintShape: null,
};

const PUZZLE_META: Record<PuzzleShape, { labelAr: string }> = {
  triangle: { labelAr: 'مثلث' },
  diamond: { labelAr: 'معين' },
  ring: { labelAr: 'حلقة' },
};

interface SteerPadState {
  active: boolean;
  pointerId: number | null;
  originX: number;
  originY: number;
  anchorX: number;
  dx: number;
  dir: 'left' | 'right' | null;
}

interface FlightPadState {
  active: boolean;
  pointerId: number | null;
  originX: number;
  originY: number;
  dy: number;
  dir: 'up' | 'down' | null;
  vertLock: boolean;
}

const POWERUP_META: Record<
  PowerUpType,
  { labelAr: string; barClass: string; textClass: string }
> = {
  magnet: {
    labelAr: 'مغناطيس العملات',
    barClass: 'bg-red-500',
    textClass: 'text-red-400',
  },
  shield: {
    labelAr: 'درع الحماية',
    barClass: 'bg-cyan-400',
    textClass: 'text-cyan-300',
  },
  turbo: {
    labelAr: 'اندفاع توربو',
    barClass: 'bg-amber-400',
    textClass: 'text-amber-300',
  },
  multiplier: {
    labelAr: 'مضاعف النقاط ×2',
    barClass: 'bg-purple-400',
    textClass: 'text-purple-300',
  },
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SkywayEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [selectedPlane, setSelectedPlane] = useState<PlaneId>('falcon');
  const [muted, setMuted] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const [steerPad, setSteerPad] = useState<SteerPadState>({
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    anchorX: 0,
    dx: 0,
    dir: null,
  });

  const [flightPad, setFlightPad] = useState<FlightPadState>({
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    dy: 0,
    dir: null,
    vertLock: false,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new SkywayEngine(
      container,
      (snapshot) => setHud(snapshot),
      (lost) => setContextLost(lost),
    );
    engineRef.current = engine;
    setSelectedPlane(engine.getSelectedPlaneId());
    setMuted(engine.sound.isMuted());

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Reset active virtual pads if phase leaves playing
  useEffect(() => {
    if (hud.phase !== 'playing') {
      engineRef.current?.setBoostActive(false);
      setSteerPad((s) => (s.active ? { ...s, active: false, pointerId: null, dx: 0, dir: null } : s));
      setFlightPad((f) =>
        f.active ? { ...f, active: false, pointerId: null, dy: 0, dir: null, vertLock: false } : f,
      );
    }
  }, [hud.phase]);

  const handleSelectPlane = (id: PlaneId) => {
    setSelectedPlane(id);
    engineRef.current?.selectPlane(id);
  };

  const handleToggleMute = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !muted;
    engine.sound.setMuted(next);
    setMuted(next);
  };

  const handleStart = () => {
    engineRef.current?.startGame();
  };

  const handlePauseToggle = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (hud.phase === 'playing') engine.pauseGame();
    else if (hud.phase === 'paused') engine.resumeGame();
  };

  const handleReturnMenu = () => {
    engineRef.current?.returnToMenu();
  };

  // --- Right Half: Press-to-Appear Steering 3D Circle (يمين / يسار) ---
  const onSteerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (hud.phase !== 'playing') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSteerPad({
      active: true,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      anchorX: e.clientX,
      dx: 0,
      dir: null,
    });
  };

  const onSteerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!steerPad.active || steerPad.pointerId !== e.pointerId) return;
    const rawDx = e.clientX - steerPad.originX;
    const clampedDx = Math.max(-42, Math.min(42, rawDx));
    const stepDx = e.clientX - steerPad.anchorX;

    let nextAnchorX = steerPad.anchorX;
    let nextDir: 'left' | 'right' | null =
      clampedDx > 10 ? 'right' : clampedDx < -10 ? 'left' : null;

    if (stepDx > 26) {
      engineRef.current?.steerRight();
      nextAnchorX = e.clientX;
      nextDir = 'right';
    } else if (stepDx < -26) {
      engineRef.current?.steerLeft();
      nextAnchorX = e.clientX;
      nextDir = 'left';
    }

    setSteerPad((prev) => ({
      ...prev,
      anchorX: nextAnchorX,
      dx: clampedDx,
      dir: nextDir,
    }));
  };

  const onSteerPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPad.pointerId !== e.pointerId) return;
    setSteerPad((prev) => ({
      ...prev,
      active: false,
      pointerId: null,
      dx: 0,
      dir: null,
    }));
  };

  // --- Left Half: Press-to-Appear Speed & Altitude 3D Circle (سرعة / فوق / تحت) ---
  const onFlightPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (hud.phase !== 'playing') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    engineRef.current?.setBoostActive(true);
    setFlightPad({
      active: true,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      dy: 0,
      dir: null,
      vertLock: false,
    });
  };

  const onFlightPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!flightPad.active || flightPad.pointerId !== e.pointerId) return;
    const rawDy = e.clientY - flightPad.originY;
    const clampedDy = Math.max(-44, Math.min(44, rawDy));

    let nextLock = flightPad.vertLock;
    let nextDir: 'up' | 'down' | null =
      clampedDy < -12 ? 'up' : clampedDy > 12 ? 'down' : null;

    if (!flightPad.vertLock) {
      if (rawDy < -26) {
        engineRef.current?.climb();
        nextLock = true;
        nextDir = 'up';
      } else if (rawDy > 26) {
        engineRef.current?.diveRoll();
        nextLock = true;
        nextDir = 'down';
      }
    } else if (Math.abs(rawDy) < 12) {
      nextLock = false;
    }

    setFlightPad((prev) => ({
      ...prev,
      dy: clampedDy,
      dir: nextDir,
      vertLock: nextLock,
    }));
  };

  const onFlightPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (flightPad.pointerId !== e.pointerId) return;
    engineRef.current?.setBoostActive(false);
    setFlightPad((prev) => ({
      ...prev,
      active: false,
      pointerId: null,
      dy: 0,
      dir: null,
      vertLock: false,
    }));
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0b101d] text-slate-100">
      {/* Dedicated WebGL Mount Container */}
      <div ref={mountRef} className="fixed inset-0 w-full h-full" />

      {/* Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b101d] p-6 text-center">
          <div className="max-w-md rounded-xl border border-white/15 bg-[#12192b] p-6">
            <h2 className="text-xl font-bold text-white mb-2">
              تعذّر عرض المشهد ثلاثي الأبعاد مؤقتاً
            </h2>
            <p className="text-sm text-slate-300 mb-4">
              يرجى إعادة تحميل الصفحة لاستعادة محرك الرسوميات.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      )}

      {/* 3D Cinematic Intro Overlay */}
      {hud.phase === 'intro' && (
        <>
          <div className="pointer-events-none fixed top-0 inset-x-0 z-30 h-14 sm:h-16 bg-black flex items-center justify-center px-6">
            <div className="flex items-center gap-3 text-xs sm:text-sm tracking-wide text-slate-300">
              <span className="font-display font-bold text-amber-400">MRJOo</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span>تقديم سماء سابواي ثلاثية الأبعاد</span>
            </div>
          </div>

          <div className="pointer-events-none fixed top-20 inset-x-0 z-20 flex flex-col items-center text-center px-4">
            <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-white drop-shadow-lg">
              سماء سابواي
            </h1>
            <p className="mt-2 text-sm sm:text-base font-semibold text-amber-300 tracking-wide">
              طائرة MRJOo النفاثة — انطلق نحو الأفق اللا نهائي
            </p>
          </div>

          <div className="fixed bottom-0 inset-x-0 z-30 h-16 sm:h-20 bg-black flex items-center justify-between px-5 sm:px-8">
            <button
              type="button"
              onClick={() => engineRef.current?.skipIntro()}
              className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
            >
              تخطي التتر
            </button>
            <button
              type="button"
              onClick={handleStart}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              ابدأ الطيران
            </button>
          </div>
        </>
      )}

      {/* Top HUD Layer (Hidden during Cinematic Intro) */}
      {hud.phase !== 'intro' && (
        <header className="pointer-events-none fixed top-0 inset-x-0 z-20 flex items-start justify-between gap-4 p-4 sm:p-5">
        {/* Score & Distance Cluster */}
        <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-white/12 bg-[#0b101d]/85 px-4 py-2.5">
          <div>
            <div className="text-[11px] text-slate-400">النقاط</div>
            <div className="font-mono-num text-xl sm:text-2xl font-bold text-white leading-tight">
              {hud.score.toLocaleString('en-US')}
              {hud.multiplier > 1 && (
                <span className="mr-1.5 text-xs font-bold text-purple-300">
                  ×{hud.multiplier}
                </span>
              )}
            </div>
          </div>
          <div className="h-7 w-px bg-white/12" />
          <div>
            <div className="text-[11px] text-slate-400">المسافة</div>
            <div className="font-mono-num text-base sm:text-lg font-semibold text-sky-300 leading-tight">
              {hud.distance.toLocaleString('en-US')} م
            </div>
          </div>
          <div className="hidden sm:block h-7 w-px bg-white/12" />
          <div className="hidden sm:block">
            <div className="text-[11px] text-slate-400">أعلى رقم</div>
            <div className="font-mono-num text-base font-semibold text-amber-300 leading-tight">
              {hud.bestScore.toLocaleString('en-US')}
            </div>
          </div>
        </div>

        {/* Center Biome & Speed Indicator (Playing Only) */}
        {hud.phase === 'playing' && (
          <div className="hidden md:flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b101d]/80 px-4 py-2 text-xs text-slate-300">
            <span className="font-semibold text-white">{hud.biomeNameAr}</span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span className="font-mono-num text-amber-300">
              {hud.speedKmh} كم/س
            </span>
          </div>
        )}

        {/* Coins, Plasma Launcher & Action Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {hud.phase === 'playing' && (
            <button
              type="button"
              onClick={() => engineRef.current?.firePlasma()}
              disabled={hud.plasmaAmmo <= 0}
              aria-label="قذف نبضة بلازما"
              className={`flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-all cursor-pointer ${
                hud.plasmaAmmo > 0
                  ? 'border-cyan-300/50 bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-800 text-slate-950 shadow-[0_4px_0_#083344,0_8px_18px_rgba(6,182,212,0.35)] active:translate-y-0.5'
                  : 'border-white/10 bg-[#0b101d]/75 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Crosshair className="w-4 h-4" />
              <span>قذف</span>
              <span className="font-mono-num">{hud.plasmaAmmo}</span>
            </button>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-[#0b101d]/85 px-3.5 py-2.5">
            <Coins className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-mono-num text-base font-bold text-amber-300">
              {(hud.phase === 'menu' ? hud.totalCoins : hud.coins).toLocaleString(
                'en-US',
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-[#0b101d]/85 text-slate-200 hover:bg-[#162036] hover:text-white transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {(hud.phase === 'playing' || hud.phase === 'paused') && (
            <button
              type="button"
              onClick={handlePauseToggle}
              aria-label={hud.phase === 'paused' ? 'استئناف' : 'إيقاف مؤقت'}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-[#0b101d]/85 text-slate-200 hover:bg-[#162036] hover:text-white transition-colors cursor-pointer"
            >
              {hud.phase === 'paused' ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        </header>
      )}

      {/* Smart Puzzle Gate & Event Banner (Top-Center during Play) */}
      {hud.phase === 'playing' && (hud.puzzleHintShape || hud.eventBannerAr) && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          {hud.puzzleHintShape && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/50 bg-[#071917]/90 px-4 py-2 text-sm font-bold text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.28)]">
              {hud.puzzleHintShape === 'triangle' ? (
                <Triangle className="w-5 h-5 fill-emerald-400/30 text-emerald-300" />
              ) : hud.puzzleHintShape === 'diamond' ? (
                <Diamond className="w-5 h-5 fill-emerald-400/30 text-emerald-300" />
              ) : (
                <Circle className="w-5 h-5 text-emerald-300" />
              )}
              <span>بوابة الأمان: {PUZZLE_META[hud.puzzleHintShape].labelAr}</span>
            </div>
          )}
          {hud.eventBannerAr && (
            <div className="rounded-lg border border-amber-400/40 bg-[#0b101d]/90 px-3.5 py-1 text-xs sm:text-sm font-bold text-amber-300">
              {hud.eventBannerAr}
            </div>
          )}
        </div>
      )}

      {/* Active Power-ups Strip (Bottom Center during Play) */}
      {hud.phase === 'playing' && hud.activePowerUps.length > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2.5 max-w-[92vw]">
          {hud.activePowerUps.map((p) => {
            const meta = POWERUP_META[p.type];
            const pct = Math.max(0, Math.min(100, (p.remaining / p.duration) * 100));
            const Icon =
              p.type === 'magnet'
                ? Magnet
                : p.type === 'shield'
                  ? Shield
                  : p.type === 'turbo'
                    ? Zap
                    : Sparkles;
            return (
              <div
                key={p.type}
                className="w-40 rounded-lg border border-white/12 bg-[#0b101d]/85 px-3 py-2"
              >
                <div className="flex items-center justify-between text-[11px] mb-1 gap-1.5">
                  <span className={`flex items-center gap-1 font-semibold ${meta.textClass}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {meta.labelAr}
                  </span>
                  <span className="font-mono-num text-slate-300">
                    {p.remaining.toFixed(1)}ث
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full ${meta.barClass} transition-all duration-75`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Brief Initial Hint on Takeoff (Disappears after 110m so canvas stays completely clean) */}
      {hud.phase === 'playing' && hud.distance < 110 && !steerPad.active && !flightPad.active && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 z-15 text-center px-4">
          <div className="rounded-xl border border-white/10 bg-[#0b101d]/75 px-4 py-2 text-xs text-slate-300">
            اضغط واسحب على <span className="text-sky-300 font-bold">يمين الشاشة</span> للتوجيه · وعلى{' '}
            <span className="text-amber-300 font-bold">اليسار</span> للسرعة والأعلى والأسفل
          </div>
        </div>
      )}

      {/* Press-to-Appear Dual 3D Virtual Control Zones (Hidden until pressed!) */}
      {hud.phase === 'playing' && (
        <>
          {/* Right Zone: Steering 3D Circle (يمين وشمال) */}
          <div
            onPointerDown={onSteerPointerDown}
            onPointerMove={onSteerPointerMove}
            onPointerUp={onSteerPointerUp}
            onPointerCancel={onSteerPointerUp}
            className="fixed inset-y-0 right-0 w-1/2 z-10 touch-none select-none"
            aria-label="منطقة التحكم يمين ويسار"
          />

          {/* Left Zone: Speed & Altitude 3D Circle (سرعة وفوق وتحت) */}
          <div
            onPointerDown={onFlightPointerDown}
            onPointerMove={onFlightPointerMove}
            onPointerUp={onFlightPointerUp}
            onPointerCancel={onFlightPointerUp}
            className="fixed inset-y-0 left-0 w-1/2 z-10 touch-none select-none"
            aria-label="منطقة السرعة والأعلى والأسفل"
          />

          {/* Dynamic 3D Circle 1: Steering (Right side, appears ONLY on press) */}
          {steerPad.active && (
            <div
              className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: steerPad.originX, top: steerPad.originY }}
            >
              <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-sky-300/40 bg-gradient-to-b from-slate-700/85 via-slate-800/90 to-slate-950/95 shadow-[0_8px_0_#020617,0_16px_32px_rgba(0,0,0,0.6),inset_0_2px_5px_rgba(255,255,255,0.28)]">
                {/* Left / Right Labels inside 3D Ring */}
                <div
                  className={`absolute left-2.5 flex items-center gap-0.5 text-[11px] font-bold transition-colors ${
                    steerPad.dir === 'left' ? 'text-sky-300 scale-110' : 'text-slate-400'
                  }`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>يسار</span>
                </div>
                <div
                  className={`absolute right-2.5 flex items-center gap-0.5 text-[11px] font-bold transition-colors ${
                    steerPad.dir === 'right' ? 'text-sky-300 scale-110' : 'text-slate-400'
                  }`}
                >
                  <span>يمين</span>
                  <ArrowRight className="w-4 h-4" />
                </div>

                {/* Sliding 3D Thumb Puck */}
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-sky-200/70 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-slate-950 shadow-[0_4px_0_#082f49,0_0_20px_rgba(56,189,248,0.6),inset_0_2px_4px_rgba(255,255,255,0.55)]"
                  style={{ transform: `translate3d(${steerPad.dx}px, 0, 0)` }}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
                </div>
              </div>
            </div>
          )}

          {/* Dynamic 3D Circle 2: Speed & Up/Down (Left side, appears ONLY on press) */}
          {flightPad.active && (
            <div
              className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: flightPad.originX, top: flightPad.originY }}
            >
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-amber-300/45 bg-gradient-to-b from-slate-700/85 via-slate-800/90 to-slate-950/95 shadow-[0_8px_0_#020617,0_16px_32px_rgba(0,0,0,0.6),inset_0_2px_5px_rgba(255,255,255,0.28)]">
                {/* Circular Boost Energy Arc */}
                <svg
                  className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] -rotate-90"
                  viewBox="0 0 140 140"
                >
                  <circle
                    cx="70"
                    cy="70"
                    r="64"
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="5"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r="64"
                    fill="none"
                    stroke={hud.isBoosting ? '#fbbf24' : '#38bdf8'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={402.1}
                    strokeDashoffset={402.1 * (1 - hud.boostEnergy / 100)}
                  />
                </svg>

                {/* Top / Bottom Altitude Indicators */}
                <div
                  className={`absolute top-2 flex items-center gap-0.5 text-[11px] font-bold transition-colors ${
                    flightPad.dir === 'up' ? 'text-sky-300 scale-110' : 'text-slate-300'
                  }`}
                >
                  <ArrowUp className="w-4 h-4" />
                  <span>فوق</span>
                </div>
                <div
                  className={`absolute bottom-2 flex items-center gap-0.5 text-[11px] font-bold transition-colors ${
                    flightPad.dir === 'down' ? 'text-amber-300 scale-110' : 'text-slate-300'
                  }`}
                >
                  <ArrowDown className="w-4 h-4" />
                  <span>تحت</span>
                </div>

                {/* Sliding 3D Speed / Turbo Thumb Orb */}
                <div
                  className="flex h-14 w-14 flex-col items-center justify-center rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-400 via-orange-500 to-red-600 text-slate-950 shadow-[0_4px_0_#7c2d12,0_0_24px_rgba(245,158,11,0.75),inset_0_2px_4px_rgba(255,255,255,0.55)]"
                  style={{ transform: `translate3d(0, ${flightPad.dy}px, 0)` }}
                >
                  <Gauge className="w-4 h-4 stroke-[2.5]" />
                  <span className="font-mono-num text-[10px] font-extrabold leading-none mt-0.5">
                    {hud.speedKmh}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Menu Overlay: Top Title + Bottom Hangar Dock (Center 3D Viewport Open!) */}
      {hud.phase === 'menu' && (
        <>
          <div className="pointer-events-none fixed top-20 inset-x-0 z-10 flex flex-col items-center text-center px-4">
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white drop-shadow-md">
              سماء سابواي
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-slate-300 max-w-md">
              حلّق بطائرتك على طريق لا ينتهي، وتفادَ الحواجز والشاحنات واجمع العملات الذهبية
            </p>
          </div>

          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(780px,94vw)] rounded-2xl border border-white/14 bg-[#0b101d]/90 p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              {/* Aircraft Hangar Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PLANE_PRESETS.map((plane) => {
                  const active = selectedPlane === plane.id;
                  return (
                    <button
                      key={plane.id}
                      type="button"
                      onClick={() => handleSelectPlane(plane.id)}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-right transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-[#182238] text-white'
                          : 'border-white/10 bg-[#111829] text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <span
                        className="h-8 w-8 rounded-lg shrink-0 border border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${plane.swatchHex} 55%, ${plane.accentHex} 100%)`,
                        }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">
                          {plane.nameAr}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {plane.taglineAr}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Controls Guide + Start Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span>يمين الشاشة: دائرة يمين / يسار</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>يسار الشاشة: دائرة السرعة وفوق وتحت</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>F / زر القذف: إطلاق نبضة بلازما</span>
                </div>

                <div className="flex w-full sm:w-auto items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.replayIntro()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#162038] px-4 py-3 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-[#1e2b4a] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Film className="w-4 h-4 text-amber-400" />
                    تتر البداية
                  </button>

                  <button
                    type="button"
                    onClick={handleStart}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-7 py-3 text-sm sm:text-base font-extrabold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    ابدأ الطيران
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pause Modal */}
      {hud.phase === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#060913]/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0f1628] p-6 text-center">
            <h2 className="text-2xl font-bold text-white mb-1">
              اللعبة متوقفة مؤقتاً
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              المسافة الحالية {hud.distance.toLocaleString('en-US')} م · النقاط{' '}
              {hud.score.toLocaleString('en-US')}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                استئناف الطيران
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#162038] py-2.5 text-sm font-semibold text-white hover:bg-[#1e2b4a] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={handleReturnMenu}
                className="w-full rounded-xl py-2.5 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                العودة لاختيار الطائرة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {hud.phase === 'gameover' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#060913]/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0f1628] p-6">
            <div className="text-center mb-5">
              <div className="text-xs font-semibold text-red-400 mb-1">
                {hud.crashReasonAr || 'انتهت الرحلة'}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                نهاية الجولة
              </h2>
              {hud.isNewBest && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Trophy className="w-4 h-4" />
                  رقم قياسي جديد!
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl border border-white/10 bg-[#151e34] p-3.5 text-center">
                <div className="text-xs text-slate-400 mb-1">النتيجة النهائية</div>
                <div className="font-mono-num text-2xl font-bold text-white">
                  {hud.score.toLocaleString('en-US')}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#151e34] p-3.5 text-center">
                <div className="text-xs text-slate-400 mb-1">المسافة المقطوعة</div>
                <div className="font-mono-num text-2xl font-bold text-sky-300">
                  {hud.distance.toLocaleString('en-US')} م
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#151e34] p-3.5 text-center">
                <div className="text-xs text-slate-400 mb-1">العملات الذهبية</div>
                <div className="font-mono-num text-xl font-bold text-amber-300">
                  +{hud.coins.toLocaleString('en-US')}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#151e34] p-3.5 text-center">
                <div className="text-xs text-slate-400 mb-1">مناورات خطرة</div>
                <div className="font-mono-num text-xl font-bold text-emerald-300">
                  {hud.nearMissCount}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 font-extrabold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                العب مجدداً
              </button>
              <button
                type="button"
                onClick={handleReturnMenu}
                className="sm:w-40 rounded-xl border border-white/15 bg-[#162038] py-3 text-sm font-semibold text-white hover:bg-[#1e2b4a] transition-colors cursor-pointer"
              >
                تغيير الطائرة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
