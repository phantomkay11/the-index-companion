import { router } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, ErrorNote, Field, Loading, Pill, Row, Screen, SignInPrompt, ToggleRow, Txt, Verified } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { CATEGORIES, categoryLabel } from '@/lib/bfi';
import { extensionOf, randomId, readBytes } from '@/lib/files';
import { updatedAgo } from '@/lib/format';
import { photoUrl } from '@/components/farm-card';
import { supabase } from '@/lib/supabase';
import type { FarmInsights, FarmPhoto, FarmProduct, LocationVisibility, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { confirmAction, showAlert } from '@/lib/alert';

export default function MyFarm() {
  const { session, myFarm, memberStatus, refresh } = useAuth();
  if (!session) return <Screen><SignInPrompt /></Screen>;
  // Never offer "list your farm" just because the farm didn't load: that would invite a duplicate listing.
  if (memberStatus === 'loading' && !myFarm) return <Screen><Loading /></Screen>;
  if (memberStatus === 'error' && !myFarm) return <Screen><ErrorNote message="Failed to fetch" onRetry={refresh} /></Screen>;
  return myFarm ? <ManageFarm /> : <ListFarm />;
}

/** For a farm the member already owns: what's fresh, harvest mode, messages. */
function ManageFarm() {
  const { t, language } = useSettings();
  const { myFarm, refresh } = useAuth();
  const farm = myFarm!;
  const [newProduct, setNewProduct] = useState('');

  const products = useQuery(
    async () => must(await supabase.from('farm_products').select('*').eq('farm_id', farm.id).order('name')) as FarmProduct[],
    [farm.id],
  );

  const toggleProduct = async (p: FarmProduct) => {
    const { error } = await supabase.from('farm_products').update({ in_season: !p.in_season, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) showAlert(t('m_notUpdated'), error.message);
    products.reload();
    refresh();
  };

  const addProduct = async () => {
    const name = newProduct.trim();
    if (!name) return;
    const { error } = await supabase.from('farm_products').insert({ farm_id: farm.id, name });
    if (error) return showAlert(t('m_notAdded'), error.message);
    setNewProduct('');
    products.reload();
    refresh();
  };

  const setFarm = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from('farms').update(patch).eq('id', farm.id);
    if (error) showAlert(t('m_notSaved'), error.message);
    refresh();
  };

  return (
    <Screen>
      <Card tone="soft">
        <Txt variant="label">{t('myFarm')}</Txt>
        <Txt variant="title">{farm.name}</Txt>
        <Row>
          {farm.status === 'approved' && farm.verified_at ? <Verified /> : <Pill label={t('m_waitingReview')} tone="sun" />}
          <Txt variant="mono" muted>
            {updatedAgo(farm.updated_at, undefined, language)}
          </Txt>
        </Row>
        {farm.status !== 'approved' ? (
          <Txt variant="small">{t('m_reviewsNewListing')}</Txt>
        ) : null}
      </Card>

      {farm.status === 'approved' ? <Insights farmId={farm.id} /> : null}

      <View style={{ gap: Space.sm }}>
        <Txt variant="label">{t('m_freshTapToggle')}</Txt>
        <Row gap={6}>
          {(products.data ?? []).map((p) => (
            <Chip key={p.id} label={p.name} selected={p.in_season} onPress={() => toggleProduct(p)} />
          ))}
        </Row>
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label={t('m_addProduct')} value={newProduct} onChangeText={setNewProduct} placeholder={t('m_addProductPlaceholder')} onSubmitEditing={addProduct} />
          </View>
          <Button small label={t('m_add')} onPress={addProduct} disabled={!newProduct.trim()} style={{ alignSelf: 'flex-end' }} />
        </Row>
        <Txt variant="small" muted>
          {t('m_followersNotified')}
        </Txt>
      </View>

      <ToggleRow
        label={t('harvestMode')}
        hint={t('m_harvestModeHint')}
        value={farm.harvest_mode}
        onChange={(v) => setFarm({ harvest_mode: v })}
      />
      <ToggleRow label={t('m_acceptMessages')} value={farm.accepts_messages} onChange={(v) => setFarm({ accepts_messages: v })} />
      <ToggleRow
        label={t('m_replyByText')}
        hint={t('m_replyByTextHint')}
        value={farm.replies_by_sms}
        onChange={(v) => setFarm({ replies_by_sms: v })}
      />
      <OrderLink
        key={`${farm.order_url}|${farm.order_label}`}
        url={farm.order_url ?? ''}
        label={farm.order_label ?? ''}
        approved={farm.status === 'approved'}
        onSave={setFarm}
      />
      <FarmPhotos farmId={farm.id} />
      <Button kind="ghost" label={t('m_viewPublicProfile')} onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })} />
    </Screen>
  );
}

