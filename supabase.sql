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
