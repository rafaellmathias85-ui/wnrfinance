export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Asaas sends webhook events for payment status changes.
// Verify the token from the Asaas dashboard matches ASAAS_WEBHOOK_TOKEN env var.
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('asaas-access-token') || req.headers.get('access-token');
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expectedToken) {
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const a = Buffer.from(token.padEnd(expectedToken.length, '\0'));
      const b = Buffer.from(expectedToken);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    const { event, payment } = body;

    if (!payment?.externalReference) {
      return NextResponse.json({ ok: true });
    }

    // externalReference is the BoletoCharge.id we store when creating the charge
    const chargeId = payment.externalReference;

    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      await prisma.boletoCharge.updateMany({
        where: { id: chargeId },
        data: {
          status: 'pago',
          paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
          paidAmount: payment.value ?? undefined,
        },
      });

      // Mark the linked AccountsReceivable as received
      const charge = await prisma.boletoCharge.findUnique({
        where: { id: chargeId },
        select: { receivableId: true, amount: true },
      });
      if (charge?.receivableId) {
        await prisma.accountsReceivable.updateMany({
          where: { id: charge.receivableId },
          data: {
            status: 'recebido',
            amountReceived: payment.value ?? charge.amount,
            receivedAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
          },
        });
      }
    } else if (event === 'PAYMENT_OVERDUE') {
      await prisma.boletoCharge.updateMany({
        where: { id: chargeId },
        data: { status: 'vencido' },
      });
    } else if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') {
      await prisma.boletoCharge.updateMany({
        where: { id: chargeId },
        data: { status: 'cancelado' },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Asaas webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
