// A stand-in Supabase backend for store screenshots and the App Preview.
// Every farm, person and event here is invented sample data. None of it comes from
// blackfarmersindex.com listings, and farms keep their "Sample" label in the app.

const DAY = 864e5;
const now = Date.now();
const iso = (days) => new Date(now + days * DAY).toISOString();
export const ME = '11111111-1111-4111-8111-111111111111';

const product = (fid, names) => names.map((n, i) => ({ id: `${fid}-p${i}`, farm_id: fid, name: n, in_season: true, updated_at: iso(-1) }));
const farm = (o) => ({
  owner_id: o.id === 'f1' ? 'owner1' : null,
  location_visibility: 'pickup_point',
  pickup_point: o.pickup ?? 'Saturday market',
  languages: o.languages ?? ['English'],
  website: null,
  accepts_messages: true,
  replies_by_sms: o.id === 'f1',
  harvest_mode: false,
  status: 'approved',
  verified_at: iso(-30),
  listed_since: o.since ?? '2021-03-01',
  is_sample: true,
  updated_at: iso(o.updated ?? -1),
  order_url: o.order ? 'https://example.com/shop' : null,
  order_label: o.order ?? null,
  farm_photos: [],
  ...o,
  farm_products: product(o.id, o.products),
});

export const farms = [
  farm({ id: 'f1', name: 'Golden Comb Apiary', city: 'Opelousas', state: 'LA', region_id: '6', lat: 30.53, lon: -92.08, categories: ['Beekeepers'], attributes: ['Women-owned', 'Natural'],
    story: 'Third-generation beekeeper keeping 40 hives across St. Landry Parish. Raw, unfiltered honey from clover, tallow and wildflower.',
    products: ['Wildflower honey', 'Comb honey', 'Beeswax candles'], how_to_buy: ['Farm stand, Saturdays 8–12', 'Pickup at the Lafayette market'], order: 'Order honey for pickup', updated: -0.2 }),
  farm({ id: 'f2', name: 'Bayou Bend Fisheries', city: 'Houma', state: 'LA', region_id: '6', lat: 29.6, lon: -90.72, categories: ['Fisherfolk'], attributes: ['Family-owned'],
    story: 'Two boats, one family. Wild-caught Gulf shrimp and blue crab, sold off the dock.', products: ['Gulf shrimp', 'Blue crab'], how_to_buy: ['Dockside, Thursday to Saturday'], languages: ['English', 'French'] }),
  farm({ id: 'f3', name: 'Sweet Pea Acres', city: 'Hattiesburg', state: 'MS', region_id: '4', lat: 31.33, lon: -89.29, categories: ['Vegetables & fruit', 'Organic'], attributes: ['Organic', 'Women-owned'],
    story: 'Five certified organic acres and a weekly CSA.', products: ['Collard greens', 'Sweet potatoes', 'Field peas'], how_to_buy: ['CSA boxes, weekly'], order: 'Join our CSA' }),
  farm({ id: 'f4', name: 'Three Sisters Ranch', city: 'Tyler', state: 'TX', region_id: '6', lat: 32.35, lon: -95.3, categories: ['Ranchers'], attributes: ['Grass-fed', 'Women-owned'],
    story: 'Three sisters raising cattle on land their family bought in 1919.', products: ['Grass-fed beef', 'Pastured eggs'], how_to_buy: ['Monthly meat box'], since: '2020-06-01' }),
  farm({ id: 'f5', name: 'Delta Commons Co-op', city: 'Greenwood', state: 'MS', region_id: '4', lat: 33.52, lon: -90.18, categories: ['Row crops'], attributes: ['Cooperative', 'Youth-led'],
    story: 'Twelve member farms sharing equipment and a packing shed.', products: ['Okra', 'Stone-ground grits'], how_to_buy: ['Co-op market, Wednesdays'] }),
  farm({ id: 'f6', name: 'Okra Row Farm', city: 'Tuskegee', state: 'AL', region_id: '4', lat: 32.42, lon: -85.69, categories: ['Vegetables & fruit'], attributes: ['Heirloom seed', 'Veteran-owned'],
    story: 'A veteran-run seed farm keeping Southern heirlooms alive.', products: ['Okra', 'Muscadines'], how_to_buy: ['Online seed shop'], order: 'Shop heirloom seed' }),
  farm({ id: 'f7', name: 'Kreyòl Garden', city: 'Miami', state: 'FL', region_id: '4', lat: 25.83, lon: -80.2, categories: ['Vegetables & fruit'], attributes: ['Immigrant-owned'],
    story: 'Haitian peppers, callaloo and herbs grown in Little Haiti.', products: ['Scotch bonnet peppers', 'Callaloo'], how_to_buy: ['Little Haiti market, Sundays'], languages: ['Haitian Creole', 'English', 'French'] }),
  farm({ id: 'f8', name: 'Harvest Hill Vineyard', city: 'Paso Robles', state: 'CA', region_id: '9', lat: 35.63, lon: -120.69, categories: ['Vintners'], attributes: ['Family-owned'],
    story: 'Small-lot wines from a family vineyard on the Central Coast.', products: ['Grenache', 'Rosé'], how_to_buy: ['Tasting room, weekends'] }),
];

