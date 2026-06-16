const https = require('https');
const fs = require('fs');
const { randomUUID } = require('crypto');

const cert = fs.readFileSync('/var/www/wnrfinance/ITAU/certs/certificado.crt');
const key  = fs.readFileSync('/var/www/wnrfinance/ITAU/certs/ARQUIVO_CHAVE_PRIVADA.key');
const agent = new https.Agent({ cert, key, rejectUnauthorized: true });

const id_boleto   = '72028250-efae-4db3-a603-519a442e5385';
const clientId    = '371dd04c-8b91-4cb5-8f37-7683aa826a7e';
const clientSecret = '9f390402-c054-4944-b512-51f91ec4ba5f';

function req(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({
      method: opts.method, hostname: u.hostname,
      path: u.pathname + u.search, headers: opts.headers,
      agent, timeout: 30000,
    }, (resp) => {
      const ch = [];
      resp.on('data', x => ch.push(x));
      resp.on('end', () => resolve({ s: resp.statusCode, h: resp.headers, b: Buffer.concat(ch).toString() }));
    });
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

(async () => {
  const td = await req('https://sts.itau.com.br/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const token = JSON.parse(td.b).access_token;
  console.log('Token OK');

  const h = { 'Authorization': 'Bearer ' + token, 'x-itau-apikey': clientId, 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() };

  const r1 = await req('https://secure.api.cloud.itau.com.br/boletoscash/v2/boletos/' + id_boleto + '/pdf', { method: 'GET', headers: h });
  console.log('PDF status:', r1.s, 'location:', r1.h.location || 'none');
  console.log('PDF body:', r1.b.slice(0, 400));

  const r2 = await req('https://secure.api.cloud.itau.com.br/boletoscash/v2/boletos/' + id_boleto + '/arquivo', { method: 'GET', headers: h });
  console.log('Arquivo status:', r2.s, 'location:', r2.h.location || 'none');
  console.log('Arquivo body:', r2.b.slice(0, 400));
})().catch(console.error);
