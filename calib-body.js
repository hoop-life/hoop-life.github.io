/* 生涯指數校準本體。
   參考分佈的定義（改了就要連 regress.js 的守門一起改，不然兩邊會各說各話）：
   N 局 × 5 個位置 × 三種分岔策略（一路衝／留在原地／一路保守），
   訓練強度、球季態度、事件選項都由決策種子隨機決定。
   這是「隨便玩」的分佈，不是「玩得好」的分佈——所以 P80 破萬不代表高手只有兩成破萬。 */
const N=parseInt(process.env.N||'3000',10);

function autoPlay(seed,dseed,opt){
  opt=opt||{};
  const drng=mulberry32(cyrb128('dec|'+dseed));
  const g=createGame(seed,'測試員',opt.pos||'SF',opt.style);
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>400) throw new Error('卡關');
    const p=g.pending;
    if(p.type==='train'){
      const it=['push','normal','safe'][Math.floor(drng()*3)];
      const att=['allin','steady','manage'][Math.floor(drng()*3)];
      const pts=trainPoints(g,it),alloc={},w=POS[g.pos].w;
      for(let i=0;i<pts;i++){ let b=null,bs=-1;
        for(const at of ATTRS){ if(g.a[at.k]>=g.pot[at.k])continue;
          const s=(w[at.k]||0.01)*gainFor(g,at.k,alloc[at.k]||0); if(s>bs){bs=s;b=at.k;} }
        if(!b)break; alloc[b]=(alloc[b]||0)+1; }
      applyTrain(g,it,alloc,att);
    }
    else if(p.type==='event') applyEvent(g,Math.floor(drng()*p.opts.length));
    else if(p.type==='result') advance(g);
    else if(p.type==='branch'){
      let i=0;
      if(opt.branchMode==='stay') p.opts.forEach((o,k)=>{ if(o.act==='stay'||(o.act||'').indexOf('move:')===0) i=k; });
      else if(opt.branchMode==='last') i=p.opts.length-1;
      applyBranch(g,i);
    }
    else break;
  }
  return g;
}

const q=(a,p)=>{ const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(s.length*p))]; };
const positions=Object.keys(POS);
const rows=[];
for(let i=0;i<N;i++){
  const g=autoPlay('L'+i,'D'+(i%7),
    {pos:positions[i%5],branchMode:['first','stay','last'][i%3]});
  const s=g.summary;
  rows.push({ci:s.ci,hof:s.hof,grade:s.grade.g,hofIn:s.hofIn,money:s.money,legend:s.legend,lrank:s.legendRank,
             pts:s.pro.pts,val:s.pro.val,champs:s.champs,
             mvp:g.awards.filter(a=>a.t.indexOf('年度 MVP')>=0).length});
}
const cis=rows.map(r=>r.ci);
const gr={}; rows.forEach(r=>gr[r.grade]=(gr[r.grade]||0)+1);

console.log(`\n樣本 ${N} 局`);
console.log('評價分佈：','SABCDEF'.split('').map(k=>`${k}:${((gr[k]||0)/N*100).toFixed(1)}%`).join('  '));
console.log('名人堂率：'+(rows.filter(r=>r.hofIn).length/N*100).toFixed(1)+'%');
console.log('\n生涯指數：'+[.1,.25,.5,.75,.8,.9,.95,.99].map(p=>`p${p*100} ${q(cis,p)}`).join('  ')
  +'  max '+Math.max(...cis));
console.log('破萬比例：'+(cis.filter(v=>v>=10000).length/N*100).toFixed(1)+'%（目標 20%）');

const p80=q(cis,.8);
console.log('\n──── 貼回 hooplife.html ────');
console.log('const CI_K='+(Math.round(CI_K*10000/p80*1000)/1000).toFixed(3)+';   /* 目前 '+CI_K+'，實測 P80='+p80+' */');
/* 分位點跟引擎的 CI_PR_AT 必須一模一樣：等距到 p95，末段加密到 96/97/98/99 */
const PR_AT=[0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,96,97,98,99];
const tbl=PR_AT.map(p=>q(cis,p/100));
console.log('const CI_PR_AT=['+PR_AT.join(',')+'];');
console.log('const CI_PCTL=['+tbl.join(',')+'];');
const hs=rows.map(r=>r.hof).sort((a,b)=>a-b);
const pc=p=>hs[Math.floor(hs.length*p)];
console.log('\nHOF 分數分位：'+[.4,.45,.5,.6,.65,.7,.75,.8,.85,.9,.95,.98,.99].map(p=>'p'+(p*100)+' '+pc(p)).join('  '));
const ls=rows.map(r=>r.legend).sort((a,b)=>a-b);
const lp=p=>ls[Math.floor(ls.length*p)];
console.log('\n歷史 75 大分數：'+[.5,.9,.95,.99,.995,.999].map(p=>'p'+(p*100)+' '+lp(p)).join('  ')+'  max '+ls[ls.length-1]);
const inN=rows.filter(r=>r.lrank>0).length;
console.log('入選 '+inN+'／'+N+'（'+(inN/N*100).toFixed(2)+'%）　名次分佈：'
  +rows.filter(r=>r.lrank>0).map(r=>r.lrank).sort((a,b)=>a-b).join(','));
console.log('建議：LEGEND_IN='+lp(0.995)+'　LEGEND_TOP='+ls[ls.length-1]);
