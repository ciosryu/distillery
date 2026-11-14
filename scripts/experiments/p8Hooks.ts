// P8(mvp-human.ts) 끼움 자리 — 래퍼가 P8 소스를 글자 그대로 찾아 바꾸지 않고, **이름 붙은 자리**에 함수를 건다 (PM 2026-11-14 · PROD 제안 채택)
// 이유: 글자 패치 래퍼가 P8 변경에 세 번 깨졌다(#412 · F4 `newScenarioGame` 줄 · #537 `fill`).
//
// 쓰는 법(래퍼):
//   import { setP8Hooks } from './p8Hooks';
//   setP8Hooks({ afterCreate: (s, p, seed) => …, afterMonth: (s, p, m, seed) => … });
//   await import('./mvp-human.ts');   // 또는 지금처럼 사본을 가져온다. 같은 프로세스라 전역 등록이 보인다
//
// 규칙
// - 등록이 없으면(P8을 그냥 돌릴 때) 모든 자리가 아무 일도 하지 않는다 → 출력 바이트 동일.
// - 상태를 돌려주는 자리는 `GameState | void`다. 돌려주면 그 상태로 이어 가고, 돌려주지 않으면 P8 그대로다.
//   "대신하는" 자리(`priceAfterBottle`·`manualPrice`·`fillLot`·`keptCasks`·`flagshipCasks`·`handfillCask`)는 값을 돌려주면 P8의 그 처리를 건너뛴다.
// - 각 자리는 mvp-human.ts에 `// @hook:<이름>` 표식이 붙어 있다. 글자 패치가 꼭 필요하면 그 표식 줄을 기준으로 삼는다(표식 문자열은 바꾸지 않는다).
// - 래퍼 고유의 정책 값은 `Policy.ext`(자유 객체)에 둔다 — `interface Policy`를 글자로 고칠 필요가 없다.
import type { GameState, ProductCategory } from '../../src/sim';
import type { Cask, SpiritLot } from '../../src/sim/types';

type S = GameState;
/** P = mvp-human.ts의 Policy, R = Row — 스크립트 안 타입이라 제네릭으로 받는다 */
export interface P8Hooks<P = any, R = any> {
  /** P8 정책 목록을 바꾼다(추가·교체). `make`는 P8(name, partial) 생성기, `base`는 새 X0 묶음(X0F) — @hook:policies.
   *  **첫 항목은 X0로 둔다** — 비교 표(「X0 대비」)와 CALIB(`P8_POLICIES[0]`)가 첫 항목을 기준으로 읽는다(ARCH 메모) */
  policies?(list: P[], make: (name: string, o: Partial<P>) => P, base: Partial<P>): P[];
  /** 실제로 돌 목록(ONLY 필터 뒤)을 바꾼다 — @hook:run */
  run?(list: P[]): P[];
  /** 판 생성 직후(applyTierKnobs 뒤, 첫 설비·주문 전) — @hook:after-create */
  afterCreate?(s: S, p: P, seed: number): S | void;
  /** 매달 병입(bottle) 바로 앞 — @hook:before-bottle */
  beforeBottle?(s: S, p: P, m: number): S | void;
  /** 매달 통입(fill) 바로 뒤 — @hook:after-fill */
  afterFill?(s: S, p: P, m: number): S | void;
  /** 매달 advanceMonth 바로 앞(결산 전 관측) — @hook:before-advance */
  beforeAdvance?(s: S, p: P, m: number, seed: number): void;
  /** 매달 advanceMonth 바로 뒤(결산 직후 관측) — @hook:after-month */
  afterMonth?(s: S, p: P, m: number, seed: number): void;
  /** bottle() 안 일반 위스키 병입 판단 바로 앞(재고·목표 계산 전) — @hook:before-whisky-bottle */
  beforeWhiskyBottle?(s: S, p: P): S | void;
  /** 일반 위스키 병입 후보에서 뺄 통 — @hook:bottle-skip */
  bottleSkip?(s: S, p: P, c: Cask): boolean;
  /** 병입 직후 가격 처리(P8의 pricePolicy·autoPrice 처리 앞). 상태를 돌려주면 P8 가격 처리를 건너뛴다 — @hook:price-after-bottle */
  priceAfterBottle?(s: S, p: P, opts: { name: string; restockId?: string }, cat: ProductCategory): S | void;
  /** P8 손 가격(manualPrice) 대신 — 상태를 돌려주면 P8 처리를 건너뛴다 — @hook:manual-price */
  manualPrice?(s: S, p: P, product: GameState['commerce']['products'][number]): S | void;
  /** 몰트 로트 하나의 통입 대신(통 종류·수 고르기) — 상태를 돌려주면 P8 처리를 건너뛴다 — @hook:fill-lot */
  fillLot?(s: S, p: P, lot: SpiritLot): S | void;
  /** 병입·핸드필이 쓰지 않을(보호) 통 집합 대신 — @hook:kept-casks */
  keptCasks?(s: S, p: P): Set<string> | void;
  /** 플래그십 병입(p.flagship) 통 고르기 대신 — @hook:flagship-casks */
  flagshipCasks?(s: S, p: P, minOakMonths: number): Cask[] | void;
  /** 핸드필 통 고르기 대신 — null = 고르지 않음, undefined(돌려주지 않음) = P8 그대로 — @hook:handfill-cask */
  handfillCask?(s: S, p: P, kept: Set<string>): Cask | null | void;
  /** 생산 주문의 레시피 id 대신(예: 피트 몰트) — @hook:recipe */
  recipe?(s: S, kind: 'soju' | 'malt'): string | void;
  /** 모든 판이 끝난 뒤(표 출력 뒤) — 래퍼 요약 — @hook:at-end */
  atEnd?(all: Map<string, R[]>): void;
}

const KEY = '__P8_HOOKS';
/** 래퍼가 P8을 가져오기 **전에** 부른다. 같은 프로세스 안 전역 등록 */
export function setP8Hooks<P = any, R = any>(h: P8Hooks<P, R>): void { (globalThis as Record<string, unknown>)[KEY] = h; }
/** P8이 모듈을 읽을 때 한 번 부른다. 등록이 없으면 빈 객체 */
export function p8Hooks<P = any, R = any>(): P8Hooks<P, R> { return ((globalThis as Record<string, unknown>)[KEY] ?? {}) as P8Hooks<P, R>; }
