/* WBNHS–BSP maintenance-mode service worker (kill switch).
 *
 * Earlier visitors still have the original app's cache-first service worker
 * installed. This replacement activates immediately, deletes every cache the
 * old app created, unregisters itself, and reloads open tabs so they fetch the
 * maintenance page from the network. It never caches or serves anything.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (error) { /* ignore */ }

    try {
      await self.registration.unregister();
    } catch (error) { /* ignore */ }

    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach(client => {
        try { client.navigate(client.url); } catch (error) { /* ignore */ }
      });
    } catch (error) { /* ignore */ }
  })());
});

// No fetch handler: every request goes straight to the network.
