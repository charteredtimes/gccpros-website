// =====================================================================
// book-order  ·  standalone Supabase Edge Function
// ---------------------------------------------------------------------
// Sells the physical book "GCC Industry @ 2030" (Rs.999) via Razorpay.
// Self-contained. Does NOT touch the main gccpros-api function.
//
// Auto-injected env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Reused project secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  (same
//   ones the main function already uses), GCP_ADMIN_KEY (admin list).
//
// Price is fixed server-side (Rs.999) so the client can never change it.
//
// Actions:
//   POST ?action=createOrder     -> validate shipping + create RZP order
//   POST ?action=verifyPayment   -> verify signature, mark paid
//   GET  ?action=adminOrders     -> list orders (header X-Admin-Key)
//   GET  ?action=version
// =====================================================================

const SUPA_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_KEY = Deno.env.get("GCP_ADMIN_KEY") ?? "";
const RZP_ID    = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RZP_SECRET= Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "GCCPROs <admin@gccpros.com>";

const PRICE_PAISE = 99900;            // Rs.999.00 — server-authoritative
const PRODUCT     = "GCC Industry @ 2030";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-admin-key, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}
function clientIp(req: Request): string {
  const h = req.headers; return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
}
function clean(v: unknown, max = 400): string { return String(v ?? "").trim().slice(0, max); }

async function readBody(req: Request, url: URL): Promise<URLSearchParams> {
  const p = new URLSearchParams(url.search);
  if (req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const b = await req.json();
        for (const k of Object.keys(b ?? {})) p.set(k, String(b[k]));
      } else {
        const bp = new URLSearchParams(await req.text());
        for (const [k, v] of bp.entries()) p.set(k, v);
      }
    } catch (_) { /* ignore */ }
  }
  return p;
}

async function supa(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  return await fetch(SUPA_URL.replace(/\/+$/, "") + path, {
    method,
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    return r.ok;
  } catch (_) { return false; }
}

function emailShell(title: string, body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fb;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e9f0">
      <div style="background:#0e1b30;color:#fff;padding:20px 26px;font-size:18px;font-weight:700">GCCPROs</div>
      <div style="padding:26px;color:#12203a;font-size:14px;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#0e1b30">${title}</h2>${body}
        <p style="margin-top:22px;color:#5b6b84;font-size:12.5px">GCCPROs &middot; Chartered Times LLP &middot; admin@gccpros.com</p>
      </div>
    </div>
  </div>`;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

async function handleCreateOrder(p: URLSearchParams, req: Request): Promise<Response> {
  if (!RZP_ID || !RZP_SECRET) return json({ error: "razorpay_not_configured" }, 500);

  const row = {
    product: PRODUCT,
    buyer_name: clean(p.get("buyer_name") ?? p.get("name"), 160),
    email: clean(p.get("email"), 160).toLowerCase(),
    phone: clean(p.get("phone"), 40),
    address: clean(p.get("address"), 600),
    city: clean(p.get("city"), 120),
    state: clean(p.get("state"), 120),
    pincode: clean(p.get("pincode"), 12),
    address_type: clean(p.get("address_type"), 20) || "Home",
    delivery_days: clean(p.get("delivery_days"), 40) || "Any Day",
    delivery_time: clean(p.get("delivery_time"), 40) || "9 AM to 9 PM",
    qty: 1,
    amount_paise: PRICE_PAISE,
    currency: "INR",
    status: "pending",
    ship_status: "not_shipped",
    ip: clientIp(req),
    user_agent: clean(req.headers.get("user-agent"), 400),
    created_at: new Date().toISOString(),
  };

  // Minimal validation
  const missing: string[] = [];
  if (!row.buyer_name) missing.push("name");
  if (!/^\S+@\S+\.\S+$/.test(row.email)) missing.push("email");
  if (row.phone.replace(/\D/g, "").length < 8) missing.push("phone");
  if (!row.address || row.address.length < 8) missing.push("address");
  if (!/^\d{5,6}$/.test(row.pincode)) missing.push("pincode");
  if (missing.length) return json({ error: "invalid_fields", fields: missing }, 400);

  try {
    // 1) Create Razorpay order (amount fixed server-side)
    const auth = "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`);
    const receipt = "book_" + Date.now();
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: PRICE_PAISE, currency: "INR", receipt,
        notes: { product: PRODUCT, email: row.email, phone: row.phone },
      }),
    });
    const order = await r.json();
    if (!r.ok || !order?.id) return json({ error: "order_failed", details: JSON.stringify(order).slice(0, 200) }, 502);

    // 2) Persist a pending order with shipping details
    const ins = await supa("post", "/rest/v1/book_orders", { ...row, razorpay_order_id: order.id }, { Prefer: "return=minimal" });
    if (!ins.ok) {
      const t = await ins.text();
      return json({ error: "save_failed", status: ins.status, details: t.slice(0, 200) }, 502);
    }

    return json({ status: "ok", order_id: order.id, amount: PRICE_PAISE, currency: "INR", key_id: RZP_ID, product: PRODUCT });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

