/** @type {import("expo/config").ExpoConfig} */
const config = {
  name: "Fretai",
  slug: "fretai",
  owner: "fretaifretado",
  scheme: "fretai",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "br.com.fretai.app",
    supportsTablet: true,
    infoPlist: { UIBackgroundModes: ["location", "remote-notification"] },
  },
  android: {
    package: "br.com.fretai.app",
    adaptiveIcon: {
      backgroundColor: "#0d1b2a",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
    predictiveBackGestureEnabled: false,
  },
  web: { bundler: "metro", favicon: "./assets/favicon.png" },
  plugins: [
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#0d1b2a",
      },
    ],
    "expo-secure-store",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "A Fretai usa sua localização para mostrar o trajeto e acompanhar a viagem.",
        locationAlwaysAndWhenInUsePermission:
          "A Fretai usa sua localização durante a rota, inclusive com o app em segundo plano.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ["expo-notifications", { color: "#2388f4", defaultChannel: "viagens" }],
  ],
  extra: {
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ?? "https://fretaiserver.onrender.com",
    eas: {
      projectId: "cbf89d37-3524-4ead-b45f-4f3e31fc560b",
    },
  },
};

module.exports = config;
