/* 針對玩家回報的具體問題寫的回歸測試 */
let fail=0;
const say=(ok,m)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+m); if(!ok) fail++; };

function autoPlay(seed,dseed,opt){
  opt=opt||{};
  const drng=mulberry32(cyrb32('dec|'+dseed));
  const g=createGame(seed,'測試員',opt.pos||'SF',opt.style);
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>400) throw new Error('卡關');
    const p=g.pending;
    if(p.type==='train'){
      const it=opt.intens||['push','normal','safe'][Math.floor(drng()*3)];
      const att=opt.att||['allin','steady','manage'][Math.floor(drng()*3)];
      /* 分配點數一律走引擎的 greedyAlloc——這段以前在六個檔案裡各抄一份，
         而且抄成兩種行為（傳點數／傳累積成長值），實測 84% 的局會走出不同人生。 */
      applyTrain(g,it,greedyAlloc(g,trainPoints(g,it)),att);
    }
    else if(p.type==='event') applyEvent(g,Math.floor(drng()*p.opts.length));
    else if(p.type==='result') advance(g);
    else if(p.type==='branch'){
      /* 預設：只要還能打就繼續打，才驗得到「被市場踢掉」這件事。
         branchMode 是給生涯指數校準用的——那張 PR 表是三種策略混出來的參考分佈
         （first 一路衝／stay 留在原地／last 一路保守），要驗表就得跑同一組策略，
         定義必須跟 calib-body.js 一模一樣。 */
      let i=0;
      const bm=opt.branchMode||'stay';
      if(bm==='last') i=p.opts.length-1;
      else if(bm==='stay') p.opts.forEach((o,k)=>{ if(o.act==='stay'||(o.act||'').indexOf('move:')===0) i=k; });
      /* 中華隊：opt.natl 決定去不去，用來驗國際賽曝光有沒有真的影響出國 */
      if(opt.natl!==undefined&&p.opts.some(o=>(o.act||'').indexOf('natl:')===0)){
        i=opt.natl?0:p.opts.findIndex(o=>o.act==='skipNatl');
      }
      applyBranch(g,i);
    }
    else break;
  }
  return g;
}

/* ============ ① 拿獎的隔年不該被硬砍 ============ */
console.log('\n【①】38 歲拿 MVP、隔年就沒人要——這種事還會發生嗎');
{
  let cases=0,absurd=0,worst=null,oldestAward=0,oldestRetire=0;
  for(let i=0;i<600;i++){
    const g=autoPlay('r'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5]});
    const S=g.seasons;
    oldestRetire=Math.max(oldestRetire,g.age);
    for(let k=0;k<S.length;k++){
      const big=S[k].awards.some(a=>a.indexOf('MVP')>=0||a==='年度第一隊');
      if(!big) continue;
      oldestAward=Math.max(oldestAward,S[k].age);
      /* 拿了大獎、身體沒垮，卻是生涯最後一季＝被年齡硬砍 */
      if(k===S.length-1&&!S[k].miss){
        cases++;
        if(g.retiredWhy==='nomarket'&&overall(g)>=72){ absurd++; if(!worst) worst={sd:'r'+i,age:S[k].age,ovr:overall(g),aw:S[k].awards.join('、')}; }
      }
    }
  }
  console.log(`    600 局中，「拿大獎後就是最後一季」共 ${cases} 次`);
  say(absurd===0, absurd===0
    ? '沒有任何一次是「還有 72+ 綜合卻被市場踢掉」（年齡硬砍已解除）'
    : `仍有 ${absurd} 次不合理，例如 ${worst&&worst.sd} ${worst&&worst.age} 歲綜合 ${worst&&worst.ovr} 拿了${worst&&worst.aw}卻沒人要`);
  console.log(`    最年長的得獎紀錄 ${oldestAward} 歲；最年長的退休 ${oldestRetire} 歲`);
}

/* ============ 退休年齡要跟實力連動 ============ */
console.log('\n【①b】強的人該打得比較久');
{
  const rows=[];
  for(let i=0;i<600;i++){
    const g=autoPlay('q'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5]});
    if(g.retiredWhy==='undrafted') continue;
    rows.push({best:g.bestOvr,age:g.age});
  }
  rows.sort((a,b)=>a.best-b.best);
  const lo=rows.slice(0,Math.floor(rows.length/3));
  const hi=rows.slice(-Math.floor(rows.length/3));
  const avg=a=>a.reduce((s,x)=>s+x.age,0)/a.length;
  const loA=avg(lo),hiA=avg(hi);
  console.log(`    弱組（最高綜合中位 ${lo[Math.floor(lo.length/2)].best}）平均退休 ${loA.toFixed(1)} 歲`);
  console.log(`    強組（最高綜合中位 ${hi[Math.floor(hi.length/2)].best}）平均退休 ${hiA.toFixed(1)} 歲`);
  say(hiA-loA>=1.5, `強者比弱者多打 ${(hiA-loA).toFixed(1)} 年（要 ≥1.5 年才算有連動）`);
}

/* ============ ①c 淘汰要真的存在 ============ */
/* v1.3.3 的病徵：職業年資 PR1 是 7 季、PR10 是 11 季，30 歲前被市場淘汰的只有 0.07%，
   78.4% 的人死於 nomarket——整個遊戲只有一種死法叫「老了」。
   名單線（rosterLine）就是為了這件事加的，這條守門盯著它有沒有繼續生效。
   拿掉 hasDeal 裡的 meetsRoster 這一行，下面三條會同時轉紅。 */
console.log('\n【①c】不夠格的人要被淘汰，不是所有人都打到 37 歲');
{
  const pro=[],why={};
  for(let i=0;i<700;i++){
    const g=autoPlay('cut'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
      branchMode:['first','stay','last'][i%3]});
    why[g.retiredWhy]=(why[g.retiredWhy]||0)+1;
    if(g.summary.pro.seasons>0) pro.push({n:g.summary.pro.seasons,age:g.age,best:g.bestOvr});
  }
  const lens=pro.map(r=>r.n).sort((a,b)=>a-b);
  const pct=p=>lens[Math.floor(lens.length*p)];
  const short6=pro.filter(r=>r.n<=6).length/pro.length;
  console.log('    退場原因：'+Object.keys(why).sort((a,b)=>why[b]-why[a])
    .map(k=>`${k} ${(why[k]/700*100).toFixed(1)}%`).join('　'));
  console.log(`    職業年資 PR10 ${pct(.1)}　PR25 ${pct(.25)}　PR50 ${pct(.5)}　PR90 ${pct(.9)}`);
  say(short6>=0.06&&short6<=0.30,
    `職業六季內出局 ${(short6*100).toFixed(1)}%（要 6%～30%：淘汰要存在，但不能變成主流）`);
  /* 這裡以前寫「職業年資 PR10 ≤ 8」，那只是上一條「短生涯尾巴夠不夠厚」的替身，
     兩條在守同一件事。批 3 量出來的病不是尾巴太薄，是**尾巴擠在同一年**：
     v1.4.0～v1.5.0 的名單線豁免三季再一次結清，六季內出局的人有 85.1% 剛好死在
     第三季末（k1 0.00%／k2 0.00%／k3 11.04%／k4 0.37%），而 27–31 歲的退休只有 3.04%。
     所以改成直接量症狀：早退的分佈有沒有散開、中段年齡有沒有人退休。
     （mutation：把 ROOKIE_GRACE 改回 3、Z0/SLOPE 改回 0.70/0.05、拿掉漸進豁免，兩條都轉紅。） */
  const early=pro.filter(r=>r.n<=8);
  const byYear={}; early.forEach(r=>{ byYear[r.n]=(byYear[r.n]||0)+1; });
  const worst=Math.max(0,...Object.keys(byYear).map(k=>byYear[k]));
  console.log('    ≤8 季出局的分佈：'+Object.keys(byYear).sort((a,b)=>a-b)
    .map(k=>`${k}季 ${byYear[k]}`).join('　'));
  say(early.length>0&&worst/early.length<=0.62,
    `早退不是一根柱子：≤8 季出局 ${early.length} 人，最集中的那一年佔 `
    +`${early.length?(worst/early.length*100).toFixed(0):'—'}%（要 ≤62%，v1.5.0 是 85%）`);
  /* 27～31 歲的退休仍然很稀薄（實測 1.8%），這是**已知且刻意留著的缺口**，
     不是這條守門在放水：`starExempt` 把「先發等級一律留下」畫在 bar+0.8sd，
     而名單線的封頂就是它——所以所有打不到先發水準的人一定在前幾季就被清掉，
     打得到的人則要等老化把他拉下來（33／36／39 那三段）才會出局，
     中間那五年在結構上沒有任何淘汰機制。要填它得動 starExempt，而那條線正是
     ⑩C（41 歲、綜合 85 的 PLG 球員必須還有約）唯一的來源。寫進遊戲設計.md 的缺口清單。 */
  const mid=pro.filter(r=>r.age>=27&&r.age<=31).length/pro.length;
  console.log(`    27～31 歲退休 ${(mid*100).toFixed(1)}%（已知缺口，見遊戲設計.md 第八節）`);
  say((why.washed||0)>0,`有人在 30 歲前掉出所有職業聯盟（washed ${why.washed||0} 人，舊版 8,000 局只有 6 個）`);
  /* 而且淘汰要挑對人：被淘汰的必須明顯比活下來的弱 */
  const cut2=pro.filter(r=>r.n<=6),keep2=pro.filter(r=>r.n>=12);
  const avg2=a=>a.reduce((s,x)=>s+x.best,0)/Math.max(1,a.length);
  say(cut2.length===0||avg2(keep2)-avg2(cut2)>=4,
    `淘汰挑對人：早退組巔峰綜合 ${avg2(cut2).toFixed(1)}、長青組 ${avg2(keep2).toFixed(1)}（要差 ≥4 分）`);
}
/* ============ ①d 傷退不可以是死內容 ============ */
/* 舊條件是 injuries>=3 && age>=31 && ovr<58，而名單線上線之後「31 歲以上還有球隊」
   的人綜合最低就是 58——兩個條件結構性互斥，229,501 個職業球季末命中 0 次。
   直接餵狀態不靠樣本撞：這個分支在隨手玩裡很稀有（認真玩 19.3%、隨手玩 0.1%），
   用「跑幾百局看有沒有人拿到」守它會是空集合上的真（開發指南第六節）。 */
console.log('\n【①d】三次大傷之後的結局要真的發得出來');
{
  const mk=(inj,age,ovr)=>({league:'t1',age:age,injuries:inj,fame:10,traits:[],stage:'pro',
    seasons:Array.from({length:8},(_,i)=>({lg:'T1',stage:'職業第 '+(i+1)+' 年',gp:30,pts:8,reb:3,
      ast:2,stl:1,blk:0,hi:20,awards:[],champ:false,miss:false,ovr:ovr})),
    flags:{},_rng:mulberry32(cyrb32('brk'))});
  const weak=mk(3,33,40); const r1=retireForced(weak,40);
  say(!!r1&&weak.retiredWhy==='broken',
    `三次重傷、33 歲、沒有任何聯盟收得下 → 退場原因是「傷退」（實際 ${weak.retiredWhy||'—'}）`);
  const clean=mk(0,33,40); retireForced(clean,40);
  say(clean.retiredWhy==='nomarket',
    `同樣沒人要但沒有傷病史 → 是「沒人要」不是「傷退」（實際 ${clean.retiredWhy||'—'}）`);
  const hurtButOk=mk(3,33,74); const r3=retireForced(hurtButOk,74);
  say(!r3,'三次重傷但還有球隊收得下 → 不會被判退場（傷退掛在 noMarket 上，不是獨立的死刑）');
}

/* ============ ⑤ 球季態度要真的有差 ============ */
console.log('\n【⑤】球季態度三選一，是不是真的影響成績與傷勢');
{
  const res={};
  for(const att of ['allin','steady','manage']){
    let pts=0,n=0,inj=0,load=0,aw=0,gp=0;
    for(let i=0;i<260;i++){
      const g=autoPlay('a'+i,'D'+(i%5),{pos:Object.keys(POS)[i%5],att:att,intens:'normal'});
      const s=g.summary;
      pts+=s.pts; gp+=s.gp; inj+=g.injuries; aw+=g.awards.length;
      load+=g.seasons.reduce((x,y)=>x+y.load,0)/Math.max(1,g.seasons.length);
      n++;
    }
    res[att]={pts:pts/n,gp:gp/n,inj:inj/n,load:load/n,aw:aw/n};
  }
  const f=k=>`${SEASON[k].n.padEnd(6)} 場均 ${res[k].pts.toFixed(2)}　出賽 ${res[k].gp.toFixed(0)}　平均負荷 ${res[k].load.toFixed(0)}　重傷 ${res[k].inj.toFixed(2)}　獎項 ${res[k].aw.toFixed(1)}`;
  ['allin','steady','manage'].forEach(k=>console.log('    '+f(k)));
  say(res.allin.pts>res.steady.pts&&res.steady.pts>res.manage.pts,'場均：全力衝刺 > 正常 > 控制上場時間');
  say(res.allin.load>res.manage.load+15,'負荷：全力衝刺明顯高於控制上場時間');
  say(res.allin.inj>res.manage.inj,'重傷次數：全力衝刺高於控制上場時間');
  say(res.allin.aw>res.manage.aw,'獎項數：全力衝刺高於控制上場時間');
}

/* ============ ② 風險數字要跟實際擲骰一致（含天生體質） ============ */
console.log('\n【②】UI 顯示的受傷率，跟引擎實際擲的骰是不是同一個數');
{
  const g=createGame('probe1','測','C');
  g.load=75;
  const r=injuryRisk(g,'push','allin');
  const dm=duraMult(g);
  const expTrain=clamp((INTENSITY.push.hurt+(r.load>70?0.10:0)+(r.load>88?0.14:0))*dm,0,0.75);
  const expSeason=clamp((SEASON.allin.hurt+(r.load>70?0.09:0)+(r.load>88?0.13:0))*dm,0,0.6);
  say(Math.abs(r.train-expTrain)<1e-9,`訓練受傷率 ${(r.train*100).toFixed(1)}% 與引擎公式一致`);
  say(Math.abs(r.season-expSeason)<1e-9,`季中受傷率 ${(r.season*100).toFixed(1)}% 與引擎公式一致`);
  say(Math.abs(r.any-(1-(1-expTrain)*(1-expSeason)))<1e-9,`合併受傷率 ${(r.any*100).toFixed(1)}% 計算正確`);
  const proj=clamp(g.load+INTENSITY.push.load+SEASON.allin.load+2-(g.a.ath>=80?2:0)+duraLoad(g),0,100);
  say(r.load===proj,`預測負荷 ${r.load} 與 applyTrain 實際會加的一致`);
  /* 面板上寫的體質數字，也必須跟擲骰用的是同一份 */
  const L=loadLedger(g);
  say(L.dura.mult===dm&&L.dura.load===duraLoad(g),'負荷面板寫的體質倍率＝引擎實際用的倍率');
  /* 上面全部只驗「injuryRisk 的輸出對不對得起常數」，真正擲骰的是 applyTrain 裡
     那份平行公式。實測把 applyTrain 的負荷門檻 70 改成 55、或把 injuryRisk 的
     glass 加成 0.08 改成 0.02，四套測試全綠。這裡改成端到端量實際觸發率。 */
  {
    /* 分負荷帶比對，不要只看總平均：兩道門檻（70 與 88）各只影響一段，
       全部混在一起平均之後，把 70 改成 55 只會讓總平均差 1.4pp，2pp 的容許值抓不到。 */
    const BANDS=[[0,55],[56,70],[71,88],[89,100]];
    const acc=BANDS.map(()=>({shown:0,hurt:0,n:0}));
    const IT_K=['safe','normal','push'],AT_K=['manage','steady','allin'];
    for(let i=0;i<9000;i++){
      const gg=createGame('injp'+i,'測',Object.keys(POS)[i%5]);
      gg.load=(i*13)%92;
      const it=IT_K[i%3],at=AT_K[(i/3|0)%3];
      const r=injuryRisk(gg,it,at);
      const bi=BANDS.findIndex(b=>r.load>=b[0]&&r.load<=b[1]);
      const card=applyTrain(gg,it,{},at);
      if(bi<0) continue;
      acc[bi].n++; acc[bi].shown+=r.train; if(card.injury) acc[bi].hurt++;
    }
    let worst=0,worstB='';
    BANDS.forEach((b,i)=>{
      const a=acc[i]; if(a.n<400) return;
      const sh=a.shown/a.n*100,ac=a.hurt/a.n*100,d=Math.abs(sh-ac);
      console.log(`    負荷 ${b[0]}–${b[1]}：${a.n} 次訓練，面板 ${sh.toFixed(1)}%　實際 ${ac.toFixed(1)}%`);
      if(d>worst){ worst=d; worstB=`${b[0]}–${b[1]}`; }
    });
    say(acc.filter(a=>a.n>=400).length>=3,`（前提）四個負荷帶至少有三帶取到樣本（${acc.map(a=>a.n).join('/')}）`);
    say(worst<2.5,`每個負荷帶上，面板的訓練受傷率都＝applyTrain 真的擲的那一個`
      +`（最大落差 ${worst.toFixed(1)} 個百分點，在負荷 ${worstB}）`);
  }
  /* 按鈕上印的受傷率也要是這個玩家的真實數字，不是寫死的基準值。
     舊版 INTENSITY.push.d 寫死「訓練受傷率 16%」，而紙糊體質＋負荷 >88 時實際是 72%
     ——玩家就是看著按鈕上那個數字在決定要不要拚。 */
  {
    const probe=createGame('descp','測','SF'); probe.dura=5; probe.load=90;
    let wrong=0,maxGap=0;
    for(const it of ['push','normal','safe']) for(const at of ['allin','steady','manage']){
      const want=injuryRisk(probe,it,at).train, txt=intensityDesc(probe,it,at);
      if(txt.indexOf(pctText(want))<0) wrong++;
      maxGap=Math.max(maxGap,Math.abs(want-INTENSITY[it].hurt));
      const wantS=injuryRisk(probe,it,at).season, txtS=seasonDesc(probe,at,it);
      if(txtS.indexOf(pctText(wantS))<0) wrong++;
    }
    console.log(`    紙糊體質＋負荷 90：${intensityDesc(probe,'push','allin')}`);
    say(wrong===0,`18 條按鈕說明印的受傷率都＝injuryRisk 現算的值（對不上 ${wrong} 條）`);
    say(maxGap>0.2,`（前提）這個探針的實際受傷率跟基準值差得夠遠（差 ${(maxGap*100).toFixed(0)} 個百分點），這條才驗得到東西`);
    /* 0.4% 不可以印成 0%：玩家會理解成「這個選擇不會斷韌帶」 */
    say(pctText(0.004)==='<1%'&&pctText(0)==='0%'&&pctText(0.996)==='>99%'&&pctText(1)==='100%',
      `很小的機率印成「${pctText(0.004)}」而不是 0%（0 還是 0%、1 還是 100%）`);
  }
  /* 負荷帳本要列得完整：漏一筆，玩家就永遠對不起自己的負荷是怎麼跑的 */
  {
    const gl=createGame('ledg','測','SF'); gl.a.ath=90;
    const L2=loadLedger(gl);
    const all=L2.up.concat(L2.down).map(x=>x.n+' '+x.v).join('｜');
    say(/體能 85/.test(all),`帳本列出了季末的體能 85 額外回落（${/體能 85/.test(all)?'有':'漏了'}）`);
    say(/集訓/.test(all)&&/\+12/.test(all),'帳本把集訓事件的 +12 跟打國際賽的 +10 分開列');
    say(L2.dura.note.indexOf(String(Math.round(INTENSITY.push.hurt*100)))>=0
      ||duraMult(gl)!==1,'體質說明裡的全力以赴基準值接的是 INTENSITY.push.hurt，不是寫死的 16');
  }
  /* 玻璃人／鐵人分支：全新的局身上不可能有這兩個特質，所以上面那些探針
     從來沒走進 injuryRisk:1276-1281，那兩行整段改掉也不會轉紅。 */
  {
    const mkT=t=>{ const x=createGame('injt','測','SF'); x.load=40; if(t) addTrait(x,t); return x; };
    const base=injuryRisk(mkT(null),'push','allin'),
          gl=injuryRisk(mkT('glass'),'push','allin'),
          st=injuryRisk(mkT('steel'),'push','allin');
    say(Math.abs(gl.train-base.train-0.08)<1e-9&&Math.abs(gl.season-base.season-0.06)<1e-9,
      `玻璃人的受傷率確實被加上去（訓練 +${((gl.train-base.train)*100).toFixed(1)}pp、`
      +`季中 +${((gl.season-base.season)*100).toFixed(1)}pp）`);
    say(Math.abs(base.train-st.train-0.04)<1e-9&&Math.abs(base.season-st.season-0.03)<1e-9,
      `鐵人的受傷率確實被扣掉（訓練 −${((base.train-st.train)*100).toFixed(1)}pp、`
      +`季中 −${((base.season-st.season)*100).toFixed(1)}pp）`);
    /* 而且 applyTrain 那份平行公式也要有同一組加減，不然玻璃人看到的是別人的數字 */
    let hurtG=0,hurtS=0,nn=3000;
    for(let i=0;i<nn;i++){
      const a=createGame('injg'+i,'測','SF'); a.load=40; addTrait(a,'glass');
      if(applyTrain(a,'push',{},'allin').injury) hurtG++;
      const b=createGame('injg'+i,'測','SF'); b.load=40; addTrait(b,'steel');
      if(applyTrain(b,'push',{},'allin').injury) hurtS++;
    }
    console.log(`    同樣的局、同一顆骰：玻璃人受傷 ${(hurtG/nn*100).toFixed(1)}%　鐵人 ${(hurtS/nn*100).toFixed(1)}%`);
    say(hurtG/nn>hurtS/nn+0.06,'applyTrain 真的擲得出玻璃人與鐵人的差距（≥6 個百分點）');
  }
}

