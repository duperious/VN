/**
 * app.js — Vizit Kağıdı Frontend v2
 * Ünite seçimi, yatak dropdown, klinik durum, epikriz ayrımı
 */

"use strict";

// ════════════════════════════════════════════════════════════════════════════
// ── KONFİGÜRASYON
// ════════════════════════════════════════════════════════════════════════════

const API = window.location.origin;

const UNITE_KONFIG = {
  "ARYB-1": 17, "ARYB-2": 20,
  "ARYB-3": 7,  "ARYB-5": 7, "ARYB-6": 7,
};
const UNITE_LISTESI = Object.keys(UNITE_KONFIG);

// ════════════════════════════════════════════════════════════════════════════
// ── GLOBAL DURUM
// ════════════════════════════════════════════════════════════════════════════

let tumHastalar  = [];
let gosterilen   = [];
let aktifTab     = "aktif";
let aktifUnite   = UNITE_LISTESI[0];
let siralamaAlan = "yatak";
let duzenleId    = null;
let detayHastaId = null;
let doluYataklar = [];  // aktif ünitedeki dolu yatak numaraları

// ════════════════════════════════════════════════════════════════════════════
// ── API YARDIMCILARI
// ════════════════════════════════════════════════════════════════════════════

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("vizit_token");
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API}${path}`, {
      headers,
      ...opts,
    });
    if (res.status === 401 && path !== "/api/auth/login") {
      localStorage.removeItem("vizit_token");
      oturumKapatArayuzu();
      throw new Error("Oturum süresi doldu, tekrar giriş yapın.");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (e) {
    if (path !== "/api/auth/login" && !path.startsWith("/api/auth/me")) {
      toast("Hata: " + e.message, "error");
    }
    throw e;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── GİRİŞ / ÇIKIŞ YÖNETİMİ
// ════════════════════════════════════════════════════════════════════════════

async function girisYap(e) {
  if (e) e.preventDefault();
  const uEl = document.getElementById("lKullaniciAdi");
  const pEl = document.getElementById("lSifre");
  const errEl = document.getElementById("loginError");
  const btnEl = document.getElementById("btnLoginSubmit");

  errEl.style.display = "none";
  btnEl.disabled = true;
  btnEl.textContent = "Giriş Yapılıyor…";

  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        kullanici_adi: uEl.value.trim(),
        sifre: pEl.value
      })
    });
    if (res && res.access_token) {
      localStorage.setItem("vizit_token", res.access_token);
      pEl.value = "";
      oturumAcArayuzu();
      toast("Başarıyla giriş yapıldı.", "success");
      await hastaListesiYukle();
      await fetchDoluYataklar(aktifUnite);
    }
  } catch (err) {
    errEl.textContent = err.message || "Kullanıcı adı veya şifre hatalı.";
    errEl.style.display = "block";
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = "Giriş Yap";
  }
}

async function cikisYap() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  } finally {
    localStorage.removeItem("vizit_token");
    oturumKapatArayuzu();
    toast("Çıkış yapıldı.", "info");
  }
}

function oturumAcArayuzu() {
  modalKapat("loginModal");
  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) logoutBtn.style.display = "inline-flex";
}

function oturumKapatArayuzu() {
  modalAc("loginModal");
  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) logoutBtn.style.display = "none";
  tumHastalar = [];
  gosterilen = [];
  renderHersey();
}

async function oturumKontrol() {
  const token = localStorage.getItem("vizit_token");
  if (!token) {
    oturumKapatArayuzu();
    return false;
  }
  try {
    await apiFetch("/api/auth/me");
    oturumAcArayuzu();
    return true;
  } catch (e) {
    localStorage.removeItem("vizit_token");
    oturumKapatArayuzu();
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── TOAST
// ════════════════════════════════════════════════════════════════════════════

function toast(mesaj, tip = "info", sure = 3500) {
  const c  = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${tip}`;
  const ikon = tip === "success" ? "✓" : tip === "error" ? "✕" : "ℹ";
  el.innerHTML = `<span>${ikon}</span><span>${escHtml(mesaj)}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 0.3s"; setTimeout(() => el.remove(), 300); }, sure);
}

// ════════════════════════════════════════════════════════════════════════════
// ── YARDIMCILAR
// ════════════════════════════════════════════════════════════════════════════

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatTarih(s) {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d)) return s;
  return d.toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function formatTarihKisa(s) {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d)) return s;
  return d.toLocaleDateString("tr-TR", { day:"2-digit", month:"2-digit", year:"numeric" });
}

function gunKaldi(s) {
  if (!s) return null;
  const h = new Date(); h.setHours(0,0,0,0);
  const t = new Date(s); t.setHours(0,0,0,0);
  return Math.round((t - h) / 86400000);
}

function bugunIso() { return new Date().toISOString().split("T")[0]; }

// Gün index → Trk kısaltma
const GUN_MAP = ["Paz","Pzt","Sal","Çrş","Prş","Cum","Cmt"];

function diyalizGunUyarisi(hasta) {
  const klinik = kd(hasta);
  if (!klinik.diyaliz_var || !klinik.diyaliz_gunleri || !klinik.diyaliz_gunleri.length) return null;
  const bugun = GUN_MAP[new Date().getDay()];
  const yarin = GUN_MAP[(new Date().getDay() + 1) % 7];
  if (klinik.diyaliz_gunleri.includes(bugun)) return "bugün";
  if (klinik.diyaliz_gunleri.includes(yarin)) return "yarın";
  return null;
}

function antibiyotikGunHesapla(baslangicStr) {
  const gun = gunKaldi(baslangicStr);
  if (gun === null) return null;
  return Math.abs(gun) + 1; // 1. gün, 2. gün vs. (geçmiş gün pozitif olur çünkü gunKaldi ileri tarihi - verir)
}

// gunKaldi returns Math.round((t - h) / 86400000); So for a past date, it's negative.
// We can just create an absolute version. Let's fix gunKaldi usage inside.
function kacGundurKullaniliyor(baslangicStr) {
  if (!baslangicStr) return "";
  const h = new Date(); h.setHours(0,0,0,0);
  const t = new Date(baslangicStr); t.setHours(0,0,0,0);
  const fark = Math.round((h - t) / 86400000);
  if (fark < 0) return "";
  return (fark + 1) + ". gün";
}

function kd(hasta) { return hasta.klinik_durum || {}; }

function hastaYaklaşanIslemVar(hasta) {
  return (hasta.planlanan_islemler || []).some(i => {
    if (i.tamamlandi) return false;
    const g = gunKaldi(i.tarih);
    return g !== null && g >= 0 && g <= 7;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ── ÜNİTE NAVİGASYONU
// ════════════════════════════════════════════════════════════════════════════

function renderUniteNav() {
  const nav = document.getElementById("uniteNav");
  nav.innerHTML = UNITE_LISTESI.map(u => {
    const aktifCount = tumHastalar.filter(h => h.unite === u && h.durum === "aktif").length;
    const kapasite = UNITE_KONFIG[u];
    const isActive = u === aktifUnite;
    return `
      <button class="unite-btn ${isActive ? "active" : ""}"
              onclick="switchUnite('${u}')"
              aria-pressed="${isActive}"
              title="${u} — ${aktifCount}/${kapasite} yatak">
        ${escHtml(u)}
        <span class="unite-doluluk">${aktifCount}/${kapasite}</span>
      </button>`;
  }).join("");
}

async function switchUnite(unite) {
  aktifUnite = unite;
  renderUniteNav();
  renderHersey();
  // Dolu yatakları güncelle (form açıksa dropdown'ı güncelle)
  await fetchDoluYataklar(unite);
}

async function fetchDoluYataklar(unite) {
  try {
    const data = await apiFetch(`/api/uniteler/${encodeURIComponent(unite)}/dolu_yataklar`);
    doluYataklar = data?.dolu_yataklar || [];
  } catch (_) { doluYataklar = []; }
  return doluYataklar;
}

// ════════════════════════════════════════════════════════════════════════════
// ── HASTA YÜKLEMESİ + FİLTRE
// ════════════════════════════════════════════════════════════════════════════

async function hastaListesiYukle() {
  try {
    const data = await apiFetch("/api/hastalar");
    tumHastalar = data || [];
    renderUniteNav();
    renderHersey();
  } catch (_) {}
}

function renderHersey() {
  guncelleBadgeler();
  filterHastalar();
}

function guncelleBadgeler() {
  const uniteAktif = tumHastalar.filter(h => h.unite === aktifUnite && h.durum === "aktif");
  const uniteTaburcu = tumHastalar.filter(h => h.unite === aktifUnite && h.durum === "taburcu");

  document.getElementById("badgeAktif").textContent   = uniteAktif.length;
  document.getElementById("badgeTaburcu").textContent = uniteTaburcu.length;

  const ventCount  = uniteAktif.filter(h => kd(h).vent_var).length;
  const inotCount  = uniteAktif.filter(h => kd(h).inot_var).length;
  const islemCount = uniteAktif.filter(h => hastaYaklaşanIslemVar(h)).length;

  document.getElementById("statToplam").textContent = uniteAktif.length;
  document.getElementById("statVent").textContent   = ventCount;
  document.getElementById("statInot").textContent   = inotCount;
  document.getElementById("statIslem").textContent  = islemCount;

  document.getElementById("statChips").style.display = aktifTab === "aktif" ? "flex" : "none";
}

function filterHastalar() {
  const q = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();

  let liste = tumHastalar.filter(h => h.unite === aktifUnite && h.durum === aktifTab);

  if (q) {
    liste = liste.filter(h =>
      h.ad_soyad.toLowerCase().includes(q) ||
      String(h.yatak_no).includes(q) ||
      (h.tani || "").toLowerCase().includes(q)
    );
  }

  liste.sort((a, b) => {
    if (siralamaAlan === "yatak") return parseInt(a.yatak_no) - parseInt(b.yatak_no) || String(a.yatak_no).localeCompare(String(b.yatak_no));
    return (b.guncelleme_tarihi || "").localeCompare(a.guncelleme_tarihi || "");
  });

  gosterilen = liste;
  renderGrid();
}

function sortBy(alan) { siralamaAlan = alan; filterHastalar(); }

function switchTab(tab) {
  aktifTab = tab;
  document.getElementById("tabAktif").classList.toggle("active", tab === "aktif");
  document.getElementById("tabTaburcu").classList.toggle("active", tab === "taburcu");
  renderHersey();
}

// ════════════════════════════════════════════════════════════════════════════
// ── GRID RENDER
// ════════════════════════════════════════════════════════════════════════════

function renderGrid() {
  const grid = document.getElementById("hastaGrid");
  if (!gosterilen.length) {
    grid.innerHTML = `
      <div class="bos-durum">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <h3>${aktifTab === "aktif" ? aktifUnite + " biriminde aktif hasta yok" : "Taburcu hasta yok"}</h3>
        <p>${aktifTab === "aktif" ? '"Yeni Hasta" butonuyla hasta ekleyin.' : "Taburcu edilen hastalar burada görünür."}</p>
      </div>`;
    return;
  }
  grid.innerHTML = gosterilen.map(renderKart).join("");
}

function renderKart(h) {
  const yaklasan    = hastaYaklaşanIslemVar(h);
  const isTaburcu   = h.durum === "taburcu";
  const klDurum     = kd(h);
  const sonSeyirNot = (h.epikriz_notlari || []).slice(-1)[0];

  // Rozetler
  let ikonlar = "";
  if (klDurum.hava_yolu || klDurum.vent_var) ikonlar += `<span class="durum-ikon vent">🫁 ${klDurum.hava_yolu === "Entübe/Trakeostomili" ? "ENT" : klDurum.hava_yolu === "Entübe değil" ? "NONENT" : "VENT"}</span>`;
  if (klDurum.inot_var)  ikonlar += `<span class="durum-ikon inot">💉 İNOT</span>`;
  if (klDurum.sed_var)   ikonlar += `<span class="durum-ikon sed">💊 SED</span>`;
  if (klDurum.crrt_var) {
    const crrtGun = kacGundurKullaniliyor(klDurum.crrt_baslangic);
    const crrtTipi = klDurum.crrt_tipi ? ` (${klDurum.crrt_tipi})` : "";
    ikonlar += `<span class="durum-ikon" style="background:rgba(14,165,233,.18);color:#0ea5e9;border-color:#0ea5e9" title="CRRT${crrtTipi}${crrtGun ? ' — ' + crrtGun : ''}">CRRT${crrtTipi}</span>`;
  }
  if (yaklasan)          ikonlar += `<span class="durum-ikon islem">⚠ İŞLEM</span>`;
  if (isTaburcu)         ikonlar += `<span class="durum-ikon taburcu">✓ TABURCU</span>`;

  // Diyaliz gün uyarısı
  const diyalizUyari = !isTaburcu ? diyalizGunUyarisi(h) : null;

  // Yaklaşan badge
  let yakBadge = "";
  if (yaklasan && !isTaburcu) {
    const islem = (h.planlanan_islemler || []).find(i => {
      const g = gunKaldi(i.tarih); return !i.tamamlandi && g !== null && g >= 0 && g <= 7;
    });
    if (islem) {
      const g = gunKaldi(islem.tarih);
      const gt = g === 0 ? "Bugün" : g === 1 ? "Yarın" : `${g} gün sonra`;
      yakBadge = `<div class="yaklasan-badge">⚠ ${escHtml(islem.tanim)} — ${gt}</div>`;
    }
  }
  if (diyalizUyari) {
    yakBadge += `<div class="yaklasan-badge" style="background:rgba(14,165,233,.12);border-color:#0ea5e9;color:#0ea5e9">💧 ${diyalizUyari === "bugün" ? "Bugün diyaliz günü" : "Yarın diyaliz günü"}</div>`;
  }

  // Kültür uyarıları ve AB özeti
  let kulturBadge = "";
  if (h.kultur_takibi && h.kultur_takibi.length) {
    const bekleyenler = h.kultur_takibi.filter(k => k.sonuc === "Bekleniyor" || !k.sonuc);
    if (bekleyenler.length) {
      const bTxt = bekleyenler.map(b => b.tur).join(", ");
      kulturBadge += `<div class="yaklasan-badge" style="background:rgba(245,158,11,.12);border-color:#f59e0b;color:#d97706">🧫 ${escHtml(bTxt)} Kx. Sonuç Bekleniyor</div>`;
    }
    
    // Antibiyotikler (Kültüre bağlı olanlar - Geriye dönük uyum)
    const aktifKulturAbler = (h.kultur_takibi || []).filter(k => k.antibiyotik_adi);
    // Bağımsız antibiyotikler
    const aktifAbler = (h.antibiyotikler || []).filter(a => a.ad);
    
    if (aktifKulturAbler.length || aktifAbler.length) {
      const abList = [];
      aktifKulturAbler.forEach(k => {
        const gunStr = kacGundurKullaniliyor(k.antibiyotik_baslangic);
        abList.push(gunStr ? `${escHtml(k.antibiyotik_adi)} (${gunStr})` : escHtml(k.antibiyotik_adi));
      });
      aktifAbler.forEach(a => {
        const gunStr = kacGundurKullaniliyor(a.baslangic_tarihi);
        abList.push(gunStr ? `${escHtml(a.ad)} (${gunStr})` : escHtml(a.ad));
      });
      kulturBadge += `<div class="yaklasan-badge" style="background:rgba(16,185,129,.12);border-color:#10b981;color:#059669">💊 AB: ${abList.join(", ")}</div>`;
    }
  }

  // Son seyir notu önizleme
  let notOnizleme = "";
  if (sonSeyirNot) {
    notOnizleme = `
      <div class="son-epikriz">
        <div class="epikriz-tarih">${escHtml(sonSeyirNot.tarih)}</div>
        ${escHtml(sonSeyirNot.not_metni)}
      </div>`;
  }

  // Klinik kısa bilgiler
  let klBilgi = [];
  if (klDurum.hava_yolu === "Entübe/Trakeostomili") {
    let s = "Entübe";
    if (klDurum.entube_destek === "Mekanik ventilatöre bağlı" && klDurum.vent_mod) s += ` — ${klDurum.vent_mod}`;
    else if (klDurum.entube_destek) s += ` — ${klDurum.entube_destek}`;
    klBilgi.push(`<span style="color:var(--clr-vent);font-size:.75rem">🫁 ${escHtml(s)}</span>`);
  } else if (klDurum.hava_yolu === "Entübe değil" && klDurum.non_entube_destek && klDurum.non_entube_destek.length) {
    let str = klDurum.non_entube_destek.map(x => {
      if (x === "Oda havasında") return "Oda Havası";
      if (x === "Nazal kanül") return "NK";
      if (x === "Basit maske") return "Basit Maske";
      if (x === "Rezervuarlı maske") return "Rezervuarlı Maske";
      return x;
    }).join(", ");
    klBilgi.push(`<span style="color:var(--clr-vent);font-size:.75rem">🫁 ${escHtml(str)}</span>`);
  } else if (klDurum.vent_var && klDurum.vent_mod) {
    klBilgi.push(`<span style="color:var(--clr-vent);font-size:.75rem">🫁 ${escHtml(klDurum.vent_mod)}</span>`);
  }
  if (klDurum.beslenme && klDurum.beslenme !== "Yok") klBilgi.push(`<span style="color:var(--clr-text-muted);font-size:.75rem">🍽 ${escHtml(klDurum.beslenme)}</span>`);
  if (klDurum.ir_pupil) klBilgi.push(`<span style="color:var(--clr-text-muted);font-size:.75rem">👁 ${escHtml(klDurum.ir_pupil)}</span>`);
  const klBilgiHtml = klBilgi.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:5px;">${klBilgi.join("")}</div>` : "";

  return `
    <div class="hasta-kart ${yaklasan && !isTaburcu ? "yaklasan-islem" : ""} ${isTaburcu ? "taburcu" : ""}"
         onclick="hastaDetayAc(${h.id})" role="article"
         aria-label="Hasta ${escHtml(h.ad_soyad)}, Yatak ${escHtml(String(h.yatak_no))}">
      <div class="kart-header">
        <span class="yatak-badge">${escHtml(String(h.yatak_no))}</span>
        <div style="flex:1;min-width:0;">
          <div class="hasta-isim">${escHtml(h.ad_soyad)}</div>
          <div class="hasta-tani">${escHtml(h.tani) || '<span style="color:var(--clr-text-dim);font-style:italic;">Tanı girilmedi</span>'}</div>
        </div>
        <div class="durum-ikonlar">${ikonlar}</div>
      </div>
      <div class="kart-body">
        ${klBilgiHtml}
        ${kulturBadge}
        ${notOnizleme}
        ${yakBadge}
      </div>
      <div class="kart-footer" onclick="event.stopPropagation()">
        <span class="kart-guncelleme" title="Son güncelleme">🕐 ${formatTarih(h.guncelleme_tarihi)}</span>
        <div class="kart-actions">
          <button class="btn btn-danger btn-sm btn-icon" onclick="hastaSil(${h.id})" title="Sil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="hastaDuzenleAc(${h.id})" title="Düzenle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${!isTaburcu
            ? `<button class="btn btn-success btn-sm" onclick="hastaCikisAc(${h.id})">Hasta Çıkışı</button>`
            : `<button class="btn btn-secondary btn-sm" onclick="hastaAktifEt(${h.id})">Aktife Al</button>`}
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// ── MODAL YARDIMCILARI
// ════════════════════════════════════════════════════════════════════════════

function modalAc(id)  { document.getElementById(id).classList.add("open"); document.body.style.overflow = "hidden"; }
function modalKapat(id) { document.getElementById(id).classList.remove("open"); document.body.style.overflow = ""; }
function modalDisiTiklandi(e, id) { if (e.target === document.getElementById(id)) modalKapat(id); }

document.addEventListener("keydown", e => { if (e.key === "Escape") ["hastaModal", "detayModal"].forEach(modalKapat); });

// ════════════════════════════════════════════════════════════════════════════
// ── ÜNİTE SELECT & YATAK DROPDOWN (form içi)
// ════════════════════════════════════════════════════════════════════════════

function renderUniteSelect(secili = "") {
  const sel = document.getElementById("fUnite");
  sel.innerHTML = UNITE_LISTESI.map(u =>
    `<option value="${u}" ${u === (secili || aktifUnite) ? "selected" : ""}>${u}</option>`
  ).join("");
}

async function uniteSecildi() {
  const unite = document.getElementById("fUnite").value;
  await fetchDoluYataklar(unite);
  renderYatakSelect(unite, null);
}

async function renderYatakSelect(unite, seciliYatak) {
  const kapasite = UNITE_KONFIG[unite] || 7;
  const dolu = doluYataklar;
  const sel = document.getElementById("fYatakNo");
  sel.innerHTML = "";

  // Boş seçenek
  const bos = document.createElement("option");
  bos.value = ""; bos.textContent = "— Yatak seçin —"; bos.disabled = true;
  if (!seciliYatak) bos.selected = true;
  sel.appendChild(bos);

  for (let i = 1; i <= kapasite; i++) {
    const isDolu = dolu.includes(i) && i !== parseInt(seciliYatak);
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = isDolu ? `${i} (Dolu)` : String(i);
    opt.disabled = isDolu;
    if (i === parseInt(seciliYatak)) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── HASTA EKLE / DÜZENLE
// ════════════════════════════════════════════════════════════════════════════

async function hastaEkleAc() {
  duzenleId = null;
  document.getElementById("hastaModalTitle").textContent = "Yeni Hasta";
  formTemizle();
  renderUniteSelect(aktifUnite);
  await fetchDoluYataklar(aktifUnite);
  await renderYatakSelect(aktifUnite, null);
  modalAc("hastaModal");
  document.getElementById("fAdSoyad").focus();
}

async function hastaDuzenleAc(id) {
  const hasta = tumHastalar.find(h => h.id === id);
  if (!hasta) return;
  duzenleId = id;
  document.getElementById("hastaModalTitle").textContent = `Düzenle — Yatak ${hasta.yatak_no}`;
  formTemizle();
  renderUniteSelect(hasta.unite);
  await fetchDoluYataklar(hasta.unite);
  await renderYatakSelect(hasta.unite, hasta.yatak_no);
  formDoldur(hasta);
  modalAc("hastaModal");
}

function formTemizle() {
  document.getElementById("hastaForm").reset();
  // Toggle'ları sıfırla
  ["inot","sed"].forEach(t => {
    const cb = document.getElementById(t === "inot" ? "fInotVar" : "fSedVar");
    if (cb) cb.checked = false;
    updateToggle(t);
  });
  
  // Solunum sıfırla
  document.getElementById("entubeDestekDiv").style.display = "none";
  document.getElementById("nonEntubeDestekDiv").style.display = "none";
  document.getElementById("ventModRow").style.display = "none";
  document.getElementById("ventModDigerRow").style.display = "none";
  document.querySelectorAll('#fNonEntubeDestekGroup input[type="checkbox"]').forEach(cb => cb.checked = false);

  // Vasküler erişim sıfırla
  ["cvp","diyalizKat","diyaliz","crrt"].forEach(t => {
    const cbId = t === "cvp" ? "fCvpVar" : t === "diyalizKat" ? "fDiyalizKatVar" : t === "diyaliz" ? "fDiyalizVar" : "fCrrtVar";
    const el = document.getElementById(cbId);
    if (el) el.checked = false;
    vaskulerToggle(t);
  });
  document.querySelectorAll('#fDiyalizGunleriGroup input[type="checkbox"]').forEach(cb => cb.checked = false);

  document.getElementById("islemList").innerHTML  = "";
  document.getElementById("tetkikList").innerHTML = "";
  document.getElementById("kulturList").innerHTML = "";
  document.getElementById("antibiyotikList").innerHTML = "";
  document.getElementById("inotAjanList").innerHTML = "";
  document.getElementById("sedAjanList").innerHTML  = "";
}

function formDoldur(h) {
  document.getElementById("fAdSoyad").value       = h.ad_soyad || "";
  document.getElementById("fTani").value          = h.tani || "";
  document.getElementById("fKabulEpikrizi").value = h.kabul_epikrizi || "";
  document.getElementById("fGenelNot").value      = h.genel_not || "";

  const klDurum = h.klinik_durum || {};

  // Solunum / Hava Yolu
  document.getElementById("fHavaYolu").value = klDurum.hava_yolu || "";
  havaYoluDegisti();
  
  if (klDurum.hava_yolu === "Entübe/Trakeostomili") {
    document.getElementById("fEntubeDestek").value = klDurum.entube_destek || "";
    entubeDestekDegisti();
    
    if (klDurum.entube_destek === "Mekanik ventilatöre bağlı") {
      const ventMod = klDurum.vent_mod || "";
      const stdModlar = ["SIMV","CPAP","AC/VC","PRVC","APRV"];
      const modSel = document.getElementById("fVentMod");
      if (ventMod && stdModlar.includes(ventMod)) {
        modSel.value = ventMod;
      } else if (ventMod) {
        modSel.value = "Diğer";
        document.getElementById("fVentModDiger").value = ventMod;
      }
      ventModDegisti();
    }
  } else if (klDurum.hava_yolu === "Entübe değil") {
    const nonEntube = klDurum.non_entube_destek || [];
    document.querySelectorAll('#fNonEntubeDestekGroup input[type="checkbox"]').forEach(cb => {
      cb.checked = nonEntube.includes(cb.value);
    });
  }

  // İnotrop
  document.getElementById("fInotVar").checked = !!klDurum.inot_var;
  updateToggle("inot");
  (klDurum.inot_ajanlar || []).forEach(a => ajanEkle("inot", a));

  // Sedasyon
  document.getElementById("fSedVar").checked = !!klDurum.sed_var;
  updateToggle("sed");
  (klDurum.sed_ajanlar || []).forEach(a => ajanEkle("sed", a));

  // Beslenme / Diürez / IR
  document.getElementById("fBeslenme").value = klDurum.beslenme || "Yok";
  document.getElementById("fDiurez").value   = klDurum.diurez || "";
  document.getElementById("fIrPupil").value  = klDurum.ir_pupil || "";

  // Vasküler Erişim & Renal Takip
  document.getElementById("fCvpVar").checked = !!klDurum.cvp_var;
  vaskulerToggle("cvp");
  if (klDurum.cvp_var) document.getElementById("fCvpYer").value = klDurum.cvp_yer || "";

  document.getElementById("fDiyalizKatVar").checked = !!klDurum.diyaliz_kateter_var;
  vaskulerToggle("diyalizKat");
  if (klDurum.diyaliz_kateter_var) document.getElementById("fDiyalizKatYer").value = klDurum.diyaliz_kateter_yer || "";

  document.getElementById("fDiyalizVar").checked = !!klDurum.diyaliz_var;
  vaskulerToggle("diyaliz");
  if (klDurum.diyaliz_var) {
    const gunler = klDurum.diyaliz_gunleri || [];
    document.querySelectorAll('#fDiyalizGunleriGroup input[type="checkbox"]').forEach(cb => {
      cb.checked = gunler.includes(cb.value);
    });
  }

  document.getElementById("fCrrtVar").checked = !!klDurum.crrt_var;
  vaskulerToggle("crrt");
  if (klDurum.crrt_var && klDurum.crrt_baslangic) document.getElementById("fCrrtBaslangic").value = klDurum.crrt_baslangic;

  // Planlanan işlemler
  (h.planlanan_islemler || []).forEach(i => islemEkle(i));

  // Kültürler
  (h.kultur_takibi || []).forEach(k => kulturEkle(k));

  // Bağımsız Antibiyotikler
  (h.antibiyotikler || []).forEach(a => antibiyotikEkle(a));

  // Tetkikler
  (h.goruntuleme_tetkik || []).forEach(t => tetkikEkle(t));
}

function updateToggle(tip) {
  const map = {
    inot: { cb:"fInotVar", grp:"inotToggleGroup", lbl:"inotLabel", on:"Kullanılıyor", off:"Kullanılmıyor", div:"inotAjanlarDiv" },
    sed:  { cb:"fSedVar",  grp:"sedToggleGroup",  lbl:"sedLabel",  on:"Kullanılıyor", off:"Kullanılmıyor", div:"sedAjanlarDiv" },
  };
  const m = map[tip]; if (!m) return;
  const cb  = document.getElementById(m.cb);
  const grp = document.getElementById(m.grp);
  const lbl = document.getElementById(m.lbl);
  if (!cb) return;
  const aktif = cb.checked;
  grp?.classList.toggle("on", aktif);
  if (lbl) lbl.textContent = aktif ? m.on : m.off;
  if (m.row) document.getElementById(m.row).style.display = aktif ? "" : "none";
  if (m.div) document.getElementById(m.div).style.display = aktif ? "" : "none";
  // İlk ajan yoksa otomatik ekle
  if (aktif && m.div) {
    const liste = document.getElementById(tip + "AjanList");
    if (liste && liste.children.length === 0) ajanEkle(tip);
  }
}

function onToggle(tip) { setTimeout(() => updateToggle(tip), 0); }

// ── Vasküler / Renal toggle
function vaskulerToggle(tip) {
  const map = {
    cvp:       { cb:"fCvpVar",       lbl:"cvpLabel",       grp:"cvpToggleGroup",       on:"Var",      off:"Yok",      div:"cvpYerDiv" },
    diyalizKat:{ cb:"fDiyalizKatVar",lbl:"diyalizKatLabel",grp:"diyalizKatToggleGroup",on:"Var",      off:"Yok",      div:"diyalizKatYerDiv" },
    diyaliz:   { cb:"fDiyalizVar",   lbl:"diyalizLabel",   grp:"diyalizToggleGroup",   on:"Alıyor",  off:"Almıyor",  div:"diyalizGunleriDiv" },
    crrt:      { cb:"fCrrtVar",      lbl:"crrtLabel",      grp:"crrtToggleGroup",      on:"Alıyor",  off:"Almıyor",  div:"crrtDetayDiv" },
  };
  const m = map[tip]; if (!m) return;
  const cb  = document.getElementById(m.cb);
  const grp = document.getElementById(m.grp);
  const lbl = document.getElementById(m.lbl);
  if (!cb) return;
  const aktif = cb.checked;
  grp?.classList.toggle("on", aktif);
  if (lbl) lbl.textContent = aktif ? m.on : m.off;
  if (m.div) document.getElementById(m.div).style.display = aktif ? "block" : "none";
}

// Ajan ekle/çıkar (inot / sed)
function ajanEkle(tip, data = null) {
  const listId = tip + "AjanList";
  const liste = document.getElementById(listId);
  const idx = Date.now();
  const div = document.createElement("div");
  div.className = "ajan-item";
  div.innerHTML = `
    <input class="form-input ajan-adi" type="text" placeholder="Ajan adı (örn. Noradrenalin)"
           value="${escHtml(data?.ajan || "")}" data-tip="${tip}" data-field="ajan" />
    <input class="form-input ajan-doz" type="text" placeholder="Doz (örn. 0.2 mcg/kg/dk)"
           value="${escHtml(data?.doz || "")}" data-tip="${tip}" data-field="doz" />
    <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()" title="Kaldır">✕</button>`;
  liste.appendChild(div);
}

