-- =====================================================================
-- Digigenda: inloggen met gebruikersnaam + pincode (4 cijfers), agenda's en agenda-koppeling
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

-- ---------- Versie 2: tijd, agenda's, instellingen, agenda-link ----------
alter table kalender.opdrachten add column if not exists tijd text;
alter table kalender.opdrachten add column if not exists agenda text not null default 'school';
alter table kalender.opdrachten drop constraint if exists opdrachten_soort_check;
alter table kalender.opdrachten add constraint opdrachten_soort_check
  check (soort in ('opdracht','deadline','herkansing','toets','afspraak','overig'));
alter table kalender.opdrachten drop constraint if exists opdrachten_tijd_check;
alter table kalender.opdrachten add constraint opdrachten_tijd_check
  check (tijd is null or tijd ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table kalender.opdrachten drop constraint if exists opdrachten_agenda_check;
alter table kalender.opdrachten add constraint opdrachten_agenda_check
  check (agenda in ('school','werk','persoonlijk'));
alter table kalender.gebruikers add column if not exists instellingen jsonb not null default '{}'::jsonb;
alter table kalender.gebruikers add column if not exists agenda_code text unique;

-- ---------- Versie 2: functies (vervangen die van versie 1) ----------
create or replace function kalender.lijst_van(p_gebruiker uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'titel', o.titel, 'datum', to_char(o.datum, 'YYYY-MM-DD'), 'tijd', o.tijd,
    'soort', o.soort, 'agenda', o.agenda, 'notitie', o.notitie, 'klaar', o.klaar)
    order by o.datum, o.tijd nulls first), '[]'::jsonb)
  from kalender.opdrachten o where o.gebruiker_id = p_gebruiker;
$$;

create or replace function kalender.bewaar_een(p_gebruiker uuid, o jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from kalender.opdrachten where gebruiker_id = p_gebruiker) >= 1000 then
    raise exception 'te_veel';
  end if;
  insert into kalender.opdrachten (gebruiker_id, id, titel, datum, tijd, soort, agenda, notitie, klaar, bijgewerkt)
  values (p_gebruiker, o->>'id', left(o->>'titel', 80), (o->>'datum')::date,
          case when o->>'tijd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then o->>'tijd' else null end,
          case when o->>'soort' in ('opdracht','deadline','herkansing','toets','afspraak','overig') then o->>'soort' else 'opdracht' end,
          case when o->>'agenda' in ('school','werk','persoonlijk') then o->>'agenda' else 'school' end,
          left(coalesce(o->>'notitie',''), 400), coalesce((o->>'klaar')::boolean, false), now())
  on conflict (gebruiker_id, id) do update set
    titel = excluded.titel, datum = excluded.datum, tijd = excluded.tijd, soort = excluded.soort,
    agenda = excluded.agenda, notitie = excluded.notitie, klaar = excluded.klaar, bijgewerkt = now();
end $$;

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
  return jsonb_build_object('ok', true, 'naam', n, 'token', kalender.nieuwe_sessie(g),
    'opdrachten', kalender.lijst_van(g), 'instellingen', '{}'::jsonb);
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
  return jsonb_build_object('ok', true, 'naam', n, 'token', kalender.nieuwe_sessie(u.id),
    'opdrachten', kalender.lijst_van(u.id), 'instellingen', u.instellingen);
end $$;

create or replace function public.kal_lijst(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); n text; i jsonb;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  select naam, instellingen into n, i from kalender.gebruikers where id = g;
  perform kalender.zet_klaar(g, n);
  return jsonb_build_object('ok', true, 'naam', n, 'opdrachten', kalender.lijst_van(g), 'instellingen', i);
end $$;

