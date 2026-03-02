// content.js (MV3)
// Auto-detect and click "Reject"/"Decline" style buttons on cookie banners.

(() => {
  "use strict";

  const LOG_PREFIX = "[AutoReject]";
  const DEBUG = true;

  const ALLOW_IFRAMES = true;

  // Avoid running on about:blank and other non-page contexts.
  const href = String(window.location && window.location.href || "");
  if (!href || href.startsWith("about:") || href.startsWith("chrome:") || href.startsWith("edge:")) return;

  if (!ALLOW_IFRAMES && window.top !== window) return;

  // Prevent repeated runs (per frame).
  if (window.__autoCookieRejectorRan) return;
  window.__autoCookieRejectorRan = true;

  const log = (...args) => { if (DEBUG) console.log(LOG_PREFIX, ...args); };

  log("content.js injected", href, "frame?", window.top !== window);

  // Keyword sets
  const REJECT_TEXTS = [
    "reject", "reject all", "decline", "decline all",
    "deny", "deny all",
    "do not accept",
    "refuse",
    "no thanks", "not now",
    "opt out", "opt-out",
    "do not sell", "do not sell my personal information",
    "do not share", "do not share my personal information",
    "manage cookies", // sometimes leads to reject inside
    "privacy choices", "privacy options", "cookie settings", "preferences", "manage preferences"
  ];

  // Buttons that often open the cookie settings panel
  const OPEN_SETTINGS_TEXTS = [
    "preferences", "manage preferences", "cookie settings", "settings",
    "privacy choices", "privacy options", "customize", "configure", "manage cookies"
  ];

  // Once settings is open, these are the strongest "reject everything" phrases
  const STRONG_REJECT_TEXTS = [
    "reject all", "decline all", "deny all",
    "opt out", "opt-out",
    "do not sell", "do not share"
  ];

  // Simple helpers
  const normalize = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  const getClickableLabel = (el) => {
    const aria = el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"));
    const txt = el.innerText || el.textContent || "";
    const val = el.value || "";
    return normalize(aria || txt || val);
  };

  const looksClickable = (el) => {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "button") return true;
    if (tag === "a" && el.getAttribute("href")) return true;
    if (tag === "input") {
      const t = normalize(el.getAttribute("type"));
      return t === "button" || t === "submit";
    }
    const role = normalize(el.getAttribute && el.getAttribute("role"));
    return role === "button";
  };

  const safeClick = (el, why) => {
    try {
      if (!el || !looksClickable(el) || !isVisible(el)) return false;
      el.click();
      log("clicked:", why, "| label:", getClickableLabel(el));
      return true;
    } catch (e) {
      log("click failed:", e);
      return false;
    }
  };

  const scoreByKeywords = (label, keywords) => {
    // Higher score wins
    // exact match > startsWith > includes
    let score = 0;
    for (const k of keywords) {
      const kk = normalize(k);
      if (!kk) continue;
      if (label === kk) score = Math.max(score, 100);
      else if (label.startsWith(kk)) score = Math.max(score, 60);
      else if (label.includes(kk)) score = Math.max(score, 30);
    }
    return score;
  };

  const collectCandidates = (root) => {
    const results = [];
    if (!root) return results;

    const selector = [
      "button",
      "a[href]",
      "input[type='button']",
      "input[type='submit']",
      "[role='button']"
    ].join(",");

    const nodes = root.querySelectorAll ? root.querySelectorAll(selector) : [];
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const label = getClickableLabel(el);
      if (!label) continue;
      results.push({ el, label });
    }
    return results;
  };

  const findBest = (root, keywords) => {
    const cands = collectCandidates(root);
    let best = null;

    for (const c of cands) {
      const s = scoreByKeywords(c.label, keywords);
      if (s <= 0) continue;
      if (!best || s > best.score) best = { ...c, score: s };
    }
    return best;
  };

  // Banner often lives in shadow DOM. We can try to traverse open shadow roots.
  const collectAllRoots = () => {
    const roots = [document];

    const walk = (node) => {
      if (!node) return;
      // open shadow root only
      if (node.shadowRoot) roots.push(node.shadowRoot);

      const kids = node.children || [];
      for (const k of kids) walk(k);
    };

    walk(document.documentElement);
    return roots;
  };

  const attemptRejectOnce = () => {
    const roots = collectAllRoots();

    // 1) Try strong reject first everywhere
    for (const r of roots) {
      const best = findBest(r, STRONG_REJECT_TEXTS);
      if (best && safeClick(best.el, "strong reject")) return true;
    }

    // 2) Try any reject-ish text
    for (const r of roots) {
      const best = findBest(r, REJECT_TEXTS);
      if (best) {
        // If the best match is actually an "open settings" style button, click it and continue
        const openScore = scoreByKeywords(best.label, OPEN_SETTINGS_TEXTS);
        const rejectScore = scoreByKeywords(best.label, STRONG_REJECT_TEXTS);
        if (rejectScore >= 30) {
          if (safeClick(best.el, "reject-like")) return true;
        } else if (openScore >= 30) {
          if (safeClick(best.el, "open settings")) return true;
        }
      }
    }

    return false;
  };

  // Run a few times because banners can appear after load
  let tries = 0;
  const MAX_TRIES = 8;

  const tick = () => {
    tries += 1;
    const ok = attemptRejectOnce();
    if (ok) return;

    if (tries < MAX_TRIES) {
      setTimeout(tick, 600);
    } else {
      log("gave up after tries:", tries);
    }
  };

  // Watch for late appearing banners or modals
  const observer = new MutationObserver(() => {
    // Debounce by scheduling a quick attempt
    if (tries >= MAX_TRIES) return;
    setTimeout(() => {
      if (tries < MAX_TRIES) attemptRejectOnce();
    }, 100);
  });

  const start = () => {
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {
      log("observer failed:", e);
    }
    tick();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

