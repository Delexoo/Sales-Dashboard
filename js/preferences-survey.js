(function (global) {
  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";
  const STEP_KEY = "lpc_preferences_survey_step_v1";
  const DARK_THEMES = new Set(["black"]);

  const STEPS = ["theme", "nickname", "profile", "done"];
  const THEMES = [
    ["current", "Current"],
    ["white", "White"],
    ["black", "Black"],
    ["green", "Green"],
    ["grey", "Grey"],
    ["blue", "Blue"],
    ["purple", "Purple"],
    ["red", "Red"],
  ];

  let currentStep = 0;
  let uploadBusy = false;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function repScopedKey(key) {
    const id = global.RepSession?.get?.()?.id;
    return id ? "lpc_rep_" + id + "_" + key : key;
  }

  function loadItem(key) {
    if (global.RepStorage?.loadItem) return global.RepStorage.loadItem(key);
    return localStorage.getItem(repScopedKey(key));
  }

  function saveItem(key, value) {
    if (global.RepStorage?.saveItem) global.RepStorage.saveItem(key, value);
    else localStorage.setItem(repScopedKey(key), value);
  }

  function loadProgress() {
    try {
      return JSON.parse(loadItem(PROGRESS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveProgress(progress) {
    saveItem(PROGRESS_KEY, JSON.stringify(progress));
    global.dispatchEvent(new CustomEvent("onboarding-progress-changed"));
  }

  function markProgress(keys) {
    const progress = loadProgress();
    keys.forEach((key) => {
      progress[key] = true;
    });
    saveProgress(progress);
  }

  function saveStep() {
    saveItem(STEP_KEY, String(currentStep));
  }

  function loadStep() {
    const n = parseInt(loadItem(STEP_KEY) || "0", 10);
    return Number.isFinite(n) ? Math.min(Math.max(0, n), STEPS.length - 1) : 0;
  }

  function selectedTheme() {
    return global.UserPrefs?.get?.()?.uiColor || "current";
  }

  function saveTheme(theme) {
    const prefs = global.UserPrefs?.get?.() || {};
    global.UserPrefs?.save?.({
      ...prefs,
      theme: DARK_THEMES.has(theme) ? "dark" : "light",
      uiColor: theme,
    });
    markProgress(["preferencesTheme"]);
  }

  async function saveNickname(name) {
    const rep = global.RepSession?.get?.();
    if (!rep?.id) throw new Error("Sign in again to save your nickname.");
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Enter the name you want shown in the app.");
    global.RepSession.set({ id: rep.id, name: clean });
    if (global.RepStorage?.flushSync) await global.RepStorage.flushSync().catch(() => {});
    markProgress(["preferencesName"]);
  }

  function nextButton(label) {
    return (
      '<div class="survey-choices survey-choices--proceed">' +
      '<button type="button" class="survey-choice-btn survey-proceed-btn" data-pref-next>' +
      '<span class="survey-proceed-label">' +
      esc(label || "Next") +
      '</span><span class="survey-proceed-arrow" aria-hidden="true">&rarr;</span></button></div>'
    );
  }

  function themeStep() {
    const active = selectedTheme();
    const choices = THEMES.map(([id, label]) => {
      return (
        '<button type="button" class="survey-choice-btn preferences-theme-choice preferences-theme-choice--' +
        esc(id) +
        (id === active ? ' is-selected" aria-pressed="true"' : '" aria-pressed="false"') +
        ' data-pref-theme="' +
        esc(id) +
        '">' +
        '<span class="preferences-theme-swatch" aria-hidden="true"></span>' +
        '<span>' +
        esc(label) +
        "</span></button>"
      );
    }).join("");
    return (
      '<article class="survey-step survey-step-enter">' +
      '<header class="survey-step-head"><p class="survey-kicker">Appearance</p>' +
      '<h3 class="survey-question">Choose your dashboard theme</h3>' +
      '<p class="survey-sub">Pick the color that feels best. You can change it later in Settings.</p></header>' +
      '<div class="survey-choices preferences-theme-grid" role="group" aria-label="Theme color">' +
      choices +
      "</div>" +
      nextButton("Keep going") +
      "</article>"
    );
  }

  function nicknameStep() {
    const name = esc(global.RepSession?.getName?.() || global.RepSession?.get?.()?.name || "");
    return (
      '<article class="survey-step survey-step-enter">' +
      '<header class="survey-step-head"><p class="survey-kicker">Nickname</p>' +
      '<h3 class="survey-question">What should we call you?</h3>' +
      '<p class="survey-sub">This name shows on your dashboard, settings, and team views.</p></header>' +
      '<label class="field preferences-name-field">' +
      '<span class="field-label">Display name</span>' +
      '<input type="text" id="preferences-display-name" maxlength="40" autocomplete="name" placeholder="Your name" value="' +
      name +
      '">' +
      "</label>" +
      '<p class="settings-status" id="preferences-survey-status" hidden></p>' +
      nextButton("Save name") +
      "</article>"
    );
  }

  function profileStep() {
    const hasPhoto = !!global.RepProfilePhoto?.hasCustomPhoto?.();
    return (
      '<article class="survey-step survey-step-enter">' +
      '<header class="survey-step-head"><p class="survey-kicker">Profile</p>' +
      '<h3 class="survey-question">Add a profile photo</h3>' +
      '<p class="survey-sub">Optional, but it makes your account easier to recognize.</p></header>' +
      '<div class="preferences-profile-card">' +
      '<img class="preferences-profile-preview" id="preferences-profile-preview" src="' +
      esc(global.RepProfilePhoto?.displayUrl?.() || global.RepProfilePhoto?.DEFAULT_URL || "") +
      '" alt="Profile preview" width="72" height="72">' +
      '<div class="preferences-profile-copy">' +
      '<strong>' +
      (hasPhoto ? "Photo added" : "Upload a photo") +
      "</strong>" +
      '<span class="muted">JPG, PNG, WebP, or GIF.</span>' +
      "</div></div>" +
      '<label class="preferences-upload-btn" for="preferences-photo-input">' +
      '<span data-icon="upload" data-icon-class="preferences-upload-ico" aria-hidden="true"></span>' +
      '<span>Choose photo</span>' +
      "</label>" +
      '<input class="preferences-photo-input" type="file" id="preferences-photo-input" accept="image/jpeg,image/png,image/webp,image/gif">' +
      '<p class="settings-status" id="preferences-photo-status" hidden></p>' +
      '<div class="survey-choices survey-choices--proceed">' +
      '<button type="button" class="survey-choice-btn survey-proceed-btn" data-pref-upload>' +
      '<span class="survey-proceed-label">Upload photo</span><span class="survey-proceed-arrow" aria-hidden="true">&rarr;</span></button>' +
      '<button type="button" class="survey-choice-btn secondary preferences-skip-btn" data-pref-skip-photo>I will do this later</button>' +
      "</div></article>"
    );
  }

  function doneStep() {
    return (
      '<article class="survey-step survey-step-enter">' +
      '<header class="survey-step-head"><p class="survey-kicker">Preferences saved</p>' +
      '<h3 class="survey-question">You’re done.</h3>' +
      '<p class="survey-sub">Your preferences are saved. You can update theme, nickname, and photo anytime from Settings.</p></header>' +
      "</article>"
    );
  }

  function stepHtml() {
    const id = STEPS[currentStep];
    if (id === "theme") return themeStep();
    if (id === "nickname") return nicknameStep();
    if (id === "profile") return profileStep();
    return doneStep();
  }

  function updateProgress() {
    const text = document.getElementById("preferences-survey-progress-text");
    const bar = document.getElementById("preferences-survey-progress-bar");
    if (text) text.textContent = "Step " + (currentStep + 1) + " of " + STEPS.length;
    if (bar) bar.style.width = ((currentStep + 1) / STEPS.length) * 100 + "%";
    const back = document.getElementById("preferences-survey-back");
    if (back) back.disabled = currentStep === 0;
  }

  function renderStep() {
    const stage = document.getElementById("preferences-survey-stage");
    if (!stage) return;
    stage.innerHTML = stepHtml();
    updateProgress();
    global.SiteIcons?.initIcons?.(stage);
  }

  function goTo(idx) {
    currentStep = Math.max(0, Math.min(idx, STEPS.length - 1));
    saveStep();
    if (STEPS[currentStep] === "done") {
      markProgress(["preferencesProfile", "preferencesComplete", "module_preferences", "preferences"]);
    }
    renderStep();
  }

  function showStatus(id, msg, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.toggle("is-ok", !!ok);
    el.classList.toggle("is-err", !ok && !!msg);
  }

  async function handleNext() {
    const step = STEPS[currentStep];
    try {
      if (step === "nickname") {
        await saveNickname(document.getElementById("preferences-display-name")?.value);
      }
      if (step === "theme") markProgress(["preferencesTheme"]);
      goTo(currentStep + 1);
    } catch (e) {
      showStatus("preferences-survey-status", e.message || "Could not save.", false);
    }
  }

  async function handlePhotoUpload() {
    if (uploadBusy) return;
    const file = document.getElementById("preferences-photo-input")?.files?.[0];
    if (!file) {
      showStatus("preferences-photo-status", "Choose a photo or skip this step.", false);
      return;
    }
    uploadBusy = true;
    showStatus("preferences-photo-status", "Saving photo...", true);
    try {
      const saved = await global.RepProfilePhoto?.upload?.(file);
      const preview = document.getElementById("preferences-profile-preview");
      if (preview && saved?.url) preview.src = saved.url;
      markProgress(["preferencesProfile"]);
      goTo(currentStep + 1);
    } catch (e) {
      showStatus("preferences-photo-status", e.message || "Could not save photo.", false);
    } finally {
      uploadBusy = false;
    }
  }

  function bindNav() {
    const root = document.getElementById("preferences-survey");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";
    root.addEventListener("click", (e) => {
      const theme = e.target.closest("[data-pref-theme]");
      if (theme) {
        saveTheme(theme.getAttribute("data-pref-theme"));
        renderStep();
        return;
      }
      if (e.target.closest("[data-pref-next]")) {
        void handleNext();
        return;
      }
      if (e.target.closest("[data-pref-upload]")) {
        void handlePhotoUpload();
        return;
      }
      if (e.target.closest("[data-pref-skip-photo]")) {
        markProgress(["preferencesProfile"]);
        goTo(currentStep + 1);
      }
    });
    document.getElementById("preferences-survey-back")?.addEventListener("click", () => goTo(currentStep - 1));
    document.getElementById("preferences-survey-restart")?.addEventListener("click", () => goTo(0));
  }

  async function mount() {
    if (!document.getElementById("preferences-survey")) return;
    currentStep = loadStep();
    bindNav();
    renderStep();
  }

  function init() {
    const start = () => {
      void mount();
    };
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(start);
    else start();
  }

  global.PreferencesSurvey = { init, mount };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else if (document.getElementById("preferences-survey")) {
    init();
  }
})(window);
