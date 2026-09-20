/* SPACEX LAUNCH — Fort Mohave notification service worker */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && targetUrl) {
            try {
              await client.navigate(targetUrl)
            } catch (_) {
              /* ignore navigate failures */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'SHOW_NOTIFICATION') return
  const { title, options } = data
  event.waitUntil(
    self.registration.showNotification(title || 'SPACEX LAUNCH', options || {}),
  )
})
