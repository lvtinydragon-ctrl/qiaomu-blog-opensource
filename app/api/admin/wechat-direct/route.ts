import type { NextRequest } from 'next/server'
import { ensureAuthenticatedRequest, getRouteEnvWithDb, jsonError, jsonOk, parseJsonBody } from '@/lib/server/route-helpers'
import {
  getWechatDirectPublicConfig,
  saveWechatDirectAccount,
  deleteWechatDirectAccount,
} from '@/lib/wechat-api'

export async function GET(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const unauthorized = await ensureAuthenticatedRequest(req, route.db)
  if (unauthorized) return unauthorized

  try {
    const config = await getWechatDirectPublicConfig(route.db)
    return jsonOk({ accounts: config.accounts })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '获取公众号配置失败', 500)
  }
}

export async function POST(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const unauthorized = await ensureAuthenticatedRequest(req, route.db)
  if (unauthorized) return unauthorized

  try {
    const body = await parseJsonBody<{
      id?: string
      name?: string
      appid?: string
      secret?: string
    }>(req)

    const name = (body.name || '').trim()
    const appid = (body.appid || '').trim()
    const secret = (body.secret || '').trim()

    if (!name) return jsonError('账号名称不能为空', 400)
    if (!appid) return jsonError('AppID 不能为空', 400)
    if (!secret) return jsonError('AppSecret 不能为空', 400)

    const account = await saveWechatDirectAccount(route.db, route.env, {
      id: body.id,
      name,
      appid,
      secret,
    })

    return jsonOk({ success: true, account })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '保存公众号配置失败', 500)
  }
}

export async function DELETE(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const unauthorized = await ensureAuthenticatedRequest(req, route.db)
  if (unauthorized) return unauthorized

  try {
    const body = await parseJsonBody<{ id?: string }>(req)
    const accountId = (body.id || '').trim()
    if (!accountId) return jsonError('缺少账号 ID', 400)

    await deleteWechatDirectAccount(route.db, accountId)
    return jsonOk({ success: true })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '删除公众号配置失败', 500)
  }
}
