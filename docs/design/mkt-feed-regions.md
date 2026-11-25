# 나라별 현지 커뮤니티 피드 — 조사 · 설계 바탕 (MKT) — [결정 #436]

**[결정 #436]**(오너 PM 세션 2026-11-25) 다른 나라 커뮤니티 피드는 「현지 커뮤니티형」으로 만든다.
- **오너 원문:** "다른나라 피드는 현지 커뮤니티형이고, 분위기나 말투, 자주 사용되는 문구도 따와라. 커뮤니티의 이름은 실명 사용".
- **지킬 선:** 한국 판(#400 · #402 ~ #406)과 같다.
  - 글은 모두 새로 쓴다. 실제 글 · 닉네임은 옮기지 않는다.
  - 「따온다」는 말투 · 관용 표현 · 글의 꼴까지다. 특정 글의 문장을 베끼지 않는다.
  - 특정인 비하 · 혐오 · 미성년 음주는 넣지 않는다.
  - 실제 회사 · 제품에 대해 지어낸 사실이나 비방을 쓰지 않는다.
- **구현 시점:** [결정 #431]대로 10차 판 뒤 확장 설계 때. **이 문서는 조사와 설계 바탕일 뿐이고, 문장 데이터가 아니다.** 첫 나라는 스코틀랜드라 영국을 가장 자세히 적었다.

**표시와 한계**
- `[사실]`은 웹 검색 결과로 존재와 성격을 확인한 것이다. `[추정]`은 분류 판단이거나, 검색으로 확인하지 못한 일반 지식이다.
- 활동량(회원 · 글 수)은 대부분 날짜 없는 제3자 스냅샷이다. 「지금 가장 많이 쓰이는 곳」 서열은 검증되지 않았다(§7).

**유형 셋** — 한국 피드 기준과 같다.
- **A 디시형:** 농담 · 놀림 · 잡담
- **B 카페형:** 일반 애호가 · 입문 · 구매 정보
- **C 위스키베이스형:** 전문가 · 점수

## 0. 다섯 나라 한눈에

| 나라 | A 디시형 | B 카페형 | C 위스키베이스형 |
|---|---|---|---|
| **영국** | 일반 취미 포럼 안의 「The Whisky Thread」류(Golf Monthly · Singletrack · 바이크 포럼) `[사실]` — 위스키 전용 농담 커뮤니티는 못 찾음 | **r/Scotch** · r/worldwhisky · The Whisky Exchange 페이스북 그룹 · 지역 시음 클럽 `[사실]` | **Whiskybase**(국제) · Connosr · Malt Maniacs · Whisky Magazine `[사실]` |
| **일본** | **5ch 「お酒・Bar」板**(ウイスキー総合 · サントリー総合 · アイラ総合 스레드) `[사실]` | 커뮤니티 게시판(mineo 등) 위스키 스레드 · X(트위터) `[사실 / X는 추정]` | **ウィレコ**(위스키 전용 SNS) · Whiskybase `[사실]` |
| **대만** | **Dcard 酒類板** `[사실]` | **PTT Wine板**(「酒板」) · 페이스북 · LINE 그룹 `[사실 · 그룹 이름 미확인]` | **台灣單一麥芽威士忌品酒研究社**(「天團」) · 新竹 馬可波羅窖藏實驗室 `[사실]` |
| **미국** | **r/BourbonHunt**(희귀 병 사냥) `[추정 — 순수 농담형은 아님]` | **r/bourbon** `[사실]` | **Straight Bourbon**(약 2.9만 주제 · 71.5만 글) · Whiskybase `[사실]` |
| **중국** | **百度贴吧 威士忌吧**(관심 약 11만 · 글 약 84만) · 日本威士忌吧 `[사실]` | **小红书** · 豆瓣 威士忌 小组(약 3,600명) · 什么值得买 `[사실]` | 知乎 · 麦芽星球 · 百瓶 · 机核 칼럼 · Whiskybase `[사실 · 규모 미확인]` |

**나라마다 유형이 생긴 꼴이 다르다.**
- 한국의 「A = 위스키 전용 갤러리」에 맞는 곳은 일본 5ch · 중국 티에바 · 대만 Dcard다.
- 영국의 A형은 「다른 취미 포럼 안의 술 스레드」 꼴이다. 미국의 A형은 「레딧 하위 게시판」이다.
- 대만의 C형은 오프라인 시음 동호회 중심이다.
- → **유형 셋은 그대로 두고, 채널 이름 · 분위기는 나라마다 다르게 고른다.**

## 1. 영국(스코틀랜드) — 첫 나라

### 1.1 채널 후보 (실명 · #436)
| 유형 | 채널 후보 | 확인한 것 | 규모 |
|---|---|---|---|
| A | 「The Whisky Thread」 류 — 일반 취미 포럼의 술 스레드. 게임 채널 이름은 실재 포럼 하나를 대표로 고르거나 「포럼 위스키 스레드」 꼴로 한다(아래 §1.4 질문 1) | 지갑 · 배우자 눈치 자조, 말장난, 「이 스레드 위험하다」, 아이리시 대 스코티시 놀림 `[사실 — 몇 스레드]` | 스레드 단위 · 작음 |
| B | **r/Scotch** | 번호를 단 시음 리뷰가 주류다. 리뷰는 본인이 쓴 것만 올린다. 금요일 정기 토론 글이 있다 `[사실]` | 구독 약 9.3만 ~ 16.9만(제3자 · 날짜 불명) |
| B | r/worldwhisky | 번호 리뷰 · 구매 · 가격 질문 `[사실]` | 미확인 |
| B | The Whisky Exchange 페이스북 그룹 · 지역 시음 클럽 · Meetup | 소매점 그룹은 페이지보다 그룹에서 이야기가 오간다 `[사실]`. Meetup은 최대 수백 명 `[사실]` | 작음 |
| C | **Whiskybase** | 연 500만 명 이상(자사 발표) `[사실]` | 큼 |
| C | Connosr · Malt Maniacs · Whisky Magazine | Whisky Magazine은 2025 방문 순위 12위(−29%) `[사실]`. 대형 전문 사이트 Scotchwhisky.com은 폐쇄 보도 `[사실]` | 중 |

### 1.2 말투 · 자주 쓰는 표현 (관찰 — 글은 새로 쓴다)
- **단위 · 은어** `[사실 — 용어집 출처, 커뮤니티 실제 빈도는 미확인]`
  - dram: 한 잔. 정해진 양은 없고, 한 용어집은 28 ~ 35 ml로 본다.
  - peat monster / peat bomb: 강한 피트.
  - sherry bomb: 진한 셰리.
  - NAS: 연수 표기 없음. 「어린 원액을 쓰는 핑계」라는 의심과 함께 쓰인다.
  - 냉각 여과(chill filtration) · 색소 논쟁.
- **글 꼴:**
  - B형: 「Review #n — Nose / Palate / Finish / 점수」의 번호 리뷰 `[사실]`. 한국 피드의 다섯 줄 노트(`NOTE_PARTS`)와 같은 틀에 담을 수 있다.
  - A형: 자조 · 말장난 · 이웃 나라 놀림 `[사실 — 몇 스레드]`.
- **값 감각:** 주세가 크고 해마다 오른다.
  - 40% 70cl 한 병의 주세는 2026년 2월부터 £9.51(+39p)이다 `[사실 — SWA]`. 2027년 2월에 약 £9.95로 다시 오른다 `[사실 — 정부 발표 보도]`.
  - 세금이 병값의 70 ~ 74%라는 주장이 있다 `[사실 — 업계 단체 수치]`.
  - → 「또 주세 올랐다 · 행사 때 쟁인다」가 가격 불만의 단골 소재일 것이다 `[추정]`.
- **철(계절 글):**
  - Burns Night 1월 25일 `[사실]`
  - Spirit of Speyside 4월 말 ~ 5월 초 `[사실]`
  - Fèis Ìle 5월 말 `[사실]`
  - Campbeltown Malts Festival 5월 `[사실]`
  - 5월은 비공식 「위스키의 달」 `[사실]`
  - Hogmanay(연말) `[추정]`

### 1.3 한국 판과 다르게 조심할 것
- **광고 규범의 선을 피드 글에도 둔다.** 영국 업계 자율 규범(Portman Group Code · CAP/BCAP)은 다음을 막는다 `[사실 — 일부는 옛 판 규범]`.
  - 미성년에게 특별히 끌리게 하는 것
  - 음주가 사교적 성공 · 인기로 이어진다는 암시
  - 운동 전 · 중 음주
  - 게임 피드는 광고가 아니지만, 우리 회사 제품이 주인공이라 이 선을 피하는 것이 안전하다 `[추정]`.
- **놀림의 선:** 잉글랜드 · 아일랜드와의 가벼운 놀림은 자주 보인다. 다만 종파(가톨릭 · 개신교)나 축구 라이벌(종파와 겹침) 갈등은 혐오로 번지기 쉬워 넣지 않는다 `[추정 — 검색으로 확인하지 않은 일반 지식]`.
- **「Scotch」 표기:** 법으로 보호되는 이름이다 `[추정]`. 게임 속 제품이 스카치 요건을 채우지 못했는데 피드가 「스카치」로 부르면 어긋난다. 제품 표기(PROD 규칙)와 묶어 lineOk 조건을 둔다.
- **실존 회사 · 제품:** 비교 대상(`{bench}`)으로 쓸 실제 브랜드는 한국 판처럼 맛 · 값 비교만 한다(#405). 영국은 증류소가 많고 팬층이 강해 비교 글이 잦을 것이다 `[추정]`.

### 1.4 오너께 여쭐 것(구현 전)
1. A형 채널 실명: 영국은 위스키 전용 농담 커뮤니티가 뚜렷하지 않다. 실재하는 일반 포럼 하나(예: 취미 포럼)를 대표로 쓸지, 「레딧 r/Scotch의 가벼운 글」로 A형을 대신할지 정해야 한다.
2. 말투를 한국어로 옮기는 수위: 「dram」 같은 영어 단어를 그대로 섞을지, 한국어로 풀지.

## 2. 일본
- **채널 후보:**
  - A: 5ch 「お酒・Bar」板의 総合 스레드 `[사실]`
  - B: X(트위터) 해시태그 문화 `[추정]` · 커뮤니티 게시판 `[사실]`
  - C: ウィレコ · Whiskybase `[사실]`
- **말투 · 표현:**
  - 5ch 스레드 제목은 「【山崎】…総合スレ147【響】」처럼 번호를 단 장수 스레드 꼴이다 `[사실]`.
  - 화제는 品薄 · 高騰 · 抽選販売 · 定価 · 하이볼 · 탄산수 · 얼음 `[사실]`. 예: 山崎12年 희망소매가 17,600엔 · 슈퍼마켓 추첨 판매.
  - 「プレ値」(정가를 크게 넘는 값) · 「転売ヤー」(되팔이)는 쓰임이 많다 `[추정 — 일반 지식, 출처 미확인]`.
- **조심할 것:**
  - 일본 위스키 품귀 · 되팔이는 민감한 화제다. 실제 회사(산토리 · 닛카 등)에 대해 「일부러 품귀를 만든다」 같은 지어낸 사실을 쓰지 않는다(#405).
  - 미성년 음주를 넣지 않는다. 20세 미만 음주 금지 `[추정]`.

## 3. 대만
- **채널 후보:**
  - A: Dcard 酒類板(젊은 층 · 선물 · 가벼운 질문) `[사실]`
  - B: PTT Wine板(「酒板」 — 예산별 추천 · 선물 · 시세 질문) `[사실]`
  - C: 台灣單一麥芽威士忌品酒研究社(「天團」 — 2005년 설립 · 정기 시음회 · 해마다 사주(社酒) 한 통) `[사실]`
- **말투 · 표현:**
  - PTT 글 머리 「[問題]」 · 「[討論]」 · 「[轉錄]」 `[사실]`
  - 예산 「1.5K ~ 2K」 · 「3k上下」(대만 달러) `[사실]`
  - 雪莉桶 · 過桶 · NAS(無年分) `[사실]`
  - 「CP值」(가성비) · 「口糧酒」(데일리) `[추정 — 일반 지식, 출처 미확인]`
- **조심할 것:**
  - 양안(兩岸) 정치 화제는 넣지 않는다 `[추정]`.
  - 대만산 위스키(Kavalan 등)는 자부심 대상이다. 비교 글은 맛 · 값까지만 쓴다(#405).

## 4. 미국
- **채널 후보:**
  - A: r/BourbonHunt `[추정]`
  - B: r/bourbon `[사실]`
  - C: Straight Bourbon `[사실]`
- **말투 · 표현** `[사실 — 용어집 출처]`
  - allocated: 배정 물량
  - unicorn: 구하기 힘든 한정판
  - dusty: 오래된 병
  - store pick: 가게가 고른 통
  - secondary: 2차 시장
  - bunker: 쟁여 둔 병
  - tater / flipper: 정가로 사서 되파는 사람
  - museum: 비싸게 걸어 둬 아무도 안 사는 가게
  - shelfie: 진열장 사진
- **조심할 것:**
  - 21세 미만 음주를 넣지 않는다 `[추정]`.
  - 실제 가게 · 유통사를 「바가지」로 부르는 지어낸 사실을 쓰지 않는다. 「gouging」 같은 말은 일반론으로만 쓴다.

## 5. 중국
- **채널 후보:**
  - A: 百度贴吧 威士忌吧(입문 · 가격 · 진품 감별) `[사실]`
  - B: 小红书(추천 노트) · 豆瓣 小组(교양) · 什么值得买(구매 후기) `[사실]`
  - C: 知乎 · 麦芽星球 · 百瓶 · 机核 `[사실]`
- **말투 · 표현:**
  - 雪莉桶 · 过桶 · 泥煤 · 艾雷岛 `[사실]`
  - 「口粮酒」(데일리) · 「智商税」(값만 비싼 술) · 「性价比」(가성비) · 「上头」 `[추정 — 일반 지식, 출처 미확인]`
  - 소비 주력이 25 ~ 40세 도시층 · Z세대라는 보도 `[사실 — 업계 보고 전언]`
- **조심할 것:**
  - 정치 · 영토 화제는 넣지 않는다. 특히 대만 판과 같은 게임 안에서 나라 이름 · 지도 표현이 부딪치지 않게 한다 `[추정]`.
  - 진품 감별 · 가짜 술 화제에서 실제 회사를 지목하지 않는다(#405).
  - 플랫폼 실명 사용이 현지에서 문제가 되는지는 확인하지 못했다(§7).

## 6. 공통 — 한국 판과 다르게 조심할 것
1. **현지 말투 품질을 누가 확인하나.** 한국 판은 오너가 한국어 말투를 직접 판단했다(#403 · §8 시안). 해외 판은 다음과 같이 할 것을 권한다 `[제안]`.
   - (가) 한국어로 쓰되 현지 문화 · 소재만 옮긴다. 오너가 읽고 판단할 수 있다.
   - (나) 원어 표현을 괄호로 섞는다(dram · 抽選 · CP值).
   - (다) 원어 글은 원어민 검토를 받는다. 지금은 확인할 사람이 없다.
   - **권장은 (가) + 원어 핵심어 몇 개만 (나)다.** 원어 문장 전체는 (다) 없이는 쓰지 않는다.
2. **실명 사용(#436)의 위험:** 실재 커뮤니티 이름은 그 커뮤니티의 실제 분위기와 다르면 바로 어색하다. 그래서 채널마다 「확인한 분위기」(§1.1 등)를 넘는 말투를 쓰지 않는다.
3. **현지 금기:**
   - 미성년 음주(영국 18 · 일본 20 · 미국 21 · 대만 18 · 중국 18 `[추정]`)
   - 영국 종파 갈등 · 양안 · 중국 정치 화제
   - 실제 회사에 대해 지어낸 품귀 · 조작 · 가짜 술 이야기
4. **계절 · 화폐:** 계절 글(`FEED_SEASON_LINES`) · 값 감각(원 → 파운드 · 엔 · 대만 달러 · 달러 · 위안)은 나라 열쇠로 가른다. 화폐 · 반올림은 확장 순서 ②(#431 메모)와 함께다.
5. **구조:** `content/feed.ts`의 채널 · 문장 묶음을 「나라 → 채널 → 묶음」으로 바꾼다. 리뷰 난수(`postCount` · `styleWeights` · `pickStyle` · `feedSignals`)는 건드리지 않는다(봇 바이트).

## 7. 설계 전에 더 확인할 것
- **영국:** A형 대표 채널(디스코드 · 페이스북 그룹 규모), r/Scotch 현재 구독 수(직접 접속)
- **일본:** X 해시태그 문화 · 5ch 스레드 현재 활동량
- **대만:** 페이스북 그룹 이름 · 규모
- **중국:** 플랫폼 실명 사용의 현지 위험

## 출처
**영국**
- 커뮤니티 · 사이트: [feedspot — Top Whiskey Forums](https://forums.feedspot.com/whiskey_forums/) · [The Whiskey Wash — Most Visited 2026](https://thewhiskeywash.com/whiskey-articles/the-21-most-visited-whisky-websites-in-the-world-2026/) · [Scotsman — Scotchwhisky.com closure](https://foodanddrink.scotsman.com/drink/hugely-popular-whisky-website-scotchwhisky-com-announces-shock-closure/) · [Connosr](https://www.connosr.com/community) · [Connosr — TWE group](https://connosr.com/other-social-media-whisky-discussion-887) · [Whiskybase](https://www.whiskybase.com/de) · [London Whisky Club](https://tlwc.extended.agency/) · [whiskyandwisdom](https://www.whiskyandwisdom.com/?p=3708) · [Meetup GB](https://www.meetup.com/topics/whiskey/gb/)
- 취미 포럼 위스키 스레드: [Golf Monthly](https://forums.golfmonthly.com/threads/the-whisky-thread.113283/) · [Bearbones](https://bearbonesbikepacking.co.uk/phpBB3/viewtopic.php?p=319852) · [Singletrack](https://singletrackworld.com/forum/off-topic/one-for-the-whisky-snobs)
- 레딧: [RedditDeck r/Scotch](https://scotch.redditdeck.com/) · [reddit.guide](https://reddit.guide/r/Scotch/) · [r/Scotch 미러](https://lr.sudovanilla.org/r/scotch) · [r/worldwhisky 미러](https://r.darklab.sh/r/WorldWhisky)
- 용어: [VinePair](https://vinepair.com/articles/definitive-whiskey-urban-dictionary) · [Boozemakers](https://www.boozemakers.com/glossary/scotch) · [whisky.com](https://whisky.com/whisky-glossary.html) · [Whisky Advocate](https://fastly.whiskyadvocate.com/glossary/page/7/)
- 주세: [SWA 3.66%](https://scotch-whisky.org.uk/newsroom/scotch-whisky-tax-rises-by-366/) · [SWA 2025 submission](https://www.scotch-whisky.org.uk/media/2516/swa-budget-submission-2025.pdf) · [GOV.UK duty](https://www.gov.uk/government/publications/changes-to-alcohol-duty-rates/alcohol-duty-rate-changes) · [Vinetur 2027](https://www.vinetur.com/en/20261029110028/britain-will-raise-spirits-duty-455-from-february-2027.html)
- 축제: [malts.com](https://www.malts.com/en/articles/best-whisky-festivals-of-scotland-cultural-highlights) · [Scotsman Fèis Ìle](https://www.scotsman.com/drink/whisky/feis-ile-2025-dates-ticket-info-and-whats-on-including-bruichladdich-rockndaal-lineup/) · [GreatDrams 2026](https://greatdrams.com/?p=105104)
- 광고 규범: [ASA CAP Section 18](https://www.asa.org.uk/Advertising-Codes/Non-broadcast-HTML/Section-18-Alcohol.aspx) · [Portman Group Code (옛 판)](https://www.hri.global/files/2011/07/25/13.6_Portman_Group_-_Code_of_Practice_.pdf) · [Ginposium 2019](https://theginguild.com/wp-content/uploads/2019/06/Ginposium-Presentation-2019-Alistair.pdf)

**일본**
- [5ch お酒・Bar](https://mevius.5ch.net/sake/) · [ウイスキー総合スレ](https://5ch-ranking.com/cache/view/sake/1365505924?from_media=feed_atom) · [サントリー総合](https://mevius.5ch.net/test/read.cgi/sake/1652445047/l50) · [ジャパニーズ総合](https://mevius.5ch.io/test/read.cgi/sake/1592330836/236-336) · [mineo](https://king.mineo.jp/reports/100674) · [ウィレコ](https://apps.apple.com/jp/app/id1491147696) · [uridoki 山崎](https://uridoki.net/sake/kiji_346368/) · [Impress Watch](https://gourmet.watch.impress.co.jp/docs/news/2155827.html)

**대만**
- [PTT Wine](https://www.ptt.cc/bbs/Wine/M.1678850289.A.707.html) · [PTT Wine 十大](https://www.pttweb.cc/bbs/Wine/M.1734942520.A.00C) · [PTT 1.5K~2K](https://www.pttweb.cc/bbs/Wine/M.1750181979.A.EED) · [Dcard 酒類板](https://www.dcard.tw/f/alcohol/p/236493148) · [Mirror Media](https://www.mirrormedia.mg/story/20190124wine003) · [foodnext](https://www.foodnext.net/issue/paper/5098524321) · [商周 雪莉桶](https://www.businessweekly.com.tw/style/blog/8293) · [關鍵評論網 NAS](https://www.thenewslens.com/article/169811)

**미국**
- [Straight Bourbon](https://www.straightbourbon.com/forums) · [feedspot — Bourbon](https://forums.feedspot.com/bourbon_forums/) · [Bourbon Pursuit](https://shows.acast.com/bourbon-pursuit/episodes/5fb68270d385e1339b9f14e9) · [Gear Patrol — slang](https://www.gearpatrol.com/drinks/how-to-talk-bourbon/) · [InsideHook — allocated](https://www.insidehook.com/drinks/what-is-allocated-bourbon) · [The Manual — store pick](https://themanual.com/food-and-drink/what-is-a-store-pick-bourbon) · [Punch — vocabulary](https://punchdrink.com/articles/new-vocabulary-bourbon-whiskey-tasting-terms/)

**중국**
- [威士忌吧](https://wefan.baidu.com/f?kw=%E5%A8%81%E5%A3%AB%E5%BF%8C) · [日本威士忌吧](https://tiebac.baidu.com/f?fr=home&kw=%E6%97%A5%E6%9C%AC%E5%A8%81%E5%A3%AB%E5%BF%8C) · [豆瓣 威士忌](https://www.douban.com/group/topic/15043647/) · [知乎](https://www.zhihu.com/question/394570485) · [什么值得买](https://post.smzdm.com/p/a7g56q8l/) · [机核](https://www.gcores.com/users/515517/content) · [机核 桶型](https://www.gcores.com/articles/139734) · [网易 Z세대](https://www.163.com/dy/article/KEOK50PE05198R91.html) · [财联社](https://www.cls.cn/detail/2201819)
