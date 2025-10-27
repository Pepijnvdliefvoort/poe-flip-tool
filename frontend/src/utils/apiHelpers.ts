// Helper for API base resolution and API key retrieval
export const BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_BACKEND_URL ||
  (typeof location !== 'undefined' && location.hostname.endsWith('github.io')
    ? 'https://poe-flip-backend.fly.dev'
    : 'http://localhost:8000');

export const getApiKey = () => import.meta.env.VITE_API_KEY || sessionStorage.getItem('api_key') || '';
