import {
  decryptApiKey,
  encryptApiKey,
  maskApiKey,
  resolveAiConfigSecret,
} from '@/lib/ai-provider-profiles'
import { getSetting, setSetting } from '@/lib/db'

const WECHAT_DIRECT_SETTING_KEY = 'wechat_direct_config'
const REQUEST_TIMEOUT = 20_000
const REMOTE_IMAGE_LIMIT = 1024 * 1024
const COVER_IMAGE_LIMIT = 64 * 1024
const FALLBACK_SOURCE_LIMIT = 20 * 1024 * 1024
const WX_API_BASE = 'https://wx-api.bluewhiterealm.us.ci'

interface StoredWechatDirectConfig {
  accounts?: Array<{
    id: string
    name: string
    appid: string
    secret_encrypted: string
    appid_masked: string
  }>
}

export interface WechatDirectAccount {
  id: string
  name: string
  appid: string
  secret: string
}

export interface WechatDirectPublicAccount {
  id: string
  name: string
  appid_masked: string
}

export interface WechatDirectPublicConfig {
  accounts: WechatDirectPublicAccount[]
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

function parseStoredConfig(raw: string | null): StoredWechatDirectConfig {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as StoredWechatDirectConfig
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function getWechatDirectConfig(
  db: D1Database,
  env?: Record<string, unknown>,
): Promise<{ accounts: WechatDirectAccount[] }> {
  const raw = await getSetting(db, WECHAT_DIRECT_SETTING_KEY)
  const stored = parseStoredConfig(raw)
  const secret = resolveAiConfigSecret(env)
  const accounts: WechatDirectAccount[] = []

  for (const acct of stored.accounts || []) {
    const decryptedSecret = acct.secret_encrypted
      ? await decryptApiKey(acct.secret_encrypted, secret).catch(() => '')
      : ''
    if (acct.id && acct.appid && decryptedSecret) {
      accounts.push({
        id: acct.id,
        name: acct.name,
        appid: acct.appid,
        secret: decryptedSecret,
      })
    }
  }

  return { accounts }
}

export async function getWechatDirectPublicConfig(
  db: D1Database,
): Promise<WechatDirectPublicConfig> {
  const raw = await getSetting(db, WECHAT_DIRECT_SETTING_KEY)
  const stored = parseStoredConfig(raw)
  return {
    accounts: (stored.accounts || []).map(acct => ({
      id: acct.id,
      name: acct.name,
      appid_masked: acct.appid_masked || '',
    })),
  }
}

export async function saveWechatDirectAccount(
  db: D1Database,
  env: Record<string, unknown> | undefined,
  input: {
    id?: string
    name: string
    appid: string
    secret: string
  },
): Promise<WechatDirectPublicAccount> {
  const raw = await getSetting(db, WECHAT_DIRECT_SETTING_KEY)
  const stored = parseStoredConfig(raw)
  const secret = resolveAiConfigSecret(env)
  const accounts = stored.accounts || []

  const accountId = input.id || `acct_${Date.now()}`
  const encryptedSecret = await encryptApiKey(input.secret, secret)

  const existingIndex = accounts.findIndex(a => a.id === accountId)
  const newAccount = {
    id: accountId,
    name: input.name.trim(),
    appid: input.appid.trim(),
    secret_encrypted: encryptedSecret,
    appid_masked: maskApiKey(input.appid),
  }

  if (existingIndex >= 0) {
    accounts[existingIndex] = newAccount
  } else {
    accounts.push(newAccount)
  }

  stored.accounts = accounts
  await setSetting(db, WECHAT_DIRECT_SETTING_KEY, JSON.stringify(stored))

  return {
    id: newAccount.id,
    name: newAccount.name,
    appid_masked: newAccount.appid_masked,
  }
}

export async function deleteWechatDirectAccount(
  db: D1Database,
  accountId: string,
): Promise<void> {
  const raw = await getSetting(db, WECHAT_DIRECT_SETTING_KEY)
  const stored = parseStoredConfig(raw)
  stored.accounts = (stored.accounts || []).filter(a => a.id !== accountId)
  await setSetting(db, WECHAT_DIRECT_SETTING_KEY, JSON.stringify(stored))
}

async function getAccessToken(appid: string, secret: string): Promise<string> {
  const cached = tokenCache.get(appid)
  const now = Date.now()
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token
  }

  const url = new URL('/cgi-bin/token', WX_API_BASE)
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appid)
  url.searchParams.set('secret', secret)

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) })
  const payload = await response.json() as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }

  if (!response.ok || payload?.errcode) {
    throw new Error(payload?.errmsg || `access_token request failed: HTTP ${response.status}`)
  }

  const expiresIn = Number(payload?.expires_in || 7200)
  tokenCache.set(appid, {
    token: payload.access_token!,
    expiresAt: now + expiresIn * 1000,
  })

  return payload.access_token!
}

