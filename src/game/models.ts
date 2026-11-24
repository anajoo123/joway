import * as THREE from 'three';
import { ObstacleKind, PlanePreset, PowerUpType, PuzzleShape } from './types';
import { ProceduralTextures } from './textures';

export interface AirplaneRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  propeller: THREE.Object3D;
  leftFlame: THREE.Mesh;
  rightFlame: THREE.Mesh;
  leftInnerFlame: THREE.Mesh;
  rightInnerFlame: THREE.Mesh;
  leftWingTip: THREE.Object3D;
  rightWingTip: THREE.Object3D;
  shieldMesh: THREE.Mesh;
  applyPreset: (preset: PlanePreset) => void;
}

export function createAirplaneModel(
  preset: PlanePreset,
  textures: ProceduralTextures,
  isSoftwareGl: boolean,
): AirplaneRig {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: preset.primaryColor,
    map: textures.fuselagePanels,
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: preset.secondaryColor,
    map: textures.fuselagePanels,
    metalness: 0.48,
    roughness: 0.3,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: preset.accentColor,
    metalness: 0.78,
    roughness: 0.2,
    emissive: preset.accentColor,
    emissiveIntensity: 0.28,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.88,
    roughness: 0.24,
  });

  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.92,
    roughness: 0.18,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: preset.canopyColor,
    metalness: 0.18,
    roughness: 0.06,
    clearcoat: 1.0,
    transparent: true,
    opacity: isSoftwareGl ? 0.68 : 0.78,
  });

  // 1. Sleek Blended Supersonic Fuselage (LatheGeometry along -Z forward)
  const lathePoints: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 1.95), // tailcone
    new THREE.Vector2(0.16, 1.72),
    new THREE.Vector2(0.34, 1.25),
    new THREE.Vector2(0.44, 0.45),
    new THREE.Vector2(0.46, -0.35),
    new THREE.Vector2(0.36, -1.05),
    new THREE.Vector2(0.22, -1.65),
    new THREE.Vector2(0.09, -2.05),
    new THREE.Vector2(0.005, -2.25), // needle pitot nose
  ];
  const fuselageGeo = new THREE.LatheGeometry(lathePoints, 28);
  fuselageGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, primaryMat);
  fuselage.scale.set(1.18, 0.76, 1.0);
  fuselage.castShadow = !isSoftwareGl;
  bodyGroup.add(fuselage);

  // Dorsal spine ridge (gives unmistakable fighter silhouette)
  const spineGeo = new THREE.BoxGeometry(0.26, 0.22, 1.95);
  const spine = new THREE.Mesh(spineGeo, secondaryMat);
  spine.position.set(0, 0.28, 0.52);
  bodyGroup.add(spine);

  // 2. Nose Pitot Probe & Spinning Turbo-Intake Ring
  const spinnerGroup = new THREE.Group();
  spinnerGroup.position.set(0, -0.02, -2.18);
  const probeGeo = new THREE.ConeGeometry(0.05, 0.46, 12);
  probeGeo.rotateX(-Math.PI / 2);
  const probe = new THREE.Mesh(probeGeo, titaniumMat);
  spinnerGroup.add(probe);
  bodyGroup.add(spinnerGroup);

  // 3. Detailed Cockpit Interior + Bubble Canopy + Canopy Frame
  const pilotSeat = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.28, 0.3),
    darkMetalMat,
  );
  pilotSeat.position.set(0, 0.24, -0.52);
  const pilotHelmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    accentMat,
  );
  pilotHelmet.position.set(0, 0.43, -0.54);
  const hudGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.12),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    }),
  );
  hudGlass.position.set(0, 0.4, -0.84);
  hudGlass.rotation.x = -0.35;
  bodyGroup.add(pilotSeat, pilotHelmet, hudGlass);

  const canopyGeo = new THREE.CapsuleGeometry(0.25, 0.88, 10, 20);
  canopyGeo.rotateX(Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.34, -0.55);
  canopy.scale.set(0.95, 0.72, 1.12);
  bodyGroup.add(canopy);

  const archGeo = new THREE.TorusGeometry(0.24, 0.028, 8, 16, Math.PI);
  const arch = new THREE.Mesh(archGeo, darkMetalMat);
  arch.position.set(0, 0.32, -0.75);
  bodyGroup.add(arch);

  // 4. Forward Canard Foreplanes (iconic high-agility look)
  const canardShape = new THREE.Shape();
  canardShape.moveTo(0.2, -0.1);
  canardShape.lineTo(0.86, 0.18);
  canardShape.lineTo(0.86, 0.34);
  canardShape.lineTo(0.22, 0.25);
  canardShape.closePath();

  const canardGeo = new THREE.ExtrudeGeometry(canardShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  canardGeo.rotateX(Math.PI / 2);
  const rCanard = new THREE.Mesh(canardGeo, accentMat);
  rCanard.position.set(0.05, 0.06, -1.18);
  rCanard.rotation.z = 0.08;
  const lCanard = rCanard.clone();
  lCanard.scale.x = -1;
  lCanard.position.x = -0.05;
  lCanard.rotation.z = -0.08;
  bodyGroup.add(rCanard, lCanard);

  // 5. Cranked-Arrow Swept Main Wings (ExtrudeGeometry with bevel)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.32, -0.55);
  wingShape.lineTo(0.85, -0.2);
  wingShape.lineTo(2.05, 0.42);
  wingShape.lineTo(2.05, 0.84);
  wingShape.lineTo(1.25, 0.78);
  wingShape.lineTo(0.35, 0.65);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.065,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, secondaryMat);
  rightWing.position.set(0, 0.02, 0.05);
  rightWing.castShadow = !isSoftwareGl;
  bodyGroup.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  bodyGroup.add(leftWing);

  // 6. Signature "MRJOo" Livery Decals (Wings, Dorsal Tail Banner & Side Pods)
  const wingDecalMat = new THREE.MeshBasicMaterial({
    map: textures.mrjooWingDecal,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const wingDecalGeo = new THREE.PlaneGeometry(1.18, 0.34);
  wingDecalGeo.rotateX(-Math.PI / 2);

  const rightWingDecal = new THREE.Mesh(wingDecalGeo, wingDecalMat);
  rightWingDecal.position.set(1.16, 0.055, 0.48);
  rightWingDecal.rotation.y = -0.22;
  const leftWingDecal = new THREE.Mesh(wingDecalGeo, wingDecalMat);
  leftWingDecal.position.set(-1.16, 0.055, 0.48);
  leftWingDecal.rotation.y = 0.22;
  bodyGroup.add(rightWingDecal, leftWingDecal);

  // Rear-facing / angled dorsal "MRJOo" illuminated badge so it's crystal-clear in chase cam!
  const tailBannerMat = new THREE.MeshStandardMaterial({
    map: textures.mrjooTailDecal,
    roughness: 0.25,
    metalness: 0.4,
    emissive: 0xffffff,
    emissiveMap: textures.mrjooTailDecal,
    emissiveIntensity: 0.35,
  });
  const rearBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.34), tailBannerMat);
  rearBadge.position.set(0, 0.56, 1.32);
  rearBadge.rotation.x = -0.58;
  bodyGroup.add(rearBadge);

  // Side fuselage MRJOo badges (visible in cinematic closeups!)
  const sideBadgeGeo = new THREE.PlaneGeometry(1.05, 0.26);
  const rightSideBadge = new THREE.Mesh(sideBadgeGeo, wingDecalMat);
  rightSideBadge.position.set(0.51, 0.04, -0.08);
  rightSideBadge.rotation.y = Math.PI / 2;
  const leftSideBadge = new THREE.Mesh(sideBadgeGeo, wingDecalMat);
  leftSideBadge.position.set(-0.51, 0.04, -0.08);
  leftSideBadge.rotation.y = -Math.PI / 2;
  bodyGroup.add(rightSideBadge, leftSideBadge);

  // 7. Wingtip Rail Pods, Beacons & Trail Anchors
  const podGeo = new THREE.CapsuleGeometry(0.06, 0.62, 6, 12);
  podGeo.rotateX(Math.PI / 2);
  const rightPod = new THREE.Mesh(podGeo, darkMetalMat);
  rightPod.position.set(2.08, 0.02, 0.64);
  const leftPod = new THREE.Mesh(podGeo, darkMetalMat);
  leftPod.position.set(-2.08, 0.02, 0.64);
  bodyGroup.add(rightPod, leftPod);

  const navGeo = new THREE.SphereGeometry(0.055, 8, 8);
  const rightNav = new THREE.Mesh(
    navGeo,
    new THREE.MeshBasicMaterial({ color: 0x22c55e }),
  );
  rightNav.position.set(2.12, 0.08, 0.36);
  const leftNav = new THREE.Mesh(
    navGeo,
    new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  );
  leftNav.position.set(-2.12, 0.08, 0.36);
  bodyGroup.add(rightNav, leftNav);

  const leftWingTip = new THREE.Object3D();
  leftWingTip.position.set(-2.1, 0.02, 0.96);
  const rightWingTip = new THREE.Object3D();
  rightWingTip.position.set(2.1, 0.02, 0.96);
  bodyGroup.add(leftWingTip, rightWingTip);

  // 8. Twin Canted V-Tail Vertical Fins + Horizontal Stabilators
  const vFinShape = new THREE.Shape();
  vFinShape.moveTo(0, 0);
  vFinShape.lineTo(0.68, 0);
  vFinShape.lineTo(0.95, 0.78);
  vFinShape.lineTo(0.5, 0.78);
  vFinShape.closePath();

  const vFinGeo = new THREE.ExtrudeGeometry(vFinShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  vFinGeo.rotateY(-Math.PI / 2);

  const rightVFin = new THREE.Mesh(vFinGeo, primaryMat);
  rightVFin.position.set(0.38, 0.16, 1.05);
  rightVFin.rotation.z = -0.36;
  rightVFin.castShadow = !isSoftwareGl;

  const leftVFin = new THREE.Mesh(vFinGeo, primaryMat);
  leftVFin.position.set(-0.34, 0.16, 1.05);
  leftVFin.rotation.z = 0.36;
  leftVFin.castShadow = !isSoftwareGl;
  bodyGroup.add(rightVFin, leftVFin);

  // Tail fin decals on outer sides
  const finDecalGeo = new THREE.PlaneGeometry(0.62, 0.28);
  const rightFinDecal = new THREE.Mesh(finDecalGeo, tailBannerMat);
  rightFinDecal.position.set(0.57, 0.56, 1.48);
  rightFinDecal.rotation.y = Math.PI / 2;
  rightFinDecal.rotation.x = -0.36;
  const leftFinDecal = new THREE.Mesh(finDecalGeo, tailBannerMat);
  leftFinDecal.position.set(-0.57, 0.56, 1.48);
  leftFinDecal.rotation.y = -Math.PI / 2;
  leftFinDecal.rotation.x = -0.36;
  bodyGroup.add(rightFinDecal, leftFinDecal);

  // Horizontal stabilators
  const hTailShape = new THREE.Shape();
  hTailShape.moveTo(0.25, 0);
  hTailShape.lineTo(1.05, 0.34);
  hTailShape.lineTo(1.05, 0.58);
  hTailShape.lineTo(0.25, 0.44);
  hTailShape.closePath();
  const hTailGeo = new THREE.ExtrudeGeometry(hTailShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  hTailGeo.rotateX(Math.PI / 2);
  const rHTail = new THREE.Mesh(hTailGeo, accentMat);
  rHTail.position.set(0.05, 0.02, 1.24);
  const lHTail = rHTail.clone();
  lHTail.scale.x = -1;
  lHTail.position.x = -0.05;
  bodyGroup.add(rHTail, lHTail);

  // 9. Twin Under-Body Jet Intakes & Vectoring Exhaust Nozzles
  const intakeGeo = new THREE.BoxGeometry(0.32, 0.24, 1.45);
  const rIntake = new THREE.Mesh(intakeGeo, darkMetalMat);
  rIntake.position.set(0.34, -0.14, 0.22);
  const lIntake = new THREE.Mesh(intakeGeo, darkMetalMat);
  lIntake.position.set(-0.34, -0.14, 0.22);
  bodyGroup.add(rIntake, lIntake);

  const nozzlePoints = [
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.2, 0.14),
    new THREE.Vector2(0.15, 0.36),
    new THREE.Vector2(0.12, 0.36),
    new THREE.Vector2(0.15, 0.05),
  ];
  const nozzleGeo = new THREE.LatheGeometry(nozzlePoints, 18);
  nozzleGeo.rotateX(Math.PI / 2);

  const rNozzle = new THREE.Mesh(nozzleGeo, titaniumMat);
  rNozzle.position.set(0.26, -0.06, 1.72);
  const lNozzle = new THREE.Mesh(nozzleGeo, titaniumMat);
  lNozzle.position.set(-0.26, -0.06, 1.72);
  bodyGroup.add(rNozzle, lNozzle);

  // Dual-layer glowing afterburner plumes
  const outerFlameGeo = new THREE.ConeGeometry(0.14, 0.85, 14);
  outerFlameGeo.rotateX(Math.PI / 2);
  const innerFlameGeo = new THREE.ConeGeometry(0.08, 0.55, 12);
  innerFlameGeo.rotateX(Math.PI / 2);

  const outerFlameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
  });
  const innerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
  });

  const leftFlame = new THREE.Mesh(outerFlameGeo, outerFlameMat);
  leftFlame.position.set(-0.26, -0.06, 2.38);
  const rightFlame = new THREE.Mesh(outerFlameGeo, outerFlameMat);
  rightFlame.position.set(0.26, -0.06, 2.38);

  const leftInnerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat);
  leftInnerFlame.position.set(-0.26, -0.06, 2.24);
  const rightInnerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat);
  rightInnerFlame.position.set(0.26, -0.06, 2.24);

  bodyGroup.add(leftFlame, rightFlame, leftInnerFlame, rightInnerFlame);

  // 10. Energy Shield Aura Sphere
  const shieldGeo = new THREE.SphereGeometry(2.35, 24, 18);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.visible = false;
  group.add(shieldMesh);

  const applyPreset = (next: PlanePreset) => {
    primaryMat.color.setHex(next.primaryColor);
    secondaryMat.color.setHex(next.secondaryColor);
    accentMat.color.setHex(next.accentColor);
    accentMat.emissive.setHex(next.accentColor);
    canopyMat.color.setHex(next.canopyColor);
  };

  return {
    group,
    bodyGroup,
    propeller: spinnerGroup,
    leftFlame,
    rightFlame,
    leftInnerFlame,
    rightInnerFlame,
    leftWingTip,
    rightWingTip,
    shieldMesh,
    applyPreset,
  };
}

