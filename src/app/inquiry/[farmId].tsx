import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Chip, ErrorNote, Field, Loading, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { nextSaturday, validDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';

export default function Inquiry() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const farm = useQuery(async () => must(await supabase.from('farms').select('*, farm_products(*)').eq('id', farmId).single()) as Farm, [farmId]);
  const [productChoice, setProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(nextSaturday());
  const [howChoice, setHow] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (farm.error) return <Screen><ErrorNote message={farm.error} onRetry={farm.reload} /></Screen>;
  if (!farm.data) return <Screen><Loading /></Screen>;
  const f = farm.data;
  const products = (f.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  // Default to the first product in season and the farm's first way to buy.
  const product = productChoice || products[0] || '';
  const ways = f.how_to_buy ?? [];
  const how = howChoice || ways[0] || '';
  const dateOk = validDate(date, { notPast: true });

  const valid = product.trim() && amount.trim() && dateOk && how.trim();

  const submit = async () => {
    if (busy || !valid) return;
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
    if (error) return Alert.alert('Inquiry not sent', error.message);
    router.dismiss();
    router.push({ pathname: '/thread/[id]', params: { id: data as string } });
  };

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Txt variant="label">To {f.name}</Txt>
        <Txt muted>A short, structured request the farmer can answer in one tap.</Txt>
      </View>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">Product</Txt>
        <Row gap={6}>
          {products.map((p) => (
            <Chip key={p} label={p} selected={product === p} onPress={() => setProduct(p)} />
          ))}
        </Row>
        {!products.length ? <Field label="What are you looking for?" value={product} onChangeText={setProduct} /> : null}
      </View>

      <Field label="Amount" value={amount} onChangeText={setAmount} placeholder="For example: 2 lb, 6 jars, 10 bunches" />
      <Field label="When (year-month-day)" value={date} onChangeText={setDate} placeholder="2026-10-10" keyboardType="numbers-and-punctuation" />
      {date.trim() && !dateOk ? <Txt variant="small" muted>Enter a real date that hasn’t passed, like {nextSaturday()}.</Txt> : null}

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">How</Txt>
        <Row gap={6}>
          {ways.map((h) => (
            <Chip key={h} label={h} selected={how === h} onPress={() => setHow(h)} />
          ))}
        </Row>
        {!ways.length ? <Field label="How would you like to get it?" value={howChoice} onChangeText={setHow} placeholder="For example: pick up at the farm" /> : null}
      </View>

      <Field label="Note (optional)" value={note} onChangeText={(v) => setNote(v.slice(0, 1000))} placeholder="Anything the farmer should know" multiline />
      <Button label="Send inquiry" icon="send" onPress={submit} busy={busy} disabled={!valid} />
    </Screen>
  );
}