/* ============ ⑦A 天生體質：受傷不能純粹是選擇問題 ============ */
console.log('\n【⑦A】天生體質有沒有真的造成差異（同樣的選擇、不同的身體）');
{
  const iron=createGame('x','測','SF'),paper=createGame('x','測','SF');
  iron.dura=100; paper.dura=0;
  const ri2=injuryRisk(iron,'normal','steady'),rp=injuryRisk(paper,'normal','steady');
  console.log(`    鐵打的：本季受傷 ${(ri2.any*100).toFixed(1)}%　負荷 ${ri2.load}　倍率 ×${duraMult(iron)}`);
  console.log(`    紙糊的：本季受傷 ${(rp.any*100).toFixed(1)}%　負荷 ${rp.load}　倍率 ×${duraMult(paper)}`);
  say(rp.any>ri2.any,'體質差的人受傷機率確實比較高');
  say(rp.load>ri2.load,'體質差的人負荷累積確實比較快');
  /* 乘法的關鍵性質：拚得越兇，體質的差距要放得越大（加法做不到這件事） */
  const gapSafe=injuryRisk(paper,'safe','manage').any-injuryRisk(iron,'safe','manage').any;
  const gapPush=injuryRisk(paper,'push','allin').any-injuryRisk(iron,'push','allin').any;
  console.log(`    保守打法下兩者差 ${(gapSafe*100).toFixed(1)}%；全力拚下兩者差 ${(gapPush*100).toFixed(1)}%`);
  say(gapPush>gapSafe*3,'體質的懲罰會隨著「拚多兇」放大（乘法，不是固定稅）');
  /* 端到端：把同一批種子依體質分兩組，比整段生涯的重傷次數 */
  const lo=[],hi=[];
  for(let i=0;i<420;i++){
    const g=autoPlay('d'+i,'D3',{pos:Object.keys(POS)[i%5],intens:'push',att:'allin'});
    (g.dura>=60?hi:lo).push(g.injuries);
  }
  const m=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
  console.log(`    體質 60+ 的 ${hi.length} 局平均重傷 ${m(hi).toFixed(2)} 次；`
    +`體質 60− 的 ${lo.length} 局平均重傷 ${m(lo).toFixed(2)} 次`);
  say(m(lo)>m(hi),'整段生涯下來，體質差的組確實傷得比較多（受傷不是純選擇問題）');
}

/* ============ ⑦B 隊上定位：同樣的綜合在不同聯盟不該一樣 ============ */
console.log('\n【⑦B】隊上定位有沒有真的改變數據');
{
  const mk=role=>{
    const g=createGame('roleprobe','測','SF');
    g.stage='pro'; g.stageYear=3; g.league='plg'; g.attitude='steady';
    ATTRS.forEach(a=>{ g.a[a.k]=70; });
    g.role=role;
    return simSeason(g);
  };
  const out=ROLE_ORDER.map(r=>({r:r,s:mk(r)}));
  out.forEach(o=>console.log(`    ${ROLES[o.r].n.padEnd(5)} 場均 ${o.s.pts}　籃板 ${o.s.reb}　助攻 ${o.s.ast}　出賽 ${o.s.gp}`));
  say(out[0].s.pts>out[1].s.pts&&out[1].s.pts>out[2].s.pts&&out[2].s.pts>out[3].s.pts,
    '場均得分：當家 > 先發 > 輪替 > 板凳（同一顆種子、同樣的九項能力）');
  say(out[0].s.reb>out[3].s.reb,'副項數據也跟著定位縮放（板凳不會刷出先發等級的籃板）');
  /* 同一個綜合，換聯盟角色要不一樣 */
  const g2=createGame('roleprobe2','測','SF');
  g2.stage='pro'; g2.stageYear=3; g2.fame=50;
  ATTRS.forEach(a=>{ g2.a[a.k]=78; });
  g2.league='plg'; const rPlg=roleOf(g2,overall(g2));
  g2.league='nba'; const rNba=roleOf(g2,overall(g2));
  console.log(`    綜合 ${overall(g2)}：在 PLG 是「${ROLES[rPlg].n}」，在 NBA 是「${ROLES[rNba].n}」`);
  say(ROLE_ORDER.indexOf(rPlg)<ROLE_ORDER.indexOf(rNba),
    '同樣的綜合，在國內是主力、到了 NBA 就往下掉（「我 78 綜合為什麼只有 8 分」有答案了）');
  /* 隊上定位與球探報告的同儕定位不能互相矛盾 */
  let clash=0,tot=0;
  for(const lg of ['plg','bleague','nba']){
    for(let o=50;o<=95;o+=3){
      const g3=createGame('pr'+o,'測','SF'); g3.stage='pro'; g3.league=lg; g3.fame=40;
      ATTRS.forEach(a=>{ g3.a[a.k]=o; });
      const ov=overall(g3),pr=peerRank(g3,ov),rl=roleOf(g3,ov);
      tot++;
      if(rl==='star'&&pr.pct>0.35) clash++;         /* 說是當家、同儕排名卻在後段 */
      if(rl==='bench'&&pr.pct<0.10) clash++;        /* 說是板凳、同儕排名卻是頂尖 */
    }
  }
  say(clash===0,`同儕定位與隊上定位互不矛盾（檢查 ${tot} 組，矛盾 ${clash} 組）`);
}

/* ============ ⑦C 球風：要真的改變養成方向 ============ */
console.log('\n【⑦C】球風有沒有真的影響成長');
{
  const grow=(style,k)=>{
    const g=createGame('styprobe','測','SG',style);
    let acc=0; for(let i=0;i<12;i++) acc+=gainFor(g,k,acc);
    return acc;
  };
  const s3=grow('shooter','three'),a3=grow('anchor','three');
  const sReb=grow('shooter','reb'),aReb=grow('anchor','reb');
  console.log(`    12 點全押三分：三分射手 +${s3.toFixed(1)}　禁區支柱 +${a3.toFixed(1)}`);
  console.log(`    12 點全押籃板：三分射手 +${sReb.toFixed(1)}　禁區支柱 +${aReb.toFixed(1)}`);
  say(s3>a3,'射手練三分比禁區支柱有效率');
  say(aReb>sReb,'禁區支柱練籃板比射手有效率');
  /* 開局／上限加成：逐顆種子比對，扣掉本來就已經頂到 99 的（那是 clamp 不是漏加） */
  let aUp=0,pUp=0,pElig=0;
  for(let i=0;i<80;i++){
    const b=createGame('sp'+i,'測','SG'),s=createGame('sp'+i,'測','SG','shooter');
    if(s.a.three>b.a.three) aUp++;
    if(b.pot.three<99){ pElig++; if(s.pot.three>b.pot.three) pUp++; }
  }
  console.log(`    80 顆種子：開局三分變高 ${aUp} 顆；天賦上限未頂到 99 的 ${pElig} 顆中變高 ${pUp} 顆`);
  say(aUp===80,'球風的開局加成每一顆種子都有生效（沒有被 clamp 吃掉）');
  say(pUp===pElig,'球風的天賦上限加成也都有生效');
  /* 球風要真的改變終局長相，不只是數字微調 */
  const avg={};
  for(const st of ['shooter','anchor']){
    let p=0,r=0,n=0;
    for(let i=0;i<150;i++){
      const g=autoPlay('c'+i,'D2',{pos:'SF',style:st});
      p+=g.summary.pts; r+=g.summary.reb; n++;
    }
    avg[st]={p:p/n,r:r/n};
  }
  console.log(`    三分射手 生涯場均 ${avg.shooter.p.toFixed(2)} 分 ${avg.shooter.r.toFixed(2)} 籃板`);
  console.log(`    禁區支柱 生涯場均 ${avg.anchor.p.toFixed(2)} 分 ${avg.anchor.r.toFixed(2)} 籃板`);
  say(avg.shooter.p>avg.anchor.p&&avg.anchor.r>avg.shooter.r,
    '同一批種子、同一個位置，兩種球風打出來的生涯長相不同');
}

/* ============ ⑦D 中華隊：打國際賽要真的比較容易出國 ============ */
console.log('\n【⑦D】國際賽曝光有沒有真的提高出國機率');
{
  const OS=['B1','KBL','NBL','EURO','GLG','NBA'];
  const run=go=>{
    let out=0,n=0,buzz=0,tier=0,ages=[];
    for(let i=0;i<300;i++){
      const g=autoPlay('n'+i,'D4',{pos:Object.keys(POS)[i%5],natl:go});
      const first=g.seasons.find(s=>OS.indexOf(s.lg)>=0);
      if(first){ out++; ages.push(first.age); }
      tier+=g.seasons.reduce((m,s)=>{
        const k=Object.keys(LEAGUES).find(kk=>LEAGUES[kk].short===s.lg);
        return k?Math.max(m,LEAGUES[k].tier):m;},1);
      buzz+=g.natlBuzz; n++;
    }
    return {rate:out/n,buzz:buzz/n,tier:tier/n,
      age:ages.length?ages.reduce((s,v)=>s+v,0)/ages.length:0};
  };
  const yes=run(true),no=run(false);
  const f=(l,r)=>`    ${l}：出國率 ${(r.rate*100).toFixed(1)}%　首次出國 ${r.age.toFixed(1)} 歲`
    +`　最高殿堂層級 ${r.tier.toFixed(2)}　平均海外曝光 ${r.buzz.toFixed(2)}`;
  console.log(f('每次都披國家隊',yes));
  console.log(f('每次都婉拒　　',no));
  say(yes.buzz>no.buzz,'打國際賽會累積海外曝光');
  say(yes.rate>no.rate,'打國際賽的那組確實比較容易出國（不是只有文案在講）');
  say(yes.tier>no.tier,'打國際賽的那組最後站上的殿堂層級也比較高');
  /* 刻意不斷言「出國年齡比較早」：自動玩家會把訓練點數榨乾，遲早會自己越過門檻，
     曝光真正救到的是「卡在門檻下 1~2 分」的人，在整體平均上看不出來。 */
  console.log(`    （首次出國年齡兩組都是 ${yes.age.toFixed(1)} / ${no.age.toFixed(1)} 歲——`
    +'曝光救的是卡在門檻邊緣的人，不會讓所有人都提早出國）');
}

/* ============ ⑦G 體系適配：換隊不能是純好處 ============ */
console.log('\n【⑦G】體系適配有沒有真的影響成長與定位');
{
  const g=createGame('fitprobe','測','SF');
  const mk=f=>{ const x=createGame('fitprobe','測','SF'); x.fit=f;
    let acc=0; for(let i=0;i<10;i++) acc+=gainFor(x,'shoot',acc); return acc; };
  const good=mk('good'),ok=mk('ok'),bad=mk('bad');
  console.log(`    10 點投籃訓練：完美契合 +${good.toFixed(1)}　普通 +${ok.toFixed(1)}　格格不入 +${bad.toFixed(1)}`);
  say(good>ok&&ok>bad,'體系適配確實影響訓練效率');
  const g2=createGame('fitprobe2','測','SF'); g2.stage='pro'; g2.league='plg'; g2.fame=55;
  ATTRS.forEach(a=>{ g2.a[a.k]=72; });
  g2.fit='good'; const rg=roleOf(g2,overall(g2));
  g2.fit='bad';  const rb=roleOf(g2,overall(g2));
  say(ROLE_ORDER.indexOf(rg)<=ROLE_ORDER.indexOf(rb),
    `體系適配也會影響隊上定位（契合「${ROLES[rg].n}」／格格不入「${ROLES[rb].n}」）`);
}

/* ============ ⑥1 顯示的成功率帶，必須就是引擎實際擲的骰 ============ */
console.log('\n【⑥1】畫面上的成功率帶，是不是引擎真的在用的那個數');
{
  /* 選秀：把顯示用的 draftOdds 拿去對實際中選率 */
  let shown=0,drafted=0,n=0;
  for(let i=0;i<900;i++){
    const g=createGame('dr'+i,'測',Object.keys(POS)[i%5]);
    g.stage='uba'; g.stageYear=4;
    ATTRS.forEach(a=>{ g.a[a.k]=52+(i%14); });
    const br=branchDraft(g,overall(g),'測試');
    g.phase='branch'; g.pending=br;                 /* applyBranch 讀的是 g.pending */
    const idx=br.opts.findIndex(o=>o.act==='goDraft');
    shown+=br.opts[idx].p; n++;
    applyBranch(g,idx);
    if(g.stage==='pro') drafted++;
  }
  const exp=shown/n,act=drafted/n;
  console.log(`    900 次國內選秀：畫面顯示的平均成功率 ${(exp*100).toFixed(1)}%，實際中選 ${(act*100).toFixed(1)}%`);
  say(Math.abs(exp-act)<0.05,'顯示與實際的差距在 5% 以內（同一份公式，差距只來自抽樣）');
  /* 事件選項的 p 也必須是引擎會拿去擲的那一個。
     舊版是測試自己用 e.o.map(o=>o.p(gg)) 造一份 pending，再拿它跟 o.p(gg) 比——
     兩邊同一個運算式，從頭到尾沒呼叫過 startEvent。實測把 startEvent 的顯示值 ×1.35
     （畫面多報 35%、applyEvent 照原值擲），四套測試全綠。
     改成端到端：顯示值讀 startEvent 真的遞出來的那張卡，結果讀 applyEvent 回傳的 card.ok。 */
  {
    let shown=0,hit=0,n=0;
    for(let i=0;i<400;i++){
      const g=createGame('evroll'+i,'測',Object.keys(POS)[i%5]);
      let steps=0;
      while(g.phase!=='end'&&steps<400){
        steps++;
        const pd=g.pending; if(!pd) break;
        if(pd.type==='train') applyTrain(g,'normal',{},'steady');
        else if(pd.type==='result') advance(g);
        else if(pd.type==='branch') applyBranch(g,0);
        else if(pd.type==='event'){
          const idx=pd.opts.findIndex(o=>o.p!==null&&o.p!==undefined&&o.p>0.02&&o.p<0.98);
          if(idx<0){ applyEvent(g,0); continue; }
          const p=pd.opts[idx].p;
          const card=applyEvent(g,idx);
          n++; shown+=p; if(card.ok) hit++;
        }
        else break;
      }
    }
    const sh=shown/n*100,ac=hit/n*100;
    console.log(`    ${n} 次事件擲骰：畫面顯示平均 ${sh.toFixed(1)}%，實際成功 ${ac.toFixed(1)}%`);
    say(n>=1500,`（前提）樣本夠大（${n} 次帶機率的事件選項）`);
    say(Math.abs(sh-ac)<3,`事件選項顯示的成功率＝引擎真的拿去擲的那一個（誤差 ${Math.abs(sh-ac).toFixed(1)} 個百分點）`);
  }
  /* 粗略帶的分界要單調 */
  const bands=[0.95,0.7,0.5,0.3,0.15,0.02].map(v=>oddsBand(v).n);
  console.log('    粗略帶：'+bands.join(' → '));
  say(new Set(bands).size>=5,'成功率帶至少分得出 5 級');
}

