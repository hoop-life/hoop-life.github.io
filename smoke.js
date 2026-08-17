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

/* 兩組按鈕要聽得出「這是在選什麼」——沒有 for 也沒包住控制項的 <label>
   在 HTML 規範裡是無效的，讀屏會直接跳過，那 11 顆按鈕就變成一串沒有上下文的切換鈕。 */
{
  const grp=['#posGrid','#styGrid'].map(s=>d.querySelector(s));
  say(grp.every(g=>g&&g.getAttribute('role')==='group'&&g.getAttribute('aria-labelledby')),
    '位置／球風兩組按鈕都有 role=group 與 aria-labelledby');
  say(grp.every(g=>{const l=d.getElementById(g.getAttribute('aria-labelledby'));
    return l&&(l.textContent||'').trim().length>0;}),'aria-labelledby 指到的元素真的有文字');
  const orphan=[...d.querySelectorAll('label')].filter(l=>!l.getAttribute('for')&&!l.querySelector('input,select,textarea,button'));
  say(orphan.length===0,`沒有孤兒 <label>（既沒有 for 也沒包住控制項的：${orphan.length}）`);
}
/* 打完名字按 Enter 就該開始，不用先收軟鍵盤再往下捲 */
{
  say(d.querySelector('#nameIn').getAttribute('enterkeyhint')==='go','姓名欄標了 enterkeyhint=go');
  say(!!d.querySelector('#seedIn'),'（前提）種子欄在');
  say(!!d.querySelector('#startBtn'),'（前提）開始按鈕在');
  /* 這裡以前只 new 了一個 KeyboardEvent 就沒有 dispatch，於是把 hooplife.html:4004 的
     `if(ev.key==='Enter'){ ev.preventDefault(); $('#startBtn').click(); }` 整行刪掉，
     這一段照樣全綠——跟這一版在別處清掉的假綠是同一個模式。現在真的按下去。 */
  const nameIn=d.querySelector('#nameIn');
  nameIn.value='Enter 測試員';
  nameIn.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  say(!d.querySelector('#startBtn'),'在姓名欄按 Enter 就直接開局了（開始按鈕已經不在畫面上）');
  say(/Enter 測試員/.test(d.body.textContent),'開的是剛剛打的那個名字');
  /* 開完要退回開場畫面，後面的段落還要從頭選位置與球風 */
  w.eval('G=null;render()');
  say(!!d.querySelector('#startBtn'),'（收尾）已經退回開場畫面');
}

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
/* 這顆按鈕分出來的東西，必須跟引擎的 greedyAlloc 一模一樣——
   calib 量參考分佈用的就是那支函式，兩邊分歧就等於「PR 80」講的不是這個玩家。
   以前 UI 自己抄了一份（而且是修好的那一版，測試那邊抄的是壞的那一版）。 */
