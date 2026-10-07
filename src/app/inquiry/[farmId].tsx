import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, ErrorNote, Field, Loading, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { nextSaturday, parseLocalDate, ymd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { showAlert } from '@/lib/alert';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

export default function Inquiry() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const farm = useQuery(async () => must(await supabase.from('farms').select('*, farm_products(*)').eq('id', farmId).single()) as Farm, [farmId]);
  const [productChoice, setProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(nextSaturday());
  const [howChoice, setHow] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useSettings();
  const { session, myFarm } = useAuth();

  // Inquiries are for signed-in members; say so before the form, not after it's filled in.
  if (!session) return <Screen><SignInPrompt /></Screen>;
  if (farm.error) return <Screen><ErrorNote message={farm.error} onRetry={farm.reload} /></Screen>;
  if (!farm.data) return <Screen><Loading /></Screen>;
  const f = farm.data;
  // The database would refuse these on Send; tell the member up front instead.
  const closed = !f.owner_id ? t('farmNotJoined') : !f.accepts_messages ? t('farmNotTaking') : myFarm?.id === f.id ? t('farmIsYours') : null;
  if (closed) {
    return (
      <Screen>
        <Card tone="sun" style={{ gap: Space.md }}>
          <Txt>{closed}</Txt>
          <Button kind="ghost" label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </Card>
      </Screen>
    );
  }
  const products = (f.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  // Default to the first product in season and the farm's first way to buy.
  const product = productChoice || products[0] || '';
  // Farms that list no way to buy still get inquiries: the farmer says how in the reply.
  const howOptions = f.how_to_buy.length ? f.how_to_buy : [t('messageToArrange')];
  const how = howChoice || howOptions[0];

  // A real calendar date, from today (on this phone's calendar) up to a year ahead.
  const day = date.trim();
  const parsed = parseLocalDate(day);
  const now = new Date();
  const today = ymd(now);
  const inAYear = ymd(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate() + 1));
  const dateOk = !!parsed && day >= today && day <= inAYear;
  const dateProblem = !day || dateOk ? null : !parsed ? 'bad' : day < today ? 'past' : 'far';
  const valid = product.trim() && amount.trim() && dateOk && how.trim();

  const submit = async () => {
    if (busy) return; // a second tap while sending does nothing
    setBusy(true);
    const { data, error } = await supabase.rpc('send_inquiry', {
      p_farm_id: f.id,
      p_product: product.trim(),
      p_amount: amount.trim(),
      p_wanted_on: day,
      p_how: how.trim(),
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return showAlert('Inquiry not sent', error.message);
    router.dismiss();
    router.push({ pathname: '/thread/[id]', params: { id: data as string } });
  };

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Txt variant="label">To {f.name}</Txt>
        <Txt muted>{t('inquiryIntro')}</Txt>
      </View>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('product')}</Txt>
        <Row gap={6}>
          {products.map((p) => (
            <Chip key={p} label={p} selected={product === p} onPress={() => setProduct(p)} />
          ))}
        </Row>
        {!products.length ? <Field label="What are you looking for?" value={product} onChangeText={setProduct} maxLength={80} /> : null}
      </View>

      <Field label={t('amount')} value={amount} onChangeText={setAmount} placeholder={t('amountPlaceholder')} maxLength={80} />
      <Field
        label={`${t('when')} (year-month-day)`}
        value={date}
        onChangeText={setDate}
        placeholder="2026-10-10"
        keyboardType="numbers-and-punctuation"
        hint={dateProblem === 'far' ? t('dateTooFar') : dateProblem ? `${t('dateHint')} ${today}.` : undefined}
      />

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('how')}</Txt>
        <Row gap={6}>
          {howOptions.map((h) => (
            <Chip key={h} label={h} selected={how === h} onPress={() => setHow(h)} />
          ))}
        </Row>
      </View>

      <Field label={t('noteOptional')} value={note} onChangeText={setNote} placeholder={t('notePlaceholder')} multiline maxLength={500} />
      <Button label={t('sendInquiry')} icon="send" onPress={submit} busy={busy} disabled={!valid} />
    </Screen>
  );
}
