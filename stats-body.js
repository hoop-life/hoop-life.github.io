/* 平衡報表本體：跑 N 局，印出單季／生涯各項數據的 PR10／PR50／PR90，
   以及名人堂與歷史 75 大的機率。

   兩個參考分佈（同一套引擎、不同的玩家）：
   ① 隨手玩 casual —— 就是 calib 用的那一支 autoPlay（5 位置 × 3 分岔策略，訓練／態度／事件全隨機）。
      這是 CI_PCTL 那張分位表的定義來源，所以這一欄的生涯指數分位必須對得上引擎裡的表。
   ② 認真玩 serious —— 就是 audit 用的那一支 autoPlaySerious（貪婪分配點數、分岔一路往上爬）。
      這是「知道怎麼玩的人」會拿到的分佈。

   兩欄一起看才知道平不平衡：差距太小＝玩得好沒有回報，差距太大＝隨手玩沒東西可看。 */
const N=parseInt(process.env.N||'6000',10);

/* 兩個玩家的定義在 autoplay-body.js（stats.js 會把它串在這個檔前面）——
   跟 calib 與 audit 用的是同一份，不再各抄一次。 */
const playCasual=(seed,dseed,opt)=>autoPlay(seed,dseed,opt);
const playSerious=(sd,posIdx,style)=>autoPlaySerious(sd,posIdx,style);

/* ── 統計小工具 ── */
/* 分位數的取法跟 calib-body.js 一致（floor 取樣），不然這裡的 CI 分位會跟引擎的表對不起來 */
const q=(a,p)=>{ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y);
                 return s[Math.min(s.length-1,Math.floor(s.length*p))]; };
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
/* Math.max(...a) 在 15 萬筆會炸掉呼叫堆疊，一律用 reduce */
const maxOf=a=>a.reduce((m,v)=>v>m?v:m,-Infinity);
const W=s=>{ let w=0; for(const ch of String(s)) w+=/[　-〿㐀-鿿＀-￯]/.test(ch)?2:1; return w; };
const padR=(s,n)=>{ s=String(s); return s+' '.repeat(Math.max(0,n-W(s))); };
const padL=(s,n)=>{ s=String(s); return ' '.repeat(Math.max(0,n-W(s)))+s; };
const f1=v=>(Math.round(v*10)/10).toFixed(1);
const num=v=>Math.round(v).toLocaleString('en-US');

/* ── 跑樣本 ── */
const positions=Object.keys(POS);
const arms={casual:{label:'隨手玩',games:[]},serious:{label:'認真玩',games:[]}};
const t0=Date.now();
for(let i=0;i<N;i++){
  arms.casual.games.push(playCasual('L'+i,'D'+(i%7),
    {pos:positions[i%5],branchMode:['first','stay','last'][i%3]}));
  arms.serious.games.push(playSerious('S'+i,i%5,STYLE_KEYS[i%STYLE_KEYS.length]));
}
console.log(`\n樣本：每種玩法 ${N.toLocaleString('en-US')} 局（共 ${(N*2).toLocaleString('en-US')} 局，${((Date.now()-t0)/1000).toFixed(1)}s）`);
console.log('PR90 ＝ 贏過九成人生的水準　PR50 ＝ 中位數　PR10 ＝ 墊底一成的水準\n');

