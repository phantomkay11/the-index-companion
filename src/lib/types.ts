export type Role = 'neighbor' | 'grower' | 'coordinator' | 'admin';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'hidden';
export type LocationVisibility = 'exact' | 'pickup_point' | 'city';
export type InquiryStatus = 'open' | 'ready' | 'partial' | 'unavailable';

export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  region_id: string | null;
  language: string;
};

export type Region = { id: string; name: string; states: string[]; sort_order: number };

export type FarmProduct = { id: string; farm_id: string; name: string; in_season: boolean; updated_at: string };

export type Farm = {
  id: string;
  owner_id: string | null;
  name: string;
  city: string;
  state: string;
  region_id: string;
  lat: number | null;
  lon: number | null;
  location_visibility: LocationVisibility;
  pickup_point: string | null;
  story: string | null;
  categories: string[];
  attributes: string[];
  languages: string[];
  how_to_buy: string[];
  website: string | null;
  accepts_messages: boolean;
  replies_by_sms: boolean;
  harvest_mode: boolean;
  status: ReviewStatus;
  verified_at: string | null;
  listed_since: string;
  is_sample: boolean;
  updated_at: string;
  farm_products?: FarmProduct[];
};

export type Conversation = {
  id: string;
  kind: 'direct' | 'channel';
  title: string | null;
  subtitle: string | null;
  region_id: string | null;
  farm_id: string | null;
  last_message_at: string;
};

export type Inquiry = { product: string; amount: string; wanted_on: string; how: string };

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: 'text' | 'inquiry' | 'voice' | 'system';
  body: string;
  inquiry: Inquiry | null;
  inquiry_status: InquiryStatus | null;
  transcript: string | null;
  via: 'app' | 'sms';
  pinned: boolean;
  created_at: string;
  sender?: { display_name: string; role: Role } | null;
};

export type Broadcast = {
  id: string;
  title: string;
  body: string;
  audience: string;
  channels: string[];
  link_url: string | null;
  link_text: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string;
  place: string;
  region_id: string | null;
  host_name: string;
  host_farm_id: string | null;
  ticket_url: string | null;
  ticket_label: string | null;
  status: ReviewStatus;
  submitted_by: string | null;
  is_sample: boolean;
};

export type Shift = { id: string; event_id: string; label: string; capacity: number; open_spots: number };

export type Rsvp = {
  event_id: string;
  user_id: string;
  remind_push: boolean;
  remind_sms: boolean;
  remind_email: boolean;
};

export type Resource = {
  id: string;
  name: string;
  org: string;
  url: string;
  kind: string;
  summary: string;
  farm_types: string[];
  stages: string[];
  region_ids: string[] | null;
  deadline: string | null;
  is_bfi_program: boolean;
};
