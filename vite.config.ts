import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  buildGroqBannerQualityRequestBody,
  buildGroqBannerQualitySceneSummaryBody,
  isBannerSceneSummaryPayload,
  parseBannerQualityFromAssistantText,
} from './src/lib/bannerQualityGroqShared'

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function bannerAnalyzeDevPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'analyze-banner-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        if (pathOnly !== '/api/analyze-banner') return next()
        if (req.method !== 'POST') return next()

        const key = env.GROQ_API_KEY ?? ''
        if (!key) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'GROQ_API_KEY not set for local dev' }))
          return
        }

        try {
          const raw = await readRequestBody(req as IncomingMessage)
          const parsed = JSON.parse(raw) as { svgDataUrl?: unknown; sceneSummary?: unknown }
          let groqBody: string
          try {
            if (typeof parsed.svgDataUrl === 'string') {
              groqBody = JSON.stringify(buildGroqBannerQualityRequestBody(parsed.svgDataUrl))
            } else if (isBannerSceneSummaryPayload(parsed.sceneSummary)) {
              groqBody = JSON.stringify(buildGroqBannerQualitySceneSummaryBody(parsed.sceneSummary))
            } else {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Provide svgDataUrl or a valid sceneSummary object' }))
              return
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
            return
          }
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: groqBody,
          })
          const payload: unknown = await r.json()
          if (!r.ok) {
            res.statusCode = r.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return
          }
          const text = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
          if (typeof text !== 'string' || !text.trim()) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Groq response did not include message content.' }))
            return
          }
          const result = parseBannerQualityFromAssistantText(text)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), bannerAnalyzeDevPlugin(env)],
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
