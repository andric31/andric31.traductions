"use strict";

(function () {
  const CREATOR_DATA_URLS = ["/data/creators.json", "../data/creators.json"];
  let creatorPromise = null;

  function normalizeText(value) {
    return String(value ?? "").trim();
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

    // Le slash est conservé dans certains noms. On ne le découpe que lorsqu'il est entouré d'espaces.
    return last.split(/\s*(?:\/|&|\band\b)\s*/i).map(normalizeText).filter(Boolean);
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

  function renderLink(link) {
    return `<a class="creatorLinkButton creatorLink-${escapeHtml(link.type)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`;
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
      const presentation = normalizeText(profile.shortPresentation || profile.presentation);
      const intro = presentation || "Découvre les jeux et les informations de ce créateur.";
      const links = profile.links.slice(0, 4);

      return `
        <article class="creatorMiniProfile">
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

    host.innerHTML = `<h3>👤 Créateur${cards.length > 1 ? "s" : ""}</h3>${cards.join("")}`;
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
