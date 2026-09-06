#!/usr/bin/env bash
# Hasta veritabanının tutarlı bir yedeğini alır ve doğrular.
#   bash dagitim/yedek.sh
#
# NEDEN BASİT KOPYALAMA YETMİYOR: Veritabanı WAL modunda çalışıyor; son
# kayıtlar vizit.db dosyasında değil, yanındaki vizit.db-wal dosyasında
# bekliyor olabilir. Sadece vizit.db'yi kopyalamak sessizce eksik — hatta
# tamamen boş — bir yedek üretir. Bu yüzden SQLite'ın kendi backup işlevi
# kullanılıyor: çalışan uygulamayı durdurmadan bütünlüklü kopya alır.

set -euo pipefail
cd "$(dirname "$0")"

DOSYA="vizit_yedek_$(date +%Y-%m-%d_%H%M).db"

echo "Yedek alınıyor..."
sudo docker compose exec -T app python -c "
import sqlite3
kaynak = sqlite3.connect('/data/vizit.db')
hedef  = sqlite3.connect('/tmp/yedek.db')
kaynak.backup(hedef)
hedef.close(); kaynak.close()
"
sudo docker compose exec -T app cat /tmp/yedek.db > "$DOSYA"
sudo docker compose exec -T app rm -f /tmp/yedek.db

# Doğrulanmamış yedek, yedek sayılmaz.
echo "Doğrulanıyor..."
python3 - "$DOSYA" <<'PY'
import sqlite3, sys, os
d = sys.argv[1]
try:
    c = sqlite3.connect(d)
    if c.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        print("HATA: Yedek bozuk."); sys.exit(1)
    h = c.execute("SELECT COUNT(*) FROM hastalar").fetchone()[0]
    n = c.execute("SELECT COUNT(*) FROM epikriz_notlari").fetchone()[0]
    print(f"✓ {os.path.getsize(d)//1024} KB — {h} hasta, {n} seyir notu")
except Exception as e:
    print("HATA: Yedek okunamadı:", e); sys.exit(1)
PY

echo
echo "Yedek hazır: $(pwd)/$DOSYA"
echo
echo "Kendi bilgisayarınıza indirmek için (kendi bilgisayarınızda çalıştırın):"
echo "  scp -i anahtar.key ubuntu@SUNUCU_IP:$(pwd)/$DOSYA ."
echo
echo "Geri yüklemek için:"
echo "  sudo docker compose down"
echo "  sudo docker compose run --rm -T -v \"\$(pwd)/$DOSYA:/yedek.db:ro\" app cp /yedek.db /data/vizit.db"
echo "  sudo docker compose up -d"
