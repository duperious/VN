"""
main.py — FastAPI v2
Yeni: unite filtresi, dolu yatak sorgusu, klinik_durum, kabul_epikrizi
"""

import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import List, Optional

from database import init_db, get_connection, UNITE_KONFIG, UNITE_LISTESI
from models import (
    Hasta, HastaBase, HastaCreate, HastaUpdate,
    EpikrizNot, EpikrizNotCreate,
    DoluYatakResponse, CikisRequest
)

# ── Uygulama ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Vizit Kağıdı API v2",
    description="Yoğun Bakım Servisi Hasta Takip Sistemi — Ünite destekli",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ── Frontend static dosyaları ─────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/", include_in_schema=False)
def root():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Vizit Kağıdı API v2 çalışıyor."}


# ═════════════════════════════════════════════════════════════════════════════
# ── ÜNİTE KONFİGÜRASYONU ─────────────────────────────────────────────────────
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/uniteler", tags=["Üniteler"])
def unite_listesi():
    """Ünite listesi ve yatak kapasitelerini döndür."""
    return {"uniteler": [{"kod": k, "kapasite": v} for k, v in UNITE_KONFIG.items()]}


@app.get("/api/uniteler/{unite}/dolu_yataklar", response_model=DoluYatakResponse, tags=["Üniteler"])
def dolu_yataklar(unite: str):
    """Belirtilen ünitede aktif hastası olan yatak numaralarını döndür."""
    if unite not in UNITE_LISTESI:
        raise HTTPException(status_code=404, detail=f"Ünite bulunamadı: {unite}")
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT yatak_no FROM hastalar WHERE unite = ? AND durum = 'aktif'",
            (unite,),
        ).fetchall()
        dolu = []
        for row in rows:
            try:
                dolu.append(int(row["yatak_no"]))
            except ValueError:
                pass
        return DoluYatakResponse(unite=unite, dolu_yataklar=sorted(dolu))
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════════════════════
# ── HASTA CRUD ────────────────────────────────────────────────────────────────
# ═════════════════════════════════════════════════════════════════════════════

def _fetch_hasta(conn, hasta_id: int) -> Hasta:
    row = conn.execute("SELECT * FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")
    epikriz = conn.execute(
        "SELECT * FROM epikriz_notlari WHERE hasta_id = ? ORDER BY tarih ASC",
        (hasta_id,),
    ).fetchall()
    return Hasta.from_row(row, epikriz)


def _hasta_to_db_params(hasta: HastaBase) -> tuple:
    """Model → DB kayıt parametreleri."""
    kd = hasta.klinik_durum
    kd_json = kd.model_dump_json() if kd else "{}"
    return (
        hasta.unite,
        hasta.yatak_no,
        hasta.ad_soyad,
        hasta.tani,
        hasta.kabul_epikrizi,
        kd_json,
        json.dumps([i.model_dump() for i in hasta.planlanan_islemler], ensure_ascii=False),
        json.dumps([t.model_dump() for t in hasta.goruntuleme_tetkik], ensure_ascii=False),
        hasta.genel_not,
        hasta.cikis_turu,
        hasta.cikis_detayi,
    )


@app.get("/api/hastalar", response_model=List[Hasta], tags=["Hastalar"])
def hasta_listesi(
    durum: Optional[str] = Query(None, description="'aktif' veya 'taburcu'"),
    unite: Optional[str] = Query(None, description="Ünite kodu, örn. ARYB-1"),
):
    """Tüm hastaları listele; opsiyonel ünite ve durum filtresi."""
    conn = get_connection()
    try:
        conditions = []
        params = []
        if durum:
            conditions.append("durum = ?")
            params.append(durum)
        if unite:
            conditions.append("unite = ?")
            params.append(unite)

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        sql = f"SELECT * FROM hastalar {where} ORDER BY CAST(yatak_no AS INTEGER), yatak_no"
        rows = conn.execute(sql, params).fetchall()

        sonuc = []
        for row in rows:
            epikriz = conn.execute(
                "SELECT * FROM epikriz_notlari WHERE hasta_id = ? ORDER BY tarih ASC",
                (row["id"],),
            ).fetchall()
            sonuc.append(Hasta.from_row(row, epikriz))
        return sonuc
    finally:
        conn.close()


