// F7-A 블록 C 보조 — 조건 2의 시드 짝 차이의 차이: (해제 증산 이득 − 잠김 증산 이득) = (C<B>·<R>x − C4·<R>x) − (A<B>·<R> − A4·<R>), 같은 시드
// 사용: node scripts/experiments/f7a-did.cjs <mkt-f7a 출력 폴더(standard-180·micro-180 하위 폴더를 가진)>  — #F7A 시드별 줄의 nw(억)를 읽는다. 측정 전용(MGT)
const fs=require('fs'),path=require('path');
const dir=process.argv[2]; const nw={};
for (const t of ['standard-180','micro-180']) for (const f of fs.readdirSync(path.join(dir,t))) for (const l of fs.readFileSync(path.join(dir,t,f),'utf8').split('\n')) if (l.startsWith('#F7A ')) { const j=JSON.parse(l.slice(5)); ((nw[j.tier]??={})[j.id]??={})[j.seed]=j.nw/1e8; }
const stat=(a)=>{const n=a.length,m=a.reduce((x,y)=>x+y,0)/n,sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/(n-1));return `${m>=0?'+':''}${m.toFixed(2)} · t ${(m/(sd/Math.sqrt(n))).toFixed(1)} · ${a.filter(x=>x>0).length}/${n}`;};
for (const tier of Object.keys(nw)) for (const [r,lr] of [['0','0'],['b15','b']]) for (const big of [6,8]) {
  const T=nw[tier], seeds=Object.keys(T['A4·0']);
  const d=seeds.map(s=>(T[`C${big}·${lr}x`][s]-T[`C4·${lr}x`][s])-(T[`A${big}·${r}`][s]-T[`A4·${r}`][s]));
  console.log(`${tier} ${r==='0'?'납품 끔':'봇 규칙'} ${big}−4: (해제 이득 − 잠김 이득) ${stat(d)}`);
}
