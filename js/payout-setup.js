/**
 * Rep payout method picker (accounts page) + team list (owner page).
 */
(function (global) {
  const LOCAL_KEY = "lpc_rep_payout_v1";
  const LOCAL_LIST_KEY = "lpc_rep_payouts_list_v1";
  const PAYOUT_ICON_BASE =
    "https://raw.githubusercontent.com/Delexoo/Dashboard/main/doc/";

  const PAYOUT_ICON_FILES = {
    cashapp: "Cashapp.png",
    venmo: "Venmo.png",
    paypal: "PayPal.png",
    zelle: "Zelle.png",
    applepay: "ApplePay.png",
    googlepay: "GooglePay.png",
    stripe: "Stripe.png",
    crypto: "Bitcoin.png",
  };

  const REMOVED_METHODS = new Set(["wise"]);

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

  const PAYOUT_PHONE_COUNTRIES = [
    { id: "US", name: "United States", dial: "1" },
    { id: "CA", name: "Canada", dial: "1" },
    { id: "GB", name: "United Kingdom", dial: "44" },
    { id: "AU", name: "Australia", dial: "61" },
    { id: "MX", name: "Mexico", dial: "52" },
    { id: "IN", name: "India", dial: "91" },
    { id: "PH", name: "Philippines", dial: "63" },
    { id: "DE", name: "Germany", dial: "49" },
    { id: "FR", name: "France", dial: "33" },
    { id: "BR", name: "Brazil", dial: "55" },
  ];

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
    };
  }

  function canSync() {
    return !!global.SiteSupabase?.canUse?.();
  }

  function getClient() {
    return canSync() ? global.SiteSupabase?.getClient?.() || null : null;
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

  function isSupportedMethod(id) {
    return !REMOVED_METHODS.has(String(id || "").trim());
  }

  function filterSupportedMethods(methods) {
    if (!Array.isArray(methods)) return [];
    return methods.filter((m) => m?.method && m?.link && isSupportedMethod(m.method));
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

  function payoutLinkHref(method, rawLink) {
    const link = String(rawLink || "").trim();
    if (!link) return "";
    if (isPlainTextMethod(method) && !/^https?:\/\//i.test(link)) return "";
    return /^https?:\/\//i.test(link) ? link : "https://" + link.replace(/^\/+/, "");
  }

  function payoutCountryById(id) {
    return PAYOUT_PHONE_COUNTRIES.find((c) => c.id === id) || PAYOUT_PHONE_COUNTRIES[0];
  }

  function usesPhoneField(method) {
    return method === "applepay" || method === "zelle" || method === "googlepay";
  }

  function parsePhoneStorage(raw) {
    const t = String(raw || "").trim();
    if (!t || t.includes("@")) return null;
    let digits = t.replace(/\D/g, "");
    if (!digits) return null;

    if (t.startsWith("+")) {
      const sorted = PAYOUT_PHONE_COUNTRIES.slice().sort((a, b) => b.dial.length - a.dial.length);
      for (const c of sorted) {
        if (digits.startsWith(c.dial) && digits.length > c.dial.length) {
          return { countryId: c.id, dial: c.dial, national: digits.slice(c.dial.length) };
        }
      }
    }

    if (digits.length === 11 && digits[0] === "1") {
      return { countryId: "US", dial: "1", national: digits.slice(1) };
    }
    if (digits.length === 10) {
      return { countryId: "US", dial: "1", national: digits };
    }
    return { countryId: "US", dial: "1", national: digits };
  }

  function formatUsCaPhoneInput(digits) {
    const d = String(digits || "").replace(/\D/g, "").slice(0, 10);
    if (!d) return "";
    if (d.length <= 3) return "(" + d;
    if (d.length <= 6) return "(" + d.slice(0, 3) + ") " + d.slice(3);
    return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
  }

  function formatNationalPhoneInput(digits, dial) {
    if (dial === "1") return formatUsCaPhoneInput(digits);
    return String(digits || "").replace(/\D/g, "").slice(0, 15);
  }

  function normalizePhoneStorage(rawNational, countryId) {
    const country = payoutCountryById(countryId);
    const t = String(rawNational || "").trim();
    if (!t) return "";
    if (t.includes("@")) return t;

    let national = t.replace(/\D/g, "");
    if (country.dial === "1" && national.length === 11 && national[0] === "1") {
      national = national.slice(1);
    }
    if (country.dial === "1") {
      if (national.length !== 10) {
        throw new Error("Enter a complete 10-digit phone number.");
      }
    } else if (national.length < 6) {
      throw new Error("Enter a valid phone number.");
    }
    return "+" + country.dial + national;
  }

  function formatPhoneDisplay(raw) {
    const t = String(raw || "").trim();
    if (!t) return "";
    if (t.includes("@")) return t;
    const parsed = parsePhoneStorage(t);
    if (!parsed?.national) return t;
    const nationalFmt = formatNationalPhoneInput(parsed.national, parsed.dial);
    if (parsed.dial === "1") return "+1 " + nationalFmt;
    return "+" + parsed.dial + " " + nationalFmt;
  }

  function renderPhoneCountriesSelect(selectedId) {
    const pick = selectedId || "US";
    return PAYOUT_PHONE_COUNTRIES.map((c) => {
      const sel = c.id === pick ? " selected" : "";
      return (
        '<option value="' +
        esc(c.id) +
        '" data-dial="' +
        esc(c.dial) +
        '"' +
        sel +
        ">" +
        esc(c.name) +
        " (+" +
        esc(c.dial) +
        ")</option>"
      );
    }).join("");
  }

  function mountLinkField(host, options) {
    if (!host) return null;
    options = options || {};
    const method = options.method;
    const inputId = options.inputId || "payout-link-input";
    const selectId = options.selectId || inputId + "-country";
    const stored = String(options.value || "");

    host.innerHTML = "";
    host.classList.remove("payout-link-field-host--phone");
    host._payoutLinkField = null;

    if (!usesPhoneField(method)) {
      host.innerHTML =
        '<input type="text" id="' +
        esc(inputId) +
        '" class="payout-link-input" autocomplete="off" spellcheck="false" placeholder="' +
        esc(options.placeholder || "") +
        '" value="' +
        esc(stored) +
        '" />';
      const input = host.querySelector("#" + inputId);
      const api = {
        read() {
          return String(input?.value || "").trim();
        },
        focus() {
          input?.focus();
        },
      };
      host._payoutLinkField = api;
      return api;
    }

    host.classList.add("payout-link-field-host--phone");
    const isEmail = stored.includes("@");
    const parsed = isEmail ? null : parsePhoneStorage(stored);
    const countryId = parsed?.countryId || "US";
    const nationalDisplay = isEmail
      ? stored
      : formatNationalPhoneInput(parsed?.national || "", parsed?.dial || "1");
    const placeholder =
      method === "applepay" ? "(555) 123-4567 or email" : "(555) 123-4567";

    host.innerHTML =
      '<div class="payout-phone-row">' +
      '<select id="' +
      esc(selectId) +
      '" class="payout-phone-country" aria-label="Country code">' +
      renderPhoneCountriesSelect(countryId) +
      "</select>" +
      '<input type="tel" id="' +
      esc(inputId) +
      '" class="payout-link-input payout-phone-input" autocomplete="tel" inputmode="tel" spellcheck="false" placeholder="' +
      esc(placeholder) +
      '" value="' +
      esc(nationalDisplay) +
      '" />' +
      "</div>";

    const select = host.querySelector("#" + selectId);
    const input = host.querySelector("#" + inputId);

    function currentDial() {
      return select?.selectedOptions?.[0]?.dataset.dial || "1";
    }

    function applyPhoneFormat() {
      if (!input) return;
      const raw = input.value;
      if (raw.includes("@")) return;
      const formatted = formatNationalPhoneInput(raw.replace(/\D/g, ""), currentDial());
      if (input.value !== formatted) input.value = formatted;
    }

    select?.addEventListener("change", applyPhoneFormat);
    input?.addEventListener("input", applyPhoneFormat);

    const api = {
      read() {
        const raw = String(input?.value || "").trim();
        if (!raw) return "";
        if (raw.includes("@")) return raw;
        return normalizePhoneStorage(raw, select?.value || "US");
      },
      focus() {
        input?.focus();
      },
    };
    host._payoutLinkField = api;
    return api;
  }

  function readLinkField(host) {
    return host?._payoutLinkField?.read?.() || "";
  }

  function looksLikePhone(value) {
    const text = String(value || "").trim();
    if (!text || text.includes("@")) return false;
    if (text.startsWith("+")) return parsePhoneStorage(text)?.national?.length >= 6;
    const digits = text.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 && /^[\d\s().+-]+$/.test(text);
  }

  function isOpaqueSlug(value) {
    const token = String(value || "").trim();
    return token.length >= 12 && /^[a-zA-Z0-9_-]+$/.test(token);
  }

  function shortenToken(value, keepEnd) {
    keepEnd = keepEnd || 4;
    const token = String(value || "").trim();
    if (token.length <= keepEnd + 3) return token;
    return "…" + token.slice(-keepEnd);
  }

  function shortenAddress(value) {
    const token = String(value || "").trim();
    if (token.length <= 14) return token;
    return token.slice(0, 6) + "…" + token.slice(-4);
  }

  function friendlyUrlHandle(link, opts) {
    opts = opts || {};
    try {
      const href = /^https?:\/\//i.test(link) ? link : "https://" + link.replace(/^\/+/, "");
      const url = new URL(href);
      const host = url.hostname.replace(/^www\./i, "");
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1] || "";

      if (!last) return host;
      if (isOpaqueSlug(last)) return host + " · " + shortenToken(last, 5);
      if (last.length > 28) return host + " · " + shortenToken(last, 6);
      if (/^[a-zA-Z0-9._-]+$/.test(last) && last.length <= 24 && !isOpaqueSlug(last)) {
        return last.startsWith("@") ? last : "@" + last.replace(/^@/, "");
      }
      return host + "/" + last;
    } catch (e) {
      return opts.fallbackLabel || link;
    }
  }

  function payoutLinkHandle(method, rawLink) {
    const link = String(rawLink || "").trim();
    if (!link) return "";
    const id = String(method || "").trim();

    if (id === "cashapp") {
      const fromUrl = link.match(/cash\.app\/([^/?#]+)/i);
      if (fromUrl) {
        const h = fromUrl[1].replace(/^\$/, "");
        return h.startsWith("@") ? h : "@" + h;
      }
      const bare = link.replace(/^\$/, "").trim();
      if (bare && !/^https?:\/\//i.test(bare)) return bare.startsWith("@") ? bare : "@" + bare;
    }

    if (id === "venmo") {
      const fromUrl = link.match(/venmo\.com\/(?:u\/)?([^/?#]+)/i);
      if (fromUrl) return "@" + fromUrl[1].replace(/^@/, "");
      if (link.startsWith("@")) return link;
      if (!/^https?:\/\//i.test(link)) return "@" + link.replace(/^@/, "");
    }

    if (id === "paypal") {
      const fromUrl = link.match(/paypal\.me\/([^/?#]+)/i);
      if (fromUrl) return "@" + fromUrl[1].replace(/^@/, "");
      if (/^https?:\/\//i.test(link)) return friendlyUrlHandle(link, { fallbackLabel: "PayPal link" });
    }

    if (id === "stripe") {
      if (/^https?:\/\//i.test(link) || /stripe\.com/i.test(link)) {
        return friendlyUrlHandle(link, { fallbackLabel: "Stripe payment link" });
      }
      if (isOpaqueSlug(link)) return "Stripe · " + shortenToken(link, 5);
      return "Stripe payment link";
    }

    if (id === "crypto") {
      if (/^https?:\/\//i.test(link)) return friendlyUrlHandle(link, { fallbackLabel: "Crypto link" });
      return shortenAddress(link);
    }

    if (id === "zelle" || id === "applepay" || id === "googlepay") {
      if (looksLikePhone(link)) return formatPhoneDisplay(link);
      return link;
    }

    if (id === "other") {
      if (/^https?:\/\//i.test(link) || /\.\w{2,}\//.test(link)) {
        return friendlyUrlHandle(link, { fallbackLabel: "Payment link" });
      }
      if (looksLikePhone(link)) return formatPhoneDisplay(link);
      if (link.length > 28) return shortenAddress(link);
      return link;
    }

    if (isPlainTextMethod(id)) {
      if (looksLikePhone(link)) return formatPhoneDisplay(link);
      if (link.length > 28) return shortenAddress(link);
      return link;
    }

    if (/^https?:\/\//i.test(link)) return friendlyUrlHandle(link);

    if (isOpaqueSlug(link)) return shortenToken(link, 5);

    return link;
  }

  function renderSavedPayoutRow(entry, opts) {
    opts = opts || {};
    if (!entry?.method || !entry?.link) return "";

    const method = entry.method;
    const link = String(entry.link).trim();
    const handle = payoutLinkHandle(method, link);
    const href = payoutLinkHref(method, link);
    const label = methodLabel(method);
    const removeAttr = opts.removeAttr || "data-remove-payout";
    const iconClass = opts.iconClass || "payout-saved-icon";
    const handleHtml = esc(handle || link);
    const icon = renderMethodIcon(method, iconClass);

    const main = href
      ? `<a class="payout-saved-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icon}<span class="payout-saved-handle">${handleHtml}</span></a>`
      : `<div class="payout-saved-link payout-saved-link--plain">${icon}<span class="payout-saved-handle">${handleHtml}</span></div>`;

    const removeBtn =
      opts.removable === false
        ? ""
        : `<button type="button" class="payout-saved-remove" ${removeAttr}="${esc(method)}" aria-label="Remove ${esc(label)}">×</button>`;

    return (
      `<div class="payout-saved-row">` +
      `<div class="payout-saved-row-body">${main}</div>` +
      removeBtn +
      `</div>`
    );
  }

  function orderMethodsWithDefault(methods, defaultMethod) {
    const list = filterSupportedMethods(Array.isArray(methods) ? methods : []);
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
          const methods = filterSupportedMethods(parsed.methods);
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
    if (legacy?.method && legacy?.link && isSupportedMethod(legacy.method)) {
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
      ? filterSupportedMethods(methods)
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
        .filter((m) => m.method && m.link && isSupportedMethod(m.method));
    }
    if (data.method && data.payout_link && isSupportedMethod(data.method)) {
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
        if (!m?.method || !m?.link || !isSupportedMethod(m.method)) continue;
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

  function normalizeLink(method, raw, opts) {
    opts = opts || {};
    const t = String(raw || "").trim();
    if (!t) return "";
    if (isPlainTextMethod(method)) {
      if (usesPhoneField(method) && !t.includes("@")) {
        if (/^\+\d{7,15}$/.test(t.replace(/[^\d+]/g, ""))) {
          return t.replace(/[^\d+]/g, "");
        }
        const parsed = parsePhoneStorage(t);
        return normalizePhoneStorage(t, opts.countryId || parsed?.countryId || "US");
      }
      return t;
    }
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
          "Could not update Supabase · run supabase-rep-payouts-setup.sql (delete policy) in the SQL Editor."
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
          "Could not update Supabase · run supabase-rep-payouts-setup.sql in the SQL Editor."
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
          "Could not delete from Supabase · run supabase-rep-payouts-setup.sql (delete policy) in the SQL Editor."
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
    const fieldHost = root.querySelector("#payout-link-field-host");
    const hintEl = root.querySelector("#payout-input-hint");
    const saveBtn = root.querySelector("#payout-save-btn");
    const resetBtn = root.querySelector("#payout-reset-btn");
    const fieldLabelEl = root.querySelector("#payout-field-label");
    const statusEl = root.querySelector("#payout-status");
    const savedEl = root.querySelector("#payout-saved-preview");
    let linkField = null;

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
      savedEl.hidden = false;
      savedEl.innerHTML =
        `<p class="payout-saved-title">Saved for <strong>${esc(rep()?.name || "you")}</strong></p>` +
        renderSavedPayoutRow(data, { removable: false });
    }

    function clearForm() {
      selectedMethod = null;
      saved = null;
      linkField = null;
      if (fieldHost) fieldHost.innerHTML = "";
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
      linkField = mountLinkField(fieldHost, {
        method,
        value: saved && saved.method === method ? saved.link : "",
        inputId: "payout-link-input",
        placeholder: meta?.placeholder || "",
      });
      if (hintEl) hintEl.textContent = meta?.hint || "";
      methodsEl?.querySelectorAll(".payout-method-btn").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.method === method ? "true" : "false");
      });
      showStatus("", "");
      linkField?.focus();
    }

    methodsEl?.querySelectorAll(".payout-method-btn").forEach((btn) => {
      btn.addEventListener("click", () => openPanel(btn.dataset.method));
    });

    resetBtn?.addEventListener("click", async () => {
      if (
        !saved?.link &&
        !readLinkField(fieldHost) &&
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
            "Payout cleared on this device. Supabase is not connected · owner will not see a team link until you save again.",
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
      const link = readLinkField(fieldHost);
      if (!link) {
        const meta = METHODS.find((m) => m.id === selectedMethod);
        showStatus(meta?.hint || "Enter your payout details.", "warn");
        linkField?.focus();
        return;
      }
      saveBtn.disabled = true;
      showStatus("Saving…", "");
      try {
        saved = await saveMine(selectedMethod, link);
        markPayoutChecklistDone();
        showStatus("Saved · your manager can see this when a deal closes.", "ok");
        showSavedPreview(saved);
      } catch (e) {
        console.warn(e);
        showStatus(e.message || "Could not save. Try again.", "err");
      }
      saveBtn.disabled = false;
    });

    fieldHost?.addEventListener("keydown", (e) => {
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
          const meta = METHODS.find((m) => m.id === saved.method);
          if (fieldLabelEl) {
            fieldLabelEl.textContent = meta?.fieldLabel || "Paste your payout link";
          }
          linkField = mountLinkField(fieldHost, {
            method: saved.method,
            value: saved.link || "",
            inputId: "payout-link-input",
            placeholder: meta?.placeholder || "",
          });
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
    renderSavedPayoutRow,
    payoutLinkHandle,
    payoutLinkHref,
    usesPhoneField,
    mountLinkField,
    readLinkField,
    formatPhoneDisplay,
    esc,
    markPayoutChecklistDone,
    unmarkPayoutChecklist,
  };
})(window);