async function handleVerify(p: URLSearchParams): Promise<Response> {
  if (!RZP_ID || !RZP_SECRET) return json({ error: "razorpay_not_configured" }, 500);
  const orderId = clean(p.get("razorpay_order_id"), 80);
  const paymentId = clean(p.get("razorpay_payment_id"), 80);
  const signature = clean(p.get("razorpay_signature"), 200);
  if (!orderId || !paymentId || !signature) return json({ error: "missing_params" }, 400);

  const expected = await hmacHex(RZP_SECRET, orderId + "|" + paymentId);
  if (expected !== signature) return json({ error: "signature_mismatch" }, 400);

  try {
    const patch = await supa(
      "patch",
      `/rest/v1/book_orders?razorpay_order_id=eq.${encodeURIComponent(orderId)}`,
      { status: "paid", razorpay_payment_id: paymentId, paid_at: new Date().toISOString() },
      { Prefer: "return=representation" },
    );
    if (!patch.ok) {
      const t = await patch.text();
      return json({ error: "update_failed", status: patch.status, details: t.slice(0, 200) }, 502);
    }
    try {
      const rows = await patch.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.email) {
        const addr = [row.address, row.city, row.state].filter(Boolean).join(", ") + (row.pincode ? " - " + row.pincode : "");
        const body = `<p>Dear ${row.buyer_name || "Reader"},</p>
          <p>Thank you for your order. Your copy of <b>GCC Industry @ 2030</b> (Rs.999) is <b>confirmed</b> and will be dispatched within <b>3 working days</b>.</p>
          <p style="background:#f6f9fe;border:1px solid #e5e9f0;border-radius:8px;padding:12px"><b>Shipping to:</b><br>${addr}</p>
          <p>We will email you again as soon as it is dispatched.</p>`;
        await sendEmail(row.email, "Order confirmed - GCC Industry @ 2030", emailShell("Your order is confirmed", body));
      }
    } catch (_) { /* email best-effort */ }
    return json({ status: "ok", message: "Payment verified. Your book ships within 3 working days." });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

async function handleAdminList(url: URL, req: Request): Promise<Response> {
  const k = (req.headers.get("x-admin-key") ?? "").trim();
  if (!ADMIN_KEY || ADMIN_KEY.length < 20 || k !== ADMIN_KEY) return json({ error: "unauthorized" }, 401);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "3000", 10) || 3000, 10000);
  try {
    const r = await supa("get", `/rest/v1/book_orders?select=*&order=created_at.desc&limit=${limit}`);
    const rows = await r.json();
    return json({ status: "ok", rows: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

async function handleMarkDispatched(p: URLSearchParams, req: Request): Promise<Response> {
  const k = (req.headers.get("x-admin-key") ?? "").trim();
  if (!ADMIN_KEY || ADMIN_KEY.length < 20 || k !== ADMIN_KEY) return json({ error: "unauthorized" }, 401);
  const id = clean(p.get("id"), 60);
  if (!id) return json({ error: "missing_id" }, 400);
  const tracking = clean(p.get("tracking") ?? p.get("tracking_number"), 120);
  const courier  = clean(p.get("courier") ?? p.get("shipping_company"), 120);
  const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  try {
    const update: Record<string, unknown> = { ship_status: "dispatched", dispatched_at: new Date().toISOString() };
    if (tracking) update.tracking_number = tracking;
    if (courier)  update.courier = courier;
    const patch = await supa("patch", `/rest/v1/book_orders?id=eq.${encodeURIComponent(id)}`,
      update, { Prefer: "return=representation" });
    if (!patch.ok) { const t = await patch.text(); return json({ error: "update_failed", details: t.slice(0, 200) }, 502); }
    const rows = await patch.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    let emailed = false;
    if (row && row.email) {
      const trackBlock = (tracking || courier)
        ? `<table style="margin:14px 0;border-collapse:collapse;font-size:14px">
             ${courier ? `<tr><td style="padding:4px 14px 4px 0;color:#5b6b84">Courier / shipping company</td><td style="font-weight:700">${esc(courier)}</td></tr>` : ""}
             ${tracking ? `<tr><td style="padding:4px 14px 4px 0;color:#5b6b84">Tracking number</td><td style="font-weight:700">${esc(tracking)}</td></tr>` : ""}
           </table>
           <p style="color:#5b6b84;font-size:13px">You can track your parcel on the ${courier ? esc(courier) + " " : ""}website using the tracking number above.</p>`
        : "";
      const body = `<p>Dear ${esc(row.buyer_name || "Reader")},</p>
        <p>Good news - your copy of <b>GCC Industry @ 2030</b> has been <b>dispatched</b> and is on its way to you.</p>
        ${trackBlock}
        <p>Thank you for your order.</p>`;
      emailed = await sendEmail(row.email, "Your GCC Industry @ 2030 order has been dispatched", emailShell("Your order has been dispatched", body));
    }
    return json({ status: "ok", emailed, tracking_number: tracking || null, courier: courier || null });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const p = await readBody(req, url);
  const action = p.get("action") ?? url.searchParams.get("action") ?? "";
  try {
    switch (action) {
      case "createOrder":    return await handleCreateOrder(p, req);
      case "verifyPayment":  return await handleVerify(p);
      case "adminOrders":    return await handleAdminList(url, req);
      case "markDispatched": return await handleMarkDispatched(p, req);
      case "version":        return json({ build: "book-order-v1.3", price_paise: PRICE_PAISE, time: new Date().toISOString() });
      default:               return json({ error: "unknown_action", action }, 400);
    }
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
});
