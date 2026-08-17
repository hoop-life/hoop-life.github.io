/* 把 hooplife.html（artifact 版，沒有 doctype/head/body）包成可以獨立開的 index.html。
   artifact 主機會自己補外殼與一份 CSS reset，單機版沒有人幫你補，所以這裡要自己來。
   用法：node build-standalone.js [輸出路徑] */
const fs=require('fs'),path=require('path');

const SRC=path.join(__dirname,'hooplife.html');

/* 外殼樣板只能有這一份。smoke-standalone.js 會 require 這個函式，把 hooplife.html
   重新包一次跟 index.html 比對——npm test 從不跑 build，沒有這道檢查的話
   「改了引擎、測試全綠、忘記 build」會讓公開網址上的遊戲跟剛剛測過的是兩個世界。
   注意不要在別的地方再抄一份外殼，那就變成測試重新實作生產程式。 */
function buildHtml(inner){
/* 防呆：來源檔一旦被塞進外殼標籤，包兩層會壞掉 */
for(const tag of ['<!doctype','<html','<head','<body']){
  if(inner.toLowerCase().indexOf(tag)>=0)
    throw new Error(`來源檔已經含有 ${tag}，不該再包一層外殼`);
}
/* 版本號從原始碼裡的 VERSION 讀出來，不在這裡再寫一份 */
const version=(inner.match(/const VERSION='([^']+)'/)||[])[1]||'0.0.0';
/* 用不到外部檔案，favicon 直接畫在 data URI 裡（emoji 交給系統字型畫） */
const favicon='data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">🏀</text></svg>');

return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<!-- 預設皮膚會跟著系統偏好走（preferredSkin()：淺色系統 → 木地板），
     所以外殼不可以寫死 dark：捲軸與手機網址列會跟畫面不同調。 -->
<meta name="color-scheme" content="dark light">
<meta name="description" content="台灣籃球人生模擬器：從 HBL 一路打到 NBA，或者停在某個你沒想過的地方。">
<meta name="theme-color" content="#12100D" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F0E5D2" media="(prefers-color-scheme: light)">
<meta name="version" content="${version}">
<link rel="icon" href="${favicon}">
<style>
/* 最小 reset：artifact 主機本來會注入一份，單機版要自己帶 */
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--ground,#12100D);color:var(--ink,#F2E9D8)}
img,svg{max-width:100%;height:auto}
button,input,select,textarea{font:inherit;color:inherit}
</style>
${inner}
</body>
</html>
`;
}
module.exports={buildHtml:buildHtml,SRC:SRC};

if(require.main===module){
  const OUT=process.argv[2]||path.join(__dirname,'index.html');
  const inner=fs.readFileSync(SRC,'utf8');
  const html=buildHtml(inner);
  const title=(inner.match(/<title>([^<]*)<\/title>/)||[])[1]||'HoopLife';
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,html,'utf8');
  console.log(`✓ ${title} → ${OUT}`);
  console.log(`  ${(Buffer.byteLength(html)/1024).toFixed(0)} KB，零外部相依，直接用瀏覽器開就能玩`);
}
