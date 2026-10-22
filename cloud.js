/*
  Digigenda: online opslag via Supabase (inloggen met gebruikersnaam + pincode).

  - De sleutel hieronder is de PUBLIEKE sleutel van het project. Die mag in de
    code staan: de website kan er alleen de kal_-functies mee aanroepen, en die
    controleren zelf de pincode of het inlogbewijs (token).
  - Laat SLEUTEL leeg ("") om online opslaan uit te zetten. De kalender werkt
    dan weer alleen met opslag in de browser.
*/
window.CLOUD = (function () {
  "use strict";

  const URL = "https://srfigofpluibrrgcefuq.supabase.co";
  const SLEUTEL = "sb_publishable_Cuul5X8z-ffe0bkfg8agIQ_hIOw4ty2";

  async function rpc(functie, args) {
    let res;
    try {
      res = await fetch(URL + "/rest/v1/rpc/" + functie, {
        method: "POST",
        headers: { "apikey": SLEUTEL, "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
    } catch (e) {
      throw new Error("Geen verbinding met de server. Ben je online?");
    }
    if (!res.ok) throw new Error("De server gaf een fout (" + res.status + "). Probeer het later opnieuw.");
    return res.json();
  }

  return {
    aan: !!(URL && SLEUTEL),
    registreer: (naam, pin) => rpc("kal_registreer", { p_naam: naam, p_pin: pin }),
    inloggen: (naam, pin) => rpc("kal_inloggen", { p_naam: naam, p_pin: pin }),
    lijst: (token) => rpc("kal_lijst", { p_token: token }),
    bewaar: (token, lijst) => rpc("kal_bewaar", { p_token: token, p_lijst: lijst }),
    verwijder: (token, id) => rpc("kal_verwijder", { p_token: token, p_id: id }),
    uitloggen: (token) => rpc("kal_uitloggen", { p_token: token }),
    instellingen: (token, inst) => rpc("kal_instellingen", { p_token: token, p_instellingen: inst }),
    agendaLink: (token, nieuw) => rpc("kal_agenda_link", { p_token: token, p_nieuw: !!nieuw }),
    // Adres voor het agenda-abonnement (iPhone/Mac Agenda, Google Agenda)
    agendaUrl: (code) => URL + "/functions/v1/digigenda-agenda?code=" + encodeURIComponent(code)
  };
})();

/*
  Face ID / vingerafdruk (WebAuthn).
  Hiermee ontgrendel je je opgeslagen inlog op dit apparaat. De pincode blijft
  de controle op de server; Face ID voorkomt dat iemand die je ontgrendelde
  telefoon pakt, zomaar je opdrachten ziet.
*/
window.BIO = (function () {
  "use strict";

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const naam = ios ? "Face ID" : "vingerafdruk of gezichtsherkenning";

  const naarB64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const vanB64 = (s) => {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "===".slice((t.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  const willekeurig = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function beschikbaar() {
    try {
      return !!(window.PublicKeyCredential && window.isSecureContext &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (e) { return false; }
  }

  // Maakt een sleutel aan op dit apparaat (vraagt om Face ID). Geeft het sleutel-id terug.
  async function aanzetten(gebruiker) {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: willekeurig(32),
        rp: { name: "Digigenda" },
        user: { id: willekeurig(16), name: gebruiker, displayName: gebruiker },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        attestation: "none",
        timeout: 60000
      }
    });
    if (!cred) throw new Error("geen sleutel");
    return naarB64(cred.rawId);
  }

  // Vraagt om Face ID met de opgeslagen sleutel. Geeft true als het gelukt is.
  async function controleer(id) {
    const r = await navigator.credentials.get({
      publicKey: {
        challenge: willekeurig(32),
        allowCredentials: [{ type: "public-key", id: vanB64(id), transports: ["internal", "hybrid"] }],
        userVerification: "required",
        timeout: 60000
      }
    });
    if (!r || !r.response || !r.response.authenticatorData) return false;
    // Bit 2 van de vlaggen (byte 32) = de gebruiker is echt geverifieerd (Face ID / vinger).
    return (new Uint8Array(r.response.authenticatorData)[32] & 0x04) !== 0;
  }

  return { naam, beschikbaar, aanzetten, controleer };
})();
