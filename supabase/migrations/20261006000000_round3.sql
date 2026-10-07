-- Round 3: photo credits, two-way texting, online ordering links, BFI surveys and storm check-ins.

-- ---------------------------------------------------------------------------
-- Photo credits. Sample farms may point at a full https URL (for example a stock photo
-- committed to the repo); real farms always use the farm-photos bucket.
-- ---------------------------------------------------------------------------
alter table public.farm_photos
  add column credit text,
  add column credit_url text check (credit_url is null or credit_url ~ '^https://');

create or replace function public.guard_photo_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.path ~ '^https?://' then
    if new.path !~ '^https://' then
      raise exception 'Photo links must use https';
    end if;
    if not exists (select 1 from public.farms f where f.id = new.farm_id and f.is_sample) then
      raise exception 'Only sample farms can use linked photos; upload the photo instead';
    end if;
    if new.credit is null then
      raise exception 'Linked photos need a credit';
    end if;
  end if;
  return new;
end;
$$;

create trigger farm_photos_guard_path
  before insert or update on public.farm_photos
  for each row execute function public.guard_photo_path();

-- ---------------------------------------------------------------------------
-- Online ordering: a farm's own store, CSA sign-up or market page.
-- ---------------------------------------------------------------------------
alter table public.farms
  add column order_url text check (order_url is null or order_url ~ '^https://'),
  add column order_label text check (order_label is null or length(order_label) <= 40);

-- ---------------------------------------------------------------------------
-- Who a broadcast, survey or check-in reaches.
-- Audience: 'everyone', 'growers', 'neighbors', or 'region:<id>'.
-- ---------------------------------------------------------------------------
create or replace function public.in_audience(p_user uuid, p_audience text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and case
      when p_audience = 'everyone' then true
      when p_audience = 'growers' then p.role = 'grower'
      when p_audience = 'neighbors' then p.role = 'neighbor'
      when p_audience like 'region:%' then p.region_id = substring(p_audience from 8)
        or exists (select 1 from public.farms f where f.owner_id = p.id and f.region_id = substring(p_audience from 8))
      else false
    end
  );
$$;

-- Surveys and check-ins: surveys follow the broadcast setting; check-ins are safety messages and always go out.
create or replace function public.pref_allows(p public.contact_prefs, p_kind text)
returns boolean
language sql
immutable
as $$
  select case
    when p_kind in ('message', 'inquiry', 'board') then p.notify_messages
    when p_kind in ('fresh', 'near_me') then p.notify_follows
    when p_kind = 'event_reminder' then p.notify_events
    when p_kind = 'deadline' then p.notify_deadlines
    when p_kind in ('broadcast', 'survey') then p.notify_broadcasts
    else true
  end;
$$;

