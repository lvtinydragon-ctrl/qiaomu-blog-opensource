import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'ai-setup endpoint is alive' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return NextResponse.json({ received: true, keys: Object.keys(body) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
