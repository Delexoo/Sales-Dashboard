(function () {
  const global = window;
  if (!window.SiteOwner) {
    function isSiteOwner() {
      const id = String(
        window.RepSession?.getId?.() || window.RepSession?.get?.()?.id || ""
      ).toLowerCase();
      const allowed = (window.SITE_CONFIG?.ownerRepIds || []).map((s) =>
        String(s).toLowerCase()
      );
      return !!id && allowed.includes(id);
    }
    function gateOwnerPage(fallback) {
      if (isSiteOwner()) return true;
      window.location.replace(fallback || "dashboard.html");
      return false;
    }
    window.SiteOwner = { isSiteOwner, gateOwnerPage };
  }

  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";
  const TRACKER_KEY = "lpc_sales_tracker_v2";
  const TRACKER_KEY_LEGACY = "lpc_sales_tracker_v1";
  const STEP_DONE_KEY = "lpc_sales_onboarding_steps_v1";
  const NAV_COLLAPSED_KEY = "lpc_nav_collapsed_v1";
  const SIDEBAR_COLLAPSED_KEY = "lpc_sidebar_collapsed_v1";
  const SIDEBAR_WIDTH_KEY = "lpc_sidebar_width_v1";
  const SIDEBAR_WIDTH_DEFAULT = 280;
  const SIDEBAR_WIDTH_MIN = 248;
  const SIDEBAR_WIDTH_MAX = 340;
  const NAV_DEFAULT_COLLAPSED = [];

  const NAV_GROUP_PAGES = {
    course: ["course-module", "setup"],
    tools: ["leads", "template", "scripts"],
    help: ["faq", "feedback", "bug-bounty", "settings", "resources", "about", "privacy", "terms", "help-guide"],
  };

  const NAV_CATEGORIES = {
    course: { label: "Course", icon: "book-open" },
    tools: { label: "Daily tools", icon: "repeat-2" },
    help: { label: "Help", icon: "help-circle" },
  };

  const PAGE_NAV_CATEGORY = (function () {
    const map = {};
    Object.entries(NAV_GROUP_PAGES).forEach(([groupId, pages]) => {
      const cat = NAV_CATEGORIES[groupId];
      if (!cat) return;
      pages.forEach((p) => {
        map[p] = cat;
      });
    });
    map.videoscript = NAV_CATEGORIES.course;
    return map;
  })();

  const COMMISSION_RATE = 0.4;
  const COMMISSION_PRESET = { 500: 200, 700: 280, 1000: 400, 1500: 600 };
  const EARNINGS_TIERS = [
    { sale: 500, commission: 200, saleLabel: "$500", saleShort: "$500 sale" },
    { sale: 700, commission: 280, saleLabel: "$700", saleShort: "$700 sale" },
    { sale: 1000, commission: 400, saleLabel: "$1,000", saleShort: "$1K sale" },
    { sale: 1500, commission: 600, saleLabel: "$1,500", saleShort: "$1.5K sale" },
  ];
  const EARNINGS_CLOSE_COUNTS = [1, 5, 10, 25, 50, 100];
  const DEFAULT_GOAL = 1000;

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

  const LEAD_FINDER_COUNT_KEY = "lpc_lead_finder_nav_count_v1";
  let leadFinderNavRefreshPromise = null;
  let leadFinderNavCountBound = false;

  function readLeadFinderNavCount() {
    const live = window.LeadsPage?.getAvailableCount?.();
    if (live != null) return live;
    try {
      const raw = JSON.parse(sessionStorage.getItem(LEAD_FINDER_COUNT_KEY) || "null");
      if (raw && Number.isFinite(raw.count)) return raw.count;
    } catch (_) {}
    return null;
  }

  function cacheLeadFinderNavCount(count) {
    if (!Number.isFinite(count)) return;
    try {
      sessionStorage.setItem(
        LEAD_FINDER_COUNT_KEY,
        JSON.stringify({ count, at: Date.now() })
      );
    } catch (_) {}
  }

  function countAllLeadsForNav(leads) {
    return (leads || []).filter((lead) => {
      if (window.LeadCsvFormat?.isValidLead) return window.LeadCsvFormat.isValidLead(lead);
      return lead?.formatValid !== false;
    }).length;
  }

  function formatLeadFinderNavCount(count) {
    const n = Number(count);
    if (!Number.isFinite(n)) return "…";
    return String(n);
  }

  function leadFinderNavCountMarkup(count) {
    if (count == null) {
      return '<span class="nav-link-count nav-link-count--pending" aria-hidden="true">…</span>';
    }
    const label = formatLeadFinderNavCount(count);
    return (
      '<span class="nav-link-count" aria-label="' +
      count +
      ' total leads">' +
      label +
      "</span>"
    );
  }

  function updateLeadFinderNavBadge(count) {
    const link = document.querySelector(".nav-link--leads");
    if (!link) return;
    const existing = link.querySelector(".nav-link-count");
    const html = leadFinderNavCountMarkup(count);
    if (existing) existing.outerHTML = html;
    else {
      const text = link.querySelector(".nav-link-text");
      if (text) text.insertAdjacentHTML("afterend", html);
    }
  }

  function loadScriptOnce(src) {
    if (src.includes("lead-csv-format.js") && window.LeadCsvFormat) return Promise.resolve();
    if (src.includes("lead-display.js") && window.LeadDisplay) return Promise.resolve();
    if (src.includes("leads-loader.js") && window.LeadsLoader) return Promise.resolve();
    if (src.includes("lead-sync.js") && window.LeadSync) return Promise.resolve();
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (existing.dataset.loaded === "1") return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(src)), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = () => reject(new Error("Could not load " + src));
      document.body.appendChild(script);
    });
  }

  function refreshLeadFinderNavCount() {
    if (!isSiteUnlocked()) return Promise.resolve(readLeadFinderNavCount());
    const live = window.LeadsPage?.getAvailableCount?.();
    if (live != null) {
      cacheLeadFinderNavCount(live);
      updateLeadFinderNavBadge(live);
      return Promise.resolve(live);
    }
    if (leadFinderNavRefreshPromise) return leadFinderNavRefreshPromise;
    leadFinderNavRefreshPromise = (async () => {
      try {
        await loadScriptOnce("js/lead-display.js");
        await loadScriptOnce("js/lead-csv-format.js");
        await loadScriptOnce("js/leads-loader.js");
        const loader = window.LeadsLoader;
        if (!loader?.load) return readLeadFinderNavCount();
        const { leads } = await loader.load();
        const count = countAllLeadsForNav(leads);
        cacheLeadFinderNavCount(count);
        updateLeadFinderNavBadge(count);
        window.dispatchEvent(new CustomEvent("lead-finder-count-changed", { detail: { count } }));
        return count;
      } catch (e) {
        console.warn("Lead Finder nav count unavailable", e);
        return readLeadFinderNavCount();
      } finally {
        leadFinderNavRefreshPromise = null;
      }
    })();
    return leadFinderNavRefreshPromise;
  }

  function initLeadFinderNavCount() {
    updateLeadFinderNavBadge(readLeadFinderNavCount());
    refreshLeadFinderNavCount().catch(() => {});
    if (leadFinderNavCountBound) return;
    leadFinderNavCountBound = true;
    window.addEventListener("lead-finder-count-changed", (e) => {
      const count = e.detail?.count;
      if (Number.isFinite(count)) updateLeadFinderNavBadge(count);
    });
  }

  function renderToolsNav(activeId, progress) {
    return TOOL_PAGES.map((p) => {
      if (p.id === "leads") {
        const cls =
          p.id === activeId ? "nav-link active nav-link--leads" : "nav-link nav-link--leads";
        const count = readLeadFinderNavCount();
        return (
          `<li><a class="${cls}" href="${p.href}">` +
          `<span class="nav-link-text">${ico("search", "ico-nav")}${p.label}</span>` +
          leadFinderNavCountMarkup(count) +
          `</a></li>`
        );
      }
      if (p.external && p.hrefKey) {
        const url = String(cfg()[p.hrefKey] || "").trim();
        if (!url) return "";
        return navQuickLink(
          "send",
          p.label,
          'href="#" data-telegram-url="' +
            escHtml(url) +
            '" data-nav-leave-telegram="1" role="button"',
          true
        );
      }
      const cls = p.id === activeId ? "nav-link active" : "nav-link";
      const ic =
        p.id === "template"
          ? "file-plus"
          : p.id === "scripts"
            ? "phone"
            : "message-square";
      return `<li><a class="${cls}" href="${p.href}"><span class="nav-link-text">${ico(ic, "ico-nav")}${p.label}</span></a></li>`;
    }).join("");
  }

  function renderHelpNav(activeId) {
    const resourcesActive =
      activeId === "resources" || activeId === "privacy" || activeId === "terms" || activeId === "help-guide";
    const aboutActive = activeId === "about" || activeId === "owner" || activeId === "contributors";
    return (
      `<li><a class="${aboutActive ? "nav-link active" : "nav-link"}" href="about.html"><span class="nav-link-text">${ico("users", "ico-nav")}About us</span></a></li>` +
      `<li><a class="${activeId === "settings" ? "nav-link active" : "nav-link"}" href="settings.html"><span class="nav-link-text">${ico("settings", "ico-nav")}Settings</span></a></li>` +
      `<li><a class="${activeId === "faq" ? "nav-link active" : "nav-link"}" href="faq.html"><span class="nav-link-text">${ico("help-circle", "ico-nav")}FAQ</span></a></li>` +
      `<li><a class="${activeId === "feedback" ? "nav-link active" : "nav-link"}" href="feedback.html"><span class="nav-link-text">${ico("message-square", "ico-nav")}Feedback</span></a></li>` +
      `<li><a class="${activeId === "bug-bounty" ? "nav-link active" : "nav-link"}" href="bug-bounty.html"><span class="nav-link-text">${ico("bug", "ico-nav")}Bug Bounty</span></a></li>` +
      `<li><a class="${resourcesActive ? "nav-link active" : "nav-link"}" href="resources.html"><span class="nav-link-text">${ico("external-link", "ico-nav")}All links</span></a></li>`
    );
  }

  function renderOverviewNav(activeId) {
    const dashCls = activeId === "home" ? "nav-link active" : "nav-link";
    const consoleCls = activeId === "sales-console" ? "nav-link active" : "nav-link";
    let html =
      `<li><a class="${dashCls}" href="dashboard.html">` +
      `<span class="nav-link-text">${ico("layout-dashboard", "ico-nav")}Dashboard</span></a></li>`;
    if (window.SiteOwner?.isSiteOwner?.()) {
      html +=
        `<li><a class="${consoleCls}" href="sales-console.html">` +
        `<span class="nav-link-text">${ico("badge-check", "ico-nav")}Admin Console</span></a></li>`;
    }
    return html;
  }

  function refreshCourseNavInSidebar() {
    const page = document.body.dataset.page || "home";
    const progress = loadProgress();
    const courseList = document.getElementById("nav-panel-course");
    const toolsList = document.getElementById("nav-panel-tools");
    if (courseList) courseList.innerHTML = renderCourseNav(page, progress);
    if (toolsList) toolsList.innerHTML = renderToolsNav(page, progress);
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const btn = document.getElementById("menu-btn");
    if (!sidebar) return;
    const close = () => {
      sidebar.classList.remove("open");
      overlay?.classList.remove("open");
      syncMenuBtnState(btn, sidebar, overlay);
    };
    [courseList, toolsList].forEach((list) => {
      list?.querySelectorAll(".nav-link").forEach((a) => a.addEventListener("click", close));
    });
    if (toolsList) bindTelegramNavLeave(toolsList);
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
    { id: "template", href: "template.html", label: "Lead Builder" },
    { id: "scripts", href: "scripts.html", label: "Call Scripts" },
    { id: "telegram", label: "Telegram", external: true, hrefKey: "telegramTeam" },
  ];

  const DAILY_TOOL_PROGRESS = {
    leads: "leads",
    scripts: "script",
    template: "template",
  };

  const CHECKLIST_MODULE_MAP = {
    module_introduction: "introduction",
    module_business: "business",
    module_setup_accounts: "setup-accounts",
    module_preferences: "preferences",
    module_dashboard: "dashboard",
    module_everyday_tasks: "everyday-tasks",
  };

  function isChecklistItemDone(id, progress) {
    const modId = CHECKLIST_MODULE_MAP[id];
    if (modId && window.CourseModules?.get) {
      const mod = window.CourseModules.get(modId);
      if (mod) return window.CourseModules.isComplete(mod, progress);
    }
    if (id === "telegram") return !!(progress.telegram || progress.telegramSkipped);
    if (progress[id]) return true;
    if (id === "template" && progress["first-lead"]) return true;
    return false;
  }

  function touchDailyToolProgress() {
    const page = document.body.dataset.page || "";
    if (page === "scripts") {
      touchProgressKeys(["script", "outreach"]);
      return;
    }
    const key = DAILY_TOOL_PROGRESS[page];
    if (!key) return;
    touchProgressKeys([key]);
  }

  function scrollPageHash() {
    const id = (location.hash || "").replace(/^#/, "").trim();
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    });
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
        console.warn("Tracker data was for another rep · loading a fresh tracker for", session.id);
        return defaultTracker();
      }

      const out = {
        repId: session?.id || raw.repId || "",
        name: raw.name || "",
        goal: normalizeGoal(raw.goal),
        leadsPosted: Number(raw.leadsPosted) || 0,
        deals: Array.isArray(raw.deals) ? raw.deals : [],
        deletedDealIds: Array.isArray(raw.deletedDealIds) ? raw.deletedDealIds : [],
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
    syncLpcTrackerBridge();
  }

  function syncLpcTrackerBridge() {
    window.LpcTracker = {
      getDealById(dealId) {
        const tracker = loadTracker();
        return (tracker.deals || []).find((d) => String(d.id) === String(dealId));
      },
      isOwnerConfirmedDeal(deal) {
        return !!deal?.fromOwnerConfirm;
      },
    };
  }

  syncLpcTrackerBridge();

  let onPendingSaleLogged = null;

  function logSaleFromPendingComplete(leadId, businessName) {
    const id = String(leadId || "").trim();
    if (!id) return false;
    const snap = window.PendingLeadBuilder?.get?.(id);
    if (!snap || !(Number(snap.amount) > 0)) return false;

    const data = loadTracker();
    const duplicate = (data.deals || []).some(
      (d) =>
        String(d.leadId || "") === id &&
        (d.fromPendingComplete || d.fromOwnerConfirm)
    );
    if (duplicate) {
      window.PendingLeadBuilder?.clear?.(id);
      return false;
    }

    const earnedBefore = calcEarnedFromDeals(data.deals || []);
    const saleAmount = Number(snap.amount);
    const deal = {
      id: newDealId(),
      createdAt: new Date().toISOString(),
      commission: commissionFromDown(saleAmount),
      saleAmount,
      businessName: String(businessName || snap.businessName || "").trim(),
      leadId: id,
      fromPendingComplete: true,
    };
    data.deals = data.deals || [];
    data.deals.push(deal);
    const earnedAfter = calcEarnedFromDeals(data.deals);
    saveTracker(data);
    window.PendingLeadBuilder?.clear?.(id);
    if (onPendingSaleLogged) onPendingSaleLogged(earnedBefore, earnedAfter);
    reloadSalesTracker?.();
    return true;
  }

  window.logSaleFromPendingComplete = logSaleFromPendingComplete;

  function calcEarnedFromDeals(deals) {
    return deals.reduce((sum, d) => sum + (Number(d.commission) || 0), 0);
  }

  function commissionFromDown(down) {
    const preset = COMMISSION_PRESET[down];
    if (preset !== undefined) return preset;
    return Math.round(down * COMMISSION_RATE);
  }

  function saleAmountFromDeal(d) {
    if (!d) return 0;
    const stored = Number(d.saleAmount ?? d.downAmount);
    if (stored > 0) return stored;
    const comm = Number(d.commission) || 0;
    if (!comm) return 0;
    for (const tier of EARNINGS_TIERS) {
      if (tier.commission === comm) return tier.sale;
    }
    return Math.round(comm / COMMISSION_RATE);
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

  function formatDealDateTime(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
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

  let dashboardIncomeUiReady = false;

  function setDashboardToggleCardOpen(card, open, opts) {
    opts = opts || {};
    if (!card) return;
    const panel =
      (opts.panelId && document.getElementById(opts.panelId)) ||
      card.querySelector(".dash-toggle-panel");
    const btn =
      (opts.buttonId && document.getElementById(opts.buttonId)) ||
      card.querySelector(".dash-toggle-btn");
    const label =
      (opts.labelId && document.getElementById(opts.labelId)) ||
      card.querySelector(".dash-toggle-label");
    if (!panel) return;

    card.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    btn?.setAttribute("aria-expanded", open ? "true" : "false");
    if (label) label.textContent = open ? "Hide" : "Show";

    if (open && opts.scroll !== false) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function focusDashboardIncomeForm(opts) {
    opts = opts || {};
    const section =
      document.getElementById("dash-sales-log-section") ||
      document.querySelector(".dash-sales-log-section");
    const priceEl = document.getElementById("saleAmount");
    const businessEl = document.getElementById("businessName");
    if (businessEl) businessEl.value = String(opts.businessName || "").trim();
    if (priceEl) {
      if (opts.amount != null && opts.amount !== "") {
        priceEl.value = String(opts.amount);
      } else if (!opts.businessName) {
        priceEl.value = "";
      }
    }

    if (opts.scroll !== false) {
      section?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    focusNoScroll(
      opts.focusAmount === false && opts.businessName ? businessEl : priceEl
    );
  }

  function openDashboardIncomePanel(opts) {
    focusDashboardIncomeForm(opts);
  }

  function closeDashboardIncomePanel() {}

  function toggleDashboardToggleCard(card) {
    if (!card) return;
    setDashboardToggleCardOpen(card, !card.classList.contains("is-open"), { scroll: false });
  }

  function initDashboardToggleCards() {
    document.querySelectorAll("[data-dash-toggle]").forEach((card) => {
      const btn = card.querySelector(".dash-toggle-btn");
      if (!btn || btn.dataset.toggleBound === "1") return;
      btn.dataset.toggleBound = "1";

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleDashboardToggleCard(card);
      });
    });
  }

  window.initDashboardToggleCards = initDashboardToggleCards;
  window.setDashboardToggleCardOpen = setDashboardToggleCardOpen;

  function ensureDashboardIncomeUi() {
    window.openSalesIncomeDialog = openDashboardIncomePanel;
    window.closeSalesIncomeDialog = closeDashboardIncomePanel;
    initDashboardToggleCards();

    if (dashboardIncomeUiReady) return;
    dashboardIncomeUiReady = true;
  }

  function initDashboardIncomeUiEarly() {
    if (document.body?.dataset?.page !== "home") return;
    ensureDashboardIncomeUi();
  }

  function preserveScroll(fn) {
    const y = window.scrollY;
    fn();
    window.scrollTo(0, y);
  }

  function ico(name, cls) {
    return window.SiteIcons ? window.SiteIcons.icon(name, cls || "") : "";
  }

  function brandLogoUrl() {
    const c = cfg();
    return String(c.brandLogoUrl || c.telegramTeamAvatar || "").trim();
  }

  function brandMarkHtml() {
    const url = brandLogoUrl();
    const name = cfg().companyName || "Dashboard";
    if (url) {
      return (
        `<span class="brand-mark brand-mark--image">` +
        `<img class="brand-mark-img" src="${escHtml(url)}" alt="${escHtml(name)}" width="44" height="44" decoding="async" fetchpriority="high">` +
        `</span>`
      );
    }
    return `<span class="brand-mark brand-mark--icon">${ico("sparkles", "ico-brand")}</span>`;
  }

  function navQuickLink(icon, label, attrs, external) {
    const trail = ico(external ? "external-link" : "chevron-right", "ico-nav-trail");
    return `<li><a class="nav-link nav-link-out nav-link-important" ${attrs}><span class="nav-link-text">${ico(icon, "ico-nav")}${label}</span><span class="nav-link-trail" aria-hidden="true">${trail}</span></a></li>`;
  }

  function telegramTeamLeaveMessage() {
    const name = cfg().telegramTeamDisplayName || "Website Agency";
    const chat = cfg().telegramTeamName || "sales team business chat";
    return "You're leaving this dashboard to open the " + name + " " + chat + " in Telegram.";
  }

  function ensureTelegramLeaveDialog() {
    if (document.getElementById("telegram-leave-dialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "telegram-leave-dialog";
    dialog.className = "site-leave-dialog";
    dialog.setAttribute("aria-labelledby", "telegram-leave-dialog-title");
    dialog.innerHTML =
      '<div class="site-leave-dialog-panel">' +
      '<h2 class="site-leave-dialog-title" id="telegram-leave-dialog-title">Open Telegram?</h2>' +
      '<p class="site-leave-dialog-text" id="telegram-leave-dialog-text"></p>' +
      '<div class="site-leave-dialog-actions">' +
      '<button type="button" class="btn secondary" data-telegram-leave-cancel>Stay here</button>' +
      '<button type="button" class="btn" data-telegram-leave-continue>Open Telegram</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector("[data-telegram-leave-cancel]");
    const continueBtn = dialog.querySelector("[data-telegram-leave-continue]");

    cancelBtn?.addEventListener("click", () => dialog.close());
    continueBtn?.addEventListener("click", () => {
      const url = String(dialog.dataset.pendingUrl || "").trim();
      dialog.close();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      dialog.close();
    });
  }

  function openTelegramLeaveDialog(url) {
    ensureTelegramLeaveDialog();
    const dialog = document.getElementById("telegram-leave-dialog");
    const textEl = document.getElementById("telegram-leave-dialog-text");
    if (!dialog) return;
    if (textEl) textEl.textContent = telegramTeamLeaveMessage();
    dialog.dataset.pendingUrl = url;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }
    if (window.confirm(telegramTeamLeaveMessage() + "\n\nContinue?")) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function bindTelegramNavLeave(root) {
    ensureTelegramLeaveDialog();
    const scope = root || document;
    scope.querySelectorAll("[data-nav-leave-telegram]").forEach((link) => {
      if (link.dataset.leaveBound === "1") return;
      link.dataset.leaveBound = "1";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const url = String(
          link.dataset.telegramUrl || link.getAttribute("href") || ""
        ).trim();
        if (!url || url === "#") return;
        openTelegramLeaveDialog(url);
      });
    });
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

  function navGroup(id, label, icon, itemsHtml) {
    return (
      `<div class="nav-group" data-nav-group="${id}">` +
      `<div class="nav-section-label" id="nav-label-${id}">${ico(icon, "ico-nav-section")}${label}</div>` +
      `<ul class="nav-list" id="nav-panel-${id}">${itemsHtml}</ul>` +
      `</div>`
    );
  }

  function renderSidebarLegal(activeId) {
    return (
      `<div class="sidebar-legal" aria-label="Legal and help links">` +
      `<a class="${activeId === "terms" ? "sidebar-legal-link active" : "sidebar-legal-link"}" href="terms.html">Terms</a>` +
      `<span class="sidebar-legal-sep" aria-hidden="true">&middot;</span>` +
      `<a class="${activeId === "privacy" ? "sidebar-legal-link active" : "sidebar-legal-link"}" href="privacy.html">Privacy</a>` +
      `<span class="sidebar-legal-sep" aria-hidden="true">&middot;</span>` +
      `<a class="${activeId === "help-guide" ? "sidebar-legal-link active" : "sidebar-legal-link"}" href="help.html">Help</a>` +
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

  let navGroupsClickBound = false;

  function initNavGroups(activeId) {
    const page = activeId || document.body.dataset.page || "home";
    const saved = loadNavCollapsed();
    document.querySelectorAll(".nav-group").forEach((group) => {
      const id = group.dataset.navGroup;
      if (!id) return;
      const toggle = group.querySelector(".nav-section-toggle");
      if (!toggle) return;

      const pages = NAV_GROUP_PAGES[id] || [];
      const hasActive = pages.includes(page);
      let collapsed = false;
      if (!hasActive) {
        if (saved[id] === true) collapsed = true;
        else if (saved[id] === false) collapsed = false;
        else collapsed = NAV_DEFAULT_COLLAPSED.includes(id);
      }
      group.classList.toggle("is-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
    ensureNavGroupsClick();
  }

  function ensureNavGroupsClick() {
    if (navGroupsClickBound) return;
    navGroupsClickBound = true;
    document.addEventListener("click", (e) => {
      const toggle = e.target.closest(".nav-section-toggle");
      if (!toggle) return;
      const group = toggle.closest(".nav-group");
      const id = group?.dataset?.navGroup;
      if (!id) return;
      e.preventDefault();
      const isCollapsed = group.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      const saved = loadNavCollapsed();
      saved[id] = isCollapsed;
      saveNavCollapsed(saved);
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

  function clampSidebarWidth(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return SIDEBAR_WIDTH_DEFAULT;
    return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(n)));
  }

  function loadSidebarWidth() {
    try {
      const raw = lsGet(SIDEBAR_WIDTH_KEY);
      return clampSidebarWidth(raw || SIDEBAR_WIDTH_DEFAULT);
    } catch (e) {
      return SIDEBAR_WIDTH_DEFAULT;
    }
  }

  function saveSidebarWidth(width) {
    try {
      lsSet(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(width)));
    } catch (e) {
      /* ignore */
    }
  }

  function applySidebarWidth(width) {
    document.documentElement.style.setProperty("--sidebar", `${clampSidebarWidth(width)}px`);
  }

  function setDesktopSidebarCollapsed(collapsed) {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }

  function initSidebarResizer(handle) {
    if (!handle) return;
    const onPointerDown = (event) => {
      if (isMobileNav()) return;
      event.preventDefault();
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("sidebar-resizing");
      setDesktopSidebarCollapsed(false);
      saveSidebarCollapsed(false);
      syncMenuBtnState(document.getElementById("menu-btn"), document.getElementById("sidebar"), document.getElementById("sidebar-overlay"));

      const onPointerMove = (moveEvent) => {
        applySidebarWidth(moveEvent.clientX);
      };
      const onPointerUp = (upEvent) => {
        saveSidebarWidth(upEvent.clientX);
        document.body.classList.remove("sidebar-resizing");
        handle.releasePointerCapture?.(upEvent.pointerId);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    };

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("dblclick", () => {
      applySidebarWidth(SIDEBAR_WIDTH_DEFAULT);
      saveSidebarWidth(SIDEBAR_WIDTH_DEFAULT);
    });
  }

  function setMenuBtnIcon(btn, menuOpen) {
    const nextIcon = ico(menuOpen ? "chevron-left" : "chevron-right", "ico-menu");
    const currentIcon = btn.querySelector(".ico-menu");
    if (currentIcon) currentIcon.outerHTML = nextIcon;
    else btn.insertAdjacentHTML("afterbegin", nextIcon);
  }

  function syncMenuBtnState(btn, sidebar, overlay) {
    if (!btn) return;
    if (isMobileNav()) {
      document.body.classList.remove("sidebar-collapsed");
      const open = sidebar?.classList.contains("open");
      setMenuBtnIcon(btn, open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      return;
    }
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
    const collapsed = document.body.classList.contains("sidebar-collapsed");
    setMenuBtnIcon(btn, !collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.setAttribute("aria-label", collapsed ? "Open menu" : "Close menu");
  }

  function applyPageCategoryLabel() {
    const body = document.getElementById("page-body");
    if (!body) return;
    body.querySelectorAll(".page-label").forEach((el) => el.remove());
  }

  function renderShell(activeId) {
    const c = cfg();
    const progress = loadProgress();
    const stepIcons = (window.SiteIcons && window.SiteIcons.STEP_ICONS) || {};

    const brandName = c.companyName || "Dashboard";
    const shell = document.getElementById("shell");
    if (!shell) return;
    ensurePageLayout();
    applySidebarWidth(loadSidebarWidth());
    const main = document.getElementById("main-content");

    const chrome = document.createRange().createContextualFragment(
      `<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
        `<aside class="sidebar" id="sidebar">` +
        `<div class="sidebar-panel">` +
        `<a class="brand" href="dashboard.html" aria-label="Go to Dashboard">` +
        `${brandMarkHtml()}` +
        `<span class="brand-text"><strong>${brandName}</strong><span class="brand-sub">${escHtml(brandSubText())}</span></span>` +
        `</a>` +
        `<div class="nav-group nav-group-home" data-nav-group="overview"><ul class="nav-list nav-list-standalone">${renderOverviewNav(activeId)}</ul></div>` +
        navGroup("course", "Course", "book-open", renderCourseNav(activeId, progress)) +
        navGroup("tools", "Daily tools", "repeat-2", renderToolsNav(activeId, progress)) +
        navGroup("help", "Help", "help-circle", renderHelpNav(activeId)) +
        renderSidebarLegal(activeId) +
        `</div>` +
        `<button type="button" class="sidebar-resize-handle" id="sidebar-resize-handle" aria-label="Resize sidebar" title="Drag to resize sidebar"></button>` +
        `<button type="button" class="menu-btn" id="menu-btn" aria-label="Open menu" aria-controls="sidebar" aria-expanded="true">${ico("chevron-left", "ico-menu")}<span>Menu</span></button>` +
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
    sidebar.querySelectorAll(".nav-link, .sidebar-legal-link, .brand").forEach((a) => a.addEventListener("click", close));
    initSidebarResizer(document.getElementById("sidebar-resize-handle"));
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
    bindTelegramNavLeave(document.getElementById("sidebar"));
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
        "Our leads list · businesses that already do not have a website. Use the No website filter if you want the best fits.",
      resource: { href: "leads.html", label: "Lead Finder" },
    },
    {
      step: 2,
      taskFlow: ["Pick a business", "Build Lead"],
      detail:
        "Choose one business from the list, then click Build Lead on its card to open Lead Builder with the details prefilled.",
      buildLeadTag: true,
      resource: { href: "leads.html", label: "Lead Finder" },
    },
    {
      step: 3,
      taskFlow: ["Call business", "Pitch website"],
      detail:
        "Dial from the card and use Call Scripts to offer the free demo site. Talk to the owner or decision-maker. Not interested? Thank them and go back to step 2 · do not post the lead.",
      resource: { href: "scripts.html", label: "Call Scripts" },
    },
    {
      step: 4,
      taskFlow: ["If interested", "Fill Lead Builder"],
      detail:
        "Build Lead prefills most fields. Match your quoted price, then add phone, owner name, and preference.",
      resource: { href: "template.html", label: "Lead Builder" },
    },
    {
      step: 5,
      taskFlow: ["Send lead", "Manager gets the details"],
      detail:
        "Click Send lead when every field is filled · the business moves to Pending businesses and your manager gets the details.",
      resource: { href: "template.html", label: "Lead Builder" },
    },
    {
      step: 6,
      task: "Mark the business as complete",
      detail:
        "In Lead Finder, tag the business Complete (team sees it). Use Pending if you need to call back. Quick Save is only for you. Then start again at step 2.",
      completeTag: true,
      resource: { href: "leads.html", label: "Lead Finder" },
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

  function everydayTaskToolCell(row, embed) {
    if (embed) {
      return row.resource ? everydayTaskOpenButton(row.resource, true) : "";
    }
    if (row.completeTag) return everydayTaskCompleteTag();
    if (row.buildLeadTag) return everydayTaskBuildLeadTag();
    return everydayTaskOpenButton(row.resource);
  }

  function everydayTaskOpenButton(resource, embed) {
    if (!resource) return "";
    const label = escHtml(embed ? everydayTaskEmbedActionLabel(resource) : resource.label || "Open");
    const linkCls = embed ? "everyday-tasks-embed-btn" : "btn secondary everyday-tasks-open-btn";
    if (resource.href) {
      return `<a class="${linkCls}" href="${escHtml(resource.href)}">${label}</a>`;
    }
    if (resource.hrefKey) {
      const attrs = resource.external
        ? ` data-config="${escHtml(resource.hrefKey)}" href="#" target="_blank" rel="noopener"`
        : ` data-config="${escHtml(resource.hrefKey)}" href="#"`;
      return `<a class="${linkCls}"${attrs}>${label}</a>`;
    }
    return "";
  }

  function everydayTaskFlowArrow() {
    return '<span class="everyday-tasks-flow-arrow" aria-hidden="true">→</span>';
  }

  function everydayTaskStepTag(step) {
    const labels = ["Leads", "Build", "Call", "Builder", "Send", "Done"];
    const label = labels[step - 1] || String(step);
    return (
      '<span class="everyday-tasks-step-tag">' +
      '<span class="everyday-tasks-step-tag-num" aria-hidden="true">' +
      step +
      "</span>" +
      '<span class="everyday-tasks-step-tag-label">' +
      escHtml(label) +
      "</span></span>"
    );
  }

  function everydayTaskLabelHtml(row, embed) {
    if (Array.isArray(row.taskFlow) && row.taskFlow.length) {
      const inner = row.taskFlow
        .map((part, i) => {
          if (embed && row.buildLeadTag && part === "Build Lead") {
            return (i === 0 ? "" : everydayTaskFlowArrow()) + everydayTaskBuildLeadTag();
          }
          const text = `<span class="everyday-tasks-task-part">${escHtml(part)}</span>`;
          return i === 0 ? text : everydayTaskFlowArrow() + text;
        })
        .join("");
      return `<span class="everyday-tasks-flow">${inner}</span>`;
    }
    if (row.completeTag && embed) {
      return (
        `<span class="everyday-tasks-flow">` +
        `<span class="everyday-tasks-task-part">Mark the business as</span> ` +
        everydayTaskCompleteTag() +
        `</span>`
      );
    }
    if (row.taskHeading) {
      let html = '<span class="everyday-tasks-label-stack">';
      html += `<span class="everyday-tasks-heading">${escHtml(row.taskHeading)}</span>`;
      if (Array.isArray(row.inlineBullets) && row.inlineBullets.length) {
        html +=
          '<ul class="everyday-tasks-bullets">' +
          row.inlineBullets.map((item) => `<li>${escHtml(item)}</li>`).join("") +
          "</ul>";
      }
      html += "</span>";
      return html;
    }
    return `<strong class="everyday-tasks-task">${escHtml(row.task || "")}</strong>`;
  }

  function everydayTaskEmbedCopyHtml(row) {
    if (row.step === 4) {
      return (
        `<div class="everyday-loop-step-copy-stack">` +
        `<p class="everyday-loop-step-summary">If interested:</p>` +
        `<ul class="everyday-loop-step-inline-bullets"><li>Fill out the Lead Builder</li></ul>` +
        `</div>`
      );
    }
    if (Array.isArray(row.taskFlow) && row.taskFlow.length) {
      const inner = row.taskFlow
        .map((part, i) => {
          const text = escHtml(part);
          return i === 0 ? text : everydayTaskFlowArrow() + text;
        })
        .join("");
      return `<p class="everyday-loop-step-summary">${inner}</p>`;
    }
    const summary = row.task || everydayTaskEmbedSummary(row);
    return `<p class="everyday-loop-step-summary">${escHtml(summary)}</p>`;
  }

  function everydayTaskEmbedSummary(row) {
    const summaries = [
      "Open Lead Finder",
      "Pick a business, then Build Lead",
      "Call and pitch the website",
      "Fill Lead Builder if they're interested",
      "Send the lead to your manager",
      "Mark the business complete",
    ];
    return summaries[row.step - 1] || row.task || "";
  }

  function everydayTaskEmbedActionLabel(resource) {
    if (!resource) return "";
    if (resource.label === "Call Scripts") return "Call scripts";
    return resource.shortLabel || resource.label || "Open";
  }

  function renderEverydayTasksInto(container) {
    if (!container) return;
    const embed = !!container.closest?.(".course-everyday-embed");
    container.innerHTML = EVERYDAY_TASKS.map((row) => {
      const label = everydayTaskLabelHtml(row, embed);
      const tool = everydayTaskToolCell(row, embed);
      if (embed) {
        return (
          `<li class="everyday-tasks-item">` +
          `<div class="everyday-loop-step">` +
          `<span class="everyday-loop-step-num" aria-hidden="true">${row.step}</span>` +
          `<div class="everyday-loop-step-copy">${everydayTaskEmbedCopyHtml(row)}</div>` +
          (tool ? `<div class="everyday-loop-step-action">${tool}</div>` : "") +
          `</div></li>`
        );
      }
      return (
        `<tr class="everyday-tasks-row">` +
        `<td class="everyday-tasks-step"><span class="everyday-tasks-step-num">${row.step}</span></td>` +
        `<td class="everyday-tasks-what">${label}</td>` +
        `<td class="everyday-tasks-open">${tool}</td>` +
        `</tr>`
      );
    }).join("");
    initConfigLinks();
    if (window.SiteIcons) window.SiteIcons.initIcons(container);
  }

  const DAILY_LOOP_KEY = "lpc_daily_loop_checklist_v1";

  function dailyLoopDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadDailyLoopProgress() {
    try {
      const raw = JSON.parse(lsGet(DAILY_LOOP_KEY) || "{}");
      if (raw.date !== dailyLoopDateKey()) return { date: dailyLoopDateKey(), index: 0 };
      const index = Number(raw.index);
      return {
        date: dailyLoopDateKey(),
        index: Number.isFinite(index) && index >= 0 ? index : 0,
      };
    } catch (e) {
      return { date: dailyLoopDateKey(), index: 0 };
    }
  }

  function saveDailyLoopProgress(data) {
    lsSet(DAILY_LOOP_KEY, JSON.stringify(data));
  }

  function saveDailyLoopIndex(index) {
    saveDailyLoopProgress({ date: dailyLoopDateKey(), index: Math.max(0, index) });
  }

  function dailyLoopShortLabel(step) {
    return ["Leads", "Build", "Call", "Builder", "Send", "Done"][step - 1] || String(step);
  }

  function resetDailyLoopProgress() {
    saveDailyLoopProgress({ date: dailyLoopDateKey(), index: 0 });
  }

  function getDailyLoopChecklistItems() {
    return EVERYDAY_TASKS.map((row) => ({
      id: "daily_loop_" + row.step,
      step: row.step,
      short: dailyLoopShortLabel(row.step),
      row,
    }));
  }

  function dailyLoopStepTitle(row) {
    if (row.task) return escHtml(row.task);
    if (row.taskHeading) return escHtml(row.taskHeading);
    if (Array.isArray(row.taskFlow)) {
      return row.taskFlow
        .map((part, i) => {
          const text = escHtml(part);
          return i === 0 ? text : `<span class="daily-loop-step-title-sep" aria-hidden="true">→</span>${text}`;
        })
        .join("");
    }
    return "Step " + row.step;
  }

  function dailyLoopStepBodyHtml(row) {
    let html = `<h3 class="daily-loop-step-title">${everydayTaskLabelHtml(row, true)}</h3>`;
    if (row.detail) {
      html += `<p class="daily-loop-step-detail">${escHtml(row.detail)}</p>`;
    }
    if (Array.isArray(row.detailBullets) && row.detailBullets.length) {
      html +=
        '<ul class="daily-loop-step-bullets">' +
        row.detailBullets.map((item) => `<li>${escHtml(item)}</li>`).join("") +
        "</ul>";
    }
    const tool = everydayTaskToolCell(row, true);
    if (tool) {
      html += `<div class="daily-loop-step-tool">${tool}</div>`;
    }
    return html;
  }

  function setDailyLoopView(mode) {
    const embed = document.getElementById("course-everyday-embed");
    const tableWrap = document.getElementById("course-everyday-table-wrap");
    const checklistFooter = document.getElementById("course-everyday-checklist-footer");
    const checklistWrap = document.getElementById("course-everyday-checklist-wrap");
    if (!embed || !tableWrap || !checklistWrap) return;
    const isChecklist = mode === "checklist";
    embed.classList.toggle("is-checklist-view", isChecklist);
    tableWrap.hidden = isChecklist;
    if (checklistFooter) checklistFooter.hidden = isChecklist;
    checklistWrap.hidden = !isChecklist;
  }

  function initDailyLoopChecklist() {
    const root = document.getElementById("daily-loop-checklist");
    if (!root) return;

    let selectedIdx = loadDailyLoopProgress().index;
    let navDir = 0;

    const checklistBtn = document.getElementById("course-everyday-checklist-btn");
    const backBtn = document.getElementById("course-everyday-steps-back");
    const resetBtn = document.getElementById("course-everyday-checklist-reset");
    if (!root.dataset.toggleBound) {
      root.dataset.toggleBound = "1";
      checklistBtn?.addEventListener("click", () => {
        const items = getDailyLoopChecklistItems();
        const saved = loadDailyLoopProgress();
        selectedIdx = Math.min(saved.index, Math.max(0, items.length - 1));
        navDir = 0;
        setDailyLoopView("checklist");
        root._dailyLoopRender?.();
      });
      backBtn?.addEventListener("click", () => setDailyLoopView("steps"));
      resetBtn?.addEventListener("click", () => {
        resetDailyLoopProgress();
        root._lastFillFrac = 0;
        selectedIdx = 0;
        navDir = 0;
        root._dailyLoopRender?.();
      });
      setDailyLoopView("steps");
    }

    if (root.dataset.checklistBound === "1") {
      root._dailyLoopRender?.();
      return;
    }
    root.dataset.checklistBound = "1";

    function dailyLoopFillFraction(doneCount, total) {
      if (!total || doneCount <= 0) return 0;
      if (doneCount >= total) return 1;
      const first = 0.5 / total;
      const last = (total - 0.5) / total;
      const current = (doneCount - 0.5) / total;
      return (current - first) / (last - first);
    }

    function animateDailyLoopFill(railEl, fillFraction) {
      if (!railEl) return;
      const target = Math.max(0, Math.min(1, fillFraction));
      railEl.style.setProperty("--daily-loop-fill", String(target));
      root._lastFillFrac = target;
    }

    function dailyLoopIndexFraction(idx, total) {
      if (!total || total <= 1) return 0;
      return Math.max(0, Math.min(1, idx / (total - 1)));
    }

    function renderProgressHtml(items, selected) {
      return (
        `<div class="daily-loop-progress-head">` +
        `<span class="daily-loop-progress-count">${selected + 1} of ${items.length}</span>` +
        `</div>` +
        `<div class="daily-loop-progress-rail">` +
        `<div class="daily-loop-progress-fill" aria-hidden="true"></div>` +
        `<div class="daily-loop-progress-steps">` +
        items
          .map((it, i) => {
            const isSelected = i === selected;
            const stepCls = "daily-loop-step" + (isSelected ? " is-selected" : "");
            return (
              `<div class="daily-loop-step-wrap">` +
              `<button type="button" class="${stepCls}" data-idx="${i}" aria-current="${isSelected ? "step" : "false"}" aria-label="${it.short}${isSelected ? ", current step" : ""}">` +
              `<span class="daily-loop-step-dot" aria-hidden="true">${it.step}</span>` +
              `<span class="daily-loop-step-label">${it.short}</span>` +
              `</button></div>`
            );
          })
          .join("") +
        `</div></div>`
      );
    }

    function renderDetail(it, idx, total) {
      if (!it) return `<p class="daily-loop-complete-banner">All set for today.</p>`;

      const canPrev = idx > 0;
      const canNext = idx < total - 1;

      return (
        `<div class="daily-loop-step-card">` +
        `<p class="daily-loop-step-kicker">Step ${it.step} of ${total}</p>` +
        dailyLoopStepBodyHtml(it.row) +
        `</div>` +
        `<div class="daily-loop-step-nav">` +
        `<button type="button" class="daily-loop-nav-btn daily-loop-nav-btn--prev" data-action="prev"${canPrev ? "" : " disabled"}>` +
        `<span class="daily-loop-nav-arrow" aria-hidden="true">←</span><span>Previous</span></button>` +
        `<button type="button" class="daily-loop-nav-btn daily-loop-nav-btn--next" data-action="next"${canNext ? "" : " disabled"}>` +
        `<span>Next</span><span class="daily-loop-nav-arrow" aria-hidden="true">→</span></button>` +
        `</div>`
      );
    }

    function updateDetailPane(html, dir) {
      const viewport = root.querySelector(".daily-loop-detail-viewport");
      if (!viewport) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!dir || reduceMotion) {
        viewport.innerHTML = `<div class="daily-loop-detail-pane">${html}</div>`;
        return;
      }
      viewport.innerHTML =
        `<div class="daily-loop-detail-pane is-entering" data-dir="${dir}">${html}</div>`;
      requestAnimationFrame(() => {
        viewport.querySelector(".daily-loop-detail-pane")?.classList.remove("is-entering");
      });
    }

    function bindDailyLoopEvents() {
      if (root.dataset.eventsBound === "1") return;
      root.dataset.eventsBound = "1";
      root.addEventListener("click", (e) => {
        const stepBtn = e.target.closest(".daily-loop-step");
        if (stepBtn) {
          preserveScroll(() => {
            const nextIdx = Number(stepBtn.dataset.idx) || 0;
            navDir = nextIdx > selectedIdx ? 1 : nextIdx < selectedIdx ? -1 : 0;
            selectedIdx = nextIdx;
            render();
          });
          return;
        }
        const actionBtn = e.target.closest("[data-action]");
        if (!actionBtn || actionBtn.disabled) return;
        preserveScroll(() => {
          const action = actionBtn.dataset.action;
          const items = getDailyLoopChecklistItems();

          if (action === "prev") {
            navDir = -1;
            selectedIdx = Math.max(0, selectedIdx - 1);
          } else if (action === "next") {
            navDir = 1;
            selectedIdx = Math.min(items.length - 1, selectedIdx + 1);
          }
          render();
        });
      });
    }

    function render() {
      const items = getDailyLoopChecklistItems();
      if (!items.length) {
        root.innerHTML = "";
        return;
      }

      if (selectedIdx >= items.length) selectedIdx = items.length - 1;
      if (selectedIdx < 0) selectedIdx = 0;

      const fillFrac = dailyLoopIndexFraction(selectedIdx, items.length);
      const current = items[selectedIdx];
      const progressHtml = renderProgressHtml(items, selectedIdx);
      const detailHtml = renderDetail(current, selectedIdx, items.length);

      if (!root.querySelector(".daily-loop-shell")) {
        root.innerHTML =
          `<div class="daily-loop-shell">` +
          `<div class="daily-loop-progress-zone">${progressHtml}</div>` +
          `<div class="daily-loop-detail-viewport"><div class="daily-loop-detail-pane">${detailHtml}</div></div>` +
          `</div>`;
        bindDailyLoopEvents();
      } else {
        root.querySelector(".daily-loop-progress-zone").innerHTML = progressHtml;
        updateDetailPane(detailHtml, navDir);
      }
      navDir = 0;

      const railEl = root.querySelector(".daily-loop-progress-rail");
      animateDailyLoopFill(railEl, fillFrac);
      saveDailyLoopIndex(selectedIdx);
      initConfigLinks();
      if (window.SiteIcons) window.SiteIcons.initIcons(root);
    }

    root._dailyLoopRender = render;
    render();
  }

  function initEverydayTasks() {
    renderEverydayTasksInto(document.getElementById("everyday-tasks-body"));
  }

  window.EverydayTasks = { renderInto: renderEverydayTasksInto };
  window.DailyLoopChecklist = { init: initDailyLoopChecklist };

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
          id: "module_preferences",
          label: "Preferences",
          link: { href: "course-module.html?m=preferences", label: "Open module" },
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
          label: "Joined team chat (optional)",
          hint: "For team updates · leads go through Lead Builder",
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
      items: TOOL_PAGES.filter((p) => !p.external).map((p) => ({
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
    const form = document.getElementById("incomeForm");
    if (!root && !form) return;
    if (form?.dataset.trackerBound === "1") {
      ensureDashboardIncomeUi();
      reloadSalesTracker?.();
      root?.classList.add("dash-hydrated");
      return;
    }

    ensureDashboardIncomeUi();

    const revealTracker = () => {
      reloadSalesTracker?.();
      document.getElementById("sales-tracker")?.classList.add("dash-hydrated");
    };

    window.RepSession?.enforceTrackerIdentity?.();
    bootTracker();
    revealTracker();

    if (window.RepStorage?.whenReady) {
      window.RepStorage.whenReady(revealTracker);
    }
  }

  function bootTracker() {
    const root = document.getElementById("sales-tracker");
    const form = document.getElementById("incomeForm");
    if (!root && !form) return;

    let data = loadTracker();

    const GOAL_RING_R = 118;
    const GOAL_RING_C = 2 * Math.PI * GOAL_RING_R;

    function initIncomeActions() {
      ensureDashboardIncomeUi();
    }

    function celebrateGoal() {
      const orbit = document.getElementById("progressOrbit");
      if (orbit) {
        orbit.classList.remove("goal-reached");
        requestAnimationFrame(() => orbit.classList.add("goal-reached"));
      }
      window.GoalCelebration?.fireGoalReached?.();
    }

    function maybeCelebrateGoalFromSale(earnedBefore, earnedAfter) {
      const goal = normalizeGoal(data.goal);
      if (earnedBefore < goal && earnedAfter >= goal) {
        if (window.UserPrefs?.showGoalCelebration?.() !== false) {
          celebrateGoal();
        }
      }
    }

    let goalRingPctShown = null;
    let goalRingAnimId = null;

    function prefersReducedMotion() {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    }

    function readRingPct() {
      const ring = document.getElementById("progressRing");
      if (!ring) return 0;
      const off = parseFloat(ring.style.strokeDashoffset);
      if (!Number.isFinite(off)) return 0;
      return Math.min(100, Math.max(0, (1 - off / GOAL_RING_C) * 100));
    }

    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function cancelGoalRingAnim() {
      if (goalRingAnimId) {
        cancelAnimationFrame(goalRingAnimId);
        goalRingAnimId = null;
      }
    }

    function syncGoalRingPctFromDom() {
      goalRingPctShown = readRingPct();
      return goalRingPctShown;
    }

    function triggerGoalRingBump() {
      const orbit = document.getElementById("progressOrbit");
      if (!orbit || prefersReducedMotion()) return;
      orbit.classList.remove("goal-progress-bump");
      void orbit.offsetWidth;
      orbit.classList.add("goal-progress-bump");
      const onEnd = () => {
        orbit.classList.remove("goal-progress-bump");
        orbit.removeEventListener("animationend", onEnd);
      };
      orbit.addEventListener("animationend", onEnd);
    }

    function applyGoalRingProgress(pct, opts) {
      const ring = document.getElementById("progressRing");
      if (!ring) return;
      const target = Math.min(100, Math.max(0, pct));
      const targetOffset = GOAL_RING_C * (1 - target / 100);
      ring.style.strokeDasharray = GOAL_RING_C + " " + GOAL_RING_C;

      const instant = opts?.instant || prefersReducedMotion();
      cancelGoalRingAnim();
      const prev = syncGoalRingPctFromDom();

      if (instant || Math.abs(target - prev) < 0.05) {
        ring.style.strokeDashoffset = String(targetOffset);
        goalRingPctShown = target;
        return;
      }

      const fromOffset = GOAL_RING_C * (1 - prev / 100);
      const decreasing = target < prev - 0.05;
      const startTime = performance.now();
      const duration = decreasing
        ? Math.min(650, 280 + Math.abs(target - prev) * 3)
        : Math.min(1100, 650 + Math.abs(target - prev) * 4);
      const pctBadge = document.getElementById("completionPercent");
      const startRound = Math.round(prev);
      const targetRound = Math.round(target);
      const bumpOnFinish = !decreasing && target > prev + 0.05;

      function frame(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = decreasing ? easeOutCubic(t) : easeOutBack(t);
        const offset = fromOffset + (targetOffset - fromOffset) * eased;
        ring.style.strokeDashoffset = String(offset);
        if (pctBadge) {
          const n = Math.round(startRound + (targetRound - startRound) * eased);
          pctBadge.textContent = Math.min(100, Math.max(0, n)) + "%";
        }
        if (t < 1) {
          goalRingAnimId = requestAnimationFrame(frame);
        } else {
          ring.style.strokeDashoffset = String(targetOffset);
          if (pctBadge) pctBadge.textContent = targetRound + "%";
          goalRingPctShown = target;
          goalRingAnimId = null;
          if (bumpOnFinish) triggerGoalRingBump();
        }
      }
      goalRingAnimId = requestAnimationFrame(frame);
    }

    function renderStats() {
      const deals = data.deals || [];
      const earned = calcEarnedFromDeals(deals);
      const closes = deals.length;
      const goal = normalizeGoal(data.goal);
      const pct = (earned / goal) * 100;
      const pctRound = Math.round(Math.min(100, pct));
      const remaining = Math.max(goal - earned, 0);

      const earnedEl = document.getElementById("totalRevenue");
      if (earnedEl) earnedEl.textContent = "$" + formatMoney(earned);
      const closesEl = document.getElementById("salesCount");
      if (closesEl) closesEl.textContent = String(closes);
      const averageEl = document.getElementById("averageSale");
      if (averageEl) averageEl.textContent = "$" + formatMoney(closes ? earned / closes : 0);
      const pctBadge = document.getElementById("completionPercent");
      const isFirstRingRender = goalRingPctShown === null;
      if (pctBadge && isFirstRingRender) pctBadge.textContent = pctRound + "%";

      applyGoalRingProgress(pct, { instant: isFirstRingRender });
    }

    function initGoalEditor() {
      const input = document.getElementById("goalInput");
      if (!input || input.dataset.trackerBound === "1") return;
      input.dataset.trackerBound = "1";
      input.value = String(normalizeGoal(data.goal));

      function previewGoalFromInput() {
        const v = Number(input.value);
        if (!Number.isFinite(v) || v <= 0) return;
        data.goal = v;
        renderStats();
      }

      function commitGoalFromInput() {
        const v = Number(input.value);
        if (!Number.isFinite(v) || v <= 0) {
          input.value = String(normalizeGoal(data.goal));
          return;
        }
        if (v === data.goal) return;
        data.goal = v;
        saveTracker(data);
        renderAll();
      }

      input.addEventListener("input", previewGoalFromInput);
      input.addEventListener("change", commitGoalFromInput);
      input.addEventListener("blur", commitGoalFromInput);
    }

    function renderDealsList() {
      const list = document.getElementById("salesList");
      if (!list) return;

      const deals = [...(data.deals || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      const salesCountEl = document.getElementById("dash-sales-count");
      if (salesCountEl) {
        salesCountEl.textContent =
          deals.length === 1 ? "1 sale" : deals.length + " sales";
      }
      const trackerSalesEl = document.getElementById("salesCount");
      if (trackerSalesEl) trackerSalesEl.textContent = String(deals.length);

      if (!deals.length) {
        list.innerHTML = '<div class="empty-state">No sales yet.</div>';
        return;
      }

      list.innerHTML = deals
        .map((d) => {
          const amount = Number(d.commission) || 0;
          const title = d.businessName || "Sale logged";
          const when = formatDealDateTime(d.createdAt);
          const id = escHtml(d.id);
          const isOwnerLocked = !!d.fromOwnerConfirm;
          const ownerBadge = isOwnerLocked
            ? '<span class="sale-card-owner-badge">Owner Confirmed</span>'
            : "";

          const actionButtons = isOwnerLocked
            ? ""
            : '<div class="sale-card-actions">' +
              '<button type="button" class="sale-card-edit-btn" data-sale-edit="' +
              id +
              '" aria-label="Edit ' +
              escHtml(title) +
              '">' +
              '<span data-icon="pencil" data-icon-class="sale-card-edit-ico" aria-hidden="true"></span>' +
              "<span>Edit</span>" +
              "</button>" +
              '<button type="button" class="sale-card-delete-btn" data-sale-delete="' +
              id +
              '" aria-label="Delete ' +
              escHtml(title) +
              '">' +
              '<span data-icon="trash-2" data-icon-class="sale-card-delete-ico" aria-hidden="true"></span>' +
              "</button>" +
              "</div>";

          const editForm = isOwnerLocked
            ? ""
            : '<form class="sale-card-edit-form" data-sale-edit-form="' +
              id +
              '">' +
              '<div class="sale-card-edit-grid">' +
              '<label class="sale-card-edit-field">' +
              "<span>Business name <span class=\"dash-income-field-optional\">(optional)</span></span>" +
              '<input type="text" name="businessName" value="' +
              escHtml(d.businessName || "") +
              '" placeholder="Bobby\'s Burgerr">' +
              "</label>" +
              '<label class="sale-card-edit-field">' +
              "<span>Sale amount</span>" +
              '<input type="number" name="amount" min="1" step="0.01" value="' +
              escHtml(String(saleAmountFromDeal(d))) +
              '" inputmode="decimal" required>' +
              "</label>" +
              "</div>" +
              '<div class="sale-card-edit-actions">' +
              '<button type="button" class="btn secondary sale-card-cancel-btn" data-sale-cancel="' +
              id +
              '">Cancel</button>' +
              '<button type="submit" class="btn sale-card-save-btn">Save changes</button>' +
              "</div>" +
              "</form>";

          return (
            '<article class="sale-card' +
            (isOwnerLocked ? " sale-card--owner-locked sale-card--clickable" : "") +
            '" data-deal-id="' +
            id +
            '"' +
            (isOwnerLocked
              ? ' role="button" tabindex="0" aria-label="View owner confirmed sale details for ' +
                escHtml(title) +
                '"'
              : "") +
            ">" +
            '<div class="sale-card-view">' +
            '<div class="sale-card-body">' +
            '<div class="sale-card-title-row">' +
            '<strong class="sale-card-title">' +
            escHtml(title) +
            "</strong>" +
            ownerBadge +
            "</div>" +
            '<time class="sale-card-date" datetime="' +
            escHtml(d.createdAt || "") +
            '">' +
            escHtml(when) +
            "</time>" +
            "</div>" +
            '<div class="sale-card-side">' +
            '<span class="sale-amount">$' +
            formatMoney(amount) +
            "</span>" +
            actionButtons +
            "</div>" +
            "</div>" +
            editForm +
            "</article>"
          );
        })
        .join("");

      if (window.SiteIcons) window.SiteIcons.initIcons(list);
    }

    function closeSaleCardEdit(card) {
      if (!card) return;
      card.classList.remove("is-editing");
    }

    function openSaleCardEdit(dealId) {
      const list = document.getElementById("salesList");
      if (!list) return;
      const deal = (data.deals || []).find((d) => String(d.id) === String(dealId));
      if (deal?.fromOwnerConfirm) return;
      list.querySelectorAll(".sale-card.is-editing").forEach((card) => {
        if (card.dataset.dealId !== dealId) closeSaleCardEdit(card);
      });
      const card = list.querySelector('.sale-card[data-deal-id="' + dealId + '"]');
      if (!card) return;
      card.classList.add("is-editing");
      const input = card.querySelector('.sale-card-edit-form input[name="amount"]');
      focusNoScroll(input);
    }

    function saveSaleCardEdit(dealId, form) {
      const deal = (data.deals || []).find((d) => String(d.id) === String(dealId));
      if (!deal || !form) return;
      if (deal.fromOwnerConfirm) return;

      const amountEl = form.querySelector('input[name="amount"]');
      const businessEl = form.querySelector('input[name="businessName"]');
      const saleAmount = parseSaleAmount(amountEl?.value);
      if (saleAmount <= 0) {
        alert("Enter a price greater than $0.");
        focusNoScroll(amountEl);
        return;
      }

      deal.commission = commissionFromDown(saleAmount);
      deal.saleAmount = saleAmount;
      deal.businessName = businessEl?.value.trim() || "";
      saveTracker(data);
      renderAll();
    }

    function recordDeletedDealId(dealId) {
      const id = String(dealId || "").trim();
      if (!id) return;
      if (!Array.isArray(data.deletedDealIds)) data.deletedDealIds = [];
      if (!data.deletedDealIds.includes(id)) data.deletedDealIds.push(id);
    }

    function deleteSaleCard(dealId) {
      const deal = (data.deals || []).find((d) => String(d.id) === String(dealId));
      if (!deal) return;
      if (deal.fromOwnerConfirm) return;

      recordDeletedDealId(dealId);
      data.deals = (data.deals || []).filter((d) => String(d.id) !== String(dealId));
      saveTracker(data);
      renderAll();
      void window.RepStorage?.flushSync?.();
    }

    function bindSalesListActions() {
      const list = document.getElementById("salesList");
      if (!list || list.dataset.actionsBound === "1") return;
      list.dataset.actionsBound = "1";

      list.addEventListener("click", (e) => {
        const editBtn = e.target.closest("[data-sale-edit]");
        if (editBtn) {
          e.preventDefault();
          openSaleCardEdit(editBtn.getAttribute("data-sale-edit"));
          return;
        }

        const cancelBtn = e.target.closest("[data-sale-cancel]");
        if (cancelBtn) {
          e.preventDefault();
          const card = cancelBtn.closest(".sale-card");
          closeSaleCardEdit(card);
          return;
        }

        const deleteBtn = e.target.closest("[data-sale-delete]");
        if (deleteBtn) {
          e.preventDefault();
          deleteSaleCard(deleteBtn.getAttribute("data-sale-delete"));
        }
      });

      list.addEventListener("submit", (e) => {
        const form = e.target.closest("[data-sale-edit-form]");
        if (!form) return;
        e.preventDefault();
        saveSaleCardEdit(form.getAttribute("data-sale-edit-form"), form);
      });
    }

    function renderAll() {
      renderStats();
      renderDealsList();
      initIncomeActions();
    }

    function reloadFromStorage() {
      data = loadTracker();
      syncLpcTrackerBridge();
      const session = window.RepSession?.get?.();
      if (session?.name) {
        data.name = session.name;
        data.repId = session.id;
      }
      data.goal = normalizeGoal(data.goal);
      const goalInput = document.getElementById("goalInput");
      if (goalInput && goalInput.dataset.trackerBound === "1") {
        if (document.activeElement !== goalInput) {
          goalInput.value = String(data.goal);
        } else {
          data.goal = normalizeGoal(Number(goalInput.value) || data.goal);
        }
      }
      renderAll();
    }

    reloadSalesTracker = reloadFromStorage;

    function parseSaleAmount(raw) {
      const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? Math.round(n) : 0;
    }

    if (form && form.dataset.trackerSubmitBound !== "1") {
      form.dataset.trackerSubmitBound = "1";
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const priceEl = document.getElementById("saleAmount");
        const businessEl = document.getElementById("businessName");
        const saleAmount = parseSaleAmount(priceEl?.value);
        if (saleAmount <= 0) {
          alert("Enter a price greater than $0.");
          focusNoScroll(priceEl);
          return;
        }

        const earnedBefore = calcEarnedFromDeals(data.deals || []);

        const deal = {
          id: newDealId(),
          createdAt: new Date().toISOString(),
          commission: commissionFromDown(saleAmount),
          saleAmount,
          businessName: businessEl?.value.trim() || "",
        };

        data.deals = data.deals || [];
        data.deals.push(deal);
        const earnedAfter = calcEarnedFromDeals(data.deals);
        saveTracker(data);
        form.reset();
        renderAll();
        maybeCelebrateGoalFromSale(earnedBefore, earnedAfter);
        const salesList = document.getElementById("salesList");
        if (salesList) salesList.scrollTop = 0;
      });
    }

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
    initIncomeActions();
    bindSalesListActions();
    window.dashboardRenderDealsList = renderDealsList;
    onPendingSaleLogged = (earnedBefore, earnedAfter) => {
      renderAll();
      maybeCelebrateGoalFromSale(earnedBefore, earnedAfter);
      const salesList = document.getElementById("salesList");
      if (salesList) salesList.scrollTop = 0;
    };
    renderAll();
    if (form) form.dataset.trackerBound = "1";
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

  function toggleAccordion(acc) {
    if (!acc) return;
    const q = acc.querySelector(":scope > .acc-q");
    const wasOpen = acc.classList.contains("open");
    document.querySelectorAll(".acc.open").forEach((o) => {
      o.classList.remove("open");
      o.querySelector(":scope > .acc-q")?.setAttribute("aria-expanded", "false");
    });
    if (!wasOpen) {
      acc.classList.add("open");
      q?.setAttribute("aria-expanded", "true");
    }
  }

  function bindAccordionAcc(acc) {
    const q = acc.querySelector(":scope > .acc-q");
    if (!q || q.dataset.accBound === "1") return;
    q.dataset.accBound = "1";
    q.addEventListener("click", (e) => {
      if (e.target.closest(".custom-script-title-input, .custom-outreach-title-input")) return;
      e.preventDefault();
      toggleAccordion(acc);
    });
    q.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.closest(".custom-script-title-input, .custom-outreach-title-input")) return;
      e.preventDefault();
      toggleAccordion(acc);
    });
  }

  function syncAccordionAria() {
    document.querySelectorAll(".acc").forEach((acc) => {
      const q = acc.querySelector(":scope > .acc-q");
      if (!q) return;
      q.setAttribute("aria-expanded", acc.classList.contains("open") ? "true" : "false");
    });
  }

  function initAccordions() {
    document.querySelectorAll(".acc").forEach(bindAccordionAcc);
    syncAccordionAria();
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

  function openScriptAccordion(scriptId) {
    if (!scriptId) return;
    const acc = document.querySelector('#scripts-editor .acc[data-script-id="' + scriptId + '"]');
    if (!acc) return;
    document.querySelectorAll("#scripts-editor .acc.open").forEach((a) => {
      a.classList.remove("open");
      a.querySelector(":scope > .acc-q")?.setAttribute("aria-expanded", "false");
    });
    acc.classList.add("open");
    acc.querySelector(":scope > .acc-q")?.setAttribute("aria-expanded", "true");
    acc.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const SCRIPT_ENTRY_TARGET = {
    d: "script-d-transfer",
    g: "script-g-close",
  };

  function clearScriptHighlights() {
    document.querySelectorAll(".script-block--highlight").forEach((node) => {
      node.classList.remove("script-block--highlight");
    });
  }

  function highlightScriptBlock(el) {
    if (!el) return;
    clearScriptHighlights();
    el.classList.add("script-block--highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function scrollToScriptTarget(targetId) {
    if (!targetId) return;
    const el =
      document.getElementById(targetId) ||
      document.querySelector('[data-script-target="' + targetId + '"]');
    if (!el) return;
    highlightScriptBlock(el);
  }

  function bindScriptPathways(page) {
    if (!page || page.dataset.pathBound) return;
    page.dataset.pathBound = "1";
    page.addEventListener("click", (e) => {
      const pathBtn = e.target.closest(".script-path-btn[data-scroll-target]");
      if (pathBtn) {
        e.preventDefault();
        scrollToScriptTarget(pathBtn.dataset.scrollTarget);
        return;
      }
      const jump = e.target.closest(".script-open-btn");
      if (!jump) return;
      e.preventDefault();
      const scriptId = jump.dataset.scriptId;
      const scrollTarget = jump.dataset.scrollTarget || SCRIPT_ENTRY_TARGET[scriptId];
      openScriptAccordion(scriptId);
      if (scrollTarget) {
        window.setTimeout(() => scrollToScriptTarget(scrollTarget), 100);
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
        }
      });
    }

    bindScriptPathways(scriptsPage);

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
          `<button type="button" class="btn secondary script-dl-btn" data-format="md">.md</button>` +
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
  let tplMode = "";
  let tplPrice = "";

  function tplPriceButtonIds() {
    return ["btn-p500", "btn-p700", "btn-p1000", "btn-p1500"];
  }

  function readTplPriceChosenFromDom() {
    return !!readTplPriceFromDom();
  }

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
    const prev = loadTemplateBuilder();
    const priceChosen = readTplPriceChosenFromDom();
    const preferenceChosen = !!(
      document.getElementById("btn-dl")?.classList.contains("active") ||
      document.getElementById("btn-bk")?.classList.contains("active")
    );
    saveTemplateBuilder({
      mode: tplMode,
      price: readTplPriceFromDom() || tplPrice || "",
      priceChosen,
      preferenceChosen,
      businessName: document.getElementById("tpl-business")?.value || "",
      name: document.getElementById("tpl-name")?.value || "",
      phone: document.getElementById("tpl-phone")?.value || "",
      maps: document.getElementById("tpl-maps")?.value || "",
      leadId: String(prev.leadId || "").trim(),
    });
  }

  function applyTemplateBuilder() {
    const s = loadTemplateBuilder();
    if (s.priceChosen && s.price) setTplPrice(s.price, true, true);
    else clearTplPrice(true, true);
    if (s.preferenceChosen && (s.mode === "dl" || s.mode === "bk")) setTplMode(s.mode, true, true);
    else clearTplMode(true, true);
    const businessEl = document.getElementById("tpl-business");
    const nameEl = document.getElementById("tpl-name");
    const phoneEl = document.getElementById("tpl-phone");
    const mapsEl = document.getElementById("tpl-maps");
    if (businessEl) businessEl.value = String(s.businessName ?? "");
    if (nameEl) nameEl.value = String(s.name ?? "");
    if (phoneEl) phoneEl.value = String(s.phone ?? "");
    if (mapsEl) mapsEl.value = String(s.maps ?? "");
    syncTplCallBtn();
    const hasSavedContent = !!(s.businessName || s.name || s.phone || s.maps);
    if (!hasSavedContent) {
      resetTplProgressTouched();
    }
    syncTplProgressFilledBaseline();
    syncTplNotInterestedBtn();
  }

  function setTplMode(mode, skipSave, skipProgress) {
    tplMode = mode;
    document.getElementById("btn-dl")?.classList.toggle("active", mode === "dl");
    document.getElementById("btn-bk")?.classList.toggle("active", mode === "bk");
    document.getElementById("btn-dl")?.closest(".tpl-field")?.classList.remove("is-invalid");
    if (!skipSave) persistTemplateBuilder();
    if (!skipProgress) {
      tplProgressTouched.preference = true;
      tickTplSendProgress();
    }
  }

  function clearTplMode(skipSave, skipProgress) {
    tplMode = "";
    document.getElementById("btn-dl")?.classList.remove("active");
    document.getElementById("btn-bk")?.classList.remove("active");
    if (!skipSave) persistTemplateBuilder();
    if (!skipProgress) {
      tplProgressTouched.preference = false;
      tickTplSendProgress();
    }
  }

  function clearTplPrice(skipSave, skipProgress) {
    tplPrice = "";
    tplPriceButtonIds().forEach((id) => document.getElementById(id)?.classList.remove("active"));
    document.getElementById("btn-p500")?.closest(".tpl-field")?.classList.remove("is-invalid");
    if (!skipSave) persistTemplateBuilder();
    if (!skipProgress) tickTplSendProgress();
  }

  function setTplPrice(price, skipSave, skipProgress) {
    tplPrice = price;
    const map = { $500: "btn-p500", $700: "btn-p700", "$1,000": "btn-p1000", "$1,500": "btn-p1500" };
    tplPriceButtonIds().forEach((id) => document.getElementById(id)?.classList.remove("active"));
    document.getElementById(map[price] || "btn-p500")?.classList.add("active");
    document.getElementById("btn-p500")?.closest(".tpl-field")?.classList.remove("is-invalid");
    if (!skipSave) persistTemplateBuilder();
    if (!skipProgress) tickTplSendProgress();
  }

  function readTplPriceFromDom() {
    const map = {
      "btn-p500": "$500",
      "btn-p700": "$700",
      "btn-p1000": "$1,000",
      "btn-p1500": "$1,500",
    };
    for (const [id, price] of Object.entries(map)) {
      if (document.getElementById(id)?.classList.contains("active")) return price;
    }
    return "";
  }

  function readTplModeFromDom() {
    if (document.getElementById("btn-bk")?.classList.contains("active")) return "bk";
    if (document.getElementById("btn-dl")?.classList.contains("active")) return "dl";
    return tplMode || "";
  }

  function tplInputValue(id) {
    return String(document.getElementById(id)?.value || "")
      .replace(/\r?\n/g, " ")
      .trim();
  }

  function normalizeTplHttpUrl(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed.replace(/^\/+/, "");
  }

  function isTplHttpUrl(raw) {
    const href = normalizeTplHttpUrl(raw);
    if (!href) return false;
    try {
      const u = new URL(href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      const host = u.hostname.replace(/^\[|\]$/g, "");
      if (!host) return false;
      if (host === "localhost") return true;
      return host.includes(".") && host.length >= 4;
    } catch (e) {
      return false;
    }
  }

  function buildLeadPayload() {
    const mode = readTplModeFromDom();
    const pref = mode === "dl" ? "Direct Link" : mode === "bk" ? "Booking" : "";
    const pick = readStashedLeadPick();
    const saved = loadTemplateBuilder();
    const urlLeadId = new URLSearchParams(window.location.search).get("lead") || "";
    return {
      lead_id:
        pick?.leadId ||
        pick?.lead_id ||
        saved.leadId ||
        urlLeadId ||
        "",
      business_name: tplInputValue("tpl-business"),
      price: readTplPriceFromDom(),
      google_maps: normalizeTplHttpUrl(tplInputValue("tpl-maps")),
      preference: pref,
      phone: tplInputValue("tpl-phone"),
      owner_name: tplInputValue("tpl-name"),
    };
  }

  const TPL_REQUIRED_FIELDS = [
    { id: "tpl-business", row: "tpl-field-business", label: "Business Name" },
    { id: "tpl-maps", row: "tpl-field-maps", label: "Google Maps", isUrl: true },
    { id: "tpl-phone", row: "tpl-field-phone", label: "Phone", minDigits: 10 },
    { id: "tpl-name", row: "tpl-field-name", label: "Owner Name" },
  ];

  function showTplValidationMsg(msg, options) {
    const el = document.getElementById("tpl-validation-msg");
    if (!el) return;
    el.classList.toggle("is-success", !!(options && options.success));
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-success");
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  let tplActionDialogResolver = null;

  function ensureTplActionDialogBound() {
    const dialog = document.getElementById("tpl-action-dialog");
    if (!dialog || dialog.dataset.bound === "1") return;
    dialog.dataset.bound = "1";
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeTplActionDialog(false);
    });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeTplActionDialog(false);
    });
  }

  function closeTplActionDialog(result) {
    const dialog = document.getElementById("tpl-action-dialog");
    if (dialog) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    const resolve = tplActionDialogResolver;
    tplActionDialogResolver = null;
    if (resolve) resolve(!!result);
  }

  function openTplActionDialog(options) {
    options = options || {};
    ensureTplActionDialogBound();
    const dialog = document.getElementById("tpl-action-dialog");
    const panel = document.getElementById("tpl-action-dialog-panel");
    const titleEl = document.getElementById("tpl-action-dialog-title");
    const textEl = document.getElementById("tpl-action-dialog-text");
    const actionsEl = document.getElementById("tpl-action-dialog-actions");
    if (!dialog || !panel || !titleEl || !textEl || !actionsEl) {
      return Promise.resolve(false);
    }

    const kind = String(options.kind || "").trim();
    const confirmLabel = String(options.confirmLabel || "").trim();
    const cancelLabel = String(options.cancelLabel || "").trim();
    const isConfirm = !!(confirmLabel && cancelLabel);

    titleEl.textContent = String(options.title || "").trim();
    textEl.textContent = String(options.text || "").trim();
    panel.classList.toggle("tpl-action-dialog-panel--success", kind === "success");
    panel.classList.toggle("tpl-action-dialog-panel--error", kind === "error");

    actionsEl.innerHTML = "";
    if (isConfirm) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn secondary";
      cancelBtn.textContent = cancelLabel;
      cancelBtn.addEventListener("click", () => closeTplActionDialog(false));

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className =
        "btn" + (kind === "danger" ? " tpl-action-dialog-confirm--danger" : "");
      confirmBtn.textContent = confirmLabel;
      confirmBtn.addEventListener("click", () => closeTplActionDialog(true));

      actionsEl.append(cancelBtn, confirmBtn);
    } else {
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn";
      okBtn.textContent = String(options.noticeLabel || "OK").trim() || "OK";
      okBtn.addEventListener("click", () => closeTplActionDialog(true));
      actionsEl.append(okBtn);
    }

    return new Promise((resolve) => {
      tplActionDialogResolver = resolve;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      requestAnimationFrame(() => {
        const primary =
          actionsEl.querySelector(".btn:not(.secondary)") || actionsEl.querySelector(".btn");
        primary?.focus();
      });
    });
  }

  function showTplActionConfirm(options) {
    return openTplActionDialog(options || {});
  }

  function showTplToast(message, options) {
    const msg = String(message || "").trim();
    if (!msg) return;

    function run() {
      if (!global.SiteLoading?.showToast) return false;
      global.SiteLoading.showToast(msg, options);
      return true;
    }

    function schedule() {
      if (run()) return;
      let tries = 0;
      const timer = global.setInterval(() => {
        tries += 1;
        if (run() || tries >= 40) global.clearInterval(timer);
      }, 50);
    }

    global.requestAnimationFrame(() => {
      global.requestAnimationFrame(schedule);
    });
  }

  function pulseTplActionBtn(btn) {
    if (!btn) return;
    btn.classList.remove("is-pressed");
    void btn.offsetWidth;
    btn.classList.add("is-pressed");
    global.setTimeout(() => btn.classList.remove("is-pressed"), 440);
  }

  function setTplActionBtnBusy(btn, busy, label) {
    if (!btn) return;
    btn.classList.toggle("is-busy", !!busy);
    if (busy) {
      if (!btn.dataset.tplDefaultLabel) {
        btn.dataset.tplDefaultLabel = btn.textContent || "";
      }
      if (label) btn.textContent = label;
      btn.disabled = true;
      return;
    }
    if (btn.dataset.tplDefaultLabel) {
      btn.textContent = btn.dataset.tplDefaultLabel;
      delete btn.dataset.tplDefaultLabel;
    }
    if (btn.id === "tpl-not-interested-btn") syncTplNotInterestedBtn();
    else btn.disabled = false;
  }

  function tplFormHasContent() {
    if (
      ["tpl-business", "tpl-name", "tpl-phone", "tpl-maps"].some((id) =>
        String(document.getElementById(id)?.value || "").trim()
      )
    ) {
      return true;
    }
    if (getTplLinkedLeadId()) return true;
    if (readTplPriceChosenFromDom()) return true;
    return !!(
      document.getElementById("btn-dl")?.classList.contains("active") ||
      document.getElementById("btn-bk")?.classList.contains("active")
    );
  }

  async function withTplActionLoading(task, label) {
    global.SiteLoading?.showBusy?.(label || "Loading...", { immediate: true });
    try {
      return await task();
    } finally {
      global.SiteLoading?.hideBusy?.();
    }
  }

  function getTplLinkedLeadId() {
    const fromStorage = String(loadTemplateBuilder().leadId || "").trim();
    if (fromStorage) return fromStorage;
    const pick = readStashedLeadPick();
    if (pick?.leadId) return String(pick.leadId).trim();
    if (pick?.lead_id) return String(pick.lead_id).trim();
    return String(new URLSearchParams(window.location.search).get("lead") || "").trim();
  }

  function isTplPhoneFilledOut() {
    return phoneDigitCount(tplInputValue("tpl-phone")) >= 10;
  }

  function canMarkTplNotInterested() {
    return !!getTplLinkedLeadId() && isTplPhoneFilledOut();
  }

  function syncTplNotInterestedBtn() {
    const btn = document.getElementById("tpl-not-interested-btn");
    if (!btn) return;
    const linked = !!getTplLinkedLeadId();
    const phoneReady = isTplPhoneFilledOut();
    const canUse = linked && phoneReady;
    btn.disabled = !canUse;
    btn.title = !linked
      ? "Open this business from Lead Finder (Build Lead) first"
      : !phoneReady
        ? "Enter the business phone number first"
        : "Remove this business from the Active list in Lead Finder";
  }

  function tplNotInterestedDetails() {
    const leadId = getTplLinkedLeadId();
    let category = "";
    let address = "";
    const cached = window.LeadsLoader?.peekCache?.();
    const lead = (cached?.leads || []).find((l) => String(l.id) === String(leadId));
    if (lead) {
      category = String(lead.categoryGroup || lead.category || "").trim();
      address = String(lead.address || "").trim();
    }
    return {
      phone: tplInputValue("tpl-phone"),
      googleMaps: tplInputValue("tpl-maps"),
      category,
      address,
    };
  }

  async function markTplNotInterested() {
    const btn = document.getElementById("tpl-not-interested-btn");
    pulseTplActionBtn(btn);
    persistTemplateBuilder();
    clearTplValidation();

    const leadId = getTplLinkedLeadId();
    const businessName =
      String(document.getElementById("tpl-business")?.value || "").trim() || "Business";

    if (!leadId) {
      showTplToast("Open this business from Lead Finder (Build Lead) first.", { kind: "error" });
      syncTplNotInterestedBtn();
      return;
    }

    if (!isTplPhoneFilledOut()) {
      const phoneEl = document.getElementById("tpl-phone");
      phoneEl?.classList.add("is-invalid");
      phoneEl?.closest(".tpl-field")?.classList.add("is-invalid");
      showTplToast("Enter the business phone number first.", { kind: "error" });
      focusNoScroll(phoneEl);
      syncTplNotInterestedBtn();
      return;
    }

    const confirmed = await showTplActionConfirm({
      title: "Business not interested?",
      text:
        'Mark "' +
        businessName +
        '" as not interested? They will be removed from the Active list in Lead Finder.',
      confirmLabel: "Mark not interested",
      cancelLabel: "Keep editing",
      kind: "danger",
    });
    if (!confirmed) return;

    setTplActionBtnBusy(btn, true, "Saving…");

    try {
      await withTplActionLoading(async () => {
        if (window.LeadSync?.init) {
          await window.LeadSync.init(() => {}).catch(() => null);
        }
        window.PendingLeadBuilder?.clear?.(leadId);
        if (!window.LeadSync?.isConfigured?.()) {
          throw new Error("Lead sync not configured · check Supabase settings.");
        }
        if (!window.LeadSync?.markNotInterested) {
          throw new Error("Lead sync unavailable");
        }
        await window.LeadSync.markNotInterested(leadId, businessName, tplNotInterestedDetails());
        await window.LeadSync.refreshTeam?.().catch(() => null);
      }, "Saving…");

      clearTpl({ keepFeedback: true });
      showTplToast("Marked not interested · removed from Lead Finder.", { kind: "success" });
      if (global.SiteOwner?.isSiteOwner?.()) {
        global.setTimeout(() => {
          global.location.href = "sales-console.html#not-interested";
        }, 850);
      }
    } catch (e) {
      console.warn(e);
      showTplToast(
        e?.message && e.message !== "Lead sync unavailable"
          ? e.message
          : "Could not mark not interested. Try again.",
        { kind: "error" }
      );
    } finally {
      setTplActionBtnBusy(btn, false);
      syncTplNotInterestedBtn();
    }
  }

  async function handleTplClearClick(btn) {
    pulseTplActionBtn(btn);

    const leadId = getTplLinkedLeadId();
    const businessName =
      String(document.getElementById("tpl-business")?.value || "").trim() || "Business";

    if (!tplFormHasContent()) {
      showTplToast("Lead Builder is already empty.", { kind: "info" });
      if (leadId) {
        global.location.replace("leads.html");
      }
      return;
    }

    const confirmed = await showTplActionConfirm({
      title: "Clear and return to Lead Finder?",
      text: leadId
        ? "This clears the form and releases \"" +
          businessName +
          "\" back to your Active list in Lead Finder."
        : "This clears all fields in the Lead Builder.",
      confirmLabel: "Clear",
      cancelLabel: "Keep editing",
      kind: "danger",
    });
    if (!confirmed) return;

    setTplActionBtnBusy(btn, true, "Clearing…");
    global.SiteLoading?.showBusy?.("Clearing…", { immediate: true });
    try {
      if (leadId) {
        global.PendingLeadBuilder?.clear?.(leadId);
        global.LeadSync?.clearBuildingLocalSnapshot?.(leadId);
        global.LeadSync?.clearPendingLocalSnapshot?.(leadId);
      }

      if (leadId && window.LeadSync) {
        await window.LeadSync.init(() => {}).catch(() => null);
        if (window.LeadSync.isConfigured?.()) {
          await window.LeadSync.releaseLeadBuilding(leadId, businessName);
          await window.LeadSync.refreshTeam?.().catch(() => null);
        } else {
          const api = await window.LeadSync.init(() => {}).catch(() => null);
          await api?.setWorkflow?.(leadId, "active", businessName);
        }
      }

      clearTpl();
      try {
        sessionStorage.setItem("lpc_lf_force_team_refresh_v1", String(Date.now()));
        sessionStorage.removeItem("lpc_lead_pick_v1");
      } catch (storageErr) {
        /* ignore */
      }
      if (window.RepStorage?.flushSync) {
        await window.RepStorage.flushSync().catch(() => null);
      }
      showTplToast("Lead released · returning to Lead Finder.", { kind: "success" });
      global.setTimeout(() => {
        global.location.replace("leads.html");
      }, 400);
    } catch (e) {
      console.warn(e);
      showTplToast(e?.message || "Could not release lead. Try again.", { kind: "error" });
    } finally {
      global.SiteLoading?.hideBusy?.();
      setTplActionBtnBusy(btn, false);
    }
  }

  function clearTplValidation() {
    showTplValidationMsg("");
    const el = document.getElementById("tpl-validation-msg");
    el?.classList.remove("is-success");
    document.querySelectorAll("#tpl-builder .tpl-input.is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });
    document.querySelectorAll("#tpl-builder .tpl-field.is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });
  }

  function phoneDigitCount(raw) {
    return String(raw || "").replace(/\D/g, "").length;
  }

  /** Send-lead ring · one equal step per field, top-to-bottom in Lead Builder (6 steps). */
  const TPL_PROGRESS_STEPS = 6;
  const TPL_PROGRESS_KEYS = ["business", "price", "maps", "phone", "preference", "owner"];
  const tplProgressTouched = { preference: false };

  function resetTplProgressTouched() {
    tplProgressTouched.preference = false;
  }

  function isTplProgressFieldFilled(key) {
    switch (key) {
      case "business":
        return !!tplInputValue("tpl-business");
      case "price":
        return readTplPriceChosenFromDom();
      case "maps":
        return !!tplInputValue("tpl-maps");
      case "preference":
        return !!(
          document.getElementById("btn-dl")?.classList.contains("active") ||
          document.getElementById("btn-bk")?.classList.contains("active")
        );
      case "phone":
        return phoneDigitCount(tplInputValue("tpl-phone")) >= 10;
      case "owner":
        return !!tplInputValue("tpl-name");
      default:
        return false;
    }
  }

  function tplProgressRatio(filled) {
    const steps = Math.min(TPL_PROGRESS_STEPS, Math.max(0, Number(filled) || 0));
    return steps / TPL_PROGRESS_STEPS;
  }

  function getTplFormProgress() {
    const filled = TPL_PROGRESS_KEYS.filter(isTplProgressFieldFilled).length;
    const ratio = tplProgressRatio(filled);
    return {
      filled,
      total: TPL_PROGRESS_STEPS,
      ratio,
      percent: Math.round(ratio * 100),
      ready: filled === TPL_PROGRESS_STEPS,
    };
  }

  let tplSendProgressHandled = false;
  let tplProgressAnimFrame = null;
  let tplProgressRevealTimer = null;
  let tplProgressFilledLast = 0;
  let tplProgressPulseTimer = null;

  function pulseTplSendProgress() {
    const wrap = document.getElementById("tpl-send-progress");
    if (!wrap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    wrap.classList.remove("is-pulse");
    void wrap.offsetWidth;
    wrap.classList.add("is-pulse");
    if (tplProgressPulseTimer) clearTimeout(tplProgressPulseTimer);
    tplProgressPulseTimer = setTimeout(() => wrap.classList.remove("is-pulse"), 520);
  }

  function cancelTplProgressReveal() {
    if (tplProgressAnimFrame) {
      cancelAnimationFrame(tplProgressAnimFrame);
      tplProgressAnimFrame = null;
    }
    if (tplProgressRevealTimer) {
      clearTimeout(tplProgressRevealTimer);
      tplProgressRevealTimer = null;
    }
    document.getElementById("tpl-send-progress")?.classList.remove("is-revealing");
  }

  function renderTplSendProgressAt(ratio, opts) {
    const wrap = document.getElementById("tpl-send-progress");
    const sendBtn = document.getElementById("tpl-send-btn");
    if (!wrap || !sendBtn) return;

    const { ready } = getTplFormProgress();
    const sending = sendBtn.dataset.tplSending === "1";
    const clamped = Math.min(1, Math.max(0, Number(ratio) || 0));
    const showReady = ready && !sending && clamped >= 0.999;
    const displayPct = Math.round(clamped * 100);

    wrap.style.setProperty("--tpl-progress", String(clamped));
    wrap.setAttribute("aria-valuenow", String(displayPct));
    const pctEl = document.getElementById("tpl-send-pct");
    if (pctEl) pctEl.textContent = displayPct + "%";
    wrap.classList.toggle("is-idle", clamped <= 0 && !showReady);
    wrap.classList.toggle("is-ready", showReady);
    wrap.classList.toggle("is-incomplete", !showReady);
    wrap.classList.toggle("is-revealing", !!opts?.revealing);
    sendBtn.classList.toggle("is-ready", showReady);
    sendBtn.classList.toggle("is-incomplete", !showReady);
    sendBtn.setAttribute("aria-disabled", showReady ? "false" : "true");
    if (!sending) {
      sendBtn.disabled = !showReady;
    }
  }

  function animateTplProgressBetween(from, to, durationMs, onDone) {
    const start = performance.now();
    const delta = to - from;

    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      renderTplSendProgressAt(from + delta * eased, { revealing: true });
      if (t < 1) {
        tplProgressAnimFrame = requestAnimationFrame(frame);
        return;
      }
      tplProgressAnimFrame = null;
      onDone?.();
    }

    tplProgressAnimFrame = requestAnimationFrame(frame);
  }

  function revealTplSendProgressFromPick() {
    cancelTplProgressReveal();
    const wrap = document.getElementById("tpl-send-progress");
    if (!wrap) {
      updateTplSendProgress();
      return;
    }

    const milestones = [0];
    let filled = 0;
    TPL_PROGRESS_KEYS.forEach((key) => {
      if (isTplProgressFieldFilled(key)) filled += 1;
      milestones.push(tplProgressRatio(filled));
    });
    const points = milestones.filter((value, index, list) => index === 0 || value !== list[index - 1]);
    const target = points[points.length - 1] || 0;

    if (
      points.length <= 2 ||
      target <= tplProgressRatio(1) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      updateTplSendProgress();
      return;
    }

    tplSendProgressHandled = true;
    wrap.classList.add("is-revealing");
    renderTplSendProgressAt(0, { revealing: true });

    let step = 1;
    const runStep = () => {
      if (step >= points.length) {
        wrap.classList.remove("is-revealing");
        updateTplSendProgress();
        return;
      }
      animateTplProgressBetween(points[step - 1], points[step], 420, () => {
        step += 1;
        tplProgressRevealTimer = setTimeout(runStep, step < points.length ? 150 : 0);
      });
    };

    tplProgressRevealTimer = setTimeout(runStep, 420);
  }

  function shakeTplSendProgress() {
    const wrap = document.getElementById("tpl-send-progress");
    if (!wrap) return;
    wrap.classList.remove("is-shake");
    void wrap.offsetWidth;
    wrap.classList.add("is-shake");
    setTimeout(() => wrap.classList.remove("is-shake"), 520);
  }

  function syncTplProgressFilledBaseline() {
    tplProgressFilledLast = getTplFormProgress().filled;
    updateTplSendProgress();
  }

  function tickTplSendProgress() {
    syncTplNotInterestedBtn();
    const { filled, ratio } = getTplFormProgress();
    const wrap = document.getElementById("tpl-send-progress");
    const sendBtn = document.getElementById("tpl-send-btn");
    if (!wrap || !sendBtn) return;

    if (filled > tplProgressFilledLast) {
      const from = tplProgressRatio(tplProgressFilledLast);
      tplProgressFilledLast = filled;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        renderTplSendProgressAt(ratio);
        return;
      }
      cancelTplProgressReveal();
      animateTplProgressBetween(from, ratio, 420, () => {
        renderTplSendProgressAt(ratio);
        pulseTplSendProgress();
      });
      return;
    }

    if (filled < tplProgressFilledLast) {
      const from = tplProgressRatio(tplProgressFilledLast);
      const to = tplProgressRatio(filled);
      tplProgressFilledLast = filled;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        renderTplSendProgressAt(to);
        return;
      }
      cancelTplProgressReveal();
      animateTplProgressBetween(from, to, 420, () => {
        renderTplSendProgressAt(to);
      });
      return;
    }

    tplProgressFilledLast = filled;
    updateTplSendProgress();
  }

  function updateTplSendProgress() {
    cancelTplProgressReveal();
    const sendBtn = document.getElementById("tpl-send-btn");
    if (!document.getElementById("tpl-send-progress") || !sendBtn) return;

    const { ratio, ready } = getTplFormProgress();
    const sending = sendBtn.dataset.tplSending === "1";
    renderTplSendProgressAt(sending && ready ? 1 : ratio);
  }

  function syncTplSendProgressAfterPick(opts) {
    opts = opts || {};
    tplSendProgressHandled = true;
    const filled = TPL_PROGRESS_KEYS.filter(isTplProgressFieldFilled).length;
    if (opts.reveal && filled >= 2) revealTplSendProgressFromPick();
    else updateTplSendProgress();
  }

  function validateTplForm() {
    clearTplValidation();
    const missing = [];
    let mapsLinkInvalid = false;

    TPL_REQUIRED_FIELDS.forEach((field) => {
      const input = document.getElementById(field.id);
      const row = input?.closest(".tpl-field");
      const value = tplInputValue(field.id);
      let invalid = !value;

      if (!invalid && field.minDigits && phoneDigitCount(value) < field.minDigits) {
        invalid = true;
      }

      if (!invalid && field.isUrl && !isTplHttpUrl(value)) {
        invalid = true;
        if (field.id === "tpl-maps") mapsLinkInvalid = true;
      }

      if (invalid) {
        missing.push(field);
        input?.classList.add("is-invalid");
        row?.classList.add("is-invalid");
      }
    });

    if (missing.length) {
      if (mapsLinkInvalid) {
        showTplValidationMsg("Google Maps must be a valid link (include https:// or a domain like maps.google.com).");
      } else {
        const names = missing.map((f) => f.label).join(", ");
        showTplValidationMsg("Fill out the Lead Builder · missing: " + names + ".");
      }
      shakeTplSendProgress();
      const first = document.querySelector("#tpl-builder .tpl-input.is-invalid");
      first?.focus();
      first?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return false;
    }

    if (!isTplProgressFieldFilled("price")) {
      const priceRow = document.getElementById("btn-p500")?.closest(".tpl-field");
      priceRow?.classList.add("is-invalid");
      showTplValidationMsg("Fill out the Lead Builder · missing: Price.");
      shakeTplSendProgress();
      priceRow?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return false;
    }

    if (!isTplProgressFieldFilled("preference")) {
      const prefRow = document.getElementById("btn-dl")?.closest(".tpl-field");
      prefRow?.classList.add("is-invalid");
      showTplValidationMsg("Fill out the Lead Builder · missing: Preference.");
      shakeTplSendProgress();
      prefRow?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return false;
    }

    return true;
  }

  function tplErrorMessage(err) {
    if (!err) return "Could not send. Try again.";
    if (typeof err === "string") return err;
    return String(err.message || err.details || err.hint || "Could not send. Try again.");
  }

  function hideTplLeadSuccessScreen() {
    const screen = document.getElementById("tpl-sent-screen");
    if (!screen) return;
    screen.classList.remove("is-visible");
    document.documentElement.classList.remove("tpl-sent-screen-open");
    screen.hidden = true;
  }

  function showTplLeadSuccessScreen() {
    const screen = document.getElementById("tpl-sent-screen");
    if (!screen) return;

    screen.hidden = false;
    screen.classList.remove("is-visible");
    void screen.offsetWidth;
    screen.classList.add("is-visible");
    document.documentElement.classList.add("tpl-sent-screen-open");

    const leaveBtn = screen.querySelector(".tpl-sent-screen-leave");
    if (leaveBtn && !leaveBtn.dataset.bound) {
      leaveBtn.dataset.bound = "1";
      leaveBtn.addEventListener("click", () => {
        hideTplLeadSuccessScreen();
      });
    }
  }

  function showTplSentTag() {
    showTplLeadSuccessScreen();
  }

  function setTplSendBtnLabel(sendBtn, text) {
    if (!sendBtn) return;
    const label = sendBtn.querySelector(".tpl-send-label");
    if (label) label.textContent = text;
    else sendBtn.textContent = text;
  }

  async function sendTpl(btn) {
    closeTplInfoPanels();
    const sendBtn = btn || document.getElementById("tpl-send-btn");
    const defaultLabel = "Send lead";

    clearTplValidation();

    if (!getTplFormProgress().ready) {
      validateTplForm();
      return;
    }

    if (!validateTplForm()) {
      return;
    }

    if (!window.LeadBuilderSubmit?.canSubmit?.()) {
      showTplValidationMsg("Lead Builder needs Supabase · run supabase-new-clients-setup.sql in your project.");
      if (sendBtn) {
        preserveScroll(() => {
          setTplSendBtnLabel(sendBtn, "Not configured");
        });
        setTimeout(() => {
          preserveScroll(() => {
            setTplSendBtnLabel(sendBtn, defaultLabel);
          });
        }, 2500);
      }
      return;
    }

    if (sendBtn) {
      sendBtn.dataset.tplSending = "1";
      sendBtn.disabled = true;
      updateTplSendProgress();
      preserveScroll(() => {
        setTplSendBtnLabel(sendBtn, "Sending…");
      });
    }

    try {
      const payload = buildLeadPayload();
      await window.LeadBuilderSubmit.submitLead(payload);
      const leadId = String(payload.lead_id || "").trim();
      const businessName = String(payload.business_name || "").trim();
      if (leadId) {
        window.PendingLeadBuilder?.save?.(leadId, {
          businessName,
          price: payload.price,
          phone: payload.phone,
          owner_name: payload.owner_name,
          preference: payload.preference,
        });
        await window.LeadSync?.markLeadPending?.(leadId, businessName);
        window.DashboardPending?.stagePendingLead?.({
          id: leadId,
          name: businessName || "Business",
        });
      }
      persistTemplateBuilder();
      clearTplValidation();
      showTplSentTag();
      clearTpl();
      if (sendBtn) {
        preserveScroll(() => {
          setTplSendBtnLabel(sendBtn, defaultLabel);
        });
      }
    } catch (err) {
      console.warn(err);
      showTplValidationMsg(tplErrorMessage(err));
      if (sendBtn) {
        preserveScroll(() => {
          setTplSendBtnLabel(sendBtn, "Send failed");
        });
        setTimeout(() => {
          preserveScroll(() => {
            setTplSendBtnLabel(sendBtn, defaultLabel);
          });
        }, 2000);
      }
    }

    if (sendBtn) {
      delete sendBtn.dataset.tplSending;
      sendBtn.disabled = false;
    }
    updateTplSendProgress();
  }

  function clearTpl(options) {
    closeTplInfoPanels();
    if (!options?.keepFeedback) clearTplValidation();
    clearStashedLeadPick();
    ["tpl-business", "tpl-name", "tpl-phone", "tpl-maps"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    clearTplPrice(true, true);
    clearTplMode(true, true);
    resetTplProgressTouched();
    saveTemplateBuilder({
      mode: "",
      price: "",
      priceChosen: false,
      preferenceChosen: false,
      businessName: "",
      name: "",
      phone: "",
      maps: "",
      leadId: "",
    });
    syncTplCallBtn();
    initTplAutosaveTag();
    syncTplProgressFilledBaseline();
    syncTplNotInterestedBtn();
    void window.RepStorage?.flushSync?.();
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
    if (btn) {
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
    syncTplNotInterestedBtn();
  }

  function bindTemplateBuilderAutosave() {
    ["tpl-business", "tpl-name", "tpl-phone", "tpl-maps"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", persistTemplateBuilder);
      el?.addEventListener("input", tickTplSendProgress);
      el?.addEventListener("change", tickTplSendProgress);
      el?.addEventListener("input", () => {
        el.classList.remove("is-invalid");
        el.closest(".tpl-field")?.classList.remove("is-invalid");
        if (!document.querySelector("#tpl-builder .tpl-input.is-invalid")) {
          showTplValidationMsg("");
        }
      });
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

  function bindTemplateBuilderActions(force) {
    const sendBtn = document.getElementById("tpl-send-btn");
    const clearBtn = document.getElementById("tpl-clear-btn");
    const niBtn = document.getElementById("tpl-not-interested-btn");
    if (sendBtn && (force || !sendBtn.dataset.bound)) {
      sendBtn.dataset.bound = "1";
      sendBtn.onclick = (e) => {
        e.preventDefault();
        sendTpl(sendBtn);
      };
    }
    if (clearBtn && (force || !clearBtn.dataset.bound)) {
      clearBtn.dataset.bound = "1";
      clearBtn.onclick = (e) => {
        e.preventDefault();
        void handleTplClearClick(clearBtn);
      };
    }
    if (niBtn && (force || !niBtn.dataset.bound)) {
      niBtn.dataset.bound = "1";
      niBtn.onclick = (e) => {
        e.preventDefault();
        if (niBtn.disabled) return;
        void markTplNotInterested();
      };
    }
  }

  function initTplHelpGuide() {
    const card = document.getElementById("tpl-help-card");
    const toggle = document.getElementById("tpl-help-toggle");
    const panel = document.getElementById("tpl-help-panel");
    const guide = document.getElementById("tpl-help-guide");
    if (!card || !toggle || !panel || toggle.dataset.bound === "1") return;
    toggle.dataset.bound = "1";

    const setOpen = (open) => {
      card.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      const action = toggle.querySelector(".tpl-help-toggle-action");
      if (action) action.textContent = open ? "Hide guide" : "Show guide";
      if (open) {
        closeTplInfoPanels();
        if (window.SiteIcons) window.SiteIcons.initIcons(guide);
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };

    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      setOpen(!card.classList.contains("is-open"));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && card.classList.contains("is-open")) {
        setOpen(false);
      }
    });
  }

  function initTemplateBuilderPage() {
    if (!document.getElementById("tpl-builder")) return;
    tplSendProgressHandled = false;
    initTplInfo();
    initTplHelpGuide();
    bindTemplateBuilderAutosave();
    applyTemplateBuilder();
    initLeadPickFromFinder();
    if (!readStashedLeadPick()) initTplAutosaveTag();
    if (!tplSendProgressHandled) syncTplProgressFilledBaseline();
    syncTplNotInterestedBtn();
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
  window.sendTpl = sendTpl;
  window.clearTpl = clearTpl;
  window.markTplNotInterested = markTplNotInterested;
  window.handleTplClearClick = handleTplClearClick;

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
      leadId: String(lead?.id || "").trim(),
      name: "",
      businessName: String(lead?.name || "").trim(),
      phone: lead?.phone || "",
      mapsUrl: lead?.mapsUrl || lead?.maps_url || "",
      price: "$500",
    };
  }

  function stashLeadPick(pick) {
    if (!pick) return;
    try {
      sessionStorage.setItem("lpc_lead_pick_v1", JSON.stringify(pick));
    } catch (e) {
      console.warn("Could not stash lead pick for Lead Builder", e);
    }
  }

  function readStashedLeadPick() {
    try {
      const raw = sessionStorage.getItem("lpc_lead_pick_v1");
      if (!raw) return null;
      const pick = JSON.parse(raw);
      return pick && typeof pick === "object" ? pick : null;
    } catch (e) {
      return null;
    }
  }

  function clearStashedLeadPick() {
    try {
      sessionStorage.removeItem("lpc_lead_pick_v1");
    } catch (e) {
      /* ignore */
    }
  }

  function applyLeadPick(pick) {
    if (!pick || !document.getElementById("tpl-builder")) return false;
    if (pick.mode) setTplMode(pick.mode, true, true);
    if (pick.price) setTplPrice(pick.price, true, true);
    const mapsVal = String(pick.mapsUrl || pick.maps || "").trim();
    const businessEl = document.getElementById("tpl-business");
    const nameEl = document.getElementById("tpl-name");
    const phoneEl = document.getElementById("tpl-phone");
    const mapsEl = document.getElementById("tpl-maps");
    const businessVal = String(pick.businessName || "").trim();
    const nameVal = String(pick.name || "").trim();
    if (businessEl) businessEl.value = businessVal;
    if (nameEl) nameEl.value = nameVal;
    if (phoneEl) {
      phoneEl.value = pick.phone
        ? window.LeadDisplay?.formatPhoneForLeadBuilder?.(pick.phone) || pick.phone
        : "";
    }
    if (mapsEl) mapsEl.value = mapsVal;
    persistTemplateBuilder();
    syncTplCallBtn();
    initTplAutosaveTag();
    syncTplSendProgressAfterPick({ reveal: true });
    syncTplNotInterestedBtn();
    return !!(businessVal || nameVal || pick.phone || mapsVal);
  }

  function mergeLeadPickIntoStorage(pick) {
    if (!pick) return;
    const s = loadTemplateBuilder();
    const mapsVal = String(pick.mapsUrl || pick.maps || "").trim();
    saveTemplateBuilder({
      mode: pick.mode || s.mode || tplMode || "",
      price: pick.price || (s.priceChosen ? s.price : "") || "",
      priceChosen: !!(pick.price || s.priceChosen),
      preferenceChosen: !!(pick.mode || s.preferenceChosen),
      businessName:
        "businessName" in pick
          ? String(pick.businessName || "").trim()
          : String(s.businessName || "").trim(),
      name: "name" in pick ? String(pick.name || "").trim() : String(s.name || "").trim(),
      phone: pick.phone || s.phone || "",
      maps: mapsVal || s.maps || "",
      leadId: String(pick.leadId || pick.lead_id || s.leadId || "").trim(),
    });
  }

  async function forwardLeadToBuilder(lead) {
    if (!lead) return false;
    const leadId = String(lead.id || "").trim();
    const businessName = String(lead.name || lead.businessName || "").trim() || "Business";
    if (leadId && window.LeadSync?.markLeadBuilding) {
      try {
        await window.LeadSync.markLeadBuilding(leadId, businessName);
      } catch (e) {
        console.warn(e);
        showTplToast(
          e?.message && String(e.message).trim()
            ? e.message
            : "This lead is not available right now.",
          { kind: "error" }
        );
        if (!document.getElementById("tpl-builder")) {
          alert(
            e?.message && String(e.message).trim()
              ? e.message
              : "This lead is not available right now."
          );
        }
        return false;
      }
    }
    const pick = buildLeadPickFromLead(lead);
    stashLeadPick(pick);
    mergeLeadPickIntoStorage(pick);
    if (document.getElementById("tpl-builder")) {
      if (applyLeadPick(pick)) clearStashedLeadPick();
      return true;
    }
    const qs = lead.id ? "?lead=" + encodeURIComponent(String(lead.id)) : "";
    window.location.href = "template.html" + qs;
    return true;
  }

  function initLeadPickFromFinder() {
    const pick = readStashedLeadPick();
    if (pick) {
      mergeLeadPickIntoStorage(pick);
      if (applyLeadPick(pick)) clearStashedLeadPick();
      return;
    }
    const urlLeadId = new URLSearchParams(window.location.search).get("lead") || "";
    const s = loadTemplateBuilder();
    if (urlLeadId && !s.leadId) {
      saveTemplateBuilder({ ...s, leadId: urlLeadId });
    }
    if (s.phone || s.maps || s.name || s.businessName) {
      applyLeadPick({
        name: s.name,
        phone: s.phone,
        mapsUrl: s.maps,
        price: s.price,
        mode: s.mode,
        businessName: s.businessName,
      });
    }
  }

  function reapplyLeadPickFromFinder() {
    const pick = readStashedLeadPick();
    if (pick) {
      applyLeadPick(pick);
      return;
    }
    applyTemplateBuilder();
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
        ") · after " +
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
    window.OwnerContact?.init?.();
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
    applyPageCategoryLabel();
    ensureSignOutFloatScript();
  }

  function isSiteUnlocked() {
    if (window.SiteLock?.isAuthenticated) return window.SiteLock.isAuthenticated();
    return (
      sessionStorage.getItem("lpc_site_unlock") === "1" && !!window.RepSession?.get?.()
    );
  }

  function dispatchSiteAppReady() {
    try {
      window.dispatchEvent(new CustomEvent("site-app-ready"));
    } catch (_) {}
  }

  function bootApp() {
    if (document.body.dataset.appBooted === "1") {
      mountPage();
      if ((document.body.dataset.page || "home") === "leads") {
        initDashboardToggleCards();
      }
      initLeadFinderNavCount();
      dispatchSiteAppReady();
      return;
    }
    document.body.dataset.appBooted = "1";
    mountPage();
    dispatchSiteAppReady();

    const page = document.body.dataset.page || "home";
    if (page === "leads") {
      initDashboardToggleCards();
    }
    if (page === "settings") {
      window.SiteImagePreload?.warmDocumentImages?.(document.body);
      if (window.SiteIcons) window.SiteIcons.initIcons();
      initLeadFinderNavCount();
      return;
    }

    touchDailyToolProgress();

    initEverydayTasks();
    initOnboardingChecklist();
    renderOnboardingPath();
    initSalesTracker();
    window.DashboardPending?.init?.();
    renderStepFooter();
    initAccordions();
    initCallScripts();
    initOutreachEditor();
    initVideo();
    initConfigLinks();
    bindTelegramNavLeave(document.getElementById("page-body"));
    initEarningsProjection();
    initOwnerPage();
    window.SiteImagePreload?.warmDocumentImages?.(document.body);
    if (window.SiteIcons) window.SiteIcons.initIcons();
    scrollPageHash();

    if (document.getElementById("tpl-builder")) {
      initTemplateBuilderPage();
    }

    initLeadFinderNavCount();
  }

  function pageNeedsSettingsRefresh() {
    const page = document.body.dataset.page || "home";
    return (
      page === "home" ||
      page === "scripts" ||
      page === "faq" ||
      !!document.getElementById("salesList") ||
      !!document.getElementById("deals-list") ||
      !!document.getElementById("onboarding-path") ||
      !!document.getElementById("course-module-list") ||
      !!document.getElementById("course-module-root") ||
      !!document.getElementById("call-scripts-root") ||
      !!document.getElementById("scripts-editor") ||
      !!document.getElementById("outreach-editor")
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
    window.appLaunchStarted = true;

    if (window.RepStorage?.init) {
      window.RepStorage.init().catch((e) => console.warn("Rep settings init failed", e));
    }

    try {
      bootApp();
    } catch (e) {
      console.error("Dashboard boot failed", e);
    }
  }

  function scheduleAppLaunch() {
    if (bootScheduled) return;
    bootScheduled = true;
    if (document.body.dataset.public === "1") {
      startWhenReady();
      return;
    }
    if (isSiteUnlocked()) {
      startWhenReady();
      return;
    }
    requestAnimationFrame(() => {
      if (!appLaunchStarted && isSiteUnlocked()) startWhenReady();
    });
  }

  if (document.readyState !== "loading") {
    initDashboardIncomeUiEarly();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initDashboardIncomeUiEarly();
    scheduleAppLaunch();
  });

  window.addEventListener("site-unlocked", () => {
    initDashboardIncomeUiEarly();
    ensureSignOutFloatScript();
    if (!appLaunchStarted) startWhenReady();
    else if (document.body.dataset.appBooted === "1") {
      initAccordions();
      if (document.getElementById("scripts-editor")) initCallScripts();
      if (document.getElementById("outreach-editor")) initOutreachEditor();
      initLeadFinderNavCount();
    }
    window.DashboardPending?.refresh?.();
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
    if (document.getElementById("tpl-builder")) {
      bindTemplateBuilderActions(true);
      reapplyLeadPickFromFinder();
    }
    if (document.body.dataset.appBooted !== "1" || settingsUiSynced) return;
    settingsUiSynced = true;
    refreshAfterSettingsSync();
  });

  window.addEventListener("rep-settings-pulled", () => {
    if (window.UserPrefs && window.SiteTheme) {
      const prefs = window.UserPrefs.get();
      window.SiteTheme.apply(prefs.theme || "light", { persistDevice: true });
    }
    if (document.getElementById("tpl-builder")) {
      bindTemplateBuilderActions(true);
      reapplyLeadPickFromFinder();
    }
    reloadSalesTracker?.();
  });

  window.addEventListener("pageshow", (e) => {
    if (document.getElementById("tpl-builder")) {
      bindTemplateBuilderActions(true);
    }
    if (e.persisted) {
      initAccordions();
      initNavGroups(document.body.dataset.page || "home");
    }
  });

  window.addEventListener("onboarding-progress-changed", () => {
    if (document.body.dataset.appBooted !== "1") return;
    renderOnboardingPath();
    initOnboardingChecklist();
    refreshCourseNavInSidebar();
  });

})();
