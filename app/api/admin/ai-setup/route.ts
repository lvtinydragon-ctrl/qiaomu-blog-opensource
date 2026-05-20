import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { getAppCloudflareEnv } = await import('@/lib/cloudflare')
    const { authenticateRequest } = await import('@/lib/admin-auth')

    const env = await getAppCloudflareEnv()
    const db = env?.DB
    if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })
    if (!(await authenticateRequest(req, db))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { base_url, model, api_key, name, provider } = body
    if (!base_url || !model || !api_key) {
      return NextResponse.json({ error: 'Missing base_url, model, or api_key' }, { status: 400 })
    }

    // Create tables if not exist
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_provider_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'custom',
        provider_name TEXT NOT NULL DEFAULT '',
        provider_type TEXT NOT NULL DEFAULT 'openai_compatible',
        provider_category TEXT NOT NULL DEFAULT '',
        api_key_url TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        temperature REAL NOT NULL DEFAULT 0.7,
        max_tokens INTEGER NOT NULL DEFAULT 2000,
        api_key_encrypted TEXT NOT NULL DEFAULT '',
        api_key_masked TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        temperature REAL NOT NULL DEFAULT 0.7,
        sort_order INTEGER NOT NULL DEFAULT 0,
        profile_id INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `).run()

    const masked = api_key.length > 8 ? api_key.slice(0, 4) + '...' + api_key.slice(-4) : '****'

    await db.prepare('UPDATE ai_provider_profiles SET is_default = 0').run()

    const result = await db.prepare(`
      INSERT INTO ai_provider_profiles (
        name, provider, provider_name, provider_type, provider_category,
        base_url, model, temperature, max_tokens,
        api_key_encrypted, api_key_masked, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      name || 'DeepSeek', provider || 'deepseek', name || 'DeepSeek',
      'openai_compatible', 'china_direct', base_url, model, 0.7, 4096,
      api_key, masked,
    ).run()

    const profileId = result.meta.last_row_id

    // Seed default actions
    const count = await db.prepare('SELECT COUNT(*) as c FROM ai_actions').first<{ c: number }>()
    if ((count?.c ?? 0) === 0) {
      const actions = [
        ['improve', '润色', '让表达更顺更自然', '你是专业的中文写作助手。对下面的文字进行润色，让表达更顺畅自然，保持原意、语气和信息密度不变，直接返回润色后的文字，不要解释。', 0.6, 10],
        ['shorten', '缩写', '压缩成更短版本', '你是专业的中文写作助手。在不丢失核心意思的前提下，把下面的文字压缩得更简短精炼，直接返回结果，不要解释。', 0.6, 20],
        ['expand', '扩写', '补充展开更多细节', '你是专业的中文写作助手。在保持原有信息和风格的基础上，对下面的文字进行扩写，增加更多细节、例证和深度分析，直接返回扩写后的文字，不要解释。', 0.7, 30],
        ['summarize', '总结', '提炼核心要点', '你是专业的中文写作助手。把下面的文字提炼成简洁的摘要，保留核心观点和关键信息，直接返回摘要，不要解释。', 0.5, 40],
        ['translate_zh', '翻译为中文', '将文字翻译成中文', '你是专业的翻译。把下面的文字翻译成流畅自然的中文，直接返回翻译结果，不要解释。', 0.3, 50],
        ['translate_en', '翻译为英文', '将文字翻译成英文', 'You are a professional translator. Translate the following text into natural, fluent English. Return only the translation without explanation.', 0.3, 60],
      ]
      for (const [key, label, desc, prompt, temp, sort] of actions) {
        await db.prepare(
          'INSERT INTO ai_actions (action_key, label, description, prompt, temperature, sort_order, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(key, label, desc, prompt, temp, sort, profileId).run()
      }
    }

    return NextResponse.json({
      success: true,
      profile_id: profileId,
      actions_seeded: (count?.c ?? 0) === 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack?.slice(0, 300)}` : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
