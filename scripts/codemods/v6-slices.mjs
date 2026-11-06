// 코드모드: GameState v5(평면) 접근을 v6 도메인 슬라이스 접근으로 바꾼다 (docs/design/architecture.md §3.3, PRD 결정 #95)
//
//   s.cash          → s.finance.cash
//   s.pendingEvents → s.events.pending
//   s.siteState     → s.site
//
// 타입 검사기로 "GameState(또는 Pick·Readonly·Partial<GameState>) 값의 속성 접근"만 골라 바꾸므로,
// 다른 타입의 같은 이름 속성(예: Product.price가 아닌 것들)은 건드리지 않는다.
// v5 코드(타입이 아직 평면인 상태)에서 돌려야 한다 — 다른 브랜치를 v6 위로 옮길 때 다시 쓸 수 있다.
//
// 실행 (ts-morph는 저장소 의존성이 아니다):
//   npm i --no-save ts-morph@24 && node scripts/codemods/v6-slices.mjs
//   node scripts/codemods/v6-slices.mjs --dry   # 바꾸지 않고 건수·수동 처리 목록만 출력
//   (ts-morph를 다른 폴더에 설치했다면 그 폴더로 복사해 REPO_ROOT=<저장소 경로>로 실행)
//
// 바꾸지 못하는 것(수동 처리 목록으로 출력): 구조 분해(const { cash } = s), GameState 객체 리터럴, 문자열 키 접근
import { Node, Project } from 'ts-morph';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRY = process.argv.includes('--dry');

/** v5 필드 → [슬라이스, v6 필드]. 슬라이스만 있고 필드가 null이면 필드 자체가 슬라이스가 된다 */
export const V6_MAP = {
  // world — 외부 환경
  priceIndex: ['world', 'priceIndex'], trend: ['world', 'trend'], modifiers: ['world', 'modifiers'],
  // finance
  cash: ['finance', 'cash'], negativeCashMonths: ['finance', 'negativeCashMonths'], loans: ['finance', 'loans'],
  investorShare: ['finance', 'investorShare'], investmentsTaken: ['finance', 'investmentsTaken'], receivables: ['finance', 'receivables'],
  // hr
  staff: ['hr', 'staff'], candidates: ['hr', 'candidates'], houseStyle: ['hr', 'houseStyle'],
  // production
  equipment: ['production', 'equipment'], recipes: ['production', 'recipes'], orders: ['production', 'orders'],
  ingredientKgLastMonth: ['production', 'ingredientKgLastMonth'], flags: ['production', 'flags'], wasteContractPerKg: ['production', 'wasteContractPerKg'],
  // inventory
  lots: ['inventory', 'lots'], casks: ['inventory', 'casks'], caskOrders: ['inventory', 'caskOrders'],
  warehouseBase: ['inventory', 'warehouseBase'], rotatedThisMonth: ['inventory', 'rotatedThisMonth'],
  // commerce
  products: ['commerce', 'products'], awareness: ['commerce', 'awareness'], localBuzz: ['commerce', 'localBuzz'],
  marketingBudget: ['commerce', 'marketingBudget'], traditionalReleasedL: ['commerce', 'traditionalReleasedL'],
  traditionalPrevYearL: ['commerce', 'traditionalPrevYearL'], retailOffers: ['commerce', 'retailOffers'], retailContracts: ['commerce', 'retailContracts'],
  // b2b
  b2bTrust: ['b2b', 'trust'], bulkIndex: ['b2b', 'bulkIndex'], spotSoldLPA: ['b2b', 'spotSoldLPA'], contracts: ['b2b', 'contracts'],
  contractOffers: ['b2b', 'contractOffers'], brokerOffers: ['b2b', 'brokerOffers'], caskBids: ['b2b', 'caskBids'],
  oemOffers: ['b2b', 'oemOffers'], oemContracts: ['b2b', 'oemContracts'],
  // events
  pendingEvents: ['events', 'pending'], forecasts: ['events', 'forecasts'], eventLog: ['events', 'log'], eventLastMonth: ['events', 'lastFired'],
  // site
  siteState: ['site', null],
  // history
  reports: ['history', 'reports'],
};

const WRAPPERS = new Set(['Pick', 'Omit', 'Readonly', 'Partial', 'Required', 'NonNullable']);

