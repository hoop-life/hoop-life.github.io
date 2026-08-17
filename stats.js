/* 分佈報表 loader：跟 calib.js 一樣把 engine 挖出來，只是不改任何常數。
   用法：npm run stats（N=8000 npm run stats 可以加大樣本）
   這不是測試，是「現在的平衡長什麼樣子」的量測工具。 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: 找不到 engine script'); process.exit(1); }
const auto=fs.readFileSync(path.join(__dirname,'autoplay-body.js'),'utf8');
const body=fs.readFileSync(path.join(__dirname,'stats-body.js'),'utf8');
vm.runInThisContext(m[1]+'\n'+auto+'\n'+body,{filename:'hooplife-engine+stats.js'});
