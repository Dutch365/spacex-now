import { defineConfig } from 'vite'

const llProxy = {
  '/api/ll': {
    target: 'https://ll.thespacedevs.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/ll/, ''),
    secure: true,
  },
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: llProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: llProxy,
  },
})
