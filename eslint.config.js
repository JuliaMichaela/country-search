import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
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
  eslintConfigPrettier,
);
