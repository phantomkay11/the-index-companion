-- The Index v2: notifications, near-me alerts, voice notes, photos, community board,
-- insights and impact reporting.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Great-circle distance in miles.
create or replace function public.miles(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------------
-- Notification preferences
-- ---------------------------------------------------------------------------
alter table public.contact_prefs
  add column notify_messages boolean not null default true,
  add column notify_follows boolean not null default true,
  add column notify_events boolean not null default true,
  add column notify_deadlines boolean not null default true,
  add column notify_broadcasts boolean not null default true;

-- ---------------------------------------------------------------------------
-- Notifications: an in-app inbox plus an outbox of deliveries (push, SMS, email)
-- that the `deliver` function sends.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null, -- message, inquiry, fresh, near_me, broadcast, event_reminder, deadline, review, board
  title text not null,
  body text not null default '',
  data jsonb not null default '{}', -- { "route": "/thread/<id>" } and anything else the app needs
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('push', 'sms', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index deliveries_pending_idx on public.notification_deliveries (created_at) where status = 'pending';

-- Which preference column governs each kind of notification.
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
    when p_kind = 'broadcast' then p.notify_broadcasts
    else true
  end;
$$;

-- Create an inbox item and queue deliveries on the channels the member allows.
-- p_channels limits the channels considered (null means push only).
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
  if 'sms' = any (v_channels) and v_prefs.sms_opt_in and v_prefs.phone is not null then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'sms');
  end if;
  if 'email' = any (v_channels) and v_prefs.email_opt_in then
    insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
  end if;
  return v_id;
end;
$$;

-- Internal only: called by triggers and the service role, never by the app directly.
revoke execute on function public.enqueue_notification(uuid, text, text, text, jsonb, text[]) from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- New direct messages and inquiries notify the other members of the thread.
-- Farmers in harvest mode keep them in the inbox without a push.
-- ---------------------------------------------------------------------------
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
  v_sender text;
  v_member record;
  v_title text;
  v_body text;
  v_kind text;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  if v_conv.kind <> 'direct' then
    return new;
  end if;
  select display_name into v_sender from public.profiles where id = new.sender_id;
  v_sender := coalesce(v_sender, 'An Index member');

  if new.kind = 'inquiry' then
    v_kind := 'inquiry';
    v_title := 'New inquiry: ' || coalesce(new.inquiry ->> 'product', 'a product');
    v_body := v_sender || ' asked for ' || coalesce(new.inquiry ->> 'amount', '') || ' (' || coalesce(new.inquiry ->> 'how', '') || ')';
  elsif new.kind = 'voice' then
    v_kind := 'message';
    v_title := v_sender;
    v_body := 'Sent a voice note';
  else
    v_kind := case when v_conv.post_id is not null then 'board' else 'message' end;
    v_title := v_sender;
    v_body := left(new.body, 140);
  end if;

  for v_member in
    select m.user_id,
           exists (select 1 from public.farms f where f.id = v_conv.farm_id and f.owner_id = m.user_id and f.harvest_mode) as harvesting
    from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id is distinct from new.sender_id
  loop
    perform public.enqueue_notification(
      v_member.user_id, v_kind, v_title, v_body,
      jsonb_build_object('route', '/thread/' || new.conversation_id),
      case when v_member.harvesting then '{}'::text[] else '{push,sms}'::text[] end
    );
  end loop;
  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- ---------------------------------------------------------------------------
-- Near-me alerts: "tell me when honey is fresh within 25 miles".
-- ---------------------------------------------------------------------------
create table public.saved_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  keyword text not null check (length(trim(keyword)) between 2 and 60),
  lat double precision not null,
  lon double precision not null,
  place_label text,
  radius_miles int not null default 25 check (radius_miles between 1 and 250),
  created_at timestamptz not null default now()
);

-- When a farm marks a product fresh: tell followers and matching near-me alerts.
-- At most one alert per member per farm every 12 hours, so a busy morning of updates isn't spam.
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
      where (new.name ilike '%' || a.keyword || '%' or a.keyword ilike '%' || new.name || '%')
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

create trigger farm_products_notify
  after insert or update of in_season on public.farm_products
  for each row execute function public.notify_fresh_product();

