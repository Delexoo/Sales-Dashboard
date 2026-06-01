(function (global) {
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function moduleIdFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get("m") || "";
    } catch (e) {
      return "";
    }
  }

  function hasEmbedSurvey(mod) {
    return !!mod.embedSurvey;
  }

  function hasEmbedEverydayTasks(mod) {
    return !!mod.embedEverydayTasks;
  }

  function hasSplitAside(mod) {
    return hasEmbedSurvey(mod) || hasEmbedEverydayTasks(mod);
  }

  function hasChapters(mod) {
    return mod.chapters && mod.chapters.length > 0;
  }

  function cfg() {
    return global.SITE_CONFIG || {};
  }

  /** Longest labels first when matching transcript text */
  const CHANNEL_LINKS = [
    { label: "Interested Businesses", hrefKey: "interestedBusinessesUrl", external: true, phrase: true },
    { label: "Meet the Owner", href: "owner.html", phrase: true },
    { label: "How you get paid", href: "faq.html#how-you-get-paid", phrase: true },
    { label: "Website Agency", hrefKey: "telegramTeam", external: true, phrase: true },
    { label: "Team Telegram", hrefKey: "telegramTeam", external: true, phrase: true },
    { label: "Setup Accounts", href: "course-module.html?m=setup-accounts", phrase: true },
    { label: "Setup checklist", href: "checklist.html", phrase: true },
    { label: "Everyday Tasks", href: "course-module.html?m=everyday-tasks", phrase: true },
    { label: "Platform Tour", href: "course-module.html?m=dashboard", phrase: true },
    { label: "Lead Finder", href: "leads.html", phrase: true },
    { label: "Lead Builder", href: "template.html", phrase: true },
    { label: "Call Scripts", href: "scripts.html", phrase: true },
    { label: "Call scripts", href: "scripts.html", phrase: true },
    { label: "Text & Email", href: "outreach.html", phrase: true },
    { label: "Text & email", href: "outreach.html", phrase: true },
    { label: "Contributors", href: "contributors.html", phrase: true },
    { label: "Setup Checklist", href: "checklist.html", phrase: true },
    { label: "Bug Bounty", href: "bug-bounty.html", phrase: true },
    { label: "All links", href: "resources.html", phrase: true },
    { label: "Dashboard", href: "dashboard.html" },
    { label: "Settings", href: "settings.html" },
    { label: "Feedback", href: "feedback.html" },
    { label: "FAQ", href: "faq.html" },
    { label: "owner", href: "owner.html", word: true },
  ];

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function channelHref(entry) {
    if (entry.href) return entry.href;
    if (entry.hrefKey) {
      const url = String(cfg()[entry.hrefKey] || "").trim();
      return url || null;
    }
    return null;
  }

  function channelLinkPattern(entry) {
    const label = escapeRegex(entry.label);
    if (entry.phrase) return label;
    if (entry.word) return "\\b" + label + "\\b";
    return "\\b" + label + "\\b";
  }

  function collectChannelMatches(text) {
    const matches = [];
    CHANNEL_LINKS.forEach((entry) => {
      const href = channelHref(entry);
      if (!href) return;
      const re = new RegExp(channelLinkPattern(entry), "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          matched: m[0],
          href,
          external: !!entry.external,
        });
      }
    });
    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - b.start - (a.end - a.start);
    });
    const picked = [];
    let lastEnd = 0;
    matches.forEach((m) => {
      if (m.start < lastEnd) return;
      picked.push(m);
      lastEnd = m.end;
    });
    return picked;
  }

  function linkifyTranscriptText(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const parts = collectChannelMatches(text);
    if (!parts.length) return esc(text);
    let html = "";
    let pos = 0;
    parts.forEach((m) => {
      html += esc(text.slice(pos, m.start));
      const ext = m.external ? ' target="_blank" rel="noopener"' : "";
      html +=
        '<a class="course-channel-chip' +
        (m.external ? " course-channel-chip--external" : "") +
        '" href="' +
        esc(m.href) +
        '"' +
        ext +
        ">" +
        esc(m.matched) +
        "</a>";
      pos = m.end;
    });
    html += esc(text.slice(pos));
    return html;
  }

  function hasSidePanel(mod) {
    return hasChapters(mod) || hasSplitAside(mod);
  }

  function panelToolbarHtml(mod) {
    const tags = [];
    (mod.chapters || []).forEach((ch) => {
      tags.push(
        '<button type="button" class="course-panel-tag" role="tab" data-panel-view="' +
          esc(ch.id) +
          '" aria-controls="course-module-aside" aria-selected="false">' +
          esc(ch.label) +
          "</button>"
      );
    });
    if (!tags.length) return "";
    return (
      '<div class="course-topics-bar">' +
      '<span class="course-topics-label">Chapters</span>' +
      '<div class="course-panel-toolbar" role="tablist" aria-label="Module chapters">' +
      tags.join("") +
      "</div></div>"
    );
  }

  function showFullscreenHint() {
    return global.UserPrefs?.showCourseFullscreenHint?.() !== false;
  }

  function videoFullscreenHintHtml() {
    if (!showFullscreenHint()) return "";
    return (
      '<p class="course-video-fullscreen-hint">' +
      "For the best experience don't watch these videos on fullscreen" +
      "</p>"
    );
  }

  function syncFullscreenHintDom() {
    const group = document.querySelector(".course-module-video-group");
    if (!group) return;
    const existing = group.querySelector(".course-video-fullscreen-hint");
    const html = videoFullscreenHintHtml();
    if (html && !existing) {
      const wrap = group.querySelector(".video-wrap");
      if (wrap) wrap.insertAdjacentHTML("beforebegin", html);
      else group.insertAdjacentHTML("afterbegin", html);
    } else if (!html && existing) {
      existing.remove();
    }
  }

  function bindPrefsListener() {
    if (global.__courseModulePrefsBound) return;
    global.__courseModulePrefsBound = true;
    global.addEventListener("user-prefs-changed", syncFullscreenHintDom);
  }

  function videoBlock(mod) {
    const url = global.CourseModules.videoUrl(mod);
    const toolbar = panelToolbarHtml(mod);
    if (!url) {
      return (
        '<div class="course-module-video-group">' +
        '<div class="course-video-placeholder">' +
        "<p>Video coming soon for this module.</p>" +
        "</div>" +
        toolbar +
        "</div>"
      );
    }
    const embed = global.CourseModules.embedUrl(url);
    return (
      '<div class="course-module-video-group">' +
      videoFullscreenHintHtml() +
      '<div class="video-wrap course-module-video">' +
      '<iframe src="' +
      esc(embed) +
      '" title="' +
      esc(mod.title) +
      '" allowfullscreen></iframe>' +
      "</div>" +
      toolbar +
      "</div>"
    );
  }

  function mediaBlock(mod) {
    return '<div class="course-module-media">' + videoBlock(mod) + "</div>";
  }

  function everydayTasksPanelBlock() {
    return (
      '<aside class="course-module-aside course-module-aside--survey" id="course-module-aside" aria-label="Everyday Tasks steps">' +
      '<div class="course-side-panel course-side-panel--survey course-side-panel--everyday" id="course-side-panel">' +
      '<div class="course-everyday-embed">' +
      '<p class="course-everyday-embed-title">Your daily loop</p>' +
      '<p class="course-everyday-embed-lead muted">Six steps — top to bottom each workday.</p>' +
      '<div class="everyday-tasks-table-wrap course-everyday-table-wrap">' +
      '<table class="everyday-tasks-table course-everyday-table">' +
      "<thead><tr><th scope=\"col\">#</th><th scope=\"col\">Do this</th><th scope=\"col\"></th></tr></thead>" +
      '<tbody id="course-everyday-tasks-body"></tbody>' +
      "</table></div></div></div></aside>"
    );
  }

  function surveyPanelBlock() {
    return (
      '<aside class="course-module-aside course-module-aside--survey" id="course-module-aside" aria-label="Account setup">' +
      '<div class="course-side-panel course-side-panel--survey" id="course-side-panel">' +
      '<div id="accounts-survey" class="accounts-survey accounts-survey--embedded">' +
      '<header class="survey-progress-wrap">' +
      '<div class="survey-progress-top">' +
      '<p class="survey-progress-text" id="survey-progress-text">Step 1 of 4</p>' +
      '<div class="survey-progress-actions">' +
      '<button type="button" class="survey-back" id="survey-back" title="Previous step" aria-label="Previous step">Back</button>' +
      '<button type="button" class="survey-restart" id="survey-restart" title="Start over" aria-label="Restart survey">Restart</button>' +
      "</div></div>" +
      '<div class="survey-progress-track" aria-hidden="true">' +
      '<div class="survey-progress-bar" id="survey-progress-bar"></div>' +
      "</div></header>" +
      '<div id="survey-stage" class="survey-stage" aria-live="polite"></div>' +
      "</div>" +
      "</div>" +
      "</aside>"
    );
  }

  function sidePanelBlock() {
    return (
      '<aside class="course-module-aside" id="course-module-aside" aria-hidden="true">' +
      '<div class="course-side-panel" id="course-side-panel">' +
      '<button type="button" class="course-panel-close" id="course-panel-close" ' +
      'aria-label="Close chapter" title="Close" hidden>&times;</button>' +
      '<div class="course-panel-scroll course-panel-body" id="course-panel-body" aria-live="polite"></div>' +
      '<nav class="course-chapter-nav survey-choices--proceed" id="course-chapter-nav" aria-label="Chapter navigation" hidden></nav>' +
      "</div>" +
      "</aside>"
    );
  }

  function chapterNavHtml(mod, chapterId) {
    const chapters = mod.chapters || [];
    const idx = chapters.findIndex((c) => c.id === chapterId);
    if (idx < 0) return "";

    const prev = idx > 0 ? chapters[idx - 1] : null;
    const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
    const prevDisabled = !prev;

    const prevBtn =
      '<button type="button" class="survey-choice-btn survey-proceed-btn course-chapter-nav-prev' +
      (prevDisabled ? " is-disabled" : "") +
      '"' +
      (prev ? ' data-chapter-nav="' + esc(prev.id) + '"' : "") +
      (prevDisabled ? ' disabled aria-disabled="true"' : "") +
      ">" +
      '<span class="survey-proceed-arrow" aria-hidden="true">←</span>' +
      '<span class="survey-proceed-label">Previous</span>' +
      "</button>";

    const nextBtn = next
      ? '<button type="button" class="survey-choice-btn survey-proceed-btn course-chapter-nav-next" data-chapter-nav="' +
        esc(next.id) +
        '">' +
        '<span class="survey-proceed-label">Next</span>' +
        '<span class="survey-proceed-arrow" aria-hidden="true">→</span>' +
        "</button>"
      : '<button type="button" class="survey-choice-btn survey-proceed-btn course-chapter-nav-next course-chapter-nav-done" data-chapter-done>' +
        '<span class="survey-proceed-label">Done!</span>' +
        '<span class="survey-proceed-arrow" aria-hidden="true">✓</span>' +
        "</button>";

    return prevBtn + nextBtn;
  }

  function asideBlock(mod) {
    if (hasEmbedSurvey(mod)) return surveyPanelBlock();
    if (hasEmbedEverydayTasks(mod)) return everydayTasksPanelBlock();
    if (hasChapters(mod)) return sidePanelBlock();
    return "";
  }

  function parseBodyLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return null;
    const qa = trimmed.match(/^Q:\s*(.+?)\s*A:\s*(.+)$/i);
    if (qa) return { type: "qa", q: qa[1], a: qa[2] };
    const step = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (step) return { type: "step", num: step[1], text: step[2] };
    const row = trimmed.match(/^([^—–-]+)\s*[—–]\s*(.+)$/);
    if (row && row[1].length < 52) {
      return { type: "row", label: row[1].trim(), text: row[2].trim() };
    }
    if (trimmed.includes(" → ")) return { type: "path", text: trimmed };
    return { type: "prose", text: trimmed };
  }

  function renderBodyItem(item) {
    if (!item) return "";
    if (item.type === "qa") {
      return (
        '<div class="course-chapter-faq-item">' +
        '<p class="course-chapter-faq-q">' +
        esc(item.q) +
        "</p>" +
        '<p class="course-chapter-faq-a">' +
        esc(item.a) +
        "</p></div>"
      );
    }
    if (item.type === "step") {
      return (
        '<li class="course-chapter-step">' +
        '<span class="course-chapter-step-num" aria-hidden="true">' +
        esc(item.num) +
        "</span>" +
        '<span class="course-chapter-step-text">' +
        esc(item.text) +
        "</span></li>"
      );
    }
    if (item.type === "row") {
      return (
        '<div class="course-chapter-row">' +
        '<span class="course-chapter-row-label">' +
        esc(item.label) +
        "</span>" +
        '<p class="course-chapter-row-text">' +
        esc(item.text) +
        "</p></div>"
      );
    }
    if (item.type === "path") {
      return '<p class="course-chapter-path">' + esc(item.text) + "</p>";
    }
    return '<p class="course-chapter-prose">' + esc(item.text) + "</p>";
  }

  function bodyBlocksHtml(items) {
    let html = "";
    let stepBuffer = [];
    function flushSteps() {
      if (!stepBuffer.length) return;
      html += '<ol class="course-chapter-steps">' + stepBuffer.join("") + "</ol>";
      stepBuffer = [];
    }
    items.forEach((item) => {
      if (item.type === "step") {
        stepBuffer.push(renderBodyItem(item));
      } else {
        flushSteps();
        html += renderBodyItem(item);
      }
    });
    flushSteps();
    return '<div class="course-chapter-blocks">' + html + "</div>";
  }

  function chapterTranscriptHtml(chapter) {
    const paras = (chapter.body || [])
      .map(
        (line) =>
          '<p class="course-chapter-transcript-p">' + linkifyTranscriptText(line) + "</p>"
      )
      .join("");
    return '<div class="course-chapter-transcript">' + paras + "</div>";
  }

  function chapterHtml(chapter) {
    if (chapter.transcript) {
      return chapterTranscriptHtml(chapter);
    }
    const items = (chapter.body || []).map(parseBodyLine).filter(Boolean);
    const title = chapter.title || chapter.label || "Chapter";
    const kicker =
      chapter.label && chapter.label !== chapter.title ? chapter.label : "Chapter";
    const cta = chapter.cta
      ? '<footer class="course-chapter-footer">' +
        '<a class="btn course-chapter-cta" href="' +
        esc(chapter.cta.href) +
        '">' +
        esc(chapter.cta.label) +
        "</a></footer>"
      : "";
    return (
      '<article class="course-chapter-article">' +
      '<header class="course-chapter-header">' +
      '<p class="course-chapter-kicker">' +
      esc(kicker) +
      "</p>" +
      '<h3 class="course-chapter-heading">' +
      esc(title) +
      "</h3>" +
      "</header>" +
      bodyBlocksHtml(items) +
      cta +
      "</article>"
    );
  }

  function navBlock(mod) {
    const prev = global.CourseModules.prevModule(mod.id);
    const next = global.CourseModules.nextModule(mod.id);
    const prevLink = prev
      ? '<a class="btn secondary course-module-prev" href="' +
        esc(global.CourseModules.href(prev)) +
        '">Previous</a>'
      : "";
    const nextHref = next ? global.CourseModules.href(next) : "dashboard.html";
    const nextLabel = next ? "Next" : "Finish";
    return (
      '<nav class="course-module-nav" aria-label="Module navigation">' +
      prevLink +
      '<a class="btn course-module-next" href="' +
      esc(nextHref) +
      '">' +
      nextLabel +
      "</a>" +
      "</nav>"
    );
  }

  function renderNotFound() {
    const root = document.getElementById("course-module-root");
    if (!root) return;
    const first = global.CourseModules?.firstModule?.();
    const link = first
      ? global.CourseModules.href(first)
      : "course-module.html?m=introduction";
    root.innerHTML =
      '<div class="card"><h1>Module not found</h1>' +
      '<p class="lead"><a href="' +
      esc(link) +
      '">Back to Course</a></p></div>';
  }

  function bindModuleNav(mod) {
    const nextBtn = document.querySelector(".course-module-next");
    if (!nextBtn || nextBtn.dataset.checklistBound === "1") return;
    nextBtn.dataset.checklistBound = "1";
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const href = nextBtn.getAttribute("href");
      const go = () => {
        if (href) window.location.assign(href);
      };
      const progress = global.LpcOnboarding?.loadProgress?.() || {};
      const canMark =
        !mod.progressKeys?.length || global.CourseModules?.isComplete?.(mod, progress);
      const mark = canMark
        ? global.LpcOnboarding?.markCourseModuleComplete?.(mod)
        : Promise.resolve();
      Promise.resolve(mark)
        .then(go)
        .catch((err) => {
          console.warn("Could not save course progress before next module", err);
          go();
        });
    });
  }

  function bindSidePanel(mod) {
    const layout = document.getElementById("course-module-layout");
    const aside = document.getElementById("course-module-aside");
    const bodyEl = document.getElementById("course-panel-body");
    const navEl = document.getElementById("course-chapter-nav");
    const closeBtn = document.getElementById("course-panel-close");
    const tags = document.querySelectorAll(".course-panel-tag");

    if (!layout || !aside || !bodyEl || !navEl || !tags.length) return;

    let open = false;
    let activeView = null;

    function updateTags() {
      tags.forEach((btn) => {
        const view = btn.getAttribute("data-panel-view");
        const isActive = open && activeView === view;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-expanded", isActive ? "true" : "false");
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    function renderPanelContent(view) {
      const chapter = global.CourseModules.chapterById(mod, view);
      if (!chapter) return;
      bodyEl.innerHTML = chapterHtml(chapter);
      navEl.innerHTML = chapterNavHtml(mod, view);
      navEl.hidden = false;
    }

    function bindChapterNavButtons() {
      navEl.querySelector("[data-chapter-done]")?.addEventListener("click", () => {
        setOpen(false, null);
      });
      navEl.querySelectorAll("[data-chapter-nav]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          const target = btn.getAttribute("data-chapter-nav");
          if (target) setOpen(true, target);
        });
      });
    }

    function setOpen(nextOpen, view) {
      if (nextOpen && !view) return;

      open = nextOpen;
      activeView = open ? view : null;

      layout.classList.toggle("course-module-layout--panel-open", open);
      aside.setAttribute("aria-hidden", open ? "false" : "true");
      if (closeBtn) closeBtn.hidden = !open;
      updateTags();

      if (open) {
        renderPanelContent(activeView);
        bindChapterNavButtons();
        const panelContent = bodyEl.querySelector(".course-chapter-article, .course-chapter-transcript");
        if (panelContent) {
          panelContent.classList.remove("is-entering");
          void panelContent.offsetWidth;
          panelContent.classList.add("is-entering");
        }
        bodyEl.scrollTop = 0;
      } else {
        navEl.hidden = true;
        navEl.innerHTML = "";
      }
    }

    tags.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-panel-view");
        if (!view) return;
        if (open && activeView === view) {
          setOpen(false, null);
          return;
        }
        setOpen(true, view);
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", () => setOpen(false, null));
    }
  }

  function render() {
    const root = document.getElementById("course-module-root");
    if (!root || !global.CourseModules) return;

    const id = moduleIdFromUrl();
    const mod = global.CourseModules.get(id);
    if (!mod) {
      renderNotFound();
      return;
    }

    root.innerHTML =
      '<div class="course-module-header">' +
      '<span class="step-pill">Module ' +
      mod.num +
      " of " +
      global.CourseModules.list().length +
      "</span>" +
      "</div>" +
      "<h1>" +
      esc(mod.title) +
      "</h1>" +
      '<article class="card course-module-shell">' +
      '<div class="course-module-layout' +
      (hasSplitAside(mod) ? " course-module-layout--survey" : "") +
      '" id="course-module-layout">' +
      '<div class="course-module-main">' +
      mediaBlock(mod) +
      "</div>" +
      asideBlock(mod) +
      "</div>" +
      navBlock(mod) +
      "</article>";

    if (hasChapters(mod)) bindSidePanel(mod);
    bindModuleNav(mod);
    if (hasEmbedSurvey(mod)) {
      if (global.AccountsSurvey?.mount) {
        global.AccountsSurvey.mount().catch((e) => console.warn("Embedded survey mount failed", e));
      } else if (global.AccountsSurvey?.init) {
        global.AccountsSurvey.init();
      }
    }
    if (hasEmbedEverydayTasks(mod) && global.EverydayTasks?.renderInto) {
      global.EverydayTasks.renderInto(
        document.getElementById("course-everyday-tasks-body")
      );
      global.LpcOnboarding?.touchProgressKeys?.(["everyday_tasks"]);
    }
    if (global.SiteIcons) global.SiteIcons.initIcons();
    syncFullscreenHintDom();
  }

  function init() {
    bindPrefsListener();
    const id = moduleIdFromUrl();
    if (id === "faq" || id === "rules") {
      window.location.replace("faq.html");
      return;
    }
    const run = () => render();
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(run);
    else run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
