// Digigenda: agenda's binnenhalen via een link (webcal/https → .ics).
// - Voorbeeld vanuit de app:   POST {"token":"<inlogbewijs>","url":"https://…"}            → afspraken om te bekijken
// - Verversen vanuit de app:   POST {"token":"<inlogbewijs>","id":"imp-…"}                → haalt de link op en bewaart
// - Geplande verversing:       POST {"cron":true} met header x-digigenda-geheim             → alle link-imports die toe zijn aan verversing
//
// Beveiliging (SSRF): alleen https op poort 443, geen gebruikersnaam/wachtwoord in de link, geen privé-, loopback- of
// link-local-adressen (ook niet via DNS of via een redirect), maximaal 3 redirects, 2 MB en 15 seconden.
import "./ics.js";

const ICS = (globalThis as unknown as { ICS: { lees: (t: string, o: Record<string, unknown>) => Uitkomst; naarOpdracht: (v: Voorval, bron: string, agenda: string, bezet: boolean) => Record<string, unknown> } }).ICS;
type Voorval = { sleutel: string; titel: string; datum: string; tijd: string | null; eind: string | null; heledag: boolean };
type Uitkomst = { ok: boolean; fout?: string; naam?: string; aantalAfspraken?: number; voorvallen: Voorval[]; meldingen: string[] };

const TOEGESTAAN = ["https://fiete-onderw.github.io"];
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 1500;

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

// ---------- SSRF-controles ----------
function priveIpv4(ip: string): boolean {
  const d = ip.split(".").map(Number);
  if (d.length !== 4 || d.some((x) => isNaN(x) || x < 0 || x > 255)) return true;
  const [a, b] = d;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51)
    || (a === 203 && b === 0) || a >= 224;
}
function priveIpv6(ip: string): boolean {
  const l = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (l === "::" || l === "::1") return true;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l) || /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(l);
  if (v4) return priveIpv4(v4[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(l)) return true;   // ipv4-mapped in hex: niet te beoordelen → weigeren
  const eerste = l.split(":")[0];
  if (/^f[cd]/.test(eerste)) return true;          // fc00::/7 (uniek lokaal)
  if (/^fe[89ab]/.test(eerste)) return true;       // fe80::/10 (link-local)
  if (/^fec/.test(eerste)) return true;            // fec0::/10 (site-local, verouderd)
  if (/^ff/.test(eerste)) return true;             // multicast
  if (eerste === "2001" && l.startsWith("2001:db8")) return true;
  return false;
}
const isIpv4 = (s: string) => /^\d+\.\d+\.\d+\.\d+$/.test(s);
const isIpv6 = (s: string) => s.includes(":");
function priveIp(ip: string): boolean { return isIpv4(ip) ? priveIpv4(ip) : priveIpv6(ip); }

