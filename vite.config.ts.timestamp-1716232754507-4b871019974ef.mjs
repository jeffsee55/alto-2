// vite.config.ts
import { vitePlugin as remix } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/@remix-run+dev@2.8.1_@remix-run+serve@2.8.1_typescript@5.4.5_vite@5.2.8/node_modules/@remix-run/dev/dist/index.js";
import { installGlobals } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/@remix-run+node@2.8.1_typescript@5.4.5/node_modules/@remix-run/node/dist/index.js";
import { defineConfig } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/vite@5.2.8/node_modules/vite/dist/node/index.js";
import tsconfigPaths from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/vite-tsconfig-paths@4.3.2_typescript@5.4.5_vite@5.2.8/node_modules/vite-tsconfig-paths/dist/index.mjs";
import { vercelPreset } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/@vercel+remix@2.9.1_@remix-run+dev@2.8.1_@remix-run+node@2.8.1_@remix-run+server-runtime@2.9._ef6o4yg6zc3fccfpyorrme4zn4/node_modules/@vercel/remix/vite.js";
installGlobals();
var vite_config_default = defineConfig({
  define: {
    "process.env": {}
  },
  plugins: [
    remix({
      presets: [vercelPreset()]
    }),
    tsconfigPaths()
  ],
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    setupFiles: ["dotenv/config"]
    // load .env file
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "sqlocal"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvamVmZnNlZS9jb2RlL2FsdG8tMlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2plZmZzZWUvY29kZS9hbHRvLTIvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2plZmZzZWUvY29kZS9hbHRvLTIvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5pbXBvcnQgeyB2aXRlUGx1Z2luIGFzIHJlbWl4IH0gZnJvbSBcIkByZW1peC1ydW4vZGV2XCI7XG5pbXBvcnQgeyBpbnN0YWxsR2xvYmFscyB9IGZyb20gXCJAcmVtaXgtcnVuL25vZGVcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tIFwidml0ZS10c2NvbmZpZy1wYXRoc1wiO1xuaW1wb3J0IHsgdmVyY2VsUHJlc2V0IH0gZnJvbSBcIkB2ZXJjZWwvcmVtaXgvdml0ZVwiO1xuXG5pbnN0YWxsR2xvYmFscygpO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBkZWZpbmU6IHtcbiAgICBcInByb2Nlc3MuZW52XCI6IHt9LFxuICB9LFxuICBwbHVnaW5zOiBbXG4gICAgcmVtaXgoe1xuICAgICAgcHJlc2V0czogW3ZlcmNlbFByZXNldCgpXSxcbiAgICB9KSxcbiAgICB0c2NvbmZpZ1BhdGhzKCksXG4gIF0sXG4gIHRlc3Q6IHtcbiAgICBpbmNsdWRlOiBbXCIqKi8qLnt0ZXN0LHNwZWN9Lj8oY3xtKVtqdF1zPyh4KVwiXSxcbiAgICBzZXR1cEZpbGVzOiBbXCJkb3RlbnYvY29uZmlnXCJdLCAvLyBsb2FkIC5lbnYgZmlsZVxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBoZWFkZXJzOiB7XG4gICAgICBcIkNyb3NzLU9yaWdpbi1PcGVuZXItUG9saWN5XCI6IFwic2FtZS1vcmlnaW5cIixcbiAgICAgIFwiQ3Jvc3MtT3JpZ2luLUVtYmVkZGVyLVBvbGljeVwiOiBcInJlcXVpcmUtY29ycFwiLFxuICAgIH0sXG4gIH0sXG4gIG9wdGltaXplRGVwczoge1xuICAgIGV4Y2x1ZGU6IFtcIkBzcWxpdGUub3JnL3NxbGl0ZS13YXNtXCIsIFwic3Fsb2NhbFwiXSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUNBLFNBQVMsY0FBYyxhQUFhO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sbUJBQW1CO0FBQzFCLFNBQVMsb0JBQW9CO0FBRTdCLGVBQWU7QUFFZixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixRQUFRO0FBQUEsSUFDTixlQUFlLENBQUM7QUFBQSxFQUNsQjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLE1BQ0osU0FBUyxDQUFDLGFBQWEsQ0FBQztBQUFBLElBQzFCLENBQUM7QUFBQSxJQUNELGNBQWM7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osU0FBUyxDQUFDLGtDQUFrQztBQUFBLElBQzVDLFlBQVksQ0FBQyxlQUFlO0FBQUE7QUFBQSxFQUM5QjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sU0FBUztBQUFBLE1BQ1AsOEJBQThCO0FBQUEsTUFDOUIsZ0NBQWdDO0FBQUEsSUFDbEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsMkJBQTJCLFNBQVM7QUFBQSxFQUNoRDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
