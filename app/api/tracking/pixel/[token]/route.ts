export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 1×1 transparent GIF (43 bytes)
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;

  if (token) {
    prisma.emailLog
      .updateMany({
        where: { trackingToken: token, openedAt: null },
        data: { openedAt: new Date() },
      })
      .catch(() => {});
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
