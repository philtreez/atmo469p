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
            // Lade RNBO-Script dynamisch (alternativ via <script>-Tag einbinden)
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

    // Verbinde das Gerät mit dem Audiograph
    device.node.connect(outputNode);

    // Outport-Listener: Aktualisiere vorhandene divs (z. B. in Webflow angelegt) anhand der RNBO-Nachrichten
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

function attachOutports(device) {
    device.messageEvent.subscribe((ev) => {
        // Suche das in Webflow platzierte div (z. B. mit id "strip-a", "strip-t", etc.)
        const div = document.getElementById("strip-" + ev.tag);
        if (div) {
            let frame = parseInt(ev.payload);
            if (!isNaN(frame)) {
                // Begrenze den Frame-Wert auf 0 bis 10
                frame = Math.max(0, Math.min(10, frame));
                // Verschiebe den Hintergrund vertikal: Frame-Index * 660px (Höhe pro Frame)
                div.style.backgroundPosition = `0px -${frame * 660}px`;
            }
        }
        // Debug-Ausgabe
        console.log(`${ev.tag}: ${ev.payload}`);
    });
}

setup();
