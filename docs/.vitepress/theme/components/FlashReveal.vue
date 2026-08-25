<script setup>
import { onMounted, onUnmounted, ref } from "vue";

const root = ref(null);
const visible = ref(true);
let observer;

onMounted(() => {
  if (!root.value) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    visible.value = true;
    return;
  }

  // Stay visible by default — only animate if the block is still below the fold
  const rect = root.value.getBoundingClientRect();
  const belowFold = rect.top > window.innerHeight * 0.92;
  if (!belowFold) {
    visible.value = true;
    return;
  }

  visible.value = false;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visible.value = true;
          observer?.disconnect();
          return;
        }
      }
    },
    { threshold: 0.01, rootMargin: "40px 0px" },
  );
  observer.observe(root.value);
});

onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="flash-reveal" :class="{ 'is-visible': visible }">
    <slot />
  </div>
</template>
