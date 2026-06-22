/**
 * Rep payout method picker (accounts page) + team list (owner page).
 */
(function (global) {
  const LOCAL_KEY = "lpc_rep_payout_v1";
  const LOCAL_LIST_KEY = "lpc_rep_payouts_list_v1";
  const PAYOUT_ICON_BASE =
    "https://raw.githubusercontent.com/Delexoo/Sales-Dashboard/main/doc/";

  const PAYOUT_ICON_FILES = {
    cashapp: "Cashapp.png",
    venmo: "Venmo.png",
    paypal: "PayPal.png",
    zelle: "Zelle.png",
  };

  const METHODS = [
    {
      id: "cashapp",
      label: "Cash App",
      short: "$",
      placeholder: "cash.app/$yourname",
      hint: "Paste your Cash App link or $cashtag URL",
      fieldLabel: "Paste your payout link",
    },
    {
      id: "venmo",
      label: "Venmo",
      short: "V",
      placeholder: "venmo.com/u/yourname",
      hint: "Paste your Venmo profile link",
      fieldLabel: "Paste your payout link",
    },
    {
      id: "paypal",
      label: "PayPal",
      short: "P",
      placeholder: "paypal.me/yourname",
      hint: "Paste your PayPal.me link",
      fieldLabel: "Paste your payout link",
    },
    {
      id: "zelle",
      label: "Zelle",
      short: "Z",
      placeholder: "you@email.com or (555) 123-4567",
      hint: "Paste the email or phone you use for Zelle",
      fieldLabel: "Zelle email or phone",
      plainText: true,
    },
    {
      id: "applepay",
      label: "Apple Pay",
      short: "A",
      placeholder: "(555) 123-4567 or Apple ID email",
      hint: "Paste the phone number or email linked to your Apple Pay",
      fieldLabel: "Apple Pay details",
      plainText: true,
    },
    {
      id: "googlepay",
      label: "Google Pay",
      short: "G",
      placeholder: "you@gmail.com or phone",
      hint: "Paste the email or phone you use for Google Pay",
      fieldLabel: "Google Pay details",
      plainText: true,
    },
    {
      id: "wise",
      label: "Wise",
      short: "W",
      placeholder: "wise.com/pay/me/yourname",
      hint: "Paste your Wise payment link",
      fieldLabel: "Paste your Wise link",
    },
    {
      id: "stripe",
      label: "Stripe",
      short: "S",
      placeholder: "buy.stripe.com/your-link",
      hint: "Paste your Stripe Payment Link (buy.stripe.com, pay.stripe.com, or invoice URL)",
      fieldLabel: "Paste your Stripe link",
    },
    {
      id: "crypto",
      label: "Crypto",
      short: "₿",
      placeholder: "Wallet address or payment link",
      hint: "Paste your crypto wallet address or payment link",
      fieldLabel: "Crypto payout link",
      plainText: true,
    },
    {
      id: "other",
      label: "Other",
      short: "…",
      placeholder: "Payment link or phone number",
      hint: "Paste a payment link to your account or a phone number you use to get paid",
      fieldLabel: "Payment link or phone",
      plainText: true,
    },
  ];

  let client = null;

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
    };
  }

  function canSync() {
    const { url, key } = cfg();
    return !!(url && key && global.supabase?.createClient);
  }

  function getClient() {
    if (client) return client;
    if (!canSync()) return null;
    const { url, key } = cfg();
    client = global.supabase.createClient(url, key);
    return client;
  }

  function rep() {
    return global.RepSession?.get?.() || null;
  }

  function loadRepItem(base) {
    if (global.RepStorage?.loadItem) return global.RepStorage.loadItem(base);
    const id = rep()?.id;
    const key = id ? "lpc_rep_" + id + "_" + base : base;
    return localStorage.getItem(key);
  }

  function saveRepItem(base, value) {
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(base, value);
    else {
      const id = rep()?.id;
      const key = id ? "lpc_rep_" + id + "_" + base : base;
      localStorage.setItem(key, value);
    }
  }

  function removeRepItem(base) {
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(base, "");
    else {
      const id = rep()?.id;
      const key = id ? "lpc_rep_" + id + "_" + base : base;
      localStorage.removeItem(key);
    }
  }

  function methodMeta(id) {
    return METHODS.find((m) => m.id === id) || null;
  }

  function payoutIconUrl(id) {
    const file = PAYOUT_ICON_FILES[id];
    return file ? PAYOUT_ICON_BASE + file : "";
  }

  function renderMethodIcon(id, extraClass) {
    const meta = methodMeta(id);
    const extra = extraClass ? " " + extraClass : "";
    const url = payoutIconUrl(id);
    if (url) {
      return (
        `<span class="payout-method-icon-wrap payout-method-${esc(id)}${extra}" aria-hidden="true">` +
        `<img class="payout-method-icon-img" src="${esc(url)}" alt="" width="40" height="40" decoding="async">` +
        `</span>`
      );
    }
    const short = meta?.short || methodLabel(id).charAt(0);
    return (
      `<span class="payout-method-${esc(id)} payout-method-icon-host${extra}" aria-hidden="true">` +
      `<span class="payout-method-icon">${esc(short)}</span>` +
      `</span>`
    );
  }

  function orderMethodsWithDefault(methods, defaultMethod) {
    const list = Array.isArray(methods) ? methods.filter((m) => m?.method && m?.link) : [];
    if (list.length <= 1) return list;
    const id = String(defaultMethod || "").trim();
    if (!id) return list;
    const idx = list.findIndex((m) => m.method === id);
    if (idx <= 0) return list;
    const ordered = list.slice();
    const [picked] = ordered.splice(idx, 1);
    ordered.unshift(picked);
    return ordered;
  }

  function parseLocalListStore() {
    try {
      const raw = loadRepItem(LOCAL_LIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.methods)) {
          const methods = parsed.methods.filter((m) => m && m.method && m.link);
          const defaultMethod = parsed.defaultMethod || methods[0]?.method || null;
          return {
            methods: orderMethodsWithDefault(methods, defaultMethod),
            defaultMethod,
          };
        }
      }
    } catch (e) {
      /* ignore */
    }
    const legacy = loadLocal();
    if (legacy?.method && legacy?.link) {
      const methods = [
        {
          method: legacy.method,
          link: legacy.link,
          updatedAt: legacy.updatedAt || null,
        },
      ];
      return { methods, defaultMethod: legacy.method };
    }
    return { methods: [], defaultMethod: null };
  }

  function loadLocalList() {
    return parseLocalListStore().methods;
  }

  function loadDefaultMethodKey() {
    return parseLocalListStore().defaultMethod;
  }

  function hasLocalListStore() {
    try {
      const raw = loadRepItem(LOCAL_LIST_KEY);
      return raw != null && raw !== "";
    } catch (e) {
      return false;
    }
  }

  function clearLocalPayout() {
    try {
      removeRepItem(LOCAL_KEY);
      removeRepItem(LOCAL_LIST_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function saveLocalList(methods, defaultMethod) {
    const list = Array.isArray(methods)
      ? methods.filter((m) => m && m.method && m.link)
      : [];
    if (!list.length) {
      try {
        saveRepItem(
          LOCAL_LIST_KEY,
          JSON.stringify({ methods: [], defaultMethod: null })
        );
        removeRepItem(LOCAL_KEY);
      } catch (e) {
        /* ignore */
      }
      return;
    }
    const resolvedDefault =
      (defaultMethod && list.some((m) => m.method === defaultMethod) ? defaultMethod : null) ||
      loadDefaultMethodKey() ||
      list[0].method;
    const ordered = orderMethodsWithDefault(list, resolvedDefault);
    saveRepItem(
      LOCAL_LIST_KEY,
      JSON.stringify({ methods: ordered, defaultMethod: resolvedDefault })
    );
    const primary = ordered[0];
    saveLocal({
      method: primary.method,
      link: primary.link,
      updatedAt: primary.updatedAt || new Date().toISOString(),
    });
  }

  function notifyPayoutChanged(detail) {
    try {
      global.dispatchEvent(
        new CustomEvent("payout-methods-changed", { detail: detail || {} })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function saveChecklistProgress(mutator) {
    try {
      const key = global.RepStorage?.key
        ? global.RepStorage.key("lpc_sales_onboarding_progress_v1")
        : "lpc_sales_onboarding_progress_v1";
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem("lpc_sales_onboarding_progress_v1")
        : localStorage.getItem(key);
      const p = JSON.parse(raw || "{}");
      mutator(p);
      const json = JSON.stringify(p);
      if (global.RepStorage?.saveItem) {
        global.RepStorage.saveItem("lpc_sales_onboarding_progress_v1", json);
      } else {
        localStorage.setItem(key, json);
      }
      try {
        global.dispatchEvent(new CustomEvent("onboarding-progress-changed"));
      } catch (e) {
        /* ignore */
      }
    } catch (e) {
      /* ignore */
    }
  }

  function loadLocal() {
    try {
      const raw = loadRepItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLocal(data) {
    saveRepItem(LOCAL_KEY, JSON.stringify(data));
  }

  function parseCloudMethods(data) {
    if (!data) return [];
    let json = data.methods_json;
    if (typeof json === "string") {
      try {
        json = JSON.parse(json);
      } catch (e) {
        json = null;
      }
    }
    if (Array.isArray(json) && json.length) {
      return json
        .map((row) => ({
          method: row.method,
          link: row.payout_link || row.link,
          updatedAt: row.updated_at || data.updated_at,
        }))
        .filter((m) => m.method && m.link);
    }
    if (data.method && data.payout_link) {
      return [
        {
          method: data.method,
          link: data.payout_link,
          updatedAt: data.updated_at,
        },
      ];
    }
    return [];
  }

  function mergeMethods(...lists) {
    const byMethod = new Map();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        if (!m?.method || !m?.link) continue;
        const prev = byMethod.get(m.method);
        const prevAt = prev?.updatedAt || "";
        const nextAt = m.updatedAt || "";
        if (!prev || nextAt >= prevAt) {
          byMethod.set(m.method, {
            method: m.method,
            link: m.link,
            updatedAt: m.updatedAt || prev?.updatedAt || null,
          });
        }
      }
    }
    return Array.from(byMethod.values());
  }

  function primaryMethod(methods) {
    if (!methods.length) return null;
    return methods[0];
  }

  async function syncCloud(methods) {
    const r = rep();
    const sb = getClient();
    if (!r || !sb) return { cloud: false };

    if (!methods.length) {
      const { error } = await sb.from("rep_payouts").delete().eq("rep_id", r.id);
      if (error) throw error;
      return { cloud: true };
    }

    const primary = primaryMethod(methods) || methods[0];
    const updatedAt = primary.updatedAt || new Date().toISOString();
    const row = {
      rep_id: r.id,
      rep_name: r.name,
      method: primary.method,
      payout_link: primary.link,
      updated_at: updatedAt,
      methods_json: methods.map((m) => ({
        method: m.method,
        payout_link: m.link,
      })),
    };

    let { error } = await sb.from("rep_payouts").upsert(row, { onConflict: "rep_id" });
    if (error && /methods_json|column|schema cache/i.test(String(error.message || ""))) {
      const fallback = { ...row };
      delete fallback.methods_json;
      ({ error } = await sb.from("rep_payouts").upsert(fallback, { onConflict: "rep_id" }));
    }
    if (error) throw error;
    return { cloud: true };
  }

  function isPlainTextMethod(method) {
    return !!METHODS.find((m) => m.id === method)?.plainText;
  }

  function normalizeLink(method, raw) {
    const t = String(raw || "").trim();
    if (!t) return "";
    if (isPlainTextMethod(method)) return t;
    if (/^https?:\/\//i.test(t)) return t;
    if (method === "cashapp") {
      if (t.startsWith("$")) return "https://cash.app/" + t.replace(/^\$/, "");
      if (t.includes("cash.app")) return "https://" + t.replace(/^https?:\/\//i, "");
      return "https://cash.app/" + t.replace(/^\/+/, "");
    }
    if (method === "venmo") {
      if (t.includes("venmo.com")) return "https://" + t.replace(/^https?:\/\//i, "");
      return "https://venmo.com/u/" + t.replace(/^@/, "").replace(/^\/+/, "");
    }
    if (method === "paypal") {
      if (t.includes("paypal.")) return "https://" + t.replace(/^https?:\/\//i, "");
      return "https://paypal.me/" + t.replace(/^\/+/, "");
    }
    if (method === "wise") {
      if (t.includes("wise.com")) return "https://" + t.replace(/^https?:\/\//i, "");
      return "https://wise.com/pay/me/" + t.replace(/^\/+/, "");
    }
    if (method === "stripe") {
      if (/stripe\.com/i.test(t)) {
        return /^https?:\/\//i.test(t) ? t : "https://" + t.replace(/^\/+/, "");
      }
      return t;
    }
    return t;
  }

  function methodLabel(id) {
    const hit = METHODS.find((m) => m.id === id);
    if (hit) return hit.label;
    if (!id) return "";
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function fetchCloudMethodsForRep() {
    const r = rep();
    const sb = getClient();
    if (!sb || !r) return [];

    let data = null;
    let error = null;
    ({ data, error } = await sb
      .from("rep_payouts")
      .select("method,payout_link,updated_at,methods_json")
      .eq("rep_id", r.id)
      .maybeSingle());
    if (error && /methods_json|column|schema cache/i.test(String(error.message || ""))) {
      ({ data, error } = await sb
        .from("rep_payouts")
        .select("method,payout_link,updated_at")
        .eq("rep_id", r.id)
        .maybeSingle());
    }
    if (error) throw error;
    return data ? parseCloudMethods(data) : [];
  }

  async function fetchAllMine() {
    const localStore = parseLocalListStore();

    if (hasLocalListStore()) {
      const defaultMethod =
        localStore.defaultMethod || localStore.methods[0]?.method || null;
      return orderMethodsWithDefault(localStore.methods, defaultMethod);
    }

    let methods = localStore.methods.slice();
    const cloud = await fetchCloudMethodsForRep();
    if (cloud.length) {
      methods = mergeMethods(methods, cloud);
    }

    const defaultMethod = methods[0]?.method || null;
    methods = orderMethodsWithDefault(methods, defaultMethod);
    if (methods.length) saveLocalList(methods, defaultMethod);
    return methods;
  }

  async function fetchMine() {
    const methods = await fetchAllMine();
    if (methods[0]) {
      return {
        method: methods[0].method,
        link: methods[0].link,
        updatedAt: methods[0].updatedAt,
      };
    }
    return loadLocal();
  }

  async function saveOne(method, link) {
    const normalized = normalizeLink(method, link);
    if (!normalized) throw new Error("Enter your payout link");

    const entry = {
      method,
      link: normalized,
      updatedAt: new Date().toISOString(),
    };

    const localBefore = loadLocalList();
    let methods = mergeMethods(localBefore, await fetchAllMine());
    const idx = methods.findIndex((m) => m.method === method);
    if (idx >= 0) methods[idx] = entry;
    else methods.push(entry);

    const defaultMethod = loadDefaultMethodKey() || methods[0]?.method;
    methods = orderMethodsWithDefault(methods, defaultMethod);
    saveLocalList(methods, defaultMethod);
    await syncCloud(methods);
    markPayoutChecklistDone();
    notifyPayoutChanged({ methods });
    return entry;
  }

  async function saveMine(method, link) {
    const entry = await saveOne(method, link);
    return {
      method: entry.method,
      link: entry.link,
      updatedAt: entry.updatedAt,
    };
  }

  async function removeOne(method) {
    const id = String(method || "").trim();
    if (!id) throw new Error("Choose a payout method to remove.");

    let methods = loadLocalList();
    if (!methods.length && !hasLocalListStore()) {
      methods = await fetchCloudMethodsForRep();
    }
    methods = methods.filter((m) => m.method !== id);

    let defaultMethod = loadDefaultMethodKey();
    if (defaultMethod === id) defaultMethod = methods[0]?.method || null;
    methods = orderMethodsWithDefault(methods, defaultMethod);
    saveLocalList(methods, defaultMethod);

    try {
      await syncCloud(methods);
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (/policy|permission|denied|42501/i.test(msg)) {
        throw new Error(
          "Could not update Supabase — run supabase-rep-payouts-setup.sql (delete policy) in the SQL Editor."
        );
      }
      throw e;
    }

    if (!methods.length) unmarkPayoutChecklist();
    else markPayoutChecklistDone();
    notifyPayoutChanged({ methods });
    return methods;
  }

  async function setDefaultPayout(method) {
    const id = String(method || "").trim();
    if (!id) throw new Error("Choose a payout method.");

    let methods = mergeMethods(loadLocalList(), await fetchAllMine());
    if (!methods.some((m) => m.method === id)) {
      throw new Error("That payout method was not found.");
    }

    methods = orderMethodsWithDefault(methods, id);
    saveLocalList(methods, id);

    try {
      await syncCloud(methods);
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (/policy|permission|denied|42501/i.test(msg)) {
        throw new Error(
          "Could not update Supabase — run supabase-rep-payouts-setup.sql in the SQL Editor."
        );
      }
      throw e;
    }

    markPayoutChecklistDone();
    notifyPayoutChanged({ methods, defaultMethod: id });
    return methods;
  }

  async function resetMine() {
    const r = rep();
    if (!r?.id) {
      throw new Error("Sign in with your PIN before resetting payout.");
    }

    clearLocalPayout();

    const sb = getClient();
    if (!sb) {
      unmarkPayoutChecklist();
      notifyPayoutChanged({ methods: [] });
      return { cloud: false, reason: "no_client" };
    }

    const { error } = await sb.from("rep_payouts").delete().eq("rep_id", r.id);
    if (error) {
      const msg = String(error.message || "");
      if (/policy|permission|denied|42501/i.test(msg)) {
        throw new Error(
          "Could not delete from Supabase — run supabase-rep-payouts-setup.sql (delete policy) in the SQL Editor."
        );
      }
      throw error;
    }

    unmarkPayoutChecklist();
    notifyPayoutChanged({ methods: [] });
    return { cloud: true };
  }

  function unmarkPayoutChecklist() {
    saveChecklistProgress((p) => {
      delete p.payout;
      delete p.module_setup_accounts;
      delete p.module_setup;
    });
  }

  function markPayoutChecklistDone() {
    saveChecklistProgress((p) => {
      p.payout = true;
    });
  }

  function renderMethodButtons(selected) {
    return METHODS.map(
      (m) =>
        `<button type="button" class="payout-method-btn payout-method-${esc(m.id)}" data-method="${esc(m.id)}" aria-pressed="${selected === m.id ? "true" : "false"}">` +
        renderMethodIcon(m.id) +
        `<span class="payout-method-label">${esc(m.label)}</span>` +
        `</button>`
    ).join("");
  }

  function initRepForm(root) {
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "1";

    let selectedMethod = null;
    let saved = null;

    const methodsEl = root.querySelector("#payout-methods");
    const panelEl = root.querySelector("#payout-input-panel");
    const inputEl = root.querySelector("#payout-link-input");
    const hintEl = root.querySelector("#payout-input-hint");
    const saveBtn = root.querySelector("#payout-save-btn");
    const resetBtn = root.querySelector("#payout-reset-btn");
    const fieldLabelEl = root.querySelector("#payout-field-label");
    const statusEl = root.querySelector("#payout-status");
    const savedEl = root.querySelector("#payout-saved-preview");

    function showStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.hidden = !msg;
      statusEl.className = "payout-status" + (type ? " payout-status-" + type : "");
    }

    function showSavedPreview(data) {
      if (!savedEl || !data?.link) {
        if (savedEl) savedEl.hidden = true;
        return;
      }
      const plain = isPlainTextMethod(data.method);
      savedEl.hidden = false;
      savedEl.innerHTML =
        `<p class="payout-saved-title">Saved for <strong>${esc(rep()?.name || "you")}</strong></p>` +
        `<p class="payout-saved-row"><span class="legal-pill">${esc(methodLabel(data.method))}</span> ` +
        (plain
          ? `<span class="payout-saved-text">${esc(data.link)}</span>`
          : `<a class="link-bold-blue" href="${esc(data.link)}" target="_blank" rel="noopener">${esc(data.link)}</a>`) +
        `</p>`;
    }

    function clearForm() {
      selectedMethod = null;
      saved = null;
      if (inputEl) inputEl.value = "";
      if (panelEl) panelEl.hidden = true;
      if (savedEl) savedEl.hidden = true;
      methodsEl?.querySelectorAll(".payout-method-btn").forEach((btn) => {
        btn.setAttribute("aria-pressed", "false");
      });
      showStatus("", "");
    }

    function openPanel(method) {
      selectedMethod = method;
      const meta = METHODS.find((m) => m.id === method);
      if (panelEl) panelEl.hidden = false;
      if (fieldLabelEl) {
        fieldLabelEl.textContent = meta?.fieldLabel || "Paste your payout link";
      }
      if (inputEl) {
        inputEl.placeholder = meta?.placeholder || "";
        inputEl.value =
          saved && saved.method === method ? saved.link : "";
        inputEl.focus();
      }
      if (hintEl) hintEl.textContent = meta?.hint || "";
      methodsEl?.querySelectorAll(".payout-method-btn").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.method === method ? "true" : "false");
      });
      showStatus("", "");
    }

    methodsEl?.querySelectorAll(".payout-method-btn").forEach((btn) => {
      btn.addEventListener("click", () => openPanel(btn.dataset.method));
    });

    resetBtn?.addEventListener("click", async () => {
      if (
        !saved?.link &&
        !inputEl?.value?.trim() &&
        !selectedMethod
      ) {
        clearForm();
        return;
      }
      if (
        !window.confirm(
          "Clear your saved payout method? You will need to set it again before getting paid."
        )
      ) {
        return;
      }
      resetBtn.disabled = true;
      showStatus("Resetting…", "");
      try {
        const result = await resetMine();
        clearForm();
        if (result?.cloud) {
          showStatus("Payout cleared on this device and removed from Supabase.", "ok");
        } else {
          showStatus(
            "Payout cleared on this device. Supabase is not connected — owner will not see a team link until you save again.",
            "warn"
          );
        }
      } catch (e) {
        console.warn(e);
        showStatus(e.message || "Could not reset. Try again.", "err");
      }
      resetBtn.disabled = false;
    });

    saveBtn?.addEventListener("click", async () => {
      if (!selectedMethod) {
        showStatus("Choose a payout method first.", "warn");
        return;
      }
      const link = inputEl?.value?.trim();
      if (!link) {
        const meta = METHODS.find((m) => m.id === selectedMethod);
        showStatus(meta?.hint || "Enter your payout details.", "warn");
        inputEl?.focus();
        return;
      }
      saveBtn.disabled = true;
      showStatus("Saving…", "");
      try {
        saved = await saveMine(selectedMethod, link);
        markPayoutChecklistDone();
        showStatus("Saved — your manager can see this when a deal closes.", "ok");
        showSavedPreview(saved);
      } catch (e) {
        console.warn(e);
        showStatus(e.message || "Could not save. Try again.", "err");
      }
      saveBtn.disabled = false;
    });

    inputEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveBtn?.click();
      }
    });

    (async () => {
      try {
        saved = await fetchMine();
        if (saved?.method) {
          selectedMethod = saved.method;
          methodsEl?.querySelectorAll(".payout-method-btn").forEach((btn) => {
            btn.setAttribute("aria-pressed", btn.dataset.method === saved.method ? "true" : "false");
          });
          if (panelEl) panelEl.hidden = false;
          if (inputEl) inputEl.value = saved.link || "";
          const meta = METHODS.find((m) => m.id === saved.method);
          if (fieldLabelEl) {
            fieldLabelEl.textContent = meta?.fieldLabel || "Paste your payout link";
          }
          if (hintEl) hintEl.textContent = meta?.hint || "";
          showSavedPreview(saved);
          showStatus("You can update your link anytime.", "ok");
        }
      } catch (e) {
        console.warn("Payout load failed", e);
      }
    })();
  }

  function init() {
    const run = () => {
      const form = document.getElementById("payout-setup");
      if (form) {
        const methods = form.querySelector("#payout-methods");
        if (methods && !methods.innerHTML.trim()) {
          methods.innerHTML = renderMethodButtons(null);
        }
        if (global.RepStorage?.whenReady) {
          global.RepStorage.whenReady(() => initRepForm(form));
        } else {
          initRepForm(form);
        }
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

  global.PayoutSetup = {
    METHODS,
    fetchMine,
    fetchAllMine,
    loadLocalMethods: loadLocalList,
    mergeMethods,
    saveMine,
    saveOne,
    setDefaultPayout,
    removeOne,
    resetMine,
    orderMethodsWithDefault,
    methodLabel,
    methodMeta,
    isPlainTextMethod,
    renderMethodButtons,
    renderMethodIcon,
    esc,
    markPayoutChecklistDone,
    unmarkPayoutChecklist,
  };
})(window);