function controleerUrl(invoer: string): { url: URL } | { fout: string } {
  let s = String(invoer || "").trim().replace(/^webcal:\/\//i, "https://");
  if (/^http:\/\//i.test(s)) return { fout: "Alleen beveiligde links (https:// of webcal://) zijn toegestaan." };
  let url: URL;
  try { url = new URL(s); } catch (_e) { return { fout: "Dit is geen geldige link." }; }
  if (url.protocol !== "https:") return { fout: "Alleen beveiligde links (https:// of webcal://) zijn toegestaan." };
  if (url.username || url.password) return { fout: "Een link met gebruikersnaam of wachtwoord erin is niet toegestaan." };
  if (url.port && url.port !== "443") return { fout: "Alleen de standaardpoort (443) is toegestaan." };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa") || !host.includes(".") && !isIpv6(host)) {
    return { fout: "Deze link verwijst naar een intern adres en is niet toegestaan." };
  }
  const kaal = host.replace(/^\[|\]$/g, "");
  if ((isIpv4(kaal) || isIpv6(kaal)) && priveIp(kaal)) return { fout: "Deze link verwijst naar een intern adres en is niet toegestaan." };
  if (s.length > 2000) return { fout: "De link is te lang." };
  return { url };
}

// Alle IP-adressen van een host; elk adres moet publiek zijn
async function losOp(host: string): Promise<string[]> {
  const kaal = host.replace(/^\[|\]$/g, "");
  if (isIpv4(kaal) || isIpv6(kaal)) return [kaal];
  const adressen: string[] = [];
  for (const soort of ["A", "AAAA"] as const) {
    try { adressen.push(...(await Deno.resolveDns(kaal, soort))); } catch (_e) { /* geen records van dit soort */ }
  }
  if (!adressen.length) throw new Error("De naam van de server is niet gevonden (" + kaal + ").");
  for (const a of adressen) if (priveIp(a)) throw new Error("Deze link verwijst naar een intern adres en is niet toegestaan.");
  return adressen;
}

// Eén HTTP-verzoek rechtstreeks naar het gecontroleerde IP-adres (zodat DNS niet tussendoor kan veranderen)
async function verzoek(url: URL, ip: string, signaal: AbortSignal): Promise<{ status: number; koppen: Record<string, string>; body: Uint8Array }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // deno-lint-ignore no-explicit-any
  const D = Deno as any;
  if (typeof D.connectTls !== "function") {
    // Zonder ruwe verbinding: gewone fetch (DNS is al gecontroleerd; redirects handmatig)
    const r = await fetch(url.toString(), { redirect: "manual", signal: signaal, headers: { "Accept": "text/calendar, text/plain;q=0.8, */*;q=0.5", "User-Agent": "Digigenda/1.0 (+https://fiete-onderw.github.io/toetsroosterpabo3/)" } });
    const koppen: Record<string, string> = {};
    r.headers.forEach((v, k) => { koppen[k.toLowerCase()] = v; });
    const body = await leesMax(r.body, signaal);
    return { status: r.status, koppen, body };
  }
  const conn = await D.connectTls({ hostname: ip, port: 443, serverName: host });
  const sluit = () => { try { conn.close(); } catch (_e) { /* al dicht */ } };
  signaal.addEventListener("abort", sluit);
  try {
    const pad = url.pathname + url.search;
    const vraag = "GET " + pad + " HTTP/1.1\r\nHost: " + host + "\r\nUser-Agent: Digigenda/1.0 (+https://fiete-onderw.github.io/toetsroosterpabo3/)\r\n" +
      "Accept: text/calendar, text/plain;q=0.8, */*;q=0.5\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n";
    await conn.write(new TextEncoder().encode(vraag));
    const delen: Uint8Array[] = [];
    let totaal = 0;
    const buf = new Uint8Array(64 * 1024);
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      delen.push(buf.slice(0, n));
      totaal += n;
      if (totaal > MAX_BYTES + 64 * 1024) throw new Error("Het bestand is groter dan 2 MB.");
    }
    const alles = plak(delen);
    const grens = zoekKopEinde(alles);
    if (grens < 0) throw new Error("De server gaf geen geldig antwoord.");
    const kopTekst = new TextDecoder("latin1").decode(alles.slice(0, grens));
    const regels = kopTekst.split("\r\n");
    const status = parseInt((regels[0] || "").split(" ")[1] || "0", 10);
    const koppen: Record<string, string> = {};
    regels.slice(1).forEach((r) => { const i = r.indexOf(":"); if (i > 0) koppen[r.slice(0, i).trim().toLowerCase()] = r.slice(i + 1).trim(); });
    let body = alles.slice(grens + 4);
    if ((koppen["transfer-encoding"] || "").toLowerCase().includes("chunked")) body = ontChunk(body);
    const enc = (koppen["content-encoding"] || "").toLowerCase();
    if (enc === "gzip" || enc === "deflate") body = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream(enc))).arrayBuffer());
    if (body.length > MAX_BYTES) throw new Error("Het bestand is groter dan 2 MB.");
    return { status, koppen, body };
  } finally { signaal.removeEventListener("abort", sluit); sluit(); }
}
function plak(delen: Uint8Array[]): Uint8Array {
  const n = delen.reduce((a, d) => a + d.length, 0); const uit = new Uint8Array(n); let i = 0;
  for (const d of delen) { uit.set(d, i); i += d.length; }
  return uit;
}
function zoekKopEinde(b: Uint8Array): number {
  for (let i = 0; i + 3 < b.length; i++) if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i;
  return -1;
}
function ontChunk(b: Uint8Array): Uint8Array {
  const uit: Uint8Array[] = [];
  let i = 0;
  while (i < b.length) {
    let j = i;
    while (j + 1 < b.length && !(b[j] === 13 && b[j + 1] === 10)) j++;
    const maat = parseInt(new TextDecoder("latin1").decode(b.slice(i, j)).split(";")[0].trim(), 16);
    if (isNaN(maat) || maat === 0) break;
    uit.push(b.slice(j + 2, j + 2 + maat));
    i = j + 2 + maat + 2;
  }
  return plak(uit);
}
async function leesMax(stream: ReadableStream<Uint8Array> | null, signaal: AbortSignal): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const lezer = stream.getReader();
  const delen: Uint8Array[] = [];
  let totaal = 0;
  while (true) {
    if (signaal.aborted) throw new Error("time-out");
    const { done, value } = await lezer.read();
    if (done) break;
    delen.push(value); totaal += value.length;
    if (totaal > MAX_BYTES) { lezer.cancel(); throw new Error("Het bestand is groter dan 2 MB."); }
  }
  return plak(delen);
}

