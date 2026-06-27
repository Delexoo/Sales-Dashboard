/**
 * Entry pages (index.html, course.html): redirect signed-in reps immediately
 * without loading Supabase, image preloads, or the lock UI.
 */
(function (global) {
  const PWA_BASE_URL = new URL("../", global.document.currentScript?.src || global.location.href);
  const PWA_MANIFEST_URL = new URL("manifest.json", PWA_BASE_URL).href;
  const PWA_SW_URL = new URL("sw.js", PWA_BASE_URL).href;
  const PWA_THEME_COLOR = "#0f172a";
  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";

  function ensurePwaMetadata() {
    if (!global.document.head) return;

    if (!global.document.querySelector('link[rel="manifest"]')) {
      const manifest = global.document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = PWA_MANIFEST_URL;
      global.document.head.appendChild(manifest);
    }

    if (!global.document.querySelector('meta[name="theme-color"]')) {
      const theme = global.document.createElement("meta");
      theme.name = "theme-color";
      theme.content = PWA_THEME_COLOR;
      global.document.head.appendChild(theme);
    }
  }

  function canRegisterServiceWorker() {
    const host = global.location.hostname;
    return (
      "serviceWorker" in global.navigator &&
      (global.location.protocol === "https:" ||
        host === "localhost" ||
        host === "127.0.0.1")
    );
  }

  function registerPwaServiceWorker() {
    if (!canRegisterServiceWorker()) return;
    global.navigator.serviceWorker.register(PWA_SW_URL).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }

  function isEntryPage() {
    return global.document?.documentElement?.dataset?.loginRedirect === "entry";
  }

  function repId() {
    return global.RepSession?.getId?.() || global.RepSession?.get?.()?.id || null;
  }

  function isSignedIn() {
    const id = repId();
    return !!(id && global.sessionStorage?.getItem("lpc_site_unlock") === "1");
  }

  function loadProgress() {
    const id = repId();
    const key = id ? "lpc_rep_" + id + "_" + PROGRESS_KEY : PROGRESS_KEY;
    try {
      return JSON.parse(global.localStorage.getItem(key) || "{}");
    } catch (e) {
      return {};
    }
  }

  function pageName() {
    const path = global.location.pathname || "";
    return path.split("/").pop().toLowerCase() || "index.html";
  }

  function isAtUrl(url) {
    const target = String(url || "").split("?")[0];
    const here = pageName();
    if (here === target) return true;
    if (!here && target === "index.html") return true;
    try {
      const full = new URL(url, global.location.href);
      const cur = new URL(global.location.href);
      return cur.pathname === full.pathname && cur.search === full.search;
    } catch (e) {
      return global.location.href.includes(url);
    }
  }

  function hideLoadingMsg() {
    const msg = global.document.querySelector(".login-redirect-msg");
    if (msg) msg.hidden = true;
  }

  function redirectToLanding() {
    const CM = global.CourseModules;
    if (!CM?.loginLandingUrl) return false;

    const landing = CM.loginLandingUrl(loadProgress());
    if (isAtUrl(landing)) {
      hideLoadingMsg();
      return false;
    }

    hideLoadingMsg();
    global.location.replace(landing);
    return true;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = global.document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load " + src));
      global.document.body.appendChild(s);
    });
  }

  async function loadLoginStack() {
    const c = global.SITE_CONFIG || {};
    const needsSupabase = !!(
      String(c.supabaseUrl || "").trim() &&
      String(c.supabaseAnonKey || "").trim()
    );
    if (needsSupabase) {
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      await loadScript("js/supabase-client.js");
    }
    await loadScript("js/rep-settings-sync.js");
    await loadScript("js/lock.js");
    await loadScript("js/login-redirect.js");
  }

  function boot() {
    if (!isEntryPage()) return;

    ensurePwaMetadata();
    if (global.document.readyState === "loading") {
      global.addEventListener("load", registerPwaServiceWorker, { once: true });
    } else {
      registerPwaServiceWorker();
    }

    if (isSignedIn() && redirectToLanding()) return;

    void loadLoginStack().catch((e) => {
      console.error("Entry page login stack failed", e);
      hideLoadingMsg();
    });
  }

  boot();
})(window);
