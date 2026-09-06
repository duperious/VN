# Sunucuya Kurulum (Oracle Cloud / Google Cloud)

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

## Hangi sağlayıcı?

| | Oracle Always Free | Google e2-micro |
|---|---|---|
| Bellek | 12 GB (2 çekirdek ARM) | **1 GB** (paylaşımlı 2 vCPU) |
| Bölge | Frankfurt/Amsterdam seçilebilir | **Yalnızca ABD** (us-west1, us-central1, us-east1) |
| Gecikme (TR'den) | ~40-60 ms | ~150-200 ms |
| Disk | ~200 GB | 30 GB (Standard — SSD/Balanced ücretli) |
| Aylık veri | Bol | **1 GB dışa transfer** |
| Bilinen sıkıntı | Kapasite bulunamayabilir, 7 gün boşta kalırsa durdurulabilir | Düşük bellek, ABD gecikmesi |

Bu uygulama için ikisi de yeter. Google'da bellek dar olduğu için `kurulum.sh`
otomatik olarak 2 GB takas alanı açar. 1 GB veri sınırı da bu uygulama için
sorun değil: ekranlar metin ağırlıklı, aylarca dolmaz.

## Adımlar

### 1a. Google Cloud (e2-micro) ile

1. [console.cloud.google.com](https://console.cloud.google.com) — hesap açın, proje oluşturun.
2. **Compute Engine → VM instances → Create instance**
   - **Region:** `us-central1` (veya `us-west1` / `us-east1` — başka bölge ücretlidir)
   - **Machine type:** `e2-micro`
   - **Boot disk:** Ubuntu 22.04 LTS, **Standard persistent disk**, 30 GB
     (Balanced veya SSD seçmeyin, ücretlidir)
   - **Firewall:** "Allow HTTP traffic" ve "Allow HTTPS traffic" kutularını işaretleyin
3. Oluşan sunucunun **External IP** adresini not edin, **Static IP** yapın
   (VPC network → IP addresses → Reserve). Aksi halde yeniden başlatınca IP değişir
   ve alan adınız yanlış yeri gösterir.
4. Bağlanmak için satırdaki **SSH** düğmesi yeterlidir (tarayıcıdan açılır).

Sonra doğrudan [4. adıma](#4-sunucuya-bağlanın-ve-kurun) geçin.

### 1b. Oracle hesabı ve sunucu

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

### 2. Portları açın (yalnızca Oracle'da gerekir)

**a) OCI panelinde:** Instance → Virtual Cloud Network → Security Lists →
Default Security List → **Add Ingress Rules**:

| Source CIDR | Protokol | Port |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

**b) Sunucunun içinde:** `kurulum.sh` bunu sizin için yapar.

Bu iki adımdan biri eksikse site açılmaz. Oracle'da en sık yapılan hata budur.
Google'da kurulum sırasında HTTP/HTTPS kutularını işaretlediyseniz bu adım gerekmez.

### 3. Ücretsiz alan adı

HTTPS için bir alan adı gerekiyor. [duckdns.org](https://www.duckdns.org)
ücretsiz: giriş yapın, bir isim seçin (örn. `vizit-abc`), sunucunuzun public IP
adresini yazın. Adresiniz `vizit-abc.duckdns.org` olur.

### 4. Sunucuya bağlanın ve kurun
<a id="4-sunucuya-bağlanın-ve-kurun"></a>

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

- **Oracle:** 7 gün boşta kalan Always Free sunucular durdurulabiliyor. Hesabı
  "Pay As You Go"ya çevirirseniz bu uygulanmaz ve limit içinde kaldıkça
  ücret çıkmaz.
- **Google:** Ücretsiz kalmak için üç şart — bölge us-west1/us-central1/us-east1,
  makine e2-micro, disk **Standard** (SSD/Balanced ücretlidir). Ayrıca dış IP'yi
  statik yapın; yeniden başlatınca IP değişirse alan adınız boşa düşer.
  Faturalandırma bölümünden bütçe uyarısı kurmanız iyi olur.
- **Veri yalnızca bu sunucuda.** Yedek almazsanız sunucu kaybolduğunda veri de
  kaybolur.
- Uygulama tek kullanıcılıdır; şifreyi paylaşan herkes aynı hesabı kullanır.
  İşlem kayıtları tutulur ama hepsi aynı kullanıcı adına yazılır.
