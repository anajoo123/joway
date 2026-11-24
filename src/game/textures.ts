import * as THREE from 'three';

export interface ProceduralTextures {
  roadAlbedo: THREE.CanvasTexture;
  roadRoughness: THREE.CanvasTexture;
  hazardStripes: THREE.CanvasTexture;
  rampChevron: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  mrjooWingDecal: THREE.CanvasTexture;
  mrjooTailDecal: THREE.CanvasTexture;
  fuselagePanels: THREE.CanvasTexture;
  towerFacade: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  // 1. Modern Futuristic Skyway Bridge Deck Texture
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 1024;
  roadCanvas.height = 1024;
  const rCtx = roadCanvas.getContext('2d')!;

  // Deep metallic carbon-slate gradient across road width
  const bgGrad = rCtx.createLinearGradient(0, 0, 1024, 0);
  bgGrad.addColorStop(0, '#0c1322');
  bgGrad.addColorStop(0.15, '#141e30');
  bgGrad.addColorStop(0.5, '#19253b');
  bgGrad.addColorStop(0.85, '#141e30');
  bgGrad.addColorStop(1, '#0c1322');
  rCtx.fillStyle = bgGrad;
  rCtx.fillRect(0, 0, 1024, 1024);

  // Subtle composite micro-texture
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const v = 24 + Math.floor(Math.random() * 24);
    rCtx.fillStyle = `rgba(${v},${v + 12},${v + 28}, 0.45)`;
    rCtx.fillRect(x, y, 2, 3);
  }

  // Sleek metallic bridge expansion joints every 256px
  rCtx.fillStyle = 'rgba(148, 163, 184, 0.16)';
  for (let y = 0; y < 1024; y += 256) {
    rCtx.fillRect(0, y, 1024, 4);
  }

  // Polished jet-wash tracks along 3 lanes
  const laneCenters = [192, 512, 832];
  laneCenters.forEach((cx) => {
    const grad = rCtx.createLinearGradient(cx - 88, 0, cx + 88, 0);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0)');
    grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.08)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    rCtx.fillStyle = grad;
    rCtx.fillRect(cx - 88, 0, 176, 1024);
  });

  // Outer glowing amber-gold shoulder rails
  rCtx.fillStyle = '#f59e0b';
  rCtx.fillRect(24, 0, 14, 1024);
  rCtx.fillRect(986, 0, 14, 1024);

  // Inner cyan LED guide strips
  rCtx.fillStyle = '#38bdf8';
  rCtx.fillRect(46, 0, 8, 1024);
  rCtx.fillRect(970, 0, 8, 1024);

  // Sleek segmented glowing lane dividers
  for (let y = 16; y < 1024; y += 128) {
    rCtx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    rCtx.fillRect(347, y, 10, 74);
    rCtx.fillRect(667, y, 10, 74);
    rCtx.fillStyle = 'rgba(56, 189, 248, 0.8)';
    rCtx.fillRect(349, y + 82, 6, 16);
    rCtx.fillRect(669, y + 82, 6, 16);
  }

  // Futuristic illuminated direction chevrons in lane centers
  rCtx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  rCtx.lineWidth = 7;
  rCtx.lineCap = 'round';
  for (let y = 110; y < 1024; y += 256) {
    laneCenters.forEach((cx) => {
      rCtx.beginPath();
      rCtx.moveTo(cx - 30, y + 26);
      rCtx.lineTo(cx, y);
      rCtx.lineTo(cx + 30, y + 26);
      rCtx.stroke();
    });
  }

  const roadAlbedo = new THREE.CanvasTexture(roadCanvas);
  roadAlbedo.colorSpace = THREE.SRGBColorSpace;
  roadAlbedo.wrapS = THREE.ClampToEdgeWrapping;
  roadAlbedo.wrapT = THREE.RepeatWrapping;
  roadAlbedo.anisotropy = maxAnisotropy;

  // 2. Road Roughness Map (sleek satin reflections on lane surfaces)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rgCtx = roughCanvas.getContext('2d')!;
  rgCtx.fillStyle = '#8a8a8a';
  rgCtx.fillRect(0, 0, 512, 512);
  [96, 256, 416].forEach((cx) => {
    const grad = rgCtx.createLinearGradient(cx - 48, 0, cx + 48, 0);
    grad.addColorStop(0, 'rgba(80, 80, 80, 0)');
    grad.addColorStop(0.5, 'rgba(65, 65, 65, 0.75)');
    grad.addColorStop(1, 'rgba(80, 80, 80, 0)');
    rgCtx.fillStyle = grad;
    rgCtx.fillRect(cx - 48, 0, 96, 512);
  });
  const roadRoughness = new THREE.CanvasTexture(roughCanvas);
  roadRoughness.wrapS = THREE.ClampToEdgeWrapping;
  roadRoughness.wrapT = THREE.RepeatWrapping;
  roadRoughness.anisotropy = maxAnisotropy;

  // 3. Hazard Stripes Texture
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 256;
  const hCtx = hazCanvas.getContext('2d')!;
  hCtx.fillStyle = '#f59e0b';
  hCtx.fillRect(0, 0, 256, 256);
  hCtx.fillStyle = '#0f172a';
  for (let i = -256; i < 512; i += 64) {
    hCtx.beginPath();
    hCtx.moveTo(i, 0);
    hCtx.lineTo(i + 32, 0);
    hCtx.lineTo(i + 288, 256);
    hCtx.lineTo(i + 256, 256);
    hCtx.closePath();
    hCtx.fill();
  }
  const hazardStripes = new THREE.CanvasTexture(hazCanvas);
  hazardStripes.colorSpace = THREE.SRGBColorSpace;
  hazardStripes.wrapS = THREE.RepeatWrapping;
  hazardStripes.wrapT = THREE.RepeatWrapping;
  hazardStripes.anisotropy = maxAnisotropy;

  // 4. Ramp / Boost Chevron Texture
  const rampCanvas = document.createElement('canvas');
  rampCanvas.width = 256;
  rampCanvas.height = 256;
  const rmCtx = rampCanvas.getContext('2d')!;
  rmCtx.fillStyle = '#091526';
  rmCtx.fillRect(0, 0, 256, 256);
  rmCtx.strokeStyle = '#22d3ee';
  rmCtx.lineWidth = 22;
  rmCtx.lineCap = 'round';
  rmCtx.lineJoin = 'round';
  [70, 145, 220].forEach((y) => {
    rmCtx.beginPath();
    rmCtx.moveTo(44, y);
    rmCtx.lineTo(128, y - 50);
    rmCtx.lineTo(212, y);
    rmCtx.stroke();
  });
  const rampChevron = new THREE.CanvasTexture(rampCanvas);
  rampChevron.colorSpace = THREE.SRGBColorSpace;
  rampChevron.anisotropy = maxAnisotropy;

  // 5. Radial Soft Contact Shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d')!;
  const sGrad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  sGrad.addColorStop(0, 'rgba(3, 6, 12, 0.8)');
  sGrad.addColorStop(0.55, 'rgba(3, 6, 12, 0.35)');
  sGrad.addColorStop(1, 'rgba(3, 6, 12, 0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  // 6. Signature MRJOo Wing & Fuselage Livery Decal
  const wingDecalCanvas = document.createElement('canvas');
  wingDecalCanvas.width = 1024;
  wingDecalCanvas.height = 256;
  const wCtx = wingDecalCanvas.getContext('2d')!;
  wCtx.clearRect(0, 0, 1024, 256);

  wCtx.fillStyle = 'rgba(10, 15, 28, 0.92)';
  wCtx.beginPath();
  wCtx.moveTo(40, 26);
  wCtx.lineTo(990, 26);
  wCtx.lineTo(950, 230);
  wCtx.lineTo(10, 230);
  wCtx.closePath();
  wCtx.fill();

  wCtx.strokeStyle = '#f59e0b';
  wCtx.lineWidth = 10;
  wCtx.stroke();

  wCtx.fillStyle = '#f59e0b';
  wCtx.beginPath();
  wCtx.moveTo(68, 56);
  wCtx.lineTo(140, 56);
  wCtx.lineTo(108, 200);
  wCtx.lineTo(36, 200);
  wCtx.closePath();
  wCtx.fill();

  wCtx.font = 'italic 900 132px "Chakra Petch", "Arial Black", sans-serif';
  wCtx.textAlign = 'center';
  wCtx.textBaseline = 'middle';
  wCtx.fillStyle = '#f8fafc';
  wCtx.fillText('MRJOo', 540, 134);

  wCtx.lineWidth = 3;
  wCtx.strokeStyle = '#fbbf24';
  wCtx.strokeText('MRJOo', 540, 134);

  const mrjooWingDecal = new THREE.CanvasTexture(wingDecalCanvas);
  mrjooWingDecal.colorSpace = THREE.SRGBColorSpace;
  mrjooWingDecal.anisotropy = maxAnisotropy;

  // 7. Signature MRJOo Tail Fin Banner
  const tailCanvas = document.createElement('canvas');
  tailCanvas.width = 512;
  tailCanvas.height = 256;
  const tCtx = tailCanvas.getContext('2d')!;
  tCtx.fillStyle = '#0f172a';
  tCtx.fillRect(0, 0, 512, 256);

  tCtx.fillStyle = '#f59e0b';
  tCtx.fillRect(0, 18, 512, 18);
  tCtx.fillRect(0, 220, 512, 18);

  tCtx.font = 'italic 900 94px "Chakra Petch", "Arial Black", sans-serif';
  tCtx.textAlign = 'center';
  tCtx.textBaseline = 'middle';
  tCtx.fillStyle = '#ffffff';
  tCtx.fillText('MRJOo', 256, 132);

  const mrjooTailDecal = new THREE.CanvasTexture(tailCanvas);
  mrjooTailDecal.colorSpace = THREE.SRGBColorSpace;
  mrjooTailDecal.anisotropy = maxAnisotropy;

  // 8. Aerospace Fuselage Panel Lines Texture
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 512;
  panelCanvas.height = 512;
  const pCtx = panelCanvas.getContext('2d')!;
  pCtx.fillStyle = '#ffffff';
  pCtx.fillRect(0, 0, 512, 512);
  pCtx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  pCtx.lineWidth = 2;
  for (let y = 0; y < 512; y += 64) {
    pCtx.beginPath();
    pCtx.moveTo(0, y);
    pCtx.lineTo(512, y);
    pCtx.stroke();
  }
  for (let x = 0; x < 512; x += 128) {
    pCtx.beginPath();
    pCtx.moveTo(x, 0);
    pCtx.lineTo(x, 512);
    pCtx.stroke();
  }
  const fuselagePanels = new THREE.CanvasTexture(panelCanvas);
  fuselagePanels.colorSpace = THREE.SRGBColorSpace;
  fuselagePanels.wrapS = THREE.RepeatWrapping;
  fuselagePanels.wrapT = THREE.RepeatWrapping;
  fuselagePanels.anisotropy = maxAnisotropy;

  // 9. Modern Illuminated Skyscraper Facade Texture
  const towerCanvas = document.createElement('canvas');
  towerCanvas.width = 256;
  towerCanvas.height = 512;
  const twCtx = towerCanvas.getContext('2d')!;
  twCtx.fillStyle = '#0e172a';
  twCtx.fillRect(0, 0, 256, 512);

  for (let y = 12; y < 500; y += 22) {
    const litRow = Math.random() > 0.25;
    for (let x = 14; x < 242; x += 28) {
      if (litRow && Math.random() > 0.32) {
        twCtx.fillStyle =
          Math.random() > 0.72
            ? 'rgba(251, 191, 36, 0.8)'
            : 'rgba(56, 189, 248, 0.72)';
      } else {
        twCtx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      }
      twCtx.fillRect(x, y, 18, 10);
    }
  }
  const towerFacade = new THREE.CanvasTexture(towerCanvas);
  towerFacade.colorSpace = THREE.SRGBColorSpace;
  towerFacade.wrapS = THREE.RepeatWrapping;
  towerFacade.wrapT = THREE.RepeatWrapping;
  towerFacade.anisotropy = maxAnisotropy;

  return {
    roadAlbedo,
    roadRoughness,
    hazardStripes,
    rampChevron,
    contactShadow,
    mrjooWingDecal,
    mrjooTailDecal,
    fuselagePanels,
    towerFacade,
    dispose: () => {
      roadAlbedo.dispose();
      roadRoughness.dispose();
      hazardStripes.dispose();
      rampChevron.dispose();
      contactShadow.dispose();
      mrjooWingDecal.dispose();
      mrjooTailDecal.dispose();
      fuselagePanels.dispose();
      towerFacade.dispose();
    },
  };
}
