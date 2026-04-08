/* ============================================================
   TestNotify PWA — app.js
   IndexedDB storage · Push Notifications · Export Excel/PDF
   ============================================================ */

// ── DB ────────────────────────────────────────────────────────
const DB_NAME = 'testnotify-db';
const DB_VER  = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('items')) {
        const store = d.createObjectStore('items', { keyPath: 'id' });
        store.createIndex('status', 'status');
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbPut(store, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbClear(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Helpers ───────────────────────────────────────────────────
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getNext(item) { return addDays(new Date(item.last), item.freq); }
function getDays(item) { return diffDays(getNext(item), today()); }
function getStatus(item) {
  const d = getDays(item);
  if (d < 0)  return 'overdue';
  if (d <= 7) return 'soon';
  return 'ok';
}

function getBadge(item) {
  const d = getDays(item), s = getStatus(item);
  if (s === 'overdue') return `<span class="badge badge-danger">เกิน ${Math.abs(d)} วัน</span>`;
  if (s === 'soon')    return `<span class="badge badge-warn">อีก ${d} วัน</span>`;
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

async function loadItems() {
  items = await dbGetAll('items');
  items.sort((a, b) => getDays(a) - getDays(b));
}

async function saveItem(item) {
  await dbPut('items', item);
  await loadItems();
  renderAll();
}

// ── Seed data (first run) ─────────────────────────────────────
const SEED = [
  { id:'WP-001', name:'แผ่น Aluminum A1', test:'วัดสีชิ้นงาน (Color Measurement)', freq:90,
    last: addDays(today(),-82).toISOString(), expected:'ΔE < 2.0', note:'ตรวจก่อนส่งลูกค้า',
    checklist:['บันทึกค่า L*, a*, b*','เปรียบเทียบกับมาตรฐาน','ถ่ายรูปชิ้นงาน','อัปเดตเอกสาร QC'],
    checkDone:[], lastResult:'' },
  { id:'WP-002', name:'แผ่น Steel B2', test:'ทดสอบความแข็ง (Hardness Test)', freq:180,
    last: addDays(today(),-170).toISOString(), expected:'HRC 45-55', note:'',
    checklist:['ทดสอบ 5 จุดบนชิ้นงาน','บันทึกค่าเฉลี่ย','เปรียบเทียบค่ากับสเปค'],
    checkDone:[], lastResult:'' },
  { id:'WP-003', name:'ชิ้นส่วน Plastic C', test:'ตรวจสอบความหนา (Thickness Check)', freq:30,
    last: addDays(today(),-35).toISOString(), expected:'2.5 ± 0.1 mm', note:'ใช้ไมโครมิเตอร์',
    checklist:['วัด 3 ตำแหน่ง','บันทึกค่าสูงสุด/ต่ำสุด','อัปเดต Spec sheet'],
    checkDone:[], lastResult:'' },
  { id:'WP-004', name:'แผ่น Composite D', test:'วัดสีชิ้นงาน (Color Measurement)', freq:90,
    last: addDays(today(),-75).toISOString(), expected:'ΔE < 1.5', note:'',
    checklist:['บันทึกค่า L*, a*, b*','เปรียบเทียบกับมาตรฐาน','ถ่ายรูปชิ้นงาน'],
    checkDone:[], lastResult:'' },
  { id:'WP-005', name:'Rubber Seal E', test:'ทดสอบแรงดึง (Tensile Test)', freq:365,
    last: addDays(today(),-300).toISOString(), expected:'> 15 MPa', note:'ตรวจสอบทุกปี',
    checklist:['เตรียมตัวอย่างตามมาตรฐาน','บันทึก tensile strength','บันทึก elongation'],
    checkDone:[], lastResult:'' },
];

async function seedIfEmpty() {
  const existing = await dbGetAll('items');
  if (existing.length === 0) {
    for (const item of SEED) await dbPut('items', item);
  }
}

// ── Render: Dashboard ─────────────────────────────────────────
function renderDashboard() {
  document.getElementById('s-total').textContent   = items.length;
  const overdue = items.filter(i => getStatus(i) === 'overdue');
  const soon    = items.filter(i => getStatus(i) === 'soon');
  document.getElementById('s-overdue').textContent = overdue.length;
  document.getElementById('s-soon').textContent    = soon.length;

  // Badge on nav
  const total = overdue.length + soon.length;
  const badge = document.getElementById('badge-count');
  badge.style.display = total > 0 ? 'inline' : 'none';
  badge.textContent = total;

  const alerts = [...overdue, ...soon];
  const al = document.getElementById('alert-list');
  if (alerts.length === 0) {
    al.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div>ชิ้นงานทุกรายการปกติดี</div></div>';
    return;
  }
  al.innerHTML = alerts.map(item => `
    <div class="card" onclick="openModal('${item.id}')">
      <div class="row row-between mt4">
        <span class="fw5" style="font-size:14px">${item.name}</span>
        ${getBadge(item)}
      </div>
      <div class="text-sm mt4">${item.id} · ${item.test}</div>
      <div class="text-sm mt4">กำหนดถัดไป: <strong>${fmtDate(getNext(item))}</strong></div>
    </div>
  `).join('');
}

// ── Render: Schedule ──────────────────────────────────────────
function renderSchedule() {
  const q  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const fs = document.getElementById('filter-sel')?.value || '';
  const list = items
    .filter(i => {
      const match = i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q);
      return match && (!fs || getStatus(i) === fs);
    });

  const sl = document.getElementById('schedule-list');
  if (list.length === 0) {
    sl.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div>ไม่พบชิ้นงาน</div></div>';
    return;
  }
  sl.innerHTML = list.map(item => {
    const d    = getDays(item);
    const pct  = Math.min(100, Math.max(0, Math.round((item.freq - Math.max(0, d)) / item.freq * 100)));
    const col  = d < 0 ? 'var(--danger)' : d <= 7 ? 'var(--warn)' : 'var(--ok)';
    return `
      <div class="card" onclick="openModal('${item.id}')">
        <div class="row row-between">
          <span class="fw5" style="font-size:14px">${item.name}</span>
          ${getBadge(item)}
        </div>
        <div class="text-sm mt4">${item.id} · ${item.test}</div>
        <div class="timeline-bar"><div class="timeline-fill" style="width:${pct}%;background:${col}"></div></div>
        <div class="row row-between text-sm"><span>ล่าสุด: ${fmtDate(item.last)}</span><span>ถัดไป: ${fmtDate(getNext(item))}</span></div>
      </div>`;
  }).join('');
}

// ── Render: Notification preview ─────────────────────────────
function renderNotifPreview() {
  const alerts = items.filter(i => getDays(i) <= 7);
  const container = document.getElementById('phone-notifs-container');
  if (!container) return;
  if (alerts.length === 0) {
    container.innerHTML = '<div class="text-sm" style="text-align:center;padding:12px">ไม่มีการแจ้งเตือนในขณะนี้</div>';
    return;
  }
  container.innerHTML = alerts.map(item => {
    const d = getDays(item);
    const msg = d < 0 ? `เกินกำหนด ${Math.abs(d)} วัน` : d === 0 ? 'ถึงกำหนดวันนี้' : `อีก ${d} วัน ถึงกำหนด`;
    const cls = d < 0 ? 'danger' : d <= 3 ? 'warn' : '';
    return `<div class="notif-card ${cls}">
      <div class="notif-header"><span class="notif-app">TestNotify</span><span class="notif-time">08:00</span></div>
      <div class="notif-title">📋 ${item.id} — ${item.name}</div>
      <div class="notif-body">${item.test} · ${msg}</div>
    </div>`;
  }).join('');
}

function renderAll() {
  renderDashboard();
  renderSchedule();
  renderNotifPreview();
}

// ── Page Navigation ───────────────────────────────────────────
function switchPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  (btn || document.getElementById(`nav-${name}`)).classList.add('active');
  renderAll();
}

// ── Add Item ──────────────────────────────────────────────────
function toggleCustom() {
  const v = document.getElementById('f-freq').value;
  document.getElementById('custom-days-row').style.display = v === 'custom' ? 'block' : 'none';
}

async function addItem() {
  const name = document.getElementById('f-name').value.trim();
  const id   = document.getElementById('f-id').value.trim();
  const test = document.getElementById('f-test').value;
  const freqSel = document.getElementById('f-freq').value;
  const freq = freqSel === 'custom'
    ? parseInt(document.getElementById('f-custom-days').value)
    : parseInt(freqSel);
  const last     = document.getElementById('f-last').value;
  const expected = document.getElementById('f-expected').value.trim();
  const note     = document.getElementById('f-note').value.trim();
  const ckRaw    = document.getElementById('f-checklist').value;
  const checklist = ckRaw ? ckRaw.split(',').map(s => s.trim()).filter(Boolean) : ['บันทึกผลการทดสอบ', 'เปรียบเทียบกับมาตรฐาน', 'อัปเดตเอกสาร'];

  if (!name || !id || !last || isNaN(freq)) {
    showToast('⚠️ กรุณากรอกข้อมูลที่จำเป็นให้ครบ'); return;
  }
  const existing = await dbGet('items', id);
  if (existing) { showToast('⚠️ เลขที่ชิ้นงานนี้มีอยู่แล้ว'); return; }

  const item = { id, name, test, freq, last: new Date(last).toISOString(), expected: expected || '-', note, checklist, checkDone: [], lastResult: '' };
  await saveItem(item);

  ['f-name','f-id','f-expected','f-note','f-checklist'].forEach(f => { document.getElementById(f).value = ''; });
  showToast('✅ เพิ่มชิ้นงานเรียบร้อย');
  switchPage('schedule', document.getElementById('nav-schedule'));
}

// ── Modal ─────────────────────────────────────────────────────
function handleModalClick(e) {
  if (e.target === document.getElementById('detail-modal')) closeModal();
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

async function openModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const d = getDays(item);

  const checkHtml = item.checklist.map((c, idx) => {
    const done = (item.checkDone || []).includes(idx);
    return `<div class="check-item ${done ? 'done' : ''}" id="ck-row-${idx}">
      <input type="checkbox" id="ck-${idx}" ${done ? 'checked' : ''} onchange="toggleCheck('${id}',${idx},this.checked)">
      <label for="ck-${idx}">${c}</label>
    </div>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="row row-between" style="margin-bottom:12px">
      <div>
        <div style="font-size:16px;font-weight:600">${item.name}</div>
        <div class="text-sm">${item.id}</div>
      </div>
      ${getBadge(item)}
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;margin-bottom:14px">
      <div class="grid2" style="gap:8px">
        <div><div class="text-sm">หัวข้อทดสอบ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.test}</div></div>
        <div><div class="text-sm">ผลลัพธ์ที่คาดหวัง</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.expected}</div></div>
        <div><div class="text-sm">ทดสอบล่าสุด</div><div style="font-size:13px;font-weight:500;margin-top:2px">${fmtDate(item.last)}</div></div>
        <div><div class="text-sm">กำหนดถัดไป</div><div style="font-size:13px;font-weight:500;margin-top:2px">${fmtDate(getNext(item))}</div></div>
        <div><div class="text-sm">ความถี่</div><div style="font-size:13px;font-weight:500;margin-top:2px">ทุก ${item.freq} วัน</div></div>
        ${item.note ? `<div><div class="text-sm">หมายเหตุ</div><div style="font-size:13px;font-weight:500;margin-top:2px">${item.note}</div></div>` : ''}
      </div>
    </div>

    ${item.lastResult ? `<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:14px;font-size:13px">
      <span class="text-sm">ผลล่าสุด: </span>${item.lastResult}</div>` : ''}

    <div style="font-size:13px;font-weight:600;margin-bottom:8px">✅ Checklist หลังทดสอบ</div>
    <div style="border:0.5px solid var(--border);border-radius:var(--radius-sm);padding:6px 12px;margin-bottom:14px">${checkHtml}</div>

    <div style="font-size:13px;font-weight:600;margin-bottom:8px">📝 บันทึกผลการทดสอบ</div>
    <div class="grid2" style="margin-bottom:8px">
      <input class="form-control" type="text" id="res-val" placeholder="ผลลัพธ์ที่ได้" value="${item.lastResult || ''}">
      <input class="form-control" type="date" id="res-date" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="completeTest('${id}')">บันทึกและตั้งกำหนดครั้งถัดไป</button>
      <button class="btn btn-danger" onclick="deleteItem('${id}')">ลบชิ้นงาน</button>
    </div>
  `;
  document.getElementById('detail-modal').classList.add('open');
}

async function toggleCheck(id, idx, val) {
  const item = await dbGet('items', id);
  if (!item) return;
  item.checkDone = item.checkDone || [];
  if (val) { if (!item.checkDone.includes(idx)) item.checkDone.push(idx); }
  else     { item.checkDone = item.checkDone.filter(i => i !== idx); }
  await dbPut('items', item);
  // Update visual
  const row = document.getElementById(`ck-row-${idx}`);
  if (row) row.className = `check-item ${val ? 'done' : ''}`;
}

async function completeTest(id) {
  const rv   = document.getElementById('res-val').value.trim();
  const rd   = document.getElementById('res-date').value;
  if (!rd)   { showToast('⚠️ กรุณาระบุวันที่ทดสอบ'); return; }

  const item = await dbGet('items', id);
  item.last      = new Date(rd).toISOString();
  item.lastResult = rv;
  item.checkDone = [];
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
  if (Notification.permission === 'granted') {
    showToast('การแจ้งเตือนเปิดอยู่แล้ว ✓');
    return;
  }
  const perm = await Notification.requestPermission();
  const btn  = document.getElementById('notif-btn');
  if (perm === 'granted') {
    btn.textContent = '🔔 แจ้งเตือนเปิดอยู่';
    btn.classList.add('active');
    showToast('✅ เปิดการแจ้งเตือนสำเร็จ');
    scheduleNotifications();
  } else {
    showToast('❌ ไม่ได้รับอนุญาต');
  }
}

function checkNotifStatus() {
  if ('Notification' in window && Notification.permission === 'granted') {
    const btn = document.getElementById('notif-btn');
    btn.textContent = '🔔 แจ้งเตือนเปิดอยู่';
    btn.classList.add('active');
  }
}

function scheduleNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const alerts = items.filter(i => getDays(i) <= 7);
  alerts.forEach(item => {
    const d   = getDays(item);
    const msg = d < 0 ? `เกินกำหนด ${Math.abs(d)} วัน` : d === 0 ? 'ถึงกำหนดวันนี้!' : `อีก ${d} วัน`;
    new Notification(`TestNotify — ${item.id}`, {
      body: `${item.name}\n${item.test} · ${msg}`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: item.id,
    });
  });
}

// ── Export Excel ──────────────────────────────────────────────
function exportExcel() {
  if (typeof XLSX === 'undefined') { showToast('⚠️ กำลังโหลด library...'); return; }

  const rows = items.map(item => ({
    'เลขที่': item.id,
    'ชื่อชิ้นงาน': item.name,
    'หัวข้อทดสอบ': item.test,
    'ความถี่ (วัน)': item.freq,
    'ทดสอบล่าสุด': fmtDate(item.last),
    'กำหนดถัดไป': fmtDate(getNext(item)),
    'ผลลัพธ์ที่คาดหวัง': item.expected,
    'ผลล่าสุด': item.lastResult || '-',
    'สถานะ': getStatus(item) === 'overdue' ? `เกิน ${Math.abs(getDays(item))} วัน` : getStatus(item) === 'soon' ? `อีก ${getDays(item)} วัน` : 'ปกติ',
    'หมายเหตุ': item.note || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    {wch:10},{wch:22},{wch:30},{wch:14},{wch:16},{wch:16},{wch:18},{wch:16},{wch:16},{wch:20}
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'ตารางทดสอบ');

  // Summary sheet
  const now = new Date();
  const sumData = [
    ['รายงาน', 'ระบบแจ้งเตือนการทดสอบ'],
    ['วันที่สร้าง', now.toLocaleDateString('th-TH')],
    ['ชิ้นงานทั้งหมด', items.length],
    ['เกินกำหนด', items.filter(i=>getStatus(i)==='overdue').length],
    ['ใกล้ถึงกำหนด (7 วัน)', items.filter(i=>getStatus(i)==='soon').length],
    ['ปกติ', items.filter(i=>getStatus(i)==='ok').length],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sumData);
  ws2['!cols'] = [{wch:26},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws2, 'สรุป');

  XLSX.writeFile(wb, `TestNotify_Report_${now.toISOString().split('T')[0]}.xlsx`);
  showToast('📊 ดาวน์โหลด Excel เรียบร้อย');
}

// ── Export PDF (HTML print) ───────────────────────────────────
function exportPDF() {
  const now = new Date().toLocaleDateString('th-TH', {day:'2-digit',month:'long',year:'numeric'});
  const rows = items.map(item => {
    const s = getStatus(item), d = getDays(item);
    const statusTh = s === 'overdue' ? `เกิน ${Math.abs(d)} วัน` : s === 'soon' ? `อีก ${d} วัน` : 'ปกติ';
    const color = s === 'overdue' ? '#A32D2D' : s === 'soon' ? '#854F0B' : '#3B6D11';
    const bg    = s === 'overdue' ? '#FCEBEB' : s === 'soon' ? '#FAEEDA' : '#EAF3DE';
    return `<tr>
      <td>${item.id}</td>
      <td>${item.name}</td>
      <td>${item.test}</td>
      <td>${fmtDate(item.last)}</td>
      <td>${fmtDate(getNext(item))}</td>
      <td>${item.expected}</td>
      <td style="background:${bg};color:${color};font-weight:600;text-align:center">${statusTh}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>TestNotify Report</title>
  <style>
    body{font-family:-apple-system,sans-serif;margin:32px;color:#1a1a2e}
    h1{font-size:20px;margin-bottom:4px}
    .sub{font-size:13px;color:#666;margin-bottom:20px}
    .stats{display:flex;gap:16px;margin-bottom:20px}
    .stat{background:#f5f5f7;padding:12px 20px;border-radius:8px;text-align:center}
    .stat-n{font-size:24px;font-weight:700}
    .stat-l{font-size:11px;color:#666}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#7F77DD;color:#fff;padding:8px 10px;text-align:left;font-weight:500}
    td{padding:7px 10px;border-bottom:1px solid #eee}
    tr:nth-child(even){background:#fafafa}
    @media print{body{margin:16px}}
  </style></head><body>
  <h1>รายงานตารางทดสอบชิ้นงาน</h1>
  <div class="sub">สร้างเมื่อ: ${now} · ชิ้นงานทั้งหมด ${items.length} รายการ</div>
  <div class="stats">
    <div class="stat"><div class="stat-n" style="color:#7F77DD">${items.length}</div><div class="stat-l">ทั้งหมด</div></div>
    <div class="stat"><div class="stat-n" style="color:#E24B4A">${items.filter(i=>getStatus(i)==='overdue').length}</div><div class="stat-l">เกินกำหนด</div></div>
    <div class="stat"><div class="stat-n" style="color:#EF9F27">${items.filter(i=>getStatus(i)==='soon').length}</div><div class="stat-l">ใกล้กำหนด</div></div>
    <div class="stat"><div class="stat-n" style="color:#639922">${items.filter(i=>getStatus(i)==='ok').length}</div><div class="stat-l">ปกติ</div></div>
  </div>
  <table>
    <thead><tr><th>เลขที่</th><th>ชื่อชิ้นงาน</th><th>หัวข้อทดสอบ</th><th>ทดสอบล่าสุด</th><th>กำหนดถัดไป</th><th>ผลที่คาดหวัง</th><th>สถานะ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) { win.onload = () => win.print(); }
  showToast('📄 เปิดหน้า PDF พร้อมพิมพ์');
}

// ── Export JSON Backup ────────────────────────────────────────
function exportJSON() {
  const data = JSON.stringify({ version: 1, exported: new Date().toISOString(), items }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `testnotify_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('💾 บันทึก Backup เรียบร้อย');
}

// ── Clear All ─────────────────────────────────────────────────
async function clearAllData() {
  if (!confirm('⚠️ ต้องการลบข้อมูลทั้งหมด? ไม่สามารถกู้คืนได้')) return;
  await dbClear('items');
  await loadItems();
  renderAll();
  showToast('🗑 ลบข้อมูลทั้งหมดแล้ว');
}

// ── Init ──────────────────────────────────────────────────────
document.getElementById('f-last').value = new Date().toISOString().split('T')[0];

openDB()
  .then(() => seedIfEmpty())
  .then(() => loadItems())
  .then(() => {
    renderAll();
    checkNotifStatus();
    // Check and send notifications on load
    if ('Notification' in window && Notification.permission === 'granted') {
      scheduleNotifications();
    }
  })
  .catch(err => console.error('DB Error:', err));
