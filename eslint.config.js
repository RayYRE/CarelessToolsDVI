import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public/*.user.js', 'userscripts/*.user.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Userscript sources run in Tampermonkey, which provides these
  {
    files: ['userscripts/**/*.js'],
    languageOptions: {
      globals: { unsafeWindow: 'readonly', GM_getValue: 'readonly', GM_setValue: 'readonly' },
    },
  },
])
