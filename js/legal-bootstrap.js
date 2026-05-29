/**
 * Privacy / Terms: standalone when logged out (no sidebar, no dashboard bypass).
 * Full app chrome when signed in with PIN.
 */
(function () {
  const UNLOCK_KEY = "lpc_site_unlock";

  function isUnlocked() {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  }

  function loadScript(src, cb) {
    const s = document.createElement("script");
    s.src = src;
    s.onload = function () {
      if (cb) cb();
    };
    s.onerror = function () {
      if (cb) cb();
    };
    document.body.appendChild(s);
  }

  function finishLoggedInBoot() {
    if (window.RepSession) window.RepSession.applyToTracker();
    const done = function () {
      window.dispatchEvent(new Event("site-unlocked"));
    };
    if (window.RepStorage?.init) {
      window.RepStorage.init().finally(done);
    } else {
      done();
    }
  }

  function loadScripts(list, i) {
    if (i >= list.length) {
      finishLoggedInBoot();
      return;
    }
    loadScript(list[i], function () {
      loadScripts(list, i + 1);
    });
  }

  function initStandalone() {
    document.body.classList.add("legal-standalone-mode");
    document.body.dataset.public = "1";

    const shell = document.getElementById("shell");
    if (shell) shell.remove();

    loadScript("js/theme.js", function () {
      loadScript("js/legal-page.js");
    });
  }

  function initLoggedIn() {
    document.body.classList.add("legal-logged-in");
    delete document.body.dataset.public;

    const shell = document.getElementById("shell");
    if (!shell) {
      const el = document.createElement("div");
      el.id = "shell";
      document.body.insertBefore(el, document.getElementById("page-body"));
    }

    loadScripts(
      [
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
        "js/icons.js",
        "js/rep-session.js",
        "js/rep-settings-sync.js",
        "js/user-prefs.js",
        "js/theme.js",
        "js/lock.js",
        "js/layout-fix.js",
        "js/app.js",
        "js/sign-out-float.js",
        "js/legal-page.js",
      ],
      0
    );
  }

  if (isUnlocked()) {
    initLoggedIn();
  } else {
    initStandalone();
  }
})();
