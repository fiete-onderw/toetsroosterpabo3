// Web Push zonder externe pakketten: VAPID (RFC 8292) + versleuteling aes128gcm (RFC 8291), alleen WebCrypto.
const enc = new TextEncoder();
export const naarB64u = (buf) => {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const vanB64u = (str) => {
  const t = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const plak = (...delen) => {
  const n = delen.reduce((a, d) => a + d.length, 0); const uit = new Uint8Array(n); let i = 0;
  for (const d of delen) { uit.set(d, i); i += d.length; }
  return uit;
};
async function hmac(sleutel, data) {
  const k = await crypto.subtle.importKey("raw", sleutel, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// VAPID-handtekening (JWT ES256) voor de push-dienst van Apple / Google / Mozilla
export async function vapidKop(endpoint, vapid) {
  const kop = naarB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const inhoud = naarB64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.onderwerp })));
  const prive = await crypto.subtle.importKey("jwk", vapid.priveJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, prive, enc.encode(kop + "." + inhoud));
  return "vapid t=" + kop + "." + inhoud + "." + naarB64u(sig) + ", k=" + vapid.publiek;
}

// Versleutel de inhoud voor één abonnement (p256dh + auth uit de browser)
export async function versleutel(tekst, p256dh, auth) {
  const uaPub = vanB64u(p256dh), authGeheim = vanB64u(auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaSleutel = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const gedeeld = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaSleutel }, as.privateKey, 256));
  const prkKey = await hmac(authGeheim, gedeeld);
  const ikm = await hmac(prkKey, plak(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const zout = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(zout, ikm);
  const cek = (await hmac(prk, plak(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, plak(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const geheim = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aes, plak(enc.encode(tekst), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // recordgrootte 4096
  return plak(zout, rs, new Uint8Array([asPub.length]), asPub, geheim);
}

// Stuur één melding. Geeft de HTTP-status van de push-dienst terug (201 = gelukt, 404/410 = abonnement bestaat niet meer).
export async function stuur(abonnement, inhoud, vapid, doorgeven = fetch) {
  const lichaam = await versleutel(JSON.stringify(inhoud), abonnement.p256dh, abonnement.auth);
  const r = await doorgeven(abonnement.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidKop(abonnement.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "high"
    },
    body: lichaam
  });
  return r.status;
}
