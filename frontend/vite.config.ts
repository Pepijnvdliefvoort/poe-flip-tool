import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // If you set VITE_API_BASE in the frontend .env, we'll use it; otherwise default to local FastAPI
  const target = env.VITE_API_BASE || 'http://localhost:8000'

  console.log('Vite proxy target:', target)

  return {
    plugins: [react()],
    base: '/poe-flip-tool/', // GitHub Pages subdirectory path
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        }
      }
    }
  }
})
