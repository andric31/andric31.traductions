(function () {
  "use strict";

  // Les caches de chargement gardent l'adresse complète, paramètres compris.
  const imageCache = new Map();
  const mediaCache = new Map();
  const IMAGE_TIMEOUT_MS = 8000;
  const MEDIA_TIMEOUT_MS = 12000;

  function cleanUrl(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function parseUrl(value) {
    const origin = typeof location !== "undefined" && location.origin
      ? location.origin : "https://local.invalid";
    return new URL(value, origin);
  }

  function isGalleryAvatarUrl(value) {
    const u = cleanUrl(value);
    return /\/data\/avatars?\//i.test(u) ||
      /^https?:\/\/(?:[^/]+\.)?gravatar\.com\/avatar\//i.test(u);
  }

  function getF95ThreadUrl(rawOrUrl, imageUrl) {
    const entry = rawOrUrl && typeof rawOrUrl === "object" ? rawOrUrl : {};
    const candidates = [rawOrUrl, entry.url, entry.threadUrl, entry.f95url,
      entry.f95Url, entry.sourceUrl, entry.gameData?.url,
      entry.gameData?.threadUrl, entry.gameData?.f95url, entry.gameData?.f95Url];
    for (const candidate of candidates) {
      const value = cleanUrl(candidate);
      if (!value) continue;
      try {
        const u = parseUrl(value);
        if (!/^https?:$/.test(u.protocol) || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname)) continue;
        const match = u.pathname.match(/^\/threads\/(?:[^/]*\.)?(\d+)(?:\/|$)/i);
        if (match) return `https://f95zone.to/threads/${match[1]}/`;
      } catch {}
    }
    for (const candidate of [imageUrl, entry.gameData?.imageUrl, entry.imageUrl, rawOrUrl]) {
      const value = cleanUrl(candidate);
      if (!value) continue;
      try {
        const u = parseUrl(value);
        if (!/^https?:$/.test(u.protocol) || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname)) continue;
        const match = u.pathname.match(/^\/data\/covers\/thread\/[^/]+\/\d+\/(\d+)\.(?:jpe?g|png|webp|gif)$/i);
        if (match) return `https://f95zone.to/threads/${match[1]}/`;
      } catch {}
    }
    return "";
  }

  function toF95PreviewUrl(value) {
    const original = cleanUrl(value);
    if (!original) return "";
    try {
      const u = parseUrl(original);
      if (/^https?:$/.test(u.protocol) && u.hostname.toLowerCase() === "attachments.f95zone.to" &&
          /^\/\d{4}\/\d{2}\//.test(u.pathname)) {
        u.protocol = "https:";
        u.hostname = "preview.f95zone.to";
        return u.href;
      }
    } catch {}
    return original;
  }

  function imageCandidates(value, preferPreview = false) {
    const original = cleanUrl(value);
    if (!original || isGalleryAvatarUrl(original)) return [];
    const preview = toF95PreviewUrl(original);
    let attachment = original;
    try {
      const u = parseUrl(original);
      if (/^https?:$/.test(u.protocol) && u.hostname.toLowerCase() === "preview.f95zone.to" &&
          /^\/\d{4}\/\d{2}\//.test(u.pathname)) {
        u.protocol = "https:";
        u.hostname = "attachments.f95zone.to";
        attachment = u.href;
      }
    } catch {}
    return [...new Set(preferPreview
      ? [preview, original, attachment]
      : [original, attachment, preview])];
  }

  function normalizeF95MediaKey(value) {
    const original = cleanUrl(value);
    if (!original) return "";
    try {
      const u = parseUrl(original);
      const host = u.hostname.toLowerCase();
      let path = u.pathname.replace(/\\/g, "/");
      if (host === "attachments.f95zone.to" || host === "preview.f95zone.to") {
        path = path.replace(/^\/(\d{4})\/(\d{2})\/(?:thumb\/)?/i, "/");
        return `f95-media:${path}`;
      }
      return `${host}${path}`;
    } catch {
      return original.replace(/[?#].*$/, "");
    }
  }

  function preloadImage(value) {
    const url = cleanUrl(value);
    if (!url) return Promise.resolve(false);
    if (imageCache.has(url)) return imageCache.get(url).promise;

    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    const entry = { promise, status: "pending" };
    imageCache.set(url, entry);
    let img;
    let timeout;
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      entry.status = ok ? "ready" : "failed";
      if (img) {
        img.onload = img.onerror = null;
        if (!ok) {
          try { img.removeAttribute("src"); } catch {}
        }
      }
      settle(!!ok);
    };
    try {
      img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.referrerPolicy = "no-referrer";
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      timeout = setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
      img.src = url;
    } catch {
      finish(false);
    }
    return promise;
  }

  function markImageFailed(value) {
    const url = cleanUrl(value);
    if (url) imageCache.set(url, { promise: Promise.resolve(false), status: "failed" });
  }

  async function findWorkingF95Image(urls, excluded = new Set(), { preferPreview = false } = {}) {
    const tried = new Set(excluded);
    for (const url of Array.isArray(urls) ? urls : []) {
      for (const candidate of imageCandidates(url, preferPreview)) {
        if (tried.has(candidate)) continue;
        tried.add(candidate);
        if (await preloadImage(candidate)) return candidate;
      }
    }
    return "";
  }

  function emptyMedia() {
    return { cover: "", gallery: [] };
  }

  function normalizeMedia(data) {
    if (!data || typeof data !== "object" || data.ok === false) return emptyMedia();
    const cover = cleanUrl(data.cover);
    return {
      cover: isGalleryAvatarUrl(cover) ? "" : cover,
      gallery: (Array.isArray(data.gallery) ? data.gallery : [])
        .map(cleanUrl).filter((url) => url && !isGalleryAvatarUrl(url)),
    };
  }

  async function requestMedia(threadUrl) {
    let timeout;
    let controller;
    try {
      controller = new AbortController();
      const expired = new Promise((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(emptyMedia());
        }, MEDIA_TIMEOUT_MS);
      });
      const response = fetch(`/api/f95gallery?url=${encodeURIComponent(threadUrl)}`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      }).then((r) => r.ok ? r.json() : null).then(normalizeMedia).catch(emptyMedia);
      return await Promise.race([response, expired]);
    } catch {
      return emptyMedia();
    } finally {
      clearTimeout(timeout);
    }
  }

  function forgetFailedImages(urls) {
    for (const url of urls) {
      for (const candidate of imageCandidates(url)) {
        if (imageCache.get(candidate)?.status === "failed") imageCache.delete(candidate);
      }
    }
  }

  function fetchF95GalleryMedia(rawOrUrl, imageUrl, { refresh = false } = {}) {
    const threadUrl = getF95ThreadUrl(rawOrUrl, imageUrl);
    if (!threadUrl) return Promise.resolve(emptyMedia());
    let record = mediaCache.get(threadUrl);
    if (!record) {
      record = { promise: null, refreshed: false, media: emptyMedia() };
      mediaCache.set(threadUrl, record);
    }
    if (record.promise && (!refresh || record.refreshed)) return record.promise;
    if (refresh) record.refreshed = true;

    // Une demande forcée attend celle déjà en cours, sans requêtes concurrentes.
    const previous = record.promise;
    record.promise = Promise.resolve(previous).then(async () => {
      const media = await requestMedia(threadUrl);
      if (refresh) {
        forgetFailedImages([imageUrl, record.media.cover, ...record.media.gallery,
          media.cover, ...media.gallery]);
      }
      // Une panne de l'API ne supprime pas les aperçus précédemment connus.
      if (media.cover || media.gallery.length) record.media = media;
      return { cover: record.media.cover, gallery: record.media.gallery.slice() };
    }).catch(() => ({ cover: record.media.cover, gallery: record.media.gallery.slice() }));
    return record.promise;
  }

  function mergeGalleryUrls(baseUrl, media) {
    const base = cleanUrl(baseUrl);
    const remote = normalizeMedia(media);
    const fresh = new Map();
    for (const url of [remote.cover, ...remote.gallery]) {
      const key = normalizeF95MediaKey(url);
      if (url && key && !fresh.has(key)) fresh.set(key, url);
    }
    const result = [];
    const seen = new Set();
    if (base && !isGalleryAvatarUrl(base)) {
      const key = normalizeF95MediaKey(base);
      if (key) {
        result.push(fresh.get(key) || base);
        seen.add(key);
      }
    }
    for (const [key, url] of fresh) {
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(url);
    }
    return result;
  }

  window.GameImages = Object.freeze({
    getF95ThreadUrl,
    fetchF95GalleryMedia,
    findWorkingF95Image,
    preloadImage,
    markImageFailed,
    normalizeF95MediaKey,
    toF95PreviewUrl,
    mergeGalleryUrls,
  });
})();
