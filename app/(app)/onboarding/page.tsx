'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell, Building2, CheckCircle, ChevronLeft, ChevronRight, CreditCard, Landmark, Sparkles, Target, User } from 'lucide-react';


interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  env: 'pf' | 'pj' | 'both';
}

const PF_STEPS: Step[] = [
  { id: 'profile', title: 'Seu Perfil', description: 'Configure seu nome e preferências básicas', icon: <User className="w-6 h-6" />, env: 'pf' },
  { id: 'bank', title: 'Conectar Banco', description: 'Vincule sua conta bancária para sincronização automática', icon: <Landmark className="w-6 h-6" />, env: 'pf' },
  { id: 'card', title: 'Cartão de Crédito', description: 'Adicione seus cartões para acompanhar a fatura', icon: <CreditCard className="w-6 h-6" />, env: 'pf' },
  { id: 'goal', title: 'Primeira Meta', description: 'Defina uma meta financeira para começar', icon: <Target className="w-6 h-6" />, env: 'pf' },
  { id: 'alerts', title: 'Alertas', description: 'Configure notificações de vencimento e saldo', icon: <Bell className="w-6 h-6" />, env: 'pf' },
  { id: 'done', title: 'Tudo Pronto!', description: 'Seu painel financeiro está configurado', icon: <Sparkles className="w-6 h-6" />, env: 'pf' },
];

const PJ_STEPS: Step[] = [
  { id: 'company', title: 'Empresa', description: 'Confirme os dados da sua empresa', icon: <Building2 className="w-6 h-6" />, env: 'pj' },
  { id: 'bank', title: 'Conta Bancária PJ', description: 'Vincule a conta bancária da empresa', icon: <Landmark className="w-6 h-6" />, env: 'pj' },
  { id: 'categories', title: 'Categorias', description: 'Escolha categorias para organizar suas finanças', icon: <Target className="w-6 h-6" />, env: 'pj' },
  { id: 'costcenter', title: 'Centro de Custo', description: 'Crie seu primeiro centro de custo', icon: <Building2 className="w-6 h-6" />, env: 'pj' },
  { id: 'nfe', title: 'Nota Fiscal', description: 'Configure a emissão de Nota Fiscal (opcional)', icon: <CreditCard className="w-6 h-6" />, env: 'pj' },
  { id: 'done', title: 'Empresa Configurada!', description: 'Seu painel empresarial está pronto', icon: <Sparkles className="w-6 h-6" />, env: 'pj' },
];