@app.post("/api/hastalar", response_model=Hasta, status_code=201, tags=["Hastalar"])
def hasta_ekle(hasta: HastaCreate):
    """Yeni hasta kaydı oluştur."""
    # Yatak dolu mu kontrol et
    conn = get_connection()
    try:
        mevcut = conn.execute(
            "SELECT id FROM hastalar WHERE unite = ? AND yatak_no = ? AND durum = 'aktif'",
            (hasta.unite, hasta.yatak_no),
        ).fetchone()
        if mevcut:
            raise HTTPException(
                status_code=409,
                detail=f"{hasta.unite} ünitesinde {hasta.yatak_no} no'lu yatak dolu.",
            )

        params = _hasta_to_db_params(hasta)
        cur = conn.execute(
            """
            INSERT INTO hastalar
                (unite, yatak_no, ad_soyad, tani, kabul_epikrizi, klinik_durum,
                 planlanan_islemler, goruntuleme_tetkik, genel_not, cikis_turu, cikis_detayi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params,
        )
        conn.commit()
        return _fetch_hasta(conn, cur.lastrowid)
    finally:
        conn.close()


@app.get("/api/hastalar/{hasta_id}", response_model=Hasta, tags=["Hastalar"])
def hasta_getir(hasta_id: int):
    conn = get_connection()
    try:
        return _fetch_hasta(conn, hasta_id)
    finally:
        conn.close()


@app.put("/api/hastalar/{hasta_id}", response_model=Hasta, tags=["Hastalar"])
def hasta_guncelle(hasta_id: int, hasta: HastaUpdate):
    """Hasta bilgilerini güncelle."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id, unite, yatak_no FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hasta bulunamadı")

        # Yatak değiştiyse çakışma kontrolü
        if row["yatak_no"] != hasta.yatak_no or row["unite"] != hasta.unite:
            mevcut = conn.execute(
                "SELECT id FROM hastalar WHERE unite = ? AND yatak_no = ? AND durum = 'aktif' AND id != ?",
                (hasta.unite, hasta.yatak_no, hasta_id),
            ).fetchone()
            if mevcut:
                raise HTTPException(
                    status_code=409,
                    detail=f"{hasta.unite} ünitesinde {hasta.yatak_no} no'lu yatak dolu.",
                )

        params = _hasta_to_db_params(hasta)
        conn.execute(
            """
            UPDATE hastalar SET
                unite = ?, yatak_no = ?, ad_soyad = ?, tani = ?,
                kabul_epikrizi = ?, klinik_durum = ?,
                planlanan_islemler = ?, goruntuleme_tetkik = ?,
                genel_not = ?, cikis_turu = ?, cikis_detayi = ?, durum = ?
            WHERE id = ?
            """,
            (*params, hasta.durum, hasta_id),
        )
        conn.commit()
        return _fetch_hasta(conn, hasta_id)
    finally:
        conn.close()


@app.patch("/api/hastalar/{hasta_id}/durum", tags=["Hastalar"])
def hasta_durum_degistir(hasta_id: int, durum: str = Query(...)):
    if durum not in ("aktif", "taburcu"):
        raise HTTPException(status_code=400, detail="Geçersiz durum.")
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hasta bulunamadı")
        
        if durum == "aktif":
            conn.execute("UPDATE hastalar SET durum = ?, cikis_turu = NULL, cikis_detayi = NULL WHERE id = ?", (durum, hasta_id))
        else:
            conn.execute("UPDATE hastalar SET durum = ? WHERE id = ?", (durum, hasta_id))
            
        conn.commit()
        return {"id": hasta_id, "durum": durum}
    finally:
        conn.close()


