'use client';
import { apiFetch } from '@/lib/fetch';
import { FileKey, KeyRound } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Clock, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';


interface Certificate {
  id: string;
  fileName: string;
  thumbprint: string | null;
  expiresAt: string | null;
  cnpj: string | null;
  cloudPath: string | null;
  metadata: any;
  createdAt: string;
}

function certStatus(expiresAt: string | null) {
  if (!expiresAt) return { label: 'Sem validade', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' };
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Expirado', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', days };
  if (days <= 30) return { label: `Expira em ${days}d`, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', days };
  return { label: `Valido por ${days}d`, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', days };
}

export default function CertificadosPage() {
  const { activeCompanyId } = usePJ();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pj/certificates');
      if (res.ok) setCerts(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDialog = () => { setFile(null); setPassword(''); setDescription(''); setDialogOpen(true); };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // 1. Get presigned URL
      const presignRes = await apiFetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: 'application/x-pkcs12', isPublic: false }),
      });
      const presign = await presignRes.json();
      if (!presign.uploadUrl) throw new Error('Erro ao obter URL de upload');

      // 2. Upload file to cloud
      await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/x-pkcs12' } });

      // 3. Save metadata
      const metaRes = await apiFetch('/api/pj/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          cloudPath: presign.cloud_storage_path,
          metadata: {
            description: description || file.name,
            hasPassword: !!password,
            uploadedAt: new Date().toISOString(),
          },
        }),
      });
      if (!metaRes.ok) throw new Error('Erro ao salvar metadados');

      toast.success('Certificado enviado com sucesso!');
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload');
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este certificado? Esta acao nao pode ser desfeita.')) return;
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/pj/certificates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao remover');
      toast.success('Certificado removido');
      setCerts(prev => prev.filter(c => c.id !== id));
    } catch {
      toast.error('Erro ao remover certificado');
    }
    setDeleting(null);
  };

  const expiring = certs.filter(c => {
    if (!c.expiresAt) return false;
    const days = Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  });
  const expired = certs.filter(c => c.expiresAt && new Date(c.expiresAt) < new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Certificados Digitais
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie seus certificados A1 para emissao de NF-e</p>
        </div>
        <Button onClick={openDialog} className="bg-primary hover:bg-primary/90">
          <Upload className="w-4 h-4 mr-2" /> Novo Certificado
        </Button>
      </div>

      {/* Alertas */}
      {expired.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-400 text-sm font-medium">
            {expired.length} certificado{expired.length > 1 ? 's' : ''} expirado{expired.length > 1 ? 's' : ''}. Renove para continuar emitindo NF-e.
          </p>
        </div>
      )}
      {expiring.length > 0 && expired.length === 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-700 dark:text-amber-400 text-sm font-medium">
            {expiring.length} certificado{expiring.length > 1 ? 's' : ''} expira{expiring.length === 1 ? '' : 'm'} em menos de 30 dias.
          </p>
        </div>
      )}

      {/* How-to info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <FileKey className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground mb-1">Como obter seu certificado A1</p>
              <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Adquira junto a uma AC credenciada pela ICP-Brasil (Certisign, Serasa, Soluti, etc.)</li>
                <li>Solicite o tipo <strong>e-CNPJ A1</strong> para emissao de NF-e</li>
                <li>O arquivo tera extensao <strong>.pfx</strong> ou <strong>.p12</strong> com uma senha</li>
                <li>Validade tipica: 1 ano — renove antes do vencimento</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certificate list */}
      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : certs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum certificado cadastrado ainda.</p>
            <Button onClick={openDialog} className="mt-4">
              <Upload className="w-4 h-4 mr-2" /> Fazer Upload do Certificado A1
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {certs.map(cert => {
            const status = certStatus(cert.expiresAt);
            return (
              <Card key={cert.id} className={cert.expiresAt && new Date(cert.expiresAt) < new Date() ? 'border-red-300 dark:border-red-800' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <KeyRound className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{cert.metadata?.description || cert.fileName}</p>
                        <div className="flex flex-wrap gap-3 mt-0.5">
                          {cert.cnpj && <span className="text-xs text-muted-foreground">CNPJ: {cert.cnpj}</span>}
                          {cert.thumbprint && <span className="text-xs text-muted-foreground font-mono">...{cert.thumbprint.slice(-8)}</span>}
                          <span className="text-xs text-muted-foreground">
                            Enviado em {new Date(cert.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        {status.days !== undefined && status.days < 0 ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : status.days !== undefined && status.days <= 30 ? (
                          <Clock className="w-3 h-3" />
                        ) : (
                          <CheckCircle className="w-3 h-3" />
                        )}
                        {status.label}
                      </span>
                      {cert.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                          Validade: {new Date(cert.expiresAt).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(cert.id)}
                        disabled={deleting === cert.id}
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deleting === cert.id ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Certificado Digital A1</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Arquivo do Certificado (.pfx / .p12)</Label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`mt-1 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <input ref={fileRef} type="file" accept=".pfx,.p12" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <KeyRound className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setFile(null); }} className="ml-2 text-muted-foreground hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm">Clique ou arraste o arquivo .pfx / .p12</p>
                    <p className="text-xs text-muted-foreground mt-1">Maximo: 5MB</p>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="cert-password">Senha do Certificado</Label>
              <Input id="cert-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Senha definida ao gerar o certificado" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                A senha sera usada somente durante a emissao de NF-e e nao e armazenada em texto claro.
              </p>
            </div>

            <div>
              <Label htmlFor="cert-desc">Descricao (opcional)</Label>
              <Input id="cert-desc" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Certificado NF-e 2025" className="mt-1" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleUpload} disabled={!file || uploading} className="flex-1 bg-primary hover:bg-primary/90">
                {uploading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Enviando...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />Fazer Upload</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}