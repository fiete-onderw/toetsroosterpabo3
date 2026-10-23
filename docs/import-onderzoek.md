# Onderzoek: agenda's binnenhalen in Digigenda

Datum: 23 oktober 2026. Doel: Gijs moet elke gangbare agenda kunnen binnenhalen, en vooral zijn **werkagenda**.
Werkgevers zetten veel dicht; daarom staat hieronder per bron wat er bestaat, wat zonder beheerder werkt,
wat vaak geblokkeerd is, wat het kost en hoe vaak het ververst. De conclusie staat onderaan: de **ladder van routes**
die in de app is gebouwd.

Belangrijk vooraf: alle agendaformaten die hier langskomen zijn uiteindelijk **iCalendar (.ics, RFC 5545)**. Dat is één
tekstformaat voor bestanden én voor abonnementslinks (`webcal://` is gewoon `https://` met een .ics erachter). Wie .ics goed
kan lezen (herhalingen, uitzonderingen, tijdzones, annuleringen) kan dus alle bronnen aan. Dat is wat Digigenda doet.

## 1. Microsoft 365 / Outlook (werkaccount)

### 1a. Agenda publiceren (ICS-link) — route 1
- **Waar:** Outlook op het web → Instellingen → Agenda → *Gedeelde agenda's* → *Een agenda publiceren*. Kies de agenda en het
  detailniveau en klik *Publiceren*; je krijgt een HTML-link en een **ICS-link**. ([Microsoft Support][ms-share], [UW-Madison KB][wisc])
- **Detailniveaus:** *Kan zien wanneer ik bezet ben* (alleen bezet/vrij), *Kan titels en locaties zien*, *Kan alle details zien*.
  Staat alleen de eerste optie in de lijst, dan heeft de beheerder de rest uitgezet. ([Microsoft Q&A][msqa-busy])
- **Wanneer geblokkeerd:** ontbreekt het kopje *Een agenda publiceren* helemaal, dan heeft de IT-beheerder publiceren
  uitgezet (via het OWA-postvakbeleid / het deelbeleid in Exchange Online). Ook publiceren vanuit Outlook desktop is dan
  meestal geblokkeerd. ([Microsoft Q&A][msqa-ics], [Microsoft Q&A][msqa-missing], [Exchange-documentatie][exch-disable])
- **Kosten:** gratis. **Verversen:** de link geeft steeds de actuele agenda; abonnees (Outlook, iPhone) halen hem ongeveer
  elk uur op. Digigenda ververst via de eigen planner elk uur.
- **Beperking:** Microsoft levert standaard alleen **± 6 maanden vooruit** in de gepubliceerde feed. ([UW-Madison KB][wisc],
  [WordPress-forum][wp-6m]) Diensten verder vooruit komen pas later binnen.
- **Oordeel:** de beste route als hij aanstaat. **Werkt niet als de beheerder publiceren heeft uitgezet** — dat komt bij
  werkgevers veel voor.

### 1b. Microsoft Graph met OAuth (echte koppeling) — bewust niet gebouwd
- **Wat nodig is:** een app-registratie in Microsoft Entra (vereist zelf een Microsoft-tenant), platform *Single-page
  application* met PKCE (geen client-secret in de browser; Microsoft weigert secrets vanuit de browser), redirect-URI
  `https://fiete-onderw.github.io/toetsroosterpabo3/`, en de gedelegeerde machtiging `Calendars.Read` of
  `Calendars.ReadBasic`. ([Microsoft: SPA-migratie][ms-spa], [Graph-machtigingen][graph-perm])
- **Admin consent:** op papier vereist `Calendars.Read` (gedelegeerd) **geen** beheerdersgoedkeuring. In de praktijk
  beperken veel organisaties gebruikerstoestemming: het aanbevolen/Microsoft-beheerde beleid laat gebruikers alleen
  "laag-risico"-machtigingen van **geverifieerde uitgevers** goedkeuren, en een aparte app zonder uitgeversverificatie valt
  daar niet onder. Dan verschijnt "Goedkeuring door beheerder vereist". ([Entra: gebruikerstoestemming][entra-consent],
  [Entra: overzicht][entra-overview], [Q&A over Calendars.Read][msqa-cal])
