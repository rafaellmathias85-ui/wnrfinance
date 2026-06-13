import path from 'path';
import { ItauBoletoService } from './service';
import { ItauWebhookHandler } from './webhook';

// Resolve paths from project root regardless of CWD
const root = process.cwd();

export const itauService = new ItauBoletoService({
  clientId:     process.env.ITAU_CLIENT_ID!,
  clientSecret: process.env.ITAU_CLIENT_SECRET!,
  certPath:     path.resolve(root, process.env.ITAU_CERT_PATH ?? 'ITAU/certs/certificado.crt'),
  keyPath:      path.resolve(root, process.env.ITAU_KEY_PATH  ?? 'ITAU/certs/ARQUIVO_CHAVE_PRIVADA.key'),
});

export const itauWebhookHandler = new ItauWebhookHandler({
  webhookClientId:     process.env.ITAU_WEBHOOK_CLIENT_ID!,
  webhookClientSecret: process.env.ITAU_WEBHOOK_CLIENT_SECRET!,

  onBaixaRecebida: async (boletos) => {
    const { prisma } = await import('@/lib/prisma');
    for (const boleto of boletos) {
      // nossoNumero is stored in providerChargeId when the boleto is emitted
      await prisma.boletoCharge.updateMany({
        where: { providerChargeId: boleto.numeroNossoNumero },
        data: {
          status:    'pago',
          paidAt:    new Date(boleto.dataInclusaoPagamento),
          paidAmount: parseFloat(boleto.valorPagoTotalCobranca),
        },
      });
    }
  },

  onErro: (err, payload) => {
    console.error('[Itaú Webhook] erro ao processar baixa:', err.message, payload);
  },
});
