export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

async function getWhisperProvider(): Promise<{ apiKey: string; endpoint: string } | null> {
  // 1. Groq env var (fastest)
  if (process.env.GROQ_API_KEY) {
    return { apiKey: process.env.GROQ_API_KEY, endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions' };
  }

  // 2. Groq from DB (user-configured)
  const groq = await prisma.aIProvider.findFirst({
    where: { name: { contains: 'groq', mode: 'insensitive' }, isActive: true },
    select: { apiKey: true },
  });
  if (groq?.apiKey) {
    const k = decryptKey(groq.apiKey);
    if (k) return { apiKey: k, endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions' };
  }

  // 3. OpenAI from DB
  const openai = await prisma.aIProvider.findFirst({
    where: { name: { contains: 'openai', mode: 'insensitive' }, isActive: true },
    select: { apiKey: true },
  });
  if (openai?.apiKey) {
    const k = decryptKey(openai.apiKey);
    if (k) return { apiKey: k, endpoint: 'https://api.openai.com/v1/audio/transcriptions' };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const provider = await getWhisperProvider();
    if (!provider) {
      return NextResponse.json(
        { error: 'Nenhum provedor de transcrição disponível. Configure Groq ou OpenAI em Provedores de IA.' },
        { status: 503 },
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    if (!audioFile || audioFile.size < 500) {
      return NextResponse.json({ error: 'Áudio muito curto ou não enviado' }, { status: 400 });
    }

    const groqForm = new FormData();
    groqForm.append('file', audioFile, audioFile.name || 'audio.webm');
    groqForm.append('model', 'whisper-large-v3');
    groqForm.append('language', 'pt');
    groqForm.append('response_format', 'json');

    const res = await fetch(provider.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: groqForm,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Whisper error:', res.status, errText.slice(0, 200));
      return NextResponse.json({ error: 'Erro na transcrição de voz' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ text: (data.text || '').trim() });
  } catch (err: any) {
    console.error('transcribe route error:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}
