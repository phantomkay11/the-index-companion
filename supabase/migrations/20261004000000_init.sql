-- The Index Companion: initial schema
-- Directory, messaging, events, resources and moderation for Black Farmers Index.
-- Every table has row level security on. Public visitors can browse approved
-- listings, events and resources. Everything else needs a signed-in account.


-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('neighbor', 'grower', 'coordinator', 'admin');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'hidden');
create type public.location_visibility as enum ('exact', 'pickup_point', 'city');
create type public.conversation_kind as enum ('direct', 'channel');
create type public.message_kind as enum ('text', 'inquiry', 'voice', 'system');
create type public.inquiry_status as enum ('open', 'ready', 'partial', 'unavailable');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Index member',
  role public.user_role not null default 'neighbor',
  region_id text,
  language text not null default 'en',
  created_at timestamptz not null default now()
);

-- Contact details are kept apart from profiles so they are never readable by other members.
create table public.contact_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  sms_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  push_token text,
  updated_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('coordinator', 'admin')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Index member'));
  insert into public.contact_prefs (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may not promote themselves to staff.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, migrations and seed scripts.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_staff() then
    raise exception 'Only BFI staff can change member roles';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Regions (BFI's own regions from blackfarmersindex.com/the-index)
-- ---------------------------------------------------------------------------
create table public.regions (
  id text primary key,
  name text not null,
  states text[] not null,
  sort_order int not null
);

alter table public.profiles
  add constraint profiles_region_fk foreign key (region_id) references public.regions (id);

-- ---------------------------------------------------------------------------
-- Directory
-- ---------------------------------------------------------------------------
create table public.farms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  city text not null,
  state text not null,
  region_id text not null references public.regions (id),
  -- The point shown on maps: a pickup point or city centre unless the farmer chose "exact".
  lat double precision,
  lon double precision,
  location_visibility public.location_visibility not null default 'city',
  pickup_point text,
  story text,
  categories text[] not null default '{}',
  attributes text[] not null default '{}',
  languages text[] not null default '{English}',
  how_to_buy text[] not null default '{}',
  website text,
  accepts_messages boolean not null default true,
  replies_by_sms boolean not null default false,
  harvest_mode boolean not null default false,
  status public.review_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  listed_since date not null default current_date,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index farms_region_idx on public.farms (region_id) where status = 'approved';
create index farms_categories_idx on public.farms using gin (categories);

-- Private farm details: only the owner and BFI staff can read these.
create table public.farm_private (
  farm_id uuid primary key references public.farms (id) on delete cascade,
  street_address text,
  exact_lat double precision,
  exact_lon double precision,
  phone text,
  email text
);

create table public.farm_products (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  name text not null,
  in_season boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (farm_id, name)
);

create table public.follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  farm_id uuid not null references public.farms (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, farm_id)
);

create or replace function public.owns_farm(f uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.farms where id = f and owner_id = auth.uid());
$$;

create or replace function public.is_verified_grower()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.farms
    where owner_id = auth.uid() and status = 'approved' and verified_at is not null
  );
$$;

-- New listings always start pending; only staff can approve or verify.
create or replace function public.guard_farm_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff, the service role, migrations and seed scripts (auth.uid() is null) are trusted.
  if auth.uid() is null or public.is_staff() then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
    new.is_sample := false;
    new.owner_id := auth.uid();
  else
    new.status := old.status;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.is_sample := old.is_sample;
    new.owner_id := old.owner_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger farms_guard_review
  before insert or update on public.farms
  for each row execute function public.guard_farm_review();

create or replace function public.touch_farm_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.farms set updated_at = now() where id = coalesce(new.farm_id, old.farm_id);
  return coalesce(new, old);
end;
$$;

