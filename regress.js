const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: 找不到 engine script'); process.exit(1); }
vm.runInThisContext(m[1]+'\n'+fs.readFileSync(path.join(__dirname,'regress-body.js'),'utf8'),{filename:'regress.js'});
