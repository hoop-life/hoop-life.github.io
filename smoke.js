/* 只掃「畫出來的東西」：body.innerHTML 連 <script> 原始碼都含在內，
   程式碼註解裡出現 undefined／NaN 這種字就會誤判成畫面破圖（踩過一次）。 */
function renderedHtml(doc){
  const c=doc.body.cloneNode(true);
  c.querySelectorAll('script,style,template').forEach(n=>n.remove());
  return c.innerHTML;
}
/* DOM 煙霧測試：真的用 jsdom 載入整份 HTML，模擬玩家點到退休 */
const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');

const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'
  +fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8')+'</body></html>';

let fail=0;
const say=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); if(!ok) fail++; };

const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.test/?seed=pe7ff6ae'});
const w=dom.window,d=w.document;
w.addEventListener('error',e=>errs.push('window.error: '+e.message));
w.onerror=(m)=>errs.push('onerror: '+m);
const origErr=console.error; console.error=(...a)=>{errs.push('console.error: '+a.join(' '));};

function click(sel){
  const el=d.querySelector(sel);
  if(!el) throw new Error('找不到元素 '+sel);
  if(el.disabled) throw new Error('元素被停用 '+sel);
  el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  return el;
}
const has=sel=>!!d.querySelector(sel);
const txt=sel=>{const e=d.querySelector(sel);return e?e.textContent.trim():null;};

/* --- 1. 開場畫面 --- */
say(has('#startBtn')&&has('#seedIn')&&has('#posGrid'),'開場畫面渲染出姓名/位置/種子欄位');
say(d.querySelector('#seedIn').value==='pe7ff6ae','URL 的 ?seed= 有被讀進種子欄位');
say(d.querySelectorAll('.posbtn').length===5,'五個位置按鈕（PG/SG/SF/PF/C）');
say(d.querySelector('title').textContent.length>0,'有 <title>：'+d.querySelector('title').textContent);

/* --- 2. 選位置 ＋ 球風 → 開始 --- */
click('.posbtn[data-pos="PG"]');
say(d.querySelector('.posbtn[data-pos="PG"]').getAttribute('aria-pressed')==='true','點 PG 後 aria-pressed 切換');
say(txt('#posDesc').indexOf('球隊大腦')>=0,'位置說明跟著換');
say(d.querySelectorAll('.stybtn').length===6,`開場有 ${d.querySelectorAll('.stybtn').length} 個球風可選`);
const styBefore=txt('#styDesc');
click('.stybtn[data-sty="floor"]');
say(d.querySelector('.stybtn[data-sty="floor"]').getAttribute('aria-pressed')==='true','點球風會選起來');
say(txt('#styDesc')!==styBefore,'球風說明跟著換：'+txt('#styDesc'));
click('#startBtn');
say(has('.board')&&has('.dock'),'開始生涯後出現記分板與動作面板');
say(txt('.board-pos')==='PG','記分板顯示所選位置');
say(txt('.board-sty')==='組織核心','記分板顯示所選球風');
say(txt('#log').indexOf('組織核心')>=0,'開場敘述帶到球風');
/* 天生體質是開局就決定的，要在開場文字裡交代 */
say(/體檢|隊醫/.test(txt('#log')),'開場就交代天生體質：'+txt('#log').slice(-40));

/* --- 2b. 加練投籃盤面 --- */
say(d.querySelectorAll('.tray .shot').length>0,`季初加練投籃渲染出 ${d.querySelectorAll('.tray .shot').length} 次出手`);
const shotKinds=[...d.querySelectorAll('.tray .shot')].map(e=>e.querySelector('.r').textContent);
say(shotKinds.every(k=>['空心','進球','打板','彈框','麵包'].includes(k)),'出手結果都是合法標籤：'+shotKinds.join(' '));
say(has('.heat'),'手感提示列存在：'+txt('.heat'));

