// Detector: abre cada tela do hub com dados INVENTADOS e avisa se só olhar/clicar altera os dados guardados.
// Uso: node docs/auditoria/ferramentas/telas-sem-efeito.cjs   (nada sai da máquina: API e banco são simulados)
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2]||path.resolve(__dirname,'../../..');
const hoje=new Date(), Y=hoje.getFullYear(), M=String(hoje.getMonth()+1).padStart(2,'0');
const L=(d,f,u,extra)=>Object.assign({t:'Recorrente',tipo:'Licença',d,f,q:1,u,cc:'',venc:'',pago:false,dataPago:'',mesesRec:12,dataInicio:Y+'-01-01'},extra||{});
const fixture={ _v:5,
  rec:{ mb:{Benjamin:{valor:3000,inicio:Y+'-01',meses:12},'Calçadão':{valor:2500,inicio:Y+'-01',meses:12}},
        radio:{'Leo Cosméticos':{valor:4000,inicio:Y+'-01',meses:24},'Mercadão Prochet':{valor:3500,inicio:Y+'-01',meses:12}},
        tv:{'Cliente Piloto':{valor:1500,inicio:Y+'-01',meses:12}}, vaapty:{'Expansão':{valor:2000,inicio:Y+'-01',meses:12}} },
  db:{ mb:{Benjamin:[L('Rádio','Listen',64.87)]}, radio:{'Leo Cosméticos':[L('Sistema','Listen',300)]}, elev:{Uptown:[L('4yousee','4yousee',39.56)],'Lagoa Dourada':[L('4yousee','4yousee',39.56)]} },
  anunciantes:[{id:1,nome:'Padaria Sol',valor:600,inicio:Y+'-01',meses:12,telas:['Uptown','Lagoa Dourada']},{id:2,nome:'Pizzaria Bella',valor:400,inicio:(Y-1)+'-06',meses:6,telas:['Uptown']},{id:3,nome:'Ótica Luz',valor:900,inicio:Y+'-'+M,meses:12,telas:['Uptown','Lagoa Dourada','Spot']}],
  despesasComp:[{id:1,nome:'Operador do sistema',forn:'Cleiton',valor:500,inicio:Y+'-01',meses:24,telas:['Uptown','Lagoa Dourada','Spot']}],
  elevInvestimentos:[{id:1,item:'Histórico',valor:25000,pagoPor:'eder',data:Y+'-01-10'},{id:2,item:'Histórico',valor:23000,pagoPor:'jadson',data:Y+'-01-10'},{id:3,item:'Uptown',valor:120.5,pagoPor:'jadson',data:Y+'-'+M+'-05',tipo:'despesa'}],
  empresaDespesas:[{id:1,nome:'Contador',valor:500,inicio:Y+'-01',ativo:true}],
  receitasAvulsas:[{id:1,cliente:'Locução X',valor:800,mes:Y+'-'+M}], leads:[], notas:[], recibos:[], etiquetas:[], fatEmissoes:{}, notaConfig:{aliquotaMes:2.37,simplesMes:7.4},
};
const posts=[];
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html'));fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'});r.end(b);});}).listen(0,async()=>{
  const port=srv.address().port; const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1366,height:900}}); const errs=[];
  await pg.route('**/*',async rt=>{const rq=rt.request(),u=rq.url();
    if(u.startsWith('http://127.0.0.1:'+port)) return rt.continue();
    if(/cdnjs|jsdelivr/.test(u)) return rt.continue();
    if(/\/api\/estado/.test(u)){ if(rq.method()==='POST'){ posts.push({t:Date.now(),body:rq.postData()}); return rt.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,v:fixture._v+posts.length})}); }
      return rt.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Object.assign({},fixture,{_v:fixture._v+posts.length}))}); }
    if(/\/api\//.test(u)) return rt.fulfill({status:200,contentType:'application/json',body:'{}'});
    return rt.abort();});
  pg.on('pageerror',e=>errs.push('pageerror: '+e.message.split('\n')[0]));
  await pg.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'load',timeout:60000});
  await pg.waitForTimeout(9000); // migrações + rotinas automáticas
  await pg.evaluate(()=>{ window.valuesVisible=true; try{valuesVisible=true;}catch(e){} window.__snap=()=>JSON.stringify(serializeState()); window.__base=__snap(); });
  const passos=[
    ...['overview','custos','relatorios','leads','planocaixa','radioops','ferramentas','contabilidade','clientes','home'].map(p=>['página '+p,"goPage('"+p+"')"]),
    ...['mercadao','vaapty','pasta','tvpainel','tvcondos','tvanunc','tvdespesas','tvproposta','tvsindicos','elevador','parceria','gerador','blocos'].map(t=>['painel '+t,"goOperacional('telavertical');showOpPanel('"+t+"')"]),
    ...['overview','relatorios','home'].map(p=>['de novo '+p,"goPage('"+p+"')"]),
  ];
  const out=[];
  for(const [nome,js] of passos){
    const r=await pg.evaluate(js=>{
      const antes=JSON.parse(__snap()); let erro=null;
      try{ (0,eval)(js); }catch(e){ erro=String(e); }
      const depois=JSON.parse(__snap());
      const secoes=Object.keys(depois).filter(k=>JSON.stringify(antes[k])!==JSON.stringify(depois[k]));
      const det={}; secoes.forEach(k=>{ const a=JSON.stringify(antes[k])||'', d=JSON.stringify(depois[k])||''; let i=0; while(i<a.length&&a[i]===d[i]) i++; det[k]={antes:a.slice(Math.max(0,i-60),i+80), depois:d.slice(Math.max(0,i-60),i+80)}; });
      const vis=[...document.querySelectorAll('.page-active,[id^=page-]')].filter(e=>e.offsetParent!==null||e.style.display==='block').map(e=>e.id).slice(0,3);
      const txt=(document.querySelector('#tvp-root')||{}).innerText||'';
      const h=new Date(); let ve={},vv={},vm={}; try{ve=elevMesResumo(h.getFullYear(),h.getMonth());}catch(e){} try{vv=vaaptyRepasseMes(h.getFullYear(),h.getMonth());}catch(e){} try{vm=mercRepasseCalc(JSON.parse(localStorage.getItem('mgb_blocos_v4')||'{}'));}catch(e){vm={erro:String(e)}}
      const cards=((document.querySelector('#page-relatorios .pnl-sec-grupo')||{}).innerText||'').replace(/\s+/g,' ').slice(0,300);
      return {erro,secoes,det,cards,ve:[ve.rec,ve.desp,ve.resultado],vv:[vv.base,vv.valor],vm:[vm.base,vm.valor]};
    },js);
    await pg.waitForTimeout(1500);
    out.push({nome,...r});
  }
  const ruins=out.filter(o=>o.secoes.length||o.erro); console.log(ruins.length?JSON.stringify(ruins,null,1):'OK: '+out.length+' telas abertas, nenhuma alterou os dados'); if(errs.length) console.log('erros:',[...new Set(errs)]); process.exitCode=ruins.length?1:0;
  await b.close(); srv.close();
});
