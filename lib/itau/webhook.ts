// ============================================================
// Itaú Webhook Handler - WnrFinance
// Receptor de notificações de baixa para conciliação bancária
// ============================================================
//
// COMO FUNCIONA:
//   1. Você cadastra este endpoint no Itaú via WebhookCadastro
//   2. O Itaú autentica usando OAuth2 (client_credentials) no SEU servidor
//   3. O Itaú POST os dados de baixa de boleto neste endpoint
//   4. Você processa e registra a conciliação no WnrFinance
//
// REQUISITOS DO ENDPOINT:
//   - HTTPS obrigatório
//   - Implementar /auth endpoint que retorna Bearer token
//   - Responder 200 OK em até poucos segundos
// ============================================================

import crypto from 'crypto';
import { WebhookBoletoNotificado, WebhookNotificacaoPayload } from './types';

// ---- Tipos auxiliares ----

export interface WebhookConfig {
  /**
   * client_id e client_secret que VOCÊ gerou para o Itaú autenticar no seu servidor.
   * Estes valores são os que você informa em webhook_client_id e webhook_client_secret
   * ao cadastrar o webhook no Itaú.
   */
  webhookClientId:     string;
  webhookClientSecret: string;

  /**
   * Função chamada quando chega uma notificação de baixa.
   * Implemente a lógica de conciliação do WnrFinance aqui.
   */
  onBaixaRecebida: (boletos: WebhookBoletoNotificado[]) => Promise<void>;

  /**
   * (Opcional) Função chamada em caso de erro no processamento.
   */
  onErro?: (err: Error, payload: unknown) => void;
}

export interface TokenStore {
  token: string;
  expiresAt: number;
}

// ============================================================
// Handler principal (framework-agnóstico)
// ============================================================

export class ItauWebhookHandler {
  private config: WebhookConfig;
  private tokenStore: Map<string, TokenStore> = new Map();

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  // ----------------------------------------------------------
  // A) Endpoint de autenticação — o Itaú chama ANTES de notificar
  //
  //    POST /itau/auth
  //    Body: grant_type=client_credentials
  //    Header: Authorization: Basic base64(client_id:client_secret)
  //
  //    Retorna: { access_token, token_type, expires_in }
  // ----------------------------------------------------------
  handleAuth(authHeader: string | undefined): {
    status: number;
    body: object;
  } {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return { status: 401, body: { error: 'unauthorized' } };
    }

    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [clientId, clientSecret] = decoded.split(':');

    if (
      clientId !== this.config.webhookClientId ||
      clientSecret !== this.config.webhookClientSecret
    ) {
      return { status: 401, body: { error: 'invalid_client' } };
    }

    // Gera token interno para validar as notificações subsequentes
    const token = crypto.randomBytes(32).toString('hex');
    const expiresIn = 3600; // 1 hora
    this.tokenStore.set(token, { token, expiresAt: Date.now() + expiresIn * 1000 });

    return {
      status: 200,
      body: {
        access_token: token,
        token_type:   'Bearer',
        expires_in:   expiresIn,
      },
    };
  }

  // ----------------------------------------------------------
  // B) Endpoint de notificação — o Itaú envia os dados de baixa
  //
  //    POST /itau/webhook/boletos
  //    Header: Authorization: Bearer <token_obtido_em_/auth>
  //    Body: WebhookNotificacaoPayload
  // ----------------------------------------------------------
  async handleNotificacao(
    authHeader: string | undefined,
    payload: WebhookNotificacaoPayload
  ): Promise<{ status: number; body: object }> {
    // Valida o token Bearer
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { status: 401, body: { error: 'unauthorized' } };
    }

    const token = authHeader.slice(7);
    const stored = this.tokenStore.get(token);

    if (!stored || Date.now() > stored.expiresAt) {
      this.tokenStore.delete(token);
      return { status: 401, body: { error: 'token_expired' } };
    }

    try {
      await this.config.onBaixaRecebida(payload.boletos);
      return { status: 200, body: { message: 'ok' } };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.config.onErro?.(error, payload);
      // Retornar 500 fará o Itaú tentar reenviar
      return { status: 500, body: { error: 'processing_error' } };
    }
  }

  /** Limpa tokens expirados (chamar periodicamente) */
  limparTokensExpirados(): void {
    const agora = Date.now();
    for (const [key, val] of this.tokenStore.entries()) {
      if (agora > val.expiresAt) this.tokenStore.delete(key);
    }
  }
}

