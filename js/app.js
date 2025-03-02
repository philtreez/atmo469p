// === Three.js + Post-Processing Setup ===

// Szene, Kamera und Renderer
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

// Effekt Composer: RenderPass, BloomPass, GlitchPass
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0,
  0.4,
  0.85
);
bloomPass.threshold = 0;
bloomPass.strength = 1.5;
bloomPass.radius = 0.5;
composer.addPass(bloomPass);
const glitchPass = new THREE.GlitchPass();
glitchPass.enabled = false;
composer.addPass(glitchPass);

// === Tunnel-Grid Setup (mit dynamischem Outline-Effekt für den normalen Tunnel) ===

const numSlices = 30;
const planeSpacing = 10;
const speed = 16; // Einheiten pro Sekunde
const tunnelSlices = [];

/**
 * Erzeugt eine BufferGeometry, die ein Grid mit gespiegelten Diagonalen enthält,
 * aus einer Gesamtfläche (width x height) mit einem zentralen Loch (holeSize)
 * und unterteilt in cellsX x cellsY Zellen.
 */
function createMirroredDiagonalsGeometry(width, height, holeSize, cellsX, cellsY) {
  const positions = [];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const stepX = width / cellsX;
  const stepY = height / cellsY;
  
  for (let i = 0; i < cellsX; i++) {
    for (let j = 0; j < cellsY; j++) {
      const x0 = -halfWidth + i * stepX;
      const x1 = x0 + stepX;
      const y0 = -halfHeight + j * stepY;
      const y1 = y0 + stepY;
      // Zentrum der Zelle:
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // Überspringe Zellen im zentralen Loch:
      if (Math.abs(cx) < holeSize / 2 && Math.abs(cy) < holeSize / 2) continue;
      
      // Diagonale von oben links (x0, y1) nach unten rechts (x1, y0)
      positions.push(x0, y1, 0, x1, y0, 0);
      // Diagonale von oben rechts (x1, y1) nach unten links (x0, y0)
      positions.push(x1, y1, 0, x0, y0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// Erzeuge die Grid-Linien-Geometrie: 50×50 Fläche, 20×20 zentrales Loch, 10×10 Zellen
const gridLinesGeometry = createMirroredDiagonalsGeometry(50, 50, 20, 10, 10);
const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 1 });

// Erzeuge Tunnel-Slices als LineSegments und füge jedem einen dynamischen Outline hinzu
for (let i = 0; i < numSlices; i++) {
  const slice = new THREE.LineSegments(gridLinesGeometry, gridLineMaterial.clone());
  slice.position.z = -i * planeSpacing;
  
  // Erzeuge den zusätzlichen Outline-Effekt für den dynamischen Look:
  const edges = new THREE.EdgesGeometry(gridLinesGeometry);
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff82, // Neon-Grün (ca. RGB 0,255,130)
    linewidth: 1,    // Hinweis: lineWidth ist oft eingeschränkt
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false
  });
  const dynamicOutline = new THREE.LineSegments(edges, outlineMaterial);
  // Starte mit einer dünnen Outline (kleine Skalierung)
  dynamicOutline.scale.set(0.5, 0.5, 0.5);
  // Füge den dynamischen Outline als Kind hinzu und speichere eine Referenz
  slice.add(dynamicOutline);
  slice.userData.dynamicOutline = dynamicOutline;
  
  tunnelSlices.push(slice);
  scene.add(slice);
}

// === Animationsloop ===

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.getElapsedTime();
  // Berechne eine dynamische Skalierung, die zwischen 0.5 und 1.5 oszilliert.
  const dynamicScale = 0.5 + 1.0 * Math.abs(Math.sin(t * 2));
  
  tunnelSlices.forEach(slice => {
    slice.position.z += speed * delta;
    // Wende den dynamischen Outline-Effekt an:
    if (slice.userData.dynamicOutline) {
      slice.userData.dynamicOutline.scale.set(dynamicScale, dynamicScale, dynamicScale);
    }
    if (slice.position.z > camera.position.z + planeSpacing / 2) {
      slice.position.z -= numSlices * planeSpacing;
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

// === RNBO Outport-Listener ===
//
// "grider": Bei 1 wird zufällig ein Tunnel-Slice für 100 ms mit einem dicken Outline-Effekt versehen.
// "glitchy": Schaltet den GlitchPass ein/aus.
function attachOutports(device) {
  device.messageEvent.subscribe((ev) => {
    if (ev.tag === "grider" && parseInt(ev.payload) === 1) {
      const randomIndex = Math.floor(Math.random() * tunnelSlices.length);
      const randomSlice = tunnelSlices[randomIndex];
      // Erzeuge eine zusätzliche Outline, die kurzzeitig dicker wird.
      const edges = new THREE.EdgesGeometry(gridLinesGeometry);
      const thickMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff82,
        linewidth: 40,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const thickOutline = new THREE.LineSegments(edges, thickMaterial);
      // Starte mit dünner Skalierung
      thickOutline.scale.set(0.5, 0.5, 0.5);
      randomSlice.add(thickOutline);
      // Animieren: Schnell von dünn zu dick (hier in 100 ms)
      const initialScale = 0.5;
      const finalScale = 1.5;
      const duration = 100;
      const startTime = performance.now();
      function animateOutline() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const newScale = initialScale + progress * (finalScale - initialScale);
        thickOutline.scale.set(newScale, newScale, newScale);
        if (progress < 1) {
          requestAnimationFrame(animateOutline);
        } else {
          setTimeout(() => {
            randomSlice.remove(thickOutline);
          }, 100);
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