-- ---------------------------------------------------------------------------
-- BFI surveys, with consent. Questions are a JSON array:
--   [{ "id": "q1", "type": "single" | "multi" | "text" | "scale", "prompt": "...", "options": ["..."], "required": true }]
-- Answers are an object keyed by question id.
-- ---------------------------------------------------------------------------
create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 120),
  intro text not null default '',
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array'),
  audience text not null default 'everyone'
    check (audience in ('everyone', 'growers', 'neighbors') or audience ~ '^region:[a-z0-9]+$'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.survey_responses (
  survey_id uuid not null references public.surveys (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  -- Yes means BFI may quote this member's written answers, without their name, in reports.
  consent_share boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (survey_id, user_id)
);

create or replace function public.survey_is_open(p_survey uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.surveys s
    where s.id = p_survey and s.status = 'open' and (s.closes_at is null or s.closes_at > now())
      and public.in_audience(auth.uid(), s.audience)
  );
$$;

create or replace function public.notify_survey_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if new.status <> 'open' or (tg_op = 'UPDATE' and old.status = 'open') then
    return new;
  end if;
  for v_user in select p.id from public.profiles p where public.in_audience(p.id, new.audience) loop
    perform public.enqueue_notification(
      v_user, 'survey', 'Survey from BFI: ' || new.title,
      coalesce(nullif(left(new.intro, 140), ''), 'A few quick questions. Your answers help BFI speak up for Black growers.'),
      jsonb_build_object('route', '/survey/' || new.id),
      '{push,email}'
    );
  end loop;
  return new;
end;
$$;

create trigger surveys_notify
  after insert or update of status on public.surveys
  for each row execute function public.notify_survey_open();

create or replace function public.touch_survey_response()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger survey_responses_touch
  before update on public.survey_responses
  for each row execute function public.touch_survey_response();

-- ---------------------------------------------------------------------------
-- Storm and disaster check-ins: "Are you OK?" to a region, answered in the app or by text.
-- ---------------------------------------------------------------------------
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 120),
  message text not null default '',
  audience text not null default 'everyone'
    check (audience in ('everyone', 'growers', 'neighbors') or audience ~ '^region:[a-z0-9]+$'),
  closes_at timestamptz not null default now() + interval '7 days',
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.checkin_responses (
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  status text not null check (status in ('ok', 'need_help')),
  note text not null default '' check (length(note) <= 1000),
  via text not null default 'app' check (via in ('app', 'sms')),
  updated_at timestamptz not null default now(),
  primary key (checkin_id, user_id)
);

create or replace function public.checkin_is_open(p_checkin uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.checkins c
    where c.id = p_checkin and c.closes_at > now() and public.in_audience(auth.uid(), c.audience)
  );
$$;

create or replace function public.notify_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in select p.id from public.profiles p where public.in_audience(p.id, new.audience) loop
    perform public.enqueue_notification(
      v_user, 'checkin', new.title,
      trim(new.message || ' Reply SAFE if you are OK, or NEED and what you need.'),
      jsonb_build_object('route', '/checkin/' || new.id),
      '{push,sms}'
    );
  end loop;
  return new;
end;
$$;

create trigger checkins_notify
  after insert on public.checkins
  for each row execute function public.notify_checkin();

create trigger checkin_responses_touch
  before update on public.checkin_responses
  for each row execute function public.touch_survey_response();

-- Staff view: counts, plus who needs help and how to reach them.
create or replace function public.checkin_report(p_checkin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.checkins;
begin
  if not public.is_staff() then
    raise exception 'Only BFI staff can see check-in results';
  end if;
  select * into v_c from public.checkins where id = p_checkin;
  if v_c.id is null then
    raise exception 'Check-in not found';
  end if;
  return jsonb_build_object(
    'reached', (select count(*) from public.profiles p where public.in_audience(p.id, v_c.audience)),
    'ok', (select count(*) from public.checkin_responses r where r.checkin_id = p_checkin and r.status = 'ok'),
    'need_help', (select count(*) from public.checkin_responses r where r.checkin_id = p_checkin and r.status = 'need_help'),
    'needs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', r.user_id, 'name', p.display_name, 'note', r.note, 'via', r.via, 'updated_at', r.updated_at,
        'phone', cp.phone, 'region_id', p.region_id
      ) order by r.updated_at)
      from public.checkin_responses r
      join public.profiles p on p.id = r.user_id
      left join public.contact_prefs cp on cp.user_id = r.user_id
      where r.checkin_id = p_checkin and r.status = 'need_help'
    ), '[]')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Two-way texting. The sms-line function calls this (service role) for every text that
-- isn't a search command. It finds the member by phone and:
--   1. SAFE / NEED ...  answers their open storm check-in
--   2. otherwise, if we texted them about a conversation in the last 3 days, posts their text there;
--      a farmer's YES / PART / NO answers the open inquiry in that thread
-- Returns { handled, reply } so the function can text back a confirmation.
-- ---------------------------------------------------------------------------
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10);
$$;

