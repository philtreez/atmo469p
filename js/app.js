async function setup() {
    const patchExportURL = "https://atmo469p-philtreezs-projects.vercel.app/export/patch.export.json";

    // Erstelle AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    // Erstelle Gain-Node und verbinde ihn mit dem Audio-Ausgang
    const outputNode = context.createGain();
    outputNode.connect(context.destination);
    
    // Hole den exportierten RNBO-Patcher
    let response, patcher;
    try {
        response = await fetch(patchExportURL);
        patcher = await response.json();
    
        if (!window.RNBO) {
            await loadRNBOScript(patcher.desc.meta.rnboversion);
        }
    } catch (err) {
        const errorContext = { error: err };
        if (response && (response.status >= 300 || response.status < 200)) {
            errorContext.header = "Couldn't load patcher export bundle";
            errorContext.description = "Check app.js to see what file it's trying to load. Currently it's " +
             "trying to load \"" + patchExportURL + "\". If that doesn't " +
             "match the name of the file you exported from RNBO, modify " +
             "patchExportURL in app.js.";
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        } else {
            throw err;
        }
        return;
    }
    
    // (Optional) Abhängigkeiten laden, falls benötigt
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch("export/dependencies.json");
        dependencies = await dependenciesResponse.json();
        dependencies = dependencies.map(d => d.file ? { ...d, file: "export/" + d.file } : d);
    } catch (e) {}

    // Erstelle das RNBO-Gerät
    let device;
    try {
        device = await RNBO.createDevice({ context, patcher });
    } catch (err) {
        if (typeof guardrails === "function") {
            guardrails({ error: err });
        } else {
            throw err;
        }
        return;
    }

    device.node.connect(outputNode);

    // Initialisiere die Three.js-Szene im "future retro" Look
    initScene();

    // Abonniere RNBO-Nachrichten und steuere die 3D-Objekte
    attachOutports(device);

    document.body.onclick = () => {
        context.resume();
    };

    if (typeof guardrails === "function")
        guardrails();
}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
            throw new Error("Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code.");
        }
        const el = document.createElement("script");
        el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
        el.onload = resolve;
        el.onerror = function(err) {
            console.log(err);
            reject(new Error("Failed to load rnbo.js v" + version));
        };
        document.body.append(el);
    });
}

// Basis-Setup der Three.js-Szene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Schwarzer Hintergrund

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

// Post-Processing: EffektComposer mit UnrealBloomPass für den Glow-Effekt
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0,   // Stärke des Bloom-Effekts
  0.4,   // Radius
  0.85   // Schwellenwert
);
bloomPass.threshold = 0;
bloomPass.strength = 1.5; // Erhöht den glowy Effekt
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

// Parameter für den Tunnel
const numPlanes = 45;      // Anzahl der Tunnel-Slices
const planeSpacing = 10;   // Abstand zwischen den Slices
const speed = 4;           // Bewegungsgeschwindigkeit in Einheiten pro Sekunde

const tunnelPlanes = [];

/**
 * Erzeugt ein Grid als Shape-Geometrie mit einem zentralen quadratischen Loch.
 * Durch die interne Triangulierung entstehen auch diagonale Kanten, die der Geometrie einen echten 3D-Look verleihen.
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

// Erzeuge die Grid-Geometrie: Größe 50x50, Loch 20x20, feine Unterteilung (segments = 20)
const gridGeometry = createGridWithSquareHoleGeometry(50, 50, 20, 20);
const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

// Erzeuge die Tunnel-Slices und ordne sie entlang der Z-Achse an
for (let i = 0; i < numPlanes; i++) {
  const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
  gridMesh.position.z = -i * planeSpacing;
  tunnelPlanes.push(gridMesh);
  scene.add(gridMesh);
}

// Erstelle eine Clock, um Delta Time zu messen
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); // Zeit in Sekunden seit dem letzten Frame
  
  // Aktualisiere die Position der Tunnel-Slices basierend auf der verstrichenen Zeit
  tunnelPlanes.forEach(mesh => {
    mesh.position.z += speed * delta;
    if (mesh.position.z > camera.position.z + planeSpacing / 2) {
      mesh.position.z -= numPlanes * planeSpacing;
    }
  });
  
  composer.render();
}

animate();

setup();
