import { router } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Field, Pill, Row, Screen, SignInPrompt, ToggleRow, Txt, Verified } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { CATEGORIES } from '@/lib/bfi';
import { extensionOf, randomId, readBytes } from '@/lib/files';
import { updatedAgo } from '@/lib/format';
import { photoUrl } from '@/components/farm-card';
import { supabase } from '@/lib/supabase';
import type { FarmInsights, FarmPhoto, FarmProduct, LocationVisibility, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

export default function MyFarm() {
  const { session, myFarm } = useAuth();
  if (!session) return <Screen><SignInPrompt /></Screen>;
  return myFarm ? <ManageFarm /> : <ListFarm />;
}

/** For a farm the member already owns: what's fresh, harvest mode, messages. */
function ManageFarm() {
  const { t } = useSettings();
  const { myFarm, refresh } = useAuth();
  const farm = myFarm!;
  const [newProduct, setNewProduct] = useState('');

  const products = useQuery(
    async () => must(await supabase.from('farm_products').select('*').eq('farm_id', farm.id).order('name')) as FarmProduct[],
    [farm.id],
  );

  const toggleProduct = async (p: FarmProduct) => {
    const { error } = await supabase.from('farm_products').update({ in_season: !p.in_season, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) Alert.alert('Not updated', error.message);
    products.reload();
    refresh();
  };

  const addProduct = async () => {
    const name = newProduct.trim();
    if (!name) return;
    const { error } = await supabase.from('farm_products').insert({ farm_id: farm.id, name });
    if (error) return Alert.alert('Not added', error.message);
    setNewProduct('');
    products.reload();
    refresh();
  };

  const setFarm = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from('farms').update(patch).eq('id', farm.id);
    if (error) Alert.alert('Not saved', error.message);
    refresh();
  };

  return (
    <Screen>
      <Card tone="soft">
        <Txt variant="label">{t('myFarm')}</Txt>
        <Txt variant="title">{farm.name}</Txt>
        <Row>
          {farm.status === 'approved' && farm.verified_at ? <Verified /> : <Pill label="Waiting for BFI review" tone="sun" />}
          <Txt variant="mono" muted>
            {updatedAgo(farm.updated_at)}
          </Txt>
        </Row>
        {farm.status !== 'approved' ? (
          <Txt variant="small">BFI reviews every new listing. You can set up your products now; your farm goes live once it’s approved.</Txt>
        ) : null}
      </Card>

      {farm.status === 'approved' ? <Insights farmId={farm.id} /> : null}

      <View style={{ gap: Space.sm }}>
        <Txt variant="label">What’s fresh this week · tap to turn on or off</Txt>
        <Row gap={6}>
          {(products.data ?? []).map((p) => (
            <Chip key={p.id} label={p.name} selected={p.in_season} onPress={() => toggleProduct(p)} />
          ))}
        </Row>
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label="Add a product" value={newProduct} onChangeText={setNewProduct} placeholder="For example: Turnip greens" onSubmitEditing={addProduct} />
          </View>
          <Button small label="Add" onPress={addProduct} disabled={!newProduct.trim()} style={{ alignSelf: 'flex-end' }} />
        </Row>
        <Txt variant="small" muted>
          Followers get a notification when you mark something fresh.
        </Txt>
      </View>

      <ToggleRow
        label={t('harvestMode')}
        hint="Shows buyers you're in harvest and may reply slowly."
        value={farm.harvest_mode}
        onChange={(v) => setFarm({ harvest_mode: v })}
      />
      <ToggleRow label="Accept messages from buyers" value={farm.accepts_messages} onChange={(v) => setFarm({ accepts_messages: v })} />
      <ToggleRow
        label="I reply by text message"
        hint="Messages reach you by text when you’ve turned on text messages in Settings. Reply to the text to answer; for an inquiry, reply YES, PART or NO."
        value={farm.replies_by_sms}
        onChange={(v) => setFarm({ replies_by_sms: v })}
      />
      <OrderLink key={`${farm.order_url}|${farm.order_label}`} url={farm.order_url ?? ''} label={farm.order_label ?? ''} onSave={setFarm} />
      <FarmPhotos farmId={farm.id} />
      <Button kind="ghost" label="View my public profile" onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })} />
    </Screen>
  );
}

