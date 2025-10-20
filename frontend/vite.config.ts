import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // If you set VITE_API_BASE in the frontend .env, we'll use it; otherwise default to local FastAPI
  const target = env.VITE_API_BASE || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
