/* 深度稽核：找結構性缺口，不是跑分 */
const bad=[];
const chk=(ok,m)=>{ console.log((ok?'  ok   ':'  ⚠    ')+m); if(!ok) bad.push(m); };

console.log('【A】常數表的內部一致性');
for(const p of Object.keys(POS)){
  const sum=Object.values(POS[p].w).reduce((s,v)=>s+v,0);
  chk(Math.abs(sum-1)<1e-9,`${p} 權重加總 ${sum.toFixed(4)}（必須是 1）`);
}
for(const p of Object.keys(POS)) chk(Object.keys(POS[p].w).length===ATTRS.length,
  `${p} 權重涵蓋全部 ${ATTRS.length} 項屬性`);
for(const k of Object.keys(LEAGUES)){
  const L=LEAGUES[k];
  chk(L.bar>0&&L.sd>0&&L.size>0,`${L.short} 有 bar/sd/size`);
}
for(const o of OVERSEAS){
  chk(!!LEAGUES[o.lg],`旅外目標 ${o.lg} 存在於 LEAGUES`);
  chk(o.from.every(f=>!!LEAGUES[f]),`${o.label} 的來源聯盟都存在`);
  chk(teamPool(o.lg).length>0,`${o.label} 有球隊名單`);
}
for(const k of Object.keys(LEAGUES)) chk(teamPool(k).length>0,`${LEAGUES[k].short} 有球隊名單`);
{
  /* 海外報價只在 stage==='pro' 擲，且 from 比對的是「當下所在聯盟」。
     所以 from 裡放學生聯盟＝死條件，而且會讓球探報告的提示文案騙人。 */
  const student=['hbl','uba','ncaa'];
  const dead=OVERSEAS.filter(o=>o.from.some(f=>student.indexOf(f)>=0)).map(o=>o.label);
  chk(dead.length===0,`旅外路線的 from 不含學生聯盟（永遠不會生效的：${dead.join('/')||'無'}）`);
}

console.log('\n【B】內容可達性：有沒有寫了但玩家永遠看不到的東西');
/* 評價等級 */
{
  const seen={};
  for(let i=0;i<600;i++){
    const g=play('gr'+i,i%5);
    seen[g.summary.grade.g]=(seen[g.summary.grade.g]||0)+1;
  }
  const all=['S','A','B','C','D','E','F'];
  const miss=all.filter(x=>!seen[x]);
  console.log('    評價分佈：'+all.map(x=>`${x}:${seen[x]||0}`).join(' '));
  chk(miss.length===0,`所有評價等級都拿得到（缺 ${miss.join('/')||'無'}）`);
}
/* 特質定義 vs 程式碼引用 */
{
  const src=ENGINE_SRC;
  const undef=[];
  /* 識別字要含數字與底線，否則 trait(g,'redeem2') 這種打錯的名字會從網眼溜掉 */
  const re=/addTrait\(g,'([A-Za-z0-9_]+)'\)/g; let m;
  const added=new Set();
  while((m=re.exec(src))) added.add(m[1]);
  added.forEach(t=>{ if(!TRAITS[t]) undef.push('addTrait 用了未定義的特質 '+t); });
  const re2=/\btrait\(g,'([A-Za-z0-9_]+)'\)/g; const read=new Set();
  while((m=re2.exec(src))) read.add(m[1]);
  read.forEach(t=>{ if(!TRAITS[t]) undef.push('trait() 查詢了未定義的特質 '+t+'（永遠回傳 false）'); });
  undef.forEach(x=>chk(false,x));
  chk(undef.length===0,`程式碼引用的特質全部有定義（問題 ${undef.length} 個）`);
  const never=Object.keys(TRAITS).filter(t=>!added.has(t));
  chk(never.length===0,`每個定義過的特質都有地方發得出來（發不出來的：${never.join('/')||'無'}）`);
}
/* 事件池永遠不會空 */
{
  let empty=0;
  for(const st of ['hs','uba','ncaa','pro']){
    for(let y=1;y<=8;y++) for(const fame of [0,50,100]) for(const load of [0,60,95]){
      const g=createGame('ev','測','SF'); g.stage=st; g.stageYear=y; g.fame=fame; g.load=load;
      g.age=st==='pro'?20+y:16+y;
      if(eventPool(g).length===0) empty++;
    }
  }
  chk(empty===0,`各階段的事件池都不會是空的（空池 ${empty} 種組合）`);
}

console.log('\n【C】數值出口的合理範圍');
{
  let badPct=0,badNum=0,n=0,maxPts=0,maxHi=0,maxPay=0;
  for(let i=0;i<400;i++){
    const g=play('rng'+i,i%5);
    for(const s of g.seasons){
      n++;
      if(!s.miss){
        if(s.fg<25||s.fg>70) badPct++;
        if(s.tp<8||s.tp>55) badPct++;
        if(s.ft<35||s.ft>99) badPct++;
        if(s.hi<s.pts) badNum++;                     /* 單場最高不可能低於場均 */
        if(s.pts<0||s.reb<0||s.ast<0) badNum++;
        maxPts=Math.max(maxPts,s.pts); maxHi=Math.max(maxHi,s.hi);
      }
      maxPay=Math.max(maxPay,s.pay);
      if([s.pts,s.reb,s.ast,s.stl,s.blk,s.fg,s.tp,s.ft,s.hi].some(v=>!isFinite(v))) badNum++;
    }
  }
  console.log(`    ${n} 個球季：最高單季場均 ${maxPts}　最高單場 ${maxHi}　最高年薪 ${maxPay.toLocaleString()} 萬`);
  chk(badPct===0,`命中率都在合理區間（越界 ${badPct} 次）`);
  chk(badNum===0,`沒有負數/NaN/單場低於場均（異常 ${badNum} 次）`);
  chk(maxHi<=100,`單場最高不超過 100 分（實際 ${maxHi}）`);
  /* 場均刻意不設軟上限（使用者裁示：滿天賦賴在弱聯盟刷到 50 分是合理回報）。
     這裡只守「不會離譜到失真」的外框，別再把它收成 40。 */
  chk(maxPts<60,`單季場均沒有失真（最高 ${maxPts}，外框 60）`);
}

