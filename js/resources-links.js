/**
 * All links — built from CourseModules + SITE_CONFIG so the table stays current.
 */
(function (global) {
  function cfg() {
    return global.SITE_CONFIG || {};
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortUrl(url) {
    return String(url || "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "");
  }

  function internalRow(name, href, hint) {
    return { kind: "internal", name, href, hint };
  }

  function configRow(name, key, opts) {
    return {
      kind: "config",
      name,
      config: key,
      external: opts?.external !== false,
      short: !!opts?.short,
      hideIfEmpty: !!opts?.hideIfEmpty,
      mailto: key === "email",
      tel: key === "phone",
    };
  }

  function externalRow(name, href, hint) {
    return { kind: "external", name, href, hint };
  }

  function courseRows() {
    const CM = global.CourseModules;
    const rows = [];
    if (CM?.list && CM.href) {
      CM.list().forEach((mod) => {
        rows.push(
          internalRow(
            "Course " + mod.num + " — " + mod.title,
            CM.href(mod),
            mod.duration || ""
          )
        );
      });
    } else {
      [
        ["introduction", "Start Here"],
        ["business", "The Business"],
        ["setup-accounts", "Setup Accounts"],
        ["dashboard", "Platform Tour"],
        ["everyday-tasks", "Everyday Tasks"],
      ].forEach(([id, title], i) => {
        rows.push(
          internalRow(
            "Course " + (i + 1) + " — " + title,
            "course-module.html?m=" + id
          )
        );
      });
    }
    rows.push(
      internalRow("Get started (setup survey)", "setup.html", "PIN + payout setup")
    );
    rows.push(internalRow("Course hub (auto-redirect)", "course.html", "After sign-in"));

    const videos = cfg().courseModuleVideos || {};
    Object.keys(videos).forEach((key) => {
      const url = String(videos[key] || "").trim();
      if (!url) return;
      const mod = CM?.get?.(key);
      const label = mod ? mod.title : key;
      rows.push(externalRow("Course video — " + label, url, "YouTube"));
    });

    const fallback = String(cfg().onboardingVideoUrl || "").trim();
    if (fallback) {
      rows.push({
        kind: "config",
        name: "Course video — legacy fallback",
        config: "onboardingVideoUrl",
        external: true,
        short: true,
        hideIfEmpty: true,
      });
    }

    return rows;
  }

  function buildGroups() {
    const c = cfg();
    return [
      {
        title: "Daily tools",
        links: [
          internalRow("Dashboard", "dashboard.html"),
          internalRow("Lead Finder", "leads.html"),
          internalRow("Lead Finder — Pending list", "leads.html#pending"),
          internalRow("Lead Builder", "template.html"),
          internalRow("Call scripts", "scripts.html"),
          internalRow("Text & email", "outreach.html"),
          internalRow("Setup checklist", "checklist.html"),
        ],
      },
      {
        title: "Course",
        links: courseRows(),
      },
      {
        title: "Help & account",
        links: [
          internalRow("FAQ", "faq.html"),
          internalRow("FAQ — Ask the team", "faq.html", "Team Q&A at top"),
          internalRow("How you get paid", "faq.html#how-you-get-paid"),
          internalRow("Settings", "settings.html", "Name, photo, payout"),
          internalRow("Feedback", "feedback.html"),
          internalRow("Bug Bounty", "bug-bounty.html"),
          internalRow("All links", "resources.html"),
        ],
      },
      {
        title: "Team & owner",
        links: [
          internalRow("Meet the Owner", "owner.html"),
          internalRow("Contributors", "contributors.html"),
          configRow("Interested Businesses (Telegram)", "interestedBusinessesUrl", {
            short: true,
          }),
          configRow("Team Telegram", "telegramTeam", { short: true }),
          configRow(
            (c.payoutTelegramName || "Website Agency") + " (payout Telegram)",
            "payoutTelegramUrl",
            { short: true }
          ),
          configRow("Contributors — Invite / apply", "contributorsShareUrl", {
            short: true,
          }),
          configRow("Owner Telegram", "ownerTelegram", { short: true }),
          configRow("Support Telegram", "supportTelegram", { short: true }),
          externalRow("Owner store", c.ownerStoreUrl),
          externalRow("Book a call (Cal.com)", c.ownerCalUrl),
          configRow("Owner email", "email"),
          configRow("Owner phone", "phone"),
        ],
      },
      {
        title: "Legal",
        links: [
          internalRow("Privacy policy", "privacy.html"),
          internalRow("Terms of service", "terms.html"),
        ],
      },
      {
        title: "Redirects (old bookmarks still work)",
        links: [
          internalRow("accounts.html", "accounts.html", "→ setup.html"),
          internalRow("earnings.html", "earnings.html", "→ FAQ How you get paid"),
          internalRow("everyday-tasks.html", "everyday-tasks.html", "→ Course Everyday Tasks"),
          internalRow("workflow.html", "workflow.html", "→ Course Platform Tour"),
          internalRow("Sign in", "index.html", "PIN gate"),
        ],
      },
    ];
  }

  function renderUrlCell(link) {
    if (link.kind === "internal") {
      const label = esc(link.href);
      return (
        '<a href="' +
        esc(link.href) +
        '">' +
        label +
        "</a>"
      );
    }

    if (link.kind === "external") {
      const href = String(link.href || "").trim();
      if (!href) return '<span class="muted">—</span>';
      return (
        '<a href="' +
        esc(href) +
        '" target="_blank" rel="noopener">' +
        esc(shortUrl(href)) +
        "</a>"
      );
    }

    if (link.kind === "config") {
      const attrs =
        'data-config="' +
        esc(link.config) +
        '" href="#" data-config-text' +
        (link.short ? ' data-config-short' : "") +
        (link.hideIfEmpty ? ' data-config-hide-row' : "");
      const attrMail = link.mailto ? ' data-config-attr="href"' : "";
      const attrTel = link.tel ? ' data-config-attr="href"' : "";
      const target = link.external && !link.mailto && !link.tel
        ? ' target="_blank" rel="noopener"'
        : "";
      return "<a " + attrs + attrMail + attrTel + target + ">—</a>";
    }

    return "";
  }

  function renderNameCell(link) {
    let name = esc(link.name);
    if (link.hint) {
      name += ' <span class="links-table-hint muted">' + esc(link.hint) + "</span>";
    }
    return name;
  }

  function renderGroup(group) {
    const rows = (group.links || []).filter((link) => {
      if (link.kind === "external") return !!String(link.href || "").trim();
      return true;
    });
    if (!rows.length) return "";

    const body = rows
      .map((link) => {
        const configAttr =
          link.kind === "config" && link.config
            ? ' data-config-row="' + esc(link.config) + '"'
            : "";
        return (
          "<tr" +
          configAttr +
          "><td class=\"links-table-name\">" +
          renderNameCell(link) +
          '</td><td class="links-table-url">' +
          renderUrlCell(link) +
          "</td></tr>"
        );
      })
      .join("");

    return (
      '<section class="links-section card">' +
      '<h2 class="links-section-title section-head" data-icon="external-link">' +
      esc(group.title) +
      "</h2>" +
      '<div class="links-table-wrap">' +
      '<table class="links-table">' +
      "<thead><tr><th scope=\"col\">Name</th><th scope=\"col\">URL</th></tr></thead>" +
      "<tbody>" +
      body +
      "</tbody></table></div></section>"
    );
  }

  function render() {
    const root = document.getElementById("resources-links-root");
    if (!root) return;

    const groups = buildGroups();
    root.innerHTML = groups.map(renderGroup).join("");

    if (global.SiteIcons) global.SiteIcons.initIcons(root);

    if (typeof global.initConfigLinks === "function") {
      /* initConfigLinks is inside app.js closure — use document scan via app boot */
    }
    document.querySelectorAll("#resources-links-root [data-config]").forEach((el) => {
      const key = el.dataset.config;
      const val = cfg()[key];
      if (!val) {
        const row =
          el.closest("tr[data-config-row]") ||
          (el.hasAttribute("data-config-hide-row") ? el.closest("tr") : null);
        if (row) row.hidden = true;
        return;
      }
      if (el.hasAttribute("data-config-paragraphs")) {
        return;
      }
      if (el.hasAttribute("data-config-text")) {
        let text = val;
        if (el.hasAttribute("data-config-short")) {
          text = shortUrl(val);
        }
        el.textContent = text;
      }
      if (el.dataset.configAttr) {
        el.setAttribute(el.dataset.configAttr, val);
      } else if (el.tagName === "A") {
        if (key === "email") el.href = "mailto:" + val;
        else if (key === "phone") {
          const digits = String(val).replace(/\D/g, "");
          el.href = digits.length === 10 ? "tel:+1" + digits : "tel:" + digits;
        } else el.href = val;
      }
    });
  }

  function init() {
    if (document.body.dataset.page !== "resources") return;
    render();
    global.addEventListener("rep-settings-ready", render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.ResourcesLinks = { render, buildGroups };
})(window);
