// ดักข้อผิดพลาดของทุกเส้นทาง /api ให้ตอบเป็น JSON บอกสาเหตุ แทนหน้า Error 1101 ของ Cloudflare (28 ต.ค.)
export async function onRequest(ctx) {
  try { return await ctx.next(); }
  catch (e) {
    return new Response(JSON.stringify({ ok: false, code: (e && e.code) || 'server_error', message: String((e && e.message) || e) }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
