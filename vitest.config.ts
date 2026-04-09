import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Pin tests to V1 marketplace layout so existing test expectations remain stable.
    // V2 is enabled in dev/.env.local and prod Vercel env vars, not in tests.
    env: {
      VITE_MARKETPLACE_LAYOUT_V2: 'false',
    },
  },
})
