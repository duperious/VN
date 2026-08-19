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
echo "=== 3/5  Güvenlik duvarı (80/443) ==="
# Oracle'ın Ubuntu imajları SSH dışında her şeyi kapatır.
# AYRICA OCI panelinden Security List'e de kural eklemeniz gerekir!
for PORT in 80 443; do
    if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
        sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT
    fi
done
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || true
echo "80 ve 443 açıldı."

echo
echo "=== 4/5  Uygulama derleniyor ==="
$DOCKER compose build

echo
echo "=== 5/5  Ayarlar ==="
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
