/**

 * Help → Settings — profile, PIN, theme, and preferences.

 */

(function (global) {

  const $ = (id) => document.getElementById(id);

  let profileRefresh = null;
  let profilePhotoRefresh = null;
  let payoutRefresh = null;
  let settingsMounted = false;
  let profilePhotoBusy = false;
  const DARK_UI_COLORS = new Set(["black"]);

  function trackerName(id) {
    try {
      const raw = global.RepStorage?.loadItem?.("lpc_sales_tracker_v2");
      if (!raw) return "";
      const data = JSON.parse(raw);
      if (String(data?.repId || "") !== String(id)) return "";
      return String(data?.name || "").trim();
    } catch (e) {
      return "";
    }
  }

  function resolveRepLocal() {
    let rep = global.RepSession?.get?.();
    const id = rep?.id || global.RepSession?.getId?.();
    if (!id) return null;
    let name = String(rep?.name || "").trim();
    if (!name) name = trackerName(id);
    return { id: String(id), name: name || String(id) };
  }

  function refreshSettingsUI() {
    const rep = resolveRepLocal();
    if (!rep?.id) return;
    profileRefresh?.(rep);
    if (!profilePhotoBusy) {
      profilePhotoRefresh?.(rep.name);
    }
    payoutRefresh?.();
    paintAppearancePrefs(global.UserPrefs?.get?.());
  }

  function setProfilePhotoBusy(busy) {
    profilePhotoBusy = !!busy;
    const wrap = document.querySelector(".settings-profile-photo-wrap");
    if (wrap) wrap.classList.toggle("is-busy", profilePhotoBusy);
  }

  function showProfilePhotoStatus(msg, ok) {
    showStatus($("settings-profile-status"), msg, ok);
  }

  function paintAppearancePrefs(prefs) {
    if (!prefs) return;
    document.querySelectorAll("[data-ui-color-pick]").forEach((btn) => {
      const isActive = btn.dataset.uiColorPick === (prefs.uiColor || "current");
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    const fsBtn = $("settings-fullscreen-hint-toggle");
    if (fsBtn) {
      const on = prefs.showCourseFullscreenHint !== false;
      fsBtn.classList.toggle("is-on", on);
      fsBtn.setAttribute("aria-checked", on ? "true" : "false");
    }
    const soBtn = $("settings-sign-out-float-toggle");
    if (soBtn) {
      const on = prefs.showSignOutFloat !== false;
      soBtn.classList.toggle("is-on", on);
      soBtn.setAttribute("aria-checked", on ? "true" : "false");
    }
  }

  function renderProfilePhoto(name, options) {
    const RPP = global.RepProfilePhoto;
    if (!RPP) return;

    const img = $("settings-profile-photo-img");
    const initialsEl = $("settings-profile-photo-initials");
    const removeBtn = $("settings-profile-photo-remove");
    const logicalUrl = RPP.displayUrl ? RPP.displayUrl() : RPP.loadUrl() || RPP.DEFAULT_URL;
    const hasCustom = RPP.hasCustomPhoto ? RPP.hasCustomPhoto() : !!RPP.loadUrl();
    const displayName = String(name || "").trim() || "Rep";
    const force = options?.force === true;

    global.SiteImagePreload?.preloadOne?.(logicalUrl, "high");

    if (img) {
      const prev = img.dataset.photoUrl || "";
      const changed = prev !== logicalUrl;
      if (changed || force) {
        img.dataset.photoUrl = logicalUrl;
        if (logicalUrl === RPP.DEFAULT_URL) {
          img.src = logicalUrl;
        } else {
          const bust = options?.cacheKey || Date.now();
          img.src =
            logicalUrl + (logicalUrl.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(String(bust));
        }
      }
      img.alt = displayName + " profile photo";
      img.hidden = false;
    }
    if (initialsEl) initialsEl.hidden = true;
    if (removeBtn) {
      const showReset = !!hasCustom;
      const wasHidden = removeBtn.hidden;
      removeBtn.hidden = !showReset;
      if (showReset && wasHidden && global.SiteIcons?.initIcons) {
        global.SiteIcons.initIcons(removeBtn);
      }
    }
  }

  function paintSettingsFromLocal() {
    const rep = resolveRepLocal();
    if (!rep?.id) return;

    const idEl = $("settings-rep-id");
    const nameEl = $("settings-display-name");
    const displayName = String(rep.name || "").trim() || rep.id;
    if (idEl) idEl.textContent = displayName;
    if (nameEl && document.activeElement !== nameEl) {
      nameEl.value = displayName;
    }

    renderProfilePhoto(displayName);

    paintAppearancePrefs(global.UserPrefs?.get?.());

    if (global.SiteIcons?.initIcons) {
      const page = document.getElementById("page-body");
      if (page) global.SiteIcons.initIcons(page);
    }

    document.body.classList.add("settings-ready");
  }

  function ensureSettingsReady() {
    document.body.classList.add("settings-ready");
  }



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

  async function saveDisplayNameViaSettingsSync(repId, newName) {
    global.RepSession.set({ id: repId, name: newName });
    if (global.RepStorage?.flushSync) {
      await global.RepStorage.flushSync();
    } else if (global.RepStorage?.push) {
      await global.RepStorage.push();
    } else {
      throw new Error("Team settings sync is unavailable.");
    }
    return { id: repId, name: newName };
  }

  async function saveDisplayNameCloud(repId, newName) {
    try {
      const result = await updateDisplayNameCloud(repId, newName);
      if (result?.id) return result;
    } catch (rpcErr) {
      console.warn("update_rep_display_name failed; using settings sync fallback", rpcErr);
    }
    return saveDisplayNameViaSettingsSync(repId, newName);
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



  function bindUiColorGrid(prefs) {
    document.querySelectorAll("[data-ui-color-pick]").forEach((btn) => {
      const pick = btn.dataset.uiColorPick;
      const isActive = pick === (prefs.uiColor || "current");
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");

      if (btn.dataset.uiColorBound === "1") return;
      btn.dataset.uiColorBound = "1";

      btn.addEventListener("click", () => {
        const nextPrefs = {
          ...global.UserPrefs.get(),
          theme: DARK_UI_COLORS.has(pick) ? "dark" : "light",
          uiColor: pick,
        };
        global.UserPrefs.save(nextPrefs);
        paintAppearancePrefs(nextPrefs);
      });
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
    bindUiColorGrid(prefs);
    bindFullscreenHintToggle(prefs);
    bindSignOutFloatToggle(prefs);
  }



  function initProfilePhoto(rep) {
    const RPP = global.RepProfilePhoto;
    if (!RPP) return;

    const removeBtn = $("settings-profile-photo-remove");
    const input = $("settings-profile-photo-input");
    let uploading = false;

    function currentDisplayName() {
      return ($("settings-display-name")?.value || resolveRepLocal()?.name || rep.name || "").trim();
    }

    function currentRepId() {
      return resolveRepLocal()?.id || rep.id;
    }

    profilePhotoRefresh = (name) => {
      renderProfilePhoto(name || currentDisplayName());
    };

    if (input?.dataset.photoBound === "1") return;
    if (input) input.dataset.photoBound = "1";

    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file || uploading) return;
      const err = RPP.validateFile(file);
      if (err) {
        showProfilePhotoStatus(err, false);
        return;
      }
      uploading = true;
      setProfilePhotoBusy(true);
      showProfilePhotoStatus("", true);
      try {
        const id = currentRepId();
        if (!id) throw new Error("Sign in again to upload a photo.");
        await RPP.upload(file, id);
        renderProfilePhoto(currentDisplayName(), { force: true, cacheKey: Date.now() });
        showProfilePhotoStatus("", true);
      } catch (e) {
        console.error(e);
        showProfilePhotoStatus(e.message || "Could not upload photo.", false);
      } finally {
        uploading = false;
        setProfilePhotoBusy(false);
      }
    });

    removeBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (uploading) return;
      uploading = true;
      setProfilePhotoBusy(true);
      showProfilePhotoStatus("", true);
      try {
        const id = currentRepId();
        if (!id) throw new Error("Sign in again to reset your photo.");
        await RPP.remove(id);
        renderProfilePhoto(currentDisplayName(), { force: true });
        showProfilePhotoStatus("", true);
      } catch (e) {
        console.error(e);
        showProfilePhotoStatus(e.message || "Could not reset photo.", false);
      } finally {
        uploading = false;
        setProfilePhotoBusy(false);
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



    if (idEl) idEl.textContent = savedName || rep.id;

    if (nameEl) nameEl.value = savedName;

    profileRefresh = (nextRep) => {
      const nextName = String(nextRep?.name || "").trim() || String(nextRep?.id || "").trim();
      if (!nextRep?.id || !nextName) return;
      savedName = nextName;
      if (idEl) idEl.textContent = savedName;
      if (nameEl && document.activeElement !== nameEl) nameEl.value = savedName;
      const photoImg = $("settings-profile-photo-img");
      if (photoImg && !photoImg.hidden) {
        photoImg.alt = savedName + " profile photo";
      }
    };



    async function persistName(name) {

      if (saving || name === savedName) return;

      saving = true;

      try {

        if (useCloudProfile()) {

          const result = await saveDisplayNameCloud(rep.id, name);

          global.RepSession.set({ id: result.id, name: result.name });

          savedName = result.name;

        } else {

          global.RepSession.set({ id: rep.id, name });

          savedName = name;

        }

        global.RepStorage?.push?.().catch(() => {});

        global.RepSession?.refreshNameDisplays?.();

        window.LeadSync?.refreshTeam?.().catch(() => {});

        if (idEl) idEl.textContent = savedName;

        const photoImg = $("settings-profile-photo-img");
        if (photoImg && !photoImg.hidden) {
          photoImg.alt = savedName + " profile photo";
        }

        showStatus(status, "", true);

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
    const status = $("settings-payout-status");

    let methods = [];
    let selectedMethod = null;
    let adding = false;
    let defaultPick = null;

    function showPayoutStatus(msg, ok) {
      if (ok) return;
      showStatus(status, msg, ok);
    }

    function syncDefaultPick() {
      if (!methods.length) {
        defaultPick = null;
        return;
      }
      const ids = methods.map((m) => m.method);
      if (!defaultPick || !ids.includes(defaultPick)) {
        defaultPick = methods[0]?.method || null;
      }
    }

    function selectPayoutMethod(methodId) {
      if (methods.length <= 1) return;
      const id = String(methodId || "").trim();
      if (!id || !methods.some((m) => m.method === id)) return;
      defaultPick = id;
      syncPayoutSelection();
      const item = listEl?.querySelector('.settings-payout-item[data-payout-method="' + CSS.escape(id) + '"]');
      item?.focus();
    }

    function syncPayoutSelection() {
      if (!listEl) return;
      const selectable = methods.length > 1;
      listEl.classList.toggle("is-selectable", selectable);
      if (selectable) {
        listEl.setAttribute("role", "radiogroup");
        listEl.setAttribute("aria-label", "Choose default payout method");
      } else {
        listEl.removeAttribute("role");
        listEl.removeAttribute("aria-label");
      }

      listEl.querySelectorAll(".settings-payout-item").forEach((item) => {
        const picked = item.dataset.payoutMethod === defaultPick;
        item.classList.toggle("is-pick-selected", selectable && picked);
        if (selectable) {
          item.setAttribute("role", "radio");
          item.setAttribute("aria-checked", picked ? "true" : "false");
          item.setAttribute("tabindex", picked ? "0" : "-1");
        } else {
          item.removeAttribute("role");
          item.removeAttribute("aria-checked");
          item.removeAttribute("tabindex");
        }
      });

      if (defaultBtn) {
        defaultBtn.disabled =
          !selectable || !defaultPick || defaultPick === methods[0]?.method;
      }
    }

    function syncPayoutToolbar() {
      const multi = methods.length > 1;
      if (defaultBtn) {
        defaultBtn.hidden = !multi || adding;
      }
      if (addBtn) addBtn.hidden = adding;
      syncPayoutSelection();
    }

    function bindPayoutListSelection() {
      if (!listEl || listEl.dataset.selectionBound === "1") return;
      listEl.dataset.selectionBound = "1";

      listEl.addEventListener("click", (e) => {
        if (methods.length <= 1) return;
        if (e.target.closest("[data-remove-method]")) return;
        if (e.target.closest(".settings-payout-link")) return;
        const item = e.target.closest(".settings-payout-item[data-payout-method]");
        if (!item) return;
        selectPayoutMethod(item.dataset.payoutMethod);
      });

      listEl.addEventListener("keydown", (e) => {
        if (methods.length <= 1) return;
        const ids = methods.map((m) => m.method);
        const idx = ids.indexOf(defaultPick);
        if (idx < 0) return;

        if (e.key === "Enter" || e.key === " ") {
          const item = e.target.closest(".settings-payout-item[data-payout-method]");
          if (!item) return;
          e.preventDefault();
          selectPayoutMethod(item.dataset.payoutMethod);
          return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          selectPayoutMethod(ids[(idx + 1) % ids.length]);
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          selectPayoutMethod(ids[(idx - 1 + ids.length) % ids.length]);
        }
      });
    }

    async function saveDefaultPayout() {
      if (!defaultPick || methods.length <= 1) return;
      if (defaultPick === methods[0]?.method) return;

      defaultBtn.disabled = true;
      try {
        methods = await PS.setDefaultPayout(defaultPick);
        syncDefaultPick();
        renderList();
      } catch (e) {
        console.warn(e);
        showPayoutStatus(e.message || "Could not set default.", false);
      }
      syncPayoutSelection();
    }

    function renderList() {
      if (!listEl) return;
      syncDefaultPick();
      if (!methods.length) {
        listEl.hidden = true;
        listEl.innerHTML = "";
        if (emptyEl) emptyEl.hidden = false;
        syncPayoutToolbar();
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      listEl.hidden = false;

      const selectable = methods.length > 1;
      listEl.innerHTML = methods
        .map((m, i) => {
          const plain = PS.isPlainTextMethod(m.method);
          const linkHtml = plain
            ? `<span class="settings-payout-link-text">${PS.esc(m.link)}</span>`
            : `<a class="link-bold-blue settings-payout-link" href="${PS.esc(m.link)}" target="_blank" rel="noopener">${PS.esc(m.link)}</a>`;
          const isDefault = i === 0;
          const isPicked = m.method === defaultPick;
          const primaryBadge = isDefault
            ? `<span class="settings-payout-primary-badge">Default</span>`
            : "";
          return (
            `<li class="settings-payout-item${isDefault ? " is-default" : ""}${selectable && isPicked ? " is-pick-selected" : ""}"` +
            ` data-payout-method="${PS.esc(m.method)}"` +
            ">" +
            `<div class="settings-payout-item-main">` +
            (selectable ? '<span class="settings-payout-pick" aria-hidden="true"></span>' : "") +
            PS.renderMethodIcon(m.method, "settings-payout-item-icon") +
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
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.dataset.removeMethod;
          if (!id || btn.disabled) return;
          btn.disabled = true;
          try {
            methods = await PS.removeOne(id);
            syncDefaultPick();
            renderList();
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
    defaultBtn?.addEventListener("click", () => {
      void saveDefaultPayout();
    });
    bindPayoutListSelection();

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
      try {
        await PS.saveOne(selectedMethod, link);
        methods = await PS.fetchAllMine();
        PS.markPayoutChecklistDone();
        renderList();
        closeAddPanel();
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

    payoutRefresh = () => {
      void refreshPayoutMethods(true);
    };

    function refreshPayoutMethods(showLocalFirst) {
      if (showLocalFirst && PS.loadLocalMethods) {
        methods = PS.loadLocalMethods();
        renderList();
      }
      return PS.fetchAllMine()
        .then((list) => {
          methods = list;
          renderList();
        })
        .catch((e) => {
          console.warn("Payout load failed", e);
          if (!methods.length) showPayoutStatus("Could not load payout methods.", false);
        });
    }

    void refreshPayoutMethods(true);
  }

  async function mount() {
    const rep = resolveRepLocal();
    if (!rep?.id) return;

    if (settingsMounted) {
      refreshSettingsUI();
      return;
    }
    settingsMounted = true;

    const prefs = global.UserPrefs.get();

    initProfile(rep);

    initPayout();

    initPin(rep);

    initAppearance(prefs);

    initSignOut();

    const page = document.getElementById("page-body");
    if (global.SiteIcons) global.SiteIcons.initIcons(page || document.body);

    refreshSettingsUI();

    void (global.RepIdentity?.resolveRepIdentity?.() || Promise.resolve()).then(() => {
      refreshSettingsUI();
    });
  }



  function start() {
    paintSettingsFromLocal();
    ensureSettingsReady();

    const rep = resolveRepLocal();
    if (rep?.id) initProfilePhoto(rep);

    const boot = () => {
      void mount();
      global.RepStorage?.init?.().catch(() => {});
    };

    const onRefresh = () => refreshSettingsUI();
    global.addEventListener("rep-settings-ready", onRefresh);
    global.addEventListener("rep-settings-pulled", onRefresh);
    global.addEventListener("rep-session-changed", onRefresh);
    global.addEventListener("rep-profile-photo-changed", onRefresh);
    global.addEventListener("payout-methods-changed", onRefresh);

    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(boot);
    else boot();
  }



  if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", start);

  } else {

    start();

  }

})(window);


