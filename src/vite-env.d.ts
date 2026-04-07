/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKETPLACE_LAYOUT_V2?: string
  readonly VITE_YANDEX_API_KEY?: string
  readonly VITE_YANDEX_FOLDER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
