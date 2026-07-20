(() => {
  const form = document.getElementById('ticketForm');
  const btn = document.getElementById('ticketSubmit');
  const status = document.getElementById('ticketStatus');
  function setStatus(text, type){ status.textContent = text || ''; status.className = 'ticket-status ' + (type || ''); }
  function val(id){ return document.getElementById(id)?.value?.trim() || ''; }
  function rawVal(id){ return document.getElementById(id)?.value || ''; }
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: val('ticketName'),
      contact: '',
      category: val('ticketCategory'),
      priority: val('ticketPriority') || 'normal',
      title: val('ticketTitle'),
      message: val('ticketMessage'),
      password: rawVal('ticketPassword'),
      password_confirm: rawVal('ticketPasswordConfirm'),
      page_url: location.href,
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
      document.getElementById('ticketCategory')?.dispatchEvent(new Event('change'));
      setStatus(`Ticket envoyé ✅ Référence #${data.ticket?.id || data.id}.`, 'ok');
    } catch (err) {
      setStatus(err?.message || 'Erreur pendant l’envoi du ticket.', 'err');
    } finally {
      btn.disabled = false;
    }
  });
})();
