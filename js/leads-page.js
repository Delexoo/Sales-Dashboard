(function (global) {
  let allLeads = [];
  let meta = {};
  let statusMap = {};
  let visible = [];
  /** @type {'default' | 'complete' | 'pending' | 'removed' | 'saved' | 'pinned'} */
  let listView = "default";

  const WORKFLOW_VIEWS = [
    { value: "default", label: "Active" },
    { value: "saved", label: "Quick Save" },
    { value: "pinned", label: "Pinned" },
    { value: "complete", label: "Completed" },
    { value: "pending", label: "Pending" },
    { value: "removed", label: "Removed" },
  ];
  const PREFS_KEY = "lpc_lead_finder_prefs_v1";
  const SAVED_KEY = "lpc_lead_saved_v1";
  const PINNED_KEY = "lpc_lead_pinned_v1";
  let savedIds = new Set();
  let pinnedIds = new Set();
  const DEFAULT_PREFS = { websiteFilter: "noweb", listView: "default" };
  const WEBSITE_FILTERS = ["web", "noweb", "all"];
  /** @type {{ setWorkflow: (id: string, workflow: string, name?: string) => Promise<void> } | null} */
  let syncApi = null;
  let menuDocBound = false;

  const $ = (id) => document.getElementById(id);

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
      };
    } catch (e) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs() {
    const prefs = {
      websiteFilter: getWebsiteFilter(),
      listView,
    };
    const json = JSON.stringify(prefs);
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(PREFS_KEY, json);
    else localStorage.setItem(repScopedKey(PREFS_KEY), json);
  }

  function applyPrefsToUi() {
    const prefs = loadPrefs();
    listView = prefs.listView;
    document.querySelectorAll(".lf-website-toggle .lf-toggle-btn").forEach((b) => {
      const on = b.dataset.filter === prefs.websiteFilter;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const sel = $("lf-workflow-view");
    if (sel) sel.value = listView;
  }

  function loadIdSet(key) {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(key)
        : localStorage.getItem(repScopedKey(key));
      const o = JSON.parse(raw || "{}");
      return new Set(Object.keys(o).filter((id) => o[id]));
    } catch (e) {
      return new Set();
    }
  }

  function saveIdSet(key, set) {
    const o = {};
    set.forEach((id) => {
      o[id] = true;
    });
    const json = JSON.stringify(o);
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(key, json);
    else localStorage.setItem(repScopedKey(key), json);
  }

  function reloadPersonalMarks() {
    savedIds = loadIdSet(SAVED_KEY);
    pinnedIds = loadIdSet(PINNED_KEY);
  }

  function isSaved(lead) {
    return savedIds.has(lead.id);
  }

  function isPinned(lead) {
    return pinnedIds.has(lead.id);
  }

  function toggleSaved(leadId) {
    if (savedIds.has(leadId)) savedIds.delete(leadId);
    else savedIds.add(leadId);
    saveIdSet(SAVED_KEY, savedIds);
  }

  function togglePinned(leadId) {
    if (pinnedIds.has(leadId)) pinnedIds.delete(leadId);
    else pinnedIds.add(leadId);
    saveIdSet(PINNED_KEY, pinnedIds);
  }

  function getLeadWorkflow(lead) {
    const s = statusMap[lead.id];
    let w = s?.workflow || (s?.called ? "complete" : "");
    if (w === "flagged") w = "";
    if (w) return w;
    if (window.LeadSync?.isConfigured?.()) return "";
    return lead.called ? "complete" : "";
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

  function isCompletedByMe(lead) {
    const me = getRepName().toLowerCase();
    const by = String(statusMap[lead.id]?.calledBy || "").trim().toLowerCase();
    if (!me || !by) return false;
    return by === me;
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
        const s = statusMap[l.id] || {};
        return (
          l.id +
          ":" +
          getLeadWorkflow(l) +
          ":" +
          (s.calledBy || "") +
          ":" +
          (s.calledAt || "")
        );
      })
      .join(",");
  }

  function isDefaultLead(lead) {
    return !getLeadWorkflow(lead);
  }

  function matchesWorkflowView(lead) {
    if (listView === "saved") return isSaved(lead);
    if (listView === "pinned") return isPinned(lead);
    const workflow = getLeadWorkflow(lead);
    if (listView === "default") return isDefaultLead(lead);
    if (listView === "removed") return workflow === "removed";
    return workflow === listView;
  }

  function countWorkflowView(view) {
    return allLeads.filter((lead) => {
      if (view === "saved") return isSaved(lead);
      if (view === "pinned") return isPinned(lead);
      if (view === "default") return isDefaultLead(lead);
      if (view === "removed") return getLeadWorkflow(lead) === "removed";
      return getLeadWorkflow(lead) === view;
    }).length;
  }

  function workflowLabel(workflow) {
    if (workflow === "complete") return "Complete";
    if (workflow === "pending") return "Pending";
    if (workflow === "removed") return "Removed";
    return "";
  }

  function workflowChipClass(workflow) {
    if (workflow === "complete") return "lf-status-chip-done";
    if (workflow === "pending") return "lf-status-chip-pending";
    return "lf-status-chip-muted";
  }

  function personalMarksSig() {
    return (
      Array.from(savedIds).sort().join(",") +
      "|" +
      Array.from(pinnedIds).sort().join(",")
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

  function shuffleLeads(leads) {
    const out = leads.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function getWebsiteFilter() {
    const active = document.querySelector(".lf-website-toggle .lf-toggle-btn.active");
    const v = active?.dataset.filter || "noweb";
    if (v === "web" || v === "all") return v;
    return "noweb";
  }

  function getFilters() {
    return {
      websiteFilter: getWebsiteFilter(),
    };
  }

  function matchesWebsiteFilter(lead, websiteFilter) {
    if (websiteFilter === "noweb") return !lead.hasWebsite;
    if (websiteFilter === "web") return !!lead.hasWebsite;
    return true;
  }

  function countCompleted() {
    return allLeads.filter((l) => isCompleted(l)).length;
  }

  function sortLeadsPinnedFirst(leads) {
    if (!pinnedIds.size) return leads;
    const byId = new Map(leads.map((l) => [l.id, l]));
    const ordered = [];
    pinnedIds.forEach((id) => {
      if (byId.has(id)) ordered.push(byId.get(id));
    });
    leads.forEach((lead) => {
      if (!pinnedIds.has(lead.id)) ordered.push(lead);
    });
    return ordered;
  }

  function applyFilters() {
    const f = getFilters();

    visible = allLeads.filter((lead) => {
      if (!matchesWebsiteFilter(lead, f.websiteFilter)) return false;
      return matchesWorkflowView(lead);
    });

    visible = sortLeadsPinnedFirst(visible);

    const grid = $("lf-grid");
    if (grid) delete grid.dataset.renderSig;
    updateViewUi();
    renderGrid();
    updateStats();
  }

  function updateViewUi() {
    const sel = $("lf-workflow-view");
    if (!sel) return;
    WORKFLOW_VIEWS.forEach(({ value, label }) => {
      const opt = sel.querySelector('option[value="' + value + '"]');
      if (!opt) return;
      const n = countWorkflowView(value);
      opt.textContent = n > 0 ? label + " (" + n + ")" : label;
    });
    sel.value = listView;
  }

  function updateCount() {
    const showingEl = $("lf-stat-showing");
    const hintEl = $("lf-count");
    const n = visible.length;
    if (showingEl) showingEl.textContent = String(n);

    if (!hintEl) return;
    if (n === 0 && allLeads.length > 0) {
      const f = getWebsiteFilter();
      const hint =
        f === "noweb"
          ? "No leads without a website — try Website or All."
          : f === "web"
            ? "No leads with a website — try No website or All."
            : listView === "complete"
              ? "No completed leads yet — yours and teammates show in split columns when marked Complete."
              : listView === "pending"
                ? "No pending leads yet — any rep can mark Pending for the team."
                : listView === "saved"
                  ? "Nothing in Quick Save yet — tap the heart on a card."
                  : listView === "pinned"
                    ? "No pinned leads — only you see pins."
                    : listView === "removed"
                      ? "No removed leads on your list."
                      : "No active leads.";
      hintEl.textContent = hint;
      hintEl.hidden = false;
      return;
    }
    if (listView === "complete" && n > 0) {
      const { mine, team } = splitCompleteLeads(visible);
      hintEl.textContent = mine.length + " yours · " + team.length + " by teammates";
      hintEl.hidden = false;
      return;
    }
    hintEl.textContent = "";
    hintEl.hidden = true;
  }

  function updateStats() {
    const total = meta.total || allLeads.length;
    if ($("lf-stat-total")) $("lf-stat-total").textContent = String(total);
    if ($("lf-stat-done")) $("lf-stat-done").textContent = String(countCompleted());
    updateCount();
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

  function renderCard(lead, opts) {
    opts = opts || {};
    const workflow = getLeadWorkflow(lead);
    const saved = isSaved(lead);
    const pinned = isPinned(lead);
    let cardMod =
      workflow === "complete"
        ? " lead-card--complete"
        : workflow === "pending"
          ? " lead-card--pending"
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

    const reviewsHtml = hasData
      ? `<span class="lf-reviews-line" title="Google Maps rating">
          <span data-icon="star" data-icon-class="lf-info-ico lf-reviews-star"></span>
          <span>${escapeHtml(line)}</span>
        </span>`
      : `<span class="lf-info-text lf-info-text--muted lf-detail-val-missing">No reviews</span>`;

    const websiteLabel = websiteUrl ? formatWebsiteLabel(websiteUrl) : "";
    const websiteHtml = websiteUrl
      ? `<a class="lf-info-text lf-info-link lf-website-link" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteLabel)}</a>`
      : `<span class="lf-info-text lf-info-text--muted lf-website-none">No Website</span>`;

    const sublineParts = [escapeHtml(bizCat)];
    if (opts.showTeamCompletedBy) {
      const by = String(statusMap[lead.id]?.calledBy || "").trim();
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
      <article class="lead-card card${cardMod}" data-id="${escapeHtml(lead.id)}">
        <div class="lf-card-accent" aria-hidden="true"></div>
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
              <button type="button" class="lf-mark-btn lf-mark-save${saved ? " is-on" : ""}" data-lead-save="${escapeHtml(lead.id)}" aria-label="${saved ? "Remove from Quick Save" : "Quick Save"}" aria-pressed="${saved ? "true" : "false"}" title="Quick Save">
                <span data-icon="heart" data-icon-class="lf-mark-ico"></span>
              </button>
              <button type="button" class="lf-mark-btn lf-mark-pin${pinned ? " is-on" : ""}" data-lead-pin="${escapeHtml(lead.id)}" aria-label="${pinned ? "Unpin lead" : "Pin lead"}" aria-pressed="${pinned ? "true" : "false"}" title="Pin">
                <span data-icon="pin" data-icon-class="lf-mark-ico"></span>
              </button>
            </div>
            ${statusChip}
            <div class="lf-card-menu-wrap">
              <button type="button" class="lf-menu-btn" data-lead-id="${escapeHtml(lead.id)}" aria-label="Lead options" aria-haspopup="true" aria-expanded="false">
                <span data-icon="circle-menu" data-icon-class="lf-menu-ico"></span>
              </button>
              <div class="lf-menu-panel" role="menu" hidden>
                ${
                  workflow
                    ? `<button type="button" class="lf-menu-item lf-menu-item-restore" role="menuitem" data-action="active" data-lead-id="${escapeHtml(lead.id)}">Back to Active</button>`
                    : ""
                }
                <button type="button" class="lf-menu-item${workflow === "complete" ? " is-active" : ""}" role="menuitem" data-action="complete" data-lead-id="${escapeHtml(lead.id)}">Complete (team)</button>
                <button type="button" class="lf-menu-item${workflow === "pending" ? " is-active" : ""}" role="menuitem" data-action="pending" data-lead-id="${escapeHtml(lead.id)}">Pending (team)</button>
                <button type="button" class="lf-menu-item lf-menu-item-danger${workflow === "removed" ? " is-active" : ""}" role="menuitem" data-action="removed" data-lead-id="${escapeHtml(lead.id)}">Remove</button>
              </div>
            </div>
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
          <button type="button" class="lf-action-btn lf-action-builder" data-lead-builder="${escapeHtml(lead.id)}" aria-label="Auto-fill Lead Builder for ${escapeHtml(bizName)}">
            <span data-icon="file-plus" data-icon-class="lf-action-ico"></span>
            Auto-Fill
          </button>
        </footer>
      </article>
    `;
  }

  function renderCompletePane(title, leads, paneClass, emptyText, cardOpts) {
    const cards =
      leads.length > 0
        ? leads.map((l) => renderCard(l, cardOpts)).join("")
        : '<p class="lf-complete-empty muted">' + escapeHtml(emptyText) + "</p>";
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

  function renderCompleteSplit() {
    const { mine, team } = splitCompleteLeads(visible);
    return (
      '<div class="lf-complete-split">' +
      renderCompletePane(
        "Your completed",
        mine,
        "lf-complete-pane--mine",
        "You have not marked any leads Complete yet.",
        { completedByLine: "You completed" }
      ) +
      renderCompletePane(
        "Team completed",
        team,
        "lf-complete-pane--team",
        "No other rep has completed a lead in this filter yet.",
        { showTeamCompletedBy: true }
      ) +
      "</div>"
    );
  }

  function renderGrid() {
    const grid = $("lf-grid");
    const empty = $("lf-empty");
    if (!grid) return;

    let sig = listView + "|" + personalMarksSig();
    if (listView === "complete") {
      const split = splitCompleteLeads(visible);
      sig +=
        "|" +
        statusSigForLeads(split.mine) +
        "|" +
        statusSigForLeads(split.team);
    } else {
      sig += "|" + statusSigForLeads(visible);
    }

    if (visible.length > 0 && grid.dataset.renderSig === sig) {
      if (empty) empty.hidden = true;
      return;
    }
    grid.dataset.renderSig = sig;

    if (visible.length === 0) {
      grid.innerHTML = "";
      grid.classList.remove("leads-grid--complete-split");
    } else if (listView === "complete") {
      grid.classList.add("leads-grid--complete-split");
      grid.innerHTML = renderCompleteSplit();
    } else {
      grid.classList.remove("leads-grid--complete-split");
      grid.innerHTML = visible.map((l) => renderCard(l)).join("");
    }

    if (empty) empty.hidden = visible.length > 0;

    if (window.SiteIcons) window.SiteIcons.initIcons(grid);
    bindCardActions();
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

  async function applyLeadWorkflow(leadId, workflow) {
    const lead = allLeads.find((l) => l.id === leadId);
    try {
      if (syncApi?.setWorkflow) {
        await syncApi.setWorkflow(leadId, workflow, lead?.name);
      } else {
        const map = { ...statusMap };
        if (workflow === "removed") {
          map[leadId] = { workflow: "removed", called: false };
        } else if (workflow === "pending") {
          map[leadId] = { workflow: "pending", called: false };
        } else if (workflow === "complete") {
          map[leadId] = { workflow: "complete", called: true };
        } else if (workflow === "active") {
          delete map[leadId];
        } else {
          delete map[leadId];
        }
        statusMap = map;
        applyFilters();
      }
    } catch (e) {
      console.error(e);
      alert("Could not save. Check team sync setup or try again.");
    }
  }

  function bindCardActions() {
    document.querySelectorAll(".lf-menu-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const wrap = btn.closest(".lf-card-menu-wrap");
        const panel = wrap?.querySelector(".lf-menu-panel");
        if (!wrap || !panel) return;
        const open = wrap.classList.contains("is-open");
        closeAllMenus();
        if (!open) {
          wrap.classList.add("is-open");
          panel.hidden = false;
          btn.setAttribute("aria-expanded", "true");
        }
      };
    });

    document.querySelectorAll(".lf-menu-item").forEach((item) => {
      item.onclick = async (e) => {
        e.stopPropagation();
        const id = item.dataset.leadId;
        const action = item.dataset.action;
        if (!id || !action) return;
        closeAllMenus();
        await applyLeadWorkflow(id, action);
      };
    });

    document.querySelectorAll("[data-lead-builder]").forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.leadBuilder;
        const lead = allLeads.find((l) => l.id === id);
        if (!id || !lead) return;
        if (!pinnedIds.has(id)) {
          pinnedIds.add(id);
          saveIdSet(PINNED_KEY, pinnedIds);
        }
        await applyLeadWorkflow(id, "pending");
        if (typeof global.forwardLeadToBuilder === "function") {
          global.forwardLeadToBuilder(lead);
        }
      };
    });

    document.querySelectorAll("[data-lead-save]").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.leadSave;
        if (!id) return;
        toggleSaved(id);
        const g = $("lf-grid");
        if (g) delete g.dataset.renderSig;
        updateViewUi();
        renderGrid();
      };
    });

    document.querySelectorAll("[data-lead-pin]").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.leadPin;
        if (!id) return;
        togglePinned(id);
        applyFilters();
      };
    });
  }

  function bindMenuDismiss() {
    if (menuDocBound) return;
    menuDocBound = true;
    document.addEventListener("click", closeAllMenus);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllMenus();
    });
  }

  let syncFilterTimer = null;
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
    clearTimeout(syncFilterTimer);
    const delay = listView === "complete" ? 120 : 300;
    syncFilterTimer = setTimeout(applyFilters, delay);
  }

  async function loadLeads() {
    const grid = $("lf-grid");
    if (grid) {
      grid.innerHTML = '<p class="leads-loading muted">Loading leads…</p>';
    }
    const loader = window.LeadsLoader;
    if (!loader?.load) throw new Error("LeadsLoader missing");
    const data = await loader.load();
    meta = data.meta || {};
    allLeads = shuffleLeads(data.leads || []);
    applyFilters();

    if (window.LeadSync) {
      window.LeadSync.init((map) => {
        scheduleFilterFromSync(map);
      })
        .then((api) => {
          syncApi = api;
        })
        .catch((e) => {
          console.warn("Lead sync unavailable, using this device only", e);
        });
    }
  }

  let pageReady = false;

  function init() {
    if (pageReady || document.body.dataset.page !== "leads") return;
    pageReady = true;
    bindMenuDismiss();
    reloadPersonalMarks();
    applyPrefsToUi();

    document.querySelector(".lf-website-toggle")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".lf-toggle-btn");
      if (!btn) return;
      document.querySelectorAll(".lf-website-toggle .lf-toggle-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      applyFilters();
      savePrefs();
    });

    $("lf-workflow-view")?.addEventListener("change", (e) => {
      const v = e.target.value;
      if (WORKFLOW_VIEWS.some((w) => w.value === v)) {
        listView = v;
        applyFilters();
        savePrefs();
      }
    });

    $("lf-refresh")?.addEventListener("click", () => {
      refreshLeads();
    });

    window.addEventListener("rep-settings-ready", () => {
      if (document.body.dataset.page !== "leads") return;
      reloadPersonalMarks();
      applyPrefsToUi();
      if (allLeads.length) applyFilters();
    });

    loadLeads().catch((err) => {
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

  window.LeadsPage = { loadLeads, applyFilters, refreshLeads };
})(window);
