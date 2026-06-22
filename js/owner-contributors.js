(function (global) {
  const META_KEY = "lpc_rep_session_meta_v1";
  const TRACKER_KEYS = ["lpc_sales_tracker_v2", "lpc_sales_tracker_v1"];

  let lastOnlineByName = {};
  let repProfiles = {};
  let repStatsByKey = {};

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let contributorStatsReady = false;

  function formatMoney(n) {
    return Math.round(Number(n) || 0).toLocaleString();
  }

  function saleCountLabel(n) {
    const count = Number(n) || 0;
    return count === 1 ? "1 sale" : count + " sales";
  }

  function formatLifetimeHours(ms) {
    const hours = (Number(ms) || 0) / (1000 * 60 * 60);
    if (hours < 0.05) return "0 hrs";
    if (hours < 10) return hours.toFixed(1) + " hrs";
    return Math.round(hours).toLocaleString() + " hrs";
  }

  function defaultStats() {
    return { sales: 0, earned: 0, activeMs: 0 };
  }

  function contributorList() {
    const raw = global.SITE_CONFIG?.contributors;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => {
        if (typeof entry === "string") {
          const token = entry.trim();
          const hit = repProfiles[token.toLowerCase()];
          return hit || { id: token.toLowerCase(), name: token };
        }
        if (entry && typeof entry === "object") {
          const token = String(entry.id || entry.name || "").trim();
          const hit = repProfiles[token.toLowerCase()];
          return (
            hit || {
              id: String(entry.id || entry.name || "").trim().toLowerCase(),
              name: String(entry.name || entry.id || "").trim(),
            }
          );
        }
        return null;
      })
      .filter((entry) => entry && entry.name);
  }

  function photoUrl(person) {
    const RPP = global.RepProfilePhoto;
    return (
      (person?.id && RPP?.urlForRepId && RPP.urlForRepId(person.id)) ||
      (RPP?.urlForRepName && RPP.urlForRepName(person.name)) ||
      RPP?.DEFAULT_URL ||
      ""
    );
  }

  function verifiedContributorKeys() {
    const raw = global.SITE_CONFIG?.contributorsVerified;
    if (!Array.isArray(raw)) return new Set();
    return new Set(
      raw
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter(Boolean)
    );
  }

  function isVerifiedContributor(person) {
    const keys = verifiedContributorKeys();
    if (!keys.size) return false;
    return personKeys(person).some((key) => keys.has(key));
  }

  function contributorCustomRoleFor(person) {
    const roles = global.SITE_CONFIG?.contributorsRoles;
    if (!roles || typeof roles !== "object") return "";
    for (const key of personKeys(person)) {
      for (const [name, role] of Object.entries(roles)) {
        if (String(name).trim().toLowerCase() === key) {
          return String(role || "").trim();
        }
      }
    }
    return "";
  }

  function contributorRoleFor(person) {
    const custom = contributorCustomRoleFor(person);
    if (custom) return custom;
    return String(global.SITE_CONFIG?.contributorsDefaultRole || "Sales Representative").trim();
  }

  function tooltipTitleHtml(person) {
    const role = contributorRoleFor(person);
    let html = escapeHtml(person.name);
    if (role) {
      const accent = contributorCustomRoleFor(person);
      html +=
        ' <span class="owner-contributor-tooltip-role' +
        (accent ? " owner-contributor-tooltip-role--accent" : "") +
        '">(' +
        escapeHtml(role) +
        ")</span>";
    }
    return html;
  }

  function contributorPhotoHtml(url, person) {
    const img =
      '<img class="owner-contributor-photo" src="' +
      escapeHtml(url) +
      '" alt="" width="72" height="72" decoding="async">';
    const badgeUrl = String(global.SITE_CONFIG?.contributorsVerifiedBadgeUrl || "").trim();
    if (!badgeUrl || !isVerifiedContributor(person)) return img;
    return (
      '<span class="owner-contributor-photo-wrap">' +
      img +
      '<img class="owner-contributor-verified-badge" src="' +
      escapeHtml(badgeUrl) +
      '" alt="" width="22" height="22" decoding="async" aria-hidden="true">' +
      "</span>"
    );
  }

  function metaFromSettings(settings) {
    const raw = settings?.[META_KEY];
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function activeMsFromMeta(meta) {
    if (!meta || typeof meta !== "object") return 0;
    let ms = Number(meta.activeMs) || 0;
    const since = meta.activeSince ? new Date(meta.activeSince).getTime() : NaN;
    if (!Number.isNaN(since)) ms += Math.max(0, Date.now() - since);
    return ms;
  }

  function trackerFromSettings(settings) {
    if (!settings || typeof settings !== "object") return null;
    for (let i = 0; i < TRACKER_KEYS.length; i++) {
      const raw = settings[TRACKER_KEYS[i]];
      if (raw == null) continue;
      if (typeof raw === "object") return raw;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch (e) {
          /* ignore */
        }
      }
    }
    return null;
  }

  function personKeys(person) {
    return [
      ...new Set(
        [
          String(person?.id || "").trim().toLowerCase(),
          String(person?.name || "").trim().toLowerCase(),
        ].filter(Boolean)
      ),
    ];
  }

  function liveStatsForCurrentRep(person) {
    const keys = personKeys(person);
    const me = global.RepSession?.get?.();
    if (!me?.id) return null;
    const meKeys = [String(me.id || "").toLowerCase(), String(me.name || "").toLowerCase()].filter(
      Boolean
    );
    if (!meKeys.some((key) => keys.includes(key))) return null;

    const stats = defaultStats();
    try {
      const metaRaw = global.RepStorage?.loadItem?.(META_KEY);
      const meta = metaRaw ? JSON.parse(metaRaw) : {};
      stats.activeMs = activeMsFromMeta(meta);
    } catch (e) {
      /* ignore */
    }

    try {
      let tracker = null;
      for (let i = 0; i < TRACKER_KEYS.length; i++) {
        const raw = global.RepStorage?.loadItem?.(TRACKER_KEYS[i]);
        if (!raw) continue;
        tracker = trackerFromSettings({ [TRACKER_KEYS[i]]: raw });
        if (tracker) break;
      }
      const deals = Array.isArray(tracker?.deals) ? tracker.deals : [];
      stats.sales = deals.length;
      stats.earned = deals.reduce((sum, d) => sum + (Number(d.commission) || 0), 0);
    } catch (e) {
      /* ignore */
    }

    return stats;
  }

  function statsForPerson(person) {
    const keys = personKeys(person);
    const merged = defaultStats();
    keys.forEach((key) => {
      const hit = repStatsByKey[key];
      if (!hit) return;
      merged.sales = Math.max(merged.sales, hit.sales || 0);
      merged.earned = Math.max(merged.earned, hit.earned || 0);
      merged.activeMs = Math.max(merged.activeMs, hit.activeMs || 0);
    });

    const live = liveStatsForCurrentRep(person);
    if (live) {
      merged.sales = Math.max(merged.sales, live.sales || 0);
      merged.earned = Math.max(merged.earned, live.earned || 0);
      merged.activeMs = Math.max(merged.activeMs, live.activeMs || 0);
    }

    return merged;
  }

  function formatLastOnline(iso) {
    if (!iso) return { label: "No activity yet", online: false };
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return { label: "No activity yet", online: false };
    const sec = Math.floor((Date.now() - then.getTime()) / 1000);
    if (sec < 120) return { label: "Online now", online: true };
    const min = Math.floor(sec / 60);
    if (min < 60) return { label: min === 1 ? "1 min ago" : min + " min ago", online: false };
    const hr = Math.floor(min / 60);
    if (hr < 24) return { label: hr === 1 ? "1 hr ago" : hr + " hr ago", online: false };
    const day = Math.floor(hr / 24);
    if (day < 7) return { label: day === 1 ? "1 day ago" : day + " days ago", online: false };
    return {
      label: then.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      online: false,
    };
  }

  function localLastOnlineIso() {
    try {
      const raw = global.RepStorage?.loadItem?.(META_KEY);
      if (!raw) return "";
      const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
      return String(meta?.lastOnlineAt || meta?.lastLoginAt || "").trim();
    } catch (e) {
      return "";
    }
  }

  function isCurrentRep(person) {
    const me = global.RepSession?.get?.();
    const meId = global.RepSession?.getId?.() || me?.id;
    if (!meId) return false;
    const keys = personKeys(person);
    const meKeys = [
      String(meId || "").toLowerCase(),
      String(me?.name || "").toLowerCase(),
    ].filter(Boolean);
    return meKeys.some((key) => keys.includes(key));
  }

  function pickLatestIso(a, b) {
    const ta = a ? new Date(a).getTime() : NaN;
    const tb = b ? new Date(b).getTime() : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return "";
    if (Number.isNaN(ta)) return b;
    if (Number.isNaN(tb)) return a;
    return ta >= tb ? a : b;
  }

  function lastOnlineForPerson(person) {
    const keys = personKeys(person);
    let best = "";
    for (let i = 0; i < keys.length; i++) {
      best = pickLatestIso(best, lastOnlineByName[keys[i]]);
    }
    if (isCurrentRep(person)) {
      best = pickLatestIso(best, localLastOnlineIso());
    }
    return best;
  }

  function lastOnlineLabel(person) {
    return formatLastOnline(lastOnlineForPerson(person));
  }

  function tipIdFor(person) {
    return (
      "contributor-tip-" +
      String(person.id || person.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  async function refreshContributorData() {
    const c = global.SITE_CONFIG || {};
    const url = String(c.supabaseUrl || "").trim();
    const key = String(c.supabaseAnonKey || "").trim();
    if (!url || !key || !global.supabase?.createClient) return;

    try {
      const client = global.supabase.createClient(url, key);
      const { data, error } = await client
        .from("rep_settings")
        .select("rep_id, rep_name, settings_json");
      if (error) throw error;

      const nextOnline = {};
      const nextProfiles = {};
      const nextStats = {};

      function ensureStats(key) {
        if (!key) return null;
        if (!nextStats[key]) nextStats[key] = defaultStats();
        return nextStats[key];
      }

      (data || []).forEach((row) => {
        const id = String(row.rep_id || "").trim();
        const name = String(row.rep_name || "").trim();
        const meta = metaFromSettings(row.settings_json || {});
        const iso = String(meta?.lastOnlineAt || meta?.lastLoginAt || "").trim();
        const activeMs = activeMsFromMeta(meta);
        const keys = [id, name]
          .map((token) => String(token || "").trim().toLowerCase())
          .filter(Boolean);

        keys.forEach((key) => {
          nextProfiles[key] = { id: id || key, name: name || tokenFromKey(key, id, name) };
          if (iso) nextOnline[key] = iso;
        });

        const tracker = trackerFromSettings(row.settings_json || {});
        const deals = Array.isArray(tracker?.deals) ? tracker.deals : [];
        const earned = deals.reduce((sum, d) => sum + (Number(d.commission) || 0), 0);
        keys.forEach((key) => {
          const stats = ensureStats(key);
          stats.sales = Math.max(stats.sales, deals.length);
          stats.earned = Math.max(stats.earned, earned);
          stats.activeMs = Math.max(stats.activeMs, activeMs);
        });
      });

      lastOnlineByName = nextOnline;
      repProfiles = nextProfiles;
      repStatsByKey = nextStats;
    } catch (e) {
      console.warn("Contributor stats unavailable", e);
    }
  }

  function tokenFromKey(key, id, name) {
    if (id && id.toLowerCase() === key) return id;
    if (name && name.toLowerCase() === key) return name;
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function tooltipHtml(person, stats, last) {
    const activityLine = last.online ? "Online now" : "Last online · " + last.label;
    const rows = [
      {
        label: "Activity",
        value: activityLine,
        online: last.online,
      },
      { label: "Hours on platform", value: formatLifetimeHours(stats.activeMs) },
      { label: "Commission", value: "$" + formatMoney(stats.earned) },
      { label: "Sales", value: saleCountLabel(stats.sales) },
    ];

    const tipId = tipIdFor(person);

    return (
      '<div class="owner-contributor-tooltip" id="' +
      escapeHtml(tipId) +
      '" role="tooltip">' +
      '<p class="owner-contributor-tooltip-title">' +
      tooltipTitleHtml(person) +
      "</p>" +
      '<dl class="owner-contributor-tooltip-stats">' +
      rows
        .map((row) => {
          return (
            "<div>" +
            "<dt>" +
            escapeHtml(row.label) +
            "</dt>" +
            "<dd" +
            (row.online ? ' class="is-online"' : "") +
            ">" +
            escapeHtml(row.value) +
            "</dd>" +
            "</div>"
          );
        })
        .join("") +
      "</dl>" +
      "</div>"
    );
  }

  function teamStatsTotals() {
    const people = contributorList();
    const totals = defaultStats();
    let onlineCount = 0;

    people.forEach((person) => {
      const stats = statsForPerson(person);
      totals.sales += stats.sales || 0;
      totals.earned += stats.earned || 0;
      totals.activeMs += stats.activeMs || 0;
      if (lastOnlineLabel(person).online) onlineCount += 1;
    });

    return {
      sales: totals.sales,
      earned: totals.earned,
      activeMs: totals.activeMs,
      contributors: people.length,
      onlineCount,
    };
  }

  function renderTeamStats() {
    const section = document.getElementById("contributors-team-stats");
    const grid = document.getElementById("contributors-team-stats-grid");
    if (!section || !grid) return;

    const people = contributorList();
    if (!people.length) {
      section.hidden = true;
      grid.innerHTML = "";
      return;
    }

    const team = teamStatsTotals();
    const onlineLabel =
      team.onlineCount > 0
        ? team.onlineCount + " online now"
        : "None online";

    const rows = [
      {
        label: "Total generated",
        value: "$" + formatMoney(team.earned),
        highlight: true,
      },
      { label: "Team sales", value: saleCountLabel(team.sales) },
      { label: "Hours on platform", value: formatLifetimeHours(team.activeMs) },
      {
        label: "Contributors",
        value: String(team.contributors),
        sub: onlineLabel,
      },
    ];

    grid.innerHTML = rows
      .map((row) => {
        return (
          "<div class=\"contributors-team-stat" +
          (row.highlight ? " contributors-team-stat--highlight" : "") +
          '">' +
          "<dt>" +
          escapeHtml(row.label) +
          "</dt>" +
          "<dd>" +
          escapeHtml(row.value) +
          (row.sub
            ? '<span class="contributors-team-stat-sub">' + escapeHtml(row.sub) + "</span>"
            : "") +
          "</dd>" +
          "</div>"
        );
      })
      .join("");

    section.hidden = false;
    section.classList.toggle("contributors-stats-ready", contributorStatsReady);
  }

  function shareCardConfig() {
    const c = global.SITE_CONFIG || {};
    const url = String(c.contributorsShareUrl || "").trim();
    if (!url) return null;
    return {
      url,
      label: String(c.contributorsShareLabel || "Invite").trim() || "Invite",
      hint: String(c.contributorsShareHint || "Invite someone to apply").trim() ||
        "Invite someone to apply",
      title: String(c.contributorsShareTitle || "Join our sales team").trim(),
      text: String(c.contributorsShareText || "Apply here:").trim(),
    };
  }

  function buildInviteMessage(share) {
    const body = String(share.text || "").trim();
    const url = String(share.url || "").trim();
    if (!body) return url;
    if (!url) return body;
    if (body.includes(url)) return body;
    return body + " " + url;
  }

  function copyInviteText(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  function shareFeedback(btn, message) {
    const nameEl = btn?.querySelector(".owner-contributor-name");
    if (!nameEl) return;
    const prev = nameEl.dataset.defaultLabel || nameEl.textContent;
    nameEl.dataset.defaultLabel = prev;
    nameEl.textContent = message;
    clearTimeout(shareFeedback._timer);
    shareFeedback._timer = setTimeout(() => {
      nameEl.textContent = prev;
    }, 2200);
  }

  async function shareInviteLink(share, btn) {
    const message = buildInviteMessage(share);

    if (typeof navigator.share === "function") {
      const attempts = [
        { title: share.title, text: message },
        { title: share.title, text: share.text, url: share.url },
        { url: share.url },
      ];
      for (let i = 0; i < attempts.length; i++) {
        const payload = attempts[i];
        if (navigator.canShare && !navigator.canShare(payload)) continue;
        try {
          await navigator.share(payload);
          return;
        } catch (e) {
          if (e?.name === "AbortError") return;
        }
      }
    }

    try {
      await copyInviteText(message);
      shareFeedback(btn, "Message copied!");
      return;
    } catch (e) {
      console.warn("Share copy failed", e);
    }

    window.open(share.url, "_blank", "noopener,noreferrer");
  }

  function bindShareContributor() {
    const btn = document.querySelector("[data-contributors-share]");
    if (!btn || btn.dataset.shareBound === "1") return;
    const share = shareCardConfig();
    if (!share) return;
    btn.dataset.shareBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      shareInviteLink(share, btn).catch((err) => console.warn("Share failed", err));
    });
  }

  function renderShareContributorCard() {
    const share = shareCardConfig();
    if (!share) return "";
    return (
      '<li class="owner-contributor-item owner-contributor-item--share">' +
      '<button type="button" class="owner-contributor owner-contributor--share" data-contributors-share title="' +
      escapeHtml(share.hint) +
      '" aria-label="' +
      escapeHtml(share.label + " — " + share.hint) +
      '">' +
      '<span class="owner-contributor-photo owner-contributor-share-photo" data-icon="user-plus" data-icon-class="owner-contributor-share-ico" aria-hidden="true"></span>' +
      '<span class="owner-contributor-name-row owner-contributor-name-row--invite">' +
      '<span class="owner-contributor-name">' +
      escapeHtml(share.label) +
      "</span>" +
      "</span>" +
      "</button>" +
      "</li>"
    );
  }

  function renderContributors() {
    const grid = document.getElementById("contributors-grid");
    if (!grid) return;

    const people = contributorList();
    const shareCard = renderShareContributorCard();

    if (!people.length && !shareCard) {
      grid.innerHTML = "";
      renderTeamStats();
      return;
    }

    grid.innerHTML =
      people
        .map((person) => {
          const url = photoUrl(person);
          const last = lastOnlineLabel(person);
          const stats = statsForPerson(person);
          const tipId = tipIdFor(person);
          const presenceLabel = last.online ? "Online now" : "Offline · " + last.label;
          return (
            '<li class="owner-contributor-item">' +
            '<div class="owner-contributor" tabindex="0" aria-describedby="' +
            escapeHtml(tipId) +
            '" aria-label="' +
            escapeHtml(person.name + " — " + presenceLabel) +
            '">' +
            contributorPhotoHtml(url, person) +
            '<span class="owner-contributor-name-row">' +
            '<span class="owner-contributor-presence' +
            (last.online ? " is-online" : " is-offline") +
            '" aria-hidden="true"></span>' +
            '<span class="owner-contributor-name">' +
            escapeHtml(person.name) +
            "</span>" +
            "</span>" +
            tooltipHtml(person, stats, last) +
            "</div>" +
            "</li>"
          );
        })
        .join("") + shareCard;

    if (global.SiteIcons?.initIcons) global.SiteIcons.initIcons(grid);
    bindShareContributor();
    renderTeamStats();
  }

  async function refreshPhotosAndRender() {
    const RPP = global.RepProfilePhoto;
    if (RPP?.refreshTeamPhotos) {
      await RPP.refreshTeamPhotos().catch(() => {});
    }
    await refreshContributorData();
    contributorStatsReady = true;
    renderContributors();
  }

  function pingPresence() {
    if (!global.RepSession?.getId?.()) return;
    global.RepSession?.touchOnline?.();
    if (global.RepStorage?.flushSync) {
      return global.RepStorage.flushSync().catch(() => {});
    }
    return Promise.resolve();
  }

  function bootContributors() {
    pingPresence().catch(() => {});
    refreshContributorData()
      .then(() => {
        contributorStatsReady = true;
        renderContributors();
      })
      .catch(() => renderContributors());
    if (global.RepProfilePhoto?.refreshTeamPhotos) {
      global.RepProfilePhoto.refreshTeamPhotos()
        .then(() => renderContributors())
        .catch(() => {});
    }
  }

  function init() {
    if (document.body.dataset.page !== "contributors") return;
    renderContributors();
    const boot = () => bootContributors();
    if (global.SiteLock?.whenUnlocked) global.SiteLock.whenUnlocked(boot);
    else boot();
    window.addEventListener("rep-settings-ready", () => {
      bootContributors();
    });
    window.addEventListener("rep-settings-synced", () => {
      refreshContributorData()
        .then(() => {
          contributorStatsReady = true;
          renderContributors();
        })
        .catch(() => {});
    });
    window.addEventListener("rep-profile-photo-changed", renderContributors);
    window.addEventListener("rep-session-changed", () => {
      pingPresence()
        .then(() => refreshPhotosAndRender())
        .catch(renderContributors);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        pingPresence()
          .then(() =>
            refreshContributorData().then(() => {
              contributorStatsReady = true;
              renderContributors();
            })
          )
          .catch(() => {});
      }
    });
    setInterval(() => {
        pingPresence()
          .then(() =>
            refreshContributorData().then(() => {
              contributorStatsReady = true;
              renderContributors();
            })
          )
          .catch(() => refreshContributorData().then(() => {
            contributorStatsReady = true;
            renderContributors();
          }).catch(() => {}));
    }, 45000);
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();
})(window);
