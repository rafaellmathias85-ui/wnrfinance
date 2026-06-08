export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DEFAULT_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';
const CIPHER_KEY = process.env.NEXTAUTH_SECRET || process.env.CIPHER_KEY || '';

function decryptKey(encoded: string): string {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    const key = Buffer.from(CIPHER_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
    const decrypted = buf.map((b, i) => b ^ key[i % key.length]);
    return Buffer.from(decrypted).toString('utf8');
  } catch { return ''; }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const userId = (session.user as any).id;

  const providers = await prisma.aIProvider.findMany({
    where: { userId, isActive: true },
    orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
  });

  if (providers.length === 0) {
    // Test default provider
    const result = await testProvider('AbacusAI', 'gpt-5.4-mini', DEFAULT_ENDPOINT, process.env.ABACUSAI_API_KEY || '');
    return NextResponse.json([result]);
  }

  const results = await Promise.all(
    providers.map(async (p) => {
      // If provider has its own key, use it with its own endpoint
      const hasOwnKey = !!p.apiKey;
      const hasOwnEndpoint = !!p.endpoint && p.endpoint !== DEFAULT_ENDPOINT;
      let apiKey: string;
      let endpoint: string;

      if (hasOwnKey && hasOwnEndpoint) {
        apiKey = decryptKey(p.apiKey);
        endpoint = p.endpoint;
      } else if (hasOwnKey) {
        apiKey = decryptKey(p.apiKey);
        endpoint = DEFAULT_ENDPOINT;
      } else {
        apiKey = process.env.ABACUSAI_API_KEY || '';
        endpoint = DEFAULT_ENDPOINT;
      }

      return testProvider(p.name, p.model, endpoint, apiKey, p.id);
    })
  );

  return NextResponse.json(results);
}

async function testProvider(name: string, model: string, endpoint: string, apiKey: string, id?: string) {
  const start = Date.now();
  try {
    if (!apiKey) return { id, name, model, status: 'error', statusCode: 0, latency: 0, error: 'API key nao configurada', category: 'CONFIG' };
    const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Responda apenas: OK' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(15000),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      return { id, name, model, status: 'online', statusCode: res.status, latency, category: 'OPERACIONAL' };
    }
    // Get error details
    let errorDetail = '';
    try { const body = await res.text(); errorDetail = body.slice(0, 300); } catch {}
    const category = [401, 402, 403, 429].includes(res.status) ? 'CREDITO_AUTH' : 'ERRO';
    return { id, name, model, status: 'error', statusCode: res.status, latency, error: errorDetail, category };
  } catch (err: any) {
    return { id, name, model, status: 'offline', statusCode: 0, latency: Date.now() - start, error: err?.message || 'Timeout', category: 'OFFLINE' };
  }
}
