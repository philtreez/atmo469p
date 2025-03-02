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
            // Lade RNBO-Script dynamisch (alternativ per <script>-Tag einbinden)
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
    
    // (Optional) Hole Abhängigkeiten, falls benötigt
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

    // Verbinde das Gerät mit dem AudioGraph
    device.node.connect(outputNode);

    // Initialisiere die Three.js-Szene mit 8 3D-Objekten
    initScene();

    // Outport-Listener: Aktualisiere die 3D-Objekte basierend auf RNBO-Nachrichten
    attachOutports(device);

    // Starte den AudioContext bei einer Nutzerinteraktion
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

// Globale Variablen für Three.js
let scene, camera, renderer, sceneObjects = {};

// Initialisiere Three.js-Szene, Kamera, Renderer und 3D-Objekte
function initScene() {
    // Erstelle Szene
    scene = new THREE.Scene();
    // Erstelle Kamera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    // Erstelle Renderer und füge ihn dem Webflow-Container hinzu
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const container = document.getElementById("threejs-container");
    container.appendChild(renderer.domElement);

    // Füge Licht hinzu
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Definiere die Outport-Namen
    const outportNames = ["a", "t", "m", "o", "four", "six", "nine", "p"];

    // Erzeuge für jeden Outport ein 3D-Objekt (z. B. Würfel) und platziere sie in der Szene
    outportNames.forEach((name, index) => {
        const geometry = new THREE.BoxGeometry(5, 5, 5);
        const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        const mesh = new THREE.Mesh(geometry, material);
        // Positioniere die Objekte in einem Kreis
        const angle = (index / outportNames.length) * Math.PI * 2;
        const radius = 20;
        mesh.position.x = Math.cos(angle) * radius;
        mesh.position.y = Math.sin(angle) * radius;
        mesh.position.z = (Math.random() - 0.5) * 20;
        scene.add(mesh);
        sceneObjects[name] = mesh;
    });

    animate();
}

// Animationsloop: Aktualisiere Szene und rendere sie
function animate() {
    requestAnimationFrame(animate);
    // Optionale Rotation der Objekte
    Object.values(sceneObjects).forEach(obj => {
        obj.rotation.x += 0.005;
        obj.rotation.y += 0.005;
    });
    renderer.render(scene, camera);
}

// Abonniere RNBO-Nachrichten und aktualisiere die 3D-Objekte
function attachOutports(device) {
    device.messageEvent.subscribe((ev) => {
        const obj = sceneObjects[ev.tag];
        if (obj) {
            let value = parseInt(ev.payload);
            if (!isNaN(value)) {
                // Beispiel: Aktualisiere die Skalierung des Objekts basierend auf dem Wert (0 bis 10)
                let scaleFactor = 0.5 + (value / 10) * 2;
                obj.scale.set(scaleFactor, scaleFactor, scaleFactor);

                // Alternativ: Position oder Farbe anpassen, z. B.
                // obj.position.y = (value - 5) * 2;
                // obj.material.color.setHSL(value / 10, 1, 0.5);
            }
        }
        console.log(`${ev.tag}: ${ev.payload}`);
    });
}

setup();
