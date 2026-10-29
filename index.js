import './alertPolyfill';
import { LogBox } from 'react-native';
LogBox.ignoreAllLogs(true);

import { registerRootComponent, requireOptionalNativeModule } from 'expo';

// ปิดปุ่มฟันเฟืองลอย (Expo Dev Menu Floating Action Button) ในโหมด Development
try {
  const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
  if (DevMenuPreferences && typeof DevMenuPreferences.setPreferencesAsync === 'function') {
    DevMenuPreferences.setPreferencesAsync({
      showFloatingActionButton: false,
    });
  }
} catch (e) {
  // ไม่ส่งผลกระทบต่อการทำงานปกติ
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

