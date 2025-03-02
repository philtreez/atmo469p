// === Three.js + Post-Processing Setup ===

// Szene und Kamera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Schwarzer Hintergrund
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const container = document.getElementById("threejs-container") || document.body;
container.appendChild(renderer.domElement);

// Effekt Composer für den Glow-Effekt
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0,   // Stärke
  0.4,   // Radius
  0.55   // Schwellenwert
);
bloomPass.threshold = 0;
bloomPass.strength = 1; // Glowy-Effekt
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

// === Tunnel-Effekt Setup ===

// Parameter: 30 Tunnel-Slices, 10 Einheiten Abstand, speed in Einheiten pro Sekunde (hier 16, anpassbar an BPM)
const numPlanes = 32;
const planeSpacing = 4;
const speed = 32;
const tunnelPlanes = [];

/**
 * Erzeugt ein Grid als Shape-Geometrie mit einem zentralen quadratischen Loch.
 * Die interne Triangulierung erzeugt auch diagonale Kanten, was dem Grid einen echten 3D-Look verleiht.
 *
 * @param {number} width Gesamtbreite des Grids
 * @param {number} height Gesamthöhe des Grids
 * @param {number} holeSize Seitenlänge des quadratischen Lochs in der Mitte
 * @param {number} segments Detailgrad der Triangulierung
 * @returns {THREE.ShapeGeometry} Die erzeugte Geometrie
 */
function createGridWithSquareHoleGeometry(width, height, holeSize, segments) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.lineTo(-width / 2, -height / 2);

  const halfHole = holeSize / 2;
  const holePath = new THREE.Path();
  holePath.moveTo(-halfHole, -halfHole);
  holePath.lineTo(halfHole, -halfHole);
  holePath.lineTo(halfHole, halfHole);
  holePath.lineTo(-halfHole, halfHole);
  holePath.lineTo(-halfHole, -halfHole);
  shape.holes.push(holePath);

  return new THREE.ShapeGeometry(shape, segments);
}

// Erzeuge Geometrie: Größe 50x50, zentrales Loch 20x20, feine Unterteilung (segments = 20)
const gridGeometry = createGridWithSquareHoleGeometry(20, 20, 15, 15);

// Für jeden Tunnel-Slice erzeugen wir ein eigenes Material – zunächst im Wireframe-Modus (Neon-Grün)
function createGridMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
}

// Erzeuge und positioniere die Tunnel-Slices entlang der Z-Achse.
for (let i = 0; i < numPlanes; i++) {
  const material = createGridMaterial();
  const gridMesh = new THREE.Mesh(gridGeometry, material);
  gridMesh.position.z = -i * planeSpacing;
  tunnelPlanes.push(gridMesh);
  scene.add(gridMesh);
}

// Erstelle eine Clock, um Delta Time (Zeitdifferenz) zu messen.
const clock = new THREE.Clock();

// Animationsloop: Zeitbasierte Bewegung
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); // Sekunden seit letztem Frame
  
  tunnelPlanes.forEach(mesh => {
    mesh.position.z += speed * delta;
    if (mesh.position.z > camera.position.z + planeSpacing / 2) {
      mesh.position.z -= numPlanes * planeSpacing;
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
  
  // (Optional) Abhängigkeiten laden, falls benötigt...
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
  
  // Resume AudioContext bei Nutzerinteraktion
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

// RNBO Outport-Listener: reagiert auf den Outport "grider"
// Bei einer 1 wird zufällig ein Tunnel-Slice ausgewählt, dem für 100 ms ein dicker, glowy Outline-Effekt hinzugefügt wird.
function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    if (ev.tag === "grider" && parseInt(ev.payload) === 1) {
      const randomIndex = Math.floor(Math.random() * tunnelPlanes.length);
      const randomMesh = tunnelPlanes[randomIndex];
      // Erzeuge einen dicken Outline-Effekt: Erstelle aus der vorhandenen Geometrie ein EdgesGeometry
      const edges = new THREE.EdgesGeometry(randomMesh.geometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff82, // Neon-Grün (ca. RGB 0,255,130)
        linewidth: 40,   // Hinweis: lineWidth wird in vielen Browsern ignoriert.
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const thickOutline = new THREE.LineSegments(edges, lineMaterial);
      
      // SKALIEREN: Reduziere den Outline-Block, damit er nur ein kleiner Teil des Slices ist.
      thickOutline.scale.set(0.5, 0.5, 0.5);
      
      // Füge den Outline als Kind hinzu, sodass er an derselben Position gerendert wird.
      randomMesh.add(thickOutline);
      // Entferne den Outline-Effekt nach 100 ms.
      setTimeout(() => {
        randomMesh.remove(thickOutline);
      }, 100);
    }
    console.log(`${ev.tag}: ${ev.payload}`);
  });
}
