export const bankingRoutes = {
  connections: '/api/banking/connections',
  connection: (id: string) => `/api/banking/connections/${id}`,
  importPreview: '/api/banking/import/preview',
  importConfirm: '/api/banking/import/confirm',
  sync: '/api/banking/sync',
} as const;
