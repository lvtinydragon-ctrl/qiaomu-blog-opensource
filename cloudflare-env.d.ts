// D1-compatible types (now backed by libsql/Turso adapter)
declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { last_row_id: number } }>
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement
}

declare interface CloudflareEnv {
  DB?: D1Database
  ADMIN_PASSWORD?: string
  ADMIN_TOKEN_SALT?: string
  AI_CONFIG_ENCRYPTION_SECRET?: string
  NEXT_PUBLIC_SITE_URL?: string
  AI_API_KEY?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  WORKERS_AI_MODEL?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  ENABLE_BACKGROUND_JOBS?: string
  ENABLE_WORKERS_AI?: string
  ENABLE_VECTOR_SEARCH?: string
  ENABLE_CF_IMAGE_PIPELINE?: string
}
