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
  Bell, ListChecks, ChevronRight, Mic, MicOff, Loader, Paperclip,
  Check, X, CheckCircle2, XCircle, GitMerge, ArrowDownCircle, ArrowUpCircle, Trash,
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

interface SophiAction {
  type: 'create_payable' | 'create_receivable' | 'reconcile_accounts' | 'delete_payable' | 'delete_receivable' | 'reconcile_approve' | 'reconcile_ignore';
  data: Record<string, any>;
}
interface PendingAction {
  msgId: string;
  action: SophiAction;
  status: 'pending' | 'executing' | 'done' | 'cancelled' | 'error';
  errorMsg?: string;
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

// ─── Action helpers ───────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDatePT = (iso: string) =>
  new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR');

function getActionSuccessMessage(action: SophiAction): string {
  const d = action.data;
  if (action.type === 'create_payable') {
    return `✅ **Conta a pagar lançada!**\n\n**${d.description}** · ${fmtBRL(d.amount)} · vcto ${fmtDatePT(d.dueDate)}${d.supplierName ? `\n**Fornecedor:** ${d.supplierName}` : ''}\n\nDisponível em **Contas a Pagar**.`;
  }
  if (action.type === 'create_receivable') {
    return `✅ **Conta a receber lançada!**\n\n**${d.description}** · ${fmtBRL(d.amount)} · vcto ${fmtDatePT(d.dueDate)}${d.customerName ? `\n**Cliente:** ${d.customerName}` : ''}\n\nDisponível em **Contas a Receber**.`;
  }
  if (action.type === 'reconcile_accounts') {
    return `✅ **${d.ids?.length ?? 0} lançamento(s) conciliado(s)!**\n\nVerifique em **Movimentação Financeira**.`;
  }
  if (action.type === 'delete_payable') {
    return `🗑️ **Conta a pagar excluída!**\n\n**${d.description}** foi removida permanentemente.`;
  }
  if (action.type === 'delete_receivable') {
    return `🗑️ **Conta a receber excluída!**\n\n**${d.description}** foi removida permanentemente.`;
  }
  if (action.type === 'reconcile_approve') {
    return `✅ **Conciliação aprovada!**\n\n**${d.summary ?? d.reconciliationId}** marcado como conciliado.\n\nVerifique em **Conciliação Bancária**.`;
  }
  if (action.type === 'reconcile_ignore') {
    return `✅ **Lançamento ignorado.**\n\n**${d.summary ?? d.reconciliationId}** não será cobrado de nenhuma conta.`;
  }
  return '✅ Ação executada com sucesso!';
}

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({ action, status, errorMsg, onConfirm, onCancel }: {
  action: SophiAction;
  status: PendingAction['status'];
  errorMsg?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = {
    create_payable:    { title: 'Lançar Conta a Pagar',  Icon: ArrowDownCircle, color: 'border-red-200   bg-red-50/60   dark:border-red-800   dark:bg-red-950/20',     iconCls: 'text-red-500'    },
    create_receivable: { title: 'Lançar Conta a Receber', Icon: ArrowUpCircle,   color: 'border-green-200 bg-green-50/60 dark:border-green-800 dark:bg-green-950/20',   iconCls: 'text-green-500'  },
    reconcile_accounts:{ title: 'Conciliar Lançamentos',  Icon: GitMerge,        color: 'border-blue-200  bg-blue-50/60  dark:border-blue-800  dark:bg-blue-950/20',    iconCls: 'text-blue-500'   },
    delete_payable:      { title: 'Excluir Conta a Pagar',    Icon: Trash,    color: 'border-red-300    bg-red-100/60    dark:border-red-700    dark:bg-red-900/30',      iconCls: 'text-red-700'    },
    delete_receivable:   { title: 'Excluir Conta a Receber',  Icon: Trash,    color: 'border-orange-200  bg-orange-50/60  dark:border-orange-700  dark:bg-orange-950/20',  iconCls: 'text-orange-600' },
    reconcile_approve:   { title: 'Aprovar Conciliação',      Icon: Check,    color: 'border-teal-200    bg-teal-50/60    dark:border-teal-800    dark:bg-teal-950/20',    iconCls: 'text-teal-500'   },
    reconcile_ignore:    { title: 'Ignorar Lançamento Banco', Icon: X,        color: 'border-slate-300   bg-slate-50/60   dark:border-border   dark:bg-muted/40',   iconCls: 'text-muted-foreground'  },
  }[action.type];

  const d = action.data;
  const rows: Array<[string, string]> = [];
  if (d.description)                      rows.push(['Descrição',   d.description]);
  if (d.supplierName)                     rows.push(['Fornecedor',  d.supplierName]);
  if (d.customerName)                     rows.push(['Cliente',     d.customerName]);
  if (d.amount != null)                   rows.push(['Valor',       fmtBRL(Number(d.amount))]);
  if (d.dueDate)                          rows.push(['Vencimento',  fmtDatePT(d.dueDate)]);
  if (d.launchType)                       rows.push(['Tipo',        d.launchType]);
  if (d.status && d.status !== 'pendente') rows.push(['Status',     d.status]);
  if (d.notes)                            rows.push(['Obs.',        d.notes]);
  if (d.ids?.length)                      rows.push(['Lançamentos', `${d.ids.length} selecionado(s)`]);
  if (d.id && !d.ids)                     rows.push(['ID', d.id.slice(0, 12) + '…']);
  if (d.reconciliationId)                 rows.push(['ID Conciliação', d.reconciliationId.slice(0, 12) + '…']);
  if (d.summary)                          rows.push(['Lançamento', d.summary]);

  return (
    <div className={`mt-2 w-full rounded-xl border p-4 text-sm ${meta.color}`}>
      <div className="flex items-center gap-2 mb-3">
        <meta.Icon className={`w-4 h-4 ${meta.iconCls}`} />
        <span className="font-semibold">{meta.title}</span>
        {status === 'done'      && <span className="ml-auto flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Executado</span>}
        {status === 'error'     && <span className="ml-auto flex items-center gap-1 text-red-600   text-xs font-medium"><XCircle      className="w-3.5 h-3.5" /> Erro{errorMsg ? `: ${errorMsg}` : ''}</span>}
        {status === 'cancelled' && <span className="ml-auto text-muted-foreground text-xs">Cancelado</span>}
      </div>

      <div className="space-y-1 mb-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0 text-xs">{label}</span>
            <span className={`font-medium text-xs ${label === 'Valor' ? 'text-foreground font-semibold' : ''}`}>{value}</span>
          </div>
        ))}
      </div>

      {status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Check className="w-3 h-3" /> Confirmar e executar
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <X className="w-3 h-3" /> Cancelar
          </button>
        </div>
      )}
      {status === 'executing' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Executando...
        </div>
      )}
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  // Strip action blocks — rendered as ActionCard components separately
  const clean = text.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, '').trim();
  return clean
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

  // Voice — MediaRecorder-based (no SpeechRecognition, no Google, works in all browsers)
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_RECORD_SECONDS = 120;

  // Audio file upload (bypass mic permission)
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Config
  const [config, setConfig] = useState<SophiConfig>({ extraInstructions: '', dailyTasks: [], reminders: [], alertRules: [] });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [newTask, setNewTask] = useState({ task: '', time: '' });
  const [newReminder, setNewReminder] = useState('');

  // Action cards
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);

  // sendMessage ref (for voice auto-send after transcription)
  const sendMessageRef = useRef<((content: string) => void) | null>(null);

  // ─── Check MediaRecorder support ────────────────────────────────────────────

  useEffect(() => {
    // voiceSupported = true even if we're not 100% sure, so button is always shown
    // Actual check happens at click time
    setVoiceSupported(true);
  }, []);

  // ─── Stop recording helper ───────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    // Tracks are stopped inside recorder.onstop
    setIsRecording(false);
  }, []);

  // ─── Start recording ─────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (isTranscribing || streaming) return;

    // Check API availability at click time
    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert('Gravação de voz não disponível neste navegador ou contexto.\nUse Chrome ou Edge em HTTPS.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      window.alert('MediaRecorder não disponível neste navegador.\nUse Chrome 47+ ou Edge 79+.');
      return;
    }

    setRequestingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      setRequestingMic(false);

      // Pick best supported mime type
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
        .find(m => !m || MediaRecorder.isTypeSupported(m)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 500) {
          toast({ title: 'Gravação muito curta', variant: 'destructive' });
          return;
        }

        setIsTranscribing(true);
        try {
          const form = new FormData();
          const ext = mimeType?.includes('ogg') ? 'ogg' : 'webm';
          form.append('audio', blob, `audio.${ext}`);

          const res = await apiFetch('/api/pj/sophi/transcribe', { method: 'POST', body: form });
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) {
              setTimeout(() => { sendMessageRef.current?.(text.trim()); }, 50);
            } else {
              toast({ title: 'Nenhuma fala detectada — tente novamente', variant: 'destructive' });
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            const msg = errData.error || `HTTP ${res.status}`;
            window.alert(`Erro na transcrição: ${msg}`);
          }
        } catch (err: any) {
          window.alert(`Erro ao transcrever: ${err?.message || 'verifique a conexão'}`);
        } finally {
          setIsTranscribing(false);
          inputRef.current?.focus();
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => {
          if (s + 1 >= MAX_RECORD_SECONDS) { stopRecording(); return 0; }
          return s + 1;
        });
      }, 1000);

    } catch (err: any) {
      setRequestingMic(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        // Check if browser-level permission is already granted — if so, the block is at OS level
        navigator.permissions?.query({ name: 'microphone' as PermissionName })
          .then(status => {
            if (status.state === 'granted') {
              window.alert(
                'Microfone bloqueado pelo sistema operacional!\n\n' +
                'O navegador tem permissão, mas o Windows está bloqueando.\n\n' +
                'Para liberar no Windows:\n' +
                '1. Abra Configurações → Privacidade e segurança → Microfone\n' +
                '2. Ative "Permitir que aplicativos acessem o microfone"\n' +
                '3. Role para baixo e ative o acesso para o seu navegador (Chrome/Edge)\n' +
                '4. Recarregue esta página'
              );
            } else {
              window.alert(
                'Microfone bloqueado!\n\n' +
                'Para liberar no Edge/Chrome:\n' +
                '1. Clique no ícone de cadeado na barra de endereço\n' +
                '2. Procure "Microfone"\n' +
                '3. Selecione "Permitir"\n' +
                '4. Recarregue a página'
              );
            }
          })
          .catch(() => {
            window.alert(
              'Microfone bloqueado!\n\n' +
              'Verifique as permissões do navegador E do Windows:\n\n' +
              'No navegador: cadeado → Microfone → Permitir\n\n' +
              'No Windows: Configurações → Privacidade → Microfone\n' +
              '→ Ativar acesso para o navegador (Chrome/Edge)'
            );
          });
      } else if (err.name === 'NotFoundError') {
        window.alert('Nenhum microfone encontrado. Verifique se há um microfone conectado.');
      } else {
        window.alert(`Erro ao acessar microfone: ${err?.name} — ${err?.message}`);
      }
    }
  }, [isTranscribing, streaming, stopRecording, toast]);

  // ─── Toggle recording ─────────────────────────────────────────────────────────

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // ─── Audio file upload ────────────────────────────────────────────────────────

  const handleAudioFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size < 500) {
      window.alert('Arquivo de áudio muito pequeno ou inválido.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      window.alert('Arquivo muito grande. Limite: 25 MB.');
      return;
    }

    setIsUploadingAudio(true);
    try {
      const form = new FormData();
      form.append('audio', file, file.name);
      const res = await apiFetch('/api/pj/sophi/transcribe', { method: 'POST', body: form });
      if (res.ok) {
        const { text } = await res.json();
        if (text?.trim()) {
          setTimeout(() => { sendMessageRef.current?.(text.trim()); }, 50);
        } else {
          toast({ title: 'Nenhuma fala detectada no arquivo', variant: 'destructive' });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        window.alert(`Erro na transcrição: ${errData.error || `HTTP ${res.status}`}`);
      }
    } catch (err: any) {
      window.alert(`Erro ao enviar áudio: ${err?.message || 'verifique a conexão'}`);
    } finally {
      setIsUploadingAudio(false);
      inputRef.current?.focus();
    }
  }, [toast]);

  // ─── Space bar to toggle ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      if ((e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      toggleRecording();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────────

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
      let fullContent = '';

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
            if (chunk) {
              fullContent += chunk;
              setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: fullContent } : m));
            }
          } catch { /* skip */ }
        }
        if (finished) break;
      }

      // Parse action block after stream ends
      const actionMatch = fullContent.match(/\[ACTION\]([\s\S]*?)\[\/ACTION\]/);
      if (actionMatch) {
        try {
          const actionPayload: SophiAction = JSON.parse(actionMatch[1].trim());
          if (['create_payable', 'create_receivable', 'reconcile_accounts', 'delete_payable', 'delete_receivable', 'reconcile_approve', 'reconcile_ignore'].includes(actionPayload.type)) {
            setPendingActions(prev => [...prev, { msgId: aId, action: actionPayload, status: 'pending' }]);
          }
        } catch { /* skip malformed JSON */ }
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

  // Keep ref in sync
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

  // ─── Action execution ────────────────────────────────────────────────────────

  const executeAction = useCallback(async (action: SophiAction, msgId: string) => {
    setPendingActions(prev => prev.map(a => a.msgId === msgId ? { ...a, status: 'executing' } : a));
    try {
      let endpoint = '';
      let body: Record<string, any> = {};

      if (action.type === 'create_payable') {
        endpoint = '/api/pj/accounts-payable';
        body = action.data;
      } else if (action.type === 'create_receivable') {
        endpoint = '/api/pj/accounts-receivable';
        body = action.data;
      } else if (action.type === 'reconcile_accounts') {
        endpoint = '/api/pj/movimentacoes/batch';
        body = { ids: action.data.ids, action: 'conciliar' };
      } else if (action.type === 'delete_payable' || action.type === 'delete_receivable') {
        endpoint = '/api/pj/movimentacoes/batch';
        body = { ids: [action.data.id], action: 'delete' };
      } else if (action.type === 'reconcile_approve') {
        endpoint = '/api/pj/reconciliation';
        body = { action: 'approve', reconciliationId: action.data.reconciliationId };
      } else if (action.type === 'reconcile_ignore') {
        endpoint = '/api/pj/reconciliation';
        body = { action: 'ignore', reconciliationId: action.data.reconciliationId };
      }

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setPendingActions(prev => prev.map(a => a.msgId === msgId ? { ...a, status: 'done' } : a));
        const successMsg: Message = {
          id: `s-${Date.now()}`,
          role: 'assistant',
          content: getActionSuccessMessage(action),
          ts: Date.now(),
        };
        setMessages(prev => [...prev, successMsg]);
      } else {
        const errData = await res.json().catch(() => ({}));
        setPendingActions(prev => prev.map(a =>
          a.msgId === msgId ? { ...a, status: 'error', errorMsg: errData.error || `HTTP ${res.status}` } : a
        ));
      }
    } catch (err: any) {
      setPendingActions(prev => prev.map(a =>
        a.msgId === msgId ? { ...a, status: 'error', errorMsg: err?.message || 'Erro de rede' } : a
      ));
    }
  }, []);

  const cancelAction = useCallback((msgId: string) => {
    setPendingActions(prev => prev.map(a => a.msgId === msgId ? { ...a, status: 'cancelled' } : a));
  }, []);

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

  // ─── Voice status label ───────────────────────────────────────────────────────

  const voiceLabel = isTranscribing
    ? 'Transcrevendo...'
    : isRecording
    ? `Gravando ${recordingSeconds}s — Espaço para parar`
    : null;

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
              <button key={label} onClick={() => sendMessage(message)} disabled={streaming || isRecording || isTranscribing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${color}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setPendingActions([]); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border text-muted-foreground hover:text-foreground border-border transition-colors ml-auto">
                <RotateCcw className="w-3.5 h-3.5" /> Nova conversa
              </button>
            )}
          </div>

          {/* Audio upload indicator */}
          {isUploadingAudio && (
            <div className="shrink-0 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
              <Loader className="w-4 h-4 animate-spin" /> Transcrevendo arquivo com Whisper...
            </div>
          )}

          {/* Recording / transcribing / requesting indicator */}
          {(requestingMic || isRecording || isTranscribing) && (
            <div className={`shrink-0 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium ${
              isTranscribing
                ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                : requestingMic
                ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 animate-pulse'
            }`}>
              {isTranscribing ? (
                <><Loader className="w-4 h-4 animate-spin" /> Transcrevendo com Whisper...</>
              ) : requestingMic ? (
                <><Loader className="w-4 h-4 animate-spin" /> Aguardando permissão do microfone...</>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  Gravando {recordingSeconds}s
                  <div className="flex-1" />
                  <span className="text-xs font-normal opacity-70">
                    Espaço ou clique no microfone para enviar · máx {MAX_RECORD_SECONDS}s
                  </span>
                </>
              )}
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
                {voiceSupported && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Pressione <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono">Espaço</kbd> ou clique no microfone para falar. O áudio é transcrito pelo Whisper.
                  </p>
                )}
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

            {messages.map(msg => {
              const pa = msg.role === 'assistant' ? pendingActions.find(a => a.msgId === msg.id) : null;
              return (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 mt-1">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
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
                    {pa && (
                      <ActionCard
                        action={pa.action}
                        status={pa.status}
                        errorMsg={pa.errorMsg}
                        onConfirm={() => executeAction(pa.action, msg.id)}
                        onCancel={() => cancelAction(msg.id)}
                      />
                    )}
                    <span className="text-[10px] text-muted-foreground px-1">
                      {msg.role === 'assistant' ? 'Sophi' : 'Você'} · {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <form onSubmit={handleSubmit} className="flex gap-2 mt-3 shrink-0">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                isUploadingAudio ? 'Transcrevendo arquivo de áudio...' :
                isTranscribing ? 'Transcrevendo...' :
                isRecording ? 'Gravando... pressione Espaço para enviar' :
                'Digite, grave (Espaço) ou envie um arquivo de áudio...'
              }
              disabled={streaming || isRecording || isTranscribing || isUploadingAudio}
              className={`flex-1 ${isRecording ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
              }}
            />

            {/* Hidden file input for audio upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.mp4,.m4a,.ogg,.webm,.wav,.flac"
              className="hidden"
              onChange={handleAudioFileUpload}
            />

            {/* Audio upload button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || isRecording || isTranscribing || isUploadingAudio || requestingMic}
              title="Enviar arquivo de áudio para transcrição (mp3, m4a, ogg, wav...)"
            >
              {isUploadingAudio
                ? <Loader className="w-4 h-4 animate-spin" />
                : <Paperclip className="w-4 h-4" />}
            </Button>

            {/* Mic button — always shown, MediaRecorder + Whisper */}
            <Button
              type="button"
              variant={isRecording ? 'destructive' : 'outline'}
              size="icon"
              onClick={toggleRecording}
              disabled={streaming || isTranscribing || requestingMic || isUploadingAudio}
              title={
                requestingMic ? 'Aguardando permissão...' :
                isTranscribing ? 'Transcrevendo...' :
                isRecording ? 'Parar gravação (Espaço)' :
                'Gravar mensagem de voz (Espaço)'
              }
              className={isRecording ? 'animate-pulse' : ''}
            >
              {isTranscribing || requestingMic
                ? <Loader className="w-4 h-4 animate-spin" />
                : isRecording
                ? <MicOff className="w-4 h-4" />
                : <Mic className="w-4 h-4" />}
            </Button>

            <Button type="submit" disabled={streaming || isRecording || isTranscribing || isUploadingAudio || !input.trim()} className="gap-2 shrink-0">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {streaming ? 'Analisando...' : 'Enviar'}
            </Button>
          </form>

          {!isRecording && !isTranscribing && !isUploadingAudio && (
            <p className="text-center text-[10px] text-muted-foreground mt-1">
              <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono">Espaço</kbd> para gravar ·{' '}
              <Paperclip className="inline w-2.5 h-2.5" /> para enviar áudio gravado (mp3, m4a, ogg…) · Whisper transcreve automaticamente
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
                        Voz: pressione <kbd className="px-1 py-0.5 rounded border font-mono text-[10px]">Espaço</kbd> — áudio transcrito por Whisper AI, sem Google.
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
