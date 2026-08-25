<script setup>
import { onMounted, provide } from "vue";
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import FlashAura from "./components/FlashAura.vue";
import FlashScrollProgress from "./components/FlashScrollProgress.vue";
import FlashShowcase from "./components/FlashShowcase.vue";
import FlashParallax from "./components/FlashParallax.vue";
import FlashPageMotion from "./components/FlashPageMotion.vue";
import FlashSpotlight from "./components/FlashSpotlight.vue";

const { Layout } = DefaultTheme;
const { isDark } = useData();

// Flip .dark immediately so the theme does not wait for a reload.
// VueUse may store "auto" when the choice matches the OS preference.
provide("toggle-appearance", () => {
  const next = !isDark.value;
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem(
      "vitepress-theme-appearance",
      next ? "dark" : "light",
    );
  } catch {
    /* ignore quota / private mode */
  }
  isDark.value = next;
});

onMounted(() => {
  document.querySelectorAll(".VPHomeFeatures .VPFeature").forEach((el, i) => {
    el.classList.add("flash-feature-in");
    el.style.setProperty("--flash-delay", `${i * 40}ms`);
  });
});
</script>

<template>
  <Layout>
    <template #layout-top>
      <FlashScrollProgress />
      <FlashAura />
      <FlashParallax />
      <FlashSpotlight />
      <FlashPageMotion />
    </template>

    <template #home-hero-before>
      <div class="flash-hero-badge" aria-hidden="true">
        <span class="flash-hero-badge__bolt">⚡</span>
        <span>Zero-Knowledge · Server-Blind · Local-First</span>
      </div>
    </template>

    <template #home-features-before>
      <p class="flash-section-kicker">Engine pillars</p>
      <h2 class="flash-section-title">Built for intelligence that never leaks</h2>
      <p class="flash-section-lead">
        Scroll — every layer is encryption-first, not a plugin bolted on later.
      </p>
    </template>

    <template #home-features-after>
      <FlashShowcase />
    </template>
  </Layout>
</template>