/** A link to the farm's own store, CSA sign-up or market page. The app never handles payment. */
function OrderLink({
  url: savedUrl,
  label: savedLabel,
  approved,
  onSave,
}: {
  url: string;
  label: string;
  approved: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const { t, colors } = useSettings();
  const [url, setUrl] = useState(savedUrl);
  const [label, setLabel] = useState(savedLabel);
  const [busy, setBusy] = useState(false);
  const trimmed = url.trim();
  const normalized = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed.replace(/^http:\/\//i, 'https://');
  const valid = !trimmed || /^https:\/\/[^\s.]+\.[^\s]+$/i.test(normalized);
  const changed = normalized !== savedUrl || label.trim() !== savedLabel;

  const save = async () => {
    if (busy) return;
    // A new link on a live listing goes back to BFI for a quick check (it could point anywhere),
    // which takes the farm off Discover until then. Say so first.
    if (approved && (normalized || null) !== (savedUrl || null)) {
      const go = await confirmAction(t('linkReviewTitle'), t('linkReviewBody'), t('saveAnyway'), t('cancel'));
      if (!go) return;
    }
    setBusy(true);
    await onSave({ order_url: normalized || null, order_label: label.trim() || null });
    setBusy(false);
  };

  return (
    <Card>
      <Txt variant="heading">{t('orderOnline')}</Txt>
      <Txt variant="small" muted>
        {t('m_orderLinkIntro', { button: t('orderOnline') })}
      </Txt>
      <Field label={t('m_link')} value={url} onChangeText={setUrl} placeholder="https://yourfarm.com/shop" autoCapitalize="none" keyboardType="url" />
      {!valid ? (
        <Txt variant="small" color={colors.danger}>
          {t('m_notWebAddress')}
        </Txt>
      ) : null}
      <Field label={t('m_buttonTextOptional')} value={label} onChangeText={setLabel} placeholder={t('m_buttonTextPlaceholder')} maxLength={40} />
      <Button small label={t('save')} onPress={save} busy={busy} disabled={!valid || !changed} />
    </Card>
  );
}

/** For a member who wants to list a farm. Every new listing is reviewed by BFI. */
function ListFarm() {
  const { t } = useSettings();
  const { refresh } = useAuth();
  const regions = useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [regionChoice, setRegion] = useState<string | null>(null);
  const [story, setStory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [howToBuy, setHowToBuy] = useState('');
  const [visibility, setVisibility] = useState<LocationVisibility>('city');
  const [pickup, setPickup] = useState('');
  const [busy, setBusy] = useState(false);

  // Suggest the region from the state the farmer types, until they pick one.
  const typed = state.trim().toLowerCase();
  const suggested = typed ? regions.data?.find((r) => r.states.some((x) => x.toLowerCase() === typed))?.id : undefined;
  const region = regionChoice ?? suggested ?? null;

  const valid = name.trim() && city.trim() && state.trim() && region && categories.length;

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.from('farms').insert({
      name: name.trim(),
      city: city.trim(),
      state: state.trim(),
      region_id: region,
      story: story.trim() || null,
      categories,
      how_to_buy: howToBuy.split('\n').map((x) => x.trim()).filter(Boolean),
      location_visibility: visibility,
      pickup_point: visibility === 'pickup_point' ? pickup.trim() || null : null,
    });
    setBusy(false);
    if (error) return showAlert(t('m_listingNotSent'), error.message);
    await refresh();
    showAlert(t('m_sentToBfi'), t('m_listingSentBody'));
  };

  return (
    <Screen>
      <Txt muted>{t('m_listingFreeVerified')}</Txt>
      <Field label={t('m_farmName')} value={name} onChangeText={setName} />
      <Row>
        <View style={{ flex: 2, minWidth: 160 }}>
          <Field label={t('m_cityOrTown')} value={city} onChangeText={setCity} />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Field label={t('m_state')} value={state} onChangeText={setState} placeholder="Louisiana" />
        </View>
      </Row>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('m_bfiRegion')}</Txt>
        <Row gap={6}>
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? t('international') : r.name} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('m_whatGrow')}</Txt>
        <Row gap={6}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={categoryLabel(c.id, t)}
              selected={categories.includes(c.id)}
              onPress={() => setCategories((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
            />
          ))}
        </Row>
      </View>

      <Field label={t('m_storyOptional')} value={story} onChangeText={setStory} multiline placeholder={t('m_storyPlaceholder')} />
      <Field label={t('m_howBuyLines')} value={howToBuy} onChangeText={setHowToBuy} multiline placeholder={t('m_howBuyPlaceholder')} />

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('m_howMuchLocation')}</Txt>
        <Row gap={6}>
          <Chip label={t('m_cityOnly')} selected={visibility === 'city'} onPress={() => setVisibility('city')} />
          <Chip label={t('m_aPickupPoint')} selected={visibility === 'pickup_point'} onPress={() => setVisibility('pickup_point')} />
          <Chip label={t('m_exactAddress')} selected={visibility === 'exact'} onPress={() => setVisibility('exact')} />
        </Row>
        {visibility === 'pickup_point' ? <Field label={t('m_pickupPoint')} value={pickup} onChangeText={setPickup} placeholder={t('m_pickupPlaceholder')} /> : null}
        <Txt variant="small" muted>
          {t('m_addressNeverShown', { option: t('m_exactAddress') })}
        </Txt>
      </View>

      <Button label={t('m_sendForReview')} onPress={submit} busy={busy} disabled={!valid} />
    </Screen>
  );
}


