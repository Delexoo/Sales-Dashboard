/**
 * Per-rep settings: scripts, outreach, tracker, checklist, Lead Builder prefs.
 * Stored per rep in localStorage and synced to Supabase when configured.
 */
(function (global) {
  const SYNC_KEYS = [
    "lpc_call_scripts_edits_v1",
    "lpc_custom_scripts_v1",
    "lpc_outreach_edits_v1",
    "lpc_custom_outreach_v1",
    "lpc_sales_tracker_v2",
    "lpc_sales_onboarding_progress_v1",
    "lpc_sales_onboarding_steps_v1",
    "lpc_nav_collapsed_v1",
    "lpc_template_builder_v1",
    "lpc_lead_finder_prefs_v1",
    "lpc_user_prefs_v1",
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

  function loadItem(base) {
    return localStorage.getItem(repKey(base));
  }

  function saveItem(base, value) {
    localStorage.setItem(repKey(base), value);
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

  function collectSettings() {
    const out = {};
    SYNC_KEYS.forEach((base) => {
      const raw = localStorage.getItem(repKey(base));
      if (raw == null) return;
      try {
        out[base] = JSON.parse(raw);
      } catch (e) {
        out[base] = raw;
      }
    });
    return out;
  }

  function applySettings(obj) {
    if (!obj || typeof obj !== "object") return;
    SYNC_KEYS.forEach((base) => {
      if (obj[base] === undefined) return;
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
    if (data?.settings_json) applySettings(data.settings_json);
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
    scheduleSync,
    init,
    resetForRep,
    whenReady,
    isCloud,
    push,
  };
})(window);