/* 每個 arm 的資料整理 */
for(const key of Object.keys(arms)){
  const A=arms[key];
  A.seasonsPro=[];              /* 職業球季（扣掉整季報銷） */
  A.byLeague={};                /* 所有球季，照聯盟分 */
  A.rows=A.games.map(g=>{
    const s=g.summary,P=s.pro;
    for(const x of g.seasons){
      if(x.miss||!x.gp) continue;
      (A.byLeague[x.lg]=A.byLeague[x.lg]||[]).push(x);
      if(isProSeason(x)) A.seasonsPro.push(x);
    }
    return {
      ci:s.ci, ciPr:s.ciPr, hof:s.hof, hofIn:s.hofIn, grade:s.grade.g,
      legend:s.legend, lrank:s.legendRank,
      money:s.money, bestOvr:s.bestOvr, champs:s.proChamps,
      mvps:g.awards.filter(a=>a.t.indexOf('年度 MVP')>=0).length,
      allStar:g.starYears, natl:g.natl.filter(n=>n.big).length,
      proSeasons:P.seasons, proGp:P.gp,
      pts:P.pts,reb:P.reb,ast:P.ast,stl:P.stl,blk:P.blk,
      fg:P.fg,tp:P.tp,ft:P.ft,
      tPts:P.totalPts,tReb:P.totalReb,tAst:P.totalAst,
      bestPts:P.bestPts, hi:P.hi,
      nba:g.seasons.filter(x=>x.lg==='NBA').length,
      abroad:g.seasons.some(x=>['B1','KBL','NBL','EURO','GLG','NBA','NCAA'].indexOf(x.lg)>=0),
      why:g.retiredWhy||'(空)', age:g.age,
    };
  });
  A.pro=A.rows.filter(r=>r.proSeasons>0);
}

/* ── 表格：三個分位 × 兩種玩法 ── */
function table(title,note,items,pickA,pickB){
  if(title||note) console.log('\x1b[1m'+title+'\x1b[0m'+(note?'　'+note:''));
  console.log('  '+padR('項目',14)+padL('隨手 PR10',11)+padL('PR50',9)+padL('PR90',9)
              +'  │'+padL('認真 PR10',11)+padL('PR50',9)+padL('PR90',9));
  for(const it of items){
    const a=pickA(it),b=pickB(it),fmt=it.f||f1;
    console.log('  '+padR(it.n,14)
      +padL(fmt(q(a,.10)),11)+padL(fmt(q(a,.50)),9)+padL(fmt(q(a,.90)),9)+'  │'
      +padL(fmt(q(b,.10)),11)+padL(fmt(q(b,.50)),9)+padL(fmt(q(b,.90)),9));
  }
}

/* 【A】單季 */
const SEASON_ITEMS=[
  {n:'場均得分',k:'pts'},{n:'場均籃板',k:'reb'},{n:'場均助攻',k:'ast'},
  {n:'場均抄截',k:'stl'},{n:'場均阻攻',k:'blk'},
  {n:'投籃命中 %',k:'fg'},{n:'三分命中 %',k:'tp'},{n:'罰球命中 %',k:'ft'},
  {n:'單場最高',k:'hi',f:v=>String(Math.round(v))},
  {n:'出賽場次',k:'gp',f:v=>String(Math.round(v))},
  {n:'綜合能力',k:'ovr',f:v=>String(Math.round(v))},
  {n:'年薪（萬）',k:'pay',f:num},
];
console.log('══════ 【A】單季數據（職業球季，已扣掉整季報銷）══════');
console.log(`  樣本球季：隨手 ${arms.casual.seasonsPro.length.toLocaleString('en-US')} 季　認真 ${arms.serious.seasonsPro.length.toLocaleString('en-US')} 季`);
table('','',SEASON_ITEMS,
  it=>arms.casual.seasonsPro.map(s=>s[it.k]||0),
  it=>arms.serious.seasonsPro.map(s=>s[it.k]||0));

/* 【B】單季 分聯盟 */
console.log('\n══════ 【B】單季數據 分聯盟（兩種玩法合併，只列樣本 ≥ 60 季的聯盟）══════');
{
  const all={};
  for(const key of Object.keys(arms)) for(const lg of Object.keys(arms[key].byLeague))
    (all[lg]=all[lg]||[]).push(...arms[key].byLeague[lg]);
  const order=Object.keys(LEAGUES).map(k=>LEAGUES[k].short);
  const cols=[['得分','pts'],['籃板','reb'],['助攻','ast'],['抄截','stl'],['阻攻','blk'],
              ['FG%','fg'],['3P%','tp'],['FT%','ft'],['單場高','hi']];
  console.log('  '+padR('聯盟',8)+padL('季數',7)+'  '+cols.map(c=>padL(c[0],13)).join(''));
  console.log('  '+padR('',8)+padL('',7)+'  '+cols.map(()=>padL('PR50 / PR90',13)).join(''));
  for(const lg of order){
    const rows=all[lg]; if(!rows||rows.length<60) continue;
    console.log('  '+padR(lg,8)+padL(rows.length.toLocaleString('en-US'),7)+'  '
      +cols.map(c=>{const v=rows.map(s=>s[c[1]]||0);
        return padL(f1(q(v,.5))+' / '+f1(q(v,.9)),13);}).join(''));
  }
}

