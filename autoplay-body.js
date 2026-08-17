/* 兩個自動玩家的**唯一**一份定義。calib.js／stats.js／audit.js 都把這個檔
   跟引擎串在同一支腳本裡執行（所以它可以直接用 createGame／greedyAlloc 這些全域）。

   以前這兩支各在三個檔案裡抄一份，而且抄歪了：
   - 貪婪分配有兩種版本（傳點數／傳累積成長值），calib-body.js 一個檔案裡兩支函式
     就用了不同的那一份；現在一律呼叫引擎的 greedyAlloc，跟 UI 的「自動分配」同一個人。
   - 分岔評分表比對一個不存在的 act 'tryJapan'（引擎產生的是 'try:'+lg），
     實測 600 局裡「畢業直接闖日本／韓國／澳洲」出現 135 次、選中 0 次——
     那條路線在「認真玩」的樣本裡從來沒有被走過，而 fallback 20 讓它完全靜默。

   兩個玩家是刻意的對照組：
   ① 隨手玩 autoPlay —— 訓練強度、球季態度、事件選項全部由決策種子隨機決定。
      **CI_PCTL 那張分位表的定義就是它**，改這支等於改「PR 80」的意思，要重跑 calib。
   ② 認真玩 autoPlaySerious —— 保持體力、貪婪分配、分岔一路往上爬。 */

/* 分岔評分：分數高的選項會被選走。
   **一定要列全**——沒列到的 act 會進 ACT_UNSCORED，audit 有一條守門盯著它是空的。
   舊版用 `:20` 當 fallback，於是打錯字（tryJapan）跟「刻意不選」（gap）長得一模一樣。 */
/* 除了那條死分支之外，每一格都刻意維持舊版的數值——**這張表是參考分佈的定義**，
   隨手改一格就等於偷偷換掉「歷史 75 大第 N 名」的意思。分數相同時取第一個，
   所以那一堆 20 不是「沒想過」，是「照抉擇卡上的排序」。 */
const ACT_SCORE={
  nbaDraft  :99,   /* NBA 選秀：最高殿堂，一定賭 */
  goNCAA    :98,   /* 出國讀 NCAA：唯一能走到 NBA 選秀的養成路線 */
  goDraft   :60,   /* 國內選秀 PLG */
  goDraftT1 :55,   /* T1 的水準線比 PLG 低；同一張卡上 goDraft 一定也在，所以實際不會被選中，
                      列出來是為了讓它不再靜默地掉進 fallback */
  stay      :50,   /* 留在原地再練一年 */
  resign    :48,   /* 續約 */
  earlyDraft:20,   /* 以下全部維持舊版的 fallback 值 20（照卡片排序取第一個） */
  goUBA     :20,
  gap       :20,
  stayHome  :20,
  skipNatl  :20,
  retire    :20,
};
const ACT_UNSCORED=new Set();
/* 帶參數的 act（move:／drop:／try:／trade:／natl:）用前綴判斷 */
function actScore(o){
  const x=o.act||'';
  if(x.indexOf('move:')===0) return 100+LEAGUES[x.slice(5)].tier;   /* 往上跳最優先 */
  /* 畢業直接闖海外。舊版這裡比對的是 'tryJapan'，而引擎產生的是 'try:'+lg——
     實測 600 局裡這個選項出現 135 次、選中 0 次，整條路線在認真玩的樣本裡是空白的。 */
  if(x.indexOf('try:')===0)  return 90;
  if(x.indexOf('drop:')===0) return 20;   /* 降級卡上只有 drop 與 retire，取第一個（層級最高的） */
  if(x.indexOf('trade:')===0) return 20;
  if(x.indexOf('natl:')===0) return 78+(o.p||0)*8;                  /* 成功率越高越想打 */
  if(ACT_SCORE[x]!==undefined) return ACT_SCORE[x];
  ACT_UNSCORED.add(x||'(空的 act)');
  return 20;
}

/* ① 隨手玩：CI_PCTL 的參考分佈 */
function autoPlay(seed,dseed,opt){
  opt=opt||{};
  const drng=mulberry32(cyrb32('dec|'+dseed));
  const g=createGame(seed,'測試員',opt.pos||'SF',opt.style);
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>400) throw new Error('卡關');
    const p=g.pending;
    if(p.type==='train'){
      const it=['push','normal','safe'][Math.floor(drng()*3)];
      const att=['allin','steady','manage'][Math.floor(drng()*3)];
      applyTrain(g,it,greedyAlloc(g,trainPoints(g,it)),att);
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

/* ② 認真玩：保持體力、貪婪分配、往上爬 */
function autoPlaySerious(sd,posIdx,style){
  const g=createGame(sd,'測',Object.keys(POS)[posIdx%5],style);
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>500) break;
    const p=g.pending;
    if(p.type==='train'){
      const it=g.load<62?'push':(g.load<82?'normal':'safe');
      applyTrain(g,it,greedyAlloc(g,trainPoints(g,it)),g.load<74?'allin':'steady');
    }
    else if(p.type==='event') applyEvent(g,0);
    else if(p.type==='result') advance(g);
    else if(p.type==='branch'){
      let bi=0,bs=-1;
      p.opts.forEach((o,i)=>{ const s=actScore(o); if(s>bs){bs=s;bi=i;} });
      applyBranch(g,bi);
    } else break;
  }
  return g;
}
