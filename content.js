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
    "strictly necessary",
    "do not sell",
    "do not sell or share",
    "opt out"
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

    //Moved from below to the top of the function
    const marker = `acr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const href = button.getAttribute("href") || "";
    if (href.includes("Optanon.ToggleInfoDisplay")) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "click-in-main-world",
          marker,
          status: "success" //Tells the SW to turn green while clicking
          
          //type: "run-main-world-action",
          //action: "optanon-toggle-info-display"
        });

        return Boolean(response?.ok);
      } catch (error) {
        console.warn("[AutoReject] Optanon action failed:", error);
        return false;
      }
    }

    //Attach 'status: success' directly to this message to ensure the badge turns green
    //immediately, even if the site reloads or destroys the button right after the click()
    
    //Moved the below line to the top of the function
    //const marker = `acr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    button.setAttribute("data-auto-cookie-rejector-click", marker);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "click-in-main-world",
        marker,
        status: "success" // Tells the SW to turn the badge green
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
    console.log("[AutoReject] Attempting to open manage flow for:", getElementText(button));
    //Using our existing clickElement logic because it knows how to trigger complex
    //"Main World" buttons used by Nike, Adidas, and OneTrust.
    return await clickElement(button);
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

            // Send signal before click() to avoid the race condition
            chrome.runtime.sendMessage({ type: "update-status", status: "success" });
            
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
    // 1. Try to reject immediately if the button is already there
    if (await clickMatchingButton(REJECT_TEXTS, "click")) {
      document.documentElement.dataset.autoCookieRejectorState = "rejected";
      return;
    }

    // 2. We don't send the "fail" signal yet. We wait for the MutationObserver 
    // to see if a Reject button loads in later.
    const observerTarget = document.body || document.documentElement;
    if (!observerTarget) return;

    const observer = new MutationObserver(async () => {
      // Priority: Always try to find a Reject button first
      if (await clickMatchingButton(REJECT_TEXTS, "click")) {
        document.documentElement.dataset.autoCookieRejectorState = "rejected";
        observer.disconnect();
        return;
      }

      // If we see a "Manage" entry but no "Reject" button yet, signal a fail.
      // We don't disconnect the observer here so we can keep looking for "Reject".
      if (await clickMatchingButton(MANAGE_TEXTS, "notice")) {
        chrome.runtime.sendMessage({ type: "update-status", status: "fail" });
      }
    });

    observer.observe(observerTarget, {
      childList: true,
      subtree: true
    });

    // Stop looking after 15 seconds to save browser resources
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

