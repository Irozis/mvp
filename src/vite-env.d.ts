/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKETPLACE_LAYOUT_V2?: string
  // Yandex keys — used only in dev via .env.local; prod uses server-side YANDEX_API_KEY in edge function
  readonly VITE_YANDEX_API_KEY?: string
  readonly VITE_YANDEX_FOLDER_ID?: string
  // Public Sentry DSN — safe to expose client-side
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
