// L'indicateur est public ; les anciens exports de liens privés ne le contiennent pas.
export function isDiscordExclusive(entry) {
  return String(entry?.discordExclusive ?? entry?.gameData?.discordExclusive ?? '').trim().toLowerCase() === 'oui';
}

function privateKey(entry) {
  const id = String(entry?.id || '').trim();
  if (id) return id;
  const collection = String(entry?.collection || '').trim();
  const uid = String(entry?.uid ?? '').trim();
  if (collection && uid) return `${collection}__${uid}`;
  if (uid) return `uid__${uid}`;
  const title = String(entry?.cleanTitle || entry?.title || '').trim();
  return title ? `title__${title}` : '';
}

export async function getDiscordExclusivity(context, key, privateItem) {
  // Réutilise le proxy public et son cache de secours, jamais une valeur du client.
  const response = await fetch(new URL('/api/f95list', context.request.url).toString(), {
    headers: { accept: 'application/json' },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error('Impossible de vérifier l’exclusivité Discord.');
  const doc = await response.json();
  const list = Array.isArray(doc) ? doc : ['games', 'list', 'items', 'data', 'rows', 'results']
    .map(name => doc?.[name]).find(Array.isArray);
  if (!list) throw new Error('Liste publique invalide pour vérifier l’exclusivité Discord.');
  const entry = list.find(item => privateKey(item) === key);
  return isDiscordExclusive(entry || privateItem);
}
