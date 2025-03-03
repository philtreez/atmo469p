// === Three.js + Post-Processing Setup ===

// Szene und Kamera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Schwarzer Hintergrund

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const container = document.getElementById("threejs-container") || document.body;
container.appendChild(renderer.domElement);

// Effekt Composer: RenderPass, BloomPass und GlitchPass
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,   // Stärke
  0.1,   // Radius
  0.3   // Schwellenwert
);
bloomPass.threshold = 0;
bloomPass.strength = 0.5; // Glowy-Effekt
bloomPass.radius = 0.2;
composer.addPass(bloomPass);

// GlitchPass erstellen, standardmäßig deaktiviert
const glitchPass = new THREE.GlitchPass();
glitchPass.enabled = false;
composer.addPass(glitchPass);

// === Tunnel-Effekt Setup ===

// Parameter: 30 Tunnel-Slices, 10 Einheiten Abstand, speed in Einheiten pro Sekunde (hier 16, anpassbar an BPM)
const numPlanes = 40;
const planeSpacing = 5;
const speed = 24;
const tunnelPlanes = [];

/**
 * Erzeugt ein Grid als Shape-Geometrie mit einem zentralen quadratischen Loch.
 * Die interne Triangulierung erzeugt diagonale Kanten, was dem Grid einen echten 3D-Look verleiht.
 */
function createGridWithSquareHoleGeometry(width, height, holeSize, segments) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.lineTo(-width / 2, -height / 2);

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

// Erzeuge Geometrie: 50x50, zentrales Loch 20x20, feine Unterteilung (segments = 20)
const gridGeometry = createGridWithSquareHoleGeometry(30, 30, 20, 20);

// Material: Ursprünglich im Wireframe-Modus (Neon-Grün)
function createGridMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
}

// Erzeuge und positioniere Tunnel-Slices entlang der Z-Achse.
for (let i = 0; i < numPlanes; i++) {
  const material = createGridMaterial();
  const gridMesh = new THREE.Mesh(gridGeometry, material);
  gridMesh.position.z = -i * planeSpacing;
  tunnelPlanes.push(gridMesh);
  scene.add(gridMesh);
}

// Clock zur Messung des Delta Time
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); // Sekunden seit letztem Frame

  // Optionaler Kamera-Effekt (falls du ihn zusätzlich verwenden möchtest)
  camera.position.x = Math.sin(clock.elapsedTime * 0.5) * 0.5;
  camera.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.1;

  tunnelPlanes.forEach(mesh => {
    // Standardmäßige Vorwärtsbewegung entlang der Z-Achse
    mesh.position.z += speed * delta;
    
    // Zusätzliche seitliche Bewegung: Erzeugt den Eindruck einer Kurve
    mesh.position.x = Math.sin((mesh.position.z + clock.elapsedTime) * 0.1) * 0.5;
    
    // Optionale Neigung/Rotation für einen noch dynamischeren Effekt
    mesh.rotation.z = Math.sin((mesh.position.z + clock.elapsedTime) * 0.1) * 0.1;
    
    if (mesh.position.z > camera.position.z + planeSpacing / 2) {
      mesh.position.z -= numPlanes * planeSpacing;
    }
  });
  
  composer.render();
}
animate();


// === RNBO Integration ===

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
  
  // Optionale Abhängigkeiten laden, falls benötigt...
  let dependencies = [];
  try {
    const dependenciesResponse = await fetch("export/dependencies.json");
    dependencies = await dependenciesResponse.json();
    dependencies = dependencies.map(d => d.file ? { ...d, file: "export/" + d.file } : d);
  } catch (e) { }
  
  let device;
  try {
    device = await RNBO.createDevice({ context, patcher });
  } catch (err) {
    console.error("Fehler beim Erstellen des RNBO-Geräts:", err);
    return;
  }
  
  device.node.connect(outputNode);
  attachOutports(device);
  attachRNBOMessages(device);
  
  // Resume AudioContext bei Nutzerinteraktion
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

