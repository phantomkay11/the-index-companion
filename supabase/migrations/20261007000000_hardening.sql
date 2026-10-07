-- Hardening after the October 2026 security review.

-- ---------------------------------------------------------------------------
-- 1. Phone numbers must be proven before texts flow. Anyone could type someone else's number,
--    which let them read that person's texted replies and storm check-in answers.
-- ---------------------------------------------------------------------------
alter table public.contact_prefs add column phone_verified_at timestamptz;

-- Compare whole numbers, not just the last 10 digits (a +91 number shouldn't match a +1 one).
-- A bare 10-digit number typed without a "+" is taken as North American (+1). Typed with a "+",
-- the digits are taken as written, so +501 600 1234 (Belize) never equals +1 501 600 1234.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select case when length(d) = 10 and left(btrim(coalesce(p, '')), 1) <> '+' then '1' || d else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- Members can change their number and switches, but never the verified stamp or the clock.
create or replace function public.guard_contact_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.phone := nullif(btrim(new.phone), ''); -- a cleared field means "no number"
  -- The service role, and confirm_phone_code (which flags the transaction), may set anything.
  if auth.uid() is null or current_setting('app.phone_confirmed', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.phone_verified_at := null;
  elsif public.phone_key(new.phone) is distinct from public.phone_key(old.phone) then
    new.phone_verified_at := null; -- a new number has to be proven again
    delete from public.phone_codes where user_id = new.user_id; -- and any code sent to the old one is void
  else
    new.phone_verified_at := old.phone_verified_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger contact_prefs_guard
  before insert or update on public.contact_prefs
  for each row execute function public.guard_contact_prefs();

-- A number is phone characters only and, once normalised, a plausible international number
-- (8 to 15 digits, no leading 0). Anything else could never be texted, so it is cleared.
update public.contact_prefs set phone = null, sms_opt_in = false, phone_verified_at = null
where phone is not null and not (phone ~ '^\+?[0-9 ().-]{7,25}$' and public.phone_key(phone) ~ '^[1-9][0-9]{7,14}$');
alter table public.contact_prefs add constraint contact_prefs_phone_format
  check (phone is null or (phone ~ '^\+?[0-9 ().-]{7,25}$' and public.phone_key(phone) ~ '^[1-9][0-9]{7,14}$'));

-- One verified owner per number.
create unique index contact_prefs_verified_phone_idx on public.contact_prefs (public.phone_key(phone))
  where phone_verified_at is not null;

-- Codes are kept apart from anything members can read.
create table public.phone_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null
);
alter table public.phone_codes enable row level security; -- no policies: functions only

-- A delivery can carry its own text and destination (for codes), never stored where members can read it.
-- The code goes to the number it was issued for, whatever the account says by the time it's sent.
alter table public.notification_deliveries add column body_override text, add column to_phone text;

-- Every code sent, by number and by account. Limits are counted here, not on the account's code row,
-- so changing numbers (which voids the code row) doesn't reset them. No foreign key on user_id, so
-- deleting an account doesn't wipe its history either.
create table public.phone_code_log (
  phone_key text not null,
  user_id uuid,
  sent_at timestamptz not null default now()
);
create index phone_code_log_idx on public.phone_code_log (phone_key, sent_at);
create index phone_code_log_user_idx on public.phone_code_log (user_id, sent_at);
alter table public.phone_code_log enable row level security; -- no policies: functions only

-- Text a 6-digit code to the member's number. US numbers only for now (+1 and 10 digits).
--
-- Limits (codes cost money, and could be used to pester someone's phone):
--   * per account: 5 an hour and 10 a day, across every number it tries;
--   * per account and number: 3 an hour;
--   * per number: 10 a day across all accounts, where any one account counts for at most 3 of them.
--     So one requester can't use up a number's allowance and lock its real owner out; it would take
--     four separate accounts, and the owner can still contact BFI.
create or replace function public.request_phone_code()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_key text;
  -- gen_random_uuid() draws from a strong random source.
  v_code text := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_note uuid;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select phone into v_phone from public.contact_prefs where user_id = v_uid;
  v_key := public.phone_key(v_phone);
  if v_phone is null or length(v_key) < 10 then raise exception 'Add your mobile number first'; end if;
  if v_key !~ '^1[0-9]{10}$' then
    raise exception 'Text alerts are only available for US numbers right now.';
  end if;
  if exists (
    select 1 from public.contact_prefs
    where user_id <> v_uid and phone_verified_at is not null and public.phone_key(phone) = v_key
  ) then
    raise exception 'That number is already confirmed on another account. Contact BFI if it is yours.';
  end if;

  if (select count(*) from public.phone_code_log where user_id = v_uid and sent_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many codes. Try again in an hour.';
  end if;
  if (select count(*) from public.phone_code_log where user_id = v_uid and sent_at > now() - interval '24 hours') >= 10 then
    raise exception 'Too many codes today. Try again tomorrow.';
  end if;
  if (select count(*) from public.phone_code_log
      where phone_key = v_key and user_id = v_uid and sent_at > now() - interval '1 hour') >= 3 then
    raise exception 'Too many codes have gone to that number. Try again in an hour.';
  end if;
  if (select coalesce(sum(least(n, 3)), 0) from (
        select count(*) as n from public.phone_code_log
        where phone_key = v_key and sent_at > now() - interval '24 hours'
        group by user_id
      ) per_account) >= 10 then
    raise exception 'Too many codes have gone to that number today. Try again tomorrow, or contact BFI if it is your number.';
  end if;
  insert into public.phone_code_log (phone_key, user_id) values (v_key, v_uid);

  insert into public.phone_codes (user_id, phone, code_hash, expires_at)
  values (v_uid, v_phone, md5(v_code || v_uid::text), now() + interval '15 minutes')
  on conflict (user_id) do update set
    phone = excluded.phone,
    code_hash = excluded.code_hash,
    attempts = 0,
    expires_at = excluded.expires_at;

  -- The inbox entry never contains the code; only the text message does.
  insert into public.notifications (user_id, kind, title, body, data)
  values (v_uid, 'verify', 'Confirm your number', 'We texted a code to your phone.', '{"route": "/settings"}')
  returning id into v_note;
  insert into public.notification_deliveries (notification_id, channel, body_override, to_phone)
  values (v_note, 'sms', 'Your code for The Index is ' || v_code || '. It expires in 15 minutes. If you didn''t ask for it, ignore this text.', v_phone);
end;
$$;

create or replace function public.confirm_phone_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.phone_codes;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select * into v_row from public.phone_codes where user_id = v_uid;
  if v_row.user_id is null or v_row.expires_at < now() then raise exception 'That code has expired. Ask for a new one.'; end if;
  if v_row.attempts >= 5 then raise exception 'Too many tries. Ask for a new code.'; end if;
  if v_row.code_hash <> md5(coalesce(trim(p_code), '') || v_uid::text) then
    update public.phone_codes set attempts = attempts + 1 where user_id = v_uid;
    return false;
  end if;
  -- The number must not have changed since the code was sent.
  perform set_config('app.phone_confirmed', 'on', true);
  update public.contact_prefs set phone_verified_at = now()
  where user_id = v_uid and public.phone_key(phone) = public.phone_key(v_row.phone);
  if not found then raise exception 'Your number changed. Ask for a new code.'; end if;
  perform set_config('app.phone_confirmed', 'off', true);
  delete from public.phone_codes where user_id = v_uid;
  return true;
end;
$$;

-- Reply codes. Every text about a conversation says "reply starting with #K7P", where the code
-- belongs to that recipient and that conversation, so a farmer's texted reply lands in the thread
-- they meant, never in whichever thread happened to text them last. Codes are 3 characters from an
-- alphabet without look-alikes (no 0/O, 1/I/L, 2/Z, 5/S, 8/B), unique per member.
create table public.sms_reply_codes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{3}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, conversation_id),
  unique (user_id, code)
);
alter table public.sms_reply_codes enable row level security; -- no policies: functions only

alter table public.notification_deliveries add column reply_code text;

create or replace function public.sms_reply_code(p_user uuid, p_conv uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';
  v_code text;
begin
  select code into v_code from public.sms_reply_codes where user_id = p_user and conversation_id = p_conv;
  if v_code is not null then return v_code; end if;
  for attempt in 1..50 loop
    v_code := '';
    for i in 1..3 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.sms_reply_codes (user_id, conversation_id, code) values (p_user, p_conv, v_code);
      return v_code;
    exception when unique_violation then
      -- The code is taken for this member, or another run just made this conversation's code.
      select code into v_code from public.sms_reply_codes where user_id = p_user and conversation_id = p_conv;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  raise exception 'Could not make a reply code';
end;
$$;
revoke execute on function public.sms_reply_code(uuid, uuid) from public, anon, authenticated;

-- Texts only go to proven numbers. A text about a conversation carries that conversation's reply code,
-- and at most one text per member per conversation goes out every 15 minutes (push and the inbox still
-- get every message), so a chatty or hostile sender can't run up texts to someone's phone.
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
  v_route text := coalesce(p_data, '{}') ->> 'route';
  v_conv uuid;
begin
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_data, '{}'))
  returning id into v_id;

  select * into v_prefs from public.contact_prefs where user_id = p_user;
  if v_prefs.user_id is null or not public.pref_allows(v_prefs, p_kind) then
    return v_id;
  end if;

  if v_route ~ '^/thread/[0-9a-f-]{36}$' and p_kind in ('message', 'inquiry', 'board') then
    v_conv := substring(v_route from 9)::uuid;
  end if;

  if 'push' = any (v_channels) and v_prefs.push_token is not null then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'push');
  end if;
  if 'sms' = any (v_channels) and v_prefs.sms_opt_in and v_prefs.phone is not null and v_prefs.phone_verified_at is not null
     and not (v_conv is not null and exists (
       select 1 from public.notifications n
       join public.notification_deliveries d on d.notification_id = n.id and d.channel = 'sms'
       where n.user_id = p_user and n.id <> v_id and n.data ->> 'route' = v_route
         and d.created_at > now() - interval '15 minutes' and d.status not in ('skipped', 'failed')
     )) then
    insert into public.notification_deliveries (notification_id, channel, reply_code)
    values (v_id, 'sms', case when v_conv is not null then public.sms_reply_code(p_user, v_conv) end);
  end if;
  if 'email' = any (v_channels) and v_prefs.email_opt_in then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
  end if;
  return v_id;
