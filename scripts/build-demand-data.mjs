#!/usr/bin/env node
// 기본 수요 데이터 빌더
// - 원문 수치(원 단위 그대로)를 records에 기록하고, 9L 케이스 환산은 여기서 계산한다.
// - 출력: data/market/base-demand.json, docs/research/demand-data.md 의 <!-- matrix:start/end --> 구간
// 실행: node scripts/build-demand-data.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = resolve(ROOT, 'data/market/base-demand.json');
const OUT_MD = resolve(ROOT, 'docs/research/demand-data.md');
const ACCESSED = '2026-11-05';

// ───────────────────────── 단위 → 리터(제품 액량) ─────────────────────────
const UNITS = {
  L: { toL: 1, label: 'L' },
  kL: { toL: 1e3, label: 'kL' },
  ML: { toL: 1e6, label: '백만 L' },
  man_L: { toL: 1e4, label: '万升(만 L)' },
  man_kL: { toL: 1e7, label: '万千升(만 kL)' },
  yi_L: { toL: 1e8, label: '亿升(억 L)' },
  Mbottles70: { toL: 0.7e6, label: '백만 병(70cl)' },
  k9L: { toL: 9e3, label: '천 9L 케이스' },
  M9L: { toL: 9e6, label: '백만 9L 케이스' },
  // 한국 관세청 통계는 중량(톤)만 공개. 순중량이면 1톤 ≈ 1,050L, 병 포함 총중량이면 ≈ 550L → 중간값 750L 가정 (4차 조사 권고)
  t: { toL: 750, label: '톤', estimateNote: '1톤 ≈ 750L 가정 — 순중량(≈1,050L)과 병 포함 총중량(≈550L)의 중간값, 오차 ±30%' },
  ML_LPA: { toL: null, label: '백만 L(순수알코올)' },
  barrels_M: { toL: null, label: '백만 배럴' },
  Mt: { toL: null, label: '백만 톤' },
  money_only: { toL: null, label: '(금액만)' },
};

// ───────────────────────── 카테고리 ─────────────────────────
const CATEGORIES = {
  spirits_total: { nameKo: '스피릿 전체', parent: null },
  whisky_total: { nameKo: '위스키 전체', parent: 'spirits_total' },
  scotch: { nameKo: '스카치', parent: 'whisky_total' },
  american_whiskey: { nameKo: '아메리칸 위스키(버번 포함)', parent: 'whisky_total' },
  canadian: { nameKo: '캐나디안 위스키', parent: 'whisky_total' },
  irish: { nameKo: '아이리시 위스키', parent: 'whisky_total' },
  japanese_whisky: { nameKo: '재패니즈 위스키', parent: 'whisky_total' },
  whisky_other: { nameKo: '기타 위스키', parent: 'whisky_total' },
  vodka: { nameKo: '보드카', parent: 'spirits_total' },
  gin: { nameKo: '진', parent: 'spirits_total' },
  rum: { nameKo: '럼', parent: 'spirits_total' },
  agave_total: { nameKo: '아가베 스피릿(테킬라+메스칼)', parent: 'spirits_total' },
  tequila: { nameKo: '테킬라', parent: 'agave_total' },
  mezcal: { nameKo: '메스칼', parent: 'agave_total' },
  brandy_total: { nameKo: '브랜디 전체', parent: 'spirits_total' },
  cognac: { nameKo: '코냑', parent: 'brandy_total' },
  armagnac: { nameKo: '아르마냑', parent: 'brandy_total' },
  calvados: { nameKo: '칼바도스', parent: 'brandy_total' },
  fruit_brandy: { nameKo: '과실 브랜디(Obstbrand)', parent: 'spirits_total' },
  soju_diluted: { nameKo: '희석식 소주', parent: 'spirits_total' },
  soju_distilled: { nameKo: '증류식 소주', parent: 'spirits_total' },
  baijiu: { nameKo: '백주', parent: 'spirits_total' },
  shochu_korui: { nameKo: '쇼추(연속식·갑류)', parent: 'spirits_total' },
  shochu_honkaku: { nameKo: '쇼추(단식·본격)', parent: 'spirits_total' },
  korn_clear: { nameKo: '코른·기타 클리어 스피릿', parent: 'spirits_total' },
  white_spirits: { nameKo: '화이트 스피릿(보드카+진)', parent: 'spirits_total' },
  anise: { nameKo: '아니스주(파스티스 등)', parent: 'spirits_total' },
  liqueur: { nameKo: '리큐르', parent: 'spirits_total' },
  spirits_other: { nameKo: '기타 스피릿', parent: 'spirits_total' },
  rtd: { nameKo: 'RTD(스피릿 기반)', parent: null },
  all_alcohol: { nameKo: '주류 전체(맥주·와인 포함)', parent: null },
};

const MARKETS = {
  KR: '한국', JP: '일본', CN: '중국', TW: '대만', US: '미국', MX: '멕시코', CA: '캐나다',
  UK: '영국', FR: '프랑스', DE: '독일', ES: '스페인', IN: '인도', PH: '필리핀', TH: '태국', VN: '베트남',
  TRAVEL_RETAIL: '면세·여행 리테일',
  // 참고용(게임 시장 아님)
  BR: '브라질', PL: '폴란드', TR: '튀르키예', SG: '싱가포르',
  NA_REGION: '북미(미·캐·멕) 권역', FAR_EAST: '극동 권역', EUROPE_REGION: '유럽 권역', GLOBAL: '세계',
};
const GAME_MARKETS = ['KR', 'JP', 'CN', 'TW', 'US', 'MX', 'CA', 'UK', 'FR', 'DE', 'ES', 'IN', 'PH', 'TH', 'VN', 'TRAVEL_RETAIL'];