@app.post("/api/hastalar/{hasta_id}/cikis", tags=["Hastalar"])
def hasta_cikis_islemi(hasta_id: int, req: CikisRequest):
    """Hasta çıkış/devir işlemlerini yapar."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id, unite, yatak_no FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hasta bulunamadı")

        if req.islem_turu == "devir":
            # Kurum içi devir
            if not req.yeni_unite or not req.yeni_yatak_no:
                raise HTTPException(status_code=400, detail="Yeni ünite ve yatak no zorunludur.")
            
            # Yatak dolu mu kontrolü
            mevcut = conn.execute(
                "SELECT id FROM hastalar WHERE unite = ? AND yatak_no = ? AND durum = 'aktif'",
                (req.yeni_unite, req.yeni_yatak_no),
            ).fetchone()
            if mevcut:
                raise HTTPException(status_code=409, detail=f"{req.yeni_unite} ünitesinde {req.yeni_yatak_no} no'lu yatak dolu.")
            
            eski_unite = row["unite"]
            eski_yatak = row["yatak_no"]
            
            # Hasta aktif kalır, ünite ve yatak güncellenir
            conn.execute(
                "UPDATE hastalar SET unite = ?, yatak_no = ? WHERE id = ?",
                (req.yeni_unite, req.yeni_yatak_no, hasta_id)
            )
            
            # Epikriz notu ekle
            not_metni = f"Transfer: {eski_unite} ({eski_yatak} no'lu yatak) ünitesinden alındı."
            conn.execute(
                "INSERT INTO epikriz_notlari (hasta_id, not_metni) VALUES (?, ?)",
                (hasta_id, not_metni),
            )
            
        else:
            # Taburcu, Servis, Exitus, Sevk -> Hepsi 'taburcu' durumuna geçer
            conn.execute(
                "UPDATE hastalar SET durum = 'taburcu', cikis_turu = ?, cikis_detayi = ? WHERE id = ?",
                (req.islem_turu, req.detay, hasta_id)
            )
            
            not_metni = f"Çıkış İşlemi: {req.islem_turu.upper()}"
            if req.detay:
                not_metni += f" - {req.detay}"
            conn.execute(
                "INSERT INTO epikriz_notlari (hasta_id, not_metni) VALUES (?, ?)",
                (hasta_id, not_metni),
            )

        conn.commit()
        return {"id": hasta_id, "islem": req.islem_turu, "mesaj": "Başarılı"}
    finally:
        conn.close()


@app.patch("/api/hastalar/{hasta_id}/kabul_epikrizi", response_model=Hasta, tags=["Hastalar"])
def kabul_epikrizi_guncelle(hasta_id: int, epikriz: EpikrizNotCreate):
    """Kabul epikrizini güncelle (sabit blok, ayrı endpoint)."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hasta bulunamadı")
        conn.execute(
            "UPDATE hastalar SET kabul_epikrizi = ? WHERE id = ?",
            (epikriz.not_metni, hasta_id),
        )
        conn.commit()
        return _fetch_hasta(conn, hasta_id)
    finally:
        conn.close()


@app.delete("/api/hastalar/{hasta_id}", status_code=204, tags=["Hastalar"])
def hasta_sil(hasta_id: int):
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hasta bulunamadı")
        conn.execute("DELETE FROM hastalar WHERE id = ?", (hasta_id,))
        conn.commit()
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════════════════════
# ── EPİKRİZ (Klinik Seyir Notları) ───────────────────────────────────────────
# ═════════════════════════════════════════════════════════════════════════════

