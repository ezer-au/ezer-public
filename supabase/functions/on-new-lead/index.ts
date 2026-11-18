// EZER Co — on-new-lead
// Runs on every insert into public.leads (called by the leads_notify trigger via pg_net).
// Sends: (1) a warm reply to the person, if they gave an email, carrying the AI-for-churches guide;
//        (2) a new-lead notification to EZER.
// Security: the caller only passes a lead id. The function re-reads that row with the service role
// and only acts on a row that is under 15 minutes old and not yet emailed, so a spoofed call can't
// send anything a real form submission couldn't. Secrets live in Supabase Edge Function secrets only:
//   RESEND_API_KEY (required), EMAIL_FROM and OWNER_EMAIL (optional overrides).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") ?? "EZER Co <hello@ezerco.au>";
const OWNER = Deno.env.get("OWNER_EMAIL") ?? "hello@ezerco.au";
const GUIDE_URL = "https://ezerco.au/ezer-ai-guide.html";
const DASHBOARD = "https://supabase.com/dashboard/project/itlhvbugfkdkesivxakz/editor";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const SIZE: Record<string, string> = {
  under_50: "Under 50", "50_100": "50–100", "100_150": "100–150", "150_200": "150–200",
  "200_300": "200–300", "300_500": "300–500", "500_1000": "500–1000", "1000_plus": "1000+",
};

type Rank = { id: string; name: string; score: number };

function wrap(inner: string) {
  return `<div style="font-family:Georgia,serif;background:#F2EDE4;padding:28px 0">
  <div style="max-width:560px;margin:0 auto;background:#FBF8F3;border-radius:10px;padding:28px 26px;color:#2A2420;font-size:16px;line-height:1.55">
  ${inner}
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#9B8D85;margin-top:28px;border-top:1px solid #E8E0D3;padding-top:12px">
  EZER Co · ezerco.au · This email was sent automatically and written with AI, directed and owned by Ryan. Just reply to reach a real person.</p>
  </div></div>`;
}

function replyEmail(lead: any) {
  const a = lead.answers ?? {};
  const ranking: Rank[] = Array.isArray(a.ranking) ? a.ranking.slice(0, 3) : [];
  const isSurvey = lead.source === "operations-survey";
  const subject = isSurvey ? "Thanks for doing the EZER operations survey" : "Your EZER Diagnosis summary";
  const areas = ranking.length
    ? `<p>From your answers, the areas carrying the most friction right now look like:</p>
       <ol>${ranking.map((r) => `<li><strong>${esc(r.name)}</strong></li>`).join("")}</ol>
       <p>That's not a verdict, just a starting point for a conversation.</p>`
    : "";
  const html = wrap(`
    <p>Hi${a.church ? ` from ${esc(a.church)}` : ""},</p>
    <p>${isSurvey
      ? "Thank you for taking the time to do the survey. Every response helps build a clearer picture of how Australian church offices actually run."
      : "Thanks for taking the EZER Diagnosis. It takes honesty to look at how things are really going, and you did that."}</p>
    ${areas}
    <p>As promised, here's a free resource: <a href="${GUIDE_URL}" style="color:#B5674A"><strong>Using AI Well in Your Church</strong></a>, a plain-English guide with simple ground rules your team can use straight away.</p>
    <p>If you'd like a hand with anything, just reply to this email. No pressure and no sales pitch.</p>
    <p>Grace and peace,<br>Ryan<br>EZER Co</p>`);
  return { subject, html };
}

function ownerEmail(lead: any) {
  const a = lead.answers ?? {};
  const ranking: Rank[] = Array.isArray(a.ranking) ? a.ranking : [];
  const who = a.church || lead.email || "Anonymous";
  const row = (k: string, v: unknown) =>
    v == null || v === "" ? "" : `<tr><td style="padding:3px 12px 3px 0;color:#5C4E47">${k}</td><td>${esc(v)}</td></tr>`;
  const triage = Array.isArray(lead.triage) ? lead.triage.join(", ") : lead.triage;
  const html = wrap(`
    <p style="font-size:18px"><strong>New lead: ${esc(who)}</strong></p>
    <table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">
      ${row("Source", lead.source)}${row("Email", lead.email)}${row("Church", a.church)}
      ${row("Size", SIZE[a.church_size] ?? a.church_size)}${row("State", a.state)}
      ${row("Denomination", a.denomination)}${row("Deep-dive areas", triage)}
      ${row("Research consent", a.research_consent === false ? "No" : "Yes")}
      ${row("Received", new Date(lead.created_at).toLocaleString("en-AU", { timeZone: "Australia/Adelaide" }))}
    </table>
    ${ranking.length ? `<p><strong>Friction ranking</strong> (1–10, higher = more need)</p>
      <ol style="font-family:Arial,sans-serif;font-size:14px">${ranking.map((r) => `<li>${esc(r.name)}: ${esc(r.score)}</li>`).join("")}</ol>` : ""}
    ${a.other_data_wanted ? `<p><strong>Feedback:</strong> ${esc(a.other_data_wanted)}</p>` : ""}
    <p><a href="${DASHBOARD}" style="color:#B5674A">Open the leads table</a> for full answers.</p>`);
  return { subject: `New EZER lead: ${who} (${lead.source})`, html };
}

async function send(to: string, mail: { subject: string; html: string }, replyTo?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: mail.subject, html: mail.html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let id: unknown;
  try { ({ id } = await req.json()); } catch { return json({ error: "bad request" }, 400); }
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad id" }, 400);

  // Claim the row atomically: only a fresh, not-yet-emailed lead gets through, exactly once.
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: lead, error } = await sb.from("leads")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", id).is("emailed_at", null).gte("created_at", since)
    .select().maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!lead) return json({ skipped: true });

  const problems: string[] = [];
  if (!RESEND_KEY) problems.push("RESEND_API_KEY not set");
  else {
    if (lead.email) {
      try { await send(lead.email, replyEmail(lead), OWNER); } catch (e) { problems.push(`reply: ${(e as Error).message}`); }
    }
    try { await send(OWNER, ownerEmail(lead)); } catch (e) { problems.push(`owner: ${(e as Error).message}`); }
  }
  if (problems.length) {
    await sb.from("leads").update({ email_error: problems.join(" | ") }).eq("id", id);
    return json({ ok: false, problems }, 500);
  }
  return json({ ok: true });
});