/* 【C】生涯 */
console.log('\n══════ 【C】生涯數據（職業口徑：只算打過職業的人生）══════');
{
  const cp=arms.casual.pro.length/N*100, sp=arms.serious.pro.length/N*100;
  console.log(`  打進職業的比例：隨手 ${cp.toFixed(1)}%（${arms.casual.pro.length}／${N}）　認真 ${sp.toFixed(1)}%（${arms.serious.pro.length}／${N}）`);
  const ITEMS=[
    {n:'職業年資',k:'proSeasons',f:v=>String(Math.round(v))},
    {n:'職業出賽',k:'proGp',f:num},
    {n:'場均得分',k:'pts'},{n:'場均籃板',k:'reb'},{n:'場均助攻',k:'ast'},
    {n:'場均抄截',k:'stl'},{n:'場均阻攻',k:'blk'},
    {n:'投籃命中 %',k:'fg'},{n:'三分命中 %',k:'tp'},{n:'罰球命中 %',k:'ft'},
    {n:'生涯總得分',k:'tPts',f:num},{n:'生涯總籃板',k:'tReb',f:num},{n:'生涯總助攻',k:'tAst',f:num},
    {n:'最佳單季場均',k:'bestPts'},
    {n:'生涯單場最高',k:'hi',f:v=>String(Math.round(v))},
    {n:'巔峰綜合',k:'bestOvr',f:v=>String(Math.round(v))},
    {n:'總收入（萬）',k:'money',f:num},
    {n:'職業冠軍',k:'champs',f:v=>String(Math.round(v))},
    {n:'年度 MVP',k:'mvps',f:v=>String(Math.round(v))},
    {n:'明星球季',k:'allStar',f:v=>String(Math.round(v))},
    {n:'NBA 球季',k:'nba',f:v=>String(Math.round(v))},
  ];
  table('','',ITEMS,it=>arms.casual.pro.map(r=>r[it.k]||0),it=>arms.serious.pro.map(r=>r[it.k]||0));
}
/* 【C2】淘汰：生涯是怎麼結束的 */
console.log('\n──── 淘汰：生涯是怎麼結束的 ────');
{
  const WHY={undrafted:'選秀落選，沒踏進職業',washed:'30 歲前掉出所有聯盟（實力不夠）',
             nomarket:'年紀到了，沒有球隊再打電話',broken:'傷退',age:'42 歲硬上限',
             choice:'自己決定收山','(空)':'其他'};
  console.log('  '+padR('',30)+padL('隨手玩',12)+padL('認真玩',12));
  for(const k of ['undrafted','washed','nomarket','broken','age','choice','(空)']){
    const c=arms.casual.rows.filter(r=>r.why===k).length;
    const s=arms.serious.rows.filter(r=>r.why===k).length;
    if(!c&&!s) continue;
    console.log('  '+padR(WHY[k]||k,30)+padL((c/N*100).toFixed(1)+'%',12)+padL((s/N*100).toFixed(1)+'%',12));
  }
  const line=(n,a,b)=>console.log('  '+padR(n,30)+padL(a,12)+padL(b,12));
  const sh=(A,k)=>(A.pro.filter(r=>r.proSeasons<=k).length/A.pro.length*100).toFixed(1)+'%';
  line('職業 3 季內結束',sh(arms.casual,3),sh(arms.serious,3));
  line('職業 6 季內結束',sh(arms.casual,6),sh(arms.serious,6));
  line('退休年齡 PR10',q(arms.casual.pro.map(r=>r.age),.1),q(arms.serious.pro.map(r=>r.age),.1));
  line('退休年齡 PR50',q(arms.casual.pro.map(r=>r.age),.5),q(arms.serious.pro.map(r=>r.age),.5));
  /* 生涯長度該不該跟實力連動：把巔峰綜合分成三段，看退休年齡差多少 */
  for(const key of ['casual','serious']){
    const rows=arms[key].pro.slice().sort((a,b)=>a.bestOvr-b.bestOvr);
    const t=Math.floor(rows.length/3);
    const avg=a=>a.reduce((s,x)=>s+x.age,0)/a.length;
    const lo=rows.slice(0,t),hi=rows.slice(-t);
    if(key==='casual') console.log('  ── 生涯長度 vs 實力（依巔峰綜合分三段）──');
    console.log('  '+padR(arms[key].label,10)
      +`弱組（巔峰 ${q(lo.map(r=>r.bestOvr),.5)}）退休 ${avg(lo).toFixed(1)} 歲、職業 ${q(lo.map(r=>r.proSeasons),.5)} 季　`
      +`強組（巔峰 ${q(hi.map(r=>r.bestOvr),.5)}）退休 ${avg(hi).toFixed(1)} 歲、職業 ${q(hi.map(r=>r.proSeasons),.5)} 季　`
      +`差 ${(avg(hi)-avg(lo)).toFixed(1)} 年`);
  }
}

