// viewer.menu.help.js — bouton d'aide (?) à droite du hamburger (page principale uniquement)
(() => {
  "use strict";

  function el(tag, attrs = {}, html = "") {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, String(v));
    }
    if (html) n.innerHTML = html;
    return n;
  }

  function ensureHelpDom() {
    if (document.getElementById("menuHelpBtn")) return;

    const topRow = document.querySelector(".top-title-row");
    const burger = document.getElementById("hamburgerBtn");
    if (!topRow || !burger) return;

    // Bouton ?
    const btn = el("button", {
      id: "menuHelpBtn",
      type: "button",
      class: "menu-help-btn",
      title: "Aide du menu",
      "aria-label": "Aide du menu",
      "aria-haspopup": "dialog",
      "aria-expanded": "false"
    }, "?");

    // Insert juste après le hamburger
    burger.insertAdjacentElement("afterend", btn);

    // Overlay / popover
    const overlay = el("div", { id: "menuHelpOverlay", class: "menu-help-overlay hidden", role: "dialog", "aria-modal": "true" });
    overlay.innerHTML = `
      <div class="menu-help-card" role="document">
        <div class="menu-help-head">
          <h2>Présentation des différentes options du menu.</h2>
          <button type="button" id="menuHelpCloseX" class="menu-help-close" aria-label="Fermer">✕</button>
        </div>

        <div class="menu-help-body">
          <figure class="menu-help-figure">
            <img src="img/menu/Menu_barre_haut.png" alt="Menu barre haut (1)">
            <figcaption>
              <ul>
                <li>Hamburger pour ouvrir le menu</li>
                <li>icon d'aide du menu</li>
                <li>Total du nombre de jeux réferencer</li>
                <li>affiche du nombre de vignette par ligne</li>
                <li>affichage du nombre de vignette simultanément</li>
                <li>Theme pour customiser l'apparence</li>
              </ul>
            </figcaption>
          </figure>

          <figure class="menu-help-figure">
            <img src="img/menu/Menu_barre_haut2.png" alt="Menu barre haut (2)">
            <figcaption>
              <ul>
                <li>Barre de recherche de jeu</li>
                <li>Tris des trdauction par date, vue, telechargement...</li>
                <li>Catégorie</li>
                <li>Moteur</li>
                <li>statut</li>
                <li>tags</li>
                <li>remise a 0 des choix de recherche</li>
              </ul>
            </figcaption>
          </figure>
        </div>

        <div class="menu-help-foot">
          <button type="button" id="menuHelpCloseBtn" class="menu-help-ok">Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    };
    const open = () => {
      overlay.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      // focus close button for accessibility
      (document.getElementById("menuHelpCloseBtn") || document.getElementById("menuHelpCloseX"))?.focus?.();
    };

    btn.addEventListener("click", () => {
      if (overlay.classList.contains("hidden")) open();
      else close();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById("menuHelpCloseBtn")?.addEventListener("click", close);
    document.getElementById("menuHelpCloseX")?.addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
    });
  }

  // Attendre que viewer.js ait injecté le hamburger
  function waitForBurger() {
    ensureHelpDom();
    if (document.getElementById("menuHelpBtn")) return;
    // réessaye un court moment
    const start = Date.now();
    const t = setInterval(() => {
      ensureHelpDom();
      if (document.getElementById("menuHelpBtn") || Date.now() - start > 5000) clearInterval(t);
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForBurger);
  } else {
    waitForBurger();
  }
})();
