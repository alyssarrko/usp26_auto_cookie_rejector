(() => {
  console.log("[AutoReject] content.js injected:", window.location.href);

  document.documentElement.dataset.autoCookieRejector = "ran";

  if (window.__autoCookieRejectorRan) return;
  window.__autoCookieRejectorRan = true;

  const REJECT_TEXTS = [
    "reject",
    "reject all",
    "deny",
    "deny all",
    "decline",
    "decline all",
    "do not accept",
    "only necessary",
    "strictly necessary"
  ];

  const MANAGE_TEXTS = [
    "your privacy choices",
    "privacy choices",
    "customize",
    "customise",
    "manage preferences",
    "manage cookies",
    "manage my cookies",
    "manage privacy choices",
    "manage your privacy choices",
    "cookie preferences",
    "privacy preferences",
    "consent preferences",
    "cookie options",
    "privacy options",
    "cookie choices",
    "review cookies",
    "review settings",
    "change settings",
    "update preferences",
    "cookie settings",
    "privacy settings"
  ];

  function getInteractiveElements() {
    const primary = Array.from(document.querySelectorAll(
      "button, a, input[type='button'], input[type='submit'], [role='button']"
    ));

    const custom = Array.from(document.querySelectorAll("div, span")).filter((element) => {
      const text = (element.innerText || element.textContent || "").trim();
      if (!text || text.length > 80) return false;

      const hasPrivacyMarker = element.matches(
        "[class*='cmp_'], [class*='privacy'], [data-sheinprivacysign738591172]"
      );
      const style = window.getComputedStyle(element);
      const looksClickable = style.cursor === "pointer";

      return hasPrivacyMarker || looksClickable;
    });

    return [...new Set([...primary, ...custom])];
  }

  function getElementText(element) {
    return (
      element.innerText ||
      element.value ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    ).toLowerCase().trim();
  }

  async function clickElement(button) {
    const href = button.getAttribute("href") || "";
    if (href.includes("Optanon.ToggleInfoDisplay")) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "run-main-world-action",
          action: "optanon-toggle-info-display"
        });

        return Boolean(response?.ok);
      } catch (error) {
        console.warn("[AutoReject] Optanon action failed:", error);
        return false;
      }
    }

    const marker = `acr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    button.setAttribute("data-auto-cookie-rejector-click", marker);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "click-in-main-world",
        marker
      });

      return Boolean(response?.ok);
    } catch (error) {
      console.warn("[AutoReject] Main world click failed:", error);
      return false;
    } finally {
      button.removeAttribute("data-auto-cookie-rejector-click");
    }
  }

  async function openManageFlow(button) {
    const href = button.getAttribute("href") || "";

    if (href.includes("Optanon.ToggleInfoDisplay")) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "run-main-world-action",
          action: "optanon-toggle-info-display"
        });

        return Boolean(response?.ok);
      } catch (error) {
        console.warn("[AutoReject] Optanon action failed:", error);
        return false;
      }
    }

    console.log("[AutoReject] Manual privacy option found but not auto-opened safely.");
    return false;
  }

  async function clickMatchingButton(keywords, mode) {
    const buttons = getInteractiveElements();

    for (const button of buttons) {
      const text = getElementText(button);

      if (!text) continue;

      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          if (mode === "click") {
            console.log("[AutoReject] Clicking:", text);
            if (await clickElement(button)) {
              return true;
            }
          } else {
            console.log("[AutoReject] Found privacy choices entry:", text);
            document.documentElement.dataset.autoCookieRejectorState = "manual-choice";
            document.documentElement.dataset.autoCookieRejectorMatch = text;
            if (await openManageFlow(button)) {
              document.documentElement.dataset.autoCookieRejectorState = "opened-manual-choice";
              return true;
            }
            return true;
          }
        }
      }
    }

    return false;
  }

  async function startWatching() {
    if (await clickMatchingButton(REJECT_TEXTS, "click")) {
      document.documentElement.dataset.autoCookieRejectorState = "rejected";
      return;
    }

    if (await clickMatchingButton(MANAGE_TEXTS, "notice")) {
      return;
    }

    const observerTarget = document.body || document.documentElement;
    if (!observerTarget) return;

    const observer = new MutationObserver(async () => {
      if (await clickMatchingButton(REJECT_TEXTS, "click")) {
        document.documentElement.dataset.autoCookieRejectorState = "rejected";
        observer.disconnect();
        return;
      }

      if (await clickMatchingButton(MANAGE_TEXTS, "notice")) {
        observer.disconnect();
        return;
      }
    });

    observer.observe(observerTarget, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
    }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatching, { once: true });
  } else {
    startWatching();
  }

})();

