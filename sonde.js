// Tout le JavaScript de la sonde vit ici. Chaque fonction est appelée par
// l'interface Kotlin `Navigateur`. UNE ENTRÉE PAR LIGNE, virgule finale, rangée
// dans la section de sa tâche.
// Journal des chargements de la page : chaque exécution de ce script est un chargement (ouverture,
// rechargement, ou page déchargée puis rechargée par Safari). Gardé dans localStorage, donc il survit à
// la relance. Sert à répondre à « Safari a-t-il rechargé la sonde pendant l'essai d'endurance ? ».
(function () {
    let n = 1, journal = [], arrierePlan = 0;
    try {
        n = parseInt(localStorage.getItem("sonde.chargements") || "0", 10) + 1;
        localStorage.setItem("sonde.chargements", String(n));
        journal = JSON.parse(localStorage.getItem("sonde.journalChargements") || "[]");
        arrierePlan = parseInt(localStorage.getItem("sonde.arrierePlan") || "0", 10);
    } catch (e) { /* stockage refusé : on garde ce qu'on a */ }
    const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    journal.push({ n: n, t: new Date().toISOString(), type: nav ? nav.type : "?", build: window.SONDE_BUILD || "" });
    journal = journal.slice(-8);
    try { localStorage.setItem("sonde.journalChargements", JSON.stringify(journal)); } catch (e) { }
    window.SONDE_CHARGEMENT = n;
    window.SONDE_JOURNAL = journal;
    // Le parcours automatique note une ouverture hors ligne (mode avion) : lu ici, au tout début du chargement.
    window.SONDE_EN_LIGNE_AU_CHARGEMENT = navigator.onLine !== false;
    document.addEventListener("visibilitychange", function () {
        window.SONDE_VIS_T = performance.now();
        if (document.visibilityState !== "hidden") return;
        arrierePlan++;
        try { localStorage.setItem("sonde.arrierePlan", String(arrierePlan)); } catch (e) { }
    });
    window.SONDE_ARRIERE_PLAN = function () { return arrierePlan; };
})();

