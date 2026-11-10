import { useMemo, useState } from 'react';
import {
  blendTargets, blenderOf, HEX_AXES, HEX_LABEL, knownReads, LAB, matchScore, mixHex, optimizeShares, reachableEnvelope, SAMPLING, samplingCapacity,
  type BlendComponent, type BlendTarget, type Cask, type Hex,
} from '../../sim';
import { useGame } from '../../store/game';
import { delegateCheck } from '../../sim/delegateCheck';
import { months, num, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Table, Td, TextField } from '../kit';

// 블렌딩 테이블 (결정 #124, docs/design/blending-minigame.md) — 웹 프로토타입(와이어프레임). 최종 화면은 Godot에서 만든다(결정 #122).
// 캐스크는 같은 배치·같은 캐스크 종류끼리 묶어(코호트) 보여 준다 — 2,500개를 한 줄씩 보여 주지 않는다.

/** read = 샘플 기록(형제 기록 포함)의 평균 — 기록이 하나도 없으면 null(모른다, #157). known = 기록을 아는 통 수, readMonth = 가장 오래된 기록의 달 */
interface Cohort { key: string; label: string; casks: Cask[]; read: Hex | null; sigma: number; known: number; readMonth: number | null; lpa: number; oakMonths: number; rare: boolean; samples: number; lab: boolean }
type KnownCohort = Cohort & { read: Hex };
const isKnown = (c: Cohort): c is KnownCohort => c.read != null;

const SOURCE_LABEL: Record<BlendTarget['source'], string> = { trend: '트렌드', critic: '의뢰', core: '코어 레인지' };

