// 빈 통 관리 (결정 #345 GAP-PROD-7, 2026-11-23 — 파트 PROD, 화면만·규칙 0) — 숙성고 탭(샌드박스 전용, #136 참값 화면)에만 있던
// 재탄화 · 시즈닝 통 주문 · 중고 통 매각을 홈(ARCH가 끼움)에서 쓰게 한다. 행동은 캠페인에서 처음부터 열려 있었다(잠금 키 없음) — 버튼만 없었다.
// 숨김 정보: 활성도는 빈 통 표가 원래 보이던 값이고(스팟 통은 6개월 숙성 전 "?"), 12년 감점 전망은 활성도만으로 센다(warehouse.ts tanninOutlook — 원액 맛을 읽지 않는다).
// 안내 (#339 · #745): 재탄화는 활성도를 0.7까지 올린다 → 3년용 통에는 좋고, 12년용으로 아껴 둔 재사용 통(활성도 0.6~0.13)에는 탄닌이 다시 늘어 손해다
import { useState } from 'react';
import type { StillShape } from '../../sim/types';
import { CASK_MARKET, CASKS, RECHAR_COST } from '../../sim/content/catalog';
import { caskSlots, EMPTY_ACTIVITY_FACTOR, MAX_RECHAR, regionalCaskPrice, tanninOutlook, vesselMaterial, type Cask, type CaskTypeId } from '../../sim';
import { fillTanninOutlook } from '../../sim/warehouse';
import { fillOutlookQuality } from '../../sim/agedOutlook'; // [H1] 12년 품질 어림(점수)
import { campaignMinOakMonths } from '../../sim/rules';
import { usedCaskPrice } from '../../sim/casks';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Button, ConfirmButton, NumberField } from '../kit';

/** 활성도가 이보다 낮으면 나무 향이 모자라 12년 품질도 다시 내려간다(#745 표 — 6번째 채움부터). 홈 숙성 칸 표시(ARCH #781)와 같은 문턱 */
const WOOD_WEAK = 0.1;
/** 시즈닝 계약을 할 수 있는 통 — 시즈닝이 있는 종류만(#158) */
const SEASONABLE = ['ex_bourbon_barrel', 'oloroso_butt', 'sherry_hogshead'] as const; // #355: 계약은 버번 · 셰리 계열만(SEASONING_CONTRACT)
type Seasonable = (typeof SEASONABLE)[number];

interface Group { key: string; casks: Cask[]; head: Cask }

