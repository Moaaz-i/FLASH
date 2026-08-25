<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { withBase } from "vitepress";
import FlashReveal from "./FlashReveal.vue";

const videoSrc = withBase("/FLASH_DB.mp4");
const videoEl = ref(null);
const videoReady = ref(false);
const videoFailed = ref(false);

const pillars = [
  {
    label: "Server-blind",
    title: "Designed so the engine holds ciphertext",
    body: "AES-256-GCM envelopes, blind trapdoors, and ORE tokens stay sealed. FlashZKKernel rejects unsealed records on the wire. Limits are public.",
    link: "/guide/trust-model",
    linkText: "Trust model",
  },
  {
    label: "AI-native",
    title: "Private RAG & agent memory",
    body: "Ingest, embed, ask, and recall without shipping secrets to a remote model host. Intelligence lives next to your key.",
    link: "/guide/private-rag",
    linkText: "Private RAG",
  },
  {
    label: "Fail-closed 1.3.0",
    title: "Trust by default",
    body: "authKey, console tokens, and strong secrets are mandatory since 1.2.0. Key wrap (FLASHTAKE1) in 1.3.0 — security still on you. No external audit yet.",
    link: "/guide/whats-new",
    linkText: "What's new",
  },
];

const stats = [
  { value: 194, suffix: "", label: "Tests passing" },
  { value: 256, suffix: "-bit", label: "AES-GCM" },
  { value: 0, suffix: "", label: "Server plaintext" },
  { value: 1, suffix: "M+", label: "Ops/sec binary path*" },
];

const displayed = ref(stats.map(() => 0));
const statsRoot = ref(null);
let statsStarted = false;
/** @type {number[]} */
const rafs = [];
/** @type {IntersectionObserver | null} */
let io = null;

function animateStat(index, target, duration = 1200) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    displayed.value[index] = Math.round(target * eased);
    if (t < 1) rafs.push(requestAnimationFrame(frame));
  }
  rafs.push(requestAnimationFrame(frame));
}

function onVideoReady() {
  videoReady.value = true;
  videoFailed.value = false;
  const el = videoEl.value;
  if (!el) return;
  el.muted = true;
  const play = el.play();
  if (play && typeof play.catch === "function") play.catch(() => {});
}

function onVideoError() {
  videoFailed.value = true;
}

onMounted(() => {
  const el = videoEl.value;
  if (el) {
    // Force load — some browsers leave NETWORK_NO_SOURCE until load() is called
    el.load();
    if (el.readyState >= 2) onVideoReady();
  }

  if (!statsRoot.value) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting) || statsStarted) return;
      statsStarted = true;
      stats.forEach((s, i) => {
        if (reduce) displayed.value[i] = s.value;
        else animateStat(i, s.value, 900 + i * 120);
      });
      io?.disconnect();
    },
    { threshold: 0.2 },
  );
  io.observe(statsRoot.value);
});

onUnmounted(() => {
  io?.disconnect();
  rafs.forEach(cancelAnimationFrame);
});
</script>

<template>
  <section class="flash-showcase">
    <!-- Video must stay outside FlashReveal — opacity:0 blocked IntersectionObserver + made it look missing -->
    <div class="flash-showcase__video-wrap">
      <div class="flash-showcase__video-glow" aria-hidden="true" />
      <div
        class="flash-showcase__video-shell"
        :class="{
          'is-ready': videoReady,
          'is-failed': videoFailed,
        }"
      >
        <video
          ref="videoEl"
          class="flash-showcase__video"
          controls
          autoplay
          muted
          loop
          playsinline
          preload="auto"
          :src="videoSrc"
          @loadeddata="onVideoReady"
          @canplay="onVideoReady"
          @error="onVideoError"
        >
          Your browser does not support the video tag.
        </video>
      </div>
      <p class="flash-showcase__video-caption">
        FLASH Intelligence Console — sealed vaults, private RAG, server-blind by
        design
        <template v-if="videoFailed">
          ·
          <a :href="videoSrc" target="_blank" rel="noopener">Download video</a>
        </template>
      </p>
    </div>

    <FlashReveal>
      <div ref="statsRoot" class="flash-stats">
        <div v-for="(s, i) in stats" :key="s.label" class="flash-stats__card">
          <div class="flash-stats__value">
            <span>{{ displayed[i] }}</span
            ><span class="flash-stats__suffix">{{ s.suffix }}</span>
          </div>
          <div class="flash-stats__label">{{ s.label }}</div>
        </div>
      </div>
      <p class="flash-stats__note">
        *Binary path throughput depends on workload and
        <code>engineOptions</code> — see benchmarks.
      </p>
    </FlashReveal>

    <FlashReveal>
      <div class="flash-pillars">
        <article
          v-for="(p, i) in pillars"
          :key="p.title"
          class="flash-pillar"
          :style="{ '--flash-delay': `${i * 80}ms` }"
        >
          <span class="flash-pillar__label">{{ p.label }}</span>
          <h3 class="flash-pillar__title">{{ p.title }}</h3>
          <p class="flash-pillar__body">{{ p.body }}</p>
          <a class="flash-pillar__link" :href="withBase(p.link)">{{
            p.linkText
          }}</a>
        </article>
      </div>
    </FlashReveal>

    <FlashReveal>
      <div class="flash-cta">
        <div class="flash-cta__copy">
          <p class="flash-section-kicker">Ship private intelligence</p>
          <h2 class="flash-section-title">Start sealed in five minutes</h2>
          <p class="flash-section-lead">
            One client. One key. Private RAG, agent memory, and a sealed vault —
            without giving the engine your plaintext. Read the trust model
            before regulated production.
          </p>
        </div>
        <div class="flash-cta__actions">
          <a
            class="flash-btn flash-btn--brand"
            :href="withBase('/guide/getting-started')"
            >Get Started</a
          >
          <a
            class="flash-btn flash-btn--ghost"
            :href="withBase('/guide/whats-new')"
            >What's New in 1.3.0</a
          >
        </div>
      </div>
    </FlashReveal>
  </section>
</template>
