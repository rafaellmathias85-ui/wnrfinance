'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Globe, LogOut, Monitor, RefreshCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';


interface UserSession {
  id: string;
  sessionId: string;
  ipAddress: string | null;
  userAgent: string | null;
  city: string | null;
  country: string | null;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
}

function parseDevice(ua: string | null): { icon: any; label: string } {
  if (!ua) return { icon: Globe, label: 'Navegador desconhecido' };
  const lower = ua.toLowerCase();
  if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
    return { icon: Smartphone, label: 'Dispositivo móvel' };
  }
  return { icon: Monitor, label: 'Desktop / Notebook' };
}

function parseBrowser(ua: string | null): string {
  if (!ua) return 'Desconhecido';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  return 'Navegador';
}

function timeAgo(date: string): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

export default function SessoesPage() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/sessions');
      if (res.ok) setSessions(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      const res = await apiFetch(`/api/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Sessão encerrada');
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      } else {
        toast.error('Erro ao encerrar sessão');
      }
    } catch {
      toast.error('Erro ao encerrar sessão');
    }
    setRevoking(null);
  };

  const revokeAll = async () => {
    if (!confirm('Encerrar todas as outras sessões? Você permanecerá conectado neste dispositivo.')) return;
    setRevokingAll(true);
    try {
      const res = await apiFetch('/api/sessions', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Todas as outras sessões foram encerradas');
        load();
      } else {
        toast.error('Erro ao encerrar sessões');
      }
    } catch {
      toast.error('Erro');
    }
    setRevokingAll(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Sessões Ativas
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie os dispositivos conectados à sua conta</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} size="sm">
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          {sessions.length > 1 && (
            <Button variant="destructive" onClick={revokeAll} disabled={revokingAll} size="sm">
              <LogOut className="w-4 h-4 mr-1" /> Encerrar Outras
            </Button>
          )}
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
        <p className="text-blue-700 dark:text-blue-400 text-sm">
          Sessões ativas são dispositivos que realizaram login recentemente. Se você não reconhecer alguma sessão, encerre-a imediatamente e altere sua senha.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma sessão ativa encontrada.</p>
            <p className="text-xs text-muted-foreground mt-1">O rastreamento de sessões fica disponível após o próximo login.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, index) => {
            const device = parseDevice(s.userAgent);
            const browser = parseBrowser(s.userAgent);
            const Icon = device.icon;
            const isCurrent = index === 0;

            return (
              <Card key={s.id} className={isCurrent ? 'border-primary/40 bg-primary/5' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{device.label} — {browser}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                              Esta sessão
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 mt-0.5 flex-wrap">
                          {s.ipAddress && (
                            <span className="text-xs text-muted-foreground">IP: {s.ipAddress}</span>
                          )}
                          {(s.city || s.country) && (
                            <span className="text-xs text-muted-foreground">
                              {[s.city, s.country].filter(Boolean).join(', ')}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Último acesso: {timeAgo(s.lastSeenAt)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Login: {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isCurrent && (
                      <button
                        onClick={() => revoke(s.sessionId)}
                        disabled={revoking === s.sessionId}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        {revoking === s.sessionId ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Encerrar
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