/** Views, followers and inquiries over the last 30 days, so growers can see the app bringing business. */
function Insights({ farmId }: { farmId: string }) {
  const { t, colors } = useSettings();
  const q = useQuery(async () => {
    const rows = must(await supabase.rpc('farm_insights', { p_farm_id: farmId })) as FarmInsights[];
    return rows[0];
  }, [farmId]);
  if (!q.data) return null;
  const stats: [string, number][] = [
    [t('m_profileViews'), q.data.views_30d],
    [t('m_followers'), q.data.followers],
    [t('m_inquiries'), q.data.inquiries_30d],
  ];
  return (
    <Card>
      <Txt variant="label">{t('insights')}</Txt>
      <View style={{ flexDirection: 'row', gap: Space.sm }}>
        {stats.map(([label, n]) => (
          <View key={label} style={[styles.stat, { backgroundColor: colors.sunk }]}>
            <Txt variant="mono" style={{ fontSize: 22, lineHeight: 28 }}>
              {n}
            </Txt>
            <Txt variant="small" muted>
              {label}
            </Txt>
          </View>
        ))}
      </View>
      {q.data.open_inquiries ? (
        <Button small label={q.data.open_inquiries === 1 ? t('m_answerOpenInquiry') : t('m_answerOpenInquiries', { n: q.data.open_inquiries })} icon="chatbubbles-outline" onPress={() => router.push('/messages')} />
      ) : null}
    </Card>
  );
}

