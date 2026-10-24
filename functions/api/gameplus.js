import {member} from './_library.js';
import {json} from './_auth.js';
import {fetchGamePlusDoc,asItems,visibleGame,publicImage} from './_gameplus.js';

function cleanText(v) {
  return String(v ?? '').trim();
}

function cleanTags(v) {
  if (Array.isArray(v)) return v.map(cleanText).filter(Boolean);
  const s = cleanText(v);
  if (!s) return [];
  return s.split(',').map(cleanText).filter(Boolean);
}

function hostLabel(rawUrl, fallback = 'Lien') {
  try {
    const host = new URL(String(rawUrl || '')).hostname.toLowerCase();
    if (host.includes('patreon.com')) return 'Patreon';
    if (host.includes('mega.nz')) return 'MEGA';
    if (host.includes('drive.google')) return 'Google Drive';
    if (host.includes('gofile')) return 'Gofile';
    if (host.includes('discord')) return 'Discord';
    return host.replace(/^www\./, '');
  } catch {}
  return cleanText(fallback) || 'Lien';
}

function labelForLink(key, value) {
  const k = cleanText(key).toLowerCase();
  if (k === 'win_linux' || k === 'winlinux' || k === 'windows_linux') return 'Windows / Linux';
  if (k === 'windows' || k === 'win') return 'Windows';
  if (k === 'linux') return 'Linux';
  if (k === 'macos' || k === 'mac' || k === 'osx') return 'MacOS';
  if (k === 'android') return 'Android';
  if (k === 'patreon') return 'Patreon';
  if (k === 'discord') return 'Discord';
  if (k === 'official') return 'Site officiel';
  if (k === 'download') return 'Téléchargement';
  if (k === 'traduction' || k === 'translation' || k === 'trad' || k === 'patch_fr') return 'Télécharger la traduction';
  return cleanText(key) || hostLabel(value, 'Lien');
}

function sectionForLink(link, key = '') {
  const raw = cleanText(link?.section || link?.category || link?.kind || link?.type || '').toLowerCase();
  const k = cleanText(key || link?.key || '').toLowerCase();
  const v = raw || k;
  if (['traduction', 'trad', 'translation', 'patch_fr', 'fr'].includes(v)) return 'traduction';
  if (['win_linux', 'winlinux', 'windows_linux', 'windows', 'win', 'linux', 'macos', 'mac', 'osx', 'android', 'download', 'jeu', 'game'].includes(v)) return 'download';
  if (['patreon', 'discord', 'official', 'source', 'site', 'itch', 'steam'].includes(v)) return 'source';
  return 'other';
}

function cleanOneLink(id, link, index, key = '') {
  let raw = link;
  if (typeof raw === 'string') raw = { url: raw };
  if (!raw || typeof raw !== 'object') return null;
  const url = cleanText(raw.r2Key || raw.url || raw.href || raw.link);
  if (!url) return null;
  const linkKey = cleanText(raw.key || key || `link_${index}`);
  const label = cleanText(raw.label || raw.name || raw.title || labelForLink(linkKey, url));
  const section = sectionForLink(raw, linkKey);
  return {
    key: linkKey || `link_${index}`,
    section,
    label: label || hostLabel(url, 'Lien'),
    host: url.startsWith('private-library/') || url.startsWith('r2://') ? 'Site' : hostLabel(url, linkKey),
    url: `/api/gameplus-link?id=${encodeURIComponent(id)}&type=${encodeURIComponent(linkKey || `link_${index}`)}`,
  };
}

function cleanLinks(id, links) {
  const out = [];
  if (!links) return out;
  if (Array.isArray(links)) {
    links.forEach((link, index) => {
      const item = cleanOneLink(id, link, index);
      if (item) out.push(item);
    });
    return out;
  }
  if (typeof links === 'object') {
    Object.entries(links).forEach(([key, value], index) => {
      const item = cleanOneLink(id, value && typeof value === 'object' ? value : { url: value }, index, key);
      if (item) out.push(item);
    });
  }
  return out;
}

function cleanGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanText(raw.id || raw.uid || raw.key);
  const title = cleanText(raw.title || raw.cleanTitle || raw.name);
  if (!id || !title) return null;
  if (!visibleGame(raw)) return null;

  const cover = publicImage(raw, 'cover');
  const banner = publicImage(raw, 'banner');
  const gallerySource = raw.galleryKeys || raw.gallery;
  const gallery = Array.isArray(gallerySource) ? gallerySource.map((_, i) => publicImage(raw, 'gallery', i)).filter(Boolean) : [];

  return {
    id,
    uid: id,
    title,
    cleanTitle: cleanText(raw.cleanTitle) || title,
    developer: cleanText(raw.developer || raw.author || raw.creator),
    engine: cleanText(raw.engine),
    status: cleanText(raw.status),
    version: cleanText(raw.version),
    date: cleanText(raw.date),
    translationCreatedAt: cleanText(raw.translationCreatedAt || raw.translationCreationDate || raw.tradCreatedAt || raw.createdAt),
    translationUpdatedAt: cleanText(raw.translationUpdatedAt || raw.translationUpdateDate || raw.tradUpdatedAt || raw.updatedAt || raw.updateDate || raw.last_update || raw.lastUpdate),
    cover,
    banner,
    image: cover || banner,
    description: cleanText(raw.description || raw.desc),
    information: cleanText(raw.information || raw.informations || raw.info || raw.notes),
    tags: cleanTags(raw.tags),
    links: cleanLinks(id, raw.links),
    gallery,
    isGamePlus: true,
  };
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode non autorisée' }, 405);

  const auth = await member(context);
  if (auth.response) return auth.response;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ok:false,error:'Origine invalide.'},403);
  try {

    const doc = await fetchGamePlusDoc(context);
    const items = asItems(doc).map(cleanGame).filter(Boolean);
    return json({
      ok: true,
      version: doc?.version || 1,
      updatedAt: cleanText(doc?.updatedAt),
      count: items.length,
      items,
    });
  } catch (err) {
    return json({ ok: false, error: 'Impossible de récupérer Game+', items: [] }, 502);
  }
}
