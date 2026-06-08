import { Wallet } from 'lucide-react';
import Link from 'next/link';

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/login" className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Wallet className="w-4 h-4" /></div>
          <span className="font-bold text-gray-900">WNR Finance</span>
        </Link>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Termos de Uso (EULA)</h1>
          <p className="text-sm text-gray-500 mb-6">Última atualização: 12 de abril de 2026</p>

          <div className="prose prose-gray max-w-none space-y-4 text-sm text-gray-700">
            <h2 className="text-lg font-semibold text-gray-900">1. Aceitação dos Termos</h2>
            <p>Ao utilizar o WNR Finance, você concorda com estes Termos de Uso. O WNR Finance é um serviço de gestão financeira pessoal desenvolvido pela Winner Soluções em Tecnologia.</p>

            <h2 className="text-lg font-semibold text-gray-900">2. Descrição do Serviço</h2>
            <p>O WNR Finance oferece ferramentas para controle de despesas, receitas, investimentos, cartões de crédito e caixinhas de economia. O serviço é fornecido "como está" e a empresa não realiza transações financeiras em nome do usuário.</p>

            <h2 className="text-lg font-semibold text-gray-900">3. Conta do Usuário</h2>
            <p>Você é responsável por manter a segurança da sua conta e senha. A empresa não se responsabiliza por acessos não autorizados decorrentes de negligenciar a segurança da sua conta.</p>

            <h2 className="text-lg font-semibold text-gray-900">4. Dados Financeiros</h2>
            <p>Os dados inseridos são de responsabilidade do usuário. A empresa não garante a precisão dos cálculos financeiros e recomenda consultar um profissional de finanças para decisões importantes.</p>

            <h2 className="text-lg font-semibold text-gray-900">5. Planos e Pagamentos</h2>
            <p>O plano gratuito oferece funcionalidades básicas. Planos premium estão sujeitos a cobrança recorrente conforme o período contratado. O cancelamento pode ser feito a qualquer momento.</p>

            <h2 className="text-lg font-semibold text-gray-900">6. Exclusão de Conta</h2>
            <p>O usuário pode excluir sua conta a qualquer momento através das configurações. A exclusão é permanente e todos os dados serão removidos em até 30 dias.</p>

            <h2 className="text-lg font-semibold text-gray-900">7. Limitação de Responsabilidade</h2>
            <p>A Winner Soluções em Tecnologia não se responsabiliza por perdas financeiras decorrentes do uso ou incapacidade de uso do serviço.</p>

            <h2 className="text-lg font-semibold text-gray-900">8. Contato</h2>
            <p>Para dúvidas sobre estes termos, entre em contato: <a href="mailto:rafael@wticorp.com.br" className="text-blue-600 hover:underline">rafael@wticorp.com.br</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