/* 榮譽的稀有度：PR90 看不到的東西（MVP 中位數永遠是 0），要用機率講 */
console.log('\n──── 榮譽稀有度（打過職業的人生裡，一輩子至少拿過一次的比例）────');
{
  const R=[['職業總冠軍',r=>r.champs>0],['年度 MVP',r=>r.mvps>0],
           ['明星球季',r=>r.allStar>0],['打過 NBA',r=>r.nba>0],
           ['打過海外／NCAA',r=>r.abroad],['進過歷史 75 大',r=>r.lrank>0]];
  console.log('  '+padR('',18)+padL('隨手玩',12)+padL('認真玩',12));
  for(const [n,f] of R)
    console.log('  '+padR(n,18)
      +padL((arms.casual.pro.filter(f).length/arms.casual.pro.length*100).toFixed(1)+'%',12)
      +padL((arms.serious.pro.filter(f).length/arms.serious.pro.length*100).toFixed(1)+'%',12));
}

console.log('\n──── 生涯總分（全部人生，含沒打進職業的）────');
table('','',[
  {n:'生涯指數 CI',k:'ci',f:num},
  {n:'名人堂票數',k:'hof',f:v=>String(Math.round(v))},
  {n:'歷史 75 分數',k:'legend',f:v=>String(Math.round(v))},
], it=>arms.casual.rows.map(r=>r[it.k]||0), it=>arms.serious.rows.map(r=>r[it.k]||0));

/* CI_PCTL 對帳：隨手玩那一欄必須跟引擎裡的表對得上 */
{
  const cis=arms.casual.rows.map(r=>r.ci);
  const at=[10,50,80,90,95,99];
  console.log('\n  CI 對帳（隨手玩 vs 引擎內的 CI_PCTL）：'
    +at.map(p=>{
      const meas=q(cis,p/100), i=CI_PR_AT.indexOf(p);
      const tbl=i>=0?CI_PCTL[i]:null;
      if(tbl===null) return `p${p} ${num(meas)}`;
      const d=(meas-tbl)/tbl*100;
      return `p${p} ${num(meas)}／表${num(tbl)}（${d>=0?'+':''}${d.toFixed(1)}%）`;
    }).join('　'));
}

