import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "server",
					globals: true,
					environment: "node",
					include: ["test/server/**/*.test.js"],
					globalSetup: ["test/helpers/global-setup.js"],
					testTimeout: 15000,
					fileParallelism: false,
				},
			},
			{
				plugins: [react()],
				resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/ui") } },
				test: {
					name: "ui",
					environment: "jsdom",
					include: ["test/ui/**/*.test.tsx"],
					setupFiles: ["test/ui/setup.ts"],
				},
			},
		],
	},
});
