/* 單機版（完整 HTML 外殼）能不能真的跑起來——包括 file:// 情境下沒有 clipboard 的路徑 */
const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const p=process.argv[2]||'c:/project/HoopLife/index.html';
const html=fs.readFileSync(p,'utf8');
let fail=0; const say=(ok,m)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+m); if(!ok) fail++; };

/* npm test 從不跑 build，底下所有斷言驗的都是「可能已經過期的」index.html。
   實測：只改 hooplife.html 的亂數順序不重建，這支照樣 exit 0，
   而兩份檔案的 6dkts3aa 已經是不同的人。外殼樣板向 build-standalone.js 借，
   不要在這裡再抄一份。 */
{
  const {buildHtml,SRC}=require('./build-standalone.js');
  const fresh=buildHtml(fs.readFileSync(SRC,'utf8'));
  say(fresh===html,`${path.basename(p)} 是最新的 build`
    +(fresh===html?'':'——hooplife.html 改過但沒有重新 npm run build，這份成品是舊世界'));
}

const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/'});
dom.window.addEventListener('error',e=>errs.push(String(e.error||e.message)));
const w=dom.window,d=w.document;

say(d.doctype&&d.doctype.name==='html','有 <!doctype html>（不會掉進 quirks mode）');
say(d.compatMode==='CSS1Compat','排版是標準模式，不是 quirks mode');
say(d.characterSet.toLowerCase()==='utf-8','編碼是 UTF-8（中文不會變亂碼）');
say(!!d.querySelector('meta[name="viewport"]'),'有 viewport meta（手機上不會縮成一團）');
say(d.documentElement.lang==='zh-Hant','html lang 標了正體中文');
say(!!d.querySelector('link[rel="icon"]'),'有 favicon');
say(d.title.indexOf('HoopLife')>=0,`標題正確（${d.title}）`);
/* 版本號要有單一來源：成品裡帶得出來，而且跟 package.json 對得上。
   package-lock.json 也算一處——它會被 CI 的 npm ci 讀進去，改版時最容易被忘掉
   （實測 v1.4.2 就漏了，lock 還停在 1.0.0）。 */
{
  const meta=d.querySelector('meta[name="version"]');
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8')).version;
  const lockRaw=(()=>{ try{ return JSON.parse(fs.readFileSync(path.join(__dirname,'package-lock.json'),'utf8')); }catch(e){ return null; } })();
  const lock=lockRaw?lockRaw.version:null;
  const eng=(fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8')
    .match(/const VERSION='([^']+)'/)||[])[1];
  say(!!meta&&meta.content===eng&&eng===pkg&&(!lockRaw||lock===pkg),
    `版本號四處一致（成品 ${meta?meta.content:'無'}／原始碼 ${eng}／package.json ${pkg}／lock ${lock||'無'}）`);
  /* 玩家也要看得到。只放在 <meta> 裡的話，別人回報「這顆種子跟你寫的不一樣」時
     問不出他玩的是哪一版，而種子的承諾本來就只在同一個版本內成立。 */
  const shown=(d.querySelector('.hint.ver')||{}).textContent||'';
  say(shown.indexOf('v'+eng)>=0,`開場畫面看得到版本號（${shown.trim().slice(0,20)||'找不到'}）`);
}
say(!/<html[\s>]/i.test(html.slice(html.indexOf('<html')+5)),'外殼只有一層，沒有包兩次');

/* 真的跑得起來：開場畫面要生得出來 */
const start=d.querySelector('#app')||d.body;
say((start.textContent||'').length>200,'開場畫面有渲染出內容');
const btns=[...d.querySelectorAll('button')];
say(btns.length>=10,`開場有 ${btns.length} 顆按鈕`);

/* file:// 情境：navigator.clipboard 不存在時不可以炸 */
w.eval('delete navigator.clipboard');
let threw=null;
try{ w.eval("copyText('測試複製')"); }catch(e){ threw=String(e); }
say(!threw,'沒有 clipboard API 時 copyText 不會丟例外（file:// 直接開也能用）'+(threw?`：${threw}`:''));

/* 完整跑一局，確認引擎在單機外殼下一樣正常 */
w.eval("G=createGame('standalone1','測試員','SF','allround')");
let guard=0;
while(w.eval('G.phase')!=='end'&&guard++<400){
  const ph=w.eval('G.phase');
  if(ph==='train') w.eval("applyTrain(G,'normal',{},'steady')");
  else if(ph==='event') w.eval('applyEvent(G,0)');
  else if(ph==='result') w.eval('advance(G)');
  else if(ph==='branch') w.eval('applyBranch(G,0)');
  else break;
}
say(w.eval('G.phase')==='end',`完整跑完一局（${guard} 步）`);
say(w.eval('G.seasons.length')>0,`產生了 ${w.eval('G.seasons.length')} 個球季`);
say(!!w.eval('G.summary&&G.summary.grade&&G.summary.grade.g'),`結局評價 ${w.eval('G.summary.grade.g')}`);

const real=errs.filter(e=>!/scrollTo|Not implemented/i.test(e));
say(real.length===0,`全程無執行期錯誤（${real.length}）`+(real.length?'：'+real[0]:''));
console.log('\n'+(fail?`✗ ${fail} 項未通過`:'✓ 單機版全部通過'));
process.exit(fail?1:0);