/* 【D】名人堂 */
console.log('\n══════ 【D】名人堂與生涯評價 ══════');
{
  const GR='SABCDEF'.split('');
  const GN={S:'不世出的傳奇',A:'名人堂級',B:'聯盟門面',C:'穩固的先發',D:'輪替戰力',E:'走過一遭',F:'沒走到職業'};
  console.log('  '+padR('',16)+padL('隨手玩',12)+padL('認真玩',12));
  const line=(n,a,b)=>console.log('  '+padR(n,16)+padL(a,12)+padL(b,12));
  const rate=A=>(A.rows.filter(r=>r.hofIn).length/N*100).toFixed(2)+'%';
  line('名人堂入選率',rate(arms.casual),rate(arms.serious));
  line('平均票數',f1(mean(arms.casual.rows.map(r=>r.hof))),f1(mean(arms.serious.rows.map(r=>r.hof))));
  line('票數 PR90',Math.round(q(arms.casual.rows.map(r=>r.hof),.9)),Math.round(q(arms.serious.rows.map(r=>r.hof),.9)));
  line('票數 PR50',Math.round(q(arms.casual.rows.map(r=>r.hof),.5)),Math.round(q(arms.serious.rows.map(r=>r.hof),.5)));
  line('票數 PR10',Math.round(q(arms.casual.rows.map(r=>r.hof),.1)),Math.round(q(arms.serious.rows.map(r=>r.hof),.1)));
  console.log('\n  評價分佈（門檻：S≥92　A≥70　B≥41　C≥27　D≥15）');
  console.log('  '+padR('等級',16)+padL('隨手玩',12)+padL('認真玩',12));
  for(const gk of GR){
    const c=arms.casual.rows.filter(r=>r.grade===gk).length;
    const s=arms.serious.rows.filter(r=>r.grade===gk).length;
    console.log('  '+padR(gk+'　'+GN[gk],16)
      +padL((c/N*100).toFixed(1)+'%',12)+padL((s/N*100).toFixed(1)+'%',12));
  }
  /* 進了名人堂的人長什麼樣子 */
  const hofers=[...arms.casual.rows,...arms.serious.rows].filter(r=>r.hofIn);
  if(hofers.length){
    console.log(`\n  名人堂球員的樣貌（兩種玩法合併 ${hofers.length} 人，中位數）：`
      +`職業 ${q(hofers.map(r=>r.proSeasons),.5)} 季　`
      +`${f1(q(hofers.map(r=>r.pts),.5))} / ${f1(q(hofers.map(r=>r.reb),.5))} / ${f1(q(hofers.map(r=>r.ast),.5))}　`
      +`冠軍 ${q(hofers.map(r=>r.champs),.5)}　MVP ${q(hofers.map(r=>r.mvps),.5)}　`
      +`巔峰綜合 ${q(hofers.map(r=>r.bestOvr),.5)}　NBA ${q(hofers.map(r=>r.nba),.5)} 季`);
  }
}

