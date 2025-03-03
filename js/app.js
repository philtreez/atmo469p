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
const container = document.getElementById("threejs-container") || document.body;
container.appendChild(renderer.domElement);

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

// Parameter: Anzahl Slices, Abstand, Geschwindigkeit
const numPlanes = 40;
const planeSpacing = 5;
const speed = 24;
const tunnelPlanes = [];

/**
 * Erzeugt ein Grid als Shape-Geometrie mit einem zentralen, kleinen Loch.
 * (Hier wurde halfHole bewusst klein gesetzt, um einen typischen Tunnel-Look zu erzielen.)
 */
function createGridWithSquareHoleGeometry(width, height, holeSize, segments) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.lineTo(-width / 2, -height / 2);

  // Hier wird das "Loch" als kleiner Bereich definiert (holeSize/8)
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

// Erzeuge Geometrie – hier z. B. 30×30 Fläche
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

  // Optionale Kamera-Bewegung:
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

window.rnboDevice = null;

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
  
  let device;
  try {
    device = await RNBO.createDevice({ context, patcher });
  } catch (err) {
    console.error("Fehler beim Erstellen des RNBO-Geräts:", err);
    return;
  }
  
  window.rnboDevice = device;
  device.node.connect(outputNode);
  attachRNBOMessages(device);
  attachOutports(device);
  
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

function sendParameter(id, value) {
  if (window.rnboDevice && rnboDevice.sendMessage) {
    rnboDevice.sendMessage(id, value);
    console.log(`Parameter ${id} gesetzt auf ${value}`);
  } else {
    console.log("rnboDevice nicht verfügbar. Parameter:", id, value);
  }
}

function updateSliderFromRNBO(id, value) {
  const slider = document.getElementById("slider-" + id);
  if (slider) {
    const rotation = value * 2 * Math.PI; // intern in Radiant
    slider.dataset.rotation = rotation;
    // Visualisierung: 0-1 entspricht 0 bis 270° Drehung
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
      thickOutline.scale.set(1, 1, 1); // Sofort in voller Größe
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

// ================= Rotary Slider Setup (s1 - s8) =================

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
      sendParameter(id, normalizedValue);
    });
    
    slider.addEventListener("pointerup", () => {
      isDragging = false;
    });
    
    slider.addEventListener("pointercancel", () => {
      isDragging = false;
    });
  });
}

// ================= Volume Slider Setup =================

function setupVolumeSlider() {
  const container = document.getElementById("slider-vol-container");
  const thumb = document.getElementById("slider-vol-thumb");
  if (!container || !thumb) {
    console.warn("Volume slider Elemente nicht gefunden.");
    return;
  }
  
  container.style.position = "relative";
  container.style.width = "180px";
  container.style.height = "40px";
  
  thumb.style.position = "absolute";
  thumb.style.width = "40px";
  thumb.style.height = "40px";
  thumb.style.left = "0px";
  thumb.style.top = "0px";
  thumb.style.touchAction = "none";
  
  let isDragging = false;
  let startX = 0;
  let thumbStartLeft = 0;
  const maxLeft = container.clientWidth - thumb.clientWidth; // 140px
  
  thumb.addEventListener("pointerdown", (e) => {
    isDragging = true;
    startX = e.clientX;
    thumbStartLeft = parseFloat(thumb.style.left);
    thumb.setPointerCapture(e.pointerId);
  });
  
  thumb.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    let newLeft = thumbStartLeft + dx;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    thumb.style.left = newLeft + "px";
    const normalizedValue = newLeft / maxLeft;
    sendParameter("vol", normalizedValue);
  });
  
  thumb.addEventListener("pointerup", () => { isDragging = false; });
  thumb.addEventListener("pointercancel", () => { isDragging = false; });
}

function updateVolumeSliderFromRNBO(value) {
  const container = document.getElementById("slider-vol-container");
  const thumb = document.getElementById("slider-vol-thumb");
  if (!container || !thumb) return;
  const maxLeft = container.clientWidth - thumb.clientWidth;
  thumb.style.left = (value * maxLeft) + "px";
}

// ================= DOMContentLoaded Aufrufe =================

document.addEventListener("DOMContentLoaded", () => {
  setupVolumeSlider();
  setupRotarySliders();
});
