// 핸드필 존 (#233, 2026-11-10 오너 요청 — 파트 PROD) — 증류소 탭 "숙성 중인 캐스크" 칸과 숙성고 탭에 끼워 쓴다.
// 설비(핸드필 존)를 지으면 보인다. 위스키 표기가 되는 자사 통 1개를 고르면 비지터 센터 방문객이 매달 그 통에서 500ml씩 담아 간다.
// 시나리오(MVP)는 참 품질을 숨기므로 고르는 목록·값 미리 보기는 샘플로 아는 추정 품질로 보인다(실제 판매는 참값)
import { HANDFILL, handfillBlocker, handfillBottleCost, handfillBottles, handfillCask, handfillPrice, knownReads, lotQuality, type Cask, type SpiritLot, rulesVersionOf, campaignWon, campaignMinOakMonths } from '../../sim';
import { isFlagshipCandidate } from '../../sim/delegateCheck';
import { EQUIPMENT } from '../../sim/content/catalog';
import { protectedCaskIds } from '../../sim/tags';
import { useGame } from '../../store/game';
import { rankHandfill } from './handfillPick';
import { months, won } from '../format';

export function HandfillRow() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const zone = s.production.equipment.find((e) => e.catalogId === HANDFILL.facilityId);
  if (!zone) return null;
  const sel = 'rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800';
  const box = 'mb-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/30';
  if (zone.readyMonth > s.month) return <div className={box}><span className="font-medium">핸드필 존</span> — 공사 중, {zone.readyMonth - s.month}개월 뒤 문을 연다. 그 전에 통을 골라 둘 수 있다.</div>;
  const hide = !!s.scenario;
  const known = knownReads(s);
  // 고를 수 있는 통 — 아는 품질(시나리오는 샘플 추정, 모르면 뒤로) 높은 순
  const q = (c: Cask & { contents: SpiritLot }) => (hide ? known.get(c.id)?.estQuality ?? null : lotQuality(c.contents));
  const options = s.inventory.casks.filter((c): c is Cask & { contents: SpiritLot } => !!c.contents && !handfillBlocker(s, c))
    .sort((a, b) => (q(b) ?? -1) - (q(a) ?? -1) || b.contents.oakMonths - a.contents.oakMonths);
  const cur = handfillCask(s);
  const visitors = s.history.reports.at(-1)?.visitors ?? 0;
  const hasVisitor = s.production.equipment.some((e) => EQUIPMENT[e.catalogId]?.kind === 'visitor' && e.readyMonth <= s.month);
  // 보호 태그 통(#260 — 플래그십 예비 포함)은 고를 수는 있지만 표시한다: 핸드필은 지정한 통에서 매달 저절로 덜어 간다
  const prot = protectedCaskIds(s);
  const label = (c: Cask & { contents: SpiritLot }) => `${c.id} · ${months(c.contents.oakMonths)} · ${Math.round(c.contents.volumeL)}L · 품질 ${q(c) == null ? '모름(샘플 필요)' : Math.round(q(c)!)}${prot.has(c.id) ? ' · ◆ 보호 태그' : ''}`;
  // 다음 통 추천 (6차 판 — 핸드필 통이 빈 뒤 16개월 다시 지정하지 않아 어림 0.4~0.6억을 놓쳤다, docs/playtest/6/prod.md ⑥).
  // 보호 태그 통·12년 후보(승리 전)는 빼고, 아는 품질이 높고 양이 넉넉한 통 — 한 번 눌러 지정한다. 고르는 것은 여전히 플레이어 몫(정보·바로가기)
  const won12 = rulesVersionOf(s) === 'legacy-v15' || campaignWon(s);
  // P-PROD-68(8차 판 전 점검): 추정 최고값이 아니라 같은 나이대 평균 쪽으로 오차만큼 당긴 값으로 순서를 매긴다 — 자동 샘플 오차(±20)에 휘둘리지 않게 (handfillPick.ts)
  const sd = (c: Cask & { contents: SpiritLot }) => (hide ? known.get(c.id)?.sigma ?? 0 : 0);
  const pickable = !cur ? options.filter((c) => !prot.has(c.id) && (won12 || !isFlagshipCandidate(s, c, 'hint'))) : [];
  const pickId = rankHandfill(pickable.map((c) => ({ id: c.id, oakMonths: c.contents.oakMonths, volumeL: c.contents.volumeL, est: q(c), sigma: sd(c) })))[0]?.id;
  const pick = pickId ? pickable.find((c) => c.id === pickId) : undefined;
  const pickLabel = (c: Cask & { contents: SpiritLot }) => `${c.id} · ${months(c.contents.oakMonths)} · ${Math.round(c.contents.volumeL)}L · 품질 ${q(c) == null ? '모름(샘플 필요)' : `약 ${Math.round(q(c)!)}${sd(c) >= 1 ? ` (±${Math.round(sd(c))})` : ''}`}`;
  const cq = cur ? q(cur) : null;
  const bottles = cur ? handfillBottles(visitors, cur.contents) : 0;
  const price = cur && cq != null ? handfillPrice(s, cur.contents, cq) : null;
  const left = cur && bottles > 0 ? Math.floor(cur.contents.volumeL / (HANDFILL.bottleMl / 1000) / bottles) : null;
  return (
    <div className={box}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-amber-900 dark:text-amber-200">핸드필 존</span>
        <select className={sel} aria-label="핸드필 전용 통" value={cur?.id ?? ''} onChange={(e) => dispatch({ type: 'setHandfillCask', caskId: e.target.value || null })}>
          <option value="">통 고르기 (지정 안 함)</option>
          {cur && !options.some((c) => c.id === cur.id) && <option value={cur.id}>{label(cur)}</option>}
          {options.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </select>
        {!options.length && !cur && <span className="text-stone-500">위스키 숙성 기간을 채운 자사 나무 통이 아직 없다</span>}
        {pick && hasVisitor && (
          <button type="button" className="rounded border border-amber-400 bg-white px-1.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-stone-800 dark:text-amber-200" title="보호 태그 통·12년 후보는 뺀 추천 — 다른 통은 왼쪽 목록에서 고른다. 샘플 추정은 오차가 커서(자동 샘플만 뜬 통은 ±20) 가장 높게 읽힌 통이 실제로 가장 좋은 통이 아닐 때가 많다 — 같은 나이대(2년) 통들의 추정 평균 쪽으로 오차만큼 당겨 순서를 매겼다. 통에서 직접 샘플을 여러 번 뜨면 오차가 줄어 그 통의 추정이 더 믿을 만해진다" onClick={() => dispatch({ type: 'setHandfillCask', caskId: pick.id })}>
            추천 통 지정: {pickLabel(pick)}
          </button>
        )}
        {cur && prot.has(cur.id) && <span className="text-amber-800 dark:text-amber-300">⚠ 보호 태그 통이다(플래그십 예비 등) — 핸드필이 매달 덜어 간다. 남기려면 다른 통을 고르세요</span>}
        {/* F5c(MKT 검토 A): 승리 구절은 보호 태그가 아니라 후보 여부(자가 몰트·안내 지평)에 묶고, 승리 뒤에는 띄우지 않는다 */}
        {cur && rulesVersionOf(s) !== 'legacy-v15' && !campaignWon(s) && isFlagshipCandidate(s, cur, 'hint') && <span className="text-amber-800 dark:text-amber-300">이 통이 12년(목재 {campaignMinOakMonths(s)}개월)을 넘기면 핸드필 판매가 캠페인 승리로 기록된다(결정 #318 — 등급 최대 A)</span>}
      </div>
      <div className="mt-1 text-stone-600 dark:text-stone-400">
        {!hasVisitor ? '비지터 센터가 문을 열어야 손님이 온다.'
          : !cur ? `방문객(지난달 ${visitors.toLocaleString()}명)의 약 ${Math.round(HANDFILL.buyRate * 100)}%가 지정한 통에서 ${HANDFILL.bottleMl}ml를 직접 담아 간다 — 같은 통을 병입할 때 권장 출고가의 약 ${HANDFILL.priceFactor}배. 대신 그 통은 플래그십·병입에 쓸 수 없게 줄어든다.`
            : <>이번 달 예상: <b>{bottles.toLocaleString()}병</b>{price != null ? <> × {won(price)} ≈ <b>{won(bottles * price)}</b></> : ' — 값은 샘플을 떠야 안다'} (병·라벨 {won(handfillBottleCost())}/병){left != null ? ` · 이 속도면 약 ${left}개월 뒤 빈다` : ''}{cq == null && hide ? ' · 품질 모름 — 샘플을 뜨면 값이 보인다' : ''}</>}
      </div>
    </div>
  );
}
