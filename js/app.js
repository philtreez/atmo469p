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

// Globale Variablen für Three.js
let scene, camera, renderer, sceneObjects = {};

// Erstelle eine Szene mit Grid und verschiedenen wireframe-Objekten
function initScene() {
    // Szene und Hintergrund
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Kamera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 40;

    // Renderer – der Canvas wird an den in Webflow angelegten Container angehängt
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const container = document.getElementById("threejs-container");
    container.appendChild(renderer.domElement);

    // Füge einen GridHelper hinzu – futuristischer Vector-Look
    const gridHelper = new THREE.GridHelper(100, 20, 0x00ff00, 0x005500);
    scene.add(gridHelper);

    // Licht – schlichte Ambient- und Richtungslichter
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Definiere die Outport-Namen und erzeuge für jeden ein anderes 3D-Objekt
    const outportNames = ["a", "t", "m", "o", "for", "six", "nine", "p"];
    outportNames.forEach((name, index) => {
        let geometry;
        switch (name) {
            case "a":
                geometry = new THREE.BoxGeometry(4, 4, 4);
                break;
            case "t":
                geometry = new THREE.SphereGeometry(3, 16, 16);
                break;
            case "m":
                geometry = new THREE.ConeGeometry(3, 6, 8);
                break;
            case "o":
                geometry = new THREE.CylinderGeometry(2.5, 2.5, 6, 16);
                break;
            case "for":
                geometry = new THREE.TorusGeometry(3, 1, 16, 100);
                break;
            case "six":
                geometry = new THREE.DodecahedronGeometry(3);
                break;
            case "nine":
                geometry = new THREE.OctahedronGeometry(3);
                break;
            case "p":
                geometry = new THREE.TetrahedronGeometry(3);
                break;
            default:
                geometry = new THREE.BoxGeometry(3, 3, 3);
        }
        // Verwende ein MeshBasicMaterial im Wireframe-Modus für den Vektor-Look
        const material = new THREE.MeshBasicMaterial({ 
            color: Math.random() * 0xffffff, 
            wireframe: true 
        });
        const mesh = new THREE.Mesh(geometry, material);
        // Positioniere die Objekte kreisförmig um den Ursprung
        const angle = (index / outportNames.length) * Math.PI * 2;
        const radius = 20;
        mesh.position.x = Math.cos(angle) * radius;
        mesh.position.y = Math.sin(angle) * radius;
        mesh.position.z = (Math.random() - 0.5) * 10;
        scene.add(mesh);
        sceneObjects[name] = mesh;
    });

    animate();
}

// Animationsloop: Rotiert die Objekte für einen dynamischen Effekt
function animate() {
    requestAnimationFrame(animate);
    Object.values(sceneObjects).forEach(obj => {
        obj.rotation.x += 0.01;
        obj.rotation.y += 0.01;
    });
    renderer.render(scene, camera);
}

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
