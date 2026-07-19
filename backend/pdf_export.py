"""
pdf_export.py — v2
Playwright/Chromium ile HTML→PDF dönüşümü.
Yeni alanlar: unite, klinik_durum (yapılandırılmış), kabul_epikrizi / seyir_notlari ayrımı.
"""

import json
from datetime import datetime
from typing import List
from jinja2 import Environment, BaseLoader


# ══════════════════════════════════════════════════════════════════════════════
# HTML ŞABLONu — A4, kompakt, klinik
# ══════════════════════════════════════════════════════════════════════════════
VIZIT_TEMPLATE = """
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 11mm 13mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #111827; background: #fff; }

  /* ── Sayfa başlığı ── */
  .page-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #1e3a5f; padding-bottom: 5px; margin-bottom: 9px;
  }
  .page-header h1 { font-size: 12.5pt; font-weight: 700; color: #1e3a5f; }
  .page-header .meta { font-size: 8pt; color: #555; text-align: right; }

  /* ── Ünite bölücüsü ── */
  .unite-baslik {
    font-size: 10pt; font-weight: 700; color: #1e3a5f;
    background: #eef2fb; border: 1px solid #c5d0e8;
    padding: 4px 10px; border-radius: 3px;
    margin-bottom: 7px; margin-top: 12px;
    page-break-before: auto;
  }
  .unite-baslik:first-of-type { margin-top: 0; }

  /* ── Hasta kartı ── */
  .hasta-kart {
    border: 1px solid #c8d0e0; border-radius: 4px;
    margin-bottom: 8px; page-break-inside: avoid; overflow: hidden;
  }
  .hasta-header {
    background: #1e3a5f; color: #fff;
    padding: 5px 10px; display: flex; align-items: center; gap: 8px;
  }
  .h-yatak { font-size: 10.5pt; font-weight: 700; min-width: 44px; }
  .h-ad    { font-size: 9.5pt; font-weight: 600; flex: 1; }
  .h-tani  { font-size: 8pt; color: #c5d0e8; }
  .badges  { display: flex; gap: 4px; }
  .badge   { font-size: 7.5pt; font-weight: 700; padding: 1px 5px;
             border-radius: 3px; border: 1px solid rgba(255,255,255,0.4); }
  .badge.vent  { background: #dc2626; }
  .badge.inot  { background: #ea580c; }
  .badge.sed   { background: #7c3aed; }
  .badge.islem { background: #7c3aed; }

  /* ── Gövde ── */
  .hasta-body { padding: 6px 10px; }

  /* ── Klinik durum grid ── */
  .klinik-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 3px 12px; margin-bottom: 5px;
    border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;
  }
  .kd-alan { }
  .kd-label {
    font-size: 7pt; font-weight: 700; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1px;
  }
  .kd-value { font-size: 8.5pt; color: #111827; white-space: pre-wrap; }
  .kd-value.bos { color: #9ca3af; font-style: italic; }
  .kd-value.vent-renk { color: #dc2626; font-weight: 600; }
  .kd-value.inot-renk { color: #ea580c; font-weight: 600; }
  .kd-value.sed-renk  { color: #7c3aed; font-weight: 600; }

  /* ── Kabul epikrizi bloğu ── */
  .kabul-epikriz {
    background: #f0f4ff; border: 1px solid #c5d0e8; border-radius: 3px;
    padding: 5px 8px; margin-bottom: 5px;
  }
  .kabul-epikriz-baslik {
    font-size: 7pt; font-weight: 700; color: #1e3a5f;
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px;
  }
  .kabul-epikriz-metin { font-size: 8.5pt; white-space: pre-wrap; line-height: 1.45; }

  /* ── Seyir notları ── */
  .seyir-bolum { margin-bottom: 5px; }
  .seyir-baslik {
    font-size: 7pt; font-weight: 700; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px;
  }
  .seyir-not {
    display: flex; gap: 6px; padding: 2px 0;
    border-bottom: 1px dotted #e5e7eb;
  }
  .seyir-not:last-child { border-bottom: none; }
  .seyir-tarih {
    font-size: 7.5pt; color: #1e3a5f; font-weight: 600;
    white-space: nowrap; min-width: 115px;
  }
  .seyir-metin { font-size: 8pt; white-space: pre-wrap; line-height: 1.4; }

  /* ── İşlemler ve Tetkikler ── */
  .ek-bolum { border-top: 1px solid #e5e7eb; padding-top: 4px; margin-top: 4px; }
  .ek-baslik {
    font-size: 7pt; font-weight: 700; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px;
  }
  .ek-satir {
    display: flex; gap: 8px; padding: 1px 0;
    border-bottom: 1px dotted #e5e7eb; font-size: 8pt;
  }
  .ek-satir:last-child { border-bottom: none; }
  .ek-tarih { min-width: 70px; color: #1e3a5f; font-weight: 600; white-space: nowrap; }
  .ek-islem-yaklasan { color: #c0392b; font-weight: 700; }
  .ek-islem-tamam    { text-decoration: line-through; color: #9ca3af; }

  .guncelleme { font-size: 7pt; color: #9ca3af; text-align: right; margin-top: 3px; }
</style>
</head>
<body>

<div class="page-header">
  <h1>🏥 Yoğun Bakım — Vizit Kağıdı</h1>
  <div class="meta">
    <div>{{ now }}</div>
    <div>Toplam: {{ hastalar|length }} hasta</div>
    {% if unite_filtre %}<div>Ünite: {{ unite_filtre }}</div>{% endif %}
  </div>
</div>

{% set ns = namespace(son_unite='') %}
{% for hasta in hastalar %}

{% if hasta.unite != ns.son_unite %}
  <div class="unite-baslik">{{ hasta.unite }}</div>
  {% set ns.son_unite = hasta.unite %}
{% endif %}

{% set kd = hasta.klinik_durum %}
<div class="hasta-kart">

  <div class="hasta-header">
    <span class="h-yatak">{{ hasta.yatak_no }}</span>
    <div style="flex:1;">
      <div class="h-ad">{{ hasta.ad_soyad }}</div>
      {% if hasta.tani %}<div class="h-tani">{{ hasta.tani }}</div>{% endif %}
    </div>
    <div class="badges">
      {% if kd.vent_var %}<span class="badge vent">VENT</span>{% endif %}
      {% if kd.inot_var %}<span class="badge inot">İNOT</span>{% endif %}
      {% if kd.sed_var  %}<span class="badge sed">SED</span>{% endif %}
      {% if hasta.yaklasan_islem %}<span class="badge islem">⚠ İŞLEM</span>{% endif %}
      {% if hasta.durum == 'taburcu' and hasta.cikis_turu %}<span class="badge islem">ÇIKIŞ: {{ hasta.cikis_turu | upper }}</span>{% endif %}
    </div>
  </div>

  <div class="hasta-body">

    <!-- Klinik Durum -->
    <div class="klinik-grid">
      <div class="kd-alan">
        <div class="kd-label">Solunum / Hava Yolu</div>
        {% if kd.hava_yolu == 'Entübe/Trakeostomili' %}
          <div class="kd-value vent-renk">Entübe/Trakeostomili<br><span style="font-weight:normal;color:#111827">{{ kd.entube_destek }}{% if kd.entube_destek == 'Mekanik ventilatöre bağlı' and kd.vent_mod %} — {{ kd.vent_mod }}{% endif %}</span></div>
        {% elif kd.hava_yolu == 'Entübe değil' and kd.non_entube_destek %}
          <div class="kd-value vent-renk">Entübe Değil<br><span style="font-weight:normal;color:#111827">{{ kd.non_entube_destek | join(', ') }}</span></div>
        {% elif kd.vent_var %}
          <div class="kd-value vent-renk">✓ Bağlı{% if kd.vent_mod %} — {{ kd.vent_mod }}{% endif %}</div>
        {% else %}
          <div class="kd-value bos">—</div>
        {% endif %}
      </div>
      <div class="kd-alan">
        <div class="kd-label">İnotrop / Vazopressör</div>
        {% if kd.inot_var and kd.inot_ajanlar %}
          {% for a in kd.inot_ajanlar %}
            <div class="kd-value inot-renk">{{ a.ajan }}{% if a.doz %} {{ a.doz }}{% endif %}</div>
          {% endfor %}
        {% elif kd.inot_var %}
          <div class="kd-value inot-renk">Kullanılıyor</div>
        {% else %}
          <div class="kd-value bos">—</div>
        {% endif %}
      </div>
      <div class="kd-alan">
        <div class="kd-label">Sedasyon</div>
        {% if kd.sed_var and kd.sed_ajanlar %}
          {% for a in kd.sed_ajanlar %}
            <div class="kd-value sed-renk">{{ a.ajan }}{% if a.doz %} {{ a.doz }}{% endif %}</div>
          {% endfor %}
        {% elif kd.sed_var %}
          <div class="kd-value sed-renk">Kullanılıyor</div>
        {% else %}
          <div class="kd-value bos">—</div>
        {% endif %}
      </div>
      <div class="kd-alan">
        <div class="kd-label">Beslenme</div>
        <div class="kd-value {% if not kd.beslenme or kd.beslenme == 'Yok' %}bos{% endif %}">
          {{ kd.beslenme or '—' }}
        </div>
      </div>
      <div class="kd-alan">
        <div class="kd-label">Diürez</div>
        <div class="kd-value {% if not kd.diurez %}bos{% endif %}">{{ kd.diurez or '—' }}</div>
      </div>
      <div class="kd-alan">
        <div class="kd-label">IR / Pupil</div>
        <div class="kd-value {% if not kd.ir_pupil %}bos{% endif %}">{{ kd.ir_pupil or '—' }}</div>
      </div>
    </div>

    <!-- Vasküler Erişim & Renal Takip -->
    {% if kd.cvp_var or kd.diyaliz_kateter_var or kd.diyaliz_var or kd.crrt_var %}
    <div class="ek-bolum" style="margin-top:4px;">
      <div class="ek-baslik">Vasküler Erişim &amp; Renal Takip</div>
      <div class="klinik-grid" style="grid-template-columns:1fr 1fr 1fr 1fr; margin-bottom:0; padding-bottom:0; border-bottom:none;">
        <div class="kd-alan">
          <div class="kd-label">CVP Kateteri</div>
          {% if kd.cvp_var %}
            <div class="kd-value vent-renk">Var{% if kd.cvp_yer %} — {{ kd.cvp_yer }}{% endif %}</div>
          {% else %}
            <div class="kd-value bos">—</div>
          {% endif %}
        </div>
        <div class="kd-alan">
          <div class="kd-label">Diyaliz Kateteri</div>
          {% if kd.diyaliz_kateter_var %}
            <div class="kd-value vent-renk">Var{% if kd.diyaliz_kateter_yer %} — {{ kd.diyaliz_kateter_yer }}{% endif %}</div>
          {% else %}
            <div class="kd-value bos">—</div>
          {% endif %}
        </div>
        <div class="kd-alan">
          <div class="kd-label">Diyaliz</div>
          {% if kd.diyaliz_var and kd.diyaliz_gunleri %}
            <div class="kd-value inot-renk">{{ kd.diyaliz_gunleri | join(', ') }}</div>
          {% elif kd.diyaliz_var %}
            <div class="kd-value inot-renk">Alıyor</div>
          {% else %}
            <div class="kd-value bos">—</div>
          {% endif %}
        </div>
        <div class="kd-alan">
          <div class="kd-label">CRRT</div>
          {% if kd.crrt_var %}
            <div class="kd-value inot-renk">Alıyor{% if kd.crrt_baslangic %} ({{ kd.crrt_baslangic }}){% endif %}</div>
          {% else %}
            <div class="kd-value bos">—</div>
          {% endif %}
        </div>
      </div>
    </div>
    {% endif %}

    <!-- Kabul Epikrizi -->
    {% if hasta.kabul_epikrizi %}
    <div class="kabul-epikriz">
      <div class="kabul-epikriz-baslik">📋 Kabul Epikrizi</div>
      <div class="kabul-epikriz-metin">{{ hasta.kabul_epikrizi }}</div>
    </div>
    {% endif %}

    <!-- Klinik Seyir Notları -->
    {% if hasta.epikriz_notlari %}
    <div class="seyir-bolum">
      <div class="seyir-baslik">Klinik Seyir Notları</div>
      {% for n in hasta.epikriz_notlari %}
      <div class="seyir-not">
        <div class="seyir-tarih">{{ n.tarih }}</div>
        <div class="seyir-metin">{{ n.not_metni }}</div>
      </div>
      {% endfor %}
    </div>
    {% endif %}

    <!-- Kültür & Antibiyotik Takibi -->
    {% if hasta.kultur_takibi %}
    <div class="ek-bolum">
      <div class="ek-baslik">Kültür &amp; Antibiyotik Takibi</div>
      {% for k in hasta.kultur_takibi %}
      <div class="ek-satir" style="align-items:flex-start; flex-direction:column; padding-bottom:4px; border-bottom:1px solid #eee;">
        <div style="display:flex; width:100%; justify-content:space-between; margin-bottom:2px;">
          <span><strong>🧫 {{ k.tur }} Kültürü</strong> <span class="ek-tarih" style="width:auto; margin-left:8px;">{{ k.tarih or '—' }}</span></span>
        </div>
        <div style="font-size:10px; margin-bottom:2px;">
          {% if not k.sonuc or k.sonuc == 'Bekleniyor' %}
            <span style="color:#d97706;">Sonuç Bekleniyor</span>
          {% else %}
            <span><strong>Sonuç:</strong> {{ k.sonuc }}</span>
          {% endif %}
        </div>
        {% if k.antibiyotik_adi %}
        <div style="font-size:10px; color:#059669; padding-top:2px;">
          💊 AB: {{ k.antibiyotik_adi }}
          {% if k.ab_gun %}
            ({{ k.ab_gun }})
          {% endif %}
        </div>
        {% endif %}
      </div>
      {% endfor %}
    </div>
    {% endif %}

    <!-- Planlanan İşlemler -->
    {% if hasta.planlanan_islemler %}
    <div class="ek-bolum">
      <div class="ek-baslik">Planlanan İşlemler</div>
      {% for i in hasta.planlanan_islemler %}
      <div class="ek-satir">
        <span class="ek-tarih">{{ i.tarih or '—' }}</span>
        <span class="{% if i.tamamlandi %}ek-islem-tamam{% elif i.yaklasan %}ek-islem-yaklasan{% endif %}">
          {{ '✓ ' if i.tamamlandi else ('⚠ ' if i.yaklasan else '') }}{{ i.tanim }}
        </span>
      </div>
      {% endfor %}
    </div>
    {% endif %}

    <!-- Görüntüleme / Tetkik -->
    {% if hasta.goruntuleme_tetkik %}
    <div class="ek-bolum">
      <div class="ek-baslik">Görüntüleme / Tetkik</div>
      {% for t in hasta.goruntuleme_tetkik %}
      <div class="ek-satir">
        <span class="ek-tarih">{{ t.tarih }}</span>
        <span>{{ t.icerik }}</span>
      </div>
      {% endfor %}
    </div>
    {% endif %}

    <div class="guncelleme">Son güncelleme: {{ hasta.guncelleme_tarihi }}</div>
  </div>
</div>
{% endfor %}

</body>
</html>
"""


