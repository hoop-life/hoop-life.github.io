/* 無頭驗證 loader：抽出 <script id="engine"> 與測試本體串成同一支腳本執行
   （必須同一支，const 宣告才在同一個 lexical scope） */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: 找不到 engine script'); process.exit(1); }
const body=fs.readFileSync(path.join(__dirname,'verify-body.js'),'utf8');
vm.runInThisContext(m[1]+'\n'+body,{filename:'hooplife-engine+verify.js'});