/* --- 2c. 球季態度與即時風險 --- */
say(d.querySelectorAll('[data-att]').length===3,'球季態度三選一按鈕都在');
say(has('.risk'),'即時風險條存在：'+txt('.risk').replace(/\s+/g,' ').slice(0,72));
const riskBefore=txt('.risk');
click('[data-att=allin]');
say(d.querySelector('[data-att=allin]').getAttribute('aria-pressed')==='true','點全力衝刺會選起來');
say(txt('.risk')!==riskBefore,'切換球季態度後，風險數字跟著變');
click('[data-att=manage]');
const mg=txt('.risk');
click('[data-att=allin]');
say(txt('.risk')!==mg,'控制上場時間與全力衝刺的風險不同');

/* --- 2d. 屬性游標與記分板面板 --- */
say(d.querySelectorAll('.arow .cur').length===9,'九項屬性都有「目前值」游標');
say(d.querySelectorAll('.arow .cap').length===9,'九項屬性都有「天賦上限」刻度');
click('#attrBtn');
say(has('.panel .attrs'),'記分板可展開九項能力值面板（隨時查得到）');
say(txt('.panel').indexOf('訓練效率')>=0,'能力值面板列出球風的訓練效率倍率');
click('#attrBtn');
click('#loadBtn');
say(has('.ledger'),'負荷面板列出累積與消除來源');
const led=txt('.ledger');
say(led.includes('全力以赴')&&led.includes('保守應對'),'負荷面板同時交代怎麼累積與怎麼消除');
say(has('.dura'),'負荷面板交代天生體質：'+txt('.dura').replace(/\s+/g,' '));
say(/受傷率|負荷/.test(txt('.dura')),'天生體質有寫出實際的受傷率／負荷加成');
click('#loadBtn');

/* --- 2e. 球探報告：同儕定位與下一道門檻 --- */
click('#scoutBtn');
say(has('.peer'),'球探報告顯示同儕定位：'+txt('.peer').replace(/\s+/g,' '));
say(d.querySelectorAll('.gate').length>0,`球探報告列出 ${d.querySelectorAll('.gate').length} 道門檻`);
say(d.querySelectorAll('.gate .greq').length>0,'每道門檻都寫出「需要多少／你現在多少」');
say(/還差|✓/.test(txt('.panel')),'門檻有標出差距或已達標');
say(txt('.panel').indexOf('隊上定位')>=0&&txt('.panel').indexOf('體系適配')>=0,
  '球探報告同時交代隊上定位與體系適配');
click('#scoutBtn');

/* --- 2f. 隊上定位要出現在記分板 --- */
say(has('.cell .v.rl'),'記分板常駐顯示隊上定位：'+txt('.cell .v.rl'));

/* --- 2g. 訓練分配的即時綜合預覽 --- */
say(has('.pool .pr'),'季初有「這樣分配的綜合」預覽欄');
const povBefore=txt('.pool .pr');
say(d.querySelector('#resetBtn').disabled,'還沒分配時「重設分配」是停用的');
click('#autoBtn');
say(txt('.pool .pr')!==povBefore,'按下自動分配後，綜合預覽數字會變：'+txt('.pool .pr').replace(/\s+/g,' '));
say(/\+\d/.test(txt('.pool .pr')),'預覽有標出綜合增加多少');
say(!d.querySelector('#resetBtn').disabled,'分配完之後「重設分配」才可以按');

