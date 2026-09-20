// viewer.annonce.js — Bandeau annonce au-dessus des tuiles (minimisable)
// Dépend uniquement de annonce.html (contenu)
// Fonctionne même si f95list.json échoue.

(() => {
  const SS_KEY = "viewer_annonce_minimized";
  const ANNOUNCE_URL = "/annonce.html";

  function ensureHost() {
    // Host placé dans index.html: <div id="viewerAnnonceHost"></div>
    let host = document.getElementById("viewerAnnonceHost");
    if (host) return host;

    // Fallback si jamais pas dans HTML
    host = document.createElement("div");
    host.id = "viewerAnnonceHost";

    const gridWrap = document.getElementById("gridMode") || document.querySelector(".grid-wrap");
    if (gridWrap) gridWrap.insertBefore(host, gridWrap.firstChild);
    else document.body.insertBefore(host, document.body.firstChild);

    return host;
  }

  function isEmptyHtml(html) {
    const t = String(html || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    return t.length === 0;
  }

  function getMinimized() {
    try { return sessionStorage.getItem(SS_KEY) === "1"; }
    catch { return false; }
  }
  
  function setMinimized(v) {
    try { sessionStorage.setItem(SS_KEY, v ? "1" : "0"); } catch {}
  }

  function render(html, opts = {}) {
    const host = ensureHost();
    const minimized = opts.forceOpen ? false : getMinimized();

    // Si annonce vide => on cache totalement
    if (!opts.forceShow && isEmptyHtml(html)) {
      host.innerHTML = "";
      return;
    }

    host.innerHTML = `
      <section class="viewer-annonce ${minimized ? "is-min" : ""}" aria-labelledby="viewerAnnonceTitle">
        <div class="viewer-annonce__bar">
          <div class="viewer-annonce__title" id="viewerAnnonceTitle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l12-5v16L8 15H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2ZM8 9v6m-3 0 2 6h3l-2-6"/></svg>
            Annonces
          </div>
          <button type="button" class="viewer-annonce__btn" id="viewerAnnonceToggle" aria-controls="viewerAnnonceBody" aria-expanded="${!minimized}">
            <span>${minimized ? "Afficher" : "Réduire"}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>
          </button>
        </div>
        <div class="viewer-annonce__body" id="viewerAnnonceBody" ${minimized ? "hidden" : ""}>${html}</div>
      </section>
    `;

    const btn = host.querySelector("#viewerAnnonceToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const panel = host.querySelector(".viewer-annonce");
        const body = host.querySelector("#viewerAnnonceBody");
        const nowMin = panel.classList.toggle("is-min");
        setMinimized(nowMin);
        body.hidden = nowMin;
        btn.setAttribute("aria-expanded", String(!nowMin));
        btn.querySelector("span").textContent = nowMin ? "Afficher" : "Réduire";
      });
    }
  }

  async function loadAnnonce() {
    const r = await fetch(ANNOUNCE_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("annonce.html introuvable (HTTP " + r.status + ")");
    return await r.text();
  }

  // API publique pour maintenance (appelable depuis viewer.js)
  window.viewerAnnonce = {
    setHtml(html) {
      render(String(html || ""), { forceShow: true, forceOpen: true });
    },
    setMaintenance(message) {
      const msg = String(message || "La page est temporairement indisponible.");
      render(`<b>🚧 Maintenance</b><br>${msg}`, { forceShow: true, forceOpen: true });
    },
    refresh() {
      loadAnnonce()
        .then(html => render(html))
        .catch(() => {
          // si annonce.html ne charge pas -> on n’affiche rien (ou tu peux mettre un fallback)
          render("", { forceShow: false });
        });
    }
  };

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    window.viewerAnnonce.refresh();
  });
})();
