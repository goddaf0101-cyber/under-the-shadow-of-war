// ตัวช่วยร่วมของ API (ไฟล์ที่ขึ้นต้นด้วย _ ไม่ถูกเปิดเป็นเส้นทาง) — แบบเดียวกับ Wuxian M
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
export const err = (code, message, status = 400) => json({ ok: false, code, message }, status);

/* ข้อความจากผู้เล่น: ตัดอักขระควบคุม/แท็ก ตัดช่องว่างซ้ำ จำกัดความยาว */
export const clean = (s, n = 24) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
export const isCid = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ''));

/* เวลาไทย: 00:00 ของวันนี้ (ms) และวันที่แบบ YYYY-MM-DD */
export const TH = 7 * 3600e3;
export const midnightTH = (now) => Math.floor((now + TH) / 86400e3) * 86400e3 - TH;
export const dayTH = (now) => new Date(now + TH).toISOString().slice(0, 10);

/* สร้างตารางอัตโนมัติครั้งแรก (ไม่ต้องรัน SQL เองใน Console) */
let ready = false;
export async function ensureSchema(env) {
  if (!env || !env.DB) { const e = new Error('ยังไม่ได้ผูกฐานข้อมูล D1 ชื่อ DB กับโปรเจกต์ (Settings > Bindings) แล้วกด Retry deployment'); e.code = 'no_db'; throw e; }
  if (ready) return;
  const q = (s) => env.DB.prepare(s).run();
  /* อันดับ: เก็บรอบที่ดีที่สุดของแต่ละเครื่อง */
  await q(`CREATE TABLE IF NOT EXISTS runs (client_id TEXT PRIMARY KEY, nickname TEXT, char_name TEXT, occupation TEXT, province TEXT,
    days INTEGER NOT NULL, cause TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  await q('CREATE INDEX IF NOT EXISTS runs_days ON runs (days DESC, created_at ASC)');
  /* ผู้เล่น (นับจากรหัสสุ่มประจำเครื่อง ไม่มีข้อมูลส่วนตัว) */
  await q(`CREATE TABLE IF NOT EXISTS players (client_id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
    total_sec REAL NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, best_days INTEGER NOT NULL DEFAULT 0, max_chapter INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0, build TEXT, last_screen TEXT)`);
  /* จบรอบ (ตาย/ถึงตอนจบ) สำหรับสถิติเกม */
  await q(`CREATE TABLE IF NOT EXISTS run_ends (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, at INTEGER NOT NULL, kind TEXT, days INTEGER,
    cause TEXT, ending TEXT, chapter INTEGER, occupation TEXT, tier TEXT, a INTEGER, b INTEGER, c INTEGER, d INTEGER, ex_n INTEGER, ex_caught INTEGER, is_admin INTEGER)`);
  await q('CREATE INDEX IF NOT EXISTS run_ends_at ON run_ends (at)');
  ready = true;
}
