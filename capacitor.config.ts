import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ddanez.gestorpro',
  appName: "D'Danez Gestor Pro",
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#FFFFFF",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false
    }
  }
};

export default config;