/** Farm photos: the farmer adds them, describes them for screen readers, and confirms they may be shown. */
function FarmPhotos({ farmId }: { farmId: string }) {
  const { t, colors } = useSettings();
  const { refresh } = useAuth();
  const photos = useQuery(
    async () => must(await supabase.from('farm_photos').select('*').eq('farm_id', farmId).order('sort_order')) as FarmPhoto[],
    [farmId],
  );
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [alt, setAlt] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return showAlert(t('m_photosOff'), t('m_allowPhotoAccess'));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
    if (!res.canceled && res.assets[0]) setPicked(res.assets[0]);
  };

  const upload = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const ext = extensionOf(picked.fileName ?? picked.uri, 'jpg');
      const path = `${farmId}/${randomId()}.${ext}`;
      const bytes = await readBytes(picked.uri);
      const up = await supabase.storage.from('farm-photos').upload(path, bytes, { contentType: picked.mimeType ?? 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await supabase.from('farm_photos').insert({
        farm_id: farmId,
        path,
        alt_text: alt.trim(),
        farmer_consent: true,
        sort_order: photos.data?.length ?? 0,
      });
      if (error) throw error;
      setPicked(null);
      setAlt('');
      setConsent(false);
      photos.reload();
      refresh();
    } catch (e) {
      showAlert(t('m_photoNotAdded'), e instanceof Error ? e.message : t('m_tryAgainDot'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: FarmPhoto) => {
    await supabase.storage.from('farm-photos').remove([p.path]);
    const { error } = await supabase.from('farm_photos').delete().eq('id', p.id);
    if (error) showAlert(t('m_notRemoved'), error.message);
    photos.reload();
    refresh();
  };

  const makeFirst = async (p: FarmPhoto) => {
    const others = (photos.data ?? []).filter((x) => x.id !== p.id);
    await Promise.all([p, ...others].map((x, i) => supabase.from('farm_photos').update({ sort_order: i }).eq('id', x.id)));
    photos.reload();
    refresh();
  };

  return (
    <View style={{ gap: Space.sm }}>
      <Txt variant="label">{t('photos')}</Txt>
      <Row gap={Space.sm}>
        {(photos.data ?? []).map((p, i) => (
          <View key={p.id} style={{ gap: 4, width: 150 }}>
            <Image source={{ uri: photoUrl(p.path) }} alt={p.alt_text} accessibilityLabel={p.alt_text} contentFit="cover" style={styles.thumb} />
            <Row gap={4}>
              {i > 0 ? <Button small kind="ghost" label={t('m_makeFirst')} onPress={() => makeFirst(p)} /> : <Txt variant="small" muted>{t('m_coverPhoto')}</Txt>}
              <Button small kind="ghost" label={t('m_remove')} onPress={() => remove(p)} accessibilityLabel={t('m_removePhoto', { alt: p.alt_text })} />
            </Row>
          </View>
        ))}
      </Row>
      {picked ? (
        <Card>
          <Image source={{ uri: picked.uri }} contentFit="cover" style={[styles.thumb, { width: '100%', height: 180 }]} accessibilityLabel={t('m_selectedPhoto')} />
          <Field
            label={t('m_describePhoto')}
            hint={t('m_describePhotoHint')}
            value={alt}
            onChangeText={setAlt}
            maxLength={200}
          />
          <ToggleRow label={t('m_photoConsent')} value={consent} onChange={setConsent} />
          <Row>
            <Button label={t('m_addPhotoBtn')} onPress={upload} busy={busy} disabled={alt.trim().length < 3 || !consent} />
            <Button kind="ghost" label={t('cancel')} onPress={() => setPicked(null)} />
          </Row>
        </Card>
      ) : (
        <Button kind="ghost" label={t('addPhoto')} icon="image-outline" onPress={pick} />
      )}
      {!(photos.data ?? []).length && !picked ? (
        <Txt variant="small" muted>
          {t('m_photosGetVisits')}
        </Txt>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: Space.sm }} />
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, borderRadius: Radius.sm, padding: Space.sm, gap: 2 },
  thumb: { width: 150, height: 100, borderRadius: Radius.sm },
});
