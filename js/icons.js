(function (global) {
  const S =
    'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none"';

  const PATHS = {
    "layout-dashboard": '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    sparkles:
      '<path d="M12 3l1.2 4.2L17 8l-3.8 1.2L12 14l-1.2-4.8L7 8l3.8-0.8L12 3z"/><path d="M19 14l.8 2.8L22 17l-2.2.7L19 20l-.8-2.3L16 17l2.2-.7L19 14z"/><path d="M5 16l.6 2.2L8 19l-1.9.6L5 22l-.6-2.4L2 19l1.9-.5L5 16z"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    wallet: '<path d="M19 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14"/><path d="M3 9V7a2 2 0 0 1 2-2h14"/><path d="M16 14h.01"/>',
    "repeat-2": '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    "play-circle": '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    "file-plus": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    hammer:
      '<path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0-.83-.83 0-3 .83-.83 2.17-.83 3 0L12 9"/><path d="m18 16 4-4"/><path d="m21.5 9.5-1-1c-.78-.78-2.05-.78-2.83 0l-8.17 8.17c-.78.78-.78 2.05 0 2.83l1 1"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    "trending-up": '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    "badge-check": '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76z"/><path d="m9 12 2 2 4-4"/>',
    "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "plus-circle": '<circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    "banknote": '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    "book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "help-circle": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    "circle-menu":
      '<circle cx="12" cy="12" r="10"/><circle cx="8" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.25" fill="currentColor" stroke="none"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "external-link": '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    "bar-chart": '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/>',
    video: '<path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    heart:
      '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    pin: '<path d="M12 17v5"/><path d="M5 7c0-3.5 3.5-6 7-6s7 2.5 7 6c0 5.25-7 10-7 10S5 12.25 5 7z"/><circle cx="12" cy="7" r="2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    shield:
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    bug:
      '<path d="M8 2v2M16 2v2M12 20v2M6 8H4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h2M18 8h2a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 9h6M6 13a6 6 0 0 0 12 0"/>',
    "file-text":
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    "log-out":
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    "share-2":
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  };

  const STEP_ICONS = {
    start: "play-circle",
    setup: "settings",
    welcome: "play-circle",
    "what-we-do": "sparkles",
    "who-we-help": "target",
    "how-we-operate": "layers",
    resources: "file-text",
    faq: "help-circle",
    progress: "bar-chart",
    job: "target",
    offer: "sparkles",
    team: "layers",
    pay: "wallet",
    leads: "search",
    calling: "phone",
    "lead-format": "file-plus",
    daily: "repeat-2",
    outreach: "message-square",
    dashboard: "layout-dashboard",
    tour: "layout-dashboard",
    rules: "shield",
    help: "help-circle",
    course: "book-open",
    earnings: "wallet",
    workflow: "repeat-2",
    scripts: "phone",
    template: "file-plus",
  };

  function icon(name, extraClass) {
    const p = PATHS[name];
    if (!p) return "";
    const cls = extraClass ? "ico " + extraClass : "ico";
    return (
      '<svg class="' +
      cls +
      '" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" ' +
      S +
      " aria-hidden=\"true\">" +
      p +
      "</svg>"
    );
  }

  function initIcons() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      if (el.querySelector(".ico")) return;
      const html = icon(el.getAttribute("data-icon"), el.getAttribute("data-icon-class") || "");
      if (html) el.insertAdjacentHTML("afterbegin", html);
    });
    document.querySelectorAll("[data-icon-after]").forEach((el) => {
      if (el.querySelector(".ico-arrow")) return;
      const html = icon(el.getAttribute("data-icon-after"), "ico-arrow");
      if (html) el.insertAdjacentHTML("beforeend", html);
    });
  }

  global.SiteIcons = { icon, initIcons, STEP_ICONS, PATHS };
})(window);
