(() => {
  console.log("[AutoReject] content.js injected:", window.location.href);

  document.documentElement.dataset.autoCookieRejector = "ran";

  if (window.__autoCookieRejectorRan) return;
  window.__autoCookieRejectorRan = true;

  const REJECT_TEXTS = [
    "reject all",
    "reject",
    "deny all",
    "deny",
    "decline all",
    "decline",
    "do not accept",
    "only necessary",
    "strictly necessary",
    "essential only",
    "opt out"
  ];

  const MANAGE_TEXTS = [
    "your privacy choices",
    "privacy choices",
    "manage preferences",
    "manage cookies",
    "manage my cookies",
    "manage privacy choices",
    "manage your privacy choices",
    "manage consent preferences",
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
    "customize settings",
    "customize",
    "customise",
    "no, thanks",
    "do not sell or share my personal information",
    "do not sell or share",
    "do not sell",
    "purposes",
    "privacy center"
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
    
    const href = button.getAttribute("href") || "";
    // Specific Fix for IKEA/OneTrust: If the button uses the Optanon toggle, trigger it directly in the Main World
    if (href.includes("Optanon.ToggleInfoDisplay")) {
      const response = await chrome.runtime.sendMessage({
        type: "run-main-world-action",
        action: "optanon-toggle-info-display"
      });
      return Boolean(response?.ok);
    }

    // Default to standard Main World click for Nike/Adidas/Handshake
    return await clickElement(button);
  }

    async function clickMatchingButton(keywords, mode) {
    const buttons = getInteractiveElements();

    for (const button of buttons) {
      const text = getElementText(button);

      if (!text) continue;

      for (const keyword of keywords) {
        // Only match if the keyword is the whole text or a significant part of it
        const isMatch = text === keyword || (text.length < 20 && text.includes(keyword));
        
        if (isMatch) {
          if (mode === "click") {
            console.log("[AutoReject] Clicking:", text);                      
            if (await clickElement(button)) {
              // Clear the "Manual Action" timer if we just successfully rejected!
              if (window.manualToastTimeout) {
                clearTimeout(window.manualToastTimeout);
                window.manualToastTimeout = null;
              }
              showToast("Cookies Automatically Rejected");
              chrome.runtime.sendMessage({ status: "success" });
              return true;
            }
          } else {
            console.log("[AutoReject] Found privacy choices entry:", text);
            // We set the state but do NOT return true here if we want to keep 
            // looking for a Reject button that might appear after clicking this.
            if (await openManageFlow(button)) {
              document.documentElement.dataset.autoCookieRejectorState = "opened-manual-choice";
              // Returning false here is the key: it tells startWatching to keep the 
              // MutationObserver alive so it can find the "Reject" button inside the new menu.
              return false; 
            }
            return false;
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

  // Priority: Try to Reject immediately
  if (await clickMatchingButton(REJECT_TEXTS, "click")) {
    document.documentElement.dataset.autoCookieRejectorState = "rejected";
    stopEverything(); // Toast is already handled by the function above
    return;
  }

  const observerTarget = document.body || document.documentElement;
  if (!observerTarget) return;

  window.autoRejectObserver = new MutationObserver(async () => {
    // 1. ALWAYS try to reject first
    const rejected = await clickMatchingButton(REJECT_TEXTS, "click");
    if (rejected) {
      if (window.manualToastTimeout) {
        clearTimeout(window.manualToastTimeout);
        window.manualToastTimeout = null;
      }
      document.documentElement.dataset.autoCookieRejectorState = "rejected";
      stopEverything(); 
      return;
    }

    // 2. Only look for Manage if we haven't already succeeded AND we haven't already opened the menu
    if (document.documentElement.dataset.autoCookieRejectorState !== "rejected" && 
        document.documentElement.dataset.autoCookieRejectorState !== "opened-manual-choice") {
      if (await clickMatchingButton(MANAGE_TEXTS, "manage")) {
        chrome.runtime.sendMessage({ type: "update-status", status: "fail" });
         
        // We only show the "Manual Action" toast if the Reject button 
        // hasn't been found after 4 seconds of the banner being visible.
        if (!window.manualToastTimeout) {
          window.manualToastTimeout = setTimeout(() => {
            if (document.documentElement.dataset.autoCookieRejectorState !== "rejected") {
              showToast("Manual Action Required");
            }
          }, 4000); // Increased to 4s to let Amtrak/OneTrust finish loading
        }
      }
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
  if (Array.from(document.querySelectorAll('div')).some(el => el.textContent === message)) return;
  
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    top: "50%",
    transform: "translateY(-50%)",
    right: "20px",
    backgroundColor: "#4444ff", // Blue background so it's visible over black banners
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

  // Fade out and remove after 10 seconds for better visibility
  setTimeout(() => {
    toast.style.transition = "opacity 1.5s ease"; // Slower fade
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.remove();
      window.manualToastTimeout = null; // Reset the timeout tracker
    }, 1500);
  }, 10000);
}

})();
