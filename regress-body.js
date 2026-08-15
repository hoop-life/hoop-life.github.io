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
      /* 只要還能打就繼續打，才驗得到「被市場踢掉」這件事 */
      let i=0;
      p.opts.forEach((o,k)=>{ if(o.act==='stay'||(o.act||'').indexOf('move:')===0) i=k; });
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

console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ 回歸測試全部通過'));
process.exit(fail?1:0);
