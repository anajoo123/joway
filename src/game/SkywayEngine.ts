import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  AirplaneRig,
  createAirplaneModel,
  createCoinMesh,
  createObstacleModel,
  createPlasmaBoltMesh,
  createPowerUpMesh,
  createRoadSegment,
  createSkyDome,
} from './models';
import { SoundEngine } from './sound';
import { createProceduralTextures, ProceduralTextures } from './textures';
import {
  ActivePowerUpState,
  GamePhase,
  HudSnapshot,
  ObstacleKind,
  PLANE_PRESETS,
  PlaneId,
  PowerUpType,
  PuzzleShape,
} from './types';

interface ObstacleEntity {
  id: number;
  kind: ObstacleKind;
  lane: number; // -1, 0, 1
  z: number;
  mesh: THREE.Group;
  speedOffset: number; // trucks can drive slightly toward player
  nearMissAwarded: boolean;
  smashed: boolean;
}

interface CoinEntity {
  mesh: THREE.Group;
  lane: number;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

interface PowerUpEntity {
  type: PowerUpType;
  mesh: THREE.Group;
  lane: number;
  y: number;
  z: number;
  collected: boolean;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface PlasmaBolt {
  mesh: THREE.Group;
  lane: number;
  x: number;
  y: number;
  z: number;
}

interface BiomePalette {
  nameAr: string;
  skyHex: number;
  fogHex: number;
  sunHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  topHex: number;
  midHex: number;
  horizonHex: number;
}

const BIOMES: BiomePalette[] = [
  {
    nameAr: 'جسر الغروب السريع',
    skyHex: 0x0f172a,
    fogHex: 0x1a1c36,
    sunHex: 0xffb36b,
    hemiSkyHex: 0x93c5fd,
    hemiGroundHex: 0x1e293b,
    topHex: 0x070d1f,
    midHex: 0x162447,
    horizonHex: 0xe07a5f,
  },
  {
    nameAr: 'سماء النيون الليلية',
    skyHex: 0x060b1c,
    fogHex: 0x0b1630,
    sunHex: 0x7dd3fc,
    hemiSkyHex: 0x38bdf8,
    hemiGroundHex: 0x0f172a,
    topHex: 0x040714,
    midHex: 0x0c1b3a,
    horizonHex: 0x0284c7,
  },
  {
    nameAr: 'فجر الأبراج الشاهقة',
    skyHex: 0x101d33,
    fogHex: 0x1c2b44,
    sunHex: 0xfde68a,
    hemiSkyHex: 0xbae6fd,
    hemiGroundHex: 0x1e293b,
    topHex: 0x091326,
    midHex: 0x1d3557,
    horizonHex: 0xf59e0b,
  },
];

const LANE_WIDTH = 3.6;
const SEGMENT_LENGTH = 24;
const SEGMENT_COUNT = 12;
const CRUISE_Y = 1.25;
const DUCK_Y = 0.62;
const GRAVITY = 36;
const JUMP_VY = 14.2;
const RAMP_VY = 17.5;
const BASE_SPEED = 29;
const MAX_SPEED = 64;

const _skyColor = new THREE.Color();
const _targetSkyColor = new THREE.Color();
const _fogColor = new THREE.Color();
const _targetFogColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _targetSunColor = new THREE.Color();

export class SkywayEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onContextLostCb: (lost: boolean) => void;
  public sound: SoundEngine;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextures;
  private envRT: THREE.WebGLRenderTarget;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;

  private roadSegments: THREE.Group[] = [];
  private skyDome: ReturnType<typeof createSkyDome>;
  private planeRig: AirplaneRig;
  private contactShadowMesh: THREE.Mesh;

  private obstacles: ObstacleEntity[] = [];
  private coins: CoinEntity[] = [];
  private powerUps: PowerUpEntity[] = [];
  private particles: SparkParticle[] = [];
  private plasmaBolts: PlasmaBolt[] = [];
  private nextObstacleId = 1;

  // Starfield / Sky dust
  private skyParticles: THREE.Points;

  // Wingtip condensation trails
  private readonly trailPointsCount = 24;
  private leftTrailLine: THREE.Line;
  private rightTrailLine: THREE.Line;
  private leftTrailHistory: Float32Array;
  private rightTrailHistory: Float32Array;
  private _tipVec = new THREE.Vector3();
  private _camTargetPos = new THREE.Vector3();
  private _camLookTarget = new THREE.Vector3();

  // Intro 3D skyway rings
  private introRings: THREE.Mesh[] = [];

  // Game state
  private phase: GamePhase = 'intro';
  private introTimer = 0;
  private readonly introDuration = 7.4;
  private selectedPlaneId: PlaneId = 'falcon';
  private currentLane = 0; // -1, 0, 1
  private planeX = 0;
  private planeY = CRUISE_Y;
  private planeVy = 0;
  private currentBank = 0;
  private currentPitch = 0;
  private currentYaw = 0;
  private isGrounded = true;
  private duckTimer = 0;
  private barrelRollProgress = 0;
  private invulnTimer = 0;

  private speed = BASE_SPEED;
  private boostEnergy = 100;
  private manualBoost = false;
  private plasmaAmmo = 3;
  private readonly maxPlasmaAmmo = 3;
  private plasmaRechargeAccum = 0;
  private distance = 0;
  private score = 0;
  private runCoins = 0;
  private totalCoins = 0;
  private bestScore = 0;
  private isNewBest = false;
  private nearMissCount = 0;
  private crashReasonAr = '';
  private eventBannerAr = '';
  private eventBannerTimer = 0;
  private puzzleHintShape: PuzzleShape | null = null;
  private puzzleHintTimer = 0;

  private powerTimers: Record<PowerUpType, number> = {
    magnet: 0,
    shield: 0,
    turbo: 0,
    multiplier: 0,
  };
  private readonly powerDurations: Record<PowerUpType, number> = {
    magnet: 8.5,
    shield: 18,
    turbo: 4.8,
    multiplier: 10,
  };

  private spawnDistanceAccum = 0;
  private nextSpawnGap = 32;
  private spawnPatternCount = 0;
  private cameraShake = 0;
  private currentFov = 60;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private hudEmitAccum = 0;

  constructor(
    container: HTMLElement,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onContextLost: (lost: boolean) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onContextLostCb = onContextLost;
    this.sound = new SoundEngine();

    try {
      this.bestScore = Number(localStorage.getItem('skyway_best') || '0') || 0;
      this.totalCoins = Number(localStorage.getItem('skyway_coins') || '0') || 0;
      const savedPlane = localStorage.getItem('skyway_plane') as PlaneId | null;
      if (savedPlane && PLANE_PRESETS.some((p) => p.id === savedPlane)) {
        this.selectedPlaneId = savedPlane;
      }
    } catch {
      // ignore storage errors
    }

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // WebGL context loss safety
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    // 3. Scene, Gradient Sky Dome & Camera
    this.scene = new THREE.Scene();
    const initBiome = BIOMES[0];
    this.scene.background = new THREE.Color(initBiome.skyHex);
    this.scene.fog = new THREE.FogExp2(initBiome.fogHex, 0.0052);
    this.skyDome = createSkyDome();
    this.scene.add(this.skyDome.mesh);

    const aspect =
      (container.clientWidth || window.innerWidth) /
      Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.2, 320);
    this.camera.position.set(0, 4.3, 8.6);
    this.camera.lookAt(0, 1.5, -14);

