import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Storage 파일을 프록시로 제공하는 API 라우트
 * URL 형식: /api/storage/{bucket}/{path...}
 * 예: /api/storage/submissions/student_tasks/abc123/image.jpg
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params

    if (!pathSegments || pathSegments.length < 2) {
      return NextResponse.json(
        { error: 'Invalid path. Expected format: /api/storage/{bucket}/{path}' },
        { status: 400 }
      )
    }

    const [bucket, ...restPath] = pathSegments
    const filePath = restPath.join('/')

    if (!bucket || !filePath) {
      return NextResponse.json(
        { error: 'Bucket and file path are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 파일 다운로드
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(filePath)

    if (error) {
      console.error('[api/storage] download error:', error)
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // MIME 타입 추론
    const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
    }
    const contentType = mimeTypes[extension] ?? 'application/octet-stream'

    // Blob을 ArrayBuffer로 변환
    const arrayBuffer = await data.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[api/storage] unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