export function createSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: {
    topColor: { value: THREE.Color };
    midColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
  };
} {
  const uniforms = {
    topColor: { value: new THREE.Color(0x070d1f) },
    midColor: { value: new THREE.Color(0x162447) },
    horizonColor: { value: new THREE.Color(0xe07a5f) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        float h1 = smoothstep(-0.08, 0.18, h);
        float h2 = smoothstep(0.16, 0.72, h);
        vec3 col = mix(horizonColor, midColor, h1);
        col = mix(col, topColor, h2);
        // Subtle solar glow near forward horizon (-Z)
        vec3 dir = normalize(vWorldPos);
        float sunDot = max(0.0, dot(dir, normalize(vec3(0.18, 0.16, -0.96))));
        col += horizonColor * pow(sunDot, 22.0) * 0.75;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(240, 24, 16), skyMat);
  return { mesh, uniforms };
}

export function createPuzzleSymbolMesh(
  shape: PuzzleShape,
  colorHex: number,
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.75,
    metalness: 0.5,
    roughness: 0.2,
  });
  if (shape === 'triangle') {
    const geo = new THREE.ConeGeometry(0.48, 0.85, 3);
    return new THREE.Mesh(geo, mat);
  }
  if (shape === 'diamond') {
    const geo = new THREE.OctahedronGeometry(0.46, 0);
    return new THREE.Mesh(geo, mat);
  }
  const geo = new THREE.TorusGeometry(0.38, 0.11, 10, 20);
  return new THREE.Mesh(geo, mat);
}

