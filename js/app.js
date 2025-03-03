// ================= Three.js + Post-Processing Setup =================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const threeContainer = document.getElementById("threejs-container") || document.body;
threeContainer.appendChild(renderer.domElement);

const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,  // Stärke
  0.1,  // Radius
  0.3   // Schwellenwert
);
bloomPass.threshold = 0;
bloomPass.strength = 0.5;
bloomPass.radius = 0.2;
composer.addPass(bloomPass);

const glitchPass = new THREE.GlitchPass();
glitchPass.enabled = false;
composer.addPass(glitchPass);

// ================= Tunnel-Effekt Setup =================

// Hier definieren wir den Tunnel als eine Serie von Slices (Mesh) entlang der Z-Achse.
const numPlanes = 40;
const planeSpacing = 5;
const speed = 24;
const tunnelPlanes = [];

/**
 * Erzeugt ein Grid als Shape-Geometrie mit einem zentralen kleinen Loch.
 * (Hinweis: Das "Loch" wird hier als sehr kleiner Bereich definiert, damit der Tunnel-Look erhalten bleibt.)
 */
function createGridWithSquareHoleGeometry(width, height, holeSize, segments) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.lineTo(-width / 2, -height / 2);
  // Definiere ein sehr kleines "Loch" in der Mitte (holeSize/8)
  const halfHole = holeSize / 8;
  const holePath = new THREE.Path();
  holePath.moveTo(-halfHole, -halfHole);
  holePath.lineTo(halfHole, -halfHole);
  holePath.lineTo(halfHole, halfHole);
  holePath.lineTo(-halfHole, halfHole);
  holePath.lineTo(-halfHole, -halfHole);
  shape.holes.push(holePath);
  return new THREE.ShapeGeometry(shape, segments);
}

const gridGeometry = createGridWithSquareHoleGeometry(30, 30, 20, 20);

function createGridMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
}

for (let i = 0; i < numPlanes; i++) {
  const material = createGridMaterial();
  const gridMesh = new THREE.Mesh(gridGeometry, material);
  gridMesh.position.z = -i * planeSpacing;
  tunnelPlanes.push(gridMesh);
  scene.add(gridMesh);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  
  // Optional: leichte Kamera-Animation
  camera.position.x = Math.sin(clock.elapsedTime * 0.5) * 0.5;
  camera.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.1;
  
  tunnelPlanes.forEach(mesh => {
    mesh.position.z += speed * delta;
    mesh.position.x = Math.sin((mesh.position.z + clock.elapsedTime) * 0.1) * 0.5;
    mesh.rotation.z = Math.sin((mesh.position.z + clock.elapsedTime) * 0.1) * 0.1;
    if (mesh.position.z > camera.position.z + planeSpacing / 2) {
      mesh.position.z -= numPlanes * planeSpacing;
    }
  });
  
  composer.render();
}
animate();

// ================= RNBO Integration =================

// Globales RNBO-Gerät – wird später gesetzt
window.rnboDevice = null;
// Damit sendValueToRNBO im Volume- und Rotary-Slider funktioniert, speichern wir das RNBO-Gerät auch in einer globalen Variable "device".
window.device = null;

// Wir verwenden hier einen einfachen Parameter-Queue, falls Slider-Eingaben erfolgen, bevor RNBO bereit ist.
let parameterQueue = {};

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
  
  let deviceInstance;
  try {
    deviceInstance = await RNBO.createDevice({ context, patcher });
  } catch (err) {
    console.error("Fehler beim Erstellen des RNBO-Geräts:", err);
    return;
  }
  
  window.rnboDevice = deviceInstance;
  window.device = deviceInstance; // Für sendValueToRNBO
  deviceInstance.node.connect(outputNode);
  attachRNBOMessages(deviceInstance);
  attachOutports(deviceInstance);
  flushParameterQueue();
  
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

// Sendet den Parameterwert an RNBO; wenn device noch nicht verfügbar, wird er in der Queue gespeichert.
function sendValueToRNBO(param, value) {
  if (window.device && window.device.parametersById && window.device.parametersById.has(param)) {
    window.device.parametersById.get(param).value = value;
    console.log(`🎛 Updated RNBO param: ${param} = ${value}`);
  } else {
    console.warn(`rnboDevice nicht verfügbar. Parameter ${param} wird zwischengespeichert:`, value);
    parameterQueue[param] = value;
  }
}

// Sobald device verfügbar ist, werden alle zwischengespeicherten Werte gesendet.
function flushParameterQueue() {
  if (window.device && window.device.parametersById) {
    for (const [param, value] of Object.entries(parameterQueue)) {
      if (window.device.parametersById.has(param)) {
        window.device.parametersById.get(param).value = value;
        console.log(`🎛 Zwischengespeicherter Parameter ${param} gesetzt auf ${value}`);
      }
    }
    parameterQueue = {};
  }
}

// Aktualisiert den Rotary-Slider visuell (0-1 entspricht 0 bis 270°)
function updateSliderFromRNBO(id, value) {
  const slider = document.getElementById("slider-" + id);
  if (slider) {
    const rotation = value * 2 * Math.PI; // intern in Radiant
    slider.dataset.rotation = rotation;
    const degrees = rotation * (270 / (2 * Math.PI));
    slider.style.transform = `rotate(${degrees}deg)`;
  }
}

