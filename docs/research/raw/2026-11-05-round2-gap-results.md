I've completed `demand-gap-results.md` below. Of the seven conflicts you listed, four are now resolved: Korean soju exports, tequila exports, agave use and Calvados. Armagnac 2024 is only provisionally decided, and the Japanese whisky year is on hold until someone opens the NTA Excel table. For China, I also explained why the 2023 baijiu figure isn't comparable with 2024. Germany and Spain, which were empty after the first round, now have figures from the BSI and Espirituosos España. Several items still need the government portal tables, which I couldn't open: Taiwan's 2024 customs imports, Canada's sales table, Japan's import statistics and Korea's per-category releases. The search budget ran out before I reached the Philippines, Thailand, Vietnam, duty-free, India by category, French on-trade, and the Canadian and Chinese consumption items. These are listed in section 3.

```markdown
# demand-gap-results.md — 국가·지역 × 주종별 기본 수요 2차 보완 조사 (2024 기준)

2차 조사로 충돌 수치 4건(한국 소주 수출, 테킬라 수출량, 아가베 사용량, 칼바도스 판매량)을 판정했습니다. 아르마냑 2024는 잠정 채택(신뢰도 낮음)이고, 일본 위스키 과세수량 연도는 원표 미열람으로 보류했습니다. 중국 백주 2023/2024의 집계 기준 차이도 설명했습니다. 1차에서 비어 있던 독일·스페인은 협회 값으로 채웠습니다(독일은 원문 열람, 스페인은 협회 보도자료 인용). 다만 대만 2024 수입 원표, 캐나다 판매 통계, 일본 수입 통계, 한국 주종별(위스키·브랜디 등) 출고량처럼 정부 포털 원표가 필요한 항목은 공식 값을 확보하지 못했습니다.

**TL;DR**
- **판정 결과:** 한국 "소주 수출 2억 달러·124,000톤"은 일반소주와 과일소주(혼성주)를 합친 '소주류' 값입니다. 소주 단독은 일반소주 1억 400만 달러(관세청)이며, 관세청 통계 인용 보도 기준 1억 451만 달러, 7만 62톤입니다. 테킬라 2024 수출량은 CRT 수정치 4억 270만 L를 채택합니다. 칼바도스의 13,871hl AP는 2023년 값으로 보이며, 2024년은 461.5만 병(12,909hl AP)입니다.
- **새로 채운 공백:** 독일(BSI)은 2024년 시장 공급 6억 8,300만 병(0.7L)과 주종별 비중을, 스페인(Espirituosos España)은 2024년 소비 1억 8,000만 L를 확보했습니다. SWA 2024 수출량 상위 10개 시장, BNIC 지역별 선적량, 중국 해관 위스키·브랜디 수입량도 확인했습니다.
- **주의할 점:** 시장마다 지표가 다릅니다. 독일은 공급, 스페인은 소비, 영국은 순수알코올 기준 과세 출고, 미국은 공급사 판매, 한국은 수입분이 포함된 출고입니다. 따라서 시장 간 수치를 그대로 비교하면 안 됩니다. 대만 2024 위스키 수입은 집계 사이트 추정치(2,600만 L)뿐입니다.

---

## 0. 메타

- **조사일:** 2026-11-05 (Asia/Tokyo)
- **조사 범위:** 웹 검색 18회와 원문 열람 7건을 수행했고, 대만 항목은 보조 조사원 1회를 투입했습니다.
- **접근하지 못한 출처와 이유**
  - 국세통계포털(TASIS) 주류 출고 현황 원표: 검색으로 노출되지 않아 원표를 열지 못했습니다. 언론 재가공 값만 확보했습니다.
  - 관세청 수출입무역통계(HS 2208.xx 원산지별): 동적 조회 포털이라 열람하지 못했습니다. Statista 집계표는 유료입니다.
  - 일본 재무성 무역통계, 국세청「酒のしおり」Excel 원표: 목차 페이지만 확인했고 개별 수치표는 열지 못했습니다.
  - 중국 해관총서 원표: 업계 매체가 재인용한 값만 확보했습니다.
  - 대만 재정부 관무서 포털, data.gov.tw(국고서 위스키 수량표): 자동 접속이 차단됐습니다.
  - 캐나다 통계청 Table 10-10-0010-01: 검색 예산이 소진되어 조회하지 못했습니다.
  - IWSR, Euromonitor, Statista, NielsenIQ, CGA: 유료입니다.
  - HMRC Alcohol Bulletin ODS 원표: 공표 페이지는 열람했지만 ODS 파일은 열지 못했습니다.\[1\]
  - BNIA(아르마냑) 2024 수치 슬라이드: 정부(DRAAF) PDF 안에 이미지로 들어 있어 수치를 추출하지 못했습니다.\[2\]
  - DISCUS 2025 AEB Support Tables: 검색 스니펫으로만 확인했습니다.

---

## 1. 결과 표

공통 열 정의는 요청서 그대로입니다. 접속일은 모두 2026-11-05입니다. 신뢰도 표기 중 "official(재인용)"은 정부 통계를 언론이나 업계 매체가 재인용한 경우입니다.

### A. 한국

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| KR | soju_diluted | domestic_release | 81.6만 | ㎘ | 2024 (CY) | 데이터뉴스, 「술 소비 줄었다…국내 주류 출고량 10년 새 21% 감소」(국세통계포털 분석) | https://datanews.co.kr/news/article.html?no=146553 | 원문 열람 | press-report | 815,712kL를 반올림하면 81.6만㎘로 일치합니다. 다만 1kL 단위 정확값은 TASIS 원표로 확인하지 못했습니다. 2022 86.2만, 2023 84.4만\[3\] |
| KR | soju_diluted | domestic_release | 79.3만 | ㎘ | 2025 (CY, 참고) | 동일 | 동일 | 원문 열람 | press-report | 3년 연속 감소\[3\] |
| KR | (주류 전체, 코드 없음) | domestic_release | 3,151,371 | kL | 2024 | 술술생활(soollife), 「25년 전통주 트렌드, 국세통계연보로 살펴보다」 | https://soollife.com/?p=46107 | 검색 스니펫 | press-report | 맥주와 탁주를 포함한 전 주종 합계입니다. aT 「2025 주류산업정보 실태조사」 인용 보도도 같은 값입니다\[4\]\[5\] |
| KR | (일반증류주) | domestic_release | 전년 대비 +113.2%\[4\] | % | 2024 | 푸드투데이, aT 「2025 주류산업정보 실태조사」 보도 | https://www.foodtoday.or.kr/news/article.html?no=204014 | 검색 스니펫 | press-report | 절대량(kL)은 찾지 못했습니다 |
| KR | soju_diluted (일반소주) | exports | 104 | 백만달러 | 2024 | 관세청 보도자료, 「케이(K)-소주 수출 상한가」 | https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&bbsId=1362&nttSn=10133374&nttSnUrl=9afad13a4d2a5843dc601661494cb61a | 검색 스니펫 | official | 소주 단일 품목 기준입니다. 전년 대비 +2.6%\[6\] |
| KR | (과일소주 등 혼성주) | exports | 96 | 백만달러 | 2024 | 동일 | 동일 | 검색 스니펫 | official | 관세청이 "과일소주 등을 포함하는 혼성주"로 명시합니다. 리큐르 세번입니다. 전년 대비 +5.4%\[6\] |
| KR | (소주류 = 일반+과일) | exports | 200 | 백만달러 | 2024 | 동일 | 동일 | 검색 스니펫 | official | 국가별 비중은 미국 24.3%, 중국 19.9%, 일본 19.2%이며 95개국에 수출했습니다.\[6\]\[7\] 품목별 비중은 일반소주 51.9%, 과일소주 등 혼성주 48.1%입니다(시사저널, 관세청 설명 인용, https://www.sisajournal.com/news/articleView.html?idxno=327026) |
| KR | (소주류 = 일반+과일) | exports | 12만 4천 | 톤 | 2024 | 일간NTN, 「관세청, "케이(K)-소주 수출 상한가…역대 최대 수출 달성"」(관세청 보도 인용) | https://www.intn.co.kr/news/articleView.html?idxno=2042265 | 검색 스니펫 | official(재인용) | 중량 기준이며 전년 대비 +4.2%입니다. 360㎖ 병 약 3억 4천만 병에 해당합니다.\[7\] 일반소주 단독 수출량은 관세청 통계 인용 보도 기준 7만 62톤(+2.3%)입니다(stockplus, https://news.stockplus.com/m?news_id=14197603, 1억 451만 달러를 다룬 기사) |

**지표 해설(A-1 확인 결과):** 공공데이터포털에 있는 국세청 「주류별 지역별 주세 신고 현황」의 유의사항에 따르면 이 통계는 "해당연도 출고 기준"이고, "수입분을 합산"하며, "수입분의 출고량은 수입량"입니다(https://www.data.go.kr/data/15070737/fileData.do, 검색 스니펫). 따라서 출고량에는 **수입분이 포함**됩니다.\[8\] 기준 도수로 환산한다는 언급은 없으므로 실제 액량(제품 kL)으로 판단하지만, 지표 해설 원문은 열지 못했으므로 "확인 불가/추정"입니다. 위스키·브랜디·일반증류주·리큐르·증류식소주의 2024 kL 값과 국내분·수입분 분리값은 찾지 못했습니다(3절 참조).

### B. 일본

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| JP | whisky_total | tax_volume | 못 찾음 | — | FY2024 (2024.4~2025.3) | 국세청, 「酒のしおり（令和8年7月）」 목차 | https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2026/index.htm | 원문 열람(목차만) | official | FY2024 값은 이 판본(2026년 7월 공표)의 "7 酒類課税数量の推移(国税局分及び税関分の合計)"와 "8"(国税局分)에 실려 있습니다.\[9\] Excel 원표를 열지 못해 205,736kl는 검증하지 못했습니다 |

**판본과 연도 대응(검증됨):** 「酒のしおり（令和7年7月）」은 令和5年度(FY2023) 값을 싣고 있습니다(税経新聞이 이 판본으로 FY2023 1인당 소비량을 보도, https://www.zeikei-news.co.jp/news/070801/). \[10\] 「令和8年7月」판은 令和6年度(FY2024) 課税額 1.2조 엔을 싣고 있습니다(https://www.kannaikaikei.jp/news/16241). \[11\] 즉 **N년 7월판에는 FY(N−2) 값이 실립니다.** 205,736kl를 2025년 7월판에서 가져왔다면 FY2023 값이고, 2026년 7월판에서 가져왔다면 FY2024 값입니다.

### C. 중국

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| CN | baijiu | production | 414.5 | 万千升(折65度, 商品量) | 2024 (CY) | 酒业家 경유 국가통계국 발표, 「国家统计局：2024年规上企业白酒产量414.5万千升，同比下降1.8%」 | https://www.163.com/dy/article/JMJ4FDUK053804DM.html | 검색 스니펫 | official(재인용) | 규모 이상 기업 기준이며 전년 대비 −1.8%입니다. 12월 단월은 47.4万千升입니다\[12\] |
| CN | baijiu | production | 449.2 | 万千升 | 2023 | 동일 기사 | 동일 | 검색 스니펫 | official(재인용) | 전년 대비 −2.8%\[12\] |
| CN | baijiu | production | 422.1 | 万千升 | 2023(비교 기준) | 계산 | — | — | estimate | 414.5 ÷ (1 − 0.018)로 계산했습니다. 2024 증가율이 기댄 '비교 가능 기준' 2023 값을 역산한 것입니다 |
| CN | baijiu | exports | 1.64 | 万千升 | 2024 | 人民日报, 「提升国际标准制定话语权，让中国白酒更好走向世界」 | https://paper.people.com.cn/mszk/pc/content/202503/17/content_30065168.html | 검색 스니펫 | press-report | 생산량의 0.39%\[13\] |
| CN | whisky_total | imports | 2919 | 万升 | 2024 | 葡萄酒商业观察(WBO), 「2024年烈酒进口数据出炉：量、额分别下降7.54%、24.17%」(海关总署 데이터) | https://www.wbo529.com/info/3871 | 검색 스니펫 | official(재인용) | 전년 대비 −10.5%. 중국식품토축진출구상회 발표(신랑재경)와 같은 값입니다\[14\]\[15\] |
| CN | whisky_total | imports | 4.51\[14\] | 亿美元 | 2024 | 동일 | 동일 | 검색 스니펫 | official(재인용) | 전년 대비 −22.79%\[14\] |
| CN | scotch (원산지 영국) | imports | 2380 | 万升 | 2024 | 동일 | 동일 | 검색 스니펫 | official(재인용) | 3.91亿美元이며 양은 −8.26%입니다. 상위 10개 원산지 합계는 2878万升 / 4.49亿美元입니다.\[14\] 미국 원산지는 289万升 / 1448万美元(−21.19% / −26.34%, 虎嗅 「中国烈酒进口状况蓝皮书—威士忌精华版」, https://www.huxiu.com/article/4832816.html)이며, 일본·대만 원산지 개별 값은 찾지 못했습니다 |
| CN | brandy_total | imports | 3502 | 万升 | 2024 | 동일(WBO) | 동일 | 검색 스니펫 | official(재인용) | 12.34亿美元(−29.55%).\[16\] 다른 보도의 3503万升/12.3亿, 3501万升/12.33亿과의 차이는 반올림 수준입니다\[15\]\[16\]\[17\] |
| CN | cognac(프랑스산 브랜디 대리값) | imports | 99.69 | % (브랜디 수입액 중 프랑스 비중) | 2024년 4월 단월 | 中国食品安全网, 「4月中国烈酒进口量大幅增长」 | https://www.cfsn.cn/news/detail/341/247660.html | 검색 스니펫 | press-report | HS 2208.20에는 코냑 구분이 없습니다. 프랑스산 비중이 99%대라 대부분 코냑으로 추정되지만 확인 불가입니다\[18\] |
| CN | spirits_total | imports | 1.14 | 亿升 | 2024 | WBO(상동) | https://www.wbo529.com/info/3871 | 검색 스니펫 | official(재인용) | 21.25亿美元.\[14\] 보드카·진·럼·테킬라 개별 수량은 찾지 못했습니다(수입상 발언으로 진 +60.5%, 테킬라 +38.2%라는 언급만 있습니다)\[14\]\[16\] |
| CN | whisky_total | imports | 3584.37\[19\] | 万升 | 2025 (참고) | 虎嗅, 「中国烈酒进口状况蓝皮书—威士忌精华版」 | https://www.huxiu.com/article/4832816.html | 검색 스니펫 | press-report | 4.46亿美元\[19\] |

### D. 대만

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| TW | whisky_total | imports | 2735\[20\] | 萬公升 | 2023 (CY) | 酒訊網, 「2024年酒市景氣展望，進口量連續成長背後的真相」(財政部關務署 통계 인용) | https://ch-9.net/article/I7tL5alc7a | 검색 스니펫 | official(재인용) | 2024 공식값이 없어 2023 값을 씁니다. 225.43億台幣이며, 2022은 2276萬公升 / 168.07億台幣입니다\[20\] |
| TW | whisky_total | imports | 26 | million litres | 2024 | IndexBox, 「Asia-Pacific's Whisky Market Expected to Grow at +0.9% CAGR Over Next Decade」 | https://www.indexbox.io/blog/whisky-asia-pacific-market-overview-2024-2/ | 원문 열람(보조 조사원) | aggregator | US$644M, 약 US$24/L.\[21\] 반올림된 추정치이며 관세 원표가 아닙니다 |
| TW | scotch | exports(SWA→대만) | 298\[22\] | £m | 2024 | Scotch Whisky Association, 「Scotch Whisky 2024 Exports」 인포그래픽 | https://www.scotch-whisky.org.uk/media/2414/2024-export-figures-long-infographic.pdf | 원문 열람 | industry-assoc | 전년 대비 −12.5%(駐英國台北代表處經濟組, https://www.trademag.org.tw/page/newsid1/?id=7915258&iz=6; 인포그래픽은 −13%로 반올림), 가치 기준 4위. 대만행 병 수는 상위 10위 밖이라 공표되지 않았습니다 |
| TW | scotch | exports(SWA→대만) | 전년 대비 −17%\[23\] | % (양) | 2024 | 經濟日報, 「泡沫將至 還是理性回歸？一文看威士忌市場的十年繁華與轉折」 | https://money.udn.com/money/story/123669/8765265 | 검색 스니펫 | press-report | SWA 데이터 인용. 절대량은 공표되지 않았습니다 |

### E. 미국

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| US | american_whiskey | sales(supplier) | 30,284\[24\] | 9-Liter Cases (000s) | 2024 | DISCUS, 「Annual Economic Briefing Support Tables, February 11, 2025」 | https://distilledspirits.org/wp-content/uploads/2025/02/2025-AEB-Support-Tables.pdf | 검색 스니펫 | industry-assoc | 버번·테네시·라이 구분은 표에 없어 찾지 못했습니다 |
| US | whisky_total | sales(supplier) | 71,948\[24\] | 9-Liter Cases (000s) | 2024 | 동일 | 동일 | 검색 스니펫 | industry-assoc | 참고 |
| US | tequila+mezcal | sales(supplier) | 32,199\[24\] | 9-Liter Cases (000s) | 2024 | 동일 | 동일 | 검색 스니펫 | industry-assoc | 메스칼 비중은 찾지 못했습니다. 판매액은 $6,715M\[24\] |
| US | rum | sales(supplier) | 20,677\[24\] | 9-Liter Cases (000s) | 2024 | 동일 | 동일 | 검색 스니펫 | industry-assoc | 참고 |
| US(북미 합계: US·CA·MX) | cognac | shipments | 70.6\[25\] | m bottles | 2024 | The Spirits Business, 「Cognac exports plunge in 2024 as China bites」(BNIC 인용) | https://www.thespiritsbusiness.com/2025/02/cognac-exports-plunge-in-2024-as-china-bites/ | 검색 스니펫 | press-report | +15.3%, €1.12bn.\[25\] 미국 단독 값은 찾지 못했습니다\[26\] |

### F. 멕시코

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| MX | tequila | production | 495.8 | millones de litros | 2024 | CRT, 「Continuará el trabajo coordinado para fortalecer a la agroindustria tequilera」 | https://www.crt.org.mx/2025/03/05/continuara-el-trabajo-coordinado-para-fortalecer-a-la-agroindustria-tequilera/ | 검색 스니펫 | industry-assoc | 2023은 598.7\[27\] |
| MX | tequila | exports | 400.3 | millones de litros | 2024(잠정, 2025.1 발표) | 동일 | 동일 | 검색 스니펫 | industry-assoc | 잠정치 |
| MX | tequila | exports | 402.7 | millones de litros | 2024(수정, 2026.1 보도) | El Informador, 「Industria: Incrementó la exportación y la producción de tequila en 2025」(CRT 기록) | https://www.informador.mx/economia/industria-incremento-la-exportacion-y-laproduccion-de-tequila-en-2025-20260112-0016.html | 검색 스니펫 | press-report | 2025 수출 407.8이 2024 대비 +1.24%라는 서술과 정합합니다\[28\] |
| MX→US | tequila | exports | 334.9\[29\] | millones de litros | 2024 | CRT(상동) | https://www.crt.org.mx/2025/03/05/continuara-el-trabajo-coordinado-para-fortalecer-a-la-agroindustria-tequilera/ | 검색 스니펫 | industry-assoc | 전체 수출의 84%, +4.1%\[29\]\[30\] |
| MX | tequila | (아가베 사용량) | 1.8 | millones de toneladas | 2024 | CRT(상동) | 동일 | 검색 스니펫 | industry-assoc | 2026.1 보도에서도 "1.8 millones de toneladas en 2024"로 재확인됩니다\[28\] |
| MX | tequila | (생산 − 수출) | 93.1 | millones de litros | 2024 | 계산 | — | — | estimate | 495.8 − 402.7로 계산했습니다. 재고 변동을 무시한 값이므로 국내 판매량이 아닙니다. CRT 공식 국내시장 값은 찾지 못했습니다 |

**2024 수출 상위 10개국(CRT 발표 순서):** 미국, 스페인, 독일, 캐나다, 영국, 일본, 프랑스, 이탈리아, 호주, 콜롬비아.\[29\]\[31\] 미국 외 국가의 수량(L)은 공표되지 않았습니다(CRT 보도자료, https://www.crt.org.mx/2025/04/01/ante-aumento-de-aranceles-en-estados-unidos-el-tequila-buscara-conquistar-nuevos-mercados/, 검색 스니펫). 2025년 1월 단월 순위는 미국, 독일, 스페인 순으로 달라 연간 순위와 혼동하면 안 됩니다.\[32\]

### G. 캐나다

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| CA | 전 주종 | sales | 못 찾음 | — | FY2024/25 | Statistics Canada Table 10-10-0010-01 | — | — | — | 검색 예산이 소진되어 조회하지 못했습니다(3절) |

### H. 유럽

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| DE | spirits_total | consumption(Gesamtmarktangebot) | 683 | Mio. Flaschen à 0,7 Liter | 2024(잠정) | BSI, 「Daten aus der Alkoholwirtschaft 2025」 | https://www.spirituosen-verband.de/fileadmin/Datenablage/downloads/BSI-Datenbroschuere_2025.pdf | 원문 열람 | industry-assoc | 생산 571 − 수출 339 + 수입 451로 산출한 겉보기 소비(공급)입니다. BSI는 벌크 이중계산이 1억 1천만 병을 넘는다고 주석에 적었습니다\[33\] |
| DE | liqueur | consumption | 28.4 | % (Gesamtmarktangebot 비중) | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 683 × 28.4% = 194.0 Mio. Fl. (estimate)\[33\] |
| DE | vodka | consumption | 16.0 | % | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 683 × 16.0% = 109.3 Mio. Fl. (estimate)\[33\] |
| DE | (Korn und andere klare Spirituosen) | consumption | 14.8 | % | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 101.1 Mio. Fl. (estimate)\[33\] |
| DE | whisky_total | consumption | 12.4 | % | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 84.7 Mio. Fl. (estimate)\[33\] |
| DE | rum | consumption | 10.2 | % (Rum, Arrak, Taffia) | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 69.7 Mio. Fl. (estimate)\[33\] |
| DE | gin | consumption | 3.7 | % (Gin, Genever und Wacholder) | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 25.3 Mio. Fl. (estimate)\[33\] |
| DE | brandy_total | consumption | 3.1 | % (Weinbrand und Cognac/Armagnac) | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 21.2 Mio. Fl. (estimate)\[33\] |
| DE | (Obstbrände / Sonstige) | consumption | 5.2 / 6.2 | % | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 9개 비중의 합은 100.0%입니다\[33\] |
| DE | spirits_total | consumption(1인당) | 5,0 | Liter Fertigware pro Kopf | 2024(잠정) | 동일(ifo 자료) | 동일 | 원문 열람 | industry-assoc | 순수알코올로 1.7L(33% vol로 환산)\[33\]\[34\] |
| ES | spirits_total | consumption | 180 | millones de litros | 2024 | Espirituosos España 보도자료(2025-06-13), 「Informe Socioeconómico del Sector de Bebidas Espirituosas 2024」 발표 | https://www.espirituosos.es/Prensa/Comunicados-de-prensa/prensa-detalle.aspx?p=2421 | 검색 스니펫 | industry-assoc | "Las ventas de bebidas espirituosas registraron una caída del 3,7% en 2024, hasta los 180 millones de litros". 수출은 137 millones de litros(병 1억 9,500만 개)입니다 |
| ES | whisky_total / liqueur / gin / rum / brandy_total / vodka | consumption | 24 / 22 / 19 / 15 / 8 / 5 | % (양 기준 점유율) | 2024 | Mercasa, 「Alimentación en España – Bebidas espirituosas」 | https://www.mercasa.es/publicaciones/alimentacion-en-espana/bebidas-espirituosas/ | 검색 스니펫 | press-report | 아니스 5%. 180 × 점유율로 계산하면 위스키 43.2, 진 34.2, 럼 27.0, 브랜디 14.4, 보드카 9.0 (백만 L, estimate)\[35\] |
| ES | whisky_total / gin / liqueur / rum / brandy_total / vodka | consumption | 27 / 23 / 20 / 16 / 4 / 3 | % | 2024(잠정) | Empresa Actual, Observatorio Sectorial DBK de INFORMA 보도 | https://www.empresaactual.com/retroceso-consumo-bebidas-espirituosas-arrastra-la-facturacion-del-sector/ | 검색 스니펫 | press-report | Mercasa 점유율과 충돌합니다(2절). 시장 가치는 €2,075M(−2.4%)\[36\]\[37\] |
| ES | whisky_total | imports | casi 62 | millones de litros | 2024 | Mercasa(상동) | 동일 | 검색 스니펫 | press-report | 럼 수입은 36.6 millones de litros\[35\] |
| UK | spirits_total | domestic_release(clearances) | 130.4m | litres of alcohol | 2024 (CY) | Shelfdrop, 「UK alcohol statistics and sales 2026」(HMRC Alcohol Bulletin 가공) | https://www.shelfdrop.com/data/uk-alcohol-statistics | 검색 스니펫 | aggregator | 1억 3,040만 L와 일치합니다. 헥토리터로 표기하면 1,304,000 hl LPA(estimate)입니다. HMRC 원표는 미열람이며, HMRC가 2026.5에 clearances 과거 계열을 개정해 현재 원표 값과 다를 수 있습니다. 스피릿 기반 RTD가 포함됩니다\[1\]\[38\]\[39\] |
| UK | spirits_total | domestic_release | 126.6m | litres of alcohol | 2025 (참고) | 동일 | 동일 | 검색 스니펫 | aggregator | —\[39\] |
| FR | cognac | shipments(국내) | 5.3 | m bottles | 2024 | The Spirits Business(BNIC 인용, 상동) | https://www.thespiritsbusiness.com/2025/02/cognac-exports-plunge-in-2024-as-china-bites/ | 검색 스니펫 | press-report | BNIC 시장 순위 6위\[25\] |
| (SWA 전체) | scotch | exports | 1.4bn\[22\] | 70cl bottles equivalent | 2024 | SWA 2024 Exports 인포그래픽 | https://www.scotch-whisky.org.uk/media/2414/2024-export-figures-long-infographic.pdf | 원문 열람 | industry-assoc | +3.9%. 구성은 블렌디드 병입 811m, 싱글몰트 병입 127m, 기타(벌크 포함) 464m\[22\] |
| IN | scotch | exports(SWA) | 192m | 70cl bottles equivalent | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 수량 1위, +15%.\[22\]\[40\] 벌크 포함이며 병입·벌크 분리값은 공표되지 않았습니다\[22\] |
| FR | scotch | exports(SWA) | 177m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 2위\[22\] |
| US | scotch | exports(SWA) | 132m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 3위\[22\] |
| JP | scotch | exports(SWA) | 74m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 4위\[22\] |
| ES | scotch | exports(SWA) | 59m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 5위\[22\] |
| DE | scotch | exports(SWA) | 56m | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 6위\[22\] |
| BR | scotch | exports(SWA) | 52m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 7위\[22\] |
| PL | scotch | exports(SWA) | 48m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 8위\[22\] |
| TR | scotch | exports(SWA) | 47m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 9위\[22\] |
| CN | scotch | exports(SWA) | 30m\[22\] | 동일 | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 10위\[22\] |
| SG | scotch | exports(SWA) | 310\[22\] | £m | 2024 | 동일 | 동일 | 원문 열람 | industry-assoc | 가치 3위, −17.9%(駐英國台北代表處經濟組, https://www.trademag.org.tw/page/newsid1/?id=7915258&iz=6; 인포그래픽은 −18%로 반올림). 병 수는 공표되지 않았습니다 |
| (BNIC 전체) | cognac | shipments | 166 | millions de bouteilles | 2024 | The Spirits Business(BNIC 인용) | https://www.thespiritsbusiness.com/2025/02/cognac-exports-plunge-in-2024-as-china-bites/ | 검색 스니펫 | press-report | +0.4%, "près de 3 milliards d'euros (moins 10,6 %)"(BNIC, Vitisphere 경유, https://www.commissiondesliqueurs.com/exportations-cognac-chiffres/) |
| (Far East) | cognac | shipments | 47.5\[25\] | m bottles | 2024 | 동일 | 동일 | 검색 스니펫 | press-report | −16%, €1.12bn\[25\] |
| (Europe) | cognac | shipments | 31.6 | m bottles | 2024 | 동일 | 동일 | 검색 스니펫 | press-report | −3.8%, €461m.\[25\] 프랑스 포함 여부는 판정하지 못했습니다(2절) |
| UK | cognac | shipments | 7.8 | m bottles | 2024 | 동일 | 동일 | 검색 스니펫 | press-report | 5위 |
| (BNIA 전체) | armagnac | sales | 3 | millions de bouteilles | 2024 | France 3 Occitanie, 「"On ne va pas se plaindre d'ouvrir un nouveau marché"…」 | https://france3-regions.franceinfo.fr/occitanie/gers/auch/mercosur-on-ne-va-pas-se-plaindre-pourquoi-les-producteurs-d-armagnac-pourraient-etre-les-gagnants-de-l-accord-3284057.html | 검색 스니펫 | press-report | 프랑스 1.4M, 수출 1.6M(France 3). FEVS 2024 수출 통계로는 아르마냑 수출이 146천 케이스(12병, +16.6%, 1,800만 유로)로 약 175만 병(146,000 × 12, estimate)입니다(https://www.fevs.com/wp-content/uploads/2025/02/20250211-dp-fevs-bilan-2024-export-vins-spiritueux-vf-complet.pdf). 같은 기사에 "2,8 millions"라는 값도 함께 있습니다(2절) |
| (BNIA 전체) | armagnac | sales(sorties totales) | 3,7 | millions de bouteilles (équivalent) | 2023 (참고) | Presselib, 「ARMAGNAC L'eau de vie gasconne tirée par l'export」 | https://presselib.com/article/armagnac-l-eau-de-vie-gasconne-tiree-par-l-export | 검색 스니펫 | press-report | 10,344 hl AP. 같은 해 프랑스 1.14M과 수출 1.56M을 더하면 2.70M으로 총 출고와 다릅니다. 기준 차이의 근거입니다\[41\] |
| (IDAC 전체) | calvados | sales | 4 615 000 | bouteilles (équivalent) | 2024 | Distilnews, 「Les expéditions de Calvados progressent en France mais reculent à l'export en 2024」(IDAC 수치) | https://distilnews.fr/calvados-expeditions-2024-croissance-france-repli-export/ | 검색 스니펫 | industry-assoc(재인용) | 12 909 hl AP이며 47%가 수출입니다. 국내분을 추정하면 4,615,000 × 53% ≈ 2.45M병(estimate)\[42\] |
| (IDAC 전체) | calvados | sales | 4 958 000 | bouteilles | 2023 | The Spirits Business, 「Calvados sales see slight dip in 2023」 | https://www.thespiritsbusiness.com/2024/02/calvados-sales-see-slight-dip-in-2023/ | 검색 스니펫 | press-report | 2절 판정 근거\[43\] |
| (IDAC 전체) | calvados | sales | 4 348 000 | bouteilles | 2025 (참고) | Distilnews, 「Le Calvados a enregistré une baisse modérée de 5,6%…」 | https://distilnews.fr/calvados-expeditions-2025-exportation-marche-spiritueux/ | 검색 스니펫 | industry-assoc(재인용) | −5.6%로 역산한 2024 값은 약 4.61M이며 4,615,000과 정합합니다\[44\]\[45\] |

### I. 글로벌 · 인도 · 동남아 · 면세

| 시장 | 주종 | 지표 | 값 | 단위 | 연도 | 출처(발행처 + 문서 제목) | URL | 확인 방식 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| GLOBAL | (카테고리 총량: 위스키 480 등) | consumption | 못 찾음(미검증) | million 9L cases | 2024 | The Spirits Business, 「Top 10 best-selling Brand Champions in 2024」 | https://www.thespiritsbusiness.com/2025/06/top-10-best-selling-brand-champions-in-2024/ | 검색 스니펫 | press-report | Brand Champions 2025 기사 URL은 확인했지만(세계 위스키편: https://www.thespiritsbusiness.com/2025/06/top-10-biggest-world-whisky-brand-champions/), 스니펫에는 카테고리 총량이 없었습니다. 480 / 338.4 / 108.2 / 165 / 약 165 / 130.7은 출처 URL과 연결하지 못했습니다 |
| GLOBAL | scotch | consumption | 101.4m | nine-litre cases | 2024(예측치) | The Spirits Business, 「World Spirits Report 2024: Scotch whisky」(Euromonitor) | https://www.thespiritsbusiness.com/2024/12/world-spirits-report-2024-scotch-whisky/ | 검색 스니펫 | press-report | **예측값**이며 실적이 아닙니다\[46\] |
| GLOBAL | scotch | consumption | 약 96.8m | nine-litre cases | 2024(역산) | The Spirits Business, 「World Spirits Report 2025: Scotch whisky」(Euromonitor 2025 예측 98.1m, +1.38%) | https://www.thespiritsbusiness.com/2025/12/world-spirits-report-2025-scotch-whisky/ | 검색 스니펫 | estimate | 98.1 ÷ 1.0138로 계산했습니다. 101.4m 예측과 충돌합니다(2절)\[47\] |
| IN | (위스키 등 주종별) | sales | 못 찾음 | — | 2024/FY2025 | — | — | — | — | CIABC·ISWAI 공개값을 확보하지 못했습니다 |
| PH, TH, VN, TRAVEL_RETAIL | — | — | 못 찾음 | — | 2024 | — | — | — | — | 3절 |

---

## 2. 충돌 수치 판정

| 항목 | 후보값(출처) | 채택값 | 판정 근거 |
|---|---|---|---|
| 한국 소주 수출 2024 | ① 2억 달러, 124,000톤(korea.net, 관세청 보도) ② 1억 451만 달러(아시아경제) | **소주 단일 품목: 일반소주 1억 400만 달러(관세청, 백만달러 단위 반올림)** / 소주류 합계: 2억 달러, 12만 4천 톤 | 관세청 보도자료가 '소주류 = 일반소주 104 + 과일소주(혼성주) 96 = 200 백만달러'로 분해합니다.\[6\] 따라서 ①은 리큐르 세번인 과일소주를 포함한 합산값이고, ②는 일반소주 단일 세번 값(104 백만달러)과 정합합니다. 아시아경제가 보도한 1억 451만 달러는 데일리한국 보도(관세청 수출입통계 인용, "전년 동기보다 3.1% 증가한 1억451만 달러", https://daily.hankooki.com/news/articleView.html?idxno=1170881)로 확인되는 일반소주 단일 품목 값입니다. 124,000톤은 소주류 합계이며, 일반소주 단독 수출량은 관세청 통계 인용 보도 기준 7만 62톤(+2.3%, stockplus)입니다. 2023 일반소주는 1억 141만 달러(머니투데이)였으므로\[48\] +2.6%를 적용하면 약 1억 404만 달러가 됩니다(estimate) |
| 멕시코 테킬라 수출량 2024 | ① 400.3 M L(CRT 잠정, 2025.1) ② 402.7 M L(CRT 기록 인용, 2026.1 보도) ③ 392.9 M L(농업부) | **402.7 millones de litros** | CRT는 1월에 잠정치를 내고 이후 수정합니다. 2026.1 보도의 "2025년 407.8은 2024년 402.7 대비 +1.24%"가\[28\] 산술적으로 맞습니다(402.7 × 1.0124 = 407.7). 농업부(SADER) 값은 이번 조사에서 원문을 찾지 못했고, 집계 기준(HS 기준 통관 등)이 다를 가능성이 있습니다(확인 불가) |
| 아가베 사용량 2024 | ① 180만 톤(CRT) ② 189.1만 톤 | **180만 톤(1.8 millones de toneladas)** | CRT가 2025.1과 2026.1 두 차례 모두 "1.8 millones de toneladas"로 발표했습니다.\[28\]\[29\] 189.1만 톤의 출처는 이번 조사에서 확인하지 못했습니다. 반올림 전 원값일 가능성은 있지만 추측이므로 채택하지 않습니다 |
| 일본 위스키 과세수량 연도 | 205,736kl(FY2024로 전달됨) | **판정 보류** | 「酒のしおり」 N년 7월판에는 FY(N−2) 값이 실린다는 점은 확인했습니다.\[10\]\[11\] 205,736kl를 2025년판에서 가져왔다면 FY2023, 2026년판이면 FY2024입니다. 원표 미열람으로 값 자체는 미검증입니다 |
| 아르마냑 2024 판매량 | ① 300만 병 ② 280만 병(두 값 모두 France 3 같은 기사) | **300만 병(국내 140만 + 수출 160만), 신뢰도 낮음** | 내역이 있는 쪽을 채택했습니다. 다만 FEVS 2024 수출 통계로는 아르마냑 수출이 146천 케이스(12병, 약 175만 병)여서 France 3의 수출 160만 병과도 차이가 있습니다. BNIA 2023 자료에서도 '총 출고 병환산 370만'과 '국내 + 수출 병 판매 270만'이 공존해, 집계 기준(총 출고 vs 병 판매)이 다른 값들이 혼용되는 것으로 보입니다. BNIA 공식 2024 수치는 정부 PDF 안 이미지라 추출하지 못했습니다 |
| 칼바도스 2024 판매량 | ① 461.5만 병(IDAC, Distilnews) ② 13,871 hl AP(약 500만 병) | **4,615,000병 = 12,909 hl AP** | 2024 IDAC 각주는 12,909 hl AP입니다. 70cl·40%(병당 0.28L AP)로 환산하면 461만 병이 되어 정합합니다. 13,871 hl AP를 같은 방식으로 환산하면 495.4만 병인데, 이는 2023년 4,958,000병(× 0.28L = 13,882 hl)과 거의 같습니다. 따라서 ②는 **2023년 값의 혼입**으로 판정합니다. 2025 IDAC 표의 hl과 병 비율(1,954hl ↔ 697,578병)로 0.28L 환산 관행도 검증했습니다\[42\]\[43\]\[44\] |
| 중국 백주 2023→2024 | 2023 449.2万千升, 2024 414.5万千升인데 증감률은 −1.8% | **2024: 414.5万千升(규모 이상, 65도 환산)** | 단순 계산으로는 −7.7%인데 공표 증감률은 −1.8%입니다. 국가통계국은 규모 이상 기업 명단이 매년 바뀌어 증감률을 비교 가능 기준으로 산출하므로, 역산한 비교 기준 2023 값은 약 422.1万千升입니다(estimate, 방법론은 일반 관행에 근거한 추론). 별도로 중국주업협회의 2023 값 629万千升은 신국표 기준 차이에 따른 다른 계열입니다(민생증권 주석). 연도 간 비교에는 같은 계열만 쓰십시오\[49\]\[50\] |
| BNIC '유럽'에 프랑스 포함 여부 | — | **판정 불가(부분 판정)** | BNIC 전체 166M병에는 프랑스가 포함된 것으로 보입니다. Drinks International이 BNIC 기준 "96.8%가 프랑스 밖에서 소비"라고 썼고, 프랑스 5.3M ÷ 166M = 3.2%로 정확히 맞기 때문입니다.\[25\]\[51\] 그러나 지역 구분 '유럽 31.6M'에 프랑스가 들어가는지는 원문으로 확인하지 못했습니다 |
| 스카치 세계 볼륨 2024(Euromonitor) | ① 101.4m 케이스(2024.12 예측) ② 약 96.8m(2025 예측에서 역산) | **②를 참고값으로(estimate)** | ①은 사전 예측입니다. ②는 실적 기반 다음 해 예측에서 역산한 값이므로 실적에 더 가깝다고 판단합니다. 둘 다 확정값은 아닙니다\[46\]\[47\] |
| 스페인 주종 점유율 | Mercasa: 위스키 24 / 진 19 / 럼 15 / 브랜디 8 / 보드카 5 vs DBK: 27 / 23 / 16 / 4 / 3 | **Mercasa(협회 계열) 우선, DBK 병기** | 총량 180M L는 두 출처가 같습니다. Mercasa 값에는 아니스(5%)가 별도로 있어 분류 체계가 다른 것으로 보입니다. DBK는 '잠정'으로 표기했습니다. 협회 원문 보고서로 재확인이 필요합니다\[35\]\[36\] |
| 카발란 생산능력 | 연 1,000만 병(King Car 보도) vs 연 900만 L(Marie Claire)\[52\]\[53\] | **둘 다 생산능력(capacity)이며 실제 2024 생산량은 아님** | 게임에 그대로 쓰지 마십시오 |

---

## 3. 여전히 찾지 못한 항목

- **KR 위스키·브랜디·일반증류주·리큐르·증류식소주 2024 출고량(kL), 국내분과 수입분 분리:** TASIS 검색, 데이터뉴스·aT 보도, 공공데이터포털 국세청 파일(메타정보만)을 시도했습니다.
- **KR HS 2208.20/30/40/50/60 및 테킬라 2024 수입량(L)과 수입액(US$):** 관세청 보도자료 검색과 Statista(유료)를 시도했습니다.
- **KR 일반소주 단독 수출 톤수:** stockplus 보도(관세청 통계 인용)로 7만 62톤(+2.3%)을 확보했으나 관세청 원문은 미열람입니다.
- **JP 위스키 国税局分·税関分, 브랜디 4,085kl 검증, 순수 스피릿값:** 「酒のしおり」 2024·2025·2026 목차 페이지까지 확인했고 Excel은 미열람입니다.
- **JP 재무성 무역통계 2024 위스키(원산지별)·브랜디·럼·진·보드카·테킬라 수입:** 검색 결과로 나오지 않았습니다(Statista 목차만).
- **CN 위스키 일본·대만 원산지별 값, 보드카·진·럼·테킬라 수입량:** WBO와 상회 보도를 시도했으나 영국, 상위 10 합계, 미국(虎嗅 블루북: 289万升)만 나왔습니다.
- **CN 백주 소비량(IWSR 등):** 검색하지 못했습니다(예산 우선순위에서 밀림).
- **TW 2024 위스키 수입(관무서 원표, 원산지별), 브랜디·보드카·진·럼·테킬라 수입, 카발란·TTL 2024 생산·판매:** 보조 조사원이 관무서, data.gov.tw(차단), 국고서, 酒訊網, CNA, 工商時報를 시도했습니다.
- **US 버번·테네시·라이 구분, 미국 단독 코냑 선적량, 메스칼 비중, 재패니즈 위스키 판매량:** DISCUS 지원표 스니펫과 BNIC 보도를 시도했습니다.
- **MX CRT 국내시장(mercado nacional) 공식값, 상위 10개국별 수량, 농업부 392.9M L 원문, 아가베 189.1만 톤 출처, 국내 보드카·위스키·럼·브랜디·진 판매(INEGI EMIM):** CRT 보도자료와 El Informador를 시도했습니다.
- **CA Table 10-10-0010-01 FY2024/25 전 항목:** 검색 예산이 소진되어 시도하지 못했습니다.
- **UK HMRC 원표 검증(ODS), 주종별 출고 구분, 진·스카치·보드카·럼 국내 판매량과 판매액(WSTA, NielsenIQ, CGA):** gov.uk 공표 페이지까지 열람했습니다.
- **FR 전 채널 주종별 소비량, 진 총량(FFS, IWSR):** 검색 예산 부족으로 시도하지 못했습니다.
- **SWA 한국·대만·싱가포르 수출량(병):** SWA 2024 인포그래픽을 원문 열람했지만 상위 10위 밖이라 공표되지 않았습니다.
- **BNIC 미국 단독 선적량:** TSB, Vino Joy, cognac-expert 보도를 시도했으나 북미 합계만 확인했습니다.
- **GLOBAL Euromonitor 카테고리 총량(위스키 480 등)의 기사 URL:** TSB Brand Champions 2025 기사 2건을 확인했지만 스니펫에 총량이 없었습니다.
- **GLOBAL 테킬라·메스칼 세계 소비량:** 시도하지 못했습니다.
- **IN 주종별 판매, 스카치 병입·벌크 구분:** SWA 192m병(벌크 포함)만 확인했습니다.
- **PH 진·브랜디·럼 판매, 엠페라도르 2024, GSMI '케이스' 정의:** 시도하지 못했습니다.
- **TH, VN 주종별 시장 규모:** 시도하지 못했습니다.
- **TRAVEL_RETAIL 2024 스피릿 매출·판매량·비중(Generation Research, TFWA, Moodie Davitt):** 시도하지 못했습니다.

---

## 4. 출처 목록

모든 URL은 1절 각 표의 URL 열과 2절 판정 근거에 기재했고, 접속일은 모두 **2026-11-05**(Asia/Tokyo)입니다. 원문을 직접 연 문서는 다음 6건입니다. 데이터뉴스 기사, SWA 2024 수출 인포그래픽 PDF, BSI 「Daten aus der Alkoholwirtschaft 2025」 PDF, gov.uk Alcohol Bulletin 공표 페이지(수치 없음), DRAAF Occitanie 「Conseil de bassin viticole Sud-Ouest」 PDF(아르마냑 수치는 이미지라 추출 불가), IndexBox 기사(보조 조사원)입니다. 나머지는 모두 검색 스니펫입니다.

---

## 5. 게임 수요 데이터로 쓸 때의 함의

- **바로 채택해도 되는 값:** SWA 시장별 병 수(70cl 환산), BNIC 지역별 선적량, CRT 테킬라 생산 495.8M L와 수출 402.7M L, IDAC 칼바도스 4,615,000병, BSI 독일 683M병과 주종 비중, 중국 해관의 위스키 2919万升·브랜디 3502万升 수입, 한국 희석식소주 81.6만㎘. 모두 발행처가 명확한 연간 실적입니다.
- **환산 시 주의할 값:**
  - 영국 130.4m L는 **순수알코올**이고 RTD가 포함됩니다.\[38\]\[39\] 9L 케이스로 바꾸려면 평균 도수 가정이 필요합니다.
  - 중국 백주 414.5万千升은 **65도 환산** 생산량이므로 실제 액량이나 소비량이 아닙니다.\[12\]
  - 독일 683M병은 벌크 이중계산이 포함된 **공급량**이라 실제 소비보다 클 수 있습니다.\[33\]
  - 한국 출고량은 **수입분이 포함**되므로 관세 수입량과 더하면 이중계산이 됩니다.\[8\]
- **수출국 값을 수요로 쓰지 말 것:** SWA·BNIC·CRT 값은 출하국 기준 선적량입니다. 재고 조정(예: 2024 대만 스카치 −17%)과 재수출(대만→중국 전매)이 섞여 있어, 해당 연도 소비와 1:1로 대응하지 않습니다.\[20\]\[23\]\[54\] 게임에서는 3~5년 평균으로 평활화하는 편이 안전합니다.
- **추정치·예측치 표시:** 표에서 `estimate`로 표시한 값(독일·스페인 주종별 L, 멕시코 생산 − 수출 93.1M L, 스카치 세계 96.8m)은 '근사 수요'로만 쓰고, 공식값이 확보되면 교체하십시오. 대만 26M L(IndexBox)은 집계 사이트 추정이므로 2023 관세 값 2,735만 L와의 범위로 다루는 것을 권합니다.
- **시장 간 직접 비교 금지:** 지표가 공급, 소비, 출고(순수알코올), 공급사 판매, 선적으로 제각각이므로 "독일 위스키 > 스페인 위스키" 같은 비교는 지표 정의 차이 때문에 성립하지 않습니다. 시장별 내부 비중(주종 믹스)을 쓰고, 총량은 별도 기준으로 정규화하십시오.
```