/* --- 2g2. 天賦練滿的死鎖：直接把九項推到上限前 0.02，看季初還走不走得動 --- */
{
  click('#resetBtn');
  const snap=w.eval('JSON.stringify(G.a)');
  w.eval('ATTRS.forEach(a=>{G.a[a.k]=Math.round((G.pot[a.k]-0.02)*100)/100;}); render();');
  const incLive=[...d.querySelectorAll('.pm button[data-inc]')].some(b=>!b.disabled);
  const autoLive=!d.querySelector('#autoBtn').disabled;
  const trainLive=!d.querySelector('#doTrain').disabled;
  say(!incLive,'九項都練滿時，所有＋鍵都停用（不讓玩家把點數丟進黑洞）');
  say(trainLive,'但「完成訓練」必須放行——否則季初就卡死了');
  say(txt('.hint').indexOf('無處可去')>=0,'畫面明講剩餘點數無處可去：'+txt('.hint').slice(0,40));
  console.log('  INFO  自動分配鍵此時'+(autoLive?'仍可按（會分不出東西）':'也停用'));
  /* 還原，讓後面的完整生涯從正常狀態繼續 */
  w.eval('G.a='+snap+'; render();');
  say(d.querySelector('#doTrain').disabled,'還原後回到「點數還沒分配完」的正常狀態');
  click('#autoBtn');                 /* 交還給下一段：留在「已分配」狀態 */
}

/* --- 2h. 重設分配 --- */
click('#resetBtn');
say(txt('.pool .pr')===povBefore,'重設分配把綜合預覽還原成原值');
say(d.querySelector('#resetBtn').disabled,'重設後按鈕自己停用（沒東西可重設）');
say(d.querySelector('#doTrain').disabled,'重設後點數沒分配完，完成訓練會被擋住');

