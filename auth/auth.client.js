(() => {
  'use strict';

  const state = {
    me: null,
    loaded: false,
  };

  function api(path, options = {}) {
    return fetch(path, {
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  }

  async function fetchMe() {
    try {
      const resp = await api('/api/auth-me');
      const data = await resp.json();
      state.me = data && data.logged_in ? data.user : null;
    } catch {
      state.me = null;
    }
    state.loaded = true;
    applyAuthDom();
    notify();
    return state.me;
  }

  function roleLevel(role) {
    return ({ member: 1, translator: 2, admin: 3 }[String(role || 'member')] || 0);
  }

  function applyAuthDom() {
    const me = state.me;
    document.querySelectorAll('[data-auth-only]').forEach((el) => {
      el.classList.toggle('auth-hidden', !me);
    });
    document.querySelectorAll('[data-guest-only]').forEach((el) => {
      el.classList.toggle('auth-hidden', !!me);
    });
    document.querySelectorAll('[data-role-min]').forEach((el) => {
      const need = String(el.getAttribute('data-role-min') || 'member');
      const ok = me && roleLevel(me.role) >= roleLevel(need);
      el.classList.toggle('auth-hidden', !ok);
    });
    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = me ? (me.display_name || me.username || '') : '';
    });
    document.querySelectorAll('[data-auth-role]').forEach((el) => {
      el.textContent = me ? (me.role || '') : '';
    });
  }

  const listeners = new Set();
  function notify() {
    for (const fn of listeners) {
      try { fn(state.me); } catch {}
    }
  }

  async function login(username, password) {
    const resp = await api('/api/auth-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Connexion impossible.');
    state.me = data.user || null;
    state.loaded = true;
    applyAuthDom();
    notify();
    return data;
  }

  async function logout() {
    const resp = await api('/api/auth-logout', { method: 'POST', body: '{}' });
    let data = null;
    try { data = await resp.json(); } catch {}
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Déconnexion impossible.');
    state.me = null;
    state.loaded = true;
    applyAuthDom();
    notify();
    return data;
  }


  async function adminListUsers() {
    const resp = await api('/api/auth-admin-users');
    const data = await resp.json();
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Chargement impossible.');
    return data;
  }

  async function adminUpdateUser(payload) {
    const resp = await api('/api/auth-admin-update-user', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Modification impossible.');
    return data;
  }

  async function adminDeleteUser(id) {
    const resp = await api('/api/auth-admin-delete-user', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Suppression impossible.');
    return data;
  }

  async function createUserAdmin(payload, token) {
    const resp = await api('/api/auth-admin-create-user', {
      method: 'POST',
      headers: { 'x-admin-token': token || '' },
      body: JSON.stringify(payload || {}),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Création impossible.');
    return data;
  }

  function bindMenuIntegration() {
    if (!window.ViewerMenu?.addItem) return;
    if (window.__authMenuAdded) return;
    window.__authMenuAdded = true;

    const redraw = (me) => {
      if (!window.ViewerMenu?.clearItems) return;
      const preserved = [];
      if (window.__viewerMenuAuthRedrawLock) return;
      window.__viewerMenuAuthRedrawLock = true;
      try {
        const items = window.ViewerMenu.__getItems?.() || [];
        for (const it of items) {
          if (it?.__authManaged) continue;
          preserved.push(it);
        }
        window.ViewerMenu.clearItems();
        for (const it of preserved) {
          if (it?.type === 'divider') window.ViewerMenu.addDivider();
          else window.ViewerMenu.addItem(it.label, it.onClick);
        }
        window.ViewerMenu.addDivider();
        if (me) {
          const label = `👤 Mon compte — ${me.display_name || me.username}`;
          const logoutLabel = '🔓 Se déconnecter';
          const lastIdx = preserved.length;
          const itemsNow = window.ViewerMenu.__getItems?.();
          if (itemsNow?.[lastIdx]) itemsNow[lastIdx].__authManaged = true;
          window.ViewerMenu.addItem(label, () => { location.href = '/compte/'; });
          const items1 = window.ViewerMenu.__getItems?.();
          if (items1?.[items1.length - 1]) items1[items1.length - 1].__authManaged = true;
          window.ViewerMenu.addItem(logoutLabel, async () => {
            try { await logout(); } catch (e) { alert(e.message || 'Erreur.'); }
          });
          const items2 = window.ViewerMenu.__getItems?.();
          if (items2?.[items2.length - 1]) items2[items2.length - 1].__authManaged = true;
        } else {
          window.ViewerMenu.addItem('🔐 Se connecter', () => { location.href = '/compte/'; });
          const items1 = window.ViewerMenu.__getItems?.();
          if (items1?.[items1.length - 1]) items1[items1.length - 1].__authManaged = true;
        }
      } catch {}
      window.__viewerMenuAuthRedrawLock = false;
    };

    onChange(redraw);
    redraw(state.me);
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
  }

  window.SiteAuth = {
    get me() { return state.me; },
    get loaded() { return state.loaded; },
    fetchMe,
    login,
    logout,
    onChange,
    applyAuthDom,
    createUserAdmin,
    adminListUsers,
    adminUpdateUser,
    adminDeleteUser,
    bindMenuIntegration,
  };

  document.addEventListener('DOMContentLoaded', () => {
    fetchMe().finally(() => bindMenuIntegration());
  });
})();
