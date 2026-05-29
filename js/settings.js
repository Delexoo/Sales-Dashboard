/**
 * Help → Settings — profile, PIN, theme, and preferences.
 */
(function (global) {
  const $ = (id) => document.getElementById(id);

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
    };
  }

  function useCloudProfile() {
    const { url, key } = cfg();
    return !!(url && key && global.supabase?.createClient);
  }

  function getClient() {
    const { url, key } = cfg();
    return global.supabase.createClient(url, key);
  }

  function showStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.toggle("is-ok", !!ok);
    el.classList.toggle("is-err", !ok && !!msg);
  }

  function digitsOnly(val) {
    return String(val || "").replace(/\D/g, "");
  }

  async function updateDisplayNameCloud(repId, newName) {
    const client = getClient();
    const { data, error } = await client.rpc("update_rep_display_name", {
      p_rep_id: repId,
      p_new_name: newName,
    });
    if (error) throw error;
    return data;
  }

  async function updateProfileCloud(repId, currentPin, newName, newPin) {
    const client = getClient();
    const { data, error } = await client.rpc("update_rep_profile", {
      p_rep_id: repId,
      p_current_pin: currentPin,
      p_new_name: newName || null,
      p_new_pin: newPin || null,
    });
    if (error) throw error;
    return data;
  }

  function bindThemeSegment(prefs) {
    document.querySelectorAll("[data-theme-pick]").forEach((btn) => {
      const pick = btn.dataset.themePick;
      btn.classList.toggle("active", pick === prefs.theme);
      btn.addEventListener("click", () => {
        prefs.theme = pick;
        global.UserPrefs.save(prefs);
        bindThemeSegment(prefs);
      });
    });
  }

  function initAppearance(prefs) {
    bindThemeSegment(prefs);
    const motion = $("settings-reduce-motion");
    if (motion) {
      motion.checked = !!prefs.reduceMotion;
      motion.addEventListener("change", () => {
        prefs.reduceMotion = motion.checked;
        global.UserPrefs.save(prefs);
        if (motion.checked) {
          document.querySelectorAll(".earnings-chart.is-animating").forEach((chart) => {
            chart.classList.remove("is-animating");
          });
        }
      });
    }
  }

  function initProfile(rep) {
    const nameEl = $("settings-display-name");
    const idEl = $("settings-rep-id");
    const status = $("settings-profile-status");
    let savedName = rep.name || "";
    let saveTimer = null;
    let saving = false;

    if (idEl) idEl.textContent = savedName + " (" + rep.id + ")";
    if (nameEl) nameEl.value = savedName;

    async function persistName(name) {
      if (saving || name === savedName) return;
      saving = true;
      showStatus(status, "Saving…", true);
      try {
        if (useCloudProfile()) {
          const result = await updateDisplayNameCloud(rep.id, name);
          if (!result?.id) {
            showStatus(status, "Could not save name.", false);
            if (nameEl) nameEl.value = savedName;
            return;
          }
          global.RepSession.set({ id: result.id, name: result.name });
          savedName = result.name;
        } else {
          global.RepSession.set({ id: rep.id, name });
          savedName = name;
        }
        global.RepStorage?.push?.().catch(() => {});
        if (idEl) idEl.textContent = savedName + " (" + rep.id + ")";
        showStatus(status, "Saved", true);
        setTimeout(() => {
          if (status?.textContent === "Saved") showStatus(status, "", true);
        }, 1800);
      } catch (e) {
        console.error(e);
        showStatus(status, "Could not save. Try again.", false);
        if (nameEl) nameEl.value = savedName;
      } finally {
        saving = false;
      }
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const name = (nameEl?.value || "").trim();
        if (!name) {
          if (nameEl) nameEl.value = savedName;
          return;
        }
        persistName(name);
      }, 600);
    }

    nameEl?.addEventListener("input", scheduleSave);
    nameEl?.addEventListener("blur", () => {
      clearTimeout(saveTimer);
      const name = (nameEl?.value || "").trim();
      if (!name) {
        nameEl.value = savedName;
        return;
      }
      persistName(name);
    });
  }

  function initPin(rep) {
    const note = $("settings-pin-cloud-note");
    if (note && !useCloudProfile()) note.hidden = false;

    $("settings-save-pin")?.addEventListener("click", async () => {
      const status = $("settings-pin-status");
      const current = digitsOnly($("settings-pin-current")?.value);
      const next = digitsOnly($("settings-pin-new")?.value);
      const confirm = digitsOnly($("settings-pin-confirm")?.value);

      if (!useCloudProfile()) {
        showStatus(status, "PIN changes need Supabase (deployed site).", false);
        return;
      }
      if (!current || !next) {
        showStatus(status, "Enter current and new PIN.", false);
        return;
      }
      if (next.length < 4 || next.length > 12) {
        showStatus(status, "New PIN must be 4–12 digits.", false);
        return;
      }
      if (next !== confirm) {
        showStatus(status, "New PINs do not match.", false);
        return;
      }
      if (next === current) {
        showStatus(status, "New PIN must be different.", false);
        return;
      }

      showStatus(status, "Updating PIN…", true);
      try {
        const result = await updateProfileCloud(rep.id, current, null, next);
        if (!result?.id) {
          showStatus(status, "Incorrect current PIN or could not save.", false);
          return;
        }
        $("settings-pin-current").value = "";
        $("settings-pin-new").value = "";
        $("settings-pin-confirm").value = "";
        showStatus(status, "PIN updated. Use it next time you sign in.", true);
      } catch (e) {
        console.error(e);
        showStatus(status, "Could not change PIN. Try again.", false);
      }
    });
  }

  function initSignOut() {
    $("settings-sign-out")?.addEventListener("click", () => {
      global.RepSession?.signOut?.();
    });
  }

  function mount() {
    const rep = global.RepSession?.get?.();
    if (!rep) return;

    const prefs = global.UserPrefs.get();
    initProfile(rep);
    initPin(rep);
    initAppearance(prefs);
    initSignOut();

    if (global.SiteIcons) global.SiteIcons.initIcons();
  }

  function start() {
    if (global.RepStorage?.whenReady) {
      global.RepStorage.whenReady(mount);
    } else {
      mount();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