// ============================================================
// Adaptadores para frameworks populares
// ============================================================

/**
 * Express.js — adicione ao seu router:
 *
 * ```ts
 * import express from 'express';
 * import { criarRotasExpressItau } from './itau-webhook.handler';
 *
 * const handler = new ItauWebhookHandler({ ... });
 * const router  = criarRotasExpressItau(handler);
 * app.use('/itau', router);
 * ```
 */
export function criarRotasExpressItau(handler: ItauWebhookHandler) {
  // Importação lazy para não forçar dependência do Express
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Router } = require('express') as typeof import('express');
  const router = Router();

  // Endpoint de autenticação (o Itaú obtém token aqui)
  router.post('/auth', (req: { headers: Record<string, string> }, res: { status: (n: number) => { json: (b: object) => void } }) => {
    const result = handler.handleAuth(req.headers['authorization']);
    res.status(result.status).json(result.body);
  });

  // Endpoint de notificação de baixa
  router.post(
    '/webhook/boletos',
    async (
      req: { headers: Record<string, string>; body: WebhookNotificacaoPayload },
      res: { status: (n: number) => { json: (b: object) => void } }
    ) => {
      const result = await handler.handleNotificacao(
        req.headers['authorization'],
        req.body
      );
      res.status(result.status).json(result.body);
    }
  );

  return router;
}

// ============================================================
// Exemplo de uso no WnrFinance
// ============================================================
//
// import { ItauWebhookHandler, criarRotasExpressItau } from './itau-webhook.handler';
// import { ItauBoletoService }                          from './itau-boleto.service';
//
// const webhookHandler = new ItauWebhookHandler({
//   webhookClientId:     process.env.ITAU_WEBHOOK_CLIENT_ID!,
//   webhookClientSecret: process.env.ITAU_WEBHOOK_CLIENT_SECRET!,
//
//   onBaixaRecebida: async (boletos) => {
//     for (const boleto of boletos) {
//       await db.conciliacoes.upsert({
//         nossoNumero:   boleto.numeroNossoNumero,
//         seuNumero:     boleto.seuNumero,         // referência interna WnrFinance
//         valorPago:     parseFloat(boleto.valorPagoTotalCobranca),
//         dataPagamento: boleto.dataInclusaoPagamento,
//         dataCredito:   boleto.dataCredito,
//         tipoLiquidacao: boleto.tipoLiquidacao,
//         nomePagador:   boleto.nomePagador,
//         cpfCnpj:       boleto.numeroCadastroPessoaFisica
//                        ?? boleto.numeroCadastroNacionalPessoaJuridica,
//         status: 'PAGO',
//       });
//       console.log(`✅ Boleto ${boleto.numeroNossoNumero} baixado - R$${boleto.valorPagoTotalCobranca}`);
//     }
//   },
//
//   onErro: (err, payload) => {
//     console.error('Erro ao processar notificação Itaú:', err, payload);
//   },
// });
//
// app.use('/itau', criarRotasExpressItau(webhookHandler));
//
// // Cadastrar o webhook no Itaú (fazer UMA vez):
// const service = new ItauBoletoService({ ... });
// await service.cadastrarWebhook({
//   data: {
//     id_beneficiario:       '150000154711',
//     webhook_url:           'https://seudominio.com.br/itau/webhook/boletos',
//     webhook_client_id:     process.env.ITAU_WEBHOOK_CLIENT_ID!,
//     webhook_client_secret: process.env.ITAU_WEBHOOK_CLIENT_SECRET!,
//     webhook_oauth_url:     'https://seudominio.com.br/itau/auth',
//     tipos_notificacoes:    ['BAIXA_OPERACIONAL', 'BAIXA_EFETIVA'],
//   }
// });
