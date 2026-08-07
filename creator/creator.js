"use strict";

(function () {
  const DEFAULT_LIST_URLS = [
    "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json",
    "/api/f95list",
    "/data/f95list.json",
  ];

  // La page Créateurs reste autonome. Ainsi, l'annuaire fonctionne même si
  // /game/game.creator.js est absent, mis en cache ou chargé en retard.
  if (!window.CreatorFeature) {
    const CREATOR_DATA_URLS = ["/data/creators.json", "../data/creators.json"];
    let creatorPromise = null;

    const normalizeText = (value) => String(value ?? "").trim();

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

    function getDisplayData(game) {
      return game && typeof game === "object" && game.gameData && typeof game.gameData === "object"
        ? game.gameData
        : game && typeof game === "object"
          ? game
          : {};
    }

    function extractCreatorNamesFromTitle(game) {
      const display = getDisplayData(game);
      const source = normalizeText(game?.cleanTitle || display.cleanTitle || display.title || game?.title);
      if (!source) return [];

      const matches = [...source.matchAll(/\[([^\]]+)\]/g)];
      if (!matches.length) return [];

      const last = normalizeText(matches[matches.length - 1]?.[1]);
      if (!last || /^v(?:ersion)?\b/i.test(last)) return [];

      return last
        .split(/\s+(?:\/|&|and)\s+/i)
        .map(normalizeText)
        .filter(Boolean);
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
        display.creatorIds,
        game?.creators,
        display.creators,
        game?.creator,
        display.creator,
      ];

      for (const candidate of candidates) {
        const refs = normalizeCreatorRefs(candidate);
        if (refs.length) return refs;
      }

      return extractCreatorNamesFromTitle(game)
        .map((name) => ({ id: creatorSlug(name), name }))
        .filter((ref) => ref.id);
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
          aliases: Array.isArray(item.aliases)
            ? item.aliases.map(normalizeText).filter(Boolean)
            : [],
          gameIds: normalizeGameIds(item.gameIds || item.gameRefs || []),
          ignoredGameIds: normalizeGameIds(item.ignoredGameIds || item.ignoreGameIds || item.excludedGameIds || []),
          links: normalizeLinks(item.links),
        };
      }).filter(Boolean);
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
      const target = creatorSlug(ref?.id || ref?.name || ref);
      if (!target || !Array.isArray(creators)) return null;
      return creators.find((creator) => {
        if (!creator || typeof creator !== "object") return false;
        if (creatorSlug(creator.id) === target) return true;
        if (creatorSlug(creator.name) === target) return true;
        const aliases = Array.isArray(creator.aliases) ? creator.aliases : [];
        return aliases.some((alias) => creatorSlug(alias) === target);
      }) || null;
    }

    function getGameId(game) {
      const display = getDisplayData(game);
      return normalizeText(game?.id || display?.id);
    }

    function creatorMatchesRef(creator, ref) {
      const target = creatorSlug(ref?.id || ref?.name || ref);
      if (!target || !creator) return false;
      if (creatorSlug(creator.id) === target) return true;
      if (creatorSlug(creator.name) === target) return true;
      const aliases = Array.isArray(creator.aliases) ? creator.aliases : [];
      return aliases.some((alias) => creatorSlug(alias) === target);
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
          add({ id: ref.id, name: ref.name, aliases: [], gameIds: [], ignoredGameIds: [], links: [] });
        }
      }
      return out;
    }

    function buildCreatorUrl(creator) {
      const id = creatorSlug(creator?.id || creator?.name || creator);
      const name = normalizeText(creator?.name);
      const params = new URLSearchParams();
      if (id) params.set("id", id);
      if (name) params.set("name", name);
      return `/creator/?${params.toString()}`;
    }

    window.CreatorFeature = {
      creatorSlug,
      getCreatorRefs,
      getCreatorsForGame,
      getGameId,
      fetchCreators,
      findCreator,
      buildCreatorUrl,
      normalizeLinks,
      getLinkLabel,
    };
  }

  function getListUrls() {
    try {
      const src = String(new URLSearchParams(location.search).get("src") || "").trim();
      if (src) return [src, ...DEFAULT_LIST_URLS];
    } catch {}
    return DEFAULT_LIST_URLS;
  }

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function extractGames(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];
    for (const key of ["games", "list", "items", "data", "rows", "results"]) {
      if (Array.isArray(raw[key])) return raw[key];
    }
    return [];
  }

  async function fetchFirstJson(urls) {
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Données indisponibles");
  }

  function getDisplay(game) {
    return game && game.gameData ? game.gameData : game || {};
  }

  function getTitle(game) {
    const display = getDisplay(game);
    return String(display.cleanTitle || display.title || game.cleanTitle || game.title || "Sans titre").trim();
  }

  function getGameUrl(game) {
    const id = String(game?.id || "").trim();
    const uid = String(game?.uid || "").trim();
    const collection = String(game?.collection || "").trim();
    const params = new URLSearchParams();
    if (collection && uid) {
      params.set("id", collection);
      params.set("uid", uid);
    } else {
      if (id) params.set("id", id);
      if (uid && !id) params.set("uid", uid);
    }
    return `/game/?${params.toString()}`;
  }

  function getVersion(game) {
    const display = getDisplay(game);
    return String(display.version || game.version || "").trim();
  }

  function fallbackName(id) {
    return String(id || "")
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || "Créateur inconnu";
  }

  function renderProfile(profile, requestedName) {
    const name = String(profile?.name || requestedName || fallbackName(profile?.id)).trim();
    document.title = `${name} · Créateur`;
    $("creatorName").textContent = name;

    const aliases = Array.isArray(profile?.aliases) ? profile.aliases.filter(Boolean) : [];
    if (aliases.length) {
      $("creatorAliases").textContent = `Également connu sous : ${aliases.join(", ")}`;
      $("creatorAliases").style.display = "";
    }

    const avatar = String(profile?.avatar || "").trim();
    const avatarHost = $("creatorAvatar");
    if (avatar) {
      const img = document.createElement("img");
      img.id = "creatorAvatar";
      img.className = "creatorPageAvatar";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = avatar;
      avatarHost.replaceWith(img);
    } else {
      avatarHost.textContent = name.charAt(0).toUpperCase() || "?";
    }

    const banner = String(profile?.banner || "").trim();
    if (banner) $("creatorBanner").style.backgroundImage = `url("${banner.replace(/"/g, "\\\"")}")`;

    const presentation = String(profile?.presentation || "").trim();
    $("creatorPresentation").textContent = presentation || "Présentation non renseignée pour le moment.";

    const links = Array.isArray(profile?.links) ? profile.links : [];
    if (!links.length) {
      $("creatorNoLinks").style.display = "";
    } else {
      $("creatorLinks").innerHTML = links.map((link) => `
        <a class="creatorPageLink" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(link.label || window.CreatorFeature?.getLinkLabel?.(link.type) || "Lien")}
        </a>`).join("");
    }
  }

  function renderGames(games) {
    $("creatorGamesCount").textContent = `${games.length} jeu${games.length > 1 ? "x" : ""} trouvé${games.length > 1 ? "s" : ""}`;
    if (!games.length) {
      $("creatorNoGames").style.display = "";
      return;
    }

    $("creatorGames").innerHTML = games.map((game) => {
      const display = getDisplay(game);
      const image = String(display.imageUrl || game.imageUrl || "/favicon.png").trim() || "/favicon.png";
      const version = getVersion(game);
      return `
        <a class="creatorGameCard" href="${escapeHtml(getGameUrl(game))}">
          <img class="creatorGameThumb" src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/favicon.png'">
          <div class="creatorGameBody">
            <h3 class="creatorGameTitle">${escapeHtml(getTitle(game))}</h3>
            ${version ? `<div class="creatorGameMeta">Version ${escapeHtml(version)}</div>` : ""}
          </div>
        </a>`;
    }).join("");
  }

  function buildDirectoryEntries(creators, games) {
    const entries = new Map();

    function ensure(profile) {
      const id = window.CreatorFeature.creatorSlug(profile?.id || profile?.name || "");
      if (!id) return null;
      if (!entries.has(id)) {
        entries.set(id, {
          id,
          name: String(profile?.name || fallbackName(id)).trim(),
          aliases: Array.isArray(profile?.aliases) ? profile.aliases.filter(Boolean) : [],
          avatar: String(profile?.avatar || "").trim(),
          presentation: String(profile?.shortPresentation || profile?.presentation || "").trim(),
          links: Array.isArray(profile?.links) ? profile.links : [],
          gameIds: Array.isArray(profile?.gameIds) ? profile.gameIds : [],
          ignoredGameIds: Array.isArray(profile?.ignoredGameIds) ? profile.ignoredGameIds : [],
          games: [],
        });
      }
      return entries.get(id);
    }

    creators.forEach(ensure);

    games.forEach((game) => {
      const profiles = window.CreatorFeature.getCreatorsForGame(creators, game);
      profiles.forEach((profile) => {
        const entry = ensure(profile);
        if (!entry) return;
        entry.games.push(game);
      });
    });

    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }

  function creatorCard(entry) {
    const avatar = entry.avatar
      ? `<img class="creatorDirectoryAvatar" src="${escapeHtml(entry.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : "";
    const fallbackStyle = entry.avatar ? "display:none" : "";
    const gameCount = entry.games.length;
    const summary = entry.presentation || "Fiche du créateur et liste de ses jeux présents sur le site.";

    return `
      <a class="creatorDirectoryCard" href="${escapeHtml(window.CreatorFeature.buildCreatorUrl(entry))}" data-search="${escapeHtml([entry.name, ...entry.aliases].join(" ").toLowerCase())}">
        <div class="creatorDirectoryIdentity">
          ${avatar}
          <span class="creatorDirectoryAvatar creatorDirectoryAvatarFallback" style="${fallbackStyle}" aria-hidden="true">${escapeHtml(entry.name.charAt(0).toUpperCase() || "?")}</span>
          <div class="creatorDirectoryIdentityText">
            <h2 class="creatorDirectoryName">${escapeHtml(entry.name)}</h2>
            <div class="creatorDirectoryGames">${gameCount} jeu${gameCount > 1 ? "x" : ""}</div>
          </div>
        </div>
        <p class="creatorDirectoryDescription">${escapeHtml(summary)}</p>
        <div class="creatorDirectoryOpen">Voir la fiche →</div>
      </a>`;
  }

  function renderDirectory(entries) {
    const grid = $("creatorDirectoryGrid");
    const input = $("creatorSearch");
    const count = $("creatorDirectoryCount");
    const empty = $("creatorDirectoryEmpty");

    grid.innerHTML = entries.map(creatorCard).join("");

    function update() {
      const query = String(input.value || "").trim().toLocaleLowerCase("fr");
      let visible = 0;
      grid.querySelectorAll(".creatorDirectoryCard").forEach((card) => {
        const match = !query || String(card.dataset.search || "").includes(query);
        card.style.display = match ? "" : "none";
        if (match) visible += 1;
      });
      count.textContent = `${visible} créateur${visible > 1 ? "s" : ""}`;
      empty.style.display = visible ? "none" : "";
    }

    input.addEventListener("input", update);
    update();
  }

  async function showDirectory(creators, allGames) {
    document.title = "Créateurs";
    $("creatorBack").href = "/";
    $("creatorBack").textContent = "← Retour aux jeux";
    $("creatorDirectory").style.display = "";
    renderDirectory(buildDirectoryEntries(creators, allGames));
  }

  async function showProfile(creators, allGames, requestedId, requestedName) {
    $("creatorBack").href = "/creator/";
    $("creatorBack").textContent = "← Tous les créateurs";
    $("creatorProfile").style.display = "";

    const profile = window.CreatorFeature.findCreator(creators, { id: requestedId, name: requestedName }) || {
      id: requestedId,
      name: requestedName || fallbackName(requestedId),
      aliases: [],
      avatar: "",
      banner: "",
      presentation: "",
      links: [],
    };
    renderProfile(profile, requestedName);

    const games = allGames.filter((game) => {
      return window.CreatorFeature.getCreatorsForGame(creators, game)
        .some((matched) => window.CreatorFeature.creatorSlug(matched?.id || matched?.name) === profile.id);
    });
    games.sort((a, b) => getTitle(a).localeCompare(getTitle(b), "fr"));
    renderGames(games);
  }

  async function init() {
    try {
      const params = new URLSearchParams(location.search);
      const requestedId = window.CreatorFeature.creatorSlug(params.get("id") || "");
      const requestedName = String(params.get("name") || "").trim();

      const [creators, raw] = await Promise.all([
        window.CreatorFeature.fetchCreators(),
        fetchFirstJson(getListUrls()),
      ]);
      const allGames = extractGames(raw);

      if (requestedId) {
        await showProfile(creators, allGames, requestedId, requestedName);
      } else {
        await showDirectory(creators, allGames);
      }
    } catch (error) {
      $("creatorError").textContent = String(error?.message || error || "Erreur inconnue");
      if ($("creatorPresentation")) $("creatorPresentation").textContent = "Impossible de charger cette fiche.";
    }
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== "viewerTheme") return;
    try {
      const theme = (localStorage.getItem("viewerTheme") || "auto").trim() || "auto";
      document.documentElement.removeAttribute("data-theme");
      if (theme !== "auto") document.documentElement.setAttribute("data-theme", theme);
    } catch {}
  });

  init();
})();
