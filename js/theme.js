/**
 * Applies light / dark / system theme before paint (load on every app page).
 */
(function (global) {
  const DEVICE_KEY = "lpc_device_theme_v1";
  const PREFS_KEY = "lpc_user_prefs_v1";

  function repScopedKey(base) {
    const id = global.RepSession?.get?.()?.id;
    return id ? "lpc_rep_" + id + "_" + base : base;
  }

  function readPrefsRaw() {
    try {
      const raw =
        global.RepStorage?.loadItem?.(PREFS_KEY) ||
        localStorage.getItem(repScopedKey(PREFS_KEY));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function readTheme() {
    const device = localStorage.getItem(DEVICE_KEY);
    if (device === "light" || device === "dark" || device === "system") return device;
    const prefs = readPrefsRaw();
    const t = prefs?.theme;
    if (t === "light" || t === "dark" || t === "system") return t;
    return "system";
  }

  function readReduceMotion() {
    const prefs = readPrefsRaw();
    return !!prefs?.reduceMotion;
  }

  function apply(theme, reduceMotion) {
    const html = document.documentElement;
    if (theme === "light") {
      html.setAttribute("data-theme", "light");
    } else if (theme === "dark") {
      html.setAttribute("data-theme", "dark");
    } else {
      const prefersDark = global.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      html.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }

    const rm = reduceMotion !== undefined ? reduceMotion : readReduceMotion();
    if (rm) html.setAttribute("data-reduce-motion", "1");
    else html.removeAttribute("data-reduce-motion");
  }

  function setTheme(theme, options) {
    const opts = options || {};
    if (opts.persistDevice !== false) {
      localStorage.setItem(DEVICE_KEY, theme);
    }
    const rm = opts.reduceMotion !== undefined ? opts.reduceMotion : readReduceMotion();
    apply(theme, rm);
  }

  apply(readTheme());

  global.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
    if (readTheme() === "system") apply("system");
  });

  global.addEventListener("user-prefs-changed", () => {
    apply(readTheme());
  });

  global.SiteTheme = {
    get: readTheme,
    apply: setTheme,
    isReduceMotion() {
      return document.documentElement.getAttribute("data-reduce-motion") === "1";
    },
    DEVICE_KEY,
    PREFS_KEY,
  };
})(window);
