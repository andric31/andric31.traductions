(() => {
  // A URL fragment is not sent in the HTTP URL or in a Referer header.
  const params = new URLSearchParams(location.hash.slice(1));
  const id = Number(params.get('id'));
  const key = params.get('cle') || '';
  const root = document.getElementById('privateConversation');
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[a-f0-9]{64}$/.test(key)) {
    root.textContent = 'Ouvre le lien privé complet remis lors de l’envoi de ton ticket. Le numéro du ticket seul ne donne pas accès à son contenu.';
    return;
  }
  const copy = document.getElementById('copyPrivateLink'); copy.hidden = false;
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); document.getElementById('linkStatus').textContent = 'Lien privé copié.'; }
    catch { document.getElementById('linkStatus').textContent = 'Copie l’adresse complète depuis la barre d’adresse de ton navigateur.'; }
  });
  window.PrivateTicketThread.mount(root, { id, request: async body => {
    const response = await fetch('/api/ticket-thread', { method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-ticket-key': key }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Impossible de joindre le suivi. Réessaie dans un instant.');
    return data;
  } });
})();
