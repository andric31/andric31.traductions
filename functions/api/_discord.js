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
    const body = await response.json().catch(() => null);
    let retryAfter = NaN;
    if (response.status === 429) {
      const delay = body?.retry_after ?? response.headers.get('retry-after');
      if (delay !== null && delay !== undefined && delay !== '') retryAfter = Number(delay);
    }
    return {
      ok: response.ok,
      status: response.status,
      retryAfter,
      discordCode: Number.isSafeInteger(body?.code) ? body.code : null,
      messageId: /^\d+$/.test(String(body?.id || '')) ? String(body.id) : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function getDiscordConfiguration(env) {
  const raw = String(env?.DISCORD_WEBHOOK_URL || '').trim();
  if (!raw) return {
    configured: false, valid: false, code: 'missing_webhook',
    message: 'DISCORD_WEBHOOK_URL est absent de ce déploiement. Ajoute ce secret en Production puis redéploie le site.',
  };
  try {
    webhookUrl(raw);
    return { configured: true, valid: true, code: 'ready', message: 'Le webhook est présent et son format est valide. Tu peux tester l’envoi.' };
  } catch {
    return {
      configured: true, valid: false, code: 'invalid_webhook',
      message: 'Le format de DISCORD_WEBHOOK_URL est invalide. Recopie l’URL complète depuis Discord, enregistre le secret puis redéploie.',
    };
  }
}

// Appelé uniquement par l’API de diagnostic, après contrôle de la session admin.
export async function runDiscordTest(context) {
  const config = getDiscordConfiguration(context.env);
  if (!config.valid) return { ok: false, code: config.code, message: config.message };
  try {
    const url = webhookUrl(String(context.env.DISCORD_WEBHOOK_URL).trim());
    const payload = {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: '✅ Test des notifications du site',
        description: 'Ce message de test a été demandé depuis la page de diagnostic administrateur d’Andric31.',
        color: 0x57a876,
        timestamp: new Date().toISOString(),
      }],
    };
    let result = await sendOnce(url, payload);
    if (result.status === 429 && Number.isFinite(result.retryAfter)
        && result.retryAfter >= 0 && result.retryAfter <= 5) {
      await new Promise(resolve => setTimeout(resolve, Math.ceil(result.retryAfter * 1000) + 50));
      result = await sendOnce(url, payload);
    }
    const details = { http_status: result.status, discord_code: result.discordCode };
    if (result.ok && result.messageId) return {
      ok: true, code: 'sent', ...details, message_id: result.messageId,
      message: 'Discord a confirmé la création du message de test. Vérifie le salon sélectionné dans les réglages de ton webhook.',
    };
    const reasons = {
      400: 'Discord refuse le message ou la destination. Vérifie que le webhook cible un salon textuel classique, puis utilise le code du rapport pour identifier le refus.',
      401: 'Discord refuse l’authentification du webhook. Recopie son URL complète dans le secret puis redéploie.',
      403: 'Discord refuse l’accès au salon. Vérifie le webhook et les autorisations de sa destination.',
      404: 'Discord ne trouve pas ce webhook. Il a peut-être été supprimé ou son URL est incomplète. Crée un webhook, remplace le secret puis redéploie.',
      429: 'Discord limite temporairement les envois. Attends avant de relancer le test.',
    };
    return {
      ok: false, code: result.ok ? 'unexpected_response' : 'discord_rejected', ...details,
      ...(Number.isFinite(result.retryAfter) ? { retry_after_seconds: result.retryAfter } : {}),
      message: result.ok
        ? 'La réponse reçue ne confirme pas la création d’un message Discord. Copie le rapport pour analyser ce résultat.'
        : reasons[result.status] || 'L’envoi à Discord a échoué. Le rapport indique le statut HTTP reçu.',
    };
  } catch (error) {
    return {
      ok: false, code: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      message: error?.name === 'AbortError'
        ? 'Discord n’a pas répondu dans le délai de 8 secondes. L’envoi ne peut pas être confirmé.'
        : 'Cloudflare n’a pas pu terminer la connexion à Discord. L’envoi ne peut pas être confirmé.',
    };
  }
}

function scheduleDiscord(context, kind, buildEmbed) {
  const raw = String(context.env?.DISCORD_WEBHOOK_URL || '').trim();
  if (!raw) {
    console.info(`[Discord] ${kind} : désactivé, DISCORD_WEBHOOK_URL absent de ce déploiement.`);
    return;
  }

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
    if (!result.ok) console.warn(`[Discord] ${kind} : échec HTTP ${result.status}, code Discord ${result.discordCode ?? 'non fourni'}.`);
    else console.info(`[Discord] ${kind} : envoi accepté par Discord (HTTP ${result.status}).`);
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
