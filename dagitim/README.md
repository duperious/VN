# Oracle Cloud'a Kurulum

Uygulamayı ücretsiz bir Oracle Cloud sunucusunda, kendi adresinde ve HTTPS ile
çalıştırmak için. Sunucu sürekli açık kalır; kendi bilgisayarınızın açık olması
gerekmez.

## Ne kurulur

| Parça | Görevi |
|---|---|
| **app** | Uygulamanın kendisi (Docker konteyneri) |
| **caddy** | HTTPS sertifikasını otomatik alan ve yenileyen ters vekil |
| **vizit-veri** | Hasta veritabanının durduğu kalıcı disk alanı |
| **yedek.sh** | Tutarlı yedek alır ve doğrular |

Veritabanı Docker biriminde tutulur; konteyner silinip yeniden kurulsa da veri kalır.

## Adımlar

### 1. Oracle hesabı ve sunucu

1. [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) — hesap açın.
   Doğrulama için kart isterler, Always Free sınırları içinde ücret çıkmaz.
2. **Ana bölgeyi (home region) dikkatli seçin — sonradan değiştirilemez.**
   Türkiye'ye yakın olması için Frankfurt veya Amsterdam uygundur.
3. Compute → Instances → **Create instance**
   - **Image:** Canonical Ubuntu (22.04 veya 24.04)
   - **Shape:** `VM.Standard.A1.Flex` (Ampere/ARM) — "Always Free eligible" yazmalı
   - 1-2 OCPU, 6-12 GB bellek
   - SSH anahtarınızı yükleyin veya oluşturup **özel anahtarı indirin**
   - Genel IP atanmış olsun
4. Oluşan sunucunun **Public IP** adresini not edin.

### 2. Portları açın (iki yerde!)

**a) OCI panelinde:** Instance → Virtual Cloud Network → Security Lists →
Default Security List → **Add Ingress Rules**:

| Source CIDR | Protokol | Port |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

**b) Sunucunun içinde:** `kurulum.sh` bunu sizin için yapar.

Bu iki adımdan biri eksikse site açılmaz. En sık yapılan hata budur.

### 3. Ücretsiz alan adı

HTTPS için bir alan adı gerekiyor. [duckdns.org](https://www.duckdns.org)
ücretsiz: giriş yapın, bir isim seçin (örn. `vizit-abc`), sunucunuzun public IP
adresini yazın. Adresiniz `vizit-abc.duckdns.org` olur.

### 4. Sunucuya bağlanın ve kurun

```bash
ssh -i indirdiginiz_anahtar.key ubuntu@SUNUCU_IP

git clone -b claude/check-status-and-gaps-6n43ee https://github.com/duperious/VN.git
cd VN
bash dagitim/kurulum.sh
```

Betik alan adınızı, kullanıcı adınızı ve yeni şifrenizi sorar; gerisini yapar.

### 5. Kontrol

Tarayıcıdan `https://alan-adiniz.duckdns.org` — giriş ekranı gelmeli, adres
çubuğunda kilit simgesi olmalı. Sertifika 1-2 dakika içinde gelir.

## Günlük işler

```bash
cd ~/VN/dagitim

sudo docker compose logs -f          # kayıtları izle
sudo docker compose restart          # yeniden başlat
sudo docker compose down             # durdur
sudo docker compose up -d --build    # güncelledikten sonra yeniden kur
```

**Yedek almak** (düzenli yapın, veri sadece bu sunucuda):

```bash
bash dagitim/yedek.sh
```

Tarihli bir yedek dosyası üretir, bütünlüğünü doğrular ve içindeki hasta
sayısını yazar. Bitince kendi bilgisayarınıza indirmek için gereken `scp`
komutunu da ekrana yazar.

> Veritabanını `cp` veya `cat` ile kopyalamayın. Uygulama WAL modunda çalışıyor;
> son kayıtlar ayrı bir dosyada beklediği için düz kopya **eksik, hatta tamamen
> boş** bir yedek üretir. `yedek.sh` SQLite'ın kendi backup işlevini kullanır.

**Güncelleme:**

```bash
cd ~/VN && git pull && cd dagitim && sudo docker compose up -d --build
```

## Bilinmesi gerekenler

- **7 gün boşta kalan Always Free sunucular durdurulabiliyor.** Hesabı
  "Pay As You Go"ya çevirirseniz bu uygulanmaz ve limit içinde kaldıkça
  ücret çıkmaz.
- **Veri yalnızca bu sunucuda.** Yedek almazsanız sunucu kaybolduğunda veri de
  kaybolur.
- Uygulama tek kullanıcılıdır; şifreyi paylaşan herkes aynı hesabı kullanır.
  İşlem kayıtları tutulur ama hepsi aynı kullanıcı adına yazılır.