// ───────────────────────── 출처 ─────────────────────────
const SOURCES = {
  KR_FN_2025: ['파이낸셜뉴스', '소맥 누른 하이볼… 주류시장 세대교체 바람 (aT 2025 주류산업정보 실태조사 인용)', 'https://www.fnnews.com/news/202508031844037459'],
  KR_DATANEWS: ['데이터뉴스', '술 소비 줄었다…국내 주류 출고량 10년 새 21% 감소 (국세통계포털 분석)', 'https://datanews.co.kr/news/article.html?no=146553'],
  KR_DAILIAN: ['데일리안', '국세통계포털(TASIS) 2025 소주 출고량 보도', 'https://m.dailian.co.kr/news/view/1684511'],
  KR_DATAGO: ['공공데이터포털', '국세청_주류별 지역별 주세 신고 현황 (유의사항: 수입분 합산)', 'https://www.data.go.kr/data/15070737/fileData.do'],
  KR_ASIAE_WHISKY: ['아시아경제', 'Last Year, Whiskey Imports Fell 10% in Volume and 4% in Value (관세청 인용)', 'https://www.asiae.co.kr/en/article/2025012016055142932'],
  KR_SATECO: ['서울경제(sateconomy)', '위스키 수입량 (관세청 인용)', 'https://sateconomy.co.kr/news/view/1065573709960731'],
  KR_FN_2026: ['파이낸셜뉴스', '위스키 수입액 (관세청 인용)', 'https://www.fnnews.com/news/202610041613167063'],
  KR_CUSTOMS_SOJU: ['관세청', '케이(K)-소주 수출 상한가 (보도자료)', 'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&bbsId=1362&nttSn=10133374&nttSnUrl=9afad13a4d2a5843dc601661494cb61a'],
  KR_STOCKPLUS: ['stockplus', '일반소주 수출량 7만 62톤 (관세청 통계 인용)', 'https://news.stockplus.com/m?news_id=14197603'],
  KR_FOODTODAY: ['푸드투데이', 'aT 2025 주류산업정보 실태조사 보도', 'https://www.foodtoday.or.kr/news/article.html?no=204014'],
  JP_MAFF: ['농림수산성(MAFF)', '(12) 焼酎の出荷状況 ア 酒類課税数量の推移 (국세청 데이터)', 'https://www.maff.go.jp/j/seisan/tokusan/imo/attach/pdf/r7shiryo-15.pdf'],
  JP_NTA_SHIORI: ['국세청(NTA)', '酒のしおり（令和8年7月） — N년 7월판 = FY(N−2)', 'https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2026/index.htm'],
  JP_NTA_EXPORT: ['국세청(NTA)', '酒のしおり 輸出 (財務省貿易統計)', 'https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2025/pdf/0023-1.pdf'],
  JP_JWIC: ['일본위스키정보센터(JWIC)', 'ジャパニーズウイスキー輸出状況【2024年12月度】', 'https://jwic.jp/img/202412_whisky_statistical_data.pdf'],
  CN_NBS_163: ['酒业家(국가통계국 발표 인용)', '国家统计局：2024年规上企业白酒产量414.5万千升，同比下降1.8%', 'https://www.163.com/dy/article/JMJ4FDUK053804DM.html'],
  CN_KPMG: ['KPMG', '2025中国白酒市场中期研究报告', 'https://assets.kpmg.com/content/dam/kpmg/cn/pdf/zh/2025/06/mid-term-research-report-on-the-chinese-baijiu-market-2025.pdf'],
  CN_PEOPLE: ['人民日报', '提升国际标准制定话语权，让中国白酒更好走向世界', 'https://paper.people.com.cn/mszk/pc/content/202503/17/content_30065168.html'],
  CN_WBO: ['葡萄酒商业观察(WBO)', '2024年烈酒进口数据出炉 (海关总署 데이터)', 'https://www.wbo529.com/info/3871'],
  CN_HUXIU: ['虎嗅', '中国烈酒进口状况蓝皮书—威士忌精华版', 'https://www.huxiu.com/article/4832816.html'],
  TW_CH9: ['酒訊網', '2024年酒市景氣展望 (財政部關務署 통계 인용)', 'https://ch-9.net/article/I7tL5alc7a'],
  TW_INDEXBOX: ['IndexBox', "Asia-Pacific's Whisky Market Expected to Grow at +0.9% CAGR", 'https://www.indexbox.io/blog/whisky-asia-pacific-market-overview-2024-2/'],
  US_DISCUS: ['DISCUS', 'Annual Economic Briefing Support Tables (Feb 2025, 2024 data)', 'https://distilledspirits.org/wp-content/uploads/2025/02/DISCUS-AEB-Support-Tables-February-13-2025.pdf'],
  US_DISCUS_ALT: ['DISCUS', '2025 AEB Support Tables (2차 조사 URL)', 'https://distilledspirits.org/wp-content/uploads/2025/02/2025-AEB-Support-Tables.pdf'],
  US_KDA: ['Kentucky Distillers’ Association', 'Economic Impact Report (Feb 2026)', 'https://kybourbon.com/wp-content/uploads/2026/02/FINAL-KDA-Economic-Impact-Report-2.2.26.pdf'],
  MX_CRT: ['테킬라규제위원회(CRT)', 'Continuará el trabajo coordinado para fortalecer a la agroindustria tequilera', 'https://www.crt.org.mx/2025/03/05/continuara-el-trabajo-coordinado-para-fortalecer-a-la-agroindustria-tequilera/'],
  MX_INFORMADOR: ['El Informador', 'Incrementó la exportación y la producción de tequila en 2025 (CRT 기록)', 'https://www.informador.mx/economia/industria-incremento-la-exportacion-y-laproduccion-de-tequila-en-2025-20260112-0016.html'],
  MX_MEZCALISTAS: ['Mezcalistas (COMERCAM 수치)', '2024 mezcal sales and export numbers', 'https://www.mezcalistas.com/2024-mezcal-sales-and-export-numbers/'],
  MX_ELFIN: ['El Financiero', 'Altos impuestos y exportación impulsan cambios en el mezcal', 'https://www.elfinanciero.com.mx/empresas/2025/12/29/altos-impuestos-y-exportacion-impulsan-cambios-en-el-mezcal/'],
  CA_STATCAN: ['캐나다 통계청', 'The Daily — Control and sale of alcoholic beverages and cannabis (2026-03-05)', 'https://www150.statcan.gc.ca/n1/daily-quotidien/260305/dq260305b-eng.pdf'],
  CA_STATISTA_WHISKY: ['Statista (캐나다 통계청 기반)', 'Whisky sales volume in Canada', 'https://statista.com/statistics/861123/whiskey-sales-volume-canada'],
  CA_STATISTA_RUM: ['Statista (캐나다 통계청 기반)', 'Volume of rum sold in Canada', 'https://statista.com/statistics/334076/volume-of-rum-sold-in-canada'],
  UK_SHELFDROP: ['Shelfdrop (HMRC Alcohol Bulletin 가공)', 'UK alcohol statistics and sales 2026', 'https://www.shelfdrop.com/data/uk-alcohol-statistics'],
  FR_FRANCEAGRIMER: ['FranceAgriMer', 'Fiche filière spiritueux 2026', 'https://www.franceagrimer.fr/sites/default/files/2026-02/09_FICHE_FILIERE_SPIRITUEUX_2026.pdf'],
  FR_BOTTL: ['Bottl', 'La France est la nation du whisky', 'https://www.bottl.fr/blog/la-france-est-la-nation-du-whisky/'],
  FR_ITM: ['IntoTheMinds (FFS 인용)', 'Étude de marché des spiritueux', 'https://www.intotheminds.com/blog/etude-marche-spiritueux/'],
  FR_SIDELY: ['Sidely (NielsenIQ 데이터)', 'Le marché de la vodka', 'https://www.go-sidely.com/post/le-marche-de-la-vodka'],
  FR_RAYON: ['Rayon Boissons (Circana 데이터)', 'Le top des gins en grande distribution', 'https://www.rayon-boissons.com/spiritueux/le-top-des-gins-en-grande-distribution2'],
  DE_BSI: ['독일주류산업협회(BSI)', 'Daten aus der Alkoholwirtschaft 2025', 'https://www.spirituosen-verband.de/fileadmin/Datenablage/downloads/BSI-Datenbroschuere_2025.pdf'],
  ES_EE: ['스페인주류협회(Espirituosos España)', 'Informe Socioeconómico del Sector de Bebidas Espirituosas 2024 (보도자료 2025-06-13)', 'https://www.espirituosos.es/Prensa/Comunicados-de-prensa/prensa-detalle.aspx?p=2421'],
  ES_MERCASA: ['Mercasa', 'Alimentación en España – Bebidas espirituosas', 'https://www.mercasa.es/publicaciones/alimentacion-en-espana/bebidas-espirituosas/'],
  ES_DBK: ['Empresa Actual (DBK de INFORMA)', 'El consumo de bebidas espirituosas cae en 2024', 'https://www.empresaactual.com/retroceso-consumo-bebidas-espirituosas-arrastra-la-facturacion-del-sector/'],
  SWA_2024: ['스카치위스키협회(SWA)', 'Scotch Whisky 2024 Exports (인포그래픽)', 'https://www.scotch-whisky.org.uk/media/2414/2024-export-figures-long-infographic.pdf'],
  SWA_NEWS: ['스카치위스키협회(SWA)', '2024 export figures', 'https://www.scotch-whisky.org.uk/newsroom/2024-export-figures/'],
  SWA_TSB_VALUE: ['The Spirits Business (SWA 데이터)', "Scotch whisky's 10 most valuable export markets in 2024", 'https://www.thespiritsbusiness.com/2025/02/scotch-whiskys-10-most-valuable-export-markets-in-2024/'],
  BNIC_TSB: ['The Spirits Business (BNIC 데이터)', 'Cognac exports plunge in 2024 as China bites', 'https://www.thespiritsbusiness.com/2025/02/cognac-exports-plunge-in-2024-as-china-bites/'],
  IDAC_DISTILNEWS: ['Distilnews (IDAC 수치)', 'Les expéditions de Calvados progressent en France mais reculent à l’export en 2024', 'https://distilnews.fr/calvados-expeditions-2024-croissance-france-repli-export/'],
  BNIA_F3: ['France 3 Occitanie', 'Mercosur : pourquoi les producteurs d’armagnac pourraient être les gagnants', 'https://france3-regions.franceinfo.fr/occitanie/gers/auch/mercosur-on-ne-va-pas-se-plaindre-pourquoi-les-producteurs-d-armagnac-pourraient-etre-les-gagnants-de-l-accord-3284057.html'],
  FEVS_2024: ['FEVS', 'Bilan 2024 export vins et spiritueux', 'https://www.fevs.com/wp-content/uploads/2025/02/20250211-dp-fevs-bilan-2024-export-vins-spiritueux-vf-complet.pdf'],
  IN_CIABC: ['Daily Excelsior (CIABC/PTI)', 'IMFL 판매량 FY25 40.17 crore cases', 'https://www.dailyexcelsior.com/?p=2073435'],
  IN_CRISIL: ['Crisil Ratings', 'In high spirits (2026-05)', 'https://www.crisil.com/content/dam/crisil/mailers/rating-newsletter/2026/may/pdf/in-high-spirits.pdf'],
  PH_DI_GIN: ['Drinks International', "The Millionaires' Club 2026: gin", 'https://drinksint.com/the-millionaires-clubs-2026-the-worlds-bestselling-gin-brands/'],
  PH_TSB_RUM: ['The Spirits Business', 'Top 10 best-selling rum Brand Champions 2025', 'https://www.thespiritsbusiness.com/2025/07/top-10-best-selling-rum-brand-champions-2025/'],
  PH_STATISTA: ['Statista Market Insights', 'Spirits – Philippines', 'https://www.statista.com/outlook/cmo/alcoholic-drinks/spirits/philippines'],
  TH_EUROMONITOR: ['Euromonitor (리포트 목록 페이지)', 'Spirits in Thailand', 'https://www.marketresearch.com/Euromonitor-International-v746/Spirits-Thailand-34522863'],
  VN_STATISTA: ['Statista Market Insights', 'Spirits – Vietnam', 'https://www.statista.com/outlook/10020000/127/spirits/vietnam'],
  GL_TSB_WHISKY: ['The Spirits Business (Euromonitor)', 'Brand Champions 2025 — whisky (URL 미확정)', 'https://www.thespiritsbusiness.com/?p=882935'],
  GL_TSB_VODKA: ['The Spirits Business (Euromonitor)', 'Brand Champions 2025 — vodka (URL 미확정)', 'https://www.thespiritsbusiness.com/?p=882623'],
  GL_TSB_GIN: ['The Spirits Business (Euromonitor)', 'Brand Champions 2025 — gin (URL 미확정)', 'https://www.thespiritsbusiness.com/?p=883609'],
  GL_TSB_BRANDY: ['The Spirits Business (Euromonitor)', 'World Spirits Report 2025 — brandy (URL 미확정)', 'https://www.thespiritsbusiness.com/?p=904205'],
  GL_TSB_LIQUEUR: ['The Spirits Business (Euromonitor)', 'Brand Champions 2025 — liqueurs (URL 미확정)', 'https://www.thespiritsbusiness.com/?p=860293'],
  GL_TSB_SCOTCH: ['The Spirits Business (Euromonitor)', 'World Spirits Report 2025: Scotch whisky', 'https://www.thespiritsbusiness.com/2025/12/world-spirits-report-2025-scotch-whisky/'],
  TR_IWSR_2019: ['IWSR', 'Spirits in Global Travel Retail (2019 보도자료, 2018 데이터)', 'https://theiwsr.com/wp-content/uploads/2024/05/Press-Release-IWSR-Spirits-in-Global-Travel-Retail.pdf'],
  // ── 3·4차 조사 (2026-11-05) ──
  KR_TRADEDATA: ['관세청', '수출입무역통계 「수출입 실적(품목별+국가별)」 HS 2208 하위품목, 2024, 수리일 기준 (4차 원표 조회)', 'https://tradedata.go.kr/cts/index.do'],
  KR_HANKYUNG: ['한국경제', '위스키 수입량 −10.3% (관세청 수출입 무역통계 인용)', 'https://www.hankyung.com/article/2025012609321'],
  KR_SEGYE: ['세계일보', '맥주·소주 3년째 감소… (TASIS 인용)', 'https://segye.com/newsView/20260823504121'],
  JP_MOF_TRADE: ['재무성(財務省)', '貿易統計 品別国別表 2024年12月 累計 (4차 원표 조회)', 'https://www.customs.go.jp/toukei/srch/index.htm'],
  TW_IEAT: ['台北市進出口商業同業公會(IEAT)', '台灣酒市疫後出發 尋求突破創新 (關務署 통계 인용)', 'https://www.ieatpe.org.tw/magazine/ebook397/coverstory-3.html'],
  TW_CTEE: ['工商時報', '金門酒廠 2025年營收約116億元·2024年121億元, 台灣白酒市占率約八成', 'https://www.ctee.com.tw/news/20260728701728-430503'],
  CA_STATCAN_TBL: ['캐나다 통계청', 'Table 10-10-0011-01 Value of sales of alcoholic beverages… by beverage type (WDS API, 4차 조회)', 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1010001101'],
  US_DISCUS_AGAVE: ['DISCUS', '2024 Tequila/Mezcal in the U.S. Fact Sheet', 'https://www.distilledspirits.org/wp-content/uploads/2025/02/Copy-of-2024-TequilaMezcal-in-the-U.S.-Fact-Sheet-NEW1-2.pdf'],
  US_SHANKEN_MEZCAL: ['Shanken News Daily (Impact Databank)', 'Mezcal depletions 2024', 'https://www.shankennewsdaily.com/?p=37015'],
  GL_TSB_WHISKY_2025: ['The Spirits Business (Euromonitor)', 'Top 10 biggest-selling Scotch Brand Champions (2025-06-19)', 'https://www.thespiritsbusiness.com/2025/06/top-10-biggest-selling-scotch-brand-champions/'],
  GL_TSB_GIN_IWSR: ['The Spirits Business (IWSR)', 'Gin category 2024 (IWSR 인용)', 'https://www.thespiritsbusiness.com/?p=890983'],
  IN_BS_FY23: ['Business Standard (CIABC)', 'Liquor sales volume grows 14% in FY23', 'https://www.business-standard.com/industry/news/liquor-sales-volume-grows-14-in-fy23-premium-segment-over-rs-1k-grows-48-123062700574_1.html'],
  FR_LINFO: ["L'Info Durable (FFS·세관 인용)", 'En difficulté à l’export, les spiritueux perdent encore du terrain en France', 'https://www.linfodurable.fr/en-difficulte-lexport-les-spiritueux-perdent-encore-du-terrain-en-france-51350'],
};

// ───────────────────────── 레코드 ─────────────────────────
// role: base(게임 수요 셀) | total(상위 합계 — 하위 base와 중복) | reference(참고: 수출·생산·대체값)
// confidence: official | official-cited | industry-assoc | press-report | aggregator | estimate
// verified: primary(원문 열람) | snippet(검색 요약)
const records = [];
function r(market, category, metric, period, value, unit, opts = {}) {
  records.push({ market, category, metric, period, value, unit, ...opts });
}
const share = (total, pct) => Math.round(total * pct * 100) / 1e4; // total × pct% (소수 4자리)

// ── 한국 ──
r('KR', 'soju_diluted', 'domestic_release', '2024', 815712, 'kL', { role: 'base', confidence: 'official-cited', verified: 'snippet', sources: ['KR_FN_2025', 'KR_DATANEWS', 'KR_DATAGO'], note: '데이터뉴스 원문(81.6만㎘)과 일치. 출고량에는 수입분 포함(KR_DATAGO 유의사항)' });
r('KR', 'soju_distilled', 'domestic_release', '2025', 4611, 'kL', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['KR_DAILIAN'], note: '2024 값 미확보 → 2025 값으로 대용. 단일 출처' });
const KRC = { confidence: 'official', verified: 'primary', sources: ['KR_TRADEDATA'] };
r('KR', 'whisky_total', 'imports', '2024', 27440.9, 't', { ...KRC, role: 'total', money: { amount: 249.413e6, currency: 'USD' }, note: 'HS 2208.30. 언론(27,441t·2억 4,941.9만 달러, KR_HANKYUNG·KR_FN_2026)과 정합. 국내 생산 위스키는 미미하다고 보고 수입량을 수요 대리값으로 사용. 위스키 수출 230.5t' });
r('KR', 'scotch', 'imports', '2024', 21658.8, 't', { ...KRC, role: 'base', money: { amount: 204.051e6, currency: 'USD' }, note: '원산지 영국(스카치 대리값), 전체의 78.9%' });
r('KR', 'american_whiskey', 'imports', '2024', 3165.8, 't', { ...KRC, role: 'base', money: { amount: 24.346e6, currency: 'USD' }, note: '원산지 미국 11.5%' });
r('KR', 'japanese_whisky', 'imports', '2024', 1336.1, 't', { ...KRC, role: 'base', money: { amount: 9.285e6, currency: 'USD' }, note: '원산지 일본 4.9%, 양 +48.9%' });
r('KR', 'irish', 'imports', '2024', 637.0, 't', { ...KRC, role: 'base', money: { amount: 4.106e6, currency: 'USD' }, note: '원산지 아일랜드 2.3%' });
r('KR', 'whisky_other', 'imports', '2024', 643.2, 't', { ...KRC, role: 'base', confidence: 'estimate', formula: '27,440.9 − 21,658.8 − 3,165.8 − 1,336.1 − 637.0 (대만 310.5·독일 47.0 등)' });
r('KR', 'brandy_total', 'imports', '2024', 577.1, 't', { ...KRC, role: 'base', money: { amount: 11.592e6, currency: 'USD' }, note: 'HS 2208.20. 프랑스 375.3t(코냑 주력 추정). 언론 보도 863만 달러와 충돌 → 원표 채택' });
r('KR', 'rum', 'imports', '2024', 825.4, 't', { ...KRC, role: 'base', money: { amount: 2.351e6, currency: 'USD' } });
r('KR', 'gin', 'imports', '2024', 576.7, 't', { ...KRC, role: 'base', money: { amount: 3.5e6, currency: 'USD' }, note: 'HS 2208.50. 영국 371.1t. 국산 크래프트 진은 소량 → 수입량을 시장 대리값으로 사용' });
r('KR', 'vodka', 'imports', '2024', 1746.7, 't', { ...KRC, role: 'base', money: { amount: 4.991e6, currency: 'USD' } });
r('KR', 'liqueur', 'imports', '2024', 14047.4, 't', { ...KRC, role: 'base', money: { amount: 28.271e6, currency: 'USD' }, note: '일본산 9,456.9t(하이볼·츄하이류 추정)' });
r('KR', 'baijiu', 'imports_proxy', '2024', 7915.1, 't', { ...KRC, role: 'base', confidence: 'estimate', money: { amount: 19.133e6, currency: 'USD' }, note: 'HS 2208.90(기타 증류주) 중 중국 원산지 = 고량주 대리값. 3차 보도 "중국 고량주 1,831만 달러"와 정합' });
r('KR', 'tequila', 'imports_proxy', '2024', 672.5, 't', { ...KRC, role: 'base', confidence: 'estimate', money: { amount: 6.264e6, currency: 'USD' }, note: 'HS 2208.90 중 멕시코 원산지(메스칼 포함 가능)' });
r('KR', 'spirits_total', 'imports', '2024', 59907.8, 't', { ...KRC, role: 'total', money: { amount: 336.271e6, currency: 'USD' }, note: 'HS 2208 전체. 수출 126,863.7t' });
r('KR', 'soju_diluted', 'exports', '2024', 70062, 't', { role: 'reference', confidence: 'official-cited', verified: 'snippet', sources: ['KR_CUSTOMS_SOJU', 'KR_STOCKPLUS'], money: { amount: 104e6, currency: 'USD' }, note: '일반소주 단일 품목(금액: 관세청, 톤: 관세청 통계 인용 보도). 과일소주(혼성주) 9,600만 달러 별도. 소주류 합계 2억 달러·12.4만 톤은 과일소주 포함' });
r('KR', 'all_alcohol', 'domestic_release', '2025', 2988000, 'kL', { role: 'reference', confidence: 'official-cited', verified: 'snippet', sources: ['KR_SEGYE'], note: 'TASIS. 희석식소주 2025 79.3만㎘. 위스키 등 개별 출고량은 미공개' });
r('KR', 'all_alcohol', 'domestic_release', '2024', 3151371, 'kL', { role: 'reference', confidence: 'official-cited', verified: 'snippet', sources: ['KR_FOODTODAY'], note: '맥주·탁주 포함 전 주종. 일반증류주 출고량은 +113.2%(절대량 미확보)' });

