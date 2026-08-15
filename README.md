# Vizit Kağıdı — Yoğun Bakım Takip Sistemi

Yapılandırılmış hasta takibi, epikriz log'u ve yazdırılabilir PDF çıktısı.

## Kurulum

### 1. Python gereksinimi
Python 3.9+ kurulu olmalı.

### 2. Bağımlılıkları yükle
```bash
cd backend
pip install -r requirements.txt
```

### 3. Ayarları yap
`.env.example` dosyasını `.env` olarak kopyalayıp doldurun. Özellikle
`JWT_SECRET` tanımlanmazsa her açılışta rastgele üretilir ve sunucu yeniden
başladığında tüm oturumlar düşer.

### 4. Uygulamayı başlat
```bash
python main.py
```
veya
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Tarayıcıda aç: **http://localhost:8000**

API dokümantasyonu: **http://localhost:8000/docs**

---

## Özellikler

| Özellik | Detay |
|---------|-------|
| Hasta listesi | Yatak sırasına göre sıralı, durum ikonları |
| Durum ikonları | 🫁 Ventilatör, 💉 İnotrop, ⚠ Yaklaşan işlem |
| Epikriz log | Kronolojik; not eklenebilir, düzenlenebilir ve silinebilir |
| Yaklaşan işlem | 7 gün içindeki işlemler vurgulanır |
| Aktif / Taburcu | Sekme bazlı ayrım, arşiv kaybı yok |
| PDF export | Tüm aktif hastalar veya tek hasta |
| Otomatik yenileme | 60 saniyede bir liste güncellenir |

## Veri Yedekleme

Tüm veri `backend/vizit.db` dosyasında (veya `DB_PATH` neyi gösteriyorsa).
Bu dosyayı kopyalamak yeterli.

Veritabanı hasta verisi içerdiği için git'e gönderilmez. Dağıtımda `DB_PATH`
kalıcı bir diske işaret etmelidir; aksi halde her yeniden dağıtımda veri kaybolur.

## WeasyPrint (PDF) Notu

WeasyPrint Windows'ta GTK kütüphanesi gerektirir.
Sorun yaşarsan alternatif: `pip install pdfkit` ve wkhtmltopdf.
