(() => {
  const IDS = {
    wiki: "quickWikiBtn",
    blog: "quickBlogBtn",
    messages: "quickMessagesBtn",
  };

  function iconWiki() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`;
  }

  function iconBlog() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <path d="M8 7h8"/>
      <path d="M8 11h8"/>
      <path d="M8 15h5"/>
    </svg>`;
  }

  function iconMessages() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
  }

  function makeLink(id, href, label, svg, refClass) {
    const a = document.createElement("a");
    a.id = id;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = `${refClass} header-icon-link`;
    a.setAttribute("aria-label", label);
    a.title = label;
    a.innerHTML = svg;
    return a;
  }

  function insertButtons(afterEl) {
    if (!afterEl) return;
    if (document.getElementById(IDS.wiki) || document.getElementById(IDS.blog) || document.getElementById(IDS.messages)) return;

    const refClass = afterEl.className || "hamburger-btn";
    const wiki = makeLink(IDS.wiki, "/wiki/", "Wiki", iconWiki(), refClass);
    const blog = makeLink(IDS.blog, "/blog/", "Blog", iconBlog(), refClass);
    const messages = makeLink(IDS.messages, "/messages/", "Messages", iconMessages(), refClass);

    afterEl.insertAdjacentElement("afterend", messages);
    afterEl.insertAdjacentElement("afterend", blog);
    afterEl.insertAdjacentElement("afterend", wiki);
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
