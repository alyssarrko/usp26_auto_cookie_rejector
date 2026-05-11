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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return;

  // 1. Handle Badge Updates (Handles { status: "success" } or { status: "fail" })
  if (message.status) {
    updateBadge(tabId, message.status);
    
    // If it's just a status update, we can reply and stop here
    if (!message.type || message.type === "update-status") {
      sendResponse({ ok: true });
      return;
    }
  }

  // 2. Handle Main World Actions (Ikea)
  if (message.type === "click-in-main-world" || message.type === "run-main-world-action") {
    const task = message.type === "run-main-world-action"
      ? runPrivacyActionInMainWorld(tabId, sender.frameId, message.action)
      : clickElementInMainWorld(tabId, sender.frameId, message.marker);

    task.then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; 
  }
});

// Normal page load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && changeInfo.url) { // Added changeInfo.url check
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
  // Safety check: verify tab exists before updating badge to prevent "No tab with id" error
  chrome.tabs.get(tabId).then(() => {
    const text = status === "success" ? "OK" : "!";
    const color = status === "success" ? "#4CAF50" : "#F44336";
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color });
  }).catch(() => {
    log("Tab", tabId, "not found. Skipping badge update.");
  });
}

