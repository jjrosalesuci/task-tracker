var _a;
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: (_a = process.env.VITE_API_PROXY) !== null && _a !== void 0 ? _a : 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        css: true,
    },
});
