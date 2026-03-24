# Install And Test Guide

This guide explains how to install Auto Cookie Rejector from GitHub, update it, and test it on your own device.

## Install From GitHub

1. Download the code from GitHub:
   - Visit [alyssarrko/auto-cookie-rejector](https://github.com/alyssarrko/auto-cookie-rejector)
   - Click `Code` -> `Download ZIP`
   - Unzip the folder on your computer

2. Open Chrome and go to:
   - `chrome://extensions`

3. Turn on:
   - `Developer mode` in the top-right corner

4. Click:
   - `Load unpacked`

5. Select the unzipped project folder that contains:
   - `manifest.json`
   - `content.js`
   - `sw.js`

6. Open the extension details and make sure:
   - `Site access` is set to `On all sites`

7. Visit a website with a cookie banner and test the extension.

## Update To A New Version

If the code on GitHub changes, reload the unpacked extension with the newest local files.

1. Download the newest version from GitHub and replace the old local folder, or pull the latest changes if using Git.
2. Open `chrome://extensions`
3. Find `Auto Cookie Rejector`
4. Click `Reload`
5. Refresh the website tab you want to test

## How To Test

You can test the extension by visiting websites with cookie banners and checking whether one of these happens:

- A direct reject button is clicked automatically
- A privacy/customization panel opens automatically
- Nothing happens, which may mean the site uses an unsupported consent flow

For debugging in the page console, you can check:

```js
document.documentElement.dataset.autoCookieRejectorState
```

Possible values:

- `rejected`
- `opened-manual-choice`
- `manual-choice`

## GitHub Repository

[https://github.com/alyssarrko/auto-cookie-rejector](https://github.com/alyssarrko/auto-cookie-rejector)