// Link ophalen met alle controles; geeft de tekst van het .ics-bestand
export async function haalIcs(invoer: string): Promise<{ ok: true; tekst: string; url: string } | { ok: false; fout: string }> {
  const c = controleerUrl(invoer);
  if ("fout" in c) return { ok: false, fout: c.fout };
  let url = c.url;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const adressen = await losOp(url.hostname);
      const r = await verzoek(url, adressen[0], ctl.signal);
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const loc = r.koppen["location"];
        if (!loc) return { ok: false, fout: "De server stuurde door zonder adres." };
        let volgende: URL;
        try { volgende = new URL(loc, url); } catch (_e) { return { ok: false, fout: "De server stuurde door naar een ongeldig adres." }; }
        const c2 = controleerUrl(volgende.toString());
        if ("fout" in c2) return { ok: false, fout: c2.fout };
        url = c2.url;
        continue;
      }
      if (r.status === 401 || r.status === 403) return { ok: false, fout: "De server weigert de link (" + r.status + "). Vaak betekent dit dat de beheerder publiceren heeft uitgezet of dat de link is ingetrokken." };
      if (r.status === 404) return { ok: false, fout: "De link bestaat niet (meer) (404). Maak in de bron een nieuwe link." };
      if (r.status < 200 || r.status >= 300) return { ok: false, fout: "De server gaf een fout (" + r.status + ")." };
      const tekst = new TextDecoder("utf-8", { fatal: false }).decode(r.body);
      if (!/BEGIN:VCALENDAR/i.test(tekst.slice(0, 4000))) {
        const ct = (r.koppen["content-type"] || "").toLowerCase();
        return { ok: false, fout: ct.includes("text/html") ? "Op deze link staat een webpagina, geen agendabestand. Zoek de .ics- of webcal-link van je agenda." : "Dit is geen agendabestand (.ics)." };
      }
      return { ok: true, tekst, url: url.toString() };
    }
    return { ok: false, fout: "Te veel doorverwijzingen." };
  } catch (e) {
    const m = (e as Error).message || "";
    if (ctl.signal.aborted || /time-?out|aborted/i.test(m)) return { ok: false, fout: "De server reageerde niet binnen 15 seconden." };
    if (/intern adres|niet gevonden|groter dan|geldig antwoord/.test(m)) return { ok: false, fout: m };
    return { ok: false, fout: "De link kon niet worden opgehaald (" + m.slice(0, 80) + ")." };
  } finally { clearTimeout(timer); }
}

