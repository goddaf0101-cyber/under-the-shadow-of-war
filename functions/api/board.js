// อันดับออนไลน์ · รอดนานที่สุด (หนึ่งแถวต่อเครื่อง เก็บรอบที่ดีที่สุด)
// GET  /api/board?n=20&me=<client_id>   → { ok, rows:[{nick,name,occ,province,days,cause,mine}] }
// POST /api/board { client_id, nickname, char_name, occupation, province, days, cause }
import { json, err, clean, isCid, ensureSchema } from './_lib.js';

export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = new URL(request.url), n = Math.min(50, Math.max(1, +u.searchParams.get('n') || 20)), me = u.searchParams.get('me') || '';
  const r = await env.DB.prepare('SELECT client_id, nickname, char_name, occupation, province, days, cause FROM runs ORDER BY days DESC, created_at ASC LIMIT ?').bind(n).all();
  const rows = (r.results || []).map((x) => ({ nick: x.nickname || '', name: x.char_name || '', occ: x.occupation || '', province: x.province || '', days: x.days | 0, cause: x.cause || '', mine: !!me && x.client_id === me }));
  return json({ ok: true, rows });
}

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  let b; try { b = await request.json(); } catch (_) { return err('bad_json', 'ข้อมูลไม่ถูกต้อง'); }
  if (!isCid(b.client_id)) return err('bad_id', 'รหัสเครื่องไม่ถูกต้อง');
  const days = Math.floor(+b.days);
  if (!(days >= 0 && days <= 400)) return err('bad_days', 'จำนวนวันไม่ถูกต้อง');
  const nick = clean(b.nickname, 20);
  if (!nick) return err('no_nick', 'ใส่ชื่อเล่นก่อนส่ง');
  const now = Date.now();
  const cur = await env.DB.prepare('SELECT days, updated_at FROM runs WHERE client_id = ?').bind(b.client_id).first();
  if (cur && now - cur.updated_at < 10e3) return err('slow_down', 'ส่งถี่เกินไป รอสักครู่', 429);
  /* เก็บรอบที่ดีกว่าเท่านั้น แต่อัปเดตชื่อเล่นได้เสมอ */
  if (cur && days <= cur.days) {
    await env.DB.prepare('UPDATE runs SET nickname = ?, updated_at = ? WHERE client_id = ?').bind(nick, now, b.client_id).run();
    return json({ ok: true, kept: true });
  }
  await env.DB.prepare(`INSERT INTO runs (client_id, nickname, char_name, occupation, province, days, cause, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(client_id) DO UPDATE SET nickname=excluded.nickname, char_name=excluded.char_name, occupation=excluded.occupation, province=excluded.province,
    days=excluded.days, cause=excluded.cause, created_at=excluded.created_at, updated_at=excluded.updated_at`)
    .bind(b.client_id, nick, clean(b.char_name), clean(b.occupation), clean(b.province), days, clean(b.cause, 60), now, now).run();
  return json({ ok: true });
}
