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



  function formatSaveError(err) {
    const msg = String(err?.message || err || "");
    if (/update_rep_display_name|PGRST202|42883|does not exist/i.test(msg)) {
      return "Name save is not set up in Supabase. Run supabase-rep-display-name.sql in SQL Editor.";
    }
    return "Could not save. Try again.";
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



  function bindPrefCheckbox(id, key, prefs) {
    const el = $(id);
    if (!el) return;
    if (key === "showSignOutFloat" || key === "showNavHints" || key === "showCourseFullscreenHint") {
      el.checked = prefs[key] !== false;
    } else {
      el.checked = !!prefs[key];
    }
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("change", () => {
      prefs[key] = el.checked;
      global.UserPrefs.save(prefs);
      if (key === "showSignOutFloat") global.SignOutFloat?.update?.();
    });
  }

  function bindFullscreenHintToggle(prefs) {
    const btn = $("settings-fullscreen-hint-toggle");
    if (!btn) return;

    function syncToggle() {
      const on = prefs.showCourseFullscreenHint !== false;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    }

    syncToggle();

    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      prefs.showCourseFullscreenHint = !btn.classList.contains("is-on");
      global.UserPrefs.save(prefs);
      syncToggle();
    });
  }

  function bindSignOutFloatToggle(prefs) {
    const btn = $("settings-sign-out-float-toggle");
    if (!btn) return;

    function syncToggle() {
      const on = prefs.showSignOutFloat !== false;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    }

    syncToggle();

    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      prefs.showSignOutFloat = !btn.classList.contains("is-on");
      global.UserPrefs.save(prefs);
      syncToggle();
      global.SignOutFloat?.update?.();
    });
  }

  function initAppearance(prefs) {
    bindThemeSegment(prefs);
    bindPrefCheckbox("settings-reduce-motion", "reduceMotion", prefs);
    bindPrefCheckbox("settings-nav-hints", "showNavHints", prefs);
    bindPrefCheckbox("settings-compact-tables", "compactTables", prefs);
    bindFullscreenHintToggle(prefs);
    bindSignOutFloatToggle(prefs);
    const motion = $("settings-reduce-motion");
    motion?.addEventListener("change", () => {
      if (motion.checked) {
        document.querySelectorAll(".earnings-chart.is-animating").forEach((chart) => {
          chart.classList.remove("is-animating");
        });
      }
    });
  }



  function initProfilePhoto(rep) {
    const RPP = global.RepProfilePhoto;
    if (!RPP) return;

    const img = $("settings-profile-photo-img");
    const initialsEl = $("settings-profile-photo-initials");
    const removeBtn = $("settings-profile-photo-remove");
    const input = $("settings-profile-photo-input");
    const status = $("settings-profile-photo-status");
    let uploading = false;

    function renderPhoto(name) {
      const url = RPP.displayUrl ? RPP.displayUrl() : RPP.loadUrl() || RPP.DEFAULT_URL;
      const hasCustom = RPP.hasCustomPhoto ? RPP.hasCustomPhoto() : !!RPP.loadUrl();
      if (img) {
        img.src = url;
        img.alt = (name || "Rep") + " profile photo";
        img.hidden = false;
      }
      if (initialsEl) initialsEl.hidden = true;
      if (removeBtn) removeBtn.hidden = !hasCustom;
    }

    renderPhoto(rep.name);

    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file || uploading) return;
      const err = RPP.validateFile(file);
      if (err) {
        showStatus(status, err, false);
        return;
      }
      uploading = true;
      showStatus(status, "Uploading…", true);
      try {
        await RPP.upload(file, rep.id);
        renderPhoto(($("settings-display-name")?.value || rep.name || "").trim());
        showStatus(status, "Photo saved", true);
        setTimeout(() => {
          if (status?.textContent === "Photo saved") showStatus(status, "", true);
        }, 1800);
      } catch (e) {
        console.error(e);
        showStatus(status, e.message || "Could not upload photo.", false);
      } finally {
        uploading = false;
      }
    });

    removeBtn?.addEventListener("click", async () => {
      if (uploading) return;
      uploading = true;
      showStatus(status, "Removing…", true);
      try {
        await RPP.remove(rep.id);
        renderPhoto(($("settings-display-name")?.value || rep.name || "").trim());
        showStatus(status, "Reset to default photo", true);
        setTimeout(() => {
          if (status?.textContent === "Reset to default photo") showStatus(status, "", true);
        }, 1800);
      } catch (e) {
        console.error(e);
        showStatus(status, "Could not remove photo.", false);
      } finally {
        uploading = false;
      }
    });
  }

  function initProfile(rep) {

    const nameEl = $("settings-display-name");

    const idEl = $("settings-rep-id");

    const status = $("settings-profile-status");

    initProfilePhoto(rep);

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

        global.RepSession?.refreshNameDisplays?.();

        window.LeadSync?.refreshTeam?.().catch(() => {});

        if (idEl) idEl.textContent = savedName + " (" + rep.id + ")";

        const photoImg = $("settings-profile-photo-img");
        if (photoImg && !photoImg.hidden) {
          photoImg.alt = savedName + " profile photo";
        }

        showStatus(status, "Saved", true);

        setTimeout(() => {

          if (status?.textContent === "Saved") showStatus(status, "", true);

        }, 1800);

      } catch (e) {

        console.error(e);

        showStatus(status, formatSaveError(e), false);

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

  function initPayout() {
    const PS = global.PayoutSetup;
    if (!PS) return;

    const listEl = $("settings-payout-list");
    const emptyEl = $("settings-payout-empty");
    const addBtn = $("settings-payout-add-btn");
    const addPanel = $("settings-payout-add-panel");
    const methodsEl = $("settings-payout-methods");
    const inputPanel = $("settings-payout-input-panel");
    const inputEl = $("settings-payout-link-input");
    const fieldLabel = $("settings-payout-field-label");
    const hintEl = $("settings-payout-input-hint");
    const saveBtn = $("settings-payout-save");
    const cancelBtn = $("settings-payout-cancel-add");
    const defaultBtn = $("settings-payout-set-default-btn");
    const defaultDialog = $("settings-payout-default-dialog");
    const defaultOptions = $("settings-payout-default-options");
    const defaultSaveBtn = $("settings-payout-default-save");
    const defaultCancelBtn = $("settings-payout-default-cancel");
    const defaultCloseBtn = $("settings-payout-default-close");
    const status = $("settings-payout-status");

    let methods = [];
    let selectedMethod = null;
    let adding = false;
    let defaultPick = null;

    function showPayoutStatus(msg, ok) {
      showStatus(status, msg, ok);
    }

    function syncPayoutToolbar() {
      const multi = methods.length > 1;
      if (defaultBtn) {
        defaultBtn.hidden = !multi || adding;
        defaultBtn.disabled = !multi;
      }
      if (addBtn) addBtn.hidden = adding;
    }

    function closeDefaultDialog() {
      defaultDialog?.close();
    }

    function renderDefaultDialogOptions() {
      if (!defaultOptions) return;
      defaultPick = methods[0]?.method || null;
      defaultOptions.innerHTML = methods
        .map((m, i) => {
          const meta = PS.methodMeta(m.method);
          const short = meta?.short || PS.methodLabel(m.method).charAt(0);
          const checked = i === 0;
          const plain = PS.isPlainTextMethod(m.method);
          const detail = plain
            ? `<span class="settings-payout-default-detail">${PS.esc(m.link)}</span>`
            : `<span class="settings-payout-default-detail">${PS.esc(m.link)}</span>`;
          return (
            `<label class="settings-payout-default-option${checked ? " is-selected" : ""}">` +
            `<input type="radio" name="settings-payout-default" value="${PS.esc(m.method)}"${checked ? " checked" : ""}>` +
            `<span class="payout-method-icon payout-method-${PS.esc(m.method)} settings-payout-item-icon" aria-hidden="true">${PS.esc(short)}</span>` +
            `<span class="settings-payout-default-copy">` +
            `<span class="settings-payout-default-label">${PS.esc(PS.methodLabel(m.method))}</span>` +
            detail +
            `</span></label>`
          );
        })
        .join("");

      defaultOptions.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.addEventListener("change", () => {
          if (!input.checked) return;
          defaultPick = input.value;
          defaultOptions.querySelectorAll(".settings-payout-default-option").forEach((label) => {
            label.classList.toggle(
              "is-selected",
              label.querySelector('input[type="radio"]')?.value === defaultPick
            );
          });
        });
      });
    }

    function openDefaultDialog() {
      if (methods.length <= 1 || !defaultDialog) return;
      renderDefaultDialogOptions();
      if (typeof defaultDialog.showModal === "function") {
        defaultDialog.showModal();
      } else {
        defaultDialog.setAttribute("open", "");
      }
    }

    function renderList() {
      if (!listEl) return;
      if (!methods.length) {
        listEl.hidden = true;
        listEl.innerHTML = "";
        if (emptyEl) emptyEl.hidden = false;
        syncPayoutToolbar();
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      listEl.hidden = false;

      listEl.innerHTML = methods
        .map((m, i) => {
          const meta = PS.methodMeta(m.method);
          const short = meta?.short || PS.methodLabel(m.method).charAt(0);
          const plain = PS.isPlainTextMethod(m.method);
          const linkHtml = plain
            ? `<span class="settings-payout-link-text">${PS.esc(m.link)}</span>`
            : `<a class="link-bold-blue settings-payout-link" href="${PS.esc(m.link)}" target="_blank" rel="noopener">${PS.esc(m.link)}</a>`;
          const isDefault = i === 0;
          const primaryBadge = isDefault
            ? `<span class="settings-payout-primary-badge">Default</span>`
            : "";
          return (
            `<li class="settings-payout-item${isDefault ? " is-default" : ""}">` +
            `<div class="settings-payout-item-main">` +
            `<span class="payout-method-icon payout-method-${PS.esc(m.method)} settings-payout-item-icon" aria-hidden="true">${PS.esc(short)}</span>` +
            `<div class="settings-payout-item-copy">` +
            `<p class="settings-payout-item-title">${PS.esc(PS.methodLabel(m.method))} ${primaryBadge}</p>` +
            linkHtml +
            `</div></div>` +
            `<div class="settings-payout-item-actions">` +
            `<button type="button" class="settings-payout-remove payout-saved-remove" data-remove-method="${PS.esc(m.method)}" aria-label="Remove ${PS.esc(PS.methodLabel(m.method))}">×</button>` +
            `</div></li>`
          );
        })
        .join("");

      syncPayoutToolbar();

      listEl.querySelectorAll("[data-remove-method]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.removeMethod;
          if (!id || btn.disabled) return;
          btn.disabled = true;
          showPayoutStatus("Removing…", true);
          try {
            methods = await PS.removeOne(id);
            renderList();
            showPayoutStatus(
              methods.length
                ? "Removed from your account and Supabase."
                : "All payout methods removed from your account and Supabase.",
              true
            );
          } catch (e) {
            console.warn(e);
            showPayoutStatus(e.message || "Could not remove.", false);
          }
          btn.disabled = false;
        });
      });
    }

    function closeAddPanel() {
      adding = false;
      selectedMethod = null;
      if (addPanel) addPanel.hidden = true;
      if (inputPanel) inputPanel.hidden = true;
      if (inputEl) inputEl.value = "";
      syncPayoutToolbar();
      methodsEl?.querySelectorAll(".payout-method-btn").forEach((b) => {
        b.setAttribute("aria-pressed", "false");
      });
    }

    function bindMethodPicker() {
      if (!methodsEl || methodsEl.dataset.bound === "1") return;
      methodsEl.dataset.bound = "1";
      methodsEl.innerHTML = PS.renderMethodButtons(null);
      methodsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".payout-method-btn[data-method]");
        if (!btn) return;
        selectedMethod = btn.dataset.method;
        const meta = PS.methodMeta(selectedMethod);
        const existing = methods.find((m) => m.method === selectedMethod);
        if (inputPanel) inputPanel.hidden = false;
        if (fieldLabel) {
          fieldLabel.textContent = meta?.fieldLabel || "Payout details";
        }
        if (inputEl) {
          inputEl.placeholder = meta?.placeholder || "";
          inputEl.value = existing?.link || "";
          inputEl.focus();
        }
        if (hintEl) hintEl.textContent = meta?.hint || "";
        methodsEl.querySelectorAll(".payout-method-btn").forEach((b) => {
          b.setAttribute("aria-pressed", b.dataset.method === selectedMethod ? "true" : "false");
        });
      });
    }

    function openAddPanel() {
      adding = true;
      if (addPanel) addPanel.hidden = false;
      syncPayoutToolbar();
      bindMethodPicker();
    }

    addBtn?.addEventListener("click", openAddPanel);
    cancelBtn?.addEventListener("click", closeAddPanel);
    defaultBtn?.addEventListener("click", openDefaultDialog);
    defaultCancelBtn?.addEventListener("click", closeDefaultDialog);
    defaultCloseBtn?.addEventListener("click", closeDefaultDialog);
    defaultDialog?.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDefaultDialog();
    });
    defaultDialog?.addEventListener("click", (e) => {
      if (e.target === defaultDialog) closeDefaultDialog();
    });
    defaultSaveBtn?.addEventListener("click", async () => {
      if (!defaultPick || methods.length <= 1) {
        closeDefaultDialog();
        return;
      }
      if (defaultPick === methods[0]?.method) {
        closeDefaultDialog();
        return;
      }
      defaultSaveBtn.disabled = true;
      showPayoutStatus("Updating default…", true);
      try {
        methods = await PS.setDefaultPayout(defaultPick);
        renderList();
        closeDefaultDialog();
        showPayoutStatus(
          PS.methodLabel(defaultPick) + " is now your default payout method.",
          true
        );
        setTimeout(() => {
          if (status?.textContent?.includes("default payout")) showPayoutStatus("", true);
        }, 2200);
      } catch (e) {
        console.warn(e);
        showPayoutStatus(e.message || "Could not set default.", false);
      }
      defaultSaveBtn.disabled = false;
    });

    saveBtn?.addEventListener("click", async () => {
      if (!selectedMethod) {
        showPayoutStatus("Choose a payment app first.", false);
        return;
      }
      const link = inputEl?.value?.trim();
      if (!link) {
        const meta = PS.methodMeta(selectedMethod);
        showPayoutStatus(meta?.hint || "Enter your payout details.", false);
        inputEl?.focus();
        return;
      }
      saveBtn.disabled = true;
      showPayoutStatus("Saving…", true);
      try {
        await PS.saveOne(selectedMethod, link);
        methods = await PS.fetchAllMine();
        PS.markPayoutChecklistDone();
        renderList();
        closeAddPanel();
        showPayoutStatus("Saved.", true);
        setTimeout(() => {
          if (status?.textContent === "Saved.") showPayoutStatus("", true);
        }, 2000);
      } catch (e) {
        console.warn(e);
        showPayoutStatus(e.message || "Could not save.", false);
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
        methods = await PS.fetchAllMine();
        renderList();
      } catch (e) {
        console.warn("Payout load failed", e);
        showPayoutStatus("Could not load payout methods.", false);
      }
    })();
  }

  async function mount() {

    let rep = global.RepSession?.get?.();
    const repIdOnly = global.RepSession?.getId?.();

    if (!rep?.id && !repIdOnly) return;

    if ((!rep?.name || !rep) && global.RepIdentity?.resolveRepIdentity) {
      await global.RepIdentity.resolveRepIdentity();
      rep = global.RepSession?.get?.();
    }

    if (!rep?.id && repIdOnly) {
      rep = { id: repIdOnly, name: repIdOnly };
    }

    if (!rep?.id) return;



    const prefs = global.UserPrefs.get();

    initProfile(rep);

    initPayout();

    initPin(rep);

    initAppearance(prefs);

    initSignOut();



    if (global.SiteIcons) global.SiteIcons.initIcons();

  }



  function start() {
    const run = () => {
      if (global.RepStorage?.whenReady) {
        global.RepStorage.whenReady(() => {
          void mount();
        });
      } else {
        void mount();
      }
    };
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(run);
    else run();
  }



  if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", start);

  } else {

    start();

  }

})(window);


