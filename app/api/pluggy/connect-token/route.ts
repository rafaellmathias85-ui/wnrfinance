import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pluggy } from '@/lib/open-finance';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId ?? null;

    if (!(await pluggy.isConfiguredForCompany(companyId))) {
      return NextResponse.json({
        error: 'Integração Open Finance não configurada.',
        hint: 'Configure as credenciais Pluggy em Configurações > Integrações.',
      }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const { itemId } = body;

    const baseUrl = process.env.NEXTAUTH_URL || '';
    const webhookUrl = baseUrl.startsWith('https://') ? `${baseUrl}/api/pluggy/webhook` : undefined;

    const accessToken = await pluggy.createConnectToken({
      itemId,
      clientUserId: session.user.id,
      webhookUrl,
      companyId,
    });

    return NextResponse.json({ accessToken });
  } catch (error: any) {
    console.error('[pluggy/connect-token]', error);
    return NextResponse.json({ error: 'Erro ao gerar token' }, { status: 500 });
  }
}
