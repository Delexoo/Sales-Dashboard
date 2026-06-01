/**
 * FAQ — team Q&A below official FAQ (Supabase faq_questions / faq_answers).
 */
(function (global) {
  let client = null;
  let channel = null;

  function cfg() {
    const c = global.SITE_CONFIG || {};
    return {
      url: String(c.supabaseUrl || "").trim(),
      key: String(c.supabaseAnonKey || "").trim(),
      enabled: c.useFaqQa !== false,
    };
  }

  function canUse() {
    const { url, key, enabled } = cfg();
    return enabled && !!(url && key && global.supabase?.createClient);
  }

  function getClient() {
    if (client) return client;
    if (!canUse()) return null;
    const { url, key } = cfg();
    client = global.supabase.createClient(url, key);
    return client;
  }

  function rep() {
    return global.RepSession?.get?.() || null;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "";
    const sec = Math.floor((Date.now() - then.getTime()) / 1000);
    if (sec < 45) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? "1 min ago" : min + " min ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? "1 hr ago" : hr + " hr ago";
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? "1 day ago" : day + " days ago";
    return then.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: then.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  }

  function defaultPhotoUrl() {
    return global.RepProfilePhoto?.DEFAULT_URL || "";
  }

  function photoUrl(repId, repName) {
    const RPP = global.RepProfilePhoto;
    const url =
      (repId && RPP?.urlForRepId && RPP.urlForRepId(repId)) ||
      (repName && RPP?.urlForRepName && RPP.urlForRepName(repName)) ||
      "";
    return url || defaultPhotoUrl();
  }

  async function resolveIdentity() {
    if (global.RepIdentity?.resolveRepIdentity) {
      return global.RepIdentity.resolveRepIdentity();
    }
    const r = rep();
    if (!r?.id) return null;
    return {
      id: r.id,
      name: r.name || r.id,
      photoUrl: photoUrl(r.id, r.name),
    };
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg;
    el.className = "faq-qa-status" + (type ? " faq-qa-status--" + type : "");
  }

  function postHtml(row, opts) {
    opts = opts || {};
    const id = esc(row.rep_id);
    const name = esc(row.rep_name || "Rep");
    const when = esc(formatTimeAgo(row.created_at));
    const body = esc(row.body || "").replace(/\n/g, "<br>");
    const img = esc(photoUrl(row.rep_id, row.rep_name));
    const tag = opts.compact ? "div" : "article";
    return (
      "<" +
      tag +
      ' class="faq-qa-post' +
      (opts.reply ? " faq-qa-post--reply" : "") +
      '">' +
      '<img class="faq-qa-avatar" src="' +
      img +
      '" alt="" width="40" height="40" decoding="async" data-rep-id="' +
      id +
      '">' +
      '<div class="faq-qa-post-main">' +
      '<div class="faq-qa-post-meta">' +
      '<strong class="faq-qa-author">' +
      name +
      "</strong>" +
      (when ? '<time class="faq-qa-time" datetime="' + esc(row.created_at || "") + '">' + when + "</time>" : "") +
      "</div>" +
      '<div class="faq-qa-text">' +
      body +
      "</div>" +
      "</div>" +
      "</" +
      tag +
      ">"
    );
  }

  function renderThread(questions, answersByQ) {
    const list = document.getElementById("faq-qa-list");
    const empty = document.getElementById("faq-qa-empty");
    if (!list) return;

    if (!questions.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    list.innerHTML = questions
      .map((q) => {
        const qid = esc(q.id);
        const answers = answersByQ[q.id] || [];
        const replies =
          answers.length > 0
            ? '<div class="faq-qa-replies" role="list">' +
              answers.map((a) => postHtml(a, { reply: true, compact: true })).join("") +
              "</div>"
            : "";

        return (
          '<article class="faq-qa-thread card" data-question-id="' +
          qid +
          '" role="listitem">' +
          postHtml(q) +
          replies +
          '<form class="faq-qa-reply-form" data-reply-form="' +
          qid +
          '" autocomplete="off">' +
          '<label class="sr-only" for="faq-reply-' +
          qid +
          '">Reply</label>' +
          '<textarea id="faq-reply-' +
          qid +
          '" class="faq-qa-textarea faq-qa-textarea--compact" rows="2" maxlength="4000" placeholder="Write a reply…"></textarea>' +
          '<div class="faq-qa-form-actions">' +
          '<button type="submit" class="btn secondary faq-qa-submit" data-icon="send" data-icon-class="ico-btn">Reply</button>' +
          "</div>" +
          "</form>" +
          "</article>"
        );
      })
      .join("");

    list.querySelectorAll("[data-reply-form]").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const qid = form.getAttribute("data-reply-form");
        const ta = form.querySelector("textarea");
        void submitAnswer(qid, ta, form.querySelector(".faq-qa-submit"));
      });
    });

    if (global.SiteIcons) global.SiteIcons.initIcons(list);
  }

  async function fetchThreads() {
    const sb = getClient();
    if (!sb) return { questions: [], answersByQ: {} };

    const { data: questions, error: qErr } = await sb
      .from("faq_questions")
      .select("id, rep_id, rep_name, body, created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    if (qErr) throw qErr;

    const qList = questions || [];
    if (!qList.length) return { questions: [], answersByQ: {} };

    const ids = qList.map((q) => q.id);
    const { data: answers, error: aErr } = await sb
      .from("faq_answers")
      .select("id, question_id, rep_id, rep_name, body, created_at")
      .in("question_id", ids)
      .order("created_at", { ascending: true });

    if (aErr) throw aErr;

    const answersByQ = {};
    (answers || []).forEach((a) => {
      const key = a.question_id;
      if (!answersByQ[key]) answersByQ[key] = [];
      answersByQ[key].push(a);
    });

    return { questions: qList, answersByQ };
  }

  async function refresh() {
    const list = document.getElementById("faq-qa-list");
    const loading = document.getElementById("faq-qa-loading");
    if (!list) return;

    try {
      if (loading) loading.hidden = false;
      await global.RepProfilePhoto?.refreshTeamPhotos?.();
      const { questions, answersByQ } = await fetchThreads();
      renderThread(questions, answersByQ);
    } catch (e) {
      console.warn("FAQ Q&A load failed", e);
      list.innerHTML =
        '<p class="faq-qa-error muted">Could not load questions. Run <code>supabase-faq-qa-setup.sql</code> in Supabase, then refresh.</p>';
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  async function submitQuestion(textarea, btn) {
    const identity = await resolveIdentity();
    if (!identity?.id) {
      showStatus(document.getElementById("faq-qa-ask-status"), "Sign in with your PIN first.", "err");
      return;
    }

    const body = String(textarea?.value || "").trim();
    if (!body) {
      showStatus(document.getElementById("faq-qa-ask-status"), "Write your question first.", "warn");
      return;
    }

    const sb = getClient();
    if (!sb) {
      showStatus(document.getElementById("faq-qa-ask-status"), "Team Q&A is not configured.", "err");
      return;
    }

    if (btn) btn.disabled = true;
    showStatus(document.getElementById("faq-qa-ask-status"), "Posting…", "");

    try {
      const { error } = await sb.from("faq_questions").insert({
        rep_id: identity.id,
        rep_name: identity.name,
        body,
      });
      if (error) throw error;
      textarea.value = "";
      showStatus(document.getElementById("faq-qa-ask-status"), "Posted!", "ok");
      await refresh();
    } catch (e) {
      console.warn(e);
      showStatus(
        document.getElementById("faq-qa-ask-status"),
        String(e.message || "Could not post. Try again."),
        "err"
      );
    }

    if (btn) btn.disabled = false;
  }

  async function submitAnswer(questionId, textarea, btn) {
    const identity = await resolveIdentity();
    if (!identity?.id) {
      alert("Sign in with your PIN first.");
      return;
    }

    const body = String(textarea?.value || "").trim();
    if (!body) return;

    const sb = getClient();
    if (!sb) return;

    if (btn) btn.disabled = true;

    try {
      const { error } = await sb.from("faq_answers").insert({
        question_id: questionId,
        rep_id: identity.id,
        rep_name: identity.name,
        body,
      });
      if (error) throw error;
      textarea.value = "";
      await refresh();
      const thread = document.querySelector(
        '.faq-qa-thread[data-question-id="' + CSS.escape(questionId) + '"]'
      );
      thread?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      console.warn(e);
      alert(String(e.message || "Could not post reply."));
    }

    if (btn) btn.disabled = false;
  }

  function subscribeRealtime() {
    const sb = getClient();
    if (!sb || channel) return;

    channel = sb
      .channel("faq-qa-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "faq_questions" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "faq_answers" },
        () => refresh()
      )
      .subscribe();
  }

  function initPanel(root) {
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    const askForm = root.querySelector("#faq-qa-ask-form");
    const askTa = root.querySelector("#faq-qa-ask-body");
    if (global.RepIdentity?.whenIdentityReady) {
      global.RepIdentity.whenIdentityReady(() => {});
    }

    if (!canUse()) {
      showStatus(
        document.getElementById("faq-qa-ask-status"),
        "Team Q&A needs Supabase — run supabase-faq-qa-setup.sql in your project.",
        "warn"
      );
      askForm?.querySelectorAll("textarea, button").forEach((el) => {
        el.disabled = true;
      });
      return;
    }

    askForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      void submitQuestion(askTa, askForm.querySelector("#faq-qa-ask-submit"));
    });

    refresh().then(() => subscribeRealtime());
  }

  function init() {
    const root = document.getElementById("faq-qa-panel");
    if (!root) return;

    const run = () => {
      const start = () => initPanel(root);
      if (global.RepStorage?.whenReady) {
        global.RepStorage.whenReady(start);
      } else {
        start();
      }
      if (global.RepStorage?.init) {
        global.RepStorage.init().catch((e) => console.warn("Rep settings init failed", e));
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

  global.FaqQa = { refresh };
})(window);
