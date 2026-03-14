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
  };

  const MESSAGES_API_URL = "/api/messages?limit=1";
  const NOTIFICATION_URL = "https://andric31-traductions.pages.dev/notifications/";
  const NOTIFICATION_PREVIEW = {
    id: "notif-member-grade-20260314",
    title: "Promotion de grade !",
    text: 'Félicitations ! Vous avez atteint le grade "Member".',
    time: "Il y a 6 h",
    url: NOTIFICATION_URL,
  };

  function iconWiki() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M3.75 5.75A2.75 2.75 0 0 1 6.5 3h10.25A2.25 2.25 0 0 1 19 5.25v13A1.75 1.75 0 0 1 17.25 20H7a3 3 0 0 1 0-6h12"/>
      <path d="M7 14h9"/>
      <path d="M7 9h7"/>
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
      <path d="M8.25 16.75H5.8A2.8 2.8 0 0 1 3 13.95V7.8A2.8 2.8 0 0 1 5.8 5h8.4A2.8 2.8 0 0 1 17 7.8v1.45"/>
      <path d="M8.25 16.75 4.75 20v-3.25"/>
      <path d="M10.35 19h6.85A2.8 2.8 0 0 0 20 16.2v-3.4A2.8 2.8 0 0 0 17.2 10h-6.85a2.8 2.8 0 0 0-2.8 2.8v3.4A2.8 2.8 0 0 0 10.35 19Z"/>
      <path d="M15.25 19 18.75 22v-3"/>
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

  function createNotificationsPopover(anchor) {
    let pop = document.getElementById(IDS.notificationsPopover);
    if (pop) return pop;

    pop = document.createElement("div");
    pop.id = IDS.notificationsPopover;
    pop.className = "quick-notif-popover hidden";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Dernière notification");
    pop.innerHTML = `
      <div class="quick-notif-head">Notifications</div>
      <a class="quick-notif-card" href="${NOTIFICATION_PREVIEW.url}" target="_blank" rel="noopener noreferrer">
        <span class="quick-notif-card-icon">${iconNotifications()}</span>
        <span class="quick-notif-card-body">
          <strong>${escapeHtml(NOTIFICATION_PREVIEW.title)}</strong>
          <span>${escapeHtml(NOTIFICATION_PREVIEW.text)}</span>
          <small>${escapeHtml(NOTIFICATION_PREVIEW.time)}</small>
        </span>
      </a>
      <a class="quick-notif-open" href="${NOTIFICATION_PREVIEW.url}" target="_blank" rel="noopener noreferrer">
        Voir les notifications
        <span aria-hidden="true">→</span>
      </a>
    `;
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

  function openNotificationsPopover(btn) {
    const pop = createNotificationsPopover(btn);
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    placePopover(btn, pop);
    localStorage.setItem(STORAGE.seenNotificationId, NOTIFICATION_PREVIEW.id);
    setDotVisible(btn, false);
  }

  function toggleNotificationsPopover(btn) {
    const pop = createNotificationsPopover(btn);
    const isHidden = pop.classList.contains("hidden");
    if (isHidden) openNotificationsPopover(btn);
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
    initNotificationIndicator(notificationsEl);
    await initMessageIndicator(messagesEl);
  }

  function initNotificationIndicator(notificationsEl) {
    const seenNotificationId = localStorage.getItem(STORAGE.seenNotificationId) || "";
    const hasNewNotification = seenNotificationId !== NOTIFICATION_PREVIEW.id;
    setDotVisible(notificationsEl, hasNewNotification);
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

  document.addEventListener("DOMContentLoaded", init);
})();
