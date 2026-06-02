(() => {
  const form = document.getElementById('ticketForm');
  const btn = document.getElementById('ticketSubmit');
  const status = document.getElementById('ticketStatus');
  function setStatus(text, type){ status.textContent = text || ''; status.className = 'ticket-status ' + (type || ''); }
  function val(id){ return document.getElementById(id)?.value?.trim() || ''; }
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: val('ticketName'),
      contact: '',
      category: val('ticketCategory') || 'question',
      priority: val('ticketPriority') || 'normal',
      title: val('ticketTitle'),
      message: val('ticketMessage'),
      page_url: location.href,
      user_agent: navigator.userAgent || '',
    };
    if (!payload.name || !payload.title || !payload.message) {
      setStatus('Nom, titre et message sont obligatoires.', 'err');
      return;
    }
    btn.disabled = true;
    setStatus('Envoi du ticket…', '');
    try {
      const resp = await fetch('/api/ticket', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Envoi impossible.');
      form.reset();
      setStatus(`Ticket envoyé ✅ Référence #${data.ticket?.id || data.id}.`, 'ok');
    } catch (err) {
      setStatus(err?.message || 'Erreur pendant l’envoi du ticket.', 'err');
    } finally {
      btn.disabled = false;
    }
  });
})();
