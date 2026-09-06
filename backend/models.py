"""
models.py — Pydantic veri modelleri v2
Yeni alanlar: unite, kabul_epikrizi, klinik_durum (structured)
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
import json

from database import UNITE_KONFIG


# ── Alt modeller ──────────────────────────────────────────────────────────────

class PlanlananIslem(BaseModel):
    tanim: str
    tarih: Optional[str] = None
    tamamlandi: bool = False


class GoruntulemeTetkik(BaseModel):
    tarih: Optional[str] = ""
    icerik: str = ""


class Kultur(BaseModel):
    tur: str = ""                     # "Kan", "TAS", "İdrar", "Yara", vb.
    tarih: Optional[str] = ""
    sonuc: Optional[str] = "Bekleniyor" # "Bekleniyor" veya serbest metin
    antibiyotik_adi: Optional[str] = ""    # Geriye dönük uyum için kalabilir
    antibiyotik_baslangic: Optional[str] = ""


class Antibiyotik(BaseModel):
    ad: str = ""
    doz: Optional[str] = ""
    baslangic_tarihi: Optional[str] = ""
    ilişkili_kultur: Optional[str] = None


class InotropAjan(BaseModel):
    """
    Tek bir inotrop/sedasyon ajanı.

    Tablodaki ilaçlar (bkz. ilaclar.py) için hazırlık bilgisi ve pompa hızı
    tutulur; uygulanan doz bunlardan hesaplanır, saklanmaz. "Diğer" seçeneği
    ve eski kayıtlar için serbest metin `doz` alanı korunur.
    """
    ajan: str = ""
    doz: str = ""                              # serbest metin (Diğer / eski kayıtlar)
    carpan: int = 1                            # hazırlık katı: x1 | x2 | x4
    hacim_cc: Optional[float] = None           # sulandırma hacmi (varsayılan 100)
    miktar: Optional[float] = None             # torbadaki toplam mg (vazopressinde ünite)
    hiz_cc_saat: Optional[float] = None        # pompa hızı


class KlinikDurum(BaseModel):
    """
    Yapılandırılmış klinik durum alanları.
    Tüm alanlar opsiyonel — kademeli doldurmaya izin verir.
    """
    # Solunum / Hava Yolu
    # "Entübe" | "Trakeostomili" | "Entübe değil"
    # (eski kayıtlarda tek seçenek olan "Entübe/Trakeostomili" de gelebilir)
    hava_yolu: str = ""
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
    # Enteral yolları — birden fazla olabilir (NG'den verilirken oral denenebiliyor)
    beslenme_yollari: List[str] = Field(default_factory=list)  # ["NG", "Oral"] gibi

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
    crrt_tipi: str = ""          # "Heparinli" | "Heparinsiz" | "Sitrat"

    # Dirençli şokta inotropun yanında giden ek tedaviler
    bikarbonat_var: bool = False        # derin asidozda
    metilen_mavisi_var: bool = False    # vazoplejik şokta
    hidrokortizon_var: bool = False


# ── Ana modeller ──────────────────────────────────────────────────────────────

class HastaBase(BaseModel):
    unite: str = "ARYB-1"
    yatak_no: str
    ad_soyad: str
    tani: Optional[str] = ""
    kilo: Optional[float] = None      # kg — VKİ, kalori ve inotrop dozu için
    boy: Optional[float] = None       # cm
    kabul_epikrizi: Optional[str] = ""
    klinik_durum: Optional[KlinikDurum] = Field(default_factory=KlinikDurum)
    planlanan_islemler: Optional[List[PlanlananIslem]] = Field(default_factory=list)
    goruntuleme_tetkik: Optional[List[GoruntulemeTetkik]] = Field(default_factory=list)
    kultur_takibi: Optional[List[Kultur]] = Field(default_factory=list)
    antibiyotikler: Optional[List[Antibiyotik]] = Field(default_factory=list)
    genel_not: Optional[str] = ""
    cikis_turu: Optional[str] = None
    cikis_detayi: Optional[str] = None



class _HastaGirdi(HastaBase):
    """
    Kullanıcı girdisi için doğrulamalar.

    Bilerek HastaBase'e değil bu ara sınıfa konuldu: DB'de kapasite dışı yatak
    numarası gibi eski/hatalı kayıtlar var ve okuma modeli (Hasta) bunları
    doğrulamaya takılmadan döndürebilmeli.
    """

    @field_validator("unite")
    @classmethod
    def _unite_gecerli(cls, v: str) -> str:
        if v not in UNITE_KONFIG:
            raise ValueError(
                f"Geçersiz ünite: '{v}'. Geçerli üniteler: {', '.join(UNITE_KONFIG)}"
            )
        return v

    @field_validator("yatak_no")
    @classmethod
    def _yatak_no_gecerli(cls, v: str, info) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Yatak no boş olamaz.")
        try:
            no = int(v)
        except ValueError:
            raise ValueError(f"Yatak no sayı olmalı: '{v}'")
        # unite, yatak_no'dan önce tanımlı olduğu için burada hazır
        kapasite = UNITE_KONFIG.get(info.data.get("unite"))
        if kapasite and not (1 <= no <= kapasite):
            raise ValueError(
                f"{info.data['unite']} ünitesinde yatak no 1-{kapasite} arasında olmalı "
                f"(verilen: {no})."
            )
        return str(no)

    @field_validator("ad_soyad")
    @classmethod
    def _ad_soyad_gecerli(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Ad soyad boş olamaz.")
        return v


class HastaCreate(_HastaGirdi):
    pass


class HastaUpdate(_HastaGirdi):
    # None = "değiştirme, mevcut değeri koru" (taburcu hastanın düzenlenince
    # aktife dönmesini engeller)
    durum: Optional[str] = None


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
        for field in ("planlanan_islemler", "goruntuleme_tetkik", "kultur_takibi", "antibiyotikler"):
            val = data.get(field)
            if isinstance(val, str):
                try:
                    data[field] = json.loads(val)
                except Exception:
                    data[field] = []
            elif val is None:
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
