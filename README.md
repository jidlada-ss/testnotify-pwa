# TestNotify PWA — ระบบแจ้งเตือนการทดสอบชิ้นงาน

## โครงสร้างไฟล์
```
testnotify-pwa/
├── index.html        ← หน้าหลัก (UI ทั้งหมด)
├── app.js            ← Logic: IndexedDB, Notification, Export
├── sw.js             ← Service Worker (offline + background notify)
├── manifest.json     ← PWA manifest (ติดตั้งบนมือถือ)
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## วิธีติดตั้งและใช้งาน

### วิธีที่ 1 — เปิดบนเครื่อง (Local)
```bash
# ต้องใช้ HTTPS หรือ localhost สำหรับ PWA features
# ติดตั้ง Node.js แล้วรันคำสั่งนี้ในโฟลเดอร์โปรเจกต์

npx serve .
# จะได้ URL: http://localhost:3000
```

### วิธีที่ 2 — Deploy บน Netlify (ฟรี, HTTPS อัตโนมัติ)
1. สมัคร https://netlify.com
2. ลาก/วางโฟลเดอร์ `testnotify-pwa` ลงใน Netlify Drop
3. ได้ URL แบบ `https://xxxxx.netlify.app`

### วิธีที่ 3 — Deploy บน GitHub Pages
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create testnotify --public --push
# เปิด Settings > Pages > Deploy from main branch
```

---

## ติดตั้งบนมือถือ (Add to Home Screen)

### iPhone/iPad (Safari)
1. เปิดเว็บด้วย Safari
2. กดปุ่ม Share (กล่องลูกศรขึ้น)
3. เลือก "Add to Home Screen"
4. กด "Add" — จะปรากฏเป็นแอปบน Home Screen

### Android (Chrome)
1. เปิดเว็บด้วย Chrome
2. จะมี popup "Add to Home Screen" ขึ้นมาอัตโนมัติ
3. หรือกดเมนู (⋮) > "Install app"

---

## ฟีเจอร์หลัก
- **IndexedDB** — เก็บข้อมูลในเครื่อง ไม่ต้องอินเทอร์เน็ต
- **Push Notification** — แจ้งเตือนชิ้นงานที่ใกล้ถึงกำหนด (ล่วงหน้า 7 วัน)
- **Service Worker** — ทำงาน offline ได้
- **Export Excel** — ดาวน์โหลดรายงาน .xlsx
- **Export PDF** — พิมพ์รายงาน PDF ผ่าน browser print
- **Backup JSON** — สำรองข้อมูลทั้งหมด

---

## การปรับแต่ง

### เพิ่มหัวข้อทดสอบ
แก้ไขใน `index.html` ส่วน `<select id="f-test">`:
```html
<option>ชื่อการทดสอบใหม่</option>
```

### เปลี่ยนสีหลัก
แก้ `--primary` ใน `index.html`:
```css
--primary: #7F77DD;  /* เปลี่ยนเป็นสีที่ต้องการ */
```

### เพิ่ม Checklist template
แก้ไขใน `app.js` ฟังก์ชัน `addItem()`:
```js
const checklist = ['รายการ 1', 'รายการ 2', ...];
```

---

## ข้อกำหนดระบบ
- Browser: Chrome 80+, Safari 14+, Firefox 79+
- ต้องใช้ HTTPS สำหรับ PWA install และ Push Notification
- ข้อมูลเก็บใน IndexedDB ของ browser (ไม่หายเมื่อปิดแอป)

---

## License
MIT — ใช้งานและแก้ไขได้อิสระ
