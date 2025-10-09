import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.privetsuper.app',
  appName: 'PrivetSuper',
  webDir: 'dist', // может остаться, но не будет использоваться
  server: {
    url: 'https://app.privetsuper.ru',
    cleartext: false
  }
};

export default config;