function havaYoluDegisti() {
  const v = document.getElementById("fHavaYolu").value;
  document.getElementById("entubeDestekDiv").style.display = v === "Entübe/Trakeostomili" ? "block" : "none";
  document.getElementById("nonEntubeDestekDiv").style.display = v === "Entübe değil" ? "block" : "none";
  if (v !== "Entübe/Trakeostomili") {
    document.getElementById("fEntubeDestek").value = "";
    entubeDestekDegisti();
  }
}

function entubeDestekDegisti() {
  const v = document.getElementById("fEntubeDestek").value;
  document.getElementById("ventModRow").style.display = v === "Mekanik ventilatöre bağlı" ? "block" : "none";
  if (v !== "Mekanik ventilatöre bağlı") {
    document.getElementById("fVentMod").value = "";
    ventModDegisti();
  }
}

function ventModDegisti() {
  const sel = document.getElementById("fVentMod");
  const row = document.getElementById("ventModDigerRow");
  row.style.display = sel.value === "Diğer" ? "" : "none";
}

// ── Dinamik liste: Planlanan İşlemler
function islemEkle(data = null) {
  const liste = document.getElementById("islemList");
  const div = document.createElement("div");
  div.className = "dynamic-list-item";
  div.innerHTML = `
    <input class="form-input" type="text" placeholder="İşlem tanımı"
           value="${escHtml(data?.tanim || "")}" style="flex:1;" data-role="islem-tanim" />
    <input class="form-input" type="date" value="${escHtml(data?.tarih || "")}"
           style="width:135px;" data-role="islem-tarih" />
    <label style="display:flex;align-items:center;gap:3px;font-size:.78rem;color:var(--clr-text-muted);cursor:pointer;flex-shrink:0;" title="Tamamlandı">
      <input type="checkbox" ${data?.tamamlandi ? "checked" : ""} data-role="islem-tamam" /> ✓
    </label>
    <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">✕</button>`;
  liste.appendChild(div);
}

