// src/components/ZoomableImage.tsx
import React, { useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
  State,
} from "react-native-gesture-handler";
import { COLORS, RADIUS } from "../ui/theme";

type Props = {
  uri: string;
  height?: number;
  borderRadius?: number;
};

export function ZoomableImage({ uri, height = 260, borderRadius = RADIUS.md }: Props) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = useMemo(() => Animated.multiply(baseScale, pinchScale), [baseScale, pinchScale]);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastOffset = useRef({ x: 0, y: 0 });

  const [isZoomed, setIsZoomed] = useState(false);

  const onPinchEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: pinchScale } }], {
        useNativeDriver: true,
      }),
    [pinchScale]
  );

  const onPanEvent = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
        { useNativeDriver: true }
      ),
    [translateX, translateY]
  );

  const resetTransforms = () => {
    lastScale.current = 1;
    lastOffset.current = { x: 0, y: 0 };

    baseScale.setValue(1);
    pinchScale.setValue(1);

    translateX.setOffset(0);
    translateX.setValue(0);
    translateY.setOffset(0);
    translateY.setValue(0);

    setIsZoomed(false);
  };

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const onPinchStateChange = (e: any) => {
    if (e?.nativeEvent?.oldState === State.ACTIVE) {
      const next = clamp(lastScale.current * (e.nativeEvent.scale ?? 1), 1, 4);
      lastScale.current = next;

      baseScale.setValue(next);
      pinchScale.setValue(1);

      const zoomed = next > 1.01;
      setIsZoomed(zoomed);

      // If user zooms back to ~1, reset panning too
      if (!zoomed) resetTransforms();
    }
  };

  const onPanStateChange = (e: any) => {
    if (e?.nativeEvent?.oldState === State.ACTIVE) {
      lastOffset.current = {
        x: lastOffset.current.x + (e.nativeEvent.translationX ?? 0),
        y: lastOffset.current.y + (e.nativeEvent.translationY ?? 0),
      };

      translateX.setOffset(lastOffset.current.x);
      translateX.setValue(0);

      translateY.setOffset(lastOffset.current.y);
      translateY.setValue(0);
    }
  };

  return (
    <View style={[styles.wrap, { height, borderRadius }]}>
      <PinchGestureHandler
        ref={pinchRef}
        simultaneousHandlers={panRef}
        onGestureEvent={onPinchEvent}
        onHandlerStateChange={onPinchStateChange}
      >
        <Animated.View style={styles.flex}>
          <PanGestureHandler
            ref={panRef}
            simultaneousHandlers={pinchRef}
            enabled={isZoomed} // pan only when zoomed to keep list scroll usable
            onGestureEvent={onPanEvent}
            onHandlerStateChange={onPanStateChange}
          >
            <Animated.View style={styles.flex}>
              <Animated.Image
                source={{ uri }}
                resizeMode="contain"
                style={[
                  styles.img,
                  {
                    transform: [
                      { translateX },
                      { translateY },
                      { scale },
                    ],
                  },
                ]}
              />
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: COLORS.cardAlt,
  },
  flex: { flex: 1 },
  img: {
    width: "100%",
    height: "100%",
  },
});