-- ---------------------------------------------------------------------------
-- Broadcasts fan out to their audience on the channels BFI picked.
-- Audience: 'everyone', 'growers', 'neighbors', or 'region:<id>'.
-- ---------------------------------------------------------------------------
create or replace function public.fan_out_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_region text := case when new.audience like 'region:%' then substring(new.audience from 8) end;
begin
  for v_user in
    select p.id from public.profiles p
    where case
      when new.audience = 'everyone' then true
      when new.audience = 'growers' then p.role = 'grower'
      when new.audience = 'neighbors' then p.role = 'neighbor'
      when v_region is not null then p.region_id = v_region
        or exists (select 1 from public.farms f where f.owner_id = p.id and f.region_id = v_region)
      else false
    end
  loop
    perform public.enqueue_notification(
      v_user, 'broadcast', new.title, new.body,
      jsonb_build_object('route', '/messages', 'broadcast_id', new.id, 'link_url', new.link_url),
      new.channels
    );
  end loop;
  return new;
end;
$$;

create trigger broadcasts_fan_out
  after insert on public.broadcasts
  for each row execute function public.fan_out_broadcast();

alter table public.broadcasts
  add constraint broadcasts_audience_check check (audience in ('everyone', 'growers', 'neighbors') or audience ~ '^region:[a-z0-9]+$'),
  add constraint broadcasts_channels_check check (channels <@ '{push,sms,email}');

-- Tell farmers and event hosts when BFI reviews their submission.
create or replace function public.review_farm(p_farm_id uuid, p_status public.review_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm public.farms;
begin
  if not public.is_staff() then raise exception 'Only BFI staff can review listings'; end if;
  update public.farms
  set status = p_status,
      verified_at = case when p_status = 'approved' then now() else verified_at end,
      verified_by = case when p_status = 'approved' then auth.uid() else verified_by end
  where id = p_farm_id
  returning * into v_farm;
  update public.profiles set role = 'grower'
  where p_status = 'approved' and role = 'neighbor' and id = v_farm.owner_id;
  if v_farm.owner_id is not null and p_status in ('approved', 'rejected') then
    perform public.enqueue_notification(
      v_farm.owner_id, 'review',
      case when p_status = 'approved' then v_farm.name || ' is live on the Index' else 'Your listing needs changes' end,
      case when p_status = 'approved' then 'BFI verified your farm. Buyers can now find and message you.'
           else 'BFI could not approve your listing yet. Check your email for details.' end,
      jsonb_build_object('route', '/my-farm'), '{push,email}'
    );
  end if;
end;
$$;

create or replace function public.review_event(p_event_id uuid, p_status public.review_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if not public.is_staff() then raise exception 'Only BFI staff can review events'; end if;
  update public.events set status = p_status where id = p_event_id returning * into v_event;
  if v_event.submitted_by is not null and p_status in ('approved', 'rejected') then
    perform public.enqueue_notification(
      v_event.submitted_by, 'review',
      case when p_status = 'approved' then v_event.title || ' is on the calendar' else 'Your event was not approved' end,
      case when p_status = 'approved' then 'BFI approved your event. Everyone can see it now.'
           else 'BFI could not approve this event. Check your email for details.' end,
      jsonb_build_object('route', '/events'), '{push,email}'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled reminders: events the day before, saved programs 30, 7 and 1 day before.
-- The `deliver` function calls this on every run; reminders_sent prevents repeats.
-- ---------------------------------------------------------------------------
create table public.reminders_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ref_type text not null,
  ref_id uuid not null,
  offset_days int not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, ref_type, ref_id, offset_days)
);

create or replace function public.run_due_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  -- Events starting in the next 18 to 30 hours.
  for r in
    select v.user_id, e.id, e.title, e.place, e.starts_at, v.remind_push, v.remind_sms, v.remind_email
    from public.event_rsvps v join public.events e on e.id = v.event_id
    where e.status = 'approved'
      and e.starts_at between now() + interval '18 hours' and now() + interval '30 hours'
      and not exists (select 1 from public.reminders_sent s where s.user_id = v.user_id and s.ref_type = 'event' and s.ref_id = e.id and s.offset_days = 1)
  loop
    insert into public.reminders_sent (user_id, ref_type, ref_id, offset_days) values (r.user_id, 'event', r.id, 1);
    perform public.enqueue_notification(
      r.user_id, 'event_reminder', 'Tomorrow: ' || r.title, r.place,
      jsonb_build_object('route', '/events', 'event_id', r.id),
      array_remove(array[
        case when r.remind_push then 'push' end,
        case when r.remind_sms then 'sms' end,
        case when r.remind_email then 'email' end], null)
    );
    v_count := v_count + 1;
  end loop;

  -- Saved programs whose deadline is 30, 7 or 1 day away.
  for r in
    select s.user_id, x.id, x.name, x.deadline, (x.deadline - current_date) as days_left
    from public.saved_resources s join public.resources x on x.id = s.resource_id
    where x.deadline is not null and (x.deadline - current_date) in (30, 7, 1)
      and not exists (
        select 1 from public.reminders_sent t
        where t.user_id = s.user_id and t.ref_type = 'resource' and t.ref_id = x.id and t.offset_days = (x.deadline - current_date)
      )
  loop
    insert into public.reminders_sent (user_id, ref_type, ref_id, offset_days) values (r.user_id, 'resource', r.id, r.days_left);
    perform public.enqueue_notification(
      r.user_id, 'deadline',
      r.name || ': ' || r.days_left || case when r.days_left = 1 then ' day left' else ' days left' end,
      'Applications close ' || to_char(r.deadline, 'Mon DD') || '.',
      jsonb_build_object('route', '/resources', 'resource_id', r.id), '{push,email}'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.run_due_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Voice notes (Supabase Storage, private bucket "voice-notes", path <conversation_id>/<file>)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

create policy "voice notes readable by thread readers" on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and public.can_read_conversation(((storage.foldername(name))[1])::uuid));
create policy "voice notes uploaded by thread posters" on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-notes' and owner = auth.uid() and public.can_post(((storage.foldername(name))[1])::uuid));

-- A voice message must point at audio inside its own thread's folder.
drop policy "post messages" on public.messages;
create policy "post messages" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'voice')
    and public.can_post(conversation_id)
    and (kind <> 'voice' or (audio_path is not null and audio_path like conversation_id::text || '/%'))
  );

