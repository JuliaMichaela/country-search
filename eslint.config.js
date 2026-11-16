import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'site/**', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message: 'Build DOM with createElement/textContent instead of innerHTML.',
        },
        {
          property: 'insertAdjacentHTML',
          message: 'Build DOM with createElement/append instead of insertAdjacentHTML.',
        },
      ],
    },
  },
  // Plain JS config files are not part of the TypeScript project.
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  // Node build scripts: still linted, but outside the browser TypeScript project, so without
  // type-aware rules and with the Node globals they use.
  {
    files: ['scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  eslintConfigPrettier,
);
