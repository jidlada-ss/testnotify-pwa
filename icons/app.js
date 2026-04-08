/* ============================================================
   TestNotify PWA v1.1 — app.js
   + Timeline views: week / month / year
   + Full item edit with history log
   ============================================================ */

// ── DB ────────────────────────────────────────────────────────
const DB_NAME = 'testnotify-db';
const DB_VER  = 2;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('items')) {
        const s = d.createObjectStore('items', { keyPath: 'id' });
        s.createIndex('status', 'status');
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}
function dbGet(store, key) {
  return new Promise((res, rej) => { const r = db.transaction(store,'readonly').objectStore(store).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
function dbPut(store, value) {
  return new Promise((res, rej) => { const r = db.transaction(store,'readwrite').objectStore(store).put(value); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
function dbDelete(store, key) {
  return new Promise((res, rej) => { const r = db.transaction(store,'readwrite').objectStore(store).delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}
function dbGetAll(store) {
  return new Promise((res, rej) => { const r = db.transaction(store,'readonly').objectStore(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
function dbClear(store) {
  return new Promise((res, rej) => { const r = db.transaction(store,'readwrite').objectStore(store).clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}

// ── Helpers ───────────────────────────────────────────────────
const today    = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays  = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const diffDays = (a, b) => Math.round((new Date(a)-new Date(b))/86400000);
const isoDate  = d => new Date(d).toISOString().split('T')[0];

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_DAYS   = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return `${dt.getDate()} ${TH_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

function getNext(item)   { return addDays(new Date(item.last), item.freq); }
function getDays(item)   { return diffDays(getNext(item), today()); }
function getStatus(item) {
  const d = getDays(item);
  if (d < 0)  return 'overdue';
  if (d <= 7) return 'soon';
  return 'ok';
}
function getBadge(item) {
  const d = getDays(item), s = getStatus(item);
  if (s==='overdue') return `<span class="badge badge-danger">เกิน ${Math.abs(d)} วัน</span>`;
  if (s==='soon')    return `<span class="badge badge-warn">อีก ${d} วัน</span>`;
  return `<span class="badge badge-ok">อีก ${d} วัน</span>`;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── State ─────────────────────────────────────────────────────
let items = [];
let viewMode = 'list';
let calRef = new Date();   // reference date for calendar views

async function loadItems() {
  items = await dbGetAll('items');
  items.sort((a,b) => getDays(a)-getDays(b));
}
async function saveItem(item) {
  await dbPut('items', item);
  await loadItems();
  renderAll();
}

// ── Seed ──────────────────────────────────────────────────────
const SEED = [
  { id:'WP-001', name:'แผ่น Aluminum A1', test:'วัดสีชิ้นงาน (Color Measurement)', freq:90,
    last:addDays(today(),-82).toISOString(), expected:'ΔE < 2.0', note:'ตรวจก่อนส่งลูกค้า',
    checklist:['บันทึกค่า L*, a*, b*','เปรียบเทียบกับมาตรฐาน','ถ่ายรูปชิ้นงาน','อัปเดตเอกสาร QC'],
    checkDone:[], lastResult:'', history:[] },
  { id:'WP-002', name:'แผ่น Steel B2', test:'ทดสอบความแข็ง (Hardness Test)', freq:180,
    last:addDays(today(),-170).toISOString(), expected:'HRC 45-55', note:'',
    checklist:['ทดสอบ 5 จุดบนชิ้นงาน','บันทึกค่าเฉลี่ย','เปรียบเทียบค่ากับสเปค'],
    checkDone:[], lastResult:'', history:[] },
  { id:'WP-003', name:'ชิ้นส่วน Plastic C', test:'ตรวจสอบความหนา (Thickness Check)', freq:30,
    last:addDays(today(),-35).toISOString(), expected:'2.5 ± 0.1 mm', note:'ใช้ไมโครมิเตอร์',
    checklist:['วัด 3 ตำแหน่ง','บันทึกค่าสูงสุด/ต่ำสุด','อัปเดต Spec sheet'],
    checkDone:[], lastResult:'', history:[] },
  { id:'WP-004', name:'แผ่น Composite D', test:'วัดสีชิ้นงาน (Color Measurement)', freq:90,
    last:addDays(today(),-75).toISOString(), expected:'ΔE < 1.5', note:'',
    checklist:['บันทึกค่า L*, a*, b*','เปรียบเทียบกับมาตรฐาน','ถ่ายรูปชิ้นงาน'],
    checkDone:[], lastResult:'', history:[] },
  { id:'WP-005', name:'Rubber Seal E', test:'ทดสอบแรงดึง (Tensile Test)', freq:365,
    last:addDays(today(),-300).toISOString(), expected:'> 15 MPa', note:'ตรวจสอบทุกปี',
    checklist:['เตรียมตัวอย่างตามมาตรฐาน','บันทึก tensile strength','บันทึก elongation'],
    checkDone:[], lastResult:'', history:[] },
];
async function seedIfEmpty() {
  const ex = await dbGetAll('items');
  if (ex.length === 0) for (const it of SEED) await dbPut('items', it);
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('s-total').textContent   = items.length;
  const ov = items.filter(i=>getStatus(i)==='overdue');
  const so = items.filter(i=>getStatus(i)==='soon');
  document.getElementById('s-overdue').textContent = ov.length;
  document.getElementById('s-soon').textContent    = so.length;
  const badge = document.getElementById('badge-count');
  const cnt = ov.length + so.length;
  badge.style.display = cnt > 0 ? 'inline' : 'none';
  badge.textContent = cnt;
  const al = document.getElementById('alert-list');
  const alerts = [...ov, ...so];
  if (!alerts.length) { al.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div>ชิ้นงานทุกรายการปกติดี</div></div>'; return; }
  al.innerHTML = alerts.map(item=>`
    <div class="card" onclick="openModal('${item.id}')">
      <div class="row row-between mt4"><span class="fw5" style="font-size:14px">${item.name}</span>${getBadge(item)}</div>
      <div class="text-sm mt4">${item.id} · ${item.test}</div>
      <div class="text-sm mt4">กำหนดถัดไป: <strong>${fmtDate(getNext(item))}</strong></div>
    </div>`).join('');
}

// ── Schedule: List view ───────────────────────────────────────
function renderSchedule() {
  if (viewMode !== 'list') return;
  const q  = (document.getElementById('search-input')?.value||'').toLowerCase();
  const fs = document.getElementById('filter-sel')?.value||'';
  const list = items.filter(i=>{
    const m = i.name.toLowerCase().includes(q)||i.id.toLowerCase().includes(q);
    return m && (!fs||getStatus(i)===fs);
  });
  const sl = document.getElementById('schedule-list');
  if (!list.length) { sl.innerHTML='<div class="empty"><div class="empty-icon">🔍</div><div>ไม่พบชิ้นงาน</div></div>'; return; }
  sl.innerHTML = list.map(item=>{
    const d = getDays(item);
    const pct = Math.min(100,Math.max(0,Math.round((item.freq-Math.max(0,d))/item.freq*100)));
    const col = d<0?'var(--danger)':d<=7?'var(--warn)':'var(--ok)';
    return `<div class="card" onclick="openModal('${item.id}')">
      <div class="row row-between"><span class="fw5" style="font-size:14px">${item.name}</span>${getBadge(item)}</div>
      <div class="text-sm mt4">${item.id} · ${item.test}</div>
      <div class="timeline-bar"><div class="timeline-fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="row row-between text-sm"><span>ล่าสุด: ${fmtDate(item.last)}</span><span>ถัดไป: ${fmtDate(getNext(item))}</span></div>
    </div>`;
  }).join('');
}

// ── View mode switch ──────────────────────────────────────────
function setViewMode(mode, btn) {
  viewMode = mode;
  document.querySelectorAll('.pill-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const isCalendar = mode !== 'list';
  document.getElementById('list-controls').style.display = isCalendar ? 'none' : 'flex';
  document.getElementById('cal-nav').style.display       = isCalendar ? 'flex' : 'none';
  document.getElementById('summary-bar').style.display   = isCalendar ? 'flex' : 'none';
  document.getElementById('schedule-list').style.display = mode==='list' ? 'block' : 'none';
  document.getElementById('view-week').style.display     = mode==='week'  ? 'block' : 'none';
  document.getElementById('view-month').style.display    = mode==='month' ? 'block' : 'none';
  document.getElementById('view-year').style.display     = mode==='year'  ? 'block' : 'none';
  calRef = new Date();
  renderCurrentView();
}

function calPrev() {
  if (viewMode==='week')  calRef = addDays(calRef, -7);
  if (viewMode==='month') { calRef.setMonth(calRef.getMonth()-1); calRef = new Date(calRef); }
  if (viewMode==='year')  { calRef.setFullYear(calRef.getFullYear()-1); calRef = new Date(calRef); }
  renderCurrentView();
}
function calNext() {
  if (viewMode==='week')  calRef = addDays(calRef, 7);
  if (viewMode==='month') { calRef.setMonth(calRef.getMonth()+1); calRef = new Date(calRef); }
  if (viewMode==='year')  { calRef.setFullYear(calRef.getFullYear()+1); calRef = new Date(calRef); }
  renderCurrentView();
}

function renderCurrentView() {
  if (viewMode==='list')  { renderSchedule(); return; }
  if (viewMode==='week')  renderWeekView();
  if (viewMode==='month') renderMonthView();
  if (viewMode==='year')  renderYearView();
}

// Build a map of date→items for all upcoming tests (±2 years)
function buildDateMap() {
  const map = {};
  const todayStr = isoDate(today());
  items.forEach(item => {
    // Generate all test dates: past (from 2 years ago) to future (2 years)
    const startD = addDays(today(), -730);
    let d = new Date(item.last);
    // Walk backward to find first occurrence in range
    while (d > startD) d = addDays(d, -item.freq);
    d = addDays(d, item.freq);
    const endD = addDays(today(), 730);
    while (d <= endD) {
      const key = isoDate(d);
      if (!map[key]) map[key] = [];
      const isPast = key < todayStr;
      map[key].push({ item, isPast, dateStr: key });
      d = addDays(d, item.freq);
    }
  });
  return map;
}

// ── Week View ─────────────────────────────────────────────────
function renderWeekView() {
  // Find Monday of the current week
  const ref   = new Date(calRef);
  const dow   = ref.getDay(); // 0=Sun
  const mon   = addDays(ref, -(dow===0?6:dow-1));
  const days  = Array.from({length:7}, (_,i)=>addDays(mon,i));
  const map   = buildDateMap();
  const todayStr = isoDate(today());

  document.getElementById('cal-title').textContent =
    `${days[0].getDate()} ${TH_MONTHS[days[0].getMonth()]} – ${days[6].getDate()} ${TH_MONTHS[days[6].getMonth()]} ${days[6].getFullYear()}`;

  // Summary chips
  let wTotal=0, wOver=0, wSoon=0, wOk=0, wPast=0;
  days.forEach(d=>{
    const evs = map[isoDate(d)]||[];
    evs.forEach(e=>{
      if (e.isPast) wPast++;
      else { wTotal++; const s=getStatus(e.item); if(s==='overdue')wOver++; else if(s==='soon')wSoon++; else wOk++; }
    });
  });
  document.getElementById('summary-bar').innerHTML =
    `<span class="s-chip s-chip-total">รวม ${wTotal} รายการ</span>`+
    (wOver?`<span class="s-chip s-chip-danger">เกินกำหนด ${wOver}</span>`:'')+
    (wSoon?`<span class="s-chip s-chip-warn">ใกล้กำหนด ${wSoon}</span>`:'')+
    (wOk?`<span class="s-chip s-chip-ok">ปกติ ${wOk}</span>`:'')+
    (wPast?`<span class="s-chip s-chip-total">ผ่านไปแล้ว ${wPast}</span>`:'');

  const hdrs = days.map(d=>{
    const ds = isoDate(d), isToday = ds===todayStr;
    return `<div class="week-hdr${isToday?' today':''}">
      ${TH_DAYS[d.getDay()]}<div class="hdr-date">${d.getDate()}</div>
    </div>`;
  }).join('');

  const cells = days.map(d=>{
    const ds = isoDate(d);
    const evs = map[ds]||[];
    const evHtml = evs.map(e=>{
      const cls = e.isPast?'wev-past':getStatus(e.item)==='overdue'?'wev-danger':getStatus(e.item)==='soon'?'wev-warn':'wev-ok';
      return `<div class="week-event ${cls}" onclick="openModal('${e.item.id}')">${e.item.id}</div>`;
    }).join('');
    return `<div class="week-cell">${evHtml}</div>`;
  }).join('');

  document.getElementById('view-week').innerHTML =
    `<div class="week-grid">${hdrs}${cells}</div>`;
}

// ── Month View ────────────────────────────────────────────────
function renderMonthView() {
  const yr = calRef.getFullYear(), mo = calRef.getMonth();
  const map = buildDateMap();
  const todayStr = isoDate(today());

  document.getElementById('cal-title').textContent = `${TH_MONTHS[mo]} ${yr}`;

  // Count events in this month
  let mTotal=0, mOver=0, mSoon=0, mOk=0, mPast=0;
  const firstDay = new Date(yr, mo, 1);
  const lastDay  = new Date(yr, mo+1, 0);
  for (let d = new Date(firstDay); d <= lastDay; d = addDays(d,1)) {
    const evs = map[isoDate(d)]||[];
    evs.forEach(e=>{
      if(e.isPast) mPast++;
      else { mTotal++; const s=getStatus(e.item); if(s==='overdue')mOver++; else if(s==='soon')mSoon++; else mOk++; }
    });
  }
  document.getElementById('summary-bar').innerHTML =
    `<span class="s-chip s-chip-total">รวม ${mTotal} รายการ</span>`+
    (mOver?`<span class="s-chip s-chip-danger">เกินกำหนด ${mOver}</span>`:'')+
    (mSoon?`<span class="s-chip s-chip-warn">ใกล้กำหนด ${mSoon}</span>`:'')+
    (mOk?`<span class="s-chip s-chip-ok">ปกติ ${mOk}</span>`:'')+
    (mPast?`<span class="s-chip s-chip-total">ผ่านไปแล้ว ${mPast}</span>`:'');

  // Build grid
  const startDow = firstDay.getDay(); // 0=Sun
  const startOffset = startDow===0 ? 6 : startDow-1; // Mon=0
  const totalDays = lastDay.getDate();
  const cells = [];

  // Empty cells before month start
  for (let i=0; i<startOffset; i++) cells.push('<div class="month-day dim"><div class="day-num"></div></div>');

  for (let d=1; d<=totalDays; d++) {
    const dt  = new Date(yr,mo,d);
    const ds  = isoDate(dt);
    const isT = ds===todayStr;
    const evs = map[ds]||[];
    const dots = evs.map(e=>{
      const cls = e.isPast?'md-past':getStatus(e.item)==='overdue'?'md-danger':getStatus(e.item)==='soon'?'md-warn':'md-ok';
      return `<div class="month-dot ${cls}" title="${e.item.name}" onclick="openModal('${e.item.id}')"></div>`;
    }).join('');
    cells.push(`<div class="month-day${isT?' today-cell':''}"><div class="day-num">${d}</div>${dots}</div>`);
  }

  const lbls = ['จ','อ','พ','พฤ','ศ','ส','อา'].map(l=>`<div class="month-lbl">${l}</div>`).join('');
  document.getElementById('view-month').innerHTML =
    `<div class="month-labels">${lbls}</div><div class="month-grid">${cells.join('')}</div>`;
}

// ── Year View ─────────────────────────────────────────────────
function renderYearView() {
  const yr  = calRef.getFullYear();
  const map = buildDateMap();
  const todayMo = today().getMonth();
  const todayYr = today().getFullYear();

  document.getElementById('cal-title').textContent = `ปี ${yr}`;

  let yTotal=0, yOver=0, ySoon=0, yOk=0, yPast=0;
  const months = Array.from({length:12},(_,mo)=>{
    const evs = [];
    const days = new Date(yr,mo+1,0).getDate();
    for (let d=1; d<=days; d++) {
      const ds  = isoDate(new Date(yr,mo,d));
      (map[ds]||[]).forEach(e=>{
        evs.push(e);
        if(e.isPast) yPast++;
        else { yTotal++; const s=getStatus(e.item); if(s==='overdue')yOver++; else if(s==='soon')ySoon++; else yOk++; }
      });
    }
    return { mo, evs };
  });

  document.getElementById('summary-bar').innerHTML =
    `<span class="s-chip s-chip-total">รวม ${yTotal} รายการ</span>`+
    (yOver?`<span class="s-chip s-chip-danger">เกินกำหนด ${yOver}</span>`:'')+
    (ySoon?`<span class="s-chip s-chip-warn">ใกล้กำหนด ${ySoon}</span>`:'')+
    (yOk?`<span class="s-chip s-chip-ok">ปกติ ${yOk}</span>`:'')+
    (yPast?`<span class="s-chip s-chip-total">ผ่านไปแล้ว ${yPast}</span>`:'');

  const isCurYr = yr===todayYr;
  document.getElementById('view-year').innerHTML =
    `<div class="year-grid">${months.map(({mo,evs})=>{
      const isCur = isCurYr && mo===todayMo;
      const evRows = evs.slice(0,5).map(e=>{
        const cls = e.isPast?'md-past':getStatus(e.item)==='overdue'?'md-danger':getStatus(e.item)==='soon'?'md-warn':'md-ok';
        return `<div class="year-ev" onclick="openModal('${e.item.id}')"><div class="year-ev-dot" style="background:var(--${e.isPast?'text3':cls==='md-danger'?'danger':cls==='md-warn'?'warn':'ok'})"></div><div class="year-ev-label">${e.item.name}</div></div>`;
      }).join('');
      const more = evs.length>5?`<div style="font-size:10px;color:var(--text3);margin-top:2px">+${evs.length-5} รายการ</div>`:'';
      const empty = !evs.length?`<div style="font-size:10px;color:var(--text3)">ไม่มีการทดสอบ</div>`:'';
      return `<div class="year-month"><div class="year-month-name${isCur?' cur':''}">${TH_MONTHS[mo]}</div>${evRows||empty}${more}</div>`;
    }).join('')}</div>`;
}

// ── Notification preview ──────────────────────────────────────
function renderNotifPreview() {
  const alerts = items.filter(i=>getDays(i)<=7);
  const c = document.getElementById('phone-notifs-container');
  if (!c) return;
  if (!alerts.length) { c.innerHTML='<div class="text-sm" style="text-align:center;padding:12px">ไม่มีการแจ้งเตือนในขณะนี้</div>'; return; }
  c.innerHTML = alerts.map(item=>{
    const d = getDays(item);
    const msg = d<0?`เกินกำหนด ${Math.abs(d)} วัน`:d===0?'ถึงกำหนดวันนี้':`อีก ${d} วัน`;
    const cls = d<0?'danger':d<=3?'warn':'';
    return `<div class="notif-card ${cls}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span class="notif-app">TestNotify</span><span class="notif-time">08:00</span></div>
      <div class="notif-title">📋 ${item.id} — ${item.name}</div>
      <div class="notif-body">${item.test} · ${msg}</div>
    </div>`;
  }).join('');
}

function renderAll() {
  renderDashboard();
  renderCurrentView();
  renderNotifPreview();
}

// ── Page nav ──────────────────────────────────────────────────
function switchPage(name, btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  (btn||document.getElementById(`nav-${name}`)).classList.add('active');
  renderAll();
}

// ── Add Item ──────────────────────────────────────────────────
function toggleCustom() {
  document.getElementById('custom-days-row').style.display =
    document.getElementById('f-freq').value==='custom' ? 'block' : 'none';
}

async function addItem() {
  const name = document.getElementById('f-name').value.trim();
  const id   = document.getElementById('f-id').value.trim();
  const test = document.getElementById('f-test').value;
  const fv   = document.getElementById('f-freq').value;
  const freq = fv==='custom' ? parseInt(document.getElementById('f-custom-days').value) : parseInt(fv);
  const last = document.getElementById('f-last').value;
  const exp  = document.getElementById('f-expected').value.trim();
  const note = document.getElementById('f-note').value.trim();
  const ckRaw= document.getElementById('f-checklist').value;
  const cl   = ckRaw ? ckRaw.split(',').map(s=>s.trim()).filter(Boolean) : ['บันทึกผลการทดสอบ','เปรียบเทียบกับมาตรฐาน','อัปเดตเอกสาร'];
  if (!name||!id||!last||isNaN(freq)) { showToast('⚠️ กรุณากรอกข้อมูลที่จำเป็น'); return; }
  if (await dbGet('items',id)) { showToast('⚠️ เลขที่ชิ้นงานนี้มีอยู่แล้ว'); return; }
  await saveItem({ id, name, test, freq, last:new Date(last).toISOString(), expected:exp||'-', note, checklist:cl, checkDone:[], lastResult:'', history:[] });
  ['f-name','f-id','f-expected','f-note','f-checklist'].forEach(f=>{ document.getElementById(f).value=''; });
  showToast('✅ เพิ่มชิ้นงานเรียบร้อย');
  switchPage('schedule', document.getElementById('nav-schedule'));
}

// ── Modal ─────────────────────────────────────────────────────
function handleModalClick(e) {
  if (e.target===document.getElementById('detail-modal')) closeModal();
}
function closeModal() { document.getElementById('detail-modal').classList.remove('open'); }

async function openModal(id) {
  const item = items.find(i=>i.id===id);
  if (!item) return;

  const checkHtml = item.checklist.map((c,i)=>{
    const done = (item.checkDone||[]).includes(i);
    return `<div class="check-item ${done?'done':''}" id="ck-row-${i}">
      <input type="checkbox" id="ck-${i}" ${done?'checked':''} onchange="toggleCheck('${id}',${i},this.checked)">
      <label for="ck-${i}">${c}</label>
    </div>`;
  }).join('');

  const histHtml = (item.history||[]).length
    ? [...item.history].reverse().map(h=>`
      <div class="hist-item">
        <div class="hist-dot"></div>
        <div class="hist-content">
          <div class="hist-date">${fmtDate(h.date)}</div>
          <div class="hist-result">${h.result||'ไม่ได้บันทึกผล'}</div>
        </div>
      </div>`).join('')
    : '<div class="text-sm" style="padding:8px 0;text-align:center">ยังไม่มีประวัติการทดสอบ</div>';

  // Edit form html (pre-filled)
  const freqOpts = [
    {v:30,l:'ทุก 1 เดือน'},{v:90,l:'ทุก 3 เดือน'},{v:180,l:'ทุก 6 เดือน'},{v:365,l:'ทุก 1 ปี'}
  ];
  const stdFreqs = freqOpts.map(o=>o.v);
  const isCustom = !stdFreqs.includes(item.freq);
  const freqSelHtml = freqOpts.map(o=>`<option value="${o.v}" ${item.freq===o.v&&!isCustom?'selected':''}>${o.l}</option>`).join('')+
    `<option value="custom" ${isCustom?'selected':''}>กำหนดเอง</option>`;
  const testOpts = ['วัดสีชิ้นงาน (Color Measurement)','ทดสอบความแข็ง (Hardness Test)','ตรวจสอบความหนา (Thickness Check)','ทดสอบแรงดึง (Tensile Test)','ตรวจสอบพื้นผิว (Surface Inspection)','อื่นๆ'];
  const testSelHtml = testOpts.map(o=>`<option ${item.test===o?'selected':''}>${o}</option>`).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="row-between" style="margin-bottom:12px">
      <div><div style="font-size:16px;font-weight:600">${item.name}</div><div class="text-sm">${item.id}</div></div>
      ${getBadge(item)}
    </div>

    <div class="m-tabs">
      <button class="m-tab active" onclick="switchMTab(0,this)">รายละเอียด</button>
      <button class="m-tab" onclick="switchMTab(1,this)">แก้ไขข้อมูล</button>
      <button class="m-tab" onclick="switchMTab(2,this)">ประวัติ</button>
    </div>

    <!-- Tab 0: Detail + Record result -->
    <div class="m-panel active" id="mp-0">
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;margin-bottom:14px">
        <div class="grid2" style="gap:8px">
          <div><div class="text-sm">หัวข้อทดสอบ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.test}</div></div>
          <div><div class="text-sm">ผลลัพธ์ที่คาดหวัง</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.expected}</div></div>
          <div><div class="text-sm">ทดสอบล่าสุด</div><div style="font-size:13px;font-weight:500;margin-top:2px">${fmtDate(item.last)}</div></div>
          <div><div class="text-sm">กำหนดถัดไป</div><div style="font-size:13px;font-weight:500;margin-top:2px">${fmtDate(getNext(item))}</div></div>
          <div><div class="text-sm">ความถี่</div><div style="font-size:13px;font-weight:500;margin-top:2px">ทุก ${item.freq} วัน</div></div>
          ${item.note?`<div><div class="text-sm">หมายเหตุ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.note}</div></div>`:''}
        </div>
      </div>
      ${item.lastResult?`<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;font-size:13px"><span class="text-sm">ผลล่าสุด: </span>${item.lastResult}</div>`:''}

      <div style="font-size:13px;font-weight:600;margin-bottom:8px">✅ Checklist หลังทดสอบ</div>
      <div style="border:0.5px solid var(--border);border-radius:var(--radius-sm);padding:6px 12px;margin-bottom:14px">${checkHtml}</div>

      <div style="font-size:13px;font-weight:600;margin-bottom:8px">📝 บันทึกผลการทดสอบ</div>
      <div class="grid2" style="margin-bottom:8px">
        <input class="form-control" type="text" id="res-val" placeholder="ผลลัพธ์ที่ได้" value="${item.lastResult||''}">
        <input class="form-control" type="date" id="res-date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="completeTest('${id}')">บันทึกและตั้งกำหนดถัดไป</button>
        <button class="btn btn-danger" onclick="deleteItem('${id}')">ลบชิ้นงาน</button>
      </div>
    </div>

    <!-- Tab 1: Edit -->
    <div class="m-panel" id="mp-1">
      <div class="form-group"><label class="form-label">ชื่อชิ้นงาน *</label>
        <input class="form-control" type="text" id="e-name" value="${item.name}">
      </div>
      <div class="form-group"><label class="form-label">เลขที่ชิ้นงาน</label>
        <input class="form-control" type="text" value="${item.id}" disabled style="opacity:0.5">
        <div class="text-sm mt4">ไม่สามารถเปลี่ยนเลขที่ได้</div>
      </div>
      <div class="form-group"><label class="form-label">หัวข้อการทดสอบ</label>
        <select class="form-control" id="e-test">${testSelHtml}</select>
      </div>
      <div class="grid2">
        <div class="form-group"><label class="form-label">ความถี่</label>
          <select class="form-control" id="e-freq" onchange="toggleEditCustom()">
            ${freqSelHtml}
          </select>
        </div>
        <div class="form-group" id="e-custom-row" style="display:${isCustom?'block':'none'}">
          <label class="form-label">จำนวนวัน</label>
          <input class="form-control" type="number" id="e-custom-days" value="${isCustom?item.freq:''}" min="1">
        </div>
      </div>
      <div class="grid2">
        <div class="form-group"><label class="form-label">วันทดสอบล่าสุด</label>
          <input class="form-control" type="date" id="e-last" value="${isoDate(item.last)}">
        </div>
        <div class="form-group"><label class="form-label">ผลลัพธ์ที่คาดหวัง</label>
          <input class="form-control" type="text" id="e-expected" value="${item.expected}">
        </div>
      </div>
      <div class="form-group"><label class="form-label">Checklist (คั่นด้วย ,)</label>
        <input class="form-control" type="text" id="e-checklist" value="${(item.checklist||[]).join(', ')}">
      </div>
      <div class="form-group"><label class="form-label">หมายเหตุ</label>
        <input class="form-control" type="text" id="e-note" value="${item.note||''}">
      </div>
      <button class="btn btn-primary btn-full" onclick="saveEdit('${id}')">บันทึกการแก้ไข</button>
    </div>

    <!-- Tab 2: History -->
    <div class="m-panel" id="mp-2">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">ประวัติการทดสอบ (${(item.history||[]).length} ครั้ง)</div>
      ${histHtml}
    </div>
  `;

  document.getElementById('detail-modal').classList.add('open');
}

function switchMTab(idx, btn) {
  document.querySelectorAll('.m-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.m-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`mp-${idx}`).classList.add('active');
}

function toggleEditCustom() {
  const v = document.getElementById('e-freq').value;
  document.getElementById('e-custom-row').style.display = v==='custom' ? 'block' : 'none';
}

// ── Save Edit ─────────────────────────────────────────────────
async function saveEdit(id) {
  const name = document.getElementById('e-name').value.trim();
  const test = document.getElementById('e-test').value;
  const fv   = document.getElementById('e-freq').value;
  const freq = fv==='custom' ? parseInt(document.getElementById('e-custom-days').value) : parseInt(fv);
  const last = document.getElementById('e-last').value;
  const exp  = document.getElementById('e-expected').value.trim();
  const note = document.getElementById('e-note').value.trim();
  const ckRaw= document.getElementById('e-checklist').value;
  const cl   = ckRaw ? ckRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
  if (!name||!last||isNaN(freq)) { showToast('⚠️ กรุณากรอกข้อมูลที่จำเป็น'); return; }
  const item = await dbGet('items', id);
  Object.assign(item, { name, test, freq, last:new Date(last).toISOString(), expected:exp||'-', note, checklist:cl });
  await saveItem(item);
  closeModal();
  showToast('✅ แก้ไขข้อมูลเรียบร้อย');
}

// ── Check / Complete / Delete ─────────────────────────────────
async function toggleCheck(id, idx, val) {
  const item = await dbGet('items', id);
  item.checkDone = item.checkDone||[];
  if (val) { if (!item.checkDone.includes(idx)) item.checkDone.push(idx); }
  else     { item.checkDone = item.checkDone.filter(i=>i!==idx); }
  await dbPut('items', item);
  const row = document.getElementById(`ck-row-${idx}`);
  if (row) row.className = `check-item ${val?'done':''}`;
}

async function completeTest(id) {
  const rv = document.getElementById('res-val').value.trim();
  const rd = document.getElementById('res-date').value;
  if (!rd) { showToast('⚠️ กรุณาระบุวันที่ทดสอบ'); return; }
  const item = await dbGet('items', id);
  // Save to history
  if (!item.history) item.history = [];
  item.history.push({ date: new Date(rd).toISOString(), result: rv });
  item.last       = new Date(rd).toISOString();
  item.lastResult = rv;
  item.checkDone  = [];
  await saveItem(item);
  closeModal();
  showToast(`✅ บันทึกแล้ว! ครั้งถัดไป: ${fmtDate(getNext(item))}`);
  scheduleNotifications();
}

async function deleteItem(id) {
  if (!confirm('ต้องการลบชิ้นงานนี้?')) return;
  await dbDelete('items', id);
  await loadItems();
  closeModal();
  renderAll();
  showToast('🗑 ลบชิ้นงานเรียบร้อย');
}

// ── Notifications ─────────────────────────────────────────────
async function toggleNotification() {
  if (!('Notification' in window)) { showToast('เบราว์เซอร์ไม่รองรับ'); return; }
  if (Notification.permission==='granted') { showToast('การแจ้งเตือนเปิดอยู่แล้ว ✓'); return; }
  const perm = await Notification.requestPermission();
  const btn  = document.getElementById('notif-btn');
  if (perm==='granted') {
    btn.textContent = '🔔 แจ้งเตือนเปิดอยู่'; btn.classList.add('active');
    showToast('✅ เปิดการแจ้งเตือนสำเร็จ');
    scheduleNotifications();
  } else { showToast('❌ ไม่ได้รับอนุญาต'); }
}
function checkNotifStatus() {
  if ('Notification' in window && Notification.permission==='granted') {
    const btn = document.getElementById('notif-btn');
    btn.textContent='🔔 แจ้งเตือนเปิดอยู่'; btn.classList.add('active');
  }
}
function scheduleNotifications() {
  if (!('Notification' in window)||Notification.permission!=='granted') return;
  items.filter(i=>getDays(i)<=7).forEach(item=>{
    const d = getDays(item);
    const msg = d<0?`เกินกำหนด ${Math.abs(d)} วัน`:d===0?'ถึงกำหนดวันนี้!':`อีก ${d} วัน`;
    new Notification(`TestNotify — ${item.id}`,{
      body:`${item.name}\n${item.test} · ${msg}`,
      icon:'icons/icon-192.png', tag:item.id
    });
  });
}

// ── Export Excel ──────────────────────────────────────────────
function exportExcel() {
  if (typeof XLSX==='undefined') { showToast('⚠️ กำลังโหลด library...'); return; }
  const rows = items.map(item=>({
    'เลขที่':item.id,'ชื่อชิ้นงาน':item.name,'หัวข้อทดสอบ':item.test,
    'ความถี่ (วัน)':item.freq,'ทดสอบล่าสุด':fmtDate(item.last),
    'กำหนดถัดไป':fmtDate(getNext(item)),'ผลลัพธ์ที่คาดหวัง':item.expected,
    'ผลล่าสุด':item.lastResult||'-',
    'สถานะ':getStatus(item)==='overdue'?`เกิน ${Math.abs(getDays(item))} วัน`:getStatus(item)==='soon'?`อีก ${getDays(item)} วัน`:'ปกติ',
    'ประวัติ (ครั้ง)':(item.history||[]).length,'หมายเหตุ':item.note||''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:10},{wch:22},{wch:30},{wch:14},{wch:16},{wch:16},{wch:18},{wch:16},{wch:16},{wch:14},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws, 'ตารางทดสอบ');

  // History sheet
  const histRows = [];
  items.forEach(item=>(item.history||[]).forEach(h=>histRows.push({
    'เลขที่':item.id,'ชื่อชิ้นงาน':item.name,'วันที่ทดสอบ':fmtDate(h.date),'ผลลัพธ์':h.result||'-'
  })));
  if (histRows.length) {
    const ws2 = XLSX.utils.json_to_sheet(histRows);
    ws2['!cols']=[{wch:10},{wch:22},{wch:16},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws2, 'ประวัติการทดสอบ');
  }

  const now = new Date();
  const sumData=[['รายงาน','ระบบแจ้งเตือนการทดสอบ'],['วันที่สร้าง',now.toLocaleDateString('th-TH')],
    ['ชิ้นงานทั้งหมด',items.length],['เกินกำหนด',items.filter(i=>getStatus(i)==='overdue').length],
    ['ใกล้ถึงกำหนด (7 วัน)',items.filter(i=>getStatus(i)==='soon').length],
    ['ปกติ',items.filter(i=>getStatus(i)==='ok').length]];
  const ws3=XLSX.utils.aoa_to_sheet(sumData); ws3['!cols']=[{wch:26},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws3, 'สรุป');
  XLSX.writeFile(wb, `TestNotify_Report_${now.toISOString().split('T')[0]}.xlsx`);
  showToast('📊 ดาวน์โหลด Excel เรียบร้อย');
}

// ── Export PDF ────────────────────────────────────────────────
function exportPDF() {
  const now = new Date().toLocaleDateString('th-TH',{day:'2-digit',month:'long',year:'numeric'});
  const rows = items.map(item=>{
    const s=getStatus(item),d=getDays(item);
    const st=s==='overdue'?`เกิน ${Math.abs(d)} วัน`:s==='soon'?`อีก ${d} วัน`:'ปกติ';
    const clr=s==='overdue'?'#A32D2D':s==='soon'?'#854F0B':'#3B6D11';
    const bg=s==='overdue'?'#FCEBEB':s==='soon'?'#FAEEDA':'#EAF3DE';
    return `<tr><td>${item.id}</td><td>${item.name}</td><td>${item.test}</td><td>${fmtDate(item.last)}</td><td>${fmtDate(getNext(item))}</td><td>${item.expected}</td><td style="background:${bg};color:${clr};font-weight:600;text-align:center">${st}</td><td style="text-align:center">${(item.history||[]).length}</td></tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>TestNotify Report</title>
  <style>body{font-family:-apple-system,sans-serif;margin:32px;color:#1a1a2e}h1{font-size:20px;margin-bottom:4px}.sub{font-size:13px;color:#666;margin-bottom:20px}.stats{display:flex;gap:16px;margin-bottom:20px}.stat{background:#f5f5f7;padding:12px 20px;border-radius:8px;text-align:center}.stat-n{font-size:24px;font-weight:700}.stat-l{font-size:11px;color:#666}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#7F77DD;color:#fff;padding:8px 10px;text-align:left;font-weight:500}td{padding:7px 10px;border-bottom:1px solid #eee}tr:nth-child(even){background:#fafafa}@media print{body{margin:16px}}</style></head><body>
  <h1>รายงานตารางทดสอบชิ้นงาน</h1>
  <div class="sub">สร้างเมื่อ: ${now} · ชิ้นงาน ${items.length} รายการ</div>
  <div class="stats">
    <div class="stat"><div class="stat-n" style="color:#7F77DD">${items.length}</div><div class="stat-l">ทั้งหมด</div></div>
    <div class="stat"><div class="stat-n" style="color:#E24B4A">${items.filter(i=>getStatus(i)==='overdue').length}</div><div class="stat-l">เกินกำหนด</div></div>
    <div class="stat"><div class="stat-n" style="color:#EF9F27">${items.filter(i=>getStatus(i)==='soon').length}</div><div class="stat-l">ใกล้กำหนด</div></div>
    <div class="stat"><div class="stat-n" style="color:#639922">${items.filter(i=>getStatus(i)==='ok').length}</div><div class="stat-l">ปกติ</div></div>
  </div>
  <table><thead><tr><th>เลขที่</th><th>ชื่อชิ้นงาน</th><th>หัวข้อทดสอบ</th><th>ทดสอบล่าสุด</th><th>กำหนดถัดไป</th><th>ผลที่คาดหวัง</th><th>สถานะ</th><th>ประวัติ</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  const blob=new Blob([html],{type:'text/html'});
  const win=window.open(URL.createObjectURL(blob),'_blank');
  if (win) win.onload=()=>win.print();
  showToast('📄 เปิดหน้า PDF พร้อมพิมพ์');
}

function exportJSON() {
  const data=JSON.stringify({version:2,exported:new Date().toISOString(),items},null,2);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download=`testnotify_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('💾 บันทึก Backup เรียบร้อย');
}
async function clearAllData() {
  if (!confirm('⚠️ ต้องการลบข้อมูลทั้งหมด?')) return;
  await dbClear('items'); await loadItems(); renderAll();
  showToast('🗑 ลบข้อมูลทั้งหมดแล้ว');
}

// ── Init ──────────────────────────────────────────────────────
document.getElementById('f-last').value = new Date().toISOString().split('T')[0];

openDB()
  .then(()=>seedIfEmpty())
  .then(()=>loadItems())
  .then(()=>{
    renderAll();
    checkNotifStatus();
    if ('Notification' in window && Notification.permission==='granted') scheduleNotifications();
  })
  .catch(err=>console.error('DB Error:',err));
