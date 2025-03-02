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
const numPlanes = 30;      // Anzahl der Tunnel-Platten
const planeSpacing = 10;   // Abstand zwischen den Platten
const speed = 0.2;         // Bewegungsgeschwindigkeit

// Array, in dem die einzelnen Tunnel-Platten gespeichert werden
const tunnelPlanes = [];

// Funktion, die ein Gitter mit einem quadratischen Loch in der Mitte erstellt
function createGridWithSquareHoleGeometry(width, height, holeSize, segments) {
  // Erzeuge ein Shape, das ein Rechteck darstellt
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.lineTo(-width / 2, -height / 2);

  // Füge ein quadratisches Loch hinzu
  const halfHole = holeSize / 2;
  const holePath = new THREE.Path();
  holePath.moveTo(-halfHole, -halfHole);
  holePath.lineTo(halfHole, -halfHole);
  holePath.lineTo(halfHole, halfHole);
  holePath.lineTo(-halfHole, halfHole);
  holePath.lineTo(-halfHole, -halfHole);
  shape.holes.push(holePath);

  // Erzeuge die Geometrie aus dem Shape
  const geometry = new THREE.ShapeGeometry(shape, segments);
  return geometry;
}

// Erzeuge numPlanes Tunnel-Platten mit dem gewünschten Grid-Look
for (let i = 0; i < numPlanes; i++) {
  // Erzeuge eine Fläche (50 x 50) mit einem quadratischen Loch (Seitenlänge 20) in der Mitte.
  const geometry = createGridWithSquareHoleGeometry(50, 50, 20, 20);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff00ff, // Neon-Magenta für den typischen 80s-Look
    wireframe: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Positioniere die Platte entlang der z-Achse
  mesh.position.z = -i * planeSpacing;
  tunnelPlanes.push(mesh);
  scene.add(mesh);
}

// Animationsloop: Verschiebt die Platten, sodass sie an der Kamera vorbeiziehen und einen Tunnel-Effekt erzeugen
function animate() {
  requestAnimationFrame(animate);
  tunnelPlanes.forEach(plane => {
    plane.position.z += speed;
    // Sobald eine Platte an die Kamera gelangt, wird sie wieder hinten angehängt
    if (plane.position.z > camera.position.z + planeSpacing / 2) {
      plane.position.z -= numPlanes * planeSpacing;
    }
  });
  renderer.render(scene, camera);
}

animate();

// RNBO Outport-Listener: Steuert Eigenschaften der 3D-Objekte
function attachOutports(device) {
    device.messageEvent.subscribe((ev) => {
        const obj = sceneObjects[ev.tag];
        if (obj) {
            let value = parseInt(ev.payload);
            if (!isNaN(value)) {
                // Ändere die Skalierung basierend auf dem Wert (0 bis 10)
                let scaleFactor = 0.5 + (value / 10) * 2;
                obj.scale.set(scaleFactor, scaleFactor, scaleFactor);
                // Passe zusätzlich die Rotation leicht an
                obj.rotation.z += value * 0.001;
                // Aktualisiere die Farbe (HSL) für einen retro-futuristischen Effekt
                obj.material.color.setHSL(value / 10, 1, 0.5);
            }
        }
        console.log(`${ev.tag}: ${ev.payload}`);
    });
}

setup();
