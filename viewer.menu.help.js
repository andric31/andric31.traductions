// viewer.menu.help.js — bouton d'aide (?) collé au hamburger (page principale uniquement)
(() => {
  "use strict";

  function el(tag, attrs = {}, html = "") {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, String(v));
    }
    if (html) n.innerHTML = html;
    return n;
  }

  function buildPanel() {
    let panel = document.getElementById("menuHelpPanel");
    if (panel) return panel;

    panel = el("div", { id: "menuHelpPanel", class: "menu-help-backdrop hidden", role: "dialog", "aria-modal": "true" });
    panel.appendChild(el("div", { class: "menu-help-card", role: "document" }, `
      <div class="menu-help-head">
        <div class="menu-help-title">Présentation des différentes options du menu.</div>
        <button type="button" class="menu-help-close" aria-label="Fermer">✕</button>
      </div>

      <div class="menu-help-body">
        <img src="img/menu/Menu_barre_haut.png" alt="Menu barre haut" loading="lazy">
        <ul>
          <li>Hamburger pour ouvrir le menu</li>
          <li>icon d'aide du menu</li>
          <li>Total du nombre de jeux réferencer</li>
          <li>affiche du nombre de vignette par ligne</li>
          <li>affichage du nombre de vignette simultanément</li>
          <li>Theme pour customiser l'apparence</li>
        </ul>

        <img src="img/menu/Menu_barre_haut2.png" alt="Menu barre haut 2" loading="lazy">
        <ul>
          <li>Barre de recherche de jeu</li>
          <li>Tris des trdauction par date, vue, telechargement...</li>
          <li>Catégorie</li>
          <li>Moteur</li>
          <li>statut</li>
          <li>tags</li>
          <li>remise a 0 des choix de recherche</li>
        </ul>
      </div>

      <div class="menu-help-foot">
        <button type="button" class="menu-help-btn-close">Fermer</button>
      </div>
    `));

    document.body.appendChild(panel);

    const close = () => panel.classList.add("hidden");
    panel.addEventListener("click", (e) => {
      if (e.target === panel) close();
    });
    panel.querySelector(".menu-help-close")?.addEventListener("click", close);
    panel.querySelector(".menu-help-btn-close")?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    return panel;
  }

  function openPanel() {
    const panel = buildPanel();
    panel.classList.remove("hidden");
  }

  function injectHelpButton() {
    if (document.getElementById("menuHelpBtn")) return true;

    const ham = document.getElementById("hamburgerBtn");
    if (!ham) return false;

    const btn = el("button", {
      type: "button",
      id: "menuHelpBtn",
      class: "menu-help-btn",
      title: "Aide du menu",
      "aria-label": "Aide du menu"
    }, "?");

    // Place juste après le hamburger, dans la même ligne
    ham.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });

    return true;
  }

  function waitAndInject() {
    // hamburgerBtn est injecté par viewer.js, parfois après DOMContentLoaded.
    if (injectHelpButton()) return;

    const obs = new MutationObserver(() => {
      if (injectHelpButton()) obs.disconnect();
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Sécurité : stop après 5s
    setTimeout(() => obs.disconnect(), 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitAndInject);
  } else {
    waitAndInject();
  }
})();