function cohortsOf(s: ReturnType<typeof useGame.getState>['state']): Cohort[] {
  const groups = new Map<string, Cask[]>();
  for (const c of s.inventory.casks) {
    const l = c.contents;
    if (!l || c.owner || (l.kind !== 'malt' && l.kind !== 'grain')) continue;
    // 레어로 드러난 캐스크는 따로 — 싱글 캐스크 병입 후보
    const key = c.rare && c.rareKnown ? `rare:${c.id}` : `${l.batchId ?? l.recipeId}:${c.filledMonth}:${c.typeId}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const known = knownReads(s);
  return [...groups.entries()].map(([key, casks]) => {
    const reads = casks.map((c) => known.get(c.id)).filter((r) => r != null);
    const read = reads.length ? mixHex(reads.map((r) => ({ hex: r.hex, share: 1 }))) : null;
    const first = casks[0]!;
    return {
      key, casks, read,
      sigma: reads.length ? reads.reduce((t, r) => t + r.sigma, 0) / reads.length : 0,
      known: reads.length,
      readMonth: reads.length ? Math.min(...reads.map((r) => r.month)) : null,
      lpa: casks.reduce((t, c) => t + c.contents!.volumeL * c.contents!.abv, 0),
      oakMonths: Math.min(...casks.map((c) => c.contents!.oakMonths)),
      rare: key.startsWith('rare:'),
      samples: Math.min(...casks.map((c) => c.samples ?? 0)),
      lab: casks.every((c) => c.labAnalyzed),
      label: `${first.contents!.name.split(' → ')[0]} · ${first.typeId}${casks.length > 1 ? ` × ${casks.length}` : ` (${first.id})`}`,
    };
  }).sort((a, b) => b.oakMonths - a.oakMonths);
}

/** 육각형 레이더 — 목표(점선), 도달 가능 범위(옅은 띠), 예상 ± 오차(띠), 실제(공개 후) */
function HexRadar({ target, predicted, band, envelope, actual, size = 260 }: { target?: Hex; predicted?: Hex; band?: number; envelope?: { min: Hex; max: Hex } | null; actual?: Hex; size?: number }) {
  const c = size / 2;
  const r = c - 34;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / HEX_AXES.length;
    const k = Math.max(0, Math.min(100, v)) / 100;
    return `${c + Math.cos(ang) * r * k},${c + Math.sin(ang) * r * k}`;
  };
  const poly = (h: Hex, d = 0) => HEX_AXES.map((a, i) => pt(i, h[a] + d)).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="블렌딩 레이더" className="text-stone-400 dark:text-stone-600">
      {[25, 50, 75, 100].map((g) => <polygon key={g} points={HEX_AXES.map((_, i) => pt(i, g)).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.3} />)}
      {HEX_AXES.map((a, i) => {
        const [x, y] = pt(i, 118).split(',');
        return <text key={a} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-stone-600 text-[10px] dark:fill-stone-300">{HEX_LABEL[a]}</text>;
      })}
      {envelope && <polygon points={poly(envelope.max)} className="fill-sky-400/10 stroke-sky-400/40" strokeDasharray="2 2" />}
      {predicted && band != null && <polygon points={poly(predicted, band)} className="fill-amber-400/20 stroke-none" />}
      {predicted && <polygon points={poly(predicted)} className="fill-none stroke-amber-600 dark:stroke-amber-400" strokeWidth={1.5} />}
      {target && <polygon points={poly(target)} className="fill-none stroke-rose-600 dark:stroke-rose-400" strokeWidth={1.5} strokeDasharray="5 3" />}
      {actual && <polygon points={poly(actual)} className="fill-emerald-500/20 stroke-emerald-600 dark:stroke-emerald-400" strokeWidth={2} />}
    </svg>
  );
}

const hexRow = (h: Hex) => HEX_AXES.map((a) => num(h[a])).join(' · ');

export function BlendLab() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const targets = useMemo(() => blendTargets(s), [s]);
  const cohorts = useMemo(() => cohortsOf(s), [s]);
  const [targetId, setTargetId] = useState('trend');
  const [shares, setShares] = useState<Record<string, number>>({});
  const [bottles, setBottles] = useState(1000);
  const [abv, setAbv] = useState(46);
  const [name, setName] = useState('');
  const [line, setLine] = useState('');
  // [블렌더에게 맡기기] 확인 (P-PROD-33, 5차 플레이테스트) — 바로 확정되는 줄 모르고 연달아 눌러 위스키 통이 모두 사라졌다.
  // 첫 누름은 쓸 통·병 수·남는 위스키 통을 보이고, 두 번째에 맡긴다. 이번 달 같은 목표로 이미 맡겼으면 한 번 더 묻는다(세 번째)
  const [armed, setArmed] = useState<{ key: string; step: number } | null>(null);
  const blender = blenderOf(s);
  const target = targets.find((t) => t.id === targetId) ?? targets[0]!;

  // 비율은 기록이 있는 코호트에만 줄 수 있다 — 맛보지 않은 원액은 예상을 만들 수 없다 (#157)
  const knownCohorts = cohorts.filter(isKnown);
  const picked = knownCohorts.filter((c) => (shares[c.key] ?? 0) > 0);
  const total = picked.reduce((t, c) => t + shares[c.key]!, 0);
  const predicted = picked.length ? mixHex(picked.map((c) => ({ hex: c.read, share: shares[c.key]! }))) : undefined;
  const band = picked.length ? Math.sqrt(picked.reduce((t, c) => t + ((shares[c.key]! / total) * c.sigma) ** 2, 0)) : undefined;
  const envelope = reachableEnvelope(knownCohorts.map((c) => c.read));
  const best = useMemo(() => {
    const ks = cohorts.filter(isKnown);
    if (!ks.length) return null;
    const x = optimizeShares(ks.map((c) => c.read), target);
    return { score: matchScore(mixHex(ks.map((c, i) => ({ hex: c.read, share: x[i]! }))), target), shares: Object.fromEntries(ks.map((c, i) => [c.key, Math.round(x[i]! * 100)]).filter(([, v]) => (v as number) > 0)) };
  }, [cohorts, target]);
  const unknownCount = cohorts.length - knownCohorts.length;
  const lastBlend = [...s.commerce.products].reverse().find((p) => p.hex && p.createdMonth === s.month);

  // 비율(알코올 기준) → 캐스크별 사용량(L). 코호트 안에서는 원액 양에 비례해 나눈다
  const components: BlendComponent[] = (() => {
    const needLPA = (bottles * 0.7 * abv) / 100;
    const out: BlendComponent[] = [];
    for (const c of picked) {
      const lpa = Math.min(c.lpa, (shares[c.key]! / total) * needLPA);
      for (const k of c.casks) {
        const kl = k.contents!.volumeL * k.contents!.abv;
        const l = Math.floor(((lpa * kl) / c.lpa / k.contents!.abv) * 10) / 10;
        if (l >= 0.5) out.push({ source: 'cask', id: k.id, liters: l });
      }
    }
    return out;
  })();
  const options = { name, targetAbv: abv / 100, bottleMl: 700, chillFilter: false, packagingId: 'standard', targetId: target.source === 'core' ? undefined : target.id, line: target.source === 'core' ? target.id.slice(5) : line || undefined };
  const capLeft = samplingCapacity(s) - s.inventory.samplesThisMonth;
  const delegateIds = (picked.length ? picked : knownCohorts).flatMap((c) => c.casks.map((k) => k.id));
  const delegateKey = JSON.stringify([s.month, target.id, delegateIds, bottles, options]);
  const delegateStep = armed?.key === delegateKey ? armed.step : 0; // 조건이 바뀌면 처음부터 다시 묻는다
  const check = delegateStep > 0 && knownCohorts.length ? delegateCheck(s, target, delegateIds, bottles, options) : null;

  return (
    <div className="grid gap-4">
      <Card title="블렌딩 테이블 — The Art of Blending" actions={<span className="text-xs text-stone-500">{blender ? `마스터 블렌더 ${blender.name} · Lv.${blender.level} · 읽기 ${num(blender.nose)} · 감정력 ${blender.appraisal}` : '마스터 블렌더 없음 — 대표가 직접 읽는다(오차 큼). 직원 탭에서 채용'}</span>}>
        <div className="flex flex-wrap items-start gap-4">
          <HexRadar target={target.hex} predicted={predicted} band={band} envelope={envelope} actual={lastBlend?.hex} />
          <div className="grid min-w-64 flex-1 gap-2 text-sm">
            <div className="flex flex-wrap gap-1">
              {targets.map((t) => (
                <Button key={t.id} small variant={t.id === target.id ? 'primary' : 'secondary'} onClick={() => setTargetId(t.id)}>
                  {SOURCE_LABEL[t.source]}{t.expiresMonth != null ? ` · ${months(t.expiresMonth - s.month)} 남음` : ''}
                </Button>
              ))}
            </div>
            <div className="font-medium">{target.label}</div>
            <div className="text-xs text-stone-500">목표 {hexRow(target.hex)} · 허용 {target.tolerance}{target.weights ? ` · 중점 ${Object.keys(target.weights).map((a) => HEX_LABEL[a as keyof typeof HEX_LABEL]).join('·')}` : ''}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>예상 일치 <b className="tabular-nums">{predicted ? `${matchScore(predicted, target)}점` : '—'}</b> {band != null && <span className="text-xs text-stone-500">(예상 오차 ±{num(band, 1)})</span>}</div>
              <div>이 재고의 최고 점수(블렌더 추정) <b className="tabular-nums">{best ? `${best.score}점` : '—'}</b></div>
            </div>
            <p className="text-xs text-stone-500">빨간 점선 = 목표 · 주황 = 예상(띠 = 오차) · 파란 점선 = 샘플 기록으로 닿는 축별 최대 · 초록 = 이번 달 병입 결과(공개). 실제 결과는 결정론이고, 틀리는 건 블렌더가 읽은 값과 <b>샘플 뒤에 숙성이 바꾼 만큼</b>이다 — 오래된 샘플은 다시 떠야 한다.</p>
            {unknownCount > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">샘플 기록이 없는 코호트 {unknownCount}개는 비율을 줄 수 없고 위임에서도 빠진다 — 아래에서 샘플을 뜨세요.</p>}
            <div className="flex flex-wrap items-end gap-2">
              <NumberField label="병 수" value={bottles} min={50} max={50_000} step={50} onCommit={setBottles} />
              <NumberField label="도수" value={abv} min={40} max={65} step={0.5} suffix="%" onCommit={setAbv} />
              <TextField label="제품명" value={name} onChange={setName} width="w-36" />
              {target.source !== 'core' && <TextField label="코어 레인지(선택)" value={line} onChange={setLine} width="w-32" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!components.length} onClick={() => dispatch({ type: 'bottle', components, options })}>배팅 확정·병입</Button>
              <Button variant={delegateStep > 0 ? 'danger' : 'secondary'} disabled={!knownCohorts.length} title="선택한 코호트(없으면 샘플 기록이 있는 전체) 안에서 블렌더가 기록을 보고 비율을 정한다 — 서툴거나 샘플이 오래되면 빗나간다. 누르면 먼저 쓸 통을 보여 주고, 한 번 더 누르면 맡긴다"
                onClick={() => {
                  const c = check ?? delegateCheck(s, target, delegateIds, bottles, options); // 첫 누름에는 아직 계산 전 — 여기서 잰다
                  if ('error' in c) { dispatch({ type: 'delegateBlend', targetId: target.id, caskIds: delegateIds, bottles, options }); return; } // 맡길 수 없는 경우 — 오류 문구는 행동이 낸다(아무것도 바뀌지 않는다)
                  const need = c.alreadyThisMonth.length ? 2 : 1;
                  if (delegateStep < need) { setArmed({ key: delegateKey, step: delegateStep + 1 }); return; }
                  setArmed(null);
                  dispatch({ type: 'delegateBlend', targetId: target.id, caskIds: delegateIds, bottles, options });
                }}>{delegateStep === 0 ? '블렌더에게 맡기기' : check && !('error' in check) && check.alreadyThisMonth.length && delegateStep === 1 ? '이번 달 이미 맡겼다 — 한 번 더 누르면 계속' : `한 번 더 누르면 맡긴다 — 통 ${check && !('error' in check) ? check.casks.length : '?'}개 사용`}</Button>
              {delegateStep > 0 && <Button variant="ghost" onClick={() => setArmed(null)}>취소</Button>}
              {best && <Button variant="ghost" onClick={() => setShares(best.shares)}>블렌더 추천 비율 불러오기</Button>}
              <Button variant="ghost" onClick={() => setShares({})}>비율 초기화</Button>
            </div>
            {check && !('error' in check) && (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs dark:border-rose-800 dark:bg-rose-950/40">
                <div className="font-medium text-rose-900 dark:text-rose-200">맡기면 바로 병입된다 — 되돌릴 수 없다</div>
                <div className="mt-1">약 <b>{num(check.bottles)}병</b> · 쓸 통 <b>{check.casks.length}개</b>({check.casks.filter((c) => c.empties).length}개는 비워짐): {check.casks.map((c) => `${c.id} ${num(c.liters, 1)}L${c.empties ? '(비움)' : ''}`).join(', ')}</div>
                <div>남는 위스키 통 <b>{check.whiskyBefore} → {check.whiskyLeft}개</b>{check.unknown ? ` · 샘플 기록이 없는 ${check.unknown}통은 빠진다` : ''}</div>
                {check.warnings.map((w) => <div key={w} className="mt-1 font-medium text-rose-800 dark:text-rose-300">⚠ {w}</div>)}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title={`숙성 원액 코호트 — 샘플링 여력 ${Math.max(0, capLeft)}/${samplingCapacity(s)}회 (회당 ${won(SAMPLING.cost)}·${SAMPLING.lossL}L) · 실험실 분석 ${won(LAB.cost)}/캐스크`}>
        {!cohorts.length ? <Empty>몰트·그레인 원액이 든 캐스크가 없습니다</Empty> : (
          <Table head={['코호트', '숙성', 'LPA', '샘플 기록 육각형 (피트·과일·플로럴·스파이시·우디·스위트)', '오차', '정보', '비율(%)', '']}>
            {cohorts.map((c) => (
              <tr key={c.key}>
                <Td className="text-xs">{c.label} {c.rare && <Badge tone="good">레어</Badge>}</Td>
                <Td right>{months(c.oakMonths)}</Td>
                <Td right>{num(c.lpa)}</Td>
                <Td className="text-xs tabular-nums">{c.read ? hexRow(c.read) : <span className="text-stone-500">샘플 없음 — 모른다</span>}</Td>
                <Td right>{c.read ? `±${num(c.sigma, 1)}` : '—'}</Td>
                <Td className="text-xs">
                  {c.casks.length > 1 ? `직접 샘플 ${c.casks.filter((k) => k.sampleLog?.length).length}/${c.casks.length}통` : `샘플 ${c.casks[0]!.samples ?? 0}회`}{c.lab ? ' · GC' : ''}
                  {c.readMonth != null && <div className={s.month - c.readMonth >= 12 ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500'}>기록 {s.month - c.readMonth > 0 ? `${months(s.month - c.readMonth)} 전` : '이번 달'}{c.known > c.casks.filter((k) => k.sampleLog?.length).length ? ' (나머지는 빌린 기록)' : ''}</div>}
                </Td>
                <Td>{c.read ? <NumberField value={shares[c.key] ?? 0} min={0} max={100} width="w-16" onCommit={(v) => setShares({ ...shares, [c.key]: v })} /> : <span className="text-xs text-stone-500">—</span>}</Td>
                <Td>
                  <div className="flex gap-1">
                    {c.casks.length > 1 && <Button small disabled={capLeft < 1} title="샘플을 가장 적게 뜬 1통만 — 같은 묶음의 다른 통은 이 기록을 빌린다" onClick={() => dispatch({ type: 'sampleCask', caskIds: [[...c.casks].sort((x, y) => (x.samples ?? 0) - (y.samples ?? 0))[0]!.id] })}>1통</Button>}
                    <Button small disabled={capLeft < c.casks.length} title="코호트 안 캐스크 전부에서 1회씩" onClick={() => dispatch({ type: 'sampleCask', caskIds: c.casks.map((k) => k.id) })}>{c.casks.length > 1 ? '전부' : '샘플'}</Button>
                    <Button small disabled={c.lab} onClick={() => dispatch({ type: 'labAnalyze', caskIds: c.casks.map((k) => k.id) })}>GC</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">같은 배치를 같은 캐스크에 나눠 담은 묶음은 한 줄로 보인다. 육각형은 마지막 샘플을 뜬 순간의 기록이고 다음 샘플 전까지 움직이지 않는다 — 한 통만 떠도 같은 묶음의 다른 통은 그 기록을 빌린다. 레어 캐스크는 샘플을 뜰 때 감정력으로 드러나고, 혼자 병입하면 레어 싱글 캐스크가 된다.</p>
      </Card>
    </div>
  );
}
