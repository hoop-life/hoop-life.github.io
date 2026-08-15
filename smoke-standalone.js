/* 單機版（完整 HTML 外殼）能不能真的跑起來——包括 file:// 情境下沒有 clipboard 的路徑 */
const fs=require('fs'),{JSDOM}=require('jsdom');
const p=process.argv[2]||'c:/project/HoopLife/index.html';
const html=fs.readFileSync(p,'utf8');
let fail=0; const say=(ok,m)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+m); if(!ok) fail++; };

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
