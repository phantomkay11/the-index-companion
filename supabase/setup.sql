-- The Index: complete database setup.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs. Don't edit by hand.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Run it once, on a new project.
-- For sample farms and events (demos only), run supabase/seed.sql afterwards.

-- ===== 20261004000000_init.sql =====

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

-- ===== 20261004000100_bfi_reference_data.sql =====

-- Reference data that ships to production.
-- Regions and programs come from what Black Farmers Index publishes at blackfarmersindex.com.
-- BFI staff can edit all of this later from the Supabase dashboard.

insert into public.regions (id, name, states, sort_order) values
  ('1',    'Region 1',  '{Maine,New Hampshire,Vermont,Massachusetts,Rhode Island,Connecticut}', 1),
  ('2',    'Region 2',  '{New York,New Jersey,Pennsylvania,Delaware}', 2),
  ('3',    'Region 3',  '{Maryland,Washington DC,Virginia,West Virginia,Kentucky,North Carolina,Tennessee}', 3),
  ('4',    'Region 4',  '{South Carolina,Georgia,Alabama,Florida,Mississippi}', 4),
  ('5',    'Region 5',  '{Michigan,Indiana,Illinois,Wisconsin,Ohio}', 5),
  ('6',    'Region 6',  '{Arkansas,Louisiana,Oklahoma,Texas,New Mexico}', 6),
  ('7',    'Region 7',  '{Minnesota,Iowa,Nebraska,Missouri,Kansas}', 7),
  ('8',    'Region 8',  '{North Dakota,South Dakota,Montana,Wyoming,Colorado,Utah}', 8),
  ('9',    'Region 9',  '{California,Nevada,Arizona,Hawaii,Guam}', 9),
  ('10',   'Region 10', '{Washington,Oregon,Idaho,Alaska}', 10),
  ('11',   'Region 11', '{Puerto Rico,US Virgin Islands}', 11),
  ('intl', 'International', '{Africa & the Diaspora}', 12);

-- One open channel per region, plus topic groups.
insert into public.conversations (kind, title, subtitle, region_id)
select 'channel', r.name, array_to_string(r.states, ', '), r.id
from public.regions r order by r.sort_order;

insert into public.conversations (kind, title, subtitle) values
  ('channel', 'Beekeepers', 'Topic group'),
  ('channel', 'Fisherfolk', 'Topic group'),
  ('channel', 'Ranchers and livestock', 'Topic group'),
  ('channel', 'Organic transition', 'Topic group'),
  ('channel', 'Farmland access', 'Topic group'),
  ('channel', 'New and aspiring farmers', 'Topic group');

-- Programs. BFI's own first, then public programs. Deadlines are left empty:
-- each program sets its own, and staff fill them in when a window opens.
insert into public.resources (name, org, url, kind, summary, farm_types, stages, is_bfi_program, sort_order) values
  ('Register your farm on the Index', 'Black Farmers Index', 'https://blackfarmersindex.com',
   'BFI program', 'Listing on the largest free directory of Black farmers is free.', '{Any}', '{Any}', true, 1),
  ('Certified Organic Grower program', 'Black Farmers Index', 'https://blackfarmersindex.com/certified-organic-grower',
   'BFI program', 'BFI works with the USDA Transition to Organic Partnership Program (TOPP) and organic partners to help growers move toward certification.',
   '{Any}', '{Starting out,Established}', true, 2),
  ('Environmental Quality Incentives Program (EQIP)', 'USDA NRCS', 'https://www.nrcs.usda.gov',
   'Cost-share', 'Pays part of the cost of conservation work like high tunnels, irrigation, fencing and soil health practices.', '{Any}', '{Any}', false, 10),
  ('Farm Service Agency microloans', 'USDA FSA', 'https://www.fsa.usda.gov',
   'Loan', 'Small loans with simpler paperwork for equipment, seed, livestock and operating costs.', '{Any}', '{Starting out,Established}', false, 11),
  ('Heirs'' Property Relending Program', 'USDA FSA', 'https://www.fsa.usda.gov',
   'Land', 'Helps families who inherited land without clear title get financing to resolve ownership.', '{Any}', '{Any}', false, 12),
  ('Organic Certification Cost Share', 'USDA FSA', 'https://www.fsa.usda.gov',
   'Cost-share', 'Reimburses part of what you pay each year to become or stay certified organic.', '{Produce,Meat,Honey,Eggs}', '{Established}', false, 13),
  ('Southern SARE Producer Grants', 'Southern SARE', 'https://southern.sare.org',
   'Grant', 'Grants for farmers to test new ideas on their own farm and share what they learn.', '{Any}', '{Established}', false, 14),
  ('Federation of Southern Cooperatives', 'Nonprofit', 'https://www.federation.coop',
   'Support', 'Training, cooperative development and land retention help for Black farmers in the South.', '{Any}', '{Starting out,Established}', false, 15);

update public.resources set region_ids = '{3,4,6,11}' where org = 'Southern SARE';
update public.resources set region_ids = '{3,4,6}' where org = 'Nonprofit';

-- BFI's published event.
insert into public.events (title, description, type, starts_at, place, region_id, host_name, ticket_url, ticket_label, status)
values ('Collard Green Gala', 'BFI''s gala celebrating Black farmers. Ticket sales support the Index.', 'BFI event',
        '2026-12-19 19:00:00-08', 'Los Angeles, CA', '9', 'Black Farmers Index',
        'https://www.zeffy.com/en-US/ticketing/collard-green-gala', 'Tickets on Zeffy', 'approved');

insert into public.broadcasts (title, body, audience, channels, link_url, link_text) values
  ('Collard Green Gala', 'Join BFI on December 19 in Los Angeles. Your support brings business and visibility to Black farmers.',
   'everyone', '{push,sms,email}', 'https://www.zeffy.com/en-US/ticketing/collard-green-gala', 'Tickets on Zeffy');

-- ===== 20261005000000_v2_features.sql =====

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

-- ===== 20261006000000_round3.sql =====

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

-- ===== 20261007000000_hardening.sql =====

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