## 출처

1. [Alcohol Bulletin](https://www.gov.uk/government/statistics/alcohol-bulletin)
2. [1 situation economique](https://draaf.occitanie.agriculture.gouv.fr/IMG/pdf/1_situation_economique.pdf)
3. [술 소비 줄었다…국내 주류 출고량 10년 새 21% 감소](https://datanews.co.kr/news/article.html?no=146553)
4. [\[푸드투데이\] “맥주·소주 정체 속 위스키 2배 성장”…주류시장, ‘취향 소비’로 재편](https://www.foodtoday.or.kr/news/article.html?no=204014)
5. [25년 전통주 트렌드, 국세통계연보로 살펴보다](https://soollife.com/?p=46107)
6. [관세청-케이(K)-소주 수출 상한가](https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&bbsId=1362&nttSn=10133374&nttSnUrl=9afad13a4d2a5843dc601661494cb61a)
7. [관세청, "케이(K)-소주 수출 상한가…역대 최대 수출 달성" - 日刊 NTN(일간NTN)](https://www.intn.co.kr/news/articleView.html?idxno=2042265)
8. [국세청\_주류별 지역별 주세 신고 현황\_20251231](https://www.data.go.kr/data/15070737/fileData.do?recommendDataYn=Y)
9. [酒のしおり（令和8年7月）｜国税庁](https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2026/index.htm)
10. [成人1人当たりの年間酒類消費数量が2年連続上昇](https://www.zeikei-news.co.jp/news/070801/)
11. [国税庁「酒のしおり（令和8年7月）」を公表](https://www.kannaikaikei.jp/news/16241)
12. [国家统计局：2024年规上企业白酒产量414.5万千升，同比下降1.8%|啤酒|葡萄酒|白酒(蒸馏酒)\_网易订阅](https://www.163.com/dy/article/JMJ4FDUK053804DM.html)
13. [提升国际标准制定话语权，让中国白酒更好走向世界 - 人民日报](https://paper.people.com.cn/mszk/pc/content/202503/17/content_30065168.html)
14. [2024年烈酒进口数据出炉：量、额分别下降7.54%、24.17%，12月威士忌出现回暖 资讯 葡萄酒商业观察 - Powered by 葡萄酒商业观察](https://www.wbo529.com/info/3871)
15. [2024进出口数据出炉，白酒出海迎来黄金期？|增幅\_新浪财经\_新浪网](https://finance.sina.com.cn/roll/2025-02-20/doc-inemarzs2670628.shtml)
16. [2024年烈酒进口数据出炉：量、额分别下降7.54%、24.17%，12月威士忌出现回暖-葡萄酒信息网](http://www.winechina.com/html/2025/01/202501320881.html)
17. [2023-2025年中国白兰地进口量额断崖式下滑 政策与消费疲软双重冲击](https://www.huxiu.com/article/4832813.html)
18. [4月中国烈酒进口量大幅增长](https://www.cfsn.cn/news/detail/341/247660.html)
19. [2025年中国威士忌进口量增长22.78%但进口额微降1.31%](https://www.huxiu.com/article/4832816.html)
20. [2024年酒市景氣展望，進口量連續成長背後的真相【熊市啟示錄】｜酒訊網](https://ch-9.net/article/I7tL5alc7a)
21. [Asia-Pacific's Whisky Market Expected to Grow at +0.9% CAGR Over Next Decade - News and Statistics - IndexBox](https://www.indexbox.io/blog/whisky-asia-pacific-market-overview-2024-2/)
22. [EU 27% NORTH AMERICA 22% LATAM & CARIBBEAN 9% SUB-SAHARAN AFRICA 3% ASIA](https://www.scotch-whisky.org.uk/media/2414/2024-export-figures-long-infographic.pdf)
23. [泡沫將至 還是理性回歸？一文看威士忌市場的十年繁華與轉折](https://money.udn.com/money/story/123669/8765265)
24. [ANNUAL ECONOMIC BRIEFING SUPPORT TABLES FEBRUARY 11, 2025 2024](https://distilledspirits.org/wp-content/uploads/2025/02/2025-AEB-Support-Tables.pdf)
25. [Cognac exports plunge in 2024 as China bites - The Spirits Business](https://www.thespiritsbusiness.com/2025/02/cognac-exports-plunge-in-2024-as-china-bites/)
26. [Les exportations de cognac en chiffres, de 2022 à 2025](https://www.commissiondesliqueurs.com/exportations-cognac-chiffres/)
27. [Tequila: Nuevos mercados: el reto de la industria tequilera](https://www.informador.mx/economia/Tequila-Nuevos-mercados-el-reto-de-la-industria-tequilera-20241004-0026.html)
28. [Industria: Incrementó la exportación y la producción de tequila en 2025](https://www.informador.mx/economia/industria-incremento-la-exportacion-y-laproduccion-de-tequila-en-2025-20260112-0016.html)
29. [Continuará el trabajo coordinado para fortalecer a la agroindustria tequilera](https://www.crt.org.mx/2025/03/05/continuara-el-trabajo-coordinado-para-fortalecer-a-la-agroindustria-tequilera/)
30. [Advierte CRT sobre afectaciones a las exportaciones de Tequila por aranceles de Estados Unidos](https://lider919.com/advierte-crt-sobre-afectaciones-a-las-exportaciones-de-tequila-por-aranceles-de-estados-unidos/)
31. [Ante aumento de aranceles en Estados Unidos, el Tequila buscará conquistar nuevos mercados](https://www.crt.org.mx/2025/04/01/ante-aumento-de-aranceles-en-estados-unidos-el-tequila-buscara-conquistar-nuevos-mercados/)
32. [Exportación de tequila crece casi un 30 % en enero con EE.UU. como principal comprador - SWI swissinfo.ch](https://www.swissinfo.ch/spa/exportaci%C3%B3n-de-tequila-crece-casi-un-30-%25-en-enero-con-ee.uu.-como-principal-comprador/88833487)
33. [Daten aus der Alkoholwirtschaft - spirituosen-verband.de](https://www.spirituosen-verband.de/fileadmin/Datenablage/downloads/BSI-Datenbroschuere_2025.pdf)
34. [BSI: Spirituosen-Bilanz für das Jahr 2024 fällt verhalten aus](https://www.about-drinks.com/bsi-spirituosen-bilanz-fuer-das-jahr-2024-faellt-verhalten-aus/)
35. [Bebidas espirituosas](https://www.mercasa.es/publicaciones/alimentacion-en-espana/bebidas-espirituosas/)
36. [El consumo de bebidas espirituosas cae en 2024](https://www.empresaactual.com/retroceso-consumo-bebidas-espirituosas-arrastra-la-facturacion-del-sector/)
37. [El retroceso del consumo de bebidas espirituosas en España afecta al sector hostelero - InfoHoreca](https://www.infohoreca.com/noticias/20251218/hosteleria-espana-retroceso-bebidas-espirituosas-2024)
38. [Alcohol Duty Reforms Evaluation Report - GOV.UK](https://www.gov.uk/government/publications/alcohol-duty-reforms-evaluation-report/alcohol-duty-reforms-evaluation-report)
39. [UK alcohol statistics and sales 2026](https://www.shelfdrop.com/data/uk-alcohol-statistics)
40. [2024年蘇格蘭威士忌出口額為54億英鎊...](https://www.trademag.org.tw/page/newsid1/?id=7915258&iz=6)
41. [ARMAGNAC](https://presselib.com/article/armagnac-l-eau-de-vie-gasconne-tiree-par-l-export)
42. [Les expéditions de Calvados progressent en France mais reculent à l'export en 2024](https://distilnews.fr/calvados-expeditions-2024-croissance-france-repli-export/)
43. [Calvados sales see slight dip in 2023 - The Spirits Business](https://www.thespiritsbusiness.com/2024/02/calvados-sales-see-slight-dip-in-2023/)
44. [Le Calvados a enregistré une baisse modérée de 5,6% de ses expéditions en 2025](https://distilnews.fr/calvados-expeditions-2025-exportation-marche-spiritueux/)
45. [Calvados sales dip in 2025 - The Spirits Business](https://www.thespiritsbusiness.com/2026/03/calvados-sales-dip-in-2025/)
46. [World Spirits Report 2024: Scotch whisky - The Spirits Business](https://www.thespiritsbusiness.com/2024/12/world-spirits-report-2024-scotch-whisky/)
47. [World Spirits Report 2025: Scotch whisky - The Spirits Business](https://www.thespiritsbusiness.com/2025/12/world-spirits-report-2025-scotch-whisky/)
48. ["한 병 더" 불티나는 소주…'이 나라' 덕에 수출 1억 달러 재돌파 - 머니투데이](https://www.mt.co.kr/living/2024/01/29/2024012915352093411)
49. [国家统计局：2024年规上企业白酒产量414.5万千升\_ZAKER新闻](https://app.myzaker.com/article/67937f461bc8e0b73b000011)
50. [2019-2024年中国产量、收入 - 2025年04月 - 行业研究数据 - 小牛行研](https://www.hangyan.co/charts/3605403401107539184)
51. [Cognac’s tariffs crisis - Drinks International](https://drinksint.com/cognacs-tariffs-crisis/)
52. [韓國酒迷來台指名必掃的生命之水！揭開「KAVALAN 噶瑪蘭威士忌」成為世界第一的五大秘密](https://www.marieclaire.com.tw/lifestyle/taste/83794/kavalan-2025)
53. [噶瑪蘭威士忌四度榮獲TWSC總冠軍 奪2024最高殊榮](https://hk.finance.yahoo.com/news/%E5%99%B6%E7%91%AA%E8%98%AD%E5%A8%81%E5%A3%AB%E5%BF%8C%E5%9B%9B%E5%BA%A6%E6%A6%AE%E7%8D%B2twsc%E7%B8%BD%E5%86%A0%E8%BB%8D-%E5%A5%AA2024%E6%9C%80%E9%AB%98%E6%AE%8A%E6%A6%AE-070000211.html)
54. [一年喝掉 546 億元的威士忌！3 張圖，看台灣怎麼躍升全球成長最快的市場|經理人](https://www.managertoday.com.tw/articles/view/61749)