# ── Yardımcılar ───────────────────────────────────────────────────────────────

def _gun_kaldi(tarih_str: str) -> int:
    if not tarih_str:
        return 999
    try:
        hedef = datetime.strptime(tarih_str, "%Y-%m-%d")
        return (hedef.date() - datetime.now().date()).days
    except Exception:
        return 999


def _hazirla_hasta(h: dict) -> dict:
    """DB dict'ini şablon için hazırla."""
    # planlanan_islemler
    islemler = h.get("planlanan_islemler") or []
    if isinstance(islemler, str):
        try:
            islemler = json.loads(islemler)
        except Exception:
            islemler = []
    yaklasan = False
    for i in islemler:
        g = _gun_kaldi(i.get("tarih", ""))
        i["yaklasan"] = 0 <= g <= 7 and not i.get("tamamlandi", False)
        if i["yaklasan"]:
            yaklasan = True

    # goruntuleme_tetkik
    tetkikler = h.get("goruntuleme_tetkik") or []
    if isinstance(tetkikler, str):
        try:
            tetkikler = json.loads(tetkikler)
        except Exception:
            tetkikler = []

    # kultur_takibi
    kulturler = h.get("kultur_takibi") or []
    if isinstance(kulturler, str):
        try:
            kulturler = json.loads(kulturler)
        except Exception:
            kulturler = []
    
    # ab_gun hesapla
    from datetime import date, datetime
    bugun = date.today()
    for k in kulturler:
        if k.get("antibiyotik_baslangic"):
            try:
                ab_tarih = datetime.strptime(k["antibiyotik_baslangic"], "%Y-%m-%d").date()
                fark = (bugun - ab_tarih).days
                if fark >= 0:
                    k["ab_gun"] = f"{fark + 1}. gün"
            except Exception:
                pass

    # klinik_durum
    kd_raw = h.get("klinik_durum") or "{}"
    if isinstance(kd_raw, str):
        try:
            kd = json.loads(kd_raw)
        except Exception:
            kd = {}
    else:
        kd = kd_raw

    # Eski alan uyumu
    if not kd.get("vent_var") and h.get("ventilator"):
        kd["vent_var"] = True
        kd["vent_mod"] = h.get("ventilator_detay", "")
    if not kd.get("inot_var") and h.get("inotrop"):
        kd["inot_var"] = True
        detay = h.get("inotrop_detay", "")
        if detay:
            kd["inot_ajanlar"] = [{"ajan": detay, "doz": ""}]

    # inot_ajanlar / sed_ajanlar list of dicts olmalı
    for key in ("inot_ajanlar", "sed_ajanlar"):
        raw = kd.get(key, [])
        if isinstance(raw, list):
            kd[key] = [a if isinstance(a, dict) else {"ajan": str(a), "doz": ""} for a in raw]
        else:
            kd[key] = []

    # Eksik kd alanlarını doldur
    kd.setdefault("hava_yolu", "")
    kd.setdefault("entube_destek", "")
    kd.setdefault("non_entube_destek", [])
    kd.setdefault("vent_var", False)
    kd.setdefault("vent_mod", "")
    kd.setdefault("inot_var", False)
    kd.setdefault("inot_ajanlar", [])
    kd.setdefault("sed_var", False)
    kd.setdefault("sed_ajanlar", [])
    kd.setdefault("beslenme", "Yok")
    kd.setdefault("diurez", "")
    kd.setdefault("ir_pupil", "")
    # Vasküler & Renal
    kd.setdefault("cvp_var", False)
    kd.setdefault("cvp_yer", "")
    kd.setdefault("diyaliz_kateter_var", False)
    kd.setdefault("diyaliz_kateter_yer", "")
    kd.setdefault("diyaliz_var", False)
    kd.setdefault("diyaliz_gunleri", [])
    kd.setdefault("crrt_var", False)
    kd.setdefault("crrt_baslangic", "")

    return {
        **h,
        "klinik_durum": kd,
        "planlanan_islemler": islemler,
        "goruntuleme_tetkik": tetkikler,
        "kultur_takibi": kulturler,
        "yaklasan_islem": yaklasan,
        "unite": h.get("unite", ""),
        "kabul_epikrizi": h.get("kabul_epikrizi", ""),
        "epikriz_notlari": h.get("epikriz_notlari", []),
    }