say(w.eval('JSON.stringify(ALLOC)===JSON.stringify(greedyAlloc(G,trainPoints(G,INTENS)))'),
  '「自動分配」按鈕分出來的就是引擎 greedyAlloc 的結果（UI 沒有自己抄一份）');

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
/* --- 6b. 分享網址：貼上去要開出同一顆種子／位置／球風 --- */
{
  const d2=w.document;
  /* 開一局，網址必須被寫上去 */
  w.eval("G=null");
  w.eval("renderStart()");
  w.eval("document.querySelector('.posbtn[data-pos=\"PG\"]').click()");
  w.eval("document.querySelector('.stybtn[data-sty=\"shooter\"]').click()");
  w.eval("document.querySelector('#seedIn').value='sharetest'");
  w.eval("document.querySelector('#startBtn').click()");
  const q=w.location.search;
  say(/seed=sharetest/.test(q),`開始生涯後網址帶上種子（${q}）`);
  say(/pos=PG/.test(q)&&/style=shooter/.test(q),'網址也帶上位置與球風（不然分享出去會開出不一樣的人）');
  say(w.location.pathname.indexOf('?')<0,'用 replaceState 改 query，沒有把 query 塞進 path');

  /* 把那段網址餵回開場畫面，選擇必須被還原 */
  w.eval("G=null; renderStart()");
  const seedVal=d2.querySelector('#seedIn').value;
  const posOn=[...d2.querySelectorAll('.posbtn')].find(b=>b.getAttribute('aria-pressed')==='true');
  const styOn=[...d2.querySelectorAll('.stybtn')].find(b=>b.getAttribute('aria-pressed')==='true');
  say(seedVal==='sharetest',`重新載入時種子欄自動填回（${seedVal}）`);
  say(!!posOn&&posOn.dataset.pos==='PG',`位置還原成 PG（${posOn?posOn.dataset.pos:'無'}）`);
  say(!!styOn&&styOn.dataset.sty==='shooter',`球風還原成三分射手（${styOn?styOn.dataset.sty:'無'}）`);
  /* 只有一顆被按下，不會兩個同時亮 */
  say([...d2.querySelectorAll('.posbtn')].filter(b=>b.getAttribute('aria-pressed')==='true').length===1,
      '位置只有一顆是選取狀態');
  say([...d2.querySelectorAll('.stybtn')].filter(b=>b.getAttribute('aria-pressed')==='true').length===1,
      '球風只有一顆是選取狀態');

  /* 亂填的參數要被擋掉，回到預設而不是壞掉 */
  w.history.replaceState(null,'','/?seed=xx&pos=ZZ&style=nope');
  w.eval("G=null; renderStart()");
  const p2=[...d2.querySelectorAll('.posbtn')].find(b=>b.getAttribute('aria-pressed')==='true');
  const s2=[...d2.querySelectorAll('.stybtn')].find(b=>b.getAttribute('aria-pressed')==='true');
  say(p2&&p2.dataset.pos==='SF'&&s2&&s2.dataset.sty==='allround','網址帶了不存在的位置／球風會退回預設，不會壞掉');

  /* 大小寫要還原成白名單裡的正規值。以前 ?pos=pg 會靜悄悄退回 SF，
     而 syncUrl 隨即把 SF 寫回網址——錯掉的那一局就變成新的「正式連結」。 */
  w.history.replaceState(null,'','/?seed=xx&pos=pg&style=SHOOTER');
  w.eval("G=null; renderStart()");
  const p3=[...d2.querySelectorAll('.posbtn')].find(b=>b.getAttribute('aria-pressed')==='true');
  const s3=[...d2.querySelectorAll('.stybtn')].find(b=>b.getAttribute('aria-pressed')==='true');
  say(p3&&p3.dataset.pos==='PG'&&s3&&s3.dataset.sty==='shooter',
    `?pos=pg&style=SHOOTER 會還原成 PG／三分射手（實際 ${p3?p3.dataset.pos:'無'}／${s3?s3.dataset.sty:'無'}）`);

  /* file:// 下沒有可以分享的網址，所以那顆按鈕不可以出現。
     開發指南.md 宣稱「分享網址的五條行為每一條在 smoke.js 都有守門」，
     這一條以前沒有——另外開一個 file:// 的 jsdom 直接問 shareUrl()。 */
  {
    const fd=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
      url:'file:///C:/project/HoopLife/index.html'});
    say(fd.window.eval('shareUrl()')===null,'file:// 下 shareUrl() 回傳 null（沒有可以分享的網址）');
    say(!fd.window.document.querySelector('#linkBtn'),'file:// 下不會出現「複製這局的連結」按鈕');
    say(w.eval('shareUrl()')!==null,'（對照）http(s) 下 shareUrl() 給得出網址');
    fd.window.close();
  }

  /* 「再來一次」要把網址清乾淨，不然會一直開到同一顆種子 */
  w.history.replaceState(null,'','/?seed=sharetest&pos=PG&style=shooter');
  w.eval("clearUrl()");
  say(w.location.search==='','清除網址後 query 是空的（再來一次不會被舊種子綁住）');
}


