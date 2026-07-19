"""
models.py — Pydantic veri modelleri v2
Yeni alanlar: unite, kabul_epikrizi, klinik_durum (structured)
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import json


# ── Alt modeller ──────────────────────────────────────────────────────────────

class PlanlananIslem(BaseModel):
    tanim: str
    tarih: Optional[str] = None
    tamamlandi: bool = False


class GoruntulemeTetkik(BaseModel):
    tarih: str
    icerik: str


class Kultur(BaseModel):
    tur: str                     # "Kan", "TAS", "İdrar", "Yara", vb.
    tarih: str
    sonuc: str                   # "Bekleniyor" veya serbest metin
    antibiyotik_adi: str = ""
    antibiyotik_baslangic: str = ""


class InotropAjan(BaseModel):
    """Tek bir inotrop/sedasyon ajanı."""
    ajan: str = ""
    doz: str = ""


class KlinikDurum(BaseModel):
    """
    Yapılandırılmış klinik durum alanları.
    Tüm alanlar opsiyonel — kademeli doldurmaya izin verir.
    """
    # Solunum / Hava Yolu
    hava_yolu: str = ""          # "Entübe/Trakeostomili" | "Entübe değil"
    entube_destek: str = ""      # "Oda havası" | "Humidvent" | "T-tüp" | "Mekanik ventilatöre bağlı"
    non_entube_destek: List[str] = Field(default_factory=list) # ["Oda havasında", "Nazal kanül", "Basit maske", ...]
    
    # Mekanik ventilatör (Geriye dönük uyumluluk ve kolay sayım için)
    vent_var: bool = False
    vent_mod: str = ""           # SIMV, PSV, CPAP, AC, vb.

    # İnotrop / Vazopressör (birden fazla ajan)
    inot_var: bool = False
    inot_ajanlar: List[InotropAjan] = Field(default_factory=list)

    # Sedasyon
    sed_var: bool = False
    sed_ajanlar: List[InotropAjan] = Field(default_factory=list)

    # Beslenme
    beslenme: str = "Yok"        # Yok | Enteral | Parenteral | Enteral+Parenteral

    # Diürez
    diurez: str = ""             # serbest metin, örn. "800 ml/gün"

    # IR — pupil ışık refleksi
    ir_pupil: str = ""           # "Bilateral +/+" | "Sağ+ Sol-" | ... | "Değerlendirilemedi"

    # Vasküler Erişim
    cvp_var: bool = False
    cvp_yer: str = ""            # "SC" | "İJVC" | "Femoral"
    diyaliz_kateter_var: bool = False
    diyaliz_kateter_yer: str = ""  # "SC" | "İJVC" | "Femoral" | "Fistül"

    # Renal Takip
    diyaliz_var: bool = False
    diyaliz_gunleri: List[str] = Field(default_factory=list)  # ["Pzt","Çrş","Cum"] gibi
    crrt_var: bool = False
    crrt_baslangic: str = ""     # ISO date


# ── Ana modeller ──────────────────────────────────────────────────────────────

class HastaBase(BaseModel):
    unite: str = "ARYB-1"
    yatak_no: str
    ad_soyad: str
    tani: Optional[str] = ""
    kabul_epikrizi: Optional[str] = ""
    klinik_durum: Optional[KlinikDurum] = Field(default_factory=KlinikDurum)
    planlanan_islemler: Optional[List[PlanlananIslem]] = Field(default_factory=list)
    goruntuleme_tetkik: Optional[List[GoruntulemeTetkik]] = Field(default_factory=list)
    kultur_takibi: Optional[List[Kultur]] = Field(default_factory=list)
    genel_not: Optional[str] = ""
    cikis_turu: Optional[str] = None
    cikis_detayi: Optional[str] = None



class HastaCreate(HastaBase):
    pass


class HastaUpdate(HastaBase):
    durum: Optional[str] = "aktif"


class CikisRequest(BaseModel):
    islem_turu: str  # "taburcu", "servis", "exitus", "sevk", "devir"
    detay: Optional[str] = ""
    yeni_unite: Optional[str] = None
    yeni_yatak_no: Optional[str] = None


class EpikrizNotCreate(BaseModel):
    not_metni: str


class EpikrizNot(BaseModel):
    id: int
    hasta_id: int
    not_metni: str
    tarih: str


class Hasta(HastaBase):
    id: int
    durum: str
    olusturma_tarihi: str
    guncelleme_tarihi: str
    epikriz_notlari: List[EpikrizNot] = Field(default_factory=list)

    @classmethod
    def from_row(cls, row, epikriz=None) -> "Hasta":
        data = dict(row)

        # JSON alanlarını parse et
        for field in ("planlanan_islemler", "goruntuleme_tetkik", "kultur_takibi"):
            if isinstance(data.get(field), str):
                try:
                    data[field] = json.loads(data[field])
                except Exception:
                    data[field] = []

        # klinik_durum JSON parse
        kd_raw = data.get("klinik_durum", "{}")
        if isinstance(kd_raw, str):
            try:
                kd_dict = json.loads(kd_raw)
            except Exception:
                kd_dict = {}
        else:
            kd_dict = kd_raw or {}

        # Eski DB'den (ventilator/inotrop alanları varsa) geçiş uyumu
        if not kd_dict.get("vent_var") and data.get("ventilator"):
            kd_dict["vent_var"] = bool(data["ventilator"])
            kd_dict["vent_mod"] = data.get("ventilator_detay", "")
        if not kd_dict.get("inot_var") and data.get("inotrop"):
            kd_dict["inot_var"] = bool(data["inotrop"])
            detay = data.get("inotrop_detay", "")
            if detay:
                kd_dict["inot_ajanlar"] = [{"ajan": detay, "doz": ""}]

        data["klinik_durum"] = KlinikDurum(**kd_dict)
        data["epikriz_notlari"] = [dict(e) for e in (epikriz or [])]

        # Eski sütunları model dışı bırak
        for old in ("ventilator", "ventilator_detay", "inotrop", "inotrop_detay"):
            data.pop(old, None)

        return cls(**data)


# ── Yardımcı: ünite endpoint için dolu yatak listesi ─────────────────────────

class DoluYatakResponse(BaseModel):
    unite: str
    dolu_yataklar: List[int]