async function wxApiJson(accessToken: string, path: string, body?: unknown) {
  const url = new URL(path, WX_API_BASE)
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  })

  const payload = await response.json().catch(() => ({})) as { errcode?: number; errmsg?: string; [key: string]: unknown }
  if (!response.ok || (typeof payload?.errcode === 'number' && payload.errcode !== 0)) {
    throw new Error(payload?.errmsg || `WeChat API failed: ${path}`)
  }
  return payload
}

async function wxUploadForm(accessToken: string, path: string, searchParams: Record<string, string>, formData: FormData) {
  const url = new URL(path, WX_API_BASE)
  url.searchParams.set('access_token', accessToken)
  for (const [key, value] of Object.entries(searchParams || {})) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30_000),
  })

  const payload = await response.json().catch(() => ({})) as { errcode?: number; errmsg?: string; [key: string]: unknown }
  if (!response.ok || (typeof payload?.errcode === 'number' && payload.errcode !== 0)) {
    throw new Error(payload?.errmsg || `WeChat upload failed: ${path}`)
  }
  return payload
}

function decodeHtmlEntities(input: string): string {
  return String(input || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function inferFileName(url: string): string {
  const pathname = new URL(url).pathname
  const lastSegment = pathname.split('/').filter(Boolean).pop() || 'image'
  return lastSegment.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'image'
}

async function fetchRemoteImage(inputUrl: string, maxBytes: number, kind: 'content' | 'cover') {
  const input = new URL(decodeHtmlEntities(inputUrl))
  const candidates = [input.toString()]

  if (input.pathname.startsWith('/api/images/')) {
    const presets = kind === 'cover'
      ? [
          { w: '560', h: '315', fit: 'cover', q: '42', format: 'jpeg' },
          { w: '480', h: '270', fit: 'cover', q: '36', format: 'jpeg' },
          { w: '400', h: '225', fit: 'cover', q: '32', format: 'jpeg' },
          { w: '320', h: '180', fit: 'cover', q: '28', format: 'jpeg' },
        ]
      : [
          { w: '1280', q: '82', format: 'jpeg' },
          { w: '1080', q: '76', format: 'jpeg' },
          { w: '960', q: '70', format: 'jpeg' },
          { w: '840', q: '64', format: 'jpeg' },
          { w: '720', q: '58', format: 'jpeg' },
          { w: '640', q: '52', format: 'jpeg' },
        ]

    for (const preset of presets) {
      const next = new URL(input.toString())
      for (const [key, value] of Object.entries(preset)) {
        next.searchParams.set(key, value)
      }
      const candidate = next.toString()
      if (!candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }
  }

  for (const candidate of candidates) {
    try {
      let url = new URL(candidate)
      for (let redirects = 0; redirects < 4; redirects++) {
        const response = await fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
          headers: { 'User-Agent': 'bluew-blog/1.0' },
        })

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location) throw new Error('Redirect without Location')
          url = new URL(location, url)
          continue
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        const buffer = new Uint8Array(await response.arrayBuffer())

        if (buffer.byteLength > maxBytes) {
          break
        }

        return {
          buffer,
          contentType,
          url: url.toString(),
          fileName: inferFileName(url.toString()),
        }
      }
    } catch {
      continue
    }
  }

  const limitLabel = kind === 'cover' ? '64KB' : '1MB'
  throw new Error(`图片在自动压缩后仍超过微信 ${limitLabel} 限制`)
}

async function uploadContentImage(accessToken: string, sourceUrl: string): Promise<string> {
  const downloaded = await fetchRemoteImage(sourceUrl, REMOTE_IMAGE_LIMIT, 'content')
  const allowedTypes = ['image/jpeg', 'image/png']
  if (!allowedTypes.includes(downloaded.contentType)) {
    throw new Error(`Unsupported image type: ${downloaded.contentType}`)
  }

  const extension = downloaded.contentType.includes('png') ? 'png' : 'jpg'
  const baseName = downloaded.fileName.replace(/\.[a-z0-9]+$/i, '') || 'image'
  const blob = new Blob([downloaded.buffer], { type: downloaded.contentType })

  const formData = new FormData()
  formData.append('media', blob, `${baseName}.${extension}`)

  const payload = await wxUploadForm(accessToken, '/cgi-bin/media/uploadimg', {}, formData)
  const resultUrl = String(payload?.url || '').trim()
  if (!resultUrl) {
    throw new Error('WeChat uploadimg did not return url')
  }
  return resultUrl
}

