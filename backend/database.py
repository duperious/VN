"""
database.py — SQLite veritabanı bağlantısı ve şema oluşturma
v2: ünite, kabul_epikrizi, klinik_durum alanları eklendi
"""

import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

# Load env variables from root .env or current dir
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env")

db_env = os.getenv("DB_PATH")
if db_env:
    DB_PATH = Path(db_env)
else:
    DB_PATH = Path(__file__).parent / "vizit.db"

# ── Sabit: Ünite konfigürasyonu ───────────────────────────────────────────────
UNITE_KONFIG = {
    "ARYB-1": 17,
    "ARYB-2": 20,
    "ARYB-3": 7,
    "ARYB-5": 7,
    "ARYB-6": 7,
}
UNITE_LISTESI = list(UNITE_KONFIG.keys())


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Tabloları oluştur / gerekli sütunları migrate et."""
    conn = get_connection()
    cur = conn.cursor()

    # ── Hastalar tablosu ─────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hastalar (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            unite               TEXT    NOT NULL DEFAULT 'ARYB-1',
            yatak_no            TEXT    NOT NULL,
            ad_soyad            TEXT    NOT NULL,
            tani                TEXT    DEFAULT '',
            durum               TEXT    NOT NULL DEFAULT 'aktif',
            kabul_epikrizi      TEXT    DEFAULT '',
            klinik_durum        TEXT    DEFAULT '{}',   -- JSON: vent/inot/sedasyon/beslenme/diurez/ir_pupil
            planlanan_islemler  TEXT    DEFAULT '[]',
            goruntuleme_tetkik  TEXT    DEFAULT '[]',
            kultur_takibi       TEXT    DEFAULT '[]',
            genel_not           TEXT    DEFAULT '',
            olusturma_tarihi    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            guncelleme_tarihi   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── Migration: Mevcut DB'ye eksik sütunları ekle (idempotent) ────────────
    mevcut_sutunlar = {row[1] for row in cur.execute("PRAGMA table_info(hastalar)").fetchall()}

    eklenecekler = {
        "unite":          "TEXT NOT NULL DEFAULT 'ARYB-1'",
        "kabul_epikrizi": "TEXT DEFAULT ''",
        "klinik_durum":   "TEXT DEFAULT '{}'",
        "kultur_takibi":  "TEXT DEFAULT '[]'",
        "antibiyotikler": "TEXT DEFAULT '[]'",
        "cikis_turu":     "TEXT",
        "cikis_detayi":   "TEXT",
        "kilo":           "REAL",
        "boy":            "REAL",
    }
    # Eski tek-alan compat: ventilator/inotrop/ventilator_detay/inotrop_detay geride kalabilir
    for sutun, tanim in eklenecekler.items():
        if sutun not in mevcut_sutunlar:
            cur.execute(f"ALTER TABLE hastalar ADD COLUMN {sutun} {tanim}")
            print(f"[DB] Migrate: '{sutun}' sütunu eklendi.")

    # ── Epikriz notları tablosu ───────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS epikriz_notlari (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            hasta_id    INTEGER NOT NULL REFERENCES hastalar(id) ON DELETE CASCADE,
            not_metni   TEXT    NOT NULL,
            tarih       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── Trigger: güncelleme_tarihi otomatik güncelle ─────────────────────────
    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_guncelleme_tarihi
        AFTER UPDATE ON hastalar
        FOR EACH ROW
        BEGIN
            UPDATE hastalar
            SET guncelleme_tarihi = datetime('now','localtime')
            WHERE id = OLD.id;
        END
    """)

    conn.commit()
    conn.close()
    print(f"[DB] Veritabanı hazır: {DB_PATH}")
