import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";

type Step = "USERNAME" | "PHONE" | "OTP_RESET";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL || "") +
  (process.env.EXPO_PUBLIC_API_PREFIX || "");

async function postJSON(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const BRAND_GREEN = "#2FA84F";

  const [step, setStep] = useState<Step>("USERNAME");
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");

  const [phone, setPhone] = useState(""); // full phone input (E.164 ideally)
  const [otp, setOtp] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const canStart = useMemo(() => username.trim().length > 0 && !busy, [username, busy]);
  const canConfirmPhone = useMemo(() => phone.trim().length >= 8 && !!challengeId && !busy, [phone, challengeId, busy]);
  const canVerifyOtp = useMemo(() => otp.trim().length >= 4 && !!challengeId && !busy, [otp, challengeId, busy]);
  const canReset =
    useMemo(() => !busy && newPassword.length >= 6 && newPassword === confirmPassword, [busy, newPassword, confirmPassword]);

  const start = async () => {
    try {
      setBusy(true);
      // You implement this endpoint in backend:
      // POST /auth/forgot/start  { username }
      const data = await postJSON("/auth/forgot/start", { username: username.trim() });

      // Expected: { challengeId, maskedPhone }
      setChallengeId(data.challengeId);
      setMaskedPhone(data.maskedPhone);

      setStep("PHONE");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmPhoneAndSendOtp = async () => {
    try {
      setBusy(true);
      // POST /auth/forgot/confirm-phone { challengeId, phone }
      // This should validate phone == DB phone and then send OTP via WhatsApp
      await postJSON("/auth/forgot/confirm-phone", {
        challengeId,
        phone: phone.trim(),
      });

      Alert.alert("Code sent", "We sent a verification code to your WhatsApp.");
      setStep("OTP_RESET");
    } catch (e: any) {
      // Keep errors generic to avoid leaking info
      Alert.alert("Verification failed", "Could not verify your phone number.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtpAndReset = async () => {
    try {
      setBusy(true);

      // 1) verify otp -> get resetToken
      const v = await postJSON("/auth/forgot/verify-otp", { challengeId, otp: otp.trim() });

      const resetToken = v.resetToken;
      if (!resetToken) throw new Error("Missing reset token");

      // 2) reset password
      await postJSON("/auth/forgot/reset", { resetToken, newPassword });

      Alert.alert("Done", "Your password has been reset. You can log in now.");
      router.replace("/(auth)/login");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Forgot password | نسيت كلمة السر</Text>
        <Text style={styles.subtitle}>
          Verify your account, then set a new password.
        </Text>

        {step === "USERNAME" && (
          <>
            <Text style={styles.label}>Username | اسم المستخدم</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="Enter your username"
              placeholderTextColor="#9AA3AF"
              style={styles.input}
            />

            <Pressable
              onPress={start}
              disabled={!canStart}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: BRAND_GREEN },
                !canStart && { opacity: 0.5 },
                pressed && canStart && { opacity: 0.9 },
              ]}
            >
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Continue</Text>}
            </Pressable>
          </>
        )}

        {step === "PHONE" && (
          <>
            <Text style={styles.label}>Confirm your phone | تأكيد رقم الهاتف</Text>
            <Text style={styles.muted}>
              Number on file: <Text style={styles.mutedStrong}>{maskedPhone}</Text>
            </Text>

            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter full number (e.g. +213XXXXXXXXX)"
              placeholderTextColor="#9AA3AF"
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"}
              style={styles.input}
            />

            <Pressable
              onPress={confirmPhoneAndSendOtp}
              disabled={!canConfirmPhone}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: BRAND_GREEN },
                !canConfirmPhone && { opacity: 0.5 },
                pressed && canConfirmPhone && { opacity: 0.9 },
              ]}
            >
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Send code on WhatsApp</Text>}
            </Pressable>

            <Pressable onPress={() => setStep("USERNAME")} style={styles.linkBtn}>
              <Text style={[styles.link, { color: BRAND_GREEN }]}>Change username</Text>
            </Pressable>
          </>
        )}

        {step === "OTP_RESET" && (
          <>
            <Text style={styles.label}>OTP code | رمز التحقق</Text>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter the code"
              placeholderTextColor="#9AA3AF"
              keyboardType="number-pad"
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: 10 }]}>New password | كلمة سر جديدة</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor="#9AA3AF"
              secureTextEntry
              style={styles.input}
            />

            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor="#9AA3AF"
              secureTextEntry
              style={[styles.input, { marginTop: 10 }]}
            />

            <Pressable
              onPress={verifyOtpAndReset}
              disabled={!canVerifyOtp || !canReset}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: BRAND_GREEN },
                (!canVerifyOtp || !canReset) && { opacity: 0.5 },
                pressed && canVerifyOtp && canReset && { opacity: 0.9 },
              ]}
            >
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Reset password</Text>}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FA", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#FFF", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#E5E7EB" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 8, fontSize: 13, color: "#64748B" },
  label: { marginTop: 14, marginBottom: 8, fontSize: 13, fontWeight: "700", color: "#334155" },
  input: {
    borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FAFAFB", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: "#0F172A",
  },
  muted: { marginBottom: 10, fontSize: 13, color: "#64748B" },
  mutedStrong: { fontWeight: "800", color: "#0F172A" },
  button: { marginTop: 16, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  buttonText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  linkBtn: { marginTop: 10, alignSelf: "flex-end", paddingVertical: 4 },
  link: { fontSize: 13, fontWeight: "700" },
  backBtn: { marginTop: 16, alignSelf: "center", paddingVertical: 8 },
  backText: { fontSize: 13, fontWeight: "700", color: "#334155" },
});
