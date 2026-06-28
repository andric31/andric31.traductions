// viewer.admin-mode.js — Vue admin sans incrémenter les compteurs
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

  function applyBodyClass() {
    document.documentElement.classList.toggle("admin-viewer-mode", !!(state.isAdmin && state.enabled));
  }

  function ensureStyle() {
    if (document.getElementById("adminViewerModeStyle")) return;
    const style = document.createElement("style");
    style.id = "adminViewerModeStyle";
    style.textContent = `
      .admin-viewer-toggle{
        position:fixed;
        right:16px;
        bottom:16px;
        z-index:99999;
        display:none;
        align-items:center;
        gap:8px;
        border:1px solid rgba(255,255,255,.18);
        border-radius:999px;
        padding:10px 14px;
        color:#fff;
        background:rgba(15,23,42,.88);
        box-shadow:0 14px 35px rgba(0,0,0,.35);
        backdrop-filter:blur(10px);
        cursor:pointer;
        font:700 13px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }
      .admin-viewer-toggle:hover{ transform:translateY(-1px); }
      .admin-viewer-toggle.is-visible{ display:inline-flex; }
      .admin-viewer-toggle.is-on{
        border-color:rgba(74,222,128,.55);
        background:rgba(20,83,45,.92);
      }
      .admin-viewer-dot{
        width:9px;
        height:9px;
        border-radius:999px;
        background:#94a3b8;
        box-shadow:0 0 0 3px rgba(148,163,184,.18);
      }
      .admin-viewer-toggle.is-on .admin-viewer-dot{
        background:#4ade80;
        box-shadow:0 0 0 3px rgba(74,222,128,.22);
      }
      .admin-viewer-mode::after{
        content:"Vue admin : compteurs désactivés";
        position:fixed;
        left:50%;
        bottom:18px;
        transform:translateX(-50%);
        z-index:99998;
        padding:8px 12px;
        border-radius:999px;
        background:rgba(20,83,45,.88);
        color:#fff;
        font:700 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        box-shadow:0 10px 25px rgba(0,0,0,.25);
        pointer-events:none;
      }
      @media (max-width:640px){
        .admin-viewer-toggle{ right:10px; bottom:10px; padding:9px 12px; }
        .admin-viewer-mode::after{ display:none; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    ensureStyle();
    let btn = document.getElementById("adminViewerModeToggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "adminViewerModeToggle";
      btn.className = "admin-viewer-toggle";
      btn.setAttribute("aria-live", "polite");
      btn.addEventListener("click", () => {
        if (!state.isAdmin) return;
        state.enabled = !state.enabled;
        setStoredEnabled(state.enabled);
        renderButton();
        applyBodyClass();
        try { window.dispatchEvent(new CustomEvent("admin-viewer-mode-change", { detail: { enabled: state.enabled } })); } catch {}
      });
      document.body.appendChild(btn);
    }
    return btn;
  }

  function renderButton() {
    const btn = ensureButton();
    btn.classList.toggle("is-visible", !!state.isAdmin);
    btn.classList.toggle("is-on", !!(state.isAdmin && state.enabled));
    btn.innerHTML = `<span class="admin-viewer-dot" aria-hidden="true"></span><span>${state.enabled ? "Vue admin ON" : "Vue admin OFF"}</span>`;
    btn.title = state.enabled
      ? "Mode normal : les vues et téléchargements seront comptés"
      : "Vue admin : les vues et téléchargements ne seront pas comptés";
  }

  function refreshFromAuth(me) {
    state.isAdmin = isAdminUser(me);
    state.enabled = state.isAdmin ? getStoredEnabled() : false;
    if (!state.isAdmin) setStoredEnabled(false);
    renderButton();
    applyBodyClass();
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
    isActive() { return !!(state.isAdmin && state.enabled); },
    isAdmin() { return !!state.isAdmin; },
    counterUrl(url) {
      if (!this.isActive()) return url;
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
    ensureButton();
    refreshFromAuth(await waitForAuthReady());
    try { window.SiteAuth?.onChange?.((me) => refreshFromAuth(me)); } catch {}
  });
})();
