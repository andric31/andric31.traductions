(() => {
  const GLOBAL_KEY = "__andric31AccountQuickLinks";
  if (window[GLOBAL_KEY]?.loaded) return;
  window[GLOBAL_KEY] = { loaded: true, inserting: false };
  const STATE = window[GLOBAL_KEY];

  const IDS = {
    accountBtn: "quickAccountProfileBtn",
    btn: "quickAccountGamesBtn",
    popover: "quickAccountGamesPopover",
  };

  const URLS = {
    mesJeux: "/compte/mes-jeux.html",
    watchlist: "/compte/mes-jeux.html#watchlist",
    likes: "/compte/mes-jeux.html#likes",
    notes: "/compte/mes-jeux.html#notes",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function iconMesJeux() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 3.5h10a1 1 0 0 1 1 1v16.2l-6-3.9-6 3.9V4.5a1 1 0 0 1 1-1z"/>
      <path d="M9 8.5h6"/>
      <path d="M9 12h3.5"/>
    </svg>`;
  }
  function iconCompte() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M20 21a8 8 0 0 0-16 0"/>
      <circle cx="12" cy="8" r="4"/>
    </svg>`;
  }


  function iconWatchlist() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 3.5h10a1 1 0 0 1 1 1v16.2l-6-3.9-6 3.9V4.5a1 1 0 0 1 1-1z"/>
    </svg>`;
  }

  function iconHeart() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
    </svg>`;
  }

  function iconStar() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="m12 2.8 2.75 5.57 6.15.9-4.45 4.34 1.05 6.12L12 16.84 6.5 19.73l1.05-6.12L3.1 9.27l6.15-.9L12 2.8z"/>
    </svg>`;
  }

  async function getCurrentUser() {
    if (window.SiteAuth?.fetchMe && !window.SiteAuth.loaded) {
      try { await window.SiteAuth.fetchMe(); } catch {}
    }
    return window.SiteAuth?.me || null;
  }

  async function fetchCount(url) {
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !Array.isArray(data.items)) return 0;
      return data.items.length;
    } catch {
      return 0;
    }
  }

  async function loadCounts() {
    const [watchlist, likes, notes] = await Promise.all([
      fetchCount("/api/watchlist?limit=500"),
      fetchCount("/api/user-game-state?list=liked&limit=500"),
      fetchCount("/api/user-game-state?list=rated&limit=500"),
    ]);
    return { watchlist, likes, notes };
  }

  function getAccountName(me) {
    return me?.display_name || me?.pseudo || me?.username || me?.email || "Mon compte";
  }

  function makeAccountButton(refClass, me) {
    const name = getAccountName(me);
    const link = document.createElement("a");
    link.id = IDS.accountBtn;
    link.href = "/compte/";
    link.className = `${refClass} header-icon-link header-icon-link--quick account-profile-btn`;
    link.setAttribute("aria-label", `Mon compte - ${name}`);
    link.setAttribute("title", `Mon compte - ${name}`);
    link.innerHTML = `<span class="header-icon-svg">${iconCompte()}</span><span class="account-profile-name">${escapeHtml(name)}</span>`;
    return link;
  }

  function makeButton(refClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = IDS.btn;
    btn.className = `${refClass} header-icon-link header-icon-link--quick account-quick-btn`;
    btn.setAttribute("aria-label", "Mes jeux");
    btn.setAttribute("title", "Mes jeux");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span class="header-icon-svg">${iconMesJeux()}</span>`;
    return btn;
  }

  function renderPopover(pop, me, counts) {
    const pseudo = me?.pseudo || me?.username || me?.email || "compte connecté";
    pop.innerHTML = `
      <div class="account-quick-head">
        <strong>Mes jeux</strong>
        <small>${escapeHtml(pseudo)}</small>
      </div>
      <div class="account-quick-list">
        <a class="account-quick-item" href="${URLS.watchlist}" target="_blank" rel="noopener">
          <span class="account-quick-icon account-quick-icon--watch">${iconWatchlist()}</span>
          <span><strong>Watchlist</strong><small>Jeux à suivre</small></span>
          <b>${counts.watchlist}</b>
        </a>
        <a class="account-quick-item" href="${URLS.likes}" target="_blank" rel="noopener">
          <span class="account-quick-icon account-quick-icon--like">${iconHeart()}</span>
          <span><strong>Jeux likés</strong><small>Tes favoris</small></span>
          <b>${counts.likes}</b>
        </a>
        <a class="account-quick-item" href="${URLS.notes}" target="_blank" rel="noopener">
          <span class="account-quick-icon account-quick-icon--note">${iconStar()}</span>
          <span><strong>Jeux notés</strong><small>Tes notes</small></span>
          <b>${counts.notes}</b>
        </a>
      </div>
      <a class="account-quick-open" href="${URLS.mesJeux}" target="_blank" rel="noopener">Ouvrir la page Mes jeux <span aria-hidden="true">→</span></a>
    `;
  }

  function createPopover() {
    let pop = document.getElementById(IDS.popover);
    if (pop) return pop;
    pop = document.createElement("div");
    pop.id = IDS.popover;
    pop.className = "account-quick-popover hidden";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Raccourcis de mon compte");
    pop.innerHTML = `<div class="account-quick-loading">Chargement…</div>`;
    document.body.appendChild(pop);
    return pop;
  }

  function placePopover(anchor, pop) {
    if (!anchor || !pop || pop.classList.contains("hidden")) return;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 10;
    const left = rect.right + window.scrollX - pop.offsetWidth;
    pop.style.top = `${Math.max(12, top)}px`;
    pop.style.left = `${Math.max(12, left)}px`;
  }

  function closePopover() {
    const btn = document.getElementById(IDS.btn);
    const pop = document.getElementById(IDS.popover);
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (pop) pop.classList.add("hidden");
  }

  async function openPopover(btn, me) {
    const pop = createPopover();
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    pop.innerHTML = `<div class="account-quick-loading">Chargement…</div>`;
    placePopover(btn, pop);
    const counts = await loadCounts();
    renderPopover(pop, me, counts);
    placePopover(btn, pop);
  }

  function injectStyles() {
    if (document.getElementById("accountQuickLinksStyles")) return;
    const style = document.createElement("style");
    style.id = "accountQuickLinksStyles";
    style.textContent = `
      .account-profile-btn{width:auto;max-width:min(190px,34vw);gap:7px;padding-inline:10px;}
      .account-profile-btn .header-icon-svg{flex:0 0 auto;}
      .account-profile-name{display:block;min-width:0;max-width:135px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:800;line-height:1;color:var(--title);}
      .account-quick-popover{position:absolute;z-index:10060;width:min(320px,calc(100vw - 24px));border-radius:18px;border:1px solid var(--border);background:color-mix(in srgb,var(--card) 92%, transparent);box-shadow:0 18px 48px rgba(0,0,0,.28);backdrop-filter:blur(14px);overflow:hidden;}
      .account-quick-loading{padding:14px 16px;color:var(--muted);}
      .account-quick-head{padding:14px 16px 10px;display:flex;flex-direction:column;gap:3px;color:var(--title);}
      .account-quick-head strong{font-size:15px;}
      .account-quick-head small{color:var(--muted);font-size:12px;}
      .account-quick-list{display:grid;gap:8px;padding:0 12px 12px;}
      .account-quick-item{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:10px;padding:10px;border-radius:14px;border:1px solid var(--border);background:color-mix(in srgb,var(--card) 88%, transparent);color:var(--fg);text-decoration:none;}
      .account-quick-item:hover{border-color:color-mix(in srgb,var(--primary) 42%, var(--border));box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 18%, transparent);text-decoration:none;}
      .account-quick-icon{width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--primary) 14%, transparent);color:var(--primary);}
      .account-quick-icon svg{width:19px;height:19px;stroke:currentColor;fill:none;}
      .account-quick-icon--watch{color:#ff7a00;background:color-mix(in srgb,#ff7a00 16%, transparent);}
      .account-quick-icon--like{color:#ff4d7d;background:color-mix(in srgb,#ff4d7d 14%, transparent);}
      .account-quick-icon--note{color:#ffc247;background:color-mix(in srgb,#ffc247 14%, transparent);}
      .account-quick-item span:nth-child(2){display:flex;flex-direction:column;gap:2px;min-width:0;}
      .account-quick-item strong{font-size:14px;color:var(--title);}
      .account-quick-item small{font-size:12px;color:var(--muted);}
      .account-quick-item b{min-width:28px;height:26px;padding:0 8px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--primary) 13%, transparent);color:var(--title);font-size:13px;}
      .account-quick-open{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--border);color:var(--primary);text-decoration:none;font-weight:700;font-size:13px;}
      .account-quick-open:hover{text-decoration:none;background:color-mix(in srgb,var(--primary) 9%, transparent);}
    `;
    document.head.appendChild(style);
  }

  async function insertButton() {
    const existingButtons = Array.from(document.querySelectorAll(`#${IDS.btn}`));
    const existingAccountButtons = Array.from(document.querySelectorAll(`#${IDS.accountBtn}`));
    if (existingButtons.length && existingAccountButtons.length) {
      existingButtons.slice(1).forEach((el) => el.remove());
      existingAccountButtons.slice(1).forEach((el) => el.remove());
      return;
    }
    if (STATE.inserting) return;
    STATE.inserting = true;

    try {
      const me = await getCurrentUser();
      if (!me) return;

      const existingAfterAuth = Array.from(document.querySelectorAll(`#${IDS.btn}`));
      const existingAccountAfterAuth = Array.from(document.querySelectorAll(`#${IDS.accountBtn}`));
      if (existingAfterAuth.length && existingAccountAfterAuth.length) {
        existingAfterAuth.slice(1).forEach((el) => el.remove());
        existingAccountAfterAuth.slice(1).forEach((el) => el.remove());
        return;
      }

      const afterEl = document.getElementById("quickNotificationsBtn")
        || document.getElementById("quickMessagesBtn")
        || document.getElementById("menuHelpBtn")
        || document.getElementById("hamburgerBtn");
      if (!afterEl) return;

      const refClass = afterEl.className || "hamburger-btn";
      const accountBtn = makeAccountButton(refClass, me);
      const btn = makeButton(refClass);
      afterEl.insertAdjacentElement("afterend", accountBtn);
      accountBtn.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pop = createPopover();
      if (pop.classList.contains("hidden")) await openPopover(btn, me);
      else closePopover();
    });

    document.addEventListener("click", (event) => {
      const pop = document.getElementById(IDS.popover);
      if (!pop || pop.classList.contains("hidden")) return;
      if (pop.contains(event.target) || btn.contains(event.target)) return;
      closePopover();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePopover();
    });

      window.addEventListener("resize", () => placePopover(btn, document.getElementById(IDS.popover)), { passive: true });
      window.addEventListener("scroll", () => placePopover(btn, document.getElementById(IDS.popover)), { passive: true });
    } finally {
      STATE.inserting = false;
    }
  }

  function init() {
    injectStyles();
    insertButton();

    const obs = new MutationObserver(() => {
      if (!document.getElementById(IDS.btn) || !document.getElementById(IDS.accountBtn)) insertButton();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => obs.disconnect(), 15000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
