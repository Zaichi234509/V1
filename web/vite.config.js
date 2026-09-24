import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The sandbox preview is proxied through https://{port}-{sandboxId}.e2b.app,
    // so that host has to be explicitly trusted or Vite returns "Blocked request".
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
  },
})
