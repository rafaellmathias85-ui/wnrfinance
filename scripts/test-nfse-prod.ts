/**
 * Teste NFS-e via Focus NFe
 *
 * Uso:
 *   npx tsx scripts/test-nfse-prod.ts            # homologação (padrão)
 *   npx tsx scripts/test-nfse-prod.ts --prod      # produção
 *
 * ATENÇÃO — pré-requisitos para funcionar:
 *  1. A IM 298481 precisa estar habilitada para NFS-e eletrônica no portal
 *     da Prefeitura de São Bernardo do Campo (GINFES): https://nfse.sbc.sp.gov.br
 *     → Erro E160 = IM não autorizada no GINFES para emissão eletrônica.
 *  2. O token de produção só funciona após configurar o emitente no painel
 *     Focus NFe (https://focusnfe.com.br) para o CNPJ 21147041000185.
 *     → Erro 403 = emitente não configurado.
 */
const PROD_TOKEN = 'XPEpmrVSI5hSl3d6D8qGYC32qSolg12n';
const HML_TOKEN  = 'luV8HhnJNmr6RuvkPNA6CBEZSLWxyz42';
const CNPJ = '21147041000185';
const IM   = '298481';

const USE_PROD = process.argv.includes('--prod');
const TOKEN  = USE_PROD ? PROD_TOKEN : HML_TOKEN;
const ref    = `nfse_${USE_PROD ? 'prod' : 'hml'}_${Date.now()}`;

async function main() {
  const baseUrl = USE_PROD
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';

  console.log(`\nTestando ${USE_PROD ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'} | ref=${ref}\n`);

  const body = {
    data_emissao: new Date().toISOString(),
    prestador: {
      cnpj: CNPJ,
      inscricao_municipal: IM,
      codigo_municipio: '3548708', // São Bernardo do Campo
    },
    tomador: {
      cpf: '05221282461',
      razao_social: 'Rafael Lombardi',
      email: 'rafaellmathias85@gmail.com',
      municipio: 'São Bernardo do Campo',
      uf: 'SP',
      codigo_municipio: '3548708',
    },
    servico: {
      aliquota: 2,
      base_calculo: 100,
      discriminacao: 'Serviços de tecnologia da informação — TESTE',
      iss_retido: '2',
      item_lista_servico: '1.07',
      valor_servicos: 100,
      valor_deducoes: 0,
      valor_iss: 2,
      codigo_municipio: '3548708', // São Bernardo do Campo
    },
  };

  const encoded = Buffer.from(TOKEN + ':').toString('base64');
  const res = await fetch(`${baseUrl}/v2/nfse?ref=${ref}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`Status HTTP: ${res.status}`);
  try {
    const data = JSON.parse(text);
    console.log('Resposta:', JSON.stringify(data, null, 2));

    if (res.status === 202 || res.status === 200) {
      console.log('\nAguardando processamento (8s)...');
      await new Promise(r => setTimeout(r, 8000));

      const check = await fetch(`${baseUrl}/v2/nfse/${ref}`, {
        headers: { 'Authorization': `Basic ${encoded}` },
      });
      const checkData = await check.json();
      console.log(`\nStatus consulta (${check.status}):`, JSON.stringify(checkData, null, 2));

      if (checkData.status === 'erro_autorizacao') {
        const err = checkData.erros?.[0];
        if (err?.codigo === 'E160') {
          console.log('\n⚠️  E160: A IM', IM, 'não está habilitada para NFS-e eletrônica no GINFES de SBC.');
          console.log('    Acesse o portal da Prefeitura de SBC e ative a emissão eletrônica.');
        }
      }
    }
  } catch {
    console.log('Resposta raw:', text.slice(0, 500));
  }
}

main().catch(console.error);
