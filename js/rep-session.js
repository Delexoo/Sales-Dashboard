/**
 * Current rep for this browser session (set by PIN on lock screen).
 */
(function (global) {
  const STORAGE_KEY = "lpc_rep_session_v1";
  const TRACKER_KEY = "lpc_sales_tracker_v2";
  const SESSION_META_KEY = "lpc_rep_session_meta_v1";

  function readRaw() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o?.id) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function getId() {
    const o = readRaw();
    return o?.id ? String(o.id) : null;
  }

  function get() {
    const o = readRaw();
    if (!o?.id) return null;
    return { id: String(o.id), name: String(o.name || "").trim() };
  }

  function readSessionMeta() {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(SESSION_META_KEY)
        : null;
      return raw && typeof raw === "string" ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeSessionMeta(meta) {
    try {
      const json = JSON.stringify(meta || {});
      if (global.RepStorage?.saveItem) global.RepStorage.saveItem(SESSION_META_KEY, json);
    } catch (e) {
      /* ignore */
    }
  }

  function touchSessionMeta() {
    if (!getId()) return;
    try {
      const meta = readSessionMeta();
      const now = new Date().toISOString();
      if (!meta.firstLoginAt) meta.firstLoginAt = now;
      meta.lastLoginAt = now;
      meta.lastOnlineAt = now;
      meta.loginCount = (Number(meta.loginCount) || 0) + 1;
      if (meta.activeMs == null) meta.activeMs = 0;
      if (!meta.activeSince) meta.activeSince = now;
      writeSessionMeta(meta);
      global.RepStorage?.scheduleSync?.();
    } catch (e) {
      /* ignore */
    }
  }

  function flushActiveMs(meta, nowMs) {
    const now = nowMs || Date.now();
    const since = meta.activeSince ? new Date(meta.activeSince).getTime() : NaN;
    if (!Number.isNaN(since)) {
      meta.activeMs = (Number(meta.activeMs) || 0) + Math.max(0, now - since);
    }
    meta.activeSince = new Date(now).toISOString();
  }

  function pauseActiveMs() {
    if (!getId()) return;
    try {
      const meta = readSessionMeta();
      const now = Date.now();
      const since = meta.activeSince ? new Date(meta.activeSince).getTime() : NaN;
      if (!Number.isNaN(since)) {
        meta.activeMs = (Number(meta.activeMs) || 0) + Math.max(0, now - since);
      }
      delete meta.activeSince;
      meta.lastOnlineAt = new Date(now).toISOString();
      writeSessionMeta(meta);
      global.RepStorage?.scheduleSync?.();
    } catch (e) {
      /* ignore */
    }
  }

  function touchOnline() {
    if (!get()) return;
    try {
      const meta = readSessionMeta();
      flushActiveMs(meta);
      meta.lastOnlineAt = meta.activeSince;
      writeSessionMeta(meta);
      global.RepStorage?.scheduleSync?.();
    } catch (e) {
      /* ignore */
    }
  }

  let onlineHeartbeatArmed = false;

  function startOnlineHeartbeat() {
    if (!getId()) return;

    function arm() {
      if (!getId()) return;
      touchOnline();
      if (onlineHeartbeatArmed) return;
      onlineHeartbeatArmed = true;
      setInterval(touchOnline, 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          try {
            const meta = readSessionMeta();
            meta.activeSince = new Date().toISOString();
            writeSessionMeta(meta);
          } catch (e) {
            /* ignore */
          }
          touchOnline();
        } else {
          pauseActiveMs();
        }
      });
      window.addEventListener("beforeunload", () => {
        pauseActiveMs();
        try {
          global.RepStorage?.flushSync?.();
        } catch (e) {
          /* ignore */
        }
      });
    }

    if (global.RepStorage?.whenReady) {
      global.RepStorage.whenReady(arm);
      return;
    }
    if (global.RepStorage?.loadItem) {
      arm();
      return;
    }
    global.addEventListener("rep-settings-ready", () => arm(), { once: true });
  }

  function set(rep) {
    if (!rep?.id) return;
    const prev = readRaw();
    const name =
      rep.name != null && String(rep.name).trim() !== ""
        ? String(rep.name).trim()
        : String(prev?.name || "").trim();
    if (!name) {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ id: String(rep.id), name: "" })
      );
      global.dispatchEvent(
        new CustomEvent("rep-session-changed", {
          detail: { id: String(rep.id), name: "" },
        })
      );
      return;
    }
    const next = { id: String(rep.id), name };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    applyToTracker(true);
    refreshNameDisplays();
    if (prev?.id && prev.id !== next.id && global.RepStorage?.resetForRep) {
      global.RepStorage.resetForRep();
    }
    global.dispatchEvent(new CustomEvent("rep-session-changed", { detail: next }));
  }

  function clear() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function signOut() {
    clear();
    sessionStorage.removeItem("lpc_site_unlock");
    if (global.RepStorage?.resetForRep) global.RepStorage.resetForRep();
    window.location.reload();
  }

  function getName() {
    return get()?.name || "";
  }

  function refreshNameDisplays() {
    if (global.RepIdentity?.refreshUI) {
      void global.RepIdentity.refreshUI();
      return;
    }
    const name = getName();
    const id = getId();
    if (!name && !id) return;
    const label = name || id || "—";
    ["bug-report-rep-name", "feedback-rep-name", "faq-qa-ask-rep"].forEach((elId) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = label;
    });
    const settingsEl = document.getElementById("settings-rep-id");
    if (settingsEl) settingsEl.textContent = label;
  }

  function loadTrackerRaw() {
    if (window.RepStorage?.loadItem) return window.RepStorage.loadItem(TRACKER_KEY);
    return localStorage.getItem(TRACKER_KEY);
  }

  function saveTrackerRaw(json) {
    if (window.RepStorage?.saveItem) window.RepStorage.saveItem(TRACKER_KEY, json);
    else localStorage.setItem(TRACKER_KEY, json);
  }

  function applyToTracker(force) {
    const session = get();
    if (!session?.name) return;
    try {
      const data = JSON.parse(loadTrackerRaw() || "{}");
      if (session.id && data.repId && data.repId !== session.id) {
        enforceTrackerIdentity();
        return;
      }
      data.repId = session.id;
      data.name = session.name;
      saveTrackerRaw(JSON.stringify(data));
    } catch (e) {
      /* ignore */
    }
  }

  /** Keep dashboard tracker tied to the rep who entered their PIN. */
  function enforceTrackerIdentity() {
    const session = get();
    if (!session?.id) return;
    const DEFAULT_GOAL = 2000;
    try {
      let data = JSON.parse(loadTrackerRaw() || "{}");
      if (!data || typeof data !== "object") data = {};

      if (data.repId && data.repId !== session.id) {
        data = {
          repId: session.id,
          name: session.name,
          goal: DEFAULT_GOAL,
          leadsPosted: 0,
          deals: [],
        };
      } else {
        data.repId = session.id;
        data.name = session.name;
        if (!data.goal || Number(data.goal) <= 0) data.goal = DEFAULT_GOAL;
        if (!Array.isArray(data.deals)) data.deals = [];
      }

      saveTrackerRaw(JSON.stringify(data));
    } catch (e) {
      /* ignore */
    }
  }

  global.RepSession = {
    get,
    getId,
    set,
    clear,
    signOut,
    getName,
    refreshNameDisplays,
    applyToTracker,
    enforceTrackerIdentity,
    touchSessionMeta,
    touchOnline,
    startOnlineHeartbeat,
    SESSION_META_KEY,
    STORAGE_KEY,
  };

  global.addEventListener("site-unlocked", () => {
    startOnlineHeartbeat();
  });
  global.addEventListener("rep-settings-ready", () => {
    if (getId() && sessionStorage.getItem("lpc_site_unlock") === "1") {
      startOnlineHeartbeat();
    }
  });
  if (getId() && sessionStorage.getItem("lpc_site_unlock") === "1") {
    startOnlineHeartbeat();
  }
})(window);
