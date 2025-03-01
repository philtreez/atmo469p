
// Laden von Three.js und OrbitControls
const THREE_SCRIPT = document.createElement("script");
THREE_SCRIPT.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
document.head.appendChild(THREE_SCRIPT);

const ORBIT_SCRIPT = document.createElement("script");
ORBIT_SCRIPT.src = "https://cdn.jsdelivr.net/npm/three@0.128/examples/js/controls/OrbitControls.js";
document.head.appendChild(ORBIT_SCRIPT);

THREE_SCRIPT.onload = function () {
    ORBIT_SCRIPT.onload = function () {
        setup(); // Starte erst, wenn beide Skripte geladen sind
    };
};

window.setup = async function setup() {
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

window.setup = setup; // Stellt sicher, dass setup() global verfügbar ist

// Definiere loadRNBOScript zuerst
function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://cdn.jsdelivr.net/npm/rnbo@${version}/dist/RNBO.js`;
        script.onload = () => {
            console.log("RNBO Script geladen.");
            resolve();
        };
        script.onerror = () => reject(new Error("Fehler beim Laden des RNBO-Skripts."));
        document.head.appendChild(script);
    });
}

function initThree(analyser) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('three-container').appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);

    const vertexShader = `
        uniform float uTime;
        uniform float uBass;
        uniform float uMid;
        uniform float uTreble;
        varying vec3 vColor;
        void main() {
            vec3 pos = position;
            pos.x += sin(uTime * 0.5 + position.y * 5.0) * uBass * 0.6;
            pos.y += cos(uTime * 0.7 + position.x * 3.0) * uMid * 0.6;
            pos.z += sin(uTime * 0.3 + position.z * 2.0) * uTreble * 0.8;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = (uBass + uMid + uTreble) * 10.0 + 2.0;
            vColor = vec3(uBass, uMid, uTreble);
        }
    `;

    const fragmentShader = `
        varying vec3 vColor;
        void main() {
            gl_FragColor = vec4(abs(sin(vColor.r * 5.0)), abs(sin(vColor.g * 5.0)), abs(sin(vColor.b * 5.0)), 1.0);
        }
    `;

    const uniforms = {
        uTime: { value: 0.0 },
        uBass: { value: 0.0 },
        uMid: { value: 0.0 },
        uTreble: { value: 0.0 }
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

    function getAudioData() {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        
        let bass = data.slice(0, 50).reduce((a, b) => a + b, 0) / 50;
        let mid = data.slice(50, 200).reduce((a, b) => a + b, 0) / 150;
        let treble = data.slice(200, 512).reduce((a, b) => a + b, 0) / 312;

        uniforms.uBass.value = bass / 255;
        uniforms.uMid.value = mid / 255;
        uniforms.uTreble.value = treble / 255;
    }

    function animate() {
        requestAnimationFrame(animate);
        
        getAudioData();
        
        let shake = uniforms.uBass.value * 0.05;
        camera.position.x = shake * (Math.random() - 0.5);
        camera.position.y = shake * (Math.random() - 0.5);
        
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