/* 【E】歷史 75 大 */
console.log('\n══════ 【E】歷史 75 大球星 ══════');
{
  const LG_TOP=LEGEND_SC[LEGEND_SC.length-1];
  console.log(`  入選門檻 LEGEND_IN=${LEGEND_IN}（第 75 名）　榜首門檻 ${LG_TOP}（第 1 名）`);
  console.log('  '+padR('',16)+padL('隨手玩',14)+padL('認真玩',14));
  const line=(n,a,b)=>console.log('  '+padR(n,16)+padL(a,14)+padL(b,14));
  const inOf=A=>A.rows.filter(r=>r.lrank>0);
  const ci=inOf(arms.casual),si=inOf(arms.serious);
  line('入選率',(ci.length/N*100).toFixed(2)+`%（${ci.length}）`,(si.length/N*100).toFixed(2)+`%（${si.length}）`);
  line('分數 PR50',Math.round(q(arms.casual.rows.map(r=>r.legend),.5)),Math.round(q(arms.serious.rows.map(r=>r.legend),.5)));
  line('分數 PR90',Math.round(q(arms.casual.rows.map(r=>r.legend),.9)),Math.round(q(arms.serious.rows.map(r=>r.legend),.9)));
  line('分數 PR99',Math.round(q(arms.casual.rows.map(r=>r.legend),.99)),Math.round(q(arms.serious.rows.map(r=>r.legend),.99)));
  line('分數 PR99.9',Math.round(q(arms.casual.rows.map(r=>r.legend),.999)),Math.round(q(arms.serious.rows.map(r=>r.legend),.999)));
  line('分數最大值',maxOf(arms.casual.rows.map(r=>r.legend)),maxOf(arms.serious.rows.map(r=>r.legend)));
  line('爆表（>榜首門檻）',ci.filter(r=>r.legend>LG_TOP).length,si.filter(r=>r.legend>LG_TOP).length);
  const all=[...ci,...si].map(r=>r.lrank).sort((a,b)=>a-b);
  if(all.length){
    const hist={};
    for(const r of all){ const b=r<=10?'第 1–10 名':r<=25?'第 11–25 名':r<=50?'第 26–50 名':'第 51–75 名';
      hist[b]=(hist[b]||0)+1; }
    const r1n=all.filter(r=>r===1).length;
    console.log(`\n  入選者名次分佈（合併 ${all.length} 人）：最高第 ${all[0]} 名　中位第 ${all[Math.floor(all.length/2)]} 名　最低第 ${all[all.length-1]} 名　剛好第 1 名 ${r1n} 人（${(r1n/all.length*100).toFixed(1)}%）`);
    for(const b of ['第 1–10 名','第 11–25 名','第 26–50 名','第 51–75 名'])
      console.log('    '+padR(b,14)+padL((hist[b]||0)+' 人',8)+padL(((hist[b]||0)/all.length*100).toFixed(1)+'%',9));
    const L=[...ci,...si];
    console.log(`\n  入選者的樣貌（中位數）：職業 ${q(L.map(r=>r.proSeasons),.5)} 季　`
      +`${f1(q(L.map(r=>r.pts),.5))} / ${f1(q(L.map(r=>r.reb),.5))} / ${f1(q(L.map(r=>r.ast),.5))}　`
      +`冠軍 ${q(L.map(r=>r.champs),.5)}　MVP ${q(L.map(r=>r.mvps),.5)}　`
      +`NBA ${q(L.map(r=>r.nba),.5)} 季　CI ${num(q(L.map(r=>r.ci),.5))}`);
    console.log(`  有 NBA 履歷的比例：${(L.filter(r=>r.nba>0).length/L.length*100).toFixed(0)}%`);
  }
}

