/**
 * Per-rep settings synced to Supabase rep_settings.settings_json on login.
 * Includes: course/checklist progress, tracker, scripts, templates, UI prefs,
 * sidebar/nav, setup survey, Lead Finder prefs, saved/pinned leads, session meta,
 * payout local cache (rep_payouts table is the source of truth for payout links).
 */
(function (global) {
  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";

  const SYNC_KEYS = [
    "lpc_call_scripts_edits_v1",
    "lpc_custom_scripts_v1",
    "lpc_outreach_edits_v1",
    "lpc_custom_outreach_v1",
    "lpc_sales_tracker_v2",
    "lpc_sales_tracker_v1",
    "lpc_sales_onboarding_progress_v1",
    "lpc_sales_onboarding_steps_v1",
    "lpc_nav_collapsed_v1",
    "lpc_sidebar_collapsed_v1",
    "lpc_setup_survey_step_v1",
    "lpc_accounts_survey_step_v1",
    "lpc_setup_survey_flow_v1",
    "lpc_template_builder_v1",
    "lpc_lead_finder_prefs_v1",
    "lpc_lead_workflow_v1",
    "lpc_lead_saved_v1",
    "lpc_lead_pinned_v1",
    "lpc_leads_status_v1",
    "lpc_user_prefs_v1",
    "lpc_rep_payout_v1",
    "lpc_rep_payouts_list_v1",
    "lpc_rep_session_meta_v1",
  ];

  let client = null;
  let repId = null;
  let syncTimer = null;
  let ready = false;
  let initPromise = null;
  let initRepId = null;
  const readyWaiters = [];

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
      enabled: c.useRepSettingsSync !== false,
    };
  }

  function canSync() {
    const { url, key, enabled } = cfg();
    return enabled && !!(url && key && global.supabase?.createClient);
  }

  function repKey(base) {
    const id = repId || global.RepSession?.get?.()?.id;
    return id ? "lpc_rep_" + id + "_" + base : base;
  }

  function legacyWorkflowKey() {
    const id = repId || global.RepSession?.get?.()?.id || "anon";
    return "lpc_lead_workflow_" + id + "_v1";
  }

  function loadItem(base) {
    return localStorage.getItem(repKey(base));
  }

  function saveItem(base, value) {
    if (value === "" || value == null) {
      localStorage.removeItem(repKey(base));
    } else {
      localStorage.setItem(repKey(base), value);
    }
    scheduleSync();
  }

  function resetForRep() {
    initPromise = null;
    initRepId = null;
    ready = false;
    client = null;
    repId = null;
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  function clearSyncedLocalKeys() {
    SYNC_KEYS.forEach((base) => localStorage.removeItem(repKey(base)));
    localStorage.removeItem(legacyWorkflowKey());
    if (global.UserPrefs?.resetToDefaults) global.UserPrefs.resetToDefaults();
  }

  function migrateLegacyLocalKeys() {
    const legacy = localStorage.getItem(legacyWorkflowKey());
    if (legacy && loadItem("lpc_lead_workflow_v1") == null) {
      saveItem("lpc_lead_workflow_v1", legacy);
      localStorage.removeItem(legacyWorkflowKey);
    }
    const globalSidebar = localStorage.getItem("lpc_sidebar_collapsed_v1");
    if (globalSidebar != null && loadItem("lpc_sidebar_collapsed_v1") == null) {
      saveItem("lpc_sidebar_collapsed_v1", globalSidebar);
    }
  }

  function collectSettings() {
    const out = {};
    SYNC_KEYS.forEach((base) => {
      const raw = localStorage.getItem(repKey(base));
      if (raw == null || raw === "") return;
      try {
        out[base] = JSON.parse(raw);
      } catch (e) {
        out[base] = raw;
      }
    });
    return out;
  }

  function parseProgressObj(val) {
    if (val == null) return {};
    if (typeof val === "object" && !Array.isArray(val)) return { ...val };
    try {
      const parsed = JSON.parse(val);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function mergeProgressJson(cloudVal, localRaw) {
    const cloud = parseProgressObj(cloudVal);
    const local = parseProgressObj(localRaw);
    const merged = { ...cloud, ...local };
    const keys = new Set([...Object.keys(cloud), ...Object.keys(local)]);
    keys.forEach((k) => {
      if (cloud[k] || local[k]) merged[k] = true;
    });
    return JSON.stringify(merged);
  }

  function isEmptyCloudSettings(obj) {
    return !obj || typeof obj !== "object" || Object.keys(obj).length === 0;
  }

  function applySettings(obj) {
    if (isEmptyCloudSettings(obj)) {
      clearSyncedLocalKeys();
      return;
    }
    SYNC_KEYS.forEach((base) => {
      if (obj[base] === undefined) return;
      if (base === PROGRESS_KEY) {
        const localRaw = localStorage.getItem(repKey(base));
        localStorage.setItem(repKey(base), mergeProgressJson(obj[base], localRaw));
        return;
      }
      const val =
        typeof obj[base] === "string" ? obj[base] : JSON.stringify(obj[base]);
      localStorage.setItem(repKey(base), val);
    });
  }

  async function pull() {
    if (!client || !repId) return;
    const { data, error } = await client
      .from("rep_settings")
      .select("settings_json,rep_name")
      .eq("rep_id", repId)
      .maybeSingle();
    if (error) throw error;
    migrateLegacyLocalKeys();
    if (data?.settings_json) applySettings(data.settings_json);
    try {
      global.dispatchEvent(new Event("onboarding-progress-changed"));
    } catch (e) {
      /* ignore */
    }
    global.RepSession?.enforceTrackerIdentity?.();
  }

  async function push() {
    if (!client || !repId) return;
    const settings_json = collectSettings();
    const rep = global.RepSession?.get?.();
    const row = {
      rep_id: repId,
      settings_json,
      updated_at: new Date().toISOString(),
    };
    if (rep?.name) row.rep_name = rep.name;
    const { error } = await client
      .from("rep_settings")
      .upsert(row, { onConflict: "rep_id" });
    if (error) throw error;
  }

  function scheduleSync() {
    if (!client || !repId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      push().catch((e) => console.warn("Rep settings sync failed", e));
    }, 1200);
  }

  async function flushSync() {
    if (!client || !repId) return push();
    clearTimeout(syncTimer);
    syncTimer = null;
    return push();
  }

  function flushReady() {
    ready = true;
    const list = readyWaiters.splice(0);
    list.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn(e);
      }
    });
    global.dispatchEvent(new Event("rep-settings-ready"));
  }

  function whenReady(fn) {
    if (ready) fn();
    else readyWaiters.push(fn);
  }

  async function init() {
    const currentId = global.RepSession?.get?.()?.id || null;
    if (initPromise && initRepId !== currentId) {
      resetForRep();
    }
    if (!initPromise) {
      initRepId = currentId;
      initPromise = initOnce();
    }
    return initPromise;
  }

  async function initOnce() {
    ready = false;
    repId = global.RepSession?.get?.()?.id || null;
    initRepId = repId;
    global.RepSession?.enforceTrackerIdentity?.();

    if (!repId || !canSync()) {
      client = null;
      migrateLegacyLocalKeys();
      flushReady();
      return { mode: "local" };
    }

    try {
      const { url, key } = cfg();
      client = global.supabase.createClient(url, key);
      await pull();
      flushReady();
      return { mode: "cloud" };
    } catch (e) {
      console.warn("Rep settings: cloud unavailable, using this device", e);
      client = null;
      migrateLegacyLocalKeys();
      flushReady();
      return { mode: "local", error: true };
    }
  }

  function isCloud() {
    return !!client && !!repId;
  }

  global.RepStorage = {
    SYNC_KEYS,
    key: repKey,
    loadItem,
    saveItem,
    clearSyncedLocalKeys,
    scheduleSync,
    flushSync,
    init,
    resetForRep,
    whenReady,
    isCloud,
    push,
  };
})(window);
