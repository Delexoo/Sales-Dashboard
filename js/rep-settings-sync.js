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
    "lpc_sidebar_width_v1",
    "lpc_setup_survey_step_v1",
    "lpc_accounts_survey_step_v1",
    "lpc_preferences_survey_step_v1",
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
    "lpc_rep_profile_photo_v1",
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

  function pinnedIdsFromValue(val) {
    if (Array.isArray(val)) {
      return val.map((id) => String(id || "").trim()).filter(Boolean);
    }
    if (val && typeof val === "object") {
      return Object.keys(val)
        .filter((id) => val[id])
        .map((id) => String(id).trim())
        .filter(Boolean);
    }
    if (typeof val === "string") {
      try {
        return pinnedIdsFromValue(JSON.parse(val));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /** Keep local pins when cloud settings load before the latest pin was pushed. */
  function pickLatestIso(a, b) {
    const ta = a ? new Date(a).getTime() : NaN;
    const tb = b ? new Date(b).getTime() : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return "";
    if (Number.isNaN(ta)) return b;
    if (Number.isNaN(tb)) return a;
    return ta >= tb ? a : b;
  }

  /** Keep the fresher online timestamp when cloud settings load on refresh. */
  function mergeSessionMetaJson(cloudVal, localRaw) {
    let local = {};
    let cloud = cloudVal;
    try {
      local = localRaw ? JSON.parse(localRaw) : {};
    } catch (e) {
      local = {};
    }
    if (typeof cloud === "string") {
      try {
        cloud = JSON.parse(cloud);
      } catch (e) {
        cloud = {};
      }
    }
    if (!cloud || typeof cloud !== "object") cloud = {};

    const merged = { ...cloud, ...local };
    const lastOnlineAt = pickLatestIso(cloud.lastOnlineAt, local.lastOnlineAt);
    const lastLoginAt = pickLatestIso(cloud.lastLoginAt, local.lastLoginAt);
    if (lastOnlineAt) merged.lastOnlineAt = lastOnlineAt;
    if (lastLoginAt) merged.lastLoginAt = lastLoginAt;
    if (local.activeSince) merged.activeSince = local.activeSince;
    merged.activeMs = Math.max(Number(cloud.activeMs) || 0, Number(local.activeMs) || 0);
    merged.loginCount = Math.max(Number(cloud.loginCount) || 0, Number(local.loginCount) || 0);
    if (cloud.firstLoginAt && !merged.firstLoginAt) merged.firstLoginAt = cloud.firstLoginAt;
    return JSON.stringify(merged);
  }

  function mergePinnedJson(cloudVal, localRaw) {
    let local = [];
    try {
      local = pinnedIdsFromValue(localRaw ? JSON.parse(localRaw) : []);
    } catch (e) {
      local = [];
    }
    const cloud = pinnedIdsFromValue(cloudVal);
    const out = [];
    const seen = new Set();
    local.concat(cloud).forEach((id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return JSON.stringify(out);
  }

  function isEmptyCloudSettings(obj) {
    return !obj || typeof obj !== "object" || Object.keys(obj).length === 0;
  }

  function applySettings(obj) {
    if (isEmptyCloudSettings(obj)) {
      if (!global.sessionStorage?.getItem?.("lpc_lead_pick_v1")) {
        clearSyncedLocalKeys();
      }
      return;
    }
    SYNC_KEYS.forEach((base) => {
      if (obj[base] === undefined) return;
      if (base === PROGRESS_KEY) {
        const localRaw = localStorage.getItem(repKey(base));
        localStorage.setItem(repKey(base), mergeProgressJson(obj[base], localRaw));
        return;
      }
      if (base === "lpc_lead_pinned_v1") {
        const localRaw = localStorage.getItem(repKey(base));
        localStorage.setItem(repKey(base), mergePinnedJson(obj[base], localRaw));
        return;
      }
      if (base === "lpc_rep_session_meta_v1") {
        const localRaw = localStorage.getItem(repKey(base));
        localStorage.setItem(repKey(base), mergeSessionMetaJson(obj[base], localRaw));
        return;
      }
      if (base === "lpc_template_builder_v1") {
        const localRaw = localStorage.getItem(repKey(base));
        let local = {};
        try {
          local = localRaw ? JSON.parse(localRaw) : {};
        } catch (e) {
          local = {};
        }
        const cloud =
          obj[base] && typeof obj[base] === "object" ? obj[base] : {};
        const merged = { ...cloud, ...local };
        try {
          const pickRaw = global.sessionStorage?.getItem("lpc_lead_pick_v1");
          if (pickRaw) {
            const pick = JSON.parse(pickRaw);
            if (pick && typeof pick === "object") {
              if (pick.name) merged.name = String(pick.name).trim();
              if (pick.phone) merged.phone = String(pick.phone).trim();
              const maps = String(pick.mapsUrl || pick.maps || "").trim();
              if (maps) merged.maps = maps;
              if (pick.price) merged.price = String(pick.price).trim();
              if (pick.mode) merged.mode = pick.mode;
            }
          }
        } catch (e) {
          /* ignore */
        }
        if (!("phone" in local) && cloud.phone) merged.phone = cloud.phone;
        if (!("maps" in local) && cloud.maps) merged.maps = cloud.maps;
        if (!("name" in local) && cloud.name) merged.name = cloud.name;
        if (!("price" in local) && cloud.price) merged.price = cloud.price;
        if (!("mode" in local) && cloud.mode) merged.mode = cloud.mode;
        localStorage.setItem(repKey(base), JSON.stringify(merged));
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
    const cloudName = String(data?.rep_name || "").trim();
    if (cloudName && repId) {
      const session = global.RepSession?.get?.();
      if (!session?.name || session.name !== cloudName) {
        global.RepSession.set({ id: repId, name: cloudName });
      }
    }
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
    const repName =
      String(rep?.name || "").trim() ||
      String(repId || "")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
    const row = {
      rep_id: repId,
      rep_name: repName || repId,
      settings_json,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client
      .from("rep_settings")
      .upsert(row, { onConflict: "rep_id" });
    if (error) throw error;
    try {
      global.dispatchEvent(new Event("rep-settings-synced"));
    } catch (e) {
      /* ignore */
    }
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
    const currentId =
      global.RepSession?.getId?.() || global.RepSession?.get?.()?.id || null;
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
    repId = global.RepSession?.getId?.() || global.RepSession?.get?.()?.id || null;
    initRepId = repId;
    global.RepSession?.enforceTrackerIdentity?.();
    migrateLegacyLocalKeys();

    if (!repId || !canSync()) {
      client = null;
      flushReady();
      return { mode: "local" };
    }

    try {
      const { url, key } = cfg();
      client = global.supabase.createClient(url, key);
      flushReady();
      await pull();
      global.RepSession?.touchOnline?.();
      scheduleSync();
      try {
        global.dispatchEvent(new Event("rep-settings-pulled"));
      } catch (e) {
        /* ignore */
      }
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
