import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { testSmtpConfig, decryptPassword } from '@/lib/smtp';
import { safeDecrypt } from '@/lib/encrypt';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();

  let host: string, port: number, encryption: string, senderEmail: string, senderName: string, password: string;

  if (body.smtpConfigId) {
    const config = await prisma.smtpConfig.findFirst({ where: { id: body.smtpConfigId, companyId } });
    if (!config) return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 });
    host = config.host;
    port = config.port;
    encryption = config.encryption;
    senderEmail = config.senderEmail;
    senderName = config.senderName;
    const decrypted = safeDecrypt(config.encryptedPass);
    if (!decrypted) return NextResponse.json({ error: 'Erro ao descriptografar senha' }, { status: 500 });
    password = decrypted;
  } else {
    if (!body.host || !body.senderEmail || !body.password) {
      return NextResponse.json({ error: 'host, senderEmail e password são obrigatórios' }, { status: 400 });
    }
    host = body.host;
    port = Number(body.port) || 587;
    encryption = body.encryption || 'tls';
    senderEmail = body.senderEmail;
    senderName = body.senderName || body.senderEmail;
    password = body.password;
  }

  const testTo = body.testTo || senderEmail;
  const result = await testSmtpConfig(host, port, encryption, senderEmail, password, senderName, testTo);

  if (body.smtpConfigId) {
    await prisma.smtpConfig.update({
      where: { id: body.smtpConfigId },
      data: { lastTestedAt: new Date(), lastTestOk: result.success },
    });
  }

  return NextResponse.json(result);
}
