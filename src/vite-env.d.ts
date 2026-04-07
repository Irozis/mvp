/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKETPLACE_LAYOUT_V2?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
