import { maakIcs } from "../supabase/functions/digigenda-agenda/kern.js";
const data = { naam: "t", instellingen: { agendas: ["school"], pabo: false }, opdrachten: [
  { id: "a", titel: "Overleg", datum: "2026-11-02", tijd: "10:00", eind: "11:30", soort: "afspraak", agenda: "school" },
  { id: "b", titel: "Zonder eind", datum: "2026-11-02", tijd: "14:00", eind: null, soort: "afspraak", agenda: "school" },
  { id: "c", titel: "Inleveren", datum: "2026-11-03", tijd: null, eind: "17:00", soort: "deadline", agenda: "school" },
  { id: "d", titel: "Fout eind", datum: "2026-11-03", tijd: "15:00", eind: "14:00", soort: "afspraak", agenda: "school" } ]};
const ics = maakIcs(data, null, new Date());
const r = ics.split("\r\n");
const ok = (naam, v) => console.log((v ? "OK  " : "FOUT") + " " + naam);
ok("DTEND bij eindtijd", r.includes("DTEND;TZID=Europe/Amsterdam:20261102T113000"));
ok("DURATION zonder eindtijd", ics.split("UID:b-")[1].split("END:VEVENT")[0].includes("DURATION:PT1H"));
ok("hele dag + (tot 17:00)", r.includes("SUMMARY:Inleveren (tot 17:00)") && ics.split("UID:c-")[1].split("END:VEVENT")[0].includes("DTSTART;VALUE=DATE:20261103"));
ok("eind voor begin = nachtdienst, eindigt de volgende dag", ics.split("UID:d-")[1].split("END:VEVENT")[0].includes("DTEND;TZID=Europe/Amsterdam:20261104T140000"));
