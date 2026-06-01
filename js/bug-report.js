/**
 * Bug Bounty report form — saves to Supabase + optional file uploads.
 */
(function (global) {
  const BUCKET = "bug-reports";
  const MAX_FILES = 6;
  const MAX_BYTES = 8 * 1024 * 1024;

  let client = null;
  let pickedFiles = [];

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
      enabled: c.useBugReports !== false,
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

  function detectPage() {
    return global.location.pathname.split("/").pop() || "bug-bounty.html";
  }

  function detectDevice() {
    const ua = navigator.userAgent || "";
    let device = "Desktop";
    if (/iPhone/i.test(ua)) device = "iPhone";
    else if (/iPad/i.test(ua)) device = "iPad";
    else if (/Android/i.test(ua)) device = "Android";
    else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";
    else if (/Windows/i.test(ua)) device = "Windows";

    let browser = "Browser";
    if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/CriOS/i.test(ua)) browser = "Chrome";
    else if (/FxiOS/i.test(ua)) browser = "Firefox";
    else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
    else if (/Firefox/i.test(ua)) browser = "Firefox";

    return device + " · " + browser;
  }

  function severityForDb(value) {
    const v = String(value || "").trim();
    return v || null;
  }

  function sanitizeFilename(name) {
    return String(name || "file")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg;
    el.className = "bug-report-status" + (type ? " bug-report-status-" + type : "");
  }

  function renderPreviews(container) {
    if (!container) return;
    container.innerHTML = "";
    pickedFiles.forEach((file, i) => {
      const item = document.createElement("div");
      item.className = "bug-report-preview";
      if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        item.appendChild(img);
      } else {
        const span = document.createElement("span");
        span.className = "bug-report-preview-file";
        span.textContent = file.name;
        item.appendChild(span);
      }
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "bug-report-preview-remove";
      rm.setAttribute("aria-label", "Remove " + file.name);
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        pickedFiles = pickedFiles.filter((_, idx) => idx !== i);
        renderPreviews(container);
      });
      item.appendChild(rm);
      container.appendChild(item);
    });
  }

  async function uploadAttachments(sb, repId, files) {
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path =
        repId + "/" + Date.now() + "-" + i + "-" + sanitizeFilename(file.name);
      const { error } = await sb.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
      out.push({ name: file.name, url: data.publicUrl, path });
    }
    return out;
  }

  function readPayload(form, rNow) {
    const description = String(
      form.querySelector("#bug-report-description")?.value || ""
    ).trim();
    return {
      rep_id: rNow.id,
      rep_name: rNow.name,
      severity: form.querySelector("#bug-report-severity")?.value || "",
      page_url: detectPage(),
      device: detectDevice(),
      steps: description,
      expected: "—",
      actual: "—",
      notes: null,
    };
  }

  function initForm(root) {
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "1";

    const form = root.querySelector("#bug-report-form");
    const statusEl = root.querySelector("#bug-report-status");
    const previewEl = root.querySelector("#bug-report-previews");
    const fileInput = root.querySelector("#bug-report-files");
    if (global.RepIdentity?.whenIdentityReady) {
      global.RepIdentity.whenIdentityReady(() => {});
    }

    if (!canSubmit()) {
      showStatus(
        statusEl,
        "Report form needs Supabase — run supabase-bug-reports-setup.sql.",
        "warn"
      );
      form?.querySelectorAll("textarea, select, button[type=submit]").forEach((el) => {
        el.disabled = true;
      });
    }

    fileInput?.addEventListener("change", () => {
      const list = Array.from(fileInput.files || []);
      const next = [];
      for (const file of list) {
        if (pickedFiles.length + next.length >= MAX_FILES) break;
        if (file.size > MAX_BYTES) {
          showStatus(statusEl, file.name + " is too large (max 8 MB).", "warn");
          continue;
        }
        next.push(file);
      }
      pickedFiles = pickedFiles.concat(next);
      fileInput.value = "";
      renderPreviews(previewEl);
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      let rNow = rep();
      if (!rNow?.id && global.RepIdentity?.resolveRepIdentity) {
        await global.RepIdentity.resolveRepIdentity();
        rNow = rep();
      }
      if (!rNow?.id) {
        showStatus(statusEl, "Sign in with your PIN first.", "err");
        return;
      }

      const payload = readPayload(form, rNow);
      if (!payload.steps) {
        showStatus(statusEl, "Describe what went wrong.", "warn");
        return;
      }

      const sb = getClient();
      if (!sb) {
        showStatus(statusEl, "Supabase is not configured.", "err");
        return;
      }

      const submitBtn = form.querySelector("#bug-report-submit");
      if (submitBtn) submitBtn.disabled = true;
      showStatus(statusEl, "Sending…", "");

      try {
        let attachments = [];
        if (pickedFiles.length) {
          attachments = await uploadAttachments(sb, rNow.id, pickedFiles);
        }

        const { error } = await sb.from("bug_reports").insert({
          rep_id: payload.rep_id,
          rep_name: payload.rep_name,
          severity: severityForDb(payload.severity),
          page_url: payload.page_url,
          device: payload.device,
          steps: payload.steps,
          expected: payload.expected,
          actual: payload.actual,
          notes: payload.notes,
          attachments,
        });
        if (error) throw error;

        pickedFiles = [];
        renderPreviews(previewEl);
        form.reset();

        showStatus(statusEl, "Sent — thanks!", "ok");
      } catch (err) {
        console.warn(err);
        const msg = String(err.message || "");
        if (/bucket|storage|not found/i.test(msg)) {
          showStatus(statusEl, "Could not upload files. Try without photos.", "err");
        } else {
          showStatus(statusEl, msg || "Could not send. Try again.", "err");
        }
      }

      if (submitBtn) submitBtn.disabled = false;
    });
  }

  function init() {
    const root = document.getElementById("bug-report-panel");
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

  global.BugReport = { init };
})(window);
