-- =====================================================================
-- Pabo 3 Kalender: inloggen met gebruikersnaam + pincode (4 cijfers)
--
-- Hoe gebruik je dit?
--   Supabase > je project > SQL Editor > New query > plak dit hele bestand > Run.
--   Eén keer uitvoeren is genoeg. Nog een keer uitvoeren kan geen kwaad.
--
-- Wat doet het?
--   - Maakt een apart schema "kalender" dat NIET via de API bereikbaar is.
--     Bestaande tabellen (bijvoorbeeld van Stipt) worden niet aangeraakt.
--   - De website praat alleen via de kal_-functies hieronder met de database.
--   - Pincodes worden versleuteld opgeslagen (bcrypt).
--   - Na 5 foute pincodes wordt een account 15 minuten geblokkeerd.
-- =====================================================================

create schema if not exists kalender;
revoke all on schema kalender from public, anon, authenticated;

create table if not exists kalender.gebruikers (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique check (naam ~ '^[a-z0-9]{3,20}$'),
  pin_hash text not null,
  mislukt int not null default 0,
  geblokkeerd_tot timestamptz,
  gemaakt timestamptz not null default now()
);

create table if not exists kalender.sessies (
  token uuid primary key default gen_random_uuid(),
  gebruiker_id uuid not null references kalender.gebruikers(id) on delete cascade,
  verloopt timestamptz not null default now() + interval '90 days'
);
create index if not exists sessies_gebruiker_idx on kalender.sessies (gebruiker_id);

create table if not exists kalender.opdrachten (
  gebruiker_id uuid not null references kalender.gebruikers(id) on delete cascade,
  id text not null check (length(id) between 1 and 40),
  titel text not null check (length(titel) between 1 and 80),
  datum date not null,
  soort text not null check (soort in ('opdracht','deadline','herkansing','toets','overig')),
  notitie text not null default '' check (length(notitie) <= 400),
  klaar boolean not null default false,
  bijgewerkt timestamptz not null default now(),
  primary key (gebruiker_id, id)
);

-- Opdrachten die klaarstaan voor een gebruikersnaam: ze verschijnen bij de eerste inlog.
create table if not exists kalender.klaarzetten (
  naam text not null,
  opdracht jsonb not null
);

alter table kalender.gebruikers enable row level security;
alter table kalender.sessies enable row level security;
alter table kalender.opdrachten enable row level security;
alter table kalender.klaarzetten enable row level security;

