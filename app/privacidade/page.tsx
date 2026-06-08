import { Wallet } from 'lucide-react';
import Link from 'next/link';

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/login" className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Wallet className="w-4 h-4" /></div>
          <span className="font-bold text-gray-900">WNR Finance</span>
        </Link>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Política de Privacidade</h1>
          <p className="text-sm text-gray-500 mb-6">Última atualização: 12 de abril de 2026</p>

          <div className="prose prose-gray max-w-none space-y-4 text-sm text-gray-700">
            <h2 className="text-lg font-semibold text-gray-900">1. Dados Coletados</h2>
            <p>Coletamos: nome, e-mail, dados financeiros inseridos manualmente (despesas, receitas, investimentos), dados de conexão bancária via Open Finance (quando autorizado pelo usuário), e dados de uso do aplicativo.</p>

            <h2 className="text-lg font-semibold text-gray-900">2. Uso dos Dados</h2>
            <p>Seus dados são utilizados exclusivamente para: prestar o serviço de gestão financeira, gerar relatórios e alertas personalizados, e melhorar a experiência do usuário. Não vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.</p>

            <h2 className="text-lg font-semibold text-gray-900">3. Segurança</h2>
            <p>Utilizamos criptografia AES-256 para proteção de dados em trânsito e em repouso. Senhas são armazenadas com hash bcrypt. Conexões bancárias são realizadas via provedores regulamentados pelo Banco Central do Brasil.</p>

            <h2 className="text-lg font-semibold text-gray-900">4. Open Finance</h2>
            <p>A integração com Open Finance é opcional. Quando autorizada, os dados são obtidos apenas para leitura — não realizamos nenhuma transação financeira. A autorização pode ser revogada a qualquer momento.</p>

            <h2 className="text-lg font-semibold text-gray-900">5. Armazenamento</h2>
            <p>Os dados são armazenados em servidores seguros com backup automático. Dados de contas excluídas são removidos permanentemente em até 30 dias.</p>

            <h2 className="text-lg font-semibold text-gray-900">6. Seus Direitos (LGPD)</h2>
            <p>Conforme a Lei Geral de Proteção de Dados (LGPD), você tem direito a: acessar seus dados, corrigir dados incorretos, solicitar exclusão da conta, exportar seus dados, e revogar consentimento de compartilhamento.</p>

            <h2 className="text-lg font-semibold text-gray-900">7. Cookies</h2>
            <p>Utilizamos cookies essenciais para manter sua sessão autenticada. Não utilizamos cookies de rastreamento de terceiros.</p>

            <h2 className="text-lg font-semibold text-gray-900">8. Contato do Encarregado (DPO)</h2>
            <p>Para exercer seus direitos ou esclarecer dúvidas sobre privacidade: <a href="mailto:rafael@wticorp.com.br" className="text-blue-600 hover:underline">rafael@wticorp.com.br</a></p>
            <p>Winner Soluções em Tecnologia • CNPJ: Em processo de registro</p>
          </div>
        </div>
      </div>
    </div>
  );
}
