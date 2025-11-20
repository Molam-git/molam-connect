import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  external: ["react", "react-dom"],
  output: [
    { file: "dist/index.esm.js", format: "es", sourcemap: true },
    { file: "dist/index.cjs.js", format: "cjs", sourcemap: true, exports: "named" }
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" }),
    terser()
  ]
};