create trigger farm_products_touch
  after insert or update or delete on public.farm_products
  for each row execute function public.touch_farm_from_product();

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  title text,
  subtitle text,
  region_id text references public.regions (id),
  farm_id uuid references public.farms (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind public.message_kind not null default 'text',
  body text not null default '',
  inquiry jsonb,
  inquiry_status public.inquiry_status,
  audio_path text,
  transcript text,
  lang text,
  via text not null default 'app' check (via in ('app', 'sms')),
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.is_member(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = c and user_id = auth.uid()
  );
$$;

create or replace function public.can_read_conversation(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff()
    or public.is_member(c)
    or exists (select 1 from public.conversations where id = c and kind = 'channel');
$$;

-- Direct threads: members only. Channels: verified growers and staff.
create or replace function public.can_post(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (select kind from public.conversations where id = c)
    when 'direct' then public.is_member(c)
    when 'channel' then public.is_staff() or public.is_verified_grower()
    else false
  end;
$$;

create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump
  after insert on public.messages
  for each row execute function public.bump_conversation();

-- Start (or reopen) a direct thread with a farm's owner.
create or replace function public.start_conversation(p_farm_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_accepts boolean;
  v_name text;
  v_conv uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to message a farm';
  end if;
  select owner_id, accepts_messages, name into v_owner, v_accepts, v_name
  from public.farms where id = p_farm_id and status = 'approved';
  if v_owner is null then
    raise exception 'This farm has not joined the app yet';
  end if;
  if not v_accepts then
    raise exception 'This farm is not taking messages right now';
  end if;
  if v_owner = auth.uid() then
    raise exception 'You cannot message your own farm';
  end if;

  select c.id into v_conv
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = auth.uid()
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_owner
  where c.kind = 'direct' and c.farm_id = p_farm_id
  limit 1;

  if v_conv is null then
    insert into public.conversations (kind, title, farm_id) values ('direct', v_name, p_farm_id)
    returning id into v_conv;
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, auth.uid()), (v_conv, v_owner);
  end if;
  return v_conv;
end;
$$;

-- A structured request the farmer can answer in one tap.
create or replace function public.send_inquiry(
  p_farm_id uuid, p_product text, p_amount text, p_wanted_on date, p_how text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
begin
  v_conv := public.start_conversation(p_farm_id);
  insert into public.messages (conversation_id, sender_id, kind, body, inquiry, inquiry_status)
  values (
    v_conv, auth.uid(), 'inquiry', coalesce(p_note, ''),
    jsonb_build_object('product', p_product, 'amount', p_amount, 'wanted_on', p_wanted_on, 'how', p_how),
    'open'
  );
  return v_conv;
end;
$$;

-- The farm owner answers an inquiry.
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
  update public.messages set inquiry_status = p_status where id = p_message_id;
  insert into public.messages (conversation_id, sender_id, body) values (v_conv, auth.uid(), p_reply);
end;
$$;

create or replace function public.mark_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
$$;

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'everyone', -- 'everyone', 'growers', 'neighbors', or 'region:<id>'
  channels text[] not null default '{push,email}',
  link_url text,
  link_text text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'Farm day',
  starts_at timestamptz not null,
  ends_at timestamptz,
  place text not null,
  region_id text references public.regions (id),
  host_name text not null,
  host_farm_id uuid references public.farms (id) on delete set null,
  ticket_url text,
  ticket_label text,
  status public.review_status not null default 'pending',
  submitted_by uuid references public.profiles (id) default auth.uid(),
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_starts_idx on public.events (starts_at) where status = 'approved';

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
    new.status := old.status;
    new.submitted_by := old.submitted_by;
    new.is_sample := old.is_sample;
  end if;
  return new;
end;
$$;

create trigger events_guard_review
  before insert or update on public.events
  for each row execute function public.guard_event_review();

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  remind_push boolean not null default true,
  remind_sms boolean not null default false,
  remind_email boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null,
  capacity int not null check (capacity > 0)
);

create table public.shift_signups (
  shift_id uuid not null references public.volunteer_shifts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shift_id, user_id)
);

create or replace function public.enforce_shift_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.shift_signups where shift_id = new.shift_id)
     >= (select capacity from public.volunteer_shifts where id = new.shift_id) then
    raise exception 'This shift is full';
  end if;
  return new;
end;
$$;

create trigger shift_signups_capacity
  before insert on public.shift_signups
  for each row execute function public.enforce_shift_capacity();

create view public.shift_availability
with (security_invoker = true) as
  select s.id, s.event_id, s.label, s.capacity,
         s.capacity - (select count(*) from public.shift_signups x where x.shift_id = s.id)::int as open_spots
  from public.volunteer_shifts s;

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text not null,
  url text not null,
  kind text not null,
  summary text not null,
  farm_types text[] not null default '{Any}',
  stages text[] not null default '{Any}',
  region_ids text[], -- null means every region
  deadline date,
  is_bfi_program boolean not null default false,
  sort_order int not null default 100,
  updated_at timestamptz not null default now()
);

