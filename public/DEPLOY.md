# 🚀 WNR Finance — Deploy em VPS (Hostinger/Ubuntu)

## Pré-requisitos
- VPS Ubuntu 22.04+ com mínimo 2GB RAM
- Docker e Docker Compose instalados
- Domínio apontando para o IP da VPS

---

## 1. Preparação do Servidor

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## 2. Clonar e Configurar

```bash
# Criar diretório
mkdir -p /opt/wnr-finance && cd /opt/wnr-finance

# Copiar arquivos do projeto (via SCP ou git)
scp -r ./nextjs_space/* user@servidor:/opt/wnr-finance/

# Copiar arquivos Docker da pasta public/
cp public/Dockerfile .
cp public/docker-compose.yml .
cp public/nginx.conf .
cp public/env.example .env

# Editar .env com suas credenciais
nano .env
```

## 3. Gerar NEXTAUTH_SECRET

```bash
openssl rand -base64 32
# Cole o resultado no .env como NEXTAUTH_SECRET
```

## 4. Build e Start

```bash
# Subir tudo
docker-compose up -d --build

# Verificar logs
docker-compose logs -f app

# Rodar migrations
docker-compose exec app npx prisma db push
```

## 5. Configurar SSL com Certbot

```bash
# Gerar certificado (substitua seudominio.com)
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d seudominio.com \
  --email seu@email.com \
  --agree-tos

# Descomente o bloco HTTPS no nginx.conf
# Substitua seudominio.com pelo seu domínio
nano nginx.conf

# Reiniciar nginx
docker-compose restart nginx
```

## 6. Comandos Úteis

```bash
# Parar tudo
docker-compose down

# Rebuild após mudanças
docker-compose up -d --build app

# Ver logs em tempo real
docker-compose logs -f

# Backup do banco
docker-compose exec postgres pg_dump -U wnr_user wnr_finance > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker-compose exec -T postgres psql -U wnr_user wnr_finance < backup.sql

# Atualizar certificado SSL manualmente
docker-compose run --rm certbot renew
```

## 7. Monitoramento

```bash
# Status dos containers
docker-compose ps

# Uso de recursos
docker stats

# Logs do nginx (erros)
docker-compose logs nginx | grep error
```

## 8. Firewall

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

---

## Estrutura de Diretórios no Servidor

```
/opt/wnr-finance/
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env
├── prisma/
├── app/
├── components/
├── lib/
├── public/
├── package.json
└── yarn.lock
```

## Troubleshooting

| Problema | Solução |
|----------|----------|
| Container reiniciando | `docker-compose logs app` para ver erro |
| Banco não conecta | Verificar DATABASE_URL no .env |
| 502 Bad Gateway | Esperar app iniciar ou verificar porta |
| SSL não funciona | Verificar se domínio aponta para IP correto |
