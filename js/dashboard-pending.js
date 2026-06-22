/**
 * Dashboard — pending businesses marked in Lead Finder (this rep only).
 */
(function (global) {
  const WORKFLOW_KEY = "lpc_lead_workflow_v1";

  const $ = (id) => document.getElementById(id);

  let allLeads = [];
  let statusMap = {};
  let syncApi = null;
  let ready = false;
  let refreshTimer = null;
  let started = false;
  let inited = false;
  let unsubSync = null;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getRepId() {
    return String(
      global.RepSession?.getId?.() || global.RepSession?.get?.()?.id || ""
    ).trim();
  }

  function getRepName() {
    return String(
      global.RepSession?.getName?.() || global.RepSession?.get?.()?.name || ""
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

  function statusEntry(leadId) {
    return statusMap[String(leadId)] || statusMap[leadId] || null;
  }

  function leadFromStatusEntry(id, entry) {
    const name = String(entry?.businessName || entry?.business_name || "").trim();
    return {
      id,
      name: name || "Business",
      category: "Pending",
      categoryGroup: "Pending",
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

  /** Pending saved locally before team sync finishes (this device only). */
  function mergeLocalPendingOverlay() {
    if (!getRepId()) return;
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(WORKFLOW_KEY)
        : null;
      const overlay = raw ? JSON.parse(raw) : {};
      Object.entries(overlay).forEach(([id, entry]) => {
        if (entry?.workflow !== "pending") return;
        const sid = String(id);
        const existing = statusMap[sid];
        if (existing?.workflow === "pending" && isOwnerMatch(existing.pendingById, existing.pendingBy)) {
          return;
        }
        statusMap[sid] = {
          workflow: "pending",
          called: false,
          pendingBy: getRepName(),
          pendingById: getRepId(),
          pendingAt: entry.pendingAt || new Date().toISOString(),
          businessName: existing?.businessName || entry.businessName || "",
        };
      });
    } catch (e) {
      /* ignore */
    }
  }

  function getMyPendingLeads() {
    const byId = new Map(allLeads.map((l) => [String(l.id), l]));
    const out = [];
    const seen = new Set();

    Object.entries(statusMap).forEach(([id, entry]) => {
      const sid = String(id);
      if (entry?.workflow !== "pending" || seen.has(sid)) return;
      if (!isOwnerMatch(entry.pendingById || entry.calledById, entry.pendingBy || entry.calledBy)) {
        return;
      }
      seen.add(sid);
      out.push(byId.get(sid) || leadFromStatusEntry(sid, entry));
    });

    return out.sort((a, b) => {
      const atA = String(statusEntry(a.id)?.pendingAt || statusEntry(a.id)?.calledAt || "");
      const atB = String(statusEntry(b.id)?.pendingAt || statusEntry(b.id)?.calledAt || "");
      if (atA !== atB) return atB.localeCompare(atA);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "";
    const sec = Math.floor((Date.now() - then.getTime()) / 1000);
    if (sec < 45) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? "1 min ago" : min + " min ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? "1 hr ago" : hr + " hr ago";
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? "1 day ago" : day + " days ago";
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function telHref(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 10) return "tel:+1" + digits;
    if (digits.length === 11 && digits[0] === "1") return "tel:+" + digits;
    return digits.length >= 7 ? "tel:+" + digits : "";
  }

  function businessName(lead) {
    const fromLead = String(lead.name || "").trim();
    const fromStatus = String(statusEntry(lead.id)?.businessName || "").trim();
    return fromLead || fromStatus || "Business";
  }

  async function ensureSyncApi() {
    if (syncApi?.setWorkflow) return syncApi;
    if (!global.LeadSync?.init) return null;
    syncApi = await global.LeadSync.init(applyStatusMap);
    return syncApi;
  }

  async function cancelPending(leadId, name) {
    const id = String(leadId || "").trim();
    if (!id) return;
    const before = { ...statusMap };
    const next = { ...statusMap };
    delete next[id];
    statusMap = next;
    render();

    try {
      const api = await ensureSyncApi();
      if (!api?.setWorkflow) throw new Error("Lead sync unavailable");
      await api.setWorkflow(id, "active", name);
    } catch (e) {
      statusMap = before;
      render();
      console.error(e);
      alert("Could not cancel pending. Try again.");
    }
  }

  async function completePending(leadId, name) {
    const id = String(leadId || "").trim();
    if (!id) return;
    const before = { ...statusMap };
    const prev = statusMap[id] || {};
    const now = new Date().toISOString();
    const next = { ...statusMap };
    next[id] = {
      ...prev,
      workflow: "complete",
      called: true,
      calledBy: getRepName(),
      calledById: getRepId(),
      calledAt: now,
      businessName: String(name || prev.businessName || "").trim(),
    };
    delete next[id].pendingAt;
    statusMap = next;
    render();

    try {
      global.LeadSync?.clearPendingLocalSnapshot?.(id);
      const api = await ensureSyncApi();
      if (!api?.setWorkflow) throw new Error("Lead sync unavailable");
      await api.setWorkflow(id, "complete", name);
    } catch (e) {
      statusMap = before;
      render();
      console.error(e);
      alert("Could not mark complete. Try again.");
    }
  }

  function applyStatusMap(map) {
    statusMap = map || {};
    mergeLocalPendingOverlay();
    scheduleRender();
  }

  function render() {
    const section = $("dash-pending-section");
    if (!section) return;

    const list = $("dash-pending-list");
    const empty = $("dash-pending-empty");
    const countEl = $("dash-pending-count");
    const pending = getMyPendingLeads();

    if (countEl) {
      countEl.textContent =
        pending.length === 1 ? "1 pending" : pending.length + " pending";
    }

    if (!list) return;

    if (!pending.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      section.classList.toggle("dash-pending-section--empty", true);
      if (ready) section.classList.add("dash-pending-ready");
      return;
    }

    if (empty) empty.hidden = true;
    section.classList.remove("dash-pending-section--empty");

    const leadsUrl =
      (global.SITE_CONFIG && global.SITE_CONFIG.leadsListUrl) || "leads.html";

    list.innerHTML = pending
      .map((lead) => {
        const id = esc(lead.id);
        const name = esc(businessName(lead));
        const entry = statusEntry(lead.id) || {};
        const when = formatTimeAgo(entry.pendingAt || entry.calledAt || "");
        const phone = String(lead.phone || "").trim();
        const tel = telHref(phone);
        const cat = String(lead.categoryGroup || lead.category || "").trim();
        const meta = [when, cat].filter(Boolean).join(" · ");

        return (
          '<li class="dash-pending-item">' +
          '<div class="dash-pending-item-main">' +
          '<strong class="dash-pending-name">' +
          name +
          "</strong>" +
          (meta ? '<span class="dash-pending-meta">' + esc(meta) + "</span>" : "") +
          (phone ? '<span class="dash-pending-phone">' + esc(phone) + "</span>" : "") +
          "</div>" +
          '<div class="dash-pending-item-actions">' +
          (tel
            ? '<a class="btn secondary dash-pending-btn" href="' +
              esc(tel) +
              '" data-icon="phone" data-icon-class="ico-btn">Call</a>'
            : "") +
          '<button type="button" class="btn secondary dash-pending-btn" data-dash-build-lead="' +
          id +
          '" data-icon="hammer" data-icon-class="ico-btn">Build Lead</button>' +
          '<button type="button" class="btn secondary dash-pending-btn dash-pending-btn--complete" data-dash-complete-pending="' +
          id +
          '" data-icon="check" data-icon-class="ico-btn">Complete</button>' +
          '<button type="button" class="btn secondary dash-pending-btn dash-pending-btn--cancel" data-dash-cancel-pending="' +
          id +
          '">Cancel</button>' +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    const viewAll = $("dash-pending-view-all");
    if (viewAll) viewAll.href = leadsUrl + "#pending";

    list.querySelectorAll("[data-dash-build-lead]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-dash-build-lead");
        const lead = pending.find((l) => String(l.id) === String(id));
        if (!lead || typeof global.forwardLeadToBuilder !== "function") return;
        global.forwardLeadToBuilder(lead);
      });
    });

    list.querySelectorAll("[data-dash-complete-pending]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-dash-complete-pending");
        const lead = pending.find((l) => String(l.id) === String(id));
        if (!id || !lead) return;
        void completePending(id, businessName(lead));
      });
    });

    list.querySelectorAll("[data-dash-cancel-pending]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-dash-cancel-pending");
        const lead = pending.find((l) => String(l.id) === String(id));
        if (!id || !lead) return;
        void cancelPending(id, businessName(lead));
      });
    });

    if (global.SiteIcons) global.SiteIcons.initIcons(section);
    if (ready) section.classList.add("dash-pending-ready");
  }

  function scheduleRender() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (ready) render();
    }, 80);
  }

  async function loadData() {
    if (!getRepId()) {
      ready = true;
      statusMap = {};
      render();
      return;
    }

    const loader = global.LeadsLoader;
    if (loader?.load) {
      try {
        const result = await loader.load();
        allLeads = result.leads || [];
      } catch (e) {
        console.warn("Dashboard pending: could not load leads", e);
        allLeads = [];
      }
    }

    if (unsubSync) {
      unsubSync();
      unsubSync = null;
    }

    if (global.LeadSync?.addUpdateListener) {
      unsubSync = global.LeadSync.addUpdateListener(applyStatusMap);
    }

    if (global.LeadSync?.init) {
      try {
        syncApi = await global.LeadSync.init(applyStatusMap);
        if (global.LeadSync.refreshTeam) {
          await global.LeadSync.refreshTeam();
        }
      } catch (e) {
        console.warn("Dashboard pending: sync unavailable", e);
        mergeLocalPendingOverlay();
        scheduleRender();
      }
    } else {
      mergeLocalPendingOverlay();
    }

    ready = true;
    render();
  }

  function refresh() {
    if (document.body.dataset.page !== "home") return;
    if (!getRepId()) return;
    if (!started) {
      start();
      return;
    }
    if (global.LeadSync?.refreshTeam) {
      global.LeadSync.refreshTeam().catch((e) => {
        console.warn("Dashboard pending: refresh failed", e);
      });
      return;
    }
    loadData();
  }

  function start() {
    if (document.body.dataset.page !== "home" || !$("dash-pending-section")) return;
    if (!getRepId()) return;

    if (started) {
      refresh();
      return;
    }
    started = true;
    loadData();
  }

  function init() {
    const run = () => {
      if (global.RepStorage?.whenReady) {
        global.RepStorage.whenReady(start);
      } else {
        start();
      }
    };

    if (global.SiteLock?.whenUnlocked) {
      global.SiteLock.whenUnlocked(run);
    } else {
      run();
    }

    global.addEventListener("site-unlocked", run);
    global.addEventListener("rep-session-changed", () => {
      started = false;
      syncApi = null;
      if (unsubSync) {
        unsubSync();
        unsubSync = null;
      }
      run();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });

    global.addEventListener("pageshow", (e) => {
      if (e.persisted) refresh();
    });

    global.addEventListener("rep-settings-synced", refresh);
  }

  global.DashboardPending = { init, refresh, render, cancelPending, completePending };

  if (document.body.dataset.page === "home") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
