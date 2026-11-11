// PROD-A 장기 숙성 보유 규칙(hold)을 P8(`mvp-human.ts`, MGT 소유) 사본 소스에 붙이는 패치 — prod-hold-p8.ts가 쓰고, 다른 P8 래퍼(MKT mkt-p8v.ts 등)도 같은 소스에 얹을 수 있다.
// P8 원본 파일은 고치지 않는다. 붙일 자리가 없거나 바뀌었으면 멈춘다(조용히 틀린 값을 내지 않는다). 규칙 설명은 prod-hold-p8.ts 머리말.
//   applyHoldPatches(src)                         보유 규칙만(Policy.hold 필드 · 장기 지정 · 「싱글 몰트 10년」 계열 병입 · 장기 통을 일반 병입에서 빼기)
//   applyHoldPatches(src, { paths: true })        + H… 경로 15개를 P8 정책 목록 앞에 붙인다
//   applyHoldPatches(src, { filterRun: true })    + P8 RUN을 H… 경로만으로(ONLY는 그대로 걸린다)
//   applyHoldPatches(src, { stats: true })        + 끝에 PAIRED(같은 시드 순자산 짝 비교)·HELD(장기 지정 통 수) 줄
// 다른 래퍼에서 쓸 때: P8 정책에 { hold: { age: 120, share: 0.25, select: 'cool' } }처럼 hold를 주면 된다. 장기 계열 제품 이름은 LONG_LINE_NAME
//   hold.stopAt = <달>: 그 달부터 새 장기 지정을 멈춘다 — 이미 정한 통이 다 팔리면 장기 계열 보충이 끊긴다(유한 재고형, AP3 장기 숙성 조건 (b))
export const LONG_LINE_NAME = '싱글 몰트 10년';

export interface HoldPatchOptions { paths?: boolean; filterRun?: boolean; stats?: boolean }

