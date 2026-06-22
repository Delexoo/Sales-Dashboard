(function (global) {
  let allLeads = [];
  let meta = {};
  let statusMap = {};
  let visible = [];
  /** @type {'default' | 'complete' | 'pending' | 'not-interested' | 'removed' | 'saved' | 'pinned'} */
  let listView = "default";

  const WORKFLOW_VIEWS = [
    { value: "default", label: "Active" },
    { value: "saved", label: "Quick Save" },
    { value: "pinned", label: "Pinned" },
    { value: "complete", label: "Completed" },
    { value: "not-interested", label: "Not interested" },
    { value: "pending", label: "Pending" },
    { value: "removed", label: "Removed" },
  ];
  const INITIAL_RENDER_LIMIT = 24;
  const RENDER_INCREMENT = 24;
  const PREFS_KEY = "lpc_lead_finder_prefs_v1";
  const SAVED_KEY = "lpc_lead_saved_v1";
  const PINNED_KEY = "lpc_lead_pinned_v1";
  let savedIds = new Set();
  /** @type {string[]} Most recently pinned first */
  let pinnedOrder = [];
  let pinnedIds = new Set();
  const DEFAULT_PREFS = {
    websiteFilter: "noweb",
    listView: "default",
    priorityCategories: [],
    reviewsFilter: "all",
  };
  const WEBSITE_FILTERS = ["web", "noweb", "all"];
  const REVIEWS_FILTERS = ["all", "1", "2", "3", "4", "5"];
  const BASIC_CATEGORY_GROUPS = [
    { label: "Kids", pattern: /child|daycare|day care|preschool|school|tutor|academy/i },
    { label: "Health", pattern: /dental|dentist|doctor|clinic|medical|chiropr|therapy|wellness|care/i },
    { label: "Home", pattern: /home|roof|plumb|electric|hvac|landscap|lawn|clean|paint|floor|repair|contract/i },
    { label: "Auto", pattern: /auto|car|truck|tire|mechanic|detail|body shop|collision/i },
    { label: "Food", pattern: /restaurant|cafe|coffee|bakery|food|pizza|bar|grill|deli/i },
    { label: "Pets", pattern: /pet|dog|cat|vet|veterinary|groom/i },
    { label: "Beauty", pattern: /salon|spa|barber|nail|beauty|hair|massage/i },
  ];
  /** @type {Set<string>} */
  let priorityCategories = new Set();
  let reviewsFilter = "all";
  /** @type {{ setWorkflow: (id: string, workflow: string, name?: string) => Promise<void> } | null} */
  let syncApi = null;
  let syncInitPromise = null;
  let menuDocBound = false;
  /** Ignore workflow <select> change while syncing UI to listView (avoids jumping views). */
  let viewSelectSyncing = false;
  let renderLimit = INITIAL_RENDER_LIMIT;
  let lastViewFilterSig = "";
  let loadMoreObserver = null;
  let loadMoreScrollFallbackBound = false;
  let autoLoadQueued = false;

  const $ = (id) => document.getElementById(id);

  function syncWorkflowSelectFromListView() {
    const sel = $("lf-workflow-view");
    if (!sel) return;
    viewSelectSyncing = true;
    try {
      if (sel.value !== listView) sel.value = listView;
    } finally {
      viewSelectSyncing = false;
    }
  }

  function setListView(view, opts) {
    opts = opts || {};
    const v = WORKFLOW_VIEWS.some((w) => w.value === view) ? view : "default";
    listView = v;
    syncWorkflowSelectFromListView();
    if (opts.save) savePrefs();
    if (opts.filter !== false) applyFilters();
  }

  function repScopedKey(base) {
    const id = global.RepSession?.get?.()?.id;
    return id ? "lpc_rep_" + id + "_" + base : base;
  }

  function loadPrefs() {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(PREFS_KEY)
        : localStorage.getItem(repScopedKey(PREFS_KEY));
      if (!raw) return { ...DEFAULT_PREFS };
      const p = JSON.parse(raw);
      return {
        websiteFilter: WEBSITE_FILTERS.includes(p.websiteFilter)
          ? p.websiteFilter
          : DEFAULT_PREFS.websiteFilter,
        listView: WORKFLOW_VIEWS.some((w) => w.value === p.listView)
          ? p.listView
          : DEFAULT_PREFS.listView,
        priorityCategories: Array.isArray(p.priorityCategories)
          ? p.priorityCategories.map((c) => String(c || "").trim()).filter(Boolean)
          : DEFAULT_PREFS.priorityCategories,
        reviewsFilter: REVIEWS_FILTERS.includes(p.reviewsFilter)
          ? p.reviewsFilter
          : DEFAULT_PREFS.reviewsFilter,
      };
    } catch (e) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs() {
    const prefs = {
      websiteFilter: getWebsiteFilter(),
      listView,
      priorityCategories: Array.from(priorityCategories),
      reviewsFilter: getReviewsFilter(),
    };
    const json = JSON.stringify(prefs);
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(PREFS_KEY, json);
    else localStorage.setItem(repScopedKey(PREFS_KEY), json);
  }

  function applyPrefsToUi() {
    const prefs = loadPrefs();
    listView = prefs.listView;
    priorityCategories = new Set(prefs.priorityCategories);
    reviewsFilter = prefs.reviewsFilter;
    document
      .querySelectorAll("#lf-website-filter .lf-toggle-btn[data-filter]")
      .forEach((b) => {
        const on = b.dataset.filter === prefs.websiteFilter;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    document.querySelectorAll(".lf-reviews-toggle .lf-toggle-btn").forEach((b) => {
      const on = b.dataset.reviewsFilter === prefs.reviewsFilter;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    syncWorkflowSelectFromListView();
  }

  function getLeadCategory(lead) {
    const d = display();
    if (d.resolveCategory) return d.resolveCategory(lead);
    return String(lead.categoryGroup || lead.category || "Other").trim() || "Other";
  }

  function getBasicCategory(lead) {
    const rawCategory = getLeadCategory(lead);
    const group = BASIC_CATEGORY_GROUPS.find((item) => item.pattern.test(rawCategory));
    return group ? group.label : "Other";
  }

  function getReviewCount(lead) {
    const n = Number(lead?.reviewCount);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  }

  function matchesReviewsFilter(lead, filter) {
    if (filter === "all") return true;
    const count = getReviewCount(lead);
    const n = parseInt(String(filter), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return count === n;
    return true;
  }

  function getReviewsFilter() {
    const active = document.querySelector(
      ".lf-reviews-toggle .lf-toggle-btn.active"
    );
    const v = active?.dataset.reviewsFilter || reviewsFilter || "all";
    return REVIEWS_FILTERS.includes(v) ? v : "all";
  }

  function setReviewsFilterUi(value) {
    reviewsFilter = REVIEWS_FILTERS.includes(value) ? value : "all";
    document.querySelectorAll(".lf-reviews-toggle .lf-toggle-btn").forEach((b) => {
      const on = b.dataset.reviewsFilter === reviewsFilter;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function togglePriorityCategory(category) {
    const cat = String(category || "").trim();
    if (!cat) return;
    if (priorityCategories.has(cat)) priorityCategories.delete(cat);
    else priorityCategories.add(cat);
    savePrefs();
    applyFilters();
  }

  function scrollToLeadGrid() {
    const grid = $("lf-grid");
    if (!grid) return;
    requestAnimationFrame(() => {
      grid.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function collectCategoryCounts(leads) {
    const counts = new Map();
    leads.forEach((lead) => {
      const cat = getBasicCategory(lead);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => {
      const orderA = BASIC_CATEGORY_GROUPS.findIndex((item) => item.label === a[0]);
      const orderB = BASIC_CATEGORY_GROUPS.findIndex((item) => item.label === b[0]);
      const rankA = orderA === -1 ? BASIC_CATEGORY_GROUPS.length : orderA;
      const rankB = orderB === -1 ? BASIC_CATEGORY_GROUPS.length : orderB;
      return rankA - rankB || a[0].localeCompare(b[0]);
    });
  }

  function renderCategoryFilters(browsableLeads) {
    const extra = $("lf-toolbar-extra");
    const wrap = $("lf-category-chips");
    const available = $("lf-category-available");
    if (!extra || !wrap) return;

    const pairs = collectCategoryCounts(browsableLeads);
    const totalAvailable = pairs.reduce((sum, [, count]) => sum + count, 0);
    const enabledAvailable = pairs.reduce((sum, [cat, count]) => {
      return priorityCategories.has(cat) ? sum + count : sum;
    }, 0);
    const availableCount = priorityCategories.size ? enabledAvailable : totalAvailable;
    extra.hidden = !leadsPageReady || pairs.length === 0;
    if (available) {
      available.textContent = pairs.length ? "(" + availableCount + " available)" : "";
    }

    if (!pairs.length) {
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = pairs
      .map(([cat]) => {
        const active = priorityCategories.has(cat);
        return (
          '<button type="button" class="leads-chip' +
          (active ? " is-active" : "") +
          '" data-category="' +
          escapeHtml(cat) +
          '" aria-pressed="' +
          (active ? "true" : "false") +
          '" title="' +
          escapeHtml(
            active
              ? "Show all lead categories"
              : "Show " + cat + " leads"
          ) +
          '">' +
          escapeHtml(cat) +
          "</button>"
        );
      })
      .join("");
  }

  function filtersSig() {
    return (
      getWebsiteFilter() +
      "|" +
      getReviewsFilter() +
      "|" +
      Array.from(priorityCategories).sort().join(",")
    );
  }

  function resetRenderLimit() {
    renderLimit = INITIAL_RENDER_LIMIT;
  }

  function renderedVisibleCount() {
    return Math.min(visible.length, renderLimit);
  }

  function visibleRenderSlice() {
    return visible.slice(0, renderedVisibleCount());
  }

  function hasMoreVisibleLeads() {
    return renderedVisibleCount() < visible.length;
  }

  function loadNextVisibleBatch() {
    if (!hasMoreVisibleLeads()) return false;
    renderLimit = Math.min(visible.length, renderLimit + RENDER_INCREMENT);
    renderGrid();
    return true;
  }

  function queueLoadNextVisibleBatch() {
    if (autoLoadQueued) return;
    autoLoadQueued = true;
    const schedule = global.requestAnimationFrame
      ? global.requestAnimationFrame.bind(global)
      : global.setTimeout.bind(global);
    schedule(() => {
      autoLoadQueued = false;
      loadNextVisibleBatch();
    });
  }

  function handleLoadMoreScrollFallback() {
    const sentinel = document.querySelector("[data-lf-load-more-sentinel]");
    if (!sentinel) return;
    const viewportHeight = global.innerHeight || document.documentElement.clientHeight || 0;
    if (sentinel.getBoundingClientRect().top <= viewportHeight + 420) {
      queueLoadNextVisibleBatch();
    }
  }

  function bindLoadMoreScrollFallback() {
    if (loadMoreScrollFallbackBound) return;
    loadMoreScrollFallbackBound = true;
    global.addEventListener("scroll", handleLoadMoreScrollFallback, { passive: true });
    global.addEventListener("resize", handleLoadMoreScrollFallback, { passive: true });
  }

  function normalizeLeadId(id) {
    return String(id ?? "").trim();
  }

  function loadIdSet(key) {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(key)
        : localStorage.getItem(repScopedKey(key));
      const o = JSON.parse(raw || "{}");
      return new Set(
        Object.keys(o)
          .filter((id) => o[id])
          .map(normalizeLeadId)
          .filter(Boolean)
      );
    } catch (e) {
      return new Set();
    }
  }

  function saveIdSet(key, set) {
    const o = {};
    set.forEach((id) => {
      const sid = normalizeLeadId(id);
      if (sid) o[sid] = true;
    });
    const json = JSON.stringify(o);
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(key, json);
    else localStorage.setItem(repScopedKey(key), json);
  }

  function loadPinnedOrder() {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(PINNED_KEY)
        : localStorage.getItem(repScopedKey(PINNED_KEY));
      const parsed = JSON.parse(raw || "null");
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeLeadId).filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        return Object.keys(parsed)
          .filter((id) => parsed[id])
          .map(normalizeLeadId)
          .filter(Boolean);
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function savePinnedOrder() {
    const json = JSON.stringify(pinnedOrder);
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(PINNED_KEY, json);
    else localStorage.setItem(repScopedKey(PINNED_KEY), json);
  }

  function syncPinnedLookup() {
    pinnedIds = new Set(pinnedOrder.map(normalizeLeadId));
  }

  function pinLeadToTop(leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) return;
    pinnedOrder = pinnedOrder.filter((x) => normalizeLeadId(x) !== id);
    pinnedOrder.unshift(id);
    syncPinnedLookup();
    savePinnedOrder();
  }

  function unpinLead(leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) return;
    pinnedOrder = pinnedOrder.filter((x) => x !== id);
    syncPinnedLookup();
    savePinnedOrder();
  }

  function reloadPersonalMarks() {
    savedIds = loadIdSet(SAVED_KEY);
    pinnedOrder = loadPinnedOrder();
    try {
      const pendingPin = sessionStorage.getItem("lpc_build_lead_pin_v1");
      if (pendingPin) {
        const pid = normalizeLeadId(pendingPin);
        if (pid) pinLeadToTop(pid);
        sessionStorage.removeItem("lpc_build_lead_pin_v1");
      }
    } catch (e) {
      /* ignore */
    }
    syncPinnedLookup();
  }

  function syncPinUiForLeadId(leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) return;
    document.querySelectorAll('[data-lead-pin="' + CSS.escape(id) + '"]').forEach((btn) => {
      syncPinButtonUi(btn, isPinnedLeadId(id));
    });
  }

  function isSaved(lead) {
    return savedIds.has(normalizeLeadId(lead.id));
  }

  function isPinnedLeadId(leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) return false;
    return pinnedOrder.some((p) => normalizeLeadId(p) === id);
  }

  function isPinned(lead) {
    return isPinnedLeadId(lead?.id);
  }

  function syncPinButtonUi(btn, pinned) {
    if (!btn) return;
    btn.classList.toggle("is-on", pinned);
    btn.setAttribute("aria-pressed", pinned ? "true" : "false");
    btn.setAttribute("aria-label", pinned ? "Unpin lead" : "Pin lead");
    btn.title = pinned ? "Unpin" : "Pin";
    const card = btn.closest(".lead-card");
    if (card) card.classList.toggle("lead-card--pinned", pinned);
  }

  function syncSaveButtonUi(btn, saved) {
    if (!btn) return;
    btn.classList.toggle("is-on", saved);
    btn.setAttribute("aria-pressed", saved ? "true" : "false");
    btn.setAttribute("aria-label", saved ? "Remove from Quick Save" : "Quick Save");
    btn.title = saved ? "Unlike" : "Quick Save";
    const card = btn.closest(".lead-card");
    if (card) card.classList.toggle("lead-card--saved", saved);
  }

  function invalidateGridRender() {
    const g = $("lf-grid");
    if (g) delete g.dataset.renderSig;
  }

  function toggleSaved(leadId) {
    const id = normalizeLeadId(leadId);
    if (savedIds.has(id)) savedIds.delete(id);
    else savedIds.add(id);
    saveIdSet(SAVED_KEY, savedIds);
  }

  function switchToActiveView() {
    if (listView === "default") return;
    setListView("default", { save: true, filter: false });
  }

  function togglePinned(leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) return false;
    const wasPinned = isPinnedLeadId(id);
    if (wasPinned) {
      unpinLead(id);
    } else {
      pinLeadToTop(id);
      switchToActiveView();
    }
    allLeads = sortLeadsPinnedFirst(allLeads);
    return !wasPinned;
  }

  async function pinLeadForBuilder(leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) return;
    pinLeadToTop(id);
    allLeads = sortLeadsPinnedFirst(allLeads);
    syncPinUiForLeadId(id);
    try {
      sessionStorage.setItem("lpc_build_lead_pin_v1", id);
    } catch (e) {
      /* ignore */
    }
    if (global.RepStorage?.flushSync) {
      try {
        await global.RepStorage.flushSync();
      } catch (e) {
        console.warn("Could not sync pin to cloud", e);
      }
    }
  }

  async function handleBuildLeadClick(leadId) {
    const id = normalizeLeadId(leadId);
    const lead = allLeads.find((l) => normalizeLeadId(l.id) === id);
    if (!id || !lead || !canEditLeadStatus(lead)) return;

    try {
      await pinLeadForBuilder(id);
      await applyLeadWorkflow(id, "pending", { restoreView: false });
      setListView("pending", { save: true });
      if (typeof global.forwardLeadToBuilder === "function") {
        global.forwardLeadToBuilder(lead);
      }
      invalidateGridRender();
      applyFilters();
    } catch (err) {
      console.warn("Build Lead: pin/pending sync failed", err);
    }
  }

  function getLeadWorkflow(lead) {
    const s = statusEntry(lead.id);
    let w = s?.workflow || (s?.called ? "complete" : "");
    if (w === "flagged") w = "";
    if (w) return w;
    if (window.LeadSync?.isConfigured?.()) return "";
    return lead.called ? "complete" : "";
  }

  function statusEntry(leadId) {
    if (!leadId) return null;
    const direct = statusMap[leadId] || statusMap[String(leadId)];
    if (direct) return direct;
    const target = normalizeLeadId(leadId);
    const key = Object.keys(statusMap).find((k) => normalizeLeadId(k) === target);
    return key ? statusMap[key] : null;
  }

  function isRemoved(lead) {
    return getLeadWorkflow(lead) === "removed";
  }

  function isCompleted(lead) {
    return getLeadWorkflow(lead) === "complete";
  }

  function getRepName() {
    return String(global.RepSession?.getName?.() || "").trim();
  }

  function getRepId() {
    return String(
      global.RepSession?.getId?.() || global.RepSession?.get?.()?.id || ""
    ).trim();
  }

  function isOwnerMatch(ownerId, ownerName) {
    const meId = getRepId().toLowerCase();
    const meName = getRepName().toLowerCase();
    const oid = String(ownerId || "").trim().toLowerCase();
    const on = String(ownerName || "").trim().toLowerCase();
    if (meId && oid && meId === oid) return true;
    if (meName && on && meName === on) return true;
    if (meId && on && meId === on) return true;
    if (meName && oid && meName === oid) return true;
    return false;
  }

  function clearStatusEntries(map, leadId) {
    const target = normalizeLeadId(leadId);
    Object.keys(map).forEach((key) => {
      if (normalizeLeadId(key) === target) delete map[key];
    });
  }

  function renderLeadMenuPanel(lead, workflow) {
    const id = escapeHtml(lead.id);
    const saved = isSaved(lead);
    const pinned = isPinned(lead);
    const completeByMe = workflow === "complete" && isCompletedByMe(lead);
    const pendingByMe = workflow === "pending" && isPendingByMe(lead);
    const notInterestedByMe = workflow === "not-interested" && isNotInterestedByMe(lead);
    const removed = workflow === "removed";
    return (
      '<div class="lf-menu-panel" role="menu" hidden>' +
      (workflow
        ? '<button type="button" class="lf-menu-item lf-menu-item-restore" role="menuitem" data-lf-workflow="restore" data-lead-id="' +
          id +
          '">Back to Active</button>'
        : "") +
      '<button type="button" class="lf-menu-item' +
      (saved ? " is-active" : "") +
      '" role="menuitem" data-lf-workflow="save" data-lead-id="' +
      id +
      '">' +
      (saved ? "Unlike" : "Like") +
      "</button>" +
      '<button type="button" class="lf-menu-item' +
      (pinned ? " is-active" : "") +
      '" role="menuitem" data-lf-workflow="pin" data-lead-id="' +
      id +
      '">' +
      (pinned ? "Unpin" : "Pin") +
      "</button>" +
      '<button type="button" class="lf-menu-item' +
      (completeByMe ? " is-active" : "") +
      '" role="menuitem" data-lf-workflow="complete" data-lead-id="' +
      id +
      '">' +
      (completeByMe ? "Unmark complete" : "Complete") +
      "</button>" +
      '<button type="button" class="lf-menu-item' +
      (pendingByMe ? " is-active" : "") +
      '" role="menuitem" data-lf-workflow="pending" data-lead-id="' +
      id +
      '">' +
      (pendingByMe ? "Clear pending" : "Pending") +
      "</button>" +
      '<button type="button" class="lf-menu-item' +
      (notInterestedByMe ? " is-active" : "") +
      '" role="menuitem" data-lf-workflow="not-interested" data-lead-id="' +
      id +
      '">' +
      (notInterestedByMe ? "Clear not interested" : "Not interested") +
      "</button>" +
      '<button type="button" class="lf-menu-item lf-menu-item-danger' +
      (removed ? " is-active" : "") +
      '" role="menuitem" data-lf-workflow="removed" data-lead-id="' +
      id +
      '">' +
      (removed ? "Restore" : "Remove") +
      "</button>" +
      "</div>"
    );
  }

  /** Clicking an active status again clears it (same idea as Pin / Like). */
  function resolveMenuWorkflowAction(leadId, action) {
    const act = String(action || "").trim();
    if (act === "restore") return "active";
    if (act === "save" || act === "pin") return act;
    const lead = allLeads.find((l) => normalizeLeadId(l.id) === normalizeLeadId(leadId));
    if (!lead) return act;
    const w = getLeadWorkflow(lead);
    if (act === "complete" && w === "complete" && isCompletedByMe(lead)) return "active";
    if (act === "pending" && w === "pending" && isPendingByMe(lead)) return "active";
    if (act === "not-interested" && w === "not-interested" && isNotInterestedByMe(lead)) {
      return "active";
    }
    if (act === "removed" && w === "removed") return "active";
    return act;
  }

  function isCompletedByMe(lead) {
    const s = statusEntry(lead.id);
    if (!s || getLeadWorkflow(lead) !== "complete") return false;
    return isOwnerMatch(s.calledById, s.calledBy);
  }

  function pendingOwnerName(lead) {
    const s = statusEntry(lead.id);
    return String(s?.pendingBy || s?.calledBy || "").trim();
  }

  function isPendingByMe(lead) {
    if (getLeadWorkflow(lead) !== "pending") return false;
    const s = statusEntry(lead.id);
    return isOwnerMatch(s?.pendingById || s?.calledById, pendingOwnerName(lead));
  }

  function isNotInterestedByMe(lead) {
    if (getLeadWorkflow(lead) !== "not-interested") return false;
    const s = statusEntry(lead.id);
    return isOwnerMatch(s?.calledById, s?.calledBy);
  }

  /** Pending by a teammate — hidden from this rep's callable lists. */
  function isPendingByOther(lead) {
    if (getLeadWorkflow(lead) !== "pending") return false;
    return !isPendingByMe(lead);
  }

  function statusOwnerName(lead) {
    const w = getLeadWorkflow(lead);
    const s = statusEntry(lead.id);
    if (w === "pending") return pendingOwnerName(lead);
    if (w === "complete" || w === "not-interested") {
      return String(s?.calledBy || "").trim();
    }
    if (w === "removed") return getRepName();
    return "";
  }

  /** Only the rep who set Pending / Complete / Not interested can change that status. */
  function canEditLeadStatus(lead) {
    const w = getLeadWorkflow(lead);
    if (!w) return true;
    if (w === "removed") return true;
    const s = statusEntry(lead.id);
    if (w === "pending") {
      return isOwnerMatch(s?.pendingById || s?.calledById, pendingOwnerName(lead));
    }
    return isOwnerMatch(s?.calledById, s?.calledBy);
  }

  function canEditLeadStatusById(leadId) {
    const lead = allLeads.find((l) => String(l.id) === String(leadId));
    if (lead) return canEditLeadStatus(lead);
    const s = statusEntry(leadId);
    const w = s?.workflow || (s?.called ? "complete" : "");
    if (!w || w === "removed") return true;
    if (w === "pending") {
      return isOwnerMatch(s?.pendingById || s?.calledById, s?.pendingBy || s?.calledBy);
    }
    return isOwnerMatch(s?.calledById, s?.calledBy);
  }

  function isActiveLead(lead) {
    return !getLeadWorkflow(lead);
  }

  function leadFromStatusEntry(id, entry, categoryLabel) {
    const name = String(entry?.businessName || entry?.business_name || "").trim();
    const cat = categoryLabel || "Team completed";
    return {
      id,
      name: name || "Lead",
      category: cat,
      categoryGroup: cat,
      phone: "",
      address: "",
      mapsUrl: "#",
      website: "",
      hours: "",
      hasWebsite: false,
      rating: null,
      reviewCount: null,
      dedupeKey: id,
      sources: [],
      _statusOnly: true,
    };
  }

  /** All team-complete rows from sync, merged with loaded lead cards. */
  function getCompleteLeadsPool() {
    const byId = new Map(allLeads.map((l) => [String(l.id), l]));
    const out = [];
    const seen = new Set();

    Object.entries(statusMap).forEach(([id, entry]) => {
      const sid = String(id);
      const w = entry?.workflow || (entry?.called ? "complete" : "");
      if (w !== "complete" || seen.has(sid)) return;
      seen.add(sid);
      out.push(byId.get(sid) || leadFromStatusEntry(sid, entry));
    });

    if (!window.LeadSync?.isConfigured?.()) {
      allLeads.forEach((lead) => {
        const sid = String(lead.id);
        if (isCompleted(lead) && !seen.has(sid)) {
          seen.add(sid);
          out.push(lead);
        }
      });
    }

    return sortByCompletedAt(out);
  }

  /** Only this rep's pending leads (team lock still applies in Active for others). */
  function getMyPendingLeadsPool() {
    const byId = new Map(allLeads.map((l) => [String(l.id), l]));
    const out = [];
    const seen = new Set();

    Object.entries(statusMap).forEach(([id, entry]) => {
      const sid = String(id);
      const w = entry?.workflow || "";
      if (w !== "pending" || seen.has(sid)) return;
      if (!isOwnerMatch(entry.pendingById || entry.calledById, entry.pendingBy || entry.calledBy)) {
        return;
      }
      seen.add(sid);
      const lead = byId.get(sid);
      if (lead) out.push(lead);
      else {
        const stub = leadFromStatusEntry(sid, entry);
        stub.category = "Your pending";
        stub.categoryGroup = "Your pending";
        out.push(stub);
      }
    });

    if (!window.LeadSync?.isConfigured?.()) {
      allLeads.forEach((lead) => {
        const sid = String(lead.id);
        if (isPendingByMe(lead) && !seen.has(sid)) {
          seen.add(sid);
          out.push(lead);
        }
      });
    }

    return sortLeadsPinnedFirst(
      out.slice().sort((a, b) => {
        const atA = String(statusEntry(a.id)?.pendingAt || statusEntry(a.id)?.calledAt || "");
        const atB = String(statusEntry(b.id)?.pendingAt || statusEntry(b.id)?.calledAt || "");
        if (atA !== atB) return atB.localeCompare(atA);
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
    );
  }

  /** Team-wide — every rep sees businesses marked not interested. */
  function getNotInterestedLeadsPool() {
    const byId = new Map(allLeads.map((l) => [String(l.id), l]));
    const out = [];
    const seen = new Set();

    Object.entries(statusMap).forEach(([id, entry]) => {
      const sid = String(id);
      if (entry?.workflow !== "not-interested" || seen.has(sid)) return;
      seen.add(sid);
      out.push(byId.get(sid) || leadFromStatusEntry(sid, entry, "Not interested"));
    });

    if (!window.LeadSync?.isConfigured?.()) {
      allLeads.forEach((lead) => {
        const sid = String(lead.id);
        if (getLeadWorkflow(lead) === "not-interested" && !seen.has(sid)) {
          seen.add(sid);
          out.push(lead);
        }
      });
    }

    return sortByCompletedAt(out);
  }

  function sortByCompletedAt(leads) {
    return leads.slice().sort((a, b) => {
      const atA = String(statusEntry(a.id)?.calledAt || "");
      const atB = String(statusEntry(b.id)?.calledAt || "");
      if (atA !== atB) return atB.localeCompare(atA);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function splitCompleteLeads(leads) {
    const mine = [];
    const team = [];
    leads.forEach((lead) => {
      if (isCompletedByMe(lead)) mine.push(lead);
      else team.push(lead);
    });
    return { mine, team };
  }

  function statusSigForLeads(leads) {
    return leads
      .map((l) => {
        const s = statusEntry(l.id) || {};
        return (
          l.id +
          ":" +
          getLeadWorkflow(l) +
          ":" +
          (s.calledBy || "") +
          ":" +
          (s.calledById || "") +
          ":" +
          (s.calledAt || "") +
          ":" +
          (s.pendingBy || "") +
          ":" +
          (s.pendingById || "") +
          ":" +
          (s.pendingAt || "")
        );
      })
      .join(",");
  }

  function isDefaultLead(lead) {
    return isActiveLead(lead);
  }

  function matchesWorkflowView(lead) {
    if (isPendingByOther(lead) && listView !== "complete" && listView !== "not-interested") {
      return false;
    }
    if (listView === "saved") {
      return isSaved(lead) && !isPendingByOther(lead) && getLeadWorkflow(lead) !== "not-interested";
    }
    if (listView === "pinned") {
      return (
        isPinned(lead) &&
        !isPendingByMe(lead) &&
        !isPendingByOther(lead) &&
        getLeadWorkflow(lead) !== "not-interested"
      );
    }
    const workflow = getLeadWorkflow(lead);
    if (listView === "default") {
      return isActiveLead(lead);
    }
    if (listView === "removed") return workflow === "removed";
    if (listView === "pending") return isPendingByMe(lead);
    return workflow === listView;
  }

  function countWorkflowView(view) {
    if (view === "complete") return getCompleteLeadsPool().length;
    if (view === "not-interested") return getNotInterestedLeadsPool().length;
    if (view === "pending") return getMyPendingLeadsPool().length;
    const f = getWebsiteFilter();
    return allLeads.filter((lead) => {
      if (!matchesWebsiteFilter(lead, f)) return false;
      if (view === "saved") {
        return isSaved(lead) && !isPendingByOther(lead) && getLeadWorkflow(lead) !== "not-interested";
      }
      if (view === "pinned") {
        return (
          isPinned(lead) &&
          !isPendingByMe(lead) &&
          !isPendingByOther(lead) &&
          getLeadWorkflow(lead) !== "not-interested"
        );
      }
      if (view === "default") return isActiveLead(lead);
      if (view === "removed") return getLeadWorkflow(lead) === "removed";
      return getLeadWorkflow(lead) === view;
    }).length;
  }

  function workflowLabel(workflow) {
    if (workflow === "complete") return "Complete";
    if (workflow === "pending") return "Pending";
    if (workflow === "not-interested") return "Not interested";
    if (workflow === "removed") return "Removed";
    return "";
  }

  function workflowChipClass(workflow) {
    if (workflow === "complete") return "lf-status-chip-done";
    if (workflow === "pending") return "lf-status-chip-pending";
    if (workflow === "not-interested") return "lf-status-chip-not-interested";
    return "lf-status-chip-muted";
  }

  function personalMarksSig() {
    return (
      Array.from(savedIds).sort().join(",") +
      "|" +
      pinnedOrder.join(",")
    );
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function display() {
    return window.LeadDisplay || {};
  }

  function formatRatingParts(lead) {
    const d = display();
    const rating = d.formatRating ? d.formatRating(lead) : "";
    const reviews = d.formatReviews ? d.formatReviews(lead) : "";
    const line = d.formatRatingLine ? d.formatRatingLine(lead) : "";
    return { rating, reviews, line, hasData: !!(rating || reviews) };
  }

  function matchesLeadListFilters(lead, websiteFilter, reviews) {
    if (!matchesWorkflowView(lead)) return false;
    if (
      isPinned(lead) &&
      (listView === "default" || listView === "saved" || listView === "pinned")
    ) {
      return matchesReviewsFilter(lead, reviews);
    }
    if (!matchesWebsiteFilter(lead, websiteFilter)) return false;
    return matchesReviewsFilter(lead, reviews);
  }

  function shuffleLeads(leads) {
    const byId = new Map(leads.map((l) => [normalizeLeadId(l.id), l]));
    const pinned = [];
    pinnedOrder.forEach((id) => {
      if (byId.has(id)) pinned.push(byId.get(id));
    });
    const rest = leads.filter((lead) => !pinnedIds.has(normalizeLeadId(lead.id)));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return pinned.concat(rest);
  }

  function getWebsiteFilter() {
    const active = document.querySelector("#lf-website-filter .lf-toggle-btn.active");
    const v = active?.dataset.filter || "noweb";
    if (v === "web" || v === "all") return v;
    return "noweb";
  }

  function getFilters() {
    return {
      websiteFilter: getWebsiteFilter(),
      reviewsFilter: getReviewsFilter(),
    };
  }

  function getBrowsableLeads(websiteFilter) {
    if (listView === "complete") return getCompleteLeadsPool();
    if (listView === "pending") return getMyPendingLeadsPool();
    if (listView === "not-interested") return getNotInterestedLeadsPool();
    return allLeads.filter((lead) => {
      if (!matchesWorkflowView(lead)) return false;
      if (
        isPinned(lead) &&
        (listView === "default" || listView === "saved" || listView === "pinned")
      ) {
        return true;
      }
      return matchesWebsiteFilter(lead, websiteFilter);
    });
  }

  function sortLeadsDisplayOrder(leads) {
    let ordered = sortLeadsPinnedFirst(leads);
    if (!priorityCategories.size) return ordered;

    return ordered.filter((lead) => priorityCategories.has(getBasicCategory(lead)));
  }

  function matchesWebsiteFilter(lead, websiteFilter) {
    if (websiteFilter === "noweb") return !lead.hasWebsite;
    if (websiteFilter === "web") return !!lead.hasWebsite;
    return true;
  }

  function countCompleted() {
    return getCompleteLeadsPool().filter((lead) => isCompletedByMe(lead)).length;
  }

  function sortLeadsPinnedFirst(leads) {
    if (!pinnedOrder.length) return leads;
    const byId = new Map(leads.map((l) => [normalizeLeadId(l.id), l]));
    const ordered = [];
    const placed = new Set();
    pinnedOrder.forEach((id) => {
      if (byId.has(id) && !placed.has(id)) {
        ordered.push(byId.get(id));
        placed.add(id);
      }
    });
    leads.forEach((lead) => {
      const id = normalizeLeadId(lead.id);
      if (!placed.has(id)) ordered.push(lead);
    });
    return ordered;
  }

  function applyFilters() {
    const viewFilterSig = listView + "|" + filtersSig();
    if (viewFilterSig !== lastViewFilterSig) {
      resetRenderLimit();
      lastViewFilterSig = viewFilterSig;
    }

    const f = getFilters();
    const browsable = getBrowsableLeads(f.websiteFilter);

    if (listView === "complete") {
      visible = browsable.filter((lead) => matchesReviewsFilter(lead, f.reviewsFilter));
    } else if (listView === "pending") {
      visible = browsable.filter((lead) => matchesReviewsFilter(lead, f.reviewsFilter));
    } else if (listView === "not-interested") {
      visible = browsable.filter((lead) => matchesReviewsFilter(lead, f.reviewsFilter));
    } else {
      visible = allLeads.filter((lead) =>
        matchesLeadListFilters(lead, f.websiteFilter, f.reviewsFilter)
      );
    }

    visible = sortLeadsDisplayOrder(visible);

    const grid = $("lf-grid");
    if (grid) delete grid.dataset.renderSig;
    renderCategoryFilters(browsable);
    updateViewUi();
    renderGrid();
    updateStats();
    manageTeamStatusPoll();
  }

  function updateViewUi() {
    const sel = $("lf-workflow-view");
    if (!sel) return;
    WORKFLOW_VIEWS.forEach(({ value, label }) => {
      const opt = sel.querySelector('option[value="' + value + '"]');
      if (!opt) return;
      const n = leadsPageReady ? countWorkflowView(value) : 0;
      opt.textContent = n > 0 ? label + " (" + n + ")" : label;
    });
    syncWorkflowSelectFromListView();
  }

  function setMetricsLoading(loading) {
    const val = loading ? "…" : null;
    ["lf-stat-total", "lf-stat-done"].forEach((id) => {
      const el = $(id);
      if (el && val) el.textContent = val;
    });
  }

  function updateStats() {
    if (!leadsPageReady) return;
    if ($("lf-stat-total")) {
      $("lf-stat-total").textContent = String(countWorkflowView("default"));
    }
    if ($("lf-stat-done")) $("lf-stat-done").textContent = String(countCompleted());
  }

  function valueClass(text) {
    const t = String(text || "").trim();
    if (t === "NULL") return " lf-detail-val-null";
    if (/not listed$/i.test(t)) return " lf-detail-val-missing";
    return "";
  }

  function formatDisplayHours(raw) {
    if (!raw) return "";
    return String(raw)
      .replace(/[\u00b7\u2022]+/g, "·")
      .replace(/\s*·\s*/g, " · ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function visitWebsiteUrl(lead) {
    const w = String(lead?.website || "").trim();
    if (!w.startsWith("http://") && !w.startsWith("https://")) return "";
    const low = w.toLowerCase();
    if (low.includes("google.com/maps") || low.includes("gstatic.com") || low.includes("google.com/aclk")) {
      return "";
    }
    return w;
  }

  function formatWebsiteLabel(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./i, "");
      const path = u.pathname && u.pathname !== "/" ? u.pathname : "";
      const label = host + path;
      return label.length > 48 ? label.slice(0, 45) + "…" : label;
    } catch (e) {
      const s = String(url).replace(/^https?:\/\//i, "").trim();
      return s.length > 48 ? s.slice(0, 45) + "…" : s;
    }
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "";
    const sec = Math.floor((Date.now() - then.getTime()) / 1000);
    if (sec < 45) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? "1 minute ago" : min + " minutes ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? "1 hour ago" : hr + " hours ago";
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? "1 day ago" : day + " days ago";
    const wk = Math.floor(day / 7);
    if (wk < 5) return wk === 1 ? "1 week ago" : wk + " weeks ago";
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function businessDisplayName(lead) {
    const d = display();
    const fromLead = d.formatName ? d.formatName(lead) : lead.name;
    const fromStatus = String(statusEntry(lead.id)?.businessName || "").trim();
    return fromLead || fromStatus || "Business";
  }

  function repAvatarHtml(repName) {
    const name = String(repName || "").trim();
    const RPP = global.RepProfilePhoto;
    const photo =
      (RPP?.urlForRepName && RPP.urlForRepName(name)) ||
      RPP?.DEFAULT_URL ||
      "";
    return (
      '<img class="lf-rep-avatar-img" src="' +
      escapeHtml(photo) +
      '" alt="" width="48" height="48" decoding="async">'
    );
  }

  function renderAnonymousTeamCard(lead, actionLabel) {
    const entry = statusEntry(lead.id) || {};
    const repName = String(entry.calledBy || entry.pendingBy || "").trim() || "Rep";
    const bizName = businessDisplayName(lead);
    const when = formatTimeAgo(entry.calledAt || entry.pendingAt || "");
    const workflow = getLeadWorkflow(lead);
    const canEdit = canEditLeadStatus(lead);
    const label = actionLabel || workflowLabel(workflow) || "Updated";

    const menuHtml = canEdit
      ? `<div class="lf-card-menu-wrap">
          <button type="button" class="lf-menu-btn" data-lead-id="${escapeHtml(lead.id)}" aria-label="Lead options" aria-haspopup="true" aria-expanded="false">
            <span data-icon="circle-menu" data-icon-class="lf-menu-ico"></span>
          </button>
          ${renderLeadMenuPanel(lead, workflow)}
        </div>`
      : "";

    return (
      '<article class="lead-card card lead-card--team-anon lead-card--' +
      escapeHtml(workflow || "complete") +
      '" data-id="' +
      escapeHtml(lead.id) +
      '">' +
      '<div class="lf-team-anon-body">' +
      '<div class="lf-team-anon-rep-col">' +
      '<div class="lf-rep-avatar" aria-hidden="true">' +
      repAvatarHtml(repName) +
      "</div>" +
      '<p class="lf-team-anon-rep">' +
      escapeHtml(repName) +
      "</p>" +
      "</div>" +
      '<div class="lf-team-anon-copy">' +
      '<h3 class="lf-team-anon-business">' +
      escapeHtml(bizName) +
      "</h3>" +
      '<div class="lf-team-anon-meta">' +
      '<span class="lf-team-anon-status lf-team-anon-status--' +
      escapeHtml(workflow || "complete") +
      '">' +
      escapeHtml(label) +
      "</span>" +
      (when ? '<span class="lf-team-anon-when">' + escapeHtml(when) + "</span>" : "") +
      "</div>" +
      "</div>" +
      (menuHtml ? '<div class="lf-team-anon-actions">' + menuHtml + "</div>" : "") +
      "</div>" +
      "</article>"
    );
  }

  function renderCard(lead, opts) {
    opts = opts || {};
    const leadId = normalizeLeadId(lead.id);
    const workflow = getLeadWorkflow(lead);
    const saved = isSaved(lead);
    const pinned = isPinned(lead);
    let cardMod =
      workflow === "complete"
        ? " lead-card--complete"
        : workflow === "pending"
          ? " lead-card--pending"
          : workflow === "not-interested"
            ? " lead-card--not-interested"
            : "";
    if (saved) cardMod += " lead-card--saved";
    if (pinned) cardMod += " lead-card--pinned";
    const d = display();
    const phoneDisplay = d.formatPhone ? d.formatPhone(lead) : lead.phone || "Phone not listed";
    const addr = d.formatAddress ? d.formatAddress(lead) : lead.address || "Address not listed";
    let hours = d.formatHours ? d.formatHours(lead) : lead.hours || "Hours not listed";
    hours = formatDisplayHours(hours);
    const showHours = hours && hours !== "Hours not listed" && hours !== "NULL";
    const bizName = d.formatName ? d.formatName(lead) : lead.name || "Business name not listed";
    const bizCat = d.formatCategory ? d.formatCategory(lead) : lead.category || lead.categoryGroup || "Category not listed";
    const { rating, reviews, line, hasData } = formatRatingParts(lead);
    const avatarText = d.initials ? d.initials(lead) : "?";
    const avatarStyle = d.avatarStyle ? d.avatarStyle(lead) : "";
    const mapsUrl = lead.mapsUrl || "#";
    const websiteUrl = visitWebsiteUrl(lead);
    const phoneRaw = String(lead.phone || "").trim();
    const tel =
      phoneRaw && phoneRaw.toUpperCase() !== "NULL"
        ? phoneRaw.replace(/[^\d+]/g, "")
        : "";

    const statusChip =
      workflow && workflow !== "removed"
        ? `<span class="lf-status-chip ${workflowChipClass(workflow)}">${escapeHtml(workflowLabel(workflow))}</span>`
        : "";

    const canEditStatus = canEditLeadStatus(lead);

    const reviewsHtml = hasData
      ? `<span class="lf-reviews-line" title="Google Maps rating">${escapeHtml(line)}</span>`
      : `<span class="lf-info-text lf-info-text--muted lf-detail-val-missing">No reviews</span>`;

    const websiteLabel = websiteUrl ? formatWebsiteLabel(websiteUrl) : "";
    const websiteHtml = websiteUrl
      ? `<a class="lf-info-text lf-info-link lf-website-link" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteLabel)}</a>`
      : `<span class="lf-info-text lf-info-text--muted lf-website-none">No Website</span>`;

    const sublineParts = [escapeHtml(bizCat)];
    if (opts.showTeamCompletedBy) {
      const by = String(statusEntry(lead.id)?.calledBy || "").trim();
      sublineParts.push(
        '<span class="lf-completed-by">' +
          (by ? "By " + escapeHtml(by) : "Team") +
          "</span>"
      );
    } else if (opts.completedByLine) {
      sublineParts.push(
        '<span class="lf-completed-by">' + escapeHtml(opts.completedByLine) + "</span>"
      );
    }

    return `
      <article class="lead-card card${cardMod}" data-id="${escapeHtml(leadId)}">
        <header class="lf-card-top">
          <div class="lf-card-identity">
            <div class="lf-avatar" style="${avatarStyle}" aria-hidden="true">${escapeHtml(avatarText)}</div>
            <div class="lf-card-titles">
              <h3 class="lead-card-name">${escapeHtml(bizName)}</h3>
              <p class="lf-card-subline">${sublineParts.join('<span class="lf-meta-dot" aria-hidden="true">·</span>')}</p>
            </div>
          </div>
          <div class="lf-card-top-actions">
            <div class="lf-card-marks" aria-label="Your shortcuts">
              <button type="button" class="lf-mark-btn lf-mark-save${saved ? " is-on" : ""}" data-lead-save="${escapeHtml(leadId)}" aria-label="${saved ? "Remove from Quick Save" : "Quick Save"}" aria-pressed="${saved ? "true" : "false"}" title="Quick Save">
                <span data-icon="heart" data-icon-class="lf-mark-ico"></span>
              </button>
              <button type="button" class="lf-mark-btn lf-mark-pin${pinned ? " is-on" : ""}" data-lead-pin="${escapeHtml(leadId)}" aria-label="${pinned ? "Unpin lead" : "Pin lead"}" aria-pressed="${pinned ? "true" : "false"}" title="${pinned ? "Unpin" : "Pin"}">
                <span data-icon="pin" data-icon-class="lf-mark-ico"></span>
              </button>
            </div>
            ${statusChip}
            ${
              canEditStatus
                ? `<div class="lf-card-menu-wrap">
              <button type="button" class="lf-menu-btn" data-lead-id="${escapeHtml(lead.id)}" aria-label="Lead options" aria-haspopup="true" aria-expanded="false">
                <span data-icon="circle-menu" data-icon-class="lf-menu-ico"></span>
              </button>
              ${renderLeadMenuPanel(lead, workflow)}
            </div>`
                : ""
            }
          </div>
        </header>

        <section class="lf-card-body" aria-label="Contact details">
          <ul class="lf-info-list">
            <li class="lf-info-item" aria-label="Phone">
              <span class="lf-info-icon" aria-hidden="true"><span data-icon="phone" data-icon-class="lf-info-ico"></span></span>
              <div class="lf-info-content lf-info-content--phone">
                ${
                  tel
                    ? `<a class="lf-info-text lf-info-link${valueClass(phoneDisplay)}" href="tel:${escapeHtml(tel)}">${escapeHtml(phoneDisplay)}</a>`
                    : `<span class="lf-info-text${valueClass(phoneDisplay)}">${escapeHtml(phoneDisplay)}</span>`
                }
              </div>
            </li>
            <li class="lf-info-item" aria-label="Reviews">
              <span class="lf-info-icon" aria-hidden="true"><span data-icon="star" data-icon-class="lf-info-ico"></span></span>
              <div class="lf-info-content">${reviewsHtml}</div>
            </li>
            <li class="lf-info-item" aria-label="Website">
              <span class="lf-info-icon" aria-hidden="true"><span data-icon="globe" data-icon-class="lf-info-ico"></span></span>
              <div class="lf-info-content">${websiteHtml}</div>
            </li>
            <li class="lf-info-item" aria-label="Address">
              <span class="lf-info-icon" aria-hidden="true"><span data-icon="map-pin" data-icon-class="lf-info-ico"></span></span>
              <span class="lf-info-text${valueClass(addr)}">${escapeHtml(addr)}</span>
            </li>
            ${
              showHours
                ? `<li class="lf-info-item" aria-label="Hours">
              <span class="lf-info-icon" aria-hidden="true"><span data-icon="clock" data-icon-class="lf-info-ico"></span></span>
              <span class="lf-info-text lf-info-text--muted${valueClass(hours)}">${escapeHtml(hours)}</span>
            </li>`
                : ""
            }
          </ul>
        </section>

        <footer class="lf-card-actions lf-card-actions--two">
          ${
            mapsUrl && mapsUrl !== "#"
              ? `<a class="lf-action-btn lf-action-maps" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">
            <span data-icon="map-pin" data-icon-class="lf-action-ico"></span>
            Maps
          </a>`
              : `<span class="lf-action-btn lf-action-maps is-disabled" aria-disabled="true">Maps</span>`
          }
          <button type="button" class="lf-action-btn lf-action-builder${canEditStatus ? "" : " is-disabled"}" data-lead-builder="${escapeHtml(leadId)}" aria-label="Build lead in Lead Builder for ${escapeHtml(bizName)}"${canEditStatus ? "" : " disabled aria-disabled=\"true\""}>
            <span data-icon="hammer" data-icon-class="lf-action-ico"></span>
            Build Lead
          </button>
        </footer>
      </article>
    `;
  }

  function renderCompletePane(title, leads, paneClass, cardOpts) {
    const renderFn =
      cardOpts?.renderCard ||
      ((l) => renderCard(l, cardOpts));
    const cards = leads.length > 0 ? leads.map((l) => renderFn(l)).join("") : "";
    const live =
      window.LeadSync?.isConfigured?.() ?
        '<span class="lf-complete-live" aria-live="polite">Live</span>'
      : "";
    return (
      '<section class="lf-complete-pane ' +
      paneClass +
      '" aria-label="' +
      escapeHtml(title) +
      '">' +
      '<header class="lf-complete-pane-head">' +
      "<h2 class=\"lf-complete-pane-title\">" +
      escapeHtml(title) +
      "</h2>" +
      '<span class="lf-complete-pane-meta">' +
      live +
      '<span class="lf-complete-count">' +
      String(leads.length) +
      "</span></span>" +
      "</header>" +
      '<div class="lf-complete-pane-grid leads-grid">' +
      cards +
      "</div>" +
      "</section>"
    );
  }

  function renderCompleteSplit(leads) {
    const { mine, team } = splitCompleteLeads(leads);
    return (
      '<div class="lf-complete-split">' +
      renderCompletePane(
        "Your completed",
        mine,
        "lf-complete-pane--mine",
        { completedByLine: "You completed" }
      ) +
      renderCompletePane(
        "Team completed",
        team,
        "lf-complete-pane--team",
        { renderCard: (l) => renderAnonymousTeamCard(l, "Completed") }
      ) +
      "</div>"
    );
  }

  function renderLoadMoreSentinel() {
    const rendered = renderedVisibleCount();
    const remaining = visible.length - rendered;
    if (remaining <= 0) return "";
    const next = Math.min(RENDER_INCREMENT, remaining);
    return (
      '<div class="leads-load-more" data-lf-load-more-sentinel aria-live="polite">' +
      '<span class="lf-load-more-status">Loading ' +
      next +
      " more as you scroll...</span>" +
      "</div>"
    );
  }

  function syncLoadMoreObserver(grid) {
    if (loadMoreObserver) {
      loadMoreObserver.disconnect();
      loadMoreObserver = null;
    }
    const sentinel = grid.querySelector("[data-lf-load-more-sentinel]");
    if (!sentinel) return;
    if ("IntersectionObserver" in global) {
      loadMoreObserver = new global.IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            queueLoadNextVisibleBatch();
          }
        },
        { rootMargin: "420px 0px" }
      );
      loadMoreObserver.observe(sentinel);
      return;
    }
    bindLoadMoreScrollFallback();
    handleLoadMoreScrollFallback();
  }

  function renderGrid() {
    const grid = $("lf-grid");
    if (!grid) return;

    let sig = listView + "|" + personalMarksSig() + "|" + filtersSig();
    if (listView === "complete") {
      const split = splitCompleteLeads(visible);
      sig +=
        "|" +
        statusSigForLeads(split.mine) +
        "|" +
        statusSigForLeads(split.team) +
        "|" +
        (global.RepProfilePhoto?.teamPhotosSig?.() || "");
    } else {
      sig += "|" + statusSigForLeads(visible);
      if (listView === "not-interested") {
        sig += "|" + (global.RepProfilePhoto?.teamPhotosSig?.() || "");
      }
    }
    sig += "|render:" + renderLimit;

    if (visible.length > 0 && grid.dataset.renderSig === sig) {
      return;
    }
    grid.dataset.renderSig = sig;

    const rendered = visibleRenderSlice();
    const loadMore = renderLoadMoreSentinel();

    if (listView === "complete") {
      grid.classList.add("leads-grid--complete-split");
      grid.innerHTML = renderCompleteSplit(rendered) + loadMore;
    } else if (listView === "not-interested") {
      grid.classList.remove("leads-grid--complete-split");
      grid.innerHTML = rendered
        .map((l) => renderAnonymousTeamCard(l, "Not interested"))
        .join("") + loadMore;
    } else if (visible.length === 0) {
      grid.innerHTML = "";
      grid.classList.remove("leads-grid--complete-split");
    } else {
      grid.classList.remove("leads-grid--complete-split");
      grid.innerHTML = rendered.map((l) => renderCard(l)).join("") + loadMore;
    }

    if (window.SiteIcons) window.SiteIcons.initIcons(grid);
    syncLoadMoreObserver(grid);
  }

  function closeAllMenus() {
    document.querySelectorAll(".lf-card-menu-wrap.is-open").forEach((wrap) => {
      wrap.classList.remove("is-open");
      const btn = wrap.querySelector(".lf-menu-btn");
      const panel = wrap.querySelector(".lf-menu-panel");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (panel) panel.hidden = true;
    });
  }

  function patchStatusMapLocal(leadId, workflow, businessName) {
    const next = { ...statusMap };
    const key = normalizeLeadId(leadId);
    const w = String(workflow || "").trim();
    if (w === "removed") {
      next[key] = { workflow: "removed", called: false };
    } else if (w === "pending") {
      next[key] = {
        workflow: "pending",
        called: false,
        pendingBy: getRepName(),
        pendingById: getRepId(),
        pendingAt: new Date().toISOString(),
      };
    } else if (w === "complete") {
      next[key] = {
        workflow: "complete",
        called: true,
        calledBy: getRepName(),
        calledById: getRepId(),
        calledAt: new Date().toISOString(),
      };
    } else if (w === "not-interested") {
      next[key] = {
        workflow: "not-interested",
        called: false,
        calledBy: getRepName(),
        calledById: getRepId(),
        calledAt: new Date().toISOString(),
      };
    } else if (w === "active" || !w) {
      clearStatusEntries(next, leadId);
    }
    if (businessName && next[key]) {
      next[key].businessName = String(businessName).trim();
    }
    statusMap = next;
  }

  function ensureSyncReady() {
    if (syncApi && syncApi.mode === "team") return Promise.resolve(syncApi);
    if (!window.LeadSync) return Promise.resolve(null);
    if (!syncInitPromise) {
      syncInitPromise = window.LeadSync.init((map) => {
        scheduleFilterFromSync(map);
      })
        .then((api) => {
          syncApi = api;
          if (api?.mode === "local" && window.LeadSync?.isConfigured?.()) {
            console.warn(
              "Lead Finder: team sync unavailable — completed/pending are only on this device until Supabase connects."
            );
          }
          return api;
        })
        .catch((e) => {
          syncInitPromise = null;
          throw e;
        });
    }
    return syncInitPromise;
  }

  function retryTeamSync() {
    if (!window.LeadSync?.isConfigured?.()) return Promise.resolve(null);
    if (syncApi?.mode === "team") {
      return window.LeadSync.refreshTeam?.().catch(() => null);
    }
    syncApi = null;
    syncInitPromise = null;
    return ensureSyncReady();
  }

  async function applyLeadWorkflow(leadId, workflow, options) {
    options = options || {};
    const viewBefore = listView;
    const restoreView = options.restoreView !== false;
    const switchToActive = options.switchToActive === true;
    const w = String(workflow || "").trim();
    const inMyPending =
      w === "active" &&
      getMyPendingLeadsPool().some((l) => normalizeLeadId(l.id) === normalizeLeadId(leadId));
    if (!canEditLeadStatusById(leadId) && !inMyPending) {
      alert(
        "You can only change status on leads you marked Pending, Complete, or Not interested."
      );
      return;
    }
    await ensureSyncReady().catch((e) => {
      console.warn("Lead sync unavailable, using this device only", e);
    });
    const lead = allLeads.find((l) => normalizeLeadId(l.id) === normalizeLeadId(leadId));
    const before = { ...statusMap };
    patchStatusMapLocal(leadId, workflow, lead?.name);
    if (w === "pending") {
      global.LeadSync?.savePendingLocalSnapshot?.(leadId, lead?.name);
    } else if (w === "active" || !w) {
      global.LeadSync?.clearPendingLocalSnapshot?.(leadId);
    }
    applyFilters();
    try {
      if (syncApi?.setWorkflow) {
        await syncApi.setWorkflow(leadId, workflow, lead?.name);
      }
      if (switchToActive) {
        switchToActiveView();
      } else if (restoreView && listView !== viewBefore) {
        listView = viewBefore;
        syncWorkflowSelectFromListView();
      }
      applyFilters();
    } catch (e) {
      statusMap = before;
      if (w === "pending") {
        const key = normalizeLeadId(leadId);
        const hadPending = Object.keys(before).some(
          (k) => normalizeLeadId(k) === key && before[k]?.workflow === "pending"
        );
        if (!hadPending) global.LeadSync?.clearPendingLocalSnapshot?.(leadId);
      }
      if (restoreView && listView !== viewBefore) {
        listView = viewBefore;
        syncWorkflowSelectFromListView();
      }
      applyFilters();
      console.error(e);
      alert("Could not save. Check team sync setup or try again.");
      throw e;
    }
  }

  async function handleMenuWorkflowAction(leadId, action) {
    if (!leadId || !action) return;
    const resolved = resolveMenuWorkflowAction(leadId, action);
    if (resolved === "save") {
      toggleSaved(leadId);
      invalidateGridRender();
      updateViewUi();
      applyFilters();
      return;
    }
    if (resolved === "pin") {
      togglePinned(leadId);
      invalidateGridRender();
      applyFilters();
      return;
    }
    const workflow = resolved === "restore" ? "active" : resolved;
    await applyLeadWorkflow(leadId, workflow, {
      restoreView: true,
      switchToActive: workflow === "active",
    });
    invalidateGridRender();
  }

  function bindGridMarkActions() {
    const grid = $("lf-grid");
    if (!grid || grid.dataset.markActionsBound === "1") return;
    grid.dataset.markActionsBound = "1";

    grid.addEventListener(
      "mousedown",
      (e) => {
        if (e.target.closest(".lf-menu-item[data-lf-workflow], .lf-menu-item[data-action='pin']")) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    grid.addEventListener("click", (e) => {
      const menuBtn = e.target.closest(".lf-menu-btn");
      if (menuBtn) {
        e.preventDefault();
        e.stopPropagation();
        $("lf-workflow-view")?.blur();
        const wrap = menuBtn.closest(".lf-card-menu-wrap");
        const panel = wrap?.querySelector(".lf-menu-panel");
        if (!wrap || !panel) return;
        const open = wrap.classList.contains("is-open");
        closeAllMenus();
        if (!open) {
          wrap.classList.add("is-open");
          panel.hidden = false;
          menuBtn.setAttribute("aria-expanded", "true");
        }
        return;
      }

      const menuItem = e.target.closest(
        ".lf-menu-item[data-lf-workflow], .lf-menu-item[data-action='pin']"
      );
      if (menuItem) {
        e.preventDefault();
        e.stopPropagation();
        const id = menuItem.dataset.leadId;
        const action = menuItem.dataset.lfWorkflow || menuItem.dataset.action;
        closeAllMenus();
        void handleMenuWorkflowAction(id, action);
        return;
      }

      const pinBtn = e.target.closest("[data-lead-pin]");
      if (pinBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = pinBtn.getAttribute("data-lead-pin");
        if (!id) return;
        const nowPinned = togglePinned(id);
        syncPinButtonUi(pinBtn, nowPinned);
        invalidateGridRender();
        applyFilters();
        if (nowPinned) {
          requestAnimationFrame(() => {
            const card = document.querySelector(
              '.lead-card[data-id="' + CSS.escape(normalizeLeadId(id)) + '"]'
            );
            card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
        return;
      }
      const saveBtn = e.target.closest("[data-lead-save]");
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = saveBtn.getAttribute("data-lead-save");
        if (!id) return;
        const nowSaved = !savedIds.has(normalizeLeadId(id));
        toggleSaved(id);
        syncSaveButtonUi(saveBtn, nowSaved);
        invalidateGridRender();
        updateViewUi();
        applyFilters();
        return;
      }
      const builderBtn = e.target.closest("[data-lead-builder]");
      if (builderBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (builderBtn.disabled || builderBtn.getAttribute("aria-disabled") === "true") {
          return;
        }
        const id = builderBtn.getAttribute("data-lead-builder");
        if (!id) return;
        handleBuildLeadClick(id);
      }
    });
  }

  function bindMenuDismiss() {
    if (menuDocBound) return;
    menuDocBound = true;
    document.addEventListener("click", (e) => {
      if (e.target.closest(".lf-card-menu-wrap")) return;
      closeAllMenus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllMenus();
    });
  }

  let syncFilterTimer = null;
  /** False until leads + workflow sync have loaded once (avoids stat count flash). */
  let leadsPageReady = false;
  let completePollTimer = null;
  let completePollBound = false;

  function refreshTeamProfilePhotos() {
    const RPP = global.RepProfilePhoto;
    if (!RPP?.refreshTeamPhotos) return Promise.resolve();
    return RPP.refreshTeamPhotos().then(() => {
      const grid = $("lf-grid");
      if (grid && (listView === "complete" || listView === "not-interested")) {
        delete grid.dataset.renderSig;
        renderGrid();
      }
    });
  }

  function manageTeamStatusPoll() {
    clearInterval(completePollTimer);
    completePollTimer = null;
    const teamViews = ["complete", "not-interested"];
    if (!teamViews.includes(listView) || !window.LeadSync?.isConfigured?.()) return;
    completePollTimer = setInterval(() => {
      window.LeadSync?.refreshTeam?.().catch((e) => {
        console.warn("Team status refresh failed", e);
      });
    }, 20000);
    if (!completePollBound) {
      completePollBound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (!teamViews.includes(listView)) return;
        window.LeadSync?.refreshTeam?.().catch(() => {});
      });
    }
    window.LeadSync?.refreshTeam?.().catch(() => {});
    refreshTeamProfilePhotos().catch(() => {});
  }
  let refreshBusy = false;

  function showLeadsLoadError(err) {
    const grid = $("lf-grid");
    const msg = escapeHtml(err?.message || String(err));
    const looksLikeSupabase =
      /fetch|network|401|403|jwt|supabase|postgrest|failed to load/i.test(msg);
    if (grid) {
      grid.innerHTML =
        '<div class="leads-error card">' +
        `<p><strong>${looksLikeSupabase ? "Lead Finder could not connect to Supabase." : "Lead Finder could not load leads."}</strong></p>` +
        `<p class="muted">${msg}</p>` +
        (looksLikeSupabase
          ? '<p class="muted">Check: <code>supabase-full-setup.sql</code> was run, leads are imported into the <code>leads</code> table, and <code>js/config.js</code> has your project URL + publishable key. See <code>LEADS_DATABASE.md</code>.</p>'
          : '<p class="muted">Try a hard refresh (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>). If it persists, check the browser console.</p>') +
        "</div>";
    }
    console.error(err);
  }

  function setRefreshBusy(busy) {
    refreshBusy = busy;
    const btn = $("lf-refresh");
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle("is-loading", busy);
    if (busy) btn.setAttribute("aria-busy", "true");
    else btn.removeAttribute("aria-busy");
  }

  async function refreshLeads() {
    if (refreshBusy) return;
    setRefreshBusy(true);
    try {
      await retryTeamSync();
      await loadLeads();
    } catch (err) {
      showLeadsLoadError(err);
    } finally {
      setRefreshBusy(false);
      const btn = $("lf-refresh");
      if (btn && window.SiteIcons) window.SiteIcons.initIcons(btn);
    }
  }

  function scheduleFilterFromSync(map) {
    statusMap = map || statusMap;
    if (!leadsPageReady) return;
    clearTimeout(syncFilterTimer);
    const delay = listView === "complete" || listView === "not-interested" ? 120 : 300;
    syncFilterTimer = setTimeout(applyFilters, delay);
  }

  async function loadLeads() {
    leadsPageReady = false;
    setMetricsLoading(true);
    const grid = $("lf-grid");
    if (grid) {
      grid.innerHTML =
        '<div class="leads-loading" role="status" aria-live="polite">' +
        '<span class="leads-loading-orb" aria-hidden="true"></span>' +
        '<span class="sr-only">Loading leads</span>' +
        "</div>";
    }
    const loader = window.LeadsLoader;
    if (!loader?.load) throw new Error("LeadsLoader missing");

    const [data] = await Promise.all([
      loader.load(),
      ensureSyncReady().catch((e) => {
        console.warn("Lead sync unavailable, using this device only", e);
        return null;
      }),
    ]);

    meta = data.meta || {};
    allLeads = shuffleLeads(data.leads || []);
    const websiteFilter = getWebsiteFilter();
    const availableCats = new Set(
      collectCategoryCounts(
        allLeads.filter((lead) => matchesWebsiteFilter(lead, websiteFilter))
      ).map(([cat]) => cat)
    );
    if (priorityCategories.size) {
      priorityCategories = new Set(
        Array.from(priorityCategories).filter((c) => availableCats.has(c))
      );
    }
    leadsPageReady = true;
    clearTimeout(syncFilterTimer);
    syncFilterTimer = null;
    lastViewFilterSig = "";
    applyFilters();
    refreshTeamProfilePhotos().catch(() => {});
  }

  let pageReady = false;

  function init() {
    if (pageReady || document.body.dataset.page !== "leads") return;
    pageReady = true;
    bindMenuDismiss();
    bindGridMarkActions();
    reloadPersonalMarks();
    applyPrefsToUi();
    const hashView = (location.hash || "").replace(/^#/, "").trim();
    if (WORKFLOW_VIEWS.some((w) => w.value === hashView)) {
      listView = hashView;
      syncWorkflowSelectFromListView();
    }

    $("lf-website-filter")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".lf-toggle-btn[data-filter]");
      if (!btn) return;
      document
        .querySelectorAll("#lf-website-filter .lf-toggle-btn[data-filter]")
        .forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
      applyFilters();
      savePrefs();
    });

    $("lf-reviews-filter")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".lf-toggle-btn[data-reviews-filter]");
      if (!btn) return;
      setReviewsFilterUi(btn.dataset.reviewsFilter);
      applyFilters();
      savePrefs();
    });

    $("lf-category-chips")?.addEventListener("click", (e) => {
      const chip = e.target.closest(".leads-chip[data-category]");
      if (!chip) return;
      togglePriorityCategory(chip.dataset.category);
      scrollToLeadGrid();
    });

    $("lf-workflow-view")?.addEventListener("change", (e) => {
      if (viewSelectSyncing) return;
      const v = e.target.value;
      if (WORKFLOW_VIEWS.some((w) => w.value === v)) {
        listView = v;
        applyFilters();
        savePrefs();
      } else {
        syncWorkflowSelectFromListView();
      }
    });

    $("lf-refresh")?.addEventListener("click", () => {
      refreshLeads();
    });

    window.addEventListener("rep-settings-ready", () => {
      if (document.body.dataset.page !== "leads") return;
      reloadPersonalMarks();
      applyPrefsToUi();
      if (allLeads.length) {
        allLeads = sortLeadsPinnedFirst(allLeads);
        applyFilters();
      }
    });

    window.addEventListener("rep-session-changed", () => {
      if (document.body.dataset.page !== "leads") return;
      reloadPersonalMarks();
      allLeads = sortLeadsPinnedFirst(allLeads);
      window.LeadSync?.refreshTeam?.().catch(() => {});
      if (leadsPageReady) applyFilters();
    });

    setMetricsLoading(true);
    loadLeads().catch((err) => {
      leadsPageReady = false;
      setMetricsLoading(false);
      ["lf-stat-total", "lf-stat-done"].forEach((id) => {
        const el = $(id);
        if (el) el.textContent = "—";
      });
      const grid = $("lf-grid");
      const msg = escapeHtml(err?.message || String(err));
      const looksLikeSupabase =
        /fetch|network|401|403|jwt|supabase|postgrest|failed to load/i.test(msg);
      if (grid) {
        grid.innerHTML =
          '<div class="leads-error card">' +
          `<p><strong>${looksLikeSupabase ? "Lead Finder could not connect to Supabase." : "Lead Finder could not load leads."}</strong></p>` +
          `<p class="muted">${msg}</p>` +
          (looksLikeSupabase
            ? '<p class="muted">Check: <code>supabase-full-setup.sql</code> was run, leads are imported into the <code>leads</code> table, and <code>js/config.js</code> has your project URL + publishable key. See <code>LEADS_DATABASE.md</code>.</p>'
            : '<p class="muted">Try a hard refresh (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>). If it persists, check the browser console.</p>') +
          "</div>";
      }
      console.error(err);
    });
  }

  function boot() {
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(init);
    else init();
  }

  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();

  window.LeadsPage = {
    loadLeads,
    applyFilters,
    refreshLeads,
    pinLeadForBuilder,
  };
})(window);
