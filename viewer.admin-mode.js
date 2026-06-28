// viewer.admin-mode.js — Option admin sans incrémenter les compteurs
(() => {
  "use strict";

  const STORAGE_KEY = "andric31AdminViewerMode";
  const ROLE = "admin";

  const state = {
    isAdmin: false,
    enabled: false,
  };

  function getStoredEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; }
    catch { return false; }
  }

  function setStoredEnabled(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function isAdminUser(me) {
    return String(me?.role || "").trim().toLowerCase() === ROLE;
  }

  function refreshFromAuth(me) {
    state.isAdmin = isAdminUser(me);
    state.enabled = getStoredEnabled();

    // Si un compte non-admin avait gardé l'ancien stockage, on le nettoie.
    // Important : counterUrl peut quand même ajouter adminView avant que l'auth soit prête ;
    // l'API vérifie le rôle admin et ignore le paramètre si besoin.
    if (me && !state.isAdmin) {
      state.enabled = false;
      setStoredEnabled(false);
    }
  }

  async function waitForAuthReady() {
    if (!window.SiteAuth) return null;
    if (window.SiteAuth.loaded) return window.SiteAuth.me || null;
    return new Promise((resolve) => {
      let done = false;
      let off = null;
      const finish = (me) => {
        if (done) return;
        done = true;
        try { off?.(); } catch {}
        resolve(me || window.SiteAuth?.me || null);
      };
      off = window.SiteAuth.onChange?.((me) => finish(me));
      setTimeout(() => finish(window.SiteAuth?.me || null), 2500);
    });
  }

  window.AdminViewerMode = {
    storageKey: STORAGE_KEY,
    isActive() { return getStoredEnabled(); },
    isAdmin() { return !!state.isAdmin; },
    setEnabled(value) {
      setStoredEnabled(!!value);
      state.enabled = getStoredEnabled();
      try { window.dispatchEvent(new CustomEvent("admin-viewer-mode-change", { detail: { enabled: state.enabled } })); } catch {}
    },
    counterUrl(url) {
      // On se base sur le stockage tout de suite pour éviter que la page jeu compte
      // avant que SiteAuth ait fini de charger. La sécurité reste côté API.
      if (!getStoredEnabled()) return url;
      try {
        const u = new URL(url, location.origin);
        const op = String(u.searchParams.get("op") || "").toLowerCase();
        const kind = String(u.searchParams.get("kind") || "").toLowerCase();
        if (op === "hit" && (kind === "view" || kind === "mega")) {
          u.searchParams.set("adminView", "1");
        }
        return u.pathname + u.search + u.hash;
      } catch {
        return url;
      }
    },
  };

  document.addEventListener("DOMContentLoaded", async () => {
    refreshFromAuth(await waitForAuthReady());
    try { window.SiteAuth?.onChange?.((me) => refreshFromAuth(me)); } catch {}
  });
})();
