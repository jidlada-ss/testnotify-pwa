/* ============================================================
   TestNotify PWA v1.7 — app.js
   v1.7: editable startDate in edit tab
   ============================================================ */

// ── DB ────────────────────────────────────────────────────────
const DB_NAME = 'testnotify-db';
const DB_VER  = 3;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('items'))
        d.createObjectStore('items', { keyPath: 'id' }).createIndex('status','status');
      if (!d.objectStoreNames.contains('settings'))
        d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}
const _tx   = (s,m)=> db.transaction(s,m).objectStore(s);
const dbGet = (s,k)=> new Promise((r,j)=>{ const q=_tx(s,'readonly').get(k); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const dbPut = (s,v)=> new Promise((r,j)=>{ const q=_tx(s,'readwrite').put(v); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const dbDel = (s,k)=> new Promise((r,j)=>{ const q=_tx(s,'readwrite').delete(k); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
const dbAll = (s)  => new Promise((r,j)=>{ const q=_tx(s,'readonly').getAll(); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const dbClr = (s)  => new Promise((r,j)=>{ const q=_tx(s,'readwrite').clear(); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });

// ── Helpers ───────────────────────────────────────────────────
const today    = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const addDays  = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const diffDays = (a,b) => Math.round((new Date(a)-new Date(b))/86400000);
const isoDate  = d => new Date(d).toISOString().split('T')[0];

const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_D = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return `${dt.getDate()} ${TH_M[dt.getMonth()]} ${dt.getFullYear()}`;
}

// ── Thai Public Holidays (วันหยุดนักขัตฤกษ์) ─────────────────
// Format: 'MM-DD' (ปีใดก็ได้) หรือ 'YYYY-MM-DD' (ปีเฉพาะ)
const THAI_HOLIDAYS_FIXED = [
  '01-01', // วันขึ้นปีใหม่
  '04-06', // วันจักรี
  '04-13', // วันสงกรานต์
  '04-14', // วันสงกรานต์
  '04-15', // วันสงกรานต์
  '05-01', // วันแรงงาน
  '05-05', // วันฉัตรมงคล
  '06-03', // วันเฉลิมพระชนมพรรษา พระราชินี
  '07-28', // วันเฉลิมพระชนมพรรษา ร.10
  '08-12', // วันแม่แห่งชาติ
  '10-13', // วันคล้ายวันสวรรคต ร.9
  '10-23', // วันปิยมหาราช
  '12-05', // วันพ่อแห่งชาติ
  '12-10', // วันรัฐธรรมนูญ
  '12-31', // วันสิ้นปี
];
// วันหยุดที่เปลี่ยนทุกปี (lunar-based) — ใส่เพิ่มได้
const THAI_HOLIDAYS_SPECIFIC = [
  '2025-05-12','2025-06-02', // วันวิสาขบูชา 2568, วันเฉลิม
  '2026-05-01','2026-05-06',
];

function isHoliday(date) {
  const d = new Date(date);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const iso = isoDate(d);
  if (THAI_HOLIDAYS_FIXED.includes(`${mm}-${dd}`)) return true;
  if (THAI_HOLIDAYS_SPECIFIC.includes(iso)) return true;
  return false;
}

function isWeekend(date) {
  const day = new Date(date).getDay();
  return day === 0 || day === 6; // 0=Sun, 6=Sat
}

// เลื่อนวันที่ทดสอบไปวันทำการถัดไปถ้าตรงกับเสาร์/อาทิตย์/หยุดนักขัตฤกษ์
function skipToWorkday(date) {
  let d = new Date(date);
  let tries = 0;
  while ((isWeekend(d) || isHoliday(d)) && tries < 14) {
    d = addDays(d, 1);
    tries++;
  }
  return d;
}


// item.freqs = array of freq specs:
//   { type:'days', value:90 }
//   { type:'monthly-day', value:15 }   ← every 15th of month

// ── Frequency helpers (v1.5: count from startDate) ────────────
// item.freqs = sorted array of freq specs, e.g.
//   [{ type:'days', value:30 }, { type:'days', value:90 }, { type:'days', value:180 }]
// Each spec fires once (from startDate). After it passes it is pruned.
// item.startDate = วันเริ่มต้นโครงการ (ใช้ item.last เป็น fallback)

function getStartDate(item) {
  return new Date(item.startDate || item.last);
}

function getNextFromSpec(fromDate, spec) {
  const d = new Date(fromDate);
  if (spec.type === 'days') return addDays(d, spec.value);
  if (spec.type === 'monthly-day') {
    const target = spec.value;
    let next = new Date(d); next.setDate(target);
    if (next <= d) next.setMonth(next.getMonth()+1, target);
    return next;
  }
  return addDays(d, 90);
}

// คำนวณวันถัดไปทั้งหมดจาก startDate (ยังไม่ผ่านไป)
function getAllNextDates(item) {
  const start = getStartDate(item);
  const freqs  = item.freqs && item.freqs.length ? item.freqs : [{ type:'days', value: item.freq||90 }];
  return freqs.map(spec => ({
    spec,
    raw:  getNextFromSpec(start, spec),
    date: skipToWorkday(getNextFromSpec(start, spec)),
  })).sort((a,b) => a.date - b.date);
}

// วันถัดไปที่ใกล้ที่สุด (ยังอยู่ในอนาคต หรือ overdue)
function getNextEntry(item) {
  const all = getAllNextDates(item);
  // Return the earliest one (first in sorted list) — ยังไม่ prune ในหน่วยความจำ
  return all[0] || null;
}

function getNext(item) {
  const e = getNextEntry(item);
  return e ? e.date : addDays(today(), 999);
}

function getActiveSpec(item) {
  const e = getNextEntry(item);
  return e ? e.spec : (item.freqs?.[0] || { type:'days', value:90 });
}

// ตรวจว่าโครงการสิ้นสุดแล้วหรือยัง
// โครงการถือว่า "เสร็จสิ้น" ต่อเมื่อ:
//   1. ผ่านวันสิ้นสุด (endDate) แล้ว  AND
//   2. ไม่มี freq ใดที่รอบันทึกอยู่ (freqs ทั้งหมดถูก prune แล้ว หรือ history มีครบ)
// → ถ้ายังมี freq ค้างอยู่ ให้แจ้งเตือนต่อ แม้ endDate ผ่านไปแล้ว
function isProjectDone(item) {
  if (!item.endDate) return false;
  const endPassed = today() >= new Date(item.endDate);
  if (!endPassed) return false;
  // ตรวจว่า freq ที่เหลือทั้งหมดถูก record ใน history แล้ว
  // วิธีง่ายที่สุด: ดูว่า history มีรายการที่ผ่านวัน endDate หรือ freq ทุกตัวถูก prune แล้ว
  const start = getStartDate(item);
  const freqs = item.freqs && item.freqs.length ? item.freqs : [];
  // ถ้า freqs ว่างเปล่า (prune หมดแล้ว) → เสร็จสิ้น
  if (freqs.length === 0) return true;
  // ถ้า freqs ยังมีอยู่ แต่ทุกตัวได้รับการบันทึก (due date ผ่านแล้วและมี history รองรับ)
  const recordedDates = (item.history||[]).map(h => isoDate(h.date));
  const allRecorded = freqs.every(spec => {
    const due = skipToWorkday(getNextFromSpec(start, spec));
    // ถ้า due ผ่านมาแล้ว แต่ไม่มี history ที่ตรงหรือหลัง due → ยังไม่เสร็จ
    const hasRecord = (item.history||[]).some(h => new Date(h.date) >= due);
    return !hasRecord ? false : true; // ถ้าไม่มี record หลัง due = ยังค้างอยู่
  });
  return allRecorded;
}

function getDays(item) {
  if (isProjectDone(item)) return 999; // stop showing as upcoming
  return diffDays(getNext(item), today());
}

function getStatus(item) {
  if (isProjectDone(item)) return 'done';
  const d = getDays(item);
  if (d < 0)  return 'overdue';
  if (d <= 7) return 'soon';
  return 'ok';
}

function getBadge(item) {
  const s = getStatus(item);
  if (s === 'done')    return `<span class="badge bo">✅ 100% เสร็จสิ้น</span>`;
  const d = getDays(item);
  if (s === 'overdue') return `<span class="badge bd">เกิน ${Math.abs(d)} วัน</span>`;
  if (s === 'soon')    return `<span class="badge bw">อีก ${d} วัน</span>`;
  return `<span class="badge bo">อีก ${d} วัน</span>`;
}

// Prune freqs ที่ผ่าน startDate + value ไปแล้ว (เรียกตอน completeTest)
function prunePassedFreqs(item) {
  if (!item.freqs || item.freqs.length <= 1) return item;
  const start = getStartDate(item);
  const remaining = item.freqs.filter(spec => {
    const due = getNextFromSpec(start, spec);
    return due > today(); // เก็บเฉพาะที่ยังไม่ถึง
  });
  item.freqs = remaining.length ? remaining : [item.freqs[item.freqs.length - 1]]; // เก็บอย่างน้อย 1
  return item;
}

// End-date progress (นับจาก startDate)
function getEndDateProgress(item) {
  if (!item.endDate) return null;
  const start   = getStartDate(item);
  const end     = new Date(item.endDate);
  const now     = today();
  const total   = diffDays(end, start);
  if (total <= 0) return null;
  const elapsed   = diffDays(now, start);
  const pct       = Math.min(100, Math.max(0, Math.round(elapsed / total * 100)));
  const remaining = diffDays(end, now);
  const endPassed = now >= end;          // วันผ่านแล้ว
  const isDone    = isProjectDone(item); // ผ่านแล้ว AND บันทึกครบ
  const isPending = endPassed && !isDone; // ผ่านวันแล้ว แต่ยังไม่บันทึกครบ
  return { pct, remaining, end, total, elapsed, isDone, isPending, endPassed };
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2600);
}

// ── Freq label ────────────────────────────────────────────────
function specLabel(spec) {
  if (!spec) return '-';
  if (spec.type === 'days') {
    if (spec.value === 30)  return 'ครบ 1 เดือน';
    if (spec.value === 90)  return 'ครบ 3 เดือน';
    if (spec.value === 180) return 'ครบ 6 เดือน';
    if (spec.value === 365) return 'ครบ 1 ปี';
    return `ครบ ${spec.value} วัน`;
  }
  if (spec.type === 'monthly-day') return `ทุกวันที่ ${spec.value} ของเดือน`;
  return '-';
}

function freqsLabel(item) {
  if (!item.freqs || !item.freqs.length) return specLabel({type:'days',value:item.freq||90});
  return item.freqs.map(specLabel).join(' → ');
}

// แสดงกำหนดการทั้งหมดที่ยังเหลืออยู่ (นับจาก startDate)
function freqsScheduleHtml(item) {
  if (!item.freqs || !item.freqs.length) return '';
  const start = getStartDate(item);
  const lines = item.freqs.map(spec => {
    const raw   = getNextFromSpec(start, spec);
    const date  = skipToWorkday(raw);
    const d     = diffDays(date, today());
    const isPast = d < 0;
    const cls   = isPast ? 'color:var(--text3);text-decoration:line-through' : d<=7 ? 'color:var(--warn);font-weight:500' : 'color:var(--text2)';
    const tag   = isPast ? '✓ ผ่านแล้ว' : d===0 ? '🔴 วันนี้' : d<=7 ? `🟡 อีก ${d} วัน` : `🟢 อีก ${d} วัน`;
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:.5px solid var(--border);${cls}">
      <span>${specLabel(spec)}</span>
      <span>${fmtDate(date)} &nbsp;${tag}</span>
    </div>`;
  }).join('');
  return `<div style="border:.5px solid var(--border);border-radius:var(--rs);padding:4px 12px;margin-top:6px;font-size:12px">${lines}</div>`;
}

// ── Test topics ───────────────────────────────────────────────
const DEFAULT_TOPICS = [
  'วัดสีชิ้นงาน (Color Measurement)',
  'ทดสอบความแข็ง (Hardness Test)',
  'ตรวจสอบความหนา (Thickness Check)',
  'ทดสอบแรงดึง (Tensile Test)',
  'ตรวจสอบพื้นผิว (Surface Inspection)',
  'อื่นๆ',
];
let testTopics = [...DEFAULT_TOPICS];

async function loadTopics() {
  const s = await dbGet('settings','testTopics');
  if (s) testTopics = s.value;
}
async function saveTopics() {
  await dbPut('settings', { key:'testTopics', value:testTopics });
  populateTopicDropdowns();
}

function populateTopicDropdowns() {
  ['f-test','e-test'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = testTopics.map(t=>`<option${t===cur?' selected':''}>${t}</option>`).join('');
  });
}

function renderTopicList(containerId, inputId, addFn) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = testTopics.map((t,i)=>`
    <div class="topic-item">
      <span class="topic-name">${t}</span>
      <button class="topic-del" onclick="deleteTopic(${i},'${containerId}','${inputId}','${addFn}')" title="ลบ">×</button>
    </div>`).join('') || '<div class="tsm" style="padding:8px 0;text-align:center">ยังไม่มีหัวข้อ</div>';
}

async function deleteTopic(idx, containerId, inputId, addFn) {
  if (testTopics.length <= 1) { showToast('⚠️ ต้องมีอย่างน้อย 1 หัวข้อ'); return; }
  testTopics.splice(idx, 1);
  await saveTopics();
  renderTopicList(containerId, inputId, addFn);
}

function openTopicMgr() {
  renderTopicList('topic-list-modal','new-topic-modal','addTopicModal');
  document.getElementById('topic-modal').classList.add('open');
}
function closeTopic() { document.getElementById('topic-modal').classList.remove('open'); }

async function addTopicModal() {
  const inp = document.getElementById('new-topic-modal');
  const v = inp.value.trim();
  if (!v) return;
  if (testTopics.includes(v)) { showToast('⚠️ หัวข้อนี้มีอยู่แล้ว'); return; }
  testTopics.push(v); inp.value = '';
  await saveTopics();
  renderTopicList('topic-list-modal','new-topic-modal','addTopicModal');
  showToast('✅ เพิ่มหัวข้อแล้ว');
}
async function addTopicInline() {
  const inp = document.getElementById('new-topic-inline');
  const v = inp.value.trim();
  if (!v) return;
  if (testTopics.includes(v)) { showToast('⚠️ หัวข้อนี้มีอยู่แล้ว'); return; }
  testTopics.push(v); inp.value = '';
  await saveTopics();
  renderTopicList('topic-list-inline','new-topic-inline','addTopicInline');
  showToast('✅ เพิ่มหัวข้อแล้ว');
}

// ── Freq chip toggle ──────────────────────────────────────────
function toggleFreqChip(el) {
  const v = el.dataset.v;
  el.classList.toggle('sel');
  document.getElementById('f-custom-days-row').style.display =
    document.querySelector('.fchip[data-v="custom-days"].sel') ? 'block' : 'none';
  document.getElementById('f-monthly-day-row').style.display =
    document.querySelector('.fchip[data-v="monthly-day"].sel') ? 'block' : 'none';
}

// Collect selected freqs from add form
function collectFreqsFromForm() {
  const specs = [];
  document.querySelectorAll('#f-freq-chips .fchip.sel').forEach(chip => {
    const v = chip.dataset.v;
    if (v === 'custom-days') {
      const d = parseInt(document.getElementById('f-custom-days').value);
      if (d > 0) specs.push({ type:'days', value:d });
    } else if (v === 'monthly-day') {
      const day = parseInt(document.getElementById('f-monthly-day').value);
      if (day >= 1 && day <= 28) specs.push({ type:'monthly-day', value:day });
    } else {
      specs.push({ type:'days', value:parseInt(v) });
    }
  });
  return specs;
}

// ── State ─────────────────────────────────────────────────────
let items   = [];
let viewMode = 'list';
let calRef  = new Date();

async function loadItems() {
  items = await dbAll('items');
  items.sort((a,b) => getDays(a)-getDays(b));
}
async function saveItem(item) {
  await dbPut('items', item);
  await loadItems();
  renderAll();
}

// ── Seed ──────────────────────────────────────────────────────
const SEED = [
  { id:'WP-001', name:'แผ่น Aluminum A1', test:'วัดสีชิ้นงาน (Color Measurement)',
    freqs:[{type:'days',value:30},{type:'days',value:90},{type:'days',value:180},{type:'days',value:365}],
    freq:90, startDate:addDays(today(),-82).toISOString(), last:addDays(today(),-82).toISOString(),
    endDate:addDays(today(),280).toISOString(),
    expected:'ΔE < 2.0', note:'ตรวจก่อนส่งลูกค้า', desc:'แผ่นอลูมิเนียมชุบสี ชุดที่ 1',
    checklist:['บันทึกค่า L*, a*, b*','เปรียบเทียบมาตรฐาน','ถ่ายรูปชิ้นงาน','อัปเดต QC'],
    checkDone:[], lastResult:'', history:[], planAdj:null },
  { id:'WP-002', name:'แผ่น Steel B2', test:'ทดสอบความแข็ง (Hardness Test)',
    freqs:[{type:'days',value:180}], freq:180,
    startDate:addDays(today(),-170).toISOString(), last:addDays(today(),-170).toISOString(),
    endDate:null, expected:'HRC 45-55', note:'', desc:'',
    checklist:['ทดสอบ 5 จุด','บันทึกค่าเฉลี่ย','เปรียบเทียบสเปค'],
    checkDone:[], lastResult:'', history:[], planAdj:null },
  { id:'WP-003', name:'ชิ้นส่วน Plastic C', test:'ตรวจสอบความหนา (Thickness Check)',
    freqs:[{type:'monthly-day',value:1}], freq:30,
    startDate:addDays(today(),-35).toISOString(), last:addDays(today(),-35).toISOString(),
    endDate:addDays(today(),90).toISOString(),
    expected:'2.5 ± 0.1 mm', note:'ใช้ไมโครมิเตอร์', desc:'',
    checklist:['วัด 3 ตำแหน่ง','บันทึกสูงสุด/ต่ำสุด','อัปเดต Spec'],
    checkDone:[], lastResult:'', history:[], planAdj:null },
  { id:'WP-004', name:'แผ่น Composite D', test:'วัดสีชิ้นงาน (Color Measurement)',
    freqs:[{type:'days',value:90}], freq:90,
    startDate:addDays(today(),-75).toISOString(), last:addDays(today(),-75).toISOString(),
    endDate:null, expected:'ΔE < 1.5', note:'', desc:'',
    checklist:['บันทึกค่า L*, a*, b*','เปรียบเทียบมาตรฐาน','ถ่ายรูปชิ้นงาน'],
    checkDone:[], lastResult:'', history:[], planAdj:null },
  { id:'WP-005', name:'Rubber Seal E', test:'ทดสอบแรงดึง (Tensile Test)',
    freqs:[{type:'days',value:365}], freq:365,
    startDate:addDays(today(),-300).toISOString(), last:addDays(today(),-300).toISOString(),
    endDate:null, expected:'> 15 MPa', note:'ตรวจสอบทุกปี', desc:'',
    checklist:['เตรียมตัวอย่าง','บันทึก tensile strength','บันทึก elongation'],
    checkDone:[], lastResult:'', history:[], planAdj:null },
];

async function seedIfEmpty() {
  const ex = await dbAll('items');
  if (!ex.length) for (const it of SEED) await dbPut('items', it);
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const ov   = items.filter(i=>getStatus(i)==='overdue');
  const so   = items.filter(i=>getStatus(i)==='soon');
  const done = items.filter(i=>getStatus(i)==='done');
  document.getElementById('s-total').textContent   = items.length;
  document.getElementById('s-overdue').textContent = ov.length;
  document.getElementById('s-soon').textContent    = so.length;
  const cnt = ov.length + so.length;
  const badge = document.getElementById('badge-count');
  badge.style.display = cnt ? 'inline' : 'none';
  badge.textContent = cnt;
  const al = document.getElementById('alert-list');
  const actionItems = [...ov, ...so];
  if (!actionItems.length) {
    const doneMsg = done.length ? `<div class="tsm mt8" style="text-align:center">✅ ${done.length} โครงการเสร็จสิ้นแล้ว</div>` : '';
    al.innerHTML = `<div class="empty"><div class="ei">✅</div><div>ชิ้นงานทุกรายการปกติดี</div>${doneMsg}</div>`; return;
  }
  al.innerHTML = actionItems.map(item=>`
    <div class="card" onclick="openModal('${item.id}')">
      <div class="row rb mt4"><span class="fw5" style="font-size:14px">${item.name}</span>${getBadge(item)}</div>
      <div class="tsm mt4">${item.id ? item.id+' · ':'' }${item.test}</div>
      <div class="tsm mt4">กำหนดถัดไป: <strong>${fmtDate(getNext(item))}</strong></div>
    </div>`).join('');
}

// ── Schedule List ─────────────────────────────────────────────
function renderSchedule() {
  if (viewMode !== 'list') return;
  const q  = (document.getElementById('search-input')?.value||'').toLowerCase();
  const fs = document.getElementById('filter-sel')?.value||'';
  const list = items.filter(i=>{
    const m = i.name.toLowerCase().includes(q)||i.id.toLowerCase().includes(q);
    return m && (!fs||getStatus(i)===fs);
  });
  const sl = document.getElementById('schedule-list');
  if (!list.length) { sl.innerHTML='<div class="empty"><div class="ei">🔍</div><div>ไม่พบชิ้นงาน</div></div>'; return; }
  sl.innerHTML = list.map(item => {
    const s   = getStatus(item);
    const d   = getDays(item);
    const ep  = getEndDateProgress(item);
    const done = s === 'done';

    // Progress bar: % ของ freq แรกที่ยังไม่ผ่าน
    let pct = 0;
    if (!done) {
      const entry = getNextEntry(item);
      if (entry) {
        const daysTotal = entry.spec.type==='days' ? entry.spec.value : 30;
        pct = Math.min(100, Math.max(0, Math.round((daysTotal - Math.max(0,d)) / daysTotal * 100)));
      }
    } else { pct = 100; }
    const col = done ? 'var(--ok)' : d<0 ? 'var(--danger)' : d<=7 ? 'var(--warn)' : 'var(--ok)';
    const hasAdj = item.planAdj && today() >= new Date(item.planAdj.fromDate);
    const adjBadge = hasAdj ? `<span class="badge bi" style="font-size:10px">แผนปรับ</span>` : '';

    let endBlock = '';
    if (ep) {
      let remTxt;
      let efCol;
      if (ep.isDone) {
        remTxt = `<span style="color:var(--ok);font-weight:500">✅ โครงการเสร็จสิ้น</span>`;
        efCol  = 'var(--ok)';
      } else if (ep.isPending) {
        remTxt = `<span style="color:var(--warn);font-weight:500">⚠️ เลยกำหนด — รอบันทึกผล</span>`;
        efCol  = 'var(--warn)';
      } else if (ep.remaining < 0) {
        remTxt = `<span style="color:var(--danger)">เกินกำหนด ${Math.abs(ep.remaining)} วัน</span>`;
        efCol  = 'var(--danger)';
      } else {
        remTxt = `เหลือ ${ep.remaining} วัน`;
        efCol  = ep.pct > 90 ? 'var(--danger)' : ep.pct > 70 ? 'var(--warn)' : 'var(--ok)';
      }
      endBlock = `<div class="enddate-wrap">
        <div class="enddate-label"><span>ความคืบหน้า ${ep.pct}%</span><span>${remTxt}</span></div>
        <div class="ep"><div class="ef" style="width:${ep.pct}%;background:${efCol}"></div></div>
      </div>`;
    }

    const startStr = item.startDate ? fmtDate(item.startDate) : fmtDate(item.last);
    const nextStr  = done ? '—' : fmtDate(getNext(item));

    return `<div class="card" onclick="openModal('${item.id}')">
      <div class="row rb"><span class="fw5" style="font-size:14px">${item.name}</span><div class="row">${adjBadge}${getBadge(item)}</div></div>
      <div class="tsm mt4">${item.id ? item.id+' · ' : ''}${item.test}</div>
      ${item.desc ? `<div class="tsm mt4" style="color:var(--text3)">${item.desc}</div>` : ''}
      <div class="tsm mt4" style="color:var(--text3)">กำหนด: ${freqsLabel(item)}</div>
      <div class="pb"><div class="pf" style="width:${pct}%;background:${col}"></div></div>
      <div class="row rb tsm"><span>เริ่ม: ${startStr}</span><span>${done ? '✅ สิ้นสุดแล้ว' : 'ถัดไป: '+nextStr}</span></div>
      ${endBlock}
    </div>`;
  }).join('');
}

// ── Calendar views (unchanged structure, same as v1.1) ─────────
function setVM(mode, btn) {
  viewMode = mode;
  document.querySelectorAll('.pb2').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const isCal = mode!=='list';
  document.getElementById('list-ctrl').style.display   = isCal?'none':'flex';
  document.getElementById('cal-nav').style.display     = isCal?'flex':'none';
  document.getElementById('sbar').style.display        = isCal?'flex':'none';
  document.getElementById('schedule-list').style.display = mode==='list'?'block':'none';
  ['week','month','year'].forEach(v=>document.getElementById(`view-${v}`).style.display=v===mode?'block':'none');
  calRef = new Date();
  renderCV();
}
function calPrev() {
  if (viewMode==='week')  calRef = addDays(calRef,-7);
  if (viewMode==='month') { calRef.setMonth(calRef.getMonth()-1); calRef=new Date(calRef); }
  if (viewMode==='year')  { calRef.setFullYear(calRef.getFullYear()-1); calRef=new Date(calRef); }
  renderCV();
}
function calNext() {
  if (viewMode==='week')  calRef = addDays(calRef,7);
  if (viewMode==='month') { calRef.setMonth(calRef.getMonth()+1); calRef=new Date(calRef); }
  if (viewMode==='year')  { calRef.setFullYear(calRef.getFullYear()+1); calRef=new Date(calRef); }
  renderCV();
}
function renderCV() {
  if (viewMode==='list')  { renderSchedule(); return; }
  if (viewMode==='week')  renderWeek();
  if (viewMode==='month') renderMonth();
  if (viewMode==='year')  renderYear();
}

function buildDateMap() {
  const map = {}, ts = isoDate(today());
  items.forEach(item => {
    const end = addDays(today(),730), start = addDays(today(),-730);
    let d = new Date(item.last);
    const spec = getActiveSpec(item);
    while (d > start) d = spec.type==='days' ? addDays(d,-spec.value) : addDays(d,-30);
    d = spec.type==='days' ? addDays(d,spec.value) : getNextFromSpec(d, spec);
    while (d <= end) {
      const k = isoDate(d);
      if (!map[k]) map[k] = [];
      map[k].push({ item, isPast: k<ts });
      d = getNextFromSpec(d, spec);
    }
  });
  return map;
}

function summaryChips(evGroups) {
  let tot=0,ov=0,so=0,ok=0,past=0;
  evGroups.flat().forEach(e=>{
    if(e.isPast){past++;}else{tot++;const s=getStatus(e.item);if(s==='overdue')ov++;else if(s==='soon')so++;else ok++;}
  });
  return `<span class="sc sc-t">รวม ${tot}</span>`+
    (ov?`<span class="sc sc-d">เกินกำหนด ${ov}</span>`:'')+
    (so?`<span class="sc sc-w">ใกล้กำหนด ${so}</span>`:'')+
    (ok?`<span class="sc sc-o">ปกติ ${ok}</span>`:'')+
    (past?`<span class="sc sc-t">ผ่านไปแล้ว ${past}</span>`:'');
}

function renderWeek() {
  const dow = calRef.getDay(), mon = addDays(calRef,-(dow===0?6:dow-1));
  const days = Array.from({length:7},(_,i)=>addDays(mon,i));
  const map = buildDateMap(), ts = isoDate(today());
  document.getElementById('cal-title').textContent =
    `${days[0].getDate()} ${TH_M[days[0].getMonth()]} – ${days[6].getDate()} ${TH_M[days[6].getMonth()]}`;
  document.getElementById('sbar').innerHTML = summaryChips(days.map(d=>map[isoDate(d)]||[]));
  const hdrs = days.map(d=>{const isT=isoDate(d)===ts;return`<div class="wh${isT?' td':''}">${TH_D[d.getDay()]}<div class="hd">${d.getDate()}</div></div>`;}).join('');
  const cells = days.map(d=>{
    const evs=map[isoDate(d)]||[];
    return`<div class="wc">${evs.map(e=>{
      const c=e.isPast?'wp':getStatus(e.item)==='overdue'?'wd':getStatus(e.item)==='soon'?'ww':'wok';
      return`<div class="we ${c}" onclick="openModal('${e.item.id}')">${e.item.id}</div>`;
    }).join('')}</div>`;
  }).join('');
  document.getElementById('view-week').innerHTML = `<div class="wg">${hdrs}${cells}</div>`;
}

function renderMonth() {
  const yr=calRef.getFullYear(), mo=calRef.getMonth(), map=buildDateMap(), ts=isoDate(today());
  document.getElementById('cal-title').textContent = `${TH_M[mo]} ${yr}`;
  const first=new Date(yr,mo,1), last=new Date(yr,mo+1,0);
  const allEvs=[];
  for(let d=new Date(first);d<=last;d=addDays(d,1)) allEvs.push(...(map[isoDate(d)]||[]));
  document.getElementById('sbar').innerHTML = summaryChips([allEvs]);
  const off=(first.getDay()===0?6:first.getDay()-1);
  const cells=[];
  for(let i=0;i<off;i++) cells.push('<div class="md dim"><div class="dn"></div></div>');
  for(let i=1;i<=last.getDate();i++){
    const ds=isoDate(new Date(yr,mo,i)), isT=ds===ts;
    const evs=map[ds]||[];
    const dots=evs.map(e=>{const c=e.isPast?'bp':getStatus(e.item)==='overdue'?'bd':getStatus(e.item)==='soon'?'bw':'bo';return`<div class="dot" style="background:${c==='bd'?'var(--danger)':c==='bw'?'var(--warn)':c==='bo'?'var(--ok)':'var(--text3)'}" onclick="event.stopPropagation();openModal('${e.item.id}')"></div>`;}).join('');
    cells.push(`<div class="md${isT?' tc':''}"><div class="dn">${i}</div>${dots}</div>`);
  }
  const lbls=['จ','อ','พ','พฤ','ศ','ส','อา'].map(l=>`<div class="mll">${l}</div>`).join('');
  document.getElementById('view-month').innerHTML=`<div class="ml">${lbls}</div><div class="mg">${cells.join('')}</div>`;
}

function renderYear() {
  const yr=calRef.getFullYear(), map=buildDateMap(), tm=today().getMonth(), ty=today().getFullYear();
  document.getElementById('cal-title').textContent=`ปี ${yr}`;
  const allEvs=[];
  const months=Array.from({length:12},(_,mo)=>{
    const evs=[], days=new Date(yr,mo+1,0).getDate();
    for(let d=1;d<=days;d++){ const e=map[isoDate(new Date(yr,mo,d))]||[]; evs.push(...e); allEvs.push(...e); }
    return{mo,evs};
  });
  document.getElementById('sbar').innerHTML=summaryChips([allEvs]);
  document.getElementById('view-year').innerHTML=`<div class="yg">${months.map(({mo,evs})=>{
    const isCur=yr===ty&&mo===tm;
    const rows=evs.slice(0,4).map(e=>{
      const c=e.isPast?'var(--text3)':getStatus(e.item)==='overdue'?'var(--danger)':getStatus(e.item)==='soon'?'var(--warn)':'var(--ok)';
      return`<div class="ye" onclick="openModal('${e.item.id}')"><div class="yed" style="background:${c}"></div><div class="yel">${e.item.name}</div></div>`;
    }).join('');
    const more=evs.length>4?`<div style="font-size:10px;color:var(--text3)">+${evs.length-4} รายการ</div>`:'';
    return`<div class="ym"><div class="ymn${isCur?' cur':''}">${TH_M[mo]}</div>${rows||'<div style="font-size:10px;color:var(--text3)">ไม่มีการทดสอบ</div>'}${more}</div>`;
  }).join('')}</div>`;
}

// ── Notif preview ─────────────────────────────────────────────
function renderNotifPreview() {
  const alerts = items.filter(i => {
    if (isProjectDone(i)) return false;
    const ep = getEndDateProgress(i);
    if (ep && ep.isPending) return true;
    return getDays(i) <= 7;
  });
  const c = document.getElementById('phone-notifs-container');
  if (!c) return;
  c.innerHTML = !alerts.length
    ? '<div class="tsm" style="text-align:center;padding:12px">ไม่มีการแจ้งเตือนในขณะนี้</div>'
    : alerts.map(item=>{
        const ep = getEndDateProgress(item);
        const d  = getDays(item);
        let msg, cls;
        if (ep && ep.isPending) {
          msg = 'เลยวันสิ้นสุดโครงการ — รอบันทึกผล';
          cls = 'warn';
        } else {
          msg = d<0?`เกินกำหนด ${Math.abs(d)} วัน`:d===0?'ถึงกำหนดวันนี้':`อีก ${d} วัน`;
          cls = d<0?' danger':d<=3?' warn':'';
        }
        return`<div class="nc${cls}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="font-size:11px;color:var(--text3);font-weight:500">TestNotify</span>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">08:00</span>
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:2px">📋 ${item.id||''} ${item.name}</div>
          <div style="font-size:12px;color:var(--text2)">${item.test} · ${msg}</div>
        </div>`;
      }).join('');
}

function renderAll() {
  renderDashboard();
  renderCV();
  renderNotifPreview();
  renderTopicList('topic-list-inline','new-topic-inline','addTopicInline');
}

// ── Page nav ──────────────────────────────────────────────────
function switchPage(name, btn) {
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  (btn||document.getElementById(`nav-${name}`)).classList.add('active');
  if (name==='settings') renderTopicList('topic-list-inline','new-topic-inline','addTopicInline');
  renderAll();
}

// ── Add Item ──────────────────────────────────────────────────
async function addItem() {
  const name    = document.getElementById('f-name').value.trim();
  let   id      = document.getElementById('f-id').value.trim();
  const desc    = document.getElementById('f-desc').value.trim();
  const test    = document.getElementById('f-test').value;
  const freqs   = collectFreqsFromForm();
  const last    = document.getElementById('f-last').value;
  const endDate = document.getElementById('f-enddate').value;
  const exp     = document.getElementById('f-expected').value.trim();
  const note    = document.getElementById('f-note').value.trim();
  const ckRaw   = document.getElementById('f-checklist').value;
  const cl      = ckRaw ? ckRaw.split(',').map(s=>s.trim()).filter(Boolean) : ['บันทึกผล','เปรียบเทียบ','อัปเดตเอกสาร'];
  if (!name||!last) { showToast('⚠️ กรอกชื่อชิ้นงานและวันเริ่มต้น'); return; }
  if (!freqs.length) { showToast('⚠️ เลือกความถี่อย่างน้อย 1 รายการ'); return; }
  // Auto-generate ID if blank
  if (!id) id = 'WP-' + Date.now().toString().slice(-6);
  if (await dbGet('items',id)) { showToast('⚠️ เลขที่นี้มีอยู่แล้ว กรุณาใช้เลขที่อื่น'); return; }
  await saveItem({
    id, name, desc, test, freqs, freq:freqs[0].value||90,
    startDate: new Date(last).toISOString(),   // ✅ บันทึก startDate
    last: new Date(last).toISOString(),
    endDate: endDate ? new Date(endDate).toISOString() : null,
    expected:exp||'-', note, checklist:cl, checkDone:[], lastResult:'', history:[], planAdj:null
  });
  ['f-name','f-id','f-desc','f-expected','f-note','f-checklist'].forEach(f=>{ const el=document.getElementById(f); if(el) el.value=''; });
  document.getElementById('f-enddate').value = '';
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
  const checkHtml = item.checklist.map((c,i)=>`
    <div class="ci ${(item.checkDone||[]).includes(i)?'done':''}" id="ck-row-${i}">
      <input type="checkbox" id="ck-${i}" ${(item.checkDone||[]).includes(i)?'checked':''} onchange="toggleCheck('${id}',${i},this.checked)">
      <label for="ck-${i}">${c}</label>
    </div>`).join('');

  const histHtml = (item.history||[]).length
    ? [...item.history].reverse().map(h=>`
      <div class="hi"><div class="hidc"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${fmtDate(h.date)}</div>
          <div style="font-size:12px;color:var(--text2)">${h.result||'ไม่ได้บันทึกผล'}</div>
          ${h.freqBefore?`<div style="font-size:11px;color:var(--text3)">ความถี่: ${h.freqBefore}</div>`:''}
        </div>
      </div>`).join('')
    : '<div class="tsm" style="padding:8px 0;text-align:center">ยังไม่มีประวัติ</div>';

  // Edit form
  const freqOpts = [{v:30,l:'ครบ 1 เดือน'},{v:90,l:'ครบ 3 เดือน'},{v:180,l:'ครบ 6 เดือน'},{v:365,l:'ครบ 1 ปี'}];
  const editFreqChips = freqOpts.map(o=>{
    const sel = (item.freqs||[]).some(f=>f.type==='days'&&f.value===o.v);
    return`<div class="fchip${sel?' sel':''}" data-v="${o.v}" onclick="this.classList.toggle('sel')">${o.l}</div>`;
  });
  const hasCustomDays = (item.freqs||[]).some(f=>f.type==='days'&&![30,90,180,365].includes(f.value));
  const customDaysVal = hasCustomDays ? (item.freqs.find(f=>f.type==='days'&&![30,90,180,365].includes(f.value))||{}).value||'' : '';
  editFreqChips.push(`<div class="fchip${hasCustomDays?' sel':''}" data-v="custom-days" onclick="this.classList.toggle('sel');document.getElementById('e-custom-days-row').style.display=this.classList.contains('sel')?'block':'none'">กำหนดวัน</div>`);
  const hasMonthly = (item.freqs||[]).some(f=>f.type==='monthly-day');
  const monthlyVal = hasMonthly ? (item.freqs.find(f=>f.type==='monthly-day')||{}).value||'' : '';
  editFreqChips.push(`<div class="fchip${hasMonthly?' sel':''}" data-v="monthly-day" onclick="this.classList.toggle('sel');document.getElementById('e-monthly-row').style.display=this.classList.contains('sel')?'block':'none'">ทุกวันที่...</div>`);

  const ep = getEndDateProgress(item);
  const epBlock = ep ? (() => {
    if (ep.isDone) {
      return `<div style="background:#EAF3DE;border-radius:var(--rs);padding:12px;margin-bottom:12px;text-align:center">
        <div style="font-size:18px;margin-bottom:4px">🎉</div>
        <div style="font-size:14px;font-weight:600;color:#3B6D11">โครงการเสร็จสิ้น 100%</div>
        <div style="font-size:12px;color:#639922;margin-top:2px">สิ้นสุด: ${fmtDate(item.endDate)} · ระยะเวลา ${ep.total} วัน</div>
      </div>`;
    }
    if (ep.isPending) {
      return `<div style="background:#FAEEDA;border:.5px solid var(--warn);border-radius:var(--rs);padding:12px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:600;color:#854F0B;margin-bottom:4px">⚠️ เลยวันสิ้นสุดโครงการแล้ว — ยังรอบันทึกผล</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#854F0B;margin-bottom:4px">
          <span>ความคืบหน้า ${ep.pct}%</span><span>สิ้นสุด: ${fmtDate(item.endDate)}</span>
        </div>
        <div class="ep"><div class="ef" style="width:${ep.pct}%;background:var(--warn)"></div></div>
        <div style="font-size:11px;color:#854F0B;margin-top:6px">กรุณาบันทึกผลการทดสอบเพื่อปิดโครงการ</div>
      </div>`;
    }
    const remTxt = ep.remaining < 0
      ? `เกินกำหนด ${Math.abs(ep.remaining)} วัน`
      : `เหลือ ${ep.remaining} วัน`;
    const efCol = ep.pct > 90 ? 'var(--danger)' : ep.pct > 70 ? 'var(--warn)' : 'var(--ok)';
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:4px">
        <span>ความคืบหน้าโครงการ ${ep.pct}%</span><span>${remTxt}</span>
      </div>
      <div class="ep"><div class="ef" style="width:${ep.pct}%;background:${efCol}"></div></div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">สิ้นสุด: ${fmtDate(item.endDate)}</div>
    </div>`;
  })() : '';

  // Plan adjustment section
  const activeAdj = item.planAdj && today() >= new Date(item.planAdj.fromDate);
  const adjBanner = item.planAdj
    ? `<div class="plan-banner${activeAdj?' has-plan':''}">
        <div class="plan-label">${activeAdj?'📌 แผนที่ปรับแล้ว':'⏳ แผนที่จะปรับ'} — ${specLabel(item.planAdj.spec)}</div>
        <div style="font-size:12px;color:var(--text2)">มีผลตั้งแต่: ${fmtDate(item.planAdj.fromDate)}</div>
        <button class="btn btn-xs btn-d" style="margin-top:6px" onclick="cancelPlanAdj('${id}')">ยกเลิกการปรับแผน</button>
      </div>` : '';

  const testSelHtml = testTopics.map(t=>`<option${item.test===t?' selected':''}>${t}</option>`).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="row rb" style="margin-bottom:4px">
      <div><div style="font-size:16px;font-weight:600">${item.name}</div><div class="tsm">${item.id}</div></div>
      ${getBadge(item)}
    </div>
    ${item.desc ? `<div class="tsm" style="margin-bottom:10px;color:var(--text2)">${item.desc}</div>` : ''}
    ${epBlock}
    <div class="mtabs">
      <button class="mttab active" onclick="swTab(0,this)">รายละเอียด</button>
      <button class="mttab" onclick="swTab(1,this)">แก้ไข</button>
      <button class="mttab" onclick="swTab(2,this)">ปรับแผน</button>
      <button class="mttab" onclick="swTab(3,this)">ประวัติ</button>
    </div>

    <!-- Tab 0: Detail -->
    <div class="mpanel active" id="mp-0">
      <div style="background:var(--surface2);border-radius:var(--rs);padding:12px;margin-bottom:14px">
        <div class="g2" style="gap:8px">
          <div><div class="tsm">หัวข้อทดสอบ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.test}</div></div>
          <div><div class="tsm">ผลลัพธ์ที่คาดหวัง</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.expected}</div></div>
          <div><div class="tsm">วันเริ่มทดสอบ</div><div style="font-size:13px;font-weight:500;margin-top:2px;color:var(--primary)">${fmtDate(getStartDate(item))}</div></div>
          <div>
            <div class="tsm">กำหนดถัดไป</div>
            ${isProjectDone(item)
              ? `<div style="font-size:13px;font-weight:500;margin-top:2px;color:var(--ok)">— โครงการเสร็จสิ้น</div>`
              : `<div style="font-size:13px;font-weight:500;margin-top:2px">${fmtDate(getNext(item))}</div>
                 ${(()=>{ const raw=getNextFromSpec(getStartDate(item),getActiveSpec(item)); const sk=skipToWorkday(raw); return diffDays(sk,raw)>0?`<div style="font-size:10px;color:var(--warn);margin-top:1px">⟳ เลื่อนจากวันหยุด (${fmtDate(raw)})</div>`:'' })()}`
            }
          </div>
          ${item.endDate?`<div><div class="tsm">สิ้นสุดโครงการ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${fmtDate(item.endDate)}</div></div>`:''}
          ${item.note?`<div><div class="tsm">หมายเหตุ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.note}</div></div>`:''}
        </div>
      </div>

      <div style="font-size:13px;font-weight:600;margin-bottom:4px">📅 กำหนดการทดสอบทั้งหมด</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">นับจากวันเริ่มทดสอบ: ${fmtDate(getStartDate(item))}</div>
      ${freqsScheduleHtml(item)}

      ${adjBanner}
      ${item.lastResult?`<div style="background:var(--surface2);border-radius:var(--rs);padding:10px 12px;margin:12px 0;font-size:13px"><span class="tsm">ผลล่าสุด: </span>${item.lastResult}</div>`:''}
      ${(isProjectDone(item)) ? `
        <div style="background:#EAF3DE;border:.5px solid var(--ok);border-radius:var(--rs);padding:12px;text-align:center;margin-top:12px">
          <div style="font-size:13px;color:#3B6D11">โครงการนี้สิ้นสุดแล้ว ไม่มีการแจ้งเตือนเพิ่มเติม</div>
          <button class="btn btn-d btn-sm" style="margin-top:8px" onclick="deleteItem('${id}')">ลบชิ้นงาน</button>
        </div>` : `
      <div style="font-size:13px;font-weight:600;margin:12px 0 8px">✅ Checklist</div>
      <div style="border:.5px solid var(--border);border-radius:var(--rs);padding:6px 12px;margin-bottom:14px">${checkHtml}</div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">📝 บันทึกผล</div>
      <div class="g2" style="margin-bottom:8px">
        <input class="fc" type="text" id="res-val" placeholder="ผลลัพธ์" value="${item.lastResult||''}">
        <input class="fc" type="date" id="res-date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="brow">
        <button class="btn btn-p" onclick="completeTest('${id}')">บันทึกและตัดความถี่ที่ผ่านแล้ว</button>
        <button class="btn btn-d" onclick="deleteItem('${id}')">ลบชิ้นงาน</button>
      </div>`}
    </div>

    <!-- Tab 1: Edit -->
    <div class="mpanel" id="mp-1">
      <div class="fg"><label class="fl">ชื่อชิ้นงาน *</label><input class="fc" type="text" id="e-name" value="${item.name}"></div>
      <div class="fg"><label class="fl">รายละเอียดชิ้นงาน</label><input class="fc" type="text" id="e-desc" value="${item.desc||''}" placeholder="รายละเอียดเพิ่มเติม"></div>
      <div class="fg"><label class="fl">หัวข้อการทดสอบ</label><select class="fc" id="e-test">${testSelHtml}</select></div>
      <div class="fg">
        <label class="fl">ความถี่ (เลือกได้หลายรายการ)</label>
        <div class="freq-chips" id="e-freq-chips">${editFreqChips.join('')}</div>
        <div id="e-custom-days-row" style="display:${hasCustomDays?'block':'none'};margin-top:8px">
          <input class="fc" type="number" id="e-custom-days" value="${customDaysVal}" placeholder="จำนวนวัน" min="1">
        </div>
        <div id="e-monthly-row" style="display:${hasMonthly?'block':'none'};margin-top:8px">
          <input class="fc" type="number" id="e-monthly-day" value="${monthlyVal}" placeholder="วันที่ (1-28)" min="1" max="28">
        </div>
      </div>
      <div class="g2">
        <div class="fg">
          <label class="fl">วันเริ่มทดสอบ *
            <span style="font-size:10px;color:var(--warn);margin-left:6px">⚠️ การเปลี่ยนจะคำนวณกำหนดการใหม่ทั้งหมด</span>
          </label>
          <input class="fc" type="date" id="e-startdate" value="${isoDate(getStartDate(item))}">
        </div>
        <div class="fg"><label class="fl">วันทดสอบล่าสุด (อัปเดตหลังทดสอบจริง)</label><input class="fc" type="date" id="e-last" value="${isoDate(item.last)}"></div>
        <div class="fg"><label class="fl">วันสิ้นสุดโครงการ</label><input class="fc" type="date" id="e-enddate" value="${item.endDate?isoDate(item.endDate):''}"></div>
      </div>
      <div class="g2">
        <div class="fg"><label class="fl">ผลลัพธ์ที่คาดหวัง</label><input class="fc" type="text" id="e-expected" value="${item.expected}"></div>
        <div class="fg"><label class="fl">Checklist (คั่นด้วย ,)</label><input class="fc" type="text" id="e-checklist" value="${(item.checklist||[]).join(', ')}"></div>
      </div>
      <div class="fg"><label class="fl">หมายเหตุ</label><input class="fc" type="text" id="e-note" value="${item.note||''}"></div>
      <button class="btn btn-p btn-full" onclick="saveEdit('${id}')">บันทึกการแก้ไข</button>
    </div>

    <!-- Tab 2: Plan Adjustment -->
    <div class="mpanel" id="mp-2">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">ปรับแผนการทดสอบ</div>
      ${adjBanner}
      <div style="font-size:13px;color:var(--text2);margin-bottom:12px;line-height:1.6">
        เปลี่ยนความถี่การทดสอบสำหรับรอบถัดไป โดยไม่กระทบประวัติเดิม
      </div>
      <div class="fg"><label class="fl">ความถี่ใหม่</label>
        <select class="fc" id="adj-freq-type" onchange="updateAdjPreview()">
          <option value="30">ครบ 1 เดือน (30 วัน)</option>
          <option value="90">ครบ 3 เดือน (90 วัน)</option>
          <option value="180">ครบ 6 เดือน (180 วัน)</option>
          <option value="365">ครบ 1 ปี (365 วัน)</option>
          <option value="custom-days">กำหนดเอง (วัน)</option>
          <option value="monthly-day">ทุกวันที่ ... ของเดือน</option>
        </select>
      </div>
      <div id="adj-custom-row" style="display:none" class="fg">
        <label class="fl">จำนวนวัน</label>
        <input class="fc" type="number" id="adj-custom-days" placeholder="เช่น 45" min="1" oninput="updateAdjPreview()">
      </div>
      <div id="adj-monthly-row" style="display:none" class="fg">
        <label class="fl">วันที่ของเดือน (1-28)</label>
        <input class="fc" type="number" id="adj-monthly-day" placeholder="เช่น 15" min="1" max="28" oninput="updateAdjPreview()">
      </div>
      <div class="fg"><label class="fl">มีผลตั้งแต่วันที่</label>
        <input class="fc" type="date" id="adj-from-date" value="${new Date().toISOString().split('T')[0]}" oninput="updateAdjPreview()">
      </div>
      <div id="adj-preview" style="background:var(--surface2);border-radius:var(--rs);padding:10px 12px;font-size:13px;margin-bottom:12px;color:var(--text2)">
        กำหนดถัดไปใหม่: กำลังคำนวณ...
      </div>
      <button class="btn btn-warn btn-full" onclick="applyPlanAdj('${id}')">ยืนยันการปรับแผน</button>
    </div>

    <!-- Tab 3: History -->
    <div class="mpanel" id="mp-3">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">ประวัติการทดสอบ (${(item.history||[]).length} ครั้ง)</div>
      ${histHtml}
    </div>
  `;

  document.getElementById('detail-modal').classList.add('open');

  // Wire up adj-freq-type change
  document.getElementById('adj-freq-type').addEventListener('change', function(){
    document.getElementById('adj-custom-row').style.display  = this.value==='custom-days'?'block':'none';
    document.getElementById('adj-monthly-row').style.display = this.value==='monthly-day'?'block':'none';
    updateAdjPreview();
  });
  updateAdjPreview();
}

function swTab(idx, btn) {
  document.querySelectorAll('.mttab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.mpanel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`mp-${idx}`).classList.add('active');
}

// ── Plan Adjustment ───────────────────────────────────────────
function getAdjSpec() {
  const ftype = document.getElementById('adj-freq-type')?.value;
  if (!ftype) return null;
  if (ftype === 'custom-days') {
    const v = parseInt(document.getElementById('adj-custom-days')?.value);
    return isNaN(v)||v<1 ? null : { type:'days', value:v };
  }
  if (ftype === 'monthly-day') {
    const v = parseInt(document.getElementById('adj-monthly-day')?.value);
    return isNaN(v)||v<1||v>28 ? null : { type:'monthly-day', value:v };
  }
  return { type:'days', value:parseInt(ftype) };
}

function updateAdjPreview() {
  const spec = getAdjSpec();
  const fromEl = document.getElementById('adj-from-date');
  const prev   = document.getElementById('adj-preview');
  if (!prev) return;
  if (!spec || !fromEl?.value) { prev.textContent='กรุณากรอกข้อมูลให้ครบ'; return; }
  const fromDate = new Date(fromEl.value);
  const nextDate = getNextFromSpec(fromDate, spec);
  prev.innerHTML = `<strong>ความถี่ใหม่:</strong> ${specLabel(spec)}<br><strong>กำหนดถัดไปใหม่:</strong> ${fmtDate(nextDate)}`;
}

async function applyPlanAdj(id) {
  const spec = getAdjSpec();
  const fromDate = document.getElementById('adj-from-date')?.value;
  if (!spec) { showToast('⚠️ กรุณากรอกข้อมูลความถี่ให้ครบ'); return; }
  if (!fromDate) { showToast('⚠️ กรุณาระบุวันที่มีผล'); return; }
  const item = await dbGet('items', id);
  item.planAdj = { spec, fromDate: new Date(fromDate).toISOString() };
  await saveItem(item);
  closeModal();
  showToast(`✅ ปรับแผนแล้ว — ${specLabel(spec)} มีผลตั้งแต่ ${fmtDate(fromDate)}`);
}

async function cancelPlanAdj(id) {
  const item = await dbGet('items', id);
  item.planAdj = null;
  await saveItem(item);
  closeModal();
  showToast('↩️ ยกเลิกการปรับแผนแล้ว');
}

// ── Checklist / Complete / Delete ────────────────────────────
async function toggleCheck(id, idx, val) {
  const item = await dbGet('items', id);
  item.checkDone = item.checkDone||[];
  if (val) { if (!item.checkDone.includes(idx)) item.checkDone.push(idx); }
  else     { item.checkDone = item.checkDone.filter(i=>i!==idx); }
  await dbPut('items', item);
  const row = document.getElementById(`ck-row-${idx}`);
  if (row) row.className = `ci${val?' done':''}`;
}

async function completeTest(id) {
  const rv = document.getElementById('res-val').value.trim();
  const rd = document.getElementById('res-date').value;
  if (!rd) { showToast('⚠️ กรุณาระบุวันที่ทดสอบ'); return; }
  const item = await dbGet('items', id);
  if (!item.history) item.history = [];
  item.history.push({
    date: new Date(rd).toISOString(),
    result: rv,
    freqBefore: freqsLabel(item)
  });
  // ✅ อัปเดต last แต่ไม่เปลี่ยน startDate
  item.last       = new Date(rd).toISOString();
  item.lastResult = rv;
  item.checkDone  = [];
  // ✅ ตัด freq ที่ผ่านไปแล้วออก (นับจาก startDate)
  prunePassedFreqs(item);
  // Clear plan adj if applied
  if (item.planAdj && today() >= new Date(item.planAdj.fromDate)) {
    item.freqs   = [item.planAdj.spec];
    item.planAdj = null;
  }
  await saveItem(item);
  closeModal();
  if (isProjectDone(item)) {
    showToast('🎉 โครงการเสร็จสิ้น 100%! ไม่มีการแจ้งเตือนเพิ่มเติม');
  } else {
    const remaining = item.freqs ? item.freqs.length : 1;
    showToast(`✅ บันทึกแล้ว! เหลือ ${remaining} ความถี่ · ถัดไป: ${fmtDate(getNext(item))}`);
  }
  fireNotifications(false);
}

async function deleteItem(id) {
  if (!confirm('ต้องการลบชิ้นงานนี้?')) return;
  await dbDel('items', id);
  await loadItems();
  closeModal(); renderAll();
  showToast('🗑 ลบชิ้นงานเรียบร้อย');
}

// ── Save Edit ─────────────────────────────────────────────────
async function saveEdit(id) {
  const name      = document.getElementById('e-name').value.trim();
  const desc      = document.getElementById('e-desc')?.value.trim()||'';
  const test      = document.getElementById('e-test').value;
  const startDate = document.getElementById('e-startdate').value;
  const last      = document.getElementById('e-last').value;
  const endDate   = document.getElementById('e-enddate').value;
  const exp       = document.getElementById('e-expected').value.trim();
  const note      = document.getElementById('e-note').value.trim();
  const ckRaw     = document.getElementById('e-checklist').value;
  const cl        = ckRaw ? ckRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];

  // Collect edit freqs
  const eFreqs = [];
  document.querySelectorAll('#e-freq-chips .fchip.sel').forEach(chip=>{
    const v = chip.dataset.v;
    if (v==='custom-days') {
      const d = parseInt(document.getElementById('e-custom-days')?.value);
      if (d>0) eFreqs.push({type:'days',value:d});
    } else if (v==='monthly-day') {
      const day = parseInt(document.getElementById('e-monthly-day')?.value);
      if (day>=1&&day<=28) eFreqs.push({type:'monthly-day',value:day});
    } else {
      eFreqs.push({type:'days',value:parseInt(v)});
    }
  });

  if (!name)      { showToast('⚠️ กรุณากรอกชื่อชิ้นงาน'); return; }
  if (!startDate) { showToast('⚠️ กรุณาระบุวันเริ่มทดสอบ'); return; }
  if (!last)      { showToast('⚠️ กรุณาระบุวันทดสอบล่าสุด'); return; }
  if (new Date(startDate) > new Date(last)) {
    showToast('⚠️ วันเริ่มทดสอบต้องไม่เกินวันทดสอบล่าสุด'); return;
  }
  if (!eFreqs.length) { showToast('⚠️ เลือกความถี่อย่างน้อย 1 รายการ'); return; }

  const item = await dbGet('items', id);
  const startChanged = isoDate(getStartDate(item)) !== startDate;

  Object.assign(item, {
    name, desc, test, freqs: eFreqs,
    startDate: new Date(startDate).toISOString(),  // ✅ บันทึก startDate ใหม่
    last: new Date(last).toISOString(),
    endDate: endDate ? new Date(endDate).toISOString() : null,
    expected: exp||'-', note, checklist: cl
  });
  await saveItem(item);
  closeModal();
  if (startChanged) {
    showToast('✅ แก้ไขแล้ว — กำหนดการคำนวณใหม่จากวันเริ่มทดสอบ');
  } else {
    showToast('✅ แก้ไขข้อมูลเรียบร้อย');
  }
}

// ── Notifications ─────────────────────────────────────────────
let _hourlyTimer = null;   // setInterval handle
let _notifSettings = {
  on7day: true, on3day: true, onDay: true, onOverdue: false, onHourly: false,
  hourlyIntervalHr: 1, notifTime: '08:00'
};

async function loadNotifSettings() {
  const s = await dbGet('settings','notifSettings');
  if (s) _notifSettings = { ..._notifSettings, ...s.value };
  applyNotifSettingsUI();
}
async function saveNotifSettings() {
  _notifSettings.on7day    = document.getElementById('t7')?.classList.contains('on');
  _notifSettings.on3day    = document.getElementById('t3')?.classList.contains('on');
  _notifSettings.onDay     = document.getElementById('t0')?.classList.contains('on');
  _notifSettings.onOverdue = document.getElementById('tover')?.classList.contains('on');
  _notifSettings.onHourly  = document.getElementById('thourly')?.classList.contains('on');
  _notifSettings.hourlyIntervalHr = parseFloat(document.getElementById('hourly-interval')?.value)||1;
  _notifSettings.notifTime = document.getElementById('notif-time')?.value||'08:00';
  await dbPut('settings',{key:'notifSettings', value:_notifSettings});
  restartHourlyTimer();
  showToast('✅ บันทึกการตั้งค่าแล้ว');
}
function applyNotifSettingsUI() {
  const set = (id, val) => { const el=document.getElementById(id); if(el) { el.classList.toggle('on', !!val); } };
  set('t7',    _notifSettings.on7day);
  set('t3',    _notifSettings.on3day);
  set('t0',    _notifSettings.onDay);
  set('tover', _notifSettings.onOverdue);
  set('thourly',_notifSettings.onHourly);
  const hi = document.getElementById('hourly-interval');
  if (hi) hi.value = _notifSettings.hourlyIntervalHr;
  const nt = document.getElementById('notif-time');
  if (nt) nt.value = _notifSettings.notifTime;
  const hw = document.getElementById('hourly-wrap');
  if (hw) hw.style.display = _notifSettings.onHourly ? 'block' : 'none';
}

async function toggleNotification() {
  if (!('Notification' in window)) { showToast('เบราว์เซอร์ไม่รองรับ Notification'); return; }
  if (Notification.permission==='granted') { showToast('การแจ้งเตือนเปิดอยู่แล้ว ✓'); return; }
  const p = await Notification.requestPermission();
  const btn = document.getElementById('notif-btn');
  if (p==='granted') {
    btn.textContent='🔔 แจ้งเตือนเปิดอยู่'; btn.classList.add('on');
    showToast('✅ เปิดการแจ้งเตือนสำเร็จ');
    fireNotifications();
    restartHourlyTimer();
  } else showToast('❌ ไม่ได้รับอนุญาต');
}

function checkNotifStatus() {
  if ('Notification' in window && Notification.permission==='granted') {
    document.getElementById('notif-btn').textContent='🔔 แจ้งเตือนเปิดอยู่';
    document.getElementById('notif-btn').classList.add('on');
  }
}

// Fire notifications based on settings
function fireNotifications(hourlyMode=false) {
  if (!('Notification' in window)||Notification.permission!=='granted') return;
  const cfg = _notifSettings;
  // แจ้งเตือนทุกชิ้นงานที่ยังไม่เสร็จ (isDone=false)
  // รวมถึง isPending = เลยวันสิ้นสุดแต่ยังไม่บันทึกผล
  const alerts = items.filter(i=>{
    if (isProjectDone(i)) return false; // เสร็จจริง → ไม่แจ้ง
    const ep = getEndDateProgress(i);
    if (ep && ep.isPending) return true; // เลยกำหนดแต่รอบันทึก → แจ้งเสมอ
    const d = getDays(i);
    if (d < 0  && cfg.onOverdue) return true;
    if (d === 0 && cfg.onDay)    return true;
    if (d <= 3  && cfg.on3day)   return true;
    if (d <= 7  && cfg.on7day)   return true;
    return false;
  });
  if (!alerts.length) {
    if (hourlyMode) new Notification('TestNotify ✅', { body:'ชิ้นงานทุกรายการปกติดี', icon:'icons/icon-192.png', tag:'hourly-ok' });
    return;
  }
  alerts.forEach(item=>{
    const ep = getEndDateProgress(item);
    let msg;
    if (ep && ep.isPending) {
      msg = `⚠️ เลยวันสิ้นสุดโครงการแล้ว — กรุณาบันทึกผล`;
    } else {
      const d = getDays(item);
      msg = d<0?`⚠️ เกินกำหนด ${Math.abs(d)} วัน`:d===0?'🔴 ถึงกำหนดวันนี้!':d<=3?`🟡 อีก ${d} วัน`:`🟢 อีก ${d} วัน`;
    }
    new Notification(`TestNotify — ${item.id||item.name}`, {
      body:`${item.name}\n${item.test}\n${msg}`,
      icon:'icons/icon-192.png',
      tag: hourlyMode ? `hr-${item.id}` : item.id,
      requireInteraction: true
    });
  });
}

// Legacy alias
function scheduleNotifications() { fireNotifications(false); }

// Hourly (or custom interval) repeating timer
function restartHourlyTimer() {
  if (_hourlyTimer) { clearInterval(_hourlyTimer); _hourlyTimer = null; }
  if (!_notifSettings.onHourly) return;
  if (!('Notification' in window)||Notification.permission!=='granted') return;
  const ms = (_notifSettings.hourlyIntervalHr||1) * 60 * 60 * 1000;
  _hourlyTimer = setInterval(()=>{
    fireNotifications(true);
  }, ms);
}

function toggleHourlyWrap() {
  const on = document.getElementById('thourly')?.classList.contains('on');
  const hw = document.getElementById('hourly-wrap');
  if (hw) hw.style.display = on ? 'block' : 'none';
}

// ── Export ────────────────────────────────────────────────────
function exportExcel() {
  if (typeof XLSX==='undefined') { showToast('⚠️ กำลังโหลด XLSX...'); return; }
  const rows = items.map(item=>({
    'เลขที่':item.id,'ชื่อชิ้นงาน':item.name,'หัวข้อทดสอบ':item.test,
    'ความถี่':freqsLabel(item),'ทดสอบล่าสุด':fmtDate(item.last),
    'กำหนดถัดไป':fmtDate(getNext(item)),'วันสิ้นสุด':item.endDate?fmtDate(item.endDate):'-',
    'คืบหน้า %':item.endDate?(getEndDateProgress(item)?.pct||0):'-',
    'ผลที่คาดหวัง':item.expected,'ผลล่าสุด':item.lastResult||'-',
    'สถานะ':getStatus(item)==='overdue'?`เกิน ${Math.abs(getDays(item))} วัน`:getStatus(item)==='soon'?`อีก ${getDays(item)} วัน`:'ปกติ',
    'แผนปรับ':item.planAdj?specLabel(item.planAdj.spec):'-',
    'ประวัติ (ครั้ง)':(item.history||[]).length,'หมายเหตุ':item.note||''
  }));
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:10},{wch:22},{wch:28},{wch:28},{wch:16},{wch:16},{wch:16},{wch:10},{wch:16},{wch:16},{wch:16},{wch:18},{wch:12},{wch:20}];
  XLSX.utils.book_append_sheet(wb,ws,'ตารางทดสอบ');
  const histRows=[];
  items.forEach(item=>(item.history||[]).forEach(h=>histRows.push({'เลขที่':item.id,'ชื่อชิ้นงาน':item.name,'วันที่':fmtDate(h.date),'ผลลัพธ์':h.result||'-','ความถี่ขณะนั้น':h.freqBefore||'-'})));
  if (histRows.length) {
    const ws2=XLSX.utils.json_to_sheet(histRows); ws2['!cols']=[{wch:10},{wch:22},{wch:16},{wch:30},{wch:28}];
    XLSX.utils.book_append_sheet(wb,ws2,'ประวัติการทดสอบ');
  }
  const sum=[['รายงาน','TestNotify v1.2'],['วันที่',new Date().toLocaleDateString('th-TH')],
    ['ชิ้นงาน',items.length],['เกินกำหนด',items.filter(i=>getStatus(i)==='overdue').length],
    ['ใกล้กำหนด',items.filter(i=>getStatus(i)==='soon').length],['ปกติ',items.filter(i=>getStatus(i)==='ok').length]];
  const ws3=XLSX.utils.aoa_to_sheet(sum); ws3['!cols']=[{wch:24},{wch:20}];
  XLSX.utils.book_append_sheet(wb,ws3,'สรุป');
  XLSX.writeFile(wb,`TestNotify_v12_${new Date().toISOString().split('T')[0]}.xlsx`);
  showToast('📊 Export Excel เรียบร้อย');
}

function exportPDF() {
  const now=new Date().toLocaleDateString('th-TH',{day:'2-digit',month:'long',year:'numeric'});
  const rows=items.map(item=>{
    const s=getStatus(item),d=getDays(item);
    const st=s==='overdue'?`เกิน ${Math.abs(d)} วัน`:s==='soon'?`อีก ${d} วัน`:'ปกติ';
    const clr=s==='overdue'?'#A32D2D':s==='soon'?'#854F0B':'#3B6D11';
    const bg=s==='overdue'?'#FCEBEB':s==='soon'?'#FAEEDA':'#EAF3DE';
    const ep=getEndDateProgress(item);
    return`<tr><td>${item.id}</td><td>${item.name}</td><td>${item.test}</td><td>${freqsLabel(item)}</td><td>${fmtDate(item.last)}</td><td>${fmtDate(getNext(item))}</td><td>${item.endDate?ep?.pct+'%':'-'}</td><td style="background:${bg};color:${clr};font-weight:600;text-align:center">${st}</td></tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>TestNotify</title>
  <style>body{font-family:-apple-system,sans-serif;margin:32px;color:#1a1a2e}h1{font-size:20px;margin-bottom:4px}.sub{font-size:13px;color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#7F77DD;color:#fff;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even){background:#fafafa}@media print{body{margin:16px}}</style></head><body>
  <h1>รายงานตารางทดสอบชิ้นงาน</h1>
  <div class="sub">สร้างเมื่อ ${now} · ชิ้นงาน ${items.length} รายการ</div>
  <table><thead><tr><th>เลขที่</th><th>ชื่อชิ้นงาน</th><th>หัวข้อ</th><th>ความถี่</th><th>ล่าสุด</th><th>ถัดไป</th><th>คืบหน้า</th><th>สถานะ</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  const win=window.open(URL.createObjectURL(new Blob([html],{type:'text/html'})),'_blank');
  if(win) win.onload=()=>win.print();
  showToast('📄 เปิด PDF พร้อมพิมพ์');
}

function exportJSON() {
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({version:3,exported:new Date().toISOString(),items,testTopics},null,2)],{type:'application/json'}));
  a.download=`testnotify_v12_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('💾 Backup เรียบร้อย');
}

async function clearAllData() {
  if (!confirm('⚠️ ลบข้อมูลทั้งหมด?')) return;
  await dbClr('items'); await dbClr('settings');
  testTopics = [...DEFAULT_TOPICS];
  await loadItems(); renderAll(); populateTopicDropdowns();
  showToast('🗑 ลบข้อมูลแล้ว');
}

// ── Init ──────────────────────────────────────────────────────
document.getElementById('f-last').value = new Date().toISOString().split('T')[0];

openDB()
  .then(()=>loadTopics())
  .then(()=>loadNotifSettings())
  .then(()=>seedIfEmpty())
  .then(()=>loadItems())
  .then(()=>{
    populateTopicDropdowns();
    renderTopicList('topic-list-inline','new-topic-inline','addTopicInline');
    renderAll();
    checkNotifStatus();
    applyNotifSettingsUI();
    if ('Notification' in window && Notification.permission==='granted') {
      fireNotifications(false);
      restartHourlyTimer();
    }
  })
  .catch(err=>console.error('DB Error:',err));
