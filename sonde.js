// Tout le JavaScript de la sonde vit ici. Chaque fonction est appelée par
// l'interface Kotlin `Navigateur`. UNE ENTRÉE PAR LIGNE, virgule finale, rangée
// dans la section de sa tâche.
window.sonde = {
    // ---- Socle (tâche 2) ----
    estInstallee: () => navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    marge: (cote) => {
        const sonde = document.createElement("div");
        sonde.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;"
            + "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);"
            + "padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)";
        document.body.appendChild(sonde);
        const style = getComputedStyle(sonde);
        const valeur = { haut: style.paddingTop, bas: style.paddingBottom, gauche: style.paddingLeft, droite: style.paddingRight }[cote];
        document.body.removeChild(sonde);
        return parseFloat(valeur) || 0;
    },
    msDepuisLancement: () => performance.now(),
    build: () => window.SONDE_BUILD || "inconnu",

    // ---- Stockage (tâche 3) ----
    // Les octets passent en texte, un octet par caractère (0..255). Chaque réponse commence par
    // un état : "O" (réussi, le contenu suit) ou "E" (échec, le message suit). Le contenu est libre.
    moyenDeStockage: () => stockage.opfsPossible() ? "OPFS" : "IndexedDB",
    ecrireMorceau: (nom, rang, texte) => stockage.ecrire(nom, rang, texte).then(() => "O", stockage.erreur),
    terminerEcriture: (nom, reussi) => stockage.terminer(nom, reussi).then(() => "O", stockage.erreur),
    lireMorceau: (nom, rang) => stockage.lire(nom, rang).then((contenu) => "O" + contenu, stockage.erreur),
    demanderPersistance: async () => {
        if (!(navigator.storage && navigator.storage.persist)) return "indisponible";
        try { return (await navigator.storage.persist()) ? "accordée" : "refusée"; } catch (e) { return "indisponible"; }
    },
    estimation: async () => {
        if (!(navigator.storage && navigator.storage.estimate)) return "indisponible";
        try {
            const e = await navigator.storage.estimate();
            const mo = (n) => (n / 1048576).toFixed(1).replace(".", ",");
            return "utilisé " + mo(e.usage || 0) + " Mo sur " + mo(e.quota || 0) + " Mo";
        } catch (e) { return "indisponible"; }
    },
    graineDuJour: () => {
        const d = new Date();
        return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    },
    dateDerniereEcriture: () => { try { return localStorage.getItem("sonde.derniereEcriture") || ""; } catch (e) { return ""; } },
    // La graine de l'ÉCRITURE est gardée avec la date : relire 8 jours plus tard doit vérifier avec elle, pas avec celle du jour.
    graineEcrite: () => { try { const g = parseInt(localStorage.getItem("sonde.graine"), 10); return Number.isFinite(g) ? g : -1; } catch (e) { return -1; } },
    noterDerniereEcriture: (graine) => {
        try {
            localStorage.setItem("sonde.derniereEcriture", new Date().toLocaleString("fr-FR"));
            localStorage.setItem("sonde.graine", String(graine));
        } catch (e) { }
    },
    oublierDerniereEcriture: () => { try { localStorage.removeItem("sonde.derniereEcriture"); localStorage.removeItem("sonde.graine"); } catch (e) { } },

    // ---- Carte et photos (tâche 5) ----
    // Les octets passent en base64 (une chaîne traverse sans copie octet par octet, côté wasm aussi).
    lireBlob: (blob) => new Promise((resolve, rejeter) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resolve(String(lecteur.result).split(",")[1] || "");
        lecteur.onerror = () => rejeter(lecteur.error);
        lecteur.readAsDataURL(blob);
    }),
    // null quand la tuile est refusée : CORS (la promesse échoue), statut HTTP, réseau.
    telechargerTuile: (url) => fetch(url, { mode: "cors", credentials: "omit" })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? window.sonde.lireBlob(b) : null))
        .catch(() => null),
    // "type MIME\nbase64", ou null si l'on annule. DOIT être appelée de façon synchrone dans le geste de
    // l'utilisateur (le clic) : le champ est créé et ouvert avant tout await, sinon iOS refuse le sélecteur.
    // `capture` vrai : l'appareil photo directement ; faux : la photothèque ou l'appareil au choix.
    choisirPhoto: (capture) => new Promise((resolve) => {
        const champ = document.createElement("input");
        champ.type = "file";
        champ.accept = "image/*";
        if (capture) champ.setAttribute("capture", "environment");
        champ.style.cssText = "position:fixed;left:-1000px;opacity:0";
        document.body.appendChild(champ);
        const fin = (valeur) => { champ.remove(); resolve(valeur); };
        champ.addEventListener("change", () => {
            const fichier = champ.files && champ.files[0];
            if (!fichier) { fin(null); return; }
            window.sonde.lireBlob(fichier).then((b64) => fin((fichier.type || "") + "\n" + b64), () => fin(null));
        });
        champ.addEventListener("cancel", () => fin(null));
        champ.click();
    }),

    // ---- Coque installable (tâche 6) ----
    userAgent: () => navigator.userAgent,
    ouvertureMemorisee: () => { try { return localStorage.getItem("sonde.ouverture") || ""; } catch (e) { return ""; } },
    noterOuverture: (ms) => { try { localStorage.setItem("sonde.ouverture", String(Math.round(ms))); } catch (e) { } },
    persistanceActuelle: async () => {
        if (!(navigator.storage && navigator.storage.persisted)) return "indisponible";
        try { return (await navigator.storage.persisted()) ? "accordée" : "non accordée"; } catch (e) { return "indisponible"; }
    },
    etatServiceWorker: async () => {
        if (!("serviceWorker" in navigator)) return "indisponible";
        const echec = window.SONDE_SW_ERREUR ? " ; ÉCHEC : " + window.SONDE_SW_ERREUR : "";
        try {
            const r = await navigator.serviceWorker.getRegistration();
            if (!r) return "aucun" + echec;
            const etat = r.active ? "actif" : r.installing ? "en installation" : r.waiting ? "en attente" : "aucun";
            const attente = r.waiting && r.active ? " ; un nouveau build attend la relance" : "";
            return etat + (navigator.serviceWorker.controller ? ", contrôle la page" : ", ne contrôle pas encore la page") + attente + echec;
        } catch (e) { return "indisponible" + echec; }
    },
};

