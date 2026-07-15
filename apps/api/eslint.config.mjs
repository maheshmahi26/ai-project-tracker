import base from '@ai-projectos/config/eslint';

export default [
  ...base,
  {
    // NestJS relies heavily on decorators + DI metadata.
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
