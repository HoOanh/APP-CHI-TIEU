import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const chatUrl = new URL('/chat', request.nextUrl.origin);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>${chatUrl.href}</string></dict></plist>`, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="Ghi-nhanh-ARC.webloc"',
      'Cache-Control': 'no-store',
    },
  });
}
