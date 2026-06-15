export function formatCurrency(value: number | null | undefined): string {
  const num = value ?? 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export function toInputDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0] ?? '';
  } catch {
    return '';
  }
}

export const EXPENSE_CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação',
  'Lazer', 'Vestuário', 'Assinaturas', 'Impostos', 'Seguros',
  'Cartão de Crédito', 'Outros',
] as const;

export const INCOME_TYPES = [
  { value: 'salario', label: 'Salário' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'investimentos', label: 'Investimentos' },
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'dividendos', label: 'Dividendos' },
  { value: 'pensao', label: 'Pensão' },
  { value: 'bonus', label: 'Bônus' },
  { value: 'outros', label: 'Outros' },
] as const;

export const RECURRENCE_TYPES = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
] as const;

export const BRAZILIAN_BANKS = [
  { name: 'Banco do Brasil', logo: '/banks/bb.png' },
  { name: 'Itaú Unibanco', logo: '/banks/itau.png' },
  { name: 'Bradesco', logo: '/banks/bradesco.png' },
  { name: 'Santander', logo: '/banks/santander.png' },
  { name: 'Caixa Econômica', logo: '/banks/caixa.png' },
  { name: 'Nubank', logo: '/banks/nubank.png' },
  { name: 'Inter', logo: '/banks/inter.png' },
  { name: 'C6 Bank', logo: '/banks/c6.png' },
  { name: 'BTG Pactual', logo: '/banks/btg.png' },
  { name: 'XP Investimentos', logo: '/banks/xp.png' },
  { name: 'Rico', logo: '/banks/rico.png' },
  { name: 'NuInvest', logo: '/banks/nuinvest.png' },
] as const;

export const INVESTMENT_TYPES = [
  { value: 'renda_fixa', label: 'Renda Fixa' },
  { value: 'acoes', label: 'Ações' },
  { value: 'fii', label: 'FII' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'tesouro', label: 'Tesouro Direto' },
  { value: 'outros', label: 'Outros' },
] as const;

export const SAVINGS_CATEGORIES = [
  { value: 'viagem', label: 'Viagem', emoji: '✈️' },
  { value: 'educacao', label: 'Educação', emoji: '📚' },
  { value: 'emergencia', label: 'Emergência', emoji: '🛡️' },
  { value: 'ipva', label: 'IPVA', emoji: '🚗' },
  { value: 'iptu', label: 'IPTU', emoji: '🏠' },
  { value: 'licenciamento', label: 'Licenciamento', emoji: '📋' },
  { value: 'imovel', label: 'Construção Imóvel', emoji: '🏗️' },
  { value: 'filho', label: 'Poupança Filho', emoji: '👶' },
  { value: 'saude', label: 'Saúde', emoji: '💊' },
  { value: 'outros', label: 'Outros', emoji: '🎯' },
] as const;

export const CARD_COLORS = [
  '#16A34A', '#059669', '#0D9488', '#0891B2', '#2563EB',
  '#7C3AED', '#C026D3', '#E11D48', '#CA8A04', '#EA580C',
] as const;
