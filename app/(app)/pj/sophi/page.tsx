'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Send, Sparkles, Settings2, Plus, Trash2, Loader2, RotateCcw,
  TrendingUp, AlertTriangle, BarChart3, Target, Brain, Clock,
  Bell, ListChecks, ChevronRight, Mic, MicOff,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface DailyTask  { id: string; task: string; time: string; active: boolean }
interface Reminder   { id: string; text: string; active: boolean }
interface SophiConfig {
  extraInstructions: string;
  dailyTasks: DailyTask[];
  reminders: Reminder[];
  alertRules: any[];
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    icon: BarChart3, label: 'Briefing do Dia',
    color: 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20',
    message: 'Faça um briefing completo do dia para mim como CEO: vencimentos críticos hoje, situação do caixa, principais riscos da semana e uma oportunidade que devo aproveitar.',
  },
  {
    icon: TrendingUp, label: 'Análise de Caixa',
    color: 'bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20',
    message: 'Analise meu fluxo de caixa com base nos dados atuais. Onde estou em risco de aperto financeiro? Apresente os três cenários: otimista, realista e pessimista para os próximos 30 dias.',
  },
  {
    icon: AlertTriangle, label: 'Riscos e Alertas',
    color: 'bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20',
    message: 'Identifique todos os riscos financeiros que você vê agora na empresa. Classifique por criticidade (alta, média, baixa) e me dê um plano de ação concreto para cada um.',
  },
  {
    icon: Target, label: 'Oportunidades',
    color: 'bg-purple-500/10 text-purple-600 border-purple-200 hover:bg-purple-500/20',
    message: 'Com base nos dados financeiros atuais, quais oportunidades você identifica? Pode ser otimização de custos, estratégias de faturamento ou melhor alocação do capital disponível.',
  },
];

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\n{2,}/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br>');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SophiPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'chat' | 'config'>('chat');

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);

  // Config
  const [config, setConfig] = useState<SophiConfig>({ extraInstructions: '', dailyTasks: [], reminders: [], alertRules: [] });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [newTask, setNewTask] = useState({ task: '', time: '' });
  const [newReminder, setNewReminder] = useState('');

  // ─── Speech Recognition setup ────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setVoiceSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'pt-BR';

    rec.onstart = () => setIsListening(true);

    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim);
      if (final) {
        setInput(final.trim());
        setInterimText('');
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setInterimText('');
      // Auto-send if we have text from voice
      setInput(prev => {
        if (prev.trim()) {
          // trigger send via a timeout to let state settle
          setTimeout(() => {
            setInput(current => {
              if (current.trim()) sendMessageRef.current?.(current);
              return '';
            });
          }, 0);
        }
        return prev;
      });
    };

    rec.onerror = (e: any) => {
      setIsListening(false);
      setInterimText('');
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed') {
        window.alert('Permissão de microfone negada.\nClique no ícone de cadeado na barra de endereço do navegador e permita o acesso ao microfone.');
        return;
      }
      toast({ title: 'Erro no microfone', description: e.error, variant: 'destructive' });
    };

    recognitionRef.current = rec;
    return () => { try { rec.abort(); } catch { /* noop */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) {
      window.alert('Reconhecimento de voz não suportado neste navegador.\nUse Google Chrome ou Microsoft Edge.');
      return;
    }
    if (isListening) {
      try { rec.stop(); } catch { /* noop */ }
    } else {
      setInput('');
      try {
        rec.start();
      } catch (err: any) {
        // Already started or other error
        console.warn('SpeechRecognition start error:', err);
        // Re-create the recognition instance and try again
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SR && recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch { /* noop */ }
          setTimeout(() => {
            try { recognitionRef.current?.start(); } catch { /* noop */ }
          }, 300);
        }
      }
    }
  }, [isListening]);

  // Expose sendMessage to the onend closure
  const sendMessageRef = useRef<((content: string) => void) | null>(null);

  // Space bar to toggle voice (only when not typing in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      if ((e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      toggleListening();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleListening]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ─── Load config ─────────────────────────────────────────────────────────────

  useEffect(() => {
    apiFetch('/api/pj/sophi/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setConfig(d.config))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  // ─── Send message ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text, ts: Date.now() };
    const aId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: aId, role: 'assistant', content: '', ts: Date.now() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const res = await apiFetch('/api/pj/sophi/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${errText ? ` — ${errText.slice(0, 100)}` : ''}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        let finished = false;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { finished = true; break; }
          try {
            const { content: chunk } = JSON.parse(data);
            if (chunk) setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content + chunk } : m));
          } catch { /* skip */ }
        }
        if (finished) break;
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === aId ? { ...m, content: `Erro ao conectar com a Sophi: **${err?.message || 'verifique os provedores de IA'}**` } : m
      ));
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [messages, streaming]);

  // Keep ref in sync so voice onend can call it
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  // ─── Save config ─────────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await apiFetch('/api/pj/sophi/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      toast(res.ok ? { title: 'Configurações salvas' } : { title: 'Erro ao salvar', variant: 'destructive' });
    } catch { toast({ title: 'Erro de rede', variant: 'destructive' }); }
    finally { setConfigSaving(false); }
  };

  // ─── Config helpers ──────────────────────────────────────────────────────────

  const addTask = () => {
    if (!newTask.task.trim()) return;
    setConfig(c => ({ ...c, dailyTasks: [...c.dailyTasks, { id: `t-${Date.now()}`, ...newTask, task: newTask.task.trim(), active: true }] }));
    setNewTask({ task: '', time: '' });
  };
  const removeTask = (id: string) => setConfig(c => ({ ...c, dailyTasks: c.dailyTasks.filter(t => t.id !== id) }));
  const toggleTask = (id: string) => setConfig(c => ({ ...c, dailyTasks: c.dailyTasks.map(t => t.id === id ? { ...t, active: !t.active } : t) }));

  const addReminder = () => {
    if (!newReminder.trim()) return;
    setConfig(c => ({ ...c, reminders: [...c.reminders, { id: `r-${Date.now()}`, text: newReminder.trim(), active: true }] }));
    setNewReminder('');
  };
  const removeReminder = (id: string) => setConfig(c => ({ ...c, reminders: c.reminders.filter(r => r.id !== id) }));
  const toggleReminder = (id: string) => setConfig(c => ({ ...c, reminders: c.reminders.map(r => r.id === id ? { ...r, active: !r.active } : r) }));

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shadow-md">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">Sophi</h1>
              <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
                CFO &amp; CIO Virtual
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Sua assistente financeira sênior — análise, estratégia e decisão</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {(['chat', 'config'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t === 'chat' ? <><Sparkles className="w-3.5 h-3.5" /> Chat</> : <><Settings2 className="w-3.5 h-3.5" /> Configurar</>}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ CHAT ═══════════════════════════════════════════════════════════════ */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Quick actions */}
          <div className="flex gap-2 flex-wrap mb-3 shrink-0">
            {QUICK_ACTIONS.map(({ icon: Icon, label, message, color }) => (
              <button key={label} onClick={() => sendMessage(message)} disabled={streaming}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${color}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border text-muted-foreground hover:text-foreground border-border transition-colors ml-auto">
                <RotateCcw className="w-3.5 h-3.5" /> Nova conversa
              </button>
            )}
          </div>

          {/* Listening overlay indicator */}
          {isListening && (
            <div className="shrink-0 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-medium animate-pulse">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              Ouvindo... {interimText && <span className="font-normal text-red-500 truncate max-w-xs">&ldquo;{interimText}&rdquo;</span>}
              <span className="ml-auto text-xs font-normal opacity-70">Pressione Espaço para parar</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border bg-muted/20 p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center mb-4 opacity-80">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Olá! Sou a Sophi.</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-1">
                  Sua CFO virtual com acesso completo aos dados financeiros da empresa.
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {voiceSupported
                    ? <>Pressione <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono">Espaço</kbd> ou clique no microfone para falar.</>
                    : <>Clique no microfone <Mic className="inline w-3 h-3" /> para ativar voz (requer Chrome/Edge).</>}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground max-w-sm">
                  {['Qual o status do caixa hoje?', 'Quais contas vencem esta semana?', 'Tenho risco de inadimplência?', 'Como devo alocar o caixa excedente?'].map(q => (
                    <button key={q} onClick={() => sendMessage(q)}
                      className="flex items-center gap-1 p-2 rounded-lg border border-border hover:bg-muted/50 text-left transition-colors">
                      <ChevronRight className="w-3 h-3 shrink-0 text-primary" />{q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 mt-1">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-background border border-border rounded-tl-sm shadow-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      msg.content
                        ? <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                        : <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando dados...</span>
                    ) : <span className="whitespace-pre-wrap">{msg.content}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">
                    {msg.role === 'assistant' ? 'Sophi' : 'Você'} · {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <form onSubmit={handleSubmit} className="flex gap-2 mt-3 shrink-0">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={isListening && interimText ? interimText : input}
                onChange={e => !isListening && setInput(e.target.value)}
                placeholder={
                  isListening
                    ? 'Ouvindo... fale agora'
                    : voiceSupported
                    ? 'Digite ou pressione Espaço para falar...'
                    : 'Pergunte à Sophi...'
                }
                disabled={streaming}
                className={`pr-10 ${isListening ? 'border-red-400 focus-visible:ring-red-400 bg-red-50/30 dark:bg-red-950/20' : ''}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
                }}
                readOnly={isListening}
              />
              {/* Voice indicator inside input */}
              {isListening && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>
              )}
            </div>

            {/* Mic button — always visible; click shows alert if unsupported */}
            <Button
              type="button"
              variant={isListening ? 'destructive' : 'outline'}
              size="icon"
              onClick={toggleListening}
              disabled={streaming}
              title={
                !voiceSupported
                  ? 'Reconhecimento de voz não suportado (use Chrome ou Edge)'
                  : isListening
                  ? 'Parar gravação (Espaço)'
                  : 'Falar com a Sophi (Espaço)'
              }
              className={`${isListening ? 'animate-pulse' : ''} ${!voiceSupported ? 'opacity-40' : ''}`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>

            <Button type="submit" disabled={streaming || (!input.trim() && !isListening)} className="gap-2 shrink-0">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {streaming ? 'Analisando...' : 'Enviar'}
            </Button>
          </form>

          {voiceSupported && !isListening && (
            <p className="text-center text-[10px] text-muted-foreground mt-1">
              <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono">Espaço</kbd> para ativar/desativar microfone · o resultado é enviado automaticamente
            </p>
          )}
        </div>
      )}

      {/* ═══ CONFIG ══════════════════════════════════════════════════════════════ */}
      {tab === 'config' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
          {configLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Daily Tasks */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-primary" /> Tarefas Diárias</CardTitle>
                  <p className="text-xs text-muted-foreground">A Sophi lembrará dessas tarefas no contexto de cada análise.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input type="time" value={newTask.time} onChange={e => setNewTask(p => ({ ...p, time: e.target.value }))} className="w-28 text-sm shrink-0" />
                    <Input value={newTask.task} onChange={e => setNewTask(p => ({ ...p, task: e.target.value }))} placeholder="Descrição da tarefa..." className="flex-1 text-sm" onKeyDown={e => e.key === 'Enter' && addTask()} />
                    <Button type="button" size="sm" onClick={addTask} disabled={!newTask.task.trim()}><Plus className="w-4 h-4" /></Button>
                  </div>
                  {config.dailyTasks.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa configurada.</p>
                    : config.dailyTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                        <Switch checked={t.active} onCheckedChange={() => toggleTask(t.id)} />
                        {t.time && <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{t.time}</span>}
                        <span className={`flex-1 text-sm ${!t.active ? 'line-through text-muted-foreground' : ''}`}>{t.task}</span>
                        <button onClick={() => removeTask(t.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                </CardContent>
              </Card>

              {/* Reminders */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Lembretes</CardTitle>
                  <p className="text-xs text-muted-foreground">Lembretes que a Sophi levará em conta ao analisar sua situação.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input value={newReminder} onChange={e => setNewReminder(e.target.value)} placeholder="Ex: Verificar prazo de impostos toda segunda-feira..." className="flex-1 text-sm" onKeyDown={e => e.key === 'Enter' && addReminder()} />
                    <Button type="button" size="sm" onClick={addReminder} disabled={!newReminder.trim()}><Plus className="w-4 h-4" /></Button>
                  </div>
                  {config.reminders.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum lembrete configurado.</p>
                    : config.reminders.map(r => (
                      <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                        <Switch checked={r.active} onCheckedChange={() => toggleReminder(r.id)} />
                        <span className={`flex-1 text-sm ${!r.active ? 'line-through text-muted-foreground' : ''}`}>{r.text}</span>
                        <button onClick={() => removeReminder(r.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                </CardContent>
              </Card>

              {/* Extra Instructions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Brain className="w-4 h-4 text-primary" /> Instruções Personalizadas</CardTitle>
                  <p className="text-xs text-muted-foreground">Conte à Sophi sobre sua empresa, setor, metas e limites. Ela usará isso em todas as análises.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {['Nosso setor é saúde — margens típicas entre 15-25%.', 'Meta de crescimento de 30% este ano.', 'Priorizamos liquidez antes de rentabilidade.', 'Evitar endividamento acima de 30% do faturamento.'].map(ex => (
                      <button key={ex} onClick={() => setConfig(c => ({ ...c, extraInstructions: c.extraInstructions ? `${c.extraInstructions}\n${ex}` : ex }))}
                        className="text-left text-xs p-2 rounded-lg border border-dashed border-border hover:bg-muted/50 text-muted-foreground transition-colors">+ {ex}</button>
                    ))}
                  </div>
                  <Textarea value={config.extraInstructions} onChange={e => setConfig(c => ({ ...c, extraInstructions: e.target.value }))}
                    placeholder="Ex: Nossa empresa é do setor de tecnologia. O custo fixo mensal é em torno de R$45.000..." rows={5} className="text-sm resize-none" />
                </CardContent>
              </Card>

              {/* About Sophi */}
              <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20">
                <CardContent className="pt-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0">
                      <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">Sobre a Sophi</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        CFO &amp; CIO Virtual Sênior. Opera nos 5 pilares: Diagnóstico de Caixa, Otimização de Custos,
                        Engenharia de Receita, Inteligência de Investimentos e Gestão de Riscos. Acessa dados financeiros
                        reais da empresa e usa os provedores configurados em <strong>Configurações → Provedores de IA</strong>.
                        Suporte a voz: pressione <kbd className="px-1 py-0.5 rounded border font-mono text-[10px]">Espaço</kbd> fora do campo de texto.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end pb-4">
                <Button onClick={saveConfig} disabled={configSaving} className="gap-2">
                  {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
                  {configSaving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
