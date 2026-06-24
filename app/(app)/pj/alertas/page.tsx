'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, Bell, CheckCheck, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function PJAlertasPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/alerts');
      const data = await res.json();
      setAlerts(data.alerts || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { setAlerts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    apiFetch('/api/alerts/generate', { method: 'POST' }).then(() => load()).catch(() => load());
  }, [load]);

  const markRead = async (id: string) => {
    await apiFetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', id }) });
    load();
  };

  const markAllRead = async () => {
    await apiFetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read-all' }) });
    load();
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBg = (severity: string, isRead: boolean) => {
    if (isRead) return 'bg-gray-50';
    switch (severity) {
      case 'critical': return 'bg-red-50 border-l-4 border-l-red-500';
      case 'warning': return 'bg-amber-50 border-l-4 border-l-amber-500';
      default: return 'bg-blue-50 border-l-4 border-l-blue-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Central de Alertas</h1>
          <p className="text-muted-foreground mt-1">{unreadCount > 0 ? `${unreadCount} alerta(s) não lido(s)` : 'Todos os alertas lidos'}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead}><CheckCheck className="w-4 h-4 mr-2" />Marcar todos como lidos</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" /></div>
      ) : alerts.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="py-16 text-center text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-4 text-foreground" />
          <p>Nenhum alerta no momento</p>
          <p className="text-sm mt-1">Você será notificado sobre eventos importantes</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <motion.div key={alert.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <div className={`rounded-lg p-4 ${getBg(alert.severity, alert.isRead)} transition-colors cursor-pointer`}
                onClick={() => !alert.isRead && markRead(alert.id)}>
                <div className="flex items-start gap-3">
                  {getIcon(alert.severity)}
                  <div className="flex-1">
                    <p className={`font-medium text-sm ${alert.isRead ? 'text-muted-foreground' : 'text-gray-900'}`}>{alert.title}</p>
                    <p className={`text-sm mt-0.5 ${alert.isRead ? 'text-muted-foreground' : 'text-gray-600'}`}>{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!alert.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full mt-2" />}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
