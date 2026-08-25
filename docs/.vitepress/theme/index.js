import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import FlashShowcase from "./components/FlashShowcase.vue";
import FlashReveal from "./components/FlashReveal.vue";
import "./style.css";

/** @type {import('vitepress').Theme} */
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("FlashShowcase", FlashShowcase);
    app.component("FlashReveal", FlashReveal);
  },
};
