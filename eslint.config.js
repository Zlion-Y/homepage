import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
  { ignores: ["dist/**", "sources/**", "node_modules/**"] },
  ...pluginVue.configs["flat/essential"],
  {
    // Background/Footer/Icon 等单字组件名是有意命名，不做无谓改名
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
  {
    files: ["src/**/*.{js,vue}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["api/**/*.mjs", "lib/**/*.mjs", "vite.config.js", "eslint.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
