// 이 화면이 어느 빌드(커밋)인가 — vite.config.ts가 빌드 때 넣는다 (#227)
// 웹 빌드는 페이지를 다시 열면 새 빌드로 말없이 바뀐다(세이브는 브라우저에 남아 이어진다). 플레이테스트 기록에 언제 바뀌었는지 남기려고 쓴다
declare const __BUILD__: string | undefined;
export const BUILD_ID: string = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
