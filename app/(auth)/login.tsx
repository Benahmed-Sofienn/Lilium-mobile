import React, { useEffect, useMemo, useState, useRef } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";

export default function LoginScreen() {
  const { login, state } = useAuth();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);


  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Brand token (adjust once to perfectly match the logo green)
  const BRAND_GREEN = "#2FA84F";

  const canSubmit = useMemo(() => {
    return (
      !busy &&
      state.status !== "loading" &&
      username.trim().length > 0 &&
      password.length > 0
    );
  }, [busy, state.status, username, password]);

  // Auto-leave login when auth is ready
  useEffect(() => {
    if (state.status === "signedIn") router.replace("/(tabs)");
  }, [state.status, router]);

  const submit = async () => {
    try {
      setBusy(true);
      await login(username.trim(), password);
      // Navigation is handled by the useEffect once state becomes signedIn.
    } catch (e: any) {
      Alert.alert(
        "Login failed",
        e?.response?.data?.message || e?.message || "Unknown error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
  <Pressable onPress={Keyboard.dismiss} style={styles.screen}>
    <KeyboardAwareScrollView
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      extraScrollHeight={16}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/LiliumLogo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Username | اسم المستخدم</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Enter your username"
          placeholderTextColor="#9AA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Password | كلمة السر</Text>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor="#9AA3AF"
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={submit}
          style={styles.input}
        />

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: BRAND_GREEN },
            !canSubmit && styles.buttonDisabled,
            pressed && canSubmit && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  </Pressable>
);

}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
  },
  logo: {
    width: 150,
    height: 90,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 6,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
      android: {
        elevation: 3,
      },
    }),
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  scrollContent: {
  flexGrow: 1,
  paddingHorizontal: 20,
  justifyContent: "center",
},
  button: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.9,
  },

  debug: {
    marginTop: 12,
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
  },
});
