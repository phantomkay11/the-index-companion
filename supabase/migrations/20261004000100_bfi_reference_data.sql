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
