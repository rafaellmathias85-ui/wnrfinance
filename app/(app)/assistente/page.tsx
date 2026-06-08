'use client';
import { apiFetch } from '@/lib/fetch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';

import {
  Bot, Send, Trash2, Plus, MessageSquare, Loader2, User as UserIcon, Sparkles, Menu as MenuIcon, X, Briefcase, User as UserSmallIcon,
  Zap, Brain, TrendingUp, Shield, Clock, ChevronRight,
} from 'lucide-react';

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
};

type Conversation = {
  id: string;
  title: string;
  env: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
};

const SUGGESTED_PF = [
  { icon: TrendingUp, text: 'Como está minha saúde financeira este mês?' },
  { icon: Shield, text: 'Quanto devo guardar em reserva de emergência?' },
  { icon: Zap, text: 'Onde investir R$ 5.000 com baixo risco?' },
  { icon: Brain, text: 'Como organizar meus gastos com cartão?' },
];

const SUGGESTED_PJ = [
  { icon: TrendingUp, text: 'Como está o fluxo de caixa da empresa?' },
  { icon: Shield, text: 'Quais clientes estão inadimplentes?' },
  { icon: Zap, text: 'Onde aplicar capital de giro excedente?' },
  { icon: Brain, text: 'Qual o resultado financeiro do mês?' },
];

