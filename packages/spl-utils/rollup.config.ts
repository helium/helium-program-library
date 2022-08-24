import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";
import { terser } from "rollup-plugin-terser";
import autoExternal from "rollup-plugin-auto-external";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
const env = process.env.NODE_ENV;

export default {
  input: "src/index.ts",
  plugins: [
    json(),
    commonjs(),
    nodeResolve({
      browser: true,
      extensions: [".js", ".ts"],
      dedupe: ["bn.js", "buffer", "borsh", "@solana/web3.js"],
      preferBuiltins: false,
    }),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      outDir: "dist",
    }),
    autoExternal(),
    replace({
      preventAssignment: true,
      values: {
        "process.env.NODE_ENV": JSON.stringify(env),
        "process.env.ANCHOR_BROWSER": JSON.stringify(true),
      },
    }),
    terser(),
  ],
  external: [],
  output: [
    {
      dir: "dist",
      format: "esm",
      sourcemap: true,
      preserveModulesRoot: "src",
      preserveModules: true,
    },
    {
      name: "SplUtils",
      file: "dist/index.umd.js",
      format: "umd",
      sourcemap: true,
    },
  ],
};