function setupRotarySliders() {
  // Verwende IDs s1 bis s8
  const sliderIds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  
  sliderIds.forEach(id => {
    const slider = document.getElementById("slider-" + id);
    if (!slider) {
      console.warn("Slider element not found: ", "slider-" + id);
      return;
    }
    
    // Setze Standard-Stile (können auch im Webflow-Designer definiert werden)
    slider.style.width = "50px";
    slider.style.height = "50px";
    slider.style.borderRadius = "50%";
    // Hintergrund: Hier den Pfad zu deinem PNG-Bild anpassen
    slider.style.background = "url('https://cdn.prod.website-files.com/67c27c3b4c668c9f3ca429ed/67c5139a38c39d6a75bac9ac_silderpoint60_60.png') center/cover no-repeat";
    slider.style.transform = "rotate(0deg)";
    slider.style.touchAction = "none"; // für Touch-Interaktion
    
    // Speichere den aktuellen Rotationswert (in Radiant) als Data-Attribut
    slider.dataset.rotation = "0";
    
    let isDragging = false;
    let startAngle = 0;
    let initialRotation = 0;
    
    slider.addEventListener("pointerdown", (e) => {
      isDragging = true;
      const rect = slider.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // Berechne den Startwinkel relativ zum Mittelpunkt
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
      // Delta zwischen aktuellem Winkel und Startwinkel
      const deltaAngle = angle - startAngle;
      const newRotation = initialRotation + deltaAngle;
      slider.dataset.rotation = newRotation;
      // Umrechnung in Grad, aber hier maximal 270° statt 360°
      const degrees = ((newRotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI) * (270 / (2 * Math.PI));
      slider.style.transform = `rotate(${degrees}deg)`;
      // Normalisiere: 0 entspricht 0 und 1 entspricht 270°
      const normalizedValue = (((newRotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI)) / (2 * Math.PI);
      // Da wir nur 270° nutzen, entspricht normalizedValue * 270 dem tatsächlichen Winkel in Grad.
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

// Funktion zum Senden des Parameterwerts an RNBO
function sendParameter(id, value) {
  // Beispiel: Falls dein RNBO-Gerät über sendMessage(tag, payload) verfügt:
  if (window.rnboDevice && rnboDevice.sendMessage) {
    rnboDevice.sendMessage(id, value);
  } else {
    console.log("Parameter senden:", id, value);
  }
}

// Wird aufgerufen, wenn RNBO einen neuen Parameterwert sendet,
// und aktualisiert den visuellen Drehwinkel des zugehörigen Sliders.
function updateSliderFromRNBO(id, value) {
  const slider = document.getElementById("slider-" + id);
  if (slider) {
    // Berechne den Drehwinkel in Radiant basierend auf 0-1 (0 entspricht 0°, 1 entspricht 270°)
    const rotation = value * 2 * Math.PI; // Intern bleibt das in Radiant
    slider.dataset.rotation = rotation;
    // Umrechnung: 0-1 entspricht 0 bis 270 Grad
    const degrees = rotation * (270 / (2 * Math.PI));
    slider.style.transform = `rotate(${degrees}deg)`;
  }
}

function attachRNBOMessages(device) {
  // Wir erwarten Parameter mit IDs "s1" bis "s8"
  const sliderIds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  if (device.parameterChangeEvent) {
    device.parameterChangeEvent.subscribe(param => {
      if (sliderIds.includes(param.id)) {
        updateSliderFromRNBO(param.id, parseFloat(param.value));
      }
      console.log(`Parameter ${param.id} changed to ${param.value}`);
    });
  } else if (device.messageEvent) {
    // Falls parameterChangeEvent nicht vorhanden ist, versuche messageEvent.
    device.messageEvent.subscribe(ev => {
      if (sliderIds.includes(ev.tag)) {
        updateSliderFromRNBO(ev.tag, parseFloat(ev.payload));
      }
      console.log(`Message ${ev.tag}: ${ev.payload}`);
    });
  }
}

// --- Volume Slider Setup ---

function setupVolumeSlider() {
  const container = document.getElementById("slider-vol-container");
  const thumb = document.getElementById("slider-vol-thumb");
  if (!container || !thumb) {
    console.warn("Volume slider elements not found.");
    return;
  }
  
  // Stelle sicher, dass der Container relativ positioniert ist,
  // damit der Thumb absolut innerhalb positioniert werden kann.
  container.style.position = "relative";
  container.style.width = "180px";
  container.style.height = "40px";
  
  // Thumb-Stile: absolut positioniert, initial ganz links
  thumb.style.position = "absolute";
  thumb.style.width = "40px";
  thumb.style.height = "40px";
  thumb.style.left = "0px"; // Startwert: 0 (links)
  thumb.style.top = "0px";  // Optional: falls der Thumb vertikal mittig sein soll, kann hier noch angepasst werden
  thumb.style.touchAction = "none"; // Für korrekte Touch-Interaktionen
  
  let isDragging = false;
  let startX = 0;
  let thumbStartLeft = 0;
  const maxLeft = container.clientWidth - thumb.clientWidth; // 180 - 40 = 140 px
  
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
    // Berechne den normalisierten Wert (0-1)
    const normalizedValue = newLeft / maxLeft;
    sendParameter("vol", normalizedValue);
  });
  
  thumb.addEventListener("pointerup", () => {
    isDragging = false;
  });
  
  thumb.addEventListener("pointercancel", () => {
    isDragging = false;
  });
}

// Aktualisiert den Thumb basierend auf einem RNBO-Wert (0-1)
function updateVolumeSliderFromRNBO(value) {
  const container = document.getElementById("slider-vol-container");
  const thumb = document.getElementById("slider-vol-thumb");
  if (!container || !thumb) return;
  const maxLeft = container.clientWidth - thumb.clientWidth;
  const newLeft = value * maxLeft;
  thumb.style.left = newLeft + "px";
}

// Beispiel: Funktion zum Senden des Wertes an RNBO
function sendParameter(tag, value) {
  // Falls dein RNBO-Gerät eine Funktion sendMessage(tag, payload) hat:
  if (window.rnboDevice && rnboDevice.sendMessage) {
    rnboDevice.sendMessage(tag, value);
  } else {
    console.log("Parameter senden:", tag, value);
  }
}

// Rufe setupVolumeSlider() auf, wenn das DOM geladen ist.
document.addEventListener("DOMContentLoaded", () => {
  setupVolumeSlider();
});

// Aufruf: Starte das Setup, wenn das DOM geladen ist.
document.addEventListener("DOMContentLoaded", () => {
  setupRotarySliders();
});

// RNBO Outport-Listener: reagiert auf "grider" und "glitchy"
function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    if (ev.tag === "grider" && parseInt(ev.payload) === 1) {
      const randomIndex = Math.floor(Math.random() * tunnelSlices.length);
      const randomSlice = tunnelSlices[randomIndex];
      
      // Erzeuge aus der vorhandenen Grid-Geometrie eine EdgesGeometry für den Outline-Effekt
      const edges = new THREE.EdgesGeometry(gridLinesGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff82,       // Neon-Grün (ca. RGB 0,255,130)
        linewidth: 40,         // Hinweis: linewidth wird in vielen Browsern ignoriert.
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const thickOutline = new THREE.LineSegments(edges, lineMaterial);
      // Starte mit einer kleinen Skalierung, sodass der Effekt zunächst dünn wirkt.
      thickOutline.scale.set(0.5, 0.5, 0.5);
      randomSlice.add(thickOutline);
      
      // Animation: Skaliere den Outline von 0.5 auf 1.5 über 100 ms
      const initialScale = 0.2;
      const finalScale = 5;
      const animationDuration = 300; // in Millisekunden
      const startTime = performance.now();
      function animateOutline() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const newScale = initialScale + progress * (finalScale - initialScale);
        thickOutline.scale.set(newScale, newScale, newScale);
        if (progress < 1) {
          requestAnimationFrame(animateOutline);
        } else {
          // Nach Erreichen des vollen Effekts, entferne ihn nach einer kurzen Pause (z. B. 100 ms)
          setTimeout(() => {
            randomSlice.remove(thickOutline);
          }, 1500);
        }
      }
      animateOutline();
    }
    
    if (ev.tag === "glitchy") {
      glitchPass.enabled = (parseInt(ev.payload) === 1);
    }
    
    console.log(`${ev.tag}: ${ev.payload}`);
  });
}

