import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Read a picked or recorded file into bytes for upload to Supabase Storage. */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' || uri.startsWith('blob:') || uri.startsWith('data:')) {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

export function extensionOf(uri: string, fallback: string) {
  const match = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(uri);
  return (match?.[1] ?? fallback).toLowerCase();
}

export function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
