"use strict";

(function () {
  const CREATOR_DATA_URLS = ["/data/creators.json", "../data/creators.json"];
  let creatorPromise = null;

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function presentationExcerpt(value, maxLength = 220) {
    const text = normalizeText(value).replace(/\s+/g, " ");
    if (text.length <= maxLength) return text;
    const sample = text.slice(0, maxLength + 1);
    const wordBreak = sample.lastIndexOf(" ");
    const end = wordBreak >= Math.floor(maxLength * 0.7) ? wordBreak : maxLength;
    return `${sample.slice(0, end).trimEnd()}…`;
  }

  function creatorSlug(value) {
    return normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeGameIds(raw) {
    const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    const out = [];
    const seen = new Set();
    for (const item of values.flatMap((value) => typeof value === "string" ? value.split(/[\n,;]+/g) : [value])) {
      const source = item && typeof item === "object" ? item.id || item.threadId || item.url : item;
      const match = normalizeText(source).match(/(?:threads\/)?(\d+)/i);
      const id = match ? match[1] : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function getGameId(game) {
    const display = getDisplayData(game);
    return normalizeText(game?.id || display?.id);
  }

  function getDisplayData(game) {
    return game && game.gameData ? game.gameData : game || {};
  }

  function extractCreatorNamesFromTitle(game) {
    const display = getDisplayData(game);
    const source = normalizeText(game?.cleanTitle || display?.cleanTitle || display?.title || game?.title);
    if (!source) return [];

    const matches = [...source.matchAll(/\[([^\]]+)\]/g)];
    if (!matches.length) return [];

    const last = normalizeText(matches[matches.length - 1]?.[1]);
    if (!last || /^v(?:ersion)?\b/i.test(last)) return [];

    // Seul le slash sépare automatiquement plusieurs créateurs.
    // "and" et "&" peuvent appartenir au nom du créateur (ex. Story and Magic).
    return last.split(/\s*\/\s*/).map(normalizeText).filter(Boolean);
  }

  function normalizeCreatorRefs(raw) {
    const refs = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    return refs.map((item) => {
      if (item && typeof item === "object") {
        const id = creatorSlug(item.id || item.slug || item.name);
        const name = normalizeText(item.name || item.label || item.id);
        return id ? { id, name: name || id } : null;
      }
      const name = normalizeText(item);
      const id = creatorSlug(name);
      return id ? { id, name } : null;
    }).filter(Boolean);
  }

  function getCreatorRefs(game) {
    const display = getDisplayData(game);
    const candidates = [
      game?.creatorIds,
      display?.creatorIds,
      game?.creators,
      display?.creators,
      game?.creator,
      display?.creator,
    ];

    for (const candidate of candidates) {
      const refs = normalizeCreatorRefs(candidate);
      if (refs.length) return refs;
    }

    return extractCreatorNamesFromTitle(game).map((name) => ({ id: creatorSlug(name), name }));
  }

  function getCreatorIds(game) {
    return [...new Set(getCreatorRefs(game).map((item) => item.id).filter(Boolean))];
  }

  function getCreatorNames(game) {
    return [...new Set(getCreatorRefs(game).map((item) => item.name).filter(Boolean))];
  }

  function normalizeCreators(raw) {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.creators)
        ? raw.creators
        : [];

    return list.map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = normalizeText(item.name || item.title || item.id);
      const id = creatorSlug(item.id || item.slug || name);
      if (!id || !name) return null;
      return {
        ...item,
        id,
        name,
        aliases: Array.isArray(item.aliases) ? item.aliases.map(normalizeText).filter(Boolean) : [],
        gameIds: normalizeGameIds(item.gameIds || item.gameRefs || []),
        ignoredGameIds: normalizeGameIds(item.ignoredGameIds || item.ignoreGameIds || item.excludedGameIds || []),
        links: normalizeLinks(item.links),
      };
    }).filter(Boolean);
  }

  function normalizeLinks(raw) {
    if (Array.isArray(raw)) {
      return raw.map((item) => {
        if (!item || typeof item !== "object") return null;
        const url = normalizeText(item.url || item.href);
        if (!/^https?:\/\//i.test(url)) return null;
        return {
          type: creatorSlug(item.type || item.label || "website") || "website",
          label: normalizeText(item.label || getLinkLabel(item.type)),
          url,
        };
      }).filter(Boolean);
    }

    if (raw && typeof raw === "object") {
      return Object.entries(raw).map(([type, url]) => {
        const cleanUrl = normalizeText(url);
        if (!/^https?:\/\//i.test(cleanUrl)) return null;
        return { type: creatorSlug(type), label: getLinkLabel(type), url: cleanUrl };
      }).filter(Boolean);
    }

    return [];
  }

  function getLinkLabel(type) {
    const key = creatorSlug(type);
    const labels = {
      website: "Site officiel",
      site: "Site officiel",
      itch: "Itch.io",
      "itch-io": "Itch.io",
      steam: "Steam",
      patreon: "Patreon",
      subscribestar: "SubscribeStar",
      "subscribe-star": "SubscribeStar",
      buymeacoffee: "Buy Me a Coffee",
      "buy-me-a-coffee": "Buy Me a Coffee",
      boosty: "Boosty",
      discord: "Discord",
      f95zone: "F95Zone",
      f95: "F95Zone",
      twitter: "X / Twitter",
      x: "X / Twitter",
      bluesky: "Bluesky",
      youtube: "YouTube",
      github: "GitHub",
    };
    return labels[key] || normalizeText(type) || "Lien";
  }

  async function fetchCreators() {
    if (creatorPromise) return creatorPromise;
    creatorPromise = (async () => {
      for (const url of CREATOR_DATA_URLS) {
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) continue;
          return normalizeCreators(await response.json());
        } catch {}
      }
      return [];
    })();
    return creatorPromise;
  }

  function findCreator(creators, ref) {
    const target = creatorSlug(ref?.id || ref?.name);
    if (!target) return null;
    return creators.find((creator) => {
      if (creator.id === target) return true;
      if (creatorSlug(creator.name) === target) return true;
      return creator.aliases.some((alias) => creatorSlug(alias) === target);
    }) || null;
  }

  function creatorMatchesRef(creator, ref) {
    const target = creatorSlug(ref?.id || ref?.name);
    if (!target || !creator) return false;
    if (creatorSlug(creator.id) === target) return true;
    if (creatorSlug(creator.name) === target) return true;
    return (creator.aliases || []).some((alias) => creatorSlug(alias) === target);
  }

  function getCreatorsForGame(creators, game) {
    const gameId = getGameId(game);
    const out = [];
    const seen = new Set();
    const isIgnored = (profile) => !!gameId && normalizeGameIds(profile?.ignoredGameIds || []).includes(gameId);
    const add = (profile) => {
      if (!profile || isIgnored(profile)) return;
      const key = creatorSlug(profile?.id || profile?.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(profile);
    };

    if (gameId) {
      creators
        .filter((creator) => !isIgnored(creator) && normalizeGameIds(creator.gameIds || []).includes(gameId))
        .forEach(add);
    }

    for (const ref of getCreatorRefs(game)) {
      const matches = creators.filter((creator) => creatorMatchesRef(creator, ref) && !isIgnored(creator));
      if (matches.length) {
        const explicit = gameId ? matches.filter((creator) => normalizeGameIds(creator.gameIds || []).includes(gameId)) : [];
        (explicit.length ? explicit : matches).forEach(add);
      } else {
        add({
          id: ref.id,
          name: ref.name,
          aliases: [],
          gameIds: [],
          ignoredGameIds: [],
          avatar: "",
          presentation: "",
          links: [],
        });
      }
    }
    return out;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function creatorInitial(name) {
    const clean = normalizeText(name);
    return clean ? clean.charAt(0).toUpperCase() : "?";
  }

  function buildCreatorUrl(creator) {
    const id = creatorSlug(creator?.id || creator?.name);
    const name = normalizeText(creator?.name);
    const params = new URLSearchParams({ id });
    if (name) params.set("name", name);
    return `/creator/?${params.toString()}`;
  }


  function getLinkIconHtml(link) {
    const key = creatorSlug(link?.type || link?.label || link?.url || "website");
    const wrap = (svg, extraClass = "") => `<span class="creatorLinkButtonIcon ${extraClass}" aria-hidden="true">${svg}</span>`;
    const svg = (viewBox, path, extra = "") => `<svg class="creatorLinkButtonSvg" viewBox="${viewBox}" fill="currentColor" aria-hidden="true" focusable="false" ${extra}>${path}</svg>`;
    const strokeSvg = (viewBox, path, extra = "") => `<svg class="creatorLinkButtonSvg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${path}</svg>`;
    const icons = {
      patreon: wrap(svg("0 0 24 24", `<path d="M15.5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm-11 0h3v17h-3z"/>`)),
      subscribestar: wrap(svg("0 0 936.86 936.86", `<path d="M479.11 936.74c-3.55.08-7.11.12-10.68.12C209.72 936.86 0 727.14 0 468.43 0 280.08 111.16 117.7 271.45 43.31c21.94 40.07 49.93 72.72 91.53 110.12 21.25 19.1 47.21 38.95 75.34 62.67 45.67 38.51 71.7 69.35 86.24 95.59-17.1-3.2-35.76-4.93-56.13-4.93-27.71 0-52.3 3.11-74.11 8.69v-26.46H237.43v91.11c0 9.44-1.21 41.78 6.45 80.5-5.31 15.91-9.07 31.74-11.7 46.78-4.12 23.57-5.42 45.18-5.42 62.05 0 79.11 22.23 164.89 123.56 253.78 101.17 88.75 107.98 87.3 128.79 113.53z"/><path d="M665.32 893.58s-.01.02-.02.02c-56.62 26.27-119.36 41.55-185.5 43.12-.23.01-.46.02-.69.02-20.81-26.23-27.62-24.78-128.79-113.53-101.33-88.89-123.56-174.67-123.56-253.78 0-16.87 1.3-38.48 5.42-62.05 5.61 18.5 21.91 55.78 66.92 87.38 43.81 30.76 93.65 39.37 119.67 41.75 22.05 41.91 61.05 78.92 117.77 120.92 93.48 69.23 128.25 135.12 128.78 136.15z" opacity=".3"/><path d="M479.8 936.72l-.59.14s-.06-.08-.1-.12c.23 0 .46-.01.69-.02z"/><path d="M665.33 893.59h-.03s.01.01.02-.01h.01z"/><path d="M708.1 563.43v87H546.43v-84c0-14.86-1.37-31.79-6-47.67-7.31-25.07-21.67-46.66-72-46.66 0 0-.79-.04-2.22-.02-28.22-.48-45.71-10.2-55.97-24.46-9.48-13.19-15.92-43.69-15.92-75.36v-56.81c21.81-5.58 46.4-8.69 74.11-8.69 20.37 0 39.03 1.73 56.13 4.93 111.05 20.71 156.13 102.96 173.48 172.19 7.92 31.59 10.06 60.47 10.06 79.55z" opacity=".3"/><path d="M418.77 636.51c-26.02-2.38-75.86-10.99-119.67-41.75-45.01-31.6-61.31-68.88-66.92-87.38 2.63-15.04 6.39-30.87 11.7-46.78 13.31 67.31 53.45 153.89 173.38 172.98.49.98 1 1.96 1.51 2.93z" opacity=".4"/><path d="M936.86 468.43c0 188.38-111.2 350.79-271.54 425.15-.53-1.03-35.3-66.92-128.78-136.15-56.72-42-95.72-79.01-117.77-120.92-.51-.97-1.02-1.95-1.51-2.93 15.66 2.51 32.67 3.85 51.17 3.85 22.75 0 43.39-1.97 62.11-5.57 5.46-1.04 10.75-2.23 15.89-3.54v22.11H708.1v-87c0-19.08-2.14-47.96-10.06-79.55 15.16-45.74 15.72-86.84 15.72-98.45 0-29.67 5.33-80-33.67-153.67-39-73.66-101-123.33-151-162.33S454.42.21 454.42.21c4.65-.14 9.32-.21 14.01-.21 258.7 0 468.43 209.72 468.43 468.43z"/><path d="M546.43 566.43v61.89c-5.14 1.31-10.43 2.5-15.89 3.54v-79.1c0-80-62.11-80.66-62.11-80.66 50.33 0 64.69 21.59 72 46.66 4.63 15.88 6 32.81 6 47.67z" opacity=".5"/>`), "is-subscribestar"),
      buymeacoffee: wrap(svg("0 0 24 24", `<path d="m20.216 6.415-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 0 0-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 0 0-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 0 1-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 0 1 3.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 0 1-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 0 1-4.743.295 37.059 37.059 0 0 1-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0 0 11.343.376.483.483 0 0 1 .535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 0 1 .39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 0 1-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 0 1-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 0 0-1.322-.238c-.826 0-1.491.284-2.26.613z"/>`), "is-buymeacoffee"),
      "buy-me-a-coffee": wrap(svg("0 0 24 24", `<path d="m20.216 6.415-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 0 0-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 0 0-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 0 1-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 0 1 3.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 0 1-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 0 1-4.743.295 37.059 37.059 0 0 1-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0 0 11.343.376.483.483 0 0 1 .535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 0 1 .39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 0 1-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 0 1-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 0 0-1.322-.238c-.826 0-1.491.284-2.26.613z"/>`), "is-buymeacoffee"),
      boosty: wrap(svg("0 0 24 24", `<path d="M2.661 14.337 6.801 0h6.362L11.88 4.444l-0.038 0.077 -3.378 11.733h3.15c-1.321 3.289 -2.35 5.867 -3.086 7.733 -5.816 -0.063 -7.442 -4.228 -6.02 -9.155M8.554 24l7.67 -11.035h-3.25l2.83 -7.073c4.852 0.508 7.137 4.33 5.791 8.952C20.16 19.81 14.344 24 8.68 24h-0.127z"/>`), "is-boosty"),
      "subscribe-star": wrap(svg("0 0 936.86 936.86", `<path d="M479.11 936.74c-3.55.08-7.11.12-10.68.12C209.72 936.86 0 727.14 0 468.43 0 280.08 111.16 117.7 271.45 43.31c21.94 40.07 49.93 72.72 91.53 110.12 21.25 19.1 47.21 38.95 75.34 62.67 45.67 38.51 71.7 69.35 86.24 95.59-17.1-3.2-35.76-4.93-56.13-4.93-27.71 0-52.3 3.11-74.11 8.69v-26.46H237.43v91.11c0 9.44-1.21 41.78 6.45 80.5-5.31 15.91-9.07 31.74-11.7 46.78-4.12 23.57-5.42 45.18-5.42 62.05 0 79.11 22.23 164.89 123.56 253.78 101.17 88.75 107.98 87.3 128.79 113.53z"/><path d="M665.32 893.58s-.01.02-.02.02c-56.62 26.27-119.36 41.55-185.5 43.12-.23.01-.46.02-.69.02-20.81-26.23-27.62-24.78-128.79-113.53-101.33-88.89-123.56-174.67-123.56-253.78 0-16.87 1.3-38.48 5.42-62.05 5.61 18.5 21.91 55.78 66.92 87.38 43.81 30.76 93.65 39.37 119.67 41.75 22.05 41.91 61.05 78.92 117.77 120.92 93.48 69.23 128.25 135.12 128.78 136.15z" opacity=".3"/><path d="M479.8 936.72l-.59.14s-.06-.08-.1-.12c.23 0 .46-.01.69-.02z"/><path d="M665.33 893.59h-.03s.01.01.02-.01h.01z"/><path d="M708.1 563.43v87H546.43v-84c0-14.86-1.37-31.79-6-47.67-7.31-25.07-21.67-46.66-72-46.66 0 0-.79-.04-2.22-.02-28.22-.48-45.71-10.2-55.97-24.46-9.48-13.19-15.92-43.69-15.92-75.36v-56.81c21.81-5.58 46.4-8.69 74.11-8.69 20.37 0 39.03 1.73 56.13 4.93 111.05 20.71 156.13 102.96 173.48 172.19 7.92 31.59 10.06 60.47 10.06 79.55z" opacity=".3"/><path d="M418.77 636.51c-26.02-2.38-75.86-10.99-119.67-41.75-45.01-31.6-61.31-68.88-66.92-87.38 2.63-15.04 6.39-30.87 11.7-46.78 13.31 67.31 53.45 153.89 173.38 172.98.49.98 1 1.96 1.51 2.93z" opacity=".4"/><path d="M936.86 468.43c0 188.38-111.2 350.79-271.54 425.15-.53-1.03-35.3-66.92-128.78-136.15-56.72-42-95.72-79.01-117.77-120.92-.51-.97-1.02-1.95-1.51-2.93 15.66 2.51 32.67 3.85 51.17 3.85 22.75 0 43.39-1.97 62.11-5.57 5.46-1.04 10.75-2.23 15.89-3.54v22.11H708.1v-87c0-19.08-2.14-47.96-10.06-79.55 15.16-45.74 15.72-86.84 15.72-98.45 0-29.67 5.33-80-33.67-153.67-39-73.66-101-123.33-151-162.33S454.42.21 454.42.21c4.65-.14 9.32-.21 14.01-.21 258.7 0 468.43 209.72 468.43 468.43z"/><path d="M546.43 566.43v61.89c-5.14 1.31-10.43 2.5-15.89 3.54v-79.1c0-80-62.11-80.66-62.11-80.66 50.33 0 64.69 21.59 72 46.66 4.63 15.88 6 32.81 6 47.67z" opacity=".5"/>`), "is-subscribestar"),
      itch: wrap(svg("0 0 32 32", `<path d="M4.172 1.787c-1.396 0.828-4.145 3.984-4.172 4.812v1.375c0 1.735 1.625 3.267 3.099 3.267 1.771 0 3.251-1.469 3.251-3.213 0 1.744 1.421 3.213 3.197 3.213 1.771 0 3.151-1.469 3.151-3.213 0 1.744 1.516 3.213 3.287 3.213h0.032c1.776 0 3.291-1.469 3.291-3.213 0 1.744 1.381 3.213 3.152 3.213s3.197-1.469 3.197-3.213c0 1.744 1.475 3.213 3.245 3.213 1.479 0 3.104-1.532 3.104-3.267v-1.375c-0.032-0.828-2.776-3.984-4.177-4.812-4.339-0.156-7.344-0.183-11.823-0.183-4.484 0.005-10.593 0.073-11.828 0.183zM12.677 10.421c-0.183 0.308-0.385 0.568-0.625 0.797v0.005c-0.672 0.651-1.588 1.057-2.599 1.057-1.016 0-1.932-0.407-2.599-1.063-0.245-0.235-0.428-0.489-0.6-0.787-0.167 0.297-0.4 0.552-0.645 0.787-0.672 0.656-1.588 1.063-2.599 1.063 0 0 0 0-0.005 0-0.12 0-0.245-0.036-0.349-0.073-0.14 1.485-0.203 2.901-0.224 3.937v0.005c-0.005 0.527-0.005 0.953-0.011 1.552 0.032 3.115-0.307 10.089 1.376 11.803 2.604 0.604 7.396 0.88 12.197 0.885h0.005c4.807-0.005 9.593-0.281 12.197-0.885 1.683-1.713 1.344-8.688 1.376-11.803-0.005-0.599-0.005-1.025-0.011-1.552v-0.005c-0.021-1.036-0.079-2.452-0.224-3.937-0.099 0.037-0.229 0.073-0.349 0.073 0 0-0.005 0-0.005 0-1.011 0-1.927-0.407-2.599-1.063h0.005c-0.245-0.235-0.479-0.489-0.645-0.787h-0.005c-0.167 0.297-0.355 0.552-0.595 0.787-0.667 0.656-1.583 1.063-2.599 1.063-1.011 0-1.927-0.407-2.599-1.063-0.24-0.229-0.443-0.495-0.615-0.787l-0.011-0.016c-0.172 0.308-0.38 0.573-0.615 0.803-0.672 0.656-1.588 1.063-2.599 1.063 0 0-0.005 0-0.005 0-0.031 0-0.068 0-0.104-0.005-0.036 0.005-0.073 0.005-0.109 0.005 0 0 0 0-0.005 0-1.011 0-1.927-0.407-2.593-1.063-0.24-0.229-0.443-0.495-0.609-0.787l-0.011-0.016zM10.005 13.875c1.057 0.005 1.995 0 3.161 1.271 0.916-0.093 1.875-0.14 2.833-0.14s1.917 0.047 2.833 0.14c1.167-1.271 2.104-1.271 3.161-1.271h0.005c0.5 0 2.5 0 3.891 3.912l1.495 5.369c1.109 3.995-0.355 4.095-2.177 4.095-2.708-0.1-4.208-2.068-4.208-4.037-1.5 0.251-3.251 0.371-5 0.371s-3.5-0.12-4.995-0.371c0 1.969-1.5 3.937-4.208 4.037-1.828-0.005-3.292-0.1-2.183-4.095l1.495-5.369c1.396-3.912 3.396-3.912 3.896-3.912zM16 16.953c-0.005 0-2.849 2.62-3.364 3.547l1.864-0.073v1.625c0 0.079 0.751 0.047 1.5 0.011 0.749 0.036 1.495 0.068 1.495-0.011v-1.625l1.869 0.073c-0.515-0.927-3.364-3.547-3.364-3.547z"/>`), "is-itch is-vwide"),
      "itch-io": wrap(svg("0 0 32 32", `<path d="M4.172 1.787c-1.396 0.828-4.145 3.984-4.172 4.812v1.375c0 1.735 1.625 3.267 3.099 3.267 1.771 0 3.251-1.469 3.251-3.213 0 1.744 1.421 3.213 3.197 3.213 1.771 0 3.151-1.469 3.151-3.213 0 1.744 1.516 3.213 3.287 3.213h0.032c1.776 0 3.291-1.469 3.291-3.213 0 1.744 1.381 3.213 3.152 3.213s3.197-1.469 3.197-3.213c0 1.744 1.475 3.213 3.245 3.213 1.479 0 3.104-1.532 3.104-3.267v-1.375c-0.032-0.828-2.776-3.984-4.177-4.812-4.339-0.156-7.344-0.183-11.823-0.183-4.484 0.005-10.593 0.073-11.828 0.183zM12.677 10.421c-0.183 0.308-0.385 0.568-0.625 0.797v0.005c-0.672 0.651-1.588 1.057-2.599 1.057-1.016 0-1.932-0.407-2.599-1.063-0.245-0.235-0.428-0.489-0.6-0.787-0.167 0.297-0.4 0.552-0.645 0.787-0.672 0.656-1.588 1.063-2.599 1.063 0 0 0 0-0.005 0-0.12 0-0.245-0.036-0.349-0.073-0.14 1.485-0.203 2.901-0.224 3.937v0.005c-0.005 0.527-0.005 0.953-0.011 1.552 0.032 3.115-0.307 10.089 1.376 11.803 2.604 0.604 7.396 0.88 12.197 0.885h0.005c4.807-0.005 9.593-0.281 12.197-0.885 1.683-1.713 1.344-8.688 1.376-11.803-0.005-0.599-0.005-1.025-0.011-1.552v-0.005c-0.021-1.036-0.079-2.452-0.224-3.937-0.099 0.037-0.229 0.073-0.349 0.073 0 0-0.005 0-0.005 0-1.011 0-1.927-0.407-2.599-1.063h0.005c-0.245-0.235-0.479-0.489-0.645-0.787h-0.005c-0.167 0.297-0.355 0.552-0.595 0.787-0.667 0.656-1.583 1.063-2.599 1.063-1.011 0-1.927-0.407-2.599-1.063-0.24-0.229-0.443-0.495-0.615-0.787l-0.011-0.016c-0.172 0.308-0.38 0.573-0.615 0.803-0.672 0.656-1.588 1.063-2.599 1.063 0 0-0.005 0-0.005 0-0.031 0-0.068 0-0.104-0.005-0.036 0.005-0.073 0.005-0.109 0.005 0 0 0 0-0.005 0-1.011 0-1.927-0.407-2.593-1.063-0.24-0.229-0.443-0.495-0.609-0.787l-0.011-0.016zM10.005 13.875c1.057 0.005 1.995 0 3.161 1.271 0.916-0.093 1.875-0.14 2.833-0.14s1.917 0.047 2.833 0.14c1.167-1.271 2.104-1.271 3.161-1.271h0.005c0.5 0 2.5 0 3.891 3.912l1.495 5.369c1.109 3.995-0.355 4.095-2.177 4.095-2.708-0.1-4.208-2.068-4.208-4.037-1.5 0.251-3.251 0.371-5 0.371s-3.5-0.12-4.995-0.371c0 1.969-1.5 3.937-4.208 4.037-1.828-0.005-3.292-0.1-2.183-4.095l1.495-5.369c1.396-3.912 3.396-3.912 3.896-3.912zM16 16.953c-0.005 0-2.849 2.62-3.364 3.547l1.864-0.073v1.625c0 0.079 0.751 0.047 1.5 0.011 0.749 0.036 1.495 0.068 1.495-0.011v-1.625l1.869 0.073c-0.515-0.927-3.364-3.547-3.364-3.547z"/>`), "is-itch is-vwide"),
      discord: wrap(svg("0 0 24 24", `<path d="M18.59 5.88997C17.36 5.31997 16.05 4.89997 14.67 4.65997C14.5 4.95997 14.3 5.36997 14.17 5.69997C12.71 5.47997 11.26 5.47997 9.83001 5.69997C9.69001 5.36997 9.49001 4.95997 9.32001 4.65997C7.94001 4.89997 6.63001 5.31997 5.40001 5.88997C2.92001 9.62997 2.25001 13.28 2.58001 16.87C4.23001 18.1 5.82001 18.84 7.39001 19.33C7.78001 18.8 8.12001 18.23 8.42001 17.64C7.85001 17.43 7.31001 17.16 6.80001 16.85C6.94001 16.75 7.07001 16.64 7.20001 16.54C10.33 18 13.72 18 16.81 16.54C16.94 16.65 17.07 16.75 17.21 16.85C16.7 17.16 16.15 17.42 15.59 17.64C15.89 18.23 16.23 18.8 16.62 19.33C18.19 18.84 19.79 18.1 21.43 16.87C21.82 12.7 20.76 9.08997 18.61 5.88997H18.59ZM8.84001 14.67C7.90001 14.67 7.13001 13.8 7.13001 12.73C7.13001 11.66 7.88001 10.79 8.84001 10.79C9.80001 10.79 10.56 11.66 10.55 12.73C10.55 13.79 9.80001 14.67 8.84001 14.67ZM15.15 14.67C14.21 14.67 13.44 13.8 13.44 12.73C13.44 11.66 14.19 10.79 15.15 10.79C16.11 10.79 16.87 11.66 16.86 12.73C16.86 13.79 16.11 14.67 15.15 14.67Z"/>`), "is-discord"),
      x: wrap(svg("0 0 24 24", `<path d="M18.9 3H21l-6.5 7.4L22 21h-5.9l-4.6-6.2L6 21H3.9l6.9-7.8L3 3h6l4.2 5.7L18.9 3Zm-1 16.3h1.6L8.1 4.6H6.4l11.5 14.7Z"/>`)),
      twitter: wrap(svg("0 0 24 24", `<path d="M18.9 3H21l-6.5 7.4L22 21h-5.9l-4.6-6.2L6 21H3.9l6.9-7.8L3 3h6l4.2 5.7L18.9 3Zm-1 16.3h1.6L8.1 4.6H6.4l11.5 14.7Z"/>`)),
      bluesky: wrap(svg("0 0 24 24", `<path d="M12 10.8c-1.087 -2.114 -4.046 -6.053 -6.798 -7.995C2.566 0.944 1.561 1.266 0.902 1.565 0.139 1.908 0 3.08 0 3.768c0 0.69 0.378 5.65 0.624 6.479 0.815 2.736 3.713 3.66 6.383 3.364 0.136 -0.02 0.275 -0.039 0.415 -0.056 -0.138 0.022 -0.276 0.04 -0.415 0.056 -3.912 0.58 -7.387 2.005 -2.83 7.078 5.013 5.19 6.87 -1.113 7.823 -4.308 0.953 3.195 2.05 9.271 7.733 4.308 4.267 -4.308 1.172 -6.498 -2.74 -7.078a8.741 8.741 0 0 1 -0.415 -0.056c0.14 0.017 0.279 0.036 0.415 0.056 2.67 0.297 5.568 -0.628 6.383 -3.364 0.246 -0.828 0.624 -5.79 0.624 -6.478 0 -0.69 -0.139 -1.861 -0.902 -2.206 -0.659 -0.298 -1.664 -0.62 -4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/>`), "is-bluesky is-wide"),
      deviantart: wrap(svg("0 0 32 32", `<path d="M25.006 6.996l0.288-0.538v-5.454h-5.458l-0.544 0.55-2.572 4.904-0.808 0.546h-9.184v7.488h5.048l0.45 0.546-5.218 9.972-0.3 0.538v5.448h5.456l0.544-0.55 2.588-4.904 0.804-0.546h9.184v-7.488h-5.060l-0.45-0.548 5.23-9.968 0.002 0.004z"/>`), "is-deviantart"),
      "deviant-art": wrap(svg("0 0 32 32", `<path d="M25.006 6.996l0.288-0.538v-5.454h-5.458l-0.544 0.55-2.572 4.904-0.808 0.546h-9.184v7.488h5.048l0.45 0.546-5.218 9.972-0.3 0.538v5.448h5.456l0.544-0.55 2.588-4.904 0.804-0.546h9.184v-7.488h-5.060l-0.45-0.548 5.23-9.968 0.002 0.004z"/>`), "is-deviantart"),
      vndb: wrap(svg("0 0 24 24", `<rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="none" stroke="currentColor" stroke-width="1.7"></rect><text x="12" y="15" text-anchor="middle" font-size="8.6" font-weight="900" font-family="Arial, sans-serif" fill="currentColor">VN</text>`), "is-vndb is-wide"),
      website: wrap(strokeSvg("0 0 24 24", `<circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17"></path><path d="M12 3c2.6 2.5 4 5.8 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.8-4-9s1.4-6.5 4-9Z"></path>`)),
      site: wrap(strokeSvg("0 0 24 24", `<circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17"></path><path d="M12 3c2.6 2.5 4 5.8 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.8-4-9s1.4-6.5 4-9Z"></path>`)),
      steam: wrap(svg("0 0 256 259", `<path d="M127.779 0C60.42 0 5.24 52.412 0 119.014l68.724 28.674a35.812 35.812 0 0 1 20.426-6.366c.682 0 1.356.019 2.02.056l30.566-44.71v-.626c0-26.903 21.69-48.796 48.353-48.796 26.662 0 48.352 21.893 48.352 48.796 0 26.902-21.69 48.804-48.352 48.804-.37 0-.73-.009-1.098-.018l-43.593 31.377c.028.582.046 1.163.046 1.735 0 20.204-16.283 36.636-36.294 36.636-17.566 0-32.263-12.658-35.584-29.412L4.41 164.654c15.223 54.313 64.673 94.132 123.369 94.132 70.818 0 128.221-57.938 128.221-129.393C256 57.93 198.597 0 127.779 0zM80.352 196.332l-15.749-6.568c2.787 5.867 7.621 10.775 14.033 13.47 13.857 5.83 29.836-.803 35.612-14.799a27.555 27.555 0 0 0 .046-21.035c-2.768-6.79-7.999-12.086-14.706-14.909-6.67-2.795-13.811-2.694-20.085-.304l16.275 6.79c10.222 4.3 15.056 16.145 10.794 26.46-4.253 10.314-15.998 15.195-26.22 10.895zm121.957-100.29c0-17.925-14.457-32.52-32.217-32.52-17.769 0-32.226 14.595-32.226 32.52 0 17.926 14.457 32.512 32.226 32.512 17.76 0 32.217-14.586 32.217-32.512zm-56.37-.055c0-13.488 10.84-24.42 24.2-24.42 13.368 0 24.208 10.932 24.208 24.42 0 13.488-10.84 24.421-24.209 24.421-13.359 0-24.2-10.933-24.2-24.42z"/>`), "is-steam"),
    };
    const candidates = [link?.type, link?.label]
      .map((value) => creatorSlug(value || ""))
      .filter(Boolean);
    const directKey = candidates.find((candidate) => icons[candidate]);
    if (directKey) return icons[directKey];

    const linkUrl = String(link?.url || "").toLowerCase();
    const domainRules = [
      [/boosty\.to(?:\/|$)/, "boosty"],
      [/buymeacoffee\.com(?:\/|$)/, "buymeacoffee"],
      [/subscribestar\.(?:com|adult)(?:\/|$)/, "subscribestar"],
      [/patreon\.com(?:\/|$)/, "patreon"],
      [/(?:discord\.gg|discord(?:app)?\.com)(?:\/|$)/, "discord"],
      [/bsky\.app(?:\/|$)/, "bluesky"],
      [/deviantart\.(?:com|net)(?:\/|$)/, "deviantart"],
      [/(?:x\.com|twitter\.com)(?:\/|$)/, "x"],
      [/vndb\.org(?:\/|$)/, "vndb"],
      [/itch\.io(?:\/|$)/, "itch"],
      [/(?:steampowered\.com|steamcommunity\.com)(?:\/|$)/, "steam"],
      [/f95zone\.to(?:\/|$)/, "f95zone"],
      [/github\.com(?:\/|$)/, "github"],
      [/(?:youtube\.com|youtu\.be)(?:\/|$)/, "youtube"],
    ];
    const matchedDomain = domainRules.find(([pattern, iconKey]) => pattern.test(linkUrl) && icons[iconKey]);
    if (matchedDomain) return icons[matchedDomain[1]];

    return icons[key] || icons.website;
  }

  function renderLink(link) {
    return `<a class="creatorLinkButton creatorLink-${escapeHtml(link.type)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${getLinkIconHtml(link)}<span class="creatorLinkButtonLabel">${escapeHtml(link.label)}</span></a>`;
  }

  async function renderGameCard(game) {
    const host = document.getElementById("creatorCard");
    if (!host) return;

    const creators = await fetchCreators();
    const profiles = getCreatorsForGame(creators, game);
    if (!profiles.length) {
      host.style.display = "none";
      host.innerHTML = "";
      return;
    }

    const cards = profiles.map((profile) => {
      const avatar = normalizeText(profile.avatar);
      const banner = normalizeText(profile.banner);
      const presentation = presentationExcerpt(profile.presentation || profile.shortPresentation);
      const intro = presentation || "Découvre les jeux et les informations de ce créateur.";
      const links = profile.links;
      const backdrop = banner
        ? `<span class="creatorBackdrop" aria-hidden="true"><img src="${escapeHtml(banner)}" alt="" referrerpolicy="no-referrer"></span><span class="creatorBackdropShade" aria-hidden="true"></span>`
        : "";

      return `
        <article class="creatorMiniProfile${banner ? " creatorHasBackdrop" : ""}">
          ${backdrop}
          <a class="creatorIdentity" href="${escapeHtml(buildCreatorUrl(profile))}" target="_blank" rel="noopener noreferrer">
            ${avatar
              ? `<img class="creatorAvatar" src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer">`
              : `<span class="creatorAvatar creatorAvatarFallback" aria-hidden="true">${escapeHtml(creatorInitial(profile.name))}</span>`}
            <span class="creatorIdentityText">
              <strong>${escapeHtml(profile.name)}</strong>
              <span>Voir la fiche du créateur</span>
            </span>
          </a>
          <p class="creatorMiniText">${escapeHtml(intro)}</p>
          ${links.length ? `<div class="creatorLinks creatorLinksCompact">${links.map(renderLink).join("")}</div>` : ""}
        </article>`;
    });

    host.innerHTML = `<h3>Un jeu de</h3>${cards.join("")}`;
    host.style.display = "";
  }

  window.CreatorFeature = {
    creatorSlug,
    getCreatorRefs,
    getCreatorIds,
    getCreatorNames,
    getCreatorsForGame,
    getGameId,
    fetchCreators,
    findCreator,
    buildCreatorUrl,
    renderGameCard,
    normalizeLinks,
    getLinkLabel,
  };
})();
