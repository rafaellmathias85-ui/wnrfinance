import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendFinancialWhatsApp } from '@/lib/whatsapp-financial';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  if (!body.phone || !body.type || !body.customerName || !body.amount) {
    return NextResponse.json({ error: 'phone, type, customerName e amount são obrigatórios' }, { status: 400 });
  }

  const result = await sendFinancialWhatsApp(companyId, {
    phone: body.phone,
    type: body.type,
    customerName: body.customerName,
    amount: Number(body.amount),
    dueDate: body.dueDate,
    documentNumber: body.documentNumber,
    pixCode: body.pixCode,
    boletoCode: body.boletoCode,
    paymentLink: body.paymentLink,
    pdfUrl: body.pdfUrl,
    companyName: body.companyName,
    daysOverdue: body.daysOverdue,
    contextId: body.contextId,
    contextType: body.contextType,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Erro ao enviar' }, { status: 400 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
