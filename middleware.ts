import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    // Pages
    '/dashboard/:path*',
    '/despesas/:path*',
    '/receitas/:path*',
    '/caixinhas/:path*',
    '/cartoes/:path*',
    '/investimentos/:path*',
    '/alertas/:path*',
    '/relatorios/:path*',
    '/bancos/:path*',
    '/assistente/:path*',
    '/configuracoes/:path*',
    '/conciliacao/:path*',
    '/admin/:path*',
    '/onboarding/:path*',
    // PF new modules
    '/pf/:path*',
    // PJ all pages
    '/pj/:path*',
    // APIs — existing
    '/api/expenses/:path*',
    '/api/banks/:path*',
    '/api/incomes/:path*',
    '/api/savings/:path*',
    '/api/dashboard/:path*',
    '/api/cards/:path*',
    '/api/investments/:path*',
    '/api/alerts/:path*',
    '/api/reports/:path*',
    '/api/transactions/:path*',
    '/api/entitlements/:path*',
    '/api/auth/totp/:path*',
    '/api/bank-transactions/:path*',
    '/api/reconciliation/:path*',
    '/api/admin/:path*',
    '/api/account/:path*',
    '/api/subscription/:path*',
    '/api/pj/:path*',
    '/api/user/:path*',
    '/api/ai/:path*',
    '/api/suppliers/:path*',
    '/api/tags/:path*',
    // APIs — new modules
    '/api/export',
    '/api/currencies',
    '/api/audit-logs',
    '/api/onboarding',
    '/api/pf/:path*',
    '/api/pluggy/:path*',
    '/api/integrations/:path*',
    '/api/parse-pdf',
    '/api/sessions/:path*',
  ],
};
