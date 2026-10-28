// POST /api/ping — เกมส่งทุก 60 วินาทีระหว่างเล่น และตอนจบรอบ (ไม่มีข้อมูลส่วนตัว มีแค่รหัสสุ่มประจำเครื่อง)
// { client_id, sec, chapter, screen, build, admin, start?, end?: {kind:'dead'|'ending', days, cause, ending, chapter, occ, tier, tally:{A,B,C,D}, exN, exCaught} }
import { json, err, clean, isCid, ensureSchema } from './_lib.js';

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  let b; try { b = await request.json(); } catch (_) { return err('bad_json', 'ข้อมูลไม่ถูกต้อง'); }
  if (!isCid(b.client_id)) return err('bad_id', 'รหัสเครื่องไม่ถูกต้อง');
  const now = Date.now(), sec = Math.min(90, Math.max(0, +b.sec || 0)), ch = Math.min(9, Math.max(0, b.chapter | 0)), adm = b.admin ? 1 : 0;
  await env.DB.prepare(`INSERT INTO players (client_id, first_seen, last_seen, total_sec, runs, max_chapter, is_admin, build, last_screen) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(client_id) DO UPDATE SET last_seen=excluded.last_seen, total_sec=players.total_sec+excluded.total_sec, runs=players.runs+excluded.runs,
    max_chapter=MAX(players.max_chapter, excluded.max_chapter), is_admin=MAX(players.is_admin, excluded.is_admin), build=excluded.build, last_screen=excluded.last_screen`)
    .bind(b.client_id, now, now, sec, b.start ? 1 : 0, ch, adm, clean(b.build, 16), clean(b.screen, 16)).run();
  const e = b.end;
  if (e && (e.kind === 'dead' || e.kind === 'ending')) {
    const days = Math.min(400, Math.max(0, e.days | 0)), t = e.tally || {};
    await env.DB.prepare(`INSERT INTO run_ends (client_id, at, kind, days, cause, ending, chapter, occupation, tier, a, b, c, d, ex_n, ex_caught, is_admin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(b.client_id, now, e.kind, days, clean(e.cause, 20), clean(e.ending, 20), Math.min(9, e.chapter | 0), clean(e.occ), clean(e.tier, 10),
        t.A | 0, t.B | 0, t.C | 0, t.D | 0, e.exN | 0, e.exCaught | 0, adm).run();
    await env.DB.prepare('UPDATE players SET best_days = MAX(best_days, ?) WHERE client_id = ?').bind(days, b.client_id).run();
  }
  return json({ ok: true });
}
