import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";

function AuthGate() {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "loading") return;

    const inAuth = segments[0] === "(auth)";
    if (state.status !== "signedIn" && !inAuth) router.replace("/(auth)/login");
    if (state.status === "signedIn" && inAuth) router.replace("/(tabs)");
  }, [state.status, segments, router]);

  return (
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" />
        </Stack>
      </SafeAreaProvider>

  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