const regions = [['1', 'ME, NH, VT, MA, RI, CT'], ['2', 'NY, NJ'], ['3', 'PA, DE, MD, VA, WV, DC'], ['4', 'NC, SC, GA, AL, FL, MS, TN, KY'], ['5', 'MI, OH, IN, IL, WI'],
  ['6', 'AR, LA, OK, TX, NM'], ['7', 'IA, MO, NE, KS, MN, ND, SD'], ['8', 'CO, UT, WY, MT'], ['9', 'CA, NV, AZ, HI'], ['10', 'WA, OR, ID, AK'], ['11', 'PR, VI'], ['intl', '']]
  .map(([id, st], i) => ({ id, name: id === 'intl' ? 'International' : `Region ${id}`, states: st ? st.split(', ') : [], sort_order: i }));

const events = [
  { id: 'e2', title: 'Black Growers Market Day', description: 'Fifteen growers, live music, SNAP accepted.', type: 'Market', starts_at: iso(4), place: 'Lafayette, LA', region_id: '6', host_name: 'Golden Comb Apiary', host_farm_id: 'f1', ticket_url: null, ticket_label: null, status: 'approved', submitted_by: null, is_sample: true },
  { id: 'e3', title: 'Sweet potato harvest help', description: 'Many hands needed. Lunch provided.', type: 'Volunteer', starts_at: iso(9), place: 'Greenwood, MS', region_id: '4', host_name: 'Delta Commons Co-op', host_farm_id: 'f5', ticket_url: null, ticket_label: null, status: 'approved', submitted_by: null, is_sample: true },
  { id: 'e4', title: 'Cover crops for small plots', description: 'A walk-through with a soil scientist. Bring a shovel.', type: 'Workshop', starts_at: iso(16), place: 'Tuskegee, AL', region_id: '4', host_name: 'Okra Row Farm', host_farm_id: 'f6', ticket_url: null, ticket_label: null, status: 'approved', submitted_by: null, is_sample: true },
  { id: 'e1', title: 'Collard Green Gala', description: 'BFI’s gala celebrating Black farmers.', type: 'BFI event', starts_at: iso(74), place: 'Los Angeles, CA', region_id: '9', host_name: 'Black Farmers Index', host_farm_id: null, ticket_url: 'https://www.zeffy.com', ticket_label: 'Tickets on Zeffy', status: 'approved', submitted_by: null, is_sample: false },
];

