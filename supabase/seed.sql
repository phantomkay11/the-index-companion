-- SAMPLE DATA for local development and demos only.
-- Every farm and event here is invented and flagged is_sample = true, so the app labels it "Sample".
-- Do not load this file into the production project. BFI's real directory is imported separately
-- (see docs/IMPORTING.md).

insert into public.farms
  (id, name, city, state, region_id, lat, lon, location_visibility, pickup_point, story, categories, attributes, languages, how_to_buy,
   replies_by_sms, status, verified_at, listed_since, is_sample)
values
  ('00000000-0000-4000-a000-000000000001', 'Golden Comb Apiary', 'Opelousas', 'LA', '6', 30.53, -92.08, 'pickup_point', 'Lafayette Saturday market',
   'Third-generation beekeeper keeping 40 hives across St. Landry Parish. Raw, unfiltered honey from clover, tallow and wildflower.',
   '{Beekeepers}', '{Women-owned,Natural}', '{English}', '{"Farm stand, Saturdays 8–12","Pickup at the Lafayette market"}',
   false, 'approved', now(), '2021-03-01', true),
  ('00000000-0000-4000-a000-000000000002', 'Bayou Bend Fisheries', 'Houma', 'LA', '6', 29.60, -90.72, 'exact', null,
   'Two boats, one family. Wild-caught Gulf shrimp and crab, sold straight off the dock.',
   '{Fisherfolk}', '{Family-owned}', '{English,Spanish}', '{"Dockside sales Thu–Sat","Delivery within 60 miles"}',
   false, 'approved', now(), '2020-06-15', true),
  ('00000000-0000-4000-a000-000000000003', 'Three Sisters Ranch', 'Tyler', 'TX', '6', 32.35, -95.30, 'city', null,
   'Three sisters raising cattle on land their great-grandfather bought in 1919.',
   '{Ranchers}', '{Grass-fed,Women-owned}', '{English}', '{"Monthly meat box","Order online, ranch pickup"}',
   false, 'approved', now(), '2022-02-01', true),
  ('00000000-0000-4000-a000-000000000004', 'Sweet Pea Acres', 'Hattiesburg', 'MS', '4', 31.33, -89.29, 'pickup_point', 'Downtown farmers market',
   'Five certified organic acres growing Southern staples from saved, heirloom seed.',
   '{Vegetables & fruit,Organic}', '{Organic,Women-owned}', '{English}', '{"CSA boxes, weekly","Farm stand, Saturdays"}',
   false, 'approved', now(), '2020-07-01', true),
  ('00000000-0000-4000-a000-000000000005', 'Delta Commons Co-op', 'Greenwood', 'MS', '4', 33.52, -90.18, 'exact', null,
   'Twelve member farms sharing equipment, cold storage and a youth farm crew.',
   '{Row crops}', '{Cooperative,Youth-led}', '{English}', '{"Co-op market, Wednesdays","Wholesale for schools"}',
   true, 'approved', now(), '2021-09-01', true),
  ('00000000-0000-4000-a000-000000000006', 'Okra Row Farm', 'Tuskegee', 'AL', '4', 32.42, -85.69, 'city', null,
   'A veteran-run seed farm preserving Southern heirloom varieties.',
   '{Vegetables & fruit}', '{Heirloom seed,Veteran-owned}', '{English}', '{"Online seed shop","Open farm days"}',
   false, 'approved', now(), '2023-04-01', true),
  ('00000000-0000-4000-a000-000000000007', 'Kreyòl Garden', 'Miami', 'FL', '4', 25.80, -80.21, 'exact', null,
   'An urban farm growing Caribbean greens and peppers on three city lots.',
   '{Foragers,Vegetables & fruit}', '{Natural,Women-owned}', '{English,Haitian Creole}', '{"Market, Sundays","Weekly bags for pickup"}',
   false, 'approved', now(), '2022-05-01', true),
  ('00000000-0000-4000-a000-000000000008', 'Pine & Pasture Farm', 'Sumter', 'SC', '4', 33.92, -80.34, 'exact', null,
   'Pigs and poultry rotated through longleaf pine pasture.',
   '{Ranchers,Beekeepers}', '{Pasture-raised,Veteran-owned}', '{English}', '{"Freezer shares","Farm store, Fri–Sat"}',
   false, 'approved', now(), '2021-01-15', true);