-- Transcripts are written by the transcribe function (service role) only.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  -- Staff may only moderate: hide or pin.
  if new.body is distinct from old.body or new.transcript is distinct from old.transcript
     or new.sender_id is distinct from old.sender_id or new.inquiry is distinct from old.inquiry then
    raise exception 'Messages cannot be edited';
  end if;
  return new;
end;
$$;

create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- ---------------------------------------------------------------------------
-- Farm photos (public bucket "farm-photos", path <farm_id>/<file>), with the farmer's consent.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('farm-photos', 'farm-photos', true)
on conflict (id) do nothing;

create policy "farm photos uploaded by owner" on storage.objects for insert to authenticated
  with check (bucket_id = 'farm-photos' and (public.owns_farm(((storage.foldername(name))[1])::uuid) or public.is_staff()));
create policy "farm photos removed by owner" on storage.objects for delete to authenticated
  using (bucket_id = 'farm-photos' and (public.owns_farm(((storage.foldername(name))[1])::uuid) or public.is_staff()));

create table public.farm_photos (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  path text not null,
  alt_text text not null check (length(trim(alt_text)) >= 3),
  farmer_consent boolean not null check (farmer_consent),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index farm_photos_farm_idx on public.farm_photos (farm_id, sort_order);

-- ---------------------------------------------------------------------------
-- Community board: needs, offers, equipment, rides, bulk buying and mentoring.
-- ---------------------------------------------------------------------------
create type public.post_kind as enum ('need', 'offer', 'equipment', 'ride', 'bulk', 'mentor');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  kind public.post_kind not null,
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null default '' check (length(body) <= 2000),
  region_id text references public.regions (id),
  location_text text,
  happens_on date,
  status text not null default 'open' check (status in ('open', 'closed', 'hidden')),
  expires_at timestamptz not null default now() + interval '45 days',
  created_at timestamptz not null default now()
);
create index posts_open_idx on public.posts (created_at desc) where status = 'open';

alter table public.conversations add column post_id uuid references public.posts (id) on delete set null;

-- Reply to a post privately: opens (or reopens) a direct thread with its author.
create or replace function public.start_post_conversation(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts;
  v_conv uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to reply'; end if;
  select * into v_post from public.posts where id = p_post_id and status = 'open';
  if v_post.id is null then raise exception 'This post is closed'; end if;
  if v_post.author_id = auth.uid() then raise exception 'This is your own post'; end if;

  select c.id into v_conv
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = auth.uid()
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_post.author_id
  where c.kind = 'direct' and c.post_id = p_post_id
  limit 1;

  if v_conv is null then
    insert into public.conversations (kind, title, subtitle, post_id)
    values ('direct', v_post.title, 'Community board', p_post_id)
    returning id into v_conv;
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, auth.uid()), (v_conv, v_post.author_id);
  end if;
  return v_conv;
end;
$$;

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('farm', 'message', 'event', 'profile', 'post'));