export default function OnboardingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stepsData, setStepsData] = useState<Record<string, any>>({});

  const isPJ = session?.user?.defaultEnv === 'pj';
  const steps = isPJ ? PJ_STEPS : PF_STEPS;
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  useEffect(() => {
    apiFetch('/api/onboarding')
      .then((r) => r.json())
      .then((data) => {
        if (data.dismissed || data.completedAt) {
          router.replace(isPJ ? '/pj/dashboard' : '/dashboard');
          return;
        }
        setCurrentStep(data.currentStep || 0);
        setStepsData(data.stepsData || {});
      });
  }, []);

  const saveProgress = async (step: number, extra?: Record<string, any>) => {
    const newData = { ...stepsData, ...extra };
    setStepsData(newData);
    await apiFetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStep: step, stepsData: newData }),
    });
  };

  const next = async () => {
    if (isLast) {
      setLoading(true);
      await apiFetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true, dismissed: false }),
      });
      router.push(isPJ ? '/pj/dashboard' : '/dashboard');
      return;
    }
    const next = currentStep + 1;
    setCurrentStep(next);
    setCompleted((c) => [...c, step.id]);
    await saveProgress(next);
  };

  const skip = async () => {
    await apiFetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed: true }),
    });
    router.push(isPJ ? '/pj/dashboard' : '/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-green-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Bem-vindo ao WNR Finance</h1>
          <p className="text-muted-foreground">Configure em {steps.length - 1} passos e comece a controlar suas finanças</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.id} className="flex-1 flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < currentStep ? 'bg-green-500 text-white' :
                i === currentStep ? 'bg-green-400 text-white ring-2 ring-green-400 ring-offset-2 ring-offset-slate-900' :
                'bg-muted text-muted-foreground'
              }`}>
                {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < currentStep ? 'bg-green-500' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center">
              {step.icon}
            </div>
            <div>
              <div className="text-muted-foreground text-sm">Passo {currentStep + 1} de {steps.length}</div>
              <h2 className="text-xl font-bold">{step.title}</h2>
            </div>
          </div>

          <p className="text-foreground mb-8">{step.description}</p>

          {/* Step-specific content */}
          <StepContent stepId={step.id} isPJ={isPJ} stepsData={stepsData} onData={(d) => setStepsData(p => ({ ...p, ...d }))} />

          {/* Actions */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <button
              onClick={() => { setCurrentStep(p => Math.max(0, p - 1)); }}
              disabled={currentStep === 0}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>

            <button
              onClick={skip}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {isLast ? '' : 'Pular configuração'}
            </button>

            <button
              onClick={next}
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Aguarde...' : isLast ? 'Ir para o Dashboard' : 'Próximo'}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepContent({ stepId, isPJ, stepsData, onData }: {
  stepId: string;
  isPJ: boolean;
  stepsData: Record<string, any>;
  onData: (d: Record<string, any>) => void;
}) {
  switch (stepId) {
    case 'profile':
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Como você quer ser chamado?</label>
            <input
              type="text"
              defaultValue={stepsData.name}
              onChange={(e) => onData({ name: e.target.value })}
              placeholder="Seu nome"
              className="w-full bg-muted border border-border text-foreground rounded-lg px-4 py-2.5 focus:outline-none focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Objetivo principal</label>
            <select
              defaultValue={stepsData.goal}
              onChange={(e) => onData({ goal: e.target.value })}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-4 py-2.5 focus:outline-none focus:border-green-500"
            >
              <option value="">Selecione...</option>
              <option value="controle">Controlar gastos</option>
              <option value="economia">Economizar mais</option>
              <option value="investimentos">Organizar investimentos</option>
              <option value="quitar_dividas">Quitar dívidas</option>
              <option value="reserva">Montar reserva de emergência</option>
            </select>
          </div>
        </div>
      );

    case 'company':
      return (
        <div className="space-y-4">
          <div className="bg-muted/60 rounded-xl p-4 border border-border">
            <p className="text-foreground text-sm">
              Acesse <strong className="text-foreground">Configurações → Empresa</strong> para completar o cadastro da sua empresa com CNPJ, endereço, regime tributário e logo.
            </p>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Regime tributário</label>
            <select
              defaultValue={stepsData.taxRegime}
              onChange={(e) => onData({ taxRegime: e.target.value })}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-4 py-2.5 focus:outline-none focus:border-green-500"
            >
              <option value="">Selecione...</option>
              <option value="simples_nacional">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="lucro_real">Lucro Real</option>
              <option value="mei">MEI</option>
            </select>
          </div>
        </div>
      );

    case 'bank':
      return (
        <div className="space-y-4">
          <div className="bg-muted/60 rounded-xl p-4 border border-border">
            <p className="text-foreground text-sm mb-3">
              Você pode conectar seu banco de duas formas:
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-foreground">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span><strong className="text-foreground">Open Finance</strong> — sincronização automática e em tempo real</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-foreground">
                <div className="w-2 h-2 bg-blue-400 rounded-full" />
                <span><strong className="text-foreground">Importar extrato</strong> — faça upload do arquivo OFX ou CSV do seu banco</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <a href={isPJ ? '/pj/bancos' : '/bancos'} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-center py-2.5 rounded-lg text-sm font-medium transition-colors">
              Conectar via Open Finance
            </a>
            <a href={isPJ ? '/pj/conciliacao' : '/conciliacao'} className="flex-1 bg-muted hover:bg-muted text-foreground text-center py-2.5 rounded-lg text-sm font-medium transition-colors">
              Importar Extrato
            </a>
          </div>
        </div>
      );

    case 'card':
      return (
        <div className="bg-muted/60 rounded-xl p-4 border border-border">
          <p className="text-foreground text-sm">
            Acesse <strong className="text-foreground">Cartões</strong> no menu lateral para adicionar seus cartões de crédito. Configure o dia de fechamento e vencimento para receber alertas automáticos.
          </p>
        </div>
      );

    case 'categories':
      return (
        <div className="space-y-3">
          <p className="text-foreground text-sm">Categorias padrão já estão disponíveis. Você pode criar categorias personalizadas:</p>
          <div className="grid grid-cols-2 gap-2">
            {['Vendas', 'Serviços', 'Aluguel', 'Marketing', 'Pessoal', 'Impostos'].map((cat) => (
              <div key={cat} className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                {cat}
              </div>
            ))}
          </div>
          <Link href="/pj/categorias" className="block text-center text-green-400 hover:text-green-300 text-sm">
            Gerenciar categorias →
          </Link>
        </div>
      );

    case 'goal':
      return (
        <div className="space-y-4">
          <p className="text-foreground text-sm">Crie sua primeira meta financeira para começar a poupar com propósito:</p>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Nome da meta</label>
            <input
              type="text"
              placeholder="Ex: Reserva de emergência"
              onChange={(e) => onData({ goalName: e.target.value })}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-4 py-2.5 focus:outline-none focus:border-green-500"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-muted-foreground mb-1.5">Valor objetivo (R$)</label>
              <input
                type="number"
                placeholder="10.000,00"
                onChange={(e) => onData({ goalAmount: e.target.value })}
                className="w-full bg-muted border border-border text-foreground rounded-lg px-4 py-2.5 focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-muted-foreground mb-1.5">Prazo</label>
              <input
                type="date"
                onChange={(e) => onData({ goalDate: e.target.value })}
                className="w-full bg-muted border border-border text-foreground rounded-lg px-4 py-2.5 focus:outline-none focus:border-green-500"
              />
            </div>
          </div>
        </div>
      );

    case 'nfe':
      return (
        <div className="space-y-3">
          <div className="bg-muted/60 rounded-xl p-4 border border-border">
            <p className="text-foreground text-sm mb-3">
              Para emitir Notas Fiscais, você precisará de:
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Certificado digital A1 ou A3</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Credenciais de um provedor NF-e (Focus NFe, NFe.io...)</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Inscrição estadual ou municipal ativa</li>
            </ul>
          </div>
          <Link href="/pj/nfe" className="block text-center bg-muted hover:bg-muted text-foreground py-2.5 rounded-lg text-sm font-medium transition-colors">
            Configurar NF-e depois →
          </Link>
        </div>
      );

    case 'alerts':
      return (
        <div className="bg-muted/60 rounded-xl p-4 border border-border">
          <p className="text-foreground text-sm">
            O sistema enviará alertas automáticos para:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><div className="w-2 h-2 bg-yellow-400 rounded-full" /> Contas vencendo nos próximos 3 dias</li>
            <li className="flex items-center gap-2"><div className="w-2 h-2 bg-red-400 rounded-full" /> Contas já vencidas</li>
            <li className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-400 rounded-full" /> Fatura do cartão próxima do fechamento</li>
            <li className="flex items-center gap-2"><div className="w-2 h-2 bg-green-400 rounded-full" /> Meta de poupança atingida</li>
          </ul>
        </div>
      );

    case 'costcenter':
      return (
        <div className="bg-muted/60 rounded-xl p-4 border border-border">
          <p className="text-foreground text-sm mb-3">
            Centros de custo permitem alocar receitas e despesas por departamento ou projeto.
          </p>
          <Link href="/pj/centros-custo" className="block text-center bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
            Criar primeiro centro de custo →
          </Link>
        </div>
      );

    case 'done':
      return (
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <p className="text-foreground">
              Parabéns! Seu sistema financeiro está configurado e pronto para uso.
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Explore todos os recursos no menu lateral. Se precisar de ajuda, o Assistente IA está disponível.
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
}
