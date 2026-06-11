'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Send, Sparkles, Settings2, Plus, Trash2, Loader2, RotateCcw,
  TrendingUp, AlertTriangle, BarChart3, Target, Brain, Clock,
  Bell, ListChecks, ChevronRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface DailyTask {
  id: string;
  task: string;
  time: string;
  active: boolean;
}

interface Reminder {
  id: string;
  text: string;
  active: boolean;
}

interface AlertRule {
  id: string;
  type: 'cashflow_deficit' | 'overdue_payable' | 'overdue_receivable' | 'custom';
  threshold?: number;
  description: string;
  active: boolean;
}

interface SophiConfig {
  extraInstructions: string;
  dailyTasks: DailyTask[];
  reminders: Reminder[];
  alertRules: AlertRule[];
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    icon: BarChart3,
    label: 'Briefing do Dia',
    message: 'Faça um briefing completo do dia para mim como CEO. Quero saber: vencimentos críticos hoje, situação do caixa, principais riscos da semana e uma oportunidade que devo aproveitar.',
    color: 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20',
  },
  {
    icon: TrendingUp,
    label: 'Análise de Caixa',
    message: 'Analise meu fluxo de caixa com base nos dados atuais. Onde estou em risco de aperto financeiro? Apresente os três cenários: otimista, realista e pessimista para os próximos 30 dias.',
    color: 'bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20',
  },
  {
    icon: AlertTriangle,
    label: 'Riscos e Alertas',
    message: 'Identifique todos os riscos financeiros que você vê agora na empresa. Classifique por criticidade (alta, média, baixa) e me dê um plano de ação concreto para cada um.',
    color: 'bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20',
  },
  {
    icon: Target,
    label: 'Oportunidades',
    message: 'Com base nos dados financeiros atuais, quais oportunidades você identifica? Pode ser otimização de custos, estratégias de faturamento ou melhor alocação do capital disponível.',
    color: 'bg-purple-500/10 text-purple-600 border-purple-200 hover:bg-purple-500/20',
  },
];

