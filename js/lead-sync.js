/**
 * Team lead workflow — Complete is shared with all reps; Pending locks a lead
 * out of everyone else's Active list until the owner sets Active or Complete.
 * Per-rep overlay: Removed only. Quick Save + Pin live in leads-page (RepStorage).
 */
(function (global) {
  const STATUS_KEY = "lpc_leads_status_v1";
  const TRACKER_KEY = "lpc_sales_tracker_v2";

  let mode = "local";
  let client = null;
  let channel = null;
  let onUpdate = null;
  let realtimeTimer = null;
  let lastMapJson = "";
  /** null = unknown, true/false after first fetch */
  let hasWorkflowColumn = null;
  let hasCalledByIdColumn = null;

  const WORKFLOW_KEY = "lpc_lead_workflow_v1";
  const TEAM_SELECT_WITH_WORKFLOW =
    "lead_id,business_name,called,called_by,called_by_id,called_at,workflow";
  const TEAM_SELECT_LEGACY = "lead_id,business_name,called,called_by,called_at";

  function loadWorkflowRaw() {
    if (global.RepStorage?.loadItem) return global.RepStorage.loadItem(WORKFLOW_KEY);
    const id = global.RepSession?.get?.()?.id;
    const key = id ? "lpc_rep_" + id + "_" + WORKFLOW_KEY : WORKFLOW_KEY;
    return localStorage.getItem(key);
  }

  function saveWorkflowRaw(json) {
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(WORKFLOW_KEY, json);
    else {
      const id = global.RepSession?.get?.()?.id;
      const key = id ? "lpc_rep_" + id + "_" + WORKFLOW_KEY : WORKFLOW_KEY;
      localStorage.setItem(key, json);
    }
  }

  function loadWorkflowOverlay() {
    try {
      return JSON.parse(loadWorkflowRaw() || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveWorkflowOverlay(overlay) {
    saveWorkflowRaw(JSON.stringify(overlay || {}));
  }

  function saveWorkflowOverlayEntry(leadId, workflow) {
    const overlay = loadWorkflowOverlay();
    const w = String(workflow || "").trim();
    if (!w) {
      delete overlay[leadId];
    } else {
      overlay[leadId] = { workflow: w, called: false };
    }
    saveWorkflowOverlay(overlay);
  }

  function applyWorkflow(map, leadId, workflow, businessName) {
    const next = { ...(map || {}) };
    let w = String(workflow || "").trim();
    if (w === "active") w = "";
    if (w === "removed") {
      next[leadId] = { workflow: "removed", called: false };
    } else if (w === "pending") {
      next[leadId] = {
        workflow: "pending",
        called: false,
        pendingBy: getRepName(),
        pendingById: getRepId(),
        pendingAt: new Date().toISOString(),
      };
    } else if (w === "not-interested") {
      next[leadId] = {
        workflow: "not-interested",
        called: false,
        calledBy: getRepName(),
        calledById: getRepId(),
        calledAt: new Date().toISOString(),
      };
    } else if (w === "complete") {
      next[leadId] = {
        workflow: "complete",
        called: true,
        calledBy: getRepName(),
        calledById: getRepId(),
        calledAt: new Date().toISOString(),
      };
    } else {
      delete next[leadId];
    }
    if (businessName && next[leadId]) {
      next[leadId].businessName = String(businessName).trim();
    }
    return next;
  }

  /** Only per-rep "removed" — not team Complete/Pending. */
  function mergePersonalOverlay(map) {
    const overlay = loadWorkflowOverlay();
    Object.keys(overlay).forEach((id) => {
      const w = overlay[id]?.workflow;
      if (w === "removed") {
        map[id] = { ...(map[id] || {}), ...overlay[id], workflow: "removed", called: false };
      }
    });
    return map;
  }

  function mapSignature(map) {
    const keys = Object.keys(map || {}).sort();
    const parts = keys.map((id) => {
      const s = map[id] || {};
      const w = s.workflow || (s.called ? "complete" : "");
      return (
        id +
        ":" +
        w +
        ":" +
        (s.called ? "1" : "0") +
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
    });
    return parts.join("|");
  }

  function normalizeEntry(entry) {
    let workflow = entry?.workflow || (entry?.called ? "complete" : "");
    if (workflow === "flagged") workflow = "";
    const called = workflow === "complete" || !!entry?.called;
    return {
      ...entry,
      workflow: workflow || (called ? "complete" : ""),
      called,
    };
  }

  function emitUpdate(map, meta) {
    if (!onUpdate) return;
    const sig = mapSignature(map);
    if (sig === lastMapJson) return;
    lastMapJson = sig;
    onUpdate(map, meta);
  }

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
    };
  }

  function canUseTeam() {
    const { url, key } = cfg();
    return !!(url && key && global.supabase?.createClient);
  }

  function getRepId() {
    return String(global.RepSession?.get?.()?.id || "").trim();
  }

  function getRepName() {
    const fromPin = global.RepSession?.getName?.();
    if (fromPin) return fromPin;
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(TRACKER_KEY)
        : localStorage.getItem(TRACKER_KEY);
      const data = JSON.parse(raw || "{}");
      return String(data.name || "").trim() || "Rep";
    } catch (e) {
      return "Rep";
    }
  }

  function loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveLocal(map) {
    localStorage.setItem(STATUS_KEY, JSON.stringify(map));
  }

  function rowWorkflow(row) {
    const w = String(row?.workflow || "").trim();
    if (w === "pending") return "pending";
    if (w === "not-interested") return "not-interested";
    if (w === "complete" || row?.called) return "complete";
    if (row?.called_by && !row?.called) return "pending";
    return "";
  }

  function rowsToMap(rows) {
    const map = {};
    (rows || []).forEach((row) => {
      const workflow = rowWorkflow(row);
      if (!workflow) return;
      map[row.lead_id] = normalizeEntry({
        called: workflow === "complete",
        workflow,
        calledBy: row.called_by || "",
        calledById: row.called_by_id || "",
        calledAt: row.called_at || "",
        pendingBy: workflow === "pending" ? row.called_by || "" : "",
        pendingById: workflow === "pending" ? row.called_by_id || "" : "",
        pendingAt: workflow === "pending" ? row.called_at || "" : "",
        businessName: row.business_name || "",
      });
    });
    return mergePersonalOverlay(map);
  }

  async function fetchTeam() {
    let select = TEAM_SELECT_WITH_WORKFLOW;
    if (hasWorkflowColumn === false) select = TEAM_SELECT_LEGACY;
    else if (hasCalledByIdColumn === false) {
      select = "lead_id,business_name,called,called_by,called_at,workflow";
    }
    const { data, error } = await client.from("lead_status").select(select);
    if (error) {
      const msg = String(error.message || error);
      if (
        hasWorkflowColumn !== false &&
        /workflow|column.*does not exist/i.test(msg)
      ) {
        hasWorkflowColumn = false;
        return fetchTeam();
      }
      if (
        hasCalledByIdColumn !== false &&
        /called_by_id|column.*does not exist/i.test(msg)
      ) {
        hasCalledByIdColumn = false;
        return fetchTeam();
      }
      throw error;
    }
    if (hasWorkflowColumn !== true && select.includes("workflow")) {
      hasWorkflowColumn = true;
    }
    if (hasCalledByIdColumn !== true && select.includes("called_by_id")) {
      hasCalledByIdColumn = true;
    }
    return rowsToMap(data);
  }

  async function upsertTeam(leadId, workflow, businessName) {
    const w = String(workflow || "").trim();
    const row = {
      lead_id: leadId,
      called: w === "complete",
      called_by:
        w === "complete" || w === "pending" || w === "not-interested" ? getRepName() : null,
      called_by_id:
        w === "complete" || w === "pending" || w === "not-interested" ? getRepId() || null : null,
      called_at:
        w === "complete" || w === "pending" || w === "not-interested"
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    };
    if (hasWorkflowColumn !== false) row.workflow = w || null;
    const name = String(businessName || "").trim();
    if (name) row.business_name = name;
    let { error } = await client.from("lead_status").upsert(row, { onConflict: "lead_id" });
    if (
      error &&
      hasWorkflowColumn !== false &&
      /workflow|column.*does not exist/i.test(String(error.message || error))
    ) {
      hasWorkflowColumn = false;
      delete row.workflow;
      ({ error } = await client.from("lead_status").upsert(row, { onConflict: "lead_id" }));
    }
    if (
      error &&
      /called_by_id|column.*does not exist/i.test(String(error.message || error))
    ) {
      delete row.called_by_id;
      ({ error } = await client.from("lead_status").upsert(row, { onConflict: "lead_id" }));
    }
    if (error) throw error;
  }

  async function clearTeamStatus(leadId, businessName) {
    const row = {
      lead_id: leadId,
      called: false,
      called_by: null,
      called_by_id: null,
      called_at: null,
      updated_at: new Date().toISOString(),
    };
    if (hasWorkflowColumn !== false) row.workflow = null;
    const name = String(businessName || "").trim();
    if (name) row.business_name = name;
    let { error } = await client.from("lead_status").upsert(row, { onConflict: "lead_id" });
    if (
      error &&
      hasWorkflowColumn !== false &&
      /workflow|column.*does not exist/i.test(String(error.message || error))
    ) {
      hasWorkflowColumn = false;
      delete row.workflow;
      ({ error } = await client.from("lead_status").upsert(row, { onConflict: "lead_id" }));
    }
    if (
      error &&
      /called_by_id|column.*does not exist/i.test(String(error.message || error))
    ) {
      delete row.called_by_id;
      ({ error } = await client.from("lead_status").upsert(row, { onConflict: "lead_id" }));
    }
    if (error) throw error;
  }

  async function deleteTeamStatus(leadId) {
    const { error } = await client.from("lead_status").delete().eq("lead_id", leadId);
    if (error) throw error;
  }

  async function migrateLocalToTeam() {
    const local = loadLocal();
    const overlay = loadWorkflowOverlay();
    const ids = new Set([
      ...Object.keys(local).filter((id) => local[id]?.called),
      ...Object.keys(overlay).filter((id) => overlay[id]?.workflow === "pending"),
    ]);
    for (const id of ids) {
      try {
        if (local[id]?.called) {
          await upsertTeam(id, "complete", local[id]?.businessName);
        } else if (overlay[id]?.workflow === "pending") {
          await upsertTeam(id, "pending", overlay[id]?.businessName);
          saveWorkflowOverlayEntry(id, "");
        }
      } catch (e) {
        console.warn("Lead sync migrate:", id, e);
      }
    }
    localStorage.removeItem(STATUS_KEY);
  }

  function subscribeTeam() {
    if (!client || channel) return;
    if (global.SITE_CONFIG?.useLeadStatusRealtime === false) return;
    channel = client
      .channel("lead_status_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_status" },
        () => {
          clearTimeout(realtimeTimer);
          realtimeTimer = setTimeout(async () => {
            try {
              const map = await fetchTeam();
              emitUpdate(map, { mode: "team", source: "realtime" });
            } catch (e) {
              console.warn("Lead sync realtime refresh failed", e);
            }
          }, 800);
        }
      )
      .subscribe();
  }

  function buildLocalApi() {
    return {
      mode: "local",
      async setWorkflow(leadId, workflow, businessName) {
        let map = {};
        Object.entries(loadLocal()).forEach(([id, entry]) => {
          const n = normalizeEntry(entry);
          if (
            n.workflow === "complete" ||
            n.workflow === "pending" ||
            n.workflow === "not-interested"
          )
            map[id] = n;
        });
        if (workflow === "removed") {
          saveWorkflowOverlayEntry(leadId, "removed");
        } else {
          saveWorkflowOverlayEntry(leadId, "");
          map = applyWorkflow(map, leadId, workflow, businessName);
        }
        const persist = {};
        Object.entries(map).forEach(([id, entry]) => {
          if (
            entry.workflow === "complete" ||
            entry.workflow === "pending" ||
            entry.workflow === "not-interested"
          )
            persist[id] = entry;
        });
        saveLocal(persist);
        emitUpdate(mergePersonalOverlay(map), { mode: "local" });
      },
      async setCalled(leadId, called, businessName) {
        return this.setWorkflow(leadId, called ? "complete" : "active", businessName);
      },
    };
  }

  async function init(callback) {
    onUpdate = callback;

    if (!canUseTeam()) {
      mode = "local";
      let map = {};
      Object.entries(loadLocal()).forEach(([id, entry]) => {
        const n = normalizeEntry(entry);
        if (
          n.workflow === "complete" ||
          n.workflow === "pending" ||
          n.workflow === "not-interested"
        )
          map[id] = n;
      });
      emitUpdate(mergePersonalOverlay(map), { mode: "local" });
      return buildLocalApi();
    }

    try {
      const { url, key } = cfg();
      client = global.supabase.createClient(url, key);
      mode = "team";

      await migrateLocalToTeam();
      const map = await fetchTeam();
      emitUpdate(map, { mode: "team" });
      subscribeTeam();

      return {
        mode: "team",
        async setWorkflow(leadId, workflow, businessName) {
          const w = String(workflow || "").trim();
          if (w === "removed") {
            saveWorkflowOverlayEntry(leadId, "removed");
          } else {
            saveWorkflowOverlayEntry(leadId, "");
            if (!w || w === "active") {
              await clearTeamStatus(leadId, businessName);
              try {
                await deleteTeamStatus(leadId);
              } catch (e) {
                /* delete optional — upsert clear is enough; needs delete RLS policy */
              }
            } else if (w === "complete" || w === "pending" || w === "not-interested") {
              await upsertTeam(leadId, w, businessName);
            }
          }
          const next = await fetchTeam();
          emitUpdate(next, { mode: "team" });
        },
        async setCalled(leadId, called, businessName) {
          return this.setWorkflow(leadId, called ? "complete" : "active", businessName);
        },
      };
    } catch (e) {
      console.error("LeadSync: could not connect, using this device only", e);
      mode = "local";
      emitUpdate(mergePersonalOverlay(loadLocal()), { mode: "local", error: true });
      return buildLocalApi();
    }
  }

  function getMode() {
    return mode;
  }

  async function refreshTeam() {
    if (!client) return null;
    const map = await fetchTeam();
    emitUpdate(map, { mode: "team", source: "refresh" });
    return map;
  }

  function isConfigured() {
    return canUseTeam();
  }

  global.LeadSync = { init, getMode, isConfigured, refreshTeam };
})(window);
