// viewer.menu.tutos.js — Entrée menu : Tutos & Aide
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
    window.ViewerMenu.addItem("🛠️ Tutos & Aide", open);
    return true;
  }

  const t = setInterval(() => {
    if (register()) clearInterval(t);
  }, 50);
})();