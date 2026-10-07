-- Hardening after the October 2026 red-team review.
--
-- Rule of thumb used below: `current_user in ('authenticated', 'anon')` means the row is being written
-- straight from the app through the API. Security-definer functions (send_inquiry, sms_inbound, the
-- verification RPCs) run as the function owner, and the service role and migrations run as themselves,
-- so they are trusted to set server-only columns.

-- ---------------------------------------------------------------------------
-- 1. Phone numbers: stored in full international form and verified by a texted code before
--    The Index will text them or accept texts from them.
-- ---------------------------------------------------------------------------

-- '+1 (504) 555-0100', '504.555.0100' and '15045550100' all become '+15045550100'.
-- Numbers without a + are read as US/Canada. Anything else that isn't 8-15 digits is rejected (null).
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or btrim(p) = '' then null
    when btrim(p) ~ '^\+' then
      case when length(regexp_replace(p, '\D', '', 'g')) between 8 and 15
           and regexp_replace(p, '\D', '', 'g') !~ '^0'
        then '+' || regexp_replace(p, '\D', '', 'g') end
    when length(regexp_replace(p, '\D', '', 'g')) = 10 then '+1' || regexp_replace(p, '\D', '', 'g')
    when length(regexp_replace(p, '\D', '', 'g')) = 11 and regexp_replace(p, '\D', '', 'g') ~ '^1'
      then '+' || regexp_replace(p, '\D', '', 'g')
  end;
$$;

alter table public.contact_prefs add column phone_verified_at timestamptz;

update public.contact_prefs set phone = public.normalize_phone(phone) where phone is not null;

create or replace function public.guard_contact_prefs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is not null then
    new.phone := public.normalize_phone(new.phone);
    if new.phone is null then
      raise exception 'Enter a full phone number, for example +1 504 555 0100';
    end if;
  end if;
  if current_user in ('authenticated', 'anon') then
    -- Only confirm_phone_code() may mark a number verified, and changing the number un-verifies it.
    if tg_op = 'INSERT' then
      new.phone_verified_at := null;
    elsif new.phone is distinct from old.phone then
      new.phone_verified_at := null;
    else
      new.phone_verified_at := old.phone_verified_at;
    end if;
    new.updated_at := now();
  elsif tg_op = 'UPDATE' and new.phone is distinct from old.phone and new.phone_verified_at is not distinct from old.phone_verified_at then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger contact_prefs_guard
  before insert or update on public.contact_prefs
  for each row execute function public.guard_contact_prefs();

-- A verified number belongs to one account.
create unique index contact_prefs_verified_phone_idx on public.contact_prefs (phone) where phone_verified_at is not null;

-- Codes live in a table members cannot read; `deliver` texts them and then clears the code.
create table public.phone_verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null,
  code text,               -- plain code until it is texted; cleared after sending
  code_hash text not null,
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  sends_today int not null default 0,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  last_error text
);
alter table public.phone_verifications enable row level security;
-- No policies: only the service role and the functions below touch it.

