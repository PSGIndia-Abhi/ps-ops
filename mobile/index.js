/**
 * @format
 */
import 'react-native-gesture-handler'; // must be the first import (native-stack + gesture-handler requirement)

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { setupBackgroundPush } from './src/reminders-engine/push';

// Push notifications that arrive while the app is closed (Android shows them; see push.ts).
setupBackgroundPush();

AppRegistry.registerComponent(appName, () => App);
