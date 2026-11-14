import type { MilestoneId } from '../types';

// 마일스톤 정의 (파트 META, S-9) — 이름과 연표 표시. 판정 규칙은 progress.ts.
// 업적(여러 판에 걸친 기록, Steam 연동)은 게임 상태 밖이다 — 이 마일스톤 id를 조건으로 삼아 단계 V에서 붙인다

export interface MilestoneDef {
  nameKo: string;
  /** 결과 화면 15년 연표에 보인다 */
  timeline: boolean;
}

export const MILESTONES: Record<MilestoneId, MilestoneDef> = {
  first_distill: { nameKo: '첫 증류', timeline: true },
  first_fill: { nameKo: '첫 캐스크 통입', timeline: true },
  first_loan: { nameKo: '첫 대출', timeline: false },
  first_soju_sale: { nameKo: '첫 소주 판매', timeline: false },
  first_whisky_bottled: { nameKo: '첫 위스키 병입', timeline: true },
  first_whisky_sale: { nameKo: '첫 위스키 판매', timeline: true },
  first_cash_crisis: { nameKo: '첫 현금 위기', timeline: true },
  flagship_bottled: { nameKo: '플래그십 병입', timeline: true },
  flagship_sold: { nameKo: '플래그십 판매', timeline: true },
  /** 캠페인 승리 (F4 [결정 #308]) — 적격 싱글 몰트 로트의 최초 정상 유상 출하. 값 = 그 제품 품질(핸드필은 없음) */
  campaign_win: { nameKo: '캠페인 승리 — 12년 싱글 몰트 첫 출하', timeline: true },
};