insert into public.farm_products (farm_id, name) values
  ('00000000-0000-4000-a000-000000000001', 'Wildflower honey'), ('00000000-0000-4000-a000-000000000001', 'Comb honey'),
  ('00000000-0000-4000-a000-000000000001', 'Beeswax candles'),
  ('00000000-0000-4000-a000-000000000002', 'Gulf shrimp'), ('00000000-0000-4000-a000-000000000002', 'Blue crab'),
  ('00000000-0000-4000-a000-000000000002', 'Speckled trout'),
  ('00000000-0000-4000-a000-000000000003', 'Grass-fed beef'), ('00000000-0000-4000-a000-000000000003', 'Pastured eggs'),
  ('00000000-0000-4000-a000-000000000003', 'Whole chickens'),
  ('00000000-0000-4000-a000-000000000004', 'Collard greens'), ('00000000-0000-4000-a000-000000000004', 'Sweet potatoes'),
  ('00000000-0000-4000-a000-000000000004', 'Field peas'),
  ('00000000-0000-4000-a000-000000000005', 'Okra'), ('00000000-0000-4000-a000-000000000005', 'Purple hull peas'),
  ('00000000-0000-4000-a000-000000000005', 'Stone-ground grits'),
  ('00000000-0000-4000-a000-000000000006', 'Okra'), ('00000000-0000-4000-a000-000000000006', 'Muscadines'),
  ('00000000-0000-4000-a000-000000000006', 'Seed packets'),
  ('00000000-0000-4000-a000-000000000007', 'Callaloo'), ('00000000-0000-4000-a000-000000000007', 'Scotch bonnets'),
  ('00000000-0000-4000-a000-000000000007', 'Mangoes'),
  ('00000000-0000-4000-a000-000000000008', 'Pork shares'), ('00000000-0000-4000-a000-000000000008', 'Pastured chicken'),
  ('00000000-0000-4000-a000-000000000008', 'Sourwood honey');

insert into public.events (id, title, description, type, starts_at, place, region_id, host_name, host_farm_id, status, is_sample) values
  ('00000000-0000-4000-b000-000000000001', 'Black Growers Market Day', 'Fifteen growers, live music, SNAP accepted.', 'Market',
   now() + interval '6 days', 'Lafayette, LA', '6', 'Golden Comb Apiary and 9 farms', '00000000-0000-4000-a000-000000000001', 'approved', true),
  ('00000000-0000-4000-b000-000000000002', 'Pricing for direct sales', 'How to set CSA and market prices that cover your real costs.', 'Workshop',
   now() + interval '10 days', 'Online · captions and recording', null, 'Black Farmers Index', null, 'approved', true),
  ('00000000-0000-4000-b000-000000000003', 'Open farm day and seed swap', 'Tour the seed beds and bring seed to swap. Kids welcome.', 'Farm day',
   now() + interval '13 days', 'Okra Row Farm · Tuskegee, AL', '4', 'Okra Row Farm', '00000000-0000-4000-a000-000000000006', 'approved', true),
  ('00000000-0000-4000-b000-000000000004', 'Sweet potato harvest help', 'Many hands needed. Lunch provided.', 'Volunteer',
   now() + interval '20 days', 'Delta Commons Co-op · Greenwood, MS', '4', 'Delta Commons Co-op', '00000000-0000-4000-a000-000000000005', 'approved', true);

insert into public.volunteer_shifts (event_id, label, capacity) values
  ('00000000-0000-4000-b000-000000000004', '8–11 am', 4),
  ('00000000-0000-4000-b000-000000000004', '11 am–2 pm', 2);
