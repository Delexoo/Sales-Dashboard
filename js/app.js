(function () {
  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";
  const TRACKER_KEY = "lpc_sales_tracker_v2";
  const TRACKER_KEY_LEGACY = "lpc_sales_tracker_v1";
  const STEP_DONE_KEY = "lpc_sales_onboarding_steps_v1";
  const NAV_COLLAPSED_KEY = "lpc_nav_collapsed_v1";
  const SIDEBAR_COLLAPSED_KEY = "lpc_sidebar_collapsed_v1";
  const NAV_DEFAULT_COLLAPSED = ["help"];

  const NAV_GROUP_PAGES = {
    overview: ["home"],
    course: ["course-module", "setup"],
    tools: ["leads", "scripts", "template", "outreach", "checklist"],
    help: ["faq", "feedback", "bug-bounty", "settings", "resources", "owner", "contributors", "privacy", "terms"],
  };

  const COMMISSION_RATE = 0.4;
  const COMMISSION_PRESET = { 500: 200, 700: 280, 1000: 400, 1500: 600 };
  const EARNINGS_TIERS = [
    { sale: 500, commission: 200, saleLabel: "$500", saleShort: "$500 sale" },
    { sale: 700, commission: 280, saleLabel: "$700", saleShort: "$700 sale" },
    { sale: 1000, commission: 400, saleLabel: "$1,000", saleShort: "$1K sale" },
    { sale: 1500, commission: 600, saleLabel: "$1,500", saleShort: "$1.5K sale" },
  ];
  const EARNINGS_CLOSE_COUNTS = [1, 5, 10, 25, 50, 100];
  const DEFAULT_GOAL = 2000;

  function normalizeGoal(value) {
    const n = Number(value);
    return n > 0 ? n : DEFAULT_GOAL;
  }

  const ONBOARDING_STEPS = [];

  function getCourseModules() {
    return window.CourseModules?.list?.() || [];
  }

  function getActiveCourseModuleId() {
    if (document.body.dataset.page !== "course-module") return "";
    try {
      return new URLSearchParams(window.location.search).get("m") || "";
    } catch (e) {
      return "";
    }
  }

  function renderCourseNav(activeId, progress) {
    const modules = getCourseModules();
    const activeModuleId = getActiveCourseModuleId();
    if (!modules.length) {
      return (
        `<li><a class="nav-link${activeId === "setup" ? " active" : ""}" href="setup.html">` +
        `<span class="step-badge">1</span><span class="nav-link-text">Get started</span></a></li>`
      );
    }

    let html = "";

    const viewingMod = activeModuleId ? window.CourseModules.get(activeModuleId) : null;
    const viewingId = viewingMod?.id || activeModuleId;

    modules.forEach((mod) => {
      const done = window.CourseModules.isComplete(mod, progress);
      const isCurrent =
        activeId === mod.id ||
        (activeId === "course-module" && viewingId === mod.id) ||
        (activeId === "setup" && mod.id === "setup-accounts");
      let cls = "nav-link";
      if (isCurrent) cls += " active";
      if (done) cls += " done";
      const badge = done
        ? `<span class="step-badge done-badge">${mod.num}</span>`
        : `<span class="step-badge">${mod.num}</span>`;
      html +=
        `<li><a class="${cls}" href="${window.CourseModules.href(mod)}">` +
        badge +
        `<span class="nav-link-text">${mod.title}</span></a></li>`;
    });

    return html;
  }

  function refreshCourseNavInSidebar() {
    const list = document.getElementById("nav-panel-course");
    if (!list) return;
    const page = document.body.dataset.page || "home";
    list.innerHTML = renderCourseNav(page, loadProgress());
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const btn = document.getElementById("menu-btn");
    if (!sidebar) return;
    const close = () => {
      sidebar.classList.remove("open");
      overlay?.classList.remove("open");
      syncMenuBtnState(btn, sidebar, overlay);
    };
    list.querySelectorAll(".nav-link").forEach((a) => a.addEventListener("click", close));
  }

  function pulseCourseModuleBadge(mod) {
    if (!mod?.id) return;
    const list = document.getElementById("nav-panel-course");
    if (!list) return;
    const needle = "m=" + encodeURIComponent(mod.id);
    list.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (!href.includes(needle)) return;
      const badge = link.querySelector(".step-badge.done-badge");
      if (badge) badge.classList.add("step-badge--pop");
    });
  }

  const TOOL_PAGES = [
    { id: "leads", href: "leads.html", label: "Lead Finder" },
    { id: "scripts", href: "scripts.html", label: "Call scripts" },
    { id: "template", href: "template.html", label: "Lead Builder" },
    { id: "outreach", href: "outreach.html", label: "Text & email" },
    { id: "checklist", href: "checklist.html", label: "Setup checklist" },
  ];

  const DAILY_TOOL_PROGRESS = {
    leads: "leads",
    scripts: "script",
    template: "template",
    outreach: "outreach",
    checklist: "checklist",
  };

  const CHECKLIST_MODULE_MAP = {
    module_introduction: "introduction",
    module_business: "business",
    module_setup_accounts: "setup-accounts",
    module_dashboard: "dashboard",
    module_everyday_tasks: "everyday-tasks",
  };

  function isChecklistItemDone(id, progress) {
    const modId = CHECKLIST_MODULE_MAP[id];
    if (modId && window.CourseModules?.get) {
      const mod = window.CourseModules.get(modId);
      if (mod) return window.CourseModules.isComplete(mod, progress);
    }
    if (progress[id]) return true;
    if (id === "template" && progress["first-lead"]) return true;
    return false;
  }

  function touchDailyToolProgress() {
    const page = document.body.dataset.page || "";
    const key = DAILY_TOOL_PROGRESS[page];
    if (!key) return;
    touchProgressKeys([key]);
  }

  function cfg() {
    return window.SITE_CONFIG || {};
  }

  function repScopedStorageKey(key) {
    const id = window.RepSession?.get?.()?.id;
    return id ? "lpc_rep_" + id + "_" + key : key;
  }

  function lsGet(key) {
    if (window.RepStorage?.loadItem) return window.RepStorage.loadItem(key);
    return localStorage.getItem(repScopedStorageKey(key));
  }

  function lsSet(key, value) {
    if (window.RepStorage?.saveItem) window.RepStorage.saveItem(key, value);
    else localStorage.setItem(repScopedStorageKey(key), value);
  }

  function loadProgress() {
    try {
      const raw = JSON.parse(lsGet(PROGRESS_KEY) || "{}");
      const CM = window.CourseModules;
      if (!CM?.reconcileProgress) return raw;
      const next = CM.reconcileProgress(raw);
      if (JSON.stringify(next) !== JSON.stringify(raw)) {
        lsSet(PROGRESS_KEY, JSON.stringify(next));
      }
      return next;
    } catch (e) {
      return {};
    }
  }

  function applyPostLoginRedirect() {
    const CM = window.CourseModules;
    if (!CM?.loginLandingUrl) return;

    const progress = loadProgress();
    const landing = CM.loginLandingUrl(progress);
    const page = (location.pathname.split("/").pop() || "").toLowerCase();

    try {
      const target = new URL(landing, location.href);
      const here = new URL(location.href);
      if (here.pathname === target.pathname && here.search === target.search) return;
    } catch (e) {
      if (location.href.includes(landing)) return;
    }

    const entryPages = new Set(["index.html", "course.html", ""]);
    const isEntry = entryPages.has(page);

    if (CM.allComplete(progress)) {
      if (isEntry) location.replace(landing);
      return;
    }

    if (isEntry) {
      location.replace(landing);
    }
  }

  function saveProgress(data) {
    lsSet(PROGRESS_KEY, JSON.stringify(data));
  }

  function loadStepDone() {
    try {
      return JSON.parse(lsGet(STEP_DONE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveStepDone(data) {
    lsSet(STEP_DONE_KEY, JSON.stringify(data));
  }

  function isStepComplete(step, progress) {
    if (!step.keys?.length) return false;
    return step.keys.every((k) => progress[k]);
  }

  function getCurrentStepIndex(progress) {
    for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
      if (!isStepComplete(ONBOARDING_STEPS[i], progress)) return i;
    }
    return ONBOARDING_STEPS.length;
  }

  function defaultTracker() {
    const session = window.RepSession?.get?.();
    return {
      repId: session?.id || "",
      name: session?.name || "",
      goal: DEFAULT_GOAL,
      leadsPosted: 0,
      deals: [],
    };
  }

  function stampTrackerRep(data) {
    const session = window.RepSession?.get?.();
    if (session?.id) data.repId = session.id;
    return data;
  }

  function migrateLegacyTracker(raw) {
    const deals = [];
    const closes = raw.closes || {};
    Object.keys(closes).forEach((tier) => {
      const down = Number(tier);
      const count = Number(closes[tier]) || 0;
      const commissionEach = COMMISSION_PRESET[down] || Math.round(down * COMMISSION_RATE);
      for (let i = 0; i < count; i++) {
        deals.push({
          id: "legacy-" + tier + "-" + i + "-" + Date.now(),
          createdAt: new Date().toISOString(),
          downAmount: down,
          commission: commissionEach,
          businessName: "",
          ownerName: "",
          phone: "",
          mapsLink: "",
          notes: "Imported from package counts",
          presetLabel: "$" + formatMoney(down),
        });
      }
    });
    return {
      name: raw.name || "",
      goal: normalizeGoal(raw.goal),
      leadsPosted: Number(raw.leadsPosted) || 0,
      deals,
    };
  }

  function loadTracker() {
    const session = window.RepSession?.get?.();
    try {
      const stored = lsGet(TRACKER_KEY);
      let raw = stored ? JSON.parse(stored) : null;
      if ((!raw || !Array.isArray(raw.deals)) && !session?.id) {
        const legacy = JSON.parse(localStorage.getItem(TRACKER_KEY_LEGACY) || "null");
        if (legacy?.closes) {
          raw = migrateLegacyTracker(legacy);
          stampTrackerRep(raw);
          saveTracker(raw);
        }
      }
      if (!raw) return defaultTracker();

      if (session?.id && raw.repId && raw.repId !== session.id) {
        console.warn("Tracker data was for another rep — loading a fresh tracker for", session.id);
        return defaultTracker();
      }

      const out = {
        repId: session?.id || raw.repId || "",
        name: raw.name || "",
        goal: normalizeGoal(raw.goal),
        leadsPosted: Number(raw.leadsPosted) || 0,
        deals: Array.isArray(raw.deals) ? raw.deals : [],
      };
      if (session?.name) out.name = session.name;
      if (session?.id) out.repId = session.id;
      return out;
    } catch (e) {
      return defaultTracker();
    }
  }

  function saveTracker(data) {
    stampTrackerRep(data);
    lsSet(TRACKER_KEY, JSON.stringify(data));
  }

  function calcEarnedFromDeals(deals) {
    return deals.reduce((sum, d) => sum + (Number(d.commission) || 0), 0);
  }

  function commissionFromDown(down) {
    const preset = COMMISSION_PRESET[down];
    if (preset !== undefined) return preset;
    return Math.round(down * COMMISSION_RATE);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function brandSubText() {
    const repName = window.RepSession?.getName?.() || "";
    return repName ? "Logged in as " + repName : "Sales operations";
  }

  function updateBrandSub() {
    const el = document.querySelector(".brand-sub");
    if (el) el.textContent = brandSubText();
  }

  function newDealId() {
    return "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function formatDealDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  function formatMoney(n) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function focusNoScroll(el) {
    if (!el || typeof el.focus !== "function") return;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      el.focus();
    }
  }

  function preserveScroll(fn) {
    const y = window.scrollY;
    fn();
    window.scrollTo(0, y);
  }

  function ico(name, cls) {
    return window.SiteIcons ? window.SiteIcons.icon(name, cls || "") : "";
  }

  function navQuickLink(icon, label, attrs, external) {
    const trail = ico(external ? "external-link" : "chevron-right", "ico-nav-trail");
    return `<li><a class="nav-link nav-link-out nav-link-important" ${attrs}><span class="nav-link-text">${ico(icon, "ico-nav")}${label}</span><span class="nav-link-trail" aria-hidden="true">${trail}</span></a></li>`;
  }

  /** Move #page-body into #main-content inside #shell (avoids content below empty 100vh shell). */
  function ensurePageLayout() {
    const shell = document.getElementById("shell");
    const slot = document.getElementById("page-body");
    if (!shell || !slot) return null;

    let main = document.getElementById("main-content");
    if (!main) {
      main = document.createElement("main");
      main.className = "main";
      main.id = "main-content";
      shell.appendChild(main);
    }
    if (slot.parentElement !== main) {
      main.appendChild(slot);
    }
    return main;
  }

  function navGroup(id, label, itemsHtml) {
    return (
      `<div class="nav-group" data-nav-group="${id}">` +
      `<button type="button" class="nav-section-toggle" aria-expanded="true" aria-controls="nav-panel-${id}" id="nav-toggle-${id}">` +
      `<span class="nav-section-label">${label}</span>` +
      `<span class="nav-section-chev" aria-hidden="true">${ico("chevron-right", "ico-nav-chev")}</span>` +
      `</button>` +
      `<ul class="nav-list" id="nav-panel-${id}">${itemsHtml}</ul>` +
      `</div>`
    );
  }

  function loadNavCollapsed() {
    try {
      return JSON.parse(lsGet(NAV_COLLAPSED_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveNavCollapsed(state) {
    lsSet(NAV_COLLAPSED_KEY, JSON.stringify(state));
  }

  function initNavGroups(activeId) {
    const saved = loadNavCollapsed();
    document.querySelectorAll(".nav-group").forEach((group) => {
      const id = group.dataset.navGroup;
      if (!id) return;
      const toggle = group.querySelector(".nav-section-toggle");
      if (!toggle || toggle.dataset.bound) return;
      toggle.dataset.bound = "1";

      const pages = NAV_GROUP_PAGES[id] || [];
      const hasActive = pages.includes(activeId);
      let collapsed = false;
      if (!hasActive) {
        if (saved[id] === true) collapsed = true;
        else if (saved[id] === false) collapsed = false;
        else collapsed = NAV_DEFAULT_COLLAPSED.includes(id);
      }
      group.classList.toggle("is-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));

      toggle.addEventListener("click", () => {
        const isCollapsed = group.classList.toggle("is-collapsed");
        toggle.setAttribute("aria-expanded", String(!isCollapsed));
        saved[id] = isCollapsed;
        saveNavCollapsed(saved);
      });
    });
  }

  function isMobileNav() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function loadSidebarCollapsed() {
    try {
      const raw = lsGet(SIDEBAR_COLLAPSED_KEY);
      return raw === "1" || raw === 1 || raw === true;
    } catch (e) {
      return false;
    }
  }

  function saveSidebarCollapsed(collapsed) {
    try {
      lsSet(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function setDesktopSidebarCollapsed(collapsed) {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }

  function syncMenuBtnState(btn, sidebar, overlay) {
    if (!btn) return;
    if (isMobileNav()) {
      document.body.classList.remove("sidebar-collapsed");
      const open = sidebar?.classList.contains("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      return;
    }
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
    const collapsed = document.body.classList.contains("sidebar-collapsed");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.setAttribute("aria-label", collapsed ? "Open menu" : "Close menu");
  }

  function renderShell(activeId) {
    const c = cfg();
    const progress = loadProgress();
    const stepIcons = (window.SiteIcons && window.SiteIcons.STEP_ICONS) || {};

    const onboardingNav = renderCourseNav(activeId, progress);

    const toolsNav = TOOL_PAGES.map((p) => {
      if (p.id === "checklist") {
        const cls = p.id === activeId ? "nav-link active nav-link--checklist" : "nav-link nav-link--checklist";
        const pct = checklistProgressPercent(progress);
        return (
          `<li><a class="${cls}" href="${p.href}">` +
          `<span class="nav-link-text">${ico("badge-check", "ico-nav")}${p.label}</span>` +
          `<span class="nav-link-progress" aria-hidden="true">` +
          `<span class="nav-link-progress-bar" style="width:${pct}%"></span></span></a></li>`
        );
      }
      const cls = p.id === activeId ? "nav-link active" : "nav-link";
      const ic =
        p.id === "leads"
          ? "search"
          : p.id === "template"
            ? "file-plus"
            : p.id === "scripts"
              ? "phone"
              : "message-square";
      return `<li><a class="${cls}" href="${p.href}"><span class="nav-link-text">${ico(ic, "ico-nav")}${p.label}</span></a></li>`;
    }).join("");

    const dashCls = activeId === "home" ? "nav-link active" : "nav-link";
    const resourcesActive =
      activeId === "resources" || activeId === "privacy" || activeId === "terms";
    const brandName = c.companyName || "Sales Team Dashboard";
    const shell = document.getElementById("shell");
    if (!shell) return;
    ensurePageLayout();
    const main = document.getElementById("main-content");

    const chrome = document.createRange().createContextualFragment(
      `<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
        `<aside class="sidebar" id="sidebar">` +
        `<div class="sidebar-panel">` +
        `<div class="brand">` +
        `<span class="brand-mark">${ico("sparkles", "ico-brand")}</span>` +
        `<span class="brand-text"><strong>${brandName}</strong><span class="brand-sub">${escHtml(brandSubText())}</span></span>` +
        `</div>` +
        navGroup(
          "overview",
          "Overview",
          `<li><a class="${dashCls}" href="dashboard.html"><span class="nav-link-text">${ico("layout-dashboard", "ico-nav")}Dashboard</span></a></li>`
        ) +
        navGroup("course", "Course", onboardingNav) +
        navGroup("tools", "Daily tools", toolsNav) +
        navGroup(
          "help",
          "Help",
          `<li><a class="${activeId === "owner" ? "nav-link active" : "nav-link"}" href="owner.html"><span class="nav-link-text">${ico("message-square", "ico-nav")}Meet the Owner</span></a></li>` +
            `<li><a class="${activeId === "contributors" ? "nav-link active" : "nav-link"}" href="contributors.html"><span class="nav-link-text">${ico("users", "ico-nav")}Contributors</span></a></li>` +
            `<li><a class="${activeId === "settings" ? "nav-link active" : "nav-link"}" href="settings.html"><span class="nav-link-text">${ico("settings", "ico-nav")}Settings</span></a></li>` +
            `<li><a class="${activeId === "faq" ? "nav-link active" : "nav-link"}" href="faq.html"><span class="nav-link-text">${ico("help-circle", "ico-nav")}FAQ</span></a></li>` +
            `<li><a class="${resourcesActive ? "nav-link active" : "nav-link"}" href="resources.html"><span class="nav-link-text">${ico("external-link", "ico-nav")}All links</span></a></li>` +
            `<li><a class="${activeId === "feedback" ? "nav-link active" : "nav-link"}" href="feedback.html"><span class="nav-link-text">${ico("message-square", "ico-nav")}Feedback</span></a></li>` +
            `<li><a class="${activeId === "bug-bounty" ? "nav-link active" : "nav-link"}" href="bug-bounty.html"><span class="nav-link-text">${ico("bug", "ico-nav")}Bug Bounty</span></a></li>`
        ) +
        `</div>` +
        `<button type="button" class="menu-btn" id="menu-btn" aria-label="Open menu" aria-controls="sidebar" aria-expanded="true">${ico("menu", "ico-menu")}<span>Menu</span></button>` +
        `</aside>`
    );
    shell.insertBefore(chrome, main);

    const btn = document.getElementById("menu-btn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const close = () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("open");
      syncMenuBtnState(btn, sidebar, overlay);
    };
    if (!isMobileNav() && loadSidebarCollapsed()) {
      setDesktopSidebarCollapsed(true);
    }
    syncMenuBtnState(btn, sidebar, overlay);
    btn.addEventListener("click", () => {
      if (isMobileNav()) {
        const open = !sidebar.classList.contains("open");
        sidebar.classList.toggle("open", open);
        overlay.classList.toggle("open", open);
        syncMenuBtnState(btn, sidebar, overlay);
        return;
      }
      const collapsed = !document.body.classList.contains("sidebar-collapsed");
      setDesktopSidebarCollapsed(collapsed);
      saveSidebarCollapsed(collapsed);
      syncMenuBtnState(btn, sidebar, overlay);
    });
    overlay.addEventListener("click", close);
    sidebar.querySelectorAll(".nav-link").forEach((a) => a.addEventListener("click", close));
    if (!window.__lpcSidebarResizeBound) {
      window.__lpcSidebarResizeBound = true;
      window.addEventListener("resize", () => {
        const menuBtn = document.getElementById("menu-btn");
        const side = document.getElementById("sidebar");
        const over = document.getElementById("sidebar-overlay");
        if (isMobileNav()) {
          setDesktopSidebarCollapsed(false);
        } else if (loadSidebarCollapsed()) {
          setDesktopSidebarCollapsed(true);
        } else {
          setDesktopSidebarCollapsed(false);
        }
        syncMenuBtnState(menuBtn, side, over);
      });
    }
    initNavGroups(activeId);
    initConfigLinks();
    updateBrandSub();
    if (window.SignOutFloat) window.SignOutFloat.update();
    if (window.SiteIcons) window.SiteIcons.initIcons();
  }

  function renderOnboardingPath() {
    const root = document.getElementById("onboarding-path");
    if (!root) return;
    const progress = loadProgress();
    const modules = getCourseModules();
    if (!modules.length || !window.CourseModules) return;

    const next = window.CourseModules.firstIncomplete(progress);

    root.innerHTML = modules
      .map((mod) => {
        const done = window.CourseModules.isComplete(mod, progress);
        const isNext = next && next.id === mod.id;
        let status = "Not started";
        if (done) status = "Done";
        else if (isNext) status = "Up next";
        const cls = ["path-item", done ? "done" : "", isNext ? "current" : ""].filter(Boolean).join(" ");
        return (
          `<li class="${cls}"><a href="${window.CourseModules.href(mod)}" class="no-underline">` +
          `<span class="path-num">${done ? "✓" : mod.num}</span>` +
          `<div class="path-body"><div class="path-title">${mod.title}</div></div>` +
          `<span class="path-status">${status}</span></a></li>`
        );
      })
      .join("");
  }

  const EVERYDAY_TASKS = [
    {
      step: 1,
      task: "Open Lead Finder",
      detail:
        "Our leads list — businesses that already do not have a website. Use the No website filter if you want the best fits.",
      resource: { href: "leads.html", label: "Lead Finder" },
    },
    {
      step: 2,
      taskFlow: ["Pick a business", "Build Lead"],
      detail:
        "Choose one business from the list, then click Build Lead on its card to send details into Lead Builder (the lead is pinned for you).",
      buildLeadTag: true,
    },
    {
      step: 3,
      taskFlow: ["Call business", "Pitch website"],
      detail:
        "Dial from the card and use Call scripts to offer the free demo site. Talk to the owner or decision-maker. Not interested? Thank them and go back to step 2 — do not post the lead.",
      resource: { href: "scripts.html", label: "Call scripts" },
    },
    {
      step: 4,
      taskFlow: ["If interested", "Lead Builder"],
      detailBullets: [
        "Price must match what you quoted on the call",
        "Google Maps link is filled from Build Lead",
        "Preference: Direct Link or Booking",
        "Phone and owner name",
      ],
      resource: { href: "template.html", label: "Lead Builder", shortLabel: "Builder" },
    },
    {
      step: 5,
      taskFlow: ["Copy template", "Interested Businesses"],
      detail:
        "In Lead Builder, click Copy template, then paste the full message into Interested Businesses on Telegram right away.",
      resource: {
        hrefKey: "interestedBusinessesUrl",
        label: "Interested Businesses",
        external: true,
      },
    },
    {
      step: 6,
      task: "Mark complete",
      detail:
        "In Lead Finder, tag the business Complete (team sees it). Use Pending if you need to call back. Quick Save and Pin are only for you. Then start again at step 2.",
      completeTag: true,
    },
  ];

  function everydayTaskCompleteTag() {
    return (
      '<span class="everyday-tasks-complete-tag" title="In Lead Finder, tag this business Complete">' +
      ico("check", "everyday-tasks-complete-tag-ico") +
      '<span class="everyday-tasks-complete-tag-text">Complete</span></span>'
    );
  }

  function everydayTaskBuildLeadTag() {
    return (
      '<span class="lf-action-btn lf-action-builder everyday-tasks-builder-tag" title="Build Lead button on each lead card in Lead Finder">' +
      '<span data-icon="hammer" data-icon-class="lf-action-ico everyday-tasks-builder-tag-ico" aria-hidden="true"></span>' +
      '<span class="everyday-tasks-builder-tag-text">Build Lead</span></span>'
    );
  }

  function everydayTaskToolCell(row) {
    if (row.completeTag) return everydayTaskCompleteTag();
    if (row.buildLeadTag) return everydayTaskBuildLeadTag();
    return everydayTaskOpenButton(row.resource);
  }

  function everydayTaskOpenButton(resource) {
    if (!resource) return "";
    const label = escHtml(resource.label || "Open");
    if (resource.href) {
      return `<a class="btn secondary everyday-tasks-open-btn" href="${escHtml(resource.href)}">${label}</a>`;
    }
    if (resource.hrefKey) {
      const attrs = resource.external
        ? ` data-config="${escHtml(resource.hrefKey)}" href="#" target="_blank" rel="noopener"`
        : ` data-config="${escHtml(resource.hrefKey)}" href="#"`;
      return `<a class="btn secondary everyday-tasks-open-btn"${attrs}>${label}</a>`;
    }
    return "";
  }

  function everydayTaskFlowArrow() {
    return '<span class="everyday-tasks-flow-arrow" aria-hidden="true">→</span>';
  }

  function everydayTaskLabelHtml(row) {
    if (Array.isArray(row.taskFlow) && row.taskFlow.length) {
      const inner = row.taskFlow
        .map((part, i) => {
          const text = `<span class="everyday-tasks-task-part">${escHtml(part)}</span>`;
          return i === 0 ? text : everydayTaskFlowArrow() + text;
        })
        .join("");
      return `<span class="everyday-tasks-flow">${inner}</span>`;
    }
    if (row.taskHeading) {
      let html = `<span class="everyday-tasks-heading">${escHtml(row.taskHeading)}</span>`;
      if (Array.isArray(row.inlineBullets) && row.inlineBullets.length) {
        html +=
          '<ul class="everyday-tasks-inline-list">' +
          row.inlineBullets.map((item) => `<li>${escHtml(item)}</li>`).join("") +
          "</ul>";
      }
      return html;
    }
    return `<strong class="everyday-tasks-task">${escHtml(row.task || "")}</strong>`;
  }

  function renderEverydayTasksInto(tbody) {
    if (!tbody) return;
    tbody.innerHTML = EVERYDAY_TASKS.map((row) => {
      const label = everydayTaskLabelHtml(row);
      return (
        `<tr class="everyday-tasks-row">` +
        `<td class="everyday-tasks-step"><span class="everyday-tasks-step-num">${row.step}</span></td>` +
        `<td class="everyday-tasks-what">${label}</td>` +
        `<td class="everyday-tasks-open">${everydayTaskToolCell(row)}</td>` +
        `</tr>`
      );
    }).join("");
    initConfigLinks();
    if (window.SiteIcons) window.SiteIcons.initIcons(tbody);
  }

  function initEverydayTasks() {
    renderEverydayTasksInto(document.getElementById("everyday-tasks-body"));
  }

  window.EverydayTasks = { renderInto: renderEverydayTasksInto };

  const CHECKLIST_GROUPS = [
    {
      title: "Course modules",
      guide: { href: "course-module.html?m=introduction", label: "Start course" },
      items: [
        {
          id: "module_introduction",
          label: "Start Here",
          link: { href: "course-module.html?m=introduction", label: "Open module" },
        },
        {
          id: "module_business",
          label: "The Business",
          link: { href: "course-module.html?m=business", label: "Open module" },
        },
        {
          id: "module_setup_accounts",
          label: "Setup Accounts",
          link: { href: "course-module.html?m=setup-accounts", label: "Open module" },
        },
        {
          id: "module_dashboard",
          label: "Platform Tour",
          link: { href: "course-module.html?m=dashboard", label: "Open module" },
        },
        {
          id: "module_everyday_tasks",
          label: "Everyday Tasks",
          link: { href: "course-module.html?m=everyday-tasks", label: "Open module" },
        },
      ],
    },
    {
      title: "Get started",
      guide: { href: "setup.html", label: "Setup guide" },
      items: [
        {
          id: "telegram",
          label: "Joined ",
          link: { hrefKey: "telegramTeam", label: "Website Agency" },
        },
        {
          id: "payout",
          label: "Saved your payout method",
          hint: "Pick your app and save your link",
          link: { href: "course-module.html?m=setup-accounts", label: "Open setup" },
        },
      ],
    },
    {
      title: "Before your first call",
      items: TOOL_PAGES.map((p) => ({
        id: DAILY_TOOL_PROGRESS[p.id] || p.id,
        label: "Opened " + p.label,
        link: { href: p.href, label: p.label },
      })),
    },
  ];

  function getChecklistItems() {
    return CHECKLIST_GROUPS.flatMap((g) => g.items);
  }

  function checklistProgressPercent(progress) {
    const items = getChecklistItems();
    if (!items.length) return 0;
    const done = items.filter((it) => isChecklistItemDone(it.id, progress)).length;
    return (done / items.length) * 100;
  }

  function updateChecklistNavProgress() {
    const bar = document.querySelector(".nav-link--checklist .nav-link-progress-bar");
    if (!bar) return;
    bar.style.width = checklistProgressPercent(loadProgress()) + "%";
  }

  function checklistItemLink(link) {
    if (!link) return "";
    if (link.href) {
      return ` <a class="link-bold-blue checklist-item-link" href="${link.href}">${link.label}</a>`;
    }
    if (link.hrefKey && cfg()[link.hrefKey]) {
      return (
        ` <a class="link-bold-blue checklist-item-link" href="${cfg()[link.hrefKey]}" target="_blank" rel="noopener">` +
        `${link.label}</a>`
      );
    }
    return "";
  }

  function markCourseModuleChecklist(mod) {
    if (!mod || !window.CourseModules?.markComplete) return Promise.resolve();
    const progress = loadProgress();
    const next = window.CourseModules.markComplete(mod, progress);
    saveProgress(next);
    pulseCourseModuleBadge(mod);
    window.dispatchEvent(new CustomEvent("onboarding-progress-changed"));
    if (window.RepStorage?.flushSync) {
      return window.RepStorage.flushSync().catch((e) => {
        console.warn("Course progress sync failed", e);
      });
    }
    if (window.RepStorage?.push) {
      return window.RepStorage.push().catch((e) => {
        console.warn("Course progress sync failed", e);
      });
    }
    return Promise.resolve();
  }

  function touchProgressKeys(keys) {
    if (!keys?.length) return;
    const progress = loadProgress();
    let changed = false;
    keys.forEach((k) => {
      if (k && !progress[k]) {
        progress[k] = true;
        changed = true;
      }
    });
    if (!changed) return;
    saveProgress(progress);
    window.dispatchEvent(new CustomEvent("onboarding-progress-changed"));
  }

  window.LpcOnboarding = {
    markCourseModuleComplete: markCourseModuleChecklist,
    touchProgressKeys,
    loadProgress,
  };

  function initOnboardingChecklist() {
    const root = document.getElementById("onboarding-checklist");
    if (!root) return;
    const progress = loadProgress();
    const allItems = CHECKLIST_GROUPS.flatMap((g) => g.items);

    function render() {
      const bar = document.getElementById("checklist-bar");
      const label = document.getElementById("checklist-label");
      const done = allItems.filter((it) => isChecklistItemDone(it.id, progress)).length;
      if (bar) bar.style.width = allItems.length ? (done / allItems.length) * 100 + "%" : "0%";
      if (label) label.textContent = done + " of " + allItems.length + " complete";

      root.innerHTML = CHECKLIST_GROUPS.map((group) => {
        const guide = group.guide
          ? `<a class="checklist-group-link no-underline" href="${group.guide.href}">${group.guide.label} →</a>`
          : "";
        const rows = group.items
          .map((it) => {
            const hint = it.hint ? `<span class="checklist-hint">${it.hint}</span>` : "";
            return (
              `<li data-progress-id="${it.id}">` +
              `<input type="checkbox" id="c-${it.id}" ${isChecklistItemDone(it.id, progress) ? "checked" : ""}>` +
              `<label for="c-${it.id}">` +
              `<span class="checklist-item-label">${it.label}${checklistItemLink(it.link)}${it.linkSuffix || ""}</span>${hint}` +
              `</label></li>`
            );
          })
          .join("");
        return (
          `<section class="checklist-group">` +
          `<div class="checklist-group-head"><h2 class="checklist-group-title">${group.title}</h2>${guide}</div>` +
          `<ul class="checklist-group-list">${rows}</ul>` +
          `</section>`
        );
      }).join("");

      root.querySelectorAll("input").forEach((cb) => {
        cb.addEventListener("change", () => {
          preserveScroll(() => {
            const id = cb.id.replace("c-", "");
            progress[id] = cb.checked;
            saveProgress(progress);
            window.dispatchEvent(new CustomEvent("onboarding-progress-changed"));
            render();
          });
        });
      });
    }
    render();
  }

  let reloadSalesTracker = null;

  function initSalesTracker() {
    const root = document.getElementById("sales-tracker");
    const form = document.getElementById("close-form");
    if (!root && !form) return;
    if (form?.dataset.trackerBound === "1") {
      reloadSalesTracker?.();
      return;
    }

    const runTracker = () => {
      window.RepSession?.enforceTrackerIdentity?.();
      bootTracker();
    };

    runTracker();

    if (window.RepSession?.get?.() && window.RepStorage?.whenReady) {
      window.RepStorage.whenReady(() => reloadSalesTracker?.());
    }
  }

  function bootTracker() {
    const root = document.getElementById("sales-tracker");
    const form = document.getElementById("close-form");
    if (!root && !form) return;

    let data = loadTracker();

    const GOAL_RING_C = 2 * Math.PI * 42;

    function applyGoalRingProgress(pct) {
      const ring = document.getElementById("goal-ring-progress");
      if (!ring) return;
      const p = Math.min(100, Math.max(0, pct));
      ring.style.strokeDasharray = GOAL_RING_C + " " + GOAL_RING_C;
      ring.style.strokeDashoffset = String(GOAL_RING_C * (1 - p / 100));
    }

    function renderStats() {
      const deals = data.deals || [];
      const earned = calcEarnedFromDeals(deals);
      const closes = deals.length;
      const goal = normalizeGoal(data.goal);
      const pct = Math.min(100, (earned / goal) * 100);

      const earnedEl = document.getElementById("tracker-earned");
      if (earnedEl) earnedEl.textContent = "$" + formatMoney(earned);
      const closesEl = document.getElementById("tracker-closes");
      if (closesEl) closesEl.textContent = String(closes);
      const gl = document.getElementById("goal-pct-label");
      const rem = document.getElementById("tracker-remaining");
      const pctBadge = document.getElementById("goal-pct-badge");
      const pctRound = Math.round(pct);
      applyGoalRingProgress(pct);
      if (pctBadge) pctBadge.textContent = pctRound + "%";
      if (gl) {
        gl.textContent = "$" + formatMoney(earned) + " of $" + formatMoney(goal);
      }
      if (rem) {
        rem.textContent =
          earned >= goal
            ? "Goal reached"
            : "$" + formatMoney(goal - earned) + " to go";
      }
      const goalDisplay = document.getElementById("goal-display-value");
      if (goalDisplay && !document.getElementById("dash-goal-editor")?.classList.contains("is-editing")) {
        goalDisplay.textContent = formatMoney(goal);
      }
    }

    function initGoalEditor() {
      const editor = document.getElementById("dash-goal-editor");
      const input = document.getElementById("tracker-goal");
      const displayBtn = document.getElementById("goal-display-btn");
      const displayVal = document.getElementById("goal-display-value");
      if (!editor || !input || !displayBtn) return;

      let skipCommit = false;

      function showDisplay() {
        editor.classList.remove("is-editing");
        if (displayVal) displayVal.textContent = formatMoney(normalizeGoal(data.goal));
      }

      function showEdit() {
        editor.classList.add("is-editing");
        input.value = String(normalizeGoal(data.goal));
        focusNoScroll(input);
        input.select();
      }

      function commitGoal() {
        if (skipCommit) {
          skipCommit = false;
          return;
        }
        const v = parseInt(String(input.value).replace(/\D/g, ""), 10);
        data.goal = v > 0 ? v : DEFAULT_GOAL;
        saveTracker(data);
        showDisplay();
        renderAll();
      }

      displayBtn.addEventListener("click", showEdit);
      input.addEventListener("blur", commitGoal);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
        if (e.key === "Escape") {
          skipCommit = true;
          showDisplay();
        }
      });

      showDisplay();
    }

    function renderDealsList() {
      const list = document.getElementById("deals-list");
      const empty = document.getElementById("deals-empty");
      const countLabel = document.getElementById("deals-count-label");
      if (!list) return;

      const deals = [...(data.deals || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      if (countLabel) {
        countLabel.textContent =
          deals.length === 1 ? "1 sale" : deals.length + " sales";
      }
      if (empty) empty.hidden = deals.length > 0;

      if (!deals.length) {
        list.innerHTML = "";
        return;
      }

      list.innerHTML = deals
        .map((d) => {
          const amount = Number(d.commission) || 0;
          const title = d.businessName || "$" + formatMoney(amount);

          return (
            '<li class="deal-card" data-deal-id="' +
            escHtml(d.id) +
            '">' +
            '<div class="deal-card-main">' +
            '<div class="deal-card-top">' +
            '<strong class="deal-title">' +
            escHtml(title) +
            "</strong>" +
            (d.businessName
              ? '<span class="deal-amount">$' + formatMoney(amount) + "</span>"
              : "") +
            '<span class="deal-date">' +
            escHtml(formatDealDate(d.createdAt)) +
            "</span>" +
            "</div>" +
            "</div>" +
            '<button type="button" class="deal-delete btn secondary" data-delete-deal="' +
            escHtml(d.id) +
            '" aria-label="Delete sale">Delete</button>' +
            "</li>"
          );
        })
        .join("");

      list.querySelectorAll("[data-delete-deal]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-delete-deal");
          data.deals = data.deals.filter((d) => d.id !== id);
          saveTracker(data);
          renderStats();
          renderDealsList();
          if (window.SiteIcons) window.SiteIcons.initIcons();
        });
      });

      if (window.SiteIcons) window.SiteIcons.initIcons();
    }

    function renderAll() {
      renderStats();
      renderDealsList();
      root?.classList.add("dash-hydrated");
    }

    function reloadFromStorage() {
      data = loadTracker();
      const session = window.RepSession?.get?.();
      if (session?.name) {
        data.name = session.name;
        data.repId = session.id;
      }
      data.goal = normalizeGoal(data.goal);
      renderAll();
    }

    reloadSalesTracker = reloadFromStorage;

    function parseClosePrice(raw) {
      const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? Math.round(n) : 0;
    }

    if (form) form.dataset.trackerBound = "1";
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const priceEl = document.getElementById("close-price");
      const businessEl = document.getElementById("close-business");
      const commission = parseClosePrice(priceEl?.value);
      if (commission <= 0) {
        alert("Enter a price greater than $0.");
        focusNoScroll(priceEl);
        return;
      }

      const deal = {
        id: newDealId(),
        createdAt: new Date().toISOString(),
        commission,
        businessName: businessEl?.value.trim() || "",
      };

      data.deals = data.deals || [];
      data.deals.push(deal);
      saveTracker(data);
      if (priceEl) priceEl.value = "";
      if (businessEl) businessEl.value = "";
      renderAll();
    });

    const session = window.RepSession?.get?.();
    if (session?.name) {
      data.name = session.name;
      data.repId = session.id;
    }
    data.goal = normalizeGoal(data.goal);
    try {
      const raw = JSON.parse(lsGet(TRACKER_KEY) || "{}");
      if (!raw.goal || Number(raw.goal) <= 0) saveTracker(data);
    } catch (e) {
      saveTracker(data);
    }
    initGoalEditor();
    if (window.SiteIcons) window.SiteIcons.initIcons();
    renderAll();
  }

  function renderStepFooter() {
    if (document.body.dataset.page !== "setup") return;
    const slot = document.getElementById("step-footer-slot");
    if (!slot) return;
    const prev = window.CourseModules?.prevModule?.("setup");
    const next = window.CourseModules?.nextModule?.("setup");

    let html = '<div class="step-footer step-footer-next-only">';
    if (next && window.CourseModules) {
      html += `<a href="${window.CourseModules.href(next)}" class="btn next no-underline">Next</a>`;
    } else {
      html += `<a href="dashboard.html" class="btn next no-underline">Next</a>`;
    }
    html += "</div>";
    slot.innerHTML = html;

    const header = document.getElementById("step-header-slot");
    if (header) {
      const prevLink =
        prev && window.CourseModules
          ? `<a href="${window.CourseModules.href(prev)}" class="no-underline" style="font-size:13px;color:var(--muted);margin-left:auto">← ${prev.title}</a>`
          : `<a href="course-module.html?m=business" class="no-underline" style="font-size:13px;color:var(--muted);margin-left:auto">← Course</a>`;
      header.innerHTML = `
        <div class="step-header">
          <span class="step-pill">Course · Get started</span>
          ${prevLink}
        </div>
      `;
    }
  }

  function initAccordions() {
    document.querySelectorAll(".acc.open").forEach((o) => o.classList.remove("open"));

    document.querySelectorAll(".acc").forEach((acc) => {
      const q = acc.querySelector(".acc-q");
      const panel = acc.querySelector(".acc-a");
      if (!q || q.dataset.bound) return;
      q.dataset.bound = "1";
      q.setAttribute("aria-expanded", "false");

      q.addEventListener("click", () => {
        const open = acc.classList.contains("open");
        document.querySelectorAll(".acc.open").forEach((o) => {
          o.classList.remove("open");
          o.querySelector(".acc-q")?.setAttribute("aria-expanded", "false");
        });
        if (!open) {
          acc.classList.add("open");
          q.setAttribute("aria-expanded", "true");
        }
      });

      panel?.addEventListener("click", (e) => e.stopPropagation());
    });
  }

  const SCRIPTS_STORAGE_KEY = "lpc_call_scripts_edits_v1";
  const CUSTOM_SCRIPTS_KEY = "lpc_custom_scripts_v1";

  function loadScriptEdits() {
    try {
      return JSON.parse(lsGet(SCRIPTS_STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveScriptEdits(data) {
    lsSet(SCRIPTS_STORAGE_KEY, JSON.stringify(data));
  }

  function loadCustomScripts() {
    try {
      const arr = JSON.parse(lsGet(CUSTOM_SCRIPTS_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomScripts(scripts) {
    lsSet(CUSTOM_SCRIPTS_KEY, JSON.stringify(scripts));
  }

  function newCustomScriptId() {
    return "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function htmlToPlainText(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.innerText || div.textContent || "").trim();
  }

  function slugifyFilename(name) {
    return (
      String(name || "script")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "script"
    );
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getScriptTitleFromAcc(acc) {
    const customTitle = acc.querySelector(".custom-script-title-input");
    if (customTitle) return customTitle.value.trim() || "Untitled script";
    return acc.querySelector(".acc-q")?.textContent?.replace("▼", "").trim() || "Call script";
  }

  function getBlocksFromAcc(acc) {
    return Array.from(acc.querySelectorAll(".script-block")).map((block) => ({
      label: block.querySelector(".script-label")?.textContent?.trim() || "",
      html: block.querySelector(".script-body")?.innerHTML || "",
    }));
  }

  function buildScriptExport(title, blocks, format) {
    const lines = [];
    if (format === "md") {
      lines.push("# " + title, "");
      blocks.forEach((b) => {
        const text = htmlToPlainText(b.html);
        if (!text) return;
        if (b.label) lines.push("## " + b.label, "");
        lines.push(text, "");
      });
    } else {
      lines.push(title, "=".repeat(Math.min(title.length, 40)), "");
      blocks.forEach((b) => {
        const text = htmlToPlainText(b.html);
        if (!text) return;
        if (b.label) lines.push(b.label, "-".repeat(Math.min(b.label.length, 30)), "");
        lines.push(text, "");
      });
    }
    return lines.join("\n").trim() + "\n";
  }

  function downloadScriptFromAcc(acc, format) {
    const title = getScriptTitleFromAcc(acc);
    const blocks = getBlocksFromAcc(acc);
    const ext = format === "md" ? "md" : "txt";
    downloadTextFile(slugifyFilename(title) + "." + ext, buildScriptExport(title, blocks, format));
  }

  function defaultCustomScriptTitle(scripts) {
    const base = "New script";
    if (!scripts.some((s) => s.title === base)) return base;
    let n = 2;
    while (scripts.some((s) => s.title === base + " " + n)) n++;
    return base + " " + n;
  }

  function renderCustomScripts() {
    const list = document.getElementById("custom-scripts-list");
    const empty = document.getElementById("custom-scripts-empty");
    if (!list) return;

    const scripts = loadCustomScripts();
    if (empty) empty.hidden = scripts.length > 0;

    list.innerHTML = scripts
      .map(
        (s) =>
          `<div class="acc acc-custom" data-custom-script-id="${escHtml(s.id)}">` +
          `<button type="button" class="acc-q acc-q-custom">` +
          `<input type="text" class="custom-script-title-input" value="${escHtml(s.title)}" aria-label="Script name" autocomplete="off" />` +
          `<span class="chev">▼</span></button>` +
          `<div class="acc-a"><div class="acc-a-inner">` +
          `<div class="script-toolbar script-toolbar-custom">` +
          `<button type="button" class="btn secondary custom-script-delete">Delete</button>` +
          `<button type="button" class="btn secondary script-dl-btn" data-format="txt">.txt</button>` +
          `<button type="button" class="btn secondary script-dl-btn" data-format="md">.md</button>` +
          `</div>` +
          `<div class="script-block">` +
          `<div class="script-body" contenteditable="true" spellcheck="true" data-custom-body="1">${s.html || "<p><br></p>"}</div>` +
          `</div></div></div></div>`
      )
      .join("");
  }

  function persistCustomScriptBody(id, html) {
    const scripts = loadCustomScripts();
    const item = scripts.find((s) => s.id === id);
    if (item) {
      item.html = html;
      saveCustomScripts(scripts);
    }
  }

  function persistCustomScriptTitle(id, title) {
    const scripts = loadCustomScripts();
    const item = scripts.find((s) => s.id === id);
    if (!item) return;
    const trimmed = String(title || "").trim() || "Untitled script";
    item.title = trimmed;
    saveCustomScripts(scripts);
  }

  function refreshCustomScriptsUI(openId) {
    renderCustomScripts();
    bindCustomScriptActions();
    initAccordions();
    if (window.SiteIcons) window.SiteIcons.initIcons();
    if (openId) {
      const acc = document.querySelector('[data-custom-script-id="' + openId + '"]');
      acc?.classList.add("open");
      acc?.querySelector(".acc-q")?.setAttribute("aria-expanded", "true");
    }
  }

  function bindCustomScriptActions() {
    const list = document.getElementById("custom-scripts-list");
    if (!list) return;

    list.querySelectorAll(".acc-custom").forEach((acc) => {
      const id = acc.dataset.customScriptId;
      const body = acc.querySelector("[data-custom-body]");
      if (body && !body.dataset.bound) {
        body.dataset.bound = "1";
        const save = () => persistCustomScriptBody(id, body.innerHTML);
        body.addEventListener("input", save);
        body.addEventListener("blur", save);
      }

      const titleInput = acc.querySelector(".custom-script-title-input");
      if (titleInput && !titleInput.dataset.bound) {
        titleInput.dataset.bound = "1";
        ["click", "mousedown", "keydown"].forEach((ev) => {
          titleInput.addEventListener(ev, (e) => e.stopPropagation());
        });
        titleInput.addEventListener("input", () => persistCustomScriptTitle(id, titleInput.value));
        titleInput.addEventListener("blur", () => {
          const trimmed = titleInput.value.trim() || "Untitled script";
          titleInput.value = trimmed;
          persistCustomScriptTitle(id, trimmed);
        });
        titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            titleInput.blur();
          }
        });
      }

      const deleteBtn = acc.querySelector(".custom-script-delete");
      if (deleteBtn && !deleteBtn.dataset.bound) {
        deleteBtn.dataset.bound = "1";
        deleteBtn.addEventListener("click", () => {
          const title = titleInput?.value?.trim() || getScriptTitleFromAcc(acc);
          if (!confirm('Delete "' + title + '"? This cannot be undone.')) return;
          saveCustomScripts(loadCustomScripts().filter((s) => s.id !== id));
          refreshCustomScriptsUI();
        });
      }
    });
  }

  function initCallScripts() {
    const root = document.getElementById("scripts-editor");
    const customRoot = document.getElementById("custom-scripts-list");
    if (!root && !customRoot) return;

    renderCustomScripts();
    bindCustomScriptActions();

    const stored = loadScriptEdits();
    root?.querySelectorAll(".script-body[data-block-id]").forEach((el) => {
      const id = el.dataset.blockId;
      if (!id) return;
      if (!el.dataset.defaultHtml) el.dataset.defaultHtml = el.innerHTML;
      if (stored[id]) el.innerHTML = stored[id];

      const persist = () => {
        const data = loadScriptEdits();
        data[id] = el.innerHTML;
        saveScriptEdits(data);
      };
      el.addEventListener("input", persist);
      el.addEventListener("blur", persist);
    });

    const scriptsPage = document.getElementById("page-body");
    scriptsPage?.querySelectorAll(".script-reset-btn").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const acc = btn.closest(".acc");
        if (!acc || acc.classList.contains("acc-custom")) return;
        const title = getScriptTitleFromAcc(acc);
        if (!confirm("Reset " + title + " to the original text?")) return;

        const data = loadScriptEdits();
        acc.querySelectorAll(".script-body[data-block-id]").forEach((el) => {
          const id = el.dataset.blockId;
          if (el.dataset.defaultHtml) el.innerHTML = el.dataset.defaultHtml;
          if (id) delete data[id];
        });
        saveScriptEdits(data);
      });
    });

    if (scriptsPage && !scriptsPage.dataset.dlBound) {
      scriptsPage.dataset.dlBound = "1";
      scriptsPage.addEventListener("click", (e) => {
        const dl = e.target.closest(".script-dl-btn");
        if (dl) {
          const acc = dl.closest(".acc");
          if (acc) downloadScriptFromAcc(acc, dl.dataset.format || "txt");
          return;
        }
        const jump = e.target.closest(".script-open-btn");
        if (!jump) return;
        const scriptId = jump.dataset.scriptId;
        if (!scriptId) return;
        const acc = document.querySelector('#scripts-editor .acc[data-script-id="' + scriptId + '"]');
        if (!acc) return;
        document.querySelectorAll("#scripts-editor .acc.open").forEach((a) => a.classList.remove("open"));
        acc.classList.add("open");
        acc.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    const addBtn = document.getElementById("add-custom-script");
    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = "1";
      addBtn.addEventListener("click", () => {
        const scripts = loadCustomScripts();
        const item = {
          id: newCustomScriptId(),
          title: defaultCustomScriptTitle(scripts),
          html: "<p>Write your script here…</p>",
        };
        scripts.push(item);
        saveCustomScripts(scripts);
        refreshCustomScriptsUI(item.id);

        const acc = document.querySelector('[data-custom-script-id="' + item.id + '"]');
        const titleInput = acc?.querySelector(".custom-script-title-input");
        const body = acc?.querySelector("[data-custom-body]");
        focusNoScroll(titleInput);
        titleInput?.select();
        if (!titleInput) focusNoScroll(body);
      });
    }

    initAccordions();
  }

  const OUTREACH_EDITS_KEY = "lpc_outreach_edits_v1";
  const CUSTOM_OUTREACH_KEY = "lpc_custom_outreach_v1";

  function loadOutreachEdits() {
    try {
      return JSON.parse(lsGet(OUTREACH_EDITS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveOutreachEdits(data) {
    lsSet(OUTREACH_EDITS_KEY, JSON.stringify(data));
  }

  function loadCustomOutreach() {
    try {
      const arr = JSON.parse(lsGet(CUSTOM_OUTREACH_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomOutreach(items) {
    lsSet(CUSTOM_OUTREACH_KEY, JSON.stringify(items));
  }

  function newCustomOutreachId() {
    return "outreach-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultCustomOutreachTitle(items) {
    const base = "New template";
    if (!items.some((s) => s.title === base)) return base;
    let n = 2;
    while (items.some((s) => s.title === base + " " + n)) n++;
    return base + " " + n;
  }

  function getOutreachTitleFromAcc(acc) {
    const customTitle = acc.querySelector(".custom-outreach-title-input");
    if (customTitle) return customTitle.value.trim() || "Untitled template";
    return acc.querySelector(".acc-q")?.textContent?.replace("▼", "").trim() || "Template";
  }

  function renderCustomOutreach() {
    const list = document.getElementById("custom-outreach-list");
    const empty = document.getElementById("custom-outreach-empty");
    if (!list) return;

    const items = loadCustomOutreach();
    if (empty) empty.hidden = items.length > 0;

    list.innerHTML = items
      .map(
        (s) =>
          `<div class="acc acc-custom" data-custom-outreach-id="${escHtml(s.id)}">` +
          `<button type="button" class="acc-q acc-q-custom">` +
          `<input type="text" class="custom-outreach-title-input" value="${escHtml(s.title)}" aria-label="Template name" autocomplete="off" />` +
          `<span class="chev">▼</span></button>` +
          `<div class="acc-a"><div class="acc-a-inner">` +
          `<div class="script-toolbar script-toolbar-custom">` +
          `<button type="button" class="btn secondary custom-outreach-delete">Delete</button>` +
          `<button type="button" class="btn secondary script-dl-btn" data-format="txt">.txt</button>` +
          `</div>` +
          `<div class="script-block">` +
          `<div class="script-body" contenteditable="true" spellcheck="true" data-custom-outreach-body="1">${s.html || "<p><br></p>"}</div>` +
          `</div></div></div></div>`
      )
      .join("");
  }

  function persistCustomOutreachBody(id, html) {
    const items = loadCustomOutreach();
    const item = items.find((s) => s.id === id);
    if (item) {
      item.html = html;
      saveCustomOutreach(items);
    }
  }

  function persistCustomOutreachTitle(id, title) {
    const items = loadCustomOutreach();
    const item = items.find((s) => s.id === id);
    if (!item) return;
    item.title = String(title || "").trim() || "Untitled template";
    saveCustomOutreach(items);
  }

  function refreshCustomOutreachUI(openId) {
    renderCustomOutreach();
    bindCustomOutreachActions();
    initAccordions();
    if (openId) {
      const acc = document.querySelector('[data-custom-outreach-id="' + openId + '"]');
      acc?.classList.add("open");
      acc?.querySelector(".acc-q")?.setAttribute("aria-expanded", "true");
    }
  }

  function bindCustomOutreachActions() {
    const list = document.getElementById("custom-outreach-list");
    if (!list) return;

    list.querySelectorAll(".acc-custom").forEach((acc) => {
      const id = acc.dataset.customOutreachId;
      const body = acc.querySelector("[data-custom-outreach-body]");
      if (body && !body.dataset.bound) {
        body.dataset.bound = "1";
        const save = () => persistCustomOutreachBody(id, body.innerHTML);
        body.addEventListener("input", save);
        body.addEventListener("blur", save);
      }

      const titleInput = acc.querySelector(".custom-outreach-title-input");
      if (titleInput && !titleInput.dataset.bound) {
        titleInput.dataset.bound = "1";
        ["click", "mousedown", "keydown"].forEach((ev) => {
          titleInput.addEventListener(ev, (e) => e.stopPropagation());
        });
        titleInput.addEventListener("input", () => persistCustomOutreachTitle(id, titleInput.value));
        titleInput.addEventListener("blur", () => {
          const trimmed = titleInput.value.trim() || "Untitled template";
          titleInput.value = trimmed;
          persistCustomOutreachTitle(id, trimmed);
        });
        titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            titleInput.blur();
          }
        });
      }

      const deleteBtn = acc.querySelector(".custom-outreach-delete");
      if (deleteBtn && !deleteBtn.dataset.bound) {
        deleteBtn.dataset.bound = "1";
        deleteBtn.addEventListener("click", () => {
          const title = titleInput?.value?.trim() || getOutreachTitleFromAcc(acc);
          if (!confirm('Delete "' + title + '"? This cannot be undone.')) return;
          saveCustomOutreach(loadCustomOutreach().filter((s) => s.id !== id));
          refreshCustomOutreachUI();
        });
      }
    });
  }

  function initOutreachEditor() {
    const root = document.getElementById("outreach-editor");
    const customRoot = document.getElementById("custom-outreach-list");
    if (!root && !customRoot) return;

    renderCustomOutreach();
    bindCustomOutreachActions();

    const stored = loadOutreachEdits();
    root?.querySelectorAll(".script-body[data-block-id]").forEach((el) => {
      const id = el.dataset.blockId;
      if (!id) return;
      if (!el.dataset.defaultHtml) el.dataset.defaultHtml = el.innerHTML;
      if (stored[id]) el.innerHTML = stored[id];

      const persist = () => {
        const data = loadOutreachEdits();
        data[id] = el.innerHTML;
        saveOutreachEdits(data);
      };
      el.addEventListener("input", persist);
      el.addEventListener("blur", persist);
    });

    const page = document.getElementById("page-body");
    page?.querySelectorAll(".outreach-reset-btn").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const acc = btn.closest(".acc");
        if (!acc || acc.classList.contains("acc-custom")) return;
        const title = getOutreachTitleFromAcc(acc);
        if (!confirm("Reset " + title + " to the original text?")) return;

        const data = loadOutreachEdits();
        acc.querySelectorAll(".script-body[data-block-id]").forEach((el) => {
          const id = el.dataset.blockId;
          if (el.dataset.defaultHtml) el.innerHTML = el.dataset.defaultHtml;
          if (id) delete data[id];
        });
        saveOutreachEdits(data);
      });
    });

    if (page && !page.dataset.outreachDlBound) {
      page.dataset.outreachDlBound = "1";
      page.addEventListener("click", (e) => {
        const dl = e.target.closest(".script-dl-btn");
        if (!dl) return;
        const acc = dl.closest(".acc");
        if (acc) downloadScriptFromAcc(acc, dl.dataset.format || "txt");
      });
    }

    const addBtn = document.getElementById("add-custom-outreach");
    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = "1";
      addBtn.addEventListener("click", () => {
        const items = loadCustomOutreach();
        const item = {
          id: newCustomOutreachId(),
          title: defaultCustomOutreachTitle(items),
          html: "<p>Write your template here…</p>",
        };
        items.push(item);
        saveCustomOutreach(items);
        refreshCustomOutreachUI(item.id);

        const acc = document.querySelector('[data-custom-outreach-id="' + item.id + '"]');
        const titleInput = acc?.querySelector(".custom-outreach-title-input");
        const body = acc?.querySelector("[data-custom-outreach-body]");
        focusNoScroll(titleInput);
        titleInput?.select();
        if (!titleInput) focusNoScroll(body);
      });
    }

    initAccordions();
    initConfigLinks();
  }

  const TEMPLATE_BUILDER_KEY = "lpc_template_builder_v1";
  let tplMode = "dl";
  let tplPrice = "$500";

  function loadTemplateBuilder() {
    try {
      return JSON.parse(lsGet(TEMPLATE_BUILDER_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveTemplateBuilder(data) {
    lsSet(TEMPLATE_BUILDER_KEY, JSON.stringify(data));
  }

  function persistTemplateBuilder() {
    saveTemplateBuilder({
      mode: tplMode,
      price: tplPrice,
      name: document.getElementById("tpl-name")?.value || "",
      phone: document.getElementById("tpl-phone")?.value || "",
      maps: document.getElementById("tpl-maps")?.value || "",
    });
  }

  function applyTemplateBuilder() {
    const s = loadTemplateBuilder();
    if (s.price) setTplPrice(s.price, true);
    else setTplPrice("$500", true);
    if (s.mode) setTplMode(s.mode, true);
    else setTplMode("dl", true);
    const nameEl = document.getElementById("tpl-name");
    const phoneEl = document.getElementById("tpl-phone");
    const mapsEl = document.getElementById("tpl-maps");
    if (nameEl && s.name) nameEl.value = s.name;
    if (phoneEl && s.phone) phoneEl.value = s.phone;
    if (mapsEl && s.maps) mapsEl.value = s.maps;
    syncTplCallBtn();
  }

  function setTplMode(mode, skipSave) {
    tplMode = mode;
    document.getElementById("btn-dl")?.classList.toggle("active", mode === "dl");
    document.getElementById("btn-bk")?.classList.toggle("active", mode === "bk");
    if (!skipSave) persistTemplateBuilder();
  }

  function setTplPrice(price, skipSave) {
    tplPrice = price;
    const map = { $500: "btn-p500", $700: "btn-p700", "$1,000": "btn-p1000", "$1,500": "btn-p1500" };
    Object.values(map).forEach((id) => document.getElementById(id)?.classList.remove("active"));
    document.getElementById(map[price] || "btn-p500")?.classList.add("active");
    if (!skipSave) persistTemplateBuilder();
  }

  function formatPhoneForCopy(raw) {
    const formatted = global.LeadDisplay?.formatPhoneForLeadBuilder?.(raw);
    if (formatted) return formatted;
    const t = String(raw || "").trim();
    return t || "[Phone Number]";
  }

  function copyTpl(btn) {
    closeTplInfoPanels();
    const pref = tplMode === "dl" ? "Direct Link" : "Booking";
    const text =
      "Price: " +
      tplPrice +
      "\nGoogle Maps: " +
      (document.getElementById("tpl-maps")?.value || "[Google Maps link]") +
      "\nPreference: " +
      pref +
      "\nPhone: " +
      formatPhoneForCopy(document.getElementById("tpl-phone")?.value) +
      "\nOwner Name: " +
      (document.getElementById("tpl-name")?.value || "[Name]");
    const ok = () => {
      preserveScroll(() => {
        btn.textContent = "Copied";
      });
      setTimeout(() => {
        preserveScroll(() => {
          btn.textContent = "Copy template";
        });
      }, 2000);
      persistTemplateBuilder();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok);
    else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      ok();
    }
  }

  function clearTpl() {
    closeTplInfoPanels();
    ["tpl-name", "tpl-phone", "tpl-maps"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    setTplPrice("$500");
    setTplMode("dl");
    persistTemplateBuilder();
    syncTplCallBtn();
  }

  function telHrefFromTplPhone(raw) {
    const t = String(raw || "").trim();
    if (!t) return "";
    let d = t.replace(/\D/g, "");
    if (d.length === 10) return "tel:+1" + d;
    if (d.length === 11 && d[0] === "1") return "tel:+" + d;
    if (d.length > 11) return "tel:+" + d;
    return "";
  }

  function syncTplCallBtn() {
    const btn = document.getElementById("tpl-call-btn");
    const phone = document.getElementById("tpl-phone")?.value || "";
    if (!btn) return;
    const href = telHrefFromTplPhone(phone);
    if (href) {
      btn.href = href;
      btn.removeAttribute("aria-disabled");
      btn.classList.remove("is-disabled");
    } else {
      btn.href = "#";
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("is-disabled");
    }
  }

  function bindTemplateBuilderAutosave() {
    ["tpl-name", "tpl-phone", "tpl-maps"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", persistTemplateBuilder);
    });
    const phoneEl = document.getElementById("tpl-phone");
    const callBtn = document.getElementById("tpl-call-btn");
    if (phoneEl && !phoneEl.dataset.callSyncBound) {
      phoneEl.dataset.callSyncBound = "1";
      phoneEl.addEventListener("input", syncTplCallBtn);
    }
    if (callBtn && !callBtn.dataset.bound) {
      callBtn.dataset.bound = "1";
      callBtn.addEventListener("click", (e) => {
        if (callBtn.classList.contains("is-disabled")) {
          e.preventDefault();
        }
      });
    }
    syncTplCallBtn();
  }

  function closeTplInfoPanels() {
    document.querySelectorAll(".tpl-info-tooltip").forEach((tip) => {
      tip.hidden = true;
    });
    document.querySelectorAll(".tpl-info-btn").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.classList.remove("is-open");
    });
  }

  function bindTemplateBuilderActions() {
    const copyBtn = document.getElementById("tpl-copy-btn");
    const clearBtn = document.getElementById("tpl-clear-btn");
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = "1";
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyTpl(copyBtn);
      });
    }
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearTpl();
      });
    }
  }

  function initTplInfo() {
    const box = document.getElementById("tpl-builder");
    if (!box || box.dataset.tplInfoInit === "1") return;
    box.dataset.tplInfoInit = "1";

    bindTemplateBuilderActions();

    box.querySelectorAll(".tpl-info-tooltip").forEach((tip) => {
      tip.addEventListener("click", (e) => e.stopPropagation());
    });

    box.querySelectorAll("[data-tpl-info-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const panelId = btn.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        if (!panel) return;
        const wasOpen = btn.getAttribute("aria-expanded") === "true";
        closeTplInfoPanels();
        if (!wasOpen) {
          panel.hidden = false;
          btn.setAttribute("aria-expanded", "true");
          btn.classList.add("is-open");
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-tpl-info-toggle]") || e.target.closest(".tpl-info-tooltip")) {
        return;
      }
      closeTplInfoPanels();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTplInfoPanels();
    });
  }

  window.setTplMode = setTplMode;
  window.setTplPrice = setTplPrice;
  window.copyTpl = copyTpl;
  window.clearTpl = clearTpl;

  function initVideo() {
    const wrap = document.getElementById("video-embed");
    const url = cfg().onboardingVideoUrl;
    if (!wrap) return;
    if (!url) {
      wrap.innerHTML =
        '<div class="video-placeholder"><p>Your manager will add the video URL in <code>js/config.js</code>.</p></div>';
      return;
    }
    let embed = url;
    if (url.includes("youtube.com/watch")) {
      const id = new URL(url).searchParams.get("v");
      if (id) embed = "https://www.youtube.com/embed/" + id;
    } else if (url.includes("youtu.be/")) {
      embed = "https://www.youtube.com/embed/" + url.split("youtu.be/")[1].split("?")[0];
    }
    wrap.innerHTML = '<iframe src="' + embed + '" title="Course video" allowfullscreen></iframe>';
    const p = loadProgress();
    const vid = document.getElementById("mark-video-done");
    if (vid) {
      vid.addEventListener("click", () => {
        preserveScroll(() => {
          p.video = true;
          saveProgress(p);
          vid.textContent = "Marked as watched ✓";
        });
      });
    }
  }

  function buildLeadPickFromLead(lead) {
    if (window.LeadDisplay?.buildLeadBuilderPick) {
      return window.LeadDisplay.buildLeadBuilderPick(lead);
    }
    return {
      phone: lead?.phone || "",
      mapsUrl: lead?.mapsUrl || "",
      price: "$500",
    };
  }

  function applyLeadPick(pick) {
    if (!pick || !document.getElementById("tpl-builder")) return;
    if (pick.price) setTplPrice(pick.price, true);
    const mapsVal = pick.mapsUrl || pick.maps || "";
    const phoneEl = document.getElementById("tpl-phone");
    const mapsEl = document.getElementById("tpl-maps");
    if (phoneEl && pick.phone) {
      phoneEl.value =
        global.LeadDisplay?.formatPhoneForLeadBuilder?.(pick.phone) || pick.phone;
    }
    if (mapsEl && mapsVal) mapsEl.value = mapsVal;
    persistTemplateBuilder();
    syncTplCallBtn();
  }

  function mergeLeadPickIntoStorage(pick) {
    const s = loadTemplateBuilder();
    const mapsVal = pick.mapsUrl || pick.maps || "";
    saveTemplateBuilder({
      mode: s.mode || tplMode || "dl",
      price: pick.price || s.price || "$500",
      name: s.name || "",
      phone: pick.phone || "",
      maps: mapsVal || s.maps || "",
    });
  }

  function forwardLeadToBuilder(lead) {
    const leadId = lead?.id;
    if (leadId && window.LeadsPage?.pinLeadForBuilder) {
      void window.LeadsPage.pinLeadForBuilder(leadId);
    }
    const pick = buildLeadPickFromLead(lead);
    try {
      sessionStorage.setItem("lpc_lead_pick_v1", JSON.stringify(pick));
    } catch (e) {}
    if (document.getElementById("tpl-builder")) {
      applyLeadPick(pick);
      try {
        sessionStorage.removeItem("lpc_lead_pick_v1");
      } catch (e) {}
      return;
    }
    mergeLeadPickIntoStorage(pick);
    window.location.href = "template.html";
  }

  function initLeadPickFromFinder() {
    try {
      const raw = sessionStorage.getItem("lpc_lead_pick_v1");
      if (!raw) return;
      sessionStorage.removeItem("lpc_lead_pick_v1");
      applyLeadPick(JSON.parse(raw));
    } catch (e) {}
  }

  let tplAutosaveAnimTimer = null;

  function initTplAutosaveTag() {
    const tag = document.getElementById("tpl-autosave-tag");
    const label = document.getElementById("tpl-autosave-label");
    const check = tag?.querySelector(".tpl-autosave-check");
    if (!tag || !label || !check) return;

    if (tplAutosaveAnimTimer) clearTimeout(tplAutosaveAnimTimer);

    tag.classList.add("is-loading");
    label.textContent = "Saving…";
    check.hidden = true;

    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 1000;

    const finish = () => {
      tag.classList.remove("is-loading");
      label.textContent = "Auto saved!";
      check.hidden = false;
      if (window.SiteIcons) window.SiteIcons.initIcons(tag);
    };

    if (delay === 0) finish();
    else tplAutosaveAnimTimer = setTimeout(finish, delay);
  }

  window.forwardLeadToBuilder = forwardLeadToBuilder;

  function initConfigLinks() {
    document.querySelectorAll("[data-config]").forEach((el) => {
      const key = el.dataset.config;
      const val = cfg()[key];
      if (!val) {
        const row =
          el.closest("tr[data-config-row]") ||
          (el.hasAttribute("data-config-hide-row") ? el.closest("tr") : null);
        if (row) row.hidden = true;
        return;
      }
      if (el.hasAttribute("data-config-paragraphs")) {
        const parts = String(val)
          .split(/\n\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length) {
          el.innerHTML = parts.map((p) => "<p>" + escHtml(p) + "</p>").join("");
        }
      } else if (el.hasAttribute("data-config-text")) {
        let text = val;
        if (el.hasAttribute("data-config-short")) {
          text = String(val).replace(/^https?:\/\//i, "").replace(/^www\./i, "");
        }
        el.textContent = text;
      }
      if (el.dataset.configAttr) el.setAttribute(el.dataset.configAttr, val);
      if (el.tagName === "A") {
        if (key === "email") el.href = "mailto:" + val;
        else if (key === "phone") el.href = "tel:" + String(val).replace(/[^\d+]/g, "");
        else el.href = val;
        if (!/^https?:\/\//i.test(el.href) && !/^mailto:/i.test(el.href) && !/^tel:/i.test(el.href)) {
          el.removeAttribute("target");
          el.removeAttribute("rel");
        }
      }
    });
  }

  function saleCountLabel(n) {
    return n === 1 ? "1 sale" : n + " sales";
  }

  function getEarningsTier(sale) {
    return EARNINGS_TIERS.find((t) => t.sale === sale) || EARNINGS_TIERS[0];
  }

  function renderEarningsProjection(sale, opts) {
    const tier = getEarningsTier(sale);
    const rows = EARNINGS_CLOSE_COUNTS.map((n) => ({
      count: n,
      total: tier.commission * n,
    }));
    const maxTotal = rows[rows.length - 1].total;

    const lead = document.getElementById("earnings-projection-lead");
    if (lead) {
      const owner = cfg().ownerName || "the owner";
      lead.textContent =
        "$" +
        formatMoney(tier.commission) +
        " per close (" +
        tier.saleShort +
        ") — after " +
        owner +
        " closes the deal and notifies you.";
    }

    const colDeals = document.getElementById("earnings-table-col-deals");
    if (colDeals) {
      colDeals.textContent =
        "Closes at " + tier.saleLabel + " tier ($" + formatMoney(tier.commission) + " each)";
    }

    const tbody = document.getElementById("earnings-projection-rows");
    if (tbody) {
      tbody.innerHTML = rows
        .map(
          (r) =>
            "<tr><td>" +
            saleCountLabel(r.count) +
            '</td><td class="money">$' +
            formatMoney(r.total) +
            "</td></tr>"
        )
        .join("");
    }

    const chart = document.getElementById("earnings-chart");
    if (!chart) return;
    chart.setAttribute(
      "aria-label",
      "Potential commission at " +
        tier.saleShort +
        ": from $" +
        formatMoney(rows[0].total) +
        " for 1 sale to $" +
        formatMoney(maxTotal) +
        " for 100 sales"
    );
    buildEarningsChart(chart);
    chart.classList.add("is-animating");
    const motionReduced = window.SiteTheme?.isReduceMotion?.() || false;
    if (opts && opts.intro && !motionReduced) {
      chart.querySelectorAll(".earnings-chart-bar").forEach((bar) => {
        bar.style.transform = "scaleY(0)";
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEarningsChartHeights(chart, rows, maxTotal));
      });
    } else {
      setEarningsChartHeights(chart, rows, maxTotal);
    }
  }

  function buildEarningsChart(chart) {
    if (chart.querySelector(".earnings-chart-bars")) return;
    const bars = document.createElement("div");
    bars.className = "earnings-chart-bars";
    EARNINGS_CLOSE_COUNTS.forEach((count) => {
      const col = document.createElement("div");
      col.className = "earnings-chart-col";
      col.dataset.count = String(count);
      const wrap = document.createElement("div");
      wrap.className = "earnings-chart-bar-wrap";
      const bar = document.createElement("div");
      bar.className = "earnings-chart-bar";
      bar.style.transform = "scaleY(0)";
      wrap.appendChild(bar);
      const amt = document.createElement("span");
      amt.className = "earnings-chart-amt";
      const countLbl = document.createElement("span");
      countLbl.className = "earnings-chart-count";
      countLbl.textContent = saleCountLabel(count);
      col.append(wrap, amt, countLbl);
      bars.appendChild(col);
    });
    chart.appendChild(bars);
  }

  function setEarningsChartHeights(chart, rows, maxTotal) {
    const cols = chart.querySelectorAll(".earnings-chart-col");
    cols.forEach((col, i) => {
      const r = rows[i];
      if (!r) return;
      const scale = maxTotal ? Math.max(0.04, r.total / maxTotal) : 0;
      const wrap = col.querySelector(".earnings-chart-bar-wrap");
      const bar = col.querySelector(".earnings-chart-bar");
      const amt = col.querySelector(".earnings-chart-amt");
      if (wrap) wrap.title = "$" + formatMoney(r.total);
      if (amt) {
        amt.textContent = "$" + formatMoney(r.total);
        if (!window.SiteTheme?.isReduceMotion?.()) {
          amt.classList.remove("earnings-chart-amt-updated");
          void amt.offsetWidth;
          amt.classList.add("earnings-chart-amt-updated");
        }
      }
      if (bar) {
        void bar.offsetHeight;
        bar.style.transform = "scaleY(" + scale + ")";
      }
    });
  }

  function initEarningsProjection() {
    const tablist = document.getElementById("earnings-tier-tabs");
    if (!tablist) return;

    let activeSale = 500;
    const tabs = tablist.querySelectorAll(".earnings-tier-tab");

    function selectTier(sale, opts) {
      preserveScroll(() => {
        activeSale = sale;
        tabs.forEach((tab) => {
          const on = Number(tab.dataset.tier) === sale;
          tab.classList.toggle("active", on);
          tab.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderEarningsProjection(sale, opts);
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const sale = Number(tab.dataset.tier);
        if (sale === activeSale) return;
        selectTier(sale);
        e.currentTarget.blur();
      });
      tab.addEventListener("keydown", (e) => {
        const list = Array.from(tabs);
        const i = list.indexOf(tab);
        let next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % list.length;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + list.length) % list.length;
        if (next >= 0) {
          e.preventDefault();
          focusNoScroll(list[next]);
          selectTier(Number(list[next].dataset.tier));
        }
      });
    });

    selectTier(activeSale, { intro: true });

    if (location.hash === "#how-you-get-paid") {
      const target = document.getElementById("how-you-get-paid");
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
  }

  function initOwnerPage() {
    const phone = cfg().phone;
    if (!phone) return;
    const digits = phone.replace(/\D/g, "");
    const e164 = digits.length === 10 ? "+1" + digits : "+" + digits;
    const sms = document.getElementById("owner-phone-sms");
    if (sms) sms.href = "sms:" + e164;
  }

  function ensureSignOutFloatScript() {
    if (window.SignOutFloat || document.getElementById("sign-out-float-loader")) return;
    const s = document.createElement("script");
    s.id = "sign-out-float-loader";
    s.src = "js/sign-out-float.js";
    s.onload = () => window.SignOutFloat?.update?.();
    document.body.appendChild(s);
  }

  function mountPage() {
    const page = document.body.dataset.page || "home";
    if (!document.getElementById("shell")) return;
    ensurePageLayout();
    if (!document.getElementById("sidebar")) renderShell(page);
    ensureSignOutFloatScript();
  }

  function isSiteUnlocked() {
    if (window.SiteLock?.isAuthenticated) return window.SiteLock.isAuthenticated();
    return (
      sessionStorage.getItem("lpc_site_unlock") === "1" && !!window.RepSession?.get?.()
    );
  }

  function bootApp() {
    if (document.body.dataset.appBooted === "1") {
      mountPage();
      return;
    }
    document.body.dataset.appBooted = "1";
    mountPage();
    touchDailyToolProgress();

    initEverydayTasks();
    initOnboardingChecklist();
    renderOnboardingPath();
    initSalesTracker();
    global.DashboardPending?.init?.();
    renderStepFooter();
    initAccordions();
    initCallScripts();
    initOutreachEditor();
    initVideo();
    initConfigLinks();
    initEarningsProjection();
    initOwnerPage();
    window.SiteImagePreload?.warmDocumentImages?.(document.body);
    if (window.SiteIcons) window.SiteIcons.initIcons();

    if (document.getElementById("tpl-builder")) {
      applyTemplateBuilder();
      initTplInfo();
      bindTemplateBuilderAutosave();
      initLeadPickFromFinder();
      initTplAutosaveTag();
    }
  }

  function pageNeedsSettingsRefresh() {
    const page = document.body.dataset.page || "home";
    return (
      page === "home" ||
      !!document.getElementById("deals-list") ||
      !!document.getElementById("onboarding-path") ||
      !!document.getElementById("course-module-list") ||
      !!document.getElementById("course-module-root") ||
      !!document.getElementById("call-scripts-root")
    );
  }

  function refreshAfterSettingsSync() {
    if (!pageNeedsSettingsRefresh()) return;
    initCallScripts();
    initOutreachEditor();
    initOnboardingChecklist();
    initSalesTracker();
    renderOnboardingPath();
    renderStepFooter();
    if (window.SiteIcons) window.SiteIcons.initIcons();
  }

  let appLaunchStarted = false;
  let settingsUiSynced = false;
  let bootScheduled = false;

  function startWhenReady() {
    if (appLaunchStarted) {
      if (document.body.dataset.appBooted === "1") mountPage();
      return;
    }
    appLaunchStarted = true;
    bootApp();

    if (window.RepStorage?.init) {
      window.RepStorage.init().catch((e) => console.warn("Rep settings init failed", e));
    }
  }

  function scheduleAppLaunch() {
    if (bootScheduled) return;
    bootScheduled = true;
    if (document.body.dataset.public === "1") {
      startWhenReady();
      return;
    }
    if (isSiteUnlocked()) startWhenReady();
  }

  document.addEventListener("DOMContentLoaded", scheduleAppLaunch);

  window.addEventListener("site-unlocked", () => {
    ensureSignOutFloatScript();
    if (!appLaunchStarted) startWhenReady();
    if (window.RepStorage?.whenReady) {
      window.RepStorage.whenReady(applyPostLoginRedirect);
    } else {
      applyPostLoginRedirect();
    }
  });

  window.addEventListener("rep-session-changed", () => {
    updateBrandSub();
    window.RepSession?.applyToTracker?.(true);
    if (document.body.dataset.appBooted === "1") {
      const sub = document.querySelector(".brand-sub");
      if (sub) sub.textContent = brandSubText();
    }
  });
  window.addEventListener("rep-settings-ready", () => {
    if (window.UserPrefs && window.SiteTheme) {
      const prefs = window.UserPrefs.get();
      window.SiteTheme.apply(prefs.theme || "light", { persistDevice: true });
    }
    if (document.body.dataset.appBooted !== "1" || settingsUiSynced) return;
    settingsUiSynced = true;
    refreshAfterSettingsSync();
  });

  window.addEventListener("onboarding-progress-changed", () => {
    if (document.body.dataset.appBooted !== "1") return;
    renderOnboardingPath();
    initOnboardingChecklist();
    refreshCourseNavInSidebar();
    updateChecklistNavProgress();
  });

})();
