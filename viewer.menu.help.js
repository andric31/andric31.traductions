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

      
      .mh-subpanel{
        margin:2px 0 8px 42px;
        padding:10px 14px;
        border-radius:10px;
        background:rgba(255,255,255,0.04);
        border:1px solid rgba(255,255,255,0.06);
      }
      .mh-subitem{
        margin:4px 0;
      }

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

      /* ✅ Lignes: icône | titre (plus large) | description */
      .menu-help-row{
        display:grid;
        grid-template-columns: 18px 210px 1fr; /* <- élargit la colonne titre */
        gap:16px;
        align-items:center;
        padding:10px 12px;border-radius:12px;
        background:var(--soft-04, var(--hover-bg, rgba(0,0,0,.03)));
        border:1px solid var(--border-soft, rgba(0,0,0,.08))
      }

      /* dt devient "transparent" pour placer icône + titre dans la grid */
      .menu-help-row dt{margin:0;font-weight:900;display:contents}
      .menu-help-row dd{margin:0;opacity:.92;line-height:1.45;grid-column:3}

      .menu-help-row .mh-ico{
        display:inline-flex;align-items:center;justify-content:center;
        width:18px;height:18px;flex:0 0 18px;
        color:var(--muted, currentColor);opacity:.95;
        grid-column:1
      }
      .menu-help-row .mh-ico svg{width:18px;height:18px;display:block;stroke:currentColor;fill:none}

      /* Le 2e span dans dt = titre -> colonne 2 + pas de wrap */
      .menu-help-row dt span:last-child{
        grid-column:2;
        white-space:nowrap;
      }

      /* ✅ Mobile: icône + titre sur la 1ère ligne, description dessous */
      @media (max-width: 520px){
        .menu-help-row{
          grid-template-columns: 18px 1fr;
          row-gap:6px;
          align-items:start;
        }
        .menu-help-row dd{grid-column:1 / -1}
      }

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
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></span><span>Hamburger</span></dt><dd>Ouvre/ferme le menu latéral.</dd></div>
                <div class="menu-help-subpanel">
                  <div class="mh-subpanel">
                    <div class="mh-subitem">ℹ️ <strong>À propos</strong> — Informations de contact.</div>
                    <div class="mh-subitem">🧩 <strong>Extension</strong> — Description de l’extension.</div>
                  </div>
                </div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="8"/></svg></span><span>Aide</span></dt><dd>Affiche cette fenêtre d’aide.</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><path d="M8 4v16"/></svg></span><span>Total</span></dt><dd>Nombre total de jeux référencés.</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg></span><span>Vignettes par ligne</span></dt><dd>Change le nombre de vignettes par ligne.</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg></span><span>Affichage progressif</span></dt><dd>Nombre de vignettes chargées/affichées (50, 100, tout…).</dd></div>
              
                <!-- ✅ Thème: icône palette Lucide propre -->
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg></span><span>Thème</span></dt><dd>Change l’apparence (clair, sombre, etc.).</dd></div>
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
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><span>Recherche</span></dt><dd>Champ « Rechercher un jeu. » pour trouver un jeu.</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="M3 7l3-3 3 3"/><path d="M6 4v16"/><path d="M3 17l3 3 3-3"/></svg></span><span>Trier</span></dt><dd>Trie par date de traduction, vues, téléchargements…</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 7h18"/><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><rect x="4" y="7" width="16" height="14" rx="2"/></svg></span><span>Catégorie</span></dt><dd>Filtre (VN, Collection…).</dd></div>
              
                <!-- ✅ Moteur: icône corrigée -->
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6" rx="1"></rect><line x1="9" y1="2" x2="9" y2="4"></line><line x1="15" y1="2" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="22"></line><line x1="15" y1="20" x2="15" y2="22"></line><line x1="20" y1="9" x2="22" y2="9"></line><line x1="20" y1="15" x2="22" y2="15"></line><line x1="2" y1="9" x2="4" y2="9"></line><line x1="2" y1="15" x2="4" y2="15"></line></svg></span><span>Moteur</span></dt><dd>Filtre (Ren'Py, RPGM, Unity…).</dd></div>
              
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M8 12l2.5 2.5L16 9"/></svg></span><span>Statut</span></dt><dd>Filtre (Completed, En cours…).</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 10V4H14L4 14l6 6 10-10z"/><circle cx="16" cy="8" r="1"/></svg></span><span>Tags</span></dt><dd>Ouvre la liste des tags pour affiner la recherche.</dd></div>
                <div class="menu-help-row"><dt><span class="mh-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg></span><span>Rafraîchir</span></dt><dd>Remet les filtres à zéro et recharge la liste.</dd></div>
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