// ── 일본 ──
r('JP', 'whisky_total', 'tax_volume', 'FY2024', 205736, 'kL', { role: 'total', confidence: 'official', verified: 'primary', sources: ['JP_MAFF', 'JP_NTA_SHIORI'], note: '令和6年度(2024.4~2025.3)로 확정(3차). 국산 171,464 / 수입 34,272. FY2023 205,418' });
r('JP', 'whisky_total', 'imports', 'CY2024', 71105896, 'L', { role: 'reference', confidence: 'official', verified: 'primary', sources: ['JP_MOF_TRADE'], money: { amount: 74626.535e6, currency: 'JPY' }, note: '영국 3,930만·미국 1,768만·캐나다 1,055만 L. 국내 블렌딩용 벌크 원주 포함 → 소비량 아님(과세수량 사용)' });
r('JP', 'spirits_total', 'tax_volume', 'FY2024', 1155038, 'kL', { role: 'reference', confidence: 'official', verified: 'primary', sources: ['JP_MAFF'], note: 'スピリッツ等 — 原料用アルコール 포함. RTD 제외 순수 스피릿 값 없음' });
r('JP', 'gin', 'imports', 'CY2024', 2954095, 'L', { role: 'base', confidence: 'official', verified: 'primary', sources: ['JP_MOF_TRADE'], note: '영국 92%. 수입분만 → 국산 진(수이·로쿠 등) 미포함 하한' });
r('JP', 'rum', 'imports', 'CY2024', 1967471, 'L', { role: 'base', confidence: 'official', verified: 'primary', sources: ['JP_MOF_TRADE'], note: '수입분만(하한)' });
r('JP', 'vodka', 'imports', 'CY2024', 1886364, 'L', { role: 'base', confidence: 'official', verified: 'primary', sources: ['JP_MOF_TRADE'], note: '수입분만(하한)' });
r('JP', 'tequila', 'imports_proxy', 'CY2024', 3629477, 'L', { role: 'base', confidence: 'estimate', verified: 'primary', sources: ['JP_MOF_TRADE'], note: '2208.90-129 멕시코 원산지(메스칼 포함 가능)' });
r('JP', 'brandy_total', 'imports', 'CY2024', 1959298, 'L', { role: 'reference', confidence: 'official', verified: 'primary', sources: ['JP_MOF_TRADE'], note: '프랑스 93%. 수요는 과세수량 4,085kL 사용' });
r('JP', 'scotch', 'exports_to_market', '2024', 74, 'Mbottles70', { role: 'base', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], note: 'SWA 수출(수출국 기준 선적량 — 소비와 1:1 아님)' });
r('JP', 'brandy_total', 'tax_volume', 'FY2024', 4085, 'kL', { role: 'base', confidence: 'official', verified: 'primary', sources: ['JP_MAFF'], note: '국산 3,036 / 수입 1,049 (3차 검증)' });
r('JP', 'shochu_korui', 'tax_volume', 'FY2024', 295410, 'kL', { role: 'base', confidence: 'official', verified: 'snippet', sources: ['JP_MAFF'], note: '국내 264,762 + 수입 30,648' });
r('JP', 'shochu_honkaku', 'tax_volume', 'FY2024', 353062, 'kL', { role: 'base', confidence: 'official', verified: 'primary', sources: ['JP_MAFF'], note: '単式蒸留焼酎(아와모리 포함), 수입 185' });
r('JP', 'japanese_whisky', 'exports', '2024', 11.28, 'ML', { role: 'reference', confidence: 'industry-assoc', verified: 'snippet', sources: ['JP_JWIC', 'JP_NTA_EXPORT'], money: { amount: 43635e6, currency: 'JPY' } });

