// vite.config.ts
import { vitePlugin as remix } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/@remix-run+dev@2.8.1_@remix-run+serve@2.8.1_typescript@5.4.5_vite@5.2.8/node_modules/@remix-run/dev/dist/index.js";
import { installGlobals } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/@remix-run+node@2.8.1_typescript@5.4.5/node_modules/@remix-run/node/dist/index.js";
import { defineConfig } from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/vite@5.2.8/node_modules/vite/dist/node/index.js";
import tsconfigPaths from "file:///Users/jeffsee/code/alto-2/node_modules/.pnpm/vite-tsconfig-paths@4.3.2_typescript@5.4.5_vite@5.2.8/node_modules/vite-tsconfig-paths/dist/index.mjs";
installGlobals();
var vite_config_default = defineConfig({
  plugins: [remix(), tsconfigPaths()],
  test: {
    include: [
      "**/*.{test,spec}.?(c|m)[jt]s?(x)"
      // WIP get isomorphic-git working
      // "app/services/isomorphic-git/__tests__/test-*.js",
    ]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvamVmZnNlZS9jb2RlL2FsdG8tMlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2plZmZzZWUvY29kZS9hbHRvLTIvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2plZmZzZWUvY29kZS9hbHRvLTIvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5pbXBvcnQgeyB2aXRlUGx1Z2luIGFzIHJlbWl4IH0gZnJvbSBcIkByZW1peC1ydW4vZGV2XCI7XG5pbXBvcnQgeyBpbnN0YWxsR2xvYmFscyB9IGZyb20gXCJAcmVtaXgtcnVuL25vZGVcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tIFwidml0ZS10c2NvbmZpZy1wYXRoc1wiO1xuXG5pbnN0YWxsR2xvYmFscygpO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVtaXgoKSwgdHNjb25maWdQYXRocygpXSxcbiAgdGVzdDoge1xuICAgIGluY2x1ZGU6IFtcbiAgICAgIFwiKiovKi57dGVzdCxzcGVjfS4/KGN8bSlbanRdcz8oeClcIixcbiAgICAgIC8vIFdJUCBnZXQgaXNvbW9ycGhpYy1naXQgd29ya2luZ1xuICAgICAgLy8gXCJhcHAvc2VydmljZXMvaXNvbW9ycGhpYy1naXQvX190ZXN0c19fL3Rlc3QtKi5qc1wiLFxuICAgIF0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLGNBQWMsYUFBYTtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLG1CQUFtQjtBQUUxQixlQUFlO0FBRWYsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUM7QUFBQSxFQUNsQyxNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsTUFDUDtBQUFBO0FBQUE7QUFBQSxJQUdGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
