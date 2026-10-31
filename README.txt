WBNHS - BSP | Template — PWA package

This folder is one web application. Keep all files together in the same published folder.

DEPLOYMENT
1. Upload the CONTENTS of this folder to the root of a static HTTPS website (not just the ZIP file).
2. Ensure index.html is served at the site's root and the other files remain beside it.
3. Open the HTTPS site in Chrome on Android.
4. Reload once after deployment so the new service worker can install and cache the app shell.
5. Use Chrome menu > Install app (or Add to Home screen, depending on Chrome version).

FILES
- index.html: application entry point
- style.css: interface styling
- script.js: application logic
- manifest.webmanifest: PWA identity and install settings
- sw.js: service worker and app-shell cache
- logo.jpg: supplied Senior Scouts logo used in the interface
- icon-192.png / icon-512.png: install icons
- icon.svg: vector icon asset

IMPORTANT
- PWA installation and service workers require HTTPS (localhost is also permitted for development).
- Keep the same website origin when updating the app so IndexedDB data remains associated with that origin.
- Do not clear browser site data when updating the files; that may delete locally stored photographs and templates.
- Browser storage is local and can still be removed by the user, browser, or operating system.
- This package has not been fully stress-tested on every Android device. Verify photo import and PNG/JPEG/ZIP export with test images before using it for official work.