// L'invite d'installation de Chromium (Android, ordinateur) : elle n'arrive qu'une fois, tôt ; on la garde
// pour le bouton « Installer ». Safari n'en a pas : sur iOS, l'installation passe par Partager.
window.SONDE_INSTALLATION = { invite: null, faite: false };
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window.SONDE_INSTALLATION.invite = e; });
window.addEventListener("appinstalled", function () { window.SONDE_INSTALLATION.faite = true; window.SONDE_INSTALLATION.invite = null; });

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
    // Mise à jour forcée : vérifie qu'on est en ligne, puis retire le Service Worker et les caches
    // `sonde-*` et recharge. Le stockage (OPFS, IndexedDB, localStorage) n'est jamais touché.
    // Clavier : Compose ne passe pas toujours inputmode/autocapitalize à son élément de saisie.
    // Le mode voulu est gardé, posé sur le champ actif tout de suite et sur chaque champ qui prend le focus.
    modeClavier: (inputMode, autoCapitalize) => {
        window.SONDE_CLAVIER = { inputMode: inputMode, autoCapitalize: autoCapitalize };
        appliquerModeClavier(elementActif());
    },
    hauteurClavier: () => {
        const vv = window.visualViewport;
        if (!vv) return 0;
        return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    },
    mesuresClavier: () => {
        const vv = window.visualViewport;
        const el = elementActif();
        const hote = document.activeElement;
        appliquerModeClavier(el); // filet : le champ a pu prendre le focus avant que Kotlin annonce son mode
        return "inner=" + Math.round(window.innerHeight) + " vv=" + (vv ? Math.round(vv.height) + "+" + Math.round(vv.offsetTop) : "n/a")
            + " hôte=" + (hote ? hote.tagName : "-") + (hote && hote.shadowRoot ? "(ombre)" : "")
            + " actif=" + (el ? el.tagName + (el.isContentEditable ? "(éditable)" : "") + (el.getAttribute("inputmode") ? "[" + el.getAttribute("inputmode") + "," + el.getAttribute("autocapitalize") + "]" : "") : "-");
    },
    // Le journal des chargements, une ligne par chargement : « n° 12 · 21/11 14:03 · reload · build … ».
    chargements: () => {
        const j = window.SONDE_JOURNAL || [];
        const lignes = j.map((e) => "n° " + e.n + " · " + e.t.replace("T", " ").slice(0, 19) + " UTC · " + e.type + " · build " + e.build);
        return "Ce chargement : n° " + window.SONDE_CHARGEMENT + " (le compteur ne revient jamais à zéro). "
            + "Passages en arrière-plan : " + (window.SONDE_ARRIERE_PLAN ? window.SONDE_ARRIERE_PLAN() : "?") + ".\n" + lignes.join("\n");
    },
    heure: () => new Date().toTimeString().slice(0, 8),
    dernierChangementVisibilite: () => window.SONDE_VIS_T || 0,
    // Relevé de fluidité : une ligne toutes les 5 s, gardée dans localStorage (600 lignes au plus).
    // Page cachée : rien n'est écrit (les images y sont arrêtées, ce ne serait pas une saccade).
    releveAjouter: (ligne) => {
        if (document.visibilityState === "hidden") return;
        try {
            let l = JSON.parse(localStorage.getItem("sonde.releve") || "[]");
            l.push(ligne);
            if (l.length > 600) l = l.slice(-600);
            localStorage.setItem("sonde.releve", JSON.stringify(l));
        } catch (e) { }
    },
    releveLire: () => { try { return JSON.parse(localStorage.getItem("sonde.releve") || "[]").join("\n"); } catch (e) { return ""; } },
    releveEffacer: () => { try { localStorage.removeItem("sonde.releve"); } catch (e) { } },
    // Copie le relevé pour le coller dans la conversation : en-tête (build, appareil, chargements),
    // tous les creux, puis les 120 dernières lignes. L'appel part du toucher : c'est ce qui autorise iOS à copier.
    copierReleve: () => {
        let lignes = [];
        try { lignes = JSON.parse(localStorage.getItem("sonde.releve") || "[]"); } catch (e) { }
        const creux = lignes.filter((l) => { const p = l.split("|"); return parseInt(p[3], 10) < 20 || parseInt(p[7] || "0", 10) >= 500; });
        const texte = [
            "# Relevé de la sonde — build " + window.SONDE_BUILD + " (" + (window.SONDE_VERSION || "?") + ")",
            "# " + navigator.userAgent,
            "# " + window.sonde.chargements().replace(/\n/g, "\n# "),
            "# colonnes : heure|écran|fps|fps min|photos|fiches|Mo décodés|pause max (ms)",
            "## creux (fps min < 20 ou pause ≥ 500 ms) : " + creux.length,
            creux.join("\n"),
            "## 120 dernières lignes sur " + lignes.length,
            lignes.slice(-120).join("\n"),
        ].join("\n");
        copier(texte, "copié (" + lignes.length + " lignes)");
    },
    statutCopie: () => window.SONDE_COPIE || "",
    recharger: async () => {
        try {
            const r = await fetch("build.js?" + Date.now(), { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
        } catch (e) {
            alert("Hors ligne : mise à jour impossible (la version installée reste utilisable).");
            return;
        }
        try {
            if ("serviceWorker" in navigator) {
                for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
            }
            if (window.caches) {
                for (const nom of await caches.keys()) if (nom.indexOf("sonde-") === 0) await caches.delete(nom);
            }
        } catch (e) { /* on recharge quand même */ }
        location.reload();
    },

    // ---- Banc d'essai (lot A) : installation, écran allumé, séries, rapport ----
    // « autonome » (ouverte depuis l'icône), « installee » (appinstalled vu, page restée dans l'onglet),
    // « invite » (invite native de Chromium disponible), « manuelle » (Partager sur iOS, menu ailleurs).
    etatInstallation: () => window.sonde.estInstallee() ? "autonome"
        : window.SONDE_INSTALLATION.faite ? "installee" : window.SONDE_INSTALLATION.invite ? "invite" : "manuelle",
    // À appeler dans le geste du toucher. « accepted », « dismissed » ou « indisponible ».
    demanderInstallation: async () => {
        const invite = window.SONDE_INSTALLATION.invite;
        if (!invite) return "indisponible";
        window.SONDE_INSTALLATION.invite = null; // une invite ne sert qu'une fois
        try { invite.prompt(); return (await invite.userChoice).outcome; } catch (e) { return "indisponible"; }
    },
    // Wake Lock : « actif », « refusé : <raison> », « indisponible », « relâché »… Redemandé au retour au premier plan.
    ecranAllumeDemander: async () => { ecranAllume.voulu = true; return ecranAllume.demander(); },
    ecranAllumeRelacher: async () => {
        ecranAllume.voulu = false;
        const v = ecranAllume.verrou;
        ecranAllume.verrou = null;
        if (v) { try { await v.release(); } catch (e) { } }
        ecranAllume.etat = "relâché";
        return ecranAllume.etat;
    },
    ecranAllumeEtat: () => ecranAllume.etat,
    // L'environnement en JSON (valeurs en texte) : lu par Kotlin, analysé par `analyserAppareil`.
    environnement: () => JSON.stringify({
        userAgent: navigator.userAgent,
        platform: navigator.platform || "",
        maxTouchPoints: String(navigator.maxTouchPoints || 0),
        ecran: screen.width + "×" + screen.height + " (fenêtre " + window.innerWidth + "×" + window.innerHeight + ")",
        dpr: String(window.devicePixelRatio || 1),
        coeurs: navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : "non exposé",
        memoire: navigator.deviceMemory ? navigator.deviceMemory + " Go (arrondi par le navigateur)" : "non exposée",
        langue: (navigator.languages && navigator.languages.length ? navigator.languages.join(", ") : navigator.language) || "",
        affichage: window.sonde.estInstallee() ? "autonome (écran d'accueil)" : "onglet du navigateur",
        orientation: (screen.orientation && screen.orientation.type) || (typeof window.orientation === "number" ? window.orientation + "°" : "inconnue"),
    }),
    // Resource Timing : ce qu'ont pesé la page et ses fichiers de même origine (les tuiles, d'une autre origine, n'y sont pas).
    tailleTransferee: () => {
        const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation") : [];
        const res = performance.getEntriesByType ? performance.getEntriesByType("resource").filter((e) => e.name.indexOf(location.origin) === 0) : [];
        const tous = nav.concat(res);
        let transfert = 0, encode = 0;
        for (const e of tous) { transfert += e.transferSize || 0; encode += e.encodedBodySize || 0; }
        const mo = (n) => (n / 1048576).toFixed(1).replace(".", ",");
        return tous.length + " fichiers · transférés " + mo(transfert) + " Mo · corps encodés " + mo(encode) + " Mo"
            + (transfert === 0 && encode > 0 ? " (rien par le réseau : tout venait du cache)" : "");
    },
    // Le contrôle du précache, demandé au Service Worker (message « controlePrecache ») ; JSON, lu par `lireControlePrecache`.
    controlePrecache: async () => {
        const etat = (texte) => JSON.stringify({ etat: texte });
        if (!("serviceWorker" in navigator)) return etat("Service Worker indisponible");
        try {
            const r = await navigator.serviceWorker.getRegistration();
            const sw = r && (r.active || r.waiting || r.installing);
            if (!sw) return etat("aucun Service Worker");
            const reponse = await new Promise((ok) => {
                const canal = new MessageChannel();
                const minuterie = setTimeout(() => ok(null), 3000);
                canal.port1.onmessage = (e) => { clearTimeout(minuterie); ok(e.data); };
                sw.postMessage({ type: "controlePrecache" }, [canal.port2]);
            });
            if (!reponse) return etat("le Service Worker n'a pas répondu (build antérieur au contrôle du précache ?)");
            if (reponse.erreur) return etat("échec : " + reponse.erreur);
            return JSON.stringify(reponse);
        } catch (e) { return etat("échec : " + e); }
    },
    // Une photo synthétique : dégradé, formes et bruit (pour que le JPEG pèse comme une vraie photo), en JPEG.
    // « O » + base64, ou « E » + raison. Le canevas est vidé aussitôt : iOS limite la mémoire des canevas.
    photoSynthetique: (largeur, hauteur, graine) => new Promise((resolve) => {
        try {
            let s = (graine * 2654435761) >>> 0 || 1;
            const hasard = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
            const teinte = () => "hsl(" + Math.floor(hasard() * 360) + "," + Math.floor(30 + hasard() * 60) + "%," + Math.floor(25 + hasard() * 50) + "%)";
            const canevas = document.createElement("canvas");
            canevas.width = largeur; canevas.height = hauteur;
            const g = canevas.getContext("2d");
            const d = g.createLinearGradient(0, 0, largeur, hauteur);
            d.addColorStop(0, teinte()); d.addColorStop(0.5, teinte()); d.addColorStop(1, teinte());
            g.fillStyle = d; g.fillRect(0, 0, largeur, hauteur);
            const cote = Math.max(largeur, hauteur);
            for (let i = 0; i < 400; i++) {
                g.globalAlpha = 0.2 + hasard() * 0.6;
                g.fillStyle = teinte();
                const x = hasard() * largeur, y = hasard() * hauteur, r = hasard() * cote / 8;
                if (i % 2) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } else g.fillRect(x, y, r * 2, r * hasard() * 2);
            }
            // Bruit : une tuile de pixels au hasard posée partout, décalée à chaque rangée.
            const tuile = document.createElement("canvas");
            tuile.width = tuile.height = 256;
            const tg = tuile.getContext("2d");
            const pixels = tg.createImageData(256, 256);
            for (let i = 0; i < pixels.data.length; i += 4) {
                const v = Math.floor(hasard() * 256);
                pixels.data[i] = v; pixels.data[i + 1] = (v * 7) & 255; pixels.data[i + 2] = (v * 13) & 255; pixels.data[i + 3] = 255;
            }
            tg.putImageData(pixels, 0, 0);
            g.globalAlpha = 0.3;
            for (let y = 0; y < hauteur; y += 256) {
                const decalage = Math.floor(hasard() * 256);
                for (let x = -decalage; x < largeur; x += 256) g.drawImage(tuile, x, y);
            }
            g.globalAlpha = 1;
            tuile.width = tuile.height = 0;
            canevas.toBlob((blob) => {
                canevas.width = canevas.height = 0;
                if (!blob) { resolve("Ecanevas refusé (trop grand pour ce navigateur ?)"); return; }
                window.sonde.lireBlob(blob).then((b64) => resolve("O" + b64), (e) => resolve("Electure : " + e));
            }, "image/jpeg", 0.85);
        } catch (e) { resolve("E" + ((e && e.name) || "Error") + (e && e.message ? " : " + e.message : "")); }
    }),
    // Réglages du testeur (version d'iOS indiquée, libellé), gardés dans localStorage.
    lireReglage: (nom) => { try { return localStorage.getItem("sonde.reglage." + nom) || ""; } catch (e) { return ""; } },
    ecrireReglage: (nom, valeur) => { try { localStorage.setItem("sonde.reglage." + nom, valeur); } catch (e) { } },
    dateLocale: () => {
        const d = new Date(), p = (n) => String(n).padStart(2, "0");
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    },
    // Copie un texte quelconque ; statut dans statutCopie(). À appeler dans le geste du toucher.
    copierTexte: (texte) => copier(texte, "copié (" + texte.length + " caractères)"),
    // Partage : « O » + ce qui a été partagé, ou « E » + raison. À appeler dans le geste du toucher (rien n'attend avant share).
    partager: (titre, texte, json) => {
        if (!navigator.share) return Promise.resolve("Epartage indisponible dans ce navigateur : utilisez « Copier »");
        const donnees = { title: titre, text: texte };
        try {
            const fichiers = [
                new File([texte], "rapport-sonde.md", { type: "text/plain" }),
                new File([json], "rapport-sonde.json", { type: "application/json" }),
            ];
            if (navigator.canShare && navigator.canShare({ files: fichiers })) donnees.files = fichiers;
        } catch (e) { /* pas de fichiers : le texte seul */ }
        return navigator.share(donnees).then(
            () => "O" + (donnees.files ? "partagé (texte et fichiers .md et .json)" : "partagé (texte)"),
            (e) => "E" + (e && e.name === "AbortError" ? "partage annulé" : "partage refusé : " + ((e && e.name) || e)));
    },
    // L'envoi automatique n'existe que si rapport-config.js (écrit par tools/publier-sonde.sh) est là.
    envoiDisponible: () => !!(window.SONDE_RAPPORT && window.SONDE_RAPPORT.url && window.SONDE_RAPPORT.cle),
    // Ouvre un ticket par la fonction Edge `signaler`, avec une session anonyme Supabase (le jeton GitHub reste
    // côté serveur). « O » + URL du ticket, ou « E<code>|<détail> » (lu par `lireResultatEnvoi`).
    envoyerRapport: async (titre, description, contexte, journal) => {
        const conf = window.SONDE_RAPPORT;
        if (!conf || !conf.url || !conf.cle) return "Econfig|";
        const base = conf.url.replace(/\/+$/, "");
        let jeton;
        try { jeton = await sessionAnonyme(base, conf.cle, false); } catch (e) { return "Esession|" + ((e && e.message) || e); }
        const appeler = (type) => fetch(base + "/functions/v1/signaler", {
            method: "POST",
            headers: { "Authorization": "Bearer " + jeton, "apikey": conf.cle, "Content-Type": "application/json" },
            body: JSON.stringify({ type: type, titre: titre, description: description, contexte: contexte, journal: journal }),
        });
        try {
            let r = await appeler("sonde");
            if (r.status === 401) { // session périmée côté serveur : une nouvelle, une fois
                try { jeton = await sessionAnonyme(base, conf.cle, true); } catch (e) { return "Esession|" + ((e && e.message) || e); }
                r = await appeler("sonde");
            }
            if (r.status === 400) r = await appeler("idee"); // fonction pas encore redéployée : type « sonde » inconnu
            const corps = await r.json().catch(() => ({}));
            if (r.ok && corps.url) return "O" + corps.url;
            return "E" + r.status + "|" + (corps.erreur || corps.message || corps.msg || r.statusText || "");
        } catch (e) { return "Ereseau|" + ((e && e.message) || e); }
    },

    // ---- Parcours automatique (lot B) ----
    // Le numéro de ce chargement (le compteur ne revient jamais à zéro) : un parcours en cours dans un autre
    // numéro a été interrompu par un rechargement.
    numeroChargement: () => window.SONDE_CHARGEMENT || 0,
    enLigneAuChargement: () => window.SONDE_EN_LIGNE_AU_CHARGEMENT !== false,
    epochMs: () => Date.now(),
    // La partie visible de la page, en px CSS : « décalage haut|hauteur|innerHeight » (visualViewport ; le clavier d'iOS la réduit).
    zoneVisible: () => {
        const vv = window.visualViewport;
        return vv ? vv.offsetTop + "|" + vv.height + "|" + window.innerHeight : "0|" + window.innerHeight + "|" + window.innerHeight;
    },
};