/** A link to the farm's own store, CSA sign-up or market page. The app never handles payment. */
function OrderLink({ url: savedUrl, label: savedLabel, onSave }: { url: string; label: string; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const { t, colors } = useSettings();
  const [url, setUrl] = useState(savedUrl);
  const [label, setLabel] = useState(savedLabel);
  const [busy, setBusy] = useState(false);
  const trimmed = url.trim();
  const normalized = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed.replace(/^http:\/\//i, 'https://');
  const valid = !trimmed || /^https:\/\/[^\s.]+\.[^\s]+$/i.test(normalized);
  const changed = normalized !== savedUrl || label.trim() !== savedLabel;

  const save = async () => {
    setBusy(true);
    await onSave({ order_url: normalized || null, order_label: label.trim() || null });
    setBusy(false);
  };

  return (
    <Card>
      <Txt variant="heading">{t('orderOnline')}</Txt>
      <Txt variant="small" muted>
        Have an online store, CSA sign-up or market page? Add it and buyers see an “{t('orderOnline')}” button on your profile.
        Orders and payment go straight to you.
      </Txt>
      <Field label="Link" value={url} onChangeText={setUrl} placeholder="https://yourfarm.com/shop" autoCapitalize="none" keyboardType="url" />
      {!valid ? (
        <Txt variant="small" color={colors.danger}>
          That doesn’t look like a web address yet.
        </Txt>
      ) : null}
      <Field label="Button text (optional)" value={label} onChangeText={setLabel} placeholder="For example: Join our CSA" maxLength={40} />
      <Button small label={t('save')} onPress={save} busy={busy} disabled={!valid || !changed} />
    </Card>
  );
}

/** For a member who wants to list a farm. Every new listing is reviewed by BFI. */
function ListFarm() {
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
    if (error) return Alert.alert('Listing not sent', error.message);
    await refresh();
    Alert.alert('Sent to BFI', 'BFI will review your listing. You can add your products while you wait.');
  };

  return (
    <Screen>
      <Txt muted>Listing on the Index is free. BFI reviews every farm before it goes live and marks it verified.</Txt>
      <Field label="Farm name" value={name} onChangeText={setName} />
      <Row>
        <View style={{ flex: 2, minWidth: 160 }}>
          <Field label="City or town" value={city} onChangeText={setCity} />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Field label="State" value={state} onChangeText={setState} placeholder="Louisiana" />
        </View>
      </Row>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">BFI region</Txt>
        <Row gap={6}>
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? 'International' : r.name} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">What do you grow or raise?</Txt>
        <Row gap={6}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.id}
              selected={categories.includes(c.id)}
              onPress={() => setCategories((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
            />
          ))}
        </Row>
      </View>

      <Field label="Your story (optional)" value={story} onChangeText={setStory} multiline placeholder="A few sentences about your farm" />
      <Field label="How people can buy (one per line)" value={howToBuy} onChangeText={setHowToBuy} multiline placeholder={'Farm stand, Saturdays\nCSA boxes'} />

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">How much location to show</Txt>
        <Row gap={6}>
          <Chip label="City only" selected={visibility === 'city'} onPress={() => setVisibility('city')} />
          <Chip label="A pickup point" selected={visibility === 'pickup_point'} onPress={() => setVisibility('pickup_point')} />
          <Chip label="Exact address" selected={visibility === 'exact'} onPress={() => setVisibility('exact')} />
        </Row>
        {visibility === 'pickup_point' ? <Field label="Pickup point" value={pickup} onChangeText={setPickup} placeholder="For example: Saturday market, Main St" /> : null}
        <Txt variant="small" muted>
          Your street address is never shown unless you choose “Exact address”.
        </Txt>
      </View>

      <Button label="Send to BFI for review" onPress={submit} busy={busy} disabled={!valid} />
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
    ['Profile views', q.data.views_30d],
    ['Followers', q.data.followers],
    ['Inquiries', q.data.inquiries_30d],
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
        <Button small label={`Answer ${q.data.open_inquiries} open ${q.data.open_inquiries === 1 ? 'inquiry' : 'inquiries'}`} icon="chatbubbles-outline" onPress={() => router.push('/messages')} />
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
    if (!perm.granted) return Alert.alert('Photos are off', 'Allow photo access for The Index in your phone settings.');
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
      Alert.alert('Photo not added', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: FarmPhoto) => {
    await supabase.storage.from('farm-photos').remove([p.path]);
    const { error } = await supabase.from('farm_photos').delete().eq('id', p.id);
    if (error) Alert.alert('Not removed', error.message);
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
              {i > 0 ? <Button small kind="ghost" label="Make first" onPress={() => makeFirst(p)} /> : <Txt variant="small" muted>Cover photo</Txt>}
              <Button small kind="ghost" label="Remove" onPress={() => remove(p)} accessibilityLabel={`Remove photo: ${p.alt_text}`} />
            </Row>
          </View>
        ))}
      </Row>
      {picked ? (
        <Card>
          <Image source={{ uri: picked.uri }} contentFit="cover" style={[styles.thumb, { width: '100%', height: 180 }]} accessibilityLabel="Selected photo" />
          <Field
            label="Describe the photo"
            hint="Read aloud for people who can't see it. For example: Rows of collards at sunrise."
            value={alt}
            onChangeText={setAlt}
            maxLength={200}
          />
          <ToggleRow label="I took this photo or have permission, and BFI may show it in the app" value={consent} onChange={setConsent} />
          <Row>
            <Button label="Add photo" onPress={upload} busy={busy} disabled={alt.trim().length < 3 || !consent} />
            <Button kind="ghost" label={t('cancel')} onPress={() => setPicked(null)} />
          </Row>
        </Card>
      ) : (
        <Button kind="ghost" label={t('addPhoto')} icon="image-outline" onPress={pick} />
      )}
      {!(photos.data ?? []).length && !picked ? (
        <Txt variant="small" muted>
          Farms with photos get more visits. Your first photo is the cover on your listing.
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