-- ---------------------------------------------------------------------------
-- Farm insights for growers
-- ---------------------------------------------------------------------------
create table public.farm_view_days (
  farm_id uuid not null references public.farms (id) on delete cascade,
  day date not null default current_date,
  views int not null default 0,
  primary key (farm_id, day)
);

create or replace function public.log_farm_view(p_farm_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.farm_view_days (farm_id, day, views)
  select p_farm_id, current_date, 1
  where exists (select 1 from public.farms where id = p_farm_id and status = 'approved')
    and not exists (select 1 from public.farms where id = p_farm_id and owner_id = auth.uid())
  on conflict (farm_id, day) do update set views = public.farm_view_days.views + 1;
$$;

create or replace function public.farm_insights(p_farm_id uuid)
returns table (views_30d int, followers int, inquiries_30d int, open_inquiries int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.owns_farm(p_farm_id) or public.is_staff()) then
    raise exception 'Only the farm can see its insights';
  end if;
  return query select
    coalesce((select sum(v.views) from public.farm_view_days v where v.farm_id = p_farm_id and v.day > current_date - 30), 0)::int,
    (select count(*) from public.follows f where f.farm_id = p_farm_id)::int,
    (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
      where c.farm_id = p_farm_id and m.kind = 'inquiry' and m.created_at > now() - interval '30 days')::int,
    (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
      where c.farm_id = p_farm_id and m.kind = 'inquiry' and m.inquiry_status = 'open')::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- Impact reporting for BFI staff (for funders and grant reports)
-- ---------------------------------------------------------------------------
create or replace function public.impact_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Only BFI staff can see impact reports'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'members', (select count(*) from public.profiles),
    'growers', (select count(*) from public.profiles where role = 'grower'),
    'farms_live', (select count(*) from public.farms where status = 'approved' and not is_sample),
    'farms_verified', (select count(*) from public.farms where verified_at is not null and not is_sample),
    'farms_pending', (select count(*) from public.farms where status = 'pending'),
    'farms_on_app', (select count(*) from public.farms where owner_id is not null and status = 'approved'),
    'inquiries_total', (select count(*) from public.messages where kind = 'inquiry'),
    'inquiries_30d', (select count(*) from public.messages where kind = 'inquiry' and created_at > now() - interval '30 days'),
    'inquiries_answered', (select count(*) from public.messages where kind = 'inquiry' and inquiry_status in ('ready', 'partial')),
    'messages_30d', (select count(*) from public.messages where created_at > now() - interval '30 days'),
    'profile_views_30d', coalesce((select sum(views) from public.farm_view_days where day > current_date - 30), 0),
    'follows', (select count(*) from public.follows),
    'events_upcoming', (select count(*) from public.events where status = 'approved' and starts_at > now()),
    'rsvps', (select count(*) from public.event_rsvps),
    'volunteer_signups', (select count(*) from public.shift_signups),
    'programs_saved', (select count(*) from public.saved_resources),
    'board_posts_open', (select count(*) from public.posts where status = 'open' and expires_at > now()),
    'farms_by_region', (
      select coalesce(jsonb_object_agg(r.id, (select count(*) from public.farms f where f.region_id = r.id and f.status = 'approved' and not f.is_sample)), '{}')
      from public.regions r
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security for the new tables
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.saved_alerts enable row level security;
alter table public.reminders_sent enable row level security;
alter table public.farm_photos enable row level security;
alter table public.posts enable row level security;
alter table public.farm_view_days enable row level security;

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
-- notification_deliveries, reminders_sent and farm_view_days: no policies, so only the service role and
-- security-definer functions can touch them.

create policy "own alerts" on public.saved_alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "photos visible with farm" on public.farm_photos for select
  using (exists (select 1 from public.farms f where f.id = farm_id and (f.status = 'approved' or f.owner_id = auth.uid() or public.is_staff())));
create policy "owners manage photos" on public.farm_photos for all to authenticated
  using (public.owns_farm(farm_id) or public.is_staff())
  with check (public.owns_farm(farm_id) or public.is_staff());

create policy "members read open posts" on public.posts for select to authenticated
  using ((status = 'open' and expires_at > now()) or author_id = auth.uid() or public.is_staff());
create policy "members create posts" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'open');
create policy "authors and staff edit posts" on public.posts for update to authenticated
  using (author_id = auth.uid() or public.is_staff())
  with check ((author_id = auth.uid() and status in ('open', 'closed')) or public.is_staff());
create policy "authors delete posts" on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_staff());

alter publication supabase_realtime add table public.notifications;
