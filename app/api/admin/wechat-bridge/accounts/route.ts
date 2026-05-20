import type { NextRequest } from 'next/server'
import { ensureAuthenticatedRequest, getRouteEnvWithDb, jsonError, jsonOk } from '@/lib/server/route-helpers'
import { getWechatDirectConfig } from '@/lib/wechat-api'
import {
  assertWechatBridgeReady,
  fetchWechatBridgeJson,
  getWechatBridgeConfig,
  type WechatBridgeAccount,
} from '@/lib/wechat-bridge-config'

export async function GET(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const unauthorized = await ensureAuthenticatedRequest(req, route.db)
  if (unauthorized) return unauthorized

  try {
    // Return direct accounts first
    const directConfig = await getWechatDirectConfig(route.db, route.env)
    if (directConfig.accounts.length > 0) {
      return jsonOk({
        accounts: directConfig.accounts.map(a => ({ id: a.id, name: a.name })),
      })
    }

    // Fallback to bridge
    const config = assertWechatBridgeReady(await getWechatBridgeConfig(route.db, route.env))
    const response = await fetchWechatBridgeJson<{ accounts?: WechatBridgeAccount[] }>(config, '/v1/accounts')

    return jsonOk({
      accounts: response.accounts || [],
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '获取公众号账号列表失败', 500)
  }
}
