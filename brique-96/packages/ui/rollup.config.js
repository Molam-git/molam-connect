/**
 * Rollup configuration for @molam/ui
 * Builds ESM and CJS bundles with TypeScript declarations
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

const isProduction = process.env.NODE_ENV === 'production';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    {
      file: pkg.module,
      format: 'esm',
      sourcemap: true,
      exports: 'named',
    },
  ],
  plugins: [
    // Automatically externalize peerDependencies
    peerDepsExternal(),

    // Resolve node_modules
    resolve({
      browser: true,
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    }),

    // Convert CommonJS modules to ES6
    commonjs(),

    // Compile TypeScript
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist',
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '**/examples/**'],
    }),

    // Process CSS
    postcss({
      extract: false, // CSS is imported separately via ./styles
      modules: false,
      minimize: isProduction,
      sourceMap: true,
    }),

    // Minify in production
    isProduction && terser({
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      output: {
        comments: false,
      },
    }),
  ].filter(Boolean),

  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
  ],

  // Suppress warnings for external dependencies
  onwarn(warning, warn) {
    // Skip certain warnings
    if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    warn(warning);
  },
};