export function createPlasmaBoltMesh(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 1.15, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0xecfeff }),
  );
  core.rotation.x = Math.PI / 2;
  const halo = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 1.35, 6, 12),
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.45,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  g.add(core, halo);
  return g;
}

export function createObstacleModel(
  kind: ObstacleKind,
  textures: ProceduralTextures,
  isSoftwareGl: boolean,
  puzzleShape?: PuzzleShape,
): THREE.Group {
  const group = new THREE.Group();

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.7,
    roughness: 0.34,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardStripes,
    roughness: 0.45,
    metalness: 0.15,
  });
  const amberGlowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const redGlowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  if (kind === 'low_barrier') {
    // Low Runway Barrier (height ~1.25m, jumpable)
    const footGeo = new THREE.BoxGeometry(0.42, 0.25, 0.9);
    const leftFoot = new THREE.Mesh(footGeo, steelMat);
    leftFoot.position.set(-1.15, 0.125, 0);
    const rightFoot = new THREE.Mesh(footGeo, steelMat);
    rightFoot.position.set(1.15, 0.125, 0);

    const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.95, 10);
    const leftPost = new THREE.Mesh(postGeo, steelMat);
    leftPost.position.set(-1.15, 0.65, 0);
    const rightPost = new THREE.Mesh(postGeo, steelMat);
    rightPost.position.set(1.15, 0.65, 0);

    const beamGeo = new THREE.BoxGeometry(2.85, 0.56, 0.38);
    const beam = new THREE.Mesh(beamGeo, hazardMat);
    beam.position.set(0, 0.88, 0);
    beam.castShadow = !isSoftwareGl;

    const lampGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.16, 12);
    const leftLamp = new THREE.Mesh(lampGeo, amberGlowMat);
    leftLamp.position.set(-1.15, 1.24, 0);
    const rightLamp = new THREE.Mesh(lampGeo, amberGlowMat);
    rightLamp.position.set(1.15, 1.24, 0);

    group.add(leftFoot, rightFoot, leftPost, rightPost, beam, leftLamp, rightLamp);
  } else if (kind === 'high_gate') {
    // Overhead Gantry (open underneath y=0..1.48, solid beam y=1.55..3.5, duckable!)
    const pillarGeo = new THREE.BoxGeometry(0.28, 3.3, 0.48);
    const leftPillar = new THREE.Mesh(pillarGeo, steelMat);
    leftPillar.position.set(-1.55, 1.65, 0);
    leftPillar.castShadow = !isSoftwareGl;

    const rightPillar = new THREE.Mesh(pillarGeo, steelMat);
    rightPillar.position.set(1.55, 1.65, 0);
    rightPillar.castShadow = !isSoftwareGl;

    const signGeo = new THREE.BoxGeometry(3.1, 1.25, 0.52);
    const sign = new THREE.Mesh(signGeo, hazardMat);
    sign.position.set(0, 2.38, 0);
    sign.castShadow = !isSoftwareGl;

    const topTrussGeo = new THREE.BoxGeometry(3.45, 0.25, 0.62);
    const topTruss = new THREE.Mesh(topTrussGeo, steelMat);
    topTruss.position.set(0, 3.15, 0);

    const lightBarGeo = new THREE.BoxGeometry(2.6, 0.14, 0.12);
    const lightBar = new THREE.Mesh(lightBarGeo, redGlowMat);
    lightBar.position.set(0, 1.72, 0.28);

    group.add(leftPillar, rightPillar, sign, topTruss, lightBar);
  } else if (kind === 'full_truck') {
    // Articulated Airport Fuel Tanker (height ~3.1m, must switch lanes)
    const chassisGeo = new THREE.BoxGeometry(2.25, 0.5, 6.2);
    const chassis = new THREE.Mesh(chassisGeo, steelMat);
    chassis.position.set(0, 0.55, 0);
    chassis.castShadow = !isSoftwareGl;

    const tankGeo = new THREE.CylinderGeometry(0.95, 0.95, 4.1, 20);
    tankGeo.rotateX(Math.PI / 2);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.68,
      roughness: 0.25,
    });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0, 1.72, 0.85);
    tank.castShadow = !isSoftwareGl;

    const stripeGeo = new THREE.CylinderGeometry(0.97, 0.97, 0.55, 20);
    stripeGeo.rotateX(Math.PI / 2);
    const stripe = new THREE.Mesh(stripeGeo, hazardMat);
    stripe.position.set(0, 1.72, 0.85);

    const cabGeo = new THREE.BoxGeometry(2.15, 1.65, 1.55);
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0xd93829,
      metalness: 0.4,
      roughness: 0.35,
    });
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 1.55, -2.05);
    cab.castShadow = !isSoftwareGl;

    const glassGeo = new THREE.BoxGeometry(1.9, 0.65, 0.08);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.1,
    });
    const windshield = new THREE.Mesh(glassGeo, glassMat);
    windshield.position.set(0, 1.82, -2.84);

    // Headlights facing player (-Z is front of truck facing -Z or +Z toward player)
    const hlGeo = new THREE.BoxGeometry(0.38, 0.2, 0.08);
    const hlLeft = new THREE.Mesh(hlGeo, amberGlowMat);
    hlLeft.position.set(-0.7, 1.0, -2.84);
    const hlRight = new THREE.Mesh(hlGeo, amberGlowMat);
    hlRight.position.set(0.7, 1.0, -2.84);

    // 6 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.1,
    });
    const wheelPositions: [number, number][] = [
      [-1.12, -2.05],
      [1.12, -2.05],
      [-1.12, 0.6],
      [1.12, 0.6],
      [-1.12, 2.1],
      [1.12, 2.1],
    ];
    wheelPositions.forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.42, wz);
      group.add(wheel);
    });

    // Reverse truck so cab faces +Z (toward oncoming player)
    group.add(chassis, tank, stripe, cab, windshield, hlLeft, hlRight);
    group.rotation.y = Math.PI;
  } else if (kind === 'ramp') {
    // Launch Ramp
    const rampShape = new THREE.Shape();
    rampShape.moveTo(0, 0);
    rampShape.lineTo(4.2, 0);
    rampShape.lineTo(4.2, 1.15);
    rampShape.closePath();

    const rampGeo = new THREE.ExtrudeGeometry(rampShape, {
      depth: 2.5,
      bevelEnabled: false,
    });
    rampGeo.rotateY(Math.PI / 2);
    rampGeo.translate(-1.25, 0, 2.1);

    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.55,
      roughness: 0.4,
    });
    const base = new THREE.Mesh(rampGeo, rampMat);
    base.castShadow = !isSoftwareGl;

    const deckGeo = new THREE.PlaneGeometry(2.4, 4.35);
    const deckMat = new THREE.MeshStandardMaterial({
      map: textures.rampChevron,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, 0.6, 0);
    deck.rotation.x = -Math.PI / 2 + Math.atan2(1.15, 4.2);

    group.add(base, deck);
  } else if (kind === 'catapult') {
    // Electromagnetic Sky-Catapult Pad (launches plane into high aerial ring trail!)
    const padBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.55, 0.22, 16),
      steelMat,
    );
    padBase.position.y = 0.11;
    const glowDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.08, 16),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    );
    glowDisc.position.y = 0.24;
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.07, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.68;
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    );
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 1.12;
    group.add(padBase, glowDisc, ring1, ring2);
  } else if (kind === 'boost_pad') {
    // Supersonic Runway Boost Strip
    const stripGeo = new THREE.PlaneGeometry(2.3, 4.8);
    stripGeo.rotateX(-Math.PI / 2);
    const stripMat = new THREE.MeshBasicMaterial({
      map: textures.rampChevron,
      color: 0x34d399,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.y = 0.04;
    group.add(strip);
  } else if (kind === 'puzzle_open' || kind === 'puzzle_locked') {
    // Futuristic Holographic Puzzle Gate
    const isOpen = kind === 'puzzle_open';
    const gateColor = isOpen ? 0x10b981 : 0xef4444;
    const frameMat = steelMat;

    const lPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 0.36), frameMat);
    lPost.position.set(-1.55, 1.8, 0);
    const rPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 0.36), frameMat);
    rPost.position.set(1.55, 1.8, 0);
    const header = new THREE.Mesh(new THREE.BoxGeometry(3.34, 0.38, 0.42), frameMat);
    header.position.set(0, 3.45, 0);
    group.add(lPost, rPost, header);

    // Glowing portal frame outline
    const stripMat = new THREE.MeshBasicMaterial({ color: gateColor });
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.1, 0.46), stripMat);
    topStrip.position.set(0, 3.24, 0);
    group.add(topStrip);

    // Floating 3D Geometric Puzzle Emblem above gate
    const sym = createPuzzleSymbolMesh(
      puzzleShape || 'diamond',
      isOpen ? 0x34d399 : 0xf87171,
    );
    sym.position.set(0, 4.25, 0);
    group.add(sym);

    if (isOpen) {
      // Safe translucent energy curtain
      const safeCurtain = new THREE.Mesh(
        new THREE.PlaneGeometry(2.86, 3.1),
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
        }),
      );
      safeCurtain.position.set(0, 1.6, 0);
      group.add(safeCurtain);
    } else {
      // Locked red laser barrier bars
      const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.86, 8);
      barGeo.rotateZ(Math.PI / 2);
      [0.65, 1.45, 2.25, 2.95].forEach((by) => {
        const laser = new THREE.Mesh(barGeo, redGlowMat);
        laser.position.set(0, by, 0);
        group.add(laser);
      });
    }
  }

  return group;
}

