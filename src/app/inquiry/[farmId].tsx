import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ErrorNote, Field, Loading, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { nextSaturday } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { showAlert } from '@/lib/alert';
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

  if (farm.error) return <Screen><ErrorNote message={farm.error} onRetry={farm.reload} /></Screen>;
  if (!farm.data) return <Screen><Loading /></Screen>;
  const f = farm.data;
  const products = (f.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  // Default to the first product in season and the farm's first way to buy.
  const product = productChoice || products[0] || '';
  // Farms that list no way to buy still get inquiries: the farmer says how in the reply.
  const howOptions = f.how_to_buy.length ? f.how_to_buy : [t('messageToArrange')];
  const how = howChoice || howOptions[0];

  // A real calendar date, from today (on this phone's calendar) up to a year ahead.
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null;
  const now = new Date();
  const today = ymd(now);
  const inAYear = ymd(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate() + 1));
  const dateOk = !!parsed && !Number.isNaN(parsed.getTime()) && ymd(parsed) === date && date >= today && date <= inAYear;
  const valid = product.trim() && amount.trim() && dateOk && how.trim();

  const submit = async () => {
    if (busy) return; // a second tap while sending does nothing
    setBusy(true);
    const { data, error } = await supabase.rpc('send_inquiry', {
      p_farm_id: f.id,
      p_product: product.trim(),
      p_amount: amount.trim(),
      p_wanted_on: date,
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
        hint={date && !dateOk ? `${t('dateHint')} ${today}.` : undefined}
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