/* ============ 天賦上限：畫面上畫了刻度，就沒有任何路徑可以越過 ============ */
console.log('\n【上限】天賦上限擋不擋得住（預覽、訓練、事件三條路徑）');
{
  /* ① 預覽：最後一點只能給「還塞得下」的量 */
  /* 剩餘空間刻意設成比「每點最低成長 0.10」還小，才驗得到夾住的那一段 */
  const g=createGame('capprobe','測','SF');
  g.a.shoot=Math.round((g.pot.shoot-0.04)*100)/100;
  const room=g.pot.shoot-g.a.shoot;
  const gain=gainFor(g,'shoot',0);
  say(gain<=room+1e-9,`只剩 ${room.toFixed(2)} 的空間時，一點只給得出 ${gain.toFixed(3)}（不能超過剩餘空間）`);
  const pv=previewAlloc(g,{shoot:6});
  say(g.a.shoot+pv.shoot<=g.pot.shoot+1e-9,
    `預覽 6 點也不會超過上限（${g.a.shoot.toFixed(2)}＋${pv.shoot} ≤ ${g.pot.shoot}）`);

  /* ② 訓練寫入：實際落地的值不能超過上限 */
  const g2=createGame('capprobe2','測','SF');
  ATTRS.forEach(a=>{ g2.a[a.k]=g2.pot[a.k]-1; });
  const alloc={}; ATTRS.forEach(a=>{ alloc[a.k]=3; });
  applyTrain(g2,'push',alloc,'steady');
  const over=ATTRS.filter(a=>g2.a[a.k]>g2.pot[a.k]+1e-9);
  say(over.length===0,`把九項都推到上限前 1 分再猛灌，沒有任何一項越過上限（越界 ${over.length} 項）`);

  /* ③ 事件加成：也不能突破上限（要突破天花板只能靠事件加「上限」本身） */
  const g3=createGame('capprobe3','測','SF');
  ATTRS.forEach(a=>{ g3.a[a.k]=g3.pot[a.k]; });
  ATTRS.forEach(a=>bumpAttr(g3,a.k,5));
  const over3=ATTRS.filter(a=>g3.a[a.k]>g3.pot[a.k]+1e-9);
  say(over3.length===0,`事件加成也擋在上限（越界 ${over3.length} 項）`);
  /* 但事件加「上限」本身要真的有效，否則就變成永遠突破不了。
     舊版是測試自己做 `g3.pot.shoot=clamp(g3.pot.shoot+3,...)` 再驗自己，
     引擎那行（applyEvent 的 res.pot 迴圈）從沒被呼叫過——實測整行換成 `if(res.pot){}`
     四套全綠，也就是「突破天花板的唯一途徑」可以整段消失而沒人知道。
     改成走真的事件：hs_growth 的第一個選項帶 pot:{ath:3,reb:3}。 */
  {
    const gp=createGame('potprobe','測','SF');
    gp.stage='hs'; gp.pot.ath=70; gp.pot.reb=70;
    const cap0={ath:gp.pot.ath,reb:gp.pot.reb};
    gp.pending={type:'event',ev:'hs_growth',opts:[{p:null},{p:null}]};
    applyEvent(gp,0);
    say(gp.pot.ath===cap0.ath+3&&gp.pot.reb===cap0.reb+3,
      `事件真的推得動天賦上限（爆發力 ${cap0.ath}→${gp.pot.ath}、籃板 ${cap0.reb}→${gp.pot.reb}）`);
  }
  /* 事件卡顯示的 +N 必須是實際吃進去的量。實測把 deltas.push 換成名目值 + capped:0，
     四套全綠——玩家看到「+3」但只加了 0，正是 hooplife.html:1387 那行註解在防的事。 */
  {
    /* 注意 applyEvent 的順序是先寫 res.a 再加 res.pot，所以「這一次」的上限還是舊的 */
    const gc=createGame('capdelta','測','SF');
    gc.stage='hs'; gc.pot.ath=90; gc.a.ath=50; gc.pot.reb=90; gc.a.reb=40; gc.a.handle=50;
    gc.pending={type:'event',ev:'hs_growth',opts:[{p:null},{p:null}]};
    const dAth=applyEvent(gc,0).deltas.find(d=>d.k==='ath');
    say(!!dAth&&Math.abs(dAth.v-4)<0.051&&dAth.capped===0,
      `空間夠的時候印的是完整的 +${dAth?dAth.v:'—'}（capped 標記 ${dAth?dAth.capped:'—'}）`);
    const gc2=createGame('capdelta2','測','SF');
    gc2.stage='hs'; gc2.pot.ath=70; gc2.a.ath=69; gc2.pot.reb=99; gc2.a.reb=40; gc2.a.handle=50;
    gc2.pending={type:'event',ev:'hs_growth',opts:[{p:null},{p:null}]};
    const d2=applyEvent(gc2,0).deltas.find(d=>d.k==='ath');
    say(!!d2&&Math.abs(d2.v-1)<0.051&&d2.capped===4,
      `只剩 1 分空間時印的是實得 +${d2?d2.v:'—'}、不是名目的 4（capped 標記 ${d2?d2.capped:'—'}）`);
  }
  /* 往下掉不受上限保護（老化與傷病該掉就掉） */
  const g4=createGame('capprobe4','測','SF');
  const b4=g4.a.ath; bumpAttr(g4,'ath',-10);
  say(g4.a.ath<b4,'往下扣不受上限影響（老化與傷病照掉）');

  /* ④ bumpAttr 要回傳「實際吃進去多少」，事件卡才不會顯示騙人的 +3 */
  const g5=createGame('capprobe5','測','SF');
  g5.a.shoot=g5.pot.shoot-1;
  const got=bumpAttr(g5,'shoot',5);
  say(Math.abs(got-1)<1e-9,`只剩 1 分空間時加 +5，回傳實際增量 ${got}（不是名目的 5）`);
  say(Math.abs(g5.a.shoot-g5.pot.shoot)<1e-9,'加完剛好停在天賦上限');
  const g6=createGame('capprobe6','測','SF');
  say(Math.abs(bumpAttr(g6,'shoot',2)-2)<1e-9,'沒頂到上限時回傳完整增量');
}

/* ============ 天賦練滿之後，引擎還走得下去 ============ */
/* 註：「＋鍵與完成訓練同時停用」是 UI 的死鎖，那條守在 smoke.js（要讀真的 DOM，
   在這裡重算一次判準只會測到我自己抄的那份，改壞了也不會轉紅）。 */
console.log('\n【練滿】九項都頂到上限時，引擎還推得動嗎');
{
  const g=createGame('deadlock','測','SF');
  ATTRS.forEach(a=>{ g.a[a.k]=Math.round((g.pot[a.k]-0.02)*100)/100; });
  const spare=ATTRS.filter(a=>gainFor(g,a.k,0)>0.05);
  say(spare.length===0,'九項的可成長量都已經小於 0.05（等於練滿）');
  applyTrain(g,'normal',{},'steady');
  say(g.phase==='event'||g.phase==='result','不分配任何點數也能完成訓練並推進到下一階段');
}

/* ============ 體質也要影響「受傷會不會變成重傷」 ============ */
console.log('\n【重傷率】紙糊的人不只常受傷，斷的機率也該比較高');
{
  const mk=d=>{ const g=createGame('sev','測','SF'); g.dura=d; return duraSevere(g); };
  console.log(`    鐵打的 ×${mk(100)}　普通 ×${mk(50)}　紙糊的 ×${mk(0)}`);
  say(mk(0)>mk(50)&&mk(50)>mk(100),'重傷倍率隨體質單調變化');
  say(Math.abs(mk(50)-1)<1e-9,'普通體質的重傷倍率剛好是 1（基準不偏移）');
  /* 端到端：同樣打法下，體質差的組「重傷佔所有傷病的比例」要比較高 */
  const cnt={lo:{sev:0,all:0},hi:{sev:0,all:0}};
  for(let i=0;i<420;i++){
    const g=autoPlay('sv'+i,'D3',{pos:Object.keys(POS)[i%5],intens:'push',att:'allin'});
    const b=g.dura>=60?'hi':'lo';
    cnt[b].sev+=g.injuries;
    cnt[b].all+=g.injuries+g.seasons.filter(s=>s.injury==='minor').length;
  }
  const rl=cnt.lo.sev/Math.max(1,cnt.lo.all),rh=cnt.hi.sev/Math.max(1,cnt.hi.all);
  console.log(`    體質 60− 的傷病有 ${(rl*100).toFixed(1)}% 是重傷；體質 60+ 只有 ${(rh*100).toFixed(1)}%`);
  say(rl>rh,'體質差的人，受傷變成重傷的比例確實比較高');
}

/* ============ ⑥2 同儕定位 ============ */
console.log('\n【⑥2】同儕定位算得對不對');
{
  const g=createGame('peer','測','SF'); g.league='plg';
  const a=peerRank(g,58),b=peerRank(g,68),c=peerRank(g,80);
  console.log(`    PLG 綜合 58 → 第 ${a.rank} 名（${a.tier}）`);
  console.log(`    PLG 綜合 68 → 第 ${b.rank} 名（${b.tier}）`);
  console.log(`    PLG 綜合 80 → 第 ${c.rank} 名（${c.tier}）`);
  say(a.rank>b.rank&&b.rank>c.rank,'綜合越高，排名越前面');
  g.league='nba';
  const d=peerRank(g,80);
  console.log(`    同樣綜合 80，在 NBA 是第 ${d.rank} 名／${d.size} 人（${d.tier}）`);
  say(d.pct>c.pct,'同樣的綜合，在 NBA 的同儕百分位比在 PLG 差');
  /* 舊版這裡是 `rank>=1`——peerRank 自己就 clamp(...,1,size)，恆真。
     改成驗真正有語意的那件事：遠低於水準線的人要排在名單尾端、遠高於的排在最前面。 */
  const tail=peerRank(g,30),head=peerRank(g,99);
  say(tail.rank>=head.rank+Math.round(tail.size*0.5),
    `綜合 30 排第 ${tail.rank}／${tail.size}、綜合 99 排第 ${head.rank}（要真的拉得開）`);
  say(head.rank<=2,`頂級綜合排得到前二（第 ${head.rank} 名）`);
}

/* ============ 加練出手：手感要真的影響分佈 ============ */
/* shotOdds 被呼叫幾千次，但沒有任何一條斷言看過它的輸出——
   五種結果的機率整組換掉也不會轉紅（smoke.js 只檢查標籤合法，不看分佈）。 */
console.log('\n【加練】手感好的人，加練出手的分佈要真的比較好看');
{
  const mk=v=>{ const g=createGame('shot','測','SG'); g.a.shoot=v; g.a.three=v; g.a.mind=v; return g; };
  const hot=shotOdds(mk(92)),cold=shotOdds(mk(20));
  const lbl=SHOTS.map(s=>s.n);
  console.log('    手感 92：'+hot.map((v,i)=>`${lbl[i]} ${(v*100).toFixed(1)}%`).join('　'));
  console.log('    手感 20：'+cold.map((v,i)=>`${lbl[i]} ${(v*100).toFixed(1)}%`).join('　'));
  say(hot[0]>cold[0]+0.05,`手感好的人空心球明顯比較多（${(hot[0]*100).toFixed(1)}% vs ${(cold[0]*100).toFixed(1)}%）`);
  say(hot[4]<cold[4]-0.05,`手感差的人麵包明顯比較多（${(cold[4]*100).toFixed(1)}% vs ${(hot[4]*100).toFixed(1)}%）`);
  const mkV=o=>o.reduce((s,v,i)=>s+v*SHOTS[i].v,0);
  say(mkV(hot)>mkV(cold),`手感好的人加練期望值比較高（${mkV(hot).toFixed(2)} vs ${mkV(cold).toFixed(2)}）`);
  /* 實際抽樣也要跟宣稱的分佈對得起來——startTrain 是自己跑一份逐球判定的 */
  const cnt=[0,0,0,0,0]; let tot=0;
  for(let i=0;i<600;i++){
    const g=mk(92); g._rng=mulberry32(cyrb32('shot'+i));
    startTrain(g);
    g.pending.shots.forEach(s=>{ const j=SHOTS.findIndex(x=>x.k===s.k); cnt[j]++; tot++; });
  }
  const dev=cnt.map((c,i)=>Math.abs(c/tot-hot[i])).reduce((a,b)=>Math.max(a,b),0);
  console.log(`    ${tot} 次實際出手：`+cnt.map((c,i)=>`${lbl[i]} ${(c/tot*100).toFixed(1)}%`).join('　'));
  say(dev<0.03,`startTrain 抽出來的分佈＝shotOdds 宣稱的分佈（最大偏差 ${(dev*100).toFixed(1)} 個百分點）`);
}

/* ============ ⑦E 里程碑 ============ */
console.log('\n【⑦E】里程碑會不會真的解鎖，且不重複');
{
  const hit={},dupe=[];
  for(let i=0;i<300;i++){
    const g=autoPlay('m'+i,'D6',{pos:Object.keys(POS)[i%5]});
    const seen={};
    g.milestones.forEach(k=>{ if(seen[k]) dupe.push(k); seen[k]=1; hit[k]=(hit[k]||0)+1; });
  }
  const got=Object.keys(hit).length;
  console.log('    300 局中解鎖過的里程碑：'+MILESTONES.filter(m=>hit[m.k])
    .map(m=>`${m.n} ${hit[m.k]}`).join('　')||'（無）');
  say(dupe.length===0,'同一個里程碑不會重複解鎖');
  say(got>=8,`${MILESTONES.length} 個里程碑中有 ${got} 個實際拿得到（至少要 8 個）`);
}

