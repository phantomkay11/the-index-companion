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
  /** The farm's own store, CSA sign-up or market page. */
  order_url?: string | null;
  order_label?: string | null;
  accepts_messages: boolean;
  replies_by_sms: boolean;
  harvest_mode: boolean;
  status: ReviewStatus;
  verified_at: string | null;
  listed_since: string;
  is_sample: boolean;
  updated_at: string;
  farm_products?: FarmProduct[];
  farm_photos?: FarmPhoto[];
};

export type Conversation = {
  id: string;
  kind: 'direct' | 'channel';
  title: string | null;
  subtitle: string | null;
  region_id: string | null;
  farm_id: string | null;
  post_id?: string | null;
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
  audio_path: string | null;
  hidden?: boolean;
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

export type ContactPrefs = {
  user_id: string;
  phone: string | null;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  push_token: string | null;
  notify_messages: boolean;
  notify_follows: boolean;
  notify_events: boolean;
  notify_deadlines: boolean;
  notify_broadcasts: boolean;
};

export type AppNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: { route?: string; link_url?: string | null; [k: string]: unknown };
  created_at: string;
  read_at: string | null;
};

export type SavedAlert = {
  id: string;
  user_id: string;
  keyword: string;
  lat: number;
  lon: number;
  place_label: string | null;
  radius_miles: number;
  created_at: string;
};

export type FarmPhoto = {
  id: string;
  farm_id: string;
  /** A path in the farm-photos bucket, or a full https URL (sample farms only). */
  path: string;
  alt_text: string;
  sort_order: number;
  credit?: string | null;
  credit_url?: string | null;
};

export type PostKind = 'need' | 'offer' | 'equipment' | 'ride' | 'bulk' | 'mentor';

export type Post = {
  id: string;
  author_id: string;
  kind: PostKind;
  title: string;
  body: string;
  region_id: string | null;
  location_text: string | null;
  happens_on: string | null;
  status: 'open' | 'closed' | 'hidden';
  expires_at: string;
  created_at: string;
  author?: { display_name: string; role: Role } | null;
};

export type FarmInsights = { views_30d: number; followers: number; inquiries_30d: number; open_inquiries: number };

export type Audience = 'everyone' | 'growers' | 'neighbors' | `region:${string}`;

export type SurveyQuestion = {
  id: string;
  type: 'single' | 'multi' | 'text' | 'scale';
  prompt: string;
  options?: string[];
  required?: boolean;
};

export type SurveyAnswer = string | string[] | number;

export type Survey = {
  id: string;
  title: string;
  intro: string;
  questions: SurveyQuestion[];
  audience: Audience;
  status: 'draft' | 'open' | 'closed';
  closes_at: string | null;
  created_at: string;
};

export type SurveyResponse = {
  survey_id: string;
  user_id: string;
  answers: Record<string, SurveyAnswer>;
  consent_share: boolean;
  updated_at: string;
};

export type Checkin = {
  id: string;
  title: string;
  message: string;
  audience: Audience;
  closes_at: string;
  created_at: string;
};

export type CheckinResponse = {
  checkin_id: string;
  user_id: string;
  status: 'ok' | 'need_help';
  note: string;
  via: 'app' | 'sms';
  updated_at: string;
};

export type CheckinReport = {
  reached: number;
  ok: number;
  need_help: number;
  needs: { user_id: string; name: string; note: string; via: 'app' | 'sms'; updated_at: string; phone: string | null; region_id: string | null }[];
};
