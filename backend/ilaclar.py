"""
ilaclar.py — İnotrop/vazopressör hazırlık tablosu, doz hesabı ve beslenme hesapları.

DİKKAT: Buradaki ILAC_TABLOSU, frontend/app.js içindeki aynı isimli tablonun
birebir eşi olmalıdır. Birini değiştirirken diğerini de değiştirin.
Backend bu tabloyu PDF çıktısı için, frontend ise canlı hesap için kullanır.

Doz formülü (kilo bazlı ilaçlar):
    konsantrasyon (mcg/cc) = miktar_mg * 1000 / hacim_cc
    doz (mcg/kg/dk)        = hiz_cc_saat * konsantrasyon / (60 * kilo)

Vazopressin kilo bazlı değildir:
    doz (ünite/dk) = hiz_cc_saat * (miktar_unite / hacim_cc) / 60
"""

from typing import Optional

# ── İlaç hazırlık tablosu ─────────────────────────────────────────────────────
# baz_miktar: x1 hazırlıkta hacim_cc içine konan miktar
ILAC_TABLOSU = {
    "Noradrenalin": {
        "baz_miktar": 8, "hacim_cc": 100, "miktar_birimi": "mg",
        "doz_birimi": "mcg/kg/dk", "min_doz": 0.1, "max_doz": 4, "kilo_bazli": True,
    },
    "Adrenalin": {
        "baz_miktar": 8, "hacim_cc": 100, "miktar_birimi": "mg",
        "doz_birimi": "mcg/kg/dk", "min_doz": 0.05, "max_doz": 2, "kilo_bazli": True,
    },
    "Dopamin": {
        "baz_miktar": 400, "hacim_cc": 100, "miktar_birimi": "mg",
        "doz_birimi": "mcg/kg/dk", "min_doz": 3, "max_doz": 20, "kilo_bazli": True,
    },
    "Dobutamin": {
        "baz_miktar": 500, "hacim_cc": 100, "miktar_birimi": "mg",
        "doz_birimi": "mcg/kg/dk", "min_doz": 2, "max_doz": 20, "kilo_bazli": True,
    },
    "Vazopressin": {
        "baz_miktar": 20, "hacim_cc": 100, "miktar_birimi": "ünite",
        "doz_birimi": "ünite/dk", "min_doz": 0.01, "max_doz": 0.07, "kilo_bazli": False,
    },
}

CARPANLAR = (1, 2, 4)

ILAC_LISTESI = list(ILAC_TABLOSU.keys())


