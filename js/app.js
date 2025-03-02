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
  0.8,   // Stärke
  0.4,   // Radius
  0.85   // Schwellenwert
);
bloomPass.threshold = 0;
bloomPass.strength = 1; // Glowy-Effekt
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

// === Tunnel-Effekt Setup ===

// Parameter: 30 Tunnel-Slices, 10 Einheiten Abstand, speed in Einheiten pro Sekunde (hier 16)
const numPlanes = 30;
const planeSpacing = 10;
const speed = 16;
const tunnelPlanes = [];

// Erzeugt ein Grid mit einem quadratischen Loch in der Mitte.
// Durch die interne Triangulierung der ShapeGeometry entstehen auch diagonale Linien.
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

// Erzeuge Geometrie (Größe 50x50, zentrales Loch 20x20, feine Unterteilung)
const gridGeometry = createGridWithSquareHoleGeometry(50, 50, 40, 40);

// Für jeden Tunnel-Slice erzeugen wir ein eigenes Material, damit wir einzelne Slices individuell verändern können.
function createGridMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
}

// Erzeuge und positioniere die Tunnel-Slices entlang der z-Achse.
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
  
  // Resume AudioContext bei einer Nutzerinteraktion
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

// RNBO Outport-Listener: reagiert auch auf den Outport "grider"
function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    // Wenn der Outport "grider" 1 sendet, soll zufällig ein Tunnel-Slice aufleuchten.
    if (ev.tag === "grider") {
      if (parseInt(ev.payload) === 1) {
        const randomIndex = Math.floor(Math.random() * tunnelPlanes.length);
        const randomMesh = tunnelPlanes[randomIndex];
        // Speichere die Originalfarbe des Materials
        const originalColor = randomMesh.material.color.getHex();
        // Setze die Farbe auf hellgelb (z. B. 0xffff00) – "aufleuchten"
        randomMesh.material.color.set(0xffff00);
        // Nach 300 Millisekunden wieder auf die Originalfarbe zurücksetzen
        setTimeout(() => {
          randomMesh.material.color.set(originalColor);
        }, 300);
      }
    }
    // Debug-Ausgabe
    console.log(`${ev.tag}: ${ev.payload}`);
  });
}
