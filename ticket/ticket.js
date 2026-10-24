(() => {
  const form = document.getElementById('ticketForm');
  const btn = document.getElementById('ticketSubmit');
  const status = document.getElementById('ticketStatus');
  function setStatus(text, type){ status.textContent = text || ''; status.className = 'ticket-status ' + (type || ''); }
  function val(id){ return document.getElementById(id)?.value?.trim() || ''; }
  function rawVal(id){ return document.getElementById(id)?.value || ''; }
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (btn.disabled) return;
    await window.DiscordLink?.ready;
    const payload = {
      name: val('ticketName'),
      contact: '',
      category: val('ticketCategory'),
      link_discord: val('ticketCategory') === 'inscription' && !!window.DiscordLink?.signupSelected,
      priority: val('ticketPriority') || 'normal',
      title: val('ticketTitle'),
      message: val('ticketMessage'),
      password: rawVal('ticketPassword'),
      password_confirm: rawVal('ticketPasswordConfirm'),
      page_url: location.origin + location.pathname,
      user_agent: navigator.userAgent || '',
    };
    if (!payload.name || !payload.category || !payload.title || !payload.message) {
      setStatus('Pseudo, type de demande et message sont obligatoires.', 'err');
      return;
    }
    if (payload.category === 'inscription') {
      if (!payload.name || !payload.password || !payload.password_confirm) {
        setStatus('Pour créer un compte, le pseudo et les deux cases mot de passe sont obligatoires.', 'err');
        return;
      }
      if (payload.password !== payload.password_confirm) {
        setStatus('Les deux mots de passe ne sont pas identiques.', 'err');
        return;
      }
      if (payload.password.length < 8) {
        setStatus('Le mot de passe doit contenir au moins 8 caractères.', 'err');
        return;
      }
    }
    btn.disabled = true;
    setStatus('Envoi du ticket…', '');
    try {
      const resp = await fetch('/api/ticket', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Envoi impossible.');
      form.reset();
      if (payload.link_discord) window.DiscordLink?.clearSignup();
      document.getElementById('ticketCategory')?.dispatchEvent(new Event('change'));
      const ticketId = Number(data.ticket?.id || data.id);
      const key = data.tracking?.key || '';
      if (!Number.isSafeInteger(ticketId) || !/^[a-f0-9]{64}$/.test(key)) {
        setStatus(`Ticket #${ticketId} enregistré, mais le suivi privé est indisponible. Recharge la page avant une nouvelle demande.`, 'err');
        return;
      }
      const link = new URL('/ticket/suivi', location.origin);
      link.hash = new URLSearchParams({ id: String(ticketId), cle: key }).toString();
      document.getElementById('privateTicketLink').value = link.href;
      document.getElementById('openPrivateTicket').href = link.href;
      document.getElementById('receiptTitle').textContent = `Ticket #${ticketId} envoyé`;
      form.hidden = true;
      const receipt = document.getElementById('ticketReceipt');
      receipt.hidden = false; receipt.focus();
    } catch (err) {
      setStatus(err?.message || 'Erreur pendant l’envoi du ticket.', 'err');
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById('copyTicketLink')?.addEventListener('click', async () => {
    const input = document.getElementById('privateTicketLink');
    try { await navigator.clipboard.writeText(input.value); document.getElementById('receiptStatus').textContent = 'Lien privé copié.'; }
    catch { input.focus(); input.select(); document.getElementById('receiptStatus').textContent = 'Copie le lien sélectionné avec Ctrl+C.'; }
  });
  document.getElementById('saveTicketLink')?.addEventListener('click', () => {
    const link = document.getElementById('privateTicketLink').value;
    const blob = new Blob(['Suivi privé de ton ticket andric31\nNe partage pas ce lien.\n\n' + link + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'mon-ticket-andric31.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
