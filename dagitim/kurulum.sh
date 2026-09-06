#!/usr/bin/env bash
# Oracle Cloud Ubuntu sunucusunda tek seferlik kurulum.
#   bash dagitim/kurulum.sh
#
# Docker kurar, güvenlik duvarını açar, ayar dosyasını üretir
# (rastgele JWT anahtarı + girdiğiniz şifrenin bcrypt hash'i), uygulamayı başlatır.

set -euo pipefail
cd "$(dirname "$0")"

DOCKER="sudo docker"

echo "=== 1/5  Sistem güncelleniyor ==="
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl

echo
echo "=== 2/5  Docker ==="
if command -v docker >/dev/null 2>&1; then
    echo "Zaten kurulu."
else
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER" || true
fi

echo
echo "=== 3/6  Takas alanı (düşük bellekli sunucular) ==="
# Google e2-micro gibi 1 GB bellekli makinelerde docker derlemesi bellek
# yetmediği için yarıda kesilebiliyor. 2 GB'ın altındaysa takas alanı açılır.
BELLEK_MB=$(free -m | awk '/^Mem:/{print $2}')
TAKAS_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "$BELLEK_MB" -lt 2000 ] && [ "$TAKAS_MB" -lt 512 ]; then
    echo "Bellek ${BELLEK_MB} MB — 2 GB takas alanı açılıyor."
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
    sudo swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
    echo "Gerekmiyor (bellek ${BELLEK_MB} MB, takas ${TAKAS_MB} MB)."
fi

echo
echo "=== 4/6  Güvenlik duvarı (80/443) ==="
# Oracle'ın imajlarında SSH dışında her şey kapalıdır; Google ve çoğu
# sağlayıcıda INPUT zinciri boştur ve buna gerek yoktur. Sadece gerçekten
# kısıtlı bir zincir varsa kural ekleniyor.
if sudo iptables -S INPUT 2>/dev/null | grep -qE -- '-j (REJECT|DROP)|^-P INPUT DROP'; then
    for PORT in 80 443; do
        sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null \
            || sudo iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
    done
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
    sudo netfilter-persistent save >/dev/null 2>&1 || true
    echo "80 ve 443 sunucu içinde açıldı."
else
    echo "Sunucu içi güvenlik duvarı kısıtlı değil, dokunulmadı."
fi
echo "NOT: Sağlayıcı panelinden de 80/443 açılmalı (Oracle: Security List, Google: VPC firewall)."

echo
echo "=== 5/6  Uygulama derleniyor ==="
$DOCKER compose build

echo
echo "=== 6/6  Ayarlar ==="
if [ -f vizit.env ]; then
    echo "vizit.env zaten var, dokunulmuyor. Yeniden üretmek için önce silin."
else
    read -rp "Alan adınız (örn. vizit-abc.duckdns.org): " ALAN_ADI
    [ -n "$ALAN_ADI" ] || { echo "Alan adı boş olamaz."; exit 1; }
    read -rp "Kullanıcı adı [byieaharyb]: " KULLANICI
    KULLANICI=${KULLANICI:-byieaharyb}
    read -rsp "Yeni şifre (en az 8 karakter): " SIFRE; echo
    read -rsp "Şifre tekrar: " SIFRE2; echo
    [ "$SIFRE" = "$SIFRE2" ] || { echo "Şifreler uyuşmadı."; exit 1; }
    [ ${#SIFRE} -ge 8 ] || { echo "Şifre çok kısa."; exit 1; }

    echo "Şifre hash'leniyor..."
    # Şifre ortam değişkeniyle geçiriliyor: içinde tırnak/özel karakter olsa
    # bile komut satırında bozulmasın.
    HASH=$($DOCKER compose run --rm -T -e PW="$SIFRE" app \
        python -c "import bcrypt,os;print(bcrypt.hashpw(os.environ['PW'].encode(),bcrypt.gensalt()).decode())" \
        | tr -d '\r\n')
    case "$HASH" in
        \$2*) : ;;
        *) echo "Hash üretilemedi. Çıktı: $HASH"; exit 1 ;;
    esac
    JWT=$(head -c 64 /dev/urandom | base64 | tr -d '\n/+=' | head -c 64)

    umask 077
    cat > vizit.env <<ENV
ALAN_ADI=$ALAN_ADI
AUTH_USERNAME=$KULLANICI
AUTH_PASSWORD_HASH=$HASH
JWT_SECRET=$JWT
COOKIE_SECURE=1
DB_PATH=/data/vizit.db
ENV
    echo "vizit.env oluşturuldu (şifre hash'lenmiş olarak saklandı, düz metin değil)."
fi

echo
echo "Uygulama başlatılıyor..."
$DOCKER compose up -d

ADRES=$(grep "^ALAN_ADI=" vizit.env | cut -d= -f2-)
echo
echo "════════════════════════════════════════════════════════"
echo "  Kurulum bitti."
echo "  Adres:  https://$ADRES"
echo
echo "  HTTPS sertifikasının alınması 1-2 dakika sürebilir."
echo "  Kayıtlar:   sudo docker compose logs -f"
echo "  Durdurmak:  sudo docker compose down"
echo "  Yedek:      bash dagitim/yedek.sh"
echo "════════════════════════════════════════════════════════"
