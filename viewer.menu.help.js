(() => {
  const HELP_BTN_ID = "menuHelpBtn";
  const HELP_MODAL_ID = "menuHelpModal";

  function buildModal() {
    if (document.getElementById(HELP_MODAL_ID)) return;

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
    
    // Match the hamburger size precisely (prevents any deformation across themes)
    try {
      const r = nextToEl.getBoundingClientRect();
      const w = Math.round(r.width || r.height || 32);
      const h = Math.round(r.height || r.width || 32);
      const s = Math.max(28, Math.min(w, h));
      btn.style.width = s + "px";
      btn.style.height = s + "px";
      btn.style.minWidth = s + "px";
      btn.style.minHeight = s + "px";
      btn.style.borderRadius = "9999px";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.padding = "0";
      btn.style.lineHeight = "0";
    } catch(e) {}
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
