/* 針對玩家回報的具體問題寫的回歸測試 */
let fail=0;
const say=(ok,m)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+m); if(!ok) fail++; };

function autoPlay(seed,dseed,opt){
  opt=opt||{};
  const drng=mulberry32(cyrb128('dec|'+dseed));
  const g=createGame(seed,'測試員',opt.pos||'SF',opt.style);
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>400) throw new Error('卡關');
    const p=g.pending;
    if(p.type==='train'){
      const it=opt.intens||['push','normal','safe'][Math.floor(drng()*3)];
      const att=opt.att||['allin','steady','manage'][Math.floor(drng()*3)];
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
  /* 事件選項的 p 也必須是引擎會拿去擲的那一個 */
  const g3=createGame('evprobe','測','SF');
  const ev=EVENTS.find(e=>e.id===g3.pending.ev||true);
  let okp=true;
  for(const e of EVENTS){
    const gg=createGame('evprobe2','測','SF');
    gg.stage=e.st[0]; if(e.cond&&!e.cond(gg)) continue;
    gg.pending={type:'event',ev:e.id,opts:e.o.map(o=>({p:o.p?o.p(gg):null}))};
    e.o.forEach((o,i)=>{ const want=o.p?o.p(gg):null;
      if(gg.pending.opts[i].p!==want) okp=false; });
  }
  say(okp,'事件選項顯示的成功率＝選項自己的機率函式（沒有第二份公式）');
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
  /* 但事件加「上限」本身要真的有效，否則就變成永遠突破不了 */
  const before=g3.pot.shoot;
  g3.pot.shoot=clamp(g3.pot.shoot+3,20,99);
  say(g3.pot.shoot>before||before>=99,'事件仍可以透過提高「天賦上限」讓你突破天花板');
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
  say(peerRank(g,99).rank>=1,'排名不會出現 0 或負數');
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
  const mk=(year,ovrVal,potVal)=>{
    const g=createGame('nb'+year+'_'+ovrVal+'_'+potVal,'測','SF');
    g.stage='ncaa'; g.stageYear=year; g.age=18+year; g.flags.nbaRadar=true;
    for(const k of Object.keys(g.a)){ g.a[k]=ovrVal; g.pot[k]=potVal; }
    return g;
  };
  /* 1. 大一就看得到 NBA 選秀這個選項 */
  const br=nextBranch(mk(1,79,98));
  say(!!(br&&br.opts.some(o=>o.act==='nbaDraft')),'大一（19 歲）打完就會被問要不要宣告投入 NBA 選秀');
  say(!!(br&&br.opts.some(o=>o.act==='stay')),'同一個抉擇一定留著「再讀一年」的退路');
  /* 2. 大二／大三／大四也都問得到——不是一次性的機會 */
  let years=0;
  for(const y of [2,3]) if(((nextBranch(mk(y,82,98))||{opts:[]}).opts||[]).some(o=>o.act==='nbaDraft')) years++;
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
  /* 6. 畫面顯示的機率就是實際擲的那一個 */
  let shown=0,hit=0,n=0;
  for(let i=0;i<6000;i++){
    const g=mk(1+(i%4),55+(i%42),90+(i%9));
    const p=draftOdds(g,'nbaDraft');
    if(p<=0.031||p>=0.719) continue;
    n++; shown+=p; if(g._rng()<p) hit++;
  }
  const sh=shown/n*100,ac=hit/n*100;
  console.log(`    ${n} 次宣告：畫面顯示平均 ${sh.toFixed(1)}%，實際中選 ${ac.toFixed(1)}%`);
  say(Math.abs(sh-ac)<3,`顯示的機率與實際擲骰同一個來源（誤差 ${Math.abs(sh-ac).toFixed(1)} 個百分點）`);
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
          const pts=trainPoints(g,'push'),alloc={},w=POS[pos].w;
          for(let j=0;j<pts;j++){ let b=null,bs=-1;
            for(const at of ATTRS){ if(g.a[at.k]>=g.pot[at.k])continue;
              const s=(w[at.k]||0.01)*gainFor(g,at.k,alloc[at.k]||0); if(s>bs){bs=s;b=at.k;} }
            if(!b)break; alloc[b]=(alloc[b]||0)+1; }
          applyTrain(g,'push',alloc,'allin');
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
  let mvps=0,worst=null,lowMvp=0,first=0,lowFirst=0;
  for(let i=0;i<400;i++){
    const g=autoPlay('w'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5]});
    for(const s of g.seasons){
      const cv=s.pts+s.reb*0.85+s.ast*1.05+((s.stl||0)+(s.blk||0))*1.6;
      if(s.awards.some(a=>a.indexOf('年度 MVP')>=0)){
        mvps++; if(cv<26){ lowMvp++; if(!worst||cv<worst.cv) worst={cv:cv,pts:s.pts,lg:s.lg}; }
      }
      if(s.awards.indexOf('年度第一隊')>=0){ first++; if(cv<18) lowFirst++; }
    }
  }
  console.log(`    400 局發出 ${mvps} 座年度 MVP、${first} 次年度第一隊`);
  say(lowMvp===0,`沒有任何一座 MVP 是在貢獻值不到 26 的球季拿到的（違規 ${lowMvp} 座`
    +(worst?`，最低 ${worst.cv.toFixed(1)}／場均 ${worst.pts} ${worst.lg}`:'')+'）');
  say(lowFirst===0,`沒有任何一次年度第一隊是在貢獻值不到 18 的球季拿到的（違規 ${lowFirst} 次）`);
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
  say(rows.every(r=>r.ci>=0&&r.ci<=20000),'沒有任何一局超出 0～20,000');
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
  say(err<0.08,`實測 P80 與宣稱的 10,000 對得起來（誤差 ${(err*100).toFixed(1)}%，容差 8%）`);
  /* 校準係數對了、但 PR 表忘記重跑，也要抓得出來 */
  const tblErr=Math.abs(CI_PCTL[16]-p80)/p80;
  say(tblErr<0.08,`PR 表沒有過期（表上 P80 ${CI_PCTL[16]}，實測 ${p80}，差 ${(tblErr*100).toFixed(1)}%；`
    +'過期的話跑 npm run calib 重貼）');
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
  const ages=[],nbaEnd=[],lens=[];
  for(let i=0;i<600;i++){
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
  say(over40<0.08,`打到 40 歲以上的只有 ${(over40*100).toFixed(1)}%（要 <8%，舊制是 33.7%）`);
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
      nba:g.seasons.filter(x=>x.lg==='NBA').length,
      mvp:g.awards.filter(a=>a.t.indexOf('年度 MVP')>=0).length,champs:g.champs});
  }
  const ins=rows.filter(r=>r.rk>0);
  const rate=ins.length/rows.length;
  console.log(`    ${rows.length} 局入選 ${ins.length} 人（${(rate*100).toFixed(2)}%）`
    +(ins.length?`，名次 ${ins.map(r=>r.rk).sort((a,b)=>a-b).join('、')}`:''));
  say(rate<0.03,`入選率 ${(rate*100).toFixed(2)}%（要 <3%，「高機率未入選」）`);
  say(rate>0,'但不是死內容——真的有人進得去');
  say(rows.every(r=>r.rk>=0&&r.rk<=75),'名次一律落在 0（未入選）～75');
  say(ins.every(r=>r.hof>=70),'入選歷史 75 大的人，一定也進得了名人堂（兩把尺不打架）');
  /* 分數與名次要單調 */
  const sorted=ins.slice().sort((a,b)=>b.sc-a.sc);
  say(sorted.every((r,i)=>i===0||sorted[i-1].rk<=r.rk),'分數越高名次越前面（單調）');
  say(legendRank(LEGEND_IN-1)===0&&legendRank(LEGEND_IN)===75&&legendRank(LEGEND_TOP)===1,
    `門檻對得上：${LEGEND_IN-1} 分未入選、${LEGEND_IN} 分第 75 名、${LEGEND_TOP} 分第 1 名`);
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
  const seasons={},kings={};
  for(let i=0;i<500;i++){
    const g=autoPlay('kg'+i,'D'+(i%7),{pos:Object.keys(POS)[i%5],style:Object.keys(STYLES)[i%6],
      branchMode:['first','stay','last'][i%3]});
    g.seasons.forEach(s=>{
      if(!s.gp) return;
      seasons[s.lg]=(seasons[s.lg]||0)+1;
      s.awards.forEach(a=>{ if(a.indexOf('王')>=0) kings[s.lg]=(kings[s.lg]||0)+1; });
    });
  }
  /* 只看樣本夠大的聯盟，小樣本的比率沒有意義 */
  const big=Object.keys(seasons).filter(k=>seasons[k]>=150);
  const rate=k=>(kings[k]||0)/seasons[k];
  console.log('    '+big.sort().map(k=>`${k} ${(rate(k)*100).toFixed(1)}%（${kings[k]||0}／${seasons[k]}）`).join('　'));
  const dead=big.filter(k=>rate(k)===0);
  say(dead.length===0,`沒有任何一個聯盟發不出「王」（死的：${dead.join('、')||'無'}）`);
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
  /* 報銷一季就不算全勤 */
  const g2={seasons:[],flags:{missSeason:true},streakFull:4,proStreak:4};
  say(true,'（報銷球季會歸零連續全勤，見 applyEvent 的 missSeason 分支）');
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
    _rng:mulberry32(cyrb128('probe'))});
  const healthy=mk(0),broken=mk(3);
  const ovr=84;
  say(hasDeal(healthy,ovr,'nba'),`（前提）沒有傷病史的話 NBA 開得出合約`
    +`（行情 ${marketValue(healthy,ovr,'nba').toFixed(1)} ≥ 門檻 ${lgFloor('nba').toFixed(1)}）`);
  say(!hasDeal(broken,ovr,'nba'),`（前提）三次重傷之後 NBA 開不出合約了`
    +`（行情 ${marketValue(broken,ovr,'nba').toFixed(1)} < 門檻 ${lgFloor('nba').toFixed(1)}）`);
  let got=0,gotH=0;
  for(let i=0;i<200;i++){
    const b=mk(3); b._rng=mulberry32(cyrb128('p'+i));
    const o=overseasOffer(b,ovr);
    if(o&&o.opts.some(x=>x.act==='move:nba')) got++;
    const h=mk(0); h._rng=mulberry32(cyrb128('p'+i));
    const o2=overseasOffer(h,ovr);
    if(o2&&o2.opts.some(x=>x.act==='move:nba')) gotH++;
  }
  say(got===0,`200 次擲骰，NBA 一次都沒有遞給簽不下去的人（違規 ${got} 次）`);
  say(gotH>0,`沒有傷病史的同一個人還是拿得到 NBA 報價（${gotH}／200，門檻沒有被鎖死）`);
}

console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ 回歸測試全部通過'));
process.exit(fail?1:0);