// ── Dinamik liste: Tetkikler
function tetkikEkle(data = null) {
  const liste = document.getElementById("tetkikList");
  const div = document.createElement("div");
  div.className = "dynamic-list-item";
  div.innerHTML = `
    <input class="form-input" type="date" value="${escHtml(data?.tarih || bugunIso())}"
           style="width:140px;" data-role="tetkik-tarih" />
    <input class="form-input" type="text" placeholder="Tetkik adı ve sonucu"
           value="${escHtml(data?.icerik || "")}" style="flex:1;" data-role="tetkik-icerik" />
    <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">✕</button>`;
  liste.appendChild(div);
}

// ── Dinamik liste: Bağımsız Antibiyotik
function antibiyotikEkle(data = null) {
  const liste = document.getElementById("antibiyotikList");
  const div = document.createElement("div");
  div.className = "dynamic-list-item";
  div.innerHTML = `
    <input class="form-input" type="text" placeholder="Antibiyotik adı"
           value="${escHtml(data?.ad || "")}" style="flex:1;" data-role="ab-ad" />
    <input class="form-input" type="text" placeholder="Doz"
           value="${escHtml(data?.doz || "")}" style="width:100px;" data-role="ab-doz" />
    <input class="form-input" type="date" value="${escHtml(data?.baslangic_tarihi || bugunIso())}"
           style="width:130px;" data-role="ab-tarih" />
    <input class="form-input" type="text" placeholder="İlişkili Kx (Opsiyonel)"
           value="${escHtml(data?.ilişkili_kultur || "")}" style="width:120px;" data-role="ab-kx" />
    <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">✕</button>`;
  liste.appendChild(div);
}

