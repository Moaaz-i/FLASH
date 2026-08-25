<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { withBase, useData } from "vitepress";

const { frontmatter } = useData();
const isHome = computed(() => frontmatter.value?.layout === "home");
const reduceMotion = ref(false);

let raf = 0;
let targetY = 0;
let currentY = 0;
let scrolling = false;

const layers = [
  {
    src: "/flash-bolt.svg",
    className: "flash-parallax__item--bolt",
    speed: 0.18,
  },
  {
    src: "/flash-hex.svg",
    className: "flash-parallax__item--hex",
    speed: 0.28,
  },
];

function applyScroll(y) {
  document.documentElement.style.setProperty("--flash-scroll", y.toFixed(1));
}

function tick() {
  currentY += (targetY - currentY) * 0.18;
  applyScroll(currentY);
  if (Math.abs(targetY - currentY) > 0.4) {
    raf = requestAnimationFrame(tick);
  } else {
    currentY = targetY;
    applyScroll(currentY);
    raf = 0;
    scrolling = false;
  }
}

function onScroll() {
  targetY = window.scrollY || 0;
  if (!scrolling) {
    scrolling = true;
    raf = requestAnimationFrame(tick);
  }
}

onMounted(() => {
  reduceMotion.value = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion.value || !isHome.value) return;
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div v-if="isHome && !reduceMotion" class="flash-parallax" aria-hidden="true">
    <img
      v-for="layer in layers"
      :key="layer.className"
      :src="withBase(layer.src)"
      alt=""
      :class="['flash-parallax__item', layer.className]"
      :style="{ '--flash-parallax-speed': layer.speed }"
      draggable="false"
      loading="lazy"
      decoding="async"
    />
  </div>
</template>
