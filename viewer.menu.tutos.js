// viewer.menu.tutos.js — Entrée menu : Tutos & Aide (+ séparateur)
(() => {
  "use strict";

  function open() {
    window.open(
      "https://andric31-traductions.pages.dev/tutos/",
      "_blank",
      "noopener"
    );
  }

  function register() {
    if (!window.ViewerMenu?.addItem) return false;

    // ✅ Séparation visuelle avant la section Tutos
    if (typeof window.ViewerMenu.addDivider === "function") {
      window.ViewerMenu.addDivider();
    } else {
      // fallback si jamais addDivider n'existe pas
      window.ViewerMenu.addItem("────────────", () => {});
    }

    window.ViewerMenu.addItem("🛠️ Tutos & Aide", open);
    return true;
  }

  const t = setInterval(() => {
    if (register()) clearInterval(t);
  }, 50);
})();
