/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_SHEET_ID: string;
  readonly VITE_GOOGLE_SHEET_NAME: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** "supabase" | "sheets". De dónde lee la web. Ver src/data/index.ts. */
  readonly VITE_DATA_SOURCE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
