// Notifications côté serveur. Sans le secret DISCORD_WEBHOOK_URL, aucun envoi.
const ROOM_LABELS = {
  global: 'Salon public',
  'private:members': 'Salon privé membres',
  'private:translators': 'Salon privé traducteurs',
  'private:moderators': 'Salon privé modérateurs',
  'private:admins': 'Salon privé admins',
};

function text(value, max = 200) {
  const plain = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  // Le contenu fourni par un visiteur reste du texte dans l'encart Discord.
  const escaped = plain.replace(/([\\`*_{}\[\]()<>#+.!|~])/g, '\\$1');
  if (!escaped) return 'Non renseigné';
  return escaped.length <= max ? escaped : escaped.slice(0, max - 1).replace(/\\$/, '') + '…';
}

function webhookUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['discord.com', 'discordapp.com'].includes(url.hostname)
      || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('Invalid webhook');
  }
  const thread = url.searchParams.get('thread_id');
  url.search = '';
  url.hash = '';
  if (thread && /^\d+$/.test(thread)) url.searchParams.set('thread_id', thread);
  // Demande à Discord de confirmer l'enregistrement du message.
  url.searchParams.set('wait', 'true');
  return url;
}

async function sendOnce(url, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: controller.signal,
    });
    let retryAfter = NaN;
    if (response.status === 429) {
      const body = await response.json().catch(() => null);
      const delay = body?.retry_after ?? response.headers.get('retry-after');
      if (delay !== null && delay !== undefined && delay !== '') retryAfter = Number(delay);
    } else {
      await response.body?.cancel();
    }
    return { ok: response.ok, status: response.status, retryAfter };
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleDiscord(context, kind, buildEmbed) {
  const raw = String(context.env?.DISCORD_WEBHOOK_URL || '').trim();
  if (!raw) return;

  const task = (async () => {
    let url;
    try {
      url = webhookUrl(raw);
    } catch {
      console.warn('[Discord] DISCORD_WEBHOOK_URL invalide : envoi ignoré.');
      return;
    }
    const payload = {
      allowed_mentions: { parse: [] },
      embeds: [{ ...buildEmbed(), timestamp: new Date().toISOString() }],
    };
    let result = await sendOnce(url, payload);
    // Une seule nouvelle tentative, en respectant le délai demandé par Discord.
    // Le total reste inférieur à la durée disponible après la réponse Pages.
    if (result.status === 429 && Number.isFinite(result.retryAfter)
        && result.retryAfter >= 0 && result.retryAfter <= 5) {
      await new Promise(resolve => setTimeout(resolve, Math.ceil(result.retryAfter * 1000) + 50));
      result = await sendOnce(url, payload);
    }
    if (!result.ok) console.warn(`[Discord] ${kind} : échec HTTP ${result.status}.`);
  })().catch(() => {
    // Ne jamais journaliser l'URL du webhook, les données privées ou l'erreur brute.
    console.warn(`[Discord] ${kind} : envoi impossible (réseau ou délai dépassé).`);
  });

  if (typeof context.waitUntil === 'function') {
    context.waitUntil(task);
    return;
  }
  // Utile aussi hors de Pages : les appelants attendent cette promesse si nécessaire.
  return task;
}

export function notifyTicketOpened(context, ticket) {
  return scheduleDiscord(context, 'nouveau ticket', () => ({
    title: '🎫 Nouveau ticket ouvert',
    url: new URL('/compte/ticket-admin.html', context.request.url).href,
    color: ticket.priority === 'urgent' ? 0xed4245 : 0x5865f2,
    fields: [
      { name: 'N° du ticket', value: text(ticket.id, 40), inline: true },
      { name: 'Auteur', value: text(ticket.name), inline: true },
      { name: 'Sujet', value: text(ticket.title, 400) },
      { name: 'Catégorie', value: text(({ question: 'Question', probleme: 'Problème', suggestion: 'Suggestion', inscription: 'Création de compte', compte: 'Compte', autre: 'Autre' })[ticket.category]), inline: true },
      { name: 'Priorité', value: text(({ faible: 'Faible', normal: 'Normale', urgent: 'Urgente' })[ticket.priority]), inline: true },
    ],
    description: 'Ouvre la gestion des tickets pour consulter la demande et y répondre.',
    footer: { text: 'Andric31 • Tickets' },
  }));
}

export function notifyNewMessage(context, message) {
  return scheduleDiscord(context, 'nouveau message', () => {
    const url = new URL('/messages/', context.request.url);
    if (message.roomKey !== 'global') url.searchParams.set('room', message.roomKey);
    return {
      title: '💬 Nouveau message sur le site',
      url: url.href,
      color: 0x57a876,
      fields: [
        { name: 'Auteur', value: text(message.nickname), inline: true },
        { name: 'Salon', value: ROOM_LABELS[message.roomKey] || 'Salon privé', inline: true },
      ],
      description: message.roomKey === 'global'
        ? text(message.body, 1000)
        : 'Un nouveau message a été publié. Ouvre le salon sur le site pour le lire.',
      footer: { text: `Andric31 • Message ${message.id || ''}`.trim() },
    };
  });
}
