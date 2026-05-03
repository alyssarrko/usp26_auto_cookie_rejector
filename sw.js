const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    console.log("[AutoReject][SW]", ...args);
  }
}

function isInjectableUrl(url) {
  if (!url) return false;

  // Block internal / restricted schemes
  const blockedSchemes = [
    "chrome://",
    "chrome-extension://",
    "edge://",
    "about:",
    "view-source:",
    "devtools://"
  ];

  if (blockedSchemes.some(prefix => url.startsWith(prefix))) {
    return false;
  }

  // Allow only http(s)
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return true;
  }

  return false;
}

async function injectContentScript(tabId, url) {
  if (!isInjectableUrl(url)) {
    log("Not injectable:", url);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: tabId,
        allFrames: true
      },
      files: ["content.js"]
    });

    log("Injected into:", tabId, url);
  } catch (error) {
    console.warn("[AutoReject][SW] Injection failed:", error);
  }
}

async function clickElementInMainWorld(tabId, frameId, marker) {
  await chrome.scripting.executeScript({
    target: {
      tabId,
      ...(typeof frameId === "number" ? { frameIds: [frameId] } : {})
    },
    world: "MAIN",
    func: (markerValue) => {
      const element = document.querySelector(`[data-auto-cookie-rejector-click="${markerValue}"]`);
      if (!element) return false;

      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    },
    args: [marker]
  });
}

async function runPrivacyActionInMainWorld(tabId, frameId, action) {
  await chrome.scripting.executeScript({
    target: {
      tabId,
      ...(typeof frameId === "number" ? { frameIds: [frameId] } : {})
    },
    world: "MAIN",
    func: (actionName) => {
      if (actionName === "optanon-toggle-info-display") {
        if (window.Optanon && typeof window.Optanon.ToggleInfoDisplay === "function") {
          window.Optanon.ToggleInfoDisplay();
          return true;
        }
        return false;
      }

      return false;
    },
    args: [action]
  });
}

/*chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (message?.type !== "click-in-main-world" && message?.type !== "run-main-world-action") {
    return;
  }

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") 
    sendResponse({ ok: false });
    return;
  }*/

  //old - If the click message also contains a status like "success", update the badge now
  //new - If it's just a status update, we can top here and reply
  if (message.status) {
    updateBadge(tabId, message.status);
    if (message.type === "update-status") {
      sendResponse({ ok: true });
      return;
    }
  }

  // 2. Only proceed below if the message is for a "Main World" click (Fixes Ikea)
  if (message?.type !== "click-in-main-world" && message?.type !== "run-main-world-action") {
    return;
  }
 
  const task = message.type === "run-main-world-action"
    ? runPrivacyActionInMainWorld(tabId, sender.frameId, message.action)
    : clickElementInMainWorld(tabId, sender.frameId, message.marker);

  task
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.warn("[AutoReject][SW] Main world action failed:", error);
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});

// Normal page load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    injectContentScript(tabId, tab.url);
  }
});
// SPA navigation support 
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) {
    injectContentScript(details.tabId, details.url);
  }
});

// Function to update the icon badge
function updateBadge(tabId, status) {
  // Adding this safety check
  if (!chrome.action) {
    console.warn("[AutoReject] chrome.action is not available.");
    return;
  }

  if (status === "success") {
    chrome.action.setBadgeText({ tabId, text: "OK" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
  } else if (status === "fail") {
    chrome.action.setBadgeText({ tabId, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#F44336" });
  }
}

// Listen for status messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "update-status") {
    const tabId = sender.tab.id;
    updateBadge(tabId, message.status);
    sendResponse({ ok: true });
  }
});