// ── 중국 ──
r('CN', 'baijiu', 'production', '2024', 414.5, 'man_kL', { role: 'reference', confidence: 'official-cited', verified: 'snippet', sources: ['CN_NBS_163', 'CN_KPMG'], abvBasis: 0.65, note: '규모 이상 기업, 65도 환산. 2023 449.2는 집계 범위가 달라 연결 금지(비교 기준 2023 ≈ 422.1)' });
r('CN', 'baijiu', 'exports', '2024', 1.64, 'man_kL', { role: 'reference', confidence: 'press-report', verified: 'snippet', sources: ['CN_PEOPLE'], note: '생산량의 0.39%' });
r('CN', 'baijiu', 'consumption_proxy', '2024', 412.86, 'man_kL', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['CN_NBS_163', 'CN_PEOPLE'], abvBasis: 0.65, formula: '생산 414.5 − 수출 1.64', note: '65도 환산 액량. 실제 제품 액량은 더 큼(평균 도수 가정 필요). IWSR: 2024 소비 −5%' });
r('CN', 'whisky_total', 'imports', '2024', 2919, 'man_L', { role: 'total', confidence: 'official-cited', verified: 'snippet', sources: ['CN_WBO'], money: { amount: 451e6, currency: 'USD' }, note: '해관 데이터, 전년 대비 −10.5%' });
r('CN', 'scotch', 'imports', '2024', 2380, 'man_L', { role: 'base', confidence: 'official-cited', verified: 'snippet', sources: ['CN_WBO'], money: { amount: 391e6, currency: 'USD' }, note: '원산지 영국' });
r('CN', 'american_whiskey', 'imports', '2024', 289, 'man_L', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['CN_HUXIU'], money: { amount: 14.48e6, currency: 'USD' } });
r('CN', 'japanese_whisky', 'imports', '2024', 101, 'man_L', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['CN_HUXIU'], formula: '2025 132万升 ÷ 1.3073 (같은 방식의 미국 역산 288 ≈ 공표 289)' });
r('CN', 'whisky_other', 'imports', '2024', 149, 'man_L', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['CN_WBO', 'CN_HUXIU'], formula: '2,919 − 2,380 − 289 − 101 = 149 (대만 등)' });
r('CN', 'brandy_total', 'imports', '2024', 3502, 'man_L', { role: 'total', confidence: 'official-cited', verified: 'snippet', sources: ['CN_WBO'], money: { amount: 1234e6, currency: 'USD' }, note: '프랑스산 비중 99%대 → 대부분 코냑으로 추정. 코냑 선적량(2,028만 L)보다 커서 벌크·기타 포함 가능' });
r('CN', 'cognac', 'shipments', '2024', 28.97, 'Mbottles70', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['BNIC_TSB'], note: 'BNIC 중국행 선적, −9.6%' });
r('CN', 'spirits_total', 'imports', '2024', 1.14, 'yi_L', { role: 'reference', confidence: 'official-cited', verified: 'snippet', sources: ['CN_WBO'], money: { amount: 2125e6, currency: 'USD' }, note: '수입 스피릿 전체(백주 미포함)' });

