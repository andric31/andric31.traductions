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
          <div class="menu-help-title">Présentation des différentes options du menu.</div>
          <button type="button" class="menu-help-close" aria-label="Fermer">✕</button>
        </div>

        <div class="menu-help-body">
          <img class="menu-help-img" src="img/menu/Menu_barre_haut.png" alt="Menu barre haut" loading="lazy">
          <ul class="menu-help-list">
            <li>Hamburger pour ouvrir le menu</li>
            <li>icon d'aide du menu</li>
            <li>Total du nombre de jeux réferencer</li>
            <li>affiche du nombre de vignette par ligne</li>
            <li>affichage du nombre de vignette simultanément</li>
            <li>Theme pour customiser l'apparence</li>
          </ul>

          <img class="menu-help-img" src="img/menu/Menu_barre_haut2.png" alt="Menu barre haut 2" loading="lazy">
          <ul class="menu-help-list">
            <li>Barre de recherche de jeu</li>
            <li>Tris des trdauction par date, vue, telechargement...</li>
            <li>Catégorie</li>
            <li>Moteur</li>
            <li>statut</li>
            <li>tags</li>
            <li>remise a 0 des choix de recherche</li>
          </ul>
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