create table public.saved_resources (
  user_id uuid not null references public.profiles (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null default auth.uid(),
  target_type text not null check (target_type in ('farm', 'message', 'event', 'profile')),
  target_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);

create or replace function public.review_farm(p_farm_id uuid, p_status public.review_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Only BFI staff can review listings'; end if;
  update public.farms
  set status = p_status,
      verified_at = case when p_status = 'approved' then now() else verified_at end,
      verified_by = case when p_status = 'approved' then auth.uid() else verified_by end
  where id = p_farm_id;
  update public.profiles set role = 'grower'
  where p_status = 'approved' and role = 'neighbor'
    and id = (select owner_id from public.farms where id = p_farm_id);
end;
$$;

create or replace function public.review_event(p_event_id uuid, p_status public.review_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Only BFI staff can review events'; end if;
  update public.events set status = p_status where id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.contact_prefs enable row level security;
alter table public.regions enable row level security;
alter table public.farms enable row level security;
alter table public.farm_private enable row level security;
alter table public.farm_products enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.broadcasts enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.volunteer_shifts enable row level security;
alter table public.shift_signups enable row level security;
alter table public.resources enable row level security;
alter table public.saved_resources enable row level security;
alter table public.reports enable row level security;

-- profiles: members see names and roles; each person edits their own row.
create policy "profiles readable by members" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());

create policy "own contact prefs" on public.contact_prefs for all to authenticated
  using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid());

create policy "regions are public" on public.regions for select using (true);

create policy "approved farms are public" on public.farms for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_staff());
create policy "members can submit a farm" on public.farms for insert to authenticated
  with check (auth.uid() is not null);
create policy "owners and staff edit farms" on public.farms for update to authenticated
  using (owner_id = auth.uid() or public.is_staff());
create policy "staff delete farms" on public.farms for delete to authenticated using (public.is_staff());

create policy "farm private for owner and staff" on public.farm_private for all to authenticated
  using (public.owns_farm(farm_id) or public.is_staff())
  with check (public.owns_farm(farm_id) or public.is_staff());

create policy "products visible with farm" on public.farm_products for select
  using (exists (select 1 from public.farms f where f.id = farm_id
                 and (f.status = 'approved' or f.owner_id = auth.uid() or public.is_staff())));
create policy "owners manage products" on public.farm_products for all to authenticated
  using (public.owns_farm(farm_id) or public.is_staff())
  with check (public.owns_farm(farm_id) or public.is_staff());

create policy "own follows" on public.follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read allowed conversations" on public.conversations for select to authenticated
  using (public.can_read_conversation(id));
create policy "staff manage channels" on public.conversations for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "see own memberships" on public.conversation_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(conversation_id) or public.is_staff());

create policy "read messages" on public.messages for select to authenticated
  using (public.can_read_conversation(conversation_id) and (not hidden or public.is_staff()));
create policy "post messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and kind in ('text', 'voice') and public.can_post(conversation_id));
create policy "staff moderate messages" on public.messages for update to authenticated
  using (public.is_staff());

create policy "broadcasts are public" on public.broadcasts for select using (true);
create policy "staff send broadcasts" on public.broadcasts for insert to authenticated
  with check (public.is_staff());

create policy "approved events are public" on public.events for select
  using (status = 'approved' or submitted_by = auth.uid() or public.is_staff());
create policy "members submit events" on public.events for insert to authenticated
  with check (auth.uid() is not null);
create policy "submitters and staff edit events" on public.events for update to authenticated
  using (submitted_by = auth.uid() or public.is_staff());

create policy "own rsvps" on public.event_rsvps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "shifts are public" on public.volunteer_shifts for select using (true);
create policy "staff manage shifts" on public.volunteer_shifts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "signups readable" on public.shift_signups for select using (true);
create policy "own signups" on public.shift_signups for insert to authenticated with check (user_id = auth.uid());
create policy "cancel own signups" on public.shift_signups for delete to authenticated using (user_id = auth.uid());

create policy "resources are public" on public.resources for select using (true);
create policy "staff manage resources" on public.resources for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "own saved resources" on public.saved_resources for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members file reports" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "staff read reports" on public.reports for select to authenticated using (public.is_staff());
create policy "staff resolve reports" on public.reports for update to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Realtime: new messages stream to open threads.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
