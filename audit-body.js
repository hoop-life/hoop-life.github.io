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
  /* teamPool 以前查不到會靜默退回 PLG_TEAMS：新增聯盟忘了補隊名，玩家會在 NBA
     穿著新北國王的球衣，畫面完全正常、五套測試全綠。現在查不到要吵。 */
  let threw=false;
  try{ teamPool('nosuchleague'); }catch(e){ threw=true; }
  chk(threw,'teamPool 對未知聯盟會丟例外（不是靜默退回 PLG）');
  const orphan=Object.keys(LEAGUE_TEAMS).filter(k=>!LEAGUES[k]);
  chk(orphan.length===0,`LEAGUE_TEAMS 沒有對不到聯盟的孤兒（${orphan.join('/')||'無'}）`);
}
{
  /* 「哪些聯盟會進 NBA 球探名單」以前寫在四個分支＋一段文案裡，兩份字面清單各寫一次。
     現在唯一來源是 LEAGUES[k].nbaScouted，這裡端到端驗它真的接上 applyBranch，
     而且球探報告那句文案講的就是同一份名單（鐵律 3）。 */
  const scouted=nbaScoutedLgs();
  chk(scouted.length>0&&scouted.every(k=>!!LEAGUES[k]),`nbaScouted 名單有效：${scouted.join('/')}`);
  const wrong=[];
  for(const k of Object.keys(LEAGUES)){
    if(!LEAGUES[k].pay) continue;                 /* 學生聯盟不是 move: 的目的地 */
    const g=createGame('radar_'+k,'測','SF');
    g.stage='pro'; g.stageYear=1; g.league='plg'; g.team=teamPool('plg')[0];
    g.phase='branch'; g.pending={type:'branch',title:'t',opts:[{label:'x',act:'move:'+k}]};
    applyBranch(g,0);
    if(!!g.flags.nbaRadar!==!!LEAGUES[k].nbaScouted) wrong.push(k);
  }
  chk(wrong.length===0,`move: 到每個聯盟給不給球探名單，跟 LEAGUES.nbaScouted 完全一致（不一致：${wrong.join('/')||'無'}）`);
  {
    /* 球探報告的提示文案必須列出（且只列出）名單上的聯盟 */
    const g=createGame('radartext','測','SF');
    g.stage='pro'; g.stageYear=1; g.league='euro'; g.team=teamPool('euro')[0];
    g.flags.nbaRadar=false;
    const note=(scoutReport(g).rows.find(r=>r.n==='NBA')||{}).note||'';
    /* 只看「打過 …，」那一段，不要整句掃——整句裡的「NBA 球探的名單」會讓 NBA 被誤算進去 */
    const seg=(note.match(/打過 ([^，]+)，/)||[])[1]||'';
    const listed=seg.split('／');
    const want=scouted.map(k=>LEAGUES[k].short);
    chk(listed.length===want.length&&want.every(s=>listed.indexOf(s)>=0),
      `球探報告的「還沒進名單」文案列的就是 nbaScouted 那幾個（文案：${seg||'（沒抓到）'}）`);
  }
}
{
  /* 一年只能問一次分岔。takeNextBranch 會擲骰，重複呼叫＝整條亂數序列往前推，
     所有公布過的種子失效，而開局指紋抓不到（那是 createGame 的亂數）。 */
  const g=createGame('twice','測','SF');
  g.stage='pro'; g.stageYear=2; g.league='plg'; g.team=teamPool('plg')[0]; g.age=26;
  takeNextBranch(g);
  let threw=false;
  try{ takeNextBranch(g); }catch(e){ threw=true; }
  chk(threw,'同一年連問兩次 takeNextBranch 會丟例外（它會擲骰，不是純查詢）');
}
{
  /* 區域變數不可以遮蔽引擎的全域函式。
     踩過的例子：applyBranch 的 NBA 選秀中選區塊寫了 `const pick=…順位數字`，
     把全域的 pick(rng,arr) 遮掉。當時能跑只是因為 move() 定義在區塊外、
     閉包抓到的是全域那一個——把 move 內聯回來、或在該區塊多寫一行要抽隨機隊名的
     程式碼，就會變成拿一個數字當函式呼叫（TypeError），而且那條路徑（選秀中選）
     煙霧測試不一定每次都走到。 */
  const fns=new Set();
  ENGINE_SRC.replace(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm,(m,n)=>{fns.add(n);return m;});
  const shadows=[];
  ENGINE_SRC.split('\n').forEach((ln,i)=>{
    const m=ln.match(/(?:^|[;{}(\s])(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/);
    if(m&&fns.has(m[1])) shadows.push(`第 ${i+1} 行的 ${m[1]}`);
  });
  chk(shadows.length===0,`沒有區域變數遮蔽全域函式（${shadows.join('、')||'無'}）`);
}
{
  /* once 的清單釘死。v1.7.0 之前這裡釘的是「0 個在用」，用意是提醒「加第一個會改變
     eventPool 的權重分佈」；現在有三個在用，改成正向釘住是哪三個。
     判準是**結果文案宣告了一個回不去的狀態**：抽高（永久加身高）、球探來了
     （「被發現的那一刻」）、新人牆（「第一次適應職業節奏」）。加減一個都要重新宣告種子。 */
  const ONCE_IDS=['hs_growth','hs_scout','p_rookie'];
  const once=EVENTS.filter(e=>e.once).map(e=>e.id).sort();
  chk(once.join(',')===ONCE_IDS.slice().sort().join(','),
    `e.once 就是釘死的那 ${ONCE_IDS.length} 個（現在：${once.join('/')||'無'}）——`
    +'加減一個會改變 eventPool 的權重分佈，等於改亂數順序');
  /* 掛了 once 的事件，發過之後不可以讓它所在的任何一個階段只剩一兩張卡在輪——
     那是拿更嚴重的重複去換比較輕的重複。u_agent 就是這樣被否決的：
     大三大四的池子是 u_weight／u_final／u_agent 三張（u_bench 只到大二），
     掛上去之後只剩兩張。 */
  const thin=[];
  EVENTS.filter(e=>e.once).forEach(e=>e.st.forEach(tag=>{
    const left=EVENTS.filter(y=>y.st.indexOf(tag)>=0&&!y.once).length;
    if(left<3) thin.push(`${e.id} 掛掉之後 ${tag} 只剩 ${left} 張`);
  }));
  chk(thin.length===0,`每個掛 once 的事件所在階段，扣掉全部 once 之後都還有 ≥3 張卡（太薄的：${thin.join('、')||'無'}）`);
  /* 每個階段的池子都要有東西可抽（役期那一池是 v1.7.0 新加的，空池會讓 startEvent 抽到 undefined） */
  const empty=['hs','amateur','uba','ncaa','pro'].filter(tag=>EVENTS.filter(e=>e.st.indexOf(tag)>=0).length===0);
  chk(empty.length===0,`五個階段的事件池都不是空的（空的：${empty.join('、')||'無'}）`);
  const withTrait=[];
  EVENTS.forEach(e=>(e.o||[]).forEach(o=>['ok','bad'].forEach(r=>{
    if(o[r]&&o[r].trait) withTrait.push(e.id+'.'+r); })));
  chk(withTrait.length===0,`res.trait 目前 0 個事件在用（現在：${withTrait.join('/')||'無'}）`);
}
{
  /* 內容數量要有寫死的錨。regress ⑪B／⑦E 都是拿 MILESTONES 自己當基準，
     所以「刪掉一整條里程碑」反而讓那兩條更容易過——實測刪 hi60 四套全綠。 */
  const MS_KEYS=['pts1k','pts5k','pts10k','pts20k','reb3k','ast3k','gp500','gp1000',
                 'hi40','hi50','hi60','iron5','tri','ace'];
  const now=MILESTONES.map(m=>m.k);
  const miss=MS_KEYS.filter(k=>now.indexOf(k)<0);
  chk(MILESTONES.length===MS_KEYS.length&&miss.length===0,
    `里程碑還是釘死的那 ${MS_KEYS.length} 條（現在 ${MILESTONES.length} 條，少了：${miss.join('/')||'無'}）`);
}
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
  /* 歷史 75 大那兩個是用 legendTraits(名次) 發的，addTrait 收到的是變數不是字面量，
     字串掃描看不到。直接問那個純函式它到底會發出哪些特質——
     漏掉的話「每個定義過的特質都有地方發得出來」會誤報，而且是用「放寬」的方式誤報。 */
  for(let r=0;r<=75;r++) legendTraits(r).forEach(t=>added.add(t));
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

console.log('\n【F】單一來源：同一個真相有沒有被抄成第二份');
{
  /* 貪婪分配以前在六個檔案裡各抄一份、分裂成兩種行為。現在唯一一份在引擎的
     greedyAlloc，UI 的「自動分配」按鈕與五個測試／產生器都呼叫它。
     那段程式碼裡「位置權重 × 這一點的成長」那個運算式是它的指紋，
     出現第二次就是有人又抄了一份（指紋字串在下一行拼出來，免得掃到這段註解自己）。 */
  /* 指紋要拼出來，不能寫成字面值——這個檔自己也會被掃到。
     實作在 greedyInto()，greedyAlloc 與 gateAlloc 都轉呼叫它，所以指紋仍然只有一份。 */
  const FP='(w[at.'+'k]!=null?w[at.'+'k]:0.01)';
  const where=[];
  if(ENGINE_SRC.split(FP).length-1>1) where.push('引擎裡出現多次');
  if(UI_SRC.indexOf(FP)>=0) where.push('UI');
  Object.keys(SRC_FILES).forEach(f=>{ if(SRC_FILES[f].indexOf(FP)>=0) where.push(f); });
  chk(where.length===0,`貪婪分配只有一份（引擎的 greedyAlloc）——又抄了一份的：${where.join('、')||'無'}`);
  chk(typeof greedyAlloc==='function','greedyAlloc 在引擎裡（測試與 UI 都吃得到）');
}
{
  /* 自動玩家的分岔評分表不可以有靜默的 fallback。
     舊版比對一個不存在的 act 'tryJapan'（引擎產生的是 'try:'+lg），
     於是「畢業直接闖日本／韓國／澳洲」在認真玩的樣本裡從來沒被選過，
     而 :20 的 fallback 讓它一聲不吭。現在沒列到的 act 會進 ACT_UNSCORED。 */
  ACT_UNSCORED.clear();
  for(let i=0;i<120;i++) autoPlaySerious('act'+i,i%5,STYLE_KEYS[i%STYLE_KEYS.length]);
  const miss=[...ACT_UNSCORED];
  chk(miss.length===0,`自動玩家的分岔評分表列全了所有 act（沒列到的：${miss.join('、')||'無'}）`);
  /* 反過來也要驗：表裡不可以有引擎根本不會產生的 act（那就是下一個 tryJapan） */
  const emitted=new Set();
  ENGINE_SRC.replace(/act:'([A-Za-z0-9_:]+)'/g,(s,a)=>{emitted.add(a.split(':')[0]);return s;});
  ENGINE_SRC.replace(/act:'([A-Za-z0-9_]+):'/g,(s,a)=>{emitted.add(a);return s;});
  const ghost=Object.keys(ACT_SCORE).filter(k=>!emitted.has(k));
  chk(ghost.length===0,`評分表裡沒有引擎不會產生的 act（幽靈：${ghost.join('、')||'無'}）`);
}
{
  /* 特質的說明字串不可以自己寫一份數字。踩過四次：鐵人說「職業連續 8 季」但吃的是
     含高中的連續全勤、浪人說「換隊 5 次」但算的是效力過 5 支球隊、常勝軍說「生涯冠軍」
     但只算職業冠軍、萬年板凳門檻從 5 季改成 3 季而說明留在 5。
     現在門檻只有 TG 一份，說明用模板字串吃它——這條守門盯著「有沒有人又寫死一個數字」。 */
  const blk=(ENGINE_SRC.match(/const TRAITS=\{[\s\S]*?\n\};/)||[''])[0];
  const hard=[];
  blk.split('\n').forEach(ln=>{
    const m=ln.match(/^\s*([A-Za-z0-9_]+)\s*:\{.*?\bd:(.*)$/);
    if(!m) return;
    /* 把 ${...} 內插整段拿掉，剩下的就是真的寫死在字串裡的東西 */
    if(/\d/.test(m[2].replace(/\$\{[^}]*\}/g,''))) hard.push(m[1]);
  });
  chk(blk.length>0,'抓得到 TRAITS 的原始碼區塊');
  chk(hard.length===0,`特質說明沒有寫死的數字（都從 TG 來）——寫死的：${hard.join('、')||'無'}`);
  /* 反過來：TG 裡的每一個門檻都要真的有人用（宣告了沒用到＝下一個會走鐘的死常數） */
  const unused=Object.keys(TG).filter(k=>ENGINE_SRC.split('TG.'+k).length-1<2);
  chk(unused.length===0,`TG 的每個門檻都同時被判定與說明用到（只用一次的：${unused.join('、')||'無'}）`);
}
{
  /* 文件抄了一份公式／常數，然後其中一份改了——這個專案最會生 bug 的模式。
     數值設定.md 裡的每一個數字沒辦法全部自動比對，但**表格型的常數可以**：
     聯盟表 12 列 × 9 欄一格一格對，錯一格就轉紅。 */
  const md=DOC_FILES['數值設定.md'];
  const cells=l=>l.split('|').map(x=>x.trim()).filter((x,i,a)=>i>0&&i<a.length-1);
  const num=t=>parseFloat(String(t).replace(/,/g,''));
  const bad2=[]; let checkedCells=0;
  /* ① 聯盟表：`key` | 名稱 | 層級 | bar | sd | 人數 | 難度 | 節奏 | 薪資係數 | gm */
  /* 聯盟代號含數字（t1），[a-z]+ 會漏掉它——漏一列還是會通過列數斷言以外的每一格 */
  const rows=md.split('\n').filter(l=>/^\|\s*`[a-z0-9]+`\s*\|/.test(l));
  const COLS=['tier','bar','sd','size','diff','pace','pay','gm','teams','awMid','awSpr','cMid'];
  for(const line of rows){
    const c=cells(line);
    const key=c[0].replace(/`/g,'');
    const L=LEAGUES[key];
    if(!L){ bad2.push(key+' 不在 LEAGUES'); continue; }
    COLS.forEach((f,i)=>{
      const txt=c[2+i]; if(txt===undefined||txt==='') return;
      checkedCells++;
      const v=num(txt);
      if(!isFinite(v)) bad2.push(`${key}.${f} 讀不到數字（${txt}）`);
      else if(Math.abs(v-L[f])>1e-9) bad2.push(`${key}.${f}：文件 ${v}／程式 ${L[f]}`);
    });
  }
  chk(rows.length===Object.keys(LEAGUES).length,
    `數值設定.md 的聯盟表列數＝聯盟數（文件 ${rows.length} 列／程式 ${Object.keys(LEAGUES).length} 個）`);
  /* ② 各項王門檻表：三列（得分／籃板／助攻）× 12 個聯盟，欄序＝ LEAGUES 的宣告順序 */
  const kRow={'得分':'kPts','籃板':'kReb','助攻':'kAst'};
  const order=Object.keys(LEAGUES);
  for(const label of Object.keys(kRow)){
    const line=md.split('\n').find(l=>new RegExp('^\\|\\s*'+label+'\\s*\\|').test(l));
    if(!line){ bad2.push('找不到各項王的「'+label+'」那一列'); continue; }
    const c=cells(line).slice(1);
    if(c.length!==order.length){ bad2.push(`各項王「${label}」有 ${c.length} 欄，聯盟有 ${order.length} 個`); continue; }
    c.forEach((txt,i)=>{
      checkedCells++;
      const v=num(txt), want=LEAGUES[order[i]][kRow[label]];
      if(Math.abs(v-want)>1e-9) bad2.push(`${order[i]}.${kRow[label]}：文件 ${v}／程式 ${want}`);
    });
  }
  chk(bad2.length===0,`聯盟表與各項王表共 ${checkedCells} 格跟程式完全一致（對不上的：${bad2.slice(0,4).join('；')||'無'}）`);
}
{
  /* 文件裡寫死的門檻，一個一個對回引擎的常數。
     這些以前全是「文件抄一份、程式一份」，改了程式沒改文件也不會有人發現。 */
  const md=DOC_FILES['數值設定.md'];
  const pairs=[
    ['NCAA 綜合門檻',NCAA_GATE],['NCAA 球商門檻',NCAA_IQ_GATE],
    ['高中直投門檻',HS_DRAFT_GATE],['NBA 球探評價門檻',NBA_SCOUT_GATE],
    ['國際賽曝光採計上限',BUZZ_CAP],['旅外門檻放寬斜率',OS_SLOPE],
    ['生涯指數 P80 係數',CI_K],['歷史 75 大入選門檻',LEGEND_IN],
    /* v1.7.0 新增的五個。都是「文件抄一份、程式一份」最容易走鐘的那種數字。 */
    ['榮譽冠軍係數',CI_HONOR.champ],['榮譽 MVP 係數',CI_HONOR.mvp],
    ['畢業試訓門檻加成',GRAD_TRY_MARGIN],
    ['事件重複衰減係數',EV_REPEAT_K],['手感最高檔連中數',HEAT[0].s],
    ['浪人門檻',TG.journeySwitches],
  ];
  const miss=[];
  for(const [label,val] of pairs){
    const re=new RegExp('<!--\\s*常數\\s+'+label+'\\s*=\\s*([0-9.]+)\\s*-->');
    const hit=md.match(re);
    if(!hit) miss.push(label+'（文件裡沒有對帳標記）');
    else if(Math.abs(parseFloat(hit[1])-val)>1e-9) miss.push(`${label}：文件 ${hit[1]}／程式 ${val}`);
  }
  chk(miss.length===0,`數值設定.md 的 ${pairs.length} 個門檻跟程式一致（對不上的：${miss.join('；')||'無'}）`);
}
{
  /* 生涯指數的滿分：以前引擎寫死一次（careerIndex 的 clamp）、UI 寫死三次
     （結算頁分母、說明句、分享文字），四份副本沒有任何守門。現在只有 CI_TOTAL 一份。 */
  chk(CI_TOTAL===Object.keys(CI_CAP).reduce((s,k)=>s+CI_CAP[k],0),'CI_TOTAL 就是七項上限的和');
  chk(UI_SRC.indexOf('20,000')<0,'UI 裡沒有寫死的「20,000」（滿分一律讀 CI_TOTAL）');
  chk(ENGINE_SRC.split(/[^0-9]20000[^0-9]/).length-1<=1,
    'engine 裡的 20000 只剩「職業 20,000 分」那個里程碑（生涯指數的滿分走 CI_TOTAL）');
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
  /* 鐵律 1 真正要守的是**擲骰順序**，而不是擲出來的值。
     這一條直接量順序：createGame ＋ startTrain 一共消耗了幾次 g._rng()。
     做法是拿一條全新的同種子亂數流，往前追到「開局結束後的下一次擲骰」落在第幾格。
     它跟任何權重表、常數、球風表都無關——調 POS 的權重會讓開局的九項數值變
     （那要重釘下面那份數值指紋），但只要沒有多擲或少擲一次骰，這一條不會動。
     v1.6.0 就是這樣分辨出來的：籃板權重 .00→.02 讓五顆種子的數值指紋全部位移，
     而擲骰次數一次都沒變——那是刻意的數值改動，不是鐵律 1 的破口。 */
  const ROLLS={'6dkts3aa':[],'uf3minda':[],'mhkq46aa':[],'wxzg77aa':[],'7dmsy2ba':[]};
  /* 五顆的值一樣是構造上的：擲骰次數只跟位置／球風／季初加練的次數有關，跟種子無關。
     照樣一顆一顆列，是為了任何一顆走出不同的路徑時看得出來是哪一顆。 */
  const ROLL_FP={
    '6dkts3aa':1463053896, 'uf3minda':1463053896, 'mhkq46aa':1463053896,
    'wxzg77aa':1463053896, '7dmsy2ba':1463053896,
  };
  const rollDrift=[];
  for(const sd of Object.keys(ROLLS)){
    const counts=[];
    for(const pos of Object.keys(POS)) for(const st of STYLE_KEYS){
      const g=createGame(sd,'X',pos,st);
      const next=g._rng();
      const fresh=mulberry32(cyrb32('hooplife|'+sd));
      let n=-1;
      for(let i=0;i<500;i++){ if(fresh()===next){ n=i; break; } }
      counts.push(n);
    }
    const h=cyrb32(counts.join(','));
    if(h!==ROLL_FP[sd])
      rollDrift.push(`${sd} 的開局擲骰次數指紋 ${h}（應為 ${ROLL_FP[sd]}）：createGame／startTrain 的擲骰順序被動過了`);
  }
  rollDrift.forEach(x=>chk(false,x));
  chk(rollDrift.length===0,`5 顆推薦種子的開局擲骰次數沒有位移（位移 ${rollDrift.length} 顆）——這條只問順序，不問數值`);
  /* 上面那條只綁到第 2（體質）與第 12（天賦帶）次擲骰。實測：第 13 次之後多擲一次 rng，
     開局球隊、天賦上限、季初加練全部換人，但天賦與體質不動，這條照樣綠。
     所以再釘一份「開局指紋」：身高(1) 起始值(3–11) 天賦上限(13–21) 高中球隊(22)
     季初加練出手(23–)，30 種位置×球風組合全部進去雜湊，把 createGame 整段擲骰包住。
     這一份會吃到權重表：v1.6.0 把控球的籃板權重從 .00 改成 .02（那一格是 45 格裡
     唯一的 0，而 0 在貪婪分配裡是個陷阱），控球的起始籃板 +2、天賦上限 +1，
     五顆種子的雜湊因此全部重釘過一次——那是刻意的，順序那一條同時保持全綠。 */
  const FP={
    '6dkts3aa':1642324567, 'uf3minda':3422501216, 'mhkq46aa':226024357,
    'wxzg77aa':4157625660, '7dmsy2ba':1117563604,
  };
  const fpDrift=[];
  for(const sd of Object.keys(FP)){
    const parts=[];
    for(const pos of Object.keys(POS)) for(const st of STYLE_KEYS){
      const g=createGame(sd,'X',pos,st);
      parts.push(`${pos}/${st}|${g.height}|${g.talentBand}|${g.dura}|`+
        ATTRS.map(at=>g.a[at.k]).join(',')+'|'+ATTRS.map(at=>g.pot[at.k]).join(',')+'|'+
        g.team+'|'+g.pending.shots.map(s=>s.k).join(''));
    }
    const h=cyrb32(parts.join(';'));
    if(h!==FP[sd]) fpDrift.push(`${sd} 開局指紋 ${h}（應為 ${FP[sd]}）：createGame 的擲骰順序被動過了`);
  }
  fpDrift.forEach(x=>chk(false,x));
  chk(fpDrift.length===0,`5 顆推薦種子的完整開局指紋沒有位移（位移 ${fpDrift.length} 顆）`);
}

console.log('\n'+(bad.length?`⚠ ${bad.length} 項要處理`:'✓ 稽核全部通過'));
/* 沒有這一行，上面每一條斷言都只是印字：npm test 照樣 exit 0，
   鐵律 1 唯一的專屬守門（推薦種子）等於不存在。 */
process.exit(bad.length?1:0);
