<script setup>
import { onMounted, onUnmounted } from "vue";

/** Pointer-driven aura vars — update only while the pointer moves (no idle RAF). */
let raf = 0;
let pendingX = 0.5;
let pendingY = 0.5;

function flush() {
  raf = 0;
  const root = document.documentElement;
  root.style.setProperty("--flash-mx", pendingX.toFixed(3));
  root.style.setProperty("--flash-my", pendingY.toFixed(3));
}

function onMove(e) {
  pendingX = e.clientX / window.innerWidth;
  pendingY = e.clientY / window.innerHeight;
  if (!raf) raf = requestAnimationFrame(flush);
}

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.addEventListener("pointermove", onMove, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("pointermove", onMove);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="flash-aura" aria-hidden="true">
    <div class="flash-aura__grid" />
    <div class="flash-aura__glow flash-aura__glow--cyan" />
    <div class="flash-aura__glow flash-aura__glow--violet" />
  </div>
</template>
