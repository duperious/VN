import sys
from fastapi.testclient import TestClient

sys.path.append("backend")
from main import app

client = TestClient(app)

# Test hasta verisi
test_hasta = {
    "unite": "ARYB-1",
    "yatak_no": "9",
    "ad_soyad": "Test Hasta",
    "tani": "Test Tani",
    "kabul_epikrizi": "Test Epikriz",
    "klinik_durum": {
        "hava_yolu": "Entübe değil",
        "entube_destek": "",
        "non_entube_destek": [],
        "vent_var": False,
        "vent_mod": "",
        "inot_var": False,
        "inot_ajanlar": [],
        "sed_var": False,
        "sed_ajanlar": [],
        "beslenme": "Yok",
        "diurez": "",
        "ir_pupil": "",
        "cvp_var": False,
        "cvp_yer": "",
        "diyaliz_kateter_var": False,
        "diyaliz_kateter_yer": "",
        "diyaliz_var": False,
        "diyaliz_gunleri": [],
        "crrt_var": False,
        "crrt_baslangic": "",
        "crrt_tipi": ""
    },
    "planlanan_islemler": [],
    "goruntuleme_tetkik": [],
    "kultur_takibi": [],
    "antibiyotikler": [],
    "genel_not": "Test Not",
    "cikis_turu": None,
    "cikis_detayi": None
}

try:
    print("Test isteği gönderiliyor...")
    response = client.post("/api/hastalar", json=test_hasta)
    print("STATUS CODE:", response.status_code)
    print("RESPONSE BODY:", response.json())
except Exception as e:
    import traceback
    print("HATA OLUŞTU:")
    traceback.print_exc()
