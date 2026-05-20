import { createClient, type Client } from '@libsql/client'

// D1-compatible adapter over libsql/Turso

class PreparedStatement {
  private sql: string
  private values: unknown[] = []

  constructor(private client: Client, sql: string) {
    this.sql = sql
  }

  bind(...values: unknown[]): PreparedStatement {
    this.values = values
    return this
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const rs = await this.client.execute({ sql: this.sql, args: this.values as (string | number | boolean | null | Buffer)[] })
    const row = rs.rows[0]
    if (!row) return null
    return Object.fromEntries(rs.columns.map((col, i) => [col, row[i]])) as T
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const rs = await this.client.execute({ sql: this.sql, args: this.values as (string | number | boolean | null | Buffer)[] })
    const results = rs.rows.map(row =>
      Object.fromEntries(rs.columns.map((col, i) => [col, row[i]])) as T
    )
    return { results }
  }

  async run(): Promise<{ meta: { last_row_id: number } }> {
    const rs = await this.client.execute({ sql: this.sql, args: this.values as (string | number | boolean | null | Buffer)[] })
    return { meta: { last_row_id: Number(rs.lastInsertRowid) } }
  }
}

class D1Adapter {
  constructor(private client: Client) {}

  prepare(query: string): PreparedStatement {
    return new PreparedStatement(this.client, query)
  }
}

let dbInstance: D1Adapter | null = null

export function createDb(url?: string, authToken?: string): D1Adapter {
  if (dbInstance) return dbInstance

  const dbUrl = (url || process.env.TURSO_URL || 'file:bluew-blog.db').replace(/\s/g, '')
  const token = (authToken || process.env.TURSO_AUTH_TOKEN || '').replace(/\s/g, '')

  const client = createClient(token ? { url: dbUrl, authToken: token } : { url: dbUrl })

  dbInstance = new D1Adapter(client)
  return dbInstance
}

export type { D1Adapter as Database }