export function CaskCareRow() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [seasonType, setSeasonType] = useState<Seasonable>('oloroso_butt');
  const [seasonQty, setSeasonQty] = useState(2);
  // 다 쓴(1번 이상 채운) 빈 나무 통 — 재탄화·중고 매각은 이 통들만 된다. 같은 종류·횟수·활성도·상태끼리 묶어 한 줄로
  const used = s.inventory.casks.filter((c) => !c.contents && vesselMaterial(c) === 'wood' && c.fills > 0);
  const groups: Group[] = [];
  for (const c of used) {
    const key = `${c.typeId}|${c.fills}|${c.recharCount}|${c.activityKnown === false ? '?' : c.activity.toFixed(2)}|${c.contaminationKnown ? 'x' : ''}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.casks.push(c); else groups.push({ key, casks: [c], head: c });
  }
  groups.sort((a, b) => a.head.typeId.localeCompare(b.head.typeId) || a.head.fills - b.head.fills);
  const unit = Math.round(regionalCaskPrice(s, seasonType) * CASK_MARKET.seasoningCostFactor);
  const box = 'mb-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-800/50';
  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-stone-700 dark:text-stone-200">빈 통 관리</span>
        <span className="text-stone-500">재탄화는 <b>3년용 통</b>에 — 활성도가 0.7로 올라 빨리 익는다. 12년용은 2~5번 쓴 통(활성도 0.6~0.13)을 그대로 둔다(재탄화하면 12년 탄닌이 다시 는다) · 오염 통은 재탄화해야 다시 쓸 수 있다</span>
      </div>
      {!groups.length ? (
        <div className="mt-1 text-stone-500">다 쓴 빈 나무 통이 없다 — 병입·핸드필로 통이 비면 여기서 재탄화하거나 판다.</div>
      ) : (
        <div className="mt-1 grid gap-1">
          {groups.map(({ key, casks, head }) => {
            const known = head.activityKnown !== false;
            // 오염 통은 재탄화해야만 다시 쓰고, 재탄화하면 활성도가 0.7이 된다 → 지금 활성도로 센 12년 전망은 맞지 않아 보이지 않는다
            const o = known && !head.contaminationKnown ? tanninOutlook(s, head) : null;
            const canRechar = head.recharCount < MAX_RECHAR;
            // #360 · #363: v16 캠페인에서 400L 이상 통은 숙성고 2칸 — 코어 caskSlots가 2일 때만 표시(옛 판 · 샌드박스는 저절로 빠짐)
            const slots = caskSlots(s, head.sizeL);
            return (
              <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0">
                  <b>{CASKS[head.typeId].nameKo}</b> · {head.fills}번 쓴 통 ×{casks.length}{slots > 1 && <span className="text-stone-500"> · 숙성고 {slots}칸씩</span>}
                  {' '}· 활성도 {known ? head.activity.toFixed(2) : '? (스팟 매입)'}
                  {head.recharCount > 0 && ` · 재탄화 ${head.recharCount}/${MAX_RECHAR}`}
                  {head.contaminationKnown && <span className="font-medium text-rose-700 dark:text-rose-400"> · 오염 — 재탄화해야 다시 쓸 수 있다(재탄화하면 활성도 {Math.max(head.activity, 0.7).toFixed(2)})</span>}
                  {o && <span className={o.penalty >= 5 || o.activity < WOOD_WEAK ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}>
                    {' '}· 다음에 채우면 12년 {o.activity < WOOD_WEAK ? '나무 향 약함(품질 다시 내려감)' : o.penalty >= 0.5 ? `감점 약 ${Math.round(o.penalty)}` : '감점 없음'}
                  </span>}
                </span>
                <span className="flex flex-wrap gap-1">
                  <Button small disabled={!canRechar} onClick={() => dispatch({ type: 'rechar', caskId: head.id })}
                    title={canRechar ? `활성도를 0.7까지 되살린다(시즈닝 향은 돌아오지 않는다) · 오염 통은 재탄화로 깨끗해진다 — 최대 ${MAX_RECHAR}회` : `재탄화는 통마다 ${MAX_RECHAR}회까지`}>
                    재탄화 1통 {won(RECHAR_COST)}
                  </Button>
                  <ConfirmButton small variant="ghost" armKey={`care-sell-${head.id}@${s.month}`} armedLabel="한 번 더 누르면 매각" onConfirm={() => dispatch({ type: 'sellUsedCask', caskId: head.id })}
                    preview={() => <>{head.id}({CASKS[head.typeId].nameKo}, {head.fills}번 사용)를 {won(usedCaskPrice(head))}에 판다 — 통이 숙성고에서 사라진다{slots > 1 ? ` · 숙성고 ${slots}칸이 빈다` : ''}</>}>
                    중고 매각 1통 {won(usedCaskPrice(head))}
                  </ConfirmButton>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-1.5 dark:border-stone-700">
        <span className="text-stone-600 dark:text-stone-400">시즈닝 통 주문</span>
        <select className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800" aria-label="시즈닝 통 종류" value={seasonType} onChange={(e) => setSeasonType(e.target.value as Seasonable)}>
          {SEASONABLE.map((k) => <option key={k} value={k}>{CASKS[k].nameKo}</option>)}
        </select>
        <NumberField label="개수" value={seasonQty} min={1} max={50} width="w-14" onCommit={setSeasonQty} />
        <Button small onClick={() => dispatch({ type: 'orderSeasoning', caskType: seasonType, qty: seasonQty })}
          title={`새 통을 ${CASKS[seasonType].seasoningType === 'sherry' ? '셰리 보데가' : '버번 증류소'}에 맡겨 ${CASK_MARKET.seasoningMonths}개월 길들인다 — 시즈닝 향이 진하고 활성도도 조금 오른다(12년 탄닌↑). 숙성고 자리는 지금부터 잡는다`}>
          {CASK_MARKET.seasoningMonths}개월 뒤 받기 · {won(unit * seasonQty)}
        </Button>
        <span className="text-stone-500">시즈닝한 통은 활성도도 조금 오른다(×1.1) — 12년용으로는 탄닌이 는다</span>
      </div>
    </div>
  );
}

/**
 * 통 사기 화면의 탄닌 전망 한 줄 ([결정 #355] PM 지시 — ARCH가 통 사기 칸에 끼운다). 새 통으로 지금 채우면 3년 · 12년에 탄닌이 어디쯤인지 —
 * 버진 오크(활성도 1.4)는 "3년용"이고 european 시즈닝 통은 "피니싱용"이라는 성격을 숫자로 보인다. 활성도만으로 센 어림(tanninOutlook, 원액 맛을 읽지 않는다)
 */
export function NewCaskOutlook({ typeId }: { typeId: CaskTypeId }) {
  const s = useGame((g) => g.state);
  const d = CASKS[typeId];
  if (!d || vesselMaterial({ typeId }) !== 'wood') return null;
  const fresh = { id: '__new', typeId, sizeL: d.sizeL, wood: d.wood, activity: d.activity, seasoning: d.seasoning, fills: 0, recharCount: 0, char: d.char } as Cask;
  const y3 = tanninOutlook(s, fresh, 36);
  const y12 = tanninOutlook(s, fresh);
  // 비웠다 다시 쓴 통(활성도 × EMPTY_ACTIVITY_FACTOR) — 12년은 재사용 통이 맞다는 #339 힌트와 같은 셈. 재사용해도 감점이 크면 본숙성보다 3년 · 피니싱용
  const refill = tanninOutlook(s, { ...fresh, activity: d.activity * EMPTY_ACTIVITY_FACTOR });
  if (!y3 || !y12 || !refill) return null;
  const shortUse = refill.penalty >= 10;
  return (
    <span className={shortUse ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'} title="새 통으로 지금 채우면 — 활성도만으로 센 탄닌 어림(평년 칸 기후). 시즈닝 향은 탄닌을 더하지 않는다. 비웠다 다시 쓰면 활성도가 ×0.6이 되어 탄닌이 덜 는다">
      탄닌 어림 3년 {Math.round(y3.tannin)} · {Math.round(y12.atMonths / 12)}년 {Math.round(y12.tannin)}(상한 {y12.cap}{y12.penalty >= 0.5 ? `, 감점 약 ${Math.round(y12.penalty)}` : ''}) · 다시 쓰면 {Math.round(y12.atMonths / 12)}년 감점 {refill.penalty >= 0.5 ? `약 ${Math.round(refill.penalty)}` : '없음'}{shortUse ? ' — 12년 본숙성보다 3년 · 피니싱용' : ''}
    </span>
  );
}

/**
 * [결정 #410 T1-a] 통을 채울 때 12년 전망 한 줄 — 고른 빈 통에 지금 넣으면 12년(기준 개월) 무렵 탄닌 · 감점 어림. 숙성고 탭(PROD) · 홈 통입 줄(ARCH)이 같이 쓴다.
 * 활성도만 읽는다(원액 맛 · 품질 아님). 감점은 탄닌 몫이라 품질 전체가 아니다(9차 §10.3) — 그래서 「옮기라」는 권유는 하지 않는다(#411)
 */
export function FillOutlookLine({ caskIds, shape, lotId }: { caskIds: readonly string[]; /** [결정 #422] 채울 원액의 증류기 형태(공개 값) — 헤비 원액 × 셰리 통의 탄닌 반응을 전망에 넣는다 */ shape?: StillShape; /** [H1] 채울 원액 — 있으면 12년 품질 어림(점수)으로 말한다(#1205 「12년 전망」과 같은 식) */ lotId?: string }) {
  const s = useGame((g) => g.state);
  const casks = s.inventory.casks.filter((c) => caskIds.includes(c.id));
  const lot = lotId ? s.inventory.lots.find((l) => l.id === lotId) : undefined;
  const yrs = Math.round(campaignMinOakMonths(s) / 12);
  // [H1] 10차 오너: 「12년 감점 약 19」를 "무슨 말인지 이해가 안 갔다" → 품질 점수와 리필 통 비교로 말한다(오너 승인 H1 표 — 「무엇을 하라」 권고는 붙이지 않는다, #367 · #411 오너 확인 전). 숫자는 병입 탭 「12년 전망」과 같은 PROD `caskOutlookQuality`(공개 값 — 레시피 미리보기 · 통 · 칸)
  const fq = lot ? fillOutlookQuality(s, casks, lot) : null;
  if (fq && fq.count > fq.unknown) {
    const q = fq.qMin === fq.qMax ? `약 ${Math.round(fq.qMax)}점` : `약 ${Math.round(fq.qMin)} ~ ${Math.round(fq.qMax)}점`;
    const loss = Math.round(fq.lossMax);
    const better = fq.refill && fq.refill.q - fq.qMax >= 3 ? fq.refill : null;
    return (
      <span className={`text-xs ${loss >= 5 ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`} title={`이 원액 레시피(생산 미리보기)를 이 통에 넣어 ${yrs}년 동안 그 칸 평년 기후로 숙성해 46%로 낸 어림 — 원액 실제 맛 · 숨은 오염은 넣지 않는다. 지금 샘플 품질과는 다르다(새 통은 3 ~ 5년에 좋고 오래 두면 나무 맛이 넘친다)`}>
        이 통{fq.count > 1 ? ` ${fq.count}개` : ''}에 넣어 {yrs}년을 채우면 품질 어림 {q}{loss >= 5 ? ` — 나무 맛(탄닌)이 넘쳐 약 ${loss}점 깎인다` : ''}
        {better && <> · 리필(한 번 쓴) 통이면 약 {Math.round(better.q)}점</>}
        {fq.unknown ? ` · 활성도 모르는 통 ${fq.unknown}개(스팟 매입 — 6개월 숙성 뒤 드러남)` : ''}
      </span>
    );
  }
  const o = fillTanninOutlook(s, casks, undefined, shape);
  if (!o) return null;
  const known = o.count - o.unknown;
  const pen = (n: number) => (n >= 0.5 ? `나무 맛이 넘쳐 품질 약 ${Math.round(n)}점 깎임` : '나무 맛 넘침 없음');
  const range = !known ? null : o.minPenalty === o.maxPenalty ? pen(o.maxPenalty) : `${pen(o.minPenalty)} ~ ${Math.round(o.maxPenalty)}점`;
  return (
    <span className={`text-xs ${o.maxPenalty >= 5 ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`} title={`지금 채우면 — 통마다 활성도 · 칸 기후로 센 탄닌 어림(${yrs}년 = 목재 ${o.atMonths}개월, 위스키 탄닌 상한 ${o.cap}). 탄닌이 상한을 넘는 몫만이라 품질 전체가 아니다. 원액 맛은 읽지 않는다`}>
      이 통{o.count > 1 ? ` ${o.count}개` : ''}에 넣으면 {yrs}년 무렵 {range ?? ''}{o.unknown ? `${range ? ' · ' : ''}활성도 모르는 통 ${o.unknown}개(스팟 매입 — 6개월 숙성 뒤 드러남)` : ''}
    </span>
  );
}