export function applyHoldPatches(source: string, o: HoldPatchOptions = {}): string {
  let src = source;
  const patch = (from: string | RegExp, to: string) => {
    const before = src;
    src = src.replace(from, to);
    if (src === before) throw new Error(`prod-hold: P8(mvp-human.ts)에서 붙일 자리를 찾지 못했다 — ${String(from).slice(0, 60)}…  P8이 바뀌었으면 prodHoldPatch.ts를 고친다`);
  };

  // 1) 정책 필드 · 샘플 기록 읽기 · 상태 맵
  patch('interface Policy { name: string;', "interface Policy { hold?: { age: number; share: number; select: 'any' | 'sample' | 'cool'; at?: number; stopAt?: number }; name: string;");
  patch("import { isFlagshipCandidate } from '../../src/sim/delegateCheck';", "import { isFlagshipCandidate } from '../../src/sim/delegateCheck';\nimport { knownReads } from '../../src/sim/blendTable';");
  patch('const DUMP = process.env.DUMP;', 'const DUMP = process.env.DUMP;\nconst HOLD = new Map<string, boolean>(); const HOLDN = new Map<string, number>(); const HOLDSTAT = new Map<string, number>();');
  // 2) 경로 — P8 정책 목록 뒤에 붙인다
  if (o.paths) patch(/(const P8_POLICIES: Policy\[\] = \[\n)/, `$1  P8('HA 전량 3년(= X0)', {}),
  P8('HB 전량 6년(43개월부터 72개월↑만 병입)', { labelFrom: [43, 72] }),
  P8('HC 25% 장기(품질 무관, 3년에 정함)', { hold: { age: 120, share: 0.25, select: 'any' } }),
  P8('HD 25% 장기(3년 샘플 상위)', { hold: { age: 120, share: 0.25, select: 'sample' } }),
  P8('HE 전량 장기(10년)', { hold: { age: 120, share: 1, select: 'any' } }),
  P8('HC72 25% 장기(품질 무관, 6년에 정함)', { hold: { age: 120, share: 0.25, select: 'any', at: 72 } }),
  P8('HD72 25% 장기(6년 샘플 상위)', { hold: { age: 120, share: 0.25, select: 'sample', at: 72 } }),
  P8('HS 25% 장기(서늘한 칸, 3년에 정함)', { hold: { age: 120, share: 0.25, select: 'cool' } }),
  P8('HA6 6배치 · 전량 3년', { maltB: 6 }),
  P8('HS6 6배치 · 25% 장기(서늘한 칸, 3년)', { maltB: 6, hold: { age: 120, share: 0.25, select: 'cool' } }),
  P8('HS672 6배치 · 25% 장기(서늘한 칸, 6년)', { maltB: 6, hold: { age: 120, share: 0.25, select: 'cool', at: 72 } }),
  P8('HC6 6배치 · 25% 장기(품질 무관, 3년)', { maltB: 6, hold: { age: 120, share: 0.25, select: 'any' } }),
  P8('HD6 6배치 · 25% 장기(3년 샘플 상위)', { maltB: 6, hold: { age: 120, share: 0.25, select: 'sample' } }),
  P8('HC672 6배치 · 25% 장기(품질 무관, 6년)', { maltB: 6, hold: { age: 120, share: 0.25, select: 'any', at: 72 } }),
  P8('HD672 6배치 · 25% 장기(6년 샘플 상위)', { maltB: 6, hold: { age: 120, share: 0.25, select: 'sample', at: 72 } }),
`);
  // 3) 병입 — 장기 지정·장기 계열 병입을 위스키 병입 앞에, 장기 통은 일반 병입에서 뺀다
  patch("  const stock = stockOf(s, 'whisky');\n", `  if (p.hold) {
    const pk = \`\${p.name}|\${s.seed}\`;
    const key = (c: { id: string; filledMonth?: number }) => \`\${pk}|\${c.id}|\${c.filledMonth ?? -1}\`;
    const cohort = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.kind === 'malt' && c.contents.oakMonths >= (p.hold!.at ?? 36) && !HOLD.has(key(c)));
    if (cohort.length) {
      const quota = p.hold.stopAt != null && s.month >= p.hold.stopAt ? 0 : (HOLDN.get(pk) ?? 0) + p.hold.share * cohort.length; // stopAt: 그 달부터 장기 지정을 멈춘다(유한 재고형 장기 계열)
      const k = Math.min(cohort.length, Math.floor(quota + 1e-9));
      HOLDN.set(pk, quota - k);
      let order = [...cohort].sort((a, b) => a.id.localeCompare(b.id));
      if (p.hold.select === 'cool') order = [...cohort].sort((a, b) => (a.slot?.tier ?? 9) - (b.slot?.tier ?? 9) || a.id.localeCompare(b.id));
      if (p.hold.select === 'sample' && p.hold.share < 1) {
        const est = new Map<string, number>();
        for (const c of cohort) { const r = applyAction(s, { type: 'sampleCask', caskIds: [c.id] }); if (!r.error) s = r.state; est.set(c.id, knownReads(s).get(c.id)?.estQuality ?? -1); }
        order = [...cohort].sort((a, b) => est.get(b.id)! - est.get(a.id)! || a.id.localeCompare(b.id));
      }
      const longIds = new Set(order.slice(0, k).map((c) => c.id));
      for (const c of cohort) { HOLD.set(key(c), longIds.has(c.id)); if (longIds.has(c.id)) HOLDSTAT.set(pk, (HOLDSTAT.get(pk) ?? 0) + 1); }
    }
    const longReady = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && HOLD.get(key(c)) && c.contents.oakMonths >= p.hold!.age).slice(0, 3);
    const stock10 = s.commerce.products.filter((x) => x.name.startsWith('${LONG_LINE_NAME}')).reduce((a, x) => a + x.stockBottles, 0);
    if (longReady.length && stock10 < 600) s = bottleAs(s, p, longReady.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL })), { name: '${LONG_LINE_NAME}', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
  }
  const stock = stockOf(s, 'whisky');
`);
  patch("c.contents.oakMonths >= minOak && !kept.has(c.id))", "c.contents.oakMonths >= minOak && !kept.has(c.id) && !(p.hold && HOLD.get(`${p.name}|${s.seed}|${c.id}|${c.filledMonth ?? -1}`)))");
  // 4) 이 경로들만 돌린다
  // P8의 ONLY 필터(#289)는 그대로 쓰고, ONLY가 없으면 이 래퍼의 경로(H…)만 돈다
  if (o.filterRun) patch(/const RUN = ONLY \? ALL_RUN\.filter\(\(p\) => ONLY\.has\(p\.name\.split\(' '\)\[0\]!\)\) : ALL_RUN;/, "const RUN = ALL_RUN.filter((p) => /^H[A-ES]/.test(p.name) && (!ONLY || ONLY.has(p.name.split(' ')[0]!)));");
  // 5) 끝 — 같은 시드 짝 비교와 장기 지정 통 수
  if (o.stats) src += `
{
  const nw = new Map<string, number[]>();
  for (const [k, rows] of ALL) nw.set(k.split(' ')[0]!, rows.map((r) => r.nw));
  const pair = (a: string, b: string) => {
    const x = nw.get(a), y = nw.get(b);
    if (!x || !y) return;
    const d = x.map((v, i) => v - y[i]!).filter(Number.isFinite);
    if (d.length < 2) { console.log(\`PAIRED \${a} − \${b}: 생존 판 부족\`); return; }
    const m = d.reduce((t, v) => t + v, 0) / d.length, sd = Math.sqrt(d.reduce((t, v) => t + (v - m) ** 2, 0) / (d.length - 1));
    console.log(\`PAIRED \${a} − \${b}: \${(m / 1e8).toFixed(2)}억 · t \${(m / (sd / Math.sqrt(d.length))).toFixed(1)} · 이긴 시드 \${d.filter((v) => v > 0).length}/\${d.length}\`);
  };
  for (const [a, b] of [['HC', 'HA'], ['HD', 'HA'], ['HD', 'HC'], ['HS', 'HC'], ['HC72', 'HA'], ['HD72', 'HC72'], ['HC6', 'HA6'], ['HD6', 'HC6'], ['HS6', 'HC6'], ['HC672', 'HA6'], ['HD672', 'HC672'], ['HS672', 'HC672']] as const) pair(a, b);
  const held = new Map<string, number[]>();
  for (const [k, v] of HOLDSTAT) { const n = k.split('|')[0]!.split(' ')[0]!; held.set(n, [...(held.get(n) ?? []), v]); }
  console.log('HELD ' + [...held].map(([n, v]) => \`\${n} \${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}통\`).join(' · '));
}
`;
  return src;
}
