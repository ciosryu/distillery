import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

// 빌드 표시 (#227, 4차 MVP 플레이테스트: 판 도중 페이지를 다시 열 때 빌드가 말없이 바뀌었다) — 커밋 짧은 해시. git이 없으면 'dev'
const BUILD = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch { return 'dev'; } })();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  test: {
    // scripts/experiments의 측정 도구 단위 테스트도 돈다(MGT metrics.test.ts — 새 승리 판정 지표, 결정 #312·P-MGT-46)
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
