// GET /api/online — จำนวนคนที่เล่นอยู่ (ส่งสัญญาณเข้ามาภายใน 2 นาที) ไม่ต้องล็อกอิน
import { json, ensureSchema } from './_lib.js';
export async function onRequestGet({ env }) {
  await ensureSchema(env);
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ? AND is_admin = 0').bind(Date.now() - 120e3).first();
  return json({ ok: true, online: (r && r.n) || 0 });
}