const convs = [
  { id: 'c1', kind: 'direct', title: 'Golden Comb Apiary', subtitle: null, region_id: null, farm_id: 'f1', post_id: null, last_message_at: iso(-0.02) },
  { id: 'c2', kind: 'direct', title: 'Sweet Pea Acres', subtitle: null, region_id: null, farm_id: 'f3', post_id: null, last_message_at: iso(-1) },
  { id: 'c3', kind: 'direct', title: 'Bayou Bend Fisheries', subtitle: null, region_id: null, farm_id: 'f2', post_id: null, last_message_at: iso(-3) },
];
const msg = (id, sender, kind, body, extra = {}) => ({
  id, conversation_id: 'c1', sender_id: sender === 'me' ? ME : 'owner1', kind, body, inquiry: null, inquiry_status: null, transcript: null, audio_path: null, via: 'app', pinned: false, hidden: false,
  sender: sender === 'me' ? { display_name: 'Dana', role: 'neighbor' } : { display_name: 'Golden Comb Apiary', role: 'grower' }, ...extra,
});
export const thread = [
  msg('m1', 'me', 'inquiry', '', { inquiry: { product: 'Wildflower honey', amount: '6 pint jars', wanted_on: iso(4).slice(0, 10), how: 'Pickup at the Lafayette market', note: 'For my mother’s church bake sale.' }, inquiry_status: 'ready', created_at: iso(-0.3) }),
  msg('m2', 'farm', 'text', 'Yes! Six pints set aside for you. Green tent by the fountain, 8 to noon.', { via: 'sms', created_at: iso(-0.25) }),
  msg('m3', 'me', 'text', 'Perfect. Do you have comb honey too?', { created_at: iso(-0.1) }),
  msg('m4', 'farm', 'text', 'A few frames. I’ll bring two.', { via: 'sms', created_at: iso(-0.02) }),
];

const posts = [
  { id: 'p1', author_id: 'x', kind: 'need', title: 'Hands for sweet potato harvest Saturday', body: 'Two to three hours, lunch on us.', region_id: '4', location_text: 'Greenwood, MS', happens_on: iso(5).slice(0, 10), status: 'open', expires_at: iso(40), created_at: iso(-1), author: { display_name: 'Delta Commons Co-op', role: 'grower' } },
  { id: 'p2', author_id: 'y', kind: 'equipment', title: 'Walk-behind seeder to lend', body: 'Jang JP-1, cleaned and ready.', region_id: '4', location_text: 'Tuskegee, AL', happens_on: null, status: 'open', expires_at: iso(40), created_at: iso(-2), author: { display_name: 'Okra Row Farm', role: 'grower' } },
  { id: 'p3', author_id: 'z', kind: 'offer', title: 'Scotch bonnet seedlings, 30 flats', body: 'Free to Index growers. Pickup in Miami.', region_id: '4', location_text: 'Miami, FL', happens_on: null, status: 'open', expires_at: iso(40), created_at: iso(-3), author: { display_name: 'Kreyòl Garden', role: 'grower' } },
  { id: 'p4', author_id: 'w', kind: 'ride', title: 'Ride to the Jackson farmers market', body: 'Room for two coolers in the truck.', region_id: '4', location_text: 'Hattiesburg, MS', happens_on: iso(6).slice(0, 10), status: 'open', expires_at: iso(40), created_at: iso(-4), author: { display_name: 'Sweet Pea Acres', role: 'grower' } },
];

const resources = [
  { id: 'r0', name: 'Certified Organic Grower program', org: 'Black Farmers Index', url: 'https://blackfarmersindex.com', kind: 'BFI program', summary: 'BFI works with organic partners to help growers move toward certification.', farm_types: ['Any'], stages: ['Any'], region_ids: null, deadline: null, is_bfi_program: true },
  { id: 'r1', name: 'Environmental Quality Incentives Program (EQIP)', org: 'USDA NRCS', url: 'https://www.nrcs.usda.gov', kind: 'Cost-share', summary: 'Pays part of the cost of conservation work like high tunnels and irrigation.', farm_types: ['Any'], stages: ['Any'], region_ids: null, deadline: iso(21).slice(0, 10), is_bfi_program: false },
  { id: 'r2', name: 'Farm Service Agency microloans', org: 'USDA FSA', url: 'https://www.fsa.usda.gov', kind: 'Loan', summary: 'Small loans with simpler paperwork for equipment, seed and livestock.', farm_types: ['Any'], stages: ['Starting out'], region_ids: null, deadline: null, is_bfi_program: false },
  { id: 'r3', name: 'Heirs’ Property Relending Program', org: 'USDA FSA', url: 'https://www.fsa.usda.gov', kind: 'Land', summary: 'Loans to resolve ownership of land passed down without a clear title.', farm_types: ['Any'], stages: ['Any'], region_ids: null, deadline: null, is_bfi_program: false },
];

