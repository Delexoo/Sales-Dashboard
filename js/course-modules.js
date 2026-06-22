/**
 * Course — 6 modules. Chapters open in the side panel; setup-accounts, preferences, and everyday-tasks use split layouts.
 * Videos: SITE_CONFIG.courseModuleVideos { introduction, business, setup-accounts, preferences, dashboard, everyday-tasks }
 * FAQ lives at faq.html under Help.
 */
(function (global) {
  const MODULES = [
    {
      id: "introduction",
      num: 1,
      title: "Start Here",
      summary:
        "You're hired on the official Website Agency Sales Team. Watch the video, use the chapters below, then move to the next module.",
      duration: "~3 min",
      progressKey: "module_introduction",
      alsoProgress: ["module_welcome", "module_start", "module_progress"],
      chapters: [
        {
          id: "welcome",
          label: "Welcome",
          title: "Welcome",
          transcript: true,
          body: [
            "Welcome to the Sales Team!",
            "This training will guide you through everything you need to know, from using the platform to closing your first deal. Please take your time, follow each step, and avoid skipping lessons to get the most out of the training.",
          ],
        },
        {
          id: "platform-overview",
          label: "Platform Overview",
          title: "Platform Overview",
          transcript: true,
          body: [
            "This platform was designed to be as convenient and interactive as possible. Below each video, you'll find {{Welcome}}, {{Platform Overview}}, and {{Recommendations}} that open a summary of each section, allowing you to quickly review important information without rewatching the entire video.",
            "You can use {{btn-prev}} and {{btn-next}} to navigate between chapters and {{btn-exit}} to leave chapter view at any time.",
            "You'll also see the current chapter, summary, and duration displayed directly within the video. This allows you to follow along by reading the key points while watching, making it easier to stay on track and review information whenever needed.",
          ],
        },
        {
          id: "recommendations",
          label: "Recommendations",
          title: "Recommendations",
          transcript: true,
          body: [
            "For the best experience, I recommend using a computer while going through this platform, although all features will still work on other devices.",
            "When you're ready, click the black \"Next\" button below to continue to the next video. See you there!",
          ],
        },
      ],
    },
    {
      id: "business",
      num: 2,
      title: "The Business",
      summary:
        "The problem we solve, what we sell, your role as a cold caller, how deals flow, pay, expectations, and team policy.",
      duration: "~7 min",
      progressKey: "module_business",
      alsoProgress: [
        "module_what_we_do",
        "module_who_we_help",
        "module_how_we_operate",
        "module_job",
        "module_offer",
        "module_team",
        "module_pay",
        "video",
        "earnings",
      ],
      chapters: [
        {
          id: "who-we-are",
          label: "Who are we",
          title: "Who are we",
          transcript: true,
          body: [
            "I'm Delexo. I build and sell websites to local businesses.",
            "It is 2026. A lot of plumbers, salons, restaurants, house cleaners, chiropractors, and contractors still have no real website — and they are losing clients because of it.",
            "Without a site they do not look professional. Customers cannot find them online, see what they offer, book, or contact them easily.",
            "A website is the best first impression for a business. That is the problem we solve.",
            "We go after owner-run local businesses with no site or a weak one. Skip strong sites, big chains, and anyone who cannot say yes.",
          ],
        },
        {
          id: "what-we-sell",
          label: "What do we sell",
          title: "What do we sell",
          transcript: true,
          body: [
            "I build them a free demo website first so they can see what they are missing. If they want to go live, you quote one of our tiers on the call.",
            "Four tiers by business size: $500 upfront plus $5 a month, $700 plus $20 a month, $1,000 plus $10 a month, or $1,500 upfront plus $10 a month. You pick the price that fits the business — they do not choose the package themselves.",
            "Most agencies charge thousands to six figures for a high-end site. Our rates are much lower, which makes this an easy yes for owners.",
            "Direct Link means demo plus pay-by-text. Booking means demo plus a meeting. Ask which delivery they want — do not pick that for them.",
          ],
        },
        {
          id: "your-role",
          label: "Your role",
          title: "Your role",
          transcript: true,
          body: [
            "You are a cold caller — the first point of contact.",
            "Your job is to call local businesses that already do not have a website, get them interested in the free demo, quote the right tier for their size, and pass qualified leads to us.",
            "You are not a web designer, developer, or account manager. You focus on the conversation.",
            "We handle the build, bookings, client texts, payment, delivery, and everything after you hand off a real lead.",
            "I cannot personally handle every lead at once. That is why the sales team exists.",
          ],
        },
        {
          id: "how-it-works",
          label: "How it works",
          title: "How it works",
          transcript: true,
          body: [
            "Pick a business, call them, and offer the free website demo.",
            "If they are interested, collect the details we need — including the tier you quoted — and send the lead to us. You do not send the demo link yourself.",
            "After you forward a qualified lead, we build and deploy the demo, text the client their site, book meetings when needed, handle revisions, and confirm payment when the deal closes.",
            "Then you are done with that lead — move on to the next call. If they said no, thank them and keep dialing.",
            "No client payment means no commission for you.",
          ],
        },
        {
          id: "how-you-get-paid",
          label: "How you get paid",
          title: "How you get paid",
          transcript: true,
          body: [
            "You earn 40% of the upfront payment when the client pays — not the monthly fee. Monthly covers hosting and subscriptions on our side.",
            "$1,500 sale pays you $600. $1,000 pays $400. $700 pays $280. $500 pays $200.",
            "You are not paid when you forward a lead or hear maybe on the phone. You are paid after the client pays upfront. I will notify you when a deal closes.",
          ],
        },
        {
          id: "what-to-expect",
          label: "What to expect",
          title: "What to expect",
          transcript: true,
          body: [
            "Enter at your own risk. There is no hourly pay — you get paid when a sale closes, not for time on the phone.",
            "That also means you can put in many hours calling and still not close a deal yet. No boss is docking your check, but your time is on the line until someone pays.",
            "The other side is real too: you might spend five hours on the phone, close one sale, and that commission can more than pay for the time you put in.",
            "On the upside, there is no penalty, quota, or money lost if you have zero closes so far. You are not buying inventory or paying us to work here.",
            "Cold calling is a real skill. Beginners often dial for a long time before the first commission. Rejection is normal — it does not mean you are failing.",
            "Making your first call is already a big step. Most people never try because they are scared.",
            "Every call makes you better. If you are new, do not quit too early — but go in with your eyes open about how pay works.",
          ],
        },
        {
          id: "policies",
          label: "Policies",
          title: "Policies",
          transcript: true,
          body: [
            "Team policy: every deal you personally close pays you the full 40% commission. No team fees, splits, hidden cuts, or deductions from your own sale.",
            "If you closed it, the 40% is yours.",
            "Owner policy: on deals I close myself, I may split profit evenly among active sales teammates — reps who are consistently calling and participating.",
            "That split rewards effort and fairness. It only applies to deals I close, not yours.",
          ],
        },
      ],
    },
    {
      id: "setup-accounts",
      num: 3,
      title: "Setup Accounts",
      summary:
        "Watch the walkthrough, then complete the setup survey on the right. Add Telegram and payout before you dial.",
      duration: "~3 min",
      progressKey: "module_setup_accounts",
      alsoProgress: ["module_setup"],
      progressKeys: ["telegram", "payout", "surveyComplete"],
      embedSurvey: true,
    },
    {
      id: "preferences",
      num: 4,
      title: "Preferences",
      summary:
        "Choose your theme, set your nickname, and add a profile photo so the dashboard feels like yours.",
      duration: "~3 min",
      progressKey: "module_preferences",
      progressKeys: ["preferencesComplete"],
      alsoProgress: ["preferences"],
      embedPreferencesSurvey: true,
    },
    {
      id: "dashboard",
      num: 5,
      title: "Platform Tour",
      summary:
        "Quick tour of each sidebar page — what it’s for and when to open it.",
      duration: "~6 min",
      progressKey: "module_dashboard",
      alsoProgress: [
        "workflow",
        "module_leads",
        "module_calling",
        "module_resources",
        "module_lead_format",
        "module_outreach",
        "leads",
        "script",
        "template",
        "outreach",
        "checklist",
      ],
      chapters: [
        {
          id: "dashboard-home",
          label: "Dashboard",
          title: "Dashboard",
          transcript: true,
          body: [
            "The Dashboard is your home base. Here you can access quick links, set income goals, track your commissions and sales, monitor successful deals, and view your overall progress in one place.",
          ],
        },
        {
          id: "lead-finder",
          label: "Lead Finder",
          title: "Lead Finder",
          transcript: true,
          body: [
            "Lead Finder helps you quickly find local businesses that need a website. Open Lead Finder to see available businesses, and use filters to sort businesses with or without websites.",
            "You can organize leads by marking them as Complete, Pending, Pinned, Liked (Quick Save), or Removed.",
            "The best feature is Auto-Fill. With one click, business details are sent into Lead Builder with much of the information already filled in, saving you time and reducing manual work. Depending on the number of reviews, it also auto-selects the website price — you can always change it.",
          ],
        },
        {
          id: "call-scripts",
          label: "Call Scripts",
          title: "Call Scripts",
          transcript: true,
          body: [
            "Call Scripts are straightforward: choose a script to use on a call, edit them to your liking, and your changes save automatically to your account.",
          ],
        },
        {
          id: "lead-builder",
          label: "Lead Builder",
          title: "Lead Builder",
          transcript: true,
          body: [
            "When a business owner is interested in getting a website, fill out the details in Lead Builder. When you are done, paste everything into the Interested Businesses channel on Telegram.",
          ],
        },
        {
          id: "text-email",
          label: "Text & Email",
          title: "Text & Email",
          transcript: true,
          body: [
            "Here you will find brief templates for outreach and short follow-ups.",
          ],
        },
        {
          id: "setup-checklist",
          label: "Setup Checklist",
          title: "Setup Checklist",
          transcript: true,
          body: [
            "Double-check that everything is completed and ready to go before your first call.",
          ],
        },
        {
          id: "meet-owner",
          label: "Meet the Owner",
          title: "Meet the Owner",
          transcript: true,
          body: [
            "This is Delexo, the owner. You can always contact Delexo if you have technical issues, questions, or concerns.",
          ],
        },
        {
          id: "contributors",
          label: "Contributors",
          title: "Contributors",
          transcript: true,
          body: [
            "View the sales team and each member's status — hours online, commissions, and sales.",
          ],
        },
        {
          id: "settings",
          label: "Settings",
          title: "Settings",
          transcript: true,
          body: [
            "Change your name, profile picture, payout method, and appearance. Sign out when you are done for the day.",
          ],
        },
        {
          id: "faq",
          label: "FAQ",
          title: "FAQ",
          transcript: true,
          body: [
            "Frequently asked questions about day-to-day work, pricing, Telegram, and how you get paid.",
          ],
        },
        {
          id: "all-links",
          label: "All Links",
          title: "All Links",
          transcript: true,
          body: [
            "Access all available links on the website in one place — pages, course modules, and team Telegram channels.",
          ],
        },
        {
          id: "feedback",
          label: "Feedback",
          title: "Feedback",
          transcript: true,
          body: [
            "Share ideas to improve the platform, workflow, and features. Not for bugs — use Bug Bounty for anything broken.",
          ],
        },
        {
          id: "bug-bounty",
          label: "Bug Bounty",
          title: "Bug Bounty",
          transcript: true,
          body: [
            "Get paid if you find a bug on our website or system. Describe what you clicked, what you expected, and what happened instead.",
          ],
        },
      ],
    },
    {
      id: "everyday-tasks",
      num: 6,
      title: "Everyday Tasks",
      summary:
        "What you do every workday to close deals. Watch the demo, then follow the six steps on the right each day.",
      duration: "~5 min",
      progressKey: "module_everyday_tasks",
      alsoProgress: ["everyday_tasks", "daily", "workflow"],
      embedEverydayTasks: true,
    },
  ];

  function cfg() {
    return global.SITE_CONFIG || {};
  }

  function list() {
    return MODULES.slice();
  }

  function get(id) {
    const aliases = {
      welcome: "introduction",
      start: "introduction",
      progress: "introduction",
      "the-business": "business",
      "what-we-do": "business",
      "who-we-help": "business",
      "how-we-operate": "business",
      job: "business",
      offer: "business",
      team: "business",
      pay: "business",
      setup: "setup-accounts",
      prefs: "preferences",
      settings: "preferences",
      tour: "dashboard",
      daily: "everyday-tasks",
      everyday: "everyday-tasks",
      workflow: "everyday-tasks",
      resources: "dashboard",
      leads: "dashboard",
      calling: "dashboard",
      "lead-format": "dashboard",
      outreach: "dashboard",
    };
    const resolved = aliases[id] || id;
    return MODULES.find((m) => m.id === resolved) || null;
  }

  function firstModule() {
    return MODULES[0] || null;
  }

  function href(mod) {
    if (!mod) {
      const first = firstModule();
      return first ? href(first) : "course-module.html?m=introduction";
    }
    if (mod.href) return mod.href;
    return "course-module.html?m=" + encodeURIComponent(mod.id);
  }

  function videoUrl(mod) {
    if (!mod || mod.type === "interactive") return "";
    const overrides = cfg().courseModuleVideos || {};
    if (overrides[mod.id]) return String(overrides[mod.id]).trim();
    if (mod.videoUrl) return String(mod.videoUrl).trim();
    return String(cfg().onboardingVideoUrl || "").trim();
  }

  function embedUrl(url) {
    if (!url) return "";
    if (url.includes("youtube.com/watch")) {
      try {
        const id = new URL(url).searchParams.get("v");
        if (id) return "https://www.youtube.com/embed/" + id;
      } catch (e) {
        /* ignore */
      }
    }
    if (url.includes("youtu.be/")) {
      return "https://www.youtube.com/embed/" + url.split("youtu.be/")[1].split("?")[0];
    }
    return url;
  }

  function chapterById(mod, chapterId) {
    if (!mod?.chapters) return null;
    let resolved = chapterId;
    if (resolved === "additional-info") resolved = "recommendations";
    if (resolved === "tips-tricks") resolved = "platform-overview";
    return mod.chapters.find((c) => c.id === resolved) || null;
  }

  function isComplete(mod, progress) {
    if (!mod || !progress) return false;
    if (mod.embedSurvey) {
      if (!mod.progressKeys?.length) return !!progress[mod.progressKey];
      return mod.progressKeys.every((k) => progress[k]);
    }
    if (mod.progressKeys?.length) return mod.progressKeys.every((k) => progress[k]);
    if (mod.progressKey) return !!progress[mod.progressKey];
    return false;
  }

  /** Drop stale module flags when survey prerequisites were never finished. */
  function reconcileProgress(progress) {
    if (!progress || typeof progress !== "object") return {};
    const next = { ...progress };
    MODULES.forEach((mod) => {
      if (!mod.embedSurvey || !mod.progressKey || !next[mod.progressKey]) return;
      const ready = mod.progressKeys?.length
        ? mod.progressKeys.every((k) => next[k])
        : true;
      if (ready) return;
      delete next[mod.progressKey];
      if (mod.alsoProgress) mod.alsoProgress.forEach((k) => delete next[k]);
    });
    return next;
  }

  function markComplete(mod, progress) {
    if (!mod) return progress;
    const next = { ...progress };
    if (mod.progressKeys?.length) {
      const ready = mod.progressKeys.every((k) => next[k]);
      if (!ready) return next;
    }
    if (mod.progressKey) next[mod.progressKey] = true;
    if (mod.alsoProgress) mod.alsoProgress.forEach((k) => (next[k] = true));
    return next;
  }

  function completedCount(progress) {
    return MODULES.filter((m) => isComplete(m, progress)).length;
  }

  function nextModule(id) {
    const idx = MODULES.findIndex((m) => m.id === id);
    return idx >= 0 && idx < MODULES.length - 1 ? MODULES[idx + 1] : null;
  }

  function prevModule(id) {
    const idx = MODULES.findIndex((m) => m.id === id);
    return idx > 0 ? MODULES[idx - 1] : null;
  }

  function firstIncomplete(progress) {
    return MODULES.find((m) => !isComplete(m, progress)) || null;
  }

  function allComplete(progress) {
    return MODULES.length > 0 && MODULES.every((m) => isComplete(m, progress));
  }

  function loginLandingUrl(progress) {
    if (allComplete(progress)) return "dashboard.html";
    const inc = firstIncomplete(progress);
    return inc ? href(inc) : "course-module.html?m=introduction";
  }

  global.CourseModules = {
    list,
    get,
    firstModule,
    href,
    videoUrl,
    embedUrl,
    chapterById,
    isComplete,
    reconcileProgress,
    markComplete,
    completedCount,
    nextModule,
    prevModule,
    firstIncomplete,
    allComplete,
    loginLandingUrl,
  };
})(window);