// Copie [texte] dans le presse-papiers, avec repli sur execCommand ; le résultat va dans window.SONDE_COPIE.
function copier(texte, succes) {
    window.SONDE_COPIE = "";
    const repli = () => {
        try {
            const t = document.createElement("textarea");
            t.value = texte; t.style.position = "fixed"; t.style.opacity = "0";
            document.body.appendChild(t); t.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(t);
            window.SONDE_COPIE = ok ? succes : "échec : copie refusée";
        } catch (e) { window.SONDE_COPIE = "échec : " + e; }
    };
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texte).then(() => { window.SONDE_COPIE = succes; }, repli);
        } else { repli(); }
    } catch (e) { repli(); }
}

// Wake Lock (écran allumé) : demandé par le testeur ou le parcours, jamais au démarrage. Le navigateur le
// relâche quand la page est cachée ; s'il est toujours voulu, on le redemande au retour au premier plan.
const ecranAllume = {
    voulu: false, verrou: null, etat: "inactif",
    async demander() {
        if (!("wakeLock" in navigator)) { this.etat = "indisponible"; return this.etat; }
        try {
            const v = await navigator.wakeLock.request("screen");
            this.verrou = v;
            this.etat = "actif";
            v.addEventListener("release", () => {
                if (this.verrou !== v) return;
                this.verrou = null;
                this.etat = this.voulu ? "relâché par le navigateur (page cachée) ; redemandé au retour" : "relâché";
            });
        } catch (e) {
            this.etat = "refusé : " + ((e && e.name) || "Error") + (e && e.message ? " — " + e.message : "");
        }
        return this.etat;
    },
};
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ecranAllume.voulu && !ecranAllume.verrou) ecranAllume.demander();
});