- **Gevolgen voor Digigenda:** een OAuth-token in de browser van een werkaccount, een app-registratie op naam van een
  privépersoon, uitgeversverificatie (vereist een Microsoft Partner Network-account) om bij werkgevers überhaupt een kans
  te maken, en alsnog bij veel werkgevers een beheerder die moet goedkeuren.
- **Oordeel: niet bouwen.** Het werkt niet betrouwbaar zonder beheerder en voegt een tweede inlogsysteem toe aan een app
  die juist rustig en eenvoudig moet zijn. Dit staat ook zo in de app.

### 1c. Export als .ics-bestand — route 2
- **Klassieke Outlook (Windows):** Agenda → *Bestand* → *Agenda opslaan* → *Meer opties*: datumbereik (vandaag, 7 dagen,
  30 dagen, hele agenda, zelf kiezen) en detail (*Alleen beschikbaarheid*, *Beperkte details*, *Volledige details*).
  Resultaat: een .ics-bestand (momentopname, ververst niet). ([msoutlook.info][msoutlook], [nocal.app][nocal])
- **Nieuwe Outlook / Outlook op het web:** heeft (anno 2026) geen vergelijkbare exportknop; alleen de publiceer-link.
  ([Microsoft Q&A][msqa-new])
- **Oordeel:** werkt altijd als er een Windows-pc met klassieke Outlook is; moet handmatig herhaald worden.

### 1d. Uitnodigingen doorsturen — route 3
- Een **vergadering** (iets waar je voor uitgenodigd bent) kun je doorsturen; bij *Doorsturen als iCalendar* zit een
  .ics-bijlage. Een losse afspraak in je eigen agenda kun je in Outlook desktop ook *Doorsturen als iCalendar*.
  ([Microsoft Q&A][msqa-fwd], [FAU KB][fau])
- **Oordeel:** goed voor losse afspraken; niet voor een heel rooster.

## 2. Google Agenda (persoonlijk en Workspace/werk)

- **Geheime iCal-link (route 1):** Instellingen → je agenda → *Agenda integreren* → *Geheim adres in iCal-indeling*.
  Bij een **werk- of schoolaccount kan de beheerder dit hebben uitgezet**: de optie ontbreekt dan. ([Google Help][g-sync])
  In Workspace staat de instelling onder Admin → Apps → Google Workspace → Agenda → *Deelinstellingen* → *Externe
  deelopties voor primaire agenda's*; het geheime adres verschijnt alleen als externe deling op "alle informatie" staat.
  De door Google aanbevolen inrichting is juist *alleen bezet/vrij* → dan geen geheime link. ([Google Admin Help][g-admin],
  [Bookem][bookem], [Trailhead][trailhead])
- **Export als bestand (route 2):** Instellingen → *Importeren en exporteren* → *Exporteren*: een .zip met per agenda een
  .ics. Alleen voor agenda's waarvan je eigenaar bent; een beheerder kan exporteren blokkeren. ([Google Help][g-export])
- **Google Calendar API met OAuth — bewust niet gebouwd:** `calendar.readonly` is een *gevoelige* scope: Google-verificatie
  verplicht (homepage op eigen domein, privacybeleid, demo-video), in de testfase maximaal 100 gebruikers en tokens die na
  7 dagen verlopen. ([Nylas: scopes][nylas], [Apps Script: verificatie][gverif], [Unipile][unipile])
- **Kosten:** gratis. **Verversen:** de geheime link geeft altijd de actuele stand; Digigenda ververst elk uur.

## 3. Apple iCloud

- **Openbare agenda (route 1):** Agenda-app → (i) naast de agenda → *Openbare agenda* aan → *Deel link*. De link begint met
  `webcal://`, is **alleen-lezen** en werkt alleen voor iCloud-agenda's (niet voor een werkagenda die via Exchange op de
  iPhone staat). Iedereen met de link kan de agenda lezen. ([Apple Support][apple])
