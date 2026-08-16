#!/usr/bin/env python3
"""
hasta_aktar.py — JSON dosyasındaki hastaları uygulamaya aktarır.

Kullanım (sunucu çalışırken, ayrı bir terminalde):

    python araclar/hasta_aktar.py araclar/aryb2_hastalar.json

Önce ne ekleneceğini gösterir, onay ister, sonra ekler.
Dolu yatak veya doğrulama hatası olursa o hastayı atlar ve sonunda raporlar —
yarısı eklenip yarısı sessizce kaybolmaz.
"""

import getpass
import json
import sys
from pathlib import Path
from urllib import error, request

VARSAYILAN_ADRES = "http://localhost:8000"


def istek(adres: str, yol: str, yontem: str = "GET", govde=None, token: str = ""):
    veri = json.dumps(govde).encode("utf-8") if govde is not None else None
    r = request.Request(adres + yol, data=veri, method=yontem)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with request.urlopen(r, timeout=30) as cevap:
            metin = cevap.read().decode("utf-8")
            return cevap.status, (json.loads(metin) if metin else None)
    except error.HTTPError as e:
        metin = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(metin)
        except json.JSONDecodeError:
            return e.code, {"detail": metin[:300]}
    except error.URLError as e:
        print(f"\nHATA: Sunucuya bağlanılamadı ({adres}). Çalışıyor mu?\n  {e.reason}")
        sys.exit(1)


def hata_metni(govde) -> str:
    """FastAPI doğrulama hatalarını okunur hale getirir."""
    if not isinstance(govde, dict):
        return str(govde)[:200]
    detay = govde.get("detail", govde)
    if isinstance(detay, list):
        return "; ".join(d.get("msg", str(d)).replace("Value error, ", "") for d in detay)
    return str(detay)[:200]


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    dosya = Path(sys.argv[1])
    if not dosya.exists():
        print(f"HATA: Dosya bulunamadı: {dosya}")
        sys.exit(1)

    adres = (sys.argv[2] if len(sys.argv) > 2 else VARSAYILAN_ADRES).rstrip("/")
    veri = json.loads(dosya.read_text(encoding="utf-8"))
    unite = veri["unite"]
    hastalar = veri["hastalar"]

    # ── Önizleme ──────────────────────────────────────────────────────────────
    print(f"\n{dosya.name} → {adres}")
    print(f"Ünite: {unite} — {len(hastalar)} hasta\n")
    print(f"  {'Yatak':<6} {'Ad':<9} {'Tanı':<48} {'Kültür':<7} {'AB'}")
    print("  " + "-" * 78)
    for h in hastalar:
        tani = h.get("tani", "")
        print(f"  {h['yatak_no']:<6} {h['ad_soyad']:<9} "
              f"{(tani[:45] + '…') if len(tani) > 46 else tani:<48} "
              f"{len(h.get('kultur_takibi', [])):<7} {len(h.get('antibiyotikler', []))}")

    print(f"\nBu {len(hastalar)} hasta {unite} ünitesine eklenecek.")
    if input("Devam edilsin mi? (e/h): ").strip().lower() not in ("e", "evet"):
        print("İptal edildi. Hiçbir şey eklenmedi.")
        return

    # ── Giriş ─────────────────────────────────────────────────────────────────
    kullanici = input("\nKullanıcı adı: ").strip()
    sifre = getpass.getpass("Şifre: ")
    kod, cevap = istek(adres, "/api/auth/login", "POST",
                       {"kullanici_adi": kullanici, "sifre": sifre})
    if kod != 200:
        print(f"Giriş başarısız ({kod}): {hata_metni(cevap)}")
        sys.exit(1)
    token = cevap["access_token"]
    print("Giriş başarılı.\n")

    # ── Aktarım ───────────────────────────────────────────────────────────────
    eklenen, atlanan = [], []
    for h in hastalar:
        kayit = {k: v for k, v in h.items() if not k.startswith("_")}
        kayit["unite"] = unite
        kod, cevap = istek(adres, "/api/hastalar", "POST", kayit, token)
        if kod == 201:
            eklenen.append(h)
            print(f"  ✓ Yatak {h['yatak_no']:>2} — {h['ad_soyad']}")
        else:
            atlanan.append((h, kod, hata_metni(cevap)))
            print(f"  ✗ Yatak {h['yatak_no']:>2} — {h['ad_soyad']}: {hata_metni(cevap)}")

    # ── Özet ──────────────────────────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print(f"Eklenen: {len(eklenen)}   Atlanan: {len(atlanan)}")
    if atlanan:
        print("\nEklenemeyenler:")
        for h, kod, mesaj in atlanan:
            print(f"  Yatak {h['yatak_no']} ({h['ad_soyad']}) — HTTP {kod}: {mesaj}")
        print("\nBunları elle ekleyebilir veya sebebi giderip betiği tekrar "
              "çalıştırabilirsiniz (eklenenler 'yatak dolu' hatası verecektir).")


if __name__ == "__main__":
    main()