function isGameStateLike(type, depth = 0) {
  if (!type || depth > 4) return false;
  if (type.isUnion()) return type.getUnionTypes().some((t) => isGameStateLike(t, depth + 1));
  if (type.isIntersection()) return type.getIntersectionTypes().some((t) => isGameStateLike(t, depth + 1));
  const sym = type.getSymbol()?.getName();
  const alias = type.getAliasSymbol()?.getName();
  if (sym === 'GameState' || alias === 'GameState') return true;
  if (alias && WRAPPERS.has(alias)) return isGameStateLike(type.getAliasTypeArguments()[0], depth + 1);
  return false;
}

const project = new Project({ tsConfigFilePath: path.join(ROOT, 'tsconfig.json') });
const edits = new Map(); // file → [{ start, end, text }]
const manual = [];
let count = 0;

for (const sf of project.getSourceFiles()) {
  const file = sf.getFilePath();
  if (file.includes('/node_modules/') || file.includes('/codemods/')) continue;
  const list = [];
  sf.forEachDescendant((node) => {
    if (Node.isPropertyAccessExpression(node)) {
      const name = node.getName();
      const m = Object.hasOwn(V6_MAP, name) ? V6_MAP[name] : undefined;
      if (!m || !isGameStateLike(node.getExpression().getType())) return;
      const nameNode = node.getNameNode();
      list.push({ start: nameNode.getStart(), end: nameNode.getEnd(), text: m[1] ? `${m[0]}.${m[1]}` : m[0] });
      count++;
    } else if (Node.isObjectBindingPattern(node)) {
      const parent = node.getParent();
      const init = Node.isVariableDeclaration(parent) ? parent.getInitializer() : undefined;
      if (init && isGameStateLike(init.getType()) && node.getElements().some((e) => Object.hasOwn(V6_MAP, e.getPropertyNameNode()?.getText() ?? e.getName())))
        manual.push(`${path.relative(ROOT, file)}:${node.getStartLineNumber()} 구조 분해 — ${node.getText().slice(0, 80)}`);
    } else if (Node.isElementAccessExpression(node)) {
      const arg = node.getArgumentExpression();
      if (arg && Node.isStringLiteral(arg) && Object.hasOwn(V6_MAP, arg.getLiteralValue()) && isGameStateLike(node.getExpression().getType()))
        manual.push(`${path.relative(ROOT, file)}:${node.getStartLineNumber()} 문자열 키 접근 — ${node.getText().slice(0, 80)}`);
    } else if (Node.isObjectLiteralExpression(node)) {
      // GameState 문맥의 리터럴, 또는 { ...s, cash: … }처럼 GameState를 펼친 리터럴 — 타입 주석이 없으면 타입 오류도 나지 않으므로 반드시 사람이 본다
      const ct = node.getContextualType();
      const spreadsState = node.getProperties().some((p) => Node.isSpreadAssignment(p) && isGameStateLike(p.getExpression().getType()));
      if (((ct && isGameStateLike(ct)) || spreadsState) && node.getProperties().some((p) => (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) && Object.hasOwn(V6_MAP, p.getName())))
        manual.push(`${path.relative(ROOT, file)}:${node.getStartLineNumber()} GameState 객체 리터럴${spreadsState ? ' (스프레드 — 타입 오류가 안 날 수 있음)' : ''}`);
    }
  });
  if (list.length) edits.set(sf, list);
}

console.log(`속성 접근 ${count}곳 · 파일 ${edits.size}개`);
for (const [sf, list] of edits) console.log(`  ${path.relative(ROOT, sf.getFilePath())}: ${list.length}`);
if (manual.length) { console.log(`\n수동 처리 ${manual.length}건:`); for (const m of manual) console.log(`  ${m}`); }

if (!DRY) {
  // 모든 편집을 모은 뒤 한 번에 적용한다 (적용 중에 타입 정보가 바뀌지 않게)
  for (const [sf, list] of edits) {
    let text = sf.getFullText();
    for (const e of [...list].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    sf.replaceWithText(text);
  }
  await project.save();
  console.log('\n적용했다. 이어서: GameState 타입을 v6으로 바꾸고 `npm run typecheck`로 남은 곳을 고친다');
}
