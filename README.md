# WNR Finance - Deploy em VPS

## Requisitos Mínimos
- VPS com Ubuntu 22.04+ (ou similar)
- 2GB RAM mínimo (recomendado 4GB)
- 20GB disco
- Docker e Docker Compose

## Deploy Rápido

```bash
# 1. Envie os arquivos para o servidor
scp -r wnr-finance-backup/ usuario@seu-ip:/home/usuario/wnr-finance

# 2. No servidor:
cd /home/usuario/wnr-finance
chmod +x deploy.sh
./deploy.sh
```

## Deploy Manual (passo a passo)

### 1. Instalar Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Faça logout e login
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
nano .env
# Preencha: NEXTAUTH_URL, DB_PASSWORD, NEXTAUTH_SECRET
```

### 3. Build e start
```bash
docker compose build
docker compose up -d
```

### 4. Criar tabelas no banco
```bash
docker compose exec app npx prisma db push
```

### 5. (Opcional) Popular com dados iniciais
```bash
docker compose exec app npx prisma db seed
```

## Configurar SSL (HTTPS)

### 1. Apontar domínio
No painel da Hostinger, configure o DNS A record apontando para o IP do VPS.

### 2. Gerar certificado
```bash
# Edite nginx.conf → troque "server_name _" por "server_name seudominio.com"
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d seudominio.com
```

### 3. Ativar HTTPS
No `nginx.conf`, descomente o bloco `server 443` e ajuste o domínio.
```bash
docker compose restart nginx
```

### 4. Renovação automática
O Certbot já renova automaticamente via o container.

## Backup do Banco
```bash
# Fazer backup
docker compose exec postgres pg_dump -U wnr_user wnr_finance > backup_$(date +%Y%m%d).sql

# Restaurar backup
cat backup.sql | docker compose exec -T postgres psql -U wnr_user wnr_finance
```

## Atualizar o App
```bash
# Envie os novos arquivos para o servidor
docker compose build --no-cache
docker compose up -d
docker compose exec app npx prisma db push
```

## Logs e Debug
```bash
docker compose logs -f app       # Logs do app
docker compose logs -f postgres   # Logs do banco
docker compose logs -f nginx      # Logs do nginx
```

## Rotinas Automaticas

Configure `CRON_SECRET` no `.env` e agende as rotas abaixo no cron do servidor ou no provedor de deploy:

```bash
# Faturamento recorrente: gera conta a receber, emite NFS-e e depois boleto/Pix quando configurado
0 8 * * * curl -X POST https://seudominio.com/api/cron/pj-recurring-billing -H "Authorization: Bearer SEU_CRON_SECRET"

# Lembretes de WhatsApp
0 8 * * * curl -X POST https://seudominio.com/api/cron/whatsapp-reminders -H "Authorization: Bearer SEU_CRON_SECRET"
```

## Notas sobre Serviços

### Email (Recuperação de Senha)
O envio de email de recuperação de senha precisa ser configurado com SMTP.
Configure as variáveis `SMTP_*` no `.env`.

### AI Chat
O chat com IA é opcional. Configure `OPENAI_API_KEY` no `.env` para usar.

### Google Login
Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em [console.cloud.google.com](https://console.cloud.google.com).
