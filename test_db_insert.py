import sqlite3
import json

# DB_PATH
DB_PATH = "backend/vizit.db"

# Mock parameters
params = (
    "ARYB-1", # unite
    "9", # yatak_no
    "Test Hasta", # ad_soyad
    "Test Tani", # tani
    "Test Epikriz", # kabul_epikrizi
    "{}", # klinik_durum (kd_json)
    "[]", # planlanan_islemler
    "[]", # goruntuleme_tetkik
    "[]", # kultur_takibi
    "[]", # antibiyotikler
    "Test Not", # genel_not
    None, # cikis_turu
    None, # cikis_detayi
)

try:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # Check if bed is busy
    mevcut = conn.execute(
        "SELECT id FROM hastalar WHERE unite = ? AND yatak_no = ? AND durum = 'aktif'",
        ("ARYB-1", "9"),
    ).fetchone()
    if mevcut:
        print("Yatak zaten dolu, siliniyor...")
        conn.execute("DELETE FROM hastalar WHERE unite = ? AND yatak_no = ? AND durum = 'aktif'", ("ARYB-1", "9"))
        conn.commit()

    print("Hasta ekleniyor...")
    cur = conn.execute(
        """
        INSERT INTO hastalar (
            unite, yatak_no, ad_soyad, tani,
            kabul_epikrizi, klinik_durum,
            planlanan_islemler, goruntuleme_tetkik, kultur_takibi,
            antibiyotikler,
            genel_not, cikis_turu, cikis_detayi, durum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (*params, "aktif"),
    )
    conn.commit()
    print("Hasta başarıyla eklendi! ID:", cur.lastrowid)
    
    # Fetch ve kontrol
    row = conn.execute("SELECT * FROM hastalar WHERE id = ?", (cur.lastrowid,)).fetchone()
    print("Eklenen Hasta Verisi:")
    print(dict(row))
    
    # Temizlik
    conn.execute("DELETE FROM hastalar WHERE id = ?", (cur.lastrowid,))
    conn.commit()
    print("Temizlik tamamlandı.")
    
except Exception as e:
    import traceback
    print("HATA OLUŞTU:")
    traceback.print_exc()
finally:
    conn.close()
