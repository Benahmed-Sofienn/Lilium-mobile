import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { djangoApi } from "../../src/api/client";

type RequestResp = { ok: boolean; masked_email?: string | null };
type VerifyResp = { ok: boolean; valid: boolean };
type ResetResp = { ok: boolean; errors?: string[] };

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);

  const [username, setUsername] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const codeRef = useRef<TextInput>(null);
  const newPassRef = useRef<TextInput>(null);
  const confirmPassRef = useRef<TextInput>(null);

  const BRAND_GREEN = "#2FA84F";

  const canRequest = useMemo(() => !busy && username.trim().length > 0, [busy, username]);

  const canReset = useMemo(() => {
    return (
      !busy &&
      username.trim().length > 0 &&
      code.trim().length > 0 &&
      newPassword.length >= 8 &&
      confirmPassword.length >= 8
    );
  }, [busy, username, code, newPassword, confirmPassword]);

  const requestCode = async () => {
    try {
      setBusy(true);
      setMaskedEmail(null);

      const res = await djangoApi.post<RequestResp>(
        "/accounts/api/app/forgot-password/request",
        { username: username.trim() }
      );

      const m = res.data?.masked_email ?? null;

      // Your rule:
      // If masked_email is null, show admin-contact error and stay on step 1
      if (!m || typeof m !== "string" || m.trim().length === 0) {
        Alert.alert("Erreur", "Un problème est survenu , contactez l administration");
        return;
      }

      setMaskedEmail(m);
      setStep(2);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e: any) {
      Alert.alert(
        "Erreur",
        e?.response?.data?.detail || e?.message || "Erreur inconnue"
      );
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    try {
      if (newPassword !== confirmPassword) {
        Alert.alert("Erreur", "Les mots de passe ne correspondent pas.");
        return;
      }

      setBusy(true);

      // Optional verify step (better UX)
      const v = await djangoApi.post<VerifyResp>(
        "/accounts/api/app/forgot-password/verify",
        { username: username.trim(), code: code.trim() }
      );

      if (!v.data?.valid) {
        Alert.alert("Erreur", "Code invalide ou expiré.");
        return;
      }

      const r = await djangoApi.post<ResetResp>(
        "/accounts/api/app/forgot-password/reset",
        {
          username: username.trim(),
          code: code.trim(),
          new_password: newPassword,
          confirm_password: confirmPassword,
        }
      );

      if (r.data?.ok) {
        Alert.alert(
          "Succès",
          "Votre mot de passe a été changé. Vous pouvez vous connecter."
        );
        router.replace("/(auth)/login");
      } else {
        Alert.alert(
          "Erreur",
          (r.data?.errors && r.data.errors.join("\n")) ||
            "Impossible de changer le mot de passe."
        );
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.errors?.join?.("\n") ||
        e?.response?.data?.detail ||
        e?.message ||
        "Erreur inconnue";
      Alert.alert("Erreur", msg);
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
          <Text style={styles.title}>Forgot password</Text>
          <Text style={styles.subtitle}>Réinitialiser | إعادة تعيين كلمة السر</Text>
        </View>

        <View style={styles.card}>
          {step === 1 ? (
            <>
              <Text style={styles.label}>Username | اسم المستخدم</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Enter your username"
                placeholderTextColor="#9AA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={requestCode}
                style={styles.input}
              />

              <Text style={styles.helper}>
                Entrez votre nom d’utilisateur. Un code sera envoyé par WhatsApp.
              </Text>

              <Pressable
                onPress={requestCode}
                disabled={!canRequest}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: BRAND_GREEN },
                  !canRequest && styles.buttonDisabled,
                  pressed && canRequest && styles.buttonPressed,
                ]}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Send code</Text>}
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.linkText}>Back to login</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.infoText}>
                Vous allez recevoir un message WhatsApp au{" "}
                <Text style={styles.infoStrong}>{maskedEmail}</Text>.
              </Text>

              <Text style={[styles.label, { marginTop: 12 }]}>Code</Text>
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={setCode}
                placeholder="Enter code"
                placeholderTextColor="#9AA3AF"
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => newPassRef.current?.focus()}
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>New password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  ref={newPassRef}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  placeholderTextColor="#9AA3AF"
                  secureTextEntry={!showNew}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPassRef.current?.focus()}
                  style={[styles.input, { paddingRight: 44 }]}
                />
                <Pressable onPress={() => setShowNew((v) => !v)} style={styles.eyeBtn} hitSlop={10}>
                  <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </Pressable>
              </View>

              <Text style={[styles.label, { marginTop: 12 }]}>Confirm password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  ref={confirmPassRef}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor="#9AA3AF"
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={resetPassword}
                  style={[styles.input, { paddingRight: 44 }]}
                />
                <Pressable onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn} hitSlop={10}>
                  <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </Pressable>
              </View>

              <Pressable
                onPress={resetPassword}
                disabled={!canReset}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: BRAND_GREEN },
                  !canReset && styles.buttonDisabled,
                  pressed && canReset && styles.buttonPressed,
                ]}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Reset password</Text>}
              </Pressable>

              <Pressable
                onPress={() => setStep(1)}
                style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.linkText}>Change username</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FA" },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 18 },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 6 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  label: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 8 },
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

  helper: { marginTop: 10, fontSize: 12, color: "#64748B" },

  infoText: { fontSize: 13, color: "#334155", lineHeight: 18 },
  infoStrong: { fontWeight: "800", color: "#0F172A" },

  passwordWrap: { position: "relative", justifyContent: "center" },
  eyeBtn: {
    position: "absolute",
    right: 12,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  button: { marginTop: 16, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.9 },

  linkBtn: { alignSelf: "center", marginTop: 12, paddingVertical: 6 },
  linkText: { fontSize: 13, fontWeight: "700", color: "#334155" },
});
