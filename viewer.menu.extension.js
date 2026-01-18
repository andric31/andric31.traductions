// viewer.menu.extension.js — Entrée menu : Extension
(() => {
  "use strict";

  const EXT_TEXT_TOP = `
✨ Mes traductions à portée de clic ! ✨
Voici mon extension qui ajoute une icône directement sur les threads et les vignettes de F95Zone.
`.trim();

  const EXT_TEXT_BOTTOM = `
C’est simple, rapide, et super pratique pour suivre mes trads sans te perdre !
`.trim();

  // Mets tes liens ici
  const LINKS = [
    { label: "📥 Télécharger l’extension", url: "" },
    { label: "🌐 Viewer / Liste", url: "" },
    { label: "💬 Discord", url: "https://discord.gg/Jr8Ykf8yMd" },
    { label: "🧵 Profil F95Zone", url: "https://f95zone.to/members/andric31.247797/" },
  ];

  // Mets tes images ici (chemins/urls)
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
    const links = LINKS.filter(x => x && x.label);

    const imagesHtml = imgs.length ? `
      <div style="font-weight:900;margin:12px 0 8px;">🖼️ Images</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 12px;">
        ${imgs.slice(0, 6).map(src => `
          <img src="${escapeHtml(src)}" alt=""
            referrerpolicy="no-referrer"
            style="width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,.08)"
            onerror="this.style.display='none'">
        `).join("")}
      </div>
    ` : `
      <div style="font-weight:900;margin:12px 0 6px;">🖼️ Images</div>
      <div style="opacity:.85;margin-bottom:12px;">(Ajoute ici tes captures d’écran)</div>
    `;

    const linksHtml = `
      <div style="font-weight:900;margin:12px 0 6px;">🔗 Liens</div>
      <ul style="margin:0;padding-left:18px;line-height:1.6;">
        ${links.map(l => {
          const url = String(l.url || "").trim();
          if (!url) return `<li>${escapeHtml(l.label)} : <span style="opacity:.7;">(à renseigner)</span></li>`;
          return `<li>${escapeHtml(l.label)} : <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></li>`;
        }).join("")}
      </ul>
    `;

    return `
      <div class="aboutText">
        <div style="font-weight:900;font-size:16px;margin-bottom:8px;">✨ Mes traductions à portée de clic ! ✨</div>
        <div style="margin-bottom:10px;">${escapeHtml("Voici mon extension qui ajoute une icône directement sur les threads et les vignettes de F95Zone.")}</div>
        ${imagesHtml}
        <div style="margin:10px 0 12px;">${escapeHtml(EXT_TEXT_BOTTOM)}</div>
        ${linksHtml}
      </div>
    `;
  }

  function open() {
    ensureDom();
    const body = document.getElementById("extBody");
    if (body) body.innerHTML = renderHtml();
    document.getElementById("extOverlay")?.classList.remove("hidden");
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
