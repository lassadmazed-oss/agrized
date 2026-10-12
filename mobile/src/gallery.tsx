import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type OfferPicture } from "./api";
import { OfferImage } from "./offer-ui";
import { colour, isRTL, radius, space, type } from "./theme";

/**
 * The pictures of an offer, full screen.
 *
 * WHY A VIEWER AT ALL. The catalogue and the offer screen draw photographs inside frames the design chose —
 * a 4:3 card, a strip the width of the sheet — and every one of them is `cover`, which means cropped. A
 * reader who wants to SEE the grove is looking at the middle of it. Tapping a photograph is the oldest
 * gesture on a phone and it was doing nothing.
 *
 * `contain`, NOT `cover`, and that is the whole point of the screen: here the picture is the subject and its
 * shape is its own. Cropping a photograph to the phone's aspect ratio would be cutting off the thing the
 * reader opened it to look at.
 *
 * IT MIRRORS FOR ARABIC the same way the offer screen's strip does — the container is flipped on X and each
 * page flipped back — so «next» is to the left, where an Arabic reader's next is. The arrows follow the same
 * rule: the one that advances sits where the eye is going, not where a left-to-right design put it.
 *
 * NOTHING HERE IS A SETTING, because nothing here is a sentence: the only text is the counter («٣ / ٥»),
 * which is numbers, and the picture's own caption, which the team typed on the picture itself.
 */

export function PhotoViewer({
  pictures,
  startAt,
  onClose,
}: {
  pictures: OfferPicture[];
  /** Null means closed. A number opens on that picture. */
  startAt: number | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const strip = useRef<ScrollView>(null);
  const [active, setActive] = useState(startAt ?? 0);
  const rtl = isRTL();
  const count = pictures.length;
  const open = startAt !== null;

  // Opening on the picture that was tapped, not on the first one — a viewer that always starts at the
  // beginning makes the reader find their way back to what they were looking at.
  useEffect(() => {
    if (!open) return;
    setActive(startAt);
    // After layout, or the offset lands before the pages have a width to be offset by.
    const timer = setTimeout(() => strip.current?.scrollTo({ x: startAt * width, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [open, startAt, width]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = Math.abs(event.nativeEvent.contentOffset.x);
      setActive(width > 0 ? Math.min(count - 1, Math.round(offset / width)) : 0);
    },
    [count, width],
  );

  const go = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(count - 1, active + delta));
      if (next === active) return;
      setActive(next);
      strip.current?.scrollTo({ x: next * width, animated: true });
    },
    [active, count, width],
  );

  if (!open || count === 0) return null;

  const caption = pictures[active]?.caption ?? null;
  // In Arabic the page that comes NEXT is reached by moving left, and the mirror below makes that true of the
  // scroll too — so the arrow that advances is the one pointing the way the reader is already going.
  const mirror = rtl ? styles.mirror : null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent={false}>
      <StatusBar barStyle="light-content" />
      <View style={styles.page}>
        <ScrollView
          ref={strip}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          onScrollEndDrag={onScroll}
          style={[styles.strip, mirror]}
        >
          {pictures.map((picture, index) => (
            <Pressable key={picture.id} onPress={onClose} style={[{ width, height }, styles.frame, mirror]}>
              <OfferImage
                url={picture.url}
                alt={picture.alt}
                seed={picture.id}
                width={width}
                height={height}
                fit="contain"
                // The one on screen is worth the network; its neighbours can wait until they are.
                priority={index === active ? "high" : "low"}
                scale={2}
                style={{ width, height }}
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Close, and the counter — both clear of the notch. */}
        <View style={[styles.bar, { top: insets.top + space.tight }]} pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={12} style={styles.round} accessibilityRole="button">
            <Text style={styles.close}>✕</Text>
          </Pressable>
          {count > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {active + 1} / {count}
              </Text>
            </View>
          ) : null}
        </View>

        {/* The arrows. Only drawn when there is somewhere to go, and the one at the end of the run is dimmed
            rather than removed, so the controls do not jump about as the reader moves. */}
        {count > 1 ? (
          <>
            <Pressable
              onPress={() => go(1)}
              hitSlop={10}
              style={[styles.arrow, rtl ? styles.arrowStart : styles.arrowEnd, active === count - 1 && styles.arrowOff]}
              accessibilityRole="button"
            >
              <Text style={styles.chevron}>{rtl ? "‹" : "›"}</Text>
            </Pressable>
            <Pressable
              onPress={() => go(-1)}
              hitSlop={10}
              style={[styles.arrow, rtl ? styles.arrowEnd : styles.arrowStart, active === 0 && styles.arrowOff]}
              accessibilityRole="button"
            >
              <Text style={styles.chevron}>{rtl ? "›" : "‹"}</Text>
            </Pressable>
          </>
        ) : null}

        {caption ? (
          <View style={[styles.captionBar, { paddingBottom: insets.bottom + space.cozy }]} pointerEvents="none">
            <Text style={styles.caption}>{caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * The index of the picture being viewed, and nothing else.
 *
 * IT TAKES NO ARGUMENTS ON PURPOSE. The first version took the pictures and returned a ready-made node,
 * which read well and broke the rules of hooks at the one call site that matters: the offer screen derives
 * its pictures from a fetch and returns early while that is in flight, so a hook placed where the pictures
 * exist is a hook that is skipped on the first renders — «Rendered more hooks than during the previous
 * render», which is exactly what it did. Holding only the index lets this sit at the top of the component
 * with the other hooks, and the pictures are handed to <PhotoViewer> further down where they are known.
 */
export function usePhotoViewer() {
  const [at, setAt] = useState<number | null>(null);
  return {
    at,
    open: useCallback((index: number) => setAt(index), []),
    close: useCallback(() => setAt(null), []),
  };
}

const styles = StyleSheet.create({
  // Near-black rather than black: a photograph of a grove against pure #000 looks like a hole in the screen.
  page: { flex: 1, backgroundColor: "#0d110e" },
  strip: { flex: 1 },
  frame: { alignItems: "center", justifyContent: "center" },
  mirror: { transform: [{ scaleX: -1 }] },
  bar: {
    position: "absolute",
    start: space.cozy,
    end: space.cozy,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  close: { color: colour.surface, fontSize: 19, lineHeight: 22 },
  counter: {
    paddingHorizontal: space.snug,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  counterText: { color: colour.surface, fontSize: 13, fontVariant: ["tabular-nums"] },
  arrow: {
    position: "absolute",
    top: "50%",
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  arrowStart: { start: space.snug },
  arrowEnd: { end: space.snug },
  arrowOff: { opacity: 0.25 },
  chevron: { color: colour.surface, fontSize: 26, lineHeight: 30 },
  captionBar: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: space.card,
    paddingTop: space.cozy,
    backgroundColor: "rgba(13,17,14,0.72)",
  },
  caption: { ...type.note, color: colour.surface, textAlign: "center" },
});