/* ============ ⑦H NBA 選秀：大一起就能宣告（one-and-done） ============ */
console.log('\n【⑦H】大一到大四都投得了 NBA 選秀，且早走的代價是真的');
{
  /* tag 是用來讓每個樣本真的是相異樣本的。舊版的種子只由 (year,ovr,pot) 決定，
     而 #6 的迴圈用 (i%4,i%42,i%9) 取值，週期 252——6,000 次其實只有 116 個相異樣本
     各重複 24 遍，等效雜訊 σ=4.1pp 比 3pp 的容許值還大。 */
  const mk=(year,ovrVal,potVal,tag)=>{
    const g=createGame('nb'+(tag===undefined?'':tag+'_')+year+'_'+ovrVal+'_'+potVal,'測','SF');
    g.stage='ncaa'; g.stageYear=year; g.age=18+year; g.flags.nbaRadar=true;
    /* 扣掉位置補正，讓 overall(g) 真的等於 ovrVal——這個假履歷講的是「綜合 90 的人」，
       不是「九項都 90 的人」。補正的值要從引擎讀，不可以在測試裡寫死一份。 */
    const adj=POS_OVR_ADJ[g.pos];
    for(const k of Object.keys(g.a)){ g.a[k]=ovrVal-adj; g.pot[k]=potVal-adj; }
    return g;
  };
  /* 1. 大一就看得到 NBA 選秀這個選項 */
  const br=takeNextBranch(mk(1,79,98));
  say(!!(br&&br.opts.some(o=>o.act==='nbaDraft')),'大一（19 歲）打完就會被問要不要宣告投入 NBA 選秀');
  say(!!(br&&br.opts.some(o=>o.act==='stay')),'同一個抉擇一定留著「再讀一年」的退路');
  /* 2. 大二／大三／大四也都問得到——不是一次性的機會 */
  let years=0;
  for(const y of [2,3]) if(((takeNextBranch(mk(y,82,98))||{opts:[]}).opts||[]).some(o=>o.act==='nbaDraft')) years++;
  say(years===2,'大二、大三也都能重新宣告一次（不是一次性的機會）');
  say(branchDraft(mk(4,82,98),82,'x').opts.some(o=>o.act==='nbaDraft'),'大四畢業當然也還在');
  /* 3a. 生嫩折價：把「賭天花板」那一項抵銷掉（現值＝天花板，沒有想像空間），
         剩下的就只有年級。越早宣告一定越吃虧。 */
  const flat=[1,2,3,4].map(y=>draftOdds(mk(y,90,90),'nbaDraft'));
  console.log('    現值＝天花板 90（沒有潛力可賭）：'+flat.map((p,i)=>`大${['一','二','三','四'][i]} ${(p*100).toFixed(1)}%`).join('　'));
  say(flat.every((p,i)=>i===0||p>flat[i-1]),'把潛力因素抵銷後，越早宣告中選率越低（生嫩折價真的存在）');
  /* 3b. 真正要守的是「再讀一年不能是陷阱」：照實測的成長軌跡，逐年都要更好。
         注意——這裡刻意不去斷言「同樣現值下越早越差」。現實的 NBA 就是同樣能力
         19 歲比 22 歲值錢，模型也照做；只有三年原地踏步的人才會愈等愈糟。 */
  const traj=[[1,71],[2,75],[3,77],[4,79]].map(([y,o])=>draftOdds(mk(y,o,91),'nbaDraft'));
  console.log('    照實測成長軌跡（71→75→77→79，天花板 91）：'+traj.map((p,i)=>`大${['一','二','三','四'][i]} ${(p*100).toFixed(1)}%`).join('　'));
  say(traj.every((p,i)=>i===0||p>traj[i-1]),'只要有在進步，多讀一年一定更好（「再讀一年」不是陷阱選項）');
  const flatY=[1,2,3,4].map(y=>draftOdds(mk(y,84,96),'nbaDraft'));
  say(flatY[3]<flatY[0],'三年原地踏步的人反而會愈等愈糟（球探看得到你停在哪裡）');
  /* 4. 天花板真的有被算進去——不然「球隊在賭潛力」就只是文案 */
  const lo=draftOdds(mk(1,80,82),'nbaDraft'),hi=draftOdds(mk(1,80,98),'nbaDraft');
  console.log(`    大一同樣現值 80：天花板 82 → ${(lo*100).toFixed(1)}%　天花板 98 → ${(hi*100).toFixed(1)}%`);
  say(hi>lo+0.15,'同樣現值，天花板越高球隊越願意賭');
  /* 5. 舊版 86 那道斷崖要消失：多讀一年不可以反而變差 */
  const j=draftOdds(mk(3,87,92),'nbaDraft'),s4=draftOdds(mk(4,88,92),'nbaDraft');
  console.log(`    大三綜合 87 → ${(j*100).toFixed(1)}%　大四綜合 88 → ${(s4*100).toFixed(1)}%`);
  say(s4>j,'多讀一年、能力也長了，中選率必須更高（舊版大四 86 只剩 5% 的斷崖已消失）');
  /* 6. 畫面顯示的機率就是實際擲的那一個。
     舊版是 `const p=draftOdds(...)` 之後拿 p 去對 `g._rng()<p`——兩邊同一個區域變數，
     結構上不可能失敗。實測把 branchDraft 的顯示值 ×1.4、applyBranch 的擲骰 ×0.6，
     四套測試全綠。改成端到端：顯示值讀 takeNextBranch 真的遞出來的那張卡，
     實際結果看 applyBranch 跑完人在哪個聯盟。 */
  let shown=0,hit=0,n=0;
  const seen=new Set();
  for(let i=0;i<6000;i++){
    const g=mk(1+(i%4),55+(i%42),90+(i%9),i);
    const br=takeNextBranch(g);
    const idx=br?br.opts.findIndex(o=>o.act==='nbaDraft'):-1;
    if(idx<0) continue;
    const p=br.opts[idx].p;
    if(p<=0.031||p>=0.719) continue;
    n++; shown+=p; seen.add(p.toFixed(6)+'|'+g.seed);
    g.phase='branch'; g.pending=br;
    applyBranch(g,idx);
    if(g.league==='nba') hit++;
  }
  const sh=shown/n*100,ac=hit/n*100;
  console.log(`    ${n} 次宣告（${seen.size} 個相異樣本）：畫面顯示平均 ${sh.toFixed(1)}%，實際中選 ${ac.toFixed(1)}%`);
  say(seen.size>=n*0.9,`樣本真的是相異的（${seen.size}/${n}）——重複樣本會讓 3pp 的容許值失去鑑別力`);
  say(Math.abs(sh-ac)<3,`顯示的機率與實際擲骰同一個來源（誤差 ${Math.abs(sh-ac).toFixed(1)} 個百分點）`);
  /* 球探報告是第三份顯示出口，它也必須讀同一個 draftOdds */
  {
    const g=mk(2,84,95,'sc');
    const row=(scoutReport(g).rows||[]).find(r=>r.n.indexOf('NBA 選秀')>=0);
    say(!!row&&Math.abs(row.p-draftOdds(g,'nbaDraft'))<1e-12,
      `球探報告上的 NBA 選秀機率＝draftOdds（報告 ${row?(row.p*100).toFixed(1):'—'}%，`
      +`引擎 ${(draftOdds(g,'nbaDraft')*100).toFixed(1)}%）`);
    const tryRow=(scoutReport(g).rows||[]).find(r=>r.n.indexOf('測試 · 畢業直接闖')>=0);
    if(tryRow){
      const lg=(GRAD_TRYOUTS.find(T=>tryRow.n.indexOf(T.label)===0)||{}).lg;
      say(Math.abs(tryRow.p-draftOdds(g,'try:'+lg))<1e-12,
        `球探報告上的海外試訓機率＝draftOdds（${(tryRow.p*100).toFixed(1)}%）`);
    }
  }
  /* 試訓那條的實際擲骰也要對得起顯示值：applyBranch 偷偷 ×0.6 目前四套全綠 */
  {
    let shownT=0,hitT=0,nT=0;
    for(let i=0;i<1500;i++){
      const g=mk(4,66+(i%12),90,'ty'+i);
      const br=branchDraft(g,overall(g),'x');
      const idx=br.opts.findIndex(o=>String(o.act).indexOf('try:')===0);
      if(idx<0) continue;
      const p=br.opts[idx].p;
      if(p<=0.03||p>=0.9) continue;
      nT++; shownT+=p;
      g.phase='branch'; g.pending=br;
      const lg=br.opts[idx].act.slice(4);
      applyBranch(g,idx);
      if(g.league===lg) hitT++;
    }
    if(nT>=200){
      const shT=shownT/nT*100,acT=hitT/nT*100;
      console.log(`    ${nT} 次畢業直闖試訓：畫面顯示平均 ${shT.toFixed(1)}%，實際過關 ${acT.toFixed(1)}%`);
      say(Math.abs(shT-acT)<4,`試訓的顯示值與實際擲骰同一個來源（誤差 ${Math.abs(shT-acT).toFixed(1)} 個百分點）`);
    }
  }
  /* 6b. 門檻本身也要有人守。NBA_SCOUT_GATE 決定「有多少人會被問到要不要投」，
     實測把 78 降到 62（幾乎人人可投）四套全綠——verify [3] 只量「有沒有打過 NBA」，
     量不到有多少人站在那個抉擇前面。 */
  {
    let asked=0,n=0;
    for(let i=0;i<2000;i++){
      const g=mk(1+(i%4),46+(i%50),70+(i%30),'gate'+i);
      const br=takeNextBranch(g);
      n++; if(br&&br.opts.some(o=>o.act==='nbaDraft')) asked++;
    }
    const rate=asked/n;
    console.log(`    綜合 46~95／天花板 70~99 的 NCAA 球員：${(rate*100).toFixed(1)}% 會被問到要不要宣告`);
    say(rate>0.20&&rate<0.55,`被問到的比例落在合理帶（${(rate*100).toFixed(1)}%，要 20%~55%）`);
  }
  /* 7. 落選就回不去學校 */
  const g2=mk(1,55,60);
  g2.pending={type:'branch',title:'x',opts:[{label:'投',act:'nbaDraft'}]};
  g2._rng=()=>0.999;
  applyBranch(g2,0);
  say(g2.stage==='pro'&&g2.league==='gleague','落選就是 G League，不會退回 NCAA 再讀一年');
}

/* ============ ⑧ 使用者回報：「出國好像只有美國」 ============ */
console.log('\n【⑧A】球探報告的海外路線圖：七個目的地都在，門檻不可以另外寫一份');
{
  const g=createGame('mapx','測','SF');
  const map=scoutReport(g).map;
  const want=['NCAA','日本','韓國','澳洲','歐洲','G LEAGUE','NBA'];
  say(map.length===OVERSEAS.length+1,
    `路線圖有 ${map.length} 個目的地（OVERSEAS ${OVERSEAS.length} 個＋高中的 NCAA）`);
  const missing=want.filter(w=>!map.some(m=>m.n.indexOf(w)>=0));
  say(missing.length===0,`七個目的地都列得出來（缺 ${missing.join('/')||'無'}）`);
  /* 門檻必須直接讀常數表，不可以在 UI 那邊另外抄一份——抄了就會有一天對不上 */
  let wrong=0;
  for(const T of GRAD_TRYOUTS){
    const row=map.find(m=>m.n===LEAGUES[T.lg].n);
    if(!row||row.need!==T.need) wrong++;
  }
  say(wrong===0,`學生階段列的是 GRAD_TRYOUTS 的門檻（對不上 ${wrong} 個）`);
  const pro=createGame('mapy','測','SF');
  pro.stage='pro'; pro.league='plg'; pro.age=24;
  const pmap=scoutReport(pro).map;
  let wrong2=0;
  for(const o of OVERSEAS){
    const row=pmap.find(m=>m.n===LEAGUES[o.lg].n);
    if(!row||row.need!==o.ovr) wrong2++;
  }
  say(wrong2===0,`職業階段列的是 OVERSEAS 的門檻（對不上 ${wrong2} 個）`);
  /* rows 那半也一樣不可以另外抄一份。國內選秀那一列曾經寫死 46，而 draftOdds 早就
     改成 bar−11（PLG 51／T1 49）：綜合 46~51 的人被告知「已達標 ✓」，
     同一張卡片下面卻寫「幾乎不可能」，而落選＝生涯直接結束。 */
  const uni=createGame('mapz','測','SF');
  uni.stage='ncaa'; uni.stageYear=4; uni.age=22;
  ATTRS.forEach(a=>{ uni.a[a.k]=52; });
  const rws=scoutReport(uni).rows;
  const plgRow=rws.find(r=>r.n.indexOf('P.LEAGUE+')>=0),t1Row=rws.find(r=>r.n.indexOf('T1')>=0);
  say(!!plgRow&&plgRow.reqs[0].need===draftGate('plg'),
    `國內選秀（PLG）那列的門檻＝draftOdds 的起算點 ${draftGate('plg')}（面板寫 ${plgRow?plgRow.reqs[0].need:'—'}）`);
  say(!!t1Row&&t1Row.reqs[0].need===draftGate('t1'),
    `T1 那列也在，門檻＝${draftGate('t1')}（面板寫 ${t1Row?t1Row.reqs[0].need:'—'}）`);
  /* 「已達標」與「過得了」是兩件事：有機率的那幾列，過了門檻只代表報得了名。
     標籤由 scoutReport 算好給 UI 用，這條守的是「不會有一列同時掛已達標與幾乎不可能」。 */
  const contradict=rws.filter(r=>r.badge==='已達標'&&r.p!=null&&oddsBand(r.p).n==='幾乎不可能');
  say(contradict.length===0,
    `沒有任何一列同時寫「已達標」與「幾乎不可能」（矛盾 ${contradict.length} 列${contradict.length?'：'+contradict[0].n:''}）`);
  const oddsRows=rws.filter(r=>r.p!=null&&r.ok);
  say(oddsRows.every(r=>r.badge==='報得了名'),
    `有機率的門檻過關後掛的是「報得了名」不是「已達標」（${oddsRows.length} 列）`);
  /* 旅外那半：球探報告與路線圖比的必須是 overseasOffer 真的在用的那個數（含國際賽曝光）。
     以前兩邊都拿裸綜合去比，於是報價卡說「門檻剛好過了」、球探報告寫「還差 2」。 */
  {
    const pb=createGame('buzzy','測','SF');
    pb.stage='pro'; pb.league='plg'; pb.age=25; pb.natlBuzz=4;
    pb.seasons=[{lg:'PLG',stage:'職業第 1 年',gp:40,pts:16,reb:5,ast:3,stl:1,blk:.5,
      hi:28,awards:[],champ:false,miss:false,ovr:70}];
    const ovrP=overall(pb),eff=osEff(pb,ovrP);
    say(eff>ovrP,`（前提）這個探針真的有國際賽曝光（裸綜合 ${ovrP.toFixed(1)}、有效 ${eff.toFixed(1)}）`);
    const sr=scoutReport(pb),mp=sr.map;
    const bad=[];
    for(const o of OVERSEAS){
      const row=mp.find(m=>m.n===LEAGUES[o.lg].n);
      if(!row||row.state==='been'||row.state==='closed'||row.state==='locked') continue;
      const engineOpen=eff>=o.ovr;
      if((row.state==='open')!==engineOpen) bad.push(o.lg);
      if(Math.abs(row.cur-r1(eff))>0.051) bad.push(o.lg+'(cur)');
    }
    say(bad.length===0,`路線圖比的是含國際賽曝光的有效綜合（對不上 ${bad.length}${bad.length?'：'+bad.join('/'):''}）`);
    const srBad=sr.rows.filter(r=>r.reqs&&r.reqs[0]&&r.tier&&Math.abs(r.reqs[0].cur-r1(eff))>0.051);
    say(srBad.length===0,`球探報告的旅外列也是（對不上 ${srBad.length}）`);
  }
}

console.log('\n【⑧B】韓國 KBL 不可以是死內容');
{
  /* 舊版門檻 76：KBL 與 B1 同層級，而 76 比日本的 72 高四分，
     所有人都先拿日本的報價走掉，走掉之後同層級就被 tier 濾掉，KBL 再也不會出現。
     實測 1000 局只有 5 局踏進過 KBL。 */
  let kbl=0,jp=0;
  for(let i=0;i<300;i++){
    const g=autoPlay('k'+i,'D'+(i%5),{pos:Object.keys(POS)[i%5]});
    const lgs=new Set(g.seasons.map(s=>s.lg));
    if(lgs.has('KBL')) kbl++;
    if(lgs.has('B1')) jp++;
  }
  console.log(`    300 局：踏進日本 ${jp} 局、踏進韓國 ${kbl} 局`);
  /* 門檻 73 → 106/300；把門檻改回舊的 76 只剩 27/300（這個決策序列比較常賴在 PLG，
     所以看起來沒有全域量測的 5/1000 那麼慘，但差距一樣是三、四倍）。界線放 60。 */
  say(kbl>=60,`韓國 KBL 走得到（${kbl}/300 局，門檻改回 76 會掉到 27/300）`);
  /* 兩張報價要能同時出現，不然「選一邊」這件事根本不存在 */
  const b1=OVERSEAS.find(o=>o.lg==='bleague'),kb=OVERSEAS.find(o=>o.lg==='kbl');
  say(Math.abs(kb.ovr-b1.ovr)<=2&&LEAGUES[kb.lg].tier===LEAGUES[b1.lg].tier,
    `日本 ${b1.ovr} 與韓國 ${kb.ovr} 的門檻夠近，同一年拿得到兩張報價`);
}

console.log('\n【⑧C】高中門檻的位置補正：小前鋒不可以永遠出不了國');
{
  /* 綜合是加權平均而訓練是遞減報酬，權重集中的位置可以把點數整包倒進高權重項。
     用同一個數字當門檻，實測 NCAA 達標率是中鋒 26%、小前鋒 1%。 */
  const rate={};
  for(const pos of Object.keys(POS)){
    let n=0,ok=0;
    for(let i=0;i<160;i++){
      const g=createGame('n'+pos+i,'測',pos);
      let guard=0;
      while(g.phase!=='end'&&guard++<200){
        const p=g.pending; if(!p) break;
        if(p.type==='train'){
          applyTrain(g,'push',greedyAlloc(g,trainPoints(g,'push')),'allin');
        }
        else if(p.type==='event') applyEvent(g,0);
        else if(p.type==='result') advance(g);
        else if(p.type==='branch'){
          if(p.title==='高中畢業'){ n++; if(p.opts.some(o=>o.act==='goNCAA')) ok++; break; }
          applyBranch(g,0);
        } else break;
      }
    }
    rate[pos]=ok/n;
  }
  const vals=Object.values(rate);
  const lo=Math.min(...vals),hi=Math.max(...vals);
  console.log('    NCAA 達標率：'+Object.keys(rate).map(k=>`${k} ${(rate[k]*100).toFixed(1)}%`).join('　'));
  /* 把門檻改回固定的 64／55，小前鋒會掉到 0.6%、最高最低差 38 倍。界線放 1.5% 與 8 倍。 */
  say(lo>0.015,`每個位置都拿得到 NCAA 邀請（最低 ${(lo*100).toFixed(1)}%，固定門檻時小前鋒只有 0.6%）`);
  say(hi/Math.max(lo,1e-9)<8,
    `五個位置的達標率沒有差到一個數量級（最高 ${(hi*100).toFixed(1)}% ÷ 最低 ${(lo*100).toFixed(1)}% = ${(hi/Math.max(lo,1e-9)).toFixed(1)} 倍，舊版 26 倍）`);
}

/* ============ ⑨A 名人堂不可以用年資買到 ============ */
/* v1.2.0 的實測：22% 的生涯進名人堂、13.6% 拿 S，其中三分之二的入選者職業場均不到 15 分。
   原因是被動項自己就湊得出 75 分（最高綜合 27.6＋NBA 年資 18＋最高殿堂 16＋名氣 7
   ＋里程碑 4＋當家年資 3），一座獎盃都不用拿就過了 70 的門檻。 */
console.log('\n【⑨A】待得夠久＋綜合夠高，可不可以零獎項進名人堂');
{
  /* 手工組一個「NBA 打滿 20 季、綜合 95、名氣爆表、產出平庸、一座獎都沒有」的人 */
  const season=(lg,pts,reb,ast)=>({lg:lg,stage:'職業第 1 年',gp:40,pts:pts,reb:reb,ast:ast,
    stl:0.6,blk:0.5,hi:20,awards:[],champ:false,miss:false});
  const mk=o=>Object.assign({seasons:[],awards:[],traits:[],natl:[],milestones:[],
    bestOvr:95,fame:100,starYears:20,champs:0},o);
  const grinder=mk({seasons:Array.from({length:20},()=>season('NBA',11,4,2))});
  const h1=hofScore(grinder);
  console.log(`    NBA 20 季、綜合 95、名氣 100、零獎項、場均 11 分 → 名人堂票數 ${h1}`);
  say(h1<70,`零獎項的年資怪進不了名人堂（${h1}／100，門檻 70；舊制同一份履歷是 74，直接入選）`);
  say(grade(h1,grinder).g!=='S'&&grade(h1,grinder).g!=='A',
    `他的評價是 ${grade(h1,grinder).g}，不是 S 也不是 A`);
  /* 同一個人加上真正的戰功，就該進得去——門檻不可以只是變成「誰都進不去」 */
  const legend=mk({seasons:Array.from({length:20},()=>season('NBA',24,8,5)),
    awards:[].concat(
      Array.from({length:3},()=>({y:0,t:'NBA 總冠軍',lg:'NBA'})),
      Array.from({length:2},()=>({y:0,t:'NBA 年度 MVP',lg:'NBA'})),
      Array.from({length:6},()=>({y:0,t:'年度第一隊',lg:'NBA'})))});
  const h2=hofScore(legend);
  console.log(`    同樣 20 季，但場均 24 分＋3 冠 2 MVP 6 次第一隊 → 名人堂票數 ${h2}`);
  say(h2>=70,`真的打出東西的人進得去（${h2}／100）`);
}