create or replace function public.request_phone_code()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_code text;
  v_row public.phone_verifications;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select phone into v_phone from public.contact_prefs where user_id = auth.uid();
  if v_phone is null then
    raise exception 'Save your phone number first';
  end if;
  if exists (select 1 from public.contact_prefs where phone = v_phone and phone_verified_at is not null and user_id <> auth.uid()) then
    raise exception 'That number is already confirmed on another account';
  end if;
  -- No more than 5 codes a day per member or per number, one a minute.
  if (select count(*) from public.phone_verifications
      where phone = v_phone and user_id <> auth.uid() and last_sent_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many codes were sent to that number today. Try again tomorrow.';
  end if;
  select * into v_row from public.phone_verifications where user_id = auth.uid();
  if v_row.user_id is not null then
    if v_row.last_sent_at > now() - interval '60 seconds' then
      raise exception 'Wait a minute before asking for another code';
    end if;
    if v_row.window_started_at > now() - interval '1 day' and v_row.sends_today >= 5 then
      raise exception 'Too many codes today. Try again tomorrow.';
    end if;
  end if;

  v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.phone_verifications (user_id, phone, code, code_hash)
  values (auth.uid(), v_phone, v_code, md5(auth.uid()::text || ':' || v_phone || ':' || v_code))
  on conflict (user_id) do update set
    phone = excluded.phone, code = excluded.code, code_hash = excluded.code_hash,
    send_status = 'pending', attempts = 0, last_error = null,
    last_sent_at = now(), expires_at = now() + interval '10 minutes',
    sends_today = case when public.phone_verifications.window_started_at > now() - interval '1 day'
                       then public.phone_verifications.sends_today + 1 else 1 end,
    window_started_at = case when public.phone_verifications.window_started_at > now() - interval '1 day'
                             then public.phone_verifications.window_started_at else now() end;
end;
$$;

create or replace function public.confirm_phone_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.phone_verifications;
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select * into v_row from public.phone_verifications where user_id = auth.uid() for update;
  select phone into v_phone from public.contact_prefs where user_id = auth.uid();
  if v_row.user_id is null or v_row.phone is distinct from v_phone then
    raise exception 'Ask for a new code';
  end if;
  if v_row.expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.';
  end if;
  if v_row.attempts >= 5 then
    raise exception 'Too many tries. Ask for a new code.';
  end if;
  if v_row.code_hash <> md5(auth.uid()::text || ':' || v_phone || ':' || regexp_replace(coalesce(p_code, ''), '\D', '', 'g')) then
    update public.phone_verifications set attempts = attempts + 1 where user_id = auth.uid();
    return false;
  end if;
  if exists (select 1 from public.contact_prefs where phone = v_phone and phone_verified_at is not null and user_id <> auth.uid()) then
    raise exception 'That number is already confirmed on another account';
  end if;
  update public.contact_prefs set phone_verified_at = now() where user_id = auth.uid();
  delete from public.phone_verifications where user_id = auth.uid();
  return true;
end;
$$;

revoke execute on function public.request_phone_code() from public, anon;
revoke execute on function public.confirm_phone_code(text) from public, anon;
grant execute on function public.request_phone_code() to authenticated;
grant execute on function public.confirm_phone_code(text) to authenticated;

-- STOP / START texts (carrier keywords). Service role only.
create or replace function public.sms_set_opt_in(p_from text, p_opt_in boolean)
returns int
language sql
security definer
set search_path = public
as $$
  with u as (
    update public.contact_prefs set sms_opt_in = p_opt_in, updated_at = now()
    where phone = public.normalize_phone(p_from) and phone_verified_at is not null
    returning 1
  )
  select count(*)::int from u;
$$;
revoke execute on function public.sms_set_opt_in(text, boolean) from public, anon, authenticated;

-- Texts only go to verified numbers.
create or replace function public.enqueue_notification(
  p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}', p_channels text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prefs public.contact_prefs;
  v_channels text[] := coalesce(p_channels, '{push}');
begin
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_data, '{}'))
  returning id into v_id;

  select * into v_prefs from public.contact_prefs where user_id = p_user;
  if v_prefs.user_id is null or not public.pref_allows(v_prefs, p_kind) then
    return v_id; -- in-app only
  end if;

  if 'push' = any (v_channels) and v_prefs.push_token is not null then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'push');
  end if;
  if 'sms' = any (v_channels) and v_prefs.sms_opt_in and v_prefs.phone is not null and v_prefs.phone_verified_at is not null then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'sms');
  end if;
  if 'email' = any (v_channels) and v_prefs.email_opt_in then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
  end if;
  return v_id;
end;
$$;
revoke execute on function public.enqueue_notification(uuid, text, text, text, jsonb, text[]) from public, anon, authenticated;

-- Kept for compatibility; now compares the full number.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(public.normalize_phone(p), '');
$$;

