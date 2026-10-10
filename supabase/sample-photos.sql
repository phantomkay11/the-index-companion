-- PLACEHOLDER PHOTOS for the invented sample farms (is_sample = true), so the directory isn't empty.
-- Free-license stock from Pexels, credited on the photo. Real farms always upload their own photos.
-- Safe to run more than once: it replaces only the linked (https) photos on sample farms.
-- Run it in Supabase → SQL Editor on a project that has the sample data from seed.sql.

delete from public.farm_photos ph
using public.farms f
where ph.farm_id = f.id and f.is_sample and ph.path like 'https://%';

insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, sort_order, credit, credit_url)
select v.farm_id::uuid, v.path, v.alt_text, true, v.sort_order, v.credit, v.credit_url
from (values
  -- Sweet Pea Acres (vegetables, women-owned)
  ('00000000-0000-4000-a000-000000000004',
   'https://images.pexels.com/photos/7456786/pexels-photo-7456786.jpeg?auto=compress&cs=tinysrgb&w=1400',
   'A farmer in a field holding a purple cauliflower and a head of lettuce', 0,
   'Kindel Media / Pexels', 'https://www.pexels.com/photo/a-woman-holding-lettuce-and-cauliflower-7456786/'),
  ('00000000-0000-4000-a000-000000000004',
   'https://images.pexels.com/photos/7456775/pexels-photo-7456775.jpeg?auto=compress&cs=tinysrgb&w=1400',
   'A smiling farmer holding a fresh purple cauliflower outdoors', 1,
   'Kindel Media / Pexels', 'https://www.pexels.com/photo/woman-holding-cauliflower-7456775/'),
  -- Pine & Pasture Farm (ranch, market sales)
  ('00000000-0000-4000-a000-000000000008',
   'https://images.pexels.com/photos/8540244/pexels-photo-8540244.jpeg?auto=compress&cs=tinysrgb&w=1400',
   'A farmer in a cowboy hat arranging produce at an outdoor market stand', 0,
   'RDNE Stock project / Pexels', 'https://www.pexels.com/photo/a-low-angle-shot-of-a-man-wearing-a-cowboy-hat-8540244/')
) as v(farm_id, path, alt_text, sort_order, credit, credit_url)
join public.farms f on f.id = v.farm_id::uuid and f.is_sample;
