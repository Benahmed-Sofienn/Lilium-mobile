// app/(tabs)/conges/new.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";


// ADJUST PATH: use the SAME axios client import used in app/(tabs)/conges/index.tsx
import { api } from "../../../src/api/client"; // e.g. "../../../lib/api" or whatever you already use

// ADJUST PATH: use the SAME auth hook/context you already have
import { useAuth } from "../../../src/auth/AuthContext"; // e.g. "../../../contexts/AuthContext"

type LeaveType = {
  id: number;          // we coerce it
  description: string;
};


const BRAND_GREEN = "#2E7D32";
const CARD_BG = "#FFFFFF";
const PAGE_BG = "#F3F5F7";
const TEXT_DARK = "#0F172A";
const TEXT_MUTED = "#64748B";
const BORDER = "#E2E8F0";
const ERROR = "#B91C1C";

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
    // Your axios baseURL is ".../api/auth". We derive "...:5000" and then build absolute URLs.
    const base = ((api as any)?.defaults?.baseURL || "").toString();
    const stripped = base.replace(/\/api\/auth\/?$/, "");
    // Fallback to your known dev IP if for any reason baseURL isn't set.
    return stripped || "http://10.31.45.26:5000";
  }, []);

  const absUrl = (path: string) => `${backendBase}${path.startsWith("/") ? path : `/${path}`}`;

  const [referentielsLoading, setReferentielsLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [referentielsError, setReferentielsError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<Date>(() => normalizeToLocalNoon(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => normalizeToLocalNoon(new Date()));

  const [selectedLeaveType, setSelectedLeaveType] = useState<LeaveType | null>(null);
  const [leaveTypeModalOpen, setLeaveTypeModalOpen] = useState(false);

  const [address, setAddress] = useState("");
  const [observation, setObservation] = useState("");
  const [otherTypeText, setOtherTypeText] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Date picker control
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);

  const selectedIsOther = !!selectedLeaveType && isOtherType(selectedLeaveType.description);

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

        // Keep ordering from backend; optionally sort alphabetically:
        // normalized.sort((a, b) => a.description.localeCompare(b.description, "fr"));

        setLeaveTypes(normalized);
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
  }, [backendBase]); // rebuild if base changes

  useEffect(() => {
    // If user changes away from "Autre...", clear the extra field
    if (!selectedIsOther) setOtherTypeText("");
  }, [selectedIsOther]);

  function openPicker(which: "start" | "end") {
    setActivePicker(which);
    if (Platform.OS === "ios") {
      setIosPickerVisible(true);
    }
    // On Android, DateTimePicker is rendered conditionally below
  }

  function onPickedDate(d: Date) {
    const nd = normalizeToLocalNoon(d);

    if (activePicker === "start") {
      setStartDate(nd);
      // Keep end >= start
      if (endDate < nd) setEndDate(nd);
    } else if (activePicker === "end") {
      setEndDate(nd);
    }
  }

  function validate() {
    if (!user) return "Utilisateur non connecté.";

    if (!startDate || !endDate) return "Veuillez sélectionner les dates.";
    if (startDate > endDate) return "La date de début ne peut pas être après la date de fin.";

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
      // Observation formatting per your rule:
      // "Autre type: <text>\nObservation: <existing observation>"
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
            // Navigate back to the list screen
            // Add a refresh param to help you trigger a refetch if you want in /conges/index.tsx
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

  const activeDate = activePicker === "start" ? startDate : endDate;
  const minEndDate = startDate;

  return (
    <View style={[styles.page, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* Top bar (your exact snippet, safe-area via insets) */}
      <View style={[styles.topbar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable onPress={() => router.back()} style={styles.topbarIcon}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </Pressable>

        <Text style={styles.topbarTitle}>Demande de Congé | طلب إجازة</Text>

        <View style={{ width: 34 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.headerTitle}>DEMANDE DE CONGÉ | طلب إجازة</Text>

            {/* Error banner */}
            {!!referentielsError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{referentielsError}</Text>
              </View>
            )}
            {!!formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            {/* Demandeur */}
            <Text style={styles.label}>Demandeur | صاحب الطلب</Text>
            <View style={styles.demandeurRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.demandeurName}>{fullName}</Text>
            </View>

            {/* Dates */}
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Du | من</Text>
                <Pressable
                  onPress={() => openPicker("start")}
                  style={({ pressed }) => [styles.inputLike, pressed && styles.pressed]}
                >
                  <Text style={styles.inputLikeText}>{formatDateFR(startDate)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>

              <View style={{ width: 12 }} />

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Au | إلى</Text>
                <Pressable
                  onPress={() => openPicker("end")}
                  style={({ pressed }) => [styles.inputLike, pressed && styles.pressed]}
                >
                  <Text style={styles.inputLikeText}>{formatDateFR(endDate)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
            </View>

            {/* Type de congé */}
            <Text style={styles.label}>Type de congé | نوع الإجازة</Text>

            {referentielsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>Chargement...</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setLeaveTypeModalOpen(true)}
                style={({ pressed }) => [
                  styles.selectBox,
                  pressed && styles.pressed,
                  !selectedLeaveType && styles.selectBoxPlaceholder,
                ]}
              >
                <Text
                  style={[
                    styles.selectText,
                    !selectedLeaveType ? { color: TEXT_MUTED } : { color: TEXT_DARK },
                  ]}
                  numberOfLines={1}
                >
                  {selectedLeaveType?.description || "Sélectionnez le type du congé"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={TEXT_MUTED} />
              </Pressable>
            )}

            {/* Autre type (conditional) */}
            {selectedIsOther && (
              <>
                <Text style={styles.label}>Autre type | نوع آخر</Text>
                <TextInput
                  value={otherTypeText}
                  onChangeText={setOtherTypeText}
                  placeholder="Veuillez préciser..."
                  placeholderTextColor={TEXT_MUTED}
                  style={styles.input}
                />
              </>
            )}

            {/* Motif/Observation */}
            <Text style={styles.label}>Observation | ملاحظات</Text>
            <TextInput
              value={observation}
              onChangeText={setObservation}
              placeholder="Raison ou détails supplémentaires..."
              placeholderTextColor={TEXT_MUTED}
              style={[styles.input, styles.textarea]}
              multiline
              textAlignVertical="top"
            />

            {/* Adresse */}
            <Text style={styles.label}>Adresse | العنوان</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Adresse pendant le congé..."
              placeholderTextColor={TEXT_MUTED}
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
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.submitText}>Envoi...</Text>
                </View>
              ) : (
                <Text style={styles.submitText}>VALIDER LA DEMANDE</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Leave types modal */}
      <Modal visible={leaveTypeModalOpen} transparent animationType="fade" onRequestClose={() => setLeaveTypeModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLeaveTypeModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionnez le type du congé</Text>
              <Pressable onPress={() => setLeaveTypeModalOpen(false)} style={styles.modalClose}>
                <Ionicons name="close" size={20} color={TEXT_DARK} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingVertical: 6 }}>
              {leaveTypes.map((lt) => {
                const selected = selectedLeaveType?.id === lt.id;
                return (
                  <Pressable
                    key={lt.id}
                    onPress={() => {
                      setSelectedLeaveType(lt);
                      setLeaveTypeModalOpen(false);
                      setFormError(null);
                    }}
                    style={({ pressed }) => [
                      styles.modalItem,
                      pressed && styles.modalItemPressed,
                      selected && styles.modalItemSelected,
                    ]}
                  >
                    <Text style={[styles.modalItemText, selected && styles.modalItemTextSelected]}>
                      {lt.description}
                    </Text>
                  </Pressable>
                );
              })}

              {leaveTypes.length === 0 && !referentielsLoading && (
                <View style={{ padding: 12 }}>
                  <Text style={{ color: TEXT_MUTED }}>Aucun type de congé disponible.</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date pickers */}
      {Platform.OS === "android" && activePicker && (
        <DateTimePicker
          value={activeDate}
          mode="date"
          display="default"
          minimumDate={activePicker === "end" ? minEndDate : undefined}
          onChange={(event, date) => {
            // On Android, event.type can be "dismissed" or "set"
            if (event.type === "dismissed") {
              setActivePicker(null);
              return;
            }
            if (date) onPickedDate(date);
            setActivePicker(null);
          }}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={iosPickerVisible} transparent animationType="slide" onRequestClose={() => setIosPickerVisible(false)}>
          <View style={styles.iosPickerBackdrop}>
            <View style={styles.iosPickerCard}>
              <View style={styles.iosPickerHeader}>
                <Text style={styles.iosPickerTitle}>
                  {activePicker === "start" ? "Du | من" : "Au | إلى"}
                </Text>
                <Pressable
                  onPress={() => {
                    setIosPickerVisible(false);
                    setActivePicker(null);
                  }}
                  style={styles.iosPickerDone}
                >
                  <Text style={styles.iosPickerDoneText}>OK</Text>
                </Pressable>
              </View>

              <DateTimePicker
                value={activeDate}
                mode="date"
                display="spinner"
                minimumDate={activePicker === "end" ? minEndDate : undefined}
                onChange={(_, date) => {
                  if (date) onPickedDate(date);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },

  topbar: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  topbarIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topbarTitle: {
    flex: 1,
    textAlign: "center",
    color: TEXT_DARK,
    fontWeight: "700",
    fontSize: 15,
  },

  scrollContent: {
    padding: 14,
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },

  headerTitle: {
    color: BRAND_GREEN,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },

  label: {
    marginTop: 12,
    marginBottom: 6,
    color: TEXT_DARK,
    fontWeight: "700",
    fontSize: 13,
  },

  demandeurRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    color: BRAND_GREEN,
    fontWeight: "800",
  },
  demandeurName: {
    color: TEXT_DARK,
    fontWeight: "700",
  },

  row2: {
    flexDirection: "row",
    alignItems: "center",
  },

  inputLike: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  inputLikeText: {
    color: TEXT_DARK,
    fontWeight: "600",
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    color: TEXT_DARK,
    fontWeight: "600",
  },
  textarea: {
    minHeight: 110,
  },

  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BRAND_GREEN,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  selectBoxPlaceholder: {
    borderColor: BORDER,
  },
  selectText: {
    flex: 1,
    marginRight: 10,
    fontWeight: "600",
  },

  pressed: {
    opacity: 0.85,
  },

  submitBtn: {
    marginTop: 16,
    backgroundColor: BRAND_GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnPressed: {
    opacity: 0.9,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  loadingText: {
    color: TEXT_MUTED,
    fontWeight: "600",
  },

  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  errorText: {
    color: ERROR,
    fontWeight: "700",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 14,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "#0B1220",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0B1220",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  modalItemPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalItemSelected: {
    backgroundColor: "rgba(46,125,50,0.25)",
  },
  modalItemText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  modalItemTextSelected: {
    fontWeight: "900",
  },

  iosPickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  iosPickerCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
    overflow: "hidden",
  },
  iosPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  iosPickerTitle: {
    color: TEXT_DARK,
    fontWeight: "800",
  },
  iosPickerDone: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  iosPickerDoneText: {
    color: TEXT_DARK,
    fontWeight: "800",
  },
});
