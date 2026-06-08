export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, maskSecret } from '@/lib/encrypt';

const PROVIDER_CATALOG = [
  // NF-e
  { key: 'focusnfe', name: 'Focus NF-e', category: 'nfe', description: 'Emissão de NF-e, NFS-e e CT-e — recomendado', docs: 'https://focusnfe.com.br/doc/', fields: [{ key: 'apiKey', label: 'Token de API', secret: true }, { key: 'cnpj', label: 'CNPJ do emitente', secret: false }, { key: 'environment', label: 'Ambiente', type: 'select', options: ['homologacao', 'producao'], secret: false }] },
  { key: 'nfe_io', name: 'NFe.io', category: 'nfe', description: 'Emissão de Notas Fiscais Eletrônicas', docs: 'https://nfe.io/docs/', fields: [{ key: 'apiKey', label: 'API Key', secret: true }, { key: 'companyId', label: 'Company ID', secret: false }, { key: 'environment', label: 'Ambiente', type: 'select', options: ['homologacao', 'producao'], secret: false }] },
  { key: 'tecnospeed', name: 'TecnoSpeed', category: 'nfe', description: 'Emissão de NF-e, NFS-e e CT-e', docs: 'https://tecnospeed.com.br', fields: [{ key: 'apiKey', label: 'API Key', secret: true }, { key: 'cnpj', label: 'CNPJ', secret: false }] },
  // Boleto/PIX
  { key: 'asaas', name: 'Asaas', category: 'boleto', description: 'Boleto, PIX e cartão — recomendado', docs: 'https://docs.asaas.com', fields: [{ key: 'apiKey', label: 'API Key', secret: true }, { key: 'environment', label: 'Ambiente', type: 'select', options: ['sandbox', 'producao'], secret: false }] },
  { key: 'gerencianet', name: 'Gerencianet/Efí', category: 'boleto', description: 'Boletos e cobranças PIX', docs: 'https://dev.efipay.com.br/docs/', fields: [{ key: 'clientId', label: 'Client ID', secret: false }, { key: 'clientSecret', label: 'Client Secret', secret: true }] },
  { key: 'inter_boleto', name: 'Banco Inter', category: 'boleto', description: 'Boletos via API Inter', docs: 'https://developers.inter.co', fields: [{ key: 'clientId', label: 'Client ID', secret: false }, { key: 'clientSecret', label: 'Client Secret', secret: true }, { key: 'contaCorrente', label: 'Conta Corrente', secret: false }] },
  { key: 'bb_boleto', name: 'Banco do Brasil', category: 'boleto', description: 'Boletos via API BB', docs: 'https://developers.bb.com.br', fields: [{ key: 'clientId', label: 'Client ID', secret: false }, { key: 'clientSecret', label: 'Client Secret', secret: true }] },
  // Banco / Open Finance
  { key: 'pluggy', name: 'Pluggy', category: 'banco', description: 'Open Finance Brasil — recomendado', docs: 'https://docs.pluggy.ai', fields: [{ key: 'clientId', label: 'Client ID', secret: false }, { key: 'clientSecret', label: 'Client Secret', secret: true }] },
  { key: 'belvo', name: 'Belvo', category: 'banco', description: 'Agregador bancário', docs: 'https://belvo.com/docs', fields: [{ key: 'secretId', label: 'Secret ID', secret: false }, { key: 'secretPassword', label: 'Secret Password', secret: true }] },
  // Investimentos
  { key: 'xp_api', name: 'XP Investimentos', category: 'investimento', description: 'Dados de carteira XP', docs: 'https://xpinvestimentos.com', fields: [{ key: 'apiKey', label: 'API Key', secret: true }] },
  { key: 'btg_api', name: 'BTG Pactual', category: 'investimento', description: 'Integração com BTG', docs: 'https://btgpactual.com', fields: [{ key: 'apiKey', label: 'API Key', secret: true }] },
  // Pagamento
  { key: 'stripe', name: 'Stripe', category: 'pagamento', description: 'Gateway de pagamentos online', docs: 'https://stripe.com/docs', fields: [{ key: 'apiKey', label: 'Secret Key', secret: true }, { key: 'webhookSecret', label: 'Webhook Secret', secret: true }] },
  { key: 'mercadopago', name: 'Mercado Pago', category: 'pagamento', description: 'Gateway de pagamentos', docs: 'https://mercadopago.com.br/developers', fields: [{ key: 'accessToken', label: 'Access Token', secret: true }] },
  // WhatsApp
  { key: 'whatsapp_api', name: 'WhatsApp Business', category: 'whatsapp', description: 'Notificações via WhatsApp', docs: 'https://business.whatsapp.com', fields: [{ key: 'apiKey', label: 'API Key', secret: true }, { key: 'phoneId', label: 'Phone ID', secret: false }] },
];

// Fields that must be encrypted when stored
const SECRET_FIELDS = new Set(['apiKey', 'clientSecret', 'secretPassword', 'accessToken', 'webhookSecret', 'token', 'password']);

function encryptConfig(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(key) && typeof value === 'string' && value) {
      result[key] = encrypt(value);
      result[`${key}_masked`] = maskSecret(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// GET: list connections for company + available providers
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const connections = await prisma.companyConnection.findMany({
    where: { companyId },
    orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
  });

  return NextResponse.json({ connections, catalog: PROVIDER_CATALOG });
}

// POST: create connection
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await request.json();
  const { providerKey, displayName, category, config } = body;

  if (!providerKey || !displayName) {
    return NextResponse.json({ error: 'providerKey e displayName são obrigatórios' }, { status: 400 });
  }

  const safeConfig = config ? encryptConfig(config) : {};

  const connection = await prisma.companyConnection.create({
    data: {
      companyId,
      providerKey,
      displayName,
      category: category || 'outros',
      config: safeConfig,
      status: 'pendente',
    },
  });

  return NextResponse.json(connection, { status: 201 });
}
