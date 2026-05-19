import { createDb } from '@/lib/db-adapter'

export async function getAppCloudflareContext() {
  const db = createDb()
  return {
    env: {
      DB: db,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      ADMIN_TOKEN_SALT: process.env.ADMIN_TOKEN_SALT,
      AI_CONFIG_ENCRYPTION_SECRET: process.env.AI_CONFIG_ENCRYPTION_SECRET,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      AI_API_KEY: process.env.AI_API_KEY,
      AI_BASE_URL: process.env.AI_BASE_URL,
      AI_MODEL: process.env.AI_MODEL,
      WORKERS_AI_MODEL: process.env.WORKERS_AI_MODEL,
      ENABLE_BACKGROUND_JOBS: process.env.ENABLE_BACKGROUND_JOBS,
      ENABLE_WORKERS_AI: process.env.ENABLE_WORKERS_AI,
      ENABLE_VECTOR_SEARCH: process.env.ENABLE_VECTOR_SEARCH,
      ENABLE_CF_IMAGE_PIPELINE: process.env.ENABLE_CF_IMAGE_PIPELINE,
    } as CloudflareEnv,
    ctx: { waitUntil: (promise: Promise<unknown>) => { promise.catch(() => {}) } },
  }
}

export async function getAppCloudflareEnv() {
  return (await getAppCloudflareContext()).env
}