// ── Dinamik liste: Kültür
function kulturEkle(data = null) {
  const liste = document.getElementById("kulturList");
  const div = document.createElement("div");
  div.className = "dynamic-list-item";
  div.style.flexWrap = "wrap";
  div.style.gap = "6px";
  
  const isCustomTur = data?.tur && !['Kan','TAS','İdrar','Yara'].includes(data.tur);
  const isSonuc = data && data.sonuc !== 'Bekleniyor';
  
  div.innerHTML = `
    <div style="display:flex; width:100%; gap:8px;">
      <select class="form-select" style="width:105px; ${isCustomTur ? 'display:none;' : ''}" data-role="${isCustomTur ? '' : 'kultur-tur'}" onchange="if(this.value==='Diğer') {this.nextElementSibling.style.display=''; this.nextElementSibling.setAttribute('data-role', 'kultur-tur'); this.style.display='none'; this.removeAttribute('data-role');}">
        <option value="">Tür</option>
        <option value="Kan" ${data?.tur === 'Kan' ? 'selected' : ''}>Kan</option>
        <option value="TAS" ${data?.tur === 'TAS' ? 'selected' : ''}>TAS</option>
        <option value="İdrar" ${data?.tur === 'İdrar' ? 'selected' : ''}>İdrar</option>
        <option value="Yara" ${data?.tur === 'Yara' ? 'selected' : ''}>Yara</option>
        <option value="Diğer" ${isCustomTur ? 'selected' : ''}>Diğer</option>
      </select>
      <input class="form-input" type="text" placeholder="Tür" style="width:105px; ${isCustomTur ? '' : 'display:none;'}" ${isCustomTur ? 'data-role="kultur-tur"' : ''} value="${escHtml(isCustomTur ? data.tur : "")}" />
      <input class="form-input" type="date" style="width:130px;" data-role="kultur-tarih" value="${escHtml(data?.tarih || bugunIso())}" />
      
      <select class="form-select" style="${isSonuc ? 'display:none;' : 'flex:1;'}" data-role="${isSonuc ? '' : 'kultur-sonuc'}" onchange="if(this.value==='Sonuçlandı') {this.nextElementSibling.style.display=''; this.nextElementSibling.setAttribute('data-role', 'kultur-sonuc'); this.style.display='none'; this.removeAttribute('data-role');}">
        <option value="Bekleniyor" ${!isSonuc ? 'selected' : ''}>Bekleniyor</option>
        <option value="Sonuçlandı" ${isSonuc ? 'selected' : ''}>Sonuçlandı</option>
      </select>
      <input class="form-input" type="text" placeholder="Sonuç (Örn. Temiz, Staf...)" style="${isSonuc ? 'flex:1;' : 'display:none;'}" ${isSonuc ? 'data-role="kultur-sonuc"' : ''} value="${escHtml(isSonuc ? data.sonuc : "")}" />
      
      <button type="button" class="btn-remove-item" onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
    <div style="display:flex; width:100%; gap:8px; padding-left:10px; align-items:center;">
      <span style="font-size:0.75rem; color:var(--clr-text-muted); width:95px; text-align:right;">İlişkili AB:</span>
      <input class="form-input" type="text" placeholder="Antibiyotik adı" style="flex:1;" data-role="kultur-ab" value="${escHtml(data?.antibiyotik_adi || "")}" />
      <input class="form-input" type="date" style="width:130px;" data-role="kultur-ab-tarih" value="${escHtml(data?.antibiyotik_baslangic || "")}" title="Başlangıç Tarihi" />
    </div>`;
  liste.appendChild(div);
}

