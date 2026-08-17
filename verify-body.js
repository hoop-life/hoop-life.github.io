
/* 用一顆「決策種子」自動玩，模擬玩家的固定選擇序列 */
function autoPlay(seed, decisionSeed, opts){
  opts=opts||{};
  const drng=mulberry32(cyrb32('dec|'+decisionSeed));
  const g=createGame(seed, opts.name||'測試員', opts.pos||'SF');
  const trace=[];
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>400) throw new Error('卡關：超過 400 步仍未退休 stage='+g.stage+' age='+g.age);
    const p=g.pending;
    if(!p){ throw new Error('pending 為空 phase='+g.phase); }
    if(p.type==='train'){
      const ints=['push','normal','safe'];
      const it=ints[Math.floor(drng()*3)];
      /* 依位置權重貪婪分配——用引擎的 greedyAlloc，跟 UI 的「自動分配」按鈕同一份 */
      const alloc=greedyAlloc(g,trainPoints(g,it));
      const atts=['allin','steady','manage'];
      const att=atts[Math.floor(drng()*3)];
      trace.push('T:'+it+':'+att+':'+JSON.stringify(alloc));
      applyTrain(g,it,alloc,att);
    } else if(p.type==='event'){
      const i=Math.floor(drng()*p.opts.length);
      trace.push('E:'+p.ev+':'+i);
      applyEvent(g,i);
    } else if(p.type==='result'){
      trace.push('R');
      advance(g);
    } else if(p.type==='branch'){
      /* 一律選第一個（最積極的），逼出旅外路線 */
      const i=opts.branchLast?p.opts.length-1:0;
      trace.push('B:'+p.pending_title+':'+i);
      applyBranch(g,i);
    } else if(p.type==='end'){ break; }
  }
  return {g:g,trace:trace};
}

function fingerprint(g){
  const s=g.summary;
  return JSON.stringify({
    seasons:g.seasons.length,age:g.age,ovr:g.bestOvr,pts:s.pts,reb:s.reb,ast:s.ast,
    money:s.money,champs:s.champs,hof:s.hof,grade:s.grade.g,
    traits:g.traits.slice().sort(),lastLg:g.seasons.map(x=>x.lg).join('>'),
  });
}

let fail=0;
const say=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); if(!ok) fail++; };

/* ---------- 1. 種子重現性 ---------- */
console.log('\n[1] 相同種子＋相同選擇＝相同人生');
for(const sd of ['pe7ff6ae','abc12345','zzz99999']){
  const a=autoPlay(sd,'D1'), b=autoPlay(sd,'D1');
  const same=fingerprint(a.g)===fingerprint(b.g) && a.trace.join('|')===b.trace.join('|');
  say(same, `種子 ${sd} 兩次跑出完全相同的一生`);
}
console.log('\n[1b] 不同種子要跑出不同人生');
{
  const a=autoPlay('seedAAA','D1'), b=autoPlay('seedBBB','D1');
  say(fingerprint(a.g)!==fingerprint(b.g),'不同種子 → 不同結果');
}
console.log('\n[1c] 同種子不同選擇要跑出不同人生');
{
  const a=autoPlay('pe7ff6ae','D1'), b=autoPlay('pe7ff6ae','D2');
  say(fingerprint(a.g)!==fingerprint(b.g),'同種子不同決策 → 不同結果');
}

/* ---------- 2. 大量跑完，不卡關、不 NaN ---------- */
console.log('\n[2] 批次壓測 500 局（5 位置 × 100 種子）');
const positions=Object.keys(POS);
const agg={n:0,ptsSum:0,maxPts:0,minPts:99,seasons:0,hofIn:0,nba:0,overseas:0,
           champs:0,inj:0,grades:{},leagues:{},traitCount:{},retireAges:[]};
let nanHit=null,crash=null;
for(let i=0;i<500;i++){
  const pos=positions[i%5];
  const sd='s'+i;
  try{
    const {g}=autoPlay(sd,'D'+(i%7),{pos:pos,branchLast:(i%3===2)});
    const s=g.summary;
    const nums=[s.pts,s.reb,s.ast,s.money,s.hof,s.gp,s.totalPts,g.bestOvr];
    if(nums.some(v=>typeof v!=='number'||!isFinite(v))) { nanHit=nanHit||{sd,pos,s}; }
    agg.n++;
    agg.ptsSum+=s.pts; agg.maxPts=Math.max(agg.maxPts,s.pts); agg.minPts=Math.min(agg.minPts,s.pts);
    agg.seasons+=g.seasons.length; agg.champs+=s.champs; agg.inj+=g.injuries;
    if(s.hofIn) agg.hofIn++;
    agg.grades[s.grade.g]=(agg.grades[s.grade.g]||0)+1;
    const lgs=new Set(g.seasons.map(x=>x.lg));
    if(lgs.has('NBA')) agg.nba++;
    if(['B1','KBL','NBL','EURO','GLG','NBA','NCAA'].some(x=>lgs.has(x))) agg.overseas++;
    lgs.forEach(l=>agg.leagues[l]=(agg.leagues[l]||0)+1);
    g.traits.forEach(t=>agg.traitCount[t]=(agg.traitCount[t]||0)+1);
    agg.retireAges.push(g.age);
  }catch(e){ crash=crash||{sd,pos,e:e.message}; }
}
say(!crash, crash?`有局崩潰：${crash.sd}/${crash.pos} — ${crash.e}`:'500 局全部跑完，無崩潰、無卡關');
say(!nanHit, nanHit?`出現 NaN/Infinity：${JSON.stringify(nanHit)}`:'無 NaN / Infinity');
say(agg.n===500, `完成局數 ${agg.n}/500`);

