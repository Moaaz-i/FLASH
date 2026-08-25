<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useData } from "vitepress";

const { frontmatter } = useData();
const isHome = computed(() => frontmatter.value?.layout === "home");
const reduceMotion = ref(false);
let raf = 0;

function flush(e) {
  raf = 0;
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  const root = document.documentElement;
  root.style.setProperty("--flash-spot-x", `${x.toFixed(1)}%`);
  root.style.setProperty("--flash-spot-y", `${y.toFixed(1)}%`);
}

/** @type {PointerEvent | null} */
let last = null;

function onMove(e) {
  last = e;
  if (!raf) {
    raf = requestAnimationFrame(() => {
      if (last) flush(last);
    });
  }
}

onMounted(() => {
  reduceMotion.value = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion.value || !isHome.value) return;
  window.addEventListener("pointermove", onMove, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("pointermove", onMove);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div
    v-if="isHome && !reduceMotion"
    class="flash-spotlight"
    aria-hidden="true"
  />
</template>