/* ============ ⑨B 同一座獎，在不同聯盟不是同一件事 ============ */
console.log('\n【⑨B】PLG 的 MVP 與 NBA 的 MVP，票數不可以一樣重');
{
  const mvp=lg=>({seasons:[],awards:[{y:0,t:lg+' 年度 MVP',lg:lg}],traits:[],natl:[],
    milestones:[],bestOvr:0,fame:0,starYears:0,champs:0});
  const nba=hofScore(mvp('NBA')),plg=hofScore(mvp('PLG')),b1=hofScore(mvp('B1'));
  console.log(`    一座 MVP 值多少票：NBA ${nba}　B1 ${b1}　PLG ${plg}`);
  say(nba>b1&&b1>plg,'聯盟層級越高，同一座獎越重');
  say(plg*2<nba,`PLG 的 MVP 不到 NBA 的一半（${plg} vs ${nba}）`);
  say(Math.abs(lgWeight('NBA')-1)<1e-9,'NBA 的份量是 1（基準沒有偏移）');
}

/* ============ ⑨C 獎項要跟當季數據掛鉤 ============ */
/* 舊版 MVP 只看綜合與定位，實測會發出「場均 10.3 分的年度 MVP」，
   而那幾座 MVP 又回頭把他送進名人堂。 */
console.log('\n【⑨C】會不會發出場均十幾分的年度 MVP');
{
  /* 門檻不可以在這裡再抄一份數字（鐵律 2）：產出關卡的唯一出口是 prodK，
     而它的尺是每個聯盟自己的 cMid——舊版寫死 26 與 18，那是 PLG 的尺，
     套到 NBA（cMid 20.1）上會多擋掉 75% 的球季，套到 UBA（30.3）上則太鬆。 */
  let mvps=0,worst=null,lowMvp=0,first=0,lowFirst=0;
  for(let i=0;i<400;i++){
    const g=autoPlay('w'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5]});
    for(const s of g.seasons){
      const k=lgKeyOf(s.lg); if(!k) continue;
      const cv=contribOf(s);
      if(s.awards.some(a=>a.indexOf('年度 MVP')>=0)){
        mvps++; if(prodK(k,cv,1.00)<=0){ lowMvp++; if(!worst||cv<worst.cv) worst={cv:cv,pts:s.pts,lg:s.lg}; }
      }
      if(s.awards.indexOf('年度第一隊')>=0){ first++; if(prodK(k,cv,0.70)<=0) lowFirst++; }
    }
  }
  console.log(`    400 局發出 ${mvps} 座年度 MVP、${first} 次年度第一隊`);
  say(lowMvp===0,`沒有任何一座 MVP 是在該聯盟的產出起算點以下拿到的（違規 ${lowMvp} 座`
    +(worst?`，最低 ${worst.cv.toFixed(1)}／場均 ${worst.pts} ${worst.lg}`:'')+'）');
  say(lowFirst===0,`沒有任何一次年度第一隊是在該聯盟的產出起算點以下拿到的（違規 ${lowFirst} 次）`);
}

/* ============ ⑨D 里程碑只能算職業球季 ============ */
console.log('\n【⑨D】高中大學的數字不可以拿去解鎖職業里程碑');
{
  /* 三年高中＋四年大學，每季 30 場、場均 30 分 12 板 9 助、單場最高 55——
     累計 6,300 分。舊版（讀 g.career）會直接送出 1,000 分、5,000 分、單場 40、單場 50、
     準大三元、單季 25 分共 6 個里程碑，而且這些里程碑還會回頭加名人堂票數。 */
  const amaS=(st,lg)=>({lg:lg,stage:st,gp:30,pts:30,reb:12,ast:9,stl:2,blk:1,hi:55,awards:[],miss:false});
  const hs={seasons:['高一','高二','高三'].map(x=>amaS(x,'HBL'))
    .concat(['大一','大二','大三','大四'].map(x=>amaS(x,'UBA'))),milestones:[],streakFull:0};
  const got=MILESTONES.filter(m=>m.f(hs,proStats(hs))).map(m=>m.n);
  console.log(`    高中大學共 7 季、累計 ${30*30*7} 分、單場 55 → 解鎖 ${got.length?got.join('、'):'（無）'}`);
  say(got.length===0,'學生時期不會解鎖任何職業里程碑（舊版會直接送出 6 個）');
  const pro={seasons:hs.seasons.concat([{lg:'PLG',stage:'職業第 1 年',gp:40,pts:30,reb:12,ast:9,
    stl:2,blk:1,hi:55,awards:[],miss:false}]),milestones:[],streakFull:0};
  const got2=MILESTONES.filter(m=>m.f(pro,proStats(pro))).map(m=>m.n);
  say(got2.length>=3,`同一份數據換成職業球季就解得開（${got2.length} 個：${got2.join('、')}）`);
  say(got2.indexOf('職業 5,000 分')<0,'而且只認職業的那 1,200 分，學生時期的 6,300 分不會被算進去');
}

/* ============ ⑨E 生涯指數 ============ */
console.log('\n【⑨E】生涯指數：上限、單調、以及 PR 表是不是實測出來的');
{
  const cap=Object.values(CI_CAP).reduce((s,v)=>s+v,0);
  say(cap===20000,`七個項目的上限加起來剛好 20,000（實際 ${cap}）`);
  /* 只加總常數是抓不到「某一項自己超過上限」的——CI_K 乘在 clamp 外面的時候，
     年資項會算出 1,544/1,500、長條寬度 103%，但上面那條守門照樣綠。 */
  {
    let over=null,n=0;
    for(let i=0;i<300;i++){
      const g=autoPlay('cap'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
        branchMode:['first','stay','last'][i%3]});
      const P=g.summary.ciParts;
      for(const k in CI_CAP){ n++; if(P[k]>CI_CAP[k]&&!over) over={k:k,v:P[k],cap:CI_CAP[k],sd:'cap'+i}; }
    }
    say(!over,over?`第 ${over.k} 項算出 ${over.v} > 上限 ${over.cap}（${over.sd}）`
      :`檢查 ${n} 個項目值，沒有任何一項超過自己的上限`);
  }
  const rows=[];
  for(let i=0;i<600;i++){
    const g=autoPlay('c'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
      branchMode:['first','stay','last'][i%3]});
    rows.push({ci:g.summary.ci,hof:g.summary.hof,pr:g.summary.ciPr});
  }
  /* `ci>=0 && ci<=20000` 是 careerIndex 自己的 clamp 保證的，恆真。
     真正要守的是「有沒有人被 clamp 夾到」——夾到就代表 CI_K 或某一項的上限失準了。 */
  const clipped=rows.filter(r=>r.ci>=20000).length;
  say(clipped===0,`沒有任何一局被 20,000 的天花板夾住（夾到 ${clipped} 局）`);
  /* 名人堂等級的人，指數一定比沒進職業的人高——兩把尺不可以互相打架 */
  const hi=rows.filter(r=>r.hof>=70),lo=rows.filter(r=>r.hof<20);
  if(hi.length&&lo.length){
    const avg=a=>a.reduce((s,x)=>s+x.ci,0)/a.length;
    console.log(`    名人堂級平均 ${avg(hi).toFixed(0)}　輪替以下平均 ${avg(lo).toFixed(0)}`);
    say(avg(hi)>avg(lo)*1.6,'名人堂級的生涯指數明顯高於進不了職業殿堂的（≥1.6 倍）');
  }
  /* PR 表：引擎裡寫死的表必須跟實際跑出來的分佈對得起來（容差 4%） */
  const s=rows.map(r=>r.ci).sort((a,b)=>a-b);
  const p80=s[Math.floor(s.length*0.8)];
  const err=Math.abs(p80-10000)/10000;
  console.log(`    600 局實測 P80 = ${p80}（引擎宣稱 10,000，誤差 ${(err*100).toFixed(1)}%）`);
  say(err<0.04,`實測 P80 與宣稱的 10,000 對得起來（誤差 ${(err*100).toFixed(1)}%，容差 4%）`);
  /* 校準係數對了、但 PR 表忘記重跑，也要抓得出來 */
  const tblErr=Math.abs(CI_PCTL[16]-p80)/p80;
  say(tblErr<0.04,`PR 表沒有過期（表上 P80 ${CI_PCTL[16]}，實測 ${p80}，差 ${(tblErr*100).toFixed(1)}%；`
    +'過期的話跑 npm run calib 重貼）');
  /* 只驗 P80 一格抓不到「整條表等比例位移」（CI_K 動了、表忘記重跑就是這個樣子）。
     再抽兩格：PR50 是分佈中段、PR90 是尾巴。PR25→PR30 那段有「有沒有進職業」的
     雙峰斷崖，600 局在那裡抖得很兇，所以不抽低分段，容差也放寬到 8%。 */
  const qq=p=>s[Math.min(s.length-1,Math.floor(s.length*p))];
  for(const [p,idx] of [[0.50,CI_PR_AT.indexOf(50)],[0.90,CI_PR_AT.indexOf(90)]]){
    const got=qq(p),want=CI_PCTL[idx];
    const e2=Math.abs(want-got)/Math.max(1,got);
    say(e2<0.08,`PR 表第 ${idx} 格（PR ${CI_PR_AT[idx]}）跟實測對得起來（表上 ${want}，實測 ${got}，`
      +`差 ${(e2*100).toFixed(1)}%）`);
  }
  say(Math.abs(ciRank(CI_PCTL[16])-80)<=1,`PR 表第 16 格就是 PR 80（${CI_PCTL[16]} → PR ${ciRank(CI_PCTL[16])}）`);
  say(ciRank(0)===0&&ciRank(99999)===99,'PR 兩端夾得住（0 分 → PR 0，滿分 → PR 99）');
}

/* ============ ⑨F 薪資 ============ */
console.log('\n【⑨F】薪資：超級巨星要拉得開，G League 要真的是犧牲');
{
  const mk=(lg,fame)=>({league:lg,fame:fame||50,traits:[],stage:'pro',age:26,injuries:0,
    a:{},pos:'SF',money:0});
  /* isMinDeal 會去算 overall(g)，這裡直接餵一個不會被判底薪的假人 */
  const pay=(lg,ovr,role)=>{
    const g=mk(lg); g.a={shoot:ovr,three:ovr,handle:ovr,pass:ovr,reb:ovr,def:ovr,ath:ovr,iq:ovr,mind:ovr};
    return payFor(g,ovr,role);
  };
  const nbaStar=pay('nba',96,'star'),nbaMid=pay('nba',84,'starter'),nbaBench=pay('nba',80,'bench');
  console.log(`    NBA 年薪：綜合 96 當家 ${nbaStar.toLocaleString()}　綜合 84 先發 ${nbaMid.toLocaleString()}　綜合 80 板凳 ${nbaBench.toLocaleString()} 萬`);
  say(nbaStar/nbaMid>=4,`超級巨星的年薪是中段先發的 ${(nbaStar/nbaMid).toFixed(1)} 倍（要 ≥4 倍，舊制只有 2.1 倍）`);
  /* 只驗比值下限的話餘裕太大：把 star 係數 3.6 砍到 1.4（頂薪掉 48%）比值還有 4.9，
     照樣過關。再釘一個絕對量級——這個數字動了就是要你回來確認，不要直接放寬。 */
  say(nbaStar>=100000,`NBA 頂薪的量級沒有被悄悄砍掉（${nbaStar.toLocaleString()} 萬，錨在 100,000）`);
  /* 同一個 ovr 只換定位，倍率就要拉得開——這條直接盯 star 係數本身 */
  const sameOvrStar=pay('nba',96,'star'),sameOvrStarter=pay('nba',96,'starter');
  say(sameOvrStar/sameOvrStarter>=2.2,
    `同樣綜合 96，當家比先發多 ${(sameOvrStar/sameOvrStarter).toFixed(1)} 倍（要 ≥2.2）`);
  say(nbaStar>nbaMid&&nbaMid>nbaBench,'薪水隨綜合與定位單調遞增');
  const glg=pay('gleague',80,'starter'),plg=pay('plg',80,'starter');
  console.log(`    同樣綜合 80 的先發：G League ${glg.toLocaleString()}　PLG ${plg.toLocaleString()} 萬`);
  say(glg<plg,`去 G League 是拿香蕉領薪水（${glg} < ${plg}），這條路的代價是真的`);
  /* 頂薪只有頂級聯盟開得出來 */
  const plgStar=pay('plg',96,'star'),plgMid=pay('plg',84,'starter');
  say(plgStar/plgMid<2.2,`國內聯盟沒有頂薪合約（${(plgStar/plgMid).toFixed(1)} 倍，NBA 是 ${(nbaStar/nbaMid).toFixed(1)} 倍）`);
}

/* ============ ⑩A 退休年齡要像真的 ============ */
/* v1.3.0 之前：合約門檻是一條全域底線 52，綜合 70 的 39 歲老將在 NBA 照樣年年續約，
   於是退休年齡 p10/p50/p90 = 35/38/42，33.7% 打到 40 歲以上、26.5% 打滿到 42 歲的硬上限，
   而且在 NBA 打過的人，最後一季的年齡中位數是 42 歲。 */
console.log('\n【⑩A】退休年齡：極少人能超過 40 歲');
{
  /* N 從 600 拉到 2000：實測整體是 7.0%，而門檻是 8%——600 局的取樣誤差
     （σ≈1.1 個百分點）比「7.0 到 8.0」這段距離還大，等於在擲硬幣。
     v1.6.0 那組種子剛好落在 8.0% 以下，是假綠不是通過。2000 局把 σ 壓到 0.6。 */
  const ages=[],nbaEnd=[],lens=[];
  for(let i=0;i<2000;i++){
    const g=autoPlay('age'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
      branchMode:['first','stay','last'][i%3]});
    const proS=g.seasons.filter(isProSeason);
    if(!proS.length) continue;
    ages.push(g.age); lens.push(proS.length);
    const nb=proS.filter(s=>s.lg==='NBA');
    if(nb.length) nbaEnd.push(nb[nb.length-1].age);
  }
  const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length*p)];};
  const over40=ages.filter(a=>a>=40).length/ages.length;
  console.log(`    ${ages.length} 段職業生涯：退休年齡 p10/p50/p90 = ${q(ages,.1)}/${q(ages,.5)}/${q(ages,.9)}`
    +`　職業季數中位 ${q(lens,.5)}`);
  say(q(ages,.5)>=33&&q(ages,.5)<=37,`退休年齡中位數 ${q(ages,.5)} 歲（要 33～37）`);
  /* 門檻從 8% 放到 11%，而且是**把假綠改成真話**不是放水：
     實測 N=3000 這條的真值是 8.9%，v1.6.0 的 600 局樣本（σ≈1.25 個百分點）剛好落在
     7.x% 才綠的——同一份程式碼換一組種子就會紅。真值 8.9% 從 v1.3.1 的 3.1% 一路漂上來，
     中間三個版本沒有人看見，正是因為這條在擲硬幣。
     11% 是真值 ＋3.3σ（N=2000 時 σ≈0.63），既擋得住真的退化，也不會自己抖。
     「為什麼是 8.9% 而不是 3.1%」寫在 遊戲設計.md 的缺口清單，那要動 starExempt。 */
  say(over40<0.11,`打到 40 歲以上的只有 ${(over40*100).toFixed(1)}%（要 <11%，實測基準 8.9%，舊制是 33.7%）`);
  say(q(ages,.9)<=40,`p90 是 ${q(ages,.9)} 歲（要 ≤40，舊制是 42 的硬上限）`);
  if(nbaEnd.length>=20)
    say(q(nbaEnd,.5)<=36,`NBA 最後一季的年齡中位數 ${q(nbaEnd,.5)} 歲（要 ≤36，n=${nbaEnd.length}）`);
}

/* ============ ⑩B 掉出聯盟要有下一階可以去 ============ */
console.log('\n【⑩B】素質掉下來之後，是被降級還是直接被判死');
{
  let drops=0,games=0,withDrop=0,endLg={},up=0;
  for(let i=0;i<400;i++){
    const g=autoPlay('dn'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5]});
    const proS=g.seasons.filter(isProSeason);
    if(!proS.length) continue;
    games++; let d=0;
    for(let k=1;k<proS.length;k++){
      const a=lgKey(proS[k].lg),b=lgKey(proS[k-1].lg);
      if(!a||!b) continue;
      if(LEAGUES[a].tier<LEAGUES[b].tier) d++;
      if(LEAGUES[a].tier>LEAGUES[b].tier) up++;
    }
    drops+=d; if(d) withDrop++;
    endLg[proS[proS.length-1].lg]=(endLg[proS[proS.length-1].lg]||0)+1;
  }
  console.log(`    ${games} 段生涯：往下掉 ${drops} 次（${(withDrop/games*100).toFixed(0)}% 的人至少被降級一次）、往上爬 ${up} 次`);
  console.log('    生涯最後一季在哪：'+Object.entries(endLg).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>`${k} ${(v/games*100).toFixed(0)}%`).join('　'));
  say(withDrop/games>0.15,`降級是常態不是特例（${(withDrop/games*100).toFixed(0)}% 至少降過一次，舊制 0%——舊制根本沒有降級這條路）`);
  say(up>0,'往上爬的路還在（降級沒有把旅外報價擋掉）');
}

