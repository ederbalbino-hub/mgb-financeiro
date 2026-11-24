const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../../..');
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html'));fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'});r.end(b);});}).listen(0,async()=>{
  const port=srv.address().port; const b=await chromium.launch(); const pg=await b.newPage();
  const errs=[],ext=new Set();
  await pg.route('**/*',rt=>{const u=rt.request().url(); if(u.startsWith('http://127.0.0.1:'+port)) return rt.continue(); ext.add(new URL(u).host); if(/\/api\//.test(u)) return rt.fulfill({status:200,contentType:'application/json',body:'{}'}); return rt.abort();});
  pg.on('pageerror',e=>errs.push('pageerror: '+e.message.split('\n')[0]));
  pg.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,160)); });
  await pg.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'load',timeout:60000}).catch(e=>errs.push('goto '+e.message));
  await pg.waitForTimeout(3000);
  const r=await pg.evaluate(()=>({goPage:typeof goPage,showOpPanel:typeof showOpPanel,MODULES:typeof MODULES,MGBInicio:typeof MGBInicio,home:(document.getElementById('page-home')||{}).style?.display}));
  // percorre páginas
  for(const p of ['overview','custos','relatorios','leads','planocaixa','radioops','ferramentas','contabilidade','operacional','clientes']){ try{ await pg.evaluate(p=>goPage(p),p);}catch(e){errs.push('goPage('+p+'): '+e.message.split('\n')[0]);} }
  for(const t of ['mercadao','vaapty','pasta','tvpainel','tvcondos','tvanunc','tvdespesas','elevador','parceria','gerador','blocos']){ try{ await pg.evaluate(t=>showOpPanel(t),t);}catch(e){errs.push('showOpPanel('+t+'): '+e.message.split('\n')[0]);} }
  await pg.waitForTimeout(1000);
  console.log(JSON.stringify({r,hostsBloqueados:[...ext],erros:[...new Set(errs)]},null,1));
  await b.close(); srv.close();
});
