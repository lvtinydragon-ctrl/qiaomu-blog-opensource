export type Database = D1Database

export function getDB(env: CloudflareEnv) {
  return env.DB!
}

let schemaInitialized = false

export async function ensureSchema(db: Database) {
  if (schemaInitialized) return

  try {
    const columnMigrations = [
      "ALTER TABLE posts ADD COLUMN password TEXT",
      "ALTER TABLE posts ADD COLUMN is_pinned INTEGER DEFAULT 0",
      "ALTER TABLE posts ADD COLUMN is_hidden INTEGER DEFAULT 0",
      "ALTER TABLE posts ADD COLUMN deleted_at INTEGER",
      "ALTER TABLE posts ADD COLUMN cover_image TEXT",
    ]
    for (const sql of columnMigrations) {
      try {
        await db.prepare(sql).run()
      } catch {
        // column already exists
      }
    }
    schemaInitialized = true
  } catch (error: unknown) {
    console.error('Schema migration failed:', error)
  }
}
