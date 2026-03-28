/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_SHEET_ID: string
  readonly VITE_GOOGLE_SHEET_NAME: string
  // más variables de entorno...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
