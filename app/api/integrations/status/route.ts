import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pluggy } from '@/lib/open-finance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Do not expose credentials — only boolean status
    const companyId = session.user.activeCompanyId ?? null;
    const pluggyConfigured = await pluggy.isConfiguredForCompany(companyId);

    let pluggyHealthy = false;
    let pluggyError: string | null = null;
    if (pluggyConfigured) {
      try {
        await pluggy.getApiKey(companyId);
        pluggyHealthy = true;
      } catch (e: any) {
        pluggyError = e?.message?.slice(0, 200) || 'Erro ao autenticar com Pluggy';
      }
    }

    return NextResponse.json({
      integrations: {
        pluggy: {
          configured: pluggyConfigured,
          healthy: pluggyHealthy,
          error: pluggyError,
          docsUrl: 'https://pluggy.ai',
          signupUrl: 'https://dashboard.pluggy.ai/signup',
          envVarsRequired: ['PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET'],
        },
      },
    });
  } catch (error: any) {
    console.error('[integrations/status]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
