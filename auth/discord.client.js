(() => {
  'use strict';
  const mounts = [...document.querySelectorAll('[data-discord-mode]')];
  if (!mounts.length) return;
  const draftKey = 'ticket-discord-draft-v1';
  const draftFields = ['ticketName', 'ticketPriority', 'ticketTitle', 'ticketMessage'];
  const resultMessages = {
    linked: 'Ton compte Discord est maintenant lié. Tu peux aussi l’utiliser pour te connecter au site.',
    verified: 'Compte Discord vérifié. Termine le formulaire pour envoyer ta demande à un administrateur.',
    logged_in: 'Connexion avec Discord réussie.',
    cancelled: 'Autorisation Discord annulée. Tu peux réessayer.',
    expired: 'Cette tentative a expiré ou a déjà été utilisée. Recommence avec le bouton Discord.',
    session_changed: 'Ta session a changé. Reconnecte-toi au site puis recommence.',
    already_linked: 'Ce compte Discord ou ce compte du site possède déjà une liaison.',
    not_linked: 'Aucun compte du site n’est encore lié à ce Discord. Connecte-toi avec ton mot de passe pour le lier, ou attends la validation de ton ticket.',
    inactive: 'Ce compte du site est désactivé. Contacte un administrateur.',
    unavailable: 'La connexion à Discord a échoué. Réessaie ou contacte un administrateur.',
  };
  let signup = null;
  const params = new URLSearchParams(location.search);
  let result = params.get('discord_result') || '';
  if (result) {
    if (document.getElementById('ticketForm')) {
      try {
        const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
        if (draft && Date.now() - draft.savedAt < 3600000) {
          for (const id of draftFields) if (document.getElementById(id) && typeof draft[id] === 'string') document.getElementById(id).value = draft[id];
        }
        sessionStorage.removeItem(draftKey);
      } catch {}
    }
    params.delete('discord_result');
    history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
  }
  async function api(method = 'GET', body) {
    const resp = await fetch('/api/auth-discord', { method, credentials: 'same-origin', cache: 'no-store',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Liaison Discord indisponible.');
    return data;
  }
  function element(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }
  function render(mount, data) {
    const mode = mount.dataset.discordMode;
    mount.replaceChildren();
    mount.classList.add('discord-panel');
    const title = element('strong', 'discord-panel-title');
    title.append(element('span', 'discord-logo'), document.createTextNode(mode === 'login' ? 'Connexion avec Discord' : 'Compte Discord'));
    const help = element('p', 'discord-panel-help', mode === 'signup'
      ? 'Facultatif : associe ton Discord à cette demande. Après validation du compte, tu pourras te connecter avec Discord ou ton mot de passe.'
      : mode === 'link' ? 'Facultatif : lie ton compte Discord pour te connecter au site.'
      : 'Utilise le compte Discord déjà lié à ton compte du site.');
    const state = element('p', 'discord-panel-state');
    const message = element('p', 'discord-panel-message');
    message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    if (resultMessages[result]) message.textContent = resultMessages[result];
    const actions = element('div', 'discord-panel-actions');
    const identity = mode === 'signup' ? data.signup : data.linked;
    const linked = !!identity;
    if (mode === 'signup' && result === 'verified' && !identity) message.textContent = 'La vérification Discord a expiré. Associe à nouveau ton compte avant de l’inclure dans la demande.';
    if (identity) state.textContent = `${mode === 'signup' ? 'Discord vérifié' : 'Discord lié'} : @${identity.discord_username}`;
    else state.textContent = mode === 'link' ? 'Aucun compte Discord lié.' : '';
    const button = element('button', 'discord-button', mode === 'signup' ? 'Associer mon Discord' : mode === 'link' ? 'Lier mon compte Discord' : 'Se connecter avec Discord');
    button.type = 'button';
    if (mode === 'signup' && data.logged_in) {
      const account = element('a', 'discord-button', 'Ouvrir mes paramètres'); account.href = '/compte/'; actions.append(account);
    } else if (mode === 'link' && !data.logged_in) {
      state.textContent = 'Connecte-toi pour lier ton compte Discord.';
    } else if (mode === 'login' && data.logged_in) {
      const account = element('a', 'discord-button', 'Ouvrir mon compte'); account.href = '/compte/'; actions.append(account);
    } else if (!linked || mode === 'login') {
      button.disabled = !data.configured;
      if (!data.configured) state.textContent = 'La liaison et la connexion Discord ne sont pas encore disponibles.';
      actions.append(button);
    }
    button.addEventListener('click', async () => {
      button.disabled = true; message.textContent = 'Ouverture de Discord…';
      if (mode === 'signup') {
        const draft = { savedAt: Date.now() };
        for (const id of draftFields) draft[id] = document.getElementById(id)?.value || '';
        try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
      }
      try { const start = await api('POST', { mode }); location.assign(start.url); }
      catch (err) { message.textContent = err.message; button.disabled = false; }
    });
    if (linked && mode !== 'login') {
      const remove = element('button', 'discord-button secondary', mode === 'signup' ? 'Retirer de la demande' : 'Délier Discord'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (mode === 'link' && !confirm('Délier Discord de ton compte ? Tu pourras toujours te connecter avec ton mot de passe.')) return;
        remove.disabled = true;
        try { await api('DELETE', { mode }); result = ''; await refresh(); }
        catch (err) { message.textContent = err.message; remove.disabled = false; }
      });
      actions.append(remove);
    }
    actions.append(state);
    mount.append(title, help, actions, message);
  }
  let refreshId = 0;
  async function refresh() {
    const id = ++refreshId;
    try {
      const data = await api();
      if (id !== refreshId) return;
      signup = data.signup;
      for (const mount of mounts) render(mount, data);
    } catch (err) {
      if (id !== refreshId) return;
      signup = null;
      for (const mount of mounts) { mount.classList.add('discord-panel'); mount.textContent = err.message; }
    }
  }
  window.DiscordLink = { get signupSelected() { return !!signup; }, clearSignup() { signup = null; result = ''; return refresh(); } };
  window.SiteAuth?.onChange?.(() => refresh());
  window.DiscordLink.ready = refresh();
})();
