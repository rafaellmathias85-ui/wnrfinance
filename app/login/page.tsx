'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ChevronRight, Eye, EyeOff, Lock, Mail, Shield, User, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/providers')
      .then(r => r.json())
      .then(d => { if (d?.google) setGoogleAvailable(true); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (isSignUp) {
        const res = await apiFetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail, password, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
        const result = await signIn('credentials', { email: normalizedEmail, password, redirect: false });
        if (result?.error) throw new Error('Conta criada! Faça login.');
        router.replace('/dashboard');
      } else {
        const result = await signIn('credentials', { email: normalizedEmail, password, redirect: false });
        if (result?.error) throw new Error('E-mail ou senha inválidos');
        router.replace('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMsg('');
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      setForgotMsg(data.message || 'Se o e-mail existir, você receberá um link de recuperação.');
    } catch {
      setForgotMsg('Se o e-mail existir, você receberá um link de recuperação.');
    } finally {
      setForgotLoading(false);
    }
  };

  const securityFeatures = [
    { icon: '🔐', title: 'Criptografia AES-256', desc: 'Padrão bancário' },
    { icon: '🛡️', title: 'Somente Leitura', desc: 'Não realizamos transações' },
    { icon: '🏦', title: 'Regulamentado pelo BC', desc: 'Open Finance oficial' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 rounded-xl bg-amber-400 text-blue-900 flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold text-white">WNR Finance</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Controle total das suas finanças</h1>
          <p className="text-blue-200 text-lg mb-12">
            Dashboard inteligente, controle de gastos, cartões, investimentos e caixinhas de economia.
            Tudo em um só lugar.
          </p>
          <div className="space-y-4">
            {securityFeatures.map((feat) => (
              <div key={feat.title} className="flex items-center gap-4 bg-white/10 rounded-xl p-4">
                <span className="text-2xl">{feat.icon}</span>
                <div>
                  <p className="text-white font-medium">{feat.title}</p>
                  <p className="text-blue-300 text-sm">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-blue-400 text-sm">© 2024 WNR Finance • Winner Soluções em Tecnologia</p>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-gray-900">WNR Finance</span>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            {showForgot ? (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Recuperar Senha</h2>
                <p className="text-gray-500 mb-6">Informe seu e-mail para receber o link de recuperação</p>
                {forgotMsg && <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm mb-4">{forgotMsg}</div>}
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input type="email" placeholder="Seu e-mail" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className="pl-10" required />
                  </div>
                  <Button type="submit" disabled={forgotLoading} className="w-full bg-blue-600 hover:bg-blue-700 h-11">
                    {forgotLoading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                  </Button>
                </form>
                <p className="text-center text-sm text-gray-500 mt-6">
                  <button type="button" onClick={() => { setShowForgot(false); setForgotMsg(''); }} className="text-blue-600 font-medium hover:underline">Voltar ao login</button>
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {isSignUp ? 'Criar Conta' : 'Bem-vindo de volta'}
                </h2>
                <p className="text-gray-500 mb-6">
                  {isSignUp ? 'Comece a controlar suas finanças' : 'Acesse sua conta para continuar'}
                </p>

                {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && (
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <Input placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)} className="pl-10" required />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="pl-10" required />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input type={showPass ? 'text' : 'password'} placeholder="Senha" value={password}
                      onChange={e => setPassword(e.target.value)} className="pl-10 pr-10" required minLength={6} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {!isSignUp && (
                    <div className="text-right">
                      <button type="button" onClick={() => setShowForgot(true)} className="text-sm text-blue-600 hover:underline">Esqueci minha senha</button>
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 h-11">
                    {loading ? 'Aguarde...' : isSignUp ? 'Criar Conta' : 'Entrar'}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                {googleAvailable && (
                  <>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                      <div className="relative flex justify-center text-sm"><span className="bg-white px-4 text-gray-400">ou</span></div>
                    </div>
                    <Button variant="outline" className="w-full h-11 border-gray-200" onClick={() => signIn('google', { callbackUrl: '/dashboard' })}>
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                      Entrar com Google
                    </Button>
                  </>
                )}

                <p className="text-center text-sm text-gray-500 mt-6">
                  {isSignUp ? 'Já tem conta?' : 'Não tem conta?'}{' '}
                  <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-blue-600 font-medium hover:underline">
                    {isSignUp ? 'Faça login' : 'Crie agora'}
                  </button>
                </p>
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 text-xs text-gray-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Proteção de nível bancário • AES-256</span>
          </div>
        </div>
      </div>
    </div>
  );
}
