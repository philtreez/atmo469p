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

// Wir definieren den Tunnel als Serie von "Slices" (LineSegments) entlang der Z-Achse.
// Das Grid basiert auf einer Geometrie, die gespiegelte Diagonalen in jeder Zelle (außer im zentralen Loch) zeichnet.
const numSlices = 30;
const planeSpacing = 10;
const speed = 16; // Einheiten pro Sekunde
const tunnelSlices = [];

/**
 * Erzeugt eine BufferGeometry, die für jede Zelle (außer im zentralen Loch)
 * beide diagonalen Linien (gespiegelt) zeichnet.
 *
 * @param {number} width Gesamtbreite des Grids
 * @param {number} height Gesamthöhe des Grids
 * @param {number} holeSize Seitenlänge des zentralen Lochs (Quadrat)
 * @param {number} cellsX Anzahl der Zellen in X-Richtung
 * @param {number} cellsY Anzahl der Zellen in Y-Richtung
 * @returns {THREE.BufferGeometry} Die erzeugte Geometrie
 */
function createMirroredDiagonalsGeometry(width, height, holeSize, cellsX, cellsY) {
  const positions = [];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const stepX = width / cellsX;
  const stepY = height / cellsY;
  
  for (let i = 0; i < cellsX; i++) {
    for (let j = 0; j < cellsY; j++) {
      const x0 = -halfWidth + i * stepX;
      const x1 = x0 + stepX;
      const y0 = -halfHeight + j * stepY;
      const y1 = y0 + stepY;
      // Zentrum der Zelle
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // Überspringe Zellen im zentralen Loch (z. B. 20×20)
      if (Math.abs(cx) < holeSize / 2 && Math.abs(cy) < holeSize / 2) continue;
      
      // Diagonale von oben links nach unten rechts
      positions.push(x0, y1, 0, x1, y0, 0);
      // Diagonale von oben rechts nach unten links
      positions.push(x1, y1, 0, x0, y0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// Erzeuge die Grid-Linien-Geometrie: 50×50 Fläche, 20×20 zentrales Loch, 10×10 Zellen
const gridLinesGeometry = createMirroredDiagonalsGeometry(50, 50, 20, 10, 10);
// Material für das Grid (Neon-Grün)
const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 1 });

// Erzeuge Tunnel-Slices als LineSegments und positioniere sie entlang der Z-Achse
for (let i = 0; i < numSlices; i++) {
  const slice = new THREE.LineSegments(gridLinesGeometry, gridLineMaterial.clone());
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
  
  try {
    await fetch("export/dependencies.json")
      .then(r => r.json())
      .then(deps => {
        // Abhängigkeiten werden hier geladen, falls nötig.
      });
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
//
// Beim Outport "grider" wird ein zufällig ausgewählter Tunnel-Slice für 100 ms mit einem dicken Outline-Überzug versehen.
// Der Outline-Effekt wird direkt (ohne dynamische Skalierung) hinzugefügt, sodass das normale Tunnel-Grid nicht verändert wird.
function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    if (ev.tag === "grider" && parseInt(ev.payload) === 1) {
      const randomIndex = Math.floor(Math.random() * tunnelSlices.length);
      const randomSlice = tunnelSlices[randomIndex];
      // Erzeuge eine zusätzliche Outline als EdgesGeometry
      const edges = new THREE.EdgesGeometry(gridLinesGeometry);
      const thickMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff82,       // Neon-Grün (ca. RGB 0,255,130)
        linewidth: 40,         // Hinweis: lineWidth wird in vielen Browsern ignoriert.
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const thickOutline = new THREE.LineSegments(edges, thickMaterial);
      // Setze eine konstante Skalierung (keine Animation), sodass der Effekt sofort fett erscheint.
      thickOutline.scale.set(1, 1, 1);
      randomSlice.add(thickOutline);
      setTimeout(() => {
        randomSlice.remove(thickOutline);
      }, 100);
    }
    
    if (ev.tag === "glitchy") {
      glitchPass.enabled = (parseInt(ev.payload) === 1);
    }
    
    console.log(`${ev.tag}: ${ev.payload}`);
  });
}