export function createCoinMesh(): THREE.Group {
  const group = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.88,
    roughness: 0.18,
    emissive: 0xb45309,
    emissiveIntensity: 0.18,
  });

  const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 18);
  coinGeo.rotateX(Math.PI / 2);
  const disc = new THREE.Mesh(coinGeo, goldMat);

  const rimGeo = new THREE.TorusGeometry(0.38, 0.055, 8, 18);
  const rim = new THREE.Mesh(rimGeo, goldMat);

  group.add(disc, rim);
  return group;
}

export function createPowerUpMesh(type: PowerUpType): THREE.Group {
  const group = new THREE.Group();

  const colorMap: Record<PowerUpType, number> = {
    magnet: 0xef4444,
    shield: 0x06b6d4,
    turbo: 0xf59e0b,
    multiplier: 0xa855f7,
  };
  const color = colorMap[type];

  const ringGeo = new THREE.TorusGeometry(0.68, 0.08, 10, 24);
  const ringMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.6,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: color,
    emissiveIntensity: 0.35,
    metalness: 0.75,
    roughness: 0.2,
  });

  if (type === 'magnet') {
    const uGeo = new THREE.TorusGeometry(0.32, 0.1, 10, 16, Math.PI);
    const uMesh = new THREE.Mesh(uGeo, coreMat);
    uMesh.rotation.z = Math.PI;
    uMesh.position.y = 0.08;
    group.add(uMesh);
  } else if (type === 'shield') {
    const octGeo = new THREE.OctahedronGeometry(0.36, 0);
    const oct = new THREE.Mesh(octGeo, coreMat);
    group.add(oct);
  } else if (type === 'turbo') {
    const coneGeo = new THREE.ConeGeometry(0.28, 0.65, 12);
    const cone = new THREE.Mesh(coneGeo, coreMat);
    group.add(cone);
  } else {
    const starGeo = new THREE.OctahedronGeometry(0.38, 0);
    const star = new THREE.Mesh(starGeo, coreMat);
    star.scale.set(1.2, 0.85, 0.55);
    group.add(star);
  }

  return group;
}