console.log('\n【D】狀態機：走得完、不會卡、不會漏');
{
  let stuck=0,longest=0,phases={};
  for(let i=0;i<300;i++){
    const g=createGame('sm'+i,'測',Object.keys(POS)[i%5]);
    let steps=0;
    while(g.phase!=='end'&&steps<600){
      steps++; phases[g.phase]=(phases[g.phase]||0)+1;
      const p=g.pending;
      if(!p){ stuck++; break; }
      if(p.type==='train'){
        /* 故意什麼都不分配：最極端的玩家行為 */
        applyTrain(g,'safe',{},'manage');
      }
      else if(p.type==='event'){
        if(!p.opts||!p.opts.length){ stuck++; break; }
        applyEvent(g,p.opts.length-1);
      }
      else if(p.type==='result') advance(g);
      else if(p.type==='branch'){
        if(!p.opts||!p.opts.length){ stuck++; break; }
        applyBranch(g,p.opts.length-1);              /* 永遠選最後一個（通常最保守） */
      }
      else { stuck++; break; }
    }
    if(steps>=600) stuck++;
    longest=Math.max(longest,steps);
  }
  console.log('    各階段出現次數：'+Object.keys(phases).map(k=>`${k}:${phases[k]}`).join(' '));
  chk(stuck===0,`300 局「完全不分配點數＋永遠選最後一個選項」都能走到結束（卡住 ${stuck} 局）`);
  console.log(`    最長一局 ${longest} 步`);
}
{
  /* 分岔選項不可以有空標籤或重複的 act */
  let blank=0,dupAct=0,noOpt=0,checked=0;
  for(let i=0;i<300;i++){
    const g=createGame('br'+i,'測',Object.keys(POS)[i%5]);
    let steps=0;
    while(g.phase!=='end'&&steps<600){
      steps++;
      const p=g.pending; if(!p) break;
      if(p.type==='branch'){
        checked++;
        if(!p.opts.length) noOpt++;
        const acts=p.opts.map(o=>o.act);
        if(new Set(acts).size!==acts.length) dupAct++;
        if(p.opts.some(o=>!o.label||!o.desc)) blank++;
        applyBranch(g,0);
      }
      else if(p.type==='train') applyTrain(g,'normal',{},'steady');
      else if(p.type==='event') applyEvent(g,0);
      else if(p.type==='result') advance(g);
      else break;
    }
  }
  chk(noOpt===0,`檢查 ${checked} 個抉擇，沒有零選項的（${noOpt}）`);
  chk(dupAct===0,`沒有重複 act 的選項（${dupAct}）`);
  chk(blank===0,`沒有空標籤或空說明的選項（${blank}）`);
}

console.log('\n【E】重現性：新增的機制有沒有破壞「同種子同選擇＝同人生」');
{
  let diff=0;
  for(const sd of ['aaa11111','zz9q4x2m','pe7ff6ae']){
    for(const st of ['allround','shooter']){
      const a=JSON.stringify(play(sd,2,st).seasons);
      const b=JSON.stringify(play(sd,2,st).seasons);
      if(a!==b) diff++;
    }
  }
  chk(diff===0,`6 組（種子×球風）各跑兩次結果完全相同（不同 ${diff} 組）`);
  /* 球風不可以互相污染：換球風必須換出不同人生 */
  const s1=JSON.stringify(play('styx',2,'shooter').seasons);
  const s2=JSON.stringify(play('styx',2,'anchor').seasons);
  chk(s1!==s2,'同種子換球風會跑出不同人生');
  /* 已經告訴使用者的推薦種子要釘死。開局天賦是 createGame 裡的固定擲骰順序決定的，
     只要有人在 createGame 之前或之中多加／少加一次 rng，這些數字就會全部位移，
     使用者手上那張種子表就變成廢紙。這條轉紅＝「你剛剛把所有公布過的種子弄壞了」。 */
  const PINNED={
    '6dkts3aa':[97,98], 'uf3minda':[99,98], 'mhkq46aa':[98,96],
    'wxzg77aa':[97,99], '7dmsy2ba':[98,100],
  };
  const drift=[];
  for(const sd of Object.keys(PINNED)){
    const [tb,du]=PINNED[sd];
    /* 位置與球風不可以影響天賦與體質，所以順便掃過全部組合 */
    let hit=false;
    for(const pos of Object.keys(POS)){
      for(const st of STYLE_KEYS){
        const g=createGame(sd,'X',pos,st);
        if(g.talentBand!==tb||g.dura!==du){
          drift.push(`${sd} 應為 天賦${tb}／體質${du}，實際 天賦${g.talentBand}／體質${g.dura}（${pos}/${st}）`);
          hit=true; break;
        }
      }
      if(hit) break;
    }
  }
  drift.slice(0,3).forEach(x=>chk(false,x));
  chk(drift.length===0,`公布過的 5 顆推薦種子開局天賦沒有位移（位移 ${drift.length} 顆）`);
}

console.log('\n'+(bad.length?`⚠ ${bad.length} 項要處理`:'✓ 稽核全部通過'));
