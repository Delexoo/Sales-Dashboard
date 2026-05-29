/**
 * Set up accounts — one question at a time.
 */
(function (global) {
  const PROGRESS_KEY = "lpc_sales_onboarding_progress_v1";
  const SURVEY_STEP_KEY = "lpc_accounts_survey_step_v1";

  const STEPS = [
    { id: "telegram-app" },
    { id: "telegram-join" },
    { id: "payout-method" },
    { id: "payout-link" },
    { id: "done" },
  ];

  let currentStep = 0;
  let selectedMethod = null;
  let savedPayout = null;
  let saving = false;

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

  function markProgress(key) {
    try {
      const p = JSON.parse(loadItem(PROGRESS_KEY) || "{}");
      p[key] = true;
      saveItem(PROGRESS_KEY, JSON.stringify(p));
    } catch (e) {
      /* ignore */
    }
  }

  function loadSurveyStep() {
    const n = parseInt(loadItem(SURVEY_STEP_KEY) || "0", 10);
    return Number.isFinite(n) ? Math.min(Math.max(0, n), STEPS.length - 1) : 0;
  }

  function saveSurveyStep() {
    saveItem(SURVEY_STEP_KEY, String(currentStep));
  }

  function methodMeta(id) {
    return global.PayoutSetup?.METHODS?.find((m) => m.id === id) || null;
  }

  function renderMethodButtons(selected) {
    const methods = global.PayoutSetup?.METHODS || [];
    return methods
      .map(
        (m) =>
          `<button type="button" class="payout-method-btn payout-method-${esc(m.id)} survey-choice-btn" data-method="${esc(m.id)}" aria-pressed="${selected === m.id ? "true" : "false"}">` +
          `<span class="payout-method-icon" aria-hidden="true">${esc(m.short || m.label.charAt(0))}</span>` +
          `<span class="payout-method-label">${esc(m.label)}</span>` +
          `</button>`
      )
      .join("");
  }

  function telegramTeamLink() {
    const url = String(cfg().telegramTeam || "").trim();
    const name = String(cfg().telegramTeamName || "team Telegram group").trim();
    if (!url) return `<p class="survey-note muted">Ask your manager for the team Telegram invite link.</p>`;
    return (
      `<a class="btn survey-action-link link-bold-blue" href="${esc(url)}" target="_blank" rel="noopener">` +
      `Join ${esc(name)}</a>`
    );
  }

  function renderStepContent(idx) {
    const step = STEPS[idx];
    if (!step) return "";

    if (step.id === "telegram-app") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<p class="survey-kicker">Question 1 of 4</p>` +
        `<h2 class="survey-question">Do you have Telegram installed?</h2>` +
        `<p class="survey-sub">You'll use Telegram to post interested leads after a call.</p>` +
        `<div class="survey-choices" role="group" aria-label="Telegram installed">` +
        `<button type="button" class="survey-choice-btn" data-choice="yes">Yes, I have Telegram</button>` +
        `<button type="button" class="survey-choice-btn secondary" data-choice="no">Not yet — show me how</button>` +
        `</div>` +
        `<div class="survey-help-panel" id="telegram-help" hidden>` +
        `<ol class="survey-help-list">` +
        `<li>Download Telegram on your phone or computer — it's free.</li>` +
        `<li>Create an account with your phone number.</li>` +
        `<li>Come back here when you're ready.</li>` +
        `</ol>` +
        `<a class="link-bold-blue" href="https://telegram.org/" target="_blank" rel="noopener">Get Telegram</a>` +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "telegram-join") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<p class="survey-kicker">Question 2 of 4</p>` +
        `<h2 class="survey-question">Have you joined the team Telegram group?</h2>` +
        `<p class="survey-sub">This is where you share leads after calls. Tap the link, join, then continue.</p>` +
        `<div class="survey-action-block">${telegramTeamLink()}</div>` +
        `</div>`
      );
    }

    if (step.id === "payout-method") {
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<p class="survey-kicker">Question 3 of 4</p>` +
        `<h2 class="survey-question">How do you want to get paid?</h2>` +
        `<p class="survey-sub">Pick the app you use when a deal closes.</p>` +
        `<div class="payout-methods survey-payout-methods" role="group" aria-label="Payout app">` +
        renderMethodButtons(selectedMethod) +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "payout-link") {
      const meta = methodMeta(selectedMethod);
      const label = meta?.fieldLabel || "Paste your payout link";
      const hint = meta?.hint || "";
      const placeholder = meta?.placeholder || "";
      const value =
        savedPayout && savedPayout.method === selectedMethod ? savedPayout.link || "" : "";
      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<p class="survey-kicker">Question 4 of 4</p>` +
        `<h2 class="survey-question">${esc(label)}</h2>` +
        `<p class="survey-sub">${esc(hint)}</p>` +
        `<div class="survey-input-block">` +
        `<input type="text" id="survey-payout-input" class="payout-link-input survey-payout-input" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" value="${esc(value)}" />` +
        `<p id="survey-payout-status" class="payout-status" hidden></p>` +
        `</div>` +
        `</div>`
      );
    }

    if (step.id === "done") {
      const repName = esc(global.RepSession?.get?.()?.name || "you");
      const method = savedPayout?.method ? esc(global.PayoutSetup.methodLabel(savedPayout.method)) : "";
      const link = savedPayout?.link ? esc(savedPayout.link) : "";
      const plain = savedPayout?.method && global.PayoutSetup.isPlainTextMethod(savedPayout.method);
      const payoutRow =
        savedPayout?.link
          ? `<p class="payout-saved-row"><span class="legal-pill">${method}</span> ` +
            (plain
              ? `<span class="payout-saved-text">${link}</span>`
              : `<a class="link-bold-blue" href="${link}" target="_blank" rel="noopener">${link}</a>`) +
            `</p>`
          : `<p class="survey-sub muted">Payout not saved yet — go back to add your details.</p>`;

      return (
        `<div class="survey-step" data-step="${esc(step.id)}">` +
        `<p class="survey-kicker">All done</p>` +
        `<h2 class="survey-question">You're set up, ${repName}!</h2>` +
        `<p class="survey-sub">Check these off on the <a href="checklist.html">setup checklist</a> if you haven't already.</p>` +
        `<div class="survey-done-card card">` +
        `<p class="survey-done-row"><span class="survey-done-check" aria-hidden="true">✓</span> Team Telegram</p>` +
        `<p class="survey-done-row"><span class="survey-done-check" aria-hidden="true">✓</span> Payout method</p>` +
        `<div class="payout-saved-preview survey-done-payout">${payoutRow}</div>` +
        `</div>` +
        `<p class="survey-sub" style="margin-top:16px"><a href="workflow.html" class="btn">Continue to Everyday Tasks →</a></p>` +
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
    const total = 4;
    const q = Math.min(currentStep + 1, total);
    const pct = currentStep >= total ? 100 : ((currentStep / total) * 100);
    if (bar) bar.style.width = pct + "%";
    if (text) {
      text.textContent =
        currentStep >= STEPS.length - 1 ? "Complete" : "Question " + q + " of " + total;
    }
  }

  function updateNav() {
    const back = document.getElementById("survey-back");
    const next = document.getElementById("survey-next");
    const nav = document.getElementById("survey-nav");
    const footer = document.getElementById("step-footer-slot");
    const step = STEPS[currentStep];

    if (footer) footer.hidden = currentStep < STEPS.length - 1;

    if (!nav || !back || !next) return;

    if (step?.id === "done") {
      nav.hidden = true;
      return;
    }

    nav.hidden = false;
    back.hidden = currentStep <= 0;

    if (step?.id === "telegram-app") {
      next.textContent = "Continue";
      next.hidden = false;
      next.disabled = true;
    } else if (step?.id === "telegram-join") {
      next.textContent = "I've joined — continue";
      next.hidden = false;
      next.disabled = false;
    } else if (step?.id === "payout-method") {
      next.hidden = true;
    } else if (step?.id === "payout-link") {
      next.textContent = saving ? "Saving…" : "Save & finish";
      next.hidden = false;
      next.disabled = saving;
    }
  }

  function bindStepEvents() {
    const step = STEPS[currentStep];
    const stage = document.getElementById("survey-stage");
    if (!stage || !step) return;

    if (step.id === "telegram-app") {
      const help = stage.querySelector("#telegram-help");
      const next = document.getElementById("survey-next");
      let answered = false;

      stage.querySelectorAll("[data-choice]").forEach((btn) => {
        btn.addEventListener("click", () => {
          stage.querySelectorAll("[data-choice]").forEach((b) => {
            b.classList.toggle("is-selected", b === btn);
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          if (btn.dataset.choice === "no") {
            if (help) help.hidden = false;
          } else if (help) {
            help.hidden = true;
          }
          answered = true;
          if (next) next.disabled = false;
        });
      });
    }

    if (step.id === "payout-method") {
      stage.querySelectorAll("[data-method]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedMethod = btn.dataset.method;
          goTo(currentStep + 1);
        });
      });
    }

    if (step.id === "payout-link") {
      const input = stage.querySelector("#survey-payout-input");
      input?.focus();
      input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          document.getElementById("survey-next")?.click();
        }
      });
    }
  }

  function renderStep() {
    const stage = document.getElementById("survey-stage");
    if (!stage) return;
    stage.innerHTML = renderStepContent(currentStep);
    stage.classList.remove("survey-step-enter");
    void stage.offsetWidth;
    stage.classList.add("survey-step-enter");
    bindStepEvents();
    updateProgress();
    updateNav();
    saveSurveyStep();
  }

  function goTo(idx) {
    currentStep = Math.max(0, Math.min(idx, STEPS.length - 1));
    renderStep();
  }

  async function savePayoutAndFinish() {
    const input = document.getElementById("survey-payout-input");
    const link = input?.value?.trim() || "";
    if (!selectedMethod) {
      goTo(STEPS.findIndex((s) => s.id === "payout-method"));
      return;
    }
    if (!link) {
      const meta = methodMeta(selectedMethod);
      showPayoutStatus(meta?.hint || "Enter your payout details.", "warn");
      input?.focus();
      return;
    }

    saving = true;
    updateNav();
    showPayoutStatus("Saving…", "");
    try {
      savedPayout = await global.PayoutSetup.saveMine(selectedMethod, link);
      markProgress("payout");
      showPayoutStatus("", "");
      goTo(STEPS.length - 1);
    } catch (e) {
      console.warn(e);
      showPayoutStatus(e.message || "Could not save. Try again.", "err");
    }
    saving = false;
    updateNav();
  }

  function initNav() {
    document.getElementById("survey-back")?.addEventListener("click", () => {
      if (currentStep > 0) goTo(currentStep - 1);
    });

    document.getElementById("survey-next")?.addEventListener("click", () => {
      const step = STEPS[currentStep];
      if (step?.id === "telegram-join") {
        markProgress("telegram");
        goTo(currentStep + 1);
        return;
      }
      if (step?.id === "telegram-app") {
        goTo(currentStep + 1);
        return;
      }
      if (step?.id === "payout-link") {
        savePayoutAndFinish();
      }
    });
  }

  function init() {
    const root = document.getElementById("accounts-survey");
    if (!root) return;

    initNav();

    const run = async () => {
      try {
        savedPayout = (await global.PayoutSetup?.fetchMine?.()) || null;
        if (savedPayout?.method) selectedMethod = savedPayout.method;
      } catch (e) {
        console.warn("Payout load failed", e);
      }
      goTo(loadSurveyStep());
    };

    const start = () => {
      if (global.RepStorage?.whenReady) global.RepStorage.whenReady(run);
      else run();
    };

    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(start);
    else start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
