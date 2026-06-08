export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getFileUrl } from '@/lib/s3';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { cloud_storage_path, isPublic } = await request.json();
    if (!cloud_storage_path) {
      return NextResponse.json({ error: 'cloud_storage_path obrigatório' }, { status: 400 });
    }

    const url = await getFileUrl(cloud_storage_path, isPublic || false);
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Get URL error:', error);
    return NextResponse.json({ error: 'Erro ao obter URL' }, { status: 500 });
  }
}
