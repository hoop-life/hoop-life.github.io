/* 生涯指數的校準工具：跑 3,000 局，印出 CI_K 與 CI_PCTL 該填什麼。
   這不是測試（不會有 PASS/FAIL），是「改完計分之後拿去更新引擎裡那兩個常數」的產生器。
   用法：npm run calib，然後把印出來的兩行貼回 hooplife.html。
   跑完記得 npm test —— regress.js 會檢查引擎裡的表跟實測分佈對不對得起來。 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: 找不到 engine script'); process.exit(1); }
const body=fs.readFileSync(path.join(__dirname,'calib-body.js'),'utf8');
vm.runInThisContext(m[1]+'\n'+body,{filename:'hooplife-engine+calib.js'});
