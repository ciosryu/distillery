import type { CampaignWin } from '../sim';

/** 캠페인 승리의 채널 이름(F5c-2) — 판정은 kind만 보지만 화면은 어느 길로 이겼는지 말한다. 채널이 없는 옛 승리 기록은 kind만으로 */
export function winChannelLabel(win: Pick<CampaignWin, 'kind' | 'channel'>): string {
  switch (win.kind) {
    case 'cellar_door': return '핸드필';
    case 'domestic': return win.channel === 'retail_deal' ? '대형 유통 납품' : '국내 소매';
    case 'dutyfree': return '지정면세점';
    case 'export': return '수출';
    case 'b2b': return '원액 거래';
  }
}

/** 결과 화면 머리글 — "핸드필 승리" · "대형 유통 납품 승리" … */
export const winLabel = (win: Pick<CampaignWin, 'kind' | 'channel'>): string => `${winChannelLabel(win)} 승리`;
