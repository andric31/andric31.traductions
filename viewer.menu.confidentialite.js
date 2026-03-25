// viewer.menu.confidentialite.js — Fenêtre confidentialité
(() => {
  "use strict";

  const PRIVACY_HTML = `
    <div class="aboutText">
      <p><strong>Confidentialité</strong></p>
      <p>
        Ce site peut mémoriser certaines préférences sur votre appareil, par exemple la validation de l'âge,
        le thème, l'affichage et certains réglages du viewer.
      </p>
      <p>
        Si vous êtes connecté, votre session de compte est également utilisée pour accéder aux fonctions réservées.
      </p>
      <p>
        Vous pouvez effacer les données locales du site depuis votre navigateur si vous le souhaitez.
      </p>
    </div>
  `;

  function ensureDom() {
    let overlay = document.getElementById("privacyOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "privacyOverlay";
      overlay.className = "modal-overlay hidden";
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="privacyTitle">
          <div class="modal-head">
            <div class="modal-title" id="privacyTitle">Confidentialité</div>
            <button type="button" class="modal-close" id="privacyClose" aria-label="Fermer">✕</button>
          </div>
          <div class="modal-body" id="privacyBody"></div>
          <div class="modal-foot">
            <button type="button" class="modal-btn" id="privacyOk">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById("privacyClose")?.addEventListener("click", close);
      document.getElementById("privacyOk")?.addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target && e.target.id === "privacyOverlay") close();
      });
    }
  }

  function open() {
    ensureDom();
    const body = document.getElementById("privacyBody");
    if (body) body.innerHTML = PRIVACY_HTML;
    document.getElementById("privacyOverlay")?.classList.remove("hidden");
  }

  function close() {
    document.getElementById("privacyOverlay")?.classList.add("hidden");
  }

  window.ViewerMenuConfidentialite = { open, close };
})();