// Stockage de la tâche 3 : OPFS quand le navigateur sait écrire un fichier depuis la page
// (getDirectory ET createWritable : Safari avant la 26 n'a que le premier, réservé aux
// Workers), sinon IndexedDB, un enregistrement par morceau de 1 Mo dans la base « sonde ».
const stockage = (() => {
    const MO = 1048576;
    const opfsPossible = () => !!(navigator.storage && navigator.storage.getDirectory
        && typeof FileSystemFileHandle !== "undefined" && FileSystemFileHandle.prototype.createWritable);
    const enOctets = (texte) => {
        const u = new Uint8Array(texte.length);
        for (let i = 0; i < u.length; i++) u[i] = texte.charCodeAt(i);
        return u;
    };
    const enTexte = (u8) => {
        const parties = [];
        for (let i = 0; i < u8.length; i += 8192) parties.push(String.fromCharCode.apply(null, u8.subarray(i, i + 8192)));
        return parties.join("");
    };
    const erreur = (e) => "E" + ((e && e.name) || "Error") + (e && e.message ? " : " + e.message : "");
    const baseIdb = () => new Promise((ok, ko) => {
        const r = indexedDB.open("sonde", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("morceaux");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
    });
    const requete = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
    const fini = (tx) => new Promise((ok, ko) => { tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error); });
    // OPFS : UN SEUL createWritable par fichier, ouvert au morceau 0, fermé (et validé) par terminer(),
    // ou abandonné à la première erreur. Rouvrir à chaque morceau recopierait tout le fichier.
    const ouverts = new Map();
    const terminer = async (nom, reussi) => {
        const w = ouverts.get(nom);
        if (!w) return;
        ouverts.delete(nom);
        if (reussi) await w.close();
        else { try { await w.abort(); } catch (_) { } }
    };
    return {
        opfsPossible, erreur, terminer,
        async ecrire(nom, rang, texte) {
            const octets = enOctets(texte);
            if (opfsPossible()) {
                if (rang === 0) {
                    await terminer(nom, false);
                    const racine = await navigator.storage.getDirectory();
                    const fichier = await racine.getFileHandle(nom, { create: true });
                    ouverts.set(nom, await fichier.createWritable({ keepExistingData: false }));
                } else if (!ouverts.has(nom)) {
                    throw new Error("écriture non commencée (morceau " + rang + ")");
                }
                try { await ouverts.get(nom).write({ type: "write", position: rang * MO, data: octets }); }
                catch (e) { await terminer(nom, false); throw e; }
            } else {
                const db = await baseIdb();
                try {
                    const tx = db.transaction("morceaux", "readwrite");
                    const magasin = tx.objectStore("morceaux");
                    if (rang === 0) magasin.delete(IDBKeyRange.bound(nom + "#", nom + "#￿"));
                    magasin.put(octets.buffer, nom + "#" + String(rang).padStart(6, "0"));
                    await fini(tx);
                } finally { db.close(); }
            }
        },
        async lire(nom, rang) {
            if (opfsPossible()) {
                const racine = await navigator.storage.getDirectory();
                const fichier = await (await racine.getFileHandle(nom)).getFile();
                return enTexte(new Uint8Array(await fichier.slice(rang * MO, (rang + 1) * MO).arrayBuffer()));
            }
            const db = await baseIdb();
            try {
                const v = await requete(db.transaction("morceaux").objectStore("morceaux").get(nom + "#" + String(rang).padStart(6, "0")));
                return v ? enTexte(new Uint8Array(v)) : "";
            } finally { db.close(); }
        },
    };
})();
