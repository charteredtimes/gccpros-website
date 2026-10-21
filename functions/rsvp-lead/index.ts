// =====================================================================
// rsvp-lead  ·  standalone Supabase Edge Function
// ---------------------------------------------------------------------
// Captures roundtable / focused-event interest (RSVP) from the Insights
// & Events page: stores the lead, emails the team, confirms the person.
// Self-contained; does NOT touch any other function.
//
// Auto-injected env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Reused project secrets: RESEND_API_KEY, RESEND_FROM, GCP_ADMIN_KEY
//
// Actions:
//   POST ?action=submitRSVP      -> store + email team + confirm visitor
//   GET  ?action=adminRSVPs      -> list (header X-Admin-Key)
//   POST ?action=setRSVPStatus   -> triage one row (header X-Admin-Key)
//   GET  ?action=version
//
// 22 Oct 2026. Two additions, both backwards compatible:
//   · `linkedin` is captured on the form and stored. Rows taken before
//     this date have none, which the console shows as a search link.
//   · `setRSVPStatus` exists because there was no way to triage at all:
//     every one of the 117 rows sat at 'new' since the form went live.
// =====================================================================

const SUPA_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_KEY  = Deno.env.get("GCP_ADMIN_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "GCCPROs <admin@gccpros.com>";
const TEAM_TO    = "admin@gccpros.com";

// Must match the rsvp_leads_status_check constraint on the table. Checked here as well so a bad
// value comes back as a clear 400 rather than a Postgres constraint violation surfaced as a 502.
const STATUSES = ["new", "accepted", "rejected", "waitlisted", "vendor", "blocked"];

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
function clean(v: unknown, max = 300): string { return String(v ?? "").trim().slice(0, max); }
function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

// People paste a profile in every shape: with or without the scheme, with tracking query strings,
// sometimes just "in/someone". Store one canonical form so the console can link it directly, and
// store nothing at all rather than something that will not open.
function cleanLinkedIn(v: unknown): string {
  let s = clean(v, 300).replace(/\s+/g, "");
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (/^linkedin\.com\/.+/i.test(s)) return "https://www." + s.replace(/^linkedin\.com/i, "linkedin.com");
  if (/^[a-z]{2,3}\.linkedin\.com\/.+/i.test(s)) return "https://" + s;
  if (/^(in|pub|company)\/[^/]+/i.test(s)) return "https://www.linkedin.com/" + s;
  return "";
}

async function readBody(req: Request): Promise<any> {
  if (req.method === "POST") { try { return await req.json(); } catch (_) { /* ignore */ } }
  return {};
}
async function supa(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  return await fetch(SUPA_URL.replace(/\/+$/, "") + path, {
    method,
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  if (!RESEND_KEY || !to) return false;
  try {
    const payload: Record<string, unknown> = { from: RESEND_FROM, to: [to], subject, html };
    if (replyTo) payload["reply_to"] = replyTo;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch (_) { return false; }
}
function shell(title: string, body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fb;padding:24px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e9f0">
      <div style="background:#0e1b30;color:#fff;padding:20px 26px;font-size:18px;font-weight:700">GCCPROs &middot; Roundtables &amp; Events</div>
      <div style="padding:26px;color:#12203a;font-size:14px;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#0e1b30">${title}</h2>${body}
        <p style="margin-top:22px;color:#5b6b84;font-size:12.5px">GCCPROs &middot; Chartered Times LLP &middot; admin@gccpros.com</p>
      </div>
    </div>
  </div>`;
}

async function handleSubmit(b: any, req: Request): Promise<Response> {
  const email = clean(b?.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400);
  const row = {
    name: clean(b?.name, 160),
    email,
    phone: clean(b?.phone, 40),
    company: clean(b?.company, 200),
    designation: clean(b?.designation, 160),
    org_type: clean(b?.org_type, 60),
    country: clean(b?.country, 80),
    city: clean(b?.city, 80),
    event: clean(b?.event, 120),
    interest: clean(b?.interest, 60),
    topics: clean(b?.topics, 2000),
    linkedin: cleanLinkedIn(b?.linkedin),
    status: "new",
    ip: clientIp(req),
    user_agent: clean(req.headers.get("user-agent"), 400),
    created_at: new Date().toISOString(),
  };
  if (!row.name) return json({ error: "missing_name" }, 400);
  try {
    const ins = await supa("post", "/rest/v1/rsvp_leads", row, { Prefer: "return=minimal" });
    if (!ins.ok) { const t = await ins.text(); return json({ error: "save_failed", details: t.slice(0, 200) }, 502); }

    const teamBody = `<p><b>New roundtable / event interest</b></p>
      <table style="font-size:13.5px;color:#12203a"><tbody>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Name</td><td><b>${esc(row.name)}</b></td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Email</td><td><b>${esc(row.email)}</b></td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Phone</td><td>${esc(row.phone || "-")}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Company</td><td>${esc(row.company || "-")}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Designation</td><td>${esc(row.designation || "-")}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Company type</td><td>${esc(row.org_type || "-")}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">LinkedIn</td><td>${row.linkedin ? `<a href="${esc(row.linkedin)}">${esc(row.linkedin)}</a>` : "-"}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Country</td><td>${esc(row.country || "-")}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Registering for</td><td><b>${esc(row.event || "General interest")}</b></td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">City</td><td>${esc(row.city || "-")}</td></tr>
        <tr><td style="color:#5b6b84;padding:2px 12px 2px 0">Interested in</td><td>${esc(row.interest || "-")}</td></tr>
      </tbody></table>
      ${row.topics ? `<p style="margin-top:10px"><b>Topics / notes:</b> ${esc(row.topics)}</p>` : ""}`;
    const evTag = row.event && row.event !== "General interest" ? row.event : "Roundtable interest";
    await sendEmail(TEAM_TO, `${evTag} - ${row.name}${row.city ? " (" + row.city + ")" : ""}`, shell("New roundtable / event interest", teamBody), row.email);

    const visBody = `<p>Thank you for registering your interest with GCCPROs.</p>
      <p>We have noted your interest in ${esc(row.interest || "our curated roundtables and focused events")}${row.city ? ` in <b>${esc(row.city)}</b>` : ""}, and we will reach out with details as we plan the next sessions.</p>`;
    await sendEmail(row.email, "We received your interest - GCCPROs roundtables & events", shell("You're on the list", visBody));

    return json({ status: "ok" });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

function adminOk(req: Request): boolean {
  const k = (req.headers.get("x-admin-key") ?? "").trim();
  return !!ADMIN_KEY && ADMIN_KEY.length >= 20 && k === ADMIN_KEY;
}

async function handleAdminList(url: URL, req: Request): Promise<Response> {
  if (!adminOk(req)) return json({ error: "unauthorized" }, 401);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5000", 10) || 5000, 10000);
  try {
    const r = await supa("get", `/rest/v1/rsvp_leads?select=*&order=created_at.desc&limit=${limit}`);
    const rows = await r.json();
    return json({ status: "ok", rows: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

// Triage one RSVP. Returns the updated row so the console can repaint from what was actually
// stored rather than from what it hoped it stored.
async function handleSetStatus(b: any, req: Request): Promise<Response> {
  if (!adminOk(req)) return json({ error: "unauthorized" }, 401);
  const id = clean(b?.id, 64);
  const status = clean(b?.status, 20).toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad_id" }, 400);
  if (STATUSES.indexOf(status) < 0) return json({ error: "bad_status", allowed: STATUSES }, 400);
  try {
    const r = await supa(
      "patch",
      `/rest/v1/rsvp_leads?id=eq.${encodeURIComponent(id)}`,
      { status, status_at: new Date().toISOString(), status_by: clean(b?.by, 120) || "admin" },
      { Prefer: "return=representation" },
    );
    if (!r.ok) { const t = await r.text(); return json({ error: "update_failed", details: t.slice(0, 200) }, 502); }
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return json({ error: "not_found" }, 404);
    return json({ status: "ok", row: rows[0] });
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const b = await readBody(req);
  const action = (b?.action ?? url.searchParams.get("action") ?? "").toString();
  try {
    switch (action) {
      case "submitRSVP":    return await handleSubmit(b, req);
      case "adminRSVPs":    return await handleAdminList(url, req);
      case "setRSVPStatus": return await handleSetStatus(b, req);
      case "version":       return json({ build: "rsvp-lead-v1.4", statuses: STATUSES, time: new Date().toISOString() });
      default:              return json({ error: "unknown_action", action }, 400);
    }
  } catch (err) {
    return json({ error: "server_error", message: String((err as any)?.message ?? err) }, 500);
  }
});
