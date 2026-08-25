<script setup>
import { watch, nextTick, onMounted } from "vue";
import { useRoute } from "vitepress";

const route = useRoute();

function playPageFlash() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.remove("flash-page-enter");
  void root.offsetWidth;
  root.classList.add("flash-page-enter");
  window.setTimeout(() => root.classList.remove("flash-page-enter"), 420);
}

watch(
  () => route.path,
  async () => {
    await nextTick();
    playPageFlash();
  },
);

onMounted(async () => {
  await nextTick();
  playPageFlash();
});
</script>

<template>
  <div class="flash-page-motion" aria-hidden="true" />
</template>
