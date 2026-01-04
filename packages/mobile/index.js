/**
 * @format
 */

import 'react-native-url-polyfill/auto';
import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Ignore SignalR timeout errors in dev (reconnection handles these)
LogBox.ignoreLogs([
  'Error: Connection disconnected with error',
  'Server timeout elapsed without receiving a message',
]);

AppRegistry.registerComponent(appName, () => App);
