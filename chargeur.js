// Choisit la version de la sonde : wasm si le navigateur sait le WebAssembly
// GC, js sinon. `?forcer=js` (ou `?forcer=wasm`) saute le test.
(function () {
    function wasmGcSupporte() {
        try {
            // Le module minimal de wasm-feature-detect pour « gc ».
            return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]));
        } catch (e) {
            return false;
        }
    }
    var forcer = new URLSearchParams(location.search).get("forcer");
    var version = forcer === "js" || forcer === "wasm" ? forcer : (wasmGcSupporte() ? "wasm" : "js");
    window.SONDE_VERSION = version; // lu par l'enregistrement du Service Worker (index.html)
    var script = document.createElement("script");
    script.src = version + "/sondePwa.js";
    document.body.appendChild(script);
})();