function attachRNBOMessages(device) {
  const sliderIds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "vol"];
  if (device.parameterChangeEvent) {
    device.parameterChangeEvent.subscribe(param => {
      if (sliderIds.includes(param.id)) {
        updateSliderFromRNBO(param.id, parseFloat(param.value));
      }
      console.log(`Parameter ${param.id} geändert: ${param.value}`);
    });
  } else if (device.messageEvent) {
    device.messageEvent.subscribe(ev => {
      if (sliderIds.includes(ev.tag)) {
        updateSliderFromRNBO(ev.tag, parseFloat(ev.payload));
      }
      console.log(`Message ${ev.tag}: ${ev.payload}`);
    });
  }
}

function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    if (ev.tag === "grider" && parseInt(ev.payload) === 1) {
      const randomIndex = Math.floor(Math.random() * tunnelPlanes.length);
      const randomPlane = tunnelPlanes[randomIndex];
      const edges = new THREE.EdgesGeometry(gridGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff82,
        linewidth: 40,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const thickOutline = new THREE.LineSegments(edges, lineMaterial);
      thickOutline.scale.set(1, 1, 1);
      randomPlane.add(thickOutline);
      setTimeout(() => {
        randomPlane.remove(thickOutline);
      }, 100);
    }
    
    if (ev.tag === "glitchy") {
      glitchPass.enabled = (parseInt(ev.payload) === 1);
    }
    
    console.log(`${ev.tag}: ${ev.payload}`);
  });
}

// ================= Rotary Slider Setup (IDs: slider-s1 ... slider-s8) =================

function setupRotarySliders() {
  const sliderIds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  
  sliderIds.forEach(id => {
    const slider = document.getElementById("slider-" + id);
    if (!slider) {
      console.warn("Slider element nicht gefunden:", "slider-" + id);
      return;
    }
    
    slider.style.width = "50px";
    slider.style.height = "50px";
    slider.style.borderRadius = "50%";
    slider.style.background = "url('https://cdn.prod.website-files.com/67c27c3b4c668c9f3ca429ed/67c5139a38c39d6a75bac9ac_silderpoint60_60.png') center/cover no-repeat";
    slider.style.transform = "rotate(0deg)";
    slider.style.touchAction = "none";
    
    slider.dataset.rotation = "0";
    
    let isDragging = false;
    let startAngle = 0;
    let initialRotation = 0;
    
    slider.addEventListener("pointerdown", (e) => {
      isDragging = true;
      const rect = slider.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      initialRotation = parseFloat(slider.dataset.rotation);
      slider.setPointerCapture(e.pointerId);
    });
    
    slider.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const rect = slider.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const deltaAngle = angle - startAngle;
      const newRotation = initialRotation + deltaAngle;
      slider.dataset.rotation = newRotation;
      // 0-1 entspricht 0 bis 270° Drehung
      const degrees = (((newRotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI)) * (270 / (2 * Math.PI));
      slider.style.transform = `rotate(${degrees}deg)`;
      const normalizedValue = (((newRotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI)) / (2 * Math.PI);
      sendValueToRNBO(id, normalizedValue);
    });
    
    slider.addEventListener("pointerup", () => { isDragging = false; });
    slider.addEventListener("pointercancel", () => { isDragging = false; });
  });
}

// ================= Volume Slider Setup =================
// Hier verwenden wir den Stil aus deinem Beispiel (IDs: volume-slider, volume-thumb)

function setupVolumeSlider() {
  const slider = document.getElementById("volume-slider");  // Container, z. B. 280px x 40px
  const thumb = document.getElementById("volume-thumb");      // Thumb, z. B. 70px x 70px
  if (!slider || !thumb) {
    console.error("Volume slider elements not found!");
    return;
  }
  
  const sliderWidth = slider.offsetWidth;   // Erwartet z. B. 280px
  const thumbWidth = thumb.offsetWidth;       // Erwartet z. B. 70px
  const maxMovement = sliderWidth - thumbWidth; // z. B. 210px
  
  // Initialen Wert setzen, z. B. 0.8
  const initialValue = 0.8;
  const initialX = maxMovement * initialValue;
  thumb.style.left = initialX + "px";
  sendValueToRNBO("vol", initialValue);
  
  let isDragging = false;
  thumb.addEventListener("mousedown", (e) => {
    isDragging = true;
    e.preventDefault();
  });
  
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const sliderRect = slider.getBoundingClientRect();
    let newX = e.clientX - sliderRect.left - (thumbWidth / 2);
    newX = Math.max(0, Math.min(newX, maxMovement));
    thumb.style.left = newX + "px";
    const normalizedValue = newX / maxMovement;
    sendValueToRNBO("vol", normalizedValue);
  });
  
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}

function updateVolumeSliderFromRNBO(value) {
  const slider = document.getElementById("volume-slider");
  const thumb = document.getElementById("volume-thumb");
  if (!slider || !thumb) return;
  const maxMovement = slider.offsetWidth - thumb.offsetWidth;
  thumb.style.left = (value * maxMovement) + "px";
}

// ================= DOMContentLoaded Aufrufe =================

document.addEventListener("DOMContentLoaded", () => {
  setupVolumeSlider();
  setupRotarySliders();
});
