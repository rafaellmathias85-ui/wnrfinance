import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const isGoogleConfigured = googleClientId && !googleClientId.includes('PLACEHOLDER') && googleClientSecret && !googleClientSecret.includes('PLACEHOLDER');

const providers: any[] = [];
if (isGoogleConfigured) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    ...providers,
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const normalizedEmail = credentials?.email?.trim().toLowerCase();

        if (!normalizedEmail || !credentials?.password) {
          throw new Error('Email e senha são obrigatórios');
        }
        const user = await prisma.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
        });
        if (!user || !user?.password) {
          throw new Error('Credenciais inválidas');
        }
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error('Credenciais inválidas');
        }
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role || 'user';
      }
      // Refresh PJ/role fields on every token refresh, update, signin, or when undefined
      const shouldRefresh = token.id && (
        trigger === 'update' ||
        trigger === 'signIn' ||
        trigger === 'signUp' ||
        token.hasPJ === undefined ||
        token.role === undefined ||
        !!user
      );
      if (shouldRefresh) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { hasPF: true, hasPJ: true, defaultEnv: true, activeCompanyId: true, role: true },
          });
          if (dbUser) {
            token.hasPF = dbUser.hasPF;
            token.hasPJ = dbUser.hasPJ;
            token.defaultEnv = dbUser.defaultEnv;
            token.activeCompanyId = dbUser.activeCompanyId;
            token.role = dbUser.role || 'user';
            if (dbUser.activeCompanyId) {
              const uc = await prisma.userCompany.findUnique({
                where: { userId_companyId: { userId: token.id as string, companyId: dbUser.activeCompanyId } },
                select: { role: true },
              });
              token.activeCompanyRole = uc?.role || null;
            } else {
              token.activeCompanyRole = null;
            }
          }
        } catch (_e) { /* ignore db errors in jwt callback */ }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      // Always refresh role in case JWT has stale/undefined role
      session.user.role = (token?.role as string) || 'user';
      session.user.hasPF = token.hasPF ?? true;
      session.user.hasPJ = token.hasPJ ?? false;
      session.user.defaultEnv = token.defaultEnv ?? 'pf';
      session.user.activeCompanyId = token.activeCompanyId ?? null;
      session.user.activeCompanyRole = token.activeCompanyRole ?? null;
      return session;
    },
    async redirect({ url, baseUrl }: any) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  cookies: {
    state: {
      name: 'next-auth.state',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    pkceCodeVerifier: {
      name: 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};
