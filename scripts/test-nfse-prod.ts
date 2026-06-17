/**
 * Teste NFS-e via Focus NFe — SBC GINFES
 *
 * Uso:
 *   npx tsx scripts/test-nfse-prod.ts            # homologação
 *   npx tsx scripts/test-nfse-prod.ts --prod      # produção
 *
 * PENDENTE: confirmar o valor correto de codigo_tributario_municipio.
 *   O guide Focus NFe para SBC mostra "7.01/108811/1271" para serviço 7.01.
 *   Para serviço 1.07 (TI), verificar no XML de uma NFS-e emitida pelo Bom Controle:
 *   campo <CodigoTributacaoMunicipio> dentro do RPS.
 */
const PROD_TOKEN = 'XPEpmrVSI5hSl3d6D8qGYC32qSolg12n';
const HML_TOKEN  = 'luV8HhnJNmr6RuvkPNA6CBEZSLWxyz42';
const CNPJ = '21147041000185';
const IM   = '298481';

// Número de RPS alto para evitar colisão com Bom Controle
const NUMERO_RPS = 10007;

// Código tributário SBC confirmado via NFS-e 2577 (Bom Controle, junho/2026).
// Coluna "Cód. Atividade / Cód. Serviço" → "1.07 / 1.07/102320/1234"
const CODIGO_TRIBUTARIO = '1.07/102320/1234';

const USE_PROD = process.argv.includes('--prod');
const TOKEN  = USE_PROD ? PROD_TOKEN : HML_TOKEN;
const ref    = `nfse_${USE_PROD ? 'prod' : 'hml'}_${Date.now()}`;

async function poll(baseUrl: string, encoded: string, maxWaitMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 10000));
    const check = await fetch(`${baseUrl}/v2/nfse/${ref}`, {
      headers: { 'Authorization': `Basic ${encoded}` },
    });
    const data = await check.json();
    const status = data.status;
    console.log(`  t+${Math.round((Date.now() - start) / 1000)}s → status=${status}`);

    if (!['requisicao', 'processando_autorizacao', 'em_processamento'].includes(status)) {
      if (status === 'autorizado') {
        console.log('\n✓ Autorizado!');
        console.log('  numero_nfse :', data.numero_nfse || data.numero);
        console.log('  verificacao :', data.codigo_verificacao);
        console.log('  pdf         :', data.caminho_pdf_nfse || data.caminho_nfse_pdf);
        console.log('  xml         :', data.caminho_xml_nfse);
      } else if (status === 'erro_autorizacao') {
        const erros: any[] = data.erros || [];
        console.log('\n✗ Erro de autorização GINFES:');
        for (const e of erros) {
          console.log(`  [${e.codigo}] ${e.mensagem}`);
          if (e.codigo === 'E183') {
            console.log('  → Ainda falta CodigoTributacaoMunicipio. Verificar valor correto no XML do Bom Controle.');
          }
          if (e.codigo === 'E10') {
            console.log('  → RPS já usado. Aumentar NUMERO_RPS acima do último emitido pelo Bom Controle.');
          }
        }
      } else {
        console.log('Resposta final:', JSON.stringify(data, null, 2));
      }
      return;
    }
  }
  console.log('Timeout — GINFES não respondeu em', maxWaitMs / 1000, 's');
}

async function main() {
  const baseUrl = USE_PROD
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';

  console.log(`\nTestando ${USE_PROD ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'} | ref=${ref} | rps=${NUMERO_RPS}\n`);

  // Focus NFe guide para SBC usa offset -0300, não Z. Enviar em horário de Brasília.
  const now = new Date();
  const brOffset = -3 * 60;
  const brDate = new Date(now.getTime() + (brOffset - now.getTimezoneOffset()) * 60000);
  const dataEmissao = brDate.toISOString().replace('Z', '-0300');

  const body = {
    data_emissao: dataEmissao,
    natureza_operacao: 1,
    optante_simples_nacional: true,
    numero_rps: NUMERO_RPS,
    serie_rps: 'RPS',
    prestador: {
      cnpj: CNPJ,
      inscricao_municipal: IM,
      codigo_municipio: 3548708,
    },
    tomador: {
      cpf: '05221282461',
      razao_social: 'Rafael Lombardi',
      email: 'rafaellmathias85@gmail.com',
      telefone: '11999999999',
      endereco: {
        logradouro: 'Rua Marechal Deodoro',
        numero: '100',
        bairro: 'Centro',
        codigo_municipio: 3548708,
        uf: 'SP',
        cep: '09710050',
      },
    },
    // regime_especial_tributacao: Focus NFe exige valor 1-6 para Simples Nacional (E166 sem ele, XSD rejeita 0).
    // Bom Controle envia XML direto sem essa validação → exibe "0 - Nenhum".
    // Via Focus NFe → usamos 6 (ME/EPP), que passa o XSD e o E166.
    regime_especial_tributacao: 6,
    servico: {
      aliquota: 2,
      base_calculo: 100,
      discriminacao: 'Serviços de tecnologia da informação — TESTE',
      iss_retido: false,
      item_lista_servico: '1.07',
      valor_servicos: 100,
      valor_deducoes: 0,
      valor_iss: 2,
      codigo_municipio: 3548708,
      codigo_tributario_municipio: CODIGO_TRIBUTARIO,
    },
  };

  console.log('Payload:\n', JSON.stringify(body, null, 2));
  const encoded = Buffer.from(TOKEN + ':').toString('base64');

  const res = await fetch(`${baseUrl}/v2/nfse?ref=${ref}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`\nPOST HTTP ${res.status}`);
  let data: any;
  try { data = JSON.parse(text); } catch { console.log('raw:', text.slice(0, 400)); return; }
  console.log('Resposta inicial:', JSON.stringify(data, null, 2));

  if (res.status === 202 || res.status === 200) {
    console.log('\nAguardando GINFES (até 90s)...');
    await poll(baseUrl, encoded);
  }
}

main().catch(console.error);