/* --- 2i. 手動分配：加到天賦上限就該停手，不能讓玩家白丟點數 --- */
{
  /* 找一個上限最低的屬性，狂按＋直到它被停用 */
  const rows=[...d.querySelectorAll('.arow')];
  let capped=false,pressed=0;
  for(let i=0;i<200;i++){
    const incs=[...d.querySelectorAll('.pm button[data-inc]')];
    const live=incs.filter(b=>!b.disabled);
    if(!live.length) break;
    live[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    pressed++;
    if(incs.some(b=>b.disabled)) capped=true;
    if(parseInt(txt('.pool .pl').replace(/\D+/g,''),10)===0) break;
  }
  const nums=[...d.querySelectorAll('.arow .num')].map(e=>e.textContent);
  const over=nums.some(t=>{
    const m=t.match(/^([\d.]+)\+([\d.]+)\/(\d+)$/);
    return m&&(parseFloat(m[1])+parseFloat(m[2]))>parseFloat(m[3])+0.15;
  });
  say(!over,`手動按 ${pressed} 次＋，沒有任何一項被分配到超過天賦上限`);
  console.log('  INFO  '+(capped?'有屬性觸頂後＋鍵確實變成停用':'這局沒有屬性在分配中觸頂'));
}
click('#resetBtn');

/* --- 3. 一路點到退休 --- */
let steps=0,trainCount=0,eventCount=0,branchCount=0,resultCount=0,maxDeadEnd=0;
let sawHeat=false,sawSwish=false,sawMulti=false;
let sawOdds=false,sawRawPct=false,sawPeer=false,sawMile=false,sawRole=false,sawFit=false;
let capChecks=0,capBug=0,overCap=0,deadlocks=0;
const BANDS=['幾乎穩了','很有把握','五五波','賭一把','機會渺茫','幾乎不可能'];
while(!has('.resume')&&steps<3000){
  steps++;
  /* 成功率必須是粗略帶，不可以是「成功率 63%」這種精確數字 */
  d.querySelectorAll('.dock .opt .odds').forEach(e=>{
    const t=e.textContent.trim();
    if(BANDS.indexOf(t)>=0) sawOdds=true;
    if(/\d+\s*%/.test(t)) sawRawPct=true;
  });
  if(has('.peerline')) sawPeer=true;
  if(has('.chip.mile')) sawMile=true;
  if(/隊上定位 ·/.test(txt('#log')||'')) sawRole=true;
  if(/體系適配/.test(txt('#log')||'')) sawFit=true;
  if(has('#doTrain')){
    trainCount++;
    if(has('.shot.hot')) sawHeat=true;
    if(has('.shot.swish')) sawSwish=true;
    /* 不變條件：任何一項只要「目前值＋本次預覽增量」已經頂到天賦上限，
       那顆＋就必須是停用的——否則玩家會把點數丟進黑洞 */
    d.querySelectorAll('.arow').forEach(row=>{
      const num=row.querySelector('.num'),inc=row.querySelector('[data-inc]');
      if(!num||!inc) return;
      const m=num.textContent.match(/^([\d.]+)(?:\+([\d.]+))?\/(\d+)$/);
      if(!m) return;
      const proj=parseFloat(m[1])+(m[2]?parseFloat(m[2]):0),cap=parseFloat(m[3]);
      capChecks++;
      if(proj>=cap-0.05&&!inc.disabled) capBug++;
      if(proj>cap+0.15) overCap++;
    });
    /* 死鎖檢查：不可以出現「每顆＋都停用、完成訓練也停用」的狀態 */
    {
      const liveInc=[...d.querySelectorAll('.pm button[data-inc]')].some(b=>!b.disabled);
      const liveAuto=!d.querySelector('#autoBtn').disabled;
      if(d.querySelector('#doTrain').disabled&&!liveInc&&!liveAuto) deadlocks++;
    }
    /* 隨機挑一種訓練強度，然後按自動分配 */
    const ints=d.querySelectorAll('[data-int]');
    ints[trainCount%ints.length].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    if(has('#autoBtn')&&!d.querySelector('#autoBtn').disabled) click('#autoBtn');
    const btn=d.querySelector('#doTrain');
    if(btn.disabled){ maxDeadEnd++; throw new Error('季初卡死：分配完仍無法按下完成訓練'); }
    click('#doTrain');
  } else if(has('[data-ev]')){
    eventCount++;
    const opts=d.querySelectorAll('[data-ev]');
    opts[eventCount%opts.length].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  } else if(has('#nextBtn')){
    resultCount++; click('#nextBtn');
  } else if(has('[data-br]')){
    branchCount++;
    const opts=d.querySelectorAll('[data-br]');
    if(opts.length>2) sawMulti=true;
    opts[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  } else if(has('.resume')){ break; }
  else { throw new Error('第 '+steps+' 步找不到任何可點的控制項'); }
}
say(has('.resume'),`點 ${steps} 步走完整段生涯（訓練 ${trainCount}／事件 ${eventCount}／結算 ${resultCount}／抉擇 ${branchCount}）`);
say(sawSwish,'生涯中出現過「空心」出手');
say(sawHeat,'生涯中出現過連續命中發燙的高亮段');
say(sawOdds,'選項有標成功率粗略帶（幾乎穩了／五五波／賭一把…）');
say(!sawRawPct,'成功率沒有洩漏精確百分比');
say(sawPeer,'季末結算有顯示同儕定位（在聯盟排第幾）');
say(sawRole,'季末結算有顯示隊上定位');
say(sawFit,'換隊／進職業時有交代體系適配');
say(sawMile,'生涯途中有解鎖並顯示里程碑');
say(capBug===0,`分配面板檢查 ${capChecks} 次：頂到天賦上限的項目，＋鍵都確實停用（違例 ${capBug}）`);
say(overCap===0,`沒有任何一次把點數分配到超過天賦上限（違例 ${overCap}）`);
say(deadlocks===0,`季初從未卡死（＋鍵與完成訓練同時停用的次數 ${deadlocks}）`);
console.log('  INFO  '+(sawMulti?'這局遇到過多選項抉擇':'這局沒遇到多選項抉擇（正常，看種子）'));

/* --- 4. 履歷頁 --- */
say(has('.resume-hd h2'),'履歷頁有評價標題：'+txt('.resume-hd h2'));
say(d.querySelectorAll('.big .n').length===13,'場均五格＋命中率四格＋累計四格都渲染出來');
say(txt('.resume').indexOf('抄截')>=0&&txt('.resume').indexOf('阻攻')>=0,'生涯場均含抄截與阻攻');
say(/投籃[\s\S]{0,40}三分[\s\S]{0,40}罰球/.test(txt('.resume')),'履歷頁有投籃／三分／罰球命中率');
{
  const pcts=[...d.querySelectorAll('.big .n')].map(e=>e.textContent)
    .filter(t=>/%$/.test(t)).map(t=>parseFloat(t));
  say(pcts.length===3&&pcts.every(v=>v>20&&v<100),'三個命中率都在合理範圍：'+pcts.join('% / ')+'%');
}
say(d.querySelectorAll('.honors .hcell').length===12,'榮譽／生涯紀錄／身體帳單各四格都在');
say(has('.after'),'履歷頁有退役之後的結局：'+txt('.after p'));
say((txt('.after p')||'').length>10,'結局是完整的一段話，不是空的');
say(txt('.resume').indexOf('天生體質')>=0,'履歷頁交代天生體質（傷是不是自己打壞的）');
say(txt('.resume').indexOf('里程碑')>=0,'履歷頁有里程碑區塊');
say(has('.lgtab table'),'各階段足跡表存在');
say(txt('.lgtab').indexOf('主要定位')>=0,'各階段足跡表列出每個聯盟的主要定位');
say(d.querySelectorAll('.trow').length>1,'生涯逐年含表頭列');
const nums=[...d.querySelectorAll('.big .n')].map(e=>e.textContent);
say(!nums.some(t=>/NaN|Infinity|undefined/.test(t)),'數據無 NaN／undefined：'+nums.join(' | '));
say(has('.hof .v'),'名人堂票數顯示：'+txt('.hof .v'));
say(d.querySelectorAll('.trow').length>0,`生涯逐年 ${d.querySelectorAll('.trow').length} 列`);
say(txt('.seedline').indexOf('pe7ff6ae')>=0,'履歷頁附上世界種子');
say(has('#copyBtn')&&has('#againBtn')&&has('#sameSeedBtn'),'三顆結尾按鈕都在');
const bodyHtml=renderedHtml(d);
say(!/undefined|NaN|\[object Object\]/.test(bodyHtml),'整頁無 undefined／NaN／[object Object]');

/* --- 5. 皮膚切換 --- */
const before=d.documentElement.getAttribute('data-skin');
click('[data-skin-btn="paper"]');
say(d.documentElement.getAttribute('data-skin')==='paper',`皮膚可切換（${before} → paper）`);
click('#fsBtn');
say(d.documentElement.getAttribute('data-fs')==='lg','大字模式可切換');

/* --- 6. 重來 --- */
click('#againBtn');
say(has('#startBtn'),'「再來一次」回到開場畫面');

/* --- 7. 第二輪：走到職業生涯後段，驗退休流程真的有得選 --- */
console.log('\n  ── 第二輪：刻意打完整個職業生涯 ──');
{
  d.querySelector('#seedIn').value='y4wub9da';
  click('.posbtn[data-pos="SF"]');
  click('.stybtn[data-sty="slasher"]');
  click('#startBtn');
  let n=0,sawPay=false,sawRetireChoice=false,sawForced=false,sawMinDeal=false;
  let maxAge=0,lastAwardAge=0,sawOverseas=false;
  while(!has('.resume')&&n<3000){
    n++;
    const age=parseInt(d.querySelector('.board-grid .cell .v').textContent,10);
    if(age>maxAge) maxAge=age;
    if(has('#doTrain')){
      click('[data-att="allin"]');                 /* 全程全力衝刺，逼出負荷與傷病 */
      if(!d.querySelector('#autoBtn').disabled) click('#autoBtn');
      click('#doTrain');
      const log=d.querySelector('#log').textContent;
      if(log.includes('年薪')) sawPay=true;
      if(log.includes('底薪約')) sawMinDeal=true;
    } else if(has('[data-ev]')){ d.querySelectorAll('[data-ev]')[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); }
    else if(has('#nextBtn')){
      const log=d.querySelector('#log').textContent;
      if(/MVP|年度第一隊/.test(log)) lastAwardAge=Math.max(lastAwardAge,age);
      click('#nextBtn');
    }
    else if(has('[data-br]')){
      const t=d.querySelector('.dock .prompt').textContent;
      const opts=[...d.querySelectorAll('[data-br]')];
      if(/生涯的終點/.test(t)) sawForced=true;
      if(/該掛鞋了嗎|還想打到什麼時候|只剩底薪約/.test(t)){
        sawRetireChoice=true;
        say(opts.length===2,'　　退休詢問有兩個選項（可以選再打一年，不是被判決）');
        opts[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));   /* 一律再打一年 */
        continue;
      }
      if(/海外報價|兩張海外報價/.test(t)) sawOverseas=true;
      opts[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    }
    else break;
  }
  say(has('.resume'),`第二輪走完（${n} 步，打到 ${maxAge} 歲）`);
  say(sawPay,'職業階段有領到年薪（確實踏進職業）');
  say(sawRetireChoice||sawForced,'生涯結束有走過退休流程');
  console.log(`  INFO  最後一次拿大獎 ${lastAwardAge||'—'} 歲、退休 ${maxAge} 歲`
    +`${sawOverseas?'、有拿到海外報價':''}${sawMinDeal?'、有簽過底薪約':''}`);
  if(lastAwardAge) say(maxAge>=lastAwardAge,'拿獎那年不會是被硬砍的前一年');
  say(!/undefined|NaN|\[object Object\]/.test(renderedHtml(d)),'第二輪履歷頁乾淨無 NaN');
}

/* --- 8. 結構與可及性稽核（在履歷頁與開場畫面各掃一次） --- */
console.log('\n  ── 結構／可及性 ──');
function auditPage(label){
  const btns=[...d.querySelectorAll('button')];
  const noName=btns.filter(b=>!(b.textContent||'').trim()&&!b.getAttribute('aria-label'));
  say(noName.length===0,`${label}：${btns.length} 顆按鈕都有可讀名稱（無名 ${noName.length}）`);
  /* 寬內容必須包在可橫向捲動的容器裡，否則窄螢幕會被切掉 */
  const tables=[...d.querySelectorAll('table')];
  const naked=tables.filter(t=>!t.closest('.scroll-x'));
  say(naked.length===0,`${label}：${tables.length} 張表格都包在 .scroll-x 裡（裸露 ${naked.length}）`);
  /* 不可以有寫死的 px 寬度（換行/縮放時最容易爆版） */
  const fixed=[...d.querySelectorAll('[style]')].filter(e=>/(^|;)\s*width:\s*\d+px/.test(e.getAttribute('style')||''));
  say(fixed.length===0,`${label}：沒有行內寫死的 px 寬度（${fixed.length} 個）`);
  /* 切換型按鈕要有 aria-pressed 或 aria-expanded */
  const toggles=btns.filter(b=>/data-(pos|sty|int|att|skin-btn)/.test(b.outerHTML));
  const noAria=toggles.filter(b=>!b.hasAttribute('aria-pressed'));
  say(noAria.length===0,`${label}：${toggles.length} 顆切換鍵都有 aria-pressed（缺 ${noAria.length}）`);
}
auditPage('履歷頁');
click('#againBtn');
auditPage('開場畫面');

console.error=origErr;
/* jsdom 未實作 window.scrollTo，屬測試環境限制不是程式問題 */
const real=errs.filter(e=>!/Not implemented: Window's scroll/.test(e));
say(real.length===0, real.length?('執行期錯誤 '+real.length+' 筆：'+real.slice(0,3).join(' / ')):'全程無執行期錯誤（已排除 jsdom 未實作的 scrollTo）');

console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ DOM 煙霧測試全部通過'));
process.exit(fail?1:0);
