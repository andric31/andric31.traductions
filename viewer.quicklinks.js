(() => {
  const IDS = {
    wiki: "quickWikiBtn",
    blog: "quickBlogBtn",
    messages: "quickMessagesBtn",
    notifications: "quickNotificationsBtn",
    notificationsPopover: "quickNotificationsPopover",
  };

  const STORAGE = {
    seenMessageId: "andric31_seen_message_id",
    seenNotificationId: "andric31_seen_notification_id",
    firstVisitShown: "andric31_first_visit_notification_shown",
  };

  const MESSAGES_API_URL = "/api/messages?limit=1";
  const NOTIFICATIONS_JSON_URL = "/notifications/notifications.json";
  const NOTIFICATION_URL = "https://andric31-traductions.pages.dev/notifications/";


  function iconWiki() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`;
  }

  function iconBlog() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 6.25A2.25 2.25 0 0 1 6.25 4h11.5A2.25 2.25 0 0 1 20 6.25v11.5A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75z"/>
      <path d="M7.5 8h9"/>
      <path d="M7.5 12h9"/>
      <path d="M7.5 16h5"/>
      <circle cx="16.75" cy="16.25" r=".9" fill="currentColor" stroke="none"/>
    </svg>`;
  }

  function iconMessages() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M6.25 6.25h11.5A2.25 2.25 0 0 1 20 8.5v6a2.25 2.25 0 0 1-2.25 2.25H11l-4.75 3v-3H6.25A2.25 2.25 0 0 1 4 14.5v-6a2.25 2.25 0 0 1 2.25-2.25Z"/>
      <path d="M8 10.5h8"/>
      <path d="M8 13.5h5.5"/>
    </svg>`;
  }

  function iconNotifications() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M15 18H5.75A1.75 1.75 0 0 1 4 16.25c0-.55.27-1.07.72-1.39l.73-.53a2.5 2.5 0 0 0 1.05-2.03V10a5.5 5.5 0 1 1 11 0v2.3a2.5 2.5 0 0 0 1.05 2.03l.73.53c.45.32.72.84.72 1.39A1.75 1.75 0 0 1 18.25 18H17"/>
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0"/>
    </svg>`;
  }

  function makeLink(id, href, label, svg, refClass) {
    const a = document.createElement("a");
    a.id = id;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = `${refClass} header-icon-link header-icon-link--quick`;
    a.setAttribute("aria-label", label);
    a.title = label;
    a.innerHTML = `<span class="header-icon-svg">${svg}</span><span class="header-icon-dot hidden" aria-hidden="true"></span>`;
    return a;
  }

  function makeButton(id, label, svg, refClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.className = `${refClass} header-icon-link header-icon-link--quick`;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span class="header-icon-svg">${svg}</span><span class="header-icon-dot hidden" aria-hidden="true"></span>`;
    return btn;
  }

  function getDot(el) {
    return el ? el.querySelector(".header-icon-dot") : null;
  }

  function setDotVisible(el, visible) {
    const dot = getDot(el);
    if (!dot) return;
    dot.classList.toggle("hidden", !visible);
  }

  function formatRelativeTime(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = date.getTime() - Date.now();
    try {
      return new Intl.RelativeTimeFormat("fr", { numeric: "auto" }).format(Math.round(diffMs / 60000), "minute");
    } catch {
      return "";
    }
  }

  function formatRelativeSmart(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
    if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), "month");
    return rtf.format(Math.round(diffSec / 31536000), "year");
  }

  async function loadLatestNotification() {
    try {
      const res = await fetch(`${NOTIFICATIONS_JSON_URL}?v=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data) || !data.length) return null;
      const items = data.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const latest = items[0] || null;
      if (!latest) return null;
      return {
        id: String(latest.id || ""),
        title: String(latest.title || "Notification"),
        text: String(latest.text || ""),
        time: formatRelativeSmart(latest.created_at),
        url: String(latest.url || NOTIFICATION_URL),
      };
    } catch {
      return null;
    }
  }

  function renderNotificationsPopover(pop, preview) {
    if (!pop || !preview) return;
    pop.innerHTML = `
      <div class="quick-notif-head">Notifications</div>
      <a class="quick-notif-card" href="${escapeHtml(preview.url)}" target="_blank" rel="noopener noreferrer">
        <span class="quick-notif-card-icon">${iconNotifications()}</span>
        <span class="quick-notif-card-body">
          <strong>${escapeHtml(preview.title)}</strong>
          <span>${escapeHtml(preview.text)}</span>
          ${preview.time ? `<small>${escapeHtml(preview.time)}</small>` : ""}
        </span>
      </a>
      <a class="quick-notif-open" href="${escapeHtml(preview.url)}" target="_blank" rel="noopener noreferrer">
        Voir les notifications
        <span aria-hidden="true">→</span>
      </a>
    `;
  }

  function createNotificationsPopover(anchor) {
    let pop = document.getElementById(IDS.notificationsPopover);
    if (pop) return pop;

    pop = document.createElement("div");
    pop.id = IDS.notificationsPopover;
    pop.className = "quick-notif-popover hidden";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Dernière notification");
    pop.innerHTML = `<div class="quick-notif-head">Notifications</div><div class="quick-notif-loading">Chargement…</div>`;
    document.body.appendChild(pop);

    const reposition = () => placePopover(anchor, pop);
    window.addEventListener("resize", reposition, { passive: true });
    window.addEventListener("scroll", reposition, { passive: true });
    return pop;
  }

  function placePopover(anchor, pop) {
    if (!anchor || !pop || pop.classList.contains("hidden")) return;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 10;
    const left = rect.right + window.scrollX - pop.offsetWidth;
    pop.style.top = `${Math.max(12, top)}px`;
    pop.style.left = `${Math.max(12, left)}px`;
  }

  function closeNotificationsPopover() {
    const btn = document.getElementById(IDS.notifications);
    const pop = document.getElementById(IDS.notificationsPopover);
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (pop) pop.classList.add("hidden");
  }

  async function openNotificationsPopover(btn) {
    const pop = createNotificationsPopover(btn);
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    placePopover(btn, pop);

    const preview = await loadLatestNotification();
    if (preview) {
      renderNotificationsPopover(pop, preview);
      localStorage.setItem(STORAGE.seenNotificationId, preview.id);
      setDotVisible(btn, false);
      placePopover(btn, pop);
    } else {
      pop.innerHTML = `
        <div class="quick-notif-head">Notifications</div>
        <div class="quick-notif-empty">Aucune notification pour le moment.</div>
      `;
      placePopover(btn, pop);
    }
  }

  async function toggleNotificationsPopover(btn) {
    const pop = createNotificationsPopover(btn);
    const isHidden = pop.classList.contains("hidden");
    if (isHidden) await openNotificationsPopover(btn);
    else closeNotificationsPopover();
  }

  function insertButtons(afterEl) {
    if (!afterEl) return;
    if (document.getElementById(IDS.wiki) || document.getElementById(IDS.blog) || document.getElementById(IDS.messages) || document.getElementById(IDS.notifications)) return;

    const refClass = afterEl.className || "hamburger-btn";
    const wiki = makeLink(IDS.wiki, "/wiki/", "Wiki", iconWiki(), refClass);
    const blog = makeLink(IDS.blog, "/blog/", "Blog", iconBlog(), refClass);
    const notifications = makeButton(IDS.notifications, "Notifications", iconNotifications(), refClass);
    const messages = makeLink(IDS.messages, "/messages/", "Messages", iconMessages(), refClass);

    notifications.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleNotificationsPopover(notifications);
    });

    messages.addEventListener("click", () => {
      localStorage.setItem(STORAGE.seenMessageId, String(messages.dataset.latestMessageId || "0"));
      setDotVisible(messages, false);
    });

    document.addEventListener("click", (event) => {
      const pop = document.getElementById(IDS.notificationsPopover);
      if (!pop || pop.classList.contains("hidden")) return;
      if (pop.contains(event.target) || notifications.contains(event.target)) return;
      closeNotificationsPopover();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNotificationsPopover();
    });

    afterEl.insertAdjacentElement("afterend", messages);
    afterEl.insertAdjacentElement("afterend", notifications);
    afterEl.insertAdjacentElement("afterend", blog);
    afterEl.insertAdjacentElement("afterend", wiki);

    initIndicators(messages, notifications);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  async function initIndicators(messagesEl, notificationsEl) {
    await initNotificationIndicator(notificationsEl);
    await initMessageIndicator(messagesEl);
  }

  async function initNotificationIndicator(notificationsEl) {
    const latest = await loadLatestNotification();
    if (!latest) {
      setDotVisible(notificationsEl, false);
      return;
    }
    notificationsEl.dataset.latestNotificationId = latest.id;
    const seenNotificationId = localStorage.getItem(STORAGE.seenNotificationId) || "";
    const hasNewNotification = seenNotificationId !== latest.id;
    setDotVisible(notificationsEl, hasNewNotification);

    const firstVisitShown = localStorage.getItem(STORAGE.firstVisitShown) === "1";
    if (!firstVisitShown) {
      localStorage.setItem(STORAGE.firstVisitShown, "1");
    }
  }

  async function initMessageIndicator(messagesEl) {
    try {
      const res = await fetch(MESSAGES_API_URL, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok || !Array.isArray(data.messages) || !data.messages.length) return;
      const latest = data.messages[data.messages.length - 1];
      const latestId = Number(latest?.id || 0);
      messagesEl.dataset.latestMessageId = String(latestId || 0);
      const seenMessageId = Number(localStorage.getItem(STORAGE.seenMessageId) || 0);
      setDotVisible(messagesEl, latestId > seenMessageId);
    } catch {
      // silence: pas bloquant pour l'UI
    }
  }

  function injectPopoverStyles() {
    if (document.getElementById("quickNotifThemePatch")) return;
    const style = document.createElement("style");
    style.id = "quickNotifThemePatch";
    style.textContent = `
      .quick-notif-loading,.quick-notif-empty{padding:12px 14px;color:var(--muted);}
      .quick-notif-card{background:color-mix(in srgb,var(--card) 92%, transparent);border:1px solid var(--border);}
      .quick-notif-card:hover{border-color:color-mix(in srgb,var(--primary) 40%, var(--border));box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 18%, transparent);}
      .quick-notif-card-icon{background:color-mix(in srgb,var(--primary) 14%, transparent);color:var(--primary);}
      .quick-notif-open{color:var(--primary);}
      .header-icon-dot{background:var(--primary);box-shadow:0 0 0 2px var(--card);}
    `;
    document.head.appendChild(style);
  }

  function init() {
    const helpBtn = document.getElementById("menuHelpBtn");
    if (helpBtn) return insertButtons(helpBtn);

    const hb = document.getElementById("hamburgerBtn");
    if (hb) return insertButtons(hb);

    const obs = new MutationObserver(() => {
      const helpBtn2 = document.getElementById("menuHelpBtn");
      const hb2 = document.getElementById("hamburgerBtn");
      if (helpBtn2 || hb2) {
        obs.disconnect();
        insertButtons(helpBtn2 || hb2);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => { injectPopoverStyles(); init(); });
})();
