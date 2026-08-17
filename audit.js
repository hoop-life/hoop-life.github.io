/* 稽核 loader：把引擎原始碼也一起餵進去（要靜態掃特質引用、掃重複拷貝），
   自動玩家從 autoplay-body.js 來——那是唯一一份，calib／stats 用的是同一支。
   另外把 UI 那一段、七個 .js 檔與四份文件的原文一起注入：
   「引擎有一份、畫面／文件另外抄一份」是這個專案最會生 bug 的模式（見 CLAUDE.md 鐵律 2），
   要擋住它就得讓稽核讀得到那些副本。 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const html=R('hooplife.html');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: 找不到 engine script'); process.exit(1); }
const ui=html.match(/<script id="ui">([\s\S]*?)<\/script>/);
if(!ui){ console.error('FAIL: 找不到 ui script'); process.exit(1); }
const JS_FILES=['autoplay-body.js','calib-body.js','stats-body.js','verify-body.js',
                'regress-body.js','audit-body.js','smoke.js','smoke-standalone.js'];
const DOC_FILES=['數值設定.md','開發指南.md','CLAUDE.md','README.md','遊戲設計.md'];
const src={}; JS_FILES.forEach(f=>src[f]=R(f));
const doc={}; DOC_FILES.forEach(f=>doc[f]=R(f));
const helper=`
const ENGINE_SRC=${JSON.stringify(m[1])};
const UI_SRC=${JSON.stringify(ui[1])};
const SRC_FILES=${JSON.stringify(src)};
const DOC_FILES=${JSON.stringify(doc)};
const play=(sd,posIdx,style)=>autoPlaySerious(sd,posIdx,style);
`;
const auto=R('autoplay-body.js');
const body=R('audit-body.js');
vm.runInThisContext(m[1]+'\n'+auto+'\n'+helper+'\n'+body,{filename:'hooplife-engine+audit.js'});