    // 4. Studio Environment Map (PMREM + RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // 5. Three-Point + Outdoor Lighting
    this.hemiLight = new THREE.HemisphereLight(
      initBiome.hemiSkyHex,
      initBiome.hemiGroundHex,
      0.85,
    );
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(initBiome.sunHex, 1.75);
    this.keyLight.position.set(16, 26, 12);
    if (!this.isSoftwareGl) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.width = 1024;
      this.keyLight.shadow.mapSize.height = 1024;
      this.keyLight.shadow.camera.near = 2;
      this.keyLight.shadow.camera.far = 75;
      const d = 18;
      this.keyLight.shadow.camera.left = -d;
      this.keyLight.shadow.camera.right = d;
      this.keyLight.shadow.camera.top = d;
      this.keyLight.shadow.camera.bottom = -d;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    this.rimLight.position.set(-14, 10, -24);
    this.scene.add(this.rimLight);

    // 6. Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // 7. Endless Road Segments
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = createRoadSegment(SEGMENT_LENGTH, this.textures, this.isSoftwareGl);
      seg.position.z = -i * SEGMENT_LENGTH;
      this.scene.add(seg);
      this.roadSegments.push(seg);
    }

    // 8. High-Altitude Speed Dust / Stars
    const starCount = 280;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 60;
      starPos[i * 3 + 1] = 2 + Math.random() * 24;
      starPos[i * 3 + 2] = -Math.random() * 200;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xf8fafc,
      size: 0.22,
      transparent: true,
      opacity: 0.55,
    });
    this.skyParticles = new THREE.Points(starGeo, starMat);
    this.scene.add(this.skyParticles);

    // 9. Hero Airplane & Contact Shadow
    const preset =
      PLANE_PRESETS.find((p) => p.id === this.selectedPlaneId) || PLANE_PRESETS[0];
    this.planeRig = createAirplaneModel(preset, this.textures, this.isSoftwareGl);
    this.planeRig.group.position.set(0, CRUISE_Y, 0);
    this.scene.add(this.planeRig.group);

    // Wingtip Vapor Trails
    this.leftTrailHistory = new Float32Array(this.trailPointsCount * 3);
    this.rightTrailHistory = new Float32Array(this.trailPointsCount * 3);
    const lTrailGeo = new THREE.BufferGeometry();
    lTrailGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.leftTrailHistory, 3),
    );
    const rTrailGeo = new THREE.BufferGeometry();
    rTrailGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rightTrailHistory, 3),
    );
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.42,
    });
    this.leftTrailLine = new THREE.Line(lTrailGeo, trailMat);
    this.rightTrailLine = new THREE.Line(rTrailGeo, trailMat);
    this.leftTrailLine.frustumCulled = false;
    this.rightTrailLine.frustumCulled = false;
    this.scene.add(this.leftTrailLine, this.rightTrailLine);
    this.resetWingTrails();

    const shadowGeo = new THREE.PlaneGeometry(3.6, 3.8);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    this.contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadowMesh.position.set(0, 0.03, 0);
    this.scene.add(this.contactShadowMesh);

    // Intro 3D Skyway Light Rings
    const ringGeo = new THREE.TorusGeometry(4.4, 0.11, 10, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.72,
    });
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 2.2, -18 - i * 32);
      this.scene.add(ring);
      this.introRings.push(ring);
    }

    // Start camera at cinematic high-canyon dive angle
    this.camera.position.set(-5.2, 7.5, -14.5);
    this.camera.lookAt(0, CRUISE_Y + 0.2, 0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    this.emitHud();
    this.clock.start();
    this.tick();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLostCb(true);
  };

  private handleContextRestored = () => {
    this.onContextLostCb(false);
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();

    if (key === 'p' || key === 'escape') {
      if (this.phase === 'playing') {
        this.pauseGame();
      } else if (this.phase === 'paused') {
        this.resumeGame();
      }
      return;
    }

    if (this.phase === 'intro' && (key === ' ' || key === 'enter' || key === 'escape')) {
      e.preventDefault();
      this.skipIntro();
      return;
    }

    if (this.phase === 'gameover' && (key === ' ' || key === 'enter')) {
      e.preventDefault();
      this.startGame();
      return;
    }

    if (this.phase === 'menu' && (key === ' ' || key === 'enter')) {
      e.preventDefault();
      this.startGame();
      return;
    }

    if (this.phase !== 'playing') return;

    if (key === 'arrowleft' || key === 'a') {
      this.steerLeft();
    } else if (key === 'arrowright' || key === 'd') {
      this.steerRight();
    } else if (key === 'arrowup' || key === 'w' || key === ' ') {
      e.preventDefault();
      this.climb();
    } else if (key === 'arrowdown' || key === 's') {
      e.preventDefault();
      this.diveRoll();
    } else if (key === 'shift') {
      this.setBoostActive(true);
    } else if (key === 'f' || key === 'e') {
      e.preventDefault();
      this.firePlasma();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 'shift') {
      this.setBoostActive(false);
    }
  };

  public steerLeft(): void {
    if (this.phase !== 'playing') return;
    if (this.currentLane > -1) {
      this.currentLane -= 1;
      this.sound.unlock();
      this.sound.playWhoosh(1.08);
    }
  }

  public steerRight(): void {
    if (this.phase !== 'playing') return;
    if (this.currentLane < 1) {
      this.currentLane += 1;
      this.sound.unlock();
      this.sound.playWhoosh(0.95);
    }
  }

  public climb(): void {
    if (this.phase !== 'playing') return;
    this.sound.unlock();
    if (this.isGrounded || this.planeY <= CRUISE_Y + 0.15) {
      this.planeVy = JUMP_VY;
      this.isGrounded = false;
      this.duckTimer = 0;
      this.barrelRollProgress = 0;
      this.sound.playJump();
    }
  }

  public diveRoll(): void {
    if (this.phase !== 'playing') return;
    this.sound.unlock();
    if (!this.isGrounded) {
      // Fast-fall snap down
      this.planeVy = Math.min(this.planeVy, -24);
    }
    this.duckTimer = 0.72;
    this.barrelRollProgress = 0.001;
    this.sound.playWhoosh(0.75);
  }

  public selectPlane(id: PlaneId): void {
    const preset = PLANE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.selectedPlaneId = id;
    this.planeRig.applyPreset(preset);
    try {
      localStorage.setItem('skyway_plane', id);
    } catch {
      // ignore
    }
  }

  public getSelectedPlaneId(): PlaneId {
    return this.selectedPlaneId;
  }

  public setBoostActive(active: boolean): void {
    if (this.phase !== 'playing') {
      this.manualBoost = false;
      return;
    }
    if (active && this.boostEnergy > 12) {
      if (!this.manualBoost) {
        this.sound.unlock();
        this.sound.playWhoosh(1.25);
      }
      this.manualBoost = true;
    } else if (!active) {
      this.manualBoost = false;
    }
  }

  public firePlasma(): void {
    if (this.phase !== 'playing' || this.plasmaAmmo <= 0) return;
    this.sound.unlock();
    this.plasmaAmmo -= 1;
    this.sound.playWhoosh(1.45);
    const mesh = createPlasmaBoltMesh();
    mesh.position.set(this.planeX, this.planeY, -2.2);
    this.scene.add(mesh);
    this.plasmaBolts.push({
      mesh,
      lane: this.currentLane,
      x: this.planeX,
      y: this.planeY,
      z: -2.2,
    });
    this.emitHud();
  }

  private setEventBanner(text: string, duration = 2.0): void {
    this.eventBannerAr = text;
    this.eventBannerTimer = duration;
  }

  public skipIntro(): void {
    if (this.phase !== 'intro') return;
    this.introRings.forEach((r) => (r.visible = false));
    this.phase = 'menu';
    this.emitHud();
  }

  public replayIntro(): void {
    this.clearDynamicEntities();
    this.phase = 'intro';
    this.introTimer = 0;
    this.currentLane = 0;
    this.planeX = 0;
    this.planeY = CRUISE_Y;
    this.currentBank = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.introRings.forEach((r, idx) => {
      r.visible = true;
      r.position.set(0, 2.2, -18 - idx * 32);
    });
    this.camera.position.set(-5.2, 7.5, -14.5);
    this.resetWingTrails();
    this.emitHud();
  }

  public startGame(): void {
    this.sound.unlock();
    this.clearDynamicEntities();
    this.introRings.forEach((r) => (r.visible = false));

    this.phase = 'playing';
    this.currentLane = 0;
    this.planeX = 0;
    this.planeY = CRUISE_Y;
    this.planeVy = 0;
    this.currentBank = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.isGrounded = true;
    this.duckTimer = 0;
    this.barrelRollProgress = 0;
    this.invulnTimer = 0;

    this.speed = BASE_SPEED;
    this.boostEnergy = 100;
    this.manualBoost = false;
    this.plasmaAmmo = this.maxPlasmaAmmo;
    this.plasmaRechargeAccum = 0;
    this.distance = 0;
    this.score = 0;
    this.runCoins = 0;
    this.isNewBest = false;
    this.nearMissCount = 0;
    this.crashReasonAr = '';
    this.eventBannerAr = '';
    this.eventBannerTimer = 0;
    this.puzzleHintShape = null;
    this.puzzleHintTimer = 0;

    this.powerTimers = {
      magnet: 0,
      shield: 0,
      turbo: 0,
      multiplier: 0,
    };
    this.planeRig.shieldMesh.visible = false;

    this.spawnDistanceAccum = 0;
    this.nextSpawnGap = 36;
    this.spawnPatternCount = 0;
    this.cameraShake = 0;
    this.resetWingTrails();

    // Seed initial friendly coin line ahead
    this.spawnCoinRow(0, -52, 5, CRUISE_Y);
    this.emitHud();
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.clock.getDelta(); // flush paused delta
    this.phase = 'playing';
    this.emitHud();
  }

  public returnToMenu(): void {
    this.clearDynamicEntities();
    this.phase = 'menu';
    this.currentLane = 0;
    this.planeX = 0;
    this.planeY = CRUISE_Y;
    this.planeVy = 0;
    this.currentBank = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.isGrounded = true;
    this.duckTimer = 0;
    this.barrelRollProgress = 0;
    this.speed = BASE_SPEED;
    this.plasmaAmmo = this.maxPlasmaAmmo;
    this.eventBannerAr = '';
    this.eventBannerTimer = 0;
    this.puzzleHintShape = null;
    this.puzzleHintTimer = 0;
    this.powerTimers = { magnet: 0, shield: 0, turbo: 0, multiplier: 0 };
    this.planeRig.shieldMesh.visible = false;
    this.resetWingTrails();
    this.emitHud();
  }

  private clearDynamicEntities(): void {
    this.obstacles.forEach((o) => this.scene.remove(o.mesh));
    this.obstacles = [];
    this.coins.forEach((c) => this.scene.remove(c.mesh));
    this.coins = [];
    this.powerUps.forEach((p) => this.scene.remove(p.mesh));
    this.powerUps = [];
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    this.particles = [];
    this.plasmaBolts.forEach((b) => this.scene.remove(b.mesh));
    this.plasmaBolts = [];
  }

  private spawnCoinRow(
    lane: number,
    startZ: number,
    count: number,
    baseY: number,
    arcPeak = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const y = baseY + (arcPeak > 0 ? Math.sin(t * Math.PI) * arcPeak : 0);
      const mesh = createCoinMesh();
      const x = lane * LANE_WIDTH;
      const z = startZ - i * 3.4;
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.coins.push({ mesh, lane, x, y, z, collected: false });
    }
  }

  private spawnObstacle(
    kind: ObstacleKind,
    lane: number,
    z: number,
    puzzleShape?: PuzzleShape,
  ): void {
    const mesh = createObstacleModel(
      kind,
      this.textures,
      this.isSoftwareGl,
      puzzleShape,
    );
    mesh.position.set(lane * LANE_WIDTH, 0, z);
    this.scene.add(mesh);

    const speedOffset =
      kind === 'full_truck' && this.distance > 180 ? 4.5 : 0;

    this.obstacles.push({
      id: this.nextObstacleId++,
      kind,
      lane,
      z,
      mesh,
      speedOffset,
      nearMissAwarded: false,
      smashed: false,
    });
  }

  private spawnPowerUp(type: PowerUpType, lane: number, z: number): void {
    const mesh = createPowerUpMesh(type);
    const y = CRUISE_Y + 0.25;
    mesh.position.set(lane * LANE_WIDTH, y, z);
    this.scene.add(mesh);
    this.powerUps.push({ type, mesh, lane, y, z, collected: false });
  }

  private spawnNextPattern(): void {
    this.spawnPatternCount += 1;
    const z = -195;
    const lanes = [-1, 0, 1];
    const openLane = lanes[Math.floor(Math.random() * lanes.length)];
    const otherLanes = lanes.filter((l) => l !== openLane);

    // Every ~7 patterns, offer a power-up in an interesting lane
    const shouldSpawnPowerUp = this.spawnPatternCount % 6 === 0;
    const powerTypes: PowerUpType[] = ['magnet', 'shield', 'turbo', 'multiplier'];
    const pickedPower = powerTypes[Math.floor(Math.random() * powerTypes.length)];

    const roll = Math.random();

    if (this.puzzleHintTimer <= 0 && this.spawnPatternCount % 4 === 0) {
      // Modern Shape-Match Holographic Puzzle Gate
      const shapes: PuzzleShape[] = ['triangle', 'diamond', 'ring'];
      const targetShape = shapes[Math.floor(Math.random() * shapes.length)];
      const decoyShapes = shapes.filter((s) => s !== targetShape);

      this.puzzleHintShape = targetShape;
      this.puzzleHintTimer = 3.8;
      this.setEventBanner('لغز البوابة قادم!', 2.1);

      this.spawnObstacle('puzzle_open', openLane, z - 12, targetShape);
      this.spawnObstacle('puzzle_locked', otherLanes[0], z - 12, decoyShapes[0]);
      this.spawnObstacle('puzzle_locked', otherLanes[1], z - 12, decoyShapes[1]);
      this.spawnCoinRow(openLane, z - 18, 5, CRUISE_Y);
    } else if (roll < 0.2) {
      // Pattern 1: Low barriers in 2 lanes + jumpable coin arc over one + open lane
      const barrierLane = otherLanes[0];
      this.spawnObstacle('low_barrier', barrierLane, z);
      this.spawnCoinRow(barrierLane, z + 5.5, 5, CRUISE_Y, 2.2);

      if (Math.random() < 0.6) {
        this.spawnObstacle('low_barrier', otherLanes[1], z);
      }
      this.spawnCoinRow(openLane, z + 3, 4, CRUISE_Y);
    } else if (roll < 0.38) {
      // Pattern 2: Overhead Gantries (duckable!) + coins underneath
      this.spawnObstacle('high_gate', otherLanes[0], z);
      this.spawnCoinRow(otherLanes[0], z + 4, 4, DUCK_Y + 0.15);

      if (this.distance > 120 && Math.random() < 0.55) {
        this.spawnObstacle('full_truck', otherLanes[1], z - 4);
      }
      this.spawnCoinRow(openLane, z + 2, 4, CRUISE_Y);
    } else if (roll < 0.56) {
      // Pattern 3: Full Fuel Tanker Trucks in 1 or 2 lanes
      this.spawnObstacle('full_truck', otherLanes[0], z);
      if (this.distance > 90 && Math.random() < 0.65) {
        this.spawnObstacle('full_truck', otherLanes[1], z - 2);
      }
      if (shouldSpawnPowerUp) {
        this.spawnPowerUp(pickedPower, openLane, z);
      } else {
        this.spawnCoinRow(openLane, z + 4, 5, CRUISE_Y);
      }
    } else if (roll < 0.72) {
      // Pattern 4: Electromagnetic Sky-Catapult Pad ("قذف جوي") into high aerial coin trail!
      this.spawnObstacle('catapult', openLane, z);
      this.spawnCoinRow(openLane, z - 8, 7, CRUISE_Y + 3.8, 2.4);
      this.spawnObstacle('low_barrier', otherLanes[0], z - 3);
      this.spawnObstacle('high_gate', otherLanes[1], z - 3);
    } else if (roll < 0.87) {
      // Pattern 5: Supersonic Runway Boost Pad + Ramp mix
      this.spawnObstacle('boost_pad', openLane, z);
      this.spawnCoinRow(openLane, z - 5, 5, CRUISE_Y);
      this.spawnObstacle('ramp', otherLanes[0], z - 2);
      this.spawnCoinRow(otherLanes[0], z - 8, 5, CRUISE_Y + 2.4, 1.6);
    } else {
      // Pattern 6: Triple Mix — 1 jumpable, 1 duckable, 1 truck (or blast with plasma!)
      this.spawnObstacle('low_barrier', lanes[0], z);
      this.spawnObstacle('high_gate', lanes[1], z);
      this.spawnObstacle('full_truck', lanes[2], z);
      this.spawnCoinRow(lanes[0], z + 5, 4, CRUISE_Y, 2.0);
      this.spawnCoinRow(lanes[1], z + 4, 4, DUCK_Y + 0.15);
    }

    if (shouldSpawnPowerUp && roll >= 0.56) {
      this.spawnPowerUp(pickedPower, openLane, z - 14);
    }

    // Gap tightens subtly as speed rises, keeping reaction window fair (~0.75s-1.0s)
    const speedFactor = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    this.nextSpawnGap = THREE.MathUtils.lerp(28, 38, speedFactor) + Math.random() * 8;
  }

  private spawnBurst(x: number, y: number, z: number, colorHex: number, count: number): void {
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 14,
        vy: Math.random() * 9 + 2,
        vz: (Math.random() - 0.5) * 12,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.25,
      });
    }
  }

  private triggerCollision(reasonAr: string, obs: ObstacleEntity): void {
    if (this.powerTimers.turbo > 0) {
      // Turbo smashes obstacles aside!
      obs.smashed = true;
      this.scene.remove(obs.mesh);
      this.cameraShake = 0.28;
      this.spawnBurst(obs.lane * LANE_WIDTH, 1.4, obs.z, 0xf59e0b, 14);
      this.sound.playShieldBreak();
      this.score += 100;
      return;
    }

    if (this.powerTimers.shield > 0) {
      this.powerTimers.shield = 0;
      this.planeRig.shieldMesh.visible = false;
      this.invulnTimer = 1.4;
      obs.smashed = true;
      this.scene.remove(obs.mesh);
      this.cameraShake = 0.42;
      this.spawnBurst(this.planeX, this.planeY, 0, 0x06b6d4, 18);
      this.sound.playShieldBreak();
      return;
    }

    // Game Over!
    this.phase = 'gameover';
    this.crashReasonAr = reasonAr;
    this.cameraShake = 0.65;
    this.spawnBurst(this.planeX, this.planeY, 0, 0xef4444, 24);
    this.sound.playCrash();

    const finalScore = Math.floor(this.score);
    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      this.isNewBest = true;
      try {
        localStorage.setItem('skyway_best', String(this.bestScore));
      } catch {
        // ignore
      }
    }

    this.totalCoins += this.runCoins;
    try {
      localStorage.setItem('skyway_coins', String(this.totalCoins));
    } catch {
      // ignore
    }

    this.emitHud();
  }

  private updateBiome(delta: number): number {
    const biomeIdx = Math.floor(this.distance / 750) % BIOMES.length;
    const biome = BIOMES[biomeIdx];

    _targetSkyColor.setHex(biome.skyHex);
    _targetFogColor.setHex(biome.fogHex);
    _targetSunColor.setHex(biome.sunHex);

    if (this.scene.background instanceof THREE.Color) {
      _skyColor.copy(this.scene.background).lerp(_targetSkyColor, Math.min(1, delta * 0.7));
      this.scene.background.copy(_skyColor);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      _fogColor.copy(this.scene.fog.color).lerp(_targetFogColor, Math.min(1, delta * 0.7));
      this.scene.fog.color.copy(_fogColor);
    }
    _sunColor.copy(this.keyLight.color).lerp(_targetSunColor, Math.min(1, delta * 0.7));
    this.keyLight.color.copy(_sunColor);

    this.skyDome.uniforms.topColor.value.lerp(
      _targetSkyColor.setHex(biome.topHex),
      Math.min(1, delta * 0.7),
    );
    this.skyDome.uniforms.midColor.value.lerp(
      _targetFogColor.setHex(biome.midHex),
      Math.min(1, delta * 0.7),
    );
    this.skyDome.uniforms.horizonColor.value.lerp(
      _targetSunColor.setHex(biome.horizonHex),
      Math.min(1, delta * 0.7),
    );

    return biomeIdx;
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDelta = this.clock.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    const elapsed = this.clock.elapsedTime;

    // Spin nose propeller continuously
    this.planeRig.propeller.rotation.z += delta * (this.phase === 'playing' ? 38 : 18);

    // Update sky/biome colors
    this.updateBiome(delta);

    if (this.phase === 'intro') {
      this.stepIntro(delta, elapsed);
    } else if (this.phase === 'menu') {
      // Idle scenic flyover on menu
      const menuMove = 20 * delta;
      this.scrollWorld(menuMove);
      const px = Math.sin(elapsed * 0.75) * 0.72;
      const py = CRUISE_Y + 0.2 + Math.sin(elapsed * 1.9) * 0.14;
      this.planeRig.group.position.set(px, py, 0);
      this.planeRig.bodyGroup.rotation.set(
        Math.sin(elapsed * 1.3) * 0.045,
        -Math.cos(elapsed * 0.75) * 0.04,
        -Math.cos(elapsed * 0.75) * 0.16,
      );
      this.animateAfterburners(elapsed, false);
      this.updateWingTrails(menuMove);
      this.contactShadowMesh.position.set(px, 0.03, 0);

      // Gentle showcase framing highlighting MRJOo livery & jet silhouette
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, 2.35, 3, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 3.05, 3, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 7.2, 3, delta);
      this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, 0, 4, delta);
      this.camera.lookAt(0, 1.35, -3.5);
    } else if (this.phase === 'playing') {
      this.stepPlaying(delta, elapsed);
    } else if (this.phase === 'gameover') {
      // Keep particles settling & camera shake decaying
      this.stepParticles(delta);
      this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 6, delta);
      this.camera.position.x = (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y = 4.3 + (Math.random() - 0.5) * this.cameraShake;
    }

    this.skyDome.mesh.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private resetWingTrails(): void {
    this.planeRig.group.updateMatrixWorld(true);
    this.planeRig.leftWingTip.getWorldPosition(this._tipVec);
    for (let i = 0; i < this.trailPointsCount; i++) {
      this.leftTrailHistory[i * 3] = this._tipVec.x;
      this.leftTrailHistory[i * 3 + 1] = this._tipVec.y;
      this.leftTrailHistory[i * 3 + 2] = this._tipVec.z + i * 0.45;
    }
    this.planeRig.rightWingTip.getWorldPosition(this._tipVec);
    for (let i = 0; i < this.trailPointsCount; i++) {
      this.rightTrailHistory[i * 3] = this._tipVec.x;
      this.rightTrailHistory[i * 3 + 1] = this._tipVec.y;
      this.rightTrailHistory[i * 3 + 2] = this._tipVec.z + i * 0.45;
    }
    this.leftTrailLine.geometry.attributes.position.needsUpdate = true;
    this.rightTrailLine.geometry.attributes.position.needsUpdate = true;
  }

  private updateWingTrails(moveZ: number): void {
    this.planeRig.group.updateMatrixWorld(true);

    const shiftAndAppend = (arr: Float32Array, tipObj: THREE.Object3D) => {
      for (let i = this.trailPointsCount - 1; i > 0; i--) {
        arr[i * 3] = arr[(i - 1) * 3];
        arr[i * 3 + 1] = arr[(i - 1) * 3 + 1];
        arr[i * 3 + 2] = arr[(i - 1) * 3 + 2] + moveZ;
      }
      tipObj.getWorldPosition(this._tipVec);
      arr[0] = this._tipVec.x;
      arr[1] = this._tipVec.y;
      arr[2] = this._tipVec.z;
    };

    shiftAndAppend(this.leftTrailHistory, this.planeRig.leftWingTip);
    shiftAndAppend(this.rightTrailHistory, this.planeRig.rightWingTip);

    this.leftTrailLine.geometry.attributes.position.needsUpdate = true;
    this.rightTrailLine.geometry.attributes.position.needsUpdate = true;
  }

  private animateAfterburners(elapsed: number, turboActive: boolean): void {
    const flameScale = turboActive
      ? 1.9 + Math.sin(elapsed * 42) * 0.25
      : 0.9 + (this.speed - BASE_SPEED) / 55 + Math.sin(elapsed * 32) * 0.1;

    this.planeRig.leftFlame.scale.set(1, flameScale, 1);
    this.planeRig.rightFlame.scale.set(1, flameScale, 1);
    this.planeRig.leftInnerFlame.scale.set(1, flameScale * 0.95, 1);
    this.planeRig.rightInnerFlame.scale.set(1, flameScale * 0.95, 1);

    (this.planeRig.leftFlame.material as THREE.MeshBasicMaterial).color.setHex(
      turboActive ? 0xf59e0b : 0x38bdf8,
    );
  }

  private stepIntro(delta: number, elapsed: number): void {
    this.introTimer += delta;
    const t = Math.min(1, this.introTimer / this.introDuration);

    const introMove = (38 + t * 14) * delta;
    this.scrollWorld(introMove);

    // Move & rotate 3D Skyway Light Rings during intro
    for (let i = 0; i < this.introRings.length; i++) {
      const r = this.introRings[i];
      r.visible = true;
      r.position.z += introMove;
      r.rotation.z += delta * 1.4;
      if (r.position.z > 14) {
        r.position.z -= this.introRings.length * 32;
      }
    }

    // Dynamic aerial choreography for MRJOo jet
    const swoopX = Math.sin(t * Math.PI * 2.5) * 1.45;
    const swoopY = CRUISE_Y + 0.55 + Math.sin(t * Math.PI * 1.2) * 0.85;
    let roll = -Math.cos(t * Math.PI * 2.5) * 0.38;
    const afterburnerIgnited = t > 0.25 && t < 0.78;
    if (t > 0.28 && t < 0.58) {
      const rollP = (t - 0.28) / 0.3;
      const easeRoll = rollP * rollP * (3 - 2 * rollP);
      roll += easeRoll * Math.PI * 2;
    }

    this.planeRig.group.position.set(swoopX, swoopY, 0);
    this.planeRig.bodyGroup.rotation.set(Math.sin(t * Math.PI * 1.5) * 0.1, 0, roll);
    this.animateAfterburners(elapsed, afterburnerIgnited);
    this.updateWingTrails(introMove);
    this.contactShadowMesh.position.set(swoopX, 0.03, 0);

    // Emit periodic golden afterburner sparks in Shot 2
    if (afterburnerIgnited && Math.random() < 0.45) {
      this.spawnBurst(swoopX + (Math.random() - 0.5) * 0.4, swoopY, 2.3, 0xf59e0b, 1);
    }
    this.stepParticles(delta);

    let camRoll = 0;

    // 4-Shot Epic 3D Camera Sequence
    if (t < 0.26) {
      // Shot 1: High canyon dive-in right into a tight nose-on hero close-up
      const k = t / 0.26;
      const smooth = 1 - Math.pow(1 - k, 2.2);
      this._camTargetPos.set(
        THREE.MathUtils.lerp(-5.2, 2.4, smooth),
        THREE.MathUtils.lerp(7.5, 1.85, smooth),
        THREE.MathUtils.lerp(-14.5, -3.2, smooth),
      );
      this._camLookTarget.set(swoopX, swoopY + 0.12, 0.15);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 52, 5, delta);
      camRoll = THREE.MathUtils.lerp(-0.18, 0.08, smooth);
    } else if (t < 0.56) {
      // Shot 2: Full 360-degree dynamic orbital sweep around MRJOo during barrel roll
      const k = (t - 0.26) / 0.3;
      const angle = THREE.MathUtils.lerp(0.65, Math.PI * 1.75, k);
      const radius = THREE.MathUtils.lerp(4.4, 5.5, Math.sin(k * Math.PI));
      this._camTargetPos.set(
        Math.sin(angle) * radius + swoopX * 0.6,
        THREE.MathUtils.lerp(2.0, 3.3, k),
        Math.cos(angle) * radius,
      );
      this._camLookTarget.set(swoopX, swoopY + 0.1, 0);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 64, 5, delta);
      camRoll = Math.sin(k * Math.PI) * 0.16;
    } else if (t < 0.8) {
      // Shot 3: Low-wingtip Dutch-angle flythrough blasting through glowing sky rings
      const k = (t - 0.56) / 0.24;
      this._camTargetPos.set(
        THREE.MathUtils.lerp(-3.8, 3.1, k),
        THREE.MathUtils.lerp(1.65, 2.55, k),
        THREE.MathUtils.lerp(3.4, 5.4, k),
      );
      this._camLookTarget.set(swoopX * 0.5, swoopY + 0.15, -10);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 72, 6, delta);
      camRoll = THREE.MathUtils.lerp(-0.22, 0.14, k);
    } else {
      // Shot 4: Smooth pull-back into behind-the-jet Hangar showcase formation
      const k = (t - 0.8) / 0.2;
      const smoothK = k * k * (3 - 2 * k);
      this._camTargetPos.set(
        THREE.MathUtils.lerp(3.1, 2.35, smoothK),
        THREE.MathUtils.lerp(2.55, 3.05, smoothK),
        THREE.MathUtils.lerp(5.4, 7.2, smoothK),
      );
      this._camLookTarget.set(0, 1.35, THREE.MathUtils.lerp(-8, -3.5, smoothK));
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 60, 5, delta);
      camRoll = THREE.MathUtils.lerp(0.14, 0, smoothK);
    }

    this.camera.updateProjectionMatrix();
    this.camera.position.lerp(this._camTargetPos, Math.min(1, delta * 8.5));
    this.camera.lookAt(this._camLookTarget);
    this.camera.rotation.z = camRoll;

    if (t >= 1) {
      this.introRings.forEach((r) => (r.visible = false));
      this.phase = 'menu';
      this.emitHud();
    }
  }

  private scrollWorld(moveZ: number): void {
    for (let i = 0; i < this.roadSegments.length; i++) {
      const seg = this.roadSegments[i];
      seg.position.z += moveZ;
      if (seg.position.z > SEGMENT_LENGTH) {
        seg.position.z -= SEGMENT_COUNT * SEGMENT_LENGTH;
      }
    }

    // Scroll sky dust
    const posAttr = this.skyParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      let pz = posAttr.getZ(i) + moveZ * 1.15;
      if (pz > 12) pz -= 210;
      posAttr.setZ(i, pz);
    }
    posAttr.needsUpdate = true;
  }

  private stepPlaying(delta: number, elapsed: number): void {
    // 1. Power-up timers & Manual Boost Energy
    (Object.keys(this.powerTimers) as PowerUpType[]).forEach((k) => {
      if (this.powerTimers[k] > 0) {
        this.powerTimers[k] = Math.max(0, this.powerTimers[k] - delta);
      }
    });
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - delta);
    if (this.eventBannerTimer > 0) {
      this.eventBannerTimer = Math.max(0, this.eventBannerTimer - delta);
    }
    if (this.puzzleHintTimer > 0) {
      this.puzzleHintTimer = Math.max(0, this.puzzleHintTimer - delta);
      if (this.puzzleHintTimer === 0) this.puzzleHintShape = null;
    }
    if (this.plasmaAmmo < this.maxPlasmaAmmo) {
      this.plasmaRechargeAccum += delta;
      if (this.plasmaRechargeAccum >= 6.5) {
        this.plasmaRechargeAccum = 0;
        this.plasmaAmmo += 1;
      }
    } else {
      this.plasmaRechargeAccum = 0;
    }

    if (this.manualBoost) {
      this.boostEnergy = Math.max(0, this.boostEnergy - delta * 34);
      if (this.boostEnergy <= 0) this.manualBoost = false;
    } else {
      this.boostEnergy = Math.min(100, this.boostEnergy + delta * 16);
    }

    const turboActive = this.powerTimers.turbo > 0;
    const isSurging = turboActive || this.manualBoost;
    const magnetActive = this.powerTimers.magnet > 0;
    const mult = this.powerTimers.multiplier > 0 ? 2 : 1;

    this.planeRig.shieldMesh.visible = this.powerTimers.shield > 0;
    if (this.planeRig.shieldMesh.visible) {
      this.planeRig.shieldMesh.rotation.y += delta * 2.4;
    }

    // 2. Speed progression
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.distance * 0.014);
    const speedMult = turboActive ? 1.68 : this.manualBoost ? 1.42 : 1.0;
    const effectiveSpeed = this.speed * speedMult;
    const moveZ = effectiveSpeed * delta;

    this.distance += moveZ;
    this.score += moveZ * 1.5 * mult;

    // 3. Scroll road & scenery
    this.scrollWorld(moveZ);

    // 4. Ultra-Smooth Curved Lateral Glide & Coordinated Aerodynamic Banking
    const targetX = this.currentLane * LANE_WIDTH;
    const xDiff = targetX - this.planeX;
    this.planeX = THREE.MathUtils.damp(this.planeX, targetX, 5.6, delta);

    const desiredBank = THREE.MathUtils.clamp(-xDiff * 0.22, -0.62, 0.62);
    this.currentBank = THREE.MathUtils.damp(this.currentBank, desiredBank, 6.8, delta);

    const desiredYaw = THREE.MathUtils.clamp(-xDiff * 0.065, -0.18, 0.18);
    this.currentYaw = THREE.MathUtils.damp(this.currentYaw, desiredYaw, 6.2, delta);

    // 5. Realistic Vertical Flight / Aerodynamic Lift & Dive Kinematics
    if (this.duckTimer > 0) {
      this.duckTimer = Math.max(0, this.duckTimer - delta);
    }

    const baseTargetY = this.duckTimer > 0 ? DUCK_Y : CRUISE_Y;

    if (!this.isGrounded) {
      // Subtle aerodynamic hang-time near peak altitude for realistic flight feel
      const apexGlide = Math.abs(this.planeVy) < 2.8 ? 0.72 : 1.0;
      this.planeVy -= GRAVITY * apexGlide * delta;
      this.planeY += this.planeVy * delta;
      if (this.planeY <= baseTargetY) {
        this.planeY = baseTargetY;
        this.planeVy = 0;
        this.isGrounded = true;
      }
    } else {
      this.planeY = THREE.MathUtils.damp(this.planeY, baseTargetY, 9.5, delta);
    }

    // Gentle air-cushion bobbing when cruising
    const hoverOffset = this.isGrounded ? Math.sin(elapsed * 4.8) * 0.055 : 0;
    this.planeRig.group.position.set(this.planeX, this.planeY + hoverOffset, 0);

    // Coordinated Pitch, Roll & Barrel Roll
    let totalRoll = this.currentBank;
    if (this.barrelRollProgress > 0) {
      this.barrelRollProgress += delta * 2.05;
      if (this.barrelRollProgress >= 1) {
        this.barrelRollProgress = 0;
      } else {
        const s = this.barrelRollProgress;
        const smoothRoll = s * s * (3 - 2 * s);
        totalRoll += smoothRoll * Math.PI * 2;
      }
    }
    const desiredPitch = this.isGrounded
      ? this.duckTimer > 0
        ? -0.11
        : Math.sin(elapsed * 4.8) * 0.018
      : THREE.MathUtils.clamp(this.planeVy * 0.032, -0.44, 0.44);
    this.currentPitch = THREE.MathUtils.damp(this.currentPitch, desiredPitch, 9.5, delta);

    this.planeRig.bodyGroup.rotation.set(this.currentPitch, this.currentYaw, totalRoll);

    // Invulnerability flicker
    this.planeRig.bodyGroup.visible =
      this.invulnTimer <= 0 || Math.floor(elapsed * 18) % 2 === 0;

    // Afterburner flames & Wingtip Trails
    this.animateAfterburners(elapsed, isSurging);
    this.updateWingTrails(moveZ);

    // Contact shadow follows X and scales with altitude
    const heightRatio = THREE.MathUtils.clamp((this.planeY - 0.5) / 4.0, 0, 1);
    const shadowScale = THREE.MathUtils.lerp(1.05, 0.48, heightRatio);
    this.contactShadowMesh.position.set(this.planeX, 0.03, 0);
    this.contactShadowMesh.scale.setScalar(shadowScale);
    (this.contactShadowMesh.material as THREE.MeshBasicMaterial).opacity =
      THREE.MathUtils.lerp(0.58, 0.16, heightRatio);

    // 6. Spawning
    this.spawnDistanceAccum += moveZ;
    if (this.spawnDistanceAccum >= this.nextSpawnGap) {
      this.spawnDistanceAccum = 0;
      this.spawnNextPattern();
    }

    // 7. Update Plasma Bolts
    for (let bIdx = this.plasmaBolts.length - 1; bIdx >= 0; bIdx--) {
      const bolt = this.plasmaBolts[bIdx];
      bolt.z -= (effectiveSpeed + 74) * delta;
      bolt.mesh.position.z = bolt.z;

      let hitObstacle = false;
      for (let oIdx = 0; oIdx < this.obstacles.length; oIdx++) {
        const obs = this.obstacles[oIdx];
        if (obs.smashed) continue;
        if (
          obs.kind === 'ramp' ||
          obs.kind === 'catapult' ||
          obs.kind === 'boost_pad' ||
          obs.kind === 'puzzle_open'
        ) {
          continue;
        }
        const obsX = obs.lane * LANE_WIDTH;
        if (Math.abs(bolt.x - obsX) < 1.9 && Math.abs(bolt.z - obs.z) < 3.4) {
          obs.smashed = true;
          this.scene.remove(obs.mesh);
          this.spawnBurst(obsX, 1.5, obs.z, 0x22d3ee, 16);
          this.cameraShake = 0.22;
          this.sound.playShieldBreak();
          this.score += 120 * mult;
          this.setEventBanner('تدمير بالنبضة! +120', 1.8);
          hitObstacle = true;
          break;
        }
      }

      if (hitObstacle || bolt.z < -220) {
        this.scene.remove(bolt.mesh);
        this.plasmaBolts.splice(bIdx, 1);
      }
    }

    // 8. Update Obstacles & Check Collisions
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += moveZ + obs.speedOffset * delta;
      obs.mesh.position.z = obs.z;

      if (obs.kind === 'catapult') {
        const r1 = obs.mesh.children[2];
        const r2 = obs.mesh.children[3];
        if (r1) r1.position.y = 0.68 + Math.sin(elapsed * 6) * 0.12;
        if (r2) r2.position.y = 1.12 + Math.cos(elapsed * 6) * 0.14;
      }

      if (obs.z > 16) {
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }

      if (obs.smashed) continue;

      const obsX = obs.lane * LANE_WIDTH;
      const dx = Math.abs(this.planeX - obsX);
      const halfDepth =
        obs.kind === 'full_truck'
          ? 3.2
          : obs.kind === 'ramp' || obs.kind === 'boost_pad'
            ? 2.2
            : obs.kind === 'catapult'
              ? 1.4
              : 0.72;
      const dz = Math.abs(obs.z);

      if (dz < halfDepth + 0.95 && dx < 1.35) {
        if (obs.kind === 'ramp') {
          if (this.planeY < 1.8 && this.planeVy <= 2) {
            this.planeVy = RAMP_VY;
            this.isGrounded = false;
            this.duckTimer = 0;
            this.sound.playJump();
            this.score += 75 * mult;
          }
        } else if (obs.kind === 'catapult') {
          if (!obs.nearMissAwarded && this.planeY < 2.2 && this.planeVy <= 3) {
            obs.nearMissAwarded = true;
            this.planeVy = 21.5;
            this.isGrounded = false;
            this.duckTimer = 0;
            this.barrelRollProgress = 0.001;
            this.sound.playJump();
            this.score += 120 * mult;
            this.spawnBurst(obsX, 1.2, obs.z, 0x22d3ee, 14);
            this.setEventBanner('قذف جوي فائق! +120', 1.8);
          }
        } else if (obs.kind === 'boost_pad') {
          if (!obs.nearMissAwarded && this.planeY < 1.9) {
            obs.nearMissAwarded = true;
            this.powerTimers.turbo = Math.max(this.powerTimers.turbo, 2.2);
            this.boostEnergy = Math.min(100, this.boostEnergy + 35);
            this.sound.playPowerUp();
            this.score += 80 * mult;
            this.spawnBurst(obsX, 0.4, obs.z, 0x34d399, 12);
            this.setEventBanner('تسريع فائق! +80', 1.8);
          }
        } else if (obs.kind === 'puzzle_open') {
          if (!obs.nearMissAwarded && this.planeY < 3.6) {
            obs.nearMissAwarded = true;
            this.score += 250 * mult;
            this.sound.playPowerUp();
            this.spawnBurst(obsX, 2.0, obs.z, 0x10b981, 16);
            this.puzzleHintShape = null;
            this.puzzleHintTimer = 0;
            this.setEventBanner('لغز صحيح! +250', 2.0);
          }
        } else if (obs.kind === 'puzzle_locked') {
          if (this.planeY < 3.6) {
            if (this.invulnTimer <= 0) {
              this.triggerCollision('عبرت بوابة اللغز المغلقة!', obs);
            }
          }
        } else if (obs.kind === 'low_barrier') {
          if (this.planeY < 1.92) {
            if (this.invulnTimer <= 0) {
              this.triggerCollision('اصطدمت بحاجز أرضي منخفض', obs);
            }
          } else if (!obs.nearMissAwarded) {
            obs.nearMissAwarded = true;
            this.nearMissCount += 1;
            this.score += 50 * mult;
          }
        } else if (obs.kind === 'high_gate') {
          if (this.planeY > 1.02 && this.planeY < 3.65) {
            if (this.invulnTimer <= 0) {
              this.triggerCollision('اصطدمت ببوابة رادار علوية', obs);
            }
          } else if (!obs.nearMissAwarded) {
            obs.nearMissAwarded = true;
            this.nearMissCount += 1;
            this.score += 50 * mult;
          }
        } else if (obs.kind === 'full_truck') {
          if (this.planeY < 3.4) {
            if (this.invulnTimer <= 0) {
              this.triggerCollision('اصطدمت بشاحنة وقود على المدرج', obs);
            }
          }
        }
      } else if (
        !obs.nearMissAwarded &&
        obs.kind !== 'ramp' &&
        obs.kind !== 'catapult' &&
        obs.kind !== 'boost_pad' &&
        obs.kind !== 'puzzle_open' &&
        obs.z > 0.6 &&
        obs.z < 2.2 &&
        dx >= 1.35 &&
        dx < 2.55
      ) {
        obs.nearMissAwarded = true;
        this.nearMissCount += 1;
        this.score += 35 * mult;
      }
    }

    // 8. Update Coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.collected) continue;

      c.z += moveZ;
      c.mesh.rotation.y += delta * 4.2;

      if (magnetActive && c.z > -22 && c.z < 4) {
        c.x = THREE.MathUtils.damp(c.x, this.planeX, 11, delta);
        c.y = THREE.MathUtils.damp(c.y, this.planeY, 11, delta);
        c.z = THREE.MathUtils.damp(c.z, 0, 8, delta);
      }

      c.mesh.position.set(c.x, c.y, c.z);

      const distSq =
        (c.x - this.planeX) ** 2 +
        (c.y - this.planeY) ** 2 +
        c.z ** 2;

      if (distSq < 2.35) {
        c.collected = true;
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        this.runCoins += 1;
        this.score += 15 * mult;
        this.sound.playCoin();
        continue;
      }

      if (c.z > 14) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    // 9. Update Power-Ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.z += moveZ;
      p.mesh.position.set(
        p.lane * LANE_WIDTH,
        p.y + Math.sin(elapsed * 4 + i) * 0.18,
        p.z,
      );
      p.mesh.rotation.y += delta * 2.8;

      const distSq =
        (p.lane * LANE_WIDTH - this.planeX) ** 2 +
        (p.y - this.planeY) ** 2 +
        p.z ** 2;

      if (distSq < 3.1) {
        this.powerTimers[p.type] = this.powerDurations[p.type];
        this.sound.playPowerUp();
        this.spawnBurst(p.lane * LANE_WIDTH, p.y, p.z, 0xfbbf24, 12);
        this.scene.remove(p.mesh);
        this.powerUps.splice(i, 1);
        this.emitHud();
        continue;
      }

      if (p.z > 14) {
        this.scene.remove(p.mesh);
        this.powerUps.splice(i, 1);
      }
    }

    // 10. Particles & Camera Choreography
    this.stepParticles(delta);
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 8, delta);

    const targetFov = turboActive
      ? 75
      : this.manualBoost
        ? 70
        : 60 + ((this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)) * 7;
    this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 6, delta);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    const shakeX = (Math.random() - 0.5) * this.cameraShake;
    const shakeY = (Math.random() - 0.5) * this.cameraShake;
    const camTargetX = this.planeX * 0.54 + shakeX;
    const camTargetY = 3.45 + this.planeY * 0.52 + shakeY;

    // Smooth curved camera inertia so turns never feel sharp
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camTargetX, 4.6, delta);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camTargetY, 5.2, delta);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 8.9, 5, delta);
    this.camera.rotation.z = THREE.MathUtils.damp(
      this.camera.rotation.z,
      -this.currentBank * 0.16,
      5.0,
      delta,
    );
    this.camera.lookAt(this.planeX * 0.4, this.planeY * 0.56 + 0.65, -16);

    // Throttled HUD updates (~15fps for React UI so WebGL runs unblocked)
    this.hudEmitAccum += delta;
    if (this.hudEmitAccum >= 0.065) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private stepParticles(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 18 * delta;
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;
      const s = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(s);
    }
  }

  private emitHud(): void {
    const activePowerUps: ActivePowerUpState[] = (
      Object.keys(this.powerTimers) as PowerUpType[]
    )
      .filter((type) => this.powerTimers[type] > 0)
      .map((type) => ({
        type,
        remaining: this.powerTimers[type],
        duration: this.powerDurations[type],
      }));

    const biomeIdx = Math.floor(this.distance / 750) % BIOMES.length;

    const multFactor = this.powerTimers.turbo > 0 ? 1.68 : this.manualBoost ? 1.42 : 1;

    this.onHudUpdate({
      phase: this.phase,
      score: Math.floor(this.score),
      bestScore: Math.max(this.bestScore, Math.floor(this.score)),
      distance: Math.floor(this.distance),
      coins: this.runCoins,
      totalCoins: this.totalCoins,
      speedKmh: Math.round(this.speed * multFactor * 12),
      boostEnergy: Math.round(this.boostEnergy),
      isBoosting: this.manualBoost || this.powerTimers.turbo > 0,
      plasmaAmmo: this.plasmaAmmo,
      maxPlasmaAmmo: this.maxPlasmaAmmo,
      multiplier: this.powerTimers.multiplier > 0 ? 2 : 1,
      activePowerUps,
      hasShield: this.powerTimers.shield > 0,
      isNewBest: this.isNewBest,
      nearMissCount: this.nearMissCount,
      biomeNameAr: BIOMES[biomeIdx].nameAr,
      crashReasonAr: this.crashReasonAr,
      eventBannerAr: this.eventBannerTimer > 0 ? this.eventBannerAr : '',
      puzzleHintShape: this.puzzleHintTimer > 0 ? this.puzzleHintShape : null,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    this.clearDynamicEntities();
    this.textures.dispose();
    this.envRT.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
