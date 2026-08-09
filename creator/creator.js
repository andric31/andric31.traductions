"use strict";

(function () {
  const DEFAULT_LIST_URLS = [
    "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json",
    "/api/f95list",
    "/data/f95list.json",
  ];

  function getLinkIcon(type, label, url) {
    const key = String(type || label || url || "website")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const iconClass = "creatorLinkSvg";
    const wrap = (svg, extraClass = "") => `<span class="creatorPageLinkIcon ${extraClass}" aria-hidden="true">${svg}</span>`;
    const svg = (viewBox, path, extra = "") => `<svg class="${iconClass}" viewBox="${viewBox}" fill="currentColor" aria-hidden="true" focusable="false" ${extra}>${path}</svg>`;
    const strokeSvg = (viewBox, path, extra = "") => `<svg class="${iconClass}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${path}</svg>`;

    const icons = {
      patreon: wrap(svg("0 0 24 24", `<path d="M15.5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm-11 0h3v17h-3z"/>`)),
      discord: wrap(svg("4 5 16 14", `<path d="M18.2 6.8A14.7 14.7 0 0 0 14.6 5l-.4.8a10.4 10.4 0 0 1 3.1 1.5 11.4 11.4 0 0 0-5.3-1.2c-1.8 0-3.6.4-5.3 1.2a10.4 10.4 0 0 1 3.1-1.5L9.4 5a14.7 14.7 0 0 0-3.6 1.8c-2 3-2.6 5.9-2.3 8.8 1.6 1.2 3.2 1.9 4.7 2.3l1-1.6c-.8-.3-1.6-.6-2.3-1 1.8.8 3.4 1.2 5.1 1.2s3.3-.4 5.1-1.2c-.7.4-1.5.7-2.3 1l1 1.6c1.5-.4 3.1-1.1 4.7-2.3.4-3-.2-5.8-2.3-8.8ZM9.5 13.8c-.8 0-1.4-.8-1.4-1.7 0-1 .6-1.7 1.4-1.7.8 0 1.4.8 1.4 1.7 0 1-.6 1.7-1.4 1.7Zm5 0c-.8 0-1.4-.8-1.4-1.7 0-1 .6-1.7 1.4-1.7.8 0 1.4.8 1.4 1.7 0 1-.6 1.7-1.4 1.7Z"/>`), "is-discord"),
      x: wrap(svg("0 0 24 24", `<path d="M18.9 3H21l-6.5 7.4L22 21h-5.9l-4.6-6.2L6 21H3.9l6.9-7.8L3 3h6l4.2 5.7L18.9 3Zm-1 16.3h1.6L8.1 4.6H6.4l11.5 14.7Z"/>`)),
      twitter: wrap(svg("0 0 24 24", `<path d="M18.9 3H21l-6.5 7.4L22 21h-5.9l-4.6-6.2L6 21H3.9l6.9-7.8L3 3h6l4.2 5.7L18.9 3Zm-1 16.3h1.6L8.1 4.6H6.4l11.5 14.7Z"/>`)),
      bluesky: wrap(svg("3 3.5 18 17", `<path d="M12 11.4C10.4 8.8 8.2 6.6 5.8 5.1c-.8-.5-1.7.1-1.7 1 .1 2 .9 3.9 2.3 5.3 1.2 1.2 2.6 1.9 4.1 2.2-1.4.3-2.6 1-3.6 2.1-1 1.1-1.6 2.5-1.7 4-.1.8.7 1.4 1.5 1.1 2.4-.8 4.4-2.6 5.9-5 1.5 2.4 3.5 4.2 5.9 5 .8.3 1.6-.3 1.5-1.1-.1-1.5-.7-2.9-1.7-4-1-1.1-2.2-1.8-3.6-2.1 1.5-.3 2.9-1 4.1-2.2 1.4-1.4 2.2-3.3 2.3-5.3.1-.9-.9-1.5-1.7-1-2.4 1.5-4.6 3.7-6.2 6.3Z"/>`), "is-bluesky is-wide"),
      vndb: wrap(svg("0 0 24 24", `<rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="none" stroke="currentColor" stroke-width="1.7"></rect><text x="12" y="15" text-anchor="middle" font-size="8.6" font-weight="900" font-family="Arial, sans-serif" fill="currentColor">VN</text>`), "is-vndb is-wide"),
      website: wrap(strokeSvg("0 0 24 24", `<circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17"></path><path d="M12 3c2.6 2.5 4 5.8 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.8-4-9s1.4-6.5 4-9Z"></path>`)),
      site: wrap(strokeSvg("0 0 24 24", `<circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17"></path><path d="M12 3c2.6 2.5 4 5.8 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.8-4-9s1.4-6.5 4-9Z"></path>`)),
      steam: wrap(svg("0 0 256 259", `<path d="M127.779 0C60.42 0 5.24 52.412 0 119.014l68.724 28.674a35.812 35.812 0 0 1 20.426-6.366c.682 0 1.356.019 2.02.056l30.566-44.71v-.626c0-26.903 21.69-48.796 48.353-48.796 26.662 0 48.352 21.893 48.352 48.796 0 26.902-21.69 48.804-48.352 48.804-.37 0-.73-.009-1.098-.018l-43.593 31.377c.028.582.046 1.163.046 1.735 0 20.204-16.283 36.636-36.294 36.636-17.566 0-32.263-12.658-35.584-29.412L4.41 164.654c15.223 54.313 64.673 94.132 123.369 94.132 70.818 0 128.221-57.938 128.221-129.393C256 57.93 198.597 0 127.779 0zM80.352 196.332l-15.749-6.568c2.787 5.867 7.621 10.775 14.033 13.47 13.857 5.83 29.836-.803 35.612-14.799a27.555 27.555 0 0 0 .046-21.035c-2.768-6.79-7.999-12.086-14.706-14.909-6.67-2.795-13.811-2.694-20.085-.304l16.275 6.79c10.222 4.3 15.056 16.145 10.794 26.46-4.253 10.314-15.998 15.195-26.22 10.895zm121.957-100.29c0-17.925-14.457-32.52-32.217-32.52-17.769 0-32.226 14.595-32.226 32.52 0 17.926 14.457 32.512 32.226 32.512 17.76 0 32.217-14.586 32.217-32.512zm-56.37-.055c0-13.488 10.84-24.42 24.2-24.42 13.368 0 24.208 10.932 24.208 24.42 0 13.488-10.84 24.421-24.209 24.421-13.359 0-24.2-10.933-24.2-24.42z"/>`), "is-steam"),
      patreon: wrap(svg("0 0 24 24", `<path d="M15.5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm-11 0h3v17h-3z"/>`)),
      itch: wrap(svg("0 0 32 32", `<path d="M16 5C12.748 5 8.3121094 5.0508594 7.4121094 5.1308594C6.4021094 5.7368594 4.4028125 8.0309531 4.3828125 8.6269531L4.3828125 9.6269531C4.3828125 10.889953 5.5657188 12 6.6367188 12C7.9197187 12 8.9902344 10.929969 8.9902344 9.6679688C8.9902344 10.929969 10.0305 12 11.3125 12C12.6055 12 13.605469 10.930969 13.605469 9.6679688C13.605469 10.929969 14.695281 12 15.988281 12L16.009766 12C17.302766 12 18.392578 10.930969 18.392578 9.6679688C18.392578 10.929969 19.402547 12 20.685547 12C21.968547 12 23.009766 10.930969 23.009766 9.6679688C23.009766 10.929969 24.080281 12 25.363281 12C26.434281 12 27.615234 10.889953 27.615234 9.6269531L27.615234 8.6269531C27.595234 8.0309531 25.595938 5.7368594 24.585938 5.1308594C21.443938 5.0198594 19.252 5 16 5ZM13.550781 11.742188C12.497781 13.552188 9.8523125 13.573906 8.8203125 11.753906C8.1903125 12.845906 6.7642969 13.267547 6.1542969 13.060547C5.9762969 14.959547 5.8534844 24.70875 7.1464844 26.34375C10.943484 27.22875 21.164516 27.20975 24.853516 26.34375C26.348516 24.81975 26.013703 14.821547 25.845703 13.060547C25.235703 13.267547 23.809453 12.845906 23.189453 11.753906C22.146453 13.573906 19.501219 13.552188 18.449219 11.742188C18.124219 12.332187 17.367 13.109375 16 13.109375C14.997 13.148375 14.051781 12.607187 13.550781 11.742188ZM11.419922 14C12.219922 14 12.950078 14.000469 13.830078 14.980469C15.280078 14.830469 16.719922 14.830469 18.169922 14.980469C19.059922 14.010469 19.780078 14.009766 20.580078 14.009766C23.160078 14.009766 23.780937 17.819609 24.710938 21.099609C25.550938 24.149609 24.429062 24.230469 23.039062 24.230469C20.969062 24.150469 19.820313 22.650625 19.820312 21.140625C17.890313 21.460625 14.809688 21.580625 12.179688 21.140625C12.179688 22.650625 11.030938 24.150469 8.9609375 24.230469C7.5709375 24.230469 6.4490625 24.149609 7.2890625 21.099609C8.2190625 17.799609 8.8399219 14.009766 11.419922 14.009766L11.419922 14ZM16 16.876953C16 16.876953 14.306 18.439375 14 18.984375L15.107422 18.943359L15.107422 19.910156C15.107422 19.968156 15.926 19.917969 16 19.917969C16.447 19.934969 16.892578 19.951156 16.892578 19.910156L16.892578 18.943359L18 18.984375C17.694 18.438375 16 16.876953 16 16.876953Z"/>`), "is-itch is-vwide"),
      "itch-io": wrap(svg("0 0 32 32", `<path d="M16 5C12.748 5 8.3121094 5.0508594 7.4121094 5.1308594C6.4021094 5.7368594 4.4028125 8.0309531 4.3828125 8.6269531L4.3828125 9.6269531C4.3828125 10.889953 5.5657188 12 6.6367188 12C7.9197187 12 8.9902344 10.929969 8.9902344 9.6679688C8.9902344 10.929969 10.0305 12 11.3125 12C12.6055 12 13.605469 10.930969 13.605469 9.6679688C13.605469 10.929969 14.695281 12 15.988281 12L16.009766 12C17.302766 12 18.392578 10.930969 18.392578 9.6679688C18.392578 10.929969 19.402547 12 20.685547 12C21.968547 12 23.009766 10.930969 23.009766 9.6679688C23.009766 10.929969 24.080281 12 25.363281 12C26.434281 12 27.615234 10.889953 27.615234 9.6269531L27.615234 8.6269531C27.595234 8.0309531 25.595938 5.7368594 24.585938 5.1308594C21.443938 5.0198594 19.252 5 16 5ZM13.550781 11.742188C12.497781 13.552188 9.8523125 13.573906 8.8203125 11.753906C8.1903125 12.845906 6.7642969 13.267547 6.1542969 13.060547C5.9762969 14.959547 5.8534844 24.70875 7.1464844 26.34375C10.943484 27.22875 21.164516 27.20975 24.853516 26.34375C26.348516 24.81975 26.013703 14.821547 25.845703 13.060547C25.235703 13.267547 23.809453 12.845906 23.189453 11.753906C22.146453 13.573906 19.501219 13.552188 18.449219 11.742188C18.124219 12.332187 17.367 13.109375 16 13.109375C14.997 13.148375 14.051781 12.607187 13.550781 11.742188ZM11.419922 14C12.219922 14 12.950078 14.000469 13.830078 14.980469C15.280078 14.830469 16.719922 14.830469 18.169922 14.980469C19.059922 14.010469 19.780078 14.009766 20.580078 14.009766C23.160078 14.009766 23.780937 17.819609 24.710938 21.099609C25.550938 24.149609 24.429062 24.230469 23.039062 24.230469C20.969062 24.150469 19.820313 22.650625 19.820312 21.140625C17.890313 21.460625 14.809688 21.580625 12.179688 21.140625C12.179688 22.650625 11.030938 24.150469 8.9609375 24.230469C7.5709375 24.230469 6.4490625 24.149609 7.2890625 21.099609C8.2190625 17.799609 8.8399219 14.009766 11.419922 14.009766L11.419922 14ZM16 16.876953C16 16.876953 14.306 18.439375 14 18.984375L15.107422 18.943359L15.107422 19.910156C15.107422 19.968156 15.926 19.917969 16 19.917969C16.447 19.934969 16.892578 19.951156 16.892578 19.910156L16.892578 18.943359L18 18.984375C17.694 18.438375 16 16.876953 16 16.876953Z"/>`), "is-itch is-vwide"),
      github: wrap(svg("0 0 24 24", `<path d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.6-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.3 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.6-2.8 5.5-5.5 5.8.4.4.9 1.1.9 2.2v3.3c0 .3.2.7.8.6A11.3 11.3 0 0 0 12 .7Z"/>`)),
      youtube: wrap(svg("0 0 24 24", `<path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8c.2.9.9 1.6 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z"/>`)),
      instagram: wrap(strokeSvg("0 0 24 24", `<rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.6" cy="6.4" r=".9" fill="currentColor" stroke="none"></circle>`)),
      tiktok: wrap(svg("0 0 24 24", `<path d="M14.8 3h2.4c.2 1.8 1.2 3.4 2.8 4.2v2.4a7.1 7.1 0 0 1-2.8-.9v5.6a5.3 5.3 0 1 1-5.3-5.2c.3 0 .7 0 1 .1v2.4a2.9 2.9 0 1 0 1.9 2.7V3Z"/>`)),
      facebook: wrap(svg("0 0 24 24", `<path d="M13.4 21v-7h2.4l.4-3h-2.8V9.1c0-.9.2-1.5 1.5-1.5h1.5V5c-.7-.1-1.5-.1-2.2-.1-2.2 0-3.7 1.4-3.7 3.9V11H8v3h2.5v7h2.9Z"/>`)),
      pixiv: wrap(svg("0 0 24 24", `<path d="M6 5.5h5.4c3.6 0 5.6 2.2 5.6 5.2 0 3.1-2.4 5.3-5.7 5.3H8.7V20H6V5.5Zm2.7 2.3v6h2.5c1.8 0 3-.9 3-3s-1.3-3-3.1-3H8.7Z"/>`)),
      booth: wrap(svg("0 0 24 24", `<path d="M5 4h9.4c2.8 0 4.6 1.5 4.6 3.8 0 1.6-.8 2.7-2.2 3.3 1.8.5 2.9 1.9 2.9 3.9 0 2.8-2.3 4.9-5.5 4.9H5V4Zm2.7 2.3v3.8h5.7c1.5 0 2.4-.7 2.4-1.9s-.9-1.9-2.4-1.9H7.7Zm0 6v4.3H14c1.8 0 2.9-.8 2.9-2.2 0-1.3-1-2.1-2.9-2.1H7.7Z"/>`)),
      dlsite: wrap(svg("0 0 24 24", `<path d="M6 5h4.2c4.6 0 7.8 2.7 7.8 7s-3.2 7-7.8 7H6V5Zm2.8 2.4v9.2h1.2c3.2 0 5.1-1.5 5.1-4.6S13.2 7.4 10 7.4H8.8Zm10.2-1.8h2.2V19H19z"/>`)),
      cien: wrap(svg("0 0 24 24", `<path d="M12 3 4.5 7.3v9.4L12 21l7.5-4.3V7.3L12 3Zm0 2.5 5 2.9-5 2.9-5-2.9 5-2.9Zm-5 5.2 4 2.3v4.8l-4-2.3v-4.8Zm6 7.1V13l4-2.3v4.8l-4 2.3Z"/>`)),
      f95: wrap(strokeSvg("0 0 24 24", `<circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17"></path><path d="M12 3c2.6 2.5 4 5.8 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.8-4-9s1.4-6.5 4-9Z"></path>`)),
      f95zone: wrap(strokeSvg("0 0 24 24", `<circle cx="12" cy="12" r="9"></circle><path d="M3.5 12h17"></path><path d="M12 3c2.6 2.5 4 5.8 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.8-4-9s1.4-6.5 4-9Z"></path>`)),
      subscribestar: wrap(svg("0 0 24 24", `<path d="m12 2.5 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9l6.2-.9L12 2.5Z"/>`)),
      buymeacoffee: wrap(svg("0 0 24 24", `<path d="M6 7h11v2.5A4.5 4.5 0 0 1 12.5 14H9.5A3.5 3.5 0 0 1 6 10.5V7Zm12.5 1.5H20a2 2 0 0 1 0 4h-1.5v-4ZM7 16h10v1.5a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 17.5V16Z"/>`)),
      kofi: wrap(svg("0 0 24 24", `<path d="M6 7.5c0-1.4 1.1-2.5 2.5-2.5 1 0 2 .6 2.5 1.4C11.5 5.6 12.5 5 13.5 5 15.9 5 18 7 18 9.5c0 4.4-6 8.5-6 8.5s-6-4.1-6-8.5Z"/>`)),
      fanbox: wrap(svg("0 0 24 24", `<path d="M4 4h16v4H4V4Zm0 6h10v10H4V10Zm12 0h4v10h-4V10Z"/>`)),
      linktree: wrap(svg("0 0 24 24", `<path d="M10.7 2h2.6v5h4.2l-5.5 5.5L6.5 7h4.2V2Zm-6 13h14.6v2.5H4.7V15Zm5.9 2.6h2.8V22h-2.8v-4.4Z"/>`)),
      wikidata: wrap(svg("0 0 24 24", `<path d="M4 4h3v16H4V4Zm5 2h2v12H9V6Zm4-2h2v16h-2V4Zm4 3h3v10h-3V7Z"/>`)),
    };

    if (icons[key]) return icons[key];
    return wrap(strokeSvg("0 0 24 24", `<path d="M10 13a5 5 0 0 1 0-7l1.2-1.2a5 5 0 0 1 7 7L16.8 13"></path><path d="M14 11a5 5 0 0 1 0 7l-1.2 1.2a5 5 0 0 1-7-7L7.2 11"></path>`));
  }

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

      // Seul le slash est interprété comme une séparation entre plusieurs créateurs.
      // "and" et "&" restent dans le nom.
      return last
        .split(/\s*\/\s*/)
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
        vndb: "VNDB",
        dlsite: "DLsite",
        cien: "Ci-en",
        pixiv: "Pixiv",
        booth: "BOOTH",
        itch: "Itch.io",
        "itch-io": "Itch.io",
        steam: "Steam",
        patreon: "Patreon",
        subscribestar: "SubscribeStar",
        buymeacoffee: "Buy Me a Coffee",
        kofi: "Ko-fi",
        fanbox: "FANBOX",
        discord: "Discord",
        f95zone: "F95Zone",
        f95: "F95Zone",
        instagram: "Instagram",
        twitter: "X / Twitter",
        x: "X / Twitter",
        bluesky: "Bluesky",
        youtube: "YouTube",
        github: "GitHub",
        linktree: "Linktree",
        facebook: "Facebook",
        tiktok: "TikTok",
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
          countryCode: normalizeText(item.countryCode || item.country_code).toUpperCase(),
          country: normalizeText(item.country),
          creatorType: normalizeText(item.creatorType),
          primaryLanguage: normalizeText(item.primaryLanguage || item.primary_language).toLowerCase(),
          vndbId: normalizeText(item.vndbId || item.vndb).toLowerCase(),
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

  function flagEmoji(code) {
    const value = String(code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) return "🌐";
    return String.fromCodePoint(...[...value].map((char) => 127397 + char.charCodeAt(0)));
  }

  function regionName(code) {
    const value = String(code || "").trim().toUpperCase();
    if (!value) return "";
    try { return new Intl.DisplayNames(["fr"], { type: "region" }).of(value) || value; } catch { return value; }
  }

  function languageName(code) {
    const value = String(code || "").trim().toLowerCase();
    if (!value) return "";
    try {
      const label = new Intl.DisplayNames(["fr"], { type: "language" }).of(value);
      return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
    } catch { return value.toUpperCase(); }
  }

  function creatorTypeLabel(value) {
    return ({ company: "Société / studio", individual: "Individu", amateur_group: "Groupe amateur / cercle", other: "Autre" })[String(value || "").trim()] || "";
  }

  function creatorMetaData(profile) {
    const items = [];
    const countryCode = String(profile?.countryCode || "").trim().toUpperCase();
    const customCountry = String(profile?.country || "").trim();
    const countryLabel = customCountry || regionName(countryCode);
    if (countryLabel) items.push({ kind: "country", icon: countryCode ? flagEmoji(countryCode) : "🌐", label: countryLabel });
    const type = creatorTypeLabel(profile?.creatorType);
    if (type) items.push({ kind: "type", icon: "👤", label: type });
    const language = languageName(profile?.primaryLanguage);
    if (language) items.push({ kind: "language", icon: "💬", label: language });
    return items;
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

    const meta = creatorMetaData(profile);
    if (meta.length) {
      $("creatorMeta").innerHTML = meta.map((item) => `<span class="creatorMetaChip"><span class="creatorMetaFlag" aria-hidden="true">${escapeHtml(item.icon)}</span>${escapeHtml(item.label)}</span>`).join("");
      $("creatorMeta").style.display = "";
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

    const links = Array.isArray(profile?.links) ? [...profile.links] : [];
    const vndbId = String(profile?.vndbId || "").trim().toLowerCase();
    if (/^p\d+$/.test(vndbId) && !links.some((link) => /vndb\.org/i.test(String(link?.url || "")))) {
      links.unshift({ type: "vndb", label: "VNDB", url: `https://vndb.org/${vndbId}` });
    }
    if (!links.length) {
      $("creatorNoLinks").style.display = "";
    } else {
      $("creatorLinks").innerHTML = links.map((link) => {
        const label = escapeHtml(link.label || window.CreatorFeature?.getLinkLabel?.(link.type) || "Lien");
        return `
        <a class="creatorPageLink" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
          <span class="creatorPageLinkMain">
            ${getLinkIcon(link.type, link.label, link.url)}
            <span class="creatorPageLinkLabel">${label}</span>
          </span>
          <span class="creatorPageLinkArrow" aria-hidden="true">↗</span>
        </a>`;
      }).join("");
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
        <a class="creatorGameCard" href="${escapeHtml(getGameUrl(game))}" target="_blank" rel="noopener noreferrer">
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
          countryCode: String(profile?.countryCode || "").trim().toUpperCase(),
          country: String(profile?.country || "").trim(),
          creatorType: String(profile?.creatorType || "").trim(),
          primaryLanguage: String(profile?.primaryLanguage || "").trim(),
          vndbId: String(profile?.vndbId || "").trim(),
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
    const meta = creatorMetaData(entry);
    const searchText = [entry.name, ...entry.aliases, entry.country, regionName(entry.countryCode), creatorTypeLabel(entry.creatorType), languageName(entry.primaryLanguage)].filter(Boolean).join(" ").toLowerCase();

    return `
      <a class="creatorDirectoryCard" href="${escapeHtml(window.CreatorFeature.buildCreatorUrl(entry))}" target="_blank" rel="noopener noreferrer" data-search="${escapeHtml(searchText)}">
        <div class="creatorDirectoryIdentity">
          ${avatar}
          <span class="creatorDirectoryAvatar creatorDirectoryAvatarFallback" style="${fallbackStyle}" aria-hidden="true">${escapeHtml(entry.name.charAt(0).toUpperCase() || "?")}</span>
          <div class="creatorDirectoryIdentityText">
            <h2 class="creatorDirectoryName">${escapeHtml(entry.name)}</h2>
            <div class="creatorDirectoryGames">${gameCount} jeu${gameCount > 1 ? "x" : ""}</div>
          </div>
        </div>
        ${meta.length ? `<div class="creatorMeta creatorDirectoryMeta">${meta.map((item) => `<span class="creatorMetaChip"><span class="creatorMetaFlag" aria-hidden="true">${escapeHtml(item.icon)}</span>${escapeHtml(item.label)}</span>`).join("")}</div>` : ""}
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
      countryCode: "",
      country: "",
      creatorType: "",
      primaryLanguage: "",
      vndbId: "",
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
