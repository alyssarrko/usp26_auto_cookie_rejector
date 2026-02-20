/// sw.js (Manifest V3)

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

 // 1️⃣ Normal page load
 chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
   if (changeInfo.status === "complete" && tab.url) {
     injectContentScript(tabId, tab.url);
   }
 });

 // 2️⃣ SPA navigation support (React / Next.js / etc.)
 chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
   if (details.frameId === 0) {
     injectContentScript(details.tabId, details.url);
   }
 });
