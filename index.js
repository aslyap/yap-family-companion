import { registerRootComponent } from 'expo';
import { StreamVideoRN } from '@stream-io/video-react-native-sdk';

import App from './App';
import { getOrCreateClient } from './src/streamClient';

// Must be called before registerRootComponent.
// isExpo: false — use Firebase messaging directly (@react-native-firebase/messaging).
// getOrCreateClient reads yap_identity from AsyncStorage, so the FCM background handler
// and App.js share the same client instance and useCalls() sees the active call immediately.
StreamVideoRN.setPushConfig({
  isExpo: false,
  android: {
    pushProviderName: 'firebase',
  },
  ios: {
    pushProviderName: 'firebase',
  },
  createStreamVideoClient: getOrCreateClient,
});

registerRootComponent(App);
