(() => {
  const HELP_BTN_ID = "menuHelpBtn";
  const HELP_MODAL_ID = "menuHelpModal";

  const HELP_STYLE_ID = "menuHelpStyles";

  function injectStyles() {
    if (document.getElementById(HELP_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HELP_STYLE_ID;
    style.textContent = `
      .menu-help-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:16px;
        background:var(--overlay-bg, rgba(0,0,0,.55));z-index:9999}
      .menu-help-overlay.is-open{display:flex}

      .menu-help-card{width:min(980px,100%);max-height:min(86vh,900px);overflow:auto;border-radius:16px;
        background:var(--card, var(--bg2, #fff));
        color:var(--fg, #111);
        box-shadow:0 18px 60px rgba(0,0,0,.35);
        border:1px solid var(--border-soft, rgba(0,0,0,.10))}
      .menu-help-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 14px;
        border-bottom:1px solid var(--border-soft, rgba(0,0,0,.10))}
      .menu-help-title{font-size:20px;font-weight:800;letter-spacing:.2px;line-height:1.2;color:var(--title, inherit)}
      .menu-help-subtitle{margin-top:6px;font-size:13px;color:var(--muted, rgba(0,0,0,.7));line-height:1.35}

      .menu-help-close{appearance:none;border:0;background:transparent;color:inherit;font-size:18px;line-height:1;
        padding:8px;border-radius:10px;cursor:pointer;opacity:.85}
      .menu-help-close:hover{background:var(--hover-bg, rgba(0,0,0,.06));opacity:1}

      .menu-help-body{padding:16px 18px 6px}
      .menu-help-tip{font-size:13px;line-height:1.4;padding:12px 12px;border-radius:12px;
        background:var(--soft-05, var(--hover-bg, rgba(0,0,0,.05)));margin-bottom:14px;border:1px solid var(--border-soft, rgba(0,0,0,.10))}
      .menu-help-tip kbd{font:inherit;font-weight:800;padding:2px 6px;border-radius:8px;
        border:1px solid var(--border, rgba(0,0,0,.18));
        background:var(--btn, rgba(255,255,255,.55))}

      .menu-help-section{margin:14px 0 18px}
      .menu-help-h3{margin:0 0 10px;font-size:15px;font-weight:800;letter-spacing:.2px;color:var(--title, inherit)}

      /* ✅ Images en pleine largeur + contenu dessous */
      .menu-help-grid{display:grid;grid-template-columns:1fr;gap:12px;align-items:start}
      .menu-help-media{width:100%;border-radius:14px;overflow:hidden;
        border:1px solid var(--border-soft, rgba(0,0,0,.10));
        background:var(--thumb-bg, rgba(0,0,0,.03));
        margin-bottom:2px}
      .menu-help-img{display:block;width:100%;max-width:100%;height:auto}

      .menu-help-dl{margin:0;display:flex;flex-direction:column;gap:10px}
      .menu-help-row{display:grid;grid-template-columns: 170px 1fr;gap:12px;align-items:start;
        padding:10px 12px;border-radius:12px;
        background:var(--soft-04, var(--hover-bg, rgba(0,0,0,.03)));
        border:1px solid var(--border-soft, rgba(0,0,0,.08))}
      @media (max-width: 520px){.menu-help-row{grid-template-columns:1fr;gap:6px}}
      .menu-help-row dt{margin:0;font-weight:900}
      .menu-help-row dd{margin:0;opacity:.92;line-height:1.45}

      .menu-help-footer{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px 18px;
        border-top:1px solid var(--border-soft, rgba(0,0,0,.10))}
      .menu-help-btn{appearance:none;border:1px solid var(--border-soft, rgba(0,0,0,.10));border-radius:12px;padding:10px 14px;
        font-weight:900;cursor:pointer;background:var(--btn, rgba(0,0,0,.08));color:inherit}
      .menu-help-btn:hover{background:var(--hover-bg, rgba(0,0,0,.12))}

    `;
    document.head.appendChild(style);
  }


  function buildModal() {
    if (document.getElementById(HELP_MODAL_ID)) return;
    injectStyles();

    const overlay = document.createElement("div");
    overlay.id = HELP_MODAL_ID;
    overlay.className = "menu-help-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Aide du menu");

    overlay.innerHTML = `
      <div class="menu-help-card" role="document">
        <div class="menu-help-header">
          <div>
            <div class="menu-help-title">Aide rapide</div>
            <div class="menu-help-subtitle">Présentation des options disponibles sur la page principale.</div>
          </div>
          <button type="button" class="menu-help-close" aria-label="Fermer">✕</button>
        </div>

        <div class="menu-help-body">
          <div class="menu-help-tip">Astuce : cliquez en dehors de la fenêtre ou appuyez sur <kbd>Échap</kbd> pour fermer.</div>

          <section class="menu-help-section">
            <h3 class="menu-help-h3">Barre du haut</h3>
            <div class="menu-help-grid">
              <div class="menu-help-media">
                <img class="menu-help-img" src="img/menu/Menu_barre_haut.png" alt="Barre du haut" loading="lazy">
              </div>
              <dl class="menu-help-dl">
                <div class="menu-help-row"><dt>☰ Hamburger</dt><dd>Ouvre/ferme le menu latéral.</dd></div>
                <div class="menu-help-row"><dt>ⓘ Aide</dt><dd>Affiche cette fenêtre d’aide.</dd></div>
                <div class="menu-help-row"><dt>Total</dt><dd>Nombre total de jeux référencés.</dd></div>
                <div class="menu-help-row"><dt>Vignettes par ligne</dt><dd>Change le nombre de vignettes par ligne.</dd></div>
                <div class="menu-help-row"><dt>Affichage progressif</dt><dd>Nombre de vignettes chargées/affichées (50, 100, tout…).</dd></div>
                <div class="menu-help-row"><dt>Thème</dt><dd>Change l’apparence (clair, sombre, etc.).</dd></div>
              </dl>
            </div>
          </section>

          <section class="menu-help-section">
            <h3 class="menu-help-h3">Recherche & filtres</h3>
            <div class="menu-help-grid">
              <div class="menu-help-media">
                <img class="menu-help-img" src="img/menu/Menu_barre_haut2.png" alt="Recherche et filtres" loading="lazy">
              </div>
              <dl class="menu-help-dl">
                <div class="menu-help-row"><dt>Recherche</dt><dd>Champ « Rechercher un jeu. » pour trouver un jeu.</dd></div>
                <div class="menu-help-row"><dt>Trier</dt><dd>Trie par date de traduction, vues, téléchargements…</dd></div>
                <div class="menu-help-row"><dt>Catégorie</dt><dd>Filtre (VN, Collection…).</dd></div>
                <div class="menu-help-row"><dt>Moteur</dt><dd>Filtre (Ren'Py, RPGM, Unity…).</dd></div>
                <div class="menu-help-row"><dt>Statut</dt><dd>Filtre (Completed, En cours…).</dd></div>
                <div class="menu-help-row"><dt>Tags</dt><dd>Ouvre la liste des tags pour affiner la recherche.</dd></div>
                <div class="menu-help-row"><dt>Rafraîchir</dt><dd>Remet les filtres à zéro et recharge la liste.</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <div class="menu-help-footer">
          <button type="button" class="menu-help-btn">Fermer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.classList.remove("is-open");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".menu-help-close").addEventListener("click", close);
    overlay.querySelector(".menu-help-btn").addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });
  }

  function openModal() {
    buildModal();
    const overlay = document.getElementById(HELP_MODAL_ID);
    overlay.classList.add("is-open");
  }

  function insertHelpButton(nextToEl) {
    if (document.getElementById(HELP_BTN_ID)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = HELP_BTN_ID;
    // Reuse exact same base styles as hamburger to auto-match themes.css
    btn.className = nextToEl.className; // typically "hamburger-btn"
    btn.setAttribute("aria-label", "Aide du menu");
    btn.title = "Aide du menu";
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
  width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="10"></circle>
  <line x1="12" y1="16" x2="12" y2="12"></line>
  <line x1="12" y1="8" x2="12" y2="8"></line>
</svg>`;
    nextToEl.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", openModal);
  }

  function init() {
    const hb = document.getElementById("hamburgerBtn");
    if (hb) return insertHelpButton(hb);

    // If the header/menu is built after load, wait for it
    const obs = new MutationObserver(() => {
      const hb2 = document.getElementById("hamburgerBtn");
      if (hb2) {
        obs.disconnect();
        insertHelpButton(hb2);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
