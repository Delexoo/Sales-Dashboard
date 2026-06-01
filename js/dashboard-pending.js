/**
 * Dashboard — pending businesses marked in Lead Finder (this rep only).
 */
(function (global) {
  const $ = (id) => document.getElementById(id);

  let allLeads = [];
  let statusMap = {};
  let ready = false;
  let refreshTimer = null;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getRepId() {
    return String(global.RepSession?.get?.()?.id || "").trim();
  }

  function getRepName() {
    return String(global.RepSession?.getName?.() || global.RepSession?.get?.()?.name || "").trim();
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
      const atA = String(statusEntry(a.id)?.pendingAt || "");
      const atB = String(statusEntry(b.id)?.pendingAt || "");
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
        const when = formatTimeAgo(entry.pendingAt || "");
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

    if (global.SiteIcons) global.SiteIcons.initIcons(section);
  }

  function scheduleRender() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (ready) render();
    }, 80);
  }

  async function loadData() {
    const loader = global.LeadsLoader;
    if (!loader?.load) {
      ready = true;
      render();
      return;
    }

    try {
      const result = await loader.load();
      allLeads = result.leads || [];
    } catch (e) {
      console.warn("Dashboard pending: could not load leads", e);
      allLeads = [];
    }

    if (global.LeadSync?.init) {
      try {
        await global.LeadSync.init((map) => {
          statusMap = map || {};
          scheduleRender();
        });
      } catch (e) {
        console.warn("Dashboard pending: sync unavailable", e);
      }
    }

    ready = true;
    render();
  }

  let started = false;

  function init() {
    if (document.body.dataset.page !== "home" || !$("dash-pending-section")) return;
    if (started) {
      scheduleRender();
      return;
    }
    started = true;

    loadData();

    global.addEventListener("rep-session-changed", () => {
      ready = false;
      loadData();
    });
  }

  global.DashboardPending = { init, refresh: () => scheduleRender() };
})(window);
