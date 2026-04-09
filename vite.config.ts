import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Dev proxy for Groq — auth added server-side so GROQ_API_KEY never reaches the browser bundle
        '/api/analyze-image': {
          target: 'https://api.groq.com',
          changeOrigin: true,
          rewrite: () => '/openai/v1/chat/completions',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.GROQ_API_KEY ?? ''
              if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`)
            })
          },
        },
        '/yandex-api': {
          target: 'https://llm.api.cloud.yandex.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/yandex-api/, ''),
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-icons': ['lucide-react'],
            'layout-engine': [
              './src/lib/autoAdapt',
              './src/lib/layoutEngine',
              './src/lib/marketplaceLayoutV2',
            ],
          },
        },
      },
    },
  }
})