export default function AssistentePage() {
  const { data: session } = useSession() || {};
  const { activeEnv, activeCompanyId, companies } = usePJ();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeCompanyName = companies.find(c => c.id === activeCompanyId)?.name;

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const qs = new URLSearchParams({ env: activeEnv });
      if (activeEnv === 'pj' && activeCompanyId) qs.set('companyId', activeCompanyId);
      const res = await apiFetch(`/api/ai/conversations?${qs}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      console.error('loadConversations error:', e);
    } finally {
      setLoadingConvs(false);
    }
  }, [activeEnv, activeCompanyId]);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingConv(true);
    try {
      const res = await apiFetch(`/api/ai/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        const conv = data.conversation;
        setActiveConvId(conv.id);
        setMessages(conv.messages || []);
      }
    } catch (e) {
      console.error('loadConversation error:', e);
    } finally {
      setLoadingConv(false);
    }
  }, []);

  const handleNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const res = await apiFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeConvId === id) handleNewConversation();
        await loadConversations();
      }
    } catch (e) {
      console.error('delete conversation error:', e);
    } finally {
      setDeleteTargetId(null);
    }
  };

  const handleDeleteAllHistory = async () => {
    try {
      const qs = new URLSearchParams({ env: activeEnv });
      if (activeEnv === 'pj' && activeCompanyId) qs.set('companyId', activeCompanyId);
      const res = await apiFetch(`/api/ai/conversations?${qs}`, { method: 'DELETE' });
      if (res.ok) {
        handleNewConversation();
        await loadConversations();
      }
    } catch (e) {
      console.error('delete all error:', e);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    const userMsg: ChatMessage = { role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '', createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: text,
          env: activeEnv,
          companyId: activeEnv === 'pj' ? activeCompanyId : null,
        }),
      });
      if (!res.ok || !res.body) throw new Error('Erro na resposta do assistente');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let partial = '';
      let newConvId: string | null = activeConvId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          const data = t.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'meta') {
              if (parsed.conversationId) newConvId = parsed.conversationId;
            } else if (parsed.type === 'delta') {
              assistantContent += parsed.content || '';
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], content: assistantContent };
                return next;
              });
            } else if (parsed.type === 'done') {
              break;
            } else if (parsed.type === 'error') {
              assistantContent += '\n\n_' + parsed.message + '_';
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], content: assistantContent };
                return next;
              });
            }
          } catch {}
        }
      }

      if (newConvId && newConvId !== activeConvId) setActiveConvId(newConvId);
      await loadConversations();
    } catch (err: any) {
      console.error('send error:', err);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: 'Não foi possível obter uma resposta do assistente no momento. Tente novamente em instantes.',
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { handleNewConversation(); }, [activeEnv, activeCompanyId]);

  const envLabel = activeEnv === 'pj' ? 'Empresa (PJ)' : 'Pessoal (PF)';
  const suggestions = activeEnv === 'pj' ? SUGGESTED_PJ : SUGGESTED_PF;
  const hasActiveCompany = activeEnv === 'pj' && !!activeCompanyId;
  const canChat = activeEnv === 'pf' || hasActiveCompany;
  const userName = (session?.user as any)?.name?.split(' ')[0] || 'Usuário';

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-border/50 shadow-xl bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20">
      {/* Sidebar - Conversas */}
      <div className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } fixed lg:relative z-30 w-72 h-full flex flex-col bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-r border-border/30 transition-transform duration-300`}>
        <div className="p-4 border-b border-border/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900" />
              </div>
              <span className="font-semibold text-sm">Conversas</span>
            </div>
            <Button onClick={() => setSidebarOpen(false)} variant="ghost" size="icon" className="lg:hidden h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={handleNewConversation} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/20 transition-all" size="sm">
            <Plus className="w-4 h-4 mr-2" /> Nova Conversa
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConvs ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma conversa</p>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                  activeConvId === conv.id
                    ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 shadow-sm'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => { loadConversation(conv.id); setSidebarOpen(false); }}
              >
                <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeConvId === conv.id ? 'text-blue-500' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    {conv._count?.messages ? ` · ${conv._count.messages} msgs` : ''}
                  </p>
                </div>
                {deleteTargetId === conv.id ? (
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); handleDeleteConversation(conv.id); }} className="p-1 rounded bg-red-500 text-white text-[10px]">Sim</button>
                    <button onClick={e => { e.stopPropagation(); setDeleteTargetId(null); }} className="p-1 rounded bg-muted text-[10px]">Não</button>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTargetId(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {conversations.length > 0 && (
          <div className="p-3 border-t border-border/30">
            {showDeleteConfirm ? (
              <div className="text-center space-y-2">
                <p className="text-xs text-red-500 font-medium">Excluir todo o histórico?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={handleDeleteAllHistory} className="flex-1 text-xs">Excluir</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1 text-xs">Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setShowDeleteConfirm(true)} variant="ghost" size="sm" className="w-full text-xs text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Histórico
              </Button>
            )}
          </div>
        )}
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button onClick={() => setSidebarOpen(true)} variant="ghost" size="icon" className="lg:hidden h-8 w-8">
              <MenuIcon className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">WNR Finance AI</h2>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Online · {envLabel}
                  {activeEnv === 'pj' && activeCompanyName && <span className="text-blue-500"> · {activeCompanyName}</span>}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
              <Zap className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">GPT-4.1 Mini</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConv ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 py-8">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-2xl shadow-blue-500/30">
                  <Brain className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center border-2 border-white dark:border-slate-900">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-1">Olá, {userName}!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
                Sou seu consultor financeiro inteligente. Analiso seus dados em tempo real para oferecer insights personalizados.
              </p>

              {!canChat && activeEnv === 'pj' && (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center">
                  <p className="text-sm text-amber-700 dark:text-amber-400">Selecione uma empresa no menu lateral para conversar.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => canChat && handleSendMessage(s.text)}
                    disabled={!canChat || sending}
                    className="group flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-white/80 dark:bg-slate-800/50 hover:border-blue-500/30 hover:bg-gradient-to-r hover:from-blue-500/5 hover:to-cyan-500/5 hover:shadow-md hover:shadow-blue-500/10 transition-all duration-300 text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 flex items-center justify-center flex-shrink-0 group-hover:from-blue-500/20 group-hover:to-cyan-500/20 transition">
                      <s.icon className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="text-sm text-foreground/80 group-hover:text-foreground transition">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-4">
              {messages.filter(m => m.role !== 'system').map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-white dark:bg-slate-800/80 border border-border/40 shadow-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-slate-900 [&_pre]:rounded-lg">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <span className="text-xs text-muted-foreground">Analisando...</span>
                        </div>
                      )
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/30 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-white dark:bg-slate-800 rounded-2xl border border-border/50 shadow-lg shadow-blue-500/5 focus-within:border-blue-500/30 focus-within:shadow-blue-500/10 transition-all p-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                }}
                placeholder={canChat ? 'Pergunte sobre suas finanças...' : 'Selecione uma empresa para conversar'}
                disabled={!canChat || sending}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none px-2 py-2 max-h-32 min-h-[40px] placeholder:text-muted-foreground/60 disabled:opacity-50"
                style={{ height: 'auto', overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
                onInput={e => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || !canChat || sending}
                size="icon"
                className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:shadow-none transition-all flex-shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
              WNR Finance AI · Suas informações são processadas com segurança
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