- **Oordeel:** werkt; let op dat de link openbaar is. Digigenda bewaart hem versleuteld.

## 4. Rooster-/planningsapps van werkgevers

| Dienst | Agenda-link voor de medewerker? | Bron |
|---|---|---|
| **Shiftbase** | Ja. Rooster → *Acties* → *Agenda synchroniseren* → naam + keuzes → *Opslaan* geeft een .ics-link (eventueel `.ics` erachter plakken). Medewerker kan dit zelf. | [Shiftbase Help][shiftbase] |
| **Planday** | Ja. In de app: profiel → agenda synchroniseren → link kopiëren (`https://…`). Werkt met elke agenda die URL-abonnementen kent. Sync is niet direct. | [Planday Help][planday] |
| **Het Rooster, Bedrijfsrooster, InPlanning, Horeko, PMT** | Ja, een persoonlijke webcal-/iCal-link in de instellingen. Bij InPlanning: ontbreekt de optie, dan heeft de organisatie iCal-publicatie uitgezet. | [Het Rooster][hetrooster], [Bedrijfsrooster][bedrijfsrooster], [Intus/InPlanning][inplanning], [Horeko][horeko], [PMT][pmt] |
| **Personio** | Deels. De iCal-link toont de **afwezigheidskalender van collega's** (filterbaar), niet je eigen diensten. Eigen afwezigheid gaat via de Google/Outlook-agenda-integratie van de werkgever. | [Personio Community][personio] |
| **Nmbrs** | Nee voor diensten. Alleen een .ics-*bestand* (verlof, verzuim, verjaardagen), per onderdeel. Roosters zitten bij Nmbrs in een gekoppeld roosterpakket (Dyflexis, Eitje, Mijnrooster…). | [Nmbrs Support][nmbrs] |
| **AFAS (InSite/Pocket)** | Nee, geen iCal-link gedocumenteerd. Agenda-items gaan via de Exchange/Outlook-koppeling van de werkgever. Werkt de werkgever met Shiftbase naast AFAS, dan via Shiftbase. | [AFAS Help][afas], [AFAS agenda][afas-agenda] |
| **Visma Youforce** | Niet gevonden. Youforce koppelt roosterpakketten via API's; een persoonlijke agendalink staat niet in de documentatie. Vraag de werkgever welk roosterpakket eronder zit. | [Blue-Y over Youforce][youforce] |
| **L1NDA, Dyflexis** | Niet bevestigd in dit onderzoek (geen officiële pagina gevonden). In de app kijken bij instellingen → agenda/koppelingen. | — |

Patroon: **het roosterpakket** (niet het HR-/salarispakket) is bijna altijd de plek met een persoonlijke iCal-link, en de
organisatie kan die uitzetten. Lukt het niet: vraag de teamleider om de rooster-pdf of -mail; die kun je als tekst in
Digigenda plakken (route 3).

## 5. HAN-rooster en Osiris

- **HAN:** het rooster staat in de app **MyX (My Xedule)** en is ook te zien in **Osiris**; voor medewerkers is er *RIA*
  (rooster in agenda). ([HAN: online services][han-online], [HAN: tools][han-tools]) Een officiële HAN-pagina over een
  iCal-abonnement voor **studenten** is niet gevonden. Bij een andere hogeschool met Xedule (HKU) kan de student via het
  selfserviceportaal een .ics **exporteren**, maar die export verwerkt geen roosterwijzigingen. ([HKU-handleiding][hku])
- **Osiris Student:** toont het rooster onder *Agenda* (per week); een export- of iCal-functie is niet gedocumenteerd.
  ([Osiris Student][osiris], [RU-handleiding][ru])