def _sayi(deger) -> Optional[float]:
    """Boş/geçersiz değerleri None'a çevirir."""
    if deger is None or deger == "":
        return None
    try:
        f = float(str(deger).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return f


def doz_hesapla(ajan: str, miktar, hacim_cc, hiz_cc_saat, kilo) -> dict:
    """
    Uygulanan dozu ve referans aralığına göre durumunu hesaplar.

    Dönen sözlük:
        doz     : float | None   — hesaplanan doz
        birim   : str            — "mcg/kg/dk" veya "ünite/dk"
        durum   : "aralikta" | "dusuk" | "yuksek" | None
        min_doz / max_doz : referans aralığı
    """
    bos = {"doz": None, "birim": "", "durum": None, "min_doz": None, "max_doz": None}
    bilgi = ILAC_TABLOSU.get(ajan)
    if not bilgi:
        return bos

    miktar = _sayi(miktar)
    hacim = _sayi(hacim_cc)
    hiz = _sayi(hiz_cc_saat)
    kg = _sayi(kilo)

    sonuc = {
        "doz": None,
        "birim": bilgi["doz_birimi"],
        "durum": None,
        "min_doz": bilgi["min_doz"],
        "max_doz": bilgi["max_doz"],
    }
    if not miktar or not hacim or hiz is None:
        return sonuc

    if bilgi["kilo_bazli"]:
        if not kg:
            return sonuc  # kilo girilmeden kilo bazlı doz hesaplanamaz
        konsantrasyon = (miktar * 1000.0) / hacim      # mcg/cc
        doz = (hiz * konsantrasyon) / (60.0 * kg)      # mcg/kg/dk
    else:
        konsantrasyon = miktar / hacim                 # ünite/cc
        doz = (hiz * konsantrasyon) / 60.0             # ünite/dk

    sonuc["doz"] = doz
    if doz < bilgi["min_doz"]:
        sonuc["durum"] = "dusuk"
    elif doz > bilgi["max_doz"]:
        sonuc["durum"] = "yuksek"
    else:
        sonuc["durum"] = "aralikta"
    return sonuc


def hiz_hesapla(ajan: str, hedef_doz, miktar, hacim_cc, kilo) -> Optional[float]:
    """Hedef doz için gereken pompa hızını (cc/saat) döndürür."""
    bilgi = ILAC_TABLOSU.get(ajan)
    hedef = _sayi(hedef_doz)
    miktar = _sayi(miktar)
    hacim = _sayi(hacim_cc)
    kg = _sayi(kilo)
    if not bilgi or hedef is None or not miktar or not hacim:
        return None
    if bilgi["kilo_bazli"]:
        if not kg:
            return None
        konsantrasyon = (miktar * 1000.0) / hacim
        return (hedef * kg * 60.0) / konsantrasyon
    konsantrasyon = miktar / hacim
    return (hedef * 60.0) / konsantrasyon


def ajan_ozeti(ajan_dict: dict, kilo) -> dict:
    """
    Kaydedilmiş bir ajan sözlüğünü ekranda/PDF'te gösterilecek hale getirir.
    Tablodaki ilaçlar için doz hesaplanır; "Diğer" için serbest metin korunur.
    """
    ajan = (ajan_dict or {}).get("ajan", "")
    carpan = ajan_dict.get("carpan") or 1
    miktar = ajan_dict.get("miktar")
    hacim = ajan_dict.get("hacim_cc")
    hiz = ajan_dict.get("hiz_cc_saat")

    bilgi = ILAC_TABLOSU.get(ajan)
    if not bilgi:
        # Tabloda olmayan ajan (Diğer / eski kayıtlar): serbest metin dozu
        return {
            "ajan": ajan,
            "tabloda": False,
            "metin": ajan_dict.get("doz", "") or "",
            "durum": None,
        }

    # Eski kayıtlarda hazırlık alanları yoksa tablodaki varsayılanlara düş
    if not miktar:
        miktar = bilgi["baz_miktar"] * carpan
    if not hacim:
        hacim = bilgi["hacim_cc"]

    h = doz_hesapla(ajan, miktar, hacim, hiz, kilo)
    return {
        "ajan": ajan,
        "tabloda": True,
        "carpan": carpan,
        "miktar": miktar,
        "miktar_birimi": bilgi["miktar_birimi"],
        "hacim_cc": hacim,
        "hiz_cc_saat": _sayi(hiz),
        "doz": h["doz"],
        "doz_birimi": h["birim"],
        "durum": h["durum"],
        "min_doz": h["min_doz"],
        "max_doz": h["max_doz"],
        # Hız girilmemiş eski kayıtlarda serbest metin dozu kaybolmasın
        "metin": ajan_dict.get("doz", "") or "",
    }


# ── Beslenme / antropometri ───────────────────────────────────────────────────

# ESPEN yoğun bakım kılavuzu: 25-30 kcal/kg/gün (gerçek vücut ağırlığı üzerinden)
KCAL_MIN_PER_KG = 25
KCAL_MAX_PER_KG = 30


def vki_hesapla(kilo, boy_cm) -> Optional[float]:
    """Vücut kitle indeksi (kg/m²)."""
    kg = _sayi(kilo)
    boy = _sayi(boy_cm)
    if not kg or not boy:
        return None
    m = boy / 100.0
    return kg / (m * m)


def vki_sinifi(vki) -> str:
    """WHO sınıflaması."""
    if vki is None:
        return ""
    if vki < 18.5:
        return "Zayıf"
    if vki < 25:
        return "Normal"
    if vki < 30:
        return "Fazla kilolu"
    if vki < 35:
        return "Obez (sınıf I)"
    if vki < 40:
        return "Obez (sınıf II)"
    return "Obez (sınıf III)"


def kalori_ihtiyaci(kilo) -> Optional[dict]:
    """Günlük kalori ihtiyacı aralığı (kcal/gün)."""
    kg = _sayi(kilo)
    if not kg:
        return None
    return {
        "min": round(kg * KCAL_MIN_PER_KG),
        "max": round(kg * KCAL_MAX_PER_KG),
        "kcal_kg_min": KCAL_MIN_PER_KG,
        "kcal_kg_max": KCAL_MAX_PER_KG,
    }
