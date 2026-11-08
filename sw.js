// Le Service Worker de la sonde. À la distribution, Gradle remplace la ligne
// marquée (le build et la liste de ce que contient build/sonde/).
// Il n'appelle ni skipWaiting ni clients.claim : un nouveau build s'installe
// en attente et ne prend la main qu'à la relance suivante, jamais en pleine utilisation.
//
// La page l'enregistre avec « sw.js?v=wasm » ou « sw.js?v=js » : la version que le
// chargeur a réellement choisie. Seule celle-là est précachée à l'installation, avec
// le tronc commun ; l'autre se met en cache À LA DEMANDE, la première fois qu'elle est chargée.
const MANIFESTE = { "build": "20261108-1739", "requis": ["./", "build.js", "chargeur.js", "index.html", "sonde.js"], "optionnels": ["icones/apple-touch-icon.png", "icones/icone-192.png", "icones/icone-512.png", "manifest.webmanifest"], "versions": { "wasm": ["wasm/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_bold.otf", "wasm/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_regular.otf", "wasm/e14070a93ca25248c790.wasm", "wasm/e9b28911e687b1ee6b42.wasm", "wasm/sondePwa.js"], "js": ["js/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_bold.otf", "js/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_regular.otf", "js/e9b28911e687b1ee6b42.wasm", "js/js-reexport-symbols.mjs", "js/skiko.mjs", "js/skiko.wasm", "js/skikod8.mjs", "js/sondePwa.js"] }, "alias": { "js/skiko.wasm": "js/e9b28911e687b1ee6b42.wasm", "wasm/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_bold.otf": "js/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_bold.otf", "wasm/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_regular.otf": "js/composeResources/com.example.lebiais.sonde.ressources/font/texgyreheros_regular.otf", "wasm/e9b28911e687b1ee6b42.wasm": "js/e9b28911e687b1ee6b42.wasm" } }; // remplacé par Gradle
// MANIFESTE = {
//   build:       "20261105-1200",
//   requis:      fichiers communs sans lesquels la sonde ne démarre pas (échec d'installation s'il en manque un),
//   optionnels:  manifeste, icônes : un manque n'empêche pas l'installation,
//   versions:    { wasm: [...], js: [...] } les fichiers de chaque version, sans .map ni LICENSE,
//   alias:       { chemin: chemin_canonique } pour les fichiers d'octets identiques (un seul exemplaire en cache),
// }
const CACHE = "sonde-" + MANIFESTE.build;
const TUILES = "tuiles";
const TUILES_MAX = 500;
const VERSION = new URL(self.location.href).searchParams.get("v") === "js" ? "js" : "wasm";
const BASE = self.registration.scope;
const CONNUS = new Set([...MANIFESTE.requis, ...MANIFESTE.optionnels, ...MANIFESTE.versions.wasm, ...MANIFESTE.versions.js]);

// L'adresse en cache d'un chemin relatif à la portée : l'exemplaire canonique si le fichier est un doublon.
const adresse = (chemin) => new URL(MANIFESTE.alias[chemin] || chemin || "./", BASE).href;
const cheminDe = (url) => url.href.startsWith(BASE) ? url.href.slice(BASE.length).split("?")[0].split("#")[0] : null;

self.addEventListener("install", (evenement) => {
    // cache: "reload" : les octets du serveur, pas ceux d'un cache HTTP périmé.
    evenement.waitUntil(caches.open(CACHE).then(async (cache) => {
        // Les doublons ne sont demandés qu'une fois.
        const requis = [...new Set([...MANIFESTE.requis, ...MANIFESTE.versions[VERSION]].map(adresse))];
        const optionnels = MANIFESTE.optionnels.map(adresse).filter((a) => !requis.includes(a));
        const requisFaits = Promise.all(requis.map((a) => cache.add(new Request(a, { cache: "reload" }))));
        // Un fichier optionnel manquant n'empêche pas l'installation.
        const optionnelsFaits = Promise.allSettled(optionnels.map((a) => cache.add(new Request(a, { cache: "reload" }))));
        await requisFaits; // si un requis manque, l'installation échoue : mieux vaut pas de SW qu'un hors-ligne troué
        await optionnelsFaits;
    }));
});

self.addEventListener("activate", (evenement) => {
    evenement.waitUntil(caches.keys().then((noms) =>
        Promise.all(noms.filter((n) => n.startsWith("sonde-") && n !== CACHE).map((n) => caches.delete(n)))));
});

// Les fonds de carte : IGN (data.geopf.fr, WMTS) et OpenTopoMap (tile.opentopomap.org).
const estTuile = (url) => /tile|wmts|geopf/i.test(url.hostname + url.pathname);

async function tuile(requete) {
    const cache = await caches.open(TUILES);
    const trouvee = await cache.match(requete);
    if (trouvee) return trouvee;
    const reponse = await fetch(requete);
    if (reponse.ok) { // la sonde demande en cors : une réponse refusée n'entre pas dans le cache
        await cache.put(requete, reponse.clone());
        const cles = await cache.keys(); // dans l'ordre d'entrée : on retire les plus anciennes
        for (let i = 0; i < cles.length - TUILES_MAX; i++) await cache.delete(cles[i]);
    }
    return reponse;
}

// Un fichier du build : le cache de CE build d'abord ; sinon le réseau, et on garde la réponse
// (c'est ainsi que l'autre version, non précachée, entre dans le cache après son premier chargement).
async function fichier(requete, chemin) {
    const cache = await caches.open(CACHE);
    const trouve = await cache.match(adresse(chemin));
    if (trouve) return trouve;
    const reponse = await fetch(requete);
    if (reponse.ok && reponse.status === 200 && CONNUS.has(chemin)) {
        try { await cache.put(adresse(chemin), reponse.clone()); } catch (e) { /* quota : tant pis, la page a sa réponse */ }
    }
    return reponse;
}

self.addEventListener("fetch", (evenement) => {
    const requete = evenement.request;
    if (requete.method !== "GET") return;
    const url = new URL(requete.url);
    if (url.origin !== self.location.origin) {
        if (estTuile(url)) evenement.respondWith(tuile(requete));
        return;
    }
    const chemin = cheminDe(url); // sans « ?forcer=js » : la requête ne doit pas manquer le cache
    if (chemin === null) return;
    evenement.respondWith(fichier(requete, chemin));
});
