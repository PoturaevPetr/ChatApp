import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pepa.app",
  appName: "Pepa",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    App: {
      allowBackButtonNavigation: true,
    },
  },
};

export default config;
