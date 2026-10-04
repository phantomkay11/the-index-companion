import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, Field, Pill, Row, Screen, SignInPrompt, ToggleRow, Txt, Verified } from '@/components/ui';
import { Space } from '@/constants/theme';
import { CATEGORIES } from '@/lib/bfi';
import { updatedAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { FarmProduct, LocationVisibility, Region } from '@/lib/types';
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
        hint="Messages reach you by SMS when the text line is turned on."
        value={farm.replies_by_sms}
        onChange={(v) => setFarm({ replies_by_sms: v })}
      />
      <Button kind="ghost" label="View my public profile" onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })} />
    </Screen>
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
