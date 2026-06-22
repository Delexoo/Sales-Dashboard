/**
 * Resolve rep display name + photo from session, tracker, and Supabase rep_settings.
 */
(function (global) {
  const NAME_LABEL_IDS = [
    "bug-report-rep-name",
    "feedback-rep-name",
    "faq-qa-ask-rep",
  ];
  const SETTINGS_LABEL_ID = "settings-rep-id";
  const FAQ_AVATAR_ID = "faq-qa-ask-avatar";

  let client = null;
  let resolving = null;

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
    };
  }

  function getClient() {
    const { url, key } = cfg();
    if (!url || !key || !global.supabase?.createClient) return null;
    if (!client) client = global.supabase.createClient(url, key);
    return client;
  }

  function repId() {
    return global.RepSession?.getId?.() || global.RepSession?.get?.()?.id || null;
  }

  function defaultPhotoUrl() {
    return global.RepProfilePhoto?.DEFAULT_URL || "";
  }

  function photoUrl(id, name) {
    const RPP = global.RepProfilePhoto;
    const url =
      (id && RPP?.urlForRepId && RPP.urlForRepId(id)) ||
      (name && RPP?.urlForRepName && RPP.urlForRepName(name)) ||
      "";
    return url || defaultPhotoUrl();
  }

  async function fetchCloudRepName(id) {
    const sb = getClient();
    if (!sb || !id) return "";
    try {
      const { data, error } = await sb
        .from("rep_settings")
        .select("rep_name")
        .eq("rep_id", id)
        .maybeSingle();
      if (error) throw error;
      return String(data?.rep_name || "").trim();
    } catch (e) {
      console.warn("Rep identity: could not load name from Supabase", e);
      return "";
    }
  }

  function nameFromTracker(id) {
    try {
      const raw = global.RepStorage?.loadItem
        ? global.RepStorage.loadItem("lpc_sales_tracker_v2")
        : localStorage.getItem("lpc_sales_tracker_v2");
      if (!raw) return "";
      const data = JSON.parse(raw);
      if (String(data?.repId || "") !== String(id)) return "";
      return String(data?.name || "").trim();
    } catch (e) {
      return "";
    }
  }

  function bindAvatarImg(img, url, alt) {
    if (!img) return;
    const fallback = defaultPhotoUrl();
    img.alt = alt || "";
    img.onerror = function () {
      img.onerror = null;
      if (fallback && img.src !== fallback) img.src = fallback;
    };
    img.src = url || fallback;
  }

  function applyNameLabels(name, id) {
    const display = String(name || "").trim();
    NAME_LABEL_IDS.forEach((labelId) => {
      const el = document.getElementById(labelId);
      if (el) el.textContent = display || "—";
    });
    const settingsEl = document.getElementById(SETTINGS_LABEL_ID);
    if (settingsEl) {
      settingsEl.textContent = display || id || "—";
    }
    if (display) global.RepSession?.refreshNameDisplays?.();
  }

  function applyFaqAvatar(identity) {
    const img = document.getElementById(FAQ_AVATAR_ID);
    if (!img || !identity) return;
    bindAvatarImg(
      img,
      identity.photoUrl,
      identity.name ? "Profile photo for " + identity.name : ""
    );
  }

  function localIdentity(id) {
    let name = String(global.RepSession?.get?.()?.name || "").trim();
    if (!name) name = nameFromTracker(id);
    const displayName = name || id;
    return {
      id,
      name: displayName,
      photoUrl: photoUrl(id, displayName),
    };
  }

  async function enrichIdentity(id) {
    try {
      if (global.RepStorage?.init) {
        await global.RepStorage.init();
      }
      let name = String(global.RepSession?.get?.()?.name || "").trim();
      if (!name) name = nameFromTracker(id);
      if (!name) {
        const cloudName = await fetchCloudRepName(id);
        if (cloudName) {
          name = cloudName;
          global.RepSession?.set?.({ id, name });
        }
      }
      if (global.RepProfilePhoto?.refreshTeamPhotos) {
        await global.RepProfilePhoto.refreshTeamPhotos();
      }
      const identity = localIdentity(id);
      applyNameLabels(identity.name, identity.id);
      applyFaqAvatar(identity);
      return identity;
    } catch (e) {
      console.warn("Rep identity enrich failed", e);
      return localIdentity(id);
    }
  }

  async function resolveRepIdentity() {
    const id = repId();
    if (!id) return null;

    const identity = localIdentity(id);
    void enrichIdentity(id);
    return identity;
  }

  function refreshUI() {
    const id = repId();
    if (!id) {
      applyNameLabels("", null);
      applyFaqAvatar(null);
      return Promise.resolve(null);
    }
    const identity = localIdentity(id);
    applyNameLabels(identity.name, identity.id);
    applyFaqAvatar(identity);
    if (!resolving) {
      resolving = enrichIdentity(id).finally(() => {
        resolving = null;
      });
    }
    return Promise.resolve(identity);
  }

  function whenIdentityReady(fn) {
    if (typeof fn !== "function") return;
    const run = () => {
      refreshUI().then((identity) => {
        try {
          fn(identity);
        } catch (e) {
          console.warn(e);
        }
      });
    };
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(run);
    else run();
  }

  global.addEventListener("site-unlocked", () => {
    void refreshUI();
  });
  global.addEventListener("rep-session-changed", () => {
    void refreshUI();
  });
  global.addEventListener("rep-settings-ready", () => {
    void refreshUI();
  });
  global.addEventListener("rep-profile-photo-changed", () => {
    void refreshUI();
  });

  if (
    global.RepSession?.getId?.() &&
    global.sessionStorage?.getItem("lpc_site_unlock") === "1"
  ) {
    void refreshUI();
  }

  global.RepIdentity = {
    resolveRepIdentity,
    refreshUI,
    whenIdentityReady,
    applyNameLabels,
  };
})(window);
