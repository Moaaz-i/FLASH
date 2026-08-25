<script setup>
import { onMounted, onUnmounted, ref } from "vue";

const progress = ref(0);
let raf = 0;

function measure() {
  raf = 0;
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function onScroll() {
  if (!raf) raf = requestAnimationFrame(measure);
}

onMounted(() => {
  measure();
  window.addEventListener("scroll", onScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div
    class="flash-scroll-progress"
    role="progressbar"
    :aria-valuenow="Math.round(progress * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label="Reading progress"
  >
    <div
      class="flash-scroll-progress__bar"
      :style="{ transform: `scaleX(${progress})` }"
    />
  </div>
</template>
