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

// Parameter für den Tunnel
const numPlanes = 30;      // Anzahl der Tunnel-Slices
const planeSpacing = 10;   // Abstand zwischen den Slices
const speed = 0.2;         // Bewegungsgeschwindigkeit

// Array, in dem die Tunnel-Slices gespeichert werden
const tunnelPlanes = [];

/**
 * Erzeugt ein Grid als Shape-Geometrie mit einem quadratischen Loch in der Mitte.
 * Durch die interne Triangulierung von ShapeGeometry entstehen auch diagonale Linien,
 * die der Geometrie einen realistischen 3D-Look verleihen.
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

  // Der segments-Parameter steuert, wie fein das Grid unterteilt wird – mehr Segmente = mehr diagonale Linien
  const geometry = new THREE.ShapeGeometry(shape, segments);
  return geometry;
}

// Erzeuge die Grid-Geometrie (Größe 50x50, Loch 20x20, feine Unterteilung)
const gridGeometry = createGridWithSquareHoleGeometry(50, 50, 20, 20);
const gridMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

// Erzeuge die Tunnel-Slices und ordne sie entlang der Z-Achse an
for (let i = 0; i < numPlanes; i++) {
  const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
  gridMesh.position.z = -i * planeSpacing;
  tunnelPlanes.push(gridMesh);
  scene.add(gridMesh);
}

// Animationsloop: Bewegt die Tunnel-Slices in Richtung der Kamera,
// sodass ein endloser Tunnel-Effekt entsteht.
function animate() {
  requestAnimationFrame(animate);
  tunnelPlanes.forEach(mesh => {
    mesh.position.z += speed;
    if (mesh.position.z > camera.position.z + planeSpacing / 2) {
      mesh.position.z -= numPlanes * planeSpacing;
    }
  });
  renderer.render(scene, camera);
}

animate();

setup();