export function createRoadSegment(
  length: number,
  textures: ProceduralTextures,
  isSoftwareGl: boolean,
): THREE.Group {
  const seg = new THREE.Group();

  // 1. Sleek Reflective Carbon-Slate Skyway Deck
  const roadGeo = new THREE.PlaneGeometry(11.4, length);
  roadGeo.rotateX(-Math.PI / 2);
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.roadAlbedo,
    roughnessMap: textures.roadRoughness,
    roughness: 0.42,
    metalness: 0.28,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = !isSoftwareGl;
  seg.add(road);

  // 2. Titanium Bridge Side Girders + Translucent Glass Safety Barriers
  const girderMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.8,
    roughness: 0.25,
  });
  const girderGeo = new THREE.BoxGeometry(0.65, 0.68, length);
  const leftGirder = new THREE.Mesh(girderGeo, girderMat);
  leftGirder.position.set(-6.02, -0.14, 0);
  const rightGirder = new THREE.Mesh(girderGeo, girderMat);
  rightGirder.position.set(6.02, -0.14, 0);
  seg.add(leftGirder, rightGirder);

  const glassBarrierGeo = new THREE.BoxGeometry(0.08, 0.62, length - 0.3);
  const glassBarrierMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.22,
  });
  const leftGlass = new THREE.Mesh(glassBarrierGeo, glassBarrierMat);
  leftGlass.position.set(-5.82, 0.52, 0);
  const rightGlass = new THREE.Mesh(glassBarrierGeo, glassBarrierMat);
  rightGlass.position.set(5.82, 0.52, 0);
  seg.add(leftGlass, rightGlass);

  // Glowing side rail top trim
  const trimGeo = new THREE.BoxGeometry(0.12, 0.08, length);
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const leftTrim = new THREE.Mesh(trimGeo, trimMat);
  leftTrim.position.set(-5.82, 0.85, 0);
  const rightTrim = new THREE.Mesh(trimGeo, trimMat);
  rightTrim.position.set(5.82, 0.85, 0);
  seg.add(leftTrim, rightTrim);

  // 3. Overhead Architectural Skyway Arch (1 per 24m segment for dynamic speed sensation)
  const archGroup = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.34, 6.2, 0.48);
  const lLeg = new THREE.Mesh(legGeo, girderMat);
  lLeg.position.set(-6.2, 3.0, 0);
  lLeg.rotation.z = -0.14;
  const rLeg = new THREE.Mesh(legGeo, girderMat);
  rLeg.position.set(6.2, 3.0, 0);
  rLeg.rotation.z = 0.14;
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.36, 0.55), girderMat);
  crossBeam.position.set(0, 5.95, 0);
  const neonRib = new THREE.Mesh(
    new THREE.BoxGeometry(11.2, 0.12, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  );
  neonRib.position.set(0, 5.74, 0.22);
  archGroup.add(lLeg, rLeg, crossBeam, neonRib);
  seg.add(archGroup);

  // 4. Bridge Support Pier Below Deck
  const pierGeo = new THREE.BoxGeometry(1.4, 16, 1.4);
  const pier = new THREE.Mesh(pierGeo, girderMat);
  pier.position.set(0, -8.2, 0);
  seg.add(pier);

  // 5. Lower Cloud Sea / Illuminated Abyss Floor (14m below viaduct)
  const cloudFloorGeo = new THREE.PlaneGeometry(140, length);
  cloudFloorGeo.rotateX(-Math.PI / 2);
  const cloudFloorMat = new THREE.MeshBasicMaterial({
    color: 0x0b1528,
    transparent: true,
    opacity: 0.92,
  });
  const cloudFloor = new THREE.Mesh(cloudFloorGeo, cloudFloorMat);
  cloudFloor.position.set(0, -14, 0);
  seg.add(cloudFloor);

  // 6. Modern Illuminated Skyline Towers Flanking Both Sides
  const towerMat = new THREE.MeshStandardMaterial({
    map: textures.towerFacade,
    emissive: 0x1e3a5f,
    emissiveMap: textures.towerFacade,
    emissiveIntensity: 0.85,
    roughness: 0.35,
    metalness: 0.5,
  });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

  for (let side = -1; side <= 1; side += 2) {
    const h = 24 + Math.random() * 28;
    const w = 5.5 + Math.random() * 4.5;
    const d = 5.5 + Math.random() * 4.5;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat);
    const tx = side * (16 + Math.random() * 18);
    const tz = (Math.random() - 0.5) * 14;
    tower.position.set(tx, h * 0.5 - 15, tz);
    seg.add(tower);

    // Rooftop aviation beacon / crown trim
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.88, 0.25, d * 0.88),
      beaconMat,
    );
    crown.position.set(tx, h - 15 + 0.15, tz);
    seg.add(crown);
  }

  return seg;
}
