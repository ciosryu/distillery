import { ROLE_INFO } from '../../sim/content/catalog';
import type { Staff as StaffT } from '../../sim';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Badge, Button, Card, Empty } from '../kit';

const ROLE_EFFECT: Record<StaffT['role'], string> = {
  distiller: '후각: 과일 에스테르↑ · 공정: 이취↓·운전 횟수↑ · 직관: 블렌딩 통합감↑',
  warehouse: '관찰: 누수 손실↓ · 환경통제: 증발↓ · 성실: 누수 확률↓',
  sales: '친화: 가격 민감도↓ · 네트워크: 유통 커버리지↑ · 협상: 유통 마진↓',
};

function StatBar({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-stone-500">{name}</span>
      <div className="h-1.5 flex-1 rounded bg-stone-200 dark:bg-stone-800"><div className="h-1.5 rounded bg-amber-600" style={{ width: `${value}%` }} /></div>
      <span className="w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

function Person({ x, action }: { x: StaffT & { askSalary?: number }; action: React.ReactNode }) {
  const info = ROLE_INFO[x.role];
  return (
    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{x.name}</div>
          <div className="text-xs text-stone-500">{info.nameKo} · Lv.{x.level}{x.hiredMonth >= 0 && ` · XP ${Math.round(x.xp)}/${100 * x.level}`}</div>
        </div>
        <Badge>{won(x.askSalary ?? x.salary)}/월</Badge>
      </div>
      <div className="grid gap-1">
        <StatBar name={info.stats[0]} value={x.stats.a} />
        <StatBar name={info.stats[1]} value={x.stats.b} />
        <StatBar name={info.stats[2]} value={x.stats.c} />
      </div>
      <div className="mt-2">{action}</div>
    </div>
  );
}

export function Staff() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  return (
    <div className="grid gap-4">
      <Card title={`직원 (${s.staff.length}명 · 월 급여 ${won(s.staff.reduce((t, x) => t + x.salary, 0))})`}>
        {!s.staff.length ? <Empty>직원이 없습니다. 디스틸러가 없으면 생산할 수 없습니다.</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.staff.map((x) => <Person key={x.id} x={x} action={<Button small variant="danger" onClick={() => dispatch({ type: 'fire', staffId: x.id })}>내보내기 (위로금 1개월)</Button>} />)}
          </div>
        )}
      </Card>
      <Card title="채용 후보 (분기마다 갱신)">
        <ul className="mb-3 grid gap-1 text-xs text-stone-500">
          {(Object.keys(ROLE_EFFECT) as StaffT['role'][]).map((r) => <li key={r}><span className="font-medium text-stone-700 dark:text-stone-300">{ROLE_INFO[r].nameKo}</span> — {ROLE_EFFECT[r]}</li>)}
        </ul>
        {!s.candidates.length ? <Empty>후보가 없습니다</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.candidates.map((x) => <Person key={x.id} x={x} action={<Button small variant="primary" onClick={() => dispatch({ type: 'hire', candidateId: x.id })}>채용</Button>} />)}
          </div>
        )}
      </Card>
    </div>
  );
}