- **Oordeel:** niet aannemen dat er een link is. Kijk in MyX of Osiris bij het rooster naar *Exporteren*/*Agenda* en gebruik
  dan route 1 (link) of 2 (bestand). Anders: de weekindeling als tekst plakken (route 3) — de snelle invoer begrijpt
  "ma 9:00-12:00 college rekenen".

## 6. Een eigen doorstuur-e-mailadres (uitnodigingen mailen naar Digigenda)

- Gratis inkomende e-mail bestaat (Cloudflare Email Workers: gratis, maar vereist een **eigen domein** bij Cloudflare en
  zelf MIME ontleden; Mailgun: 1 route, 100 mails/dag op het gratis plan). ([usecarly: email to webhook][carly],
  [AgentMail][agentmail], [Sequenzy][sequenzy])
- Digigenda draait op GitHub Pages zonder eigen domein. Een doorstuuradres kost dus minimaal een domeinnaam (± € 10/jaar)
  en een extra dienst, en opent een ingang die iedereen kan bemailen (spam, misbruik, afzenderverificatie nodig).
- **Oordeel: niet gebouwd.** In plaats daarvan: de .ics-bijlage uit de uitnodiging **openen → kopiëren → plakken** in
  Digigenda, of (Android) **delen** naar Digigenda. Dat is gratis en veilig.

## 7. Delen naar de app (share target)

- Android/Chrome ondersteunt `share_target` in het manifest: tekst en .ics-bestanden delen naar een geïnstalleerde PWA.
- **iOS/Safari ondersteunt dit niet**: de WebKit-bug uit 2019 staat nog open en Apple heeft bezwaren geuit. ([WebKit
  Bugzilla][webkit], [WebKit standards-positions][wk-pos]) Op de iPhone werkt daarom alleen: bestand openen →
  *Kopiëren* → in Digigenda plakken, of het bestand kiezen via *Bestand importeren*.

## Conclusie: de ladder die in Digigenda zit

| Trede | Route | Werkt zonder beheerder? | Ververst | Status |
|---|---|---|---|---|
| 1 | **Abonneren via link** (webcal/https) — Outlook-publicatie, Google geheime link, iCloud openbaar, Shiftbase/Planday/… | Alleen als de werkgever publiceren toestaat | Elk uur, automatisch (Supabase-planner → edge function met SSRF-bescherming) | Gebouwd |
| 2 | **Bestand importeren** (.ics, ook .zip van Google niet: eerst uitpakken) | Ja (klassieke Outlook, Google export, iCloud export) | Handmatig opnieuw | Gebouwd |
| 3 | **Plakken/delen** van .ics-tekst of een uitnodiging; roostertekst via de snelle invoer | Ja | Per item | Gebouwd (delen alleen Android) |
| 4 | **OAuth-koppeling** Microsoft/Google | Nee: bij werkaccounts meestal beheerdersgoedkeuring, bij Google verificatie | — | **Bewust niet gebouwd**, met uitleg in de app |

Werkprivacy: bij elke import kun je kiezen voor **"alleen als bezet tonen"**; dan bewaart Digigenda geen titels en
locaties, alleen tijden. Werkgevers kunnen regels hebben over het delen van agendagegevens buiten de organisatie; de app
zegt dat erbij.

[ms-share]: https://support.microsoft.com/office/7ecef8ae-139c-40d9-bae2-a23977ee58d5
[wisc]: https://kb.wisc.edu/office365/73250
[msqa-busy]: https://learn.microsoft.com/en-us/answers/questions/4695885/how-do-i-publish-my-calendar-to-show-more-than-can
[msqa-ics]: https://learn.microsoft.com/en-us/answers/questions/5699139/how-to-get-the-url-or-ics-of-a-calendar
[msqa-missing]: https://learn.microsoft.com/en-us/answers/questions/4606824/publish-a-calendar-setting-missing
[exch-disable]: https://learn.microsoft.com/en-us/exchange/disable-internet-calendar-publishing-exchange-2013-help
[wp-6m]: https://remarpro.com/support/?p=16959389
[ms-spa]: https://learn.microsoft.com/en-us/entra/identity-platform/migrate-spa-implicit-to-auth-code
[graph-perm]: https://learn.microsoft.com/en-us/graph/permissions-reference
[entra-consent]: https://learn.microsoft.com/en-gb/entra/identity/enterprise-apps/configure-user-consent
[entra-overview]: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview
[msqa-cal]: https://learn.microsoft.com/en-us/answers/questions/5513511/how-to-add-calender-read-permission-in-to-delegate
[msoutlook]: https://www.msoutlook.info/?p=1112
[nocal]: https://nocal.app/help/outlook-calendar/export-your-outlook-calendar
[msqa-new]: https://learn.microsoft.com/en-us/answers/a/8273645
[msqa-fwd]: https://learn.microsoft.com/en-us/answers/a/9219130
[fau]: https://comsupport.fau.edu/kb/articles/pdf/send-a-generic-calendar-invite-not-associated-to-your-email-account
[g-sync]: https://support.google.com/calendar/answer/37648?hl=en
[g-admin]: https://support.google.com/a/answer/60765?hl=en
[bookem]: https://bookem.com/help/enable-private-ical-addresses-for-google-workspace-calendars
[trailhead]: https://trailhead.salesforce.com/de/content/learn/modules/google-workspace-service-management/manage-google-calendar
[g-export]: https://support.google.com/calendar/answer/37111?hl=en
[nylas]: https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/
[gverif]: https://developers.google.com/apps-script/guides/client-verification
[unipile]: https://www.unipile.com/google-oauth-100-user-limit/
[apple]: https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud
[shiftbase]: https://help.shiftbase.com/calendar-synchronisation
[planday]: https://help.planday.com/en/articles/30327-how-to-synchronise-your-schedule-with-an-external-calendar
[hetrooster]: https://support.hetrooster.nl/hc/nl/articles/19725494340114-Het-Rooster-koppelen-aan-een-digitale-agenda
[bedrijfsrooster]: https://support.bedrijfsrooster.nl/hc/nl/articles/360029518251-Mijn-rooster-koppelen-aan-iCal-Google-Calendar-Outlook
[inplanning]: https://www.intus.nl/hubfs/Instructie%20-%20Je%20InPlanning%20rooster%20weergeven%20in%20een%20externe%20digitale%20agenda.pdf
[horeko]: https://support.horeko.com/nl/ical-export-naar-online-agenda
[pmt]: https://help.personeelstool.nl/nl/article/jouw-pmt-rooster-koppelen-aan-je-digitale-agenda
[personio]: https://community.personio.com/attendances-absences-87/best-practices-calendar-integration-share-your-experience-158
[nmbrs]: https://support.nmbrs.nl/hc/nl/articles/204053746-Export-iCal-Kalender
[afas]: https://help.afas.nl/help/NL/SE/App_Config_Agenda.htm
[afas-agenda]: https://help.afas.nl/help/nl/se/App_Agenda.htm
[youforce]: https://blue-y.com/blog/wat-is-visma-raet-youforce-en-hoe-wordt-het-gebruikt-in-de-zorgadministratie/
[han-online]: https://www.han.nl/studeren/onderwijs/studiefaciliteiten/online-services/
[han-tools]: https://www.han.nl/onderwijsondersteuning/leren-werken-met-ict/tools/
[hku]: https://www.hku.nl/getmedia/e3783553-d9e3-437d-a22d-7aa31c61c010/Handleiding_self_serviceportal_student.pdf
[osiris]: https://osiris.nu/module/osiris-student/
[ru]: https://student.tutorials.ru.nl/m/90537/c/302340
[carly]: https://www.usecarly.com/blog/email-to-webhook/
[agentmail]: https://www.agentmail.to/blog/free-email-api-for-developers
[sequenzy]: https://www.sequenzy.com/blog/best-email-receiving-apis
[webkit]: https://bugs.webkit.org/show_bug.cgi?id=194593
[wk-pos]: https://github.com/WebKit/standards-positions/issues/11
