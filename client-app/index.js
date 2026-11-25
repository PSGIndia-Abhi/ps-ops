/**
 * @format
 */
import 'react-native-gesture-handler'; // must be the first import (native-stack + gesture-handler requirement)

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Pushes that arrive while the app is closed: Android draws them itself, nothing to do here.
// A handler must still be set, or Firebase warns on every background push.
try {
  setBackgroundMessageHandler(getMessaging(), async () => {});
} catch {
  // Firebase not set up in this build (no google-services.json yet) - no pushes.
}

AppRegistry.registerComponent(appName, () => App);
