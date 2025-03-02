// === Three.js + Post-Processing Setup ===

// Szene, Kamera und Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const container = document.getElementById("threejs-container") || document.body;
container.appendChild(renderer.domElement);

// Effekt Composer: RenderPass, BloomPass und GlitchPass
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0,
  0.4,
  0.85
);
bloomPass.threshold = 0;
bloomPass.strength = 1.5;
bloomPass.radius = 0.5;
composer.addPass(bloomPass);
const glitchPass = new THREE.GlitchPass();
glitchPass.enabled = false;
composer.addPass(glitchPass);

// === Tunnel-Grid Setup ===

// Wir definieren hier das gesamte Grid: Ein Rechteck von 50×50, 
// in das wir ein zentrales Quadrat (20×20) "ausschneiden" und in den Zellen (10×10) beide Diagonalen einzeichnen.
const gridWidth = 50;
const gridHeight = 50;
const holeSize = 20;
const divisionsX = 10;
const divisionsY = 10;

/**
 * Erzeugt eine BufferGeometry, die für jedes Zellenquadrat (außerhalb des zentralen Lochs)
 * beide Diagonalen (also gespiegelte diagonale Linien) zeichnet.
 */
function createFullGridLinesGeometry(width, height, holeSize, divisionsX, divisionsY) {
  const positions = [];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const stepX = width / (divisionsX - 1);
  const stepY = height / (divisionsY - 1);
  
  // Für jede Zelle (zwischen benachbarten Scheitelpunkten)
  for (let i = 0; i < divisionsX - 1; i++) {
    for (let j = 0; j < divisionsY - 1; j++) {
      const x0 = -halfWidth + i * stepX;
      const x1 = -halfWidth + (i + 1) * stepX;
      const y0 = -halfHeight + j * stepY;
      const y1 = -halfHeight + (j + 1) * stepY;
      // Berechne das Zentrum der Zelle
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // Überspringe Zellen, deren Zentrum im zentralen Loch liegt
      if (Math.abs(cx) < holeSize / 2 && Math.abs(cy) < holeSize / 2) {
        continue;
      }
      // Diagonale von oben links (x0, y1) nach unten rechts (x1, y0)
      positions.push(x0, y1, 0, x1, y0, 0);
      // Diagonale von oben rechts (x1, y1) nach unten links (x0, y0)
      positions.push(x1, y1, 0, x0, y0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// Erzeuge die Grid-Linien-Geometrie
const gridLinesGeometry = createFullGridLinesGeometry(gridWidth, gridHeight, holeSize, divisionsX, divisionsY);
// Material für den Grid-Look
const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 1 });

// Erzeuge Tunnel-Slices: Wir duplizieren diese Grid-Linien-Geometrie für jeden Slice
const numSlices = 30;
const planeSpacing = 10;
const speed = 16; // Einheiten pro Sekunde
const tunnelSlices = [];

for (let i = 0; i < numSlices; i++) {
  const slice = new THREE.LineSegments(gridLinesGeometry, gridLineMaterial);
  slice.position.z = -i * planeSpacing;
  tunnelSlices.push(slice);
  scene.add(slice);
}

// === Animationsloop ===

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  tunnelSlices.forEach(slice => {
    slice.position.z += speed * delta;
    if (slice.position.z > camera.position.z + planeSpacing / 2) {
      slice.position.z -= numSlices * planeSpacing;
    }
  });
  composer.render();
}
animate();

// === RNBO Integration ===

async function setupRNBO() {
  const patchExportURL = "https://atmo469p-philtreezs-projects.vercel.app/export/patch.export.json";
  const WAContext = window.AudioContext || window.webkitAudioContext;
  const context = new WAContext();
  const outputNode = context.createGain();
  outputNode.connect(context.destination);
  
  let response, patcher;
  try {
    response = await fetch(patchExportURL);
    patcher = await response.json();
    if (!window.RNBO) {
      await loadRNBOScript(patcher.desc.meta.rnboversion);
    }
  } catch (err) {
    console.error("Fehler beim Laden des RNBO-Patchers:", err);
    return;
  }
  
  let dependencies = [];
  try {
    const dependenciesResponse = await fetch("export/dependencies.json");
    dependencies = await dependenciesResponse.json();
    dependencies = dependencies.map(d => d.file ? { ...d, file: "export/" + d.file } : d);
  } catch (e) { }
  
  let device;
  try {
    device = await RNBO.createDevice({ context, patcher });
  } catch (err) {
    console.error("Fehler beim Erstellen des RNBO-Geräts:", err);
    return;
  }
  
  device.node.connect(outputNode);
  attachOutports(device);
  
  document.body.onclick = () => context.resume();
}
setupRNBO();

function loadRNBOScript(version) {
  return new Promise((resolve, reject) => {
    if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
      throw new Error("Patcher exported with a Debug Version! Bitte gib die korrekte RNBO-Version an.");
    }
    const el = document.createElement("script");
    el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
    el.onload = resolve;
    el.onerror = function(err) {
      reject(new Error("Fehler beim Laden von rnbo.js v" + version));
    };
    document.body.appendChild(el);
  });
}

// === RNBO Outport-Listener ===

// "grider": Bei 1 wird ein zufällig ausgewählter Tunnel-Slice für 100 ms mit einem dicken Outline-Effekt (als zusätzliches, skaliertes LineSegments-Objekt) überlagert.
// "glitchy": Steuert den GlitchPass.
function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    if (ev.tag === "grider" && parseInt(ev.payload) === 1) {
      const randomIndex = Math.floor(Math.random() * tunnelSlices.length);
      const randomSlice = tunnelSlices[randomIndex];
      // Erzeuge eine Duplikat-LineSegments mit dickerem Material
      const thickMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff82, // Neon-Grün (ca. RGB 0,255,130)
        linewidth: 40,   // Hinweis: lineWidth wird nicht überall unterstützt
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const thickLines = new THREE.LineSegments(gridLinesGeometry, thickMaterial);
      // Skalieren, sodass nur ein kleiner "Hauch" leuchtet – mehr Grid bleibt sichtbar
      thickLines.scale.set(0.5, 0.5, 0.5);
      randomSlice.add(thickLines);
      setTimeout(() => {
        randomSlice.remove(thickLines);
      }, 100);
    }
    
    if (ev.tag === "glitchy") {
      glitchPass.enabled = (parseInt(ev.payload) === 1);
    }
    
    console.log(`${ev.tag}: ${ev.payload}`);
  });
}
