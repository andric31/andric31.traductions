// viewer.menu.extension.js — Entrée menu : Extension (images + bouton Mega + compteur + install + réglages)
(() => {
  "use strict";

  const EXT_TEXT_BOTTOM = `
C’est simple, rapide, et super pratique pour suivre mes trads sans te perdre !
`.trim();

  const DOWNLOAD_URL = "https://mega.nz/folder/zFsCQJbJ#PkeQbqOCla9RCwoy9sK4tw".replace("qO","qO"); // (no-op, garde ton URL si tu veux)
  const EXT_DL_ID = "__viewer_extension_download__";

  // ✅ 4 images (2 “avant”, 2 “après”)
  const IMAGES = {
    before: [
      "/img/f95list_extension_vignette_icon_multi.png",
      "/img/f95list_extension_thread_icon_multi.png"
    ],
    after: [
      "/img/f95list_extension_vignette_multi.png",
      "/img/f95list_extension_thread_multi.png"
    ],
    settings: "/img/f95list_extension_param.png"
  };

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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
        `/api/counter?op=${op}&kind=mega&id=${EXT_DL_ID}`,
        { cache: "no-store" }
      );
      if (!r.ok) return null;
      const j = await r.json();
      return Number(j.megaClicks ?? j.downloads ?? j.count ?? j.value ?? j.mega ?? 0);
    } catch { return null; }
  }

  function ensureDom() {
    if (document.getElementById("extOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "extOverlay";
    overlay.className = "modal-overlay hidden";
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <div class="modal-head">
          <div class="modal-title">Extension</div>
          <button class="modal-close" id="extClose">✕</button>
        </div>
        <div class="modal-body" id="extBody"></div>
        <div class="modal-foot">
          <button class="modal-btn" id="extOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("extClose").onclick = close;
    document.getElementById("extOk").onclick = close;
    overlay.onclick = e => { if (e.target.id === "extOverlay") close(); };
  }

  // ✅ Image centrée, une par ligne
  function imageBlock(src) {
    return `
      <div style="margin:14px 0;text-align:center;">
        <img src="${escapeHtml(src)}"
          draggable="false"
          style="
            display:block;
            max-width:100%;
            margin:0 auto;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.08);
            pointer-events:none;
            user-select:none;
          "
          onerror="this.style.display='none'">
      </div>
    `;
  }

  function renderHtml() {
    return `
      <div class="aboutText">

        <div style="font-weight:900;font-size:16px;text-align:center;margin-bottom:8px;">
          ✨ Mes traductions à portée de clic ! ✨
        </div>

        <div style="text-align:center;opacity:.95;margin-bottom:12px;">
          ${escapeHtml("Voici mon extension qui ajoute une icône directement sur les threads et les vignettes de F95Zone.")}
        </div>

        <!-- ✅ Images “avant” : une sous l'autre -->
        ${imageBlock(IMAGES.before[0])}
        ${imageBlock(IMAGES.before[1])}

        <!-- ✅ Phrase après la 2e image -->
        <div style="text-align:center;margin:12px 0;">
          ${escapeHtml("L’icône est cliquable et permet d’accéder aux informations de la traduction.")}
        </div>

        <!-- ✅ Images “après” : une sous l'autre -->
        ${imageBlock(IMAGES.after[0])}
        ${imageBlock(IMAGES.after[1])}

        <!-- ✅ Phrase après la 4e image -->
        <div style="text-align:center;margin:12px 0;">
          ${escapeHtml(EXT_TEXT_BOTTOM)}
        </div>

        <!-- Bouton téléchargement -->
        <div style="display:flex;justify-content:center;margin:14px 0;">
          <a id="extDownloadBtn"
             href="${DOWNLOAD_URL}"
             target="_blank"
             class="btn btn-page"
             style="
               min-width:260px;
               padding:10px 14px;
               font-weight:800;
               border-radius:12px;
               background:#3ddc84;
               color:#000;
               border:none;
             ">
            📥 Télécharger l’extension (MEGA)
          </a>
        </div>

        <!-- Espace renforcé -->
        <div style="margin-top:36px;"></div>

        <!-- Installation Chrome -->
        <div style="font-weight:900;margin-bottom:6px;">
          ✅ Installation dans Chrome
        </div>
        <ol style="padding-left:18px;line-height:1.6;margin:0;">
          <li>Ouvrez <code>chrome://extensions/</code></li>
          <li>Activez le <b>Mode développeur</b> (en haut à droite).</li>
          <li>Glissez-déposez l’archive <b>.zip</b></li>
        </ol>

        <div style="height:22px;"></div>

        <!-- Réglages -->
        <div style="font-weight:900;margin-bottom:6px;">
          🛠️ Réglages de l’icône sur les vignettes
        </div>
        <div style="opacity:.95;margin-bottom:8px;">
          Vous pouvez modifier la taille de l’icône affichée sur les vignettes.<br>
        </div>
        <ol style="padding-left:18px;line-height:1.6;margin:0;">
          <li>Épinglez l’extension : Icône puzzle 🧩 → épingle 📌</li>
          <li>Cliquez sur l’icône <b>f95list_andric31</b> dans la barre du navigateur.</li>
        </ol>

        ${imageBlock(IMAGES.settings)}

        <div style="height:22px;"></div>

        <!-- ✅ Installation Firefox -->
        <div style="font-weight:900;margin-bottom:6px;">
          ✅ Installation dans Firefox
        </div>

        <ol style="padding-left:18px;line-height:1.6;margin:0;">
          <li>
            Glissez-déposez le fichier <b>.xpi</b> dans la fenêtre Firefox.<br>
            <i>Fichier signé par Mozilla.</i>
          </li>
          <li>
            Confirmez l’installation :<br>
            Cliquez sur <b>Ajouter</b>, puis sur <b>OK</b>.
          </li>
        </ol>

        <div style="opacity:.95;margin-top:8px;">
          <i>Pensez à cocher <b>Épingler l’extension</b> afin d’accéder facilement aux réglages.</i>
        </div>

        <div style="height:22px;"></div>

        <!-- Installation Opera (formel) -->
        <div style="font-weight:900;margin-bottom:6px;">
          ✅ Installation dans Opera
        </div>
        <ol style="padding-left:18px;line-height:1.6;margin:0;">
          <li>Décompressez l’archive de l’extension dans un dossier.</li>
          <li>Ouvrez <code>opera://extensions</code></li>
          <li>Activez le <b>Mode développeur</b> (en haut à droite).</li>
          <li>Cliquez sur <b>Charger l’extension non empaquetée</b>.</li>
          <li>Sélectionnez le dossier décompressé de l’extension.</li>
          <li>Validez pour finaliser l’installation.</li>
        </ol>

        <!-- Compteur -->
        <div style="
          margin-top:16px;
          padding:10px;
          border:1px solid var(--border);
          border-radius:12px;
          text-align:center;
          color:var(--muted);
          font-size:12px;
        ">
          📥 Téléchargements :
          <strong id="extDlCount" style="color:var(--fg)">0</strong>
        </div>
      </div>
    `;
  }

  async function updateCount(op) {
    const n = await fetchCounter(op);
    const el = document.getElementById("extDlCount");
    if (el) el.textContent = formatInt(n ?? 0);
  }

  function open() {
    ensureDom();
    document.getElementById("extBody").innerHTML = renderHtml();
    document.getElementById("extOverlay").classList.remove("hidden");

    updateCount("get");

    const btn = document.getElementById("extDownloadBtn");
    if (btn) {
      btn.onclick = () => updateCount("hit");
      btn.oncontextmenu = e => e.preventDefault();
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
  if (!register()) {
    const t = setInterval(() => {
      if (register()) clearInterval(t);
    }, 50);
  }
})();