-- Instellingen (welke agenda's, Pabo-toetsrooster, doelgroep) bewaren
create or replace function public.kal_instellingen(p_token uuid, p_instellingen jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  if jsonb_typeof(p_instellingen) <> 'object' or length(p_instellingen::text) > 2000 then
    return jsonb_build_object('ok', false, 'fout', 'Ongeldige instellingen.');
  end if;
  update kalender.gebruikers set instellingen = p_instellingen where id = g;
  return jsonb_build_object('ok', true);
end $$;

-- Geheime link voor het agenda-abonnement (iPhone Agenda). p_nieuw = true maakt een nieuwe; de oude werkt dan niet meer.
create or replace function public.kal_agenda_link(p_token uuid, p_nieuw boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); c text;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  select agenda_code into c from kalender.gebruikers where id = g;
  if c is null or p_nieuw then
    c := encode(extensions.gen_random_bytes(18), 'hex');
    update kalender.gebruikers set agenda_code = c where id = g;
  end if;
  return jsonb_build_object('ok', true, 'code', c);
end $$;

-- Gegevens voor het agenda-abonnement, alleen op te vragen met de geheime code
create or replace function public.kal_ics_data(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u kalender.gebruikers%rowtype;
begin
  if p_code is null or length(p_code) < 32 then return jsonb_build_object('ok', false); end if;
  select * into u from kalender.gebruikers where agenda_code = p_code;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'naam', u.naam, 'instellingen', u.instellingen, 'opdrachten', kalender.lijst_van(u.id));
end $$;

revoke all on all functions in schema kalender from public, anon, authenticated;
revoke all on function public.kal_instellingen(uuid, jsonb), public.kal_agenda_link(uuid, boolean), public.kal_ics_data(text) from public;
grant execute on function public.kal_instellingen(uuid, jsonb), public.kal_agenda_link(uuid, boolean), public.kal_ics_data(text) to anon, authenticated;

-- ---------- Versie 3: beveiliging ----------
-- Oplopende blokkade (15 min, 1 uur, 4 uur, 24 uur), geen makkelijke pincodes,
-- maximum aantal nieuwe accounts per uur, pincode wijzigen en overal uitloggen.
alter table kalender.gebruikers add column if not exists blokkades int not null default 0;

create or replace function kalender.zwakke_pin(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^(\d)\1{3}$'
      or p ~ '^(19|20)\d\d$'
      or p in ('0123','1234','2345','3456','4567','5678','6789','7890','0987','9876','8765','7654','6543','5432','4321','3210',
               '1212','1313','2121','1122','2211','1010','0101','1001','6969','2580','0852','1357','2468','1004','4200','1230','0007');
$$;

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
  if kalender.zwakke_pin(p_pin) then
    return jsonb_build_object('ok', false, 'fout', 'Deze pincode is te makkelijk te raden. Kies geen 1234, 0000, een jaartal of een reeks.');
  end if;
  if (select count(*) from kalender.gebruikers where gemaakt > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'fout', 'Er zijn net veel nieuwe accounts gemaakt. Probeer het over een uur opnieuw.');
  end if;
  if (select count(*) from kalender.gebruikers) >= 500 then
    return jsonb_build_object('ok', false, 'fout', 'Het maximale aantal accounts is bereikt.');
  end if;
  if exists (select 1 from kalender.gebruikers where naam = n) then
    return jsonb_build_object('ok', false, 'fout', 'Deze gebruikersnaam is al bezet. Kies een andere of log in.');
  end if;
  insert into kalender.gebruikers (naam, pin_hash) values (n, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  returning id into g;
  perform kalender.zet_klaar(g, n);
  return jsonb_build_object('ok', true, 'naam', n, 'token', kalender.nieuwe_sessie(g),
    'opdrachten', kalender.lijst_van(g), 'instellingen', '{}'::jsonb);
end $$;

create or replace function public.kal_inloggen(p_naam text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n text := lower(trim(p_naam)); u kalender.gebruikers%rowtype; minuten int; stap int;
begin
  select * into u from kalender.gebruikers where naam = n;
  if not found then
    return jsonb_build_object('ok', false, 'fout', 'Gebruikersnaam of pincode klopt niet.');
  end if;
  if u.geblokkeerd_tot is not null and u.geblokkeerd_tot > now() then
    minuten := ceil(extract(epoch from (u.geblokkeerd_tot - now())) / 60)::int;
    return jsonb_build_object('ok', false, 'fout', 'Te vaak een verkeerde pincode. Probeer het over ' ||
      case when minuten > 90 then ceil(minuten / 60.0)::int || ' uur' else minuten || ' minuten' end || ' opnieuw.');
  end if;
  if p_pin !~ '^[0-9]{4}$' or extensions.crypt(p_pin, u.pin_hash) <> u.pin_hash then
    if u.mislukt + 1 >= 5 then
      stap := least(u.blokkades, 3);
      update kalender.gebruikers set mislukt = 0, blokkades = u.blokkades + 1,
        geblokkeerd_tot = now() + (array[interval '15 minutes', interval '1 hour', interval '4 hours', interval '24 hours'])[stap + 1]
      where id = u.id;
      return jsonb_build_object('ok', false, 'fout', 'Vijf keer een verkeerde pincode. Je account is ' ||
        (array['15 minuten', '1 uur', '4 uur', '24 uur'])[stap + 1] || ' geblokkeerd.');
    end if;
    update kalender.gebruikers set mislukt = u.mislukt + 1 where id = u.id;
    return jsonb_build_object('ok', false, 'fout', 'Gebruikersnaam of pincode klopt niet.');
  end if;
  update kalender.gebruikers set mislukt = 0, blokkades = 0, geblokkeerd_tot = null where id = u.id;
  perform kalender.zet_klaar(u.id, n);
  return jsonb_build_object('ok', true, 'naam', n, 'token', kalender.nieuwe_sessie(u.id),
    'opdrachten', kalender.lijst_van(u.id), 'instellingen', u.instellingen);
end $$;

-- Pincode wijzigen. Andere apparaten worden daarna uitgelogd.
create or replace function public.kal_pin_wijzigen(p_token uuid, p_oud text, p_nieuw text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); u kalender.gebruikers%rowtype;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  select * into u from kalender.gebruikers where id = g;
  if p_oud !~ '^[0-9]{4}$' or extensions.crypt(p_oud, u.pin_hash) <> u.pin_hash then
    if u.mislukt + 1 >= 5 then
      -- te vaak fout: overal uitloggen en blokkeren, alsof iemand de pincode probeert te raden
      update kalender.gebruikers set mislukt = 0, blokkades = u.blokkades + 1,
        geblokkeerd_tot = now() + interval '15 minutes' where id = g;
      update kalender.sessies set verloopt = now() where gebruiker_id = g;
      return jsonb_build_object('ok', false, 'sessie', false);
    end if;
    update kalender.gebruikers set mislukt = u.mislukt + 1 where id = g;
    return jsonb_build_object('ok', false, 'fout', 'Je huidige pincode klopt niet.');
  end if;
  if p_nieuw !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'fout', 'De nieuwe pincode moet uit precies 4 cijfers bestaan.');
  end if;
  if kalender.zwakke_pin(p_nieuw) then
    return jsonb_build_object('ok', false, 'fout', 'Deze pincode is te makkelijk te raden. Kies geen 1234, 0000, een jaartal of een reeks.');
  end if;
  update kalender.gebruikers set pin_hash = extensions.crypt(p_nieuw, extensions.gen_salt('bf', 8)), mislukt = 0 where id = g;
  update kalender.sessies set verloopt = now() where gebruiker_id = g and token <> p_token;
  return jsonb_build_object('ok', true);
end $$;

-- Uitloggen op alle apparaten (alle inlogbewijzen van dit account verlopen meteen)
create or replace function public.kal_uitloggen_overal(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  update kalender.sessies set verloopt = now() where gebruiker_id = g;
  return jsonb_build_object('ok', true);
end $$;

revoke all on all functions in schema kalender from public, anon, authenticated;
revoke all on function public.kal_pin_wijzigen(uuid, text, text), public.kal_uitloggen_overal(uuid) from public;
grant execute on function public.kal_pin_wijzigen(uuid, text, text), public.kal_uitloggen_overal(uuid) to anon, authenticated;

-- Controle: hier hoort 11 uit te komen (publieke kal_-functies).
select count(*) as publieke_functies from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'kal_%';

-- ---------- Versie 4: eindtijd en meldingen ----------
alter table kalender.opdrachten add column if not exists eind text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'opdrachten_eind_check') then
    alter table kalender.opdrachten add constraint opdrachten_eind_check
      check (eind is null or eind ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;

create or replace function kalender.lijst_van(p_gebruiker uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'titel', o.titel, 'datum', to_char(o.datum, 'YYYY-MM-DD'), 'tijd', o.tijd, 'eind', o.eind,
    'soort', o.soort, 'agenda', o.agenda, 'notitie', o.notitie, 'klaar', o.klaar)
    order by o.datum, o.tijd nulls first), '[]'::jsonb)
  from kalender.opdrachten o where o.gebruiker_id = p_gebruiker;
$$;

create or replace function kalender.bewaar_een(p_gebruiker uuid, o jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from kalender.opdrachten where gebruiker_id = p_gebruiker) >= 1000 then
    raise exception 'te_veel';
  end if;
  insert into kalender.opdrachten (gebruiker_id, id, titel, datum, tijd, eind, soort, agenda, notitie, klaar, bijgewerkt)
  values (p_gebruiker, o->>'id', left(o->>'titel', 80), (o->>'datum')::date,
          case when o->>'tijd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then o->>'tijd' else null end,
          case when o->>'eind' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then o->>'eind' else null end,
          case when o->>'soort' in ('opdracht','deadline','herkansing','toets','afspraak','overig') then o->>'soort' else 'opdracht' end,
          case when o->>'agenda' in ('school','werk','persoonlijk') then o->>'agenda' else 'school' end,
          left(coalesce(o->>'notitie',''), 400), coalesce((o->>'klaar')::boolean, false), now())
  on conflict (gebruiker_id, id) do update set
    titel = excluded.titel, datum = excluded.datum, tijd = excluded.tijd, eind = excluded.eind, soort = excluded.soort,
    agenda = excluded.agenda, notitie = excluded.notitie, klaar = excluded.klaar, bijgewerkt = now();
end $$;

-- Pushmeldingen: één rij per apparaat (abonnement)
create table if not exists kalender.push (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  gebruiker_id uuid not null references kalender.gebruikers(id),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  actief boolean not null default true,
  gemaakt timestamptz not null default now()
);
create index if not exists push_gebruiker_idx on kalender.push (gebruiker_id);
create table if not exists kalender.meldingen_gestuurd (
  gebruiker_id uuid not null references kalender.gebruikers(id),
  sleutel text not null,
  gestuurd timestamptz not null default now(),
  primary key (gebruiker_id, sleutel)
);
alter table kalender.push enable row level security;
alter table kalender.meldingen_gestuurd enable row level security;

create or replace function public.kal_push_aanmelden(p_token uuid, p_abonnement jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); e text := p_abonnement->>'endpoint';
  k1 text := p_abonnement->'keys'->>'p256dh'; k2 text := p_abonnement->'keys'->>'auth';
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  if e is null or e !~ '^https://' or length(e) > 1000 or k1 !~ '^[A-Za-z0-9_-]{40,200}=*$' or k2 !~ '^[A-Za-z0-9_-]{10,100}=*$' then
    return jsonb_build_object('ok', false, 'fout', 'Ongeldig meldingen-abonnement.');
  end if;
  if (select count(*) from kalender.push where gebruiker_id = g and actief and endpoint <> e) >= 10 then
    return jsonb_build_object('ok', false, 'fout', 'Je hebt meldingen al op 10 apparaten aanstaan.');
  end if;
  insert into kalender.push (endpoint, gebruiker_id, p256dh, auth, actief) values (e, g, k1, k2, true)
  on conflict (endpoint) do update set gebruiker_id = excluded.gebruiker_id, p256dh = excluded.p256dh, auth = excluded.auth, actief = true;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kal_push_afmelden(p_token uuid, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  update kalender.push set actief = false where endpoint = p_endpoint and gebruiker_id = g;
  return jsonb_build_object('ok', true);
end $$;

-- Alleen voor de serverfunctie (service_role): welke meldingen moeten nu verstuurd worden?
create or replace function public.kal_meldingen_ophalen(p_nu timestamp default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  nu timestamp := coalesce(p_nu, now() at time zone 'Europe/Amsterdam');   -- p_nu alleen om te testen
  vandaag date := coalesce(p_nu, now() at time zone 'Europe/Amsterdam')::date;
  uit jsonb := '[]'::jsonb;
  r record; t record; sl text; tekst text; todos int; eerste record;
begin
  -- 1. 15 minuten vóór een afspraak (alles met een begintijd)
  for r in
    select o.*, u.instellingen, (o.datum + o.tijd::time) as start
    from kalender.opdrachten o join kalender.gebruikers u on u.id = o.gebruiker_id
    where o.tijd is not null and o.datum between vandaag and vandaag + 1
      and (o.datum + o.tijd::time) > nu and (o.datum + o.tijd::time) <= nu + interval '15 minutes'
      and coalesce((u.instellingen->'meldingen'->>'afspraak')::boolean, true)
      and (jsonb_typeof(u.instellingen->'agendas') is distinct from 'array' or u.instellingen->'agendas' ? o.agenda)
      and exists (select 1 from kalender.push p where p.gebruiker_id = o.gebruiker_id and p.actief)
  loop
    sl := 'af:' || r.id || ':' || r.datum || ':' || r.tijd;
    insert into kalender.meldingen_gestuurd (gebruiker_id, sleutel) values (r.gebruiker_id, sl) on conflict do nothing;
    if found then
      tekst := 'Om ' || r.tijd || coalesce(' tot ' || r.eind, '') || ' · over ' ||
               greatest(1, ceil(extract(epoch from (r.start - nu)) / 60))::int || ' min';
      for t in select * from kalender.push p where p.gebruiker_id = r.gebruiker_id and p.actief loop
        uit := uit || jsonb_build_object('endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
          'titel', r.titel, 'tekst', tekst, 'tag', sl);
      end loop;
    end if;
  end loop;

  -- 2. Ochtendoverzicht vanaf 07:30 (tot 10:00)
  if nu::time >= time '07:30' and nu::time < time '10:00' then
    for r in
      select u.id, u.instellingen from kalender.gebruikers u
      where coalesce((u.instellingen->'meldingen'->>'ochtend')::boolean, true)
        and exists (select 1 from kalender.push p where p.gebruiker_id = u.id and p.actief)
    loop
      sl := 'ochtend:' || vandaag;
      insert into kalender.meldingen_gestuurd (gebruiker_id, sleutel) values (r.id, sl) on conflict do nothing;
      if found then
        select count(*) into todos from kalender.opdrachten o
          where o.gebruiker_id = r.id and o.datum = vandaag and o.tijd is null and not o.klaar
            and (jsonb_typeof(r.instellingen->'agendas') is distinct from 'array' or r.instellingen->'agendas' ? o.agenda);
        select o.tijd, o.titel into eerste from kalender.opdrachten o
          where o.gebruiker_id = r.id and o.datum = vandaag and o.tijd is not null
            and (jsonb_typeof(r.instellingen->'agendas') is distinct from 'array' or r.instellingen->'agendas' ? o.agenda)
          order by o.tijd limit 1;
        if todos > 0 or eerste.tijd is not null then
          tekst := case when todos = 1 then '1 to-do' else todos || ' to-do''s' end ||
                   coalesce(' · eerste afspraak ' || eerste.tijd || ' ' || eerste.titel, ' · geen afspraken');
          for t in select * from kalender.push p where p.gebruiker_id = r.id and p.actief loop
            uit := uit || jsonb_build_object('endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
              'titel', 'Goedemorgen! Vandaag:', 'tekst', tekst, 'tag', sl);
          end loop;
        end if;
      end if;
    end loop;
  end if;
  return uit;
end $$;

-- Alleen voor de serverfunctie: abonnementen van wie een testmelding vraagt
create or replace function public.kal_push_test_doelen(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  return jsonb_build_object('ok', true, 'doelen', coalesce((select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
    from kalender.push where gebruiker_id = g and actief), '[]'::jsonb));
end $$;

-- Alleen voor de serverfunctie: abonnement dat niet meer bestaat uitzetten
create or replace function public.kal_push_ongeldig(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  update kalender.push set actief = false where endpoint = p_endpoint;
$$;

revoke all on all functions in schema kalender from public, anon, authenticated;
revoke all on function public.kal_push_aanmelden(uuid, jsonb), public.kal_push_afmelden(uuid, text),
  public.kal_meldingen_ophalen(timestamp), public.kal_push_test_doelen(uuid), public.kal_push_ongeldig(text) from public, anon, authenticated;
grant execute on function public.kal_push_aanmelden(uuid, jsonb), public.kal_push_afmelden(uuid, text) to anon, authenticated;
grant execute on function public.kal_meldingen_ophalen(timestamp), public.kal_push_test_doelen(uuid), public.kal_push_ongeldig(text) to service_role;

-- Sleutels voor meldingen. Deze staan NIET in deze repository. Vul ze bij een nieuwe installatie zelf in:
--   vapid_publiek     publieke VAPID-sleutel (base64url, 65 bytes); dezelfde als in cloud.js
--   vapid_prive_jwk   private sleutel als JWK, bijv. {"kty":"EC","crv":"P-256","x":"…","y":"…","d":"…"}
--   meldingen_geheim  lang willekeurig geheim; de planner stuurt dit mee naar de serverfunctie
create table if not exists kalender.config (sleutel text primary key, waarde text not null);
alter table kalender.config enable row level security;
-- insert into kalender.config (sleutel, waarde) values ('vapid_publiek', '…'), ('vapid_prive_jwk', '…'), ('meldingen_geheim', '…')
--   on conflict (sleutel) do update set waarde = excluded.waarde;

-- Alleen voor de serverfunctie: sleutels om meldingen te ondertekenen
create or replace function public.kal_meldingen_sleutels()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'publiek', (select waarde from kalender.config where sleutel = 'vapid_publiek'),
    'priveJwk', (select waarde::jsonb from kalender.config where sleutel = 'vapid_prive_jwk'),
    'geheim', (select waarde from kalender.config where sleutel = 'meldingen_geheim'));
$$;
revoke all on function public.kal_meldingen_sleutels() from public, anon, authenticated;
grant execute on function public.kal_meldingen_sleutels() to service_role;

-- ---------- Versie 4c: meldingen alleen naar apparaten die nog ingelogd zijn ----------
-- Elk apparaat onthoudt met welk inlogbewijs het meldingen aanzette. Uitloggen, 'uitloggen op
-- alle apparaten', een nieuwe pincode of een verlopen inlog stopt de meldingen dus vanzelf.
alter table kalender.push add column if not exists sessie uuid;

create or replace function kalender.actieve_push(p_gebruiker uuid)
returns setof kalender.push language sql stable security definer set search_path = '' as $$
  select p.* from kalender.push p
  where p.gebruiker_id = p_gebruiker and p.actief
    and exists (select 1 from kalender.sessies s where s.token = p.sessie and s.gebruiker_id = p_gebruiker and s.verloopt > now());
$$;
revoke all on function kalender.actieve_push(uuid) from public, anon, authenticated;

create or replace function public.kal_push_aanmelden(p_token uuid, p_abonnement jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); e text := p_abonnement->>'endpoint';
  k1 text := p_abonnement->'keys'->>'p256dh'; k2 text := p_abonnement->'keys'->>'auth';
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  if e is null or e !~ '^https://' or length(e) > 1000 or k1 !~ '^[A-Za-z0-9_-]{40,200}=*$' or k2 !~ '^[A-Za-z0-9_-]{10,100}=*$' then
    return jsonb_build_object('ok', false, 'fout', 'Ongeldig meldingen-abonnement.');
  end if;
  if (select count(*) from kalender.actieve_push(g) where endpoint <> e) >= 10 then
    return jsonb_build_object('ok', false, 'fout', 'Je hebt meldingen al op 10 apparaten aanstaan.');
  end if;
  insert into kalender.push (endpoint, gebruiker_id, p256dh, auth, actief, sessie) values (e, g, k1, k2, true, p_token)
  on conflict (endpoint) do update set gebruiker_id = excluded.gebruiker_id, p256dh = excluded.p256dh,
    auth = excluded.auth, actief = true, sessie = excluded.sessie;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kal_push_test_doelen(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  return jsonb_build_object('ok', true, 'doelen', coalesce((select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
    from kalender.actieve_push(g) where sessie = p_token), '[]'::jsonb));
end $$;

create or replace function public.kal_meldingen_ophalen(p_nu timestamp default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  nu timestamp := coalesce(p_nu, now() at time zone 'Europe/Amsterdam');   -- p_nu alleen om te testen
  vandaag date := coalesce(p_nu, now() at time zone 'Europe/Amsterdam')::date;
  uit jsonb := '[]'::jsonb;
  r record; t record; sl text; tekst text; todos int; eerste record;
begin
  -- 1. 15 minuten vóór een afspraak (alles met een begintijd)
  for r in
    select o.*, u.instellingen, (o.datum + o.tijd::time) as start
    from kalender.opdrachten o join kalender.gebruikers u on u.id = o.gebruiker_id
    where o.tijd is not null and o.datum between vandaag and vandaag + 1
      and (o.datum + o.tijd::time) > nu and (o.datum + o.tijd::time) <= nu + interval '15 minutes'
      and coalesce((u.instellingen->'meldingen'->>'afspraak')::boolean, true)
      and (jsonb_typeof(u.instellingen->'agendas') is distinct from 'array' or u.instellingen->'agendas' ? o.agenda)
      and exists (select 1 from kalender.actieve_push(o.gebruiker_id))
  loop
    sl := 'af:' || r.id || ':' || r.datum || ':' || r.tijd;
    insert into kalender.meldingen_gestuurd (gebruiker_id, sleutel) values (r.gebruiker_id, sl) on conflict do nothing;
    if found then
      tekst := 'Om ' || r.tijd || coalesce(' tot ' || r.eind, '') || ' · over ' ||
               greatest(1, ceil(extract(epoch from (r.start - nu)) / 60))::int || ' min';
      for t in select * from kalender.actieve_push(r.gebruiker_id) loop
        uit := uit || jsonb_build_object('endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
          'titel', r.titel, 'tekst', tekst, 'tag', sl);
      end loop;
    end if;
  end loop;

  -- 2. Ochtendoverzicht vanaf 07:30 (tot 10:00)
  if nu::time >= time '07:30' and nu::time < time '10:00' then
    for r in
      select u.id, u.instellingen from kalender.gebruikers u
      where coalesce((u.instellingen->'meldingen'->>'ochtend')::boolean, true)
        and exists (select 1 from kalender.actieve_push(u.id))
    loop
      sl := 'ochtend:' || vandaag;
      insert into kalender.meldingen_gestuurd (gebruiker_id, sleutel) values (r.id, sl) on conflict do nothing;
      if found then
        select count(*) into todos from kalender.opdrachten o
          where o.gebruiker_id = r.id and o.datum = vandaag and o.tijd is null and not o.klaar
            and (jsonb_typeof(r.instellingen->'agendas') is distinct from 'array' or r.instellingen->'agendas' ? o.agenda);
        select o.tijd, o.titel into eerste from kalender.opdrachten o
          where o.gebruiker_id = r.id and o.datum = vandaag and o.tijd is not null
            and (jsonb_typeof(r.instellingen->'agendas') is distinct from 'array' or r.instellingen->'agendas' ? o.agenda)
          order by o.tijd limit 1;
        if todos > 0 or eerste.tijd is not null then
          tekst := case when todos = 1 then '1 to-do' else todos || ' to-do''s' end ||
                   coalesce(' · eerste afspraak ' || eerste.tijd || ' ' || eerste.titel, ' · geen afspraken');
          for t in select * from kalender.actieve_push(r.id) loop
            uit := uit || jsonb_build_object('endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
              'titel', 'Goedemorgen! Vandaag:', 'tekst', tekst, 'tag', sl);
          end loop;
        end if;
      end if;
    end loop;
  end if;
  return uit;
end $$;

create or replace function kalender.meldingen_nodig()
returns boolean language sql stable security definer set search_path = '' as $$
  with nu as (select (now() at time zone 'Europe/Amsterdam') as t)
  select exists (
    select 1 from nu, kalender.opdrachten o join kalender.gebruikers u on u.id = o.gebruiker_id
    where o.tijd is not null and o.datum between nu.t::date and nu.t::date + 1
      and (o.datum + o.tijd::time) > nu.t and (o.datum + o.tijd::time) <= nu.t + interval '15 minutes'
      and coalesce((u.instellingen->'meldingen'->>'afspraak')::boolean, true)
      and (jsonb_typeof(u.instellingen->'agendas') is distinct from 'array' or u.instellingen->'agendas' ? o.agenda)
      and exists (select 1 from kalender.actieve_push(o.gebruiker_id))
      and not exists (select 1 from kalender.meldingen_gestuurd m
                      where m.gebruiker_id = o.gebruiker_id and m.sleutel = 'af:' || o.id || ':' || o.datum || ':' || o.tijd)
  ) or exists (
    select 1 from nu, kalender.gebruikers u
    where nu.t::time >= time '07:30' and nu.t::time < time '10:00'
      and coalesce((u.instellingen->'meldingen'->>'ochtend')::boolean, true)
      and exists (select 1 from kalender.actieve_push(u.id))
      and not exists (select 1 from kalender.meldingen_gestuurd m
                      where m.gebruiker_id = u.id and m.sleutel = 'ochtend:' || nu.t::date)
  );
$$;
revoke all on function kalender.meldingen_nodig() from public, anon, authenticated;

-- Planner: elke minuut een snelle controle; alleen als er iets te melden is, wordt de serverfunctie aangeroepen.
-- Het geheim wordt tijdens het draaien uit kalender.config gelezen. Pas de URL aan voor een ander project.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('digigenda-meldingen', '* * * * *', $job$
  select net.http_post(
    url := 'https://srfigofpluibrrgcefuq.supabase.co/functions/v1/digigenda-meldingen',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-digigenda-geheim', (select waarde from kalender.config where sleutel = 'meldingen_geheim')),
    body := '{"cron":true}'::jsonb,
    timeout_milliseconds := 20000)
  where kalender.meldingen_nodig();
$job$);

-- ---------- Versie 5: beveiligingsaudit ----------
-- 1. De website praat altijd als 'anon' (publishable key zonder inlog); Supabase-Auth-gebruikers van
--    andere apps in dit project (rol 'authenticated') hoeven de kal_-functies niet te kunnen aanroepen.
revoke all on function public.kal_registreer(text, text), public.kal_inloggen(text, text), public.kal_lijst(uuid),
  public.kal_bewaar(uuid, jsonb), public.kal_verwijder(uuid, text), public.kal_uitloggen(uuid),
  public.kal_instellingen(uuid, jsonb), public.kal_agenda_link(uuid, boolean), public.kal_pin_wijzigen(uuid, text, text),
  public.kal_uitloggen_overal(uuid), public.kal_push_aanmelden(uuid, jsonb), public.kal_push_afmelden(uuid, text)
  from authenticated;
-- 2. De ics-gegevens zijn alleen nodig voor de serverfunctie (die gebruikt de service-role-sleutel).
revoke all on function public.kal_ics_data(text) from public, anon, authenticated;
grant execute on function public.kal_ics_data(text) to service_role;
-- 3. Elke tabel een primaire sleutel
alter table kalender.klaarzetten add column if not exists id bigint generated by default as identity;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'kalender.klaarzetten'::regclass and contype = 'p') then
    alter table kalender.klaarzetten add primary key (id);
  end if;
end $$;
-- 4. Opslaan: foute invoer netjes melden in plaats van een databasefout
create or replace function public.kal_bewaar(p_token uuid, p_lijst jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); o jsonb;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  if jsonb_typeof(p_lijst) <> 'array' or jsonb_array_length(p_lijst) > 500 then
    return jsonb_build_object('ok', false, 'fout', 'Ongeldige lijst.');
  end if;
  for o in select * from jsonb_array_elements(p_lijst) loop
    if jsonb_typeof(o) <> 'object' or coalesce(o->>'id', '') !~ '^[A-Za-z0-9_.:-]{1,40}$'
       or coalesce(o->>'datum', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or length(trim(coalesce(o->>'titel', ''))) = 0 then
      return jsonb_build_object('ok', false, 'fout', 'Een opdracht is ongeldig en is niet opgeslagen.');
    end if;
  end loop;
  begin
    for o in select * from jsonb_array_elements(p_lijst) loop
      perform kalender.bewaar_een(g, o);
    end loop;
  exception when others then
    if sqlerrm = 'te_veel' then return jsonb_build_object('ok', false, 'fout', 'Je hebt het maximum van 1000 opdrachten bereikt. Verwijder eerst oude opdrachten.'); end if;
    return jsonb_build_object('ok', false, 'fout', 'Opslaan is niet gelukt (ongeldige datum of tekst).');
  end;
  return jsonb_build_object('ok', true);
end $$;
-- 5. Testmelding: hoogstens één per minuut per account (tegen misbruik van de meldingendienst)
create or replace function public.kal_push_test_doelen(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  insert into kalender.meldingen_gestuurd (gebruiker_id, sleutel) values (g, 'test:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI')) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'fout', 'Je hebt net een testmelding gestuurd. Wacht een minuut en probeer het dan opnieuw.'); end if;
  return jsonb_build_object('ok', true, 'doelen', coalesce((select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
    from kalender.actieve_push(g) where sessie = p_token), '[]'::jsonb));
end $$;
-- 6. Oude 'al gestuurd'-sleutels opruimen (elke nacht om 04:10). Verlopen sessies ruimt kalender.nieuwe_sessie al op bij elke inlog.
create or replace function kalender.opruimen()
returns void language sql security definer set search_path = '' as $$
  delete from kalender.meldingen_gestuurd where gestuurd < now() - interval '14 days';
$$;
revoke all on function kalender.opruimen() from public, anon, authenticated;
select cron.schedule('digigenda-opruimen', '10 4 * * *', 'select kalender.opruimen();');

-- ---------- Versie 6: agenda's binnenhalen (import via link, bestand of tekst) ----------
-- Geïmporteerde afspraken krijgen een 'bron' (het id van de import). Bij verversen worden ze bijgewerkt, niet verdubbeld.
alter table kalender.opdrachten add column if not exists bron text;
-- geldig = false: de rij hoort niet meer bij de (ververste of verwijderde) import. De app ruimt zulke rijen zelf op
-- (via kal_verwijder); het nachtelijke opruimen hieronder haalt de rest weg.
alter table kalender.opdrachten add column if not exists geldig boolean not null default true;
alter table kalender.opdrachten drop constraint if exists opdrachten_bron_check;
alter table kalender.opdrachten add constraint opdrachten_bron_check check (bron is null or bron ~ '^[a-z0-9-]{4,40}$');
create index if not exists opdrachten_bron_idx on kalender.opdrachten (gebruiker_id, bron);

create table if not exists kalender.imports (
  id text not null check (id ~ '^[a-z0-9-]{4,40}$'),
  gebruiker_id uuid not null references kalender.gebruikers(id),
  naam text not null check (length(naam) between 1 and 60),
  soort text not null check (soort in ('link', 'bestand', 'tekst')),
  host text,                      -- alleen de domeinnaam, voor weergave
  url_geheim bytea,               -- de volledige link, versleuteld met de sleutel uit kalender.config
  agenda text not null default 'werk' check (agenda in ('school', 'werk', 'persoonlijk')),
  alleen_bezet boolean not null default false,
  actief boolean not null default true,
  laatst_ververst timestamptz,
  laatste_fout text,
  aantal int not null default 0,
  gemaakt timestamptz not null default now(),
  primary key (gebruiker_id, id)
);
alter table kalender.imports enable row level security;
-- Sleutel voor het versleutelen van links (één keer aangemaakt, nooit in de repository)
insert into kalender.config (sleutel, waarde)
  select 'import_sleutel', encode(extensions.gen_random_bytes(32), 'hex')
  where not exists (select 1 from kalender.config where sleutel = 'import_sleutel');

create or replace function kalender.lijst_van(p_gebruiker uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'titel', o.titel, 'datum', to_char(o.datum, 'YYYY-MM-DD'), 'tijd', o.tijd, 'eind', o.eind,
    'soort', o.soort, 'agenda', o.agenda, 'notitie', o.notitie, 'klaar', o.klaar, 'bron', o.bron)
    order by o.datum, o.tijd nulls first), '[]'::jsonb)
  from kalender.opdrachten o where o.gebruiker_id = p_gebruiker and o.geldig;
$$;

create or replace function public.kal_lijst(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); n text; i jsonb;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  select naam, instellingen into n, i from kalender.gebruikers where id = g;
  perform kalender.zet_klaar(g, n);
  return jsonb_build_object('ok', true, 'naam', n, 'opdrachten', kalender.lijst_van(g), 'instellingen', i,
    'opruimen', coalesce((select jsonb_agg(o.id) from (select id from kalender.opdrachten where gebruiker_id = g and not geldig limit 100) o), '[]'::jsonb));
end $$;

-- Maximum 3000 opdrachten per account (geïmporteerde roosters tellen mee)
create or replace function kalender.bewaar_een(p_gebruiker uuid, o jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from kalender.opdrachten where gebruiker_id = p_gebruiker and geldig) >= 3000 then
    raise exception 'te_veel';
  end if;
  insert into kalender.opdrachten (gebruiker_id, id, titel, datum, tijd, eind, soort, agenda, notitie, klaar, bron, geldig, bijgewerkt)
  values (p_gebruiker, o->>'id', left(o->>'titel', 80), (o->>'datum')::date,
          case when o->>'tijd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then o->>'tijd' else null end,
          case when o->>'eind' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then o->>'eind' else null end,
          case when o->>'soort' in ('opdracht','deadline','herkansing','toets','afspraak','overig') then o->>'soort' else 'opdracht' end,
          case when o->>'agenda' in ('school','werk','persoonlijk') then o->>'agenda' else 'school' end,
          left(coalesce(o->>'notitie',''), 400), coalesce((o->>'klaar')::boolean, false),
          case when o->>'bron' ~ '^[a-z0-9-]{4,40}$' then o->>'bron' else null end, true, now())
  on conflict (gebruiker_id, id) do update set
    titel = excluded.titel, datum = excluded.datum, tijd = excluded.tijd, eind = excluded.eind, soort = excluded.soort,
    agenda = excluded.agenda, notitie = excluded.notitie, klaar = excluded.klaar, bron = excluded.bron, geldig = true, bijgewerkt = now();
end $$;

create or replace function kalender.import_naar_json(i kalender.imports)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', i.id, 'naam', i.naam, 'soort', i.soort, 'host', i.host, 'agenda', i.agenda,
    'alleenBezet', i.alleen_bezet, 'actief', i.actief, 'laatstVerverst', i.laatst_ververst, 'laatsteFout', i.laatste_fout,
    'aantal', i.aantal, 'gemaakt', i.gemaakt);
$$;

-- Lijst van imports (zonder de geheime link)
create or replace function public.kal_imports_lijst(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token);
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  return jsonb_build_object('ok', true, 'imports', coalesce((select jsonb_agg(kalender.import_naar_json(i) order by i.gemaakt)
    from kalender.imports i where i.gebruiker_id = g and i.actief), '[]'::jsonb));
end $$;

-- Import toevoegen of wijzigen. p_import: { id, naam, soort, url?, agenda, alleenBezet }
create or replace function public.kal_import_bewaar(p_token uuid, p_import jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); u text := p_import->>'url'; h text; sl text; nieuw boolean;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  if coalesce(p_import->>'id', '') !~ '^[a-z0-9-]{4,40}$' or length(trim(coalesce(p_import->>'naam', ''))) = 0
     or coalesce(p_import->>'soort', '') not in ('link', 'bestand', 'tekst') then
    return jsonb_build_object('ok', false, 'fout', 'Ongeldige import.');
  end if;
  nieuw := not exists (select 1 from kalender.imports where gebruiker_id = g and id = p_import->>'id');
  if nieuw and (select count(*) from kalender.imports where gebruiker_id = g and actief) >= 10 then
    return jsonb_build_object('ok', false, 'fout', 'Je kunt maximaal 10 agenda''s binnenhalen. Verwijder er eerst een.');
  end if;
  if p_import->>'soort' = 'link' then
    u := regexp_replace(trim(u), '^webcal://', 'https://', 'i');
    if u !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^ ]*)?$' or length(u) > 2000 then
      return jsonb_build_object('ok', false, 'fout', 'De link moet met https:// of webcal:// beginnen.');
    end if;
    h := lower(regexp_replace(u, '^https://([^/:]+).*$', '\1'));
    select waarde into sl from kalender.config where sleutel = 'import_sleutel';
    if sl is null then return jsonb_build_object('ok', false, 'fout', 'De server mist de sleutel voor links.'); end if;
  end if;
  insert into kalender.imports (id, gebruiker_id, naam, soort, host, url_geheim, agenda, alleen_bezet, actief)
  values (p_import->>'id', g, left(trim(p_import->>'naam'), 60), p_import->>'soort', h,
          case when u is not null then extensions.pgp_sym_encrypt(u, sl) end,
          case when p_import->>'agenda' in ('school','werk','persoonlijk') then p_import->>'agenda' else 'werk' end,
          coalesce((p_import->>'alleenBezet')::boolean, false), true)
  on conflict (gebruiker_id, id) do update set
    naam = excluded.naam, agenda = excluded.agenda, alleen_bezet = excluded.alleen_bezet, actief = true,
    host = coalesce(excluded.host, kalender.imports.host), url_geheim = coalesce(excluded.url_geheim, kalender.imports.url_geheim),
    laatste_fout = null;
  return jsonb_build_object('ok', true, 'id', p_import->>'id');
end $$;

-- Hele import verwijderen: de import uit en alle afspraken die eruit kwamen ongeldig (de app ruimt ze daarna op)
create or replace function public.kal_import_verwijder(p_token uuid, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); n int;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  update kalender.opdrachten set geldig = false, bijgewerkt = now() where gebruiker_id = g and bron = p_id and geldig;
  get diagnostics n = row_count;
  update kalender.imports set actief = false, url_geheim = null where gebruiker_id = g and id = p_id;
  return jsonb_build_object('ok', true, 'verwijderd', n,
    'opruimen', coalesce((select jsonb_agg(id) from kalender.opdrachten where gebruiker_id = g and bron = p_id), '[]'::jsonb));
end $$;

-- Alleen voor de serverfunctie: link en instellingen van één import (controleert het inlogbewijs als dat is meegegeven)
create or replace function public.kal_import_ophalen(p_id text, p_gebruiker uuid default null, p_token uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := coalesce(p_gebruiker, kalender.gebruiker_van(p_token)); i kalender.imports%rowtype; sl text; u text;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  select * into i from kalender.imports where gebruiker_id = g and id = p_id and actief;
  if not found then return jsonb_build_object('ok', false, 'fout', 'Import niet gevonden.'); end if;
  if i.url_geheim is not null then
    select waarde into sl from kalender.config where sleutel = 'import_sleutel';
    u := extensions.pgp_sym_decrypt(i.url_geheim, sl);
  end if;
  return jsonb_build_object('ok', true, 'gebruiker', g, 'import', kalender.import_naar_json(i), 'url', u);
end $$;

-- Alleen voor de serverfunctie: welke link-imports zijn aan verversing toe? (ouder dan 50 minuten)
create or replace function public.kal_imports_te_verversen()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('gebruiker', gebruiker_id, 'id', id)), '[]'::jsonb)
  from kalender.imports
  where actief and soort = 'link' and (laatst_ververst is null or laatst_ververst < now() - interval '50 minutes')
    and exists (select 1 from kalender.sessies s where s.gebruiker_id = kalender.imports.gebruiker_id and s.verloopt > now());
$$;

-- Alleen voor de serverfunctie: de afspraken van een import vervangen door de nieuwe lijst (bijwerken, niet verdubbelen)
create or replace function public.kal_import_vervang(p_gebruiker uuid, p_id text, p_items jsonb, p_fout text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o jsonb; n int := 0; ids text[] := '{}';
begin
  if p_fout is not null then
    update kalender.imports set laatste_fout = left(p_fout, 200), laatst_ververst = now() where gebruiker_id = p_gebruiker and id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1500 then
    return jsonb_build_object('ok', false, 'fout', 'Te veel afspraken (maximaal 1500 per import).');
  end if;
  for o in select * from jsonb_array_elements(p_items) loop
    perform kalender.bewaar_een(p_gebruiker, o || jsonb_build_object('bron', p_id));
    ids := ids || (o->>'id');
    n := n + 1;
  end loop;
  update kalender.opdrachten set geldig = false, bijgewerkt = now() where gebruiker_id = p_gebruiker and bron = p_id and geldig and not (id = any(ids));
  update kalender.imports set laatste_fout = null, laatst_ververst = now(), aantal = n where gebruiker_id = p_gebruiker and id = p_id;
  return jsonb_build_object('ok', true, 'aantal', n);
exception when others then
  update kalender.imports set laatste_fout = case when sqlerrm = 'te_veel' then 'Het maximum van 3000 opdrachten is bereikt.' else 'Opslaan is niet gelukt.' end,
    laatst_ververst = now() where gebruiker_id = p_gebruiker and id = p_id;
  return jsonb_build_object('ok', false, 'fout', case when sqlerrm = 'te_veel' then 'Het maximum van 3000 opdrachten is bereikt.' else 'Opslaan is niet gelukt.' end);
end $$;

-- Alleen voor de serverfunctie: hoogstens 12 keer per uur een link ophalen per account (tegen misbruik van de proxy)
create or replace function public.kal_import_toestemming(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid := kalender.gebruiker_van(p_token); n int := 0; sl text;
begin
  if g is null then return jsonb_build_object('ok', false, 'sessie', false); end if;
  sl := 'imp:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');
  select count(*) into n from kalender.meldingen_gestuurd where gebruiker_id = g and sleutel like sl || ':%';
  if n >= 12 then return jsonb_build_object('ok', false, 'fout', 'Je hebt dit uur al vaak een link opgehaald. Probeer het later opnieuw.'); end if;
  insert into kalender.meldingen_gestuurd (gebruiker_id, sleutel) values (g, sl || ':' || (n + 1)) on conflict do nothing;
  return jsonb_build_object('ok', true, 'gebruiker', g);
end $$;

revoke all on all functions in schema kalender from public, anon, authenticated;
revoke all on function public.kal_imports_lijst(uuid), public.kal_import_bewaar(uuid, jsonb), public.kal_import_verwijder(uuid, text),
  public.kal_import_ophalen(text, uuid, uuid), public.kal_imports_te_verversen(), public.kal_import_vervang(uuid, text, jsonb, text),
  public.kal_import_toestemming(uuid) from public, anon, authenticated;
grant execute on function public.kal_imports_lijst(uuid), public.kal_import_bewaar(uuid, jsonb), public.kal_import_verwijder(uuid, text) to anon;
grant execute on function public.kal_import_ophalen(text, uuid, uuid), public.kal_imports_te_verversen(), public.kal_import_vervang(uuid, text, jsonb, text),
  public.kal_import_toestemming(uuid) to service_role;

-- Planner: elk uur de link-imports verversen (de serverfunctie doet de SSRF-controle en het lezen van de .ics)
select cron.schedule('digigenda-imports', '7 * * * *', $job$
  select net.http_post(
    url := 'https://srfigofpluibrrgcefuq.supabase.co/functions/v1/digigenda-import',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-digigenda-geheim', (select waarde from kalender.config where sleutel = 'meldingen_geheim')),
    body := '{"cron":true}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from kalender.imports where actief and soort = 'link');
$job$);

-- ---------- Versie 6b: opruimen van ongeldige rijen (ZELF UITVOEREN in de SQL-editor) ----------
-- De beheerconnector vraagt bij DELETE om een bevestiging; daarom is dit blok niet automatisch uitgevoerd.
-- De app werkt ook zonder: ongeldige rijen worden via kal_verwijder opgeruimd. Dit blok maakt het nachtelijke opruimen volledig.
create or replace function kalender.opruimen()
returns void language sql security definer set search_path = '' as $$
  delete from kalender.meldingen_gestuurd where gestuurd < now() - interval '14 days';
  delete from kalender.opdrachten where not geldig and bijgewerkt < now() - interval '7 days';
  delete from kalender.imports where not actief and gemaakt < now() - interval '30 days';
$$;
revoke all on function kalender.opruimen() from public, anon, authenticated;