/* --- 7. 第二輪：走到職業生涯後段，驗退休流程真的有得選 --- */
console.log('\n  ── 第二輪：刻意打完整個職業生涯 ──');
{
  /* 這顆種子在目前的平衡下，用「正常訓練＋全力衝刺＋事件與分岔都選第一個」
     可以走完 16 個職業球季、38 歲退休，拿 7 座大獎，最後一座在 37 歲。
     換平衡之後要重新挑一顆——判準寫成下面三條「（前提）」斷言，
     不要只寫在註解裡：舊的種子已經漂到拿不到大獎，而 lastAwardAge 是 0 的時候
     底下那條「拿獎那年不會是被硬砍的前一年」整條就空跑，不會轉紅也不會提醒。
     v1.7.0 換掉 sm37zqk：那顆在新平衡下不再拿大獎，而且是「（前提）」那條把它抓出來的
     ——這正是當初把判準寫成斷言而不是註解的理由。挑法在
     開發指南.md「重挑 smoke 種子」。 */
  d.querySelector('#seedIn').value='ax1p3q';
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
  const proN=(w.eval('G.seasons')||[]).filter(s=>/職業/.test(s.stage)).length;
  say(proN>=10,`（前提）這顆種子確實打滿 10 個職業球季（${proN} 季）——不成立就是該換種子了`);
  say(lastAwardAge>0,'（前提）這顆種子確實拿過大獎，下面那條才驗得到東西');
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

/* --- 8b. 誤觸、焦點、跳脫：整頁重建之後還撐不撐得住 --- */
console.log('\n  ── 誤觸／焦點／跳脫 ──');
{
  /* 用一個乾淨的 window 從頭開一局，才量得到訓練畫面的行為 */
  const bd=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
    url:'https://example.test/?seed=uxprobe'});
  const bw=bd.window,bdoc=bw.document;
  const bclick=sel=>{ const e=bdoc.querySelector(sel);
    if(e) e.dispatchEvent(new bw.MouseEvent('click',{bubbles:true})); return e; };
  bdoc.querySelector('#nameIn').value="小'明`測";      /* 單引號與反引號：esc() 的唯一出口 */
  bclick('#startBtn');
  /* 現況沒有洞（整份 UI 的屬性都是雙引號），所以只驗畫面是驗不到東西的——
     要直接問跳脫函式本身：它是唯一的出口，缺一個字元就等於把安全性押在
     未來每一次 review 都不會漏看屬性引號的種類上。 */
  {
    const e=bw.eval("esc(\"a'b`c<d>e&f\\\"g\")");
    say(e==='a&#39;b&#96;c&lt;d&gt;e&amp;f&quot;g',`esc() 六種字元都跳脫（${e}）`);
    say(bdoc.querySelectorAll('[onmouseover],[onclick],[onerror]').length===0,
      '含單引號的玩家名字沒有斷出任何事件處理器屬性');
  }
  say((bdoc.querySelector('#app').textContent||'').indexOf("小'明`測")>=0,
    '跳脫之後畫面上顯示的還是原本的字');

  /* 整頁重建之後焦點要回到同一顆按鈕，否則只用鍵盤的人每按一次「＋」就被丟回文件開頭 */
  const inc=bdoc.querySelector('[data-inc]');
  say(!!inc,'（前提）訓練畫面有「＋」按鈕');
  if(inc){
    const key=inc.getAttribute('data-inc');
    inc.focus();
    inc.dispatchEvent(new bw.MouseEvent('click',{bubbles:true}));
    const now=bdoc.activeElement;
    say(!!now&&now.getAttribute&&now.getAttribute('data-inc')===key,
      `按「＋」之後焦點還在同一顆按鈕上（實際 ${now&&now.getAttribute?(now.getAttribute('data-inc')||now.tagName):'BODY'}）`);
  }
  /* 讀屏播報區要**常駐在 #app 外面**。掛在 #log 上是沒有用的：render() 每次都是
     整段 app.innerHTML=…，那個節點每次都是剛插入的新節點，而 live region 必須先存在、
     內容後變才會被念出來。這條守門盯的是「它不在 #app 裡面」與「它真的有內容」。 */
  const sr=bdoc.querySelector('#sr');
  say(!!sr&&sr.getAttribute('aria-live')==='polite','有常駐的讀屏播報區（#sr aria-live=polite）');
  say(!!sr&&!bdoc.querySelector('#app #sr'),'播報區在 #app 外面（render 不會把它重建掉）');
  say(!!sr&&sr.textContent.length>0,'播報區真的有內容：'+(sr?sr.textContent.slice(0,24):''));
  say(bdoc.querySelector('#toast').getAttribute('role')==='status','toast 有 role=status');
  /* 連點閘只能掛在「會推進狀態」的按鈕上。＋／−／訓練強度這些連點是正常操作，
     一起關掉 350ms 會吃掉玩家一半的點擊（而且 smoke 的合成事件是 isTrusted:false，
     純靠玩一局測不出來，只能直接問那個判斷式）。 */
  {
    const gated=el=>bw.eval('isGatedTarget(document.querySelector("'+el+'"))');
    say(gated('#nextBtn')||gated('[data-br]')||gated('[data-ev]')||gated('#doTrain'),
      '會推進狀態的按鈕在連點閘的射程內');
    const free=['[data-inc]','[data-dec]','[data-int]','[data-att]','#autoBtn','#gateBtn','#resetBtn']
      .filter(s=>bdoc.querySelector(s)).filter(s=>gated(s));
    say(free.length===0,`分配類按鈕不受連點閘影響（被誤擋的：${free.join('、')||'無'}）`);
    /* 射程對了還不夠：時間戳也不可以被「分配類的重畫」重設。
       它們每按一次就 render 一次，如果每次 render 都更新 LAST_RENDER，
       玩家按完「自動分配」再按「完成訓練」就會被自己上一次重畫擋掉 350ms。
       這裡直接問：同一張卡重畫兩次，時間戳有沒有動。 */
    const t0=bw.eval('LAST_RENDER');
    bw.eval('autoAlloc(); render(); resetAlloc(); render();');
    say(bw.eval('LAST_RENDER')===t0,
      '同一張卡重畫不會重設連點閘的時間戳（分配完可以立刻按完成訓練）');
    /* 而卡片真的換掉的時候一定要重設，不然閘等於不存在 */
    bw.eval('G.log.push({kind:"branch",title:"假卡"}); render();');
    say(bw.eval('LAST_RENDER')!==t0,'換一張新卡就會重設時間戳（誤觸防護還在）');
    bw.eval('G.log.pop(); render();');
  }

  /* 分配點數的回收順序不可以跟「先點哪一項」有關 */
  {
    /* 兩項刻意配不一樣多、而且要回收奇數點——平均分配的話兩種點擊順序剛好對稱，
       就算回收順序真的跟點擊先後綁在一起也量不出來。 */
    const alloc=(k,n)=>{ for(let i=0;i<n;i++){
      const b=bdoc.querySelector(`[data-inc="${k}"]`);
      if(!b||b.disabled) break;
      b.dispatchEvent(new bw.MouseEvent('click',{bubbles:true}));
    }};
    const snap=()=>{ const o=bw.eval('JSON.stringify(ALLOC)'); const x=JSON.parse(o);
      return Object.keys(x).sort().map(k=>k+':'+x[k]).join(','); };
    bclick('[data-int="push"]'); bclick('#resetBtn');
    alloc('shoot',7); alloc('three',4);
    bclick('[data-int="safe"]');
    const a1=snap();
    bclick('[data-int="push"]'); bclick('#resetBtn');
    alloc('three',4); alloc('shoot',7);
    bclick('[data-int="safe"]');
    const a2=snap();
    say(a1===a2,
      `同樣的可見分配狀態，回收掉的點落在同樣的屬性（先投籃 → ${a1}／先三分 → ${a2}）`);
  }

  /* 抉擇面板結尾要有墊片：dock 是 sticky bottom:0，
     「進入下一年」與最後一顆抉擇按鈕下緣同一個 y，連點兩下就會誤觸退休 */
  {
    let guard=0,sawBranch=false;
    while(guard++<400&&!bdoc.querySelector('.resume')){
      if(bdoc.querySelector('#doTrain')) bclick('#doTrain');
      else if(bdoc.querySelector('[data-ev]')) bclick('[data-ev]');
      else if(bdoc.querySelector('#nextBtn')) bclick('#nextBtn');
      else if(bdoc.querySelector('[data-br]')){
        const dockIn=bdoc.querySelector('.dock .dock-in');
        const last=dockIn&&dockIn.lastElementChild;
        if(!sawBranch){
          sawBranch=true;
          say(!!last&&last.tagName==='P'&&last.className.indexOf('hint')>=0,
            `抉擇面板的最後一個元素是說明文字而不是按鈕（實際 ${last?last.tagName+'.'+last.className:'無'}）`);
        }
        bclick('[data-br]');
      }
      else break;
    }
    say(sawBranch,'（前提）這一局真的走到過抉擇畫面');
  }
  bw.close();
}

