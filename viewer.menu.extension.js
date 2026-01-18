// viewer.menu.extension.js — Entrée menu : Extension (image + bouton Mega + compteur en bas + install)
(() => {
  "use strict";

  const EXT_TEXT_BOTTOM = `
C’est simple, rapide, et super pratique pour suivre mes trads sans te perdre !
`.trim();

  const DOWNLOAD_URL = "https://mega.nz/folder/zFsCQJbJ#PkeQbqOCla9RCwoy9sK4tw";

  // ✅ ID compteur (unique)
  const EXT_DL_ID = "__viewer_extension_download__";

  // ✅ Images
  const IMAGES = [
    "/img/f95list_extension.png"
  ];

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function formatInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try { return x.toLocaleString("fr-FR"); }
    catch { return String(Math.floor(x)); }
  }

  async function fetchCounter(op) {
    try {
      const r = await fetch(
        `/api/counter?op=${encodeURIComponent(op)}&kind=mega&id=${encodeURIComponent(EXT_DL_ID)}`,
        { cache: "no-store" }
      );
      if (!r.ok) return null;
      const j = await r.json();
      if (!j?.ok) return null;

      // Tolérant selon ton backend
      const n =
        j.megaClicks ??
        j.downloads ??
        j.count ??
        j.value ??
        j.mega ??
        0;

      return Number(n || 0);
    } catch {
      return null;
    }
  }

  function ensureDom() {
    let overlay = document.getElementById("extOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "extOverlay";
      overlay.className = "modal-overlay hidden";
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="extTitle">
          <div class="modal-head">
            <div class="modal-title" id="extTitle">Extension</div>
            <button type="button" class="modal-close" id="extClose" aria-label="Fermer">✕</button>
          </div>
          <div class="modal-body" id="extBody"></div>
          <div class="modal-foot">
            <button type="button" class="modal-btn" id="extOk">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById("extClose")?.addEventListener("click", close);
      document.getElementById("extOk")?.addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target && e.target.id === "extOverlay") close();
      });
    }
  }

  function renderHtml() {
    const imgs = IMAGES.filter(Boolean);

    const imageHtml = imgs.length ? `
      <div style="margin:12px 0;text-align:center;">
        <img src="${escapeHtml(imgs[0])}" alt=""
          referrerpolicy="no-referrer"
          style="max-width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.08)"
          onerror="this.style.display='none'">
      </div>
    ` : ``;

    const installHtml = `
      <div style="font-weight:900;margin:12px 0 6px;">✅ Installation dans Chrome</div>
      <ol style="margin:0;padding-left:18px;line-height:1.6;">
        <li>Ouvrez la page des extensions <code>chrome://extensions/</code></li>
        <li>Activez le <b>Mode développeur</b> en haut à droite.</li>
        <li>Glissez-déposez l’archive <b>.zip</b> dans la page.</li>
      </ol>
    `;

    // ✅ Compteur tout à la fin (comme page jeu)
    const statsHtml = `
      <div style="
        margin-top:14px;
        padding:10px 12px;
        border:1px solid var(--border);
        border-radius:12px;
        background: rgba(255,255,255,0.03);
        color: var(--muted);
        font-size:12px;
        display:flex;
        justify-content:center;
        gap:10px;
        user-select:none;
      ">
        📥 Téléchargements : <strong style="color:var(--fg);font-weight:800;" id="extDlCount">0</strong>
      </div>
    `;

    return `
      <div class="aboutText">

        <!-- ✅ Titre centré -->
        <div style="font-weight:900;font-size:16px;margin-bottom:8px;text-align:center;">
          ✨ Mes traductions à portée de clic ! ✨
        </div>

        <div style="margin-bottom:10px;text-align:center;opacity:.95;">
          ${escapeHtml("Voici mon extension qui ajoute une icône directement sur les threads et les vignettes de F95Zone.")}
        </div>

        ${imageHtml}

        <!-- ✅ Bouton Mega (style viewer .btn, avec look Mega) -->
        <div style="display:flex;justify-content:center;margin:12px 0 10px;">
          <a class="btn btn-page" id="extDownloadBtn"
             href="${escapeHtml(DOWNLOAD_URL)}"
             target="_blank" rel="noopener"
             style="
               width:auto;
               min-width: 260px;
               padding:10px 14px;
               border-radius:12px;
               font-weight:800;
               background:#3ddc84;
               color:#000;
               border:none;
             ">
            📥 Télécharger l’extension (MEGA)
          </a>
        </div>

        <div style="margin:10px 0 12px;text-align:center;">
          ${escapeHtml(EXT_TEXT_BOTTOM)}
        </div>

        ${installHtml}

        ${statsHtml}
      </div>
    `;
  }

  async function updateCount(op) {
    const n = await fetchCounter(op);
    const el = document.getElementById("extDlCount");
    if (el) el.textContent = (n === null) ? "0" : formatInt(n);
  }

  function open() {
    ensureDom();
    const body = document.getElementById("extBody");
    if (body) body.innerHTML = renderHtml();
    document.getElementById("extOverlay")?.classList.remove("hidden");

    // ✅ affiche compteur (sans incrémenter)
    updateCount("get");

    // ✅ clic bouton => incrémente en parallèle (sans bloquer l'ouverture Mega)
    const btn = document.getElementById("extDownloadBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        try { updateCount("hit"); } catch {}
      }, { once: false });
    }
  }

  function close() {
    document.getElementById("extOverlay")?.classList.add("hidden");
  }

  function register() {
    if (!window.ViewerMenu?.addItem) return false;
    window.ViewerMenu.addItem("🧩 Extension", open);
    window.ViewerMenuExtension = { open, close };
    return true;
  }

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (register() || tries > 80) clearInterval(t);
  }, 50);
})();