// Session anonyme Supabase, gardée dans localStorage : renouvelée par son jeton de rafraîchissement (même
// utilisateur, donc même limite de 5 rapports par 24 h), et recréée seulement si ce n'est pas possible.
async function sessionAnonyme(base, cle, forcer) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem("sonde.session") || "null"); } catch (e) { }
    if (!forcer && s && s.jeton && s.expire > Date.now() / 1000 + 60) return s.jeton;
    const demander = async (chemin, corps) => {
        const r = await fetch(base + "/auth/v1/" + chemin, {
            method: "POST", headers: { "apikey": cle, "Content-Type": "application/json" }, body: JSON.stringify(corps),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok || !json.access_token) throw new Error("HTTP " + r.status + (json.msg || json.error_description || json.message ? " : " + (json.msg || json.error_description || json.message) : ""));
        return json;
    };
    let rep = null;
    if (s && s.rafraichir) { try { rep = await demander("token?grant_type=refresh_token", { refresh_token: s.rafraichir }); } catch (e) { rep = null; } }
    if (!rep) rep = await demander("signup", {});
    const expire = rep.expires_at || (Date.now() / 1000 + (rep.expires_in || 3600));
    try { localStorage.setItem("sonde.session", JSON.stringify({ jeton: rep.access_token, rafraichir: rep.refresh_token || "", expire: expire })); } catch (e) { }
    return rep.access_token;
}

// Stockage de la tâche 3 : OPFS quand le navigateur sait écrire un fichier depuis la page
// (getDirectory ET createWritable : Safari avant la 26 n'a que le premier, réservé aux
// Workers), sinon IndexedDB, un enregistrement par morceau de 1 Mo dans la base « sonde ».
// L'élément réellement actif, en descendant dans les Shadow DOM (activeElement ne rend que l'hôte).
function elementActif() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
}
function appliquerModeClavier(el) {
    const m = window.SONDE_CLAVIER;
    // Compose écrit dans un élément de saisie du navigateur : input, textarea, ou un DIV éditable (vu sur iPadOS 16.7).
    if (!m || !el || !(el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    el.setAttribute("inputmode", m.inputMode);
    el.setAttribute("autocapitalize", m.autoCapitalize);
    el.setAttribute("autocorrect", m.autoCapitalize === "none" ? "off" : "on");
    el.setAttribute("enterkeyhint", "done");
}
document.addEventListener("focusin", (e) => appliquerModeClavier(e.composedPath ? e.composedPath()[0] : e.target), true);

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
