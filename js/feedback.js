/**
 * Help → Feedback — simple message to owner via Supabase.
 */
(function (global) {
  let client = null;

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
      enabled: c.useFeedback !== false,
    };
  }

  function canSubmit() {
    const { url, key, enabled } = cfg();
    return enabled && !!(url && key && global.supabase?.createClient);
  }

  function getClient() {
    if (client) return client;
    if (!canSubmit()) return null;
    const { url, key } = cfg();
    client = global.supabase.createClient(url, key);
    return client;
  }

  function rep() {
    return global.RepSession?.get?.() || null;
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg;
    el.className = "bug-report-status" + (type ? " bug-report-status-" + type : "");
  }

  function initForm(root) {
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "1";

    const form = root.querySelector("#feedback-form");
    const statusEl = root.querySelector("#feedback-status");
    const topicEl = root.querySelector("#feedback-topic");
    const messageEl = root.querySelector("#feedback-message");

    if (global.RepIdentity?.whenIdentityReady) {
      global.RepIdentity.whenIdentityReady(() => {});
    }

    if (!canSubmit()) {
      showStatus(
        statusEl,
        "Feedback needs Supabase — run supabase-feedback-setup.sql in your project.",
        "warn"
      );
      form?.querySelectorAll("input:not([readonly]), textarea, button[type=submit]").forEach((el) => {
        el.disabled = true;
      });
    }

    function readPayload() {
      const rNow = rep();
      return {
        rep_id: rNow?.id || "",
        rep_name: rNow?.name || "",
        topic: String(topicEl?.value || "").trim(),
        message: String(messageEl?.value || "").trim(),
      };
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      let rNow = rep();
      if (!rNow?.id && global.RepIdentity?.resolveRepIdentity) {
        await global.RepIdentity.resolveRepIdentity();
        rNow = rep();
      }
      if (!rNow?.id) {
        showStatus(statusEl, "Sign in with your PIN before sending.", "err");
        return;
      }

      const payload = readPayload();
      payload.rep_id = rNow.id;
      payload.rep_name = rNow.name || rNow.id;

      if (!payload.message) {
        showStatus(statusEl, "Write a message before sending.", "warn");
        return;
      }

      const sb = getClient();
      if (!sb) {
        showStatus(statusEl, "Supabase is not configured for feedback.", "err");
        return;
      }

      const submitBtn = form.querySelector("#feedback-submit");
      if (submitBtn) submitBtn.disabled = true;
      showStatus(statusEl, "Sending…", "");

      try {
        const { error } = await sb.from("feedback").insert({
          rep_id: payload.rep_id,
          rep_name: payload.rep_name,
          topic: payload.topic || null,
          message: payload.message,
        });
        if (error) throw error;

        form.reset();
        showStatus(statusEl, "Sent — thanks!", "ok");
      } catch (err) {
        console.warn(err);
        showStatus(statusEl, String(err.message || "Could not send. Try again."), "err");
      }

      if (submitBtn) submitBtn.disabled = false;
    });
  }

  function init() {
    const root = document.getElementById("feedback-panel");
    if (!root) return;
    const run = () => {
      if (global.RepStorage?.whenReady) {
        global.RepStorage.whenReady(() => initForm(root));
      } else {
        initForm(root);
      }
    };
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(run);
    else run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.FeedbackForm = { init };
})(window);
