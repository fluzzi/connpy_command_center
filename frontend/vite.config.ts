import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && mode === 'production') {
    if (!env.VITE_CONN_API_KEY) {
      throw new Error("CRITICAL SECURITY ERROR: VITE_CONN_API_KEY environment variable is not defined for production build!")
    }
  }
  return {
    plugins: [react()],
  }
})
