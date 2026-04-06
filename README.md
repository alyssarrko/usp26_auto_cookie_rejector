# Auto Cookie Rejector

Auto Cookie Rejector is a Chrome Manifest V3 extension that helps users deal with cookie consent banners with less friction.

Current behavior:

- If a page shows a clear top-level reject option such as `Reject`, `Reject All`, `Decline`, or `Deny`, the extension tries to click it automatically.
- If a page does not show a direct reject option, the extension looks for privacy-entry buttons such as `Your Privacy Choices`, `Manage Cookies`, `Manage Preferences`, `Cookie Settings`, or `Customize`.
- When it finds one of those privacy-entry controls, it opens the customization/privacy center and stops there so the user can make the final decision manually.

This project was built as part of a class group project for Usable Security & Privacy.

## What It Does

The extension is designed to reduce the work required to refuse non-essential cookies while avoiding risky guesses inside complex second-layer consent flows.

In the current version, the extension prioritizes safer behavior:

- It tries obvious reject buttons first.
- If that fails, it opens the privacy or cookie settings panel when possible.
- It does not continue clicking inside the second-layer settings modal.

## Install And Test

For setup, updating, and testing instructions, see:

[INSTALL.md](https://github.com/alyssarrko/usp26_auto_cookie_rejector/blob/main/INSTALL.md)

## Current Known Limitations

- The extension does not support every website or consent framework.
- Many cookie banners are implemented with highly customized HTML, shadow DOM, iframes, or vendor SDKs.
- Some sites use links backed by `javascript:` URLs or unusual event wiring, which can make automation fragile.
- The extension currently stops after opening the customization/privacy center. It does not automatically toggle off optional cookies or submit second-layer forms.
- Keyword matching can still miss unusual wording or non-English consent text.
- Some sites may change their consent UI over time, which can break previously working behavior.

## Privacy

This extension is intended to run locally in the browser and interact with page cookie banners. In its current form, it does not include a remote backend or account system.

## Project Files

- `manifest.json`: Chrome extension manifest
- `content.js`: page-side detection and click logic
- `sw.js`: background service worker for MV3 injection and main-world actions

## Repository

GitHub:

[https://github.com/alyssarrko/auto-cookie-rejector](https://github.com/alyssarrko/auto-cookie-rejector)
