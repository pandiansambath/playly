import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  // Only allow downloads from our R2 bucket
  if (!url.startsWith('https://pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev/')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const res = await fetch(url)
  if (!res.ok) return new NextResponse('Fetch failed', { status: 502 })

  const filename = url.split('/').pop() || 'photo.jpg'
  const headers = new Headers()
  headers.set('Content-Type', res.headers.get('Content-Type') || 'image/jpeg')
  headers.set('Content-Disposition', `attachment; filename="${filename}"`)
  headers.set('Cache-Control', 'public, max-age=86400')

  return new NextResponse(res.body, { headers })
}