// ─── Markdown renderer (basic) ────────────────────────────────────────────────

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

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Config state
  const [config, setConfig] = useState<SophiConfig>({
    extraInstructions: '',
    dailyTasks: [],
    reminders: [],
    alertRules: [],
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [newTask, setNewTask] = useState({ task: '', time: '' });
  const [newReminder, setNewReminder] = useState('');

  // ─── Load config ────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pj/sophi/config');
      if (res.ok) {
        const { config: c } = await res.json();
        setConfig(c);
      }
    } catch { /* noop */ } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Send message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: content.trim(), ts: Date.now() };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', ts: Date.now() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      const historyForApi = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/pj/sophi/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForApi }),
        credentials: 'same-origin',
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const { content: chunk } = JSON.parse(data);
            if (chunk) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m
              ));
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Erro ao conectar com a Sophi: ${err?.message || 'verifique os provedores de IA.'}` }
          : m
      ));
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [messages, streaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => setMessages([]);

  // ─── Save config ─────────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await apiFetch('/api/pj/sophi/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast({ title: 'Configurações salvas com sucesso' });
      } else {
        toast({ title: 'Erro ao salvar', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro de rede', variant: 'destructive' });
    } finally {
      setConfigSaving(false);
    }
  };

  // ─── Config helpers ──────────────────────────────────────────────────────────

  const addTask = () => {
    if (!newTask.task.trim()) return;
    setConfig(c => ({
      ...c,
      dailyTasks: [...c.dailyTasks, { id: `t-${Date.now()}`, task: newTask.task.trim(), time: newTask.time, active: true }],
    }));
    setNewTask({ task: '', time: '' });
  };

  const removeTask = (id: string) => setConfig(c => ({ ...c, dailyTasks: c.dailyTasks.filter(t => t.id !== id) }));
  const toggleTask = (id: string) => setConfig(c => ({
    ...c, dailyTasks: c.dailyTasks.map(t => t.id === id ? { ...t, active: !t.active } : t),
  }));

  const addReminder = () => {
    if (!newReminder.trim()) return;
    setConfig(c => ({
      ...c,
      reminders: [...c.reminders, { id: `r-${Date.now()}`, text: newReminder.trim(), active: true }],
    }));
    setNewReminder('');
  };

  const removeReminder = (id: string) => setConfig(c => ({ ...c, reminders: c.reminders.filter(r => r.id !== id) }));
  const toggleReminder = (id: string) => setConfig(c => ({
    ...c, reminders: c.reminders.map(r => r.id === id ? { ...r, active: !r.active } : r),
  }));

  // ─── Render ──────────────────────────────────────────────────────────────────

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

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Chat
          </button>
          <button
            onClick={() => setTab('config')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'config' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Configurar
          </button>
        </div>
      </div>

      {/* ═══ CHAT TAB ══════════════════════════════════════════════════════════ */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Quick actions */}
          <div className="flex gap-2 flex-wrap mb-3 shrink-0">
            {QUICK_ACTIONS.map(({ icon: Icon, label, message, color }) => (
              <button
                key={label}
                onClick={() => sendMessage(message)}
                disabled={streaming}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${color}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border text-muted-foreground hover:text-foreground border-border transition-colors ml-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Nova conversa
              </button>
            )}
          </div>

          {/* Messages area */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border bg-muted/20 p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center mb-4 opacity-80">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Olá! Sou a Sophi.</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Sua CFO virtual com acesso completo aos dados financeiros da empresa.
                  Use os atalhos acima ou me faça qualquer pergunta sobre finanças, caixa, riscos ou estratégia.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground max-w-sm">
                  {['Qual o status do caixa hoje?', 'Quais contas vencem esta semana?', 'Tenho risco de inadimplência?', 'Como devo alocar o caixa excedente?'].map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="flex items-center gap-1 p-2 rounded-lg border border-border hover:bg-muted/50 text-left transition-colors"
                    >
                      <ChevronRight className="w-3 h-3 shrink-0 text-primary" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 mt-1">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                )}

                <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-background border border-border rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando dados...
                        </span>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">
                    {msg.role === 'assistant' ? 'Sophi' : 'Você'} · {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 mt-3 shrink-0">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Pergunte à Sophi... ex: Qual o risco financeiro mais urgente hoje?"
              disabled={streaming}
              className="flex-1"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            />
            <Button type="submit" disabled={streaming || !input.trim()} className="gap-2 shrink-0">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {streaming ? 'Analisando...' : 'Enviar'}
            </Button>
          </form>
        </div>
      )}

      {/* ═══ CONFIG TAB ════════════════════════════════════════════════════════ */}
      {tab === 'config' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
          {configLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Daily Tasks */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-primary" /> Tarefas Diárias
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">A Sophi lembrará dessas tarefas no contexto de cada análise.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Add task row */}
                  <div className="flex gap-2">
                    <div className="w-24 shrink-0">
                      <Input
                        type="time"
                        value={newTask.time}
                        onChange={e => setNewTask(p => ({ ...p, time: e.target.value }))}
                        className="text-sm"
                        placeholder="Horário"
                      />
                    </div>
                    <Input
                      value={newTask.task}
                      onChange={e => setNewTask(p => ({ ...p, task: e.target.value }))}
                      placeholder="Descrição da tarefa..."
                      className="flex-1 text-sm"
                      onKeyDown={e => e.key === 'Enter' && addTask()}
                    />
                    <Button type="button" size="sm" onClick={addTask} disabled={!newTask.task.trim()}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {/* Task list */}
                  {config.dailyTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa configurada.</p>
                  )}
                  {config.dailyTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                      <Switch checked={task.active} onCheckedChange={() => toggleTask(task.id)} />
                      {task.time && (
                        <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />{task.time}
                        </span>
                      )}
                      <span className={`flex-1 text-sm ${!task.active ? 'line-through text-muted-foreground' : ''}`}>{task.task}</span>
                      <button onClick={() => removeTask(task.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Reminders */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" /> Lembretes
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Lembretes que a Sophi levará em conta ao analisar sua situação.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newReminder}
                      onChange={e => setNewReminder(e.target.value)}
                      placeholder="Ex: Verificar prazo de impostos toda segunda-feira..."
                      className="flex-1 text-sm"
                      onKeyDown={e => e.key === 'Enter' && addReminder()}
                    />
                    <Button type="button" size="sm" onClick={addReminder} disabled={!newReminder.trim()}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {config.reminders.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum lembrete configurado.</p>
                  )}
                  {config.reminders.map(rem => (
                    <div key={rem.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                      <Switch checked={rem.active} onCheckedChange={() => toggleReminder(rem.id)} />
                      <span className={`flex-1 text-sm ${!rem.active ? 'line-through text-muted-foreground' : ''}`}>{rem.text}</span>
                      <button onClick={() => removeReminder(rem.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Extra Instructions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" /> Instruções Personalizadas para a Sophi
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Informações adicionais sobre sua empresa, setor, metas ou preferências de análise. A Sophi usará isso em todas as respostas.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {[
                      'Nosso setor é saúde e as margens típicas são entre 15-25%.',
                      'Temos meta de crescimento de 30% este ano.',
                      'Priorizamos sempre liquidez antes de rentabilidade.',
                      'Evitar endividamento acima de 30% do faturamento.',
                    ].map(example => (
                      <button
                        key={example}
                        onClick={() => setConfig(c => ({ ...c, extraInstructions: c.extraInstructions ? `${c.extraInstructions}\n${example}` : example }))}
                        className="text-left text-xs p-2 rounded-lg border border-dashed border-border hover:bg-muted/50 text-muted-foreground transition-colors"
                      >
                        + {example}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={config.extraInstructions}
                    onChange={e => setConfig(c => ({ ...c, extraInstructions: e.target.value }))}
                    placeholder="Ex: Nossa empresa é do setor de tecnologia. O custo fixo mensal é em torno de R$45.000. Nossa meta é crescer 20% ao trimestre..."
                    rows={5}
                    className="text-sm resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Quanto mais contexto você fornecer, mais precisas e personalizadas serão as análises da Sophi.
                  </p>
                </CardContent>
              </Card>

              {/* Sophi Persona Info */}
              <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20">
                <CardContent className="pt-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0">
                      <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">Sobre a Sophi</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        A Sophi é sua CFO &amp; CIO Virtual Sênior. Ela analisa em tempo real os dados financeiros da sua empresa —
                        contas a pagar e receber, fluxo de caixa, inadimplência e projeções — e atua com base nos 5 pilares:
                        Diagnóstico de Fluxo de Caixa, Otimização de Custos, Engenharia de Receita, Inteligência de Investimentos
                        e Gestão de Riscos. Ela acessa seus provedores de IA configurados em Configurações → Provedores de IA.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save */}
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