-- ---------- hulpfuncties (niet publiek aanroepbaar) ----------
create or replace function kalender.gebruiker_van(p_token uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.gebruiker_id from kalender.sessies s where s.token = p_token and s.verloopt > now();
$$;

create or replace function kalender.zet_klaar(p_gebruiker uuid, p_naam text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into kalender.opdrachten (gebruiker_id, id, titel, datum, soort, notitie, klaar)
  select p_gebruiker, k.opdracht->>'id', k.opdracht->>'titel', (k.opdracht->>'datum')::date,
         k.opdracht->>'soort', coalesce(k.opdracht->>'notitie',''), false
  from kalender.klaarzetten k where k.naam = p_naam
  on conflict (gebruiker_id, id) do nothing;
  delete from kalender.klaarzetten where naam = p_naam;
end $$;

create or replace function kalender.nieuwe_sessie(p_gebruiker uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  delete from kalender.sessies where verloopt < now();
  insert into kalender.sessies (gebruiker_id) values (p_gebruiker) returning token into t;
  return t;
end $$;

create or replace function kalender.lijst_van(p_gebruiker uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'titel', o.titel, 'datum', to_char(o.datum, 'YYYY-MM-DD'),
    'soort', o.soort, 'notitie', o.notitie, 'klaar', o.klaar) order by o.datum), '[]'::jsonb)
  from kalender.opdrachten o where o.gebruiker_id = p_gebruiker;
$$;

create or replace function kalender.bewaar_een(p_gebruiker uuid, o jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from kalender.opdrachten where gebruiker_id = p_gebruiker) >= 1000 then
    raise exception 'te_veel';
  end if;
  insert into kalender.opdrachten (gebruiker_id, id, titel, datum, soort, notitie, klaar, bijgewerkt)
  values (p_gebruiker, o->>'id', left(o->>'titel', 80), (o->>'datum')::date,
          case when o->>'soort' in ('opdracht','deadline','herkansing','toets','overig') then o->>'soort' else 'opdracht' end,
          left(coalesce(o->>'notitie',''), 400), coalesce((o->>'klaar')::boolean, false), now())
  on conflict (gebruiker_id, id) do update set
    titel = excluded.titel, datum = excluded.datum, soort = excluded.soort,
    notitie = excluded.notitie, klaar = excluded.klaar, bijgewerkt = now();
end $$;

-- ---------- publieke functies (aanroepbaar met de publieke sleutel) ----------
create or replace function public.kal_registreer(p_naam text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n text := lower(trim(p_naam)); g uuid;
begin
  if n !~ '^[a-z0-9]{3,20}$' then
    return jsonb_build_object('ok', false, 'fout', 'Gebruikersnaam: 3 tot 20 letters of cijfers, zonder spaties.');
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'fout', 'De pincode moet uit precies 4 cijfers bestaan.');
  end if;
  if exists (select 1 from kalender.gebruikers where naam = n) then
    return jsonb_build_object('ok', false, 'fout', 'Deze gebruikersnaam is al bezet. Kies een andere of log in.');
  end if;
  insert into kalender.gebruikers (naam, pin_hash) values (n, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  returning id into g;
  perform kalender.zet_klaar(g, n);
  return jsonb_build_object('ok', true, 'naam', n, 'token', kalender.nieuwe_sessie(g), 'opdrachten', kalender.lijst_van(g));
end $$;

create or replace function public.kal_inloggen(p_naam text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n text := lower(trim(p_naam)); u kalender.gebruikers%rowtype;
begin
  select * into u from kalender.gebruikers where naam = n;
  if not found then
    return jsonb_build_object('ok', false, 'fout', 'Gebruikersnaam of pincode klopt niet.');
  end if;
  if u.geblokkeerd_tot is not null and u.geblokkeerd_tot > now() then
    return jsonb_build_object('ok', false, 'fout',
      'Te vaak een verkeerde pincode. Probeer het over ' || ceil(extract(epoch from (u.geblokkeerd_tot - now())) / 60)::int || ' minuten opnieuw.');
  end if;
  if p_pin !~ '^[0-9]{4}$' or extensions.crypt(p_pin, u.pin_hash) <> u.pin_hash then
    if u.mislukt + 1 >= 5 then
      update kalender.gebruikers set mislukt = 0, geblokkeerd_tot = now() + interval '15 minutes' where id = u.id;
      return jsonb_build_object('ok', false, 'fout', 'Vijf keer een verkeerde pincode. Je account is 15 minuten geblokkeerd.');
    end if;
    update kalender.gebruikers set mislukt = u.mislukt + 1 where id = u.id;
    return jsonb_build_object('ok', false, 'fout', 'Gebruikersnaam of pincode klopt niet.');
  end if;
  update kalender.gebruikers set mislukt = 0, geblokkeerd_tot = null where id = u.id;
  perform kalender.zet_klaar(u.id, n);
  return jsonb_build_object('ok', true, 'naam', n, 'token', kalender.nieuwe_sessie(u.id), 'opdrachten', kalender.lijst_van(u.id));
end $$;

create or replace function public.kal_lijst(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); n text;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  select naam into n from kalender.gebruikers where id = g;
  perform kalender.zet_klaar(g, n);
  return jsonb_build_object('ok', true, 'naam', n, 'opdrachten', kalender.lijst_van(g));
end $$;

create or replace function public.kal_bewaar(p_token uuid, p_lijst jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); o jsonb;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  if jsonb_typeof(p_lijst) <> 'array' or jsonb_array_length(p_lijst) > 500 then
    return jsonb_build_object('ok', false, 'fout', 'Ongeldige lijst.');
  end if;
  for o in select * from jsonb_array_elements(p_lijst) loop
    perform kalender.bewaar_een(g, o);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kal_verwijder(p_token uuid, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  delete from kalender.opdrachten where gebruiker_id = g and id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kal_uitloggen(p_token uuid)
returns jsonb language sql security definer set search_path = '' as $$
  delete from kalender.sessies where token = p_token;
  select jsonb_build_object('ok', true);
$$;

-- Alleen de publieke kal_-functies zijn aanroepbaar; de hulpfuncties en tabellen niet.
revoke all on all functions in schema kalender from public, anon, authenticated;
revoke all on function public.kal_registreer(text, text), public.kal_inloggen(text, text), public.kal_lijst(uuid),
  public.kal_bewaar(uuid, jsonb), public.kal_verwijder(uuid, text), public.kal_uitloggen(uuid) from public;
grant execute on function public.kal_registreer(text, text), public.kal_inloggen(text, text), public.kal_lijst(uuid),
  public.kal_bewaar(uuid, jsonb), public.kal_verwijder(uuid, text), public.kal_uitloggen(uuid) to anon, authenticated;

-- ---------- Studieplanning casustoets Taal jongere kind (voor gebruikersnaam "gijs") ----------
-- Verschijnt automatisch zodra "gijs" een account maakt of inlogt.
insert into kalender.klaarzetten (naam, opdracht)
select 'gijs', x::jsonb from unnest(array[
'{"id":"tjk-2210a","datum":"2026-10-22","soort":"opdracht","titel":"Regelen: boeken TL en HO + docent mailen over HO 2.9 en H8","notitie":"Zonder TL en HO werkt de planning vanaf zaterdag niet."}',
'{"id":"tjk-2210b","datum":"2026-10-22","soort":"opdracht","titel":"Lezen: RT 6.2.2 (jeugdliteratuur)","notitie":"Begrippenkaart per paragraaf: definitie, wat het níét is, voorbeeld uit de klas."}',
'{"id":"tjk-2310a","datum":"2026-10-23","soort":"opdracht","titel":"Lezen: P 12.4 · RT 5.2.4 · RT 3.2.2 · P 6.1.2 · P 6.3","notitie":"Criteria 8, 5 en 6. Plus 15 min begrippen afbakenen."}',
'{"id":"tjk-2310b","datum":"2026-10-23","soort":"opdracht","titel":"Casus 2 (meester Rik) opnieuw maken met het stappenplan","notitie":"Eerst je lijstje met feiten uit de casus, dan pas schrijven."}',
'{"id":"tjk-2410a","datum":"2026-10-24","soort":"opdracht","titel":"Lezen: RT 5.2.1–5.2.3 · TL H4","notitie":"Criteria 1, 2 en 3. Maak de niet-lijst van alle begrippenparen. Plus 15 min begrippen afbakenen."}',
'{"id":"tjk-2410b","datum":"2026-10-24","soort":"opdracht","titel":"Casus 1 (juf Anouk) opnieuw maken","notitie":""}',
'{"id":"tjk-2510a","datum":"2026-10-25","soort":"opdracht","titel":"Lezen: RT 5.3.1 · TL H2 · TL 3.6 · TL 6.1–6.3 · TL 6.6","notitie":"Criterium 4, deel 1. Begrippenkaart leesles. Plus 15 min begrippen afbakenen."}',
'{"id":"tjk-2610a","datum":"2026-10-26","soort":"opdracht","titel":"Lezen: TL H5 (heel) · P 6.2.1 · P 6.2.2","notitie":"Criteria 4 en 7. Plus 15 min begrippen afbakenen."}',
'{"id":"tjk-2610b","datum":"2026-10-26","soort":"opdracht","titel":"Casus: een leesles beoordelen (vraag aan Claude)","notitie":""}',
'{"id":"tjk-2710a","datum":"2026-10-27","soort":"opdracht","titel":"Lezen: HO H1–H3 · HO 4.1–4.6","notitie":"Criteria 9 en 10. Tabel per fase: fase, kernconcepten, problemen, interventie."}',
'{"id":"tjk-2810a","datum":"2026-10-28","soort":"opdracht","titel":"Lezen: HO 5.1–5.6 · HO 6.1–6.6","notitie":"Vul je tabel per fase aan. Plus 15 min begrippen afbakenen."}',
'{"id":"tjk-2810b","datum":"2026-10-28","soort":"opdracht","titel":"Casus 3 (Mees) maken","notitie":""}',
'{"id":"tjk-2910a","datum":"2026-10-29","soort":"opdracht","titel":"Lezen: HO 7.1–7.5 · HO H8","notitie":""}',
'{"id":"tjk-2910b","datum":"2026-10-29","soort":"opdracht","titel":"Proeftoets: 2 gemengde casussen onder tijdsdruk (vraag aan Claude)","notitie":"''s Avonds alleen je begrippenkaart, en vroeg naar bed."}',
'{"id":"tjk-3010a","datum":"2026-10-30","soort":"toets","titel":"Casustoets Taal jongere kind","notitie":"''s Ochtends alleen je begrippenkaart doorlezen. Geen nieuwe stof."}'
]) as x
where not exists (select 1 from kalender.klaarzetten where naam = 'gijs')
  and not exists (select 1 from kalender.gebruikers where naam = 'gijs');

-- Controle: hier hoort 15 en 6 uit te komen.
select (select count(*) from kalender.klaarzetten) as klaargezet,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'kal_%') as publieke_functies;
