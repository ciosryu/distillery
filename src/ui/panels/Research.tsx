import { useState } from 'react';
import { ROLE_INFO } from '../../sim/content/catalog';
import { TECH_BY_ID, TECH_NODES, type TreeId } from '../../sim/content/tech';
import { isLocked } from '../../sim';
import { METRIC_LABEL, milestoneBonus, researchBlocker, researchRate } from '../../sim/research';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Badge, Button, Card, Empty, Table, Td } from '../kit';

// 연구 화면 (#170, tech-tree §2.1) — 직원 탭 안에 둔다(연구 = 담당 직원 + 기간 + 월 연구비). MVP는 연구가 잠겨 있어 숨긴다(#130)

const TREE_KO: Record<TreeId, string> = {
  production: '생산·발효', maturation: '숙성·캐스크', engineering: '설비·ESG', business: '경영·브랜드',
  whisky: '위스키', white: '화이트 스피릿', brandy: '브랜디', tequila: '테킬라', rum: '럼', asian: '아시안 스피릿',
};

export function Research() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [leads, setLeads] = useState<Record<string, string>>({});
  if (isLocked(s, 'system:research')) return null;

  const busy = new Set(s.research.active.map((a) => a.leadStaffId).filter(Boolean));
  const monthly = s.research.active.filter((a) => !a.paused && a.leadStaffId).reduce((t, a) => t + (TECH_BY_ID[a.techId]?.research.monthlyCost ?? 0), 0);
  const nameOf = (id?: string) => s.hr.staff.find((x) => x.id === id)?.name ?? '없음';
  const trees = [...new Set(TECH_NODES.map((n) => n.tree))];
  // 실적 보너스 (P-MGT-22) — "+18%" 와 근거(지표 지금/기준)
  const bonusOf = (techId: string) => {
    const b = milestoneBonus(s, techId);
    if (!b) return null;
    const l = METRIC_LABEL[b.metric];
    return { pct: Math.round(b.bonus * 100), why: `${l.nameKo} ${Math.round(b.value).toLocaleString()} / 기준 ${b.target.toLocaleString()}${l.unit} — 실적이 기준에 닿으면 연구 속도 +30%` };
  };
  const bonusText = (techId: string) => {
    const b = bonusOf(techId);
    return b ? <span className={b.pct ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'} title={b.why}>실적 +{b.pct}%</span> : null;
  };

  return (
    <>
      <Card title={`연구 — 슬롯 ${s.research.active.length}/${s.research.slots} · 이번 달 연구비 ${won(monthly)} · 완료 ${s.research.unlocked.length}/${TECH_NODES.length}`}>
        <p className="mb-2 text-xs text-stone-500">연구 = 담당 직원 + 기간 + 월 연구비(현금). 일시정지하면 진행도는 남고 연구비가 멈춘다. 담당자가 떠나면 진행도 −25%. 실적 보너스: 그 계통의 실적(누적 생산·판매, 숙성 중인 통)이 기준에 닿을수록 연구가 빨라진다(최대 +30%, 연구 전 실적도 센다 — 숫자에 마우스를 올리면 근거). "효과 준비 중"인 연구는 끝내도 아직 게임에서 바뀌는 것이 없다.</p>
        {!s.research.active.length ? <Empty>진행 중인 연구가 없습니다</Empty> : (
          <Table head={['연구', '진행도', '담당자', '월 연구비', '남은 기간(예상)', '실적 보너스', '']}>
            {s.research.active.map((a) => {
              const node = TECH_BY_ID[a.techId]!;
              const rate = researchRate(s, a.techId, a.leadStaffId);
              const eligible = s.hr.staff.filter((x) => node.research.leadRoles.includes(x.role) && (x.id === a.leadStaffId || !busy.has(x.id)));
              return (
                <tr key={a.techId}>
                  <Td className="font-medium">{node.id} {node.nameKo}</Td>
                  <Td right>{Math.round(a.progress * 100)}%</Td>
                  <Td>
                    <select className="rounded border border-stone-300 bg-transparent px-1 text-sm dark:border-stone-700" value={a.leadStaffId ?? ''} onChange={(e) => dispatch({ type: 'setResearch', techId: a.techId, leadStaffId: e.target.value })}>
                      {!a.leadStaffId && <option value="">담당자 없음 — 멈춤</option>}
                      {eligible.map((x) => <option key={x.id} value={x.id}>{x.name} ({ROLE_INFO[x.role].nameKo})</option>)}
                    </select>
                  </Td>
                  <Td right>{won(node.research.monthlyCost)}</Td>
                  <Td right>{a.paused || !rate ? '멈춤' : `${Math.ceil((1 - a.progress) / rate)}개월`}</Td>
                  <Td right>{bonusText(a.techId)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button small onClick={() => dispatch({ type: 'setResearch', techId: a.techId, paused: !a.paused })}>{a.paused ? '재개' : '일시정지'}</Button>
                      <Button small variant="danger" onClick={() => dispatch({ type: 'cancelResearch', techId: a.techId })} title="진행도가 사라진다">포기</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Card title="연구 목록">
        <div className="grid gap-4">
          {trees.map((tree) => (
            <div key={tree}>
              <div className="mb-1 text-sm font-medium">{TREE_KO[tree]}</div>
              <Table head={['연구', '등급', '기간·월 연구비', '실적 보너스', '선행', '담당 직군', '상태', '']}>
                {TECH_NODES.filter((n) => n.tree === tree).map((n) => {
                  const done = s.research.unlocked.includes(n.id);
                  const active = s.research.active.some((a) => a.techId === n.id);
                  const eligible = s.hr.staff.filter((x) => n.research.leadRoles.includes(x.role) && !busy.has(x.id));
                  const lead = leads[n.id] && eligible.some((x) => x.id === leads[n.id]) ? leads[n.id]! : eligible[0]?.id;
                  const why = done || active ? null : researchBlocker(s, n.id, lead) ?? (lead ? null : '담당할 직원이 없습니다');
                  return (
                    <tr key={n.id}>
                      <Td className="font-medium">{n.id} {n.nameKo}{n.pending && <div className="max-w-xl"><Badge tone="warn">효과 준비 중</Badge> <span className="text-xs text-stone-500">{n.pending}</span></div>}</Td>
                      <Td right>T{n.tier}</Td>
                      <Td right>{n.research.baseMonths}개월 · {won(n.research.monthlyCost)}</Td>
                      <Td right>{done ? '—' : bonusText(n.id)}</Td>
                      <Td>{n.prereq.length ? n.prereq.join(', ') : '—'}</Td>
                      <Td>{n.research.leadRoles.map((r) => ROLE_INFO[r].nameKo).join('·')}</Td>
                      <Td>{done ? <Badge tone="good">완료</Badge> : active ? <Badge tone="info">진행 중</Badge> : why ? <span className="block max-w-48 text-xs text-stone-500">{why}</span> : <Badge>가능</Badge>}</Td>
                      <Td>
                        {!done && !active && (
                          <div className="flex gap-1">
                            {eligible.length > 1 && (
                              <select className="rounded border border-stone-300 bg-transparent px-1 text-sm dark:border-stone-700" value={lead} onChange={(e) => setLeads({ ...leads, [n.id]: e.target.value })}>
                                {eligible.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                              </select>
                            )}
                            <Button small variant="primary" disabled={!!why} onClick={() => lead && dispatch({ type: 'startResearch', techId: n.id, leadStaffId: lead })} title={lead ? `담당: ${nameOf(lead)}` : undefined}>시작</Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
