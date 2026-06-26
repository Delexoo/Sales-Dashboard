/**
 * Rep profile photo · Supabase Storage (rep-avatars) + synced settings_json key.
 */
(function (global) {
  const KEY = "lpc_rep_profile_photo_v1";
  const BUCKET = "rep-avatars";
  const DEFAULT_URL =
    "https://raw.githubusercontent.com/Delexoo/Dashboard/main/doc/Default.jpg";
  const MAX_BYTES = 2 * 1024 * 1024;
  const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
    };
  }

  function canUseCloud() {
    return !!global.SiteSupabase?.canUse?.();
  }

  function getClient() {
    return global.SiteSupabase?.getClient?.() || null;
  }

  function loadStored() {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem(KEY)
        : localStorage.getItem(KEY);
      if (!raw) return { url: "", path: "" };
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return { url: parsed, path: "" };
      return {
        url: String(parsed?.url || "").trim(),
        path: String(parsed?.path || "").trim(),
      };
    } catch (e) {
      return { url: "", path: "" };
    }
  }

  function saveStored(data, opts) {
    const url = String(data?.url || "").trim();
    const path = String(data?.path || "").trim();
    const json = url ? JSON.stringify({ url, path }) : "";
    if (global.RepStorage?.saveItem) {
      global.RepStorage.saveItem(KEY, json);
    } else {
      const id = global.RepSession?.get?.()?.id;
      const k = id ? "lpc_rep_" + id + "_" + KEY : KEY;
      if (json) localStorage.setItem(k, json);
      else localStorage.removeItem(k);
    }
    if (opts?.silent) return;
    try {
      global.dispatchEvent(new CustomEvent("rep-profile-photo-changed", { detail: { url } }));
    } catch (e) {
      /* ignore */
    }
  }

  function notifyPhotoChanged(url) {
    try {
      global.dispatchEvent(new CustomEvent("rep-profile-photo-changed", { detail: { url } }));
    } catch (e) {
      /* ignore */
    }
  }

  function loadUrl() {
    return loadStored().url;
  }

  function hasCustomPhoto() {
    return !!loadUrl();
  }

  function displayUrl() {
    return loadUrl() || DEFAULT_URL;
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function extForType(type) {
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/gif") return "gif";
    return "jpg";
  }

  function validateFile(file) {
    if (!file) return "Choose an image first.";
    if (!ALLOWED.has(file.type)) return "Use JPG, PNG, WebP, or GIF.";
    if (file.size > MAX_BYTES) return "Image must be 2 MB or smaller.";
    return "";
  }

  async function upload(file, repId) {
    const err = validateFile(file);
    if (err) throw new Error(err);
    const id = String(repId || global.RepSession?.get?.()?.id || "").trim();
    if (!id) throw new Error("Sign in again to upload a photo.");

    if (canUseCloud()) {
      const client = getClient();
      const path = id + "/avatar." + extForType(file.type);
      const { error } = await client.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = client.storage.from(BUCKET).getPublicUrl(path);
      const url = String(data?.publicUrl || "").trim();
      if (!url) throw new Error("Upload succeeded but URL is missing.");
      const stored = { url, path };
      saveStored(stored, { silent: true });
      if (global.RepStorage?.flushSync) {
        await global.RepStorage.flushSync().catch(() => {});
      }
      notifyPhotoChanged(url);
      return stored;
    }

    if (file.size > 800 * 1024) {
      throw new Error("Without cloud sync, use an image under 800 KB.");
    }
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(file);
    });
    const stored = { url, path: "" };
    saveStored(stored, { silent: true });
    notifyPhotoChanged(url);
    return stored;
  }

  async function removeStorageAvatars(client, repId, knownPath) {
    const id = String(repId || "").trim();
    if (!id) return;

    const bucket = client.storage.from(BUCKET);
    const toRemove = new Set();
    if (knownPath) toRemove.add(String(knownPath).trim());

    try {
      const { data } = await bucket.list(id, { limit: 20 });
      (data || []).forEach((f) => {
        const name = String(f?.name || "").trim();
        if (name) toRemove.add(id + "/" + name);
      });
    } catch (e) {
      /* list is best-effort */
    }

    if (!toRemove.size) {
      ["jpg", "png", "webp", "gif"].forEach((ext) => {
        toRemove.add(id + "/avatar." + ext);
      });
    }

    const paths = [...toRemove].filter(Boolean);
    if (!paths.length) return;
    await bucket.remove(paths);
  }

  async function remove(repId) {
    const prev = loadStored();
    const id = String(repId || global.RepSession?.get?.()?.id || "").trim();

    if (canUseCloud() && id) {
      try {
        const client = getClient();
        await removeStorageAvatars(client, id, prev.path);
      } catch (e) {
        console.warn("Could not delete avatar from storage", e);
      }
    }

    saveStored({ url: "", path: "" }, { silent: true });
    if (global.RepStorage?.flushSync) {
      await global.RepStorage.flushSync().catch(() => {});
    }
    notifyPhotoChanged("");
  }

  let teamByName = {};
  let teamById = {};
  let teamCacheSig = "";

  function photoFromSettingsJson(settings) {
    const raw = settings?.[KEY];
    if (!raw) return "";
    if (typeof raw === "object" && raw.url) return String(raw.url).trim();
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return String(parsed?.url || "").trim();
      } catch (e) {
        return raw.startsWith("http") || raw.startsWith("data:") ? raw.trim() : "";
      }
    }
    return "";
  }

  function teamCacheSignature(map) {
    return Object.keys(map || {})
      .sort()
      .map((k) => k + ":" + map[k])
      .join("|");
  }

  async function refreshTeamPhotos() {
    const meId = String(global.RepSession?.get?.()?.id || "").trim().toLowerCase();
    const me = String(global.RepSession?.getName?.() || "").trim().toLowerCase();
    const myUrl = loadUrl();
    const nextByName = {};
    const nextById = {};
    if (me && myUrl) nextByName[me] = myUrl;
    if (meId && myUrl) nextById[meId] = myUrl;

    if (!canUseCloud()) {
      teamByName = nextByName;
      teamById = nextById;
      teamCacheSig = teamCacheSignature(nextByName) + "|" + teamCacheSignature(nextById);
      return nextByName;
    }

    try {
      const client = getClient();
      const { data, error } = await client
        .from("rep_settings")
        .select("rep_id, rep_name, settings_json");
      if (error) throw error;
      (data || []).forEach((row) => {
        const id = String(row.rep_id || "").trim().toLowerCase();
        const name = String(row.rep_name || "").trim().toLowerCase();
        const url = photoFromSettingsJson(row.settings_json || {});
        if (name && url) nextByName[name] = url;
        if (id && url) nextById[id] = url;
      });
      if (me && myUrl) nextByName[me] = myUrl;
      if (meId && myUrl) nextById[meId] = myUrl;
    } catch (e) {
      console.warn("Team profile photos unavailable", e);
    }

    teamByName = nextByName;
    teamById = nextById;
    teamCacheSig = teamCacheSignature(nextByName) + "|" + teamCacheSignature(nextById);
    return nextByName;
  }

  function urlForRepId(repId) {
    const key = String(repId || "").trim().toLowerCase();
    if (!key) return "";
    const meId = String(global.RepSession?.get?.()?.id || "")
      .trim()
      .toLowerCase();
    if (key === meId) {
      return loadUrl() || teamById[key] || teamByName[String(global.RepSession?.getName?.() || "").trim().toLowerCase()] || "";
    }
    return teamById[key] || "";
  }

  function urlForRepName(name) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return DEFAULT_URL;
    const me = String(global.RepSession?.getName?.() || "")
      .trim()
      .toLowerCase();
    if (key === me) {
      return loadUrl() || teamByName[key] || DEFAULT_URL;
    }
    return teamByName[key] || DEFAULT_URL;
  }

  function teamPhotosSig() {
    return teamCacheSig;
  }

  global.RepProfilePhoto = {
    KEY,
    DEFAULT_URL,
    loadUrl,
    displayUrl,
    hasCustomPhoto,
    loadStored,
    saveStored,
    upload,
    remove,
    initials,
    validateFile,
    canUseCloud,
    refreshTeamPhotos,
    urlForRepName,
    urlForRepId,
    teamPhotosSig,
  };
})(window);