// ── 대만 ──
r('TW', 'whisky_total', 'imports', '2023', 2735, 'man_L', { role: 'base', confidence: 'official-cited', verified: 'snippet', sources: ['TW_CH9', 'TW_IEAT'], money: { amount: 225.43e8, currency: 'TWD' }, note: '2024 공식값 미확보 → 2023 값. 2024 SWA→대만 물량 −17%, IndexBox 2024 추정 2,600만 L' });
r('TW', 'whisky_total', 'imports', '2024', 26, 'ML', { role: 'reference', confidence: 'aggregator', verified: 'primary', sources: ['TW_INDEXBOX'], money: { amount: 644e6, currency: 'USD' } });
r('TW', 'baijiu', 'revenue_kkl', '2024', null, 'money_only', { role: 'reference', confidence: 'press-report', verified: 'snippet', sources: ['TW_CTEE'], money: { amount: 121e8, currency: 'TWD' }, note: '금문주창(金門酒廠) 매출. 2025 116억. 대만 백주 시장 점유율 약 80%' });
r('TW', 'baijiu', 'sales_proxy', '2024', 25, 'ML', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['TW_CTEE'], formula: '금문 매출 121억 대만달러 ÷ 평균 출고가 약 NT$600/L ≈ 2,000만 L, ÷ 점유율 80% ≈ 2,500만 L', note: '물량 공식값 없음 — 신뢰도 낮음. "하루 소비 4.5만 L" 언급(연도 불명)으로 환산해도 약 1,600만 L/80% ≈ 2,000만 L로 같은 규모' });
r('TW', 'scotch', 'exports_to_market', '2024', null, 'money_only', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024', 'SWA_TSB_VALUE'], money: { amount: 298e6, currency: 'GBP' }, note: '가치 4위. 병 수 미공표' });

// ── 미국 (DISCUS 2024, 공급사 판매) ──
const US = { sources: ['US_DISCUS', 'US_DISCUS_ALT'], confidence: 'industry-assoc', verified: 'snippet' };
r('US', 'spirits_total', 'supplier_sales', '2024', 312162, 'k9L', { ...US, role: 'total', money: { amount: 37.2e9, currency: 'USD' }, note: 'RTD 포함. 카테고리 합계 검증됨' });
r('US', 'vodka', 'supplier_sales', '2024', 74119, 'k9L', { ...US, role: 'base', money: { amount: 7227e6, currency: 'USD' } });
r('US', 'agave_total', 'supplier_sales', '2024', 32199, 'k9L', { ...US, role: 'total', sources: ['US_DISCUS', 'US_DISCUS_AGAVE'], money: { amount: 6715e6, currency: 'USD' }, note: '테킬라+메스칼' });
r('US', 'mezcal', 'depletions', '2024', 580, 'k9L', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['US_SHANKEN_MEZCAL'], note: '−5.5만 케이스. 집계 기관이 DISCUS와 다름' });
r('US', 'tequila', 'supplier_sales', '2024', 31619, 'k9L', { ...US, role: 'base', confidence: 'estimate', formula: '32,199 − 메스칼 580 (기관 혼합 근사)' });
r('US', 'whisky_total', 'supplier_sales', '2024', 71948, 'k9L', { ...US, role: 'total' });
r('US', 'american_whiskey', 'supplier_sales', '2024', 30284, 'k9L', { ...US, role: 'base', money: { amount: 5175e6, currency: 'USD' }, note: '버번·테네시·라이 미분리' });
r('US', 'whisky_other', 'supplier_sales', '2024', 11656, 'k9L', { ...US, role: 'base', money: { amount: 963e6, currency: 'USD' }, note: 'DISCUS "Blended whiskey". 재패니즈 위스키가 별도 항목이 없어 여기 포함된 것으로 추정' });
r('US', 'canadian', 'supplier_sales', '2024', 17339, 'k9L', { ...US, role: 'base', money: { amount: 2330e6, currency: 'USD' } });
r('US', 'scotch', 'supplier_sales', '2024', 7868, 'k9L', { ...US, role: 'base', money: { amount: 2228e6, currency: 'USD' }, formula: '블렌디드 6,158 + 싱글몰트 1,710' });
r('US', 'irish', 'supplier_sales', '2024', 4801, 'k9L', { ...US, role: 'base', money: { amount: 1157e6, currency: 'USD' } });
r('US', 'rum', 'supplier_sales', '2024', 20677, 'k9L', { ...US, role: 'base', money: { amount: 2231e6, currency: 'USD' } });
r('US', 'gin', 'supplier_sales', '2024', 8322, 'k9L', { ...US, role: 'base', money: { amount: 957e6, currency: 'USD' } });
r('US', 'brandy_total', 'supplier_sales', '2024', 11706, 'k9L', { ...US, role: 'base', money: { amount: 2133e6, currency: 'USD' }, note: '코냑 포함, 미분리' });
r('US', 'liqueur', 'supplier_sales', '2024', 20079, 'k9L', { ...US, role: 'base', money: { amount: 2809e6, currency: 'USD' } });
r('US', 'rtd', 'supplier_sales', '2024', 73110, 'k9L', { ...US, role: 'reference', money: { amount: 3299e6, currency: 'USD' }, note: '스피릿 수요에서 제외' });
r('US', 'scotch', 'exports_to_market', '2024', 132, 'Mbottles70', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 971e6, currency: 'GBP' }, note: 'SWA 기준(벌크·재고 포함) — 미국 수요는 DISCUS 값 사용' });
r('US', 'american_whiskey', 'production', '2024', 3.03, 'barrels_M', { role: 'reference', confidence: 'industry-assoc', verified: 'snippet', sources: ['US_KDA'], note: '켄터키 버번 통입 배럴 수. 숙성 재고 1,610만 배럴(2025.1.1)' });