/* ---------- 3. 數值合理性 ---------- */
console.log('\n[3] 數值合理性');
const avgPts=agg.ptsSum/agg.n, avgSeasons=agg.seasons/agg.n;
say(avgPts>4&&avgPts<22, `生涯場均得分平均 ${avgPts.toFixed(2)}（期望 4~22）`);
say(agg.maxPts<40, `最高生涯場均 ${agg.maxPts.toFixed(1)}（應 < 40）`);
say(avgSeasons>8&&avgSeasons<26, `平均生涯季數 ${avgSeasons.toFixed(1)}（期望 8~26）`);
const hofRate=agg.hofIn/agg.n*100;
/* 上界從 40% 收到 15%：v1.2.0 的 22% 曾經通過這道守門，但那個 22% 正是
   「場均十幾分也能進名人堂」的病徵。名人堂要稀有到值得追，但不能變成不可能。 */
say(hofRate>0.5&&hofRate<15, `名人堂入選率 ${hofRate.toFixed(1)}%（期望 0.5%~15%，要稀有但做得到）`);
const nbaRate=agg.nba/agg.n*100, osRate=agg.overseas/agg.n*100;
say(nbaRate>0&&nbaRate<25, `打進 NBA 比率 ${nbaRate.toFixed(1)}%（要很難但不能是 0）`);
say(osRate>5&&osRate<95, `有出過國比率 ${osRate.toFixed(1)}%（厲害的才能出國）`);
const minAge=Math.min(...agg.retireAges), maxAge=Math.max(...agg.retireAges);
/* maxAge<=45 那半邊是 retireForced 的 hardCap（g.age>=42）保證的，驗不到東西。
   真正有語意的是「退休年齡有拉得開」——全部擠在同一歲代表生涯長度變成常數。 */
say(minAge>=19&&maxAge<=45, `退休年齡範圍 ${minAge}~${maxAge}`);
say(maxAge-minAge>=10, `退休年齡真的有分佈（跨度 ${maxAge-minAge} 歲，要 ≥10）`);
const RA=agg.retireAges.slice().sort((x,y)=>x-y);
console.log("  退休年齡 p10/p50/p90："+[.1,.5,.9].map(q=>RA[Math.floor(RA.length*q)]).join(" / "));

console.log('\n  評價分佈：', Object.entries(agg.grades).sort().map(([k,v])=>`${k}:${v}`).join('  '));
console.log('  待過聯盟：', Object.entries(agg.leagues).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join('  '));

/* ---------- 4. 特質可達性 ---------- */
/* 數量一律讀 TRAITS 本身，不要寫死——寫死的那個數字遲早跟實際的特質數對不上 */
const TRAIT_N=Object.keys(TRAITS).length;
console.log(`\n[4] ${TRAIT_N} 個特質是否都拿得到`);
const unreachable=Object.keys(TRAITS).filter(t=>!agg.traitCount[t]);
console.log('  已觸發：', Object.entries(agg.traitCount).sort((a,b)=>b[1]-a[1])
  .map(([k,v])=>`${TRAITS[k].n}:${v}`).join('  ')||'（無）');
/* 上限收到 1：唯一刻意拿不到的是「史上第一人」（全部生涯 0.033%，而且 regress ⑪C
   有純函式在守它真的發得出來）。放 6 等於留 5 個名額給悄悄變成死內容的特質。 */
say(unreachable.length<=1, unreachable.length
  ? `未觸發 ${unreachable.length} 個：${unreachable.map(t=>TRAITS[t].n).join('、')}`
  : `${TRAIT_N} 個特質全部可達`);

/* ---------- 5. 旅外門檻真的擋得住 ---------- */
console.log('\n[5] 旅外門檻');
/* 只驗「踏進去的那一刻」，不驗之後的每一季——人在國外會變老，綜合掉下來是正常的，
   那不是門檻沒擋住。國際賽曝光最多可以讓門檻放寬 5 分（natlBuzz），要算進容差。 */
const BUZZ_MAX=5, DECLINE_SLACK=3;
let lowEntry=0,entries=0,worst=null;
for(let i=0;i<200;i++){
  const {g}=autoPlay('g'+i,'D'+(i%5),{pos:positions[i%5]});
  for(let k=1;k<g.seasons.length;k++){
    const cur=g.seasons[k],prev=g.seasons[k-1];
    if(cur.lg===prev.lg) continue;                       /* 沒換聯盟 */
    const key=Object.keys(LEAGUES).find(x=>LEAGUES[x].short===cur.lg);
    const pk=Object.keys(LEAGUES).find(x=>LEAGUES[x].short===prev.lg);
    if(!key||!pk||LEAGUES[key].tier<=LEAGUES[pk].tier) continue;  /* 只看往上爬 */
    /* NCAA→G League 是「投 NBA 選秀落選、簽雙向合約」那條路，
       本來就不看綜合門檻——它是失敗的結果，不是旅外報價。 */
    if(pk==='ncaa'&&(key==='gleague'||key==='nba')) continue;
    const rule=OVERSEAS.find(o=>o.lg===key);
    if(!rule) continue;
    entries++;
    const need=rule.ovr-BUZZ_MAX-DECLINE_SLACK;
    if(prev.ovr<need){ lowEntry++;
      if(!worst) worst=`${cur.lg} 門檻 ${rule.ovr}，進去前一季只有 ${prev.ovr}`; }
  }
}
say(lowEntry===0, `檢查 ${entries} 次往上跳聯盟，綜合不夠卻跳上去的有 ${lowEntry} 次`
  +(worst?`（例：${worst}）`:''));

console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ 全部通過'));
process.exit(fail?1:0);