-- Incoming texts. Changes from round 3:
--  * the full verified number must match (no last-10-digit matching, no unverified numbers)
--  * a text only counts as a check-in answer when it starts with SAFE or NEED, or is just "OK",
--    and the most recent text we sent them was the check-in rather than a conversation
--  * "REPLY ..." forces a text into the conversation; check-in confirmations say so
create or replace function public.sms_inbound(p_from text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_body text := left(btrim(coalesce(p_body, ''), E' \t\r\n'), 2000);
  v_first text;
  v_rest text;
  v_checkin uuid;
  v_checkin_at timestamptz;
  v_conv uuid;
  v_conv_at timestamptz;
  v_title text;
  v_inquiry uuid;
  v_status public.inquiry_status;
  v_is_checkin_word boolean;
begin
  v_first := upper(regexp_replace(split_part(regexp_replace(v_body, '\s+', ' ', 'g'), ' ', 1), '[[:punct:]]+$', ''));
  v_rest := btrim(substring(regexp_replace(v_body, '\s+', ' ', 'g') from length(split_part(regexp_replace(v_body, '\s+', ' ', 'g'), ' ', 1)) + 1));
  if public.normalize_phone(p_from) is null or v_body = '' then
    return jsonb_build_object('handled', false);
  end if;
  select cp.user_id into v_user from public.contact_prefs cp
  where cp.sms_opt_in and cp.phone_verified_at is not null and cp.phone = public.normalize_phone(p_from);
  if v_user is null then
    return jsonb_build_object('handled', false);
  end if;

  -- When did we last text them about a conversation, and about a check-in?
  select substring(n.data ->> 'route' from 9)::uuid, n.created_at into v_conv, v_conv_at
  from public.notifications n
  join public.notification_deliveries d on d.notification_id = n.id and d.channel = 'sms' and d.status = 'sent'
  where n.user_id = v_user and n.kind in ('message', 'inquiry', 'board')
    and n.created_at > now() - interval '3 days'
    and n.data ->> 'route' ~ '^/thread/[0-9a-f-]{36}$'
  order by n.created_at desc limit 1;

  -- "REPLY ..." always goes to the conversation, never the check-in.
  if v_first = 'REPLY' then
    v_body := v_rest;
    v_first := upper(regexp_replace(split_part(v_body, ' ', 1), '[[:punct:]]+$', ''));
    v_rest := btrim(substring(v_body from length(split_part(v_body, ' ', 1)) + 1));
    if v_body = '' then
      return jsonb_build_object('handled', false);
    end if;
  else
    -- 1. Storm check-in answers. Safety comes first: SAFE / NEED (or a bare OK) answers an open
    --    check-in unless the member already answered it and we've texted them about a conversation since.
    v_is_checkin_word := v_first in ('SAFE', 'NEED') or upper(regexp_replace(v_body, '[[:punct:][:space:]]', '', 'g')) = 'OK';
    if v_is_checkin_word then
      select c.id, c.created_at into v_checkin, v_checkin_at from public.checkins c
      where c.closes_at > now() and public.in_audience(v_user, c.audience)
      order by c.created_at desc limit 1;
      if v_checkin is not null then
        select coalesce(max(n.created_at), v_checkin_at) into v_checkin_at from public.notifications n
        where n.user_id = v_user and n.kind = 'checkin' and n.data ->> 'route' = '/checkin/' || v_checkin;
      end if;
      if v_checkin is not null and (
        v_conv_at is null or v_checkin_at >= v_conv_at
        or not exists (select 1 from public.checkin_responses r where r.checkin_id = v_checkin and r.user_id = v_user)
      ) then
        insert into public.checkin_responses (checkin_id, user_id, status, note, via)
        values (v_checkin, v_user, case when v_first = 'NEED' then 'need_help' else 'ok' end, left(v_rest, 1000), 'sms')
        on conflict (checkin_id, user_id) do update set
          status = excluded.status,
          note = coalesce(nullif(excluded.note, ''), public.checkin_responses.note),
          via = 'sms';
        return jsonb_build_object('handled', true, 'checkin_id', v_checkin, 'reply',
          case when v_first = 'NEED'
            then 'Thank you. BFI has your message and someone will reach out. If this is an emergency, call 911.'
            else 'Glad you are OK. Thank you for letting BFI know.' end
          || case when v_conv is not null then ' (Meant for a conversation? Text REPLY and your message.)' else '' end);
      end if;
    end if;
  end if;

  -- 2. Replies to a conversation we texted them about recently.
  if v_conv is null or not exists (
    select 1 from public.conversation_members m where m.conversation_id = v_conv and m.user_id = v_user
  ) then
    return jsonb_build_object('handled', false);
  end if;

  -- A farmer answering an inquiry: YES, PART or NO, optionally followed by a note.
  v_status := case
    when v_first in ('YES', 'READY', 'SI', 'SÍ', 'OUI', 'WI', 'SIM') then 'ready'
    when v_first in ('PART', 'PARTIAL', 'SOME') then 'partial'
    when v_first in ('NO', 'NON', 'NAO', 'NÃO', 'SOLD') then 'unavailable'
  end;
  if v_status is not null then
    select m.id into v_inquiry
    from public.messages m join public.conversations c on c.id = m.conversation_id
    join public.farms f on f.id = c.farm_id
    where m.conversation_id = v_conv and m.kind = 'inquiry' and m.inquiry_status = 'open' and f.owner_id = v_user
    order by m.created_at desc limit 1;
  end if;

  if v_inquiry is not null then
    update public.messages set inquiry_status = v_status where id = v_inquiry;
    insert into public.messages (conversation_id, sender_id, body, via)
    values (v_conv, v_user, left(coalesce(nullif(v_rest, ''), case v_status
      when 'ready' then 'Yes, I can have that ready.'
      when 'partial' then 'I can do part of that order.'
      else 'Sorry, that is not available right now.' end), 2000), 'sms');
  else
    insert into public.messages (conversation_id, sender_id, body, via) values (v_conv, v_user, v_body, 'sms');
  end if;

  select coalesce(c.title, f.name, 'your conversation') into v_title
  from public.conversations c left join public.farms f on f.id = c.farm_id where c.id = v_conv;
  return jsonb_build_object('handled', true, 'conversation_id', v_conv, 'reply',
    case when v_inquiry is not null then 'Answer sent' else 'Sent' end
    || ' to ' || v_title || '. Text FIND and a product to search instead.');
end;
$$;
revoke execute on function public.sms_inbound(text, text) from public, anon, authenticated;

-- Contact details: staff may read them (for check-in follow-up) but not change or delete them.
drop policy "own contact prefs" on public.contact_prefs;
create policy "read own contact prefs" on public.contact_prefs for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "edit own contact prefs" on public.contact_prefs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "create own contact prefs" on public.contact_prefs for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Only admins change roles. Coordinators keep every other staff tool.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, migrations and seed scripts.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only BFI admins can change member roles';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Messages written from the app cannot set server-only columns.
-- ---------------------------------------------------------------------------
create or replace function public.guard_message_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.pinned := false;
    new.hidden := false;
    new.transcript := null;
    new.created_at := now();
    new.via := 'app';
    new.inquiry := null;
    new.inquiry_status := null;
  end if;
  if length(new.body) > 4000 then
    raise exception 'Message is too long';
  end if;
  return new;
end;
$$;

create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();

-- Answering an inquiry twice (a double tap) no longer sends two replies.
create or replace function public.answer_inquiry(p_message_id uuid, p_status public.inquiry_status, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_farm uuid;
begin
  select m.conversation_id, c.farm_id into v_conv, v_farm
  from public.messages m join public.conversations c on c.id = m.conversation_id
  where m.id = p_message_id and m.kind = 'inquiry';
  if v_conv is null or not public.owns_farm(v_farm) then
    raise exception 'Only the farm can answer this inquiry';
  end if;
  update public.messages set inquiry_status = p_status where id = p_message_id and inquiry_status = 'open';
  if not found then
    raise exception 'This inquiry has already been answered';
  end if;
  insert into public.messages (conversation_id, sender_id, body) values (v_conv, auth.uid(), left(p_reply, 4000));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Board posts: a post staff took down stays down, and posts expire within 60 days.
-- ---------------------------------------------------------------------------
create or replace function public.guard_post()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_staff() then
    if tg_op = 'UPDATE' and old.status = 'hidden' then
      new.status := 'hidden';
    end if;
    if tg_op = 'UPDATE' then
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    else
      new.created_at := now();
    end if;
    if new.expires_at > new.created_at + interval '60 days' then
      new.expires_at := new.created_at + interval '60 days';
    end if;
  end if;
  return new;
end;
$$;

create trigger posts_guard
  before insert or update on public.posts
  for each row execute function public.guard_post();

-- ---------------------------------------------------------------------------
-- 5. Links members can set must be https (blocks javascript: and data: links on the web build).
-- ---------------------------------------------------------------------------
update public.farms set website = regexp_replace(website, '^http://', 'https://', 'i') where website ~* '^http://';
update public.farms set website = 'https://' || website where website is not null and website !~* '^[a-z][a-z0-9+.-]*:';
update public.farms set website = null where website is not null and website !~ '^https://';
alter table public.farms add constraint farms_website_https check (website is null or website ~ '^https://[^\s]+$');

update public.events set ticket_url = regexp_replace(ticket_url, '^http://', 'https://', 'i') where ticket_url ~* '^http://';
update public.events set ticket_url = null where ticket_url is not null and ticket_url !~ '^https://';
alter table public.events add constraint events_ticket_https check (ticket_url is null or ticket_url ~ '^https://[^\s]+$');

update public.broadcasts set link_url = null where link_url is not null and link_url !~ '^https://';
alter table public.broadcasts add constraint broadcasts_link_https check (link_url is null or link_url ~ '^https://[^\s]+$');

-- ---------------------------------------------------------------------------
-- 6. Product names: no wildcards matching every near-me alert.
-- ---------------------------------------------------------------------------
alter table public.farm_products add constraint farm_products_name_len check (length(btrim(name)) between 2 and 80);

create or replace function public.notify_fresh_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm public.farms;
  v_user uuid;
  v_route jsonb;
begin
  if not new.in_season or (tg_op = 'UPDATE' and old.in_season) then
    return new;
  end if;
  select * into v_farm from public.farms where id = new.farm_id;
  if v_farm.status <> 'approved' then
    return new;
  end if;
  v_route := jsonb_build_object('route', '/farm/' || v_farm.id, 'farm_id', v_farm.id);

  for v_user in
    select f.user_id from public.follows f
    where f.farm_id = new.farm_id and f.user_id is distinct from v_farm.owner_id
  loop
    if not exists (
      select 1 from public.notifications n
      where n.user_id = v_user and n.kind in ('fresh', 'near_me') and n.data ->> 'farm_id' = v_farm.id::text
        and n.created_at > now() - interval '12 hours'
    ) then
      perform public.enqueue_notification(v_user, 'fresh', v_farm.name, new.name || ' is fresh this week.', v_route, '{push}');
    end if;
  end loop;

  if v_farm.lat is not null and v_farm.lon is not null then
    for v_user in
      select distinct a.user_id from public.saved_alerts a
      where length(btrim(a.keyword)) >= 2
        and (position(lower(btrim(a.keyword)) in lower(new.name)) > 0 or position(lower(btrim(new.name)) in lower(a.keyword)) > 0)
        and public.miles(a.lat, a.lon, v_farm.lat, v_farm.lon) <= a.radius_miles
        and a.user_id is distinct from v_farm.owner_id
    loop
      if not exists (
        select 1 from public.notifications n
        where n.user_id = v_user and n.kind in ('fresh', 'near_me') and n.data ->> 'farm_id' = v_farm.id::text
          and n.created_at > now() - interval '12 hours'
      ) then
        perform public.enqueue_notification(
          v_user, 'near_me', new.name || ' near you',
          v_farm.name || ' in ' || v_farm.city || ', ' || v_farm.state || ' has ' || new.name || ' this week.',
          v_route, '{push,sms}'
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Farm photos: uploads must sit in the farm's own folder; links are https only, with a real credit.
-- ---------------------------------------------------------------------------
create or replace function public.guard_photo_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.path := btrim(new.path);
  if new.path ~* '^[a-z][a-z0-9+.-]*:' or new.path ~ '^//' then
    if new.path !~ '^https://' then
      raise exception 'Photo links must use https';
    end if;
    if not exists (select 1 from public.farms f where f.id = new.farm_id and f.is_sample) then
      raise exception 'Only sample farms can use linked photos; upload the photo instead';
    end if;
    if new.credit is null or btrim(new.credit) = '' then
      raise exception 'Linked photos need a credit';
    end if;
  elsif new.path not like new.farm_id::text || '/%' or new.path ~ '\.\.' then
    raise exception 'Upload the photo to your farm''s own folder';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Surveys: answers can be withdrawn only while the survey is open; answers are size-limited;
--    a draft can't be opened with a closing date already in the past.
-- ---------------------------------------------------------------------------
drop policy "withdraw answers" on public.survey_responses;
create policy "withdraw answers" on public.survey_responses for delete to authenticated
  using (user_id = auth.uid() and public.survey_is_open(survey_id));

alter table public.survey_responses add constraint survey_answers_size check (length(answers::text) <= 20000);

create or replace function public.guard_survey_open()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open')
     and new.closes_at is not null and new.closes_at <= now() then
    raise exception 'Pick a closing date in the future before opening this survey';
  end if;
  return new;
end;
$$;

create trigger surveys_guard_open
  before insert or update on public.surveys
  for each row execute function public.guard_survey_open();

-- ---------------------------------------------------------------------------
-- 9. Reports are filed unresolved.
-- ---------------------------------------------------------------------------
create or replace function public.guard_report()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.resolved_at := null;
    new.resolved_by := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger reports_guard
  before insert on public.reports
  for each row execute function public.guard_report();

-- ---------------------------------------------------------------------------
-- 10. Delivery outbox: claim rows before sending so overlapping runs never double-send,
--     and back off between retries.
-- ---------------------------------------------------------------------------
alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_status_check check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  add column claimed_at timestamptz,
  add column next_attempt_at timestamptz not null default now();
drop index if exists public.deliveries_pending_idx;
create index deliveries_pending_idx on public.notification_deliveries (next_attempt_at) where status = 'pending';

create or replace function public.claim_deliveries(p_limit int default 300)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A run that crashed mid-batch leaves rows in 'sending'; put them back after 10 minutes.
  update public.notification_deliveries set status = 'pending', claimed_at = null
  where status = 'sending' and claimed_at < now() - interval '10 minutes';

  return query
  update public.notification_deliveries d set status = 'sending', claimed_at = now()
  where d.id in (
    select x.id from public.notification_deliveries x
    where x.status = 'pending' and x.next_attempt_at <= now()
    order by x.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 500))
  )
  returning d.*;
end;
$$;
revoke execute on function public.claim_deliveries(int) from public, anon, authenticated;

-- Verification codes waiting to be texted (service role only).
create or replace function public.claim_phone_codes()
returns table (user_id uuid, phone text, code text)
language sql
security definer
set search_path = public
as $$
  with c as (
    select v.user_id, v.phone, v.code from public.phone_verifications v
    where v.send_status = 'pending' and v.code is not null and v.expires_at > now()
    for update skip locked
  ), u as (
    update public.phone_verifications v set send_status = 'sent', code = null
    from c where v.user_id = c.user_id
  )
  select c.user_id, c.phone, c.code from c;
$$;
revoke execute on function public.claim_phone_codes() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Smaller hardening.
-- ---------------------------------------------------------------------------
alter function public.miles(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.pref_allows(public.contact_prefs, text) set search_path = public;
alter function public.touch_survey_response() set search_path = public;
revoke execute on function public.in_audience(uuid, text) from public, anon;
grant execute on function public.in_audience(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Translation quota: each member may translate up to 20,000 characters a day, so the
--     translate function can't be used as a free, unlimited translation service.
-- ---------------------------------------------------------------------------
create table public.translation_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  chars int not null default 0,
  primary key (user_id, day)
);
alter table public.translation_usage enable row level security;
-- No policies: only use_translation_quota() writes it.

create or replace function public.use_translation_quota(p_chars int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  if auth.uid() is null or p_chars is null or p_chars < 0 then
    return false;
  end if;
  insert into public.translation_usage (user_id, day, chars) values (auth.uid(), current_date, 0)
  on conflict do nothing;
  update public.translation_usage set chars = chars + p_chars
  where user_id = auth.uid() and day = current_date and chars + p_chars <= 20000
  returning chars into v_used;
  return v_used is not null;
end;
$$;
revoke execute on function public.use_translation_quota(int) from public, anon;
grant execute on function public.use_translation_quota(int) to authenticated;
