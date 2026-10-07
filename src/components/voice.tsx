import { Icon as Ionicons } from '@/components/icon';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { extensionOf, randomId, readBytes } from '@/lib/files';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

const MAX_SECONDS = 120;

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Hold-free voice notes: tap to record, tap again to send. Recordings go to the private
 * "voice-notes" bucket under the thread's folder, then the transcribe function adds a transcript.
 */
export function VoiceRecorder({ conversationId, userId, onSent }: { conversationId: string; userId: string; onSent?: () => void }) {
  const { colors, t } = useSettings();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seconds = state.durationMillis / 1000;

  const starting = useRef(false);
  const stopping = useRef(false);
  const startedAt = useRef(0);
  const start = async () => {
    if (starting.current || state.isRecording) return; // ignore a double tap
    starting.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return showAlert(t('m_micOff'), t('m_allowMic'));
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = new Date().getTime();
      // Stop and send automatically at the time limit.
      limitTimer.current = setTimeout(() => stop(true), MAX_SECONDS * 1000);
    } catch {
      showAlert(t('m_recordingNotStarted'), t('m_micBusy'));
    } finally {
      starting.current = false;
    }
  };

  const stop = async (send: boolean) => {
    if (stopping.current) return; // Send tapped twice, or tapped as the time limit hit
    stopping.current = true;
    if (limitTimer.current) clearTimeout(limitTimer.current);
    limitTimer.current = null;
    // The web recorder only updates currentTime on pause, so measure the length ourselves too.
    const length = Math.max(recorder.currentTime, (new Date().getTime() - startedAt.current) / 1000);
    try {
      await recorder.stop();
    } finally {
      stopping.current = false;
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!send || !uri) return;
    if (length < 1) return showAlert(t('m_tooShort'), t('m_holdLonger'));
    setBusy(true);
    try {
      // Browsers record webm (the address is a blob: URL with no extension); phones record m4a.
      const ext = Platform.OS === 'web' ? 'webm' : extensionOf(uri, 'm4a');
      const path = `${conversationId}/${randomId()}.${ext}`;
      const bytes = await readBytes(uri);
      const up = await supabase.storage.from('voice-notes').upload(path, bytes, { contentType: ext === 'webm' ? 'audio/webm' : 'audio/mp4' });
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: userId, kind: 'voice', audio_path: path, body: '' })
        .select('id')
        .single();
      if (error) throw error;
      // The transcript arrives a few seconds later through the live thread.
      supabase.functions.invoke('transcribe', { body: { message_id: data.id } }).catch(() => {});
      onSent?.();
    } catch (e) {
      showAlert(t('m_voiceNotSent'), e instanceof Error ? e.message : t('m_tryAgainDot'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(
    () => () => {
      if (limitTimer.current) clearTimeout(limitTimer.current);
    },
    [],
  );

  if (state.isRecording) {
    return (
      <View style={[styles.recording, { borderColor: colors.danger, backgroundColor: colors.surface }]} accessibilityLiveRegion="polite">
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <Txt variant="mono" style={{ flex: 1 }} accessibilityLabel={Math.round(seconds) === 1 ? t('m_recordingOneSecond') : t('m_recordingSeconds', { n: Math.round(seconds) })}>
          {clock(seconds)} / {clock(MAX_SECONDS)}
        </Txt>
        <Pressable onPress={() => stop(false)} accessibilityRole="button" accessibilityLabel={t('cancel')} hitSlop={8} style={styles.pill}>
          <Txt variant="smallBold" muted>
            {t('cancel')}
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => stop(true)}
          accessibilityRole="button"
          accessibilityLabel={t('stopAndSend')}
          style={[styles.round, { backgroundColor: colors.leaf }]}>
          <Ionicons name="send" size={18} color={colors.onLeaf} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={start}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={t('recordVoice')}
      accessibilityState={{ busy }}
      style={[styles.round, { backgroundColor: colors.sunk, opacity: busy ? 0.5 : 1 }]}>
      <Ionicons name={busy ? 'cloud-upload-outline' : 'mic-outline'} size={22} color={colors.text} />
    </Pressable>
  );
}

/** Plays a voice note from the private bucket through a short-lived signed link. */
export function VoicePlayer({ path, tint }: { path: string; tint: string }) {
  const { t } = useSettings();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    let active = true;
    supabase.storage
      .from('voice-notes')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);

  const toggle = async () => {
    if (status.playing) return player.pause();
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.2)) await player.seekTo(0);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    player.play();
  };

  if (failed) return <Txt variant="small" color={tint}>{t('m_recordingUnavailable')}</Txt>;

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <Pressable
      onPress={toggle}
      disabled={!url || !status.isLoaded}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? t('m_pauseVoice') : t('m_playVoice', { length: clock(status.duration) })}
      style={styles.player}>
      <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={tint} />
      <View style={[styles.track, { borderColor: tint }]}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
      </View>
      <Txt variant="mono" color={tint} style={{ fontSize: 11 }}>
        {clock(status.playing ? status.currentTime : status.duration)}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm, borderWidth: 1, borderRadius: 22, paddingLeft: 14, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pill: { paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  player: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 44, minWidth: 180 },
  track: { flex: 1, height: 6, borderRadius: 3, borderWidth: 1, overflow: 'hidden', opacity: 0.8 },
  fill: { height: '100%' },
});