create or replace function public.sms_inbound(p_from text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_first text := upper(split_part(trim(coalesce(p_body, '')), ' ', 1));
  v_rest text := trim(substring(trim(coalesce(p_body, '')) from length(split_part(trim(coalesce(p_body, '')), ' ', 1)) + 1));
  v_checkin uuid;
  v_conv uuid;
  v_title text;
  v_inquiry uuid;
  v_status public.inquiry_status;
begin
  if length(public.phone_key(p_from)) < 10 or v_body = '' then
    return jsonb_build_object('handled', false);
  end if;
  select cp.user_id into v_user from public.contact_prefs cp
  where cp.sms_opt_in and public.phone_key(cp.phone) = public.phone_key(p_from)
  order by cp.updated_at desc limit 1;
  if v_user is null then
    return jsonb_build_object('handled', false);
  end if;

  -- 1. Storm check-in answers.
  if v_first in ('SAFE', 'OK', 'NEED') then
    select c.id into v_checkin from public.checkins c
    where c.closes_at > now() and public.in_audience(v_user, c.audience)
    order by c.created_at desc limit 1;
    if v_checkin is not null then
      insert into public.checkin_responses (checkin_id, user_id, status, note, via)
      values (v_checkin, v_user, case when v_first = 'NEED' then 'need_help' else 'ok' end, left(v_rest, 1000), 'sms')
      on conflict (checkin_id, user_id) do update set status = excluded.status, note = excluded.note, via = 'sms';
      return jsonb_build_object('handled', true, 'checkin_id', v_checkin, 'reply',
        case when v_first = 'NEED'
          then 'Thank you. BFI has your message and someone will reach out. If this is an emergency, call 911.'
          else 'Glad you are OK. Thank you for letting BFI know.' end);
    end if;
  end if;

  -- 2. Replies to a conversation we texted them about recently.
  select substring(n.data ->> 'route' from 9)::uuid into v_conv
  from public.notifications n
  join public.notification_deliveries d on d.notification_id = n.id and d.channel = 'sms' and d.status = 'sent'
  where n.user_id = v_user and n.kind in ('message', 'inquiry', 'board')
    and n.created_at > now() - interval '3 days'
    and n.data ->> 'route' ~ '^/thread/[0-9a-f-]{36}$'
  order by n.created_at desc limit 1;

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
    values (v_conv, v_user, coalesce(nullif(v_rest, ''), case v_status
      when 'ready' then 'Yes, I can have that ready.'
      when 'partial' then 'I can do part of that order.'
      else 'Sorry, that is not available right now.' end), 'sms');
  else
    insert into public.messages (conversation_id, sender_id, body, via) values (v_conv, v_user, left(v_body, 2000), 'sms');
  end if;

  select coalesce(c.title, f.name, 'your conversation') into v_title
  from public.conversations c left join public.farms f on f.id = c.farm_id where c.id = v_conv;
  return jsonb_build_object('handled', true, 'conversation_id', v_conv, 'reply',
    case when v_inquiry is not null then 'Answer sent' else 'Sent' end
    || ' to ' || v_title || '. Text FIND and a product to search instead.');
end;
$$;

revoke execute on function public.sms_inbound(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
alter table public.checkins enable row level security;
alter table public.checkin_responses enable row level security;

create policy "members read surveys for them" on public.surveys for select to authenticated
  using ((status <> 'draft' and public.in_audience(auth.uid(), audience)) or public.is_staff());
create policy "staff manage surveys" on public.surveys for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "own survey answers" on public.survey_responses for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "answer open surveys" on public.survey_responses for insert to authenticated
  with check (user_id = auth.uid() and public.survey_is_open(survey_id));
create policy "change answers while open" on public.survey_responses for update to authenticated
  using (user_id = auth.uid() and public.survey_is_open(survey_id))
  with check (user_id = auth.uid() and public.survey_is_open(survey_id));
create policy "withdraw answers" on public.survey_responses for delete to authenticated
  using (user_id = auth.uid());

create policy "members read check-ins for them" on public.checkins for select to authenticated
  using (public.in_audience(auth.uid(), audience) or public.is_staff());
create policy "staff manage check-ins" on public.checkins for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "own check-in answer" on public.checkin_responses for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "answer open check-ins" on public.checkin_responses for insert to authenticated
  with check (user_id = auth.uid() and via = 'app' and public.checkin_is_open(checkin_id));
create policy "update check-in answer" on public.checkin_responses for update to authenticated
  using (user_id = auth.uid() and public.checkin_is_open(checkin_id))
  with check (user_id = auth.uid() and via = 'app' and public.checkin_is_open(checkin_id));
