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
const numPlanes = 30;      // Anzahl der Tunnel-Schnitte
const planeSpacing = 10;   // Abstand zwischen den Schnitten
const speed = 0.2;         // Bewegungsgeschwindigkeit

// Array, in dem die Tunnel-Schnitte gespeichert werden
const tunnelPlanes = [];

/**
 * Erzeugt ein Linien-Grid, bestehend aus horizontalen und vertikalen Linien,
 * mit einem zentralen quadratischen Loch (ohne diagonale Linien).
 *
 * @param {number} width Gesamtbreite des Grids
 * @param {number} height Gesamthöhe des Grids
 * @param {number} holeSize Seitenlänge des quadratischen Lochs in der Mitte
 * @param {number} divisionsX Anzahl der vertikalen Teilungen
 * @param {number} divisionsY Anzahl der horizontalen Teilungen
 * @returns {THREE.BufferGeometry} BufferGeometry mit den berechneten Linien
 */
function createGridWithSquareHoleLines(width, height, holeSize, divisionsX, divisionsY) {
  const positions = [];
  
  // Vertikale Linien
  for (let i = 0; i < divisionsX; i++) {
    const x = -width / 2 + (width / (divisionsX - 1)) * i;
    // Liegt diese Linie innerhalb des Loch-Bereichs?
    if (Math.abs(x) < holeSize / 2) {
      // Erzeuge zwei separate Linien: von unten bis zum Loch und von oberhalb des Lochs bis nach oben
      positions.push(x, -height / 2, 0);
      positions.push(x, -holeSize / 2, 0);
      positions.push(x, holeSize / 2, 0);
      positions.push(x, height / 2, 0);
    } else {
      // Eine einzelne Linie von unten bis oben
      positions.push(x, -height / 2, 0);
      positions.push(x, height / 2, 0);
    }
  }
  
  // Horizontale Linien
  for (let j = 0; j < divisionsY; j++) {
    const y = -height / 2 + (height / (divisionsY - 1)) * j;
    if (Math.abs(y) < holeSize / 2) {
      // Zwei separate Linien: von links bis zum Loch und von rechts des Lochs bis ganz rechts
      positions.push(-width / 2, y, 0);
      positions.push(-holeSize / 2, y, 0);
      positions.push(holeSize / 2, y, 0);
      positions.push(width / 2, y, 0);
    } else {
      // Eine einzelne Linie von links nach rechts
      positions.push(-width / 2, y, 0);
      positions.push(width / 2, y, 0);
    }
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// Erzeuge die Grid-Geometrie: Gesamtgröße 50x50, Lochgröße 20, 10 Teilungen in X und Y
const gridGeometry = createGridWithSquareHoleLines(50, 50, 20, 10, 10);
const gridMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Neon-Magenta, typischer 80s Look

// Erzeuge numPlanes Tunnel-Schnitte, alle mit dem gleichen Linien-Grid
for (let i = 0; i < numPlanes; i++) {
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  grid.position.z = -i * planeSpacing;
  tunnelPlanes.push(grid);
  scene.add(grid);
}

// Animationsloop: Verschiebt die Tunnel-Schnitte in Richtung der Kamera
function animate() {
  requestAnimationFrame(animate);
  tunnelPlanes.forEach(plane => {
    plane.position.z += speed;
    // Wird ein Schnitt vor die Kamera verschoben, setze ihn wieder ans Ende des Tunnels
    if (plane.position.z > camera.position.z + planeSpacing / 2) {
      plane.position.z -= numPlanes * planeSpacing;
    }
  });
  renderer.render(scene, camera);
}

animate();


setup();
