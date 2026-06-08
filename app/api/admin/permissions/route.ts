import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getUserPermissions,
  setUserPermissions,
  PERM_MODULES,
  ACTIONS,
  ROLE_LABELS,
  ACTION_LABELS,
} from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET — list users with their permissions, or get permission matrix config
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!['admin', 'master'].includes(userRole)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  // Return metadata (modules structure, actions, roles)
  if (searchParams.get('meta') === 'true') {
    return NextResponse.json({
      permModules: PERM_MODULES,
      actions: ACTIONS.map(a => ({ id: a, label: ACTION_LABELS[a] || a })),
      roles: Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label })),
    });
  }

  // Single user permissions
  if (userId) {
    const perms = await getUserPermissions(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ user, permissions: perms });
  }

  // All users
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ users });
}

// PUT — update user role or permissions
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!['admin', 'master'].includes(userRole)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();
  const { userId, role, permissions } = body;

  if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });

  // Update role
  if (role) {
    if (role === 'master' && userRole !== 'master') {
      return NextResponse.json({ error: 'Apenas master pode definir role master' }, { status: 403 });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  // Update permissions
  if (permissions && Array.isArray(permissions)) {
    await setUserPermissions(userId, permissions);
  }

  return NextResponse.json({ success: true });
}