end;
$$;
revoke execute on function public.enqueue_notification(uuid, text, text, text, jsonb, text[]) from public, anon, authenticated;

-- STOP from a phone turns texts off for that number (Twilio also blocks sends on its side).
create or replace function public.sms_opt_out(p_from text, p_opt_in boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  update public.contact_prefs set sms_opt_in = p_opt_in
  where phone_verified_at is not null and public.phone_key(phone) = public.phone_key(p_from)
    and length(public.phone_key(p_from)) >= 10;
$$;
revoke execute on function public.sms_opt_out(text, boolean) from public, anon, authenticated;

-- "YES" on its own turns texts back on, but only for a number that is currently opted out
-- (Twilio treats YES as an opt-in word too). For anyone opted in, YES stays an answer to an inquiry.
-- Returns whether it opted the number back in.
create or replace function public.sms_resubscribe(p_from text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(public.phone_key(p_from)) < 10 then return false; end if;
  update public.contact_prefs set sms_opt_in = true
  where not sms_opt_in and phone_verified_at is not null and public.phone_key(phone) = public.phone_key(p_from);
  return found;
end;
$$;
revoke execute on function public.sms_resubscribe(text) from public, anon, authenticated;

-- Who a conversation is with, and what it's about, for confirmation texts: "Marcus (Okra)".
create or replace function public.sms_thread_label(p_conv uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(coalesce(
           (select string_agg(p.display_name, ', ' order by p.display_name) from public.conversation_members m
            join public.profiles p on p.id = m.user_id where m.conversation_id = c.id and m.user_id <> p_user),
           c.title, 'your conversation'), 40)
      || coalesce(' (' || left(coalesce(
           (select m.inquiry ->> 'product' from public.messages m
            where m.conversation_id = c.id and m.kind = 'inquiry' order by m.created_at desc limit 1),
           case when c.post_id is not null then c.title end), 40) || ')', '')
  from public.conversations c where c.id = p_conv;
$$;
revoke execute on function public.sms_thread_label(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Incoming texts: only proven numbers, never a guess between two accounts or two threads, and
--    "OK" counts as a check-in answer only when it's the whole text.
--
--    Which thread a reply goes to:
--      "#K7P ..."  the thread with that reply code (the code is stripped from the message);
--      otherwise   the one thread we texted this number about in the last 7 days, if there is exactly one;
--      if several  nothing is posted; the reply lists the codes to start with.
-- ---------------------------------------------------------------------------
create or replace function public.sms_inbound(p_from text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_matches int;
  v_body text := btrim(coalesce(p_body, ''));
  v_code text;
  v_first text;
  v_rest text;
  v_checkin uuid;
  v_conv uuid;
  v_convs uuid[];
  v_list text;
  v_inquiry uuid;
  v_status public.inquiry_status;
begin
  if length(public.phone_key(p_from)) < 10 or v_body = '' then
    return jsonb_build_object('handled', false);
  end if;
  select count(*), min(cp.user_id::text)::uuid into v_matches, v_user from public.contact_prefs cp
  where cp.sms_opt_in and cp.phone_verified_at is not null and public.phone_key(cp.phone) = public.phone_key(p_from);
  if v_matches <> 1 then
    return jsonb_build_object('handled', false);
  end if;

  -- A reply code at the start: "#K7P yes", "# k7p: see you at 9".
  v_code := upper(substring(v_body from '^#\s*([A-Za-z0-9]{3})(?:[^A-Za-z0-9]|$)'));
  if v_code is not null then
    v_body := btrim(regexp_replace(v_body, '^#\s*[A-Za-z0-9]{3}[\s:.,;-]*', ''));
    select r.conversation_id into v_conv from public.sms_reply_codes r
    where r.user_id = v_user and r.code = v_code
      and exists (select 1 from public.conversation_members m where m.conversation_id = r.conversation_id and m.user_id = v_user);
    if v_conv is null then
      return jsonb_build_object('handled', true, 'reply',
        'We could not find a conversation with code #' || v_code || '. Start your reply with the code from the text you are answering. Nothing was sent.');
    end if;
    if v_body = '' then
      return jsonb_build_object('handled', true, 'reply', 'Add your message after #' || v_code || '. Nothing was sent.');
    end if;
  end if;

  v_first := upper(split_part(v_body, ' ', 1));
  v_rest := btrim(substring(v_body from length(split_part(v_body, ' ', 1)) + 1));

  -- 1. Storm check-in answers (never when the text names a conversation).
  if v_code is null and (v_first in ('SAFE', 'NEED') or upper(v_body) in ('OK', 'OK.', 'OK!')) then
    select c.id into v_checkin from public.checkins c
    where c.closes_at > now() and public.in_audience(v_user, c.audience)
    order by c.created_at desc limit 1;
    if v_checkin is not null then
      insert into public.checkin_responses (checkin_id, user_id, status, note, via)
      values (v_checkin, v_user, case when v_first = 'NEED' then 'need_help' else 'ok' end, left(case when v_first = 'NEED' then v_rest else '' end, 1000), 'sms')
      on conflict (checkin_id, user_id) do update set status = excluded.status, note = excluded.note, via = 'sms';
      return jsonb_build_object('handled', true, 'checkin_id', v_checkin, 'reply',
        case when v_first = 'NEED'
          then 'Thank you. BFI has your message and someone will reach out. If this is an emergency, call 911.'
          else 'Glad you are OK. Thank you for letting BFI know.' end);
    end if;
  end if;

  -- 2. No code: the one conversation we texted them about lately, if there is just one.
  if v_conv is null then
    select array_agg(conv order by last_sent desc) into v_convs from (
      select substring(n.data ->> 'route' from 9)::uuid as conv, max(coalesce(d.sent_at, n.created_at)) as last_sent
      from public.notifications n
      join public.notification_deliveries d on d.notification_id = n.id and d.channel = 'sms' and d.status = 'sent'
      where n.user_id = v_user and n.kind in ('message', 'inquiry', 'board')
        and n.data ->> 'route' ~ '^/thread/[0-9a-f-]{36}$'
        and coalesce(d.sent_at, n.created_at) > now() - interval '7 days'
      group by 1
    ) recent
    where exists (select 1 from public.conversation_members m where m.conversation_id = recent.conv and m.user_id = v_user);

    if coalesce(cardinality(v_convs), 0) = 0 then
      return jsonb_build_object('handled', false);
    end if;
    if cardinality(v_convs) > 1 then
      select string_agg('#' || public.sms_reply_code(v_user, c) || ' ' || public.sms_thread_label(c, v_user), ', ' order by ord)
      into v_list from unnest(v_convs[1:4]) with ordinality as t(c, ord);
      return jsonb_build_object('handled', true, 'reply',
        'Which conversation is this for? Start your reply with its code: ' || v_list || '. For example: #'
        || public.sms_reply_code(v_user, v_convs[1]) || ' YES. Nothing was sent.');
    end if;
    v_conv := v_convs[1];
  end if;

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
    values (v_conv, v_user, coalesce(nullif(left(v_rest, 2000), ''), case v_status
      when 'ready' then 'Yes, I can have that ready.'
      when 'partial' then 'I can do part of that order.'
      else 'Sorry, that is not available right now.' end), 'sms');
  else
    insert into public.messages (conversation_id, sender_id, body, via) values (v_conv, v_user, left(v_body, 2000), 'sms');
  end if;

  return jsonb_build_object('handled', true, 'conversation_id', v_conv, 'reply',
    case when v_inquiry is not null then 'Answer sent' else 'Sent' end
    || ' to ' || public.sms_thread_label(v_conv, v_user) || '. Text FIND and a product to search instead.');
end;
$$;
revoke execute on function public.sms_inbound(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Messages: members can't backdate, pin, unhide, fake "by text" or plant transcripts,
--    and voice-note paths must be a plain file inside the conversation's own folder.
-- ---------------------------------------------------------------------------
create or replace function public.guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  -- At most 60 messages an hour from one member (inquiries included), so nobody can flood a farmer.
  if (select count(*) from public.messages m where m.sender_id = auth.uid() and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'You are sending a lot of messages. Please wait a few minutes and try again.';
  end if;
  new.created_at := now();
  new.pinned := false;
  new.hidden := false;
  new.via := 'app';
  new.transcript := null;
  if new.kind <> 'inquiry' then
    new.inquiry := null;
    new.inquiry_status := null; -- only a real inquiry can carry "Farmer says: ready"
  end if;
  return new;
end;
$$;

create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();
create index messages_sender_idx on public.messages (sender_id, created_at);

-- The guard runs only for members; answer_inquiry and send_inquiry (security definer) still pass auth.uid(),
-- and nothing they insert depends on the columns reset above.

drop policy "post messages" on public.messages;
create policy "post messages" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'voice')
    and public.can_post(conversation_id)
    and (kind <> 'voice' or (audio_path is not null and audio_path ~ ('^' || conversation_id::text || '/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}$')))
  );

-- ---------------------------------------------------------------------------
-- 4. Events and posts: edits after approval go back to review; staff-hidden posts stay hidden.
-- ---------------------------------------------------------------------------
create or replace function public.guard_event_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.submitted_by := auth.uid();
    new.is_sample := false;
  else
    new.submitted_by := old.submitted_by;
    new.is_sample := old.is_sample;
    -- Changing what people see on an approved event sends it back to BFI.
    if old.status = 'approved' and (
      new.title, new.description, new.type, new.starts_at, new.ends_at, new.place, new.region_id, new.ticket_url, new.ticket_label, new.host_name, new.host_farm_id
    ) is distinct from (
      old.title, old.description, old.type, old.starts_at, old.ends_at, old.place, old.region_id, old.ticket_url, old.ticket_label, old.host_name, old.host_farm_id
    ) then
      new.status := 'pending';
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

alter table public.events add constraint events_ticket_url_https check (ticket_url is null or ticket_url ~ '^https://');
alter table public.farms add constraint farms_website_https check (website is null or website ~ '^https://');

-- Members can't choose when their post was made or how long it stays up.
create or replace function public.guard_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.expires_at := least(coalesce(new.expires_at, new.created_at + interval '45 days'), new.created_at + interval '45 days');
  return new;
end;
$$;

create trigger posts_guard
  before insert or update on public.posts
  for each row execute function public.guard_post();

drop policy "authors delete posts" on public.posts;
create policy "authors delete posts" on public.posts for delete to authenticated
  using ((author_id = auth.uid() and status <> 'hidden') or public.is_staff());

drop policy "authors and staff edit posts" on public.posts;
create policy "authors and staff edit posts" on public.posts for update to authenticated
  using ((author_id = auth.uid() and status <> 'hidden') or public.is_staff())
  with check ((author_id = auth.uid() and status in ('open', 'closed')) or public.is_staff());

-- ---------------------------------------------------------------------------
-- 5. Near-me alerts: match words literally (a product named "%" used to match every alert).
-- ---------------------------------------------------------------------------
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
  v_name text := lower(trim(new.name));
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

  if v_farm.lat is not null and v_farm.lon is not null and length(regexp_replace(v_name, '[^[:alnum:]]', '', 'g')) >= 2 then
    for v_user in
      select distinct a.user_id from public.saved_alerts a
      where (strpos(v_name, lower(trim(a.keyword))) > 0 or strpos(lower(trim(a.keyword)), v_name) > 0)
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
-- 6. Smaller leaks and privileges.
-- ---------------------------------------------------------------------------
-- Volunteer sign-ups: your own, or staff. Open-spot counts come from the view, which counts everyone.
drop policy "signups readable" on public.shift_signups;
create policy "own signups readable" on public.shift_signups for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
drop view public.shift_availability;
create view public.shift_availability as
  select s.id, s.event_id, s.label, s.capacity,
         s.capacity - (select count(*) from public.shift_signups x where x.shift_id = s.id)::int as open_spots
  from public.volunteer_shifts s;
grant select on public.shift_availability to anon, authenticated;

-- Profile views count signed-in visitors only, so the impact report can't be padded anonymously.
revoke execute on function public.log_farm_view(uuid) from public, anon;
grant execute on function public.log_farm_view(uuid) to authenticated;

-- Only admins hand out staff roles; coordinators can still promote growers.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    if not public.is_staff() then
      raise exception 'Only BFI staff can change member roles';
    end if;
    if (new.role in ('coordinator', 'admin') or old.role in ('coordinator', 'admin'))
       and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
      raise exception 'Only admins can change staff roles';
    end if;
  end if;
  return new;
end;
$$;

-- Audience checks about other people stay internal; policies ask only about the current member.
create or replace function public.in_my_audience(p_audience text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.in_audience(auth.uid(), p_audience);
$$;

drop policy "members read surveys for them" on public.surveys;
create policy "members read surveys for them" on public.surveys for select to authenticated
  using ((status <> 'draft' and public.in_my_audience(audience)) or public.is_staff());
drop policy "members read check-ins for them" on public.checkins;
create policy "members read check-ins for them" on public.checkins for select to authenticated
  using (public.in_my_audience(audience) or public.is_staff());
revoke execute on function public.in_audience(uuid, text) from public, anon, authenticated;

-- Staff who list their own farm own it. Owners can't backdate their listing.
create or replace function public.guard_farm_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;
  if public.is_staff() then
    if tg_op = 'INSERT' and new.owner_id is null then
      new.owner_id := auth.uid();
    end if;
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
    new.is_sample := false;
    new.owner_id := auth.uid();
    new.listed_since := current_date; -- "On the Index since" is when they joined, not a date they pick
    new.created_at := now();
  else
    new.status := old.status;
    new.listed_since := old.listed_since;
    new.created_at := old.created_at;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.is_sample := old.is_sample;
    new.owner_id := old.owner_id;
    -- A new name or new links on a verified farm go back to BFI before they show
    -- (everyday edits like what's fresh, the story or harvest mode don't).
    if old.status = 'approved' and (new.name, new.website, new.order_url) is distinct from (old.name, old.website, old.order_url) then
      new.status := 'pending';
      new.verified_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Deliveries are claimed before sending, so two runs can't send the same text twice.
-- ---------------------------------------------------------------------------
alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
alter table public.notification_deliveries add column claimed_at timestamptz;

create or replace function public.claim_deliveries(p_limit int default 300)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A run that died mid-send leaves rows "sending". After 10 minutes they count as a failed try,
  -- and after three tries they stop, so one bad message can't loop forever.
  update public.notification_deliveries
  set attempts = attempts + 1,
      status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
      last_error = coalesce(last_error, 'interrupted while sending')
  where status = 'sending' and claimed_at < now() - interval '10 minutes';
  return query
  update public.notification_deliveries d set status = 'sending', claimed_at = now()
  where d.id in (
    select id from public.notification_deliveries
    where status = 'pending'
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning d.*;
end;
$$;
revoke execute on function public.claim_deliveries(int) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 8. Round-3 review: moderation, uploads and view counts.
-- ---------------------------------------------------------------------------
-- Staff moderate by hiding or pinning. Nothing else about a message can change: not its thread
-- (which would move a private message into a public channel), sender, text, audio or time.
-- An inquiry's status is the farm's answer, so only the farm (through answer_inquiry) sets it.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm uuid;
begin
  if auth.uid() is null then return new; end if;
  if (to_jsonb(new) - 'hidden' - 'pinned' - 'inquiry_status') is distinct from (to_jsonb(old) - 'hidden' - 'pinned' - 'inquiry_status') then
    raise exception 'Messages cannot be edited';
  end if;
  if new.inquiry_status is distinct from old.inquiry_status then
    select c.farm_id into v_farm from public.conversations c where c.id = old.conversation_id;
    if old.kind <> 'inquiry' or v_farm is null or not public.owns_farm(v_farm) then
      raise exception 'Only the farm can answer this inquiry';
    end if;
  end if;
  return new;
end;
$$;

-- Uploads: photos and voice notes only, and not huge. Storage refuses anything else at upload time,
-- so nothing like an HTML page can be served from the public photo bucket.
update storage.buckets
set file_size_limit = 8 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'farm-photos';
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm']
where id = 'voice-notes';

-- Profile views count each member at most once per farm per day. Who viewed what is kept only for
-- the current day, just long enough to count them once.
create table public.farm_view_seen (
  farm_id uuid not null references public.farms (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  primary key (farm_id, viewer_id, day)
);
create index farm_view_seen_day_idx on public.farm_view_seen (day);
alter table public.farm_view_seen enable row level security; -- no policies: functions only

create or replace function public.log_farm_view(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.farms where id = p_farm_id and status = 'approved')
     or exists (select 1 from public.farms where id = p_farm_id and owner_id = auth.uid()) then
    return;
  end if;
  delete from public.farm_view_seen where day < current_date;
  insert into public.farm_view_seen (farm_id, viewer_id) values (p_farm_id, auth.uid()) on conflict do nothing;
  if found then
    insert into public.farm_view_days (farm_id, day, views) values (p_farm_id, current_date, 1)
    on conflict (farm_id, day) do update set views = public.farm_view_days.views + 1;
  end if;
end;
$$;
