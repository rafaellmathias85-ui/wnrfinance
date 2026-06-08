#!/bin/bash
# ============================
# WNR FINANCE - Script de Deploy
# Para VPS Ubuntu (Hostinger/qualquer)
# ============================
set -e

echo "========================================"
echo " WNR FINANCE - Setup de Produção"
echo "========================================"

# 1. Instalar Docker (se necessário)
if ! command -v docker &> /dev/null; then
    echo "\n[1/6] Instalando Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker instalado! Faça logout e login novamente, depois rode este script de novo."
    exit 0
else
    echo "\n[1/6] Docker já instalado ✓"
fi

# 2. Instalar Docker Compose plugin (se necessário)
if ! docker compose version &> /dev/null; then
    echo "\n[2/6] Instalando Docker Compose..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
else
    echo "\n[2/6] Docker Compose já instalado ✓"
fi

# 3. Verificar .env
if [ ! -f .env ]; then
    echo "\n[3/6] Criando .env a partir do template..."
    cp .env.example .env
    
    # Gerar NEXTAUTH_SECRET automaticamente
    SECRET=$(openssl rand -base64 32)
    sed -i "s|gere_com_openssl_rand_base64_32|$SECRET|" .env
    
    # Gerar senha do banco automaticamente  
    DB_PASS=$(openssl rand -base64 24 | tr -d '/+=\n' | head -c 24)
    sed -i "s|TROQUE_POR_UMA_SENHA_FORTE|$DB_PASS|" .env
    
    echo "\n⚠️  IMPORTANTE: Edite o arquivo .env antes de continuar!"
    echo "   - Ajuste NEXTAUTH_URL para seu domínio"
    echo "   - Configure GOOGLE_CLIENT_ID/SECRET se quiser login Google"
    echo "   nano .env"
    echo ""
    read -p "Pressione ENTER quando terminar de editar o .env..."
else
    echo "\n[3/6] .env já existe ✓"
fi

# 4. Build
echo "\n[4/6] Construindo imagens Docker..."
docker compose build --no-cache

# 5. Subir serviços
echo "\n[5/6] Subindo serviços..."
docker compose up -d

# 6. Rodar migrações do Prisma
echo "\n[6/6] Aplicando migrações do banco de dados..."
sleep 10  # Aguardar PostgreSQL iniciar
docker compose exec app npx prisma db push

echo ""
echo "========================================"
echo " ✅ WNR FINANCE está rodando!"
echo "========================================"
echo ""
echo " Acesse: http://$(curl -s ifconfig.me 2>/dev/null || echo 'SEU_IP')"
echo ""
echo " Para configurar SSL com domínio:"
echo "   1. Aponte seu domínio para o IP deste servidor"
echo "   2. Edite nginx.conf com seu domínio"
echo "   3. docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d seudominio.com"
echo "   4. Descomente o bloco HTTPS no nginx.conf"
echo "   5. docker compose restart nginx"
echo ""
echo " Comandos úteis:"
echo "   docker compose logs -f app    # Ver logs"
echo "   docker compose restart app    # Reiniciar app"
echo "   docker compose down            # Parar tudo"
echo "   docker compose up -d           # Subir tudo"
echo ""
