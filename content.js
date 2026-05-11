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
    "essential only",
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
    "privacy settings",
    "ok",
    "okay"
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
            chrome.runtime.sendMessage({ status: "success" });
            
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
  // Create a function to stop the observer and mark as finished
  const stopEverything = () => {
    if (window.autoRejectObserver) {
      window.autoRejectObserver.disconnect();
      window.autoRejectObserver = null;
    }
  };

  // 1. Priority: Try to Reject immediately
  if (await clickMatchingButton(REJECT_TEXTS, "click")) {
    document.documentElement.dataset.autoCookieRejectorState = "rejected";
    showToast("Cookies Automatically Rejected");
    stopEverything();
    return;
  }

  const observerTarget = document.body || document.documentElement;
  if (!observerTarget) return;

  window.autoRejectObserver = new MutationObserver(async () => {
    // If we find a Reject button, click it and STOP the observer
    if (await clickMatchingButton(REJECT_TEXTS, "click")) {
      document.documentElement.dataset.autoCookieRejectorState = "rejected";
      showToast("Cookies Automatically Rejected");
      stopEverything(); 
      return;
    }

    // If we find Manage, click it, signal fail, then stop looking for a moment
    if (await clickMatchingButton(MANAGE_TEXTS, "click")) {
      chrome.runtime.sendMessage({ status: "fail" });
    // We don't stopEverything() yet because a Reject button might appear in the popup
    }
  });

  window.autoRejectObserver.observe(observerTarget, { childList: true, subtree: true });
  setTimeout(stopEverything, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatching, { once: true });
  } else {
    startWatching();
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.textContent = message;
    // Styling the toast directly in JS for simplicity
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      backgroundColor: "#333",
      color: "#fff",
      padding: "12px 20px",
      borderRadius: "8px",
      fontSize: "14px",
      zIndex: "999999",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      transition: "opacity 0.5s ease",
      pointerEvents: "none",
      fontFamily: "sans-serif"
    });

    document.body.appendChild(toast);

    // Fade out and remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

})();