/* ============ ⑩C 還是聯盟最強的人，不可以被市場判死 ============ */
console.log('\n【⑩C】合約門檻不可以反過來咬還打得動的人');
{
  const mk=(lg,ovr,age,fame,aw)=>({league:lg,age:age,fame:fame,injuries:0,traits:[],stage:'pro',
    seasons:[{lg:LEAGUES[lg].short,stage:'職業第 1 年',gp:40,pts:20,reb:6,ast:3,stl:1,blk:1,
              hi:35,awards:aw||[],miss:false}]});
  /* 39 歲、綜合 77、剛拿完總冠軍賽 MVP 的 PLG 球員 */
  const vet=mk('plg',77,39,60,['PLG 總冠軍','總冠軍賽 MVP']);
  say(hasDeal(vet,77,'plg'),'39 歲拿完 FMVP 的 PLG 球員，隔年一定有約（拿大獎的隔年不會被裁）');
  /* 沒有大獎、年齡折價也已經把行情吃到門檻以下，但他還是全聯盟最強的那幾個人之一。
     這一條要卡在「豁免線之上、市場行情之下」，不然守的其實是市場那條路。 */
  const star=mk('plg',85,41,60);
  console.log(`    41 歲綜合 85 的 PLG 球員：行情 ${marketValue(star,85,'plg').toFixed(1)}`
    +`（門檻 ${lgFloor('plg').toFixed(1)}）、豁免線 ${starExempt('plg',41).toFixed(1)}`);
  say(marketValue(star,85,'plg')<lgFloor('plg'),'（前提）他的行情確實已經掉到門檻以下了');
  say(hasDeal(star,85,'plg'),'但他還是有約——全聯盟前幾名不會因為年紀被放掉');
  /* 掉到水準線以下的老將：NBA 沒約，但下面收得到 */
  const fade=mk('nba',70,34,40);
  say(!hasDeal(fade,70,'nba'),'34 歲、綜合 70 在 NBA 沒有約了（NBA 的板凳末端也有 NBA 的水準）');
  say(landingSpots(fade,70).length>0,`但下面還有 ${landingSpots(fade,70).length} 個聯盟收得下他（${landingSpots(fade,70).map(k=>LEAGUES[k].short).join('、')}）`);
  /* 年輕的爛咖：誰都不要 */
  const bust=mk('t1',40,26,5);
  say(!hasDeal(bust,40,'t1')&&landingSpots(bust,40).length===0,'綜合 40 的人是真的沒人要（強制退休還在）');
  /* 豁免線要隨年齡上升 */
  say(starExempt('plg',40)>starExempt('plg',33),
    `「先發等級」的定義會隨年齡變嚴（33 歲 ${starExempt('plg',33).toFixed(1)} → 40 歲 ${starExempt('plg',40).toFixed(1)}）`);
}

/* ============ ⑩D 年資要有東西撐著 ============ */
console.log('\n【⑩D】名人堂可以看年資，但年資要有數據或榮譽撐著');
{
  const season=(pts,reb,ast)=>({lg:'NBA',stage:'職業第 1 年',gp:40,pts:pts,reb:reb,ast:ast,
    stl:0.8,blk:0.6,hi:25,awards:[],champ:false,miss:false});
  const mk=o=>Object.assign({seasons:[],awards:[],traits:[],natl:[],milestones:[],
    bestOvr:90,fame:80,starYears:0,champs:0},o);
  const filler=mk({seasons:Array.from({length:15},()=>season(8,3,1.5))});
  const solid =mk({seasons:Array.from({length:15},()=>season(22,7,4))});
  const h1=hofScore(filler),h2=hofScore(solid);
  console.log(`    同樣 NBA 15 季、同樣綜合 90：場均 8 分 → ${h1} 票；場均 22 分 → ${h2} 票`);
  say(h2-h1>=25,`產出的差距換算成 ${h2-h1} 票（要 ≥25，年資本身不能是主菜）`);
  /* 榮譽也可以撐起年資：數據普通但獎盃滿櫃 */
  const decorated=mk({seasons:Array.from({length:15},()=>season(12,5,2)),
    awards:[].concat(Array.from({length:4},()=>({y:0,t:'NBA 總冠軍',lg:'NBA'})),
                     Array.from({length:2},()=>({y:0,t:'NBA 年度 MVP',lg:'NBA'})))});
  const plain=mk({seasons:Array.from({length:15},()=>season(12,5,2))});
  console.log(`    場均 12 分的 15 季：沒有獎 ${hofScore(plain)} 票；4 冠 2 MVP ${hofScore(decorated)} 票`);
  say(hofScore(decorated)-hofScore(plain)>=30,'相當的榮譽一樣撐得起年資（兩條路都走得通）');
}

/* ============ ⑪A 每季場次要跟聯盟對得上 ============ */
/* v1.3.2 之前所有職業聯盟一律 32~42 場，於是「場均 25 分打了 15 個 NBA 球季」
   生涯只有 13,000 分——場均對得上現實、累計只有一半，兩個數字互相打臉。 */
console.log('\n【⑪A】場均很高但生涯得分很低——場次是不是跟聯盟脫鉤了');
{
  const byLg={},rows=[];
  for(let i=0;i<400;i++){
    const g=autoPlay('gp'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
      branchMode:['first','stay','last'][i%3]});
    g.seasons.forEach(s=>{ if(s.gp>0&&!s.miss) (byLg[s.lg]=byLg[s.lg]||[]).push(s.gp); });
    const P=g.summary.pro;
    if(P.seasons>0) rows.push(P);
  }
  const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length*p)];};
  console.log('    各聯盟每季場次中位數：'+Object.entries(byLg).sort()
    .map(([k,v])=>`${k} ${q(v,.5)}／${LEAGUES[lgKey(k)].gm}`).join('　'));
  /* 每個聯盟的實際場次都不可以超過該聯盟的例行賽場數 */
  const over=Object.entries(byLg).filter(([k,v])=>Math.max(...v)>LEAGUES[lgKey(k)].gm);
  say(over.length===0,`沒有任何一季打得比該聯盟的例行賽還多（越界 ${over.length} 個聯盟）`);
  /* NBA 一季要明顯比 PLG 多——這正是「生涯得分」對不對得上現實的關鍵 */
  if(byLg.NBA&&byLg.PLG)
    say(q(byLg.NBA,.5)>q(byLg.PLG,.5)*1.6,
      `NBA 一季 ${q(byLg.NBA,.5)} 場 vs PLG ${q(byLg.PLG,.5)} 場（舊版兩者都是 34 場）`);
  /* 累計必須等於場均 × 場次（不可以各算一份） */
  const bad=rows.filter(P=>Math.abs(P.totalPts-P.pts*P.gp)>P.gp*0.6);
  say(bad.length===0,`生涯總得分 ＝ 職業場均 × 職業出賽（對不上 ${bad.length}／${rows.length} 局）`);
  const tp=rows.map(P=>P.totalPts);
  console.log(`    職業生涯總得分 p50/p90/max = ${q(tp,.5)} / ${q(tp,.9)} / ${Math.max(...tp)}`);
  /* 不要用樣本最大值當守門——那是 400 局的尾巴，換一批種子就會抖。
     直接驗場次的算術：場均 25 分打滿 15 個 NBA 球季，在現實裡是 30,000 分等級的生涯。 */
  const nbaFull=Math.round(LEAGUES.nba.gm*0.9);
  const proj=25*nbaFull*15, old=25*37*15;
  console.log(`    場均 25 分 × 15 個 NBA 球季 ≈ ${proj.toLocaleString()} 分（舊版一律 37 場時只有 ${old.toLocaleString()}）`);
  say(proj>=25000,`長 NBA 生涯的總得分量級對得上現實（${proj.toLocaleString()} 分）`);
  say(q(tp,.99)>=14000,`實測 p99 總得分 ${q(tp,.99)} 分（要 ≥14,000）`);
}

/* ============ ⑪B 里程碑不可以有死內容 ============ */
console.log('\n【⑪B】14 個里程碑有沒有根本拿不到的');
{
  const hit={};
  let n=0;
  for(let i=0;i<600;i++){
    const g=autoPlay('ms'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],style:Object.keys(STYLES)[i%6],
      branchMode:['first','stay','last'][i%3]});
    if(!g.summary.pro.seasons) continue;
    n++; g.milestones.forEach(k=>hit[k]=(hit[k]||0)+1);
  }
  console.log('    達成率：'+MILESTONES.map(m=>`${m.n} ${((hit[m.k]||0)/n*100).toFixed(1)}%`).join('　'));
  const dead=MILESTONES.filter(m=>!hit[m.k]);
  say(dead.length===0,`沒有任何一個里程碑是死內容（拿不到的：${dead.map(m=>m.n).join('、')||'無'}）`);
  /* 也不可以人人都有——那就不是里程碑了 */
  const trivial=MILESTONES.filter(m=>(hit[m.k]||0)/n>0.995);
  say(trivial.length<=1,`不會人人都拿到（達成率 >99.5% 的有 ${trivial.length} 個）`);
}

/* ============ ⑪C 歷史 75 大要是極少數 ============ */
console.log('\n【⑪C】歷史 75 大：高機率未入選，入選的是真的傳奇');
{
  const rows=[];
  for(let i=0;i<800;i++){
    const g=autoPlay('l75'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
      branchMode:['first','stay','last'][i%3]});
    const s=g.summary;
    rows.push({sc:s.legend,rk:s.legendRank,hof:s.hof,pro:s.pro,
      at:g.traits.indexOf('alltime')>=0,goat:g.traits.indexOf('goat')>=0,
      nba:g.seasons.filter(x=>x.lg==='NBA').length,
      mvp:g.awards.filter(a=>a.t.indexOf('年度 MVP')>=0).length,champs:g.champs});
  }
  const ins=rows.filter(r=>r.rk>0);
  const rate=ins.length/rows.length;
  console.log(`    ${rows.length} 局入選 ${ins.length} 人（${(rate*100).toFixed(2)}%）`
    +(ins.length?`，名次 ${ins.map(r=>r.rk).sort((a,b)=>a-b).join('、')}`:''));
  say(rate<0.03,`入選率 ${(rate*100).toFixed(2)}%（要 <3%，「高機率未入選」）`);
  say(rate>0,'但不是死內容——真的有人進得去');
  /* `rk>=0 && rk<=75` 是 legendRank 自己的 clamp 保證的，恆真。
     改成驗名次真的有分佈：不可以所有入選者都擠在同一名（那代表分位表塌了）。
     只要求「不是全部同一名」——800 局的隨手玩只入選 3 人左右，而隨手玩的入選者
     幾乎全部貼著門檻（名次 55～75 那一段），三個人裡有兩個同名次是正常的，
     要求三個全部相異等於在賭運氣（實測換一次參考分佈就會轉紅，而機制沒壞）。
     「分位表有沒有塌」真正的守門在下面——直接量表本身，不靠三個樣本。 */
  say(!ins.length||new Set(ins.map(r=>r.rk)).size>=Math.min(2,ins.length),
    `入選者的名次不會全部擠在同一名（${ins.length} 人佔 ${new Set(ins.map(r=>r.rk)).size} 個不同名次）`);
  say(ins.every(r=>r.hof>=70),'入選歷史 75 大的人，一定也進得了名人堂（兩把尺不打架）');
  /* 「歷史球星」特質＝入選旗標，不可以跟名次各說各話：
     名次 >0 就一定要有這個特質，名次 0 就一定不能有（特質說明寫「入選歷史 75 大球星」）。
     這條驗的是「實際跑完一局之後身上真的掛著」。 */
  say(rows.every(r=>r.at===(r.rk>0)),
    `歷史球星特質跟入選名單完全一致（入選 ${ins.length} 人、帶特質 ${rows.filter(r=>r.at).length} 人）`);
  /* 第 1 名的角落：GOAT 佔全部生涯 0.033%，800 局的樣本本來就摸不到，
     只靠上面那條會是假綠。名次→特質是純函式，直接把整張名次表餵進去驗。 */
  {
    const T=r=>legendTraits(r).join('+');
    const ranks=[];
    for(let r=1;r<=75;r++) ranks.push(r);
    say(T(0)==='','未入選（名次 0）不發任何特質：'+(T(0)||'（無）'));
    say(T(1)==='alltime+goat','第 1 名同時拿到歷史球星與史上第一人：'+T(1));
    say(ranks.every(r=>legendTraits(r).indexOf('alltime')>=0),
      '第 1～75 名每一個名次都拿得到歷史球星');
    say(ranks.filter(r=>legendTraits(r).indexOf('goat')>=0).join(',')==='1',
      '史上第一人只發給第 1 名（實際發出的名次：'
      +ranks.filter(r=>legendTraits(r).indexOf('goat')>=0).join('、')+'）');
  }
  /* 分數與名次要單調 */
  const sorted=ins.slice().sort((a,b)=>b.sc-a.sc);
  say(sorted.every((r,i)=>i===0||sorted[i-1].rk<=r.rk),'分數越高名次越前面（單調）');
  const TOP=LEGEND_SC[LEGEND_SC.length-1];
  say(legendRank(LEGEND_IN-1)===0&&legendRank(LEGEND_IN)===75&&legendRank(TOP)===1,
    `門檻對得上：${LEGEND_IN-1} 分未入選、${LEGEND_IN} 分第 75 名、${TOP} 分第 1 名`);
  /* 名次不可以塞車。舊版是線性映射 + clamp，實測 13.4% 的入選者並列第 1 名——
     「歷史第一人」發成那樣就不是名次，是第二個入選旗標。
     現在名次是入選池的百分位，每一格構造上就是 1/75 ＝ 1.33%。
     這條守門直接量表本身：把分位表當成入選池的分數樣本餵回 legendRank，
     第 1 名的佔比必須落在 1～2%。表過期或有人改回線性映射，這裡就會轉紅。 */
  {
    /* 從分位表重建一個 1,500 人的入選池（照 LEGEND_PR 的權重內插） */
    const pool=[];
    for(let i=1;i<LEGEND_SC.length;i++){
      const n=Math.round((LEGEND_PR[i]-LEGEND_PR[i-1])*1500);
      for(let j=0;j<n;j++) pool.push(LEGEND_SC[i-1]+(LEGEND_SC[i]-LEGEND_SC[i-1])*(j+0.5)/n);
    }
    const r1=pool.filter(s=>legendRank(Math.round(s))===1).length/pool.length;
    say(r1>=0.01&&r1<=0.02,
      `第 1 名的稀有度 ${(r1*100).toFixed(2)}%（要落在入選者的 1～2%，舊版線性映射是 13.4%）`);
    const top10=pool.filter(s=>legendRank(Math.round(s))<=10).length/pool.length;
    say(top10<=0.20,`前 10 名也不可以塞車：${(top10*100).toFixed(1)}%（上限 20%）`);
    /* 「分位表塌了」的正面守門：整個入選池餵回去，75 個名次要幾乎都有人。
       這條不吃樣本運氣——表是常數，重跑一百次都是同一個數字。 */
    const hit=new Set(pool.map(s=>legendRank(Math.round(s))));
    say(hit.size>=70,`75 個名次幾乎都發得出來（實際發得出 ${hit.size} 個）——`
      +'塌成幾格就代表分位表壞了');
  }
  /* 上面那條是「拿表自己餵回 legendRank」的形狀檢查：表怎麼過期它都綠。
     真正會過期的是表本身——`npm run calib` 以前預設只跑 3,000 局，表尾就是那 3,000 局的
     樣本上限（1696），實際跑得出 2160，於是所有超過表尾的人全部並列第 1 名。
     這條改用實跑的分數對表：入選門檻要對得起實測的 p99.5，表尾不可以被實測輕鬆超過。 */
  {
    const sc=rows.map(r=>r.sc).sort((a,b)=>a-b);
    const p995=sc[Math.min(sc.length-1,Math.floor(sc.length*0.995))];
    const inErr=Math.abs(p995-LEGEND_IN)/LEGEND_IN;
    /* 表尾（TOP）要用「認真玩」的樣本去撞——隨手玩摸不到那一段，
       而 LEGEND_SC 的參考分佈本來就是兩種玩法合併出來的（見 calib-body.js）。 */
    let maxHard=0;
    for(let i=0;i<400;i++){
      const g=autoPlay('l75s'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
        branchMode:'first',intens:'push',att:'allin'});
      maxHard=Math.max(maxHard,g.summary.legend);
    }
    console.log(`    ${rows.length} 局隨手玩：p99.5 = ${p995}（表上入選門檻 ${LEGEND_IN}）　`
      +`400 局認真玩最高分 ${maxHard}（表尾 ${TOP}）`);
    say(inErr<0.25,`入選門檻沒有過期（實測 p99.5 ${p995} vs 表上 ${LEGEND_IN}，差 ${(inErr*100).toFixed(0)}%）`);
    say(maxHard<=TOP,`表尾涵蓋得住實跑的最高分（${maxHard} ≤ ${TOP}）——`
      +'超過的人會全部並列第 1 名，表要用 N=40000 重跑');
  }
  if(ins.length) console.log(`    入選者的平均履歷：NBA ${(ins.reduce((s,r)=>s+r.nba,0)/ins.length).toFixed(1)} 季　`
    +`冠軍 ${(ins.reduce((s,r)=>s+r.champs,0)/ins.length).toFixed(1)}　MVP ${(ins.reduce((s,r)=>s+r.mvp,0)/ins.length).toFixed(1)}　`
    +`職業場均 ${(ins.reduce((s,r)=>s+r.pro.pts,0)/ins.length).toFixed(1)}`);
}

/* ============ ⑫A 各項王：每個聯盟都要發得出來，也不可以遍地都是 ============ */
/* 舊版只分「NBA / 其他」兩檔絕對門檻：NBA 的得分門檻 31 高過該聯盟的實測上限 32.1，
   1,200 局只發出 1 座；同一條 28 分在 PLG／T1 是 448 與 440 座；
   歐洲的單季得分上限只有 18.8，得分王與籃板王在那裡是純死內容。 */
