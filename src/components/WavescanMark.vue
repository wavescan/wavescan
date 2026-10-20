<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

// The Wavescan mark: a cube whose top-right corner breaks into pixels (docs/brand/). Drawn in
// the current text colour. Decorative, so it's hidden from screen readers: the app name sits
// next to it.
//
// `beat` makes the mark react to a scan: each time the number changes, the floating pieces
// drift out and settle back, like the echo just read is being put together. Give it the
// number of echoes read so far while a scan runs, and leave it at 0 otherwise. People who
// turn on "reduce motion" in their system settings see the mark stay still.

const props = withDefaults(defineProps<{ size?: number; beat?: number }>(), { size: 24, beat: 0 });

// The six pieces, centred on the mark's bounding box (157 × 147 units).
const PIECES = [
  { d: "M-47.2 -54.5 L-14.2 6.7 L-47.2 65.5 L-78.4 6.7 Z", float: false }, // left face
  { d: "M-0.6 13.5 L72.9 13.5 L39.4 73.5 L-36.1 73.5 Z", float: false }, // bottom face
  { d: "M-39.1 -64.5 L-1.6 -64.5 L12.4 -35.5 L-25.1 -35.5 Z", float: true },
  { d: "M17.4 -32.5 L62.9 -32.5 L78.4 2.5 L32.9 2.5 Z", float: true },
  { d: "M12.9 -60.5 L35.4 -60.5 L43.4 -42.5 L20.9 -42.5 Z", float: true },
  { d: "M30.4 -73.5 L44.9 -73.5 L48.9 -62.5 L34.4 -62.5 Z", float: true }, // smallest pixel
];

const apart = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.beat,
  (now, before) => {
    if (now === 0 || now === before) return;
    apart.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (apart.value = false), 180);
  },
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="-80 -80 160 160"
    fill="currentColor"
    aria-hidden="true"
    class="mark shrink-0 overflow-visible"
    :class="{ apart }"
  >
    <path
      v-for="(piece, i) in PIECES"
      :key="i"
      :d="piece.d"
      :class="piece.float ? `float float-${i}` : undefined"
    />
  </svg>
</template>

<style scoped>
.float {
  transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 420ms;
}

/* Pieces further from the cube drift further: the same up-and-right direction as the mark. */
.apart .float {
  transition-duration: 160ms;
  opacity: 0.55;
}
/* Units are the mark's own (160 across), so at 24 px the smallest pixel moves about 5 px. */
.apart .float-2 { transform: translate(10px, -10px); }
.apart .float-3 { transform: translate(14px, -8px); }
.apart .float-4 { transform: translate(22px, -18px); }
.apart .float-5 { transform: translate(34px, -28px); }

@media (prefers-reduced-motion: reduce) {
  .float,
  .apart .float {
    transition: none;
    transform: none;
    opacity: 1;
  }
}
</style>
