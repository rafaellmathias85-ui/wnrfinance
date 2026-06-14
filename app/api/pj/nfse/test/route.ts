export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';

/**
 * POST /api/pj/nfse/test
 * Emite uma NFS-e de teste em ambiente de HOMOLOGAÇÃO.
 * Sem valor fiscal real — apenas valida a integração com a Focus NFe e a prefeitura.
 *
 * Body:
 *   homologacaoToken  string  Token de homologação da Focus NFe (obrigatório)
 *   inscricaoMunicipal string  Inscrição Municipal (CCM) da empresa (obrigatório)
 *   tomadorNome       string  Nome do tomador (default: própria empresa)
 *   tomadorDoc        string  CPF/CNPJ do tomador (default: próprio CNPJ)
 *   valor             number  Valor do serviço em R$ (default: 100.00)
 *   discriminacao     string  Descrição do serviço (default: "TESTE DE HOMOLOGAÇÃO")
 *   serviceCode       string  Código LC 116 (default: "1.07")
 *   issRate           number  Alíquota ISS em % (default: 2)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

  const body = await req.json();
  const { homologacaoToken, inscricaoMunicipal } = body;

  if (!homologacaoToken) {
    return NextResponse.json({ error: 'homologacaoToken é obrigatório. Obtenha no painel Focus NFe → Detalhes da empresa → Token Homologação.' }, { status: 400 });
  }
  if (!inscricaoMunicipal) {
    return NextResponse.json({ error: 'inscricaoMunicipal (CCM) é obrigatório. Consulte a Prefeitura ou o alvará da empresa.' }, { status: 400 });
  }

  const features = (company.features as any) || {};
  const address = features.address || {};
  const cnpj = company.cnpj?.replace(/\D/g, '') || '';

  // IBGE municipality codes for common SP cities
  const IBGE_MAP: Record<string, string> = {
    'São Bernardo do Campo': '3548708',
    'São Paulo': '3550308',
    'Santo André': '3547809',
    'Diadema': '3513801',
    'Mauá': '3529401',
    'Guarulhos': '3518800',
    'Campinas': '4106902',
    'Ribeirão Preto': '3543402',
  };

  const cidade = address.cidade || '';
  const codigoMunicipio = IBGE_MAP[cidade] || '3548708'; // default SBC

  const valor = Number(body.valor) || 100.00;
  const serviceCode = body.serviceCode || '1.07';
  const issRate = Number(body.issRate) || 2.0;
  const discriminacao = body.discriminacao || `NOTA DE TESTE HOMOLOGAÇÃO - ${new Date().toLocaleDateString('pt-BR')} - ${company.name}`;
  const tomadorNome = body.tomadorNome || company.name;
  const tomadorDoc = (body.tomadorDoc || cnpj).replace(/\D/g, '');

  const ref = `nfse_hml_${Date.now()}`;

  const focusBody = {
    data_emissao: new Date().toISOString(),
    prestador: {
      cnpj,
      inscricao_municipal: inscricaoMunicipal.replace(/\D/g, ''),
      codigo_municipio: codigoMunicipio,
    },
    tomador: {
      ...(tomadorDoc.length === 11 ? { cpf: tomadorDoc } : { cnpj: tomadorDoc }),
      razao_social: tomadorNome,
      email: company.email || undefined,
    },
    servico: {
      aliquota: issRate,
      base_calculo: valor,
      discriminacao,
      iss_retido: '2', // não retido
      item_lista_servico: serviceCode,
      valor_servicos: valor,
      valor_deducoes: 0,
      codigo_municipio_prestacao: codigoMunicipio,
    },
  };

  const encoded = Buffer.from(`${homologacaoToken}:`).toString('base64');

  try {
    const res = await fetch(`https://homologacao.focusnfe.com.br/v2/nfse?ref=${ref}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(focusBody),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        success: false,
        error: 'Token de homologação inválido. Verifique no painel Focus NFe → Detalhes da empresa.',
        httpStatus: res.status,
      }, { status: 422 });
    }

    if (!res.ok && res.status !== 202) {
      return NextResponse.json({
        success: false,
        error: data.mensagem || JSON.stringify(data.erros || data),
        raw: data,
        httpStatus: res.status,
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      ref,
      status: data.status || 'processando',
      message: 'NFS-e de teste enviada para homologação com sucesso!',
      codigoVerificacao: data.codigo_verificacao || null,
      numero: data.numero || null,
      pdfUrl: data.caminho_pdf || data.url || null,
      xmlUrl: data.caminho_xml_nota_fiscal || data.xml || null,
      raw: data,
      payload: focusBody,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