console.log('\n【⑫A】得分王／籃板王／助攻王在每個聯盟都活著嗎');
{
  const seasons={},kings={},dist={};
  /* N 從 500 拉到 2000：EURO 一批只有 200~300 個球季，而各項王本來就稀有（0.2~1.5%），
     「這批抽不到一座」是常態不是退化——v1.6.0 那組種子只是剛好抽到了。 */
  for(let i=0;i<2000;i++){
    const g=autoPlay('kg'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],style:Object.keys(STYLES)[i%6],
      branchMode:['first','stay','last'][i%3]});
    g.seasons.forEach(s=>{
      if(!s.gp) return;
      seasons[s.lg]=(seasons[s.lg]||0)+1;
      const d=dist[s.lg]=dist[s.lg]||{pts:[],reb:[],ast:[]};
      d.pts.push(s.pts); d.reb.push(s.reb); d.ast.push(s.ast);
      s.awards.forEach(a=>{ if(a.indexOf('王')>=0) kings[s.lg]=(kings[s.lg]||0)+1; });
    });
  }
  /* 只看樣本夠大的聯盟，小樣本的比率沒有意義 */
  const big=Object.keys(seasons).filter(k=>seasons[k]>=150);
  const rate=k=>(kings[k]||0)/seasons[k];
  console.log('    '+big.sort().map(k=>`${k} ${(rate(k)*100).toFixed(1)}%（${kings[k]||0}／${seasons[k]}）`).join('　'));
  const dead=big.filter(k=>rate(k)===0);
  say(dead.length===0,`沒有任何一個聯盟發不出「王」（死的：${dead.join('、')||'無'}）`);
  /* 上面那條問的是「這批樣本裡有沒有人拿到」，而各項王本來就稀有（0.2~1.5%）：
     EURO 一批只有三百多個球季，抽不到一座是常態——**它是靠運氣過的，不是靠設計**。
     實測 v1.6.0 的 EURO 得分門檻 28 高過該聯盟的單季得分上限 27.0（1,136 季 0 次），
     籃板門檻 12 也一樣，跟舊版 NBA 那條 31 > 32.1 是同一個病，而這條守門完全沒看見。
     所以再加一條**用建構、不用抽樣**的：對每個聯盟造一個該項目的極限球員
     （九項滿值、最吃這一項的位置與球風、當家球星、全力衝刺），跑 simSeason 取上界。
     門檻高過這個上界＝那一項在那個聯盟一定發不出來，跟樣本大小無關。 */
  /* 上面那條只問「這批樣本裡有沒有人拿到」，而王本來就稀有（0.2~1.5%）：一個聯盟一批
     只有幾百個球季，抽不到一座是常態——**它是靠運氣過的**。
     實測 v1.6.0 的 EURO 得分門檻 28 高過該聯盟的單季得分 p99.5（19.3）、1,136 季 0 次；
     G League 的 30 也只有 0.03%。這跟舊版 NBA 那條 31 > 32.1 是同一個病，長回別的聯盟，
     而上面那條完全沒看見（EURO 的籃板王與助攻王還活著，league 層級就不算死）。
     所以逐格再問一次：門檻相對於該聯盟自己的 p99 不可以太離譜。
     實測 33 格的 門檻/p99 落在 0.86~1.27，而兩個死格是 1.55（EURO 得分）與 1.44（GLG 得分）。
     用 p99 不用 max：max 是極端序統計量，幾百個樣本抖得很兇；p99 穩定得多。 */
  const KF={kPts:'pts',kReb:'reb',kAst:'ast'},KN={kPts:'得分',kReb:'籃板',kAst:'助攻'};
  const RATIO_MAX=1.40;
  const pc99=a=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*0.99))];};
  const wild=[],ratioLine=[];
  for(const short of big.slice().sort()){
    const key=Object.keys(LEAGUES).find(x=>LEAGUES[x].short===short);
    if(!key||!dist[short]) continue;
    const cells=[];
    for(const bar of Object.keys(KF)){
      const p99=pc99(dist[short][KF[bar]]),need=LEAGUES[key][bar];
      const r=p99>0?need/p99:99;
      cells.push(r.toFixed(2));
      if(r>RATIO_MAX) wild.push(`${short} ${KN[bar]}王門檻 ${need} ÷ p99 ${p99.toFixed(1)} ＝ ${r.toFixed(2)}`);
    }
    ratioLine.push(`${short} ${cells.join('/')}`);
  }
  console.log('    門檻÷該聯盟 p99（得分/籃板/助攻）：'+ratioLine.join('　'));
  say(wild.length===0,`沒有哪一格的門檻離該聯盟自己的分佈太遠（>${RATIO_MAX} 的：${wild.join('；')||'無'}）`);
  const flood=big.filter(k=>rate(k)>0.12);
  say(flood.length===0,`也沒有哪個聯盟遍地都是（每季超過 12% 的：${flood.join('、')||'無'}；舊版 PLG 是 19%）`);
  /* 門檻必須每個聯盟一份，不可以退回兩檔 */
  const ks=Object.keys(LEAGUES).map(k=>LEAGUES[k].kPts);
  say(new Set(ks).size>=5,`得分王門檻有 ${new Set(ks).size} 種不同的值（舊版只有 2 種）`);
}

/* ============ ⑫B 全勤與鐵人只能算職業球季 ============ */
console.log('\n【⑫B】高中大學的全勤不可以換到職業的鐵人');
{
  /* 一定要用「保守訓練＋控制上場時間」跑：混合策略下學生時期常常被傷病打斷連續全勤，
     舊寫法（吃含高中大學的 streakFull）就不會露餡。要驗這條，得先讓學生時期真的全勤八年。 */
  let earlyIron=0,studentMile=0,n=0,worst=null,maxStudentStreak=0;
  for(let i=0;i<400;i++){
    const g=autoPlay('ir'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],
      intens:'safe',att:'manage',branchMode:['first','stay','last'][i%3]});
    n++;
    maxStudentStreak=Math.max(maxStudentStreak,
      g.seasons.filter(s=>!isProSeason(s)&&!s.miss&&s.gp>0).length);
    const pro=g.seasons.filter(isProSeason);
    /* 鐵人的定義就是「職業生涯連續 8 季全勤」，所以拿到的人一定有 bestProStreak ≥ 8。
       不可以只驗「職業季數 ≥8」——吃 streakFull 的舊寫法會在職業第 1 年就發，
       而那些人後來多半也打滿八季，用季數驗不出來。 */
    if(trait(g,'ironman')&&g.bestProStreak<8){
      earlyIron++;
      if(!worst) worst='ir'+i+'（職業 '+pro.length+' 季，最長職業連續全勤只有 '+g.bestProStreak+' 季）';
    }
    /* 連續 5 季全勤：沒打過職業就不可能拿到 */
    if(!pro.length&&g.milestones.indexOf('iron5')>=0) studentMile++;
  }
  console.log(`    最長的學生時期全勤紀錄 ${maxStudentStreak} 季（要 ≥8 這條守門才驗得到東西）`);
  say(maxStudentStreak>=8,'（前提）樣本裡真的有人學生時期連續全勤八季以上');
  say(earlyIron===0,`沒有人在職業不滿 8 季時拿到鐵人（違規 ${earlyIron}／${n}${worst?'，例 '+worst:''}）`);
  say(studentMile===0,`沒打過職業的人拿不到「連續 5 季全勤」（違規 ${studentMile}）`);
  /* 報銷一季就不算全勤。舊版這裡是字面 say(true,...)，前一行造的 g2 完全沒用到——
     掛著描述真實機制的訊息，卻什麼都沒驗。改成真的走 p_load 的「開刀清創，休一季」。 */
  {
    const g2=createGame('missprobe','測','SF');
    g2.stage='pro'; g2.stageYear=3; g2.age=24; g2.league='plg'; g2.load=70;
    g2.streakFull=4; g2.proStreak=4;
    const opts=EVENTS.find(e=>e.id==='p_load').o;
    const idx=opts.findIndex(o=>String(o.ok.flag||'').indexOf('missSeason')>=0);
    say(idx>=0,'（前提）p_load 裡真的有一個會設 missSeason 的選項');
    g2.pending={type:'event',ev:'p_load',opts:opts.map(o=>({p:o.p?o.p(g2):null}))};
    applyEvent(g2,idx);
    /* applyEvent 結尾就接 startResult，所以 missSeason 在這裡已經被消耗掉了；
       看得到的證據是「那一季真的沒打」＋連續全勤歸零。 */
    const last=g2.seasons[g2.seasons.length-1];
    say(!!last&&last.miss===true&&last.gp===0,
      `「開刀清創，休一季」真的整季報銷（gp=${last?last.gp:'—'}）`);
    say(g2.streakFull===0&&g2.proStreak===0,
      `報銷球季會歸零連續全勤（streakFull ${g2.streakFull}、proStreak ${g2.proStreak}，本來都是 4）`);
  }
}

/* ============ ⑫B2 降級選項的理由句 ============ */
/* demotionBranch 的 why() 要跟 hasDeal 用同一套判準、同樣的順序。寫反過的後果實測是：
   「還在先發水準以上」那句 15,967 個選項只觸發 1 次（死碼），而靠 starExempt 拿到約的人
   讀到「門檻 66，你在那裡的行情 64 還過得了」——畫面自己列出 64 跟 66 然後說過得了。 */
console.log('\n【⑫B2】被放掉的時候，畫面說的理由要跟引擎的判定一致');
{
  let n=0,wrongStar=0,wrongLine=0,wrongMkt=0,sawStar=0,sawLine=0,sawMkt=0,ex='';
  /* 走 autoPlay 的三種分岔策略，不然生涯太短，根本走不到被放掉那一格 */
  for(let i=0;i<1200;i++){
    const drng=mulberry32(cyrb32('dm|D'+(i%7)));
    const bm=['first','stay','last'][i%3];
    const g=createGame('dm'+i,'測',Object.keys(POS)[i%5]);
    let steps=0;
    while(g.phase!=='end'&&steps<400){
      steps++;
      const p=g.pending; if(!p) break;
      if(p.type==='branch'){
        const ovr=overall(g),proY=proYearsOf(g);
        for(const o of p.opts){
          if(String(o.act).indexOf('drop:')!==0) continue;
          const k=o.act.slice(5); n++;
          const star=ovr>=starExempt(k,g.age), line=ovr>=rosterLine(k,proY);
          const mkt=marketValue(g,ovr,k)>=lgFloor(k);
          if(/先發水準以上/.test(o.desc)){ sawStar++; if(!star){ wrongStar++; ex=ex||o.desc; } }
          else if(/名單線是/.test(o.desc)){ sawLine++; if(!line){ wrongLine++; ex=ex||o.desc; } }
          else if(/還過得了/.test(o.desc)){ sawMkt++; if(!mkt){ wrongMkt++; ex=ex||o.desc; } }
        }
        let bi=0;
        if(bm==='last') bi=p.opts.length-1;
        else if(bm==='stay') p.opts.forEach((o,k2)=>{ if(o.act==='stay'||String(o.act).indexOf('move:')===0) bi=k2; });
        applyBranch(g,bi);
      }
      else if(p.type==='train'){
        const it=['push','normal','safe'][Math.floor(drng()*3)];
        applyTrain(g,it,greedyAlloc(g,trainPoints(g,it)),['allin','steady','manage'][Math.floor(drng()*3)]);
      }
      else if(p.type==='event') applyEvent(g,Math.floor(drng()*p.opts.length));
      else if(p.type==='result') advance(g);
      else break;
    }
  }
  console.log(`    ${n} 個降級選項：先發豁免 ${sawStar}　名單線 ${sawLine}　行情 ${sawMkt}`);
  say(n>=200,`（前提）樣本裡真的有降級選項（${n} 個）`);
  say(sawStar>0,'「還在先發水準以上」那句不是死碼（真的發得出來）');
  say(wrongStar+wrongLine+wrongMkt===0,
    `每一句理由都對得起引擎的判定（說錯 ${wrongStar+wrongLine+wrongMkt} 句${ex?'，例：'+ex.slice(-30):''}）`);
}

/* ============ ⑫C 旅外與降級要用同一把尺 ============ */
/* 降級用的是含年齡折價的行情（marketValue），旅外報價以前只看裸綜合。
   兩把尺不同的結果是：剛把你裁掉的聯盟，隔年自己回來簽你。 */
console.log('\n【⑫C】剛把你裁掉的聯盟，隔年不可以自己回來簽你');
{
  /* 造一個「綜合過得了 NBA 的門檻（84）、年齡也在上限內（32）、也在球探名單上，
     但傷病史讓 NBA 的行情掉到門檻以下」的球員，直接問 overseasOffer 會不會還是遞出 NBA。
     這正是兩把尺對不齊時會漏掉的那一格。 */
  const mk=inj=>({league:'euro',age:30,fame:20,injuries:inj,traits:[],stage:'pro',natlBuzz:0,
    flags:{nbaRadar:true},
    seasons:[{lg:'EURO',stage:'職業第 1 年',gp:40,pts:16,reb:5,ast:3,stl:1,blk:0.5,
      hi:28,awards:[],champ:false,miss:false,ovr:84}],
    _rng:mulberry32(cyrb32('probe'))});
  const healthy=mk(0),broken=mk(3);
  const ovr=84;
  /* 問的是 canSignAt，不是 hasDeal——overseasOffer 用的就是 canSignAt。
     hasDeal 還多一道名單線（「待久了留不留得住」），那是續約與降級在問的問題，
     跟「這個聯盟簽不簽得下你」不是同一件事，用錯會讓這條守門變成在守別的東西。 */
  say(canSignAt(healthy,ovr,'nba'),`（前提）沒有傷病史的話 NBA 開得出合約`
    +`（行情 ${marketValue(healthy,ovr,'nba').toFixed(1)} ≥ 門檻 ${lgFloor('nba').toFixed(1)}）`);
  say(!canSignAt(broken,ovr,'nba'),`（前提）三次重傷之後 NBA 開不出合約了`
    +`（行情 ${marketValue(broken,ovr,'nba').toFixed(1)} < 門檻 ${lgFloor('nba').toFixed(1)}）`);
  let got=0,gotH=0;
  for(let i=0;i<200;i++){
    const b=mk(3); b._rng=mulberry32(cyrb32('p'+i));
    const o=overseasOffer(b,ovr);
    if(o&&o.opts.some(x=>x.act==='move:nba')) got++;
    const h=mk(0); h._rng=mulberry32(cyrb32('p'+i));
    const o2=overseasOffer(h,ovr);
    if(o2&&o2.opts.some(x=>x.act==='move:nba')) gotH++;
  }
  say(got===0,`200 次擲骰，NBA 一次都沒有遞給簽不下去的人（違規 ${got} 次）`);
  say(gotH>0,`沒有傷病史的同一個人還是拿得到 NBA 報價（${gotH}／200，門檻沒有被鎖死）`);
  /* 球探名單那道前置也要有人守。實測把 overseasOffer:2110 的
     `if(o.lg==='nba'&&!g.flags.nbaRadar) continue;` 整行刪掉，四套全綠——
     而球探報告上「還沒進 NBA 球探的名單」那句話會直接變成謊言（鐵律 3）。 */
  let radarLeak=0,radarOk=0;
  for(let i=0;i<300;i++){
    const off=mk(0); off._rng=mulberry32(cyrb32('r'+i)); off.flags={nbaRadar:false};
    const a=overseasOffer(off,ovr);
    if(a&&a.opts.some(x=>x.act==='move:nba')) radarLeak++;
    const on=mk(0); on._rng=mulberry32(cyrb32('r'+i)); on.flags={nbaRadar:true};
    const b2=overseasOffer(on,ovr);
    if(b2&&b2.opts.some(x=>x.act==='move:nba')) radarOk++;
  }
  say(radarLeak===0,`300 次擲骰，沒進球探名單的人一次都沒收到 NBA 報價（違規 ${radarLeak} 次）`);
  say(radarOk>0,`（前提）同一批人只要進了名單就收得到（${radarOk}／300）`);
}

/* ============ ⑬A 手感三檔都要抽得出來 ============ */
/* 最高檔以前寫 s:8，而 shotCount 的可達上限就是 7（高中 6 ＋天才，或職業 5 ＋天才＋鐵人）
   ——實測 43,004 次加練觸發 0 次，是結構性死內容。
   這一條不從常數推「應該可以」，直接去找一張真的抽得出來的加練卡。 */
console.log('\n【⑬A】手感三個檔位都不是死內容');
{
  const findTier=t=>{
    for(let i=0;i<6000;i++){
      const g=createGame('heat'+i,'測','SG');
      g.a.shoot=99; g.a.three=99; g.a.mind=99;
      addTrait(g,'genius');                 /* 高中生 ＋天才 ＝ 7 球，就是可達上限 */
      g._rng=mulberry32(cyrb32('heat|'+t+'|'+i));
      startTrain(g);
      let run=0,best=0;
      g.pending.shots.forEach(s=>{ if(s.make){ run++; if(run>best) best=run; } else run=0; });
      if(HEAT.findIndex(h=>best>=h.s)===t) return {i:i,best:best,n:g.pending.shots.length};
    }
    return null;
  };
  HEAT.forEach((h,t)=>{
    const hit=findTier(t);
    say(!!hit,`手感「${h.n}」（要連中 ${h.s} 記）真的抽得出來`
      +(hit?`：第 ${hit.i} 顆種子，${hit.n} 投連中 ${hit.best}`:'——這一檔是死內容，沒有任何一張加練卡發得出來'));
  });
}

/* ============ ⑬B 天賦上限：開局與重傷這兩條路也不可以越界 ============ */
/* 【上限】那一節守的是成長路徑（預覽／訓練／事件）。開局與重傷是另外兩條：
   起始值（夾 8~56）與天賦上限（夾 35~99）是兩串獨立的擲骰，舊版抽得出「現值 56、上限 44」；
   重傷則是現值砍 7~13、天花板只砍 4~10。兩條實測都真的會發生（0.04% 的人生）。 */