/* 【F】平衡診斷 */
console.log('\n══════ 【F】平衡診斷 ══════');
{
  const flag=[];
  const say=(ok,m)=>{ console.log((ok?'  \x1b[32m✓\x1b[0m ':'  \x1b[33m⚠\x1b[0m ')+m); if(!ok) flag.push(m); };
  const cci=q(arms.casual.rows.map(r=>r.ci),.8);
  say(Math.abs(cci-10000)/10000<0.04,`隨手玩的 CI P80 ＝ ${num(cci)}（校準目標 10,000，容差 4%）`);
  const over=arms.casual.rows.filter(r=>r.ci>=10000).length/N*100;
  say(over>=15&&over<=25,`隨手玩破萬比例 ${over.toFixed(1)}%（目標 20%）`);
  /* 「會玩有沒有回報」不能只看中位數：往上爬的代價是去更難的聯盟、數據被壓低，
     所以中位數不太動，差距是開在頂端。三個分位一起看才看得到形狀。 */
  const cc=arms.casual.rows.map(r=>r.ci),ss=arms.serious.rows.map(r=>r.ci);
  const ladder=[.1,.5,.9,.99].map(p=>`PR${p*100} ${(q(ss,p)/q(cc,p)).toFixed(2)}×`).join('　');
  const g90=q(ss,.9)/q(cc,.9);
  say(g90>=1.10,`認真玩／隨手玩 的 CI 倍率：${ladder}（回報要開在頂端，PR90 至少 1.10×）`);
  const hr=arms.casual.rows.filter(r=>r.hofIn).length/N*100;
  const hr2=arms.serious.rows.filter(r=>r.hofIn).length/N*100;
  say(hr>=1&&hr<=8,`名人堂入選率：隨手 ${hr.toFixed(2)}%　認真 ${hr2.toFixed(2)}%（隨手玩應在 1～8%）`);
  const lr=arms.casual.rows.filter(r=>r.lrank>0).length/N*100;
  const lr2=arms.serious.rows.filter(r=>r.lrank>0).length/N*100;
  say(lr>=0.3&&lr<=0.9,`歷史 75 大入選率：隨手 ${lr.toFixed(2)}%（設計值 0.5%，LEGEND_IN 就是照這條校準的）　認真 ${lr2.toFixed(2)}%`);
  const all75=[...arms.casual.rows,...arms.serious.rows].filter(r=>r.lrank>0);
  const r1=all75.filter(r=>r.lrank===1).length;
  say(!all75.length||(r1/all75.length<=0.02),
    `歷史第 1 名沒有塞車：${r1}／${all75.length} 位入選者（${all75.length?(r1/all75.length*100).toFixed(2):0}%，上限 2%，舊版線性映射是 13.4%）`);
  /* 淘汰：這三條是 v1.4.0 的重點，退化了要看得出來 */
  const cpro=arms.casual.pro;
  const short6=cpro.filter(r=>r.proSeasons<=6).length/cpro.length*100;
  say(short6>=6&&short6<=30,`職業六季內出局 ${short6.toFixed(1)}%（淘汰要存在，但不能變成主流）`);
  /* 這裡以前寫「職業年資 PR10 ≤ 8」，跟上一條在守同一件事（尾巴夠不夠厚），
     而且 PR10 落在 8 還是 9 只看尾巴剛好在 10% 的上面還下面。
     批 3 量出來的病不是尾巴太薄，是**尾巴擠在同一年**：v1.4.0～v1.5.0 的名單線
     豁免三季再一次結清，六季內出局的人有 85.1% 剛好死在第三季末。
     所以改成量症狀（`regress.js` ①c 有同一條，兩邊要說同一件事）。 */
  {
    const early=cpro.filter(r=>r.proSeasons<=8);
    const byYear={}; early.forEach(r=>{ byYear[r.proSeasons]=(byYear[r.proSeasons]||0)+1; });
    const worst=Math.max(0,...Object.keys(byYear).map(k=>byYear[k]));
    say(early.length>0&&worst/early.length<=0.62,
      `早退不是一根柱子：≤8 季出局 ${early.length} 人，最集中的那一年佔 `
      +`${early.length?(worst/early.length*100).toFixed(0):'—'}%（要 ≤62%，v1.5.0 是 85%）`);
  }
  {
    const rows=cpro.slice().sort((a,b)=>a.bestOvr-b.bestOvr),t=Math.floor(rows.length/3);
    const avg=a=>a.reduce((s,x)=>s+x.age,0)/a.length;
    const gap=avg(rows.slice(-t))-avg(rows.slice(0,t));
    say(gap>=4,`生涯長度跟實力連動：強組比弱組多打 ${gap.toFixed(1)} 年（要 ≥4 年；舊版只有 3.0 年）`);
  }
  const prorate=cpro.length/N*100;
  say(prorate>=70&&prorate<=90,`打進職業的比例 ${prorate.toFixed(1)}%（舊版 93.9%，選秀那一關等於不存在）`);
  const GR='SABCDEF'.split('');
  const missing=GR.filter(gk=>!arms.casual.rows.some(r=>r.grade===gk)&&!arms.serious.rows.some(r=>r.grade===gk));
  say(missing.length===0,`七個評價等級都拿得到（缺 ${missing.join('/')||'無'}）`);
  const sPct=arms.serious.rows.filter(r=>r.grade==='S').length/N*100;
  say(sPct<=8,`認真玩拿到 S 的比例 ${sPct.toFixed(2)}%（S 要維持稀有）`);
  const allPro=arms.casual.seasonsPro.concat(arms.serious.seasonsPro);
  const maxPts=maxOf(allPro.map(s=>s.pts));
  say(maxPts<60,`單季場均上限 ${f1(maxPts)}（刻意不設軟上限，只守 60 的外框）`);
  console.log('\n  極端值：單季最高場均 '+f1(maxPts)
    +'　單場最高 '+maxOf(allPro.map(s=>s.hi))
    +'　最高 CI '+num(maxOf(cc.concat(ss)))
    +'　最高年薪 '+num(maxOf(allPro.map(s=>s.pay)))+' 萬');
  console.log('\n'+(flag.length?`  \x1b[33m${flag.length} 項要看一下\x1b[0m`:'  \x1b[32m平衡指標全部落在設計區間內\x1b[0m'));
}
console.log('');
