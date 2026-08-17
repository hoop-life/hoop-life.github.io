/* 生涯指數校準本體。
   參考分佈的定義（改了就要連 regress.js 的守門一起改，不然兩邊會各說各話）：
   N 局 × 5 個位置 × 三種分岔策略（一路衝／留在原地／一路保守），
   訓練強度、球季態度、事件選項都由決策種子隨機決定。
   這是「隨便玩」的分佈，不是「玩得好」的分佈——所以 P80 破萬不代表高手只有兩成破萬。 */
/* 預設值就是文件要求的 40000。以前預設 3000，而輸出還印著「貼回 hooplife.html」——
   照著跑一次就會拿到一張讓「史上第一人」稀有度翻倍的 LEGEND_SC（實測 0.89%→1.85%，
   表尾 1696 只是 3,000 局的樣本上限），而 regress ⑨F 是從表自己重建入選池，構造上抓不到。
   跑 40000 局約 61 秒，成本可以接受。 */
const N=parseInt(process.env.N||'40000',10);
const N_MIN=20000;

/* 兩個自動玩家（autoPlay 隨手玩／autoPlaySerious 認真玩）在 autoplay-body.js，
   calib.js 會把它串在這個檔前面。它們以前在這裡、stats-body.js、audit.js 各有一份抄本。

   名次曲線的參考分佈要用「兩種玩法合併」，不能只用隨手玩：
   榜首的競爭者幾乎清一色來自認真玩的那一端（隨手玩上限 1,281、認真玩 2,042），
   只拿隨手玩去定 LEGEND_TOP，認真玩的人會整團擠在第 1 名。
   入選門檻（LEGEND_IN）仍然只看隨手玩，因為它定義的是「入選率 0.5%」那個承諾。 */