// ── 멕시코 ──
r('MX', 'tequila', 'production', '2024', 495.8, 'ML', { role: 'reference', confidence: 'industry-assoc', verified: 'snippet', sources: ['MX_CRT'], note: '40% 기준' });
r('MX', 'tequila', 'exports', '2024', 402.7, 'ML', { role: 'reference', confidence: 'press-report', verified: 'snippet', sources: ['MX_INFORMADOR'], note: 'CRT 수정치 채택(잠정 400.3). 미국행 334.9' });
r('MX', 'tequila', 'consumption_proxy', '2024', 93.1, 'ML', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['MX_CRT', 'MX_INFORMADOR'], formula: '생산 495.8 − 수출 402.7', note: '재고 변동 무시. CRT 공식 국내시장 값 미확보' });
r('MX', 'mezcal', 'domestic_sales', '2024', 3.1, 'ML', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['MX_ELFIN', 'MX_MEZCALISTAS'], note: '국내용 병입량, −16.7%' });
r('MX', 'tequila', 'agave_use', '2024', 1.8, 'Mt', { role: 'reference', confidence: 'industry-assoc', verified: 'snippet', sources: ['MX_CRT', 'MX_INFORMADOR'], note: '아가베 사용량 — 공급 사이클 이벤트 기준값' });

// ── 캐나다 ──
const CA = { confidence: 'official', verified: 'primary', sources: ['CA_STATCAN_TBL'] };
r('CA', 'spirits_total', 'sales', 'FY2024/25', 176733, 'kL', { ...CA, role: 'total', sources: ['CA_STATCAN_TBL', 'CA_STATCAN'], money: { amount: 6669.532e6, currency: 'CAD' }, note: '국산 96,630 / 수입 80,103. 주종 8개 합계와 일치(검산). FY2023/24 184,854' });
r('CA', 'vodka', 'sales', 'FY2024/25', 48062, 'kL', { ...CA, role: 'base', money: { amount: 1525.33e6, currency: 'CAD' } });
r('CA', 'whisky_total', 'sales', 'FY2024/25', 46671, 'kL', { ...CA, role: 'base', sources: ['CA_STATCAN_TBL', 'CA_STATISTA_WHISKY'], money: { amount: 1977.096e6, currency: 'CAD' }, note: '국산 28,920(대부분 캐나디안 추정) / 수입 17,751. 원산지 국가별 구분 없음' });
r('CA', 'liqueur', 'sales', 'FY2024/25', 28731, 'kL', { ...CA, role: 'base', money: { amount: 1027.216e6, currency: 'CAD' } });
r('CA', 'rum', 'sales', 'FY2024/25', 26029, 'kL', { ...CA, role: 'base', sources: ['CA_STATCAN_TBL', 'CA_STATISTA_RUM'], money: { amount: 908.799e6, currency: 'CAD' } });
r('CA', 'spirits_other', 'sales', 'FY2024/25', 11962, 'kL', { ...CA, role: 'base', money: { amount: 573.052e6, currency: 'CAD' }, note: '테킬라 포함(단독 값 없음)' });
r('CA', 'gin', 'sales', 'FY2024/25', 10481, 'kL', { ...CA, role: 'base', money: { amount: 408.308e6, currency: 'CAD' } });
r('CA', 'brandy_total', 'sales', 'FY2024/25', 4389, 'kL', { ...CA, role: 'base', money: { amount: 233.828e6, currency: 'CAD' }, note: '코냑 구분 없음' });

// ── 영국 ──
r('UK', 'spirits_total', 'domestic_release', '2024', 130.4, 'ML_LPA', { role: 'total', confidence: 'aggregator', verified: 'snippet', sources: ['UK_SHELFDROP'], abvAssumed: 0.40, note: 'HMRC 출고(순수알코올, RTD 포함). 제품 액량 = LPA ÷ 0.40 가정' });
r('UK', 'cognac', 'shipments', '2024', 7.8, 'Mbottles70', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['BNIC_TSB'] });

// ── 프랑스 ── (대형마트 채널 한정 값이 많음)
r('FR', 'spirits_total', 'sales_gms', '2024', 247, 'ML', { role: 'total', confidence: 'official', verified: 'snippet', sources: ['FR_FRANCEAGRIMER'], money: { amount: 4.9e9, currency: 'EUR' }, note: '대형마트(GMS) 채널만' });
r('FR', 'whisky_total', 'sales_gms', '2024', share(247, 38), 'ML', { role: 'reference', confidence: 'estimate', verified: 'primary', sources: ['FR_FRANCEAGRIMER', 'FR_BOTTL'], formula: '247 × 38% (FranceAgriMer GMS 물량 비중)', note: 'GMS 한정 → SWA 스카치 값보다 작음' });
r('FR', 'spirits_total', 'sales_all_channels', '2024', 267.8, 'ML', { role: 'reference', confidence: 'estimate', verified: 'primary', sources: ['FR_FRANCEAGRIMER', 'FR_LINFO'], formula: 'GMS 247 + CHR 20.8(단위 미기재 → L 가정)', note: '순수알코올 기준 소비 −2.6%' });
r('FR', 'scotch', 'exports_to_market', '2024', 177, 'Mbottles70', { role: 'base', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 419e6, currency: 'GBP' }, note: '전 채널 대리값(수출국 기준)' });
r('FR', 'anise', 'sales_gms', '2024', share(247, 19.3), 'ML', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['FR_ITM'], formula: '247 × 19.3% (점유율 연도 불확실)', note: 'GMS 한정 → 과소' });
r('FR', 'rum', 'sales_gms', '2024', share(247, 14.2), 'ML', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['FR_ITM'], formula: '247 × 14.2%', note: 'GMS 한정 → 과소' });
r('FR', 'vodka', 'sales_gms', '2024', 22.5, 'ML', { role: 'base', confidence: 'aggregator', verified: 'snippet', sources: ['FR_SIDELY'], note: 'GMS 한정 → 과소' });
r('FR', 'gin', 'sales_gms', '2024', 5.25, 'ML', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['FR_RAYON'], formula: 'Gibson’s 210만 L ÷ 40% 점유 = 상한', note: '상한 추정, 신뢰도 낮음' });
r('FR', 'cognac', 'shipments', '2024', 5.3, 'Mbottles70', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['BNIC_TSB'] });
r('FR', 'armagnac', 'sales', '2024', 1.4, 'Mbottles70', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['BNIA_F3'], note: '신뢰도 낮음(같은 기사에 총량 300만/280만 병 혼재)' });
r('FR', 'calvados', 'sales', '2024', share(4.615, 53), 'Mbottles70', { role: 'base', confidence: 'estimate', verified: 'snippet', sources: ['IDAC_DISTILNEWS'], formula: '461.5만 병 × 국내 53%' });

