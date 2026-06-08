import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: string;
      hasPF?: boolean;
      hasPJ?: boolean;
      defaultEnv?: string;
      activeCompanyId?: string | null;
      activeCompanyRole?: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    hasPF?: boolean;
    hasPJ?: boolean;
    defaultEnv?: string;
    activeCompanyId?: string | null;
    activeCompanyRole?: string | null;
  }
}
