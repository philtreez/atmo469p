async function setup() {
    const patchExportURL = "https://atmo469p-philtreezs-projects.vercel.app/export/patch.export.json";
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    const outputNode = context.createGain();
    outputNode.connect(context.destination);

    let response = await fetch(patchExportURL);
    let patcher = await response.json();

    if (!window.RNBO) {
        await loadRNBOScript(patcher.desc.meta.rnboversion);
    }

    let device = await RNBO.createDevice({ context, patcher });
    device.node.connect(outputNode);

    // WebAudio Analyser für RNBO-Audio
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    device.node.connect(analyser);

    document.body.onclick = () => {
        context.resume();
    };

    initThree(analyser); // Starte Three.js Visualisierung
}

function initThree(analyser) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("three-container").appendChild(renderer.domElement);

    const vertexShader = `
        uniform float uTime;
        uniform float uAudio;
        varying vec3 vColor;
        void main() {
            vec3 pos = position;
            pos.x += sin(uTime * 0.5 + position.y * 5.0) * uAudio * 0.2;
            pos.y += cos(uTime * 0.7 + position.x * 3.0) * uAudio * 0.2;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = (uAudio * 5.0) + 2.0;
            vColor = vec3(sin(pos.x + uTime), cos(pos.y + uTime), sin(pos.z + uTime));
        }
    `;

    const fragmentShader = `
        varying vec3 vColor;
        void main() {
            gl_FragColor = vec4(vColor, 1.0);
        }
    `;

    const uniforms = {
        uTime: { value: 0.0 },
        uAudio: { value: 0.0 }
    };

    const geometry = new THREE.BufferGeometry();
    const count = 1000;
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 10;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    function animate() {
        requestAnimationFrame(animate);
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        
        let avgFreq = data.reduce((sum, val) => sum + val, 0) / data.length;
        uniforms.uAudio.value = avgFreq / 255; // RNBO-Audio beeinflusst Partikel
        uniforms.uTime.value += 0.05;
        
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });
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

function attachOutports(device) {
    const outports = device.outports;
    if (outports.length < 1) {
        document.getElementById("rnbo-console").removeChild(document.getElementById("rnbo-console-div"));
        return;
    }

    document.getElementById("rnbo-console").removeChild(document.getElementById("no-outports-label"));
    device.messageEvent.subscribe((ev) => {

        // Ignore message events that don't belong to an outport
        if (outports.findIndex(elt => elt.tag === ev.tag) < 0) return;

        // Message events have a tag as well as a payload
        console.log(`${ev.tag}: ${ev.payload}`);

        document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    });
}


setup();