@app.post("/api/hastalar/{hasta_id}/epikriz", response_model=EpikrizNot, status_code=201, tags=["Epikriz"])
def epikriz_not_ekle(hasta_id: int, not_: EpikrizNotCreate):
    """Kronolojik klinik seyir notu ekle (sadece ekleme)."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM hastalar WHERE id = ?", (hasta_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hasta bulunamadı")
        cur = conn.execute(
            "INSERT INTO epikriz_notlari (hasta_id, not_metni) VALUES (?, ?)",
            (hasta_id, not_.not_metni),
        )
        conn.commit()
        created = conn.execute("SELECT * FROM epikriz_notlari WHERE id = ?", (cur.lastrowid,)).fetchone()
        conn.execute(
            "UPDATE hastalar SET guncelleme_tarihi = datetime('now','localtime') WHERE id = ?",
            (hasta_id,),
        )
        conn.commit()
        return dict(created)
    finally:
        conn.close()


@app.get("/api/hastalar/{hasta_id}/epikriz", response_model=List[EpikrizNot], tags=["Epikriz"])
def epikriz_listesi(hasta_id: int):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM epikriz_notlari WHERE hasta_id = ? ORDER BY tarih ASC",
            (hasta_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.put("/api/epikriz/{epikriz_id}", response_model=EpikrizNot, tags=["Epikriz"])
def epikriz_not_duzenle(epikriz_id: int, not_: EpikrizNotCreate):
    conn = get_connection()
    try:
        row = conn.execute("SELECT id, hasta_id FROM epikriz_notlari WHERE id = ?", (epikriz_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not bulunamadı")
        
        conn.execute(
            "UPDATE epikriz_notlari SET not_metni = ? WHERE id = ?",
            (not_.not_metni, epikriz_id)
        )
        conn.execute(
            "UPDATE hastalar SET guncelleme_tarihi = datetime('now','localtime') WHERE id = ?",
            (row["hasta_id"],)
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM epikriz_notlari WHERE id = ?", (epikriz_id,)).fetchone()
        return dict(updated)
    finally:
        conn.close()


@app.delete("/api/epikriz/{epikriz_id}", status_code=204, tags=["Epikriz"])
def epikriz_not_sil(epikriz_id: int):
    conn = get_connection()
    try:
        row = conn.execute("SELECT id, hasta_id FROM epikriz_notlari WHERE id = ?", (epikriz_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not bulunamadı")
        
        conn.execute("DELETE FROM epikriz_notlari WHERE id = ?", (epikriz_id,))
        conn.execute(
            "UPDATE hastalar SET guncelleme_tarihi = datetime('now','localtime') WHERE id = ?",
            (row["hasta_id"],)
        )
        conn.commit()
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════════════════════
# ── PDF EXPORT (Playwright/Chromium) ──────────────────────────────────────────
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/export/pdf", tags=["Export"])
def export_pdf(
    durum: Optional[str] = Query("aktif"),
    hasta_ids: Optional[str] = Query(None),
    unite: Optional[str] = Query(None),
):
    """PDF export — Playwright/Chromium ile."""
    from pdf_export import uret_pdf

    conn = get_connection()
    try:
        conditions = []
        params = []

        if hasta_ids:
            id_list = [int(x.strip()) for x in hasta_ids.split(",") if x.strip()]
            placeholders = ",".join("?" * len(id_list))
            sql = f"SELECT * FROM hastalar WHERE id IN ({placeholders}) ORDER BY CAST(yatak_no AS INTEGER)"
            rows = conn.execute(sql, id_list).fetchall()
        else:
            if durum and durum != "tumu":
                conditions.append("durum = ?")
                params.append(durum)
            if unite:
                conditions.append("unite = ?")
                params.append(unite)
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            sql = f"SELECT * FROM hastalar {where} ORDER BY unite, CAST(yatak_no AS INTEGER)"
            rows = conn.execute(sql, params).fetchall()

        hastalar = []
        for row in rows:
            h = dict(row)
            epikriz = conn.execute(
                "SELECT * FROM epikriz_notlari WHERE hasta_id = ? ORDER BY tarih ASC",
                (row["id"],),
            ).fetchall()
            h["epikriz_notlari"] = [dict(e) for e in epikriz]
            hastalar.append(h)

        pdf_bytes = uret_pdf(hastalar)

        unite_str = f"_{unite}" if unite else ""
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=vizit_kagidi{unite_str}.pdf",
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    finally:
        conn.close()


# ─── Başlat ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
