'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'

interface BridgeConfig {
  enabled: boolean
  base_url: string
  token_masked: string
  configured: boolean
}

interface BridgeAccount {
  id: string
  name: string
}

interface DirectAccount {
  id: string
  name: string
  appid_masked: string
}

const EMPTY_CONFIG: BridgeConfig = {
  enabled: false,
  base_url: '',
  token_masked: '',
  configured: false,
}

export function WeChatBridgeManager() {
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [refreshingAccounts, setRefreshingAccounts] = useState(false)
  const [savingDirect, setSavingDirect] = useState(false)

  const [config, setConfig] = useState<BridgeConfig>(EMPTY_CONFIG)
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<BridgeAccount[]>([])
  const [testMessage, setTestMessage] = useState('')

  // Direct mode state
  const [directAccounts, setDirectAccounts] = useState<DirectAccount[]>([])
  const [directName, setDirectName] = useState('')
  const [directAppId, setDirectAppId] = useState('')
  const [directSecret, setDirectSecret] = useState('')
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)

  const loadAccounts = async () => {
    setRefreshingAccounts(true)
    try {
      const res = await fetch('/api/admin/wechat-bridge/accounts')
      const data = await res.json().catch(() => ({})) as { accounts?: BridgeAccount[]; error?: string }
      if (!res.ok) throw new Error(data.error || '加载公众号账号失败')
      setAccounts(data.accounts || [])
    } catch {
      setAccounts([])
    } finally {
      setRefreshingAccounts(false)
    }
  }

  const loadDirectAccounts = async () => {
    try {
      const res = await fetch('/api/admin/wechat-direct')
      const data = await res.json().catch(() => ({})) as { accounts?: DirectAccount[]; error?: string }
      if (!res.ok) throw new Error(data.error || '加载直接配置失败')
      setDirectAccounts(data.accounts || [])
    } catch {
      setDirectAccounts([])
    }
  }

  const loadConfig = async () => {
    setLoading(true)
    try {
      const [bridgeRes, directRes] = await Promise.all([
        fetch('/api/admin/wechat-bridge'),
        fetch('/api/admin/wechat-direct'),
      ])

      const bridgeData = await bridgeRes.json().catch(() => ({})) as { config?: BridgeConfig; error?: string }
      if (bridgeRes.ok && bridgeData.config) {
        const nextConfig = bridgeData.config
        setConfig(nextConfig)
        setBaseUrl(nextConfig.base_url || '')
        setToken('')

        if (nextConfig.enabled && nextConfig.configured) {
          void loadAccounts()
        }
      }

      const directData = await directRes.json().catch(() => ({})) as { accounts?: DirectAccount[]; error?: string }
      if (directRes.ok) {
        setDirectAccounts(directData.accounts || [])
      }
    } catch {
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setTestMessage('')

    try {
      const payload = {
        enabled: config.enabled,
        base_url: normalizeBaseUrl(baseUrl),
        token: token.trim(),
      }

      const res = await fetch('/api/admin/wechat-bridge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({})) as { config?: BridgeConfig; error?: string }
      if (!res.ok) throw new Error(data.error || '保存 bridge 配置失败')

      const nextConfig = data.config || EMPTY_CONFIG
      setConfig(nextConfig)
      setBaseUrl(nextConfig.base_url || '')
      setToken('')
      toast.success('Bridge 配置已保存')

      if (nextConfig.enabled && nextConfig.configured) {
        await loadAccounts()
      } else {
        setAccounts([])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存 bridge 配置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestMessage('')

    try {
      const res = await fetch('/api/admin/wechat-bridge/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: normalizeBaseUrl(baseUrl),
          token: token.trim(),
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        success?: boolean
        accounts?: BridgeAccount[]
        error?: string
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Bridge 连接测试失败')
      }

      const nextAccounts = data.accounts || []
      setAccounts(nextAccounts)
      setTestMessage(`连接成功，可用公众号 ${nextAccounts.length} 个`)
      toast.success('Bridge 连接正常')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bridge 连接测试失败'
      setTestMessage(message)
      toast.error(message)
    } finally {
      setTesting(false)
    }
  }

  const handleSaveDirect = async () => {
    setSavingDirect(true)
    try {
      const res = await fetch('/api/admin/wechat-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccountId || undefined,
          name: directName.trim(),
          appid: directAppId.trim(),
          secret: directSecret.trim(),
        }),
      })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败')

      toast.success(editingAccountId ? '账号已更新' : '公众号账号已添加')
      setDirectName('')
      setDirectAppId('')
      setDirectSecret('')
      setEditingAccountId(null)
      await loadDirectAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存公众号配置失败')
    } finally {
      setSavingDirect(false)
    }
  }

  const handleDeleteDirect = async (accountId: string) => {
    try {
      const res = await fetch('/api/admin/wechat-direct', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId }),
      })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error || '删除失败')

      toast.success('账号已删除')
      await loadDirectAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    }
  }

  const handleEditDirect = (account: DirectAccount) => {
    setEditingAccountId(account.id)
    setDirectName(account.name)
    setDirectAppId('')
    setDirectSecret('')
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-panel)] p-5 text-sm text-[var(--editor-muted)]">
        正在加载公众号配置…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Direct Account Management */}
      <section className="rounded-2xl border border-[var(--editor-accent)]/25 bg-[var(--editor-panel)] p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--editor-ink)]">公众号直连（推荐）</h3>
          <p className="text-sm text-[var(--editor-muted)]">
            直接配置公众号 AppID 和 AppSecret，无需 Bridge 服务器。密钥加密存储在数据库中。
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--editor-line)] bg-[var(--background)]">
          {directAccounts.length > 0 ? (
            <ul className="divide-y divide-[var(--editor-line)]">
              {directAccounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--editor-ink)]">{account.name}</div>
                    <div className="mt-1 text-xs text-[var(--editor-muted)]">AppID: {account.appid_masked}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditDirect(account)}
                      className="rounded-lg border border-[var(--editor-line)] px-2 py-1 text-xs text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)]"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDirect(account.id)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6 text-sm text-[var(--editor-muted)]">
              还没有配置公众号账号，请添加。
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                账号名称
              </label>
              <input
                type="text"
                value={directName}
                onChange={(e) => setDirectName(e.target.value)}
                placeholder="如：蓝白界"
                className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                AppID
              </label>
              <input
                type="text"
                value={directAppId}
                onChange={(e) => setDirectAppId(e.target.value)}
                placeholder={editingAccountId ? '留空表示不修改' : 'wx...'}
                className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                AppSecret
              </label>
              <input
                type="password"
                value={directSecret}
                onChange={(e) => setDirectSecret(e.target.value)}
                placeholder={editingAccountId ? '留空表示不修改' : '公众号后台获取'}
                className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingAccountId && (
              <button
                type="button"
                onClick={() => { setEditingAccountId(null); setDirectName(''); setDirectAppId(''); setDirectSecret('') }}
                className="rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)]"
              >
                取消编辑
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSaveDirect()}
              disabled={savingDirect}
              className="rounded-lg bg-[var(--editor-accent)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {savingDirect ? '保存中…' : editingAccountId ? '更新账号' : '添加账号'}
            </button>
          </div>
        </div>
      </section>

      {/* Bridge Mode (Advanced) */}
      <details className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-panel)]">
        <summary className="cursor-pointer select-none p-5 text-sm font-semibold text-[var(--editor-muted)] hover:text-[var(--editor-ink)]">
          高级：Bridge 中间服务器模式
        </summary>
        <div className="space-y-5 px-5 pb-5">
          <section>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[var(--editor-ink)]">Bridge 连接</h3>
                <p className="text-sm text-[var(--editor-muted)]">
                  AppID/Secret 保存在 VPS bridge 上，博客只保存 bridge 地址和鉴权 token。
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-[var(--editor-ink)]">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(event) => setConfig(prev => ({ ...prev, enabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-[var(--editor-line)]"
                />
                启用 bridge
              </label>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                  Bridge Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://bridge.example.com"
                  className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                  Bridge Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={config.token_masked ? `已保存：${config.token_masked}；留空表示不修改` : '输入 bridge token'}
                  className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
                />
              </div>
            </div>

            {testMessage && (
              <div className="mt-4 rounded-xl border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-muted)]">
                {testMessage}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={testing}
                className="rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50"
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-lg bg-[var(--editor-accent)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--editor-ink)]">Bridge 公众号列表</h3>
                <p className="mt-1 text-sm text-[var(--editor-muted)]">
                  Bridge 返回的可用公众号账号。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAccounts()}
                disabled={refreshingAccounts || !config.enabled || !config.configured}
                className="rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50"
              >
                {refreshingAccounts ? '刷新中…' : '刷新列表'}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--editor-line)] bg-[var(--background)]">
              {accounts.length > 0 ? (
                <ul className="divide-y divide-[var(--editor-line)]">
                  {accounts.map((account) => (
                    <li key={account.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[var(--editor-ink)]">{account.name}</div>
                        <div className="mt-1 text-xs text-[var(--editor-muted)]">{account.id}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-6 text-sm text-[var(--editor-muted)]">
                  {config.enabled && config.configured
                    ? 'Bridge 已连接，但还没有返回可用公众号账号。'
                    : '先配置并启用 bridge，再从 bridge 拉取公众号列表。'}
                </div>
              )}
            </div>
          </section>
        </div>
      </details>
    </div>
  )
}
