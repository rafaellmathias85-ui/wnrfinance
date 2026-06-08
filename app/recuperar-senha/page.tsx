'use client';
import { apiFetch } from '@/lib/fetch';
import { Suspense } from 'react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle, Eye, EyeOff, Lock, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha');
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Link Inválido</h2>
        <p className="text-gray-500 mb-4">Este link de recuperação é inválido ou expirou.</p>
        <Button onClick={() => router.push('/login')} className="bg-blue-600 hover:bg-blue-700">Voltar ao Login</Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <CheckCircle className="w-16 h-16 text-blue-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Senha Redefinida!</h2>
        <p className="text-gray-500 mb-4">Sua senha foi alterada com sucesso. Faça login com a nova senha.</p>
        <Button onClick={() => router.push('/login')} className="bg-blue-600 hover:bg-blue-700">Ir para Login</Button>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Nova Senha</h2>
      <p className="text-gray-500 mb-6">Crie uma nova senha para sua conta</p>
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      <form onSubmit={handleReset} className="space-y-4">
        <div className="relative">
          <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <Input type={showPass ? 'text' : 'password'} placeholder="Nova senha" value={password}
            onChange={e => setPassword(e.target.value)} className="pl-10 pr-10" required minLength={6} />
          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <Input type={showPass ? 'text' : 'password'} placeholder="Confirme a nova senha" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)} className="pl-10" required minLength={6} />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 h-11">
          {loading ? 'Redefinindo...' : 'Redefinir Senha'}
        </Button>
      </form>
    </>
  );
}

export default function RecuperarSenhaPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-gray-900">WNR Finance</span>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <Suspense fallback={<div className="text-center py-8">Carregando...</div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
