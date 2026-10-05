import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Adds the settings that must not be committed: the EAS project id (needed for push notifications)
 * and the Google Maps key for Android. Set them in .env or in your EAS build environment.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: process.env.GOOGLE_MAPS_ANDROID_API_KEY ? { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } : undefined,
    },
  },
  extra: {
    ...config.extra,
    eas: { ...config.extra?.eas, ...(process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : {}) },
  },
});