// ── Form kaydet
async function hastaKaydet(e) {
  e.preventDefault();

  const unite   = document.getElementById("fUnite").value;
  const yatakNo = document.getElementById("fYatakNo").value;
  if (!yatakNo) { toast("Yatak numarası seçin.", "error"); return; }

  // Solunum Desteği
  const havaYolu = document.getElementById("fHavaYolu").value;
  let entubeDestek = "";
  let nonEntubeDestek = [];
  let ventMod = "";
  let ventVar = false;

  if (havaYolu === "Entübe/Trakeostomili") {
    entubeDestek = document.getElementById("fEntubeDestek").value;
    if (entubeDestek === "Mekanik ventilatöre bağlı") {
      ventVar = true;
      const selMod = document.getElementById("fVentMod").value;
      ventMod = selMod === "Diğer" ? document.getElementById("fVentModDiger").value.trim() : selMod;
    }
  } else if (havaYolu === "Entübe değil") {
    document.querySelectorAll('#fNonEntubeDestekGroup input[type="checkbox"]:checked').forEach(cb => {
      nonEntubeDestek.push(cb.value);
    });
  }

  // İnotrop ajanlar
  const inotVar = document.getElementById("fInotVar").checked;
  const inotAjanlar = [];
  document.getElementById("inotAjanList").querySelectorAll(".ajan-item").forEach(el => {
    const ajan = el.querySelector('[data-field="ajan"]')?.value?.trim();
    const doz  = el.querySelector('[data-field="doz"]')?.value?.trim();
    if (ajan) inotAjanlar.push({ ajan, doz: doz || "" });
  });

  // Sedasyon ajanlar
  const sedVar = document.getElementById("fSedVar").checked;
  const sedAjanlar = [];
  document.getElementById("sedAjanList").querySelectorAll(".ajan-item").forEach(el => {
    const ajan = el.querySelector('[data-field="ajan"]')?.value?.trim();
    const doz  = el.querySelector('[data-field="doz"]')?.value?.trim();
    if (ajan) sedAjanlar.push({ ajan, doz: doz || "" });
  });

  // Planlanan işlemler
  const planlananIslemler = [];
  document.getElementById("islemList").querySelectorAll(".dynamic-list-item").forEach(el => {
    const tanim = el.querySelector('[data-role="islem-tanim"]')?.value?.trim();
    const tarih = el.querySelector('[data-role="islem-tarih"]')?.value || "";
    const tamam = el.querySelector('[data-role="islem-tamam"]')?.checked || false;
    if (tanim) planlananIslemler.push({ tanim, tarih, tamamlandi: tamam });
  });

  // Tetkikler
  const goruntulemeTetkik = [];
  document.getElementById("tetkikList").querySelectorAll(".dynamic-list-item").forEach(el => {
    const tarih  = el.querySelector('[data-role="tetkik-tarih"]')?.value || bugunIso();
    const icerik = el.querySelector('[data-role="tetkik-icerik"]')?.value?.trim();
    if (icerik) goruntulemeTetkik.push({ tarih, icerik });
  });

  // Kültürler
  const kulturTakibi = [];
  document.getElementById("kulturList").querySelectorAll(".dynamic-list-item").forEach(el => {
    const tur = el.querySelector('[data-role="kultur-tur"]')?.value?.trim();
    const tarih = el.querySelector('[data-role="kultur-tarih"]')?.value || "";
    const sonuc = el.querySelector('[data-role="kultur-sonuc"]')?.value?.trim();
    const abAdi = el.querySelector('[data-role="kultur-ab"]')?.value?.trim();
    const abTarih = el.querySelector('[data-role="kultur-ab-tarih"]')?.value || "";
    if (tur) kulturTakibi.push({ tur, tarih, sonuc, antibiyotik_adi: abAdi, antibiyotik_baslangic: abTarih });
  });

  // Bağımsız Antibiyotikler
  const antibiyotikler = [];
  document.getElementById("antibiyotikList").querySelectorAll(".dynamic-list-item").forEach(el => {
    const ad = el.querySelector('[data-role="ab-ad"]')?.value?.trim();
    const doz = el.querySelector('[data-role="ab-doz"]')?.value?.trim();
    const baslangic = el.querySelector('[data-role="ab-tarih"]')?.value || "";
    const kx = el.querySelector('[data-role="ab-kx"]')?.value?.trim();
    if (ad) antibiyotikler.push({ ad, doz, baslangic_tarihi: baslangic, ilişkili_kultur: kx });
  });

  const payload = {
    unite,
    yatak_no: String(yatakNo),
    ad_soyad: document.getElementById("fAdSoyad").value.trim(),
    tani: document.getElementById("fTani").value.trim(),
    kabul_epikrizi: document.getElementById("fKabulEpikrizi").value.trim(),
    klinik_durum: {
      hava_yolu: havaYolu,
      entube_destek: entubeDestek,
      non_entube_destek: nonEntubeDestek,
      vent_var: ventVar, vent_mod: ventMod,
      inot_var: inotVar, inot_ajanlar: inotAjanlar,
      sed_var:  sedVar,  sed_ajanlar:  sedAjanlar,
      beslenme: document.getElementById("fBeslenme").value,
      diurez:   document.getElementById("fDiurez").value.trim(),
      ir_pupil: document.getElementById("fIrPupil").value,
      // Vasküler Erişim & Renal
      cvp_var: document.getElementById("fCvpVar").checked,
      cvp_yer: document.getElementById("fCvpYer")?.value || "",
      diyaliz_kateter_var: document.getElementById("fDiyalizKatVar").checked,
      diyaliz_kateter_yer: document.getElementById("fDiyalizKatYer")?.value || "",
      diyaliz_var: document.getElementById("fDiyalizVar").checked,
      diyaliz_gunleri: (() => {
        const g = [];
        document.querySelectorAll('#fDiyalizGunleriGroup input[type="checkbox"]:checked').forEach(cb => g.push(cb.value));
        return g;
      })(),
      crrt_var: document.getElementById("fCrrtVar").checked,
      crrt_baslangic: document.getElementById("fCrrtBaslangic")?.value || "",
      crrt_tipi: document.getElementById("fCrrtTipi")?.value || "",
    },
    planlanan_islemler: planlananIslemler,
    goruntuleme_tetkik: goruntulemeTetkik,
    kultur_takibi: kulturTakibi,
    antibiyotikler: antibiyotikler,
    genel_not: document.getElementById("fGenelNot").value.trim(),
    // durum bilerek gönderilmiyor: backend mevcut değeri korur. Sabit "aktif"
    // göndermek taburcu hastayı düzenlerken aktife çeviriyor ve çıkış kaydını siliyordu.
  };

  const btn = document.getElementById("btnKaydet");
  btn.disabled = true; btn.textContent = "Kaydediliyor…";

  try {
    if (duzenleId) {
      await apiFetch(`/api/hastalar/${duzenleId}`, { method: "PUT", body: JSON.stringify(payload) });
      toast(`${payload.ad_soyad} güncellendi.`, "success");
    } else {
      await apiFetch("/api/hastalar", { method: "POST", body: JSON.stringify(payload) });
      toast(`${payload.ad_soyad} eklendi.`, "success");
    }
    modalKapat("hastaModal");
    await hastaListesiYukle();
    if (detayHastaId) await hastaDetayAc(detayHastaId);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Kaydet`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── HASTA DETAY MODAL
// ════════════════════════════════════════════════════════════════════════════

async function hastaDetayAc(id) {
  detayHastaId = id;
  let hasta;
  try { hasta = await apiFetch(`/api/hastalar/${id}`); } catch (_) { return; }

  const klDurum   = hasta.klinik_durum || {};
  const yaklasan  = hastaYaklaşanIslemVar(hasta);
  const epikrizler = hasta.epikriz_notlari || [];

  // ── Temel bilgiler ──────────────────────────────────────────────────────
  const temelHtml = `
    <div class="detay-grid">
      <div class="detay-alan"><div class="detay-alan-label">Ünite</div><div class="detay-alan-value">${escHtml(hasta.unite)}</div></div>
      <div class="detay-alan"><div class="detay-alan-label">Yatak No</div><div class="detay-alan-value">${escHtml(String(hasta.yatak_no))}</div></div>
      <div class="detay-alan"><div class="detay-alan-label">Ad Soyad / Kod</div><div class="detay-alan-value">${escHtml(hasta.ad_soyad)}</div></div>
      <div class="detay-alan full"><div class="detay-alan-label">Tanı</div>
        <div class="detay-alan-value ${!hasta.tani ? "bos" : ""}">${escHtml(hasta.tani) || "Girilmedi"}</div>
      </div>
      <div class="detay-alan"><div class="detay-alan-label">Oluşturma</div><div class="detay-alan-value" style="font-size:.8rem">${formatTarih(hasta.olusturma_tarihi)}</div></div>
      <div class="detay-alan"><div class="detay-alan-label">Son Güncelleme</div><div class="detay-alan-value" style="font-size:.8rem">${formatTarih(hasta.guncelleme_tarihi)}</div></div>
    </div>`;

  // ── Klinik Durum ────────────────────────────────────────────────────────
  const inotStr = (klDurum.inot_ajanlar || []).map(a => `${a.ajan}${a.doz ? " " + a.doz : ""}`).join(" / ") || (klDurum.inot_var ? "Kullanılıyor" : "");
  const sedStr  = (klDurum.sed_ajanlar  || []).map(a => `${a.ajan}${a.doz ? " " + a.doz : ""}`).join(" / ") || (klDurum.sed_var  ? "Kullanılıyor" : "");

  const klinikHtml = `
    <div class="detay-section" style="margin-top:16px;">
      <div class="detay-section-title">💊 Klinik Durum</div>
      <div class="klinik-durum-grid">
        <div class="kd-panel ${(klDurum.hava_yolu || klDurum.vent_var) ? "aktif-vent" : ""}">
          <div class="kd-panel-label">🫁 Solunum / Hava Yolu</div>
          ${klDurum.hava_yolu === "Entübe/Trakeostomili"
            ? `<div class="kd-panel-value vent-v">Entübe/Trakeostomili<br><small style="font-weight:normal;opacity:0.9">${escHtml(klDurum.entube_destek)}${klDurum.entube_destek === 'Mekanik ventilatöre bağlı' && klDurum.vent_mod ? ' — ' + escHtml(klDurum.vent_mod) : ''}</small></div>`
            : klDurum.hava_yolu === "Entübe değil" && klDurum.non_entube_destek && klDurum.non_entube_destek.length
            ? `<div class="kd-panel-value vent-v">Entübe Değil<br><small style="font-weight:normal;opacity:0.9">${escHtml(klDurum.non_entube_destek.join(", "))}</small></div>`
            : klDurum.vent_var 
            ? `<div class="kd-panel-value vent-v">Bağlı${klDurum.vent_mod ? " — " + escHtml(klDurum.vent_mod) : ""}</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
        <div class="kd-panel ${klDurum.inot_var ? "aktif-inot" : ""}">
          <div class="kd-panel-label">💉 İnotrop / Vazopressör</div>
          ${klDurum.inot_var
            ? `<div class="kd-panel-value inot-v">${escHtml(inotStr) || "Kullanılıyor"}</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
        <div class="kd-panel ${klDurum.sed_var ? "aktif-sed" : ""}">
          <div class="kd-panel-label">💊 Sedasyon</div>
          ${klDurum.sed_var
            ? `<div class="kd-panel-value sed-v">${escHtml(sedStr) || "Kullanılıyor"}</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
        <div class="kd-panel">
          <div class="kd-panel-label">🍽 Beslenme</div>
          <div class="kd-panel-value ${!klDurum.beslenme || klDurum.beslenme === "Yok" ? "bos" : ""}">${escHtml(klDurum.beslenme) || "—"}</div>
        </div>
        <div class="kd-panel">
          <div class="kd-panel-label">💧 Diürez</div>
          <div class="kd-panel-value ${!klDurum.diurez ? "bos" : ""}">${escHtml(klDurum.diurez) || "—"}</div>
        </div>
        <div class="kd-panel">
          <div class="kd-panel-label">👁 IR / Pupil</div>
          <div class="kd-panel-value ${!klDurum.ir_pupil ? "bos" : ""}">${escHtml(klDurum.ir_pupil) || "—"}</div>
        </div>
      </div>
    </div>
    <div class="detay-section" style="margin-top:12px;">
      <div class="detay-section-title">🩺 Vasküler Erişim &amp; Renal Takip</div>
      <div class="klinik-durum-grid">
        <div class="kd-panel ${klDurum.cvp_var ? 'aktif-vent' : ''}">
          <div class="kd-panel-label">🔵 CVP Kateteri</div>
          ${klDurum.cvp_var
            ? `<div class="kd-panel-value vent-v">Var${klDurum.cvp_yer ? ' — ' + escHtml(klDurum.cvp_yer) : ''}</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
        <div class="kd-panel ${klDurum.diyaliz_kateter_var ? 'aktif-vent' : ''}">
          <div class="kd-panel-label">🟣 Diyaliz Kateteri</div>
          ${klDurum.diyaliz_kateter_var
            ? `<div class="kd-panel-value vent-v">Var${klDurum.diyaliz_kateter_yer ? ' — ' + escHtml(klDurum.diyaliz_kateter_yer) : ''}</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
        <div class="kd-panel ${klDurum.diyaliz_var ? 'aktif-inot' : ''}">
          <div class="kd-panel-label">💧 Diyaliz</div>
          ${klDurum.diyaliz_var && klDurum.diyaliz_gunleri && klDurum.diyaliz_gunleri.length
            ? `<div class="kd-panel-value inot-v">${escHtml(klDurum.diyaliz_gunleri.join(', '))}
               ${diyalizGunUyarisi(hasta) ? `<br><small style="color:#0ea5e9">💧 ${diyalizGunUyarisi(hasta) === 'bugün' ? 'Bugün diyaliz günü!' : 'Yarın diyaliz günü!'}</small>` : ''}</div>`
            : klDurum.diyaliz_var
            ? `<div class="kd-panel-value inot-v">Alıyor</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
        <div class="kd-panel ${klDurum.crrt_var ? 'aktif-inot' : ''}">
          <div class="kd-panel-label">🔄 CRRT</div>
          ${klDurum.crrt_var
            ? `<div class="kd-panel-value inot-v">Alıyor${klDurum.crrt_tipi ? ' (' + escHtml(klDurum.crrt_tipi) + ')' : ''}
               ${klDurum.crrt_baslangic ? '<br><small style="font-weight:normal;opacity:.9">Başlangıç: ' + escHtml(klDurum.crrt_baslangic) + (kacGundurKullaniliyor(klDurum.crrt_baslangic) ? ' — ' + kacGundurKullaniliyor(klDurum.crrt_baslangic) : '') + '</small>' : ''}</div>`
            : `<div class="kd-panel-value bos">—</div>`}
        </div>
      </div>
    </div>`;

  // ── Kültür & Antibiyotik Takibi ─────────────────────────────────────────
  let kulturHtml = "";
  
  // Antibiyotik özeti (Bağımsız + Kültürle İlişkili)
  const allAb = [];
  (hasta.antibiyotikler || []).forEach(a => {
    const gunStr = kacGundurKullaniliyor(a.baslangic_tarihi);
    allAb.push(`<div style="padding:6px; background:rgba(16,185,129,0.08); border-radius:6px; margin-bottom:6px; border:1px solid rgba(16,185,129,0.2);">
      <strong>💊 ${escHtml(a.ad)}</strong> ${a.doz ? `(${escHtml(a.doz)})` : ""} 
      <span style="font-size:0.8rem; color:var(--clr-text-muted); float:right;">${gunStr ? gunStr : formatTarihKisa(a.baslangic_tarihi)}</span>
      ${a.ilişkili_kultur ? `<br><small style="color:var(--clr-text-dim)">İlişkili Kx: ${escHtml(a.ilişkili_kultur)}</small>` : ""}
    </div>`);
  });
  
  (hasta.kultur_takibi || []).filter(k => k.antibiyotik_adi).forEach(k => {
    const gunStr = kacGundurKullaniliyor(k.antibiyotik_baslangic);
    allAb.push(`<div style="padding:6px; background:rgba(16,185,129,0.08); border-radius:6px; margin-bottom:6px; border:1px solid rgba(16,185,129,0.2);">
      <strong>💊 ${escHtml(k.antibiyotik_adi)}</strong> 
      <span style="font-size:0.8rem; color:var(--clr-text-muted); float:right;">${gunStr ? gunStr : formatTarihKisa(k.antibiyotik_baslangic)}</span>
      <br><small style="color:var(--clr-text-dim)">Kültürle ilişkili: ${escHtml(k.tur)} (${formatTarihKisa(k.tarih)})</small>
    </div>`);
  });

  const abSection = allAb.length ? `<div style="margin-bottom:12px;">${allAb.join("")}</div>` : "";

  if ((hasta.kultur_takibi && hasta.kultur_takibi.length) || allAb.length) {
    const kStr = (hasta.kultur_takibi || []).map(k => {
      let r = `<div style="padding:6px; background:var(--clr-bg-alt); border-radius:6px; margin-bottom:6px; border:1px solid var(--clr-border);">`;
      r += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
      r += `<strong>🧫 ${escHtml(k.tur)} Kültürü</strong> <span style="font-size:0.8rem; color:var(--clr-text-muted);">${formatTarih(k.tarih)}</span>`;
      r += `</div>`;
      if (k.sonuc === "Bekleniyor" || !k.sonuc) {
        r += `<div style="color:var(--clr-inot); font-size:0.85rem; margin-top:4px;">Sonuç Bekleniyor</div>`;
      } else {
        r += `<div style="color:var(--clr-text); font-size:0.85rem; margin-top:4px;"><strong>Sonuç:</strong> ${escHtml(k.sonuc)}</div>`;
      }
      if (k.antibiyotik_adi) {
        const abGun = kacGundurKullaniliyor(k.antibiyotik_baslangic);
        r += `<div style="color:var(--clr-sed); font-size:0.85rem; margin-top:4px; border-top:1px dashed var(--clr-border); padding-top:4px;">💊 AB: ${escHtml(k.antibiyotik_adi)}${abGun ? ` (${abGun})` : ""}</div>`;
      }
      r += `</div>`;
      return r;
    }).join("");
    kulturHtml = `
      <div class="detay-section" style="margin-top:16px;">
        <div class="detay-section-title">🧫 Kültür & Antibiyotik Takibi</div>
        <div style="margin-top:8px;">${abSection}${kStr}</div>
      </div>`;
  }

  // ── Kabul Epikrizi ──────────────────────────────────────────────────────
  const kabulHtml = `
    <div class="detay-section" style="margin-top:16px;">
      <div class="detay-section-title">📋 Kabul Epikrizi</div>
      <div class="detay-kabul-epikriz">
        <div class="detay-kabul-baslik">📋 Kabul / Başvuru Özeti</div>
        ${hasta.kabul_epikrizi
          ? `<div class="detay-kabul-metin">${escHtml(hasta.kabul_epikrizi)}</div>`
          : `<div class="detay-kabul-metin" style="color:var(--clr-text-dim);font-style:italic;">Henüz girilmedi.</div>`}
        <div class="detay-kabul-edit" id="kabulEditDiv" style="display:none;">
          <textarea class="form-textarea" id="kabulEditInput" rows="4">${escHtml(hasta.kabul_epikrizi || "")}</textarea>
          <button class="btn btn-primary btn-sm" onclick="kabulEpikrizKaydet(${hasta.id})" style="align-self:flex-end;">Kaydet</button>
        </div>
        <div style="margin-top:8px;">
          <button class="btn btn-secondary btn-sm" onclick="toggleKabulEdit()">✏ Düzenle</button>
        </div>
      </div>
    </div>`;

  // ── Klinik Seyir Notları ────────────────────────────────────────────────
  const seyirHtml = `
    <div class="detay-section" style="margin-top:16px;">
      <div class="detay-section-title">📝 Klinik Seyir Notları</div>
      <div class="epikriz-log" id="epikrizLog">
        ${epikrizler.length
          ? epikrizler.map(n => `
              <div class="epikriz-entry" id="epikriz-entry-${n.id}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div class="epikriz-entry-tarih">${escHtml(n.tarih)}</div>
                  <div class="epikriz-actions" style="display:flex; gap:4px;">
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="epikrizDuzenleAc(${n.id}, '${escHtml(n.not_metni).replace(/'/g, "\\'")}')" title="Düzenle" style="padding:2px 4px; height:auto;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn btn-danger btn-sm btn-icon" onclick="epikrizNotSil(${n.id}, ${hasta.id})" title="Sil" style="padding:2px 4px; height:auto;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <div class="epikriz-entry-metin" id="epikriz-metin-${n.id}">${escHtml(n.not_metni)}</div>
                <div id="epikriz-edit-${n.id}" style="display:none; margin-top:8px;">
                  <textarea class="form-textarea" id="epikriz-edit-input-${n.id}" rows="2"></textarea>
                  <div style="display:flex; gap:5px; margin-top:5px; justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="epikrizDuzenleKapat(${n.id})">İptal</button>
                    <button class="btn btn-primary btn-sm" onclick="epikrizNotGuncelle(${n.id}, ${hasta.id})">Kaydet</button>
                  </div>
                </div>
              </div>`).join("")
          : `<div style="padding:14px;color:var(--clr-text-dim);font-style:italic;font-size:.85rem;">Henüz seyir notu yok.</div>`}
      </div>
      <div class="epikriz-add-form" style="margin-top:10px;">
        <textarea class="form-textarea" id="epikrizInput" rows="3"
                  placeholder="Yeni not ekle… (örn. 19.07 — BT temiz, ateş geriledi)"></textarea>
        <button class="btn btn-primary" onclick="epikrizNotEkle(${hasta.id})" style="align-self:flex-end;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg> Ekle
        </button>
      </div>
    </div>`;

  // ── Planlanan İşlemler ──────────────────────────────────────────────────
  const islemler = hasta.planlanan_islemler || [];
  const islemHtml = islemler.length ? `
    <div class="detay-section" style="margin-top:16px;">
      <div class="detay-section-title">📅 Planlanan İşlemler</div>
      <div class="detay-tablo">
        ${islemler.map(i => {
          const g = gunKaldi(i.tarih);
          const yak = !i.tamamlandi && g !== null && g >= 0 && g <= 7;
          const gYaz = g === null ? "" : g === 0 ? "Bugün" : g < 0 ? `${-g} gün geçti` : `${g} gün kaldı`;
          return `
            <div class="detay-tablo-row">
              <span class="detay-tablo-tarih">${i.tarih ? formatTarihKisa(i.tarih) : "—"}</span>
              <span class="detay-tablo-islem ${i.tamamlandi ? "tamamlandi" : yak ? "yaklasan" : ""}">
                ${i.tamamlandi ? "✓ " : yak ? "⚠ " : ""}${escHtml(i.tanim)}
              </span>
              ${gYaz ? `<span style="margin-left:auto;font-size:.74rem;color:${yak ? "var(--clr-islem)" : "var(--clr-text-dim)"};">${gYaz}</span>` : ""}
            </div>`;
        }).join("")}
      </div>
    </div>` : "";

  // ── Görüntüleme/Tetkik ──────────────────────────────────────────────────
  const tetkikler = hasta.goruntuleme_tetkik || [];
  const tetkikHtml = tetkikler.length ? `
    <div class="detay-section" style="margin-top:16px;">
      <div class="detay-section-title">🔬 Görüntüleme / Tetkik</div>
      <div class="detay-tablo">
        ${tetkikler.map(t => `
          <div class="detay-tablo-row">
            <span class="detay-tablo-tarih">${escHtml(t.tarih)}</span>
            <span>${escHtml(t.icerik)}</span>
          </div>`).join("")}
      </div>
    </div>` : "";

  // ── Genel Not ───────────────────────────────────────────────────────────
  const genelNot = hasta.genel_not ? `
    <div class="detay-section" style="margin-top:16px;">
      <div class="detay-section-title">📌 Genel Not</div>
      <div class="detay-alan full"><div class="detay-alan-value">${escHtml(hasta.genel_not)}</div></div>
    </div>` : "";

  document.getElementById("detayModalTitle").textContent = `Yatak ${hasta.yatak_no} — ${hasta.ad_soyad}`;
  document.getElementById("detayModalBody").innerHTML =
    temelHtml + klinikHtml + kulturHtml + kabulHtml + seyirHtml + islemHtml + tetkikHtml + genelNot;

  document.getElementById("detayModalFooter").innerHTML = `
    <button class="btn btn-danger" onclick="hastaSil(${hasta.id}); modalKapat('detayModal');" title="Sil">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
    <button class="btn btn-secondary" onclick="modalKapat('detayModal')">Kapat</button>
    <button class="btn btn-secondary" onclick="hastaDuzenleAc(${hasta.id}); modalKapat('detayModal');">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg> Düzenle
    </button>
    <button class="btn btn-primary" onclick="exportPdfTekHasta(${hasta.id})">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg> PDF İndir
    </button>`;

  modalAc("detayModal");
  setTimeout(() => { const log = document.getElementById("epikrizLog"); if (log) log.scrollTop = log.scrollHeight; }, 100);
}

// ── Kabul epikrizi düzenleme (detay modal içi)
function toggleKabulEdit() {
  const div = document.getElementById("kabulEditDiv");
  div.style.display = div.style.display === "none" ? "flex" : "none";
}

async function kabulEpikrizKaydet(hastaId) {
  const metin = document.getElementById("kabulEditInput")?.value?.trim();
  if (metin === undefined) return;
  try {
    await apiFetch(`/api/hastalar/${hastaId}/kabul_epikrizi`, {
      method: "PATCH",
      body: JSON.stringify({ not_metni: metin }),
    });
    toast("Kabul epikrizi güncellendi.", "success");
    await hastaListesiYukle();
    await hastaDetayAc(hastaId);
  } catch (_) {}
}

// ── Epikriz seyir notu ekleme
async function epikrizNotEkle(hastaId) {
  const input = document.getElementById("epikrizInput");
  const metin = input?.value?.trim();
  if (!metin) { toast("Not metni boş olamaz.", "error"); return; }
  try {
    await apiFetch(`/api/hastalar/${hastaId}/epikriz`, { method: "POST", body: JSON.stringify({ not_metni: metin }) });
    toast("Not eklendi.", "success");
    input.value = "";
    await hastaListesiYukle();
    await hastaDetayAc(hastaId);
  } catch (_) {}
}

function epikrizDuzenleAc(id, metin) {
  document.getElementById(`epikriz-metin-${id}`).style.display = 'none';
  document.getElementById(`epikriz-edit-${id}`).style.display = 'block';
  document.getElementById(`epikriz-edit-input-${id}`).value = metin;
}

function epikrizDuzenleKapat(id) {
  document.getElementById(`epikriz-metin-${id}`).style.display = 'block';
  document.getElementById(`epikriz-edit-${id}`).style.display = 'none';
}

async function epikrizNotGuncelle(id, hastaId) {
  const metin = document.getElementById(`epikriz-edit-input-${id}`)?.value?.trim();
  if (!metin) { toast("Not metni boş olamaz.", "error"); return; }
  try {
    await apiFetch(`/api/epikriz/${id}`, { method: "PUT", body: JSON.stringify({ not_metni: metin }) });
    toast("Not güncellendi.", "success");
    await hastaListesiYukle();
    await hastaDetayAc(hastaId);
  } catch (_) {}
}

async function epikrizNotSil(id, hastaId) {
  if (!confirm("Bu notu silmek istediğinize emin misiniz?")) return;
  try {
    await apiFetch(`/api/epikriz/${id}`, { method: "DELETE" });
    toast("Not silindi.", "success");
    await hastaListesiYukle();
    await hastaDetayAc(hastaId);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
// ── HASTA DURUM
// ════════════════════════════════════════════════════════════════════════════

async function hastaCikisAc(id) {
  const h = tumHastalar.find(x => x.id === id);
  if (!h) return;
  document.getElementById("cikisHastaId").value = id;
  document.getElementById("cikisModalTitle").textContent = `${h.ad_soyad} — Çıkış İşlemi`;
  document.getElementById("cikisForm").reset();
  cikisTuruDegisti();
  
  // Devir için ünite listesini doldur
  const sel = document.getElementById("cikisDevirUnite");
  sel.innerHTML = '<option value="">— Ünite seçin —</option>' + UNITE_LISTESI.map(u => `<option value="${u}">${u}</option>`).join("");
  document.getElementById("cikisDevirYatak").innerHTML = '<option value="">— Önce ünite seçin —</option>';
  
  modalAc("cikisModal");
}

function cikisTuruDegisti() {
  const tur = document.getElementById("cikisTuru").value;
  document.getElementById("cikisServisDiv").style.display = tur === "servis" ? "block" : "none";
  document.getElementById("cikisExitusDiv").style.display = tur === "exitus" ? "block" : "none";
  document.getElementById("cikisSevkDiv").style.display   = tur === "sevk"   ? "block" : "none";
  document.getElementById("cikisDevirDiv").style.display  = tur === "devir"  ? "block" : "none";
  
  if (tur === "exitus") {
    // şu anki zamanı yerel olarak input formatında ayarla
    const now = new Date();
    const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    document.getElementById("cikisExitusTarih").value = iso;
  }
}

function cikisServisDigerKontrol() {
  const secim = document.getElementById("cikisServisSecim").value;
  document.getElementById("cikisServisDigerDiv").style.display = secim === "Diger" ? "block" : "none";
}

async function cikisDevirUniteSecildi() {
  const u = document.getElementById("cikisDevirUnite").value;
  const sel = document.getElementById("cikisDevirYatak");
  if (!u) {
    sel.innerHTML = '<option value="">— Önce ünite seçin —</option>';
    return;
  }
  await fetchDoluYataklar(u);
  sel.innerHTML = '<option value="">— Yatak seçin —</option>';
  const kapasite = UNITE_KONFIG[u] || 7;
  for (let i = 1; i <= kapasite; i++) {
    const isDolu = doluYataklar.includes(i);
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = isDolu ? `${i} (Dolu)` : String(i);
    opt.disabled = isDolu;
    sel.appendChild(opt);
  }
}

async function cikisKaydet(e) {
  e.preventDefault();
  const id = document.getElementById("cikisHastaId").value;
  const tur = document.getElementById("cikisTuru").value;
  
  const req = { islem_turu: tur, detay: "" };
  
  if (tur === "servis") {
    const secim = document.getElementById("cikisServisSecim").value;
    req.detay = secim === "Diger" ? document.getElementById("cikisServisDiger").value.trim() : secim;
    if (!req.detay) { toast("Lütfen servis adını girin.", "error"); return; }
  } else if (tur === "exitus") {
    req.detay = document.getElementById("cikisExitusTarih").value.replace("T", " ");
  } else if (tur === "sevk") {
    req.detay = document.getElementById("cikisSevkKurum").value.trim();
    if (!req.detay) { toast("Lütfen kurum adını girin.", "error"); return; }
  } else if (tur === "devir") {
    req.yeni_unite = document.getElementById("cikisDevirUnite").value;
    req.yeni_yatak_no = document.getElementById("cikisDevirYatak").value;
    if (!req.yeni_unite || !req.yeni_yatak_no) { toast("Hedef ünite ve yatak seçin.", "error"); return; }
  } else if (tur === "taburcu") {
    // Ek detay yok
  } else {
    toast("Lütfen çıkış türünü seçin.", "error"); return;
  }
  
  try {
    await apiFetch(`/api/hastalar/${id}/cikis`, { method: "POST", body: JSON.stringify(req) });
    toast("İşlem başarılı.", "success");
    modalKapat("cikisModal");
    await hastaListesiYukle();
  } catch (_) {}
}

async function hastaAktifEt(id) {
  const h = tumHastalar.find(x => x.id === id);
  if (!h) return;
  try {
    await apiFetch(`/api/hastalar/${id}/durum?durum=aktif`, { method: "PATCH" });
    toast(`${h.ad_soyad} aktife alındı.`, "success");
    await hastaListesiYukle();
  } catch (_) {}
}

async function hastaSil(id) {
  const h = tumHastalar.find(x => x.id === id);
  if (!h || !confirm(`DİKKAT: ${h.ad_soyad} isimli hastanın kaydı KALICI olarak silinecektir.\n\nEmin misiniz?`)) return;
  try {
    await apiFetch(`/api/hastalar/${id}`, { method: "DELETE" });
    toast(`${h.ad_soyad} kaydı silindi.`, "success");
    await hastaListesiYukle();
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
// ── PDF EXPORT
// ════════════════════════════════════════════════════════════════════════════

async function exportPdf() {
  const btn = document.getElementById("btnExportPdf");
  btn.disabled = true; btn.textContent = "Hazırlanıyor…";
  toast("PDF hazırlanıyor (Chromium)…", "info", 12000);
  try {
    const token = localStorage.getItem("vizit_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API}/api/export/pdf?durum=aktif&unite=${encodeURIComponent(aktifUnite)}`, { headers });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "PDF hatası"); }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `vizit_${aktifUnite}_${bugunIso()}.pdf`;
    a.click(); URL.revokeObjectURL(url);
    toast("PDF indirildi.", "success");
  } catch (e) {
    toast("PDF hatası: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF İndir`;
  }
}

async function exportPdfTekHasta(id) {
  toast("PDF hazırlanıyor…", "info", 8000);
  try {
    const token = localStorage.getItem("vizit_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API}/api/export/pdf?hasta_ids=${id}`, { headers });
    if (!res.ok) throw new Error("PDF oluşturulamadı");
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `hasta_${id}_${bugunIso()}.pdf`;
    a.click(); URL.revokeObjectURL(url);
    toast("PDF indirildi.", "success");
  } catch (e) { toast("PDF hatası: " + e.message, "error"); }
}

// ════════════════════════════════════════════════════════════════════════════
// ── BAŞLAT
// ════════════════════════════════════════════════════════════════════════════

window.addEventListener("DOMContentLoaded", async () => {
  const isAuth = await oturumKontrol();
  if (isAuth) {
    await hastaListesiYukle();
    await fetchDoluYataklar(aktifUnite);
  }
  setInterval(async () => {
    if (localStorage.getItem("vizit_token")) {
      await hastaListesiYukle();
    }
  }, 60_000);
});
