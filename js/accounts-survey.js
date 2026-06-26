/**

 * Get started: one step at a time (video + Telegram + payout).

 */

(function (global) {

  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";

  const SURVEY_STEP_KEY = "lpc_setup_survey_step_v2";

  const SURVEY_STEP_KEY_LEGACY = "lpc_accounts_survey_step_v1";

  const SURVEY_FLOW_KEY = "lpc_setup_survey_flow_v1";

  const LEGACY_STEP_IDS = [
    "telegram-app",
    "telegram-device",
    "telegram-download",
    "telegram-signup",
    "telegram-ready",
    "telegram-stuck-update",
    "telegram-stuck-phone",
    "telegram-stuck-still",
    "telegram-join",
    "payout-method",
    "payout-link",
    "done",
  ];

  const STUCK_HELP_STEP_IDS = new Set([
    "telegram-stuck-update",
    "telegram-stuck-phone",
    "telegram-stuck-still",
  ]);

  const STEPS = [
    { id: "payout-method" },
    { id: "payout-link" },
    { id: "telegram-optional" },
    { id: "telegram-app" },
    { id: "telegram-device" },
    { id: "telegram-download" },
    { id: "telegram-signup" },
    { id: "telegram-ready" },
    { id: "telegram-stuck-update" },
    { id: "telegram-stuck-phone" },
    { id: "telegram-stuck-still" },
    { id: "telegram-join" },
    { id: "done" },
  ];

  let currentStep = 0;
  let selectedMethod = null;
  let savedPayout = null;
  let savedPayoutMethods = [];
  let saving = false;
  let needsTelegramInstall = false;
  let needsTelegramStuckHelp = false;
  let wantsTelegramJoin = false;
  let telegramDevice = null;
  let telegramReady = false;
  let surveyDataReady = false;
  let cloudRefreshPromise = null;

  function surveyNextBtn(attr) {
    const dataAttr = attr || "data-advance";
    return (
      '<div class="survey-choices survey-choices--proceed">' +
      `<button type="button" class="survey-choice-btn survey-proceed-btn" ${dataAttr}>` +
      '<span class="survey-proceed-label">Next</span>' +
      '<span class="survey-proceed-arrow" aria-hidden="true">→</span>' +
      "</button></div>"
    );
  }

  function surveyProceedBtn() {
    return surveyNextBtn("data-advance");
  }

  function telegramStuckChoicesHtml(nextStepId, stuckLabel) {
    const moreHelpBtn = nextStepId
      ? `<button type="button" class="survey-choice-btn secondary" data-stuck-more data-stuck-next="${esc(nextStepId)}">${esc(
          stuckLabel || "I'm still stuck · show me what to try"
        )}</button>`
      : `<button type="button" class="survey-choice-btn survey-choice-btn--danger" data-stuck-restart>Restart</button>`;
    return (
      `<div class="survey-choices" role="group" aria-label="Telegram troubleshooting">` +
      `<button type="button" class="survey-choice-btn" data-stuck-fixed>Yes, it's working now</button>` +
      moreHelpBtn +
      `</div>`
    );
  }

  function finishTelegramStuckHelp() {
    needsTelegramStuckHelp = false;
    telegramReady = true;
    saveFlowFlags();
    goTo(stepIndex("telegram-join"));
  }



  function esc(s) {

    return String(s)

      .replace(/&/g, "&amp;")

      .replace(/</g, "&lt;")

      .replace(/>/g, "&gt;")

      .replace(/"/g, "&quot;");

  }



  function cfg() {

    return global.SITE_CONFIG || {};

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



  function getOnboardingProgress() {
    try {
      return JSON.parse(loadItem(PROGRESS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveOnboardingProgress(p) {
    saveItem(PROGRESS_KEY, JSON.stringify(p));
    try {
      global.dispatchEvent(new CustomEvent("onboarding-progress-changed"));
    } catch (e) {
      /* ignore */
    }
  }

  function markProgress(key) {
    try {
      const p = getOnboardingProgress();
      p[key] = true;
      saveOnboardingProgress(p);
    } catch (e) {
      /* ignore */
    }
  }

  function isSurveyComplete() {
    const p = getOnboardingProgress();
    if (p.surveyComplete) return true;
    const doneIdx = STEPS.length - 1;
    let raw = loadItem(SURVEY_STEP_KEY);
    if (raw == null) raw = loadItem(SURVEY_STEP_KEY_LEGACY);
    const n = parseInt(raw || "0", 10);
    return Number.isFinite(n) && n === doneIdx;
  }

  function markSurveyComplete() {
    if (isSurveyComplete()) {
      saveItem(SURVEY_STEP_KEY, String(STEPS.length - 1));
      return;
    }
    try {
      const p = getOnboardingProgress();
      p.surveyComplete = true;
      saveOnboardingProgress(p);
      saveItem(SURVEY_STEP_KEY, String(STEPS.length - 1));
    } catch (e) {
      /* ignore */
    }
  }



  function stepIndex(id) {
    return STEPS.findIndex((s) => s.id === id);
  }

  /** Question order shown in progress bar and Back navigation */
  function questionStepIds() {
    const ids = ["payout-method", "payout-link", "telegram-optional"];
    if (wantsTelegramJoin) {
      ids.push("telegram-app");
      if (needsTelegramInstall) {
        ids.push("telegram-device", "telegram-download", "telegram-signup");
      }
      ids.push("telegram-ready");
      if (needsTelegramStuckHelp) {
        ids.push("telegram-stuck-update", "telegram-stuck-phone", "telegram-stuck-still");
      }
      ids.push("telegram-join");
    }
    return ids;
  }

  function saveFlowFlags() {
    try {
      saveItem(
        SURVEY_FLOW_KEY,
        JSON.stringify({
          install: needsTelegramInstall,
          stuck: needsTelegramStuckHelp,
          wantsTelegram: wantsTelegramJoin,
        })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function loadFlowFlags() {
    try {
      const raw = JSON.parse(loadItem(SURVEY_FLOW_KEY) || "{}");
      if (typeof raw.install === "boolean") needsTelegramInstall = raw.install;
      if (typeof raw.stuck === "boolean") needsTelegramStuckHelp = raw.stuck;
      if (typeof raw.wantsTelegram === "boolean") wantsTelegramJoin = raw.wantsTelegram;
    } catch (e) {
      /* ignore */
    }
  }

  function syncFlowFlagsFromStep(stepId) {
    if (!stepId) return;
    if (stepId === "telegram-device" || stepId === "telegram-download" || stepId === "telegram-signup") {
      needsTelegramInstall = true;
    }
    if (STUCK_HELP_STEP_IDS.has(stepId)) {
      needsTelegramStuckHelp = true;
    }
    saveFlowFlags();
  }

  function payoutMethodsForDisplay() {
    if (savedPayoutMethods.length) return savedPayoutMethods;
    if (savedPayout?.method && savedPayout?.link) return [savedPayout];
    return [];
  }

  function syncSavedPayoutFromList(methods) {
    savedPayoutMethods = Array.isArray(methods) ? methods.filter((m) => m?.method && m?.link) : [];
    const primary = savedPayoutMethods[0] || null;
    if (primary) {
      savedPayout = {
        method: primary.method,
        link: primary.link,
        updatedAt: primary.updatedAt,
      };
    } else {
      savedPayout = null;
      selectedMethod = null;
    }
  }

  function isPayoutComplete() {
    return payoutMethodsForDisplay().length > 0;
  }

  function progressMeta() {
    const ids = questionStepIds();
    const cur = STEPS[currentStep]?.id;
    const pos = ids.indexOf(cur);
    if (pos < 0) return { n: 1, total: ids.length };
    return { n: pos + 1, total: ids.length };
  }

  function surveyProgressPct() {
    const { total } = progressMeta();
    if (!total) return 0;
    if (STEPS[currentStep]?.id === "done") {
      const completed = isPayoutComplete() ? total : Math.max(1, total - 1);
      return (completed / total) * 100;
    }
    const { n } = progressMeta();
    return (n / total) * 100;
  }

  function stepLabel() {
    if (STEPS[currentStep]?.id === "done") {
      return isPayoutComplete() ? "Complete" : "Incomplete";
    }
    const { n, total } = progressMeta();
    return "Step " + n + " of " + total;
  }



  function videoEmbedHtml() {

    const url = String(cfg().onboardingVideoUrl || "").trim();

    if (!url) {

      return (

        '<div class="video-placeholder survey-video-placeholder">' +

        "<p>Your manager will add the course video soon. Tap continue when you're ready.</p>" +

        "</div>"

      );

    }

    let embed = url;

    if (url.includes("youtube.com/watch")) {

      try {

        const id = new URL(url).searchParams.get("v");

        if (id) embed = "https://www.youtube.com/embed/" + id;

      } catch (e) {

        /* keep raw url */

      }

    } else if (url.includes("youtu.be/")) {

      embed = "https://www.youtube.com/embed/" + url.split("youtu.be/")[1].split("?")[0];

    }

    return (

      '<div class="video-wrap survey-video-wrap">' +

      '<iframe src="' +

      esc(embed) +

      '" title="Course video" allowfullscreen></iframe>' +

      "</div>"

    );

  }



  function loadSurveyStep() {
    const rawV2 = loadItem(SURVEY_STEP_KEY);
    if (rawV2 != null) {
      const n = parseInt(rawV2, 10);
      return Number.isFinite(n) ? Math.min(Math.max(0, n), STEPS.length - 1) : 0;
    }
    const rawLegacy = loadItem(SURVEY_STEP_KEY_LEGACY);
    const n = parseInt(rawLegacy || "0", 10);
    if (!Number.isFinite(n)) return 0;
    const legacyId = LEGACY_STEP_IDS[n];
    const migrated = legacyId ? stepIndex(legacyId) : 0;
    return migrated >= 0 ? migrated : 0;
  }



  function saveSurveyStep() {

    saveItem(SURVEY_STEP_KEY, String(currentStep));

  }



  function methodMeta(id) {

    return global.PayoutSetup?.METHODS?.find((m) => m.id === id) || null;

  }



  function renderMethodButtons(selected) {
    const methods = global.PayoutSetup?.METHODS || [];
    const renderIcon = global.PayoutSetup?.renderMethodIcon;
    return methods
      .map(
        (m) =>
          `<button type="button" class="payout-method-btn payout-method-${esc(m.id)}" data-method="${esc(m.id)}" aria-pressed="${selected === m.id ? "true" : "false"}">` +
          (renderIcon ? renderIcon(m.id) : `<span class="payout-method-icon" aria-hidden="true">${esc(m.short || m.label.charAt(0))}</span>`) +
          `<span class="payout-method-label">${esc(m.label)}</span>` +
          `</button>`
      )
      .join("");
  }



  function telegramAppIconUrl() {
    return (
      String(cfg().telegramAppIcon || "").trim() ||
      "https://github.com/Delexoo/Dashboard/blob/main/doc/Telegram.png?raw=true"
    );
  }

  function surveyStepHeadWithTelegramIcon(title) {
    const icon = telegramAppIconUrl();
    return (
      `<div class="survey-step-head">` +
      `<h2 class="survey-question survey-question--with-icon">` +
      `<span class="survey-question-text">${esc(title)}</span>` +
      `<img class="survey-step-head-icon" src="${esc(icon)}" alt="" width="32" height="32" decoding="async" fetchpriority="high">` +
      `</h2></div>`
    );
  }

  function telegramSearchInstallStep() {
    const icon = telegramAppIconUrl();
    return (
      `<li class="survey-install-step-app">` +
      `<div class="survey-app-icon-card">` +
      `<img class="survey-app-icon" src="${esc(icon)}" alt="Telegram app icon" width="56" height="56" decoding="async" fetchpriority="high">` +
      `<div class="survey-app-icon-copy">` +
      `<span class="survey-app-icon-title">Search for <strong>Telegram</strong></span>` +
      `<span class="survey-app-icon-meta">Look for this application</span>` +
      `</div></div></li>`
    );
  }

  function renderDonePayoutRow(entry) {
    const PS = global.PayoutSetup;
    if (!PS?.renderSavedPayoutRow) return "";
    return PS.renderSavedPayoutRow(entry, { removeAttr: "data-remove-payout" });
  }

  async function handleSurveyPayoutRemove(methodId, listEl, btn) {
    const PS = global.PayoutSetup;
    if (!PS?.removeOne || !methodId || btn?.disabled) return;
    if (btn) btn.disabled = true;
    try {
      const methods = await PS.removeOne(methodId);
      syncSavedPayoutFromList(methods);
      if (STEPS[currentStep]?.id === "done") {
        renderStep();
        updateProgress();
      } else if (listEl) {
        listEl.innerHTML = methods.map((m) => renderDonePayoutRow(m)).join("");
        bindSurveyPayoutRemoves(listEl);
        updateProgress();
      }
    } catch (e) {
      console.warn(e);
      window.alert(e.message || "Could not remove payout method.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindSurveyPayoutRemoves(root) {
    const el = root || document.getElementById("survey-done-payout-list");
    if (!el) return;
    el.querySelectorAll("[data-remove-payout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleSurveyPayoutRemove(btn.dataset.removePayout, el, btn);
      });
    });
  }

  function telegramTeamWordLink() {
    const url = String(cfg().telegramTeam || "").trim();
    const displayName = String(
      cfg().telegramTeamDisplayName || cfg().payoutTelegramName || "Website Agency"
    ).trim();
    if (!url) return esc(displayName);
    return (
      `<a class="link-bold-blue" href="${esc(url)}" target="_blank" rel="noopener">${esc(displayName)}</a>`
    );
  }

  function telegramTeamLink() {
    const url = String(cfg().telegramTeam || "").trim();
    const displayName = String(
      cfg().telegramTeamDisplayName || cfg().payoutTelegramName || "Website Agency"
    ).trim();
    const joinLabel = String(
      cfg().telegramTeamJoinLabel || cfg().telegramTeamName || "Join team Telegram group"
    ).trim();
    const avatar = String(cfg().telegramTeamAvatar || "").trim();

    if (!url) return `<p class="survey-note muted">Ask your manager for the team Telegram invite link.</p>`;

    const avatarBlock = avatar
      ? `<img class="telegram-embed-avatar" src="${esc(avatar)}" alt="" width="40" height="40" decoding="async" fetchpriority="high">`
      : `<span class="telegram-embed-avatar telegram-embed-avatar--fallback" aria-hidden="true">✈</span>`;

    return (
      `<a class="telegram-embed-card" href="${esc(url)}" target="_blank" rel="noopener">` +
      avatarBlock +
      `<div class="telegram-embed-body">` +
      `<p class="telegram-embed-name">${esc(displayName)}</p>` +
      `<p class="telegram-embed-action">${esc(joinLabel)}</p>` +
      `</div></a>`
    );
  }



  function renderStepContent(idx) {

    const step = STEPS[idx];

    if (!step) return "";



    if (step.id === "telegram-optional") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">Join the team business chat? <span class="survey-optional-tag">Optional</span></h2>` +
        `<p class="survey-sub">Telegram is for team updates and questions. <strong>Leads are sent through Lead Builder on the website</strong> · you do not need Telegram to submit interested businesses.</p>` +
        `<div class="survey-choices" role="group" aria-label="Join Telegram chat">` +
        `<button type="button" class="survey-choice-btn" data-telegram-opt="yes">Yes, I'd like to join</button>` +
        `<button type="button" class="survey-choice-btn secondary" data-telegram-opt="no">No thanks · skip for now</button>` +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "telegram-app") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        surveyStepHeadWithTelegramIcon("Do you have Telegram?") +
        `<p class="survey-sub">We'll walk you through installing it if needed. Telegram is only for the team chat · leads go through Lead Builder on the website.</p>` +
        `<div class="survey-choices" role="group" aria-label="Telegram installed">` +
        `<button type="button" class="survey-choice-btn" data-choice="yes">Yes, I already have Telegram</button>` +
        `<button type="button" class="survey-choice-btn secondary" data-choice="no">No, walk me through setup</button>` +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "telegram-device") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">What will you use Telegram on?</h2>` +
        `<p class="survey-sub">Pick the device you'll use most for team messages.</p>` +
        `<div class="survey-choices" role="group" aria-label="Device for Telegram">` +
        `<button type="button" class="survey-choice-btn" data-device="phone">My phone</button>` +
        `<button type="button" class="survey-choice-btn secondary" data-device="computer">My computer</button>` +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "telegram-download") {
      const phoneSteps =
        `<ol class="survey-help-list survey-install-steps">` +
        `<li>Open the <a class="link-bold-blue" href="https://apps.apple.com/app/telegram-messenger/id686449807" target="_blank" rel="noopener">App Store</a> or <a class="link-bold-blue" href="https://play.google.com/store/apps/details?id=org.telegram.messenger" target="_blank" rel="noopener">Google Play</a>.</li>` +
        telegramSearchInstallStep() +
        `<li>Tap <strong>Install</strong> or <strong>Get</strong> and wait for the download.</li>` +
        `<li>Open the app. You should see a welcome or login screen.</li>` +
        `</ol>`;
      const computerSteps =
        `<ol class="survey-help-list survey-install-steps">` +
        `<li class="survey-install-step-app">` +
        `<div class="survey-app-icon-card">` +
        `<img class="survey-app-icon" src="${esc(telegramAppIconUrl())}" alt="Telegram app icon" width="56" height="56" decoding="async" fetchpriority="high">` +
        `<div class="survey-app-icon-copy">` +
        `<span class="survey-app-icon-title">Download <strong>Telegram</strong></span>` +
        `<span class="survey-app-icon-meta">Same blue paper-plane icon on desktop</span>` +
        `</div></div></li>` +
        `<li>Visit <a class="link-bold-blue" href="https://telegram.org/" target="_blank" rel="noopener">Telegram.org</a>.</li>` +
        `<li>Download and run the installer or sign in on the web version.</li>` +
        `<li>When Telegram opens, you should see <strong>Start Messaging</strong> or a login screen.</li>` +
        `</ol>`;
      const body =
        telegramDevice === "computer"
          ? `<h2 class="survey-question">Install Telegram on your computer</h2>` +
            `<p class="survey-sub">Follow these steps, then continue when Telegram is installed.</p>` +
            computerSteps
          : `<h2 class="survey-question">Install Telegram on your phone</h2>` +
            `<p class="survey-sub">Follow these steps, then continue when Telegram is installed.</p>` +
            phoneSteps;
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        body +
        surveyProceedBtn() +
        `</div>`
      );
    }

    if (step.id === "telegram-signup") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">Create your Telegram account</h2>` +
        `<p class="survey-sub">Do this inside the Telegram app you just installed.</p>` +
        surveyProceedBtn() +
        `</div>`
      );
    }

    if (step.id === "telegram-ready") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">Is Telegram working?</h2>` +
        `<p class="survey-sub">Open the app and confirm you can see the chat list (even if it's empty).</p>` +
        `<div class="survey-choices" role="group" aria-label="Telegram ready">` +
        `<button type="button" class="survey-choice-btn" data-ready="yes">Yes, it's working now</button>` +
        `<button type="button" class="survey-choice-btn secondary" data-ready="help">I'm stuck · show me what to try</button>` +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "telegram-stuck-update") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">Should I update or reinstall the app?</h2>` +
        `<p class="survey-sub">Try updating from your app store first. If that does not help, re-download from <a class="link-bold-blue" href="https://telegram.org/" target="_blank" rel="noopener">telegram.org</a>.</p>` +
        telegramStuckChoicesHtml("telegram-stuck-phone") +
        `</div>`
      );
    }

    if (step.id === "telegram-stuck-phone") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">What phone number should I use for Telegram?</h2>` +
        `<p class="survey-sub">Use your real mobile number · the one you actually answer. No burner numbers, no Google Voice, and no VOIP. Telegram verifies you by text or call, and a fake number will break login later.</p>` +
        `<p class="survey-sub">Stick to one account on that number. Do not sign up again with a different number.</p>` +
        telegramStuckChoicesHtml("telegram-stuck-still") +
        `</div>`
      );
    }

    if (step.id === "telegram-stuck-still") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">Still stuck after trying those steps?</h2>` +
        `<p class="survey-sub">Open <a class="link-bold-blue" href="about.html#owner">About us</a> and tell Delexo what is going wrong.</p>` +
        telegramStuckChoicesHtml(null) +
        `</div>`
      );
    }



    if (step.id === "telegram-join") {

      return (

        `<div class="survey-step" data-step="${esc(step.id)}">` +

        `<h2 class="survey-question">Join the team business chat <span class="survey-optional-tag">Optional</span></h2>` +

        `<p class="survey-sub">Open the link, join the group if you want team updates, then tap below · or skip for now.</p>` +
        `<div class="survey-action-block">${telegramTeamLink()}</div>` +
        `<div class="survey-choices survey-choices--join">` +
        `<button type="button" class="survey-choice-btn secondary" data-telegram-skip>Skip for now</button>` +
        `<button type="button" class="survey-choice-btn survey-proceed-btn" data-join-advance>` +
        `<span class="survey-proceed-label">Joined · continue</span>` +
        `<span class="survey-proceed-arrow" aria-hidden="true">→</span>` +
        `</button></div></div>`
      );
    }



    if (step.id === "payout-method") {

      return (

        `<div class="survey-step" data-step="${esc(step.id)}">` +

        `<h2 class="survey-question">How do you want to get paid?</h2>` +

        `<p class="survey-sub">Pick the app you actually use when a deal closes.</p>` +

        `<div class="payout-methods survey-payout-methods" role="group" aria-label="Payout app">` +

        renderMethodButtons(selectedMethod) +

        `</div>` +
        `<div class="survey-payout-actions survey-payout-actions--method">` +
        `<button type="button" class="survey-choice-btn survey-payout-later" id="survey-payout-later">Skip (finish later)</button>` +
        `</div>` +
        `</div>`

      );

    }



    if (step.id === "payout-link") {

      const meta = methodMeta(selectedMethod);

      const label = meta?.fieldLabel || "Paste your payout link";

      const hint = meta?.hint || "";

      const addingAnother = payoutMethodsForDisplay().length > 0;
      const saveLabel = addingAnother ? "Save" : "Save & finish";

      return (

        `<div class="survey-step" data-step="${esc(step.id)}">` +

        `<h2 class="survey-question">${esc(label)}</h2>` +

        `<p class="survey-sub">${esc(hint)}</p>` +

        `<div class="survey-input-block">` +

        `<div id="survey-payout-field-host" class="payout-link-field-host survey-payout-field-host"></div>` +

        `<p id="survey-payout-status" class="payout-status" hidden></p>` +
        `<div class="survey-payout-actions">` +
        `<button type="button" class="survey-choice-btn survey-proceed-btn survey-payout-save" id="survey-payout-save">${esc(saveLabel)}</button>` +
        `</div></div></div>`
      );
    }



    if (step.id === "done") {
      const repName = esc(global.RepSession?.get?.()?.name || "you");
      const payoutComplete = isPayoutComplete();
      const p = getOnboardingProgress();
      const telegramJoined = !!p.telegram;
      const telegramSkipped = !!p.telegramSkipped;

      const telegramDoneRow = wantsTelegramJoin
        ? telegramJoined
          ? `<p class="survey-done-row"><span class="survey-done-check" aria-hidden="true">✓</span> Joined ${telegramTeamWordLink()}</p>`
          : telegramSkipped
            ? `<p class="survey-done-row"><span class="survey-done-muted" aria-hidden="true">-</span> Telegram skipped <span class="muted">(optional)</span></p>`
            : `<p class="survey-done-row survey-done-row--incomplete"><span class="survey-done-incomplete" aria-hidden="true">○</span> Telegram not joined yet <span class="muted">(optional)</span></p>`
        : `<p class="survey-done-row"><span class="survey-done-muted" aria-hidden="true">-</span> Telegram skipped <span class="muted">(optional)</span></p>`;

      const payoutStatusIcon = payoutComplete
        ? `<span class="survey-done-check" aria-hidden="true">✓</span>`
        : `<span class="survey-done-incomplete" aria-hidden="true">✕</span>`;
      const payoutStatusLabel = payoutComplete ? "Payout method saved" : "Payout incomplete";

      const payoutDetail = payoutComplete
        ? `<div class="payout-saved-preview survey-done-payout">` +
          `<div id="survey-done-payout-list">` +
          payoutMethodsForDisplay().map((m) => renderDonePayoutRow(m)).join("") +
          `</div>` +
          `<div class="survey-done-return-wrap">` +
          `<button type="button" class="survey-choice-btn survey-payout-later" id="survey-add-payout">Add another (optional)</button>` +
          `</div></div>`
        : `<div class="survey-done-payout survey-done-payout--incomplete">` +
          `<p class="survey-sub muted">Payment isn't set up yet, and that's okay. You can add it later in <a class="link-bold-blue" href="settings.html">Settings</a>, or finish it in the survey now.</p>` +
          `<div class="survey-done-return-wrap">` +
          `<button type="button" class="survey-choice-btn survey-proceed-btn" id="survey-return-payout">Set up payout</button>` +
          `</div></div>`;

      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<h2 class="survey-question">${payoutComplete ? `You're all set, ${repName}! Click next!` : `You're almost done, ${repName}! Click next!`}</h2>` +
        `<div class="survey-done-card card">` +
        telegramDoneRow +
        `<p class="survey-done-row${payoutComplete ? "" : " survey-done-row--incomplete"}">${payoutStatusIcon} ${payoutStatusLabel}</p>` +
        payoutDetail +
        `</div>` +
        `</div>`
      );
    }



    return "";

  }



  function showPayoutStatus(msg, type) {

    const el = document.getElementById("survey-payout-status");

    if (!el) return;

    el.textContent = msg;

    el.hidden = !msg;

    el.className = "payout-status" + (type ? " payout-status-" + type : "");

  }



  function updateProgress() {
    const bar = document.getElementById("survey-progress-bar");
    const text = document.getElementById("survey-progress-text");
    const wrap = document.querySelector(".survey-progress-wrap");
    const pct = surveyProgressPct();
    const incomplete = STEPS[currentStep]?.id === "done" && !isPayoutComplete();

    if (bar) bar.style.width = pct + "%";
    if (text) text.textContent = stepLabel();
    if (wrap) wrap.classList.toggle("is-incomplete", incomplete);
  }



  function bindAdvanceButtons(stage) {
    stage.querySelectorAll("[data-advance]").forEach((btn) => {
      btn.addEventListener("click", () => goTo(currentStep + 1));
    });
  }

  function syncSetupAccountsModuleProgress() {
    const CM = global.CourseModules;
    const mod = CM?.get?.("setup-accounts");
    if (!mod) return;
    const p = getOnboardingProgress();
    if (!CM.isComplete(mod, p)) return;
    const next = CM.markComplete(mod, p);
    saveOnboardingProgress(next);
  }

  function restartSurvey() {
    needsTelegramInstall = false;
    needsTelegramStuckHelp = false;
    wantsTelegramJoin = false;
    telegramDevice = null;
    telegramReady = false;
    saving = false;
    try {
      const p = getOnboardingProgress();
      delete p.surveyComplete;
      delete p.telegram;
      delete p.telegramSkipped;
      delete p.module_setup_accounts;
      delete p.module_setup;
      saveOnboardingProgress(p);
    } catch (e) {
      /* ignore */
    }
    saveItem(SURVEY_STEP_KEY, "0");
    saveItem(SURVEY_FLOW_KEY, JSON.stringify({ install: false, stuck: false, wantsTelegram: false }));
    goTo(0);
  }

  function goBack() {
    const cur = STEPS[currentStep]?.id;
    if (cur === "done" && !isPayoutComplete()) {
      if (!selectedMethod && savedPayout?.method) selectedMethod = savedPayout.method;
      goTo(stepIndex("payout-method"));
      return;
    }
    if (cur === "done") {
      goTo(stepIndex(wantsTelegramJoin ? "telegram-join" : "telegram-optional"));
      return;
    }
    const ids = questionStepIds();
    const pos = ids.indexOf(cur);
    if (pos <= 0) return;
    const prevId = ids[pos - 1];
    if (STUCK_HELP_STEP_IDS.has(cur) && prevId === "telegram-ready") {
      needsTelegramStuckHelp = false;
      saveFlowFlags();
    }
    goTo(stepIndex(prevId));
  }

  function syncNavButtons() {
    const backBtn = document.getElementById("survey-back");
    const cur = STEPS[currentStep]?.id;
    const ids = questionStepIds();
    const pos = ids.indexOf(cur);
    const canBack =
      cur === "done" ? true : pos > 0;
    if (backBtn) {
      backBtn.disabled = !canBack;
      backBtn.setAttribute("aria-disabled", canBack ? "false" : "true");
    }
  }

  function bindStepEvents() {

    const step = STEPS[currentStep];

    const stage = document.getElementById("survey-stage");

    if (!stage || !step) return;



    if (step.id === "telegram-optional") {
      stage.querySelectorAll("[data-telegram-opt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          wantsTelegramJoin = btn.dataset.telegramOpt === "yes";
          saveFlowFlags();
          if (wantsTelegramJoin) {
            goTo(stepIndex("telegram-app"));
            return;
          }
          markProgress("telegramSkipped");
          goTo(stepIndex("done"));
        });
      });
    }

    if (step.id === "telegram-app") {
      stage.querySelectorAll("[data-choice]").forEach((btn) => {
        btn.addEventListener("click", () => {
          stage.querySelectorAll("[data-choice]").forEach((b) => {
            b.classList.toggle("is-selected", b === btn);
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          if (btn.dataset.choice === "no") {
            needsTelegramInstall = true;
            needsTelegramStuckHelp = false;
            telegramDevice = null;
            telegramReady = false;
            saveFlowFlags();
            goTo(stepIndex("telegram-device"));
            return;
          }
          needsTelegramInstall = false;
          needsTelegramStuckHelp = false;
          telegramDevice = null;
          telegramReady = false;
          saveFlowFlags();
          goTo(stepIndex("telegram-ready"));
        });
      });
    }

    if (step.id === "telegram-device") {
      stage.querySelectorAll("[data-device]").forEach((btn) => {
        btn.addEventListener("click", () => {
          telegramDevice = btn.dataset.device;
          stage.querySelectorAll("[data-device]").forEach((b) => {
            b.classList.toggle("is-selected", b === btn);
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          goTo(stepIndex("telegram-download"));
        });
      });
    }

    if (step.id === "telegram-ready") {
      stage.querySelectorAll("[data-ready]").forEach((btn) => {
        btn.addEventListener("click", () => {
          stage.querySelectorAll("[data-ready]").forEach((b) => {
            b.classList.toggle("is-selected", b === btn);
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          if (btn.dataset.ready === "help") {
            needsTelegramStuckHelp = true;
            saveFlowFlags();
            goTo(stepIndex("telegram-stuck-update"));
            return;
          }
          needsTelegramStuckHelp = false;
          saveFlowFlags();
          finishTelegramStuckHelp();
        });
      });
    }

    if (STUCK_HELP_STEP_IDS.has(step.id)) {
      stage.querySelector("[data-stuck-fixed]")?.addEventListener("click", () => {
        finishTelegramStuckHelp();
      });
      stage.querySelector("[data-stuck-more]")?.addEventListener("click", (e) => {
        const nextId = e.currentTarget.getAttribute("data-stuck-next");
        if (nextId) goTo(stepIndex(nextId));
      });
      stage.querySelector("[data-stuck-restart]")?.addEventListener("click", () => {
        restartSurvey();
      });
    }

    if (step.id === "telegram-join") {
      stage.querySelectorAll("[data-join-advance]").forEach((btn) => {
        btn.addEventListener("click", () => {
          markProgress("telegram");
          goTo(stepIndex("done"));
        });
      });
      stage.querySelector("[data-telegram-skip]")?.addEventListener("click", () => {
        markProgress("telegramSkipped");
        goTo(stepIndex("done"));
      });
    }

    bindAdvanceButtons(stage);



    if (step.id === "payout-method") {
      stage.querySelectorAll("[data-method]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedMethod = btn.dataset.method;
          goTo(currentStep + 1);
        });
      });
      stage.querySelector("#survey-payout-later")?.addEventListener("click", finishPayoutLater);
    }

    if (step.id === "payout-link") {
      const fieldHost = stage.querySelector("#survey-payout-field-host");
      const existing = payoutMethodsForDisplay().find((m) => m.method === selectedMethod);
      const meta = methodMeta(selectedMethod);
      const linkField = global.PayoutSetup?.mountLinkField?.(fieldHost, {
        method: selectedMethod,
        value: existing?.link || "",
        inputId: "survey-payout-input",
        placeholder: meta?.placeholder || "",
      });
      const saveBtn = stage.querySelector("#survey-payout-save");
      linkField?.focus();
      fieldHost?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          savePayoutAndFinish();
        }
      });
      saveBtn?.addEventListener("click", () => savePayoutAndFinish());
    }

    if (step.id === "done") {
      const goToPayoutSetup = (clearMethod) => {
        if (!clearMethod && !selectedMethod && savedPayout?.method) {
          selectedMethod = savedPayout.method;
        }
        if (clearMethod) selectedMethod = null;
        goTo(stepIndex("payout-method"));
      };
      stage.querySelector("#survey-return-payout")?.addEventListener("click", () => {
        goToPayoutSetup(false);
      });
      stage.querySelector("#survey-add-payout")?.addEventListener("click", () => {
        goToPayoutSetup(true);
      });
      bindSurveyPayoutRemoves(stage.querySelector("#survey-done-payout-list"));
    }
  }



  function renderStep() {
    const stage = document.getElementById("survey-stage");
    if (!stage) return;

    stage.innerHTML = renderStepContent(currentStep);

    window.SiteImagePreload?.warmDocumentImages?.(stage);

    stage.classList.remove("survey-step-enter");

    void stage.offsetWidth;

    stage.classList.add("survey-step-enter");

    bindStepEvents();

    updateProgress();

    syncNavButtons();

    saveSurveyStep();

  }



  function resolveSurveyStep() {
    if (isSurveyComplete()) return STEPS.length - 1;
    return loadSurveyStep();
  }

  function goTo(idx) {
    currentStep = Math.max(0, Math.min(idx, STEPS.length - 1));
    syncFlowFlagsFromStep(STEPS[currentStep]?.id);
    renderStep();
    if (STEPS[currentStep]?.id === "done") {
      markSurveyComplete();
      syncSetupAccountsModuleProgress();
      document.getElementById("accounts-survey")?.classList.add("accounts-survey--complete");
    }
  }



  async function refreshDonePayoutList() {
    const listEl = document.getElementById("survey-done-payout-list");
    if (!global.PayoutSetup?.fetchAllMine) return;
    try {
      const methods = await global.PayoutSetup.fetchAllMine();
      syncSavedPayoutFromList(methods);
      if (!listEl || !methods.length) return;
      listEl.innerHTML = methods.map((m) => renderDonePayoutRow(m)).join("");
      bindSurveyPayoutRemoves(listEl);
    } catch (e) {
      console.warn("Payout list load failed", e);
    }
  }

  function finishPayoutLater() {
    showPayoutStatus("", "");
    goTo(stepIndex("telegram-optional"));
    updateProgress();
  }

  async function savePayoutAndFinish() {

    const fieldHost = document.getElementById("survey-payout-field-host");
    const link = global.PayoutSetup?.readLinkField?.(fieldHost) || "";

    if (!selectedMethod) {

      goTo(STEPS.findIndex((s) => s.id === "payout-method"));

      return;

    }

    if (!link) {

      const meta = methodMeta(selectedMethod);

      showPayoutStatus(meta?.hint || "Enter your payout details.", "warn");

      fieldHost?._payoutLinkField?.focus?.();

      return;

    }



    saving = true;

    const saveBtn = document.getElementById("survey-payout-save");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
    }

    showPayoutStatus("Saving…", "");

    try {

      await global.PayoutSetup.saveMine(selectedMethod, link);
      syncSavedPayoutFromList(await global.PayoutSetup.fetchAllMine());

      markProgress("payout");
      syncSetupAccountsModuleProgress();

      showPayoutStatus("", "");

      goTo(stepIndex("telegram-optional"));

    } catch (e) {

      console.warn(e);

      showPayoutStatus(e.message || "Could not save. Try again.", "err");

    }

    saving = false;

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = payoutMethodsForDisplay().length ? "Save" : "Save & finish";
    }
  }

  function initSurveyNav() {
    const root = document.getElementById("accounts-survey");
    if (!root || root.dataset.navBound === "1") return;
    root.dataset.navBound = "1";
    document.getElementById("survey-back")?.addEventListener("click", goBack);
    document.getElementById("survey-restart")?.addEventListener("click", restartSurvey);
  }

  function bindPayoutListener() {
    if (global.__accountsSurveyPayoutListener) return;
    global.__accountsSurveyPayoutListener = true;
    global.addEventListener("payout-methods-changed", (e) => {
      onPayoutMethodsChanged(e).catch((err) => console.warn("Survey payout sync failed", err));
    });
  }

  function resetSurveyDataState() {
    surveyDataReady = false;
    cloudRefreshPromise = null;
    savedPayout = null;
    savedPayoutMethods = [];
    selectedMethod = null;
  }

  function kickRepStorageInit() {
    if (global.RepStorage?.init) {
      global.RepStorage.init().catch((e) => console.warn("RepStorage init failed", e));
    }
  }

  function loadSavedPayoutsLocal() {
    try {
      const methods = global.PayoutSetup?.loadLocalMethods?.() || [];
      syncSavedPayoutFromList(methods);
      if (savedPayout?.method && !selectedMethod) selectedMethod = savedPayout.method;
    } catch (e) {
      console.warn("Payout local load failed", e);
    }
  }

  function bootstrapSurveyFromLocal() {
    loadFlowFlags();
    loadSavedPayoutsLocal();
    surveyDataReady = true;
  }

  function applyCloudSurveyState() {
    loadFlowFlags();
    if (isSurveyComplete()) markSurveyComplete();
    const root = document.getElementById("accounts-survey");
    if (!root || root.dataset.surveyMounted !== "1") return;
    root.classList.toggle("accounts-survey--complete", isSurveyComplete());
    const stepIdx = resolveSurveyStep();
    if (stepIdx !== currentStep) {
      goTo(stepIdx);
      return;
    }
    updateProgress();
    if (STEPS[currentStep]?.id === "done") renderStep();
  }

  async function waitForRepStorage(maxMs) {
    if (global.RepStorage?.whenReady) {
      await Promise.race([
        new Promise((resolve) => global.RepStorage.whenReady(resolve)),
        new Promise((resolve) => setTimeout(resolve, maxMs || 8000)),
      ]);
      return;
    }
    if (global.RepStorage?.init) await global.RepStorage.init();
  }

  async function refreshSurveyFromCloud() {
    if (!cloudRefreshPromise) {
      cloudRefreshPromise = (async () => {
        kickRepStorageInit();
        await waitForRepStorage(8000);
        await loadSavedPayouts();
        applyCloudSurveyState();
      })().catch((e) => {
        console.warn("Survey cloud sync failed", e);
      }).finally(() => {
        cloudRefreshPromise = null;
      });
    }
    return cloudRefreshPromise;
  }

  function setSurveyLoading(loading) {
    const root = document.getElementById("accounts-survey");
    if (!root) return;
    root.classList.toggle("accounts-survey--loading", loading);
    root.setAttribute("aria-busy", loading ? "true" : "false");
    const text = document.getElementById("survey-progress-text");
    if (loading && text) text.textContent = "Loading…";
  }

  async function loadSavedPayouts() {
    try {
      syncSavedPayoutFromList((await global.PayoutSetup?.fetchAllMine?.()) || []);
      if (savedPayout?.method && !selectedMethod) selectedMethod = savedPayout.method;
    } catch (e) {
      console.warn("Payout load failed", e);
    }
  }

  async function mountSurvey() {
    const root = document.getElementById("accounts-survey");
    if (!root) return false;

    if (root.dataset.surveyBound !== "1") {
      root.dataset.surveyBound = "1";
      initSurveyNav();
      bindPayoutListener();
    }

    kickRepStorageInit();
    bootstrapSurveyFromLocal();

    const stepIdx = resolveSurveyStep();
    const alreadyMounted = root.dataset.surveyMounted === "1";
    root.classList.toggle("accounts-survey--complete", isSurveyComplete());
    setSurveyLoading(false);

    if (alreadyMounted && currentStep === stepIdx) {
      if (STEPS[currentStep]?.id === "done") renderStep();
      else updateProgress();
      refreshSurveyFromCloud();
      return true;
    }

    goTo(stepIdx);
    root.dataset.surveyMounted = "1";
    refreshSurveyFromCloud();
    return true;
  }

  async function onPayoutMethodsChanged(e) {
    const root = document.getElementById("accounts-survey");
    if (!root || root.dataset.surveyBound !== "1") return;
    try {
      if (!surveyDataReady) bootstrapSurveyFromLocal();
      const fromEvent = e?.detail?.methods;
      if (Array.isArray(fromEvent)) {
        syncSavedPayoutFromList(fromEvent);
      } else {
        syncSavedPayoutFromList((await global.PayoutSetup?.fetchAllMine?.()) || []);
      }
    } catch (err) {
      console.warn("Payout sync failed", err);
      return;
    }
    if (STEPS[currentStep]?.id === "done") {
      renderStep();
      updateProgress();
      return;
    }
    updateProgress();
  }

  function init() {
    const start = () => {
      mountSurvey().catch((e) => console.warn("Survey mount failed", e));
    };
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(start);
    else start();
  }

  if (!global.__accountsSurveySessionListener) {
    global.__accountsSurveySessionListener = true;
    global.addEventListener("rep-session-changed", () => {
      resetSurveyDataState();
      const root = document.getElementById("accounts-survey");
      if (!root || root.dataset.surveyBound !== "1") return;
      root.dataset.surveyMounted = "0";
      mountSurvey().catch((e) => console.warn("Survey remount failed", e));
    });
  }

  if (!global.__accountsSurveySettingsListener) {
    global.__accountsSurveySettingsListener = true;
    global.addEventListener("rep-settings-ready", () => {
      applyCloudSurveyState();
    });
  }



  global.AccountsSurvey = { init, mount: mountSurvey };



  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else if (document.getElementById("accounts-survey")) {
    init();
  }

})(window);