def _html_olustur(hastalar: list, unite_filtre: str = "") -> str:
    hazir = [_hazirla_hasta(dict(h)) for h in hastalar]
    env = Environment(loader=BaseLoader())
    tmpl = env.from_string(VIZIT_TEMPLATE)
    return tmpl.render(
        hastalar=hazir,
        now=datetime.now().strftime("%d.%m.%Y %H:%M"),
        unite_filtre=unite_filtre,
    )


def uret_pdf(hastalar: list, unite_filtre: str = "") -> bytes:
    """
    Playwright/Chromium ile HTML→PDF dönüşümü.
    Eş zamanlı çağrı uyumlu — her çağrı kendi event loop'unu yönetir.
    """
    html_str = _html_olustur(hastalar, unite_filtre)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright kurulu değil. "
            "Lütfen 'py -m pip install playwright && py -m playwright install chromium' çalıştırın."
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(html_str, wait_until="domcontentloaded")
        pdf_bytes = page.pdf(
            format="A4",
            margin={"top": "11mm", "right": "13mm", "bottom": "11mm", "left": "13mm"},
            print_background=True,
        )
        browser.close()

    return pdf_bytes


def uret_html(hastalar: list, unite_filtre: str = "") -> str:
    """Debug / önizleme için ham HTML döndür."""
    return _html_olustur(hastalar, unite_filtre)
