// Digigenda: pushmeldingen versturen.
// - Geplande controle (pg_cron, elke 5 min): POST {"cron":true} met header x-digigenda-geheim
// - Testmelding vanuit de app: POST {"test":true,"token":"<inlogbewijs>"}
import { stuur } from "./webpush.js";

const SITE = "https://fiete-onderw.github.io/toetsroosterpabo3/";
const TOEGESTAAN = ["https://fiete-onderw.github.io"];

function cors(req: Request) {
  const herkomst = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": TOEGESTAAN.includes(herkomst) ? herkomst : TOEGESTAAN[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

async function rpc(naam: string, args: Record<string, unknown> = {}) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const sleutel = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const kop: Record<string, string> = { apikey: sleutel, "Content-Type": "application/json" };
  if (sleutel.startsWith("eyJ")) kop.Authorization = "Bearer " + sleutel;
  const r = await fetch(url + "/rest/v1/rpc/" + naam, { method: "POST", headers: kop, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(naam + ": " + r.status);
  return r.json();
}

type Melding = { endpoint: string; p256dh: string; auth: string; titel: string; tekst: string; tag?: string };

async function verstuur(lijst: Melding[], sl: { publiek: string; priveJwk: JsonWebKey }) {
  const vapid = { publiek: sl.publiek, priveJwk: sl.priveJwk, onderwerp: SITE };
  let gelukt = 0, mislukt = 0;
  await Promise.all(lijst.map(async (m) => {
    try {
      const status = await stuur(m, { titel: m.titel, tekst: m.tekst, tag: m.tag, url: SITE }, vapid);
      if (status === 404 || status === 410) { await rpc("kal_push_ongeldig", { p_endpoint: m.endpoint }); mislukt++; }
      else if (status >= 200 && status < 300) gelukt++;
      else mislukt++;
    } catch (_e) { mislukt++; }
  }));
  return { gelukt, mislukt };
}

Deno.serve(async (req: Request) => {
  const kop = cors(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...kop, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: kop });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { /* leeg */ }

  try {
    const sl = await rpc("kal_meldingen_sleutels");
    if (body.cron === true) {
      if (req.headers.get("x-digigenda-geheim") !== sl.geheim) return json({ ok: false }, 401);
      const lijst = await rpc("kal_meldingen_ophalen") as Melding[];
      return json({ ok: true, aantal: lijst.length, ...(await verstuur(lijst, sl)) });
    }
    if (body.test === true && typeof body.token === "string" && /^[0-9a-f-]{36}$/.test(body.token)) {
      const r = await rpc("kal_push_test_doelen", { p_token: body.token });
      if (!r.ok) return json({ ok: false, sessie: false });
      if (!r.doelen.length) return json({ ok: false, fout: "Op dit account staan nog geen meldingen aan." });
      const lijst = r.doelen.map((d: Melding) => ({ ...d, titel: "Digigenda", tekst: "Meldingen werken! Je krijgt een seintje vóór een afspraak en 's ochtends je dagoverzicht.", tag: "test" }));
      return json({ ok: true, ...(await verstuur(lijst, sl)) });
    }
    return json({ ok: false }, 400);
  } catch (_e) {
    return json({ ok: false, fout: "De meldingenserver gaf een fout." }, 500);
  }
});
