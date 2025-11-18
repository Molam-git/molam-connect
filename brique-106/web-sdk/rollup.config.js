/**
 * Rollup Build Configuration
 *
 * Bundles TypeScript SDK into multiple formats:
 * - UMD (browser global)
 * - ESM (modern bundlers)
 * - CommonJS (Node.js)
 */

import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import babel from '@rollup/plugin-babel';
import postcss from 'rollup-plugin-postcss';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';

const production = !process.env.ROLLUP_WATCH;

const banner = `/**
 * Molam Form Web SDK
 * Version: ${require('./package.json').version}
 * License: MIT
 * Copyright (c) ${new Date().getFullYear()} Molam
 */`;

export default [
  // UMD Build (Browser Global)
  {
    input: 'src/molam-form.ts',
    output: {
      file: 'dist/molam-form.js',
      format: 'umd',
      name: 'MolamForm',
      banner,
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        extensions: ['.ts', '.js'],
      }),
      postcss({
        extract: 'molam-form.css',
        minimize: production,
        sourceMap: true,
        plugins: [
          autoprefixer(),
          production && cssnano({
            preset: ['default', {
              discardComments: { removeAll: true },
            }],
          }),
        ].filter(Boolean),
      }),
    ],
  },

  // UMD Build - Minified (Production)
  production && {
    input: 'src/molam-form.ts',
    output: {
      file: 'dist/molam-form.min.js',
      format: 'umd',
      name: 'MolamForm',
      banner,
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        extensions: ['.ts', '.js'],
      }),
      terser({
        format: {
          comments: /^!/,
          preamble: banner,
        },
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      }),
    ],
  },

  // ESM Build (Modern Bundlers)
  {
    input: 'src/molam-form.ts',
    output: {
      file: 'dist/molam-form.esm.js',
      format: 'es',
      banner,
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist/types',
      }),
      production && terser({
        format: {
          comments: /^!/,
          preamble: banner,
        },
      }),
    ],
  },

  // CommonJS Build (Node.js)
  {
    input: 'src/molam-form.ts',
    output: {
      file: 'dist/molam-form.cjs.js',
      format: 'cjs',
      banner,
      sourcemap: true,
      exports: 'named',
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
    ],
  },

  // Hosted Fields (Separate Bundle for iFrame)
  {
    input: 'src/hosted-fields.ts',
    output: {
      file: 'dist/hosted-fields.js',
      format: 'iife',
      name: 'MolamHostedFields',
      banner,
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        extensions: ['.ts', '.js'],
      }),
      production && terser({
        format: {
          comments: /^!/,
          preamble: banner,
        },
        compress: {
          drop_console: true,
        },
      }),
    ],
  },
].filter(Boolean);