async function uploadCoverThumb(accessToken: string, sourceUrl: string): Promise<string> {
  const downloaded = await fetchRemoteImage(sourceUrl, COVER_IMAGE_LIMIT, 'cover')
  const blob = new Blob([downloaded.buffer], { type: 'image/jpeg' })

  const formData = new FormData()
  formData.append('media', blob, 'cover.jpg')

  const payload = await wxUploadForm(accessToken, '/cgi-bin/material/add_material', { type: 'thumb' }, formData)
  const mediaId = String(payload?.media_id || '').trim()
  if (!mediaId) {
    throw new Error('WeChat add_material did not return media_id')
  }
  return mediaId
}

function extractFirstImageSource(html: string): string {
  const match = html.match(/<img\b[^>]*?\bsrc=(['"])(.*?)\1/i)
  return decodeHtmlEntities(match?.[2] || '')
}

async function replaceHtmlImageSources(html: string, replacer: (src: string) => Promise<string>): Promise<string> {
  const regex = /<img\b[^>]*?\bsrc=(['"])(.*?)\1/gi
  let result = ''
  let lastIndex = 0
  let match

  while ((match = regex.exec(html)) !== null) {
    const [fullMatch, quote, src] = match
    const start = match.index
    const end = start + fullMatch.length
    const newSrc = await replacer(src)
    const updatedTag = fullMatch.replace(`${quote}${src}${quote}`, `${quote}${newSrc}${quote}`)

    result += html.slice(lastIndex, start)
    result += updatedTag
    lastIndex = end
  }

  result += html.slice(lastIndex)
  return result
}

export async function publishToWechat(
  account: WechatDirectAccount,
  params: {
    title: string
    content_html: string
    author?: string
    digest?: string
    content_source_url?: string
    cover_image_url?: string
    publish_now?: boolean
    need_open_comment?: boolean
    only_fans_can_comment?: boolean
  },
): Promise<{
  success: boolean
  account: { id: string; name: string }
  media_id: string
  publish_id?: string
  msg_data_id?: string
}> {
  const accessToken = await getAccessToken(account.appid, account.secret)

  const imageCache = new Map<string, string>()
  const rewrittenContent = await replaceHtmlImageSources(params.content_html, async (src) => {
    const normalizedSrc = decodeHtmlEntities(src)
    if (!normalizedSrc || normalizedSrc.startsWith('data:')) {
      throw new Error('WeChat content does not support inline data URLs')
    }
    if (!imageCache.has(normalizedSrc)) {
      imageCache.set(normalizedSrc, await uploadContentImage(accessToken, normalizedSrc))
    }
    return imageCache.get(normalizedSrc)!
  })

  const coverImageUrl = (params.cover_image_url?.trim()) || extractFirstImageSource(params.content_html)
  if (!coverImageUrl) {
    throw new Error('Missing cover_image_url and no image found in article content')
  }

  const thumbMediaId = await uploadCoverThumb(accessToken, coverImageUrl)

  const draftPayload = await wxApiJson(accessToken, '/cgi-bin/draft/add', {
    articles: [
      {
        title: params.title,
        author: params.author || '',
        digest: params.digest || '',
        content: rewrittenContent,
        content_source_url: params.content_source_url || '',
        thumb_media_id: thumbMediaId,
        need_open_comment: params.need_open_comment ? 1 : 0,
        only_fans_can_comment: params.only_fans_can_comment ? 1 : 0,
      },
    ],
  })

  const mediaId = String(draftPayload?.media_id || '').trim()
  if (!mediaId) {
    throw new Error('WeChat draft/add did not return media_id')
  }

  const response = {
    success: true,
    account: { id: account.id, name: account.name },
    media_id: mediaId,
    publish_now: Boolean(params.publish_now),
  }

  if (!params.publish_now) {
    return response
  }

  const publishPayload = await wxApiJson(accessToken, '/cgi-bin/freepublish/submit', {
    media_id: mediaId,
  })

  return {
    ...response,
    publish_id: String(publishPayload?.publish_id || ''),
    msg_data_id: String(publishPayload?.msg_data_id || ''),
  }
}
