/* 稽核 loader：把引擎原始碼也一起餵進去（要靜態掃特質引用） */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'hooplife.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: 找不到 engine script'); process.exit(1); }
const helper=`
const ENGINE_SRC=${JSON.stringify(m[1])};
/* 共用的自動玩家：貪婪分配 + 偏好往上爬 */
function play(sd,posIdx,style){
  const g=createGame(sd,'測',Object.keys(POS)[posIdx%5],style);
  let guard=0;
  while(g.phase!=='end'){
    if(++guard>500) break;
    const p=g.pending;
    if(p.type==='train'){
      const it=g.load<62?'push':(g.load<82?'normal':'safe');
      const pts=trainPoints(g,it),a={},acc={},w=POS[g.pos].w;
      for(let i=0;i<pts;i++){ let b=null,bs=-1,bg=0;
        for(const at of ATTRS){ const g0=gainFor(g,at.k,acc[at.k]||0);
          if(g0<=0) continue;
          const s=(w[at.k]||0.01)*g0; if(s>bs){bs=s;b=at.k;bg=g0;} }
        if(!b)break; a[b]=(a[b]||0)+1; acc[b]=(acc[b]||0)+bg; }
      applyTrain(g,it,a,g.load<74?'allin':'steady');
    }
    else if(p.type==='event') applyEvent(g,0);
    else if(p.type==='result') advance(g);
    else if(p.type==='branch'){
      let bi=0,bs=-1;
      p.opts.forEach((o,i)=>{ const x=o.act||'';
        const s=x.indexOf('move:')===0?100+LEAGUES[x.slice(5)].tier
          :x==='nbaDraft'?99:x==='goNCAA'?98:x==='tryJapan'?90:x==='goDraft'?60
          :x==='stay'?50:x.indexOf('natl:')===0?78+(o.p||0)*8:x==='resign'?48:20;
        if(s>bs){bs=s;bi=i;} });
      applyBranch(g,bi);
    } else break;
  }
  return g;
}
`;
const body=fs.readFileSync(path.join(__dirname,'audit-body.js'),'utf8');
vm.runInThisContext(m[1]+'\n'+helper+'\n'+body,{filename:'hooplife-engine+audit.js'});
