import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  LayoutAnimation,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "../ui/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface TourStep {
  targetRef?: React.RefObject<View> | null;
  title: string;
  text: string;
  isMandatory?: boolean;
  checkReady?: () => string | null; // Retourne un message d'erreur si pas prêt
}

interface DemoOverlayProps {
  visible: boolean;
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  scrollViewRef?: React.RefObject<ScrollView>;
}

export function DemoOverlay({
  visible,
  steps,
  currentStep,
  onNext,
  onPrev,
  onSkip,
  scrollViewRef,
}: DemoOverlayProps) {
  const [layout, setLayout] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const step = steps[currentStep];

  const updateLayout = useCallback(() => {
    if (!step?.targetRef?.current) {
      setLayout({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }

    step.targetRef.current.measureInWindow((x, y, w, h) => {
      // On anime légèrement le changement de zone
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLayout({ x, y, w, h });

      // Si un ScrollView est fourni, on s'assure que l'élément est visible
      if (scrollViewRef?.current && y > SCREEN_HEIGHT - 200) {
          scrollViewRef.current.scrollTo({ y: y - 100, animated: true });
      }
    });
  }, [step, scrollViewRef]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(updateLayout, 300); // Laisse le temps au layout de se stabiliser
      return () => clearTimeout(timer);
    }
  }, [visible, currentStep, updateLayout]);

  if (!visible || !step) return null;

  const isGlobal = layout.w === 0;

  const handleNext = () => {
    if (step.checkReady) {
      const error = step.checkReady();
      if (error) {
        alert(error);
        return;
      }
    }
    onNext();
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.container}>
        {/* Les 4 blocs de l'overlay pour créer le "trou" */}
        {!isGlobal && (
          <>
            <View style={[styles.overlayBlock, { top: 0, left: 0, right: 0, height: layout.y }]} />
            <View style={[styles.overlayBlock, { top: layout.y, left: 0, width: layout.x, height: layout.h }]} />
            <View style={[styles.overlayBlock, { top: layout.y, left: layout.x + layout.w, right: 0, height: layout.h }]} />
            <View style={[styles.overlayBlock, { top: layout.y + layout.h, left: 0, right: 0, bottom: 0 }]} />
            
            {/* Le rectangle de focus (cliquable si besoin de manipuler l'UI réelle) */}
            <View style={[styles.focusFrame, { top: layout.y, left: layout.x, width: layout.w, height: layout.h }]} />
          </>
        )}

        {/* La bulle d'information */}
        <View style={[styles.bubble, isGlobal ? styles.bubbleCenter : { top: layout.y + layout.h + 20 }]}>
          <View style={styles.bubbleHeader}>
            <Text style={styles.stepCount}>Étape {currentStep + 1}/{steps.length}</Text>
            <Pressable onPress={onSkip} hitSlop={10}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </Pressable>
          </View>
          
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.text}>{step.text}</Text>

          <View style={styles.footer}>
            <Pressable onPress={onPrev} disabled={currentStep === 0} style={[styles.btn, currentStep === 0 && { opacity: 0 }]}>
              <Text style={styles.btnTextPrev}>Précédent</Text>
            </Pressable>
            
            <Pressable onPress={handleNext} style={styles.btnNext}>
              <Text style={styles.btnTextNext}>
                {currentStep === steps.length - 1 ? "Terminer" : "Suivant"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Hook utilitaire pour gérer l'état de la démo dans les écrans
export function useDemoTour() {
  const [tourOpen, setTourOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const handleDimissTour = () => {
    setTourOpen(false);
    setCurrentStep(0);
  };

  return { tourOpen, setTourOpen, currentStep, setCurrentStep, handleDimissTour };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  overlayBlock: { position: "absolute", backgroundColor: "rgba(0,0,0,0.7)" },
  focusFrame: { position: "absolute", borderWidth: 2, borderColor: COLORS.brand, borderRadius: RADIUS.md },
  bubble: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  bubbleCenter: { top: "35%" },
  bubbleHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  stepCount: { fontSize: 12, fontWeight: "800", color: COLORS.brand },
  title: { fontSize: 18, fontWeight: "900", color: COLORS.text, marginBottom: 8 },
  text: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 20 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  btn: { padding: 10 },
  btnNext: { backgroundColor: COLORS.brand, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.md },
  btnTextPrev: { color: COLORS.textMuted, fontWeight: "700" },
  btnTextNext: { color: "#fff", fontWeight: "900" },
});