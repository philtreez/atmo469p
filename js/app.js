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

/// Basis-Setup der Three.js-Szene
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

// Hänge den Renderer an einen Container in Webflow (z.B. mit der ID "threejs-container")
const container = document.getElementById("threejs-container") || document.body;
container.appendChild(renderer.domElement);

// Parameter für den Tunnel
const numPlanes = 30;       // Anzahl der Gitterplatten
const planeSpacing = 10;    // Abstand zwischen den Platten
const speed = 0.2;          // Geschwindigkeit der Bewegung

// Array, in dem die einzelnen Gitter-Platten gespeichert werden
const tunnelPlanes = [];

// Erzeuge numPlanes Plane-Meshes mit Wireframe-Material
for (let i = 0; i < numPlanes; i++) {
  // Erzeuge ein Plane-Geometry mit Segmenten, damit das Wireframe einen Gitter-Look hat
  const geometry = new THREE.PlaneGeometry(50, 50, 20, 20);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ffff, // Neon-Türkis, klassischer 80er Look
    wireframe: true
  });
  const plane = new THREE.Mesh(geometry, material);
  // Positioniere die Platte entlang der z-Achse
  plane.position.z = -i * planeSpacing;
  tunnelPlanes.push(plane);
  scene.add(plane);
}

// Animationsloop: Bewegt die Platten in Richtung Kamera, um einen Tunnel-Effekt zu erzeugen
function animate() {
  requestAnimationFrame(animate);
  tunnelPlanes.forEach(plane => {
    // Bewege die Platte nach vorne (Richtung der Kamera)
    plane.position.z += speed;
    // Wenn die Platte die Kamera passiert hat, setze sie ans Ende des Tunnels
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
