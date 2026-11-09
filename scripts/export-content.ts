// 콘텐츠 내보내기 (skeleton S-7, #151) — TypeScript 콘텐츠(원본)를 엔진 중립 JSON으로 쓴다.
// 실행: npm run content:export [출력 폴더=data/content]
// 표 하나 = 파일 하나(<이름>.json) + manifest.json(표 목록·생성 시각). 규칙 함수는 빠진다(C#에서 규칙 코드로).
// 생성물이라 저장소에 넣지 않는다(.gitignore) — 단계 G에서 C# 골든 테스트가 이 출력을 읽는다
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as CONTENT from '../src/sim/content';

const out = process.argv[2] ?? 'data/content';
mkdirSync(out, { recursive: true });
const tables = Object.entries(CONTENT).filter(([, v]) => typeof v !== 'function');
for (const [name, value] of tables) writeFileSync(join(out, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), tables: tables.map(([n]) => n).sort() }, null, 2) + '\n');
console.log(`콘텐츠 표 ${tables.length}개 → ${out}/`);
