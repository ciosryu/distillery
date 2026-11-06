import type { RegionId } from '../types';

// 이름 레지스트리 — 실존 기업·독립 병입자·품평회·평론가 (결정 #44: 실명 사용).
// 안전장치 ① NAME_MODE 한 곳만 바꾸면 전부 가상명으로 전환 (출시 전 법률 검토용)
//          ② 부도·사기 같은 부정적 이벤트는 canDefault=true인 가상 회사에만 발생
//          ③ 실존 인물의 발언·인용은 만들지 않는다 (이름과 결과만 표시)
// 로고·상표 이미지는 사용하지 않는다.

export const NAME_MODE: 'real' | 'fictional' = 'real';

export interface NamedEntity { id: string; real: string; fictional: string; country?: RegionId | 'GLOBAL'; canDefault?: boolean }

export const displayName = (e: NamedEntity) => (NAME_MODE === 'real' ? e.real : e.fictional);

/** 원액 공급 계약 상대 (블렌디드 위스키 회사·브로커) */
export const BUYERS: NamedEntity[] = [
  { id: 'goldenblue', real: '골든블루', fictional: '청람 블렌디드', country: 'KR' },
  { id: 'drinks_intl', real: '드링크인터내셔널', fictional: '한성 주류', country: 'KR' },
  { id: 'lotte_chilsung', real: '롯데칠성음료', fictional: '칠성산 음료', country: 'KR' },
  { id: 'suntory', real: '산토리', fictional: '야마토 양조', country: 'JP' },
  { id: 'nikka', real: '닛카 위스키 (아사히)', fictional: '북해 위스키', country: 'JP' },
  { id: 'kirin', real: '기린 (후지 고텐바)', fictional: '후지노 증류', country: 'JP' },
  { id: 'kingcar', real: '킹카 그룹 (카발란)', fictional: '이란 증류', country: 'TW' },
  { id: 'ttl', real: '대만연주공사 (TTL)', fictional: '보도 주업', country: 'TW' },
  { id: 'diageo', real: '디아지오', fictional: '그레이트 브리튼 스피릿츠', country: 'GLOBAL' },
  { id: 'pernod', real: '페르노리카', fictional: '리비에라 스피릿츠', country: 'GLOBAL' },
  { id: 'wgrant', real: '윌리엄 그랜트 앤 선즈', fictional: '하이랜드 패밀리 디스틸러스', country: 'GLOBAL' },
  { id: 'edrington', real: '에드링턴', fictional: '스페이 브라더스', country: 'GLOBAL' },
  { id: 'bacardi', real: '바카디 (듀어스)', fictional: '카리브 하우스', country: 'GLOBAL' },
  // 가상 회사 — 부도 등 부정적 이벤트 대상
  { id: 'hanra', real: '한라 블렌디드 컴퍼니', fictional: '한라 블렌디드 컴퍼니', country: 'KR', canDefault: true },
  { id: 'saebyeok', real: '새벽 스피릿 브로커스', fictional: '새벽 스피릿 브로커스', country: 'KR', canDefault: true },
  { id: 'kanto', real: '간토 블렌딩 하우스', fictional: '간토 블렌딩 하우스', country: 'JP', canDefault: true },
  { id: 'formosa', real: '포모사 캐스크 트레이딩', fictional: '포모사 캐스크 트레이딩', country: 'TW', canDefault: true },
];

/** 독립 병입자 — 우수 캐스크 매입 제안 */
export const INDEPENDENT_BOTTLERS: NamedEntity[] = [
  { id: 'gm', real: '고든 앤 맥페일', fictional: '엘긴 보틀러스' },
  { id: 'signatory', real: '시그나토리 빈티지', fictional: '시그니처 캐스크' },
  { id: 'cadenhead', real: '카덴헤드', fictional: '캠벨타운 셀렉트' },
  { id: 'douglas_laing', real: '더글라스 랭', fictional: '글래스고 캐스크 하우스' },
  { id: 'hunter_laing', real: '헌터 랭', fictional: '헌터스 셀렉션' },
  { id: 'adelphi', real: '애델피', fictional: '아델 보틀링' },
  { id: 'bbr', real: '베리 브로스 앤 러드', fictional: '세인트 제임스 와인 앤 스피릿' },
  { id: 'smws', real: '스카치 몰트 위스키 소사이어티', fictional: '몰트 애호가 협회' },
];

export const COMPETITIONS: NamedEntity[] = [
  { id: 'iwsc', real: 'IWSC', fictional: '국제 와인·스피릿 대회' },
  { id: 'sfwsc', real: '샌프란시스코 월드 스피릿 컴피티션', fictional: '서해안 스피릿 대회' },
  { id: 'isc', real: '인터내셔널 스피릿 챌린지', fictional: '런던 스피릿 챌린지' },
  { id: 'wwa', real: '월드 위스키 어워드', fictional: '세계 위스키 시상식' },
  { id: 'twsc', real: '도쿄 위스키 앤 스피릿 컴피티션', fictional: '아시아 위스키 대회' },
];

/** 평론가 — 이름과 평가 결과만 표시하고 발언은 만들지 않는다 */
export const CRITICS: NamedEntity[] = [
  { id: 'murray', real: '짐 머레이', fictional: '제임스 무어' },
  { id: 'maclean', real: '찰스 맥클린', fictional: '찰스 맥퍼슨' },
  { id: 'broom', real: '데이브 브룸', fictional: '데이비드 브룩' },
  { id: 'valentin', real: '세르주 발랑탱', fictional: '세르주 발로' },
  { id: 'ralfy', real: '랄피 미첼', fictional: '랄프 미들턴' },
];
