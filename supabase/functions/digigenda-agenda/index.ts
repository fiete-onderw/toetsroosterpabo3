// Digigenda: agenda-abonnement (.ics) voor iPhone/Mac Agenda en Google Agenda.
// Aanroep: GET /functions/v1/digigenda-agenda?code=<geheime code>
import { leesPlanning, maakIcs } from "./kern.js";

const TOETSEN_URL = "https://fiete-onderw.github.io/toetsroosterpabo3/toetsen.js";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  if (!/^[a-f0-9]{32,64}$/.test(code)) {
    return new Response("Deze agenda-link is ongeldig.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const supa = Deno.env.get("SUPABASE_URL") ?? "";
  const sleutel = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const r = await fetch(supa + "/rest/v1/rpc/kal_ics_data", {
    method: "POST",
    headers: { apikey: sleutel, Authorization: "Bearer " + sleutel, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code })
  });
  if (!r.ok) return new Response("De agenda is even niet bereikbaar.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const data = await r.json();
  if (!data || !data.ok) {
    return new Response("Deze agenda-link werkt niet (meer). Maak in Digigenda een nieuwe link.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const inst = data.instellingen || {};
  const agendas = Array.isArray(inst.agendas) && inst.agendas.length ? inst.agendas : ["school"];
  let planning = null;
  if (inst.pabo !== false && agendas.includes("school")) {
    try {
      const t = await fetch(TOETSEN_URL);
      if (t.ok) planning = leesPlanning(await t.text());
    } catch (_e) { /* zonder toetsen verder */ }
  }

  return new Response(maakIcs(data, planning, new Date()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="digigenda.ics"',
      "Cache-Control": "no-store"
    }
  });
});