// ── 독일 (BSI 2024 잠정, 시장 공급량) ──
const DE = { confidence: 'estimate', verified: 'primary', sources: ['DE_BSI'] };
r('DE', 'spirits_total', 'market_supply', '2024', 683, 'Mbottles70', { role: 'total', confidence: 'industry-assoc', verified: 'primary', sources: ['DE_BSI'], note: '생산 571 − 수출 339 + 수입 451. 벌크 이중계산 1.1억 병 이상 포함 → 실소비보다 큼' });
r('DE', 'liqueur', 'market_supply', '2024', share(683, 28.4), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 28.4%' });
r('DE', 'vodka', 'market_supply', '2024', share(683, 16.0), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 16.0%' });
r('DE', 'korn_clear', 'market_supply', '2024', share(683, 14.8), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 14.8%' });
r('DE', 'whisky_total', 'market_supply', '2024', share(683, 12.4), 'Mbottles70', { ...DE, role: 'total', formula: '683 × 12.4%' });
r('DE', 'scotch', 'exports_to_market', '2024', 56, 'Mbottles70', { role: 'base', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 169e6, currency: 'GBP' } });
r('DE', 'rum', 'market_supply', '2024', share(683, 10.2), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 10.2% (Rum, Arrak, Taffia)' });
r('DE', 'spirits_other', 'market_supply', '2024', share(683, 6.2), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 6.2%' });
r('DE', 'fruit_brandy', 'market_supply', '2024', share(683, 5.2), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 5.2%' });
r('DE', 'gin', 'market_supply', '2024', share(683, 3.7), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 3.7% (Gin, Genever, Wacholder)' });
r('DE', 'brandy_total', 'market_supply', '2024', share(683, 3.1), 'Mbottles70', { ...DE, role: 'base', formula: '683 × 3.1% (Weinbrand, Cognac/Armagnac)' });

// ── 스페인 (협회 소비 180M L × Mercasa 점유율) ──
const ES = { confidence: 'estimate', verified: 'snippet', sources: ['ES_EE', 'ES_MERCASA'] };
r('ES', 'spirits_total', 'consumption', '2024', 180, 'ML', { role: 'total', confidence: 'industry-assoc', verified: 'snippet', sources: ['ES_EE', 'ES_DBK'], money: { amount: 2075e6, currency: 'EUR' }, note: '−3.7%. 금액은 DBK 시장가치' });
r('ES', 'whisky_total', 'consumption', '2024', share(180, 24), 'ML', { ...ES, role: 'total', formula: '180 × 24% (DBK는 27%)' });
r('ES', 'scotch', 'exports_to_market', '2024', 59, 'Mbottles70', { role: 'base', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 196e6, currency: 'GBP' } });
r('ES', 'liqueur', 'consumption', '2024', share(180, 22), 'ML', { ...ES, role: 'base', formula: '180 × 22% (DBK 20%)' });
r('ES', 'gin', 'consumption', '2024', share(180, 19), 'ML', { ...ES, role: 'base', formula: '180 × 19% (DBK 23%)' });
r('ES', 'rum', 'consumption', '2024', share(180, 15), 'ML', { ...ES, role: 'base', formula: '180 × 15% (DBK 16%)' });
r('ES', 'brandy_total', 'consumption', '2024', share(180, 8), 'ML', { ...ES, role: 'base', formula: '180 × 8% (DBK 4%)' });
r('ES', 'vodka', 'consumption', '2024', share(180, 5), 'ML', { ...ES, role: 'base', formula: '180 × 5% (DBK 3%)' });
r('ES', 'anise', 'consumption', '2024', share(180, 5), 'ML', { ...ES, role: 'base', formula: '180 × 5%' });

// ── 인도 (IMFL, FY2025 = 2024.4~2025.3) ──
const IN = { confidence: 'estimate', verified: 'snippet', sources: ['IN_CIABC', 'IN_CRISIL'] };
r('IN', 'spirits_total', 'sales', 'FY2025', 401.7, 'M9L', { role: 'total', confidence: 'industry-assoc', verified: 'snippet', sources: ['IN_CIABC'], note: 'IMFL 40.17 crore cases. 케이스=9L 가정' });
r('IN', 'whisky_total', 'sales', 'FY2025', share(401.7, 65), 'M9L', { ...IN, role: 'base', formula: '401.7 × 65% (Crisil 믹스)' });
r('IN', 'brandy_total', 'sales', 'FY2025', share(401.7, 20), 'M9L', { ...IN, role: 'base', formula: '401.7 × 20%' });
r('IN', 'rum', 'sales', 'FY2025', share(401.7, 12), 'M9L', { ...IN, role: 'base', formula: '401.7 × 12%' });
r('IN', 'white_spirits', 'sales', 'FY2025', share(401.7, 3), 'M9L', { ...IN, role: 'base', formula: '401.7 × 3% (보드카+진)' });
r('IN', 'whisky_total', 'sales', 'FY2023', 243, 'M9L', { role: 'reference', confidence: 'industry-assoc', verified: 'snippet', sources: ['IN_BS_FY23'], note: 'IMFL 385M의 63%. FY2025에 63%를 적용하면 약 253M(3차) vs Crisil 65% 261M' });
r('IN', 'scotch', 'exports_to_market', '2024', 192, 'Mbottles70', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 248e6, currency: 'GBP' }, note: '벌크 포함(IMFL 블렌딩용) → 위스키 수요와 중복' });

// ── 동남아 ──
r('PH', 'spirits_total', 'consumption', '2024', 633.6, 'ML', { role: 'total', confidence: 'aggregator', verified: 'snippet', sources: ['PH_STATISTA'] });
r('PH', 'gin', 'brand_sales', '2024?', 39.8, 'M9L', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['PH_DI_GIN'], note: 'Ginebra San Miguel 단일 브랜드 → 카테고리 하한' });
r('PH', 'rum', 'brand_sales', '2024', 23.8, 'M9L', { role: 'base', confidence: 'press-report', verified: 'snippet', sources: ['PH_TSB_RUM'], note: 'Tanduay 단일 브랜드 → 카테고리 하한' });
r('TH', 'spirits_total', 'consumption', '2024', 737, 'ML', { role: 'base', confidence: 'aggregator', verified: 'snippet', sources: ['TH_EUROMONITOR'], note: '주종 분리 없음' });
r('VN', 'spirits_total', 'consumption', '2024', 49.2, 'ML', { role: 'base', confidence: 'aggregator', verified: 'snippet', sources: ['VN_STATISTA'], note: '비공식(가양주) 물량 미포함' });

// ── 면세 ──
r('TRAVEL_RETAIL', 'spirits_total', 'sales', '2018', 24.5, 'M9L', { role: 'base', confidence: 'aggregator', verified: 'snippet', sources: ['TR_IWSR_2019'], money: { amount: 9.2e9, currency: 'USD' }, note: '최신 공개 절대값이 2018년 → 오래됨. 2023 물량 +4%, 2024 +5%(IWSR)' });

// ── 참고: SWA 기타 시장, 코냑 권역, 세계 총량 ──
r('BR', 'scotch', 'exports_to_market', '2024', 52, 'Mbottles70', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'] });
r('PL', 'scotch', 'exports_to_market', '2024', 48, 'Mbottles70', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'] });
r('TR', 'scotch', 'exports_to_market', '2024', 47, 'Mbottles70', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 178e6, currency: 'GBP' } });
r('CN', 'scotch', 'exports_to_market', '2024', 30, 'Mbottles70', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 161e6, currency: 'GBP' }, note: '중국 수요는 해관 수입값 사용' });
r('SG', 'scotch', 'exports_to_market', '2024', null, 'money_only', { role: 'reference', confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024'], money: { amount: 310e6, currency: 'GBP' }, note: '재수출 허브' });
r('NA_REGION', 'cognac', 'shipments', '2024', 70.6, 'Mbottles70', { role: 'reference', confidence: 'press-report', verified: 'snippet', sources: ['BNIC_TSB'], money: { amount: 1.12e9, currency: 'EUR' }, note: '미국 단독 미공표' });
r('FAR_EAST', 'cognac', 'shipments', '2024', 47.5, 'Mbottles70', { role: 'reference', confidence: 'press-report', verified: 'snippet', sources: ['BNIC_TSB'], money: { amount: 1.12e9, currency: 'EUR' } });
r('EUROPE_REGION', 'cognac', 'shipments', '2024', 31.6, 'Mbottles70', { role: 'reference', confidence: 'press-report', verified: 'snippet', sources: ['BNIC_TSB'], money: { amount: 461e6, currency: 'EUR' }, note: '프랑스 포함 여부 미확인' });
const GL = { role: 'reference', verified: 'snippet' };
r('GLOBAL', 'whisky_total', 'consumption', '2024', 480, 'M9L', { ...GL, confidence: 'aggregator', verified: 'primary', sources: ['GL_TSB_WHISKY_2025'], note: 'Euromonitor 추정치(원문 "estimated"). 2023 463. URL 확정(3차)' });
r('GLOBAL', 'vodka', 'consumption', '2024', 338.4, 'M9L', { ...GL, confidence: 'aggregator', sources: ['GL_TSB_VODKA'], note: 'Euromonitor(원문 "expected"). URL 확정(3차)' });
r('GLOBAL', 'gin', 'consumption', '2024', 107, 'M9L', { ...GL, confidence: 'aggregator', sources: ['GL_TSB_GIN_IWSR'], note: 'IWSR 값(3차 채택). Euromonitor 108.2는 기사 미확인 — 다른 주종(Euromonitor)과 기관 혼용 주의' });
r('GLOBAL', 'rum', 'consumption', '2024', 165, 'M9L', { ...GL, confidence: 'aggregator', sources: ['PH_TSB_RUM'], note: 'Euromonitor. 2023 160. URL 확정(3차)' });
r('GLOBAL', 'brandy_total', 'consumption', '2024', 165.2, 'M9L', { ...GL, confidence: 'estimate', sources: ['GL_TSB_BRANDY'], formula: '2025 예측 166.9 ÷ 1.01' });
r('GLOBAL', 'liqueur', 'consumption', '2024', 130.7, 'M9L', { ...GL, confidence: 'aggregator', sources: ['GL_TSB_LIQUEUR'], note: 'URL 미확정' });
r('GLOBAL', 'scotch', 'consumption', '2024', 96.8, 'M9L', { ...GL, confidence: 'estimate', sources: ['GL_TSB_SCOTCH'], formula: '2025 예측 98.1 ÷ 1.0138 (사전 예측 101.4와 충돌)' });
r('GLOBAL', 'scotch', 'exports', '2024', 1400, 'Mbottles70', { ...GL, confidence: 'industry-assoc', verified: 'primary', sources: ['SWA_2024', 'SWA_NEWS'], money: { amount: 5.4e9, currency: 'GBP' }, note: '병입 블렌디드 811 / 병입 싱글몰트 127 / 기타(벌크 포함) 464 백만 병' });
r('GLOBAL', 'cognac', 'shipments', '2024', 166, 'Mbottles70', { ...GL, confidence: 'press-report', sources: ['BNIC_TSB'], money: { amount: 3.0e9, currency: 'EUR' }, note: 'VS +13.7%, VSOP −8.6%, XO −26.4%' });
r('GLOBAL', 'calvados', 'sales', '2024', 4.615, 'Mbottles70', { ...GL, confidence: 'industry-assoc', sources: ['IDAC_DISTILNEWS'], note: '12,909 hl AP. 수출 47%' });
r('GLOBAL', 'armagnac', 'sales', '2024', 3.0, 'Mbottles70', { ...GL, confidence: 'press-report', sources: ['BNIA_F3', 'FEVS_2024'], note: '신뢰도 낮음. FEVS 수출 14.6만 케이스(12병)' });
r('GLOBAL', 'agave_total', 'consumption', '2024', 48.4, 'M9L', { ...GL, confidence: 'estimate', sources: ['US_DISCUS'], formula: '미국 32.3 ÷ (미국 비중 2/3) = 상한' });

// ───────────────────────── 계산 ─────────────────────────
for (const rec of records) {
  if (rec.sources.some((s) => !SOURCES[s])) throw new Error(`unknown source in ${rec.market}.${rec.category}`);
  if (!MARKETS[rec.market]) throw new Error(`unknown market ${rec.market}`);
  if (!CATEGORIES[rec.category]) throw new Error(`unknown category ${rec.category}`);
  const u = UNITS[rec.unit];
  if (!u) throw new Error(`unknown unit ${rec.unit}`);
  let litres = null;
  if (rec.value != null) {
    if (u.toL != null) litres = rec.value * u.toL;
    else if (rec.unit === 'ML_LPA' && rec.abvAssumed) litres = (rec.value * 1e6) / rec.abvAssumed;
  }
  rec.litres = litres == null ? null : Math.round(litres);
  rec.cases9L = litres == null ? null : Math.round(litres / 9);
  rec.conversionEstimate = Boolean(u.estimateNote || rec.abvAssumed);
  if (u.estimateNote) rec.conversionNote = u.estimateNote;
}

const out = {
  meta: {
    title: 'Distillery Tycoon — 국가·지역 × 주종 기본 수요',
    version: '0.1.0',
    generatedBy: 'scripts/build-demand-data.mjs',
    accessed: ACCESSED,
    baseYear: 2024,
    unit: '9L 케이스/년 (제품 액량 기준). litres = 제품 액량 L',
    roles: {
      base: '게임 수요 셀로 바로 사용',
      total: '상위 합계. 하위 base와 중복되므로 합산 금지 — 하위가 비어 있는 부분(잔여)을 계산할 때 사용',
      reference: '참고값(수출·생산·대체값·권역). 수요로 직접 사용하지 않음',
    },
    confidence: ['official', 'official-cited', 'industry-assoc', 'press-report', 'aggregator', 'estimate'],
    verified: { primary: '원문 열람', snippet: '검색 요약만 확인' },
    warnings: [
      '시장마다 지표가 다름(출고·과세·수입·공급·소비·수출국 선적). 시장 간 절대값 직접 비교 금지',
      '수출국 기준 값(SWA·BNIC·CRT)은 재고 조정·재수출이 섞여 해당 연도 소비와 1:1 아님 → 게임에서는 3~5년 평활화 권장',
      '중국 백주는 65도 환산 액량, 영국은 순수알코올 → 40% 가정 환산',
      '독일은 벌크 이중계산 포함 공급량 → 실소비보다 큼. 프랑스 일부는 대형마트 채널 한정 → 과소',
    ],
  },
  markets: MARKETS,
  gameMarkets: GAME_MARKETS,
  categories: CATEGORIES,
  sources: Object.fromEntries(Object.entries(SOURCES).map(([id, [publisher, title, url]]) => [id, { publisher, title, url, accessed: ACCESSED }])),
  records: records.map((x) => ({
    id: `${x.market}.${x.category}.${x.metric}.${x.period}`,
    market: x.market, category: x.category, metric: x.metric, period: x.period, role: x.role,
    original: { value: x.value, unit: x.unit },
    litres: x.litres, cases9L: x.cases9L,
    ...(x.abvBasis ? { abvBasis: x.abvBasis } : {}),
    ...(x.abvAssumed ? { abvAssumed: x.abvAssumed } : {}),
    ...(x.money ? { money: x.money } : {}),
    confidence: x.confidence, verified: x.verified, conversionEstimate: x.conversionEstimate,
    ...(x.conversionNote ? { conversionNote: x.conversionNote } : {}),
    ...(x.formula ? { formula: x.formula } : {}),
    ...(x.note ? { note: x.note } : {}),
    sources: x.sources,
  })),
};

const ids = new Set();
for (const rec of out.records) {
  if (ids.has(rec.id)) throw new Error(`duplicate id ${rec.id}`);
  ids.add(rec.id);
}
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + '\n');

// ───────────────────────── 문서 표 생성 ─────────────────────────
const fmtM = (c) => (c == null ? '—' : c / 1e6 >= 0.1 ? (c / 1e6).toFixed(2) : (c / 1e6).toFixed(3));
const fmtOrig = (x) => (x.value == null ? '—' : `${x.value.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${UNITS[x.unit].label}`);
const conf = (x) => `${x.confidence}${x.verified === 'primary' ? ' ✓' : ''}${x.conversionEstimate ? ' ≈' : ''}`;
const catOrder = Object.keys(CATEGORIES);
const lines = [];
for (const m of GAME_MARKETS) {
  const rows = records.filter((x) => x.market === m && x.role !== 'reference').sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category));
  lines.push(`### ${m} — ${MARKETS[m]}`, '');
  if (!rows.length) { lines.push('_데이터 없음_', ''); continue; }
  lines.push('| 주종 | 역할 | 백만 9L 케이스 | 원문 값 | 지표 | 기간 | 신뢰도 | 비고 |', '|---|---|---:|---|---|---|---|---|');
  for (const x of rows) {
    const note = [x.formula ? `계산: ${x.formula}` : '', x.note || ''].filter(Boolean).join(' · ');
    lines.push(`| ${CATEGORIES[x.category].nameKo} | ${x.role} | ${fmtM(x.cases9L)} | ${fmtOrig(x)} | ${x.metric} | ${x.period} | ${conf(x)} | ${note} |`);
  }
  lines.push('');
}
const md = readFileSync(OUT_MD, 'utf8');
const start = '<!-- matrix:start -->';
const end = '<!-- matrix:end -->';
const i = md.indexOf(start), j = md.indexOf(end);
if (i < 0 || j < 0) throw new Error('matrix markers not found in demand-data.md');
writeFileSync(OUT_MD, md.slice(0, i + start.length) + '\n\n' + lines.join('\n') + '\n' + md.slice(j));
console.log(`records: ${records.length} (base ${records.filter((x) => x.role === 'base').length}, total ${records.filter((x) => x.role === 'total').length}, reference ${records.filter((x) => x.role === 'reference').length})`);
