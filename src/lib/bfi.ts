/**
 * What Black Farmers Index publishes about itself (blackfarmersindex.com: home, The Index, About BFI).
 * Checked October 4, 2026. BFI should review and own this copy.
 */
export const BFI = {
  site: 'https://blackfarmersindex.com',
  donateUrl: 'https://pay.blackfarmersindex.com/',
  shopUrl: 'https://blackfarmersindex.com/shop',
  mission: 'Build + Connect + Grow',
  tagline: 'The largest free directory of Black farmers',
  status: '501(c)(3) nonprofit · Lafayette, LA',
  stats: [
    { value: '~1,300', label: 'growers listed' },
    { value: '400+', label: 'women-owned farms' },
    { value: '300+', label: 'organic, natural or regenerative' },
  ],
  pillars: [
    'Increase marketing toward the Black agricultural ecosystem',
    'Collect and share accurate information on Black growers',
    'Provide resources for access to capital',
    'Advocate for pathways to farmland',
  ],
  timeline: [
    ['Apr 2020', 'First list of Black farmers published as a solutions-journalism project on Ark Republic'],
    ['Jul 2020', 'Established as a nonprofit'],
    ['Nov 2021', 'Granted 501(c)(3) status'],
    ['2021–22', 'Awarded SARE grants'],
    ['Oct 2024', 'Awarded JustFund grant'],
  ] as const,
  programs: [
    'Free online directory',
    'Workshops',
    'Food-centered events',
    'Curated gift boxes',
    'Farm visits and feature stories',
    'Data gathering and reporting',
  ],
  partners:
    'Ark Republic, Organic Trade Association, Florida Organic Growers, Pennsylvania Certified Growers, Accredited Certifiers Association, IGH Gardens',
  founder: 'Dr. Kaia Niambi Shivers, President and Founder',
  quote: { text: 'If you give him land, he will grow his own food.', by: 'Fannie Lou Hamer, on the Freedom Farm Cooperative' },
  contacts: [
    { label: 'General inquiries', value: 'foodculture@blackfarmersindex.com' },
    { label: 'Collaborations', value: 'cornbread@blackfarmersindex.com' },
    { label: 'Donor opportunities', value: 'cheddar@blackfarmersindex.com' },
    { label: 'Press and media', value: 'lettuce@blackfarmersindex.com' },
    { label: 'Phone', value: '337-357-8321' },
    { label: 'Mail', value: '1105 Moss St #90391, Lafayette, LA 70509' },
  ],
};

/** BFI's own grower types, used for browsing. Icon names are Ionicons. */
export const CATEGORIES = [
  { id: 'Row crops', icon: 'leaf-outline' },
  { id: 'Ranchers', icon: 'paw-outline' },
  { id: 'Vegetables & fruit', icon: 'nutrition-outline' },
  { id: 'Beekeepers', icon: 'flower-outline' },
  { id: 'Fisherfolk', icon: 'fish-outline' },
  { id: 'Foragers', icon: 'trail-sign-outline' },
  { id: 'Vintners', icon: 'wine-outline' },
  { id: 'Organic', icon: 'ribbon-outline' },
] as const;
