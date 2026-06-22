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
    const prefs = readPrefsRaw();
    const c = prefs?.uiColor;
    if (["current", "white", "green", "grey", "blue", "purple", "red"].includes(c)) return "light";
    if (c === "black") return "dark";
    const device = localStorage.getItem(DEVICE_KEY);
    if (device === "light" || device === "dark" || device === "system") return device;
    const t = prefs?.theme;
    if (t === "light" || t === "dark" || t === "system") return t;
    return "light";
  }

  function readUiColor() {
    const c = readPrefsRaw()?.uiColor;
    return ["current", "white", "black", "green", "grey", "blue", "purple", "red"].includes(c) ? c : "current";
  }

  function readReduceMotion() {
    return !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
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

    const uiColor = readUiColor();
    if (uiColor === "current") html.removeAttribute("data-ui-color");
    else html.setAttribute("data-ui-color", uiColor);

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

  global.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change", () => {
    apply(readTheme());
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
