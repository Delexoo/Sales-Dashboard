(function () {
  const STORAGE_KEY = "lpc_site_unlock";
  const LOCKOUT_KEY = "lpc_lockout_v1";
  const MAX_FAILED = 5;
  const LOCKOUT_MS = 30 * 60 * 1000;
  const PIN_AUTO_SUBMIT_LEN = 4;
  let sessionWatchStarted = false;

  /** @type {{ id: string, name: string, pin: string }[] | null} */
  let reps = null;
  let loadFailed = false;
  let lockoutTimer = null;
  let lockBuilt = false;
  let supabaseClient = null;
  let pinVerifying = false;

  function isPublicPage() {
    return document.body?.dataset?.public === "1";
  }

  function isAuthenticated() {
    if (isPublicPage()) return false;
    return (
      sessionStorage.getItem(STORAGE_KEY) === "1" && !!window.RepSession?.get?.()
    );
  }

  function shouldShowLock() {
    return !isPublicPage() && !isAuthenticated();
  }

  function applyLockedUi() {
    document.documentElement.classList.add("site-lock-active");
    document.body?.classList.remove("site-unlocked");
  }

  function applyUnlockedUi() {
    document.documentElement.classList.remove("site-lock-active");
    document.body?.classList.add("site-unlocked");
  }

  if (!isPublicPage()) {
    if (isAuthenticated()) applyUnlockedUi();
    else applyLockedUi();
  }

  function useServerPinAuth() {
    const c = window.SITE_CONFIG || {};
    return !!(
      String(c.supabaseUrl || "").trim() &&
      String(c.supabaseAnonKey || "").trim() &&
      window.supabase?.createClient
    );
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    const c = window.SITE_CONFIG || {};
    supabaseClient = window.supabase.createClient(
      String(c.supabaseUrl).trim(),
      String(c.supabaseAnonKey).trim()
    );
    return supabaseClient;
  }

  function loadRepsFromConfig() {
    const list = window.SITE_CONFIG?.reps;
    return Array.isArray(list)
      ? list
          .map((r) => ({
            id: String(r.id || "").trim(),
            name: String(r.name || "").trim(),
            pin: String(r.pin || "").trim(),
          }))
          .filter((r) => r.id && r.name && r.pin)
      : [];
  }

  async function verifyPinWithSupabase(entered) {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc("verify_rep_pin", {
      entered_pin: String(entered || "").trim(),
    });
    if (error) throw error;
    if (!data || typeof data !== "object" || !data.id) return null;
    return { id: String(data.id), name: String(data.name || "").trim() };
  }

  function loadLockout() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || "{}");
      return {
        failCount: Number(raw.failCount) || 0,
        lockedUntil: Number(raw.lockedUntil) || 0,
      };
    } catch (e) {
      return { failCount: 0, lockedUntil: 0 };
    }
  }

  function saveLockout(state) {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
  }

  function clearLockout() {
    localStorage.removeItem(LOCKOUT_KEY);
  }

  function getRemainingLockMs() {
    const { lockedUntil } = loadLockout();
    if (!lockedUntil) return 0;
    return Math.max(0, lockedUntil - Date.now());
  }

  function isLockedOut() {
    return getRemainingLockMs() > 0;
  }

  function formatLockoutTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min <= 0) return sec + " second" + (sec === 1 ? "" : "s");
    if (sec === 0) return min + " minute" + (min === 1 ? "" : "s");
    return min + " min " + sec + " sec";
  }

  function recordFailedAttempt() {
    const state = loadLockout();
    state.failCount = (state.failCount || 0) + 1;
    if (state.failCount >= MAX_FAILED) {
      state.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    saveLockout(state);
    return state;
  }

  function attemptsRemaining() {
    const { failCount } = loadLockout();
    return Math.max(0, MAX_FAILED - failCount);
  }

  function showError(wrap, msg) {
    let err = wrap.querySelector(".site-lock-error");
    if (!err) {
      err = document.createElement("p");
      err.className = "site-lock-error";
      wrap.appendChild(err);
    }
    err.textContent = msg;
    if (window.SiteTheme?.isReduceMotion?.()) return;
    wrap.classList.add("site-lock-shake");
    setTimeout(() => wrap.classList.remove("site-lock-shake"), 420);
  }

  function findRepByPin(entered) {
    const pin = String(entered || "").trim();
    if (!pin || !reps?.length) return null;
    const matches = reps.filter((r) => String(r.pin).trim() === pin);
    if (matches.length > 1) {
      console.warn("Duplicate PIN in rep list — first match wins:", matches.map((r) => r.id));
    }
    if (matches.length) return { id: matches[0].id, name: matches[0].name };
    return null;
  }

  function setInputLocked(input, locked) {
    if (!input) return;
    input.disabled = locked;
    input.readOnly = locked;
    if (locked) input.value = "";
    input.classList.toggle("site-lock-input-disabled", locked);
  }

  function applyLockoutUI(inner, input, form) {
    const remaining = getRemainingLockMs();
    const locked = remaining > 0;

    inner.classList.toggle("site-lock-inner-locked", locked);
    setInputLocked(input, locked);

    if (locked) {
      showError(
        inner,
        "Too many failed attempts. Try again in " + formatLockoutTime(remaining) + "."
      );
      if (form) form.setAttribute("aria-disabled", "true");
      return true;
    }

    if (form) form.removeAttribute("aria-disabled");
    const err = inner.querySelector(".site-lock-error");
    if (err?.textContent?.includes("Too many failed attempts")) {
      err.textContent = "";
    }
    return false;
  }

  function startLockoutCountdown(inner, input, form) {
    if (lockoutTimer) clearInterval(lockoutTimer);
    applyLockoutUI(inner, input, form);
    lockoutTimer = setInterval(() => {
      const remaining = getRemainingLockMs();
      if (remaining <= 0) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
        const state = loadLockout();
        state.failCount = 0;
        state.lockedUntil = 0;
        saveLockout(state);
        applyLockoutUI(inner, input, form);
        if (input && !input.disabled) input.focus();
        return;
      }
      applyLockoutUI(inner, input, form);
    }, 1000);
  }

  function initRepAuth() {
    if (useServerPinAuth()) {
      reps = [];
      loadFailed = false;
      return;
    }
    reps = loadRepsFromConfig();
    if (!reps.length) {
      loadFailed = true;
    }
  }

  function ensureLockOverlay() {
    let root = document.getElementById("site-lock");
    if (root) {
      root.classList.remove("site-lock-out");
      root.hidden = false;
      root.style.display = "";
      return root;
    }
    if (lockBuilt) return null;

    lockBuilt = true;
    root = document.createElement("div");
    root.id = "site-lock";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Enter PIN");
    root.innerHTML =
      '<div class="site-lock-inner">' +
      '<p class="site-lock-hint">Use the PIN your manager gave you</p>' +
      '<form class="site-lock-form" autocomplete="off">' +
      '<input type="password" class="site-lock-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Your PIN" aria-label="PIN" autofocus>' +
      "</form>" +
      "</div>" +
      '<div class="site-lock-legal">' +
      '<a href="privacy.html" class="site-lock-legal-btn">Privacy Policy</a>' +
      '<a href="terms.html" class="site-lock-legal-btn">Terms of Service</a>' +
      "</div>";

    document.body.appendChild(root);

    const form = root.querySelector(".site-lock-form");
    const input = root.querySelector(".site-lock-input");
    const inner = root.querySelector(".site-lock-inner");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      tryUnlock(input, inner, form);
    });

    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "");
      if (digits !== input.value) input.value = digits;
      if (
        digits.length === PIN_AUTO_SUBMIT_LEN &&
        !isLockedOut() &&
        !input.disabled &&
        !pinVerifying
      ) {
        tryUnlock(input, inner, form);
      }
    });

    if (isLockedOut()) {
      startLockoutCountdown(inner, input, form);
    }

    initRepAuth();
    if (loadFailed && !isLockedOut()) {
      showError(
        inner,
        useServerPinAuth()
          ? "Sign-in database is not ready. Ask your manager to run supabase-rep-pins.sql."
          : "Sign-in is not configured. For local testing, copy private-config.example.js to private-config.js."
      );
    }

    return root;
  }

  function forceRelock() {
    if (isPublicPage()) return;

    sessionStorage.removeItem(STORAGE_KEY);
    window.RepSession?.clear?.();

    applyLockedUi();
    ensureLockOverlay();

    const float = document.getElementById("sign-out-float");
    if (float) float.remove();

    window.dispatchEvent(new Event("site-locked"));
  }

  function syncLockUiOnce() {
    if (isPublicPage()) return;
    if (isAuthenticated()) {
      applyUnlockedUi();
      return;
    }
    if (shouldShowLock()) {
      applyLockedUi();
      if (!document.getElementById("site-lock")) ensureLockOverlay();
    }
  }

  function startSessionWatch() {
    if (isPublicPage() || sessionWatchStarted) return;
    sessionWatchStarted = true;
    syncLockUiOnce();
  }

  async function unlock(rep) {
    clearLockout();
    if (rep && window.RepSession) {
      window.RepSession.set(rep);
    }
    sessionStorage.setItem(STORAGE_KEY, "1");

    if (window.RepStorage?.init) {
      try {
        await window.RepStorage.init();
      } catch (e) {
        console.warn("Rep settings init failed", e);
      }
    }
    window.RepSession?.enforceTrackerIdentity?.();

    applyUnlockedUi();

    const el = document.getElementById("site-lock");
    if (el) {
      el.classList.add("site-lock-out");
      setTimeout(() => el.remove(), 280);
    }
    lockBuilt = false;

    if (lockoutTimer) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
    }

    window.dispatchEvent(new Event("site-unlocked"));
  }

  async function tryUnlock(input, wrap, form) {
    if (pinVerifying) return;
    if (isLockedOut()) {
      startLockoutCountdown(wrap, input, form);
      return;
    }

    const entered = input.value.trim();
    if (!entered) {
      showError(wrap, "Enter your PIN");
      return;
    }
    if (!useServerPinAuth() && loadFailed) {
      showError(
        wrap,
        "Sign-in is not configured. Supabase URL/key missing in js/config.js."
      );
      return;
    }

    let rep = null;
    pinVerifying = true;
    try {
      if (useServerPinAuth()) {
        try {
          rep = await verifyPinWithSupabase(entered);
        } catch (e) {
          console.error(e);
          showError(wrap, "Could not verify PIN. Check Supabase setup and try again.");
          return;
        }
      } else {
        rep = findRepByPin(entered);
      }
    } finally {
      pinVerifying = false;
    }

    if (rep) {
      const prev = window.RepSession?.get?.();
      if (prev && prev.id !== rep.id) {
        window.RepStorage?.resetForRep?.();
      }
      unlock(rep).catch((e) => console.warn(e));
      return;
    }

    const state = recordFailedAttempt();
    input.value = "";

    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      startLockoutCountdown(wrap, input, form);
      return;
    }

    const left = attemptsRemaining();
    if (left <= 0) {
      startLockoutCountdown(wrap, input, form);
      return;
    }

    showError(
      wrap,
      left === 1
        ? "Incorrect PIN. 1 attempt remaining before a 30-minute lockout."
        : "Incorrect PIN. " + left + " attempts remaining."
    );
    if (!input.disabled) input.focus();
  }

  function onLockReady() {
    if (isPublicPage()) return;

    initRepAuth();

    const rep = window.RepSession?.get?.();
    if (rep) {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }

    if (shouldShowLock()) {
      applyLockedUi();
      ensureLockOverlay();
      startSessionWatch();
      return;
    }

    applyUnlockedUi();
    window.RepSession.applyToTracker(true);
    startSessionWatch();
  }

  function whenUnlocked(fn) {
    if (typeof fn !== "function") return;
    if (isAuthenticated()) {
      fn();
      return;
    }
    window.addEventListener("site-unlocked", () => fn(), { once: true });
  }

  window.SiteLock = {
    isAuthenticated,
    isPublicPage,
    whenUnlocked,
    forceRelock,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onLockReady);
  } else {
    onLockReady();
  }
})();