const notifications = [
  { id: 'n1', user_id: ME, kind: 'message', title: 'Golden Comb Apiary', body: 'A few frames. I’ll bring two.', data: { route: '/thread/c1' }, created_at: iso(-0.02), read_at: null },
  { id: 'n2', user_id: ME, kind: 'fresh', title: 'Sweet Pea Acres', body: 'Collard greens are fresh this week.', data: { route: '/farm/f3' }, created_at: iso(-0.3), read_at: null },
  { id: 'n5', user_id: ME, kind: 'near_me', title: 'Honey within 25 miles', body: 'Golden Comb Apiary marked wildflower honey fresh.', data: { route: '/farm/f1' }, created_at: iso(-0.6), read_at: null },
  { id: 'n3', user_id: ME, kind: 'event_reminder', title: 'Saturday: Black Growers Market Day', body: 'Lafayette, LA · 8 am', data: { route: '/events' }, created_at: iso(-1), read_at: iso(-0.9) },
  { id: 'n4', user_id: ME, kind: 'broadcast', title: 'Collard Green Gala', body: 'Join BFI in Los Angeles.', data: { route: '/messages' }, created_at: iso(-2), read_at: iso(-1.9) },
];

const CHECKIN = { id: 'k1', title: 'Are you OK after the storm?', message: 'Hurricane winds came through southwest Louisiana last night. Let us know how you and your farm are doing.', audience: 'region:6', closes_at: iso(6), created_at: iso(-0.3) };
const SURVEY = { id: 's1', title: 'Growing season check-in', intro: 'Your answers help BFI make the case for cold storage funding.', audience: 'growers', status: 'open', closes_at: iso(12), created_at: iso(-1),
  questions: [
    { id: 'q1', type: 'scale', prompt: 'How was this growing season for you?', required: true },
    { id: 'q2', type: 'multi', prompt: 'What would help your farm most next year?', options: ['Land access', 'Equipment', 'Cold storage', 'Buyers', 'Funding and grants'] },
    { id: 'q3', type: 'text', prompt: 'Anything else BFI should know?' },
  ] };

/**
 * Wire the mock into a Playwright browser context.
 * opts: { signedIn, role: 'neighbor' | 'grower' | 'admin', checkin, survey, settings, fail }
 * fail: every database read returns a server error (to test error states).
 */