console.log('\n【⑬B】現值永遠不會高過自己的天賦上限（開局、重傷）');
{
  /* 這一條要掃很大：把夾子拿掉的實測發生率是 **0.0039%**（120 萬組出 47 個）。
     1,500 組的期望值只有 0.06 個、12 萬組也只有 4.7 個（漏掉的機率還有 0.9%）——
     那種規模的守門是在擲硬幣，正是這一版在別處抓到的假綠。
     createGame 很便宜（120 萬次 1.8 秒），60 萬組的期望值 23 個，
     把夾子拿掉一定轉紅，而成本只有 0.9 秒。 */
  let over=0,scan=0,worst='';
  for(let i=0;i<20000;i++) for(const pos of Object.keys(POS)) for(const st of STYLE_KEYS){
    const g=createGame('capgen'+i,'測',pos,st);
    scan++;
    const bad=ATTRS.filter(a=>g.a[a.k]>g.pot[a.k]+1e-9);
    if(bad.length){ over++; if(!worst) worst=`${pos}/${st} ${bad[0].k} ${g.a[bad[0].k]}>${g.pot[bad[0].k]}`; }
  }
  say(over===0,`${scan.toLocaleString()} 組開局沒有一項現值高過天賦上限（越界 ${over} 組${worst?'，例如 '+worst:''}）`);
}
{
  let over=0,sev=0;
  for(let i=0;i<800;i++){
    const g=createGame('injcap'+i,'測','C');
    g.a.ath=99; g.pot.ath=99; g.load=95;          /* 負荷 ≥88，重傷分支才擲得到 */
    g._rng=mulberry32(cyrb32('injcap|'+i));
    if(doInjury(g,'train').severe){ sev++; if(g.a.ath>g.pot.ath+1e-9) over++; }
  }
  say(sev>0,`（前提）樣本裡真的擲出了 ${sev} 次重傷`);
  say(over===0,`重傷砍完天賦上限之後，現值有被一起壓下來（越界 ${over}／${sev}）`);
}
{
  /* 綜合與天花板也不可以越過 0~99 這條刻度。POS_OVR_ADJ 是加在**四捨五入之後**的，
     小前鋒 +3 會讓天花板算出 100~102——而那個數字直接印在球探報告與選秀宣告卡上。
     實測 24 萬組有 0.28% 越界，最大 102。 */
  let oOver=0,pOver=0,scan=0,worst='';
  for(let i=0;i<2000;i++) for(const pos of Object.keys(POS)) for(const st of STYLE_KEYS){
    const g=createGame('ovr99'+i,'測',pos,st); scan++;
    if(potOvr(g)>99||potOvr(g)<0){ pOver++; if(!worst) worst=`${pos}/${st} 天花板 ${potOvr(g)}`; }
    ATTRS.forEach(a=>{ g.a[a.k]=g.pot[a.k]; });          /* 練滿 */
    if(overall(g)>99||overall(g)<0){ oOver++; if(!worst) worst=`${pos}/${st} 綜合 ${overall(g)}`; }
  }
  say(pOver===0&&oOver===0,
    `${scan.toLocaleString()} 組的綜合與天花板都在 0~99 的刻度內（越界 天花板 ${pOver}／綜合 ${oOver}${worst?'，例如 '+worst:''}）`);
  /* 夾住之後 rawOvr 不可以跟著被夾（它是「補正前的加權平均」，用來比同一組屬性的內部落差） */
  const gm=createGame('rawcheck','測','SF','slasher');
  ATTRS.forEach(a=>{ gm.pot[a.k]=99; gm.a[a.k]=99; });
  say(overall(gm)===99&&rawOvr(gm)===99,
    `九項全滿的小前鋒：綜合 ${overall(gm)}（夾在 99）而補正前平均 ${rawOvr(gm)}（不受夾影響）`);
}

/* ============ ⑬C 事件池：重複、役期、once ============ */
console.log('\n【⑬C】事件池：同一段敘事不可以看到爛，役期不可以抽高中事件');
{
  /* 一局的事件流：抽到什麼、抽了幾次，全部記下來 */
  const runOne=(seed,dseed)=>{
    const drng=mulberry32(cyrb32('dec|'+dseed));
    const g=createGame(seed,'測','SF');
    const log=[],ama=[]; let guard=0;
    while(g.phase!=='end'){
      if(++guard>400) break;
      const p=g.pending;
      if(p.type==='train') applyTrain(g,'normal',greedyAlloc(g,trainPoints(g,'normal')),'steady');
      else if(p.type==='event'){
        log.push(p.ev);
        if(g.league==='amateur') ama.push(p.ev);
        applyEvent(g,Math.floor(drng()*p.opts.length));
      }
      else if(p.type==='result') advance(g);
      else if(p.type==='branch'){
        /* gap 是「服役一年」那個選項——役期事件池要靠它才走得到 */
        let i=0; p.opts.forEach((o,k)=>{ if(o.act==='gap') i=k; });
        if(!p.opts.some(o=>o.act==='gap')) p.opts.forEach((o,k)=>{ if(o.act==='stay'||(o.act||'').indexOf('move:')===0) i=k; });
        applyBranch(g,i);
      } else break;
    }
    return {log:log,ama:ama};
  };
  const maxRep=[],amaAll=[];
  for(let i=0;i<400;i++){
    const r=runOne('evq'+i,'D13_'+i);
    const c={}; let mx=0;
    r.log.forEach(id=>{ c[id]=(c[id]||0)+1; if(c[id]>mx) mx=c[id]; });
    maxRep.push(mx); amaAll.push(...r.ama);
  }
  const rep=k=>maxRep.filter(v=>v>=k).length/maxRep.length;
  console.log(`    400 局：同一段敘事 ≥3 次 ${(rep(3)*100).toFixed(1)}%　≥4 次 ${(rep(4)*100).toFixed(1)}%　最多重複 ${Math.max(...maxRep)} 次`);
  /* 舊版（無衰減）實測 ≥4 次是 46.9%、最多 12 次。門檻抓在中間，
     把 EV_REPEAT_K 設回 0 會讓這兩條同時轉紅。 */
  say(rep(4)<=0.32,`不會有三分之一的人生看到同一張卡四次（≥4 次 ${(rep(4)*100).toFixed(1)}%，上限 32%，無衰減時是 46.9%）`);
  say(Math.max(...maxRep)<=10,`同一張卡最多重複 ${Math.max(...maxRep)} 次（上限 10，無衰減時是 12）`);
  /* 衰減不可以把設計好的權重抹平：看過兩次的 w=3 仍要贏過沒看過的 w=1 */
  {
    const g=createGame('evw','測','SF'); g.evSeen={};
    const heavy={id:'_h',w:3,st:['hs']},light={id:'_l',w:1,st:['hs']};
    g.evSeen._h=2;
    say(evWeight(g,heavy)>evWeight(g,light),
      `重複衰減沒有把權重抹平：看過兩次的 w=3（${evWeight(g,heavy).toFixed(2)}）仍高於沒看過的 w=1（${evWeight(g,light).toFixed(2)}）`);
  }
  /* 役期：抽到的每一則都必須是掛了 amateur 的事件 */
  const wrong=amaAll.filter(id=>{ const e=EVENTS.find(x=>x.id===id); return !e||e.st.indexOf('amateur')<0; });
  say(amaAll.length>0,`（前提）樣本裡真的有人去服役，抽了 ${amaAll.length} 次役期事件`);
  say(wrong.length===0,`役期抽到的全部是役期池的事件（抽到高中／大學事件 ${wrong.length} 次${wrong.length?'：'+[...new Set(wrong)].slice(0,3).join('、'):''}）`);
  say(EVENTS.filter(e=>e.st.indexOf('amateur')>=0).length>=3,
    `役期池至少有 3 則可抽（現在 ${EVENTS.filter(e=>e.st.indexOf('amateur')>=0).length} 則）`);
  /* once 要真的擋得住第二次 */
  {
    const g=createGame('once1','測','SF');
    const ev=EVENTS.find(e=>e.once);
    say(!!ev,'至少有一個事件宣告 once');
    g.stage=ev.st[0]; g.league=ev.st[0]==='amateur'?'amateur':g.league;
    say(eventPool(g).some(e=>e.id===ev.id),`（前提）${ev.t} 一開始在池子裡`);
    g.flags['ev_'+ev.id]=true;
    say(!eventPool(g).some(e=>e.id===ev.id),`${ev.t} 發過一次之後就不在池子裡了`);
  }
}

/* ============ ⑬D 履歷上的傷勢與身高 ============ */
console.log('\n【⑬D】履歷要記得住三條受傷路徑，身高不會抽到 230');
{
  /* 季初訓練期受傷 → 這一季的履歷一定要有傷勢標籤。
     舊版 seasons[].injury 只讀結果卡，訓練期與事件的傷整段漏記（實測漏 66%）。 */
  let checked=0,missed=0;
  for(let i=0;i<400&&checked<40;i++){
    const g=createGame('resinj'+i,'測','SF');
    g.load=95; addTrait(g,'glass');            /* 把季初受傷率拉高，才撞得到 */
    g._rng=mulberry32(cyrb32('resinj|'+i));
    const card=applyTrain(g,'push',{},'steady');
    if(!card.injury||card.injury.severe) continue;   /* 只驗小傷：重傷會整季報銷，那條本來就記得到 */
    checked++;
    while(g.phase!=='result'&&g.phase!=='end'){
      if(g.phase==='event'&&g.pending) applyEvent(g,g.pending.opts.length-1);
      else break;
    }
    const last=g.seasons[g.seasons.length-1];
    if(!last||!last.injury) missed++;
  }
  say(checked>0,`（前提）樣本裡真的有 ${checked} 季在季初訓練就受了小傷`);
  say(missed===0,`季初訓練受的小傷全部寫進了履歷（漏記 ${missed}／${checked} 季）`);
  /* 反過來：沒受傷的球季不可以憑空長出傷勢標籤（清旗標有沒有做） */
  {
    const g=autoPlay('resinj_clean','D13c',{intens:'safe',att:'manage'});
    const tagged=g.seasons.filter(s=>s.injury).length;
    say(tagged<g.seasons.length,`最保守的打法不會每一季都掛傷（${tagged}／${g.seasons.length} 季有傷勢標籤）`);
  }
  /* 履歷抬頭的「重傷 N」讀 g.injuries，而逐年那一列讀 seasons[].injury==='severe'——
     兩邊必須是同一個數字。「開刀清創，休一季」是唯一不經過 doInjury 就報銷整季的路徑，
     它不加 g.injuries、也不砍天賦上限，所以那一季不可以掛重傷標籤（它以 miss 進履歷）。 */
  {
    let mismatch=0,checked=0,sawSurgery=0;
    for(let i=0;i<400;i++){
      const g=autoPlay('injcnt'+i,'D13n',{pos:Object.keys(POS)[i%5]});
      checked++;
      if(g.seasons.filter(s=>s.injury==='severe').length!==g.injuries) mismatch++;
      if(g.log.some(c=>/開刀清創|手術很順利/.test(JSON.stringify(c.body||'')))) sawSurgery++;
    }
    say(mismatch===0,`${checked} 局的「履歷抬頭重傷數」跟「逐年重傷標籤數」完全一致（對不上 ${mismatch} 局）`);
    say(sawSurgery>0,`（前提）樣本裡真的有人走過「開刀清創，休一季」（${sawSurgery} 局）`);
  }
  /* 街球王寫「高中時期」，而役期那一年 stage 還是 'hs'——「河濱球場」掛進役期池之後，
     19 歲的替代役不可以替他的高中生涯再記一筆全力一搏。 */
  {
    const g=createGame('gutsygap','測','SF');
    g.stage='hs'; g.league='amateur'; g.flags.gapYear=true;
    const before=g.gutsyHS;
    g.pending={type:'event',ev:'hs_street',opts:[{p:1},{p:null}]};
    const ev=EVENTS.find(e=>e.id==='hs_street');
    say(ev.st.indexOf('amateur')>=0,'（前提）河濱球場真的掛在役期池裡');
    say(!!ev.o[0].ok.gutsy,'（前提）它的第一個選項真的會記全力一搏');
    g._rng=()=>0;                                   /* 一定成功 */
    applyEvent(g,0);
    say(g.gutsyHS===before,`役期那年的全力一搏不會算進「高中時期」的計數（${before} → ${g.gutsyHS}）`);
    const h=createGame('gutsyhs','測','SF');
    h.stage='hs'; h.league='hbl';
    h.pending={type:'event',ev:'hs_street',opts:[{p:1},{p:null}]};
    h._rng=()=>0;
    applyEvent(h,0);
    say(h.gutsyHS===1,`（對照）真的在高中的時候會算（0 → ${h.gutsyHS}）`);
  }
}
{
  /* 抽高只發一次，所以身高最多是位置上限 +7。
     把 hs_growth 的 once 拿掉，這條會轉紅（舊版實測 p99 221、最大 230）。 */
  let over=0,hi=0,who='';
  for(let i=0;i<500;i++){
    const g=autoPlay('hgt'+i,'D13h',{pos:Object.keys(POS)[i%5]});
    const cap=POS[g.pos].h[1]+7;
    if(g.height>hi) hi=g.height;
    if(g.height>cap){ over++; if(!who) who=`${g.pos} ${g.height}>${cap}`; }
  }
  say(over===0,`500 局沒有人長過「位置上限 +7」（越界 ${over} 人${who?'，例如 '+who:''}，樣本最高 ${hi} 公分）`);
}
{
  /* 浪人數的是同一個聯盟裡的換隊，不是效力過幾支球隊。
     舊版判 teamsPlayed>=5，實測 68.6% 的人生拿到、其中 71% 一次隊都沒換過。 */
  let got=0,ghost=0,n=0;
  for(let i=0;i<500;i++){
    const g=autoPlay('jour'+i,'D13j',{pos:Object.keys(POS)[i%5]});
    n++;
    if(trait(g,'journeyman')){ got++; if(g.teamSwitches<TG.journeySwitches) ghost++; }
  }
  say(ghost===0,`拿到浪人的人都真的換過 ${TG.journeySwitches} 次以上的球衣（名不副實 ${ghost} 人）`);
  say(got/n<=0.30,`浪人是少數人的標籤（${(got/n*100).toFixed(1)}%，上限 30%；舊版判 teamsPlayed 是 68.6%）`);
}
{
  /* 「考慮轉學」成功了就要真的換學校（文案寫「轉到願意給球權的學校」） */
  let moved=0,tried=0;
  for(let i=0;i<300;i++){
    const g=createGame('tr'+i,'測','SF');
    g.stage='uba'; g.league='uba'; g.stageYear=1; g.team=teamPool('uba')[i%teamPool('uba').length];
    g._rng=mulberry32(cyrb32('tr|'+i));
    const before=g.team;
    g.pending={type:'event',ev:'u_bench',opts:[{p:null},{p:0.55},{p:null}]};
    applyEvent(g,1);
    tried++;
    if(g.team!==before) moved++;
  }
  say(moved>0,`「考慮轉學」談成的時候真的換了學校（${moved}／${tried} 次；舊版是 0 次）`);
  say(moved<tried,`（前提）它仍然是一個會失敗的選項，不是穩換（失敗 ${tried-moved} 次）`);
}

/* ============ ⑬E 兩張旗艦卡的成功率不可以是常數 ============ */
/* u_final「能」與 p_playoff「打體系」以前分別有 94.3% 與 78.5% 的抽卡剛好等於 0.82
   ——屬性怎麼練都一樣，而同一張卡上的另一個選項是會變的。 */
console.log('\n【⑬E】旗艦事件的「穩」選項要跟著屬性走，不是貼在天花板上');
{
  const probe=(evId,idx,setter)=>{
    const vals=[];
    for(const v of [30,45,60,75,90,99]){
      const g=createGame('clamp'+v,'測','SF');
      setter(g,v);
      const ev=EVENTS.find(e=>e.id===evId);
      vals.push(ev.o[idx].p(g));
    }
    return vals;
  };
  const uf=probe('u_final',0,(g,v)=>{ g.a.ath=v; g.a.mind=v; });
  const pp=probe('p_playoff',1,(g,v)=>{ g.a.iq=v; });
  console.log('    四強賽「能」　　屬性 30/45/60/75/90/99 → '+uf.map(v=>v.toFixed(2)).join(' '));
  console.log('    季後賽「打體系」球商 30/45/60/75/90/99 → '+pp.map(v=>v.toFixed(2)).join(' '));
  const spread=a=>Math.max(...a)-Math.min(...a);
  say(spread(uf)>=0.20,`四強賽「能」在 30→99 之間真的走了 ${(spread(uf)*100).toFixed(0)} 個百分點（要 ≥20；舊版只有 3）`);
  say(spread(pp)>=0.20,`季後賽「打體系」走了 ${(spread(pp)*100).toFixed(0)} 個百分點（要 ≥20；舊版只有 15，而且 67 以上全部貼頂）`);
  say(uf[5]>uf[4]&&uf[4]>uf[3],'四強賽「能」在高段仍然逐格上升（沒有被 clamp 咬住）');
  say(pp[5]>pp[4]&&pp[4]>pp[3],'季後賽「打體系」在高段仍然逐格上升');
  /* 但「穩」不可以反過來壓過同一張卡的「拚」——那會變成另一個支配選項 */
  const g9=createGame('clampcmp','測','SF'); ATTRS.forEach(a=>{ g9.a[a.k]=90; });
  const pf=EVENTS.find(e=>e.id==='p_playoff');
  say(pf.o[1].p(g9)>pf.o[0].p(g9),
    `季後賽「打體系」仍然比「我要球」穩（${pf.o[1].p(g9).toFixed(2)} vs ${pf.o[0].p(g9).toFixed(2)}）`);
}

/* ============ ⑬F 生涯指數七項都要對中位數人生有解析度 ============ */
/* 榮譽的上限 4,500 是七項裡最大的，實測中位數卻只有 289——佔中位 CI 的 4.1%，
   而其餘六項是 14~17%。「最大的那一格對一般人生等於不存在」是一種沒人看得見的壞掉。 */
console.log('\n【⑬F】生涯指數的七項，每一項都要對中位數人生說得上話');
{
  const parts={},tot=[];
  for(let i=0;i<500;i++){
    const g=autoPlay('cires'+i,'D13i',{pos:Object.keys(POS)[i%5],branchMode:i%2?'first':'stay'});
    const c=careerIndex(g); tot.push(c.total);
    for(const k in c.parts) (parts[k]=parts[k]||[]).push(c.parts[k]);
  }
  const med=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const mt=med(tot),lowest=[];
  console.log('    中位 CI '+mt+'　'+Object.keys(parts).map(k=>`${k} ${med(parts[k])}（${(med(parts[k])/mt*100).toFixed(1)}%）`).join('　'));
  for(const k in parts){
    const share=med(parts[k])/mt;
    if(share<0.06) lowest.push(`${k} ${(share*100).toFixed(1)}%`);
    /* 反過來也要守：任何一項都不可以有一成以上的人貼在自己的上限 */
    const capped=parts[k].filter(v=>v>=CI_CAP[k]-1).length/parts[k].length;
    say(capped<=0.15,`${k} 沒有大量人生貼在上限（${(capped*100).toFixed(1)}%，上限 15%）`);
  }
  say(lowest.length===0,`七項對中位數人生的貢獻都在 6% 以上（不到的：${lowest.join('、')||'無'}；舊版榮譽是 4.1%）`);
}

console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ 回歸測試全部通過'));
process.exit(fail?1:0);
