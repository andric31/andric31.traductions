(() => {
  const dateFr = value => {
    const raw = String(value || '');
    const date = new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');
  };
  window.PrivateTicketThread = {
    mount(root, { id, request, admin = false, afterReply = () => {} }) {
      let disposed = false, busy = false, rows = [], pending = null, loaded = false;
      root.innerHTML = `<div class="private-thread">
        <div class="private-thread-heading"><div><h2 data-title>Chargement du ticket…</h2><p data-meta></p></div>
          <button type="button" class="ticket-btn" data-refresh>Actualiser</button></div>
        <p data-account hidden></p>
        <article class="private-message"><strong>Demande initiale</strong><p data-original></p></article>
        <button type="button" class="ticket-btn" data-older hidden>Afficher les messages précédents</button>
        <div data-messages aria-label="Échanges privés"></div>
        <p data-status class="ticket-status" role="status" aria-live="polite"></p>
        <form class="ticket-form" data-reply><label><span>Ta réponse</span>
          <textarea name="reply" rows="4" maxlength="5000" required placeholder="Écris ta réponse…" disabled></textarea></label>
          <p class="private-thread-hint">La réponse reste dans ce ticket. N’envoie jamais de mot de passe.</p>
          <button type="submit" class="ticket-btn primary" disabled>Envoyer la réponse</button></form>
      </div>`;
      const el = selector => root.querySelector(selector);
      const text = el('textarea');
      const status = (message, error = false) => {
        el('[data-status]').textContent = message;
        el('[data-status]').className = 'ticket-status' + (error ? ' err' : '');
      };
      function lock(value) {
        busy = value;
        root.querySelectorAll('button').forEach(b => b.disabled = value);
        text.disabled = value || !loaded;
        el('[type=submit]').disabled = value || !loaded;
      }
      function renderMessages() {
        const list = el('[data-messages]');
        list.replaceChildren();
        for (const row of rows) {
          const article = document.createElement('article');
          article.className = 'private-message' + (row.author === 'admin' ? ' from-admin' : '');
          const heading = document.createElement('strong');
          heading.textContent = (row.author === 'admin' ? 'Administration' : 'Demandeur') + ' · ' + dateFr(row.created_at);
          const p = document.createElement('p'); p.textContent = row.message;
          article.append(heading, p); list.append(article);
        }
        if (!rows.length) {
          const p = document.createElement('p'); p.textContent = admin ? 'Aucune réponse pour le moment. Écris au demandeur ci-dessous.' : 'Aucune réponse pour le moment. Reviens avec ton lien privé pour consulter la suite.';
          list.append(p);
        }
      }
      async function read(older = false) {
        const data = await request({ id, action: 'read', before: older ? rows[0]?.id || 0 : 0 });
        if (disposed) return;
        loaded = true;
        el('[data-title]').textContent = `Ticket #${id} · ${data.ticket.title}`;
        el('[data-meta]').textContent = `${data.ticket.status === 'closed' ? (admin ? 'Clôturé' : 'Clôturé — une nouvelle réponse le rouvrira') : 'Ouvert'} · Créé le ${dateFr(data.ticket.created_at)}`;
        el('[data-original]').textContent = data.ticket.message;
        el('[data-account]').hidden = !data.ticket.account_created_at;
        el('[data-account]').textContent = data.ticket.account_created_at ? `Compte « ${data.ticket.account_username} » créé. Tu peux te connecter avec le mot de passe choisi lors de ta demande.` : '';
        rows = older ? [...data.messages, ...rows] : data.messages;
        el('[data-older]').hidden = !data.has_more;
        renderMessages();
      }
      async function refresh(older = false) {
        if (busy || disposed) return;
        lock(true); status('Chargement…');
        try { await read(older); if (!disposed) status(''); }
        catch (error) { if (!disposed) { if (!loaded) el('[data-title]').textContent = 'Suivi du ticket'; status(error.message, true); } }
        finally { if (!disposed) lock(false); }
      }
      el('[data-refresh]').addEventListener('click', () => refresh());
      el('[data-older]').addEventListener('click', () => refresh(true));
      el('form').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || disposed || !loaded || !text.value.trim()) return;
        const message = text.value.trim();
        if (!pending || pending.message !== message) pending = { message, request_id: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('') };
        lock(true); status('Envoi de la réponse…');
        try {
          await request({ id, action: 'reply', ...pending });
          if (disposed) return;
          pending = null; text.value = '';
          try { await read(); if (!disposed) status('Réponse envoyée.'); }
          catch { if (!disposed) status('Réponse envoyée. Actualise pour afficher la conversation.'); }
          afterReply();
        } catch (error) { if (!disposed) status(error.message, true); }
        finally { if (!disposed) { lock(false); text.focus(); } }
      });
      refresh();
      return () => { disposed = true; root.replaceChildren(); };
    },
  };
})();
