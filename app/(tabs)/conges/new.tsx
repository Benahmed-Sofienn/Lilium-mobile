// app/(tabs)/conges/new.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect } from "../../../src/components/AppSelect";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";

import { COLORS, SPACING, TYPO, RADIUS, FIELD } from "../../../src/ui/theme";

type LeaveType = {
  id: number;
  description: string;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDateFR(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Normalize selected date to LOCAL NOON to reduce off-by-one issues across timezones
function normalizeToLocalNoon(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function stripDiacritics(s: string) {
  // Safe for RN/Hermes: remove combining marks
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isOtherType(description: string) {
  const norm = stripDiacritics(description).toLowerCase().trim();
  return norm === "autre a preciser" || norm === "autre a préciser";
}

export default function NewCongeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const user = state?.user ?? null;

  const backendBase = useMemo(() => {
    const base = ((api as any)?.defaults?.baseURL || "").toString();
    const stripped = base.replace(/\/api(?:\/auth)?\/?$/, "");
    return stripped || process.env.EXPO_PUBLIC_API_URL || "http://10.44.57.26:5000";
  }, []);

  const absUrl = (path: string) =>
    `${backendBase}${path.startsWith("/") ? path : `/${path}`}`;

  const [referentielsLoading, setReferentielsLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [referentielsError, setReferentielsError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<Date>(() => normalizeToLocalNoon(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => normalizeToLocalNoon(new Date()));
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);

  const [selectedLeaveType, setSelectedLeaveType] = useState<LeaveType | null>(null);
  const [otherTypeText, setOtherTypeText] = useState("");
  const [observation, setObservation] = useState("");
  const [address, setAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedIsOther = !!selectedLeaveType && isOtherType(selectedLeaveType.description);

  const leaveTypeOptions = useMemo(
    () =>
      leaveTypes.map((lt) => ({
        id: lt.id,
        label: lt.description,
        keywords: stripDiacritics(lt.description).toLowerCase(),
      })),
    [leaveTypes]
  );

  useEffect(() => {
    let mounted = true;

    async function loadReferentiels() {
      setReferentielsLoading(true);
      setReferentielsError(null);

      try {
        const { data } = await api.get(absUrl("/api/conges-absences/referentiels"));
        const raw = Array.isArray(data?.leaveTypes) ? data.leaveTypes : [];

        const normalized: LeaveType[] = raw
          .map((x: any) => {
            const idNum = Number(x?.id);
            const desc = typeof x?.description === "string" ? x.description : "";
            if (!Number.isFinite(idNum) || !desc) return null;
            return { id: idNum, description: desc };
          })
          .filter(Boolean) as LeaveType[];

        if (mounted) setLeaveTypes(normalized);
      } catch (e: any) {
        if (mounted) {
          setReferentielsError(
            e?.response?.data?.error ||
              e?.message ||
              "Impossible de charger les référentiels. Vérifiez la connexion."
          );
        }
      } finally {
        if (mounted) setReferentielsLoading(false);
      }
    }

    loadReferentiels();
    return () => {
      mounted = false;
    };
  }, [backendBase]);

  useEffect(() => {
    if (!selectedIsOther) setOtherTypeText("");
  }, [selectedIsOther]);

  const initials = useMemo(() => {
    const fn = (user?.first_name || "").trim();
    const ln = (user?.last_name || "").trim();
    const a = fn ? fn[0] : "";
    const b = ln ? ln[0] : "";
    return (a + b).toUpperCase() || "U";
  }, [user?.first_name, user?.last_name]);

  const fullName = useMemo(() => {
    const fn = (user?.first_name || "").trim();
    const ln = (user?.last_name || "").trim();
    const name = `${fn} ${ln}`.trim();
    return name || user?.username || "Utilisateur";
  }, [user?.first_name, user?.last_name, user?.username]);

  const todayNoon = useMemo(() => normalizeToLocalNoon(new Date()), []);
  const activeDate = activePicker === "start" ? startDate : endDate;

  const minStartDate = todayNoon;
  // End date must be >= start date AND >= today
  const minEndDate = startDate > todayNoon ? startDate : todayNoon;

  function openPicker(which: "start" | "end") {
    setActivePicker(which);
  }

  function onPickedDate(d: Date) {
    const nd = normalizeToLocalNoon(d);

    if (activePicker === "start") {
      const clamped = nd < minStartDate ? minStartDate : nd;
      setStartDate(clamped);

      // Keep end >= start and >= today
      if (endDate < clamped) setEndDate(clamped);
      if (endDate < todayNoon) setEndDate(todayNoon);
    } else if (activePicker === "end") {
      const clamped = nd < minEndDate ? minEndDate : nd;
      setEndDate(clamped);
    }
  }

  function validate() {
    if (!user) return "Utilisateur non connecté.";

    if (!startDate || !endDate) return "Veuillez sélectionner les dates.";
    if (startDate > endDate) return "La date de début ne peut pas être après la date de fin.";

    if (startDate < todayNoon) return "La date de début ne peut pas être antérieure à aujourd’hui.";
    if (endDate < todayNoon) return "La date de fin ne peut pas être antérieure à aujourd’hui.";

    if (!selectedLeaveType) return "Veuillez sélectionner le type du congé.";

    if (selectedIsOther && otherTypeText.trim().length === 0) {
      return "Veuillez préciser le type (Autre).";
    }

    return null;
  }

  async function submit() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const finalObservation = selectedIsOther
        ? `Autre type: ${otherTypeText.trim()}\nObservation: ${observation.trim()}`
        : observation.trim();

      const payload = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        leaveTypeId: selectedLeaveType!.id,
        address: address.trim() || undefined,
        observation: finalObservation || undefined,
      };

      await api.post(absUrl("/api/conges-absences/leave"), payload);

      Alert.alert("Succès", "Votre demande de congé a été envoyée.", [
        {
          text: "OK",
          onPress: () => {
            router.replace({ pathname: "/conges", params: { refresh: String(Date.now()) } });
          },
        },
      ]);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Erreur lors de l’envoi de la demande.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.page}>
      <AppHeader title="Demande de congé" titleAr="طلب إجازة" onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, SPACING.xl) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <AppCard>
            {/* Errors */}
            {!!referentielsError && (
              <View style={styles.bannerDanger}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
                <Text style={styles.bannerDangerText}>{referentielsError}</Text>
              </View>
            )}
            {!!formError && (
              <View style={styles.bannerDanger}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
                <Text style={styles.bannerDangerText}>{formError}</Text>
              </View>
            )}

            {/* Demandeur */}
            <Text style={styles.label}>Demandeur | صاحب الطلب</Text>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.userName}>{fullName}</Text>
            </View>

            {/* Dates */}
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Du | من</Text>
                <Pressable
                  onPress={() => openPicker("start")}
                  style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
                >
                  <Text style={styles.fieldText}>{formatDateFR(startDate)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                </Pressable>
              </View>

              <View style={{ width: SPACING.md }} />

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Au | إلى</Text>
                <Pressable
                  onPress={() => openPicker("end")}
                  style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
                >
                  <Text style={styles.fieldText}>{formatDateFR(endDate)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                </Pressable>
              </View>
            </View>

            {/* Type de congé */}
            <View style={{ marginTop: SPACING.sm }}>
              <AppSelect
                title="Type de congé"
                titleAr="نوع الإجازة"
                value={selectedLeaveType?.id ?? null}
                options={leaveTypeOptions}
                disabled={referentielsLoading}
                placeholder={
                  referentielsLoading
                    ? "Chargement..."
                    : "Sélectionner le type du congé | اختر نوع الإجازة"
                }
                searchPlaceholder="Rechercher... | بحث..."
                allowClear
                onChange={(id) => {
                  const picked = leaveTypes.find((x) => String(x.id) === String(id)) || null;
                  setSelectedLeaveType(picked);
                  setFormError(null);
                }}
              />
            </View>

            {/* Autre type */}
            {selectedIsOther && (
              <>
                <Text style={styles.label}>Autre type | نوع آخر</Text>
                <TextInput
                  value={otherTypeText}
                  onChangeText={setOtherTypeText}
                  placeholder="Veuillez préciser... | الرجاء التوضيح..."
                  placeholderTextColor={FIELD.placeholder}
                  style={styles.input}
                />
              </>
            )}

            {/* Observation */}
            <Text style={styles.label}>Observation | ملاحظات</Text>
            <TextInput
              value={observation}
              onChangeText={setObservation}
              placeholder="Raison ou détails supplémentaires... | السبب أو تفاصيل إضافية..."
              placeholderTextColor={FIELD.placeholder}
              style={[styles.input, styles.textarea]}
              multiline
              textAlignVertical="top"
            />

            {/* Adresse */}
            <Text style={styles.label}>Adresse | العنوان</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Adresse pendant le congé... | العنوان أثناء الإجازة..."
              placeholderTextColor={FIELD.placeholder}
              style={styles.input}
            />

            {/* Submit */}
            <Pressable
              onPress={submit}
              disabled={submitting || referentielsLoading}
              style={({ pressed }) => [
                styles.submitBtn,
                (submitting || referentielsLoading) && styles.submitBtnDisabled,
                pressed && !submitting && !referentielsLoading && styles.submitBtnPressed,
              ]}
            >
              {submitting ? (
                <View style={styles.submitInner}>
                  <ActivityIndicator color={COLORS.textOnBrand} />
                  <Text style={styles.submitText}>Envoi... | جارٍ الإرسال...</Text>
                </View>
              ) : (
                <Text style={styles.submitText}>VALIDER LA DEMANDE | تأكيد الطلب</Text>
              )}
            </Pressable>
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Android Date picker */}
      {Platform.OS === "android" && activePicker && (
        <DateTimePicker
          value={activeDate}
          mode="date"
          display="default"
          minimumDate={activePicker === "start" ? minStartDate : minEndDate}
          onChange={(event, date) => {
            if (event.type === "dismissed") {
              setActivePicker(null);
              return;
            }
            if (date) onPickedDate(date);
            setActivePicker(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  scrollContent: {
    padding: SPACING.lg,
  },

  label: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    color: COLORS.text,
    fontWeight: "800",
    fontSize: TYPO.small,
  },

  bannerDanger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(220,38,38,0.08)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  bannerDangerText: {
    flex: 1,
    color: COLORS.danger,
    fontWeight: "800",
    fontSize: TYPO.small,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: FIELD.height,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: FIELD.radius,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardAlt,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  avatarText: {
    color: COLORS.brandDark,
    fontWeight: "900",
  },
  userName: {
    color: COLORS.text,
    fontWeight: "800",
  },

  row2: {
    flexDirection: "row",
    alignItems: "center",
  },

  field: {
    height: FIELD.height,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: FIELD.radius,
    paddingHorizontal: SPACING.md,
    backgroundColor: FIELD.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldPressed: {
    opacity: 0.92,
  },
  fieldText: {
    color: COLORS.text,
    fontWeight: "700",
  },

  input: {
    minHeight: FIELD.height,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: FIELD.radius,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: FIELD.bg,
    color: FIELD.text,
    fontWeight: "700",
  },
  textarea: {
    minHeight: 120,
  },

  submitBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnPressed: {
    opacity: 0.92,
  },
  submitText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