export async function installMock(ctx, opts = {}) {
  const { signedIn = true, role = 'neighbor', checkin = false, survey = false, settings, fail = false, surveyAnswered = false, evilLinks = false, unverifiedPhone = false } = opts;
  await ctx.addInitScript(([signedIn, uid, exp, settings]) => {
    if (signedIn) {
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
        access_token: 'mock', refresh_token: 'mock', token_type: 'bearer', expires_in: 3600, expires_at: exp,
        user: { id: uid, email: 'dana@example.com', aud: 'authenticated', role: 'authenticated' },
      }));
    }
    if (settings) localStorage.setItem('the-index/settings', JSON.stringify(settings));
  }, [signedIn, ME, Math.floor(Date.now() / 1000) + 3600, settings ?? null]);

  const rest = (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const q = u.searchParams;
    const eq = (k) => (q.get(k) ?? '').replace(/^eq\./, '');
    switch (table) {
      case 'regions': return regions;
      case 'farms':
        if (q.get('id')) {
          const f = farms.find((x) => x.id === eq('id')) ?? null;
          return f && evilLinks ? { ...f, website: 'javascript:alert(document.cookie)' } : f;
        }
        if (q.get('owner_id')) return role === 'grower' ? farms[0] : null;
        return farms;
      case 'farm_products': return farms[0].farm_products;
      case 'events': return q.get('id') ? events.find((e) => e.id === eq('id')) : events;
      case 'shift_availability': return [{ id: 's1', event_id: 'e3', label: '8–11 am', capacity: 6, open_spots: 2 }];
      case 'event_rsvps': return [{ event_id: 'e2', user_id: ME, remind_push: true, remind_sms: false, remind_email: true }];
      case 'notifications': return notifications;
      case 'saved_resources': return [{ resource_id: 'r1' }];
      case 'follows': return q.get('farm_id') ? null : [{ farm_id: 'f1' }];
      case 'shift_signups': case 'saved_alerts': return [];
      case 'resources': return resources;
      case 'broadcasts': return [{ id: 'b1', title: 'Collard Green Gala', body: 'Join BFI in Los Angeles to celebrate Black farmers.', audience: 'everyone', channels: ['push'], link_url: 'https://www.zeffy.com', link_text: 'Tickets on Zeffy', created_at: iso(-2) }];
      case 'profiles': return { id: ME, display_name: 'Dana', role, region_id: '6', language: 'en' };
      case 'contact_prefs': return { user_id: ME, phone: '+15555550142', phone_verified_at: unverifiedPhone ? null : iso(-10), sms_opt_in: true, email_opt_in: true, push_token: null, notify_messages: true, notify_follows: true, notify_events: true, notify_deadlines: true, notify_broadcasts: true };
      case 'conversation_members':
        return q.get('select')?.includes('last_read_at') ? convs.map((c) => ({ conversation_id: c.id, last_read_at: c.id === 'c1' ? iso(-0.05) : iso(1) })) : convs.map((c) => ({ conversation_id: c.id }));
      case 'conversations': return q.get('id') && !q.get('id').startsWith('in.') ? convs.find((c) => c.id === eq('id')) : convs;
      case 'messages': {
        const cid = eq('conversation_id');
        const rows = cid === 'c1' ? thread
          : cid === 'c2' ? [{ ...thread[2], id: 'x2', conversation_id: 'c2', body: 'Is there room in the CSA for one more?', created_at: iso(-1) }]
          : cid === 'c3' ? [{ ...thread[1], id: 'x3', conversation_id: 'c3', sender_id: 'o3', body: 'Shrimp is in. Dock opens at 7.', created_at: iso(-3) }]
          : [];
        if (q.get('limit') === '1') return [...rows].reverse()[0] ?? null;
        return rows;
      }
      case 'posts': return posts;
      case 'checkins': return checkin ? (q.get('id') ? CHECKIN : [CHECKIN]) : (q.get('id') ? null : []);
      case 'checkin_responses': return [];
      case 'surveys': return survey ? (q.get('id') ? SURVEY : [SURVEY]) : (q.get('id') ? null : []);
      case 'survey_responses':
        return surveyAnswered ? [{ survey_id: 's1', user_id: ME, answers: { q1: 4 }, consent_share: false, created_at: iso(-0.5), updated_at: iso(-0.5) }] : [];
      default: return [];
    }
  };

  await ctx.route('http://localhost:54321/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/rest/v1/rpc/')) {
      if (fail) return route.fulfill({ status: 500, json: { message: 'Server unavailable (test)', code: 'XX000' } });
      if (url.includes('farm_insights')) return route.fulfill({ json: [{ views_30d: 214, followers: 38, inquiries_30d: 17, open_inquiries: 2 }] });
      if (url.includes('impact_stats')) {
        return route.fulfill({ json: { generated_at: iso(0), members: 412, growers: 168, farms_live: 131, farms_verified: 117, farms_pending: 9, farms_on_app: 64,
          inquiries_total: 388, inquiries_30d: 72, inquiries_answered: 301, messages_30d: 940, profile_views_30d: 5120, follows: 1210, events_upcoming: 6,
          rsvps: 233, volunteer_signups: 41, programs_saved: 187, board_posts_open: 23, farms_by_region: { 6: 31, 4: 22, 5: 19 } } });
      }
      return route.fulfill({ json: url.includes('can_post') ? true : null });
    }
    if (url.includes('/rest/v1/')) {
      if (fail) return route.fulfill({ status: 500, json: { message: 'Server unavailable (test)', code: 'XX000' } });
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, json: [] });
      let body = rest(url);
      if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) {
        if (Array.isArray(body)) body = body[0] ?? null;
        // Like PostgREST: .single() with no matching row is an error, not an empty answer.
        if (body == null) return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null } });
      }
      if (req.method() === 'HEAD' || (req.headers().prefer ?? '').includes('count=exact')) return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, json: [] });
      return route.fulfill({ json: body });
    }
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: ME, email: 'dana@example.com', aud: 'authenticated' } });
    if (url.includes('/realtime/')) return route.abort();
    return route.fulfill({ status: 404, body: '' });
  });
}
