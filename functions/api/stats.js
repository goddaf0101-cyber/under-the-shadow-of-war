// GET /api/stats — สถิติสำหรับผู้ดูแล · ต้องส่ง header "x-admin-key" ตรงกับตัวแปร ADMIN_KEY ใน Cloudflare (Settings > Variables, แบบ Secret)
import { json, err, ensureSchema, midnightTH } from './_lib.js';

const ONLINE_MS = 120e3, REAL_SEC = 180;

export async function onRequestGet({ request, env }) {
  const key = request.headers.get('x-admin-key') || '';
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return err('forbidden', 'รหัสผู้ดูแลไม่ถูกต้อง', 403);
  await ensureSchema(env);
  const db = env.DB, now = Date.now(), mid = midnightTH(now), on = now - ONLINE_MS, d1 = now - 86400e3;
  const all = (q, ...a) => db.prepare(q).bind(...a).all().then((r) => r.results || []);
  const one = (q, ...a) => db.prepare(q).bind(...a).first();
  /* คนเล่นจริง = เล่นรวมเกิน 3 นาที ไม่นับเครื่องผู้ดูแล · เหมือนหน้าผู้ดูแลของ Wuxian */
  const c = await one(`SELECT COUNT(*) AS total,
      SUM(last_seen > ?) AS online, SUM(last_seen > ?) AS today, SUM(last_seen > ?) AS d1, SUM(first_seen > ?) AS newToday,
      SUM(is_admin = 1) AS adminDev,
      SUM(is_admin = 0 AND total_sec >= ${REAL_SEC}) AS realPlay,
      SUM(is_admin = 0 AND total_sec >= ${REAL_SEC} AND last_seen > ?) AS realOnline,
      SUM(is_admin = 0 AND total_sec >= ${REAL_SEC} AND first_seen > ?) AS realToday,
      SUM(is_admin = 0 AND runs = 0) AS openedOnly,
      SUM(is_admin = 0 AND runs > 0 AND total_sec < ${REAL_SEC}) AS shortPlay,
      SUM(is_admin = 0 AND max_chapter >= 2) AS ch2, SUM(is_admin = 0 AND max_chapter >= 3) AS ch3, SUM(is_admin = 0 AND max_chapter >= 4) AS ch4,
      MAX(best_days) AS bestDays
    FROM players`, on, mid, d1, mid, on, mid);
  const play = await one(`SELECT SUM(total_sec < 180) AS m3, SUM(total_sec >= 180 AND total_sec < 600) AS m10, SUM(total_sec >= 600 AND total_sec < 1800) AS m30,
      SUM(total_sec >= 1800 AND total_sec < 3600) AS m60, SUM(total_sec >= 3600) AS m60p FROM players WHERE is_admin = 0 AND runs > 0`);
  /* สถิติเกม (ไม่นับผู้ดูแล) */
  const W = 'FROM run_ends WHERE is_admin = 0';
  const ends = await one(`SELECT COUNT(*) AS n, SUM(kind = 'ending') AS endings, ROUND(AVG(days),1) AS avgDays, SUM(at > ?) AS today,
      SUM(a) AS A, SUM(b) AS B, SUM(c) AS C, SUM(d) AS D, SUM(ex_n) AS exN, SUM(ex_caught) AS exCaught ${W}`, mid);
  const daysBuckets = await one(`SELECT SUM(days < 10) AS d10, SUM(days >= 10 AND days < 30) AS d30, SUM(days >= 30 AND days < 60) AS d60,
      SUM(days >= 60 AND days < 100) AS d100, SUM(days >= 100) AS d100p ${W}`);
  const causes = await all(`SELECT cause, COUNT(*) AS n ${W} AND kind = 'dead' GROUP BY cause ORDER BY n DESC LIMIT 10`);
  const endingsBy = await all(`SELECT ending, COUNT(*) AS n ${W} AND kind = 'ending' GROUP BY ending ORDER BY n DESC`);
  const chapters = await all(`SELECT chapter, COUNT(*) AS n, ROUND(AVG(days),1) AS avgDays ${W} GROUP BY chapter ORDER BY chapter`);
  const occ = await all(`SELECT occupation, tier, COUNT(*) AS n, ROUND(AVG(days),1) AS avgDays, MAX(days) AS best ${W} GROUP BY occupation ORDER BY avgDays DESC`);
  const screens = await all(`SELECT COALESCE(last_screen,'-') AS s, COUNT(*) AS n, ROUND(AVG(total_sec)/60.0,1) AS avgMin FROM players WHERE is_admin = 0 AND last_seen < ? GROUP BY s ORDER BY n DESC LIMIT 10`, now - 1800e3);
  const builds = await all('SELECT COALESCE(build,\'-\') AS b, COUNT(*) AS n, SUM(last_seen > ?) AS today FROM players WHERE is_admin = 0 GROUP BY b ORDER BY n DESC LIMIT 6', mid);
  const top = await all('SELECT nickname, char_name, occupation, days, cause FROM runs ORDER BY days DESC, created_at ASC LIMIT 10');
  return json({ ok: true, now, counts: c, play, ends, daysBuckets, causes, endingsBy, chapters, occ, screens, builds, top });
}