const q=(a,p)=>{ const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(s.length*p))]; };
const positions=Object.keys(POS);
const rows=[],lgAll=[];
for(let i=0;i<N;i++){
  const g=autoPlay('L'+i,'D'+(i%7),
    {pos:positions[i%5],branchMode:['first','stay','last'][i%3]});
  const s=g.summary;
  rows.push({ci:s.ci,hof:s.hof,grade:s.grade.g,hofIn:s.hofIn,money:s.money,legend:s.legend,lrank:s.legendRank,
             pts:s.pro.pts,val:s.pro.val,champs:s.champs,
             mvp:g.awards.filter(a=>a.t.indexOf('年度 MVP')>=0).length});
  lgAll.push(s.legend);
  lgAll.push(autoPlaySerious('S'+i,i%5,STYLE_KEYS[i%STYLE_KEYS.length]).summary.legend);
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
const newK=Math.round(CI_K*10000/p80*1000)/1000;
const kMoved=Math.abs(newK-CI_K)/CI_K>0.005;
console.log('\n──── '+(N<N_MIN
  ? `樣本只有 ${N} 局（低於 ${N_MIN}），下面的數字不要貼回去 ────`
  : '貼回 hooplife.html ────'));
if(N<N_MIN) console.log(`  ⚠ 名次表（LEGEND_SC）的表尾就是樣本上限，小樣本會讓「史上第一人」的稀有度翻倍。\n`
  +`  要拿可以貼的數字請跑：N=40000 npm run calib`);
console.log('const CI_K='+newK.toFixed(3)+';   /* 目前 '+CI_K+'，實測 P80='+p80+' */');
/* 下面那張 CI_PCTL 是用「當下引擎裡的舊 CI_K」算出來的。K 沒動的時候兩行可以一起貼，
   K 動了就不行——表會整條等比例偏掉，而 regress ⑨E 的容差抓不到那種整體位移。 */
if(kMoved) console.log(`  ⚠ CI_K 要從 ${CI_K} 改成 ${newK.toFixed(3)}（差 ${((newK/CI_K-1)*100).toFixed(1)}%）。\n`
  +`  下面那張 CI_PCTL 還是用舊的 ${CI_K} 算的，兩行一起貼會讓 PR 整條偏掉。\n`
  +`  正確順序：先貼 CI_K → 再跑一次 calib → 才貼 CI_PCTL。`);
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
console.log('\n歷史 75 大分數（隨手玩）：'+[.5,.9,.95,.99,.995,.999].map(p=>'p'+(p*100)+' '+lp(p)).join('  ')+'  max '+ls[ls.length-1]);
const inN=rows.filter(r=>r.lrank>0).length;
console.log('隨手玩入選 '+inN+'／'+N+'（'+(inN/N*100).toFixed(2)+'%，目標 0.5%）');

/* ── 名次曲線：兩種玩法合併，反解出「第 1 名剛好 1.5% 的入選者」的指數 ── */
{
  const IN=lp(0.995);                               /* 入選門檻＝隨手玩的 p99.5 */
  const pool=lgAll.filter(v=>v>=IN).sort((a,b)=>a-b);
  const TOP=pool.length?pool[pool.length-1]:IN+1;
  /* 第 1 名的條件：round(75 − 74·x^γ) ≤ 1 ⟺ x^γ > 73.5/74。
     令 s* ＝ 入選池的 p98.5（1.5% 的人在它之上），x* ＝ (s*−IN)/(TOP−IN），
     則 γ ＝ ln(73.5/74) / ln(x*)。 */
  /* 名次 ＝ 在入選池裡的百分位，跟 CI 的 ciRank 完全同一套做法：
     量一張分位表出來，名次由 rank ＝ round(75.5 − 75·F) 決定。
     這樣每一個名次剛好各分到 1/75 ＝ 1.33% 的入選者，第 1 名也是 1.33%——
     不需要湊參數，是這個構造本身保證的。
     解析曲線做不到這件事：入選池的中位數只在 (max−IN) 的 9% 處，重尾到任何
     x^γ 都無法同時「p98.5 才進第 1 名」與「中位數落在第 38 名附近」。 */
  const AT=[0,.05,.10,.20,.30,.40,.50,.60,.70,.80,.875,.925,.955,.975,.987,1];
  const SC=AT.map(p=>pool[Math.min(pool.length-1,Math.floor(pool.length*p))]);
  SC[SC.length-1]=TOP;
  console.log('\n入選池（兩種玩法合併）'+pool.length+' 人：'
    +[.25,.5,.75,.9,.985].map(p=>'p'+(p*100)+' '+pool[Math.floor(pool.length*p)]).join('  ')+'  max '+TOP);
  const rk=s=>{ if(s<IN) return 0;
    let F=1;
    for(let i=1;i<SC.length;i++){ if(s<=SC[i]){
      const span=SC[i]-SC[i-1];
      F=AT[i-1]+(span>0?(s-SC[i-1])/span*(AT[i]-AT[i-1]):0); break; } }
    return Math.min(75,Math.max(1,Math.round(75.5-75*F))); };
  const ranks=pool.map(rk);
  const r1=ranks.filter(r=>r===1).length;
  const band=b=>ranks.filter(r=>r>=b[0]&&r<=b[1]).length;
  console.log('  驗算：第 1 名 '+r1+' 人（'+(r1/pool.length*100).toFixed(2)+'%，目標 1～2%）　'
    +'1–10 名 '+(band([1,10])/pool.length*100).toFixed(1)+'%　'
    +'11–25 名 '+(band([11,25])/pool.length*100).toFixed(1)+'%　'
    +'26–50 名 '+(band([26,50])/pool.length*100).toFixed(1)+'%　'
    +'51–75 名 '+(band([51,75])/pool.length*100).toFixed(1)+'%');
  console.log('const LEGEND_IN='+IN+';');
  console.log('const LEGEND_PR=['+AT.join(',')+'];');
  console.log('const LEGEND_SC=['+SC.join(',')+'];');
}