function naarItems(uitkomst: Uitkomst, id: string, agenda: string, alleenBezet: boolean) {
  const lijst = uitkomst.voorvallen.slice(0, MAX_ITEMS).map((v) => ICS.naarOpdracht(v, id, agenda, alleenBezet));
  const meldingen = uitkomst.meldingen.slice();
  if (uitkomst.voorvallen.length > MAX_ITEMS) meldingen.push("Meer dan " + MAX_ITEMS + " afspraken: alleen de eerste " + MAX_ITEMS + " zijn meegenomen.");
  return { lijst, meldingen };
}

async function ververs(gebruiker: string | null, id: string, token: string | null) {
  const r = await rpc("kal_import_ophalen", { p_id: id, p_gebruiker: gebruiker, p_token: token });
  if (!r.ok) return r;
  if (!r.url) return { ok: false, fout: "Deze import heeft geen link (bestand of tekst)." };
  const g = r.gebruiker as string;
  const h = await haalIcs(r.url);
  if (!h.ok) { await rpc("kal_import_vervang", { p_gebruiker: g, p_id: id, p_items: [], p_fout: h.fout }); return { ok: false, fout: h.fout }; }
  const u = ICS.lees(h.tekst, {});
  if (!u.ok) { await rpc("kal_import_vervang", { p_gebruiker: g, p_id: id, p_items: [], p_fout: u.fout }); return { ok: false, fout: u.fout }; }
  const { lijst, meldingen } = naarItems(u, id, r.import.agenda, !!r.import.alleenBezet);
  const v = await rpc("kal_import_vervang", { p_gebruiker: g, p_id: id, p_items: lijst, p_fout: null });
  return v.ok ? { ok: true, aantal: lijst.length, naam: u.naam, meldingen } : v;
}

Deno.serve(async (req: Request) => {
  const kop = cors(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...kop, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: kop });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { /* leeg */ }
  try {
    if (body.cron === true) {
      const sl = await rpc("kal_meldingen_sleutels");
      if (req.headers.get("x-digigenda-geheim") !== sl.geheim) return json({ ok: false }, 401);
      const lijst = (await rpc("kal_imports_te_verversen")) as { gebruiker: string; id: string }[];
      let gelukt = 0, mislukt = 0;
      for (const i of lijst.slice(0, 50)) {
        try { const r = await ververs(i.gebruiker, i.id, null); if (r.ok) gelukt++; else mislukt++; } catch (_e) { mislukt++; }
      }
      return json({ ok: true, aantal: lijst.length, gelukt, mislukt });
    }
    const token = typeof body.token === "string" && /^[0-9a-f-]{36}$/.test(body.token) ? body.token : null;
    if (!token) return json({ ok: false, sessie: false });
    const toestemming = await rpc("kal_import_toestemming", { p_token: token });
    if (!toestemming.ok) return json(toestemming);
    if (typeof body.url === "string") {
      // Voorbeeld: ophalen en lezen, niets bewaren
      const h = await haalIcs(body.url);
      if (!h.ok) return json({ ok: false, fout: h.fout });
      const u = ICS.lees(h.tekst, {});
      if (!u.ok) return json({ ok: false, fout: u.fout });
      const voorbeeld = u.voorvallen.slice(0, 12).map((v) => ({ datum: v.datum, tijd: v.tijd, eind: v.eind, titel: String(v.titel || "").slice(0, 80), heledag: v.heledag }));
      const eersteDatum = u.voorvallen[0] ? u.voorvallen[0].datum : null, laatsteDatum = u.voorvallen.length ? u.voorvallen[u.voorvallen.length - 1].datum : null;
      return json({ ok: true, naam: u.naam, aantal: u.voorvallen.length, aantalAfspraken: u.aantalAfspraken, voorbeeld, meldingen: u.meldingen, eersteDatum, laatsteDatum, bytes: h.tekst.length });
    }
    if (typeof body.id === "string" && /^[a-z0-9-]{4,40}$/.test(body.id)) return json(await ververs(null, body.id, token));
    return json({ ok: false, fout: "Onbekend verzoek." }, 400);
  } catch (e) {
    return json({ ok: false, fout: "De importserver gaf een fout (" + ((e as Error).message || "").slice(0, 60) + ")." }, 500);
  }
});
