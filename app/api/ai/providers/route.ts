import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Simple encryption/decryption for API keys at rest
const DEFAULT_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';
const CIPHER_KEY = process.env.NEXTAUTH_SECRET || process.env.CIPHER_KEY || '';
function encryptKey(text: string): string {
  if (!text) return '';
  const buf = Buffer.from(text, 'utf8');
  const key = Buffer.from(CIPHER_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
  const encrypted = buf.map((b, i) => b ^ key[i % key.length]);
  return Buffer.from(encrypted).toString('base64');
}
function decryptKey(encoded: string): string {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    const key = Buffer.from(CIPHER_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
    const decrypted = buf.map((b, i) => b ^ key[i % key.length]);
    return Buffer.from(decrypted).toString('utf8');
  } catch { return ''; }
}
function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? '****' : '';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function defaultProviderPresets() {
  const providers = [
    {
      name: 'AbacusAI',
      model: process.env.ABACUSAI_MODEL || 'gpt-5.4-mini',
      endpoint: DEFAULT_ENDPOINT,
      apiKey: '',
      priority: 1,
      weight: 100,
      capabilities: ['general', 'fast', 'complex'],
      isBuiltIn: true,
      isActive: true,
    },
  ];

  const envProviders = [
    { env: 'OPENAI_API_KEY', name: 'OpenAI', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', priority: 2 },
    { env: 'DEEPSEEK_API_KEY', name: 'DeepSeek', model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', endpoint: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1', priority: 3 },
    { env: 'GROQ_API_KEY', name: 'Groq', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', endpoint: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1', priority: 3 },
    { env: 'ANTHROPIC_API_KEY', name: 'Anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514', endpoint: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1', priority: 4 },
    { env: 'SAMBANOVA_API_KEY', name: 'SambaNova', model: process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.3-70B-Instruct', endpoint: process.env.SAMBANOVA_BASE_URL || 'https://api.sambanova.ai/v1', priority: 4 },
    { env: 'TOGETHER_API_KEY', name: 'Together.ai', model: process.env.TOGETHER_MODEL || 'deepseek-ai/DeepSeek-V4-Pro', endpoint: process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1', priority: 5 },
  ];

  for (const p of envProviders) {
    const apiKey = process.env[p.env];
    if (!apiKey) continue;
    providers.push({
      name: p.name,
      model: p.model,
      endpoint: p.endpoint,
      apiKey,
      priority: p.priority,
      weight: 100,
      capabilities: ['general'],
      isBuiltIn: false,
      isActive: true,
    });
  }

  return providers;
}

async function ensureDefaultProviders(userId: string) {
  const existing = await prisma.aIProvider.findMany({
    where: { userId },
    select: { id: true, name: true, endpoint: true, apiKey: true },
    orderBy: { sortOrder: 'asc' },
  });

  const presets = defaultProviderPresets();

  // Create missing providers
  const missing = presets.filter(p => !existing.some(e =>
    e.name.toLowerCase() === p.name.toLowerCase() &&
    (e.endpoint || '') === (p.endpoint || '')
  ));

  if (missing.length > 0) {
    await prisma.aIProvider.createMany({
      data: missing.map((p, idx) => ({
        userId,
        name: p.name,
        model: p.model,
        endpoint: p.endpoint,
        apiKey: p.apiKey ? encryptKey(p.apiKey) : '',
        priority: p.priority,
        weight: p.weight,
        capabilities: p.capabilities,
        isBuiltIn: p.isBuiltIn,
        isActive: p.isActive,
        sortOrder: existing.length + idx,
      })),
    });
  }

  // Sync env-sourced API keys into existing providers that have no key set
  for (const preset of presets) {
    if (!preset.apiKey) continue;
    const match = existing.find(e =>
      e.name.toLowerCase() === preset.name.toLowerCase() &&
      (e.endpoint || '') === (preset.endpoint || '')
    );
    if (match && !match.apiKey) {
      await prisma.aIProvider.update({
        where: { id: match.id },
        data: { apiKey: encryptKey(preset.apiKey), model: preset.model },
      });
    }
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureDefaultProviders(session.user.id);

    const [providers, user] = await Promise.all([
      prisma.aIProvider.findMany({
        where: { userId: session.user.id },
        orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
      }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { aiStrategy: true },
      }),
    ]);

    const safe = providers.map(p => ({
      ...p,
      apiKey: maskKey(decryptKey(p.apiKey)),
      apiKeySet: !!p.apiKey,
    }));

    return NextResponse.json({ providers: safe, strategy: user?.aiStrategy || 'failover' });
  } catch (error: any) {
    console.error('GET /api/ai/providers error:', error);
    return NextResponse.json({ error: 'Erro ao carregar provedores' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, model, endpoint, apiKey, priority, weight, capabilities, isBuiltIn, isActive, sortOrder } = body;

    if (!name || !model) {
      return NextResponse.json({ error: 'Nome e modelo são obrigatórios' }, { status: 400 });
    }

    const provider = await prisma.aIProvider.create({
      data: {
        userId: session.user.id,
        name,
        model,
        endpoint: endpoint || '',
        apiKey: apiKey ? encryptKey(apiKey) : '',
        priority: priority || 1,
        weight: weight || 100,
        capabilities: capabilities || ['general'],
        isBuiltIn: isBuiltIn || false,
        isActive: isActive !== false,
        sortOrder: sortOrder || 0,
      },
    });

    return NextResponse.json({
      provider: { ...provider, apiKey: maskKey(apiKey || ''), apiKeySet: !!apiKey },
    });
  } catch (error: any) {
    console.error('POST /api/ai/providers error:', error);
    return NextResponse.json({ error: 'Erro ao criar provedor' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, name, model, endpoint, apiKey, priority, weight, capabilities, isBuiltIn, isActive, sortOrder, strategy } = body;

    // Handle strategy update (no provider id needed)
    if (strategy && !id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { aiStrategy: strategy },
      });
      return NextResponse.json({ success: true, strategy });
    }

    if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });

    // Verify ownership
    const existing = await prisma.aIProvider.findFirst({ where: { id, userId: session.user.id } });
    if (!existing) return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (model !== undefined) updateData.model = model;
    if (endpoint !== undefined) updateData.endpoint = endpoint;
    if (apiKey !== undefined) updateData.apiKey = apiKey ? encryptKey(apiKey) : '';
    if (priority !== undefined) updateData.priority = priority;
    if (weight !== undefined) updateData.weight = weight;
    if (capabilities !== undefined) updateData.capabilities = capabilities;
    if (isBuiltIn !== undefined) updateData.isBuiltIn = isBuiltIn;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const provider = await prisma.aIProvider.update({ where: { id }, data: updateData });

    return NextResponse.json({
      provider: {
        ...provider,
        apiKey: apiKey !== undefined ? maskKey(apiKey || '') : maskKey(decryptKey(provider.apiKey)),
        apiKeySet: !!provider.apiKey,
      },
    });
  } catch (error: any) {
    console.error('PUT /api/ai/providers error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar provedor' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Support both body JSON and query params
    let id: string | null = null;
    try {
      const body = await req.json();
      id = body?.id || null;
    } catch {
      // fallback to searchParams
    }
    if (!id) {
      const { searchParams } = new URL(req.url);
      id = searchParams.get('id');
    }
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const existing = await prisma.aIProvider.findFirst({ where: { id, userId: session.user.id } });
    if (!existing) return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });

    await prisma.aIProvider.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/ai/providers error:', error);
    return NextResponse.json({ error: 'Erro ao excluir provedor' }, { status: 500 });
  }
}