/* --- 9. 樣式：五套測試對 CSS 的斷言數本來是 0 --- */
/* 引擎有 verify/regress/audit 三層、UI 有 smoke 的結構斷言，CSS 589 行一條都沒有。
   結果就是「一條規則被 122 行外的同名規則整個蓋掉」可以活到現在。
   jsdom 已經是相依了，getComputedStyle 直接就能驗層疊之後的結果。 */
console.log('\n  ── 樣式（層疊之後的結果，不是規則本身） ──');
{
  const src=fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8');
  const css=(src.match(/<style>([\s\S]*?)<\/style>/)||[,''])[1];
  const sd=new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>`
    +`<div class="opt"><span class="odds bd-good">A</span><span class="odds bd-warn">B</span>`
    +`<span class="odds bd-bad">C</span><span class="odds bd-mid">D</span></div></body></html>`);
  const sw=sd.window,cols=['bd-good','bd-warn','bd-bad','bd-mid']
    .map(k=>sw.getComputedStyle(sd.window.document.querySelector('.odds.'+k)).color);
  console.log('    .opt .odds 的四個帶：'+cols.join(' / '));
  say(new Set(cols).size===4,
    `成功率粗略帶的四種顏色互不相同（實際 ${new Set(cols).size} 種）——`
    +'相同代表被別條規則蓋掉了，玩家會看到「幾乎穩了」跟「幾乎不可能」同一個灰');
  /* 三套皮膚都要把用到的變數定義完整，缺一個就是整塊變透明或吃到繼承色 */
  const used=new Set((css.match(/var\(--[a-z0-9-]+/g)||[]).map(s=>s.slice(4)));
  const skins=[null,'wood','paper'];
  const missing=[];
  for(const sk of skins){
    const doc=new JSDOM(`<!doctype html><html${sk?` data-skin="${sk}"`:''}><head><style>${css}</style>`
      +'</head><body><div id="t"></div></body></html>');
    const cs=doc.window.getComputedStyle(doc.window.document.documentElement);
    used.forEach(v=>{ if(!String(cs.getPropertyValue(v)).trim()) missing.push((sk||'預設')+':'+v); });
  }
  say(missing.length===0,`三套皮膚都定義了全部 ${used.size} 個 CSS 變數（缺 ${missing.length}${missing.length?'：'+missing.slice(0,4).join('、'):''}）`);
  /* 對比度：--dim 是 45 處 9–12px 小字的顏色，--muted 是次級說明文字，
     兩個都要對三種底色過 WCAG AA 的 4.5:1。CSS 一條都沒被測過的時候，
     三套皮膚的 --dim 全部在 2.5~3.6 之間躺了很久。 */
  {
    const hex=h=>{h=h.trim().replace('#','');
      if(h.length===3) h=h.split('').map(c=>c+c).join('');
      return [0,2,4].map(i=>parseInt(h.substr(i,2),16));};
    const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
    const lum=h=>{const[r,g,b]=hex(h);return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);};
    const cr=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
    const low=[];
    for(const sk of skins){
      const doc=new JSDOM(`<!doctype html><html${sk?` data-skin="${sk}"`:''}><head><style>${css}</style>`
        +'</head><body></body></html>');
      const cs=doc.window.getComputedStyle(doc.window.document.documentElement);
      const v=n=>cs.getPropertyValue(n).trim();
      for(const fg of ['--dim','--muted','--ink']) for(const bg of ['--ground','--panel','--panel2']){
        const r=cr(v(fg),v(bg));
        if(r<4.5) low.push(`${sk||'預設'} ${fg}/${bg} ${r.toFixed(2)}`);
      }
    }
    say(low.length===0,`三套皮膚的文字顏色都過 WCAG AA 4.5:1（不合格 ${low.length}${low.length?'：'+low.slice(0,4).join('、'):''}）`);
  }
  /* 同一個選擇器在頂層出現兩次，就是這一類 bug 的來源。純文字檢查，比 computed 還便宜。
     @media／@keyframes 整塊剝掉——那裡面的重複是刻意的覆寫。
     刻意允許的重複寫進白名單並附理由，不要靠放寬門檻。 */
  const OK_DUP=new Set([
    'body',        /* 48 行 html,body 的 reset ＋ 49 行的本體樣式 */
    '.opt .odds',  /* 196 行的外框 ＋ 318 行的字體，兩塊分屬不同段落 */
  ]);
  let flat='',ci=0,bare=css.replace(/\/\*[\s\S]*?\*\//g,'');
  while(ci<bare.length){
    const at=bare.indexOf('@',ci);
    if(at<0){ flat+=bare.slice(ci); break; }
    flat+=bare.slice(ci,at);
    let j=bare.indexOf('{',at),depth=0;
    if(j<0) break;
    for(;j<bare.length;j++){ if(bare[j]==='{')depth++; else if(bare[j]==='}'){ depth--; if(!depth){ j++; break; } } }
    ci=j;
  }
  const sels={};
  flat.replace(/([^{}]+)\{[^{}]*\}/g,(m,s)=>{
    s.split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>{ sels[x]=(sels[x]||0)+1; });
    return '';
  });
  const dup=Object.keys(sels).filter(k=>sels[k]>1&&!OK_DUP.has(k));
  say(dup.length===0,`沒有同一個選擇器被寫兩次（重複 ${dup.length}${dup.length?'：'+dup.slice(0,5).join('、'):''}）`);
}

console.error=origErr;
/* jsdom 未實作 window.scrollTo，屬測試環境限制不是程式問題 */
const real=errs.filter(e=>!/Not implemented: Window's scroll/.test(e));
say(real.length===0, real.length?('執行期錯誤 '+real.length+' 筆：'+real.slice(0,3).join(' / ')):'全程無執行期錯誤（已排除 jsdom 未實作的 scrollTo）');

console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ DOM 煙霧測試全部通過'));
process.exit(fail?1:0);
