/* Palimpsest v2 — a land rewritten. Vanilla JS + D3 (zoom only). */
(function(){
'use strict';
const C=ATLAS.PATCH(CONTENT), A=ATLAS, G=GEO;
const ERAS=C.ERAS; ERAS.forEach(e=>{e.geo=A.ERA_GEO[e.id];});
const N=ERAS.length;
const REP={orientation:-3150,canaan:-1350,israel:-850,persia:-450,hasmon:-80,rome:100,byz:500,islam:720,crusader:1150,mamluk:1400,ottoman:1880,mandate:1930,'48':1949.5,'67':1975,oslo:2000,now:2026.85};
const COURIER={thebes:'🐪',nineveh:'🐎',babylon:'🐪',persepolis:'🐎',alexandria:'⛵',antioch:'🐎',rome:'⛵',constantinople:'🐎',medina:'🐪',damascus:'🐪',baghdad:'🐪',cairo:'🐎',istanbul:'🐎',london:'🚢'};
const CAPEMO=Object.assign({nineveh:'🦁',alexandria:'🏺',antioch:'🏛️',medina:'🕌',baghdad:'📜',samaria:'👑',acre:'⚔️',jerusalem:'👑'},C.POWER_EMOJI);
const LEFT=new Set(['jaffa','gaza','ashkelon','caesarea','haifa','acre','tyre','sidon','ashdod','rafah','telaviv','khanyunis','ramla','lachish','megiddo','samaria','hebron','beersheba']);
const JERU=A.PLACES.jerusalem.ll;
const $=s=>document.querySelector(s);
const WIDE=()=>false;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- projection (Mercator, matching the relief sheet) ---------- */
const S=100,L0=31,L1=39,B0=27,B1=35.6;
const my=la=>Math.log(Math.tan(Math.PI/4+la*Math.PI/360))*180/Math.PI;
const MY1=my(B1),MY0=my(B0);
const proj=ll=>[(ll[0]-L0)*S,(MY1-my(ll[1]))*S];
const unproj=p=>[p[0]/S+L0,(2*Math.atan(Math.exp((MY1-p[1]/S)*Math.PI/180))-Math.PI/2)*180/Math.PI];
const f1=n=>Math.round(n*10)/10;
const ring=r=>'M'+r.map(p=>{const q=proj(p);return f1(q[0])+','+f1(q[1]);}).join('L')+'Z';
const lineD=r=>'M'+r.map(p=>{const q=proj(p);return f1(q[0])+','+f1(q[1]);}).join('L');
function geomD(g){
  if(!g) return '';
  if(g.type==='Polygon') return g.coordinates.map(ring).join('');
  if(g.type==='MultiPolygon') return g.coordinates.map(p=>p.map(ring).join('')).join('');
  if(g.type==='LineString') return lineD(g.coordinates);
  if(g.type==='MultiLineString') return g.coordinates.map(lineD).join('');
  return '';
}
const smooth=d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
const smoothOpen=d3.line().curve(d3.curveCatmullRom.alpha(.5));
function circD(c,i){const p=proj(c),r=c[2]/(111.2*Math.cos(c[1]*Math.PI/180))*S,pts=[];i=i||0;
  for(let j=0;j<28;j++){const a=j/28*2*Math.PI,q=r*(1+.2*Math.sin(3*a+i*1.7)+.12*Math.sin(5*a+i*2.9));pts.push([p[0]+q*Math.cos(a),p[1]+q*Math.sin(a)]);}
  return smooth(pts);}
function km(a,b){const R=6371,t=Math.PI/180,dla=(b[1]-a[1])*t,dlo=(b[0]-a[0])*t;const h=Math.sin(dla/2)**2+Math.cos(a[1]*t)*Math.cos(b[1]*t)*Math.sin(dlo/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function pip(ll,r){let x=ll[0],y=ll[1],inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
function geomHas(g,ll){const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;return polys.some(p=>pip(ll,p[0])&&!p.slice(1).some(h=>pip(ll,h)));}
function terrHas(t,ll){
  let ok=false;
  if(t.p) ok=pip(ll,t.p); else if(t.m) ok=geomHas(G.mod[t.m],ll); else if(t.circ) ok=t.circ.some(c=>km(c,ll)<=c[2]);
  if(ok&&t.clip) ok=geomHas(G.mod[t.clip],ll);
  return ok;
}

/* ---------- time ---------- */
const fmtY=y=>{y=Math.floor(y);return y<=0?[(-y||1),'BCE']:[y,y<1000?'CE':''];};
const fmtYs=y=>{const f=fmtY(y);return f[0]+(f[1]?' '+f[1]:'');};
function eraIdxOf(y){for(let i=N-1;i>=0;i--){if(y>=ERAS[i].geo.y[0])return i;}return 0;}
function fracOf(y){const i=eraIdxOf(y),g=ERAS[i].geo.y;return (i+Math.min(.9999,Math.max(0,(y-g[0])/(g[1]-g[0]))))/N;}
function yearOf(f){f=Math.min(.99999,Math.max(0,f));const i=Math.floor(f*N),u=f*N-i,g=ERAS[i].geo.y,span=g[1]-g[0];let y=g[0]+u*span;const q=span>1000?10:span>250?5:span>60?1:.05;return Math.round(y/q)*q;}
const active=(o,y,e)=>{const r=o.y||e.geo.y;return y>=r[0]&&(y<r[1]||(r[1]>=2026&&y<=r[1]));};

/* ---------- state ---------- */
const st={year:REP.rome,era:-1,layers:{rule:1,people:1,roads:1,stories:1,sacred:0,borders:0},free:0,wasPlaying:false,lens:{on:false,x:0,y:0,r:90,depth:1},journey:null,sel:null,cap:null,capView:false,playing:false,tw:null,scenePlace:null};
let T=d3.zoomIdentity,k0=1,W=0,H=0;

/* ---------- svg scaffold ---------- */
const svg=d3.select('#map');
const defs=svg.append('defs');
defs.append('clipPath').attr('id','clipLand').append('path').attr('clip-rule','evenodd').attr('d',geomD(G.landClip));
['mandate','westbank'].forEach(k=>defs.append('clipPath').attr('id','clip-'+k).append('path').attr('clip-rule','evenodd').attr('d',geomD(G.mod[k])));
const lensIn=defs.append('clipPath').attr('id','lensIn').append('circle');
const lensOut=defs.append('clipPath').attr('id','lensOut').append('path').attr('clip-rule','evenodd');
const root=svg.append('g');
root.append('rect').attr('class','sea').attr('x',-4600).attr('y',-3600).attr('width',8000).attr('height',6800);
root.append('path').attr('class','landw').attr('fill-rule','evenodd').attr('d',geomD(G.landWide));
root.append('path').attr('class','coast wide').attr('d',geomD(G.coastWide));
G.lakesWide.forEach(l=>root.append('path').attr('class','lake').attr('fill-rule','evenodd').attr('d',geomD(l.g)));
G.riversWide.forEach(r=>root.append('path').attr('class','river w').attr('d',geomD(r.g)));
root.append('image').attr('href','assets/relief.jpg').attr('x',0).attr('y',0).attr('width',(L1-L0)*S).attr('height',(MY1-MY0)*S).attr('preserveAspectRatio','none');
const gWater=root.append('g');
G.rivers.forEach(r=>gWater.append('path').attr('class','river').attr('d',geomD(r.g)));
A.EXTRA_WATER.rivers.forEach(r=>gWater.append('path').attr('class','river w').attr('d',smoothOpen(r.map(proj))));
G.lakes.forEach(l=>gWater.append('path').attr('class','lake').attr('fill-rule','evenodd').attr('d',geomD(l.g)));
const hula=gWater.append('path').attr('class','lake').attr('d',smooth(A.EXTRA_WATER.hula.p.map(proj)));
root.append('path').attr('class','coast').attr('d',geomD(G.coast));
const gBorders=root.append('g').style('display','none'); gBorders.append('path').attr('class','border').attr('d',geomD(G.borders));
const gTerrWrap=root.append('g').attr('clip-path','url(#clipLand)');
const gTerr=gTerrWrap.append('g').attr('id','terrNow'), gUnder=gTerrWrap.append('g').attr('clip-path','url(#lensIn)').style('display','none');
const gRoutes=root.append('g'), gFlows=root.append('g'), gPower=root.append('g');
const gHL=root.append('g').attr('clip-path','url(#clipLand)');
const gWaterLab=root.append('g'), gLab=root.append('g').attr('id','labNow'), gLabUnder=root.append('g').attr('clip-path','url(#lensIn)').style('display','none');
const gPlaces=root.append('g'), gSacred=root.append('g'), gVoices=root.append('g'), gFx=root.append('g');

/* counter-scaled items: keep constant screen size while the map zooms */
function cs(sel,ll,o){o=o||{};const p=proj(ll);sel.classed('cs',true).each(function(){this.__cs={x:p[0],y:p[1],rot:o.rot||0,minr:o.minr||0,dx:o.dx||0,dy:o.dy||0};});return sel;}
function applyCS(){const k=T.k,r=k/k0;root.selectAll('.cs').each(function(){const c=this.__cs;if(!c)return;this.setAttribute('transform',`translate(${c.x},${c.y}) scale(${1/k})`+(c.dx||c.dy?` translate(${c.dx},${c.dy})`:'')+(c.rot?` rotate(${c.rot})`:''));this.style.display=r<c.minr?'none':'';});}

/* ---------- zoom ---------- */
const zoom=d3.zoom().scaleExtent([.03,20]).translateExtent([[-4500,-3500],[3300,3000]])
  .filter(e=>!e.target.closest||!e.target.closest('#lensTab'))
  .on('start',e=>{if(e.sourceEvent){st.free=performance.now()+20000;$('#follow').hidden=false;}})
  .on('zoom',e=>{T=e.transform;root.attr('transform',T);applyCS();placeLens();})
  .on('end',()=>{declutter();});
svg.call(zoom).on('dblclick.zoom',null);
function fit(b,pad,dur,maxK){
  const p0=proj([b[0][0],b[1][1]]),p1=proj([b[1][0],b[0][1]]);
  pad=Object.assign({t:112,b:6,l:14,r:14},pad||{}); pad.b+=dockPad();
  let k=Math.min((W-pad.l-pad.r)/(p1[0]-p0[0]),(H-pad.t-pad.b)/(p1[1]-p0[1])); if(maxK)k=Math.min(k,maxK);
  const t=d3.zoomIdentity.translate((W+pad.l-pad.r)/2-k*(p0[0]+p1[0])/2,(H+pad.t-pad.b)/2-k*(p0[1]+p1[1])/2).scale(k);
  (dur?svg.transition().duration(dur):svg).call(zoom.transform,t); return k;
}
const HOME=[[34.0,29.4],[36.3,33.45]];
function dockPad(){return 172;}
function home(dur){st.capView=false;fit(HOME,null,dur);}
function flyTo(ll,z,dur){const k=k0*z,p=proj(ll);svg.transition().duration(dur==null?900:dur).call(zoom.transform,d3.zoomIdentity.translate(W/2-k*p[0],((H-dockPad())/2+40)-k*p[1]).scale(k));}
function size(){const r=$('#mapwrap').getBoundingClientRect();W=r.width;H=r.height;document.documentElement.style.setProperty('--dockH',(WIDE()?0:$('#dock').offsetHeight)+'px');svg.attr('viewBox',`0 0 ${W} ${H}`);st.lens.r=Math.round(Math.min(W,H)*.2);}

/* ---------- drawing an era's rule ---------- */
function drawTerr(gT,gL,e,y,under){
  gT.selectAll('*').remove(); gL.selectAll('*').remove();
  const act=e.geo.terr.filter(t=>active(t,y,e));
  act.forEach(t=>{
    let d=terrD(t);
    const g=t.clip?gT.append('g').attr('clip-path',`url(#clip-${t.clip})`):gT;
    const dark=d3.color(t.c).darker(1.1);
    g.append('path').attr('class','terr halo').attr('d',d).attr('stroke',t.c);
    g.append('path').attr('class','terr'+(/proposed|international/.test(t.l)?' prop':'')).attr('fill-rule','evenodd').attr('d',d).attr('fill',t.c).attr('fill-opacity',t.op).attr('stroke',dark).attr('stroke-opacity',t.bg?.25:.7);
    if(t.l){
      const at=t.at||centroid(t.p);
      const tx=cs(gL.append('g'),at,{minr:t.bg?.3:.45}).append('text').attr('class','tl').style('font-size',(t.bg?10.5:12)+'px').style('opacity',t.bg?.75:1);
      const words=t.l.split(' ');
      if(t.l.length>13&&words.length>1){const h=Math.ceil(words.length/2);tx.append('tspan').attr('x',0).attr('dy','-.3em').text(words.slice(0,h).join(' '));tx.append('tspan').attr('x',0).attr('dy','1.15em').text(words.slice(h).join(' '));}
      else tx.attr('dy','.35em').text(t.l);
    }
  });
  (e.geo.lines||[]).filter(t=>active(t,y,e)).forEach(t=>{
    const d=smoothOpen(t.p.map(proj));
    gT.append('path').attr('class','tline under').attr('d',d);
    gT.append('path').attr('class','tline').attr('d',d).attr('stroke',t.c);
    if(!under){gT.append('path').attr('class','routehit').attr('d',d).on('click',ev=>{ev.stopPropagation();card(`<h5>${esc(t.l)}</h5><p>${esc(t.sub)}</p>`);});}
  });
  (e.geo.labels||[]).forEach(l=>{cs(gL.append('g'),l[1],{rot:l[2]||0,minr:.4}).append('text').attr('class','gl2').style('font-size','10.5px').attr('dy','.35em').text(l[0]);});
  return act.map(t=>t.l+(t.y?t.y[0]:'')).join('|')+((e.geo.lines||[]).filter(t=>active(t,y,e)).length);
}
const terrD=t=>t.p?smooth(t.p.map(proj)):t.m?geomD(G.mod[t.m]):t.circ.map((c,i)=>t.circ.length>1?circD(c,i+1):circD(c,0)).join('');
function terrPts(t){if(t.p)return t.p;if(t.circ)return t.circ.map(c=>[c[0],c[1]]);const g=G.mod[t.m];return (g.type==='Polygon'?[g.coordinates]:g.coordinates).reduce((a,p)=>a.concat(p[0]),[]);}
function centroid(p){let x=0,y=0;p.forEach(q=>{x+=q[0];y+=q[1];});return [x/p.length,y/p.length];}
const terrSig=(e,y)=>e.id+':'+e.geo.terr.map((t,i)=>active(t,y,e)?i:'').join(',')+':'+(e.geo.lines||[]).map((t,i)=>active(t,y,e)?i:'').join(',');

/* ---------- places ---------- */
function eraPlaces(e,y){
  const seen=new Set(),labs=new Set(),out=[],old=e.places||[],oldK=new Set(old.map(p=>p[0])),oldL=new Set(old.map(p=>p[1]));
  (e.geo.places||[]).concat(old).forEach(p=>{if(seen.has(p[0])||labs.has(p[1])||!A.PLACES[p[0]])return;if(p[2]&&y<p[2])return;seen.add(p[0]);labs.add(p[1]);out.push({k:p[0],label:p[1],x:!(oldK.has(p[0])||oldL.has(p[1]))});});
  [st.sel,st.scenePlace].forEach(k=>{if(!k||!A.PLACES[k])return;const o=out.find(o=>o.k===k);if(o)o.x=false;else out.push({k,label:nameAt(k,y)});});
  return out;
}
function drawPlaces(e,y){
  gPlaces.selectAll('*').remove();
  eraPlaces(e,y).forEach((p,i)=>{
    const pl=A.PLACES[p.k],left=LEFT.has(p.k);
    const g=cs(gPlaces.append('g').attr('class','pin r'+pl.rank+(st.sel===p.k?' sel':'')),pl.ll,{minr:p.x?1.7:pl.rank>2?.75:.42}).datum({k:p.k,pri:(st.sel===p.k?0:pl.rank)*100+i,left,len:p.label.length});
    g.append('circle').attr('r',16).attr('fill','transparent');
    g.append('circle').attr('class','dot').attr('r',pl.rank===1?3.6:2.8);
    g.append('text').attr('class','pl').attr('x',left?-8:8).attr('dy','.34em').attr('text-anchor',left?'end':'start').text(p.label);
    g.on('click',ev=>{ev.stopPropagation();openPlace(p.k);});
  });
}
function declutter(){
  const kept=[];
  const nodes=gPlaces.selectAll('g.pin').nodes().filter(n=>n.style.display!=='none').sort((a,b)=>d3.select(a).datum().pri-d3.select(b).datum().pri);
  nodes.forEach(n=>{
    const d=d3.select(n).datum(),c=n.__cs,x=T.applyX(c.x),y=T.applyY(c.y),w=d.len*6.7+10;
    const box=[d.left?x-8-w:x+4,y-9,d.left?x-4:x+8+w,y+9];
    const hit=kept.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]);
    n.querySelector('text').style.display=hit?'none':'';
    if(!hit)kept.push(box);
  });
}

/* ---------- power thread, flows, routes, voices ---------- */
let anim=[];   // {type,el,...}
function capOf(e,y){const c=(e.geo.caps||[]).find(c=>y>=c[0]&&(y<c[1]||c[1]>=2026));return c?c[2]:null;}
function drawPower(e,y){
  gPower.selectAll('*').remove(); anim=anim.filter(a=>a.type!=='courier');
  const key=capOf(e,y); st.cap=key; const chip=$('#capChip');
  if(!key){const pc0=e.powerCenter;if(pc0&&!(e.geo.caps||[]).length){chip.hidden=false;chip.dataset.far='';chip.innerHTML=`Ruled from <b>${esc(pc0.city)}</b>`;}else chip.hidden=true;return;}
  const name=A.FAR[key][0],ll=A.FAR[key][1],dist=km(JERU,ll),far=dist>150;
  const pc=e.powerCenter, main=pc&&new RegExp(name.split(' ')[0],'i').test(pc.city);
  chip.hidden=false;
  chip.innerHTML=far?`Ruled from <b>${esc(name)}</b> · ${Math.round(dist*.621/10)*10} mi ${st.capView?'⟵':'⟶'}`:`Ruled from <b>${esc(name)}</b>, within the land`;
  chip.dataset.far=far?1:'';
  const g=cs(gPower.append('g').attr('class','pin cap'),ll);
  g.append('circle').attr('class','ring').attr('r',9);
  g.append('text').attr('class','emo sm').attr('y',-20).text(CAPEMO[key]||'🏛️');
  if(far) g.append('text').attr('class','pl').attr('y',24).attr('text-anchor','middle').text(name);
  g.on('click',ev=>{ev.stopPropagation();card(`<h5>${CAPEMO[key]||'🏛️'} ${esc(name)}</h5><p>${main&&pc.kind?esc(pc.kind)+'. ':''}${far?Math.round(dist*.621/10)*10+' miles from Jerusalem'+(main&&pc.travelTime?' — '+esc(pc.travelTime):'')+'.':'The seat of power is inside the land in these years.'}</p>`);});
  if(far){
    const a=proj(JERU),b=proj(ll),mx=(a[0]+b[0])/2,myy=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1];
    const d=`M${a[0]},${a[1]}Q${mx-dy*.12},${myy+dx*.12} ${b[0]},${b[1]}`;
    const path=gPower.insert('path','g').attr('class','thread').attr('d',d);
    const em=gPower.append('text').attr('class','emo sm').text(COURIER[key]||'🐎').style('pointer-events','none');
    anim.push({type:'courier',el:em.node(),path:path.node(),len:path.node().getTotalLength(),t:.2,sp:.00004});
  }
}
function drawFlows(e,y){
  gFlows.selectAll('*').remove(); anim=anim.filter(a=>a.type!=='dot');
  if(!st.layers.people)return '';
  const act=(e.geo.flows||[]).filter(f=>active(f,y,e));
  act.forEach(f=>{
    const a=proj(f.f),b=proj(f.t),dx=b[0]-a[0],dy=b[1]-a[1],c=[(a[0]+b[0])/2-dy*f.cv,(a[1]+b[1])/2+dx*f.cv],col=C.FLOWCOL[f.col][0];
    gFlows.append('path').attr('class','flow').attr('stroke',col).attr('d',`M${a[0]},${a[1]}Q${c[0]},${c[1]} ${b[0]},${b[1]}`);
    for(let i=0;i<f.n;i++){const el=gFlows.append('circle').attr('r',3.2).attr('fill',col).attr('stroke','#eadfc3').attr('stroke-width',.8).style('pointer-events','none');anim.push({type:'dot',el:el.node(),a,b,c,t:i/f.n,sp:.00016/Math.max(1,Math.hypot(dx,dy)/260)});}
  });
  return act.length;
}
function drawRoutes(e,y){
  gRoutes.selectAll('*').remove(); anim=anim.filter(a=>a.type!=='trade');
  if(!st.layers.roads)return;
  A.ROUTES.filter(r=>y>=r.y[0]&&y<=r.y[1]).forEach(r=>{
    const d=smoothOpen(r.p.map(proj));
    const p=gRoutes.append('path').attr('class','route'+(r.rail?' rail':'')).attr('stroke',r.c).attr('d',d);
    gRoutes.append('path').attr('class','routehit').attr('d',d).on('click',ev=>{ev.stopPropagation();card(`<small>A road</small><h5>${esc(r.l)}</h5><p>${esc(r.text)}</p>${r.id==='maris'&&C.TRADE_INFO[e.id]?`<p class="dim"><b>In this age.</b> ${esc(C.TRADE_INFO[e.id])}</p>`:''}`);});
  });
}
function drawVoices(e){
  gSacred.selectAll('*').remove();
  if(st.layers.sacred) (C.ERA_SACRED[e.id]||[]).forEach(k=>{
    const s=C.SACRED_SITES[k],dx=k==='temple'?13:k==='sepulchre'?-13:0;
    cs(gSacred.append('g'),A.SACRED_LL[k],{dx,dy:k==='bethlehem'?12:0,minr:.9}).append('text').attr('class','emo sm').text(s.icon)
      .on('click',ev=>{ev.stopPropagation();card(`<h5>${s.icon} ${esc(s.name)}</h5><p>${esc(s.text)}</p>`);});
  });
}
const ANG=[-90,-145,-35,180,145,35,90,0];
function drawMarkers(e,y){
  gVoices.selectAll('*').remove(); if(!st.layers.stories)return;
  const by={},add=(k,m)=>{if(!A.PLACES[k])k='jerusalem';(by[k]=by[k]||[]).push(m);};
  (e.stories||[]).forEach(s=>add(s.loc,{icon:s.prop,minr:.5,html:`<small>A voice · ${esc(e.cnm)}</small><h5>${s.prop} ${esc(s.role)}</h5><p>${esc(s.text)}</p>`}));
  (C.MAP_FACTS[e.id]||[]).forEach((f,j)=>{const k=(A.FACT_LOC[e.id]||[])[j];if(k)add(k,{icon:f.icon,minr:.6,html:`<small>${esc(e.cnm)}</small><h5>${f.icon} ${esc(f.title)}</h5><p>${esc(f.text)}</p>`});});
  (e.geo.events||[]).forEach(ev=>{if(ev[0]<=y&&ev[2]&&A.PLACES[ev[2]])add(ev[2],{dia:1,minr:.6,html:`<small>${fmtYs(ev[0])} · what happened here</small><p style="color:var(--ink);font-size:1.08rem">${esc(ev[1])}</p><a class="more" data-jump="${ev[0]}">Go to this moment ›</a>`});});
  Object.keys(by).forEach(k=>by[k].forEach((m,i)=>{const a=ANG[i%8]*Math.PI/180,r=27+(i>=8?17:0);
    const g=cs(gVoices.append('g').attr('class','mk'),A.PLACES[k].ll,{dx:Math.cos(a)*r,dy:Math.sin(a)*r,minr:m.minr});
    if(m.dia)g.append('text').attr('class','evm').text('◆'); else {g.append('circle').attr('r',12);g.append('text').attr('class','emo').text(m.icon);}
    g.append('circle').attr('class','hit').attr('r',15);
    g.on('click',ev=>{ev.stopPropagation();card(m.html);});}));
}
function drawWaters(y){
  gWaterLab.selectAll('*').remove();
  A.WATERS.forEach(w=>{const n=w.names.find(n=>y>=n[0]&&y<n[1]);if(!n)return;
    cs(gWaterLab.append('g'),w.at,{rot:w.rot||0,minr:w.size>12?.25:.7}).append('text').attr('class','wl').style('font-size',w.size+'px').attr('text-anchor',w.anchor||'middle').attr('dy','.35em').text(n[2]);});
  hula.style('display',y<A.EXTRA_WATER.hula.y[1]?'':'none');
  return A.WATERS.map(w=>(w.names.find(n=>y>=n[0]&&y<n[1])||[])[2]).join('|');
}
function pulse(ll){const g=cs(gFx.append('g'),ll);const c=g.append('circle').attr('class','pulse').attr('r',4);anim.push({type:'pulse',el:c.node(),g:g.node(),t0:performance.now()});applyCS();}


/* ---------- year + era rendering ---------- */
let sigT='',sigP='',sigF='',sigW='',sigR='',sigM='';
function setYear(y,o){
  o=o||{}; y=Math.max(ERAS[0].geo.y[0],Math.min(y,ERAS[N-1].geo.y[1])); const i=eraIdxOf(y),e=ERAS[i]; st.year=y;
  if(i!==st.era){if(st.sel&&!o.keepSel)st.sel=null;st.era=i;onEra(e);sigT=sigP=sigF=sigR=sigM='';hideCard();}
  const s1=terrSig(e,y); if(s1!==sigT){sigT=s1;drawTerr(gTerr,gLab,e,y);}
  const s2=e.id+eraPlaces(e,y).map(p=>p.k+p.label+(p.x?1:0)).join()+st.sel+st.scenePlace; if(s2!==sigP){sigP=s2;drawPlaces(e,y);}
  const s3=e.id+(e.geo.flows||[]).map((f,j)=>active(f,y,e)?j:'').join()+st.layers.people; if(s3!==sigF){sigF=s3;drawFlows(e,y);}
  const s4=e.id+A.ROUTES.map((r,j)=>y>=r.y[0]&&y<=r.y[1]?j:'').join()+st.layers.roads; if(s4!==sigR){sigR=s4;drawRoutes(e,y);}
  const w=A.WATERS.map(w=>w.names.findIndex(n=>y>=n[0]&&y<n[1])).join()+(y<1958); if(w!==sigW){sigW=w;drawWaters(y);}
  const s5=e.id+(e.geo.events||[]).filter(ev=>ev[0]<=y).length+st.layers.stories; if(s5!==sigM){sigM=s5;drawMarkers(e,y);}
  const ck=capOf(e,y); if(ck!==st.cap||o.force){drawPower(e,y);}
  applyCS(); declutter();
  const yb=$('#yearBig'); if(e.id==='orientation') yb.innerHTML='<span style="font-size:.62em">Before the names</span>'; else {const f=fmtY(y);yb.innerHTML=f[0]+(f[1]?`<small>${f[1]}</small>`:'');}
  $('#thumb').style.left=(o.raw!=null?o.raw:fracOf(y))*100+'%'; $('#thumbLab').textContent=e.id==='orientation'?'the land itself':fmtYs(y);
  if(st.lens.on) drawUnder();
  if(!o.noHash) saveHash();
}
function onEra(e){
  document.querySelectorAll('#segs i').forEach((s,j)=>s.classList.toggle('on',j===st.era));
  $('#eraLine').innerHTML=`<b>${esc(e.name)}</b><br><i>${esc(e.range)}${e.id==='orientation'?'':' · '+esc(e.cyr)}</i>`;
  drawVoices(e); Snd.era(e.id);
}
function chapterHTML(e){
  let h=`<h3 style="margin-top:0">${esc(e.range)}${e.id==='orientation'?'':' · '+esc(e.cyr)}</h3><h2>${esc(e.name)}</h2><p class="sub">${esc(e.essence)}</p>`;
  h+=e.body.map(p=>`<p>${p}</p>`).join('');
  if(e.gap) h+=`<div class="note">${e.gap}</div>`;
  h+='<div class="names" style="margin:.2em 0 1em">'+e.land.map(l=>`<span><em>${esc(l[0])}</em>${esc(l[1])}</span>`).join('')+'</div>';
  const evs=e.geo.events||[];
  if(evs.length) h+='<details><summary>Chronicle</summary><ul class="chron">'+evs.map(ev=>`<li data-jump="${ev[0]}"><b>${fmtYs(ev[0])}</b>${esc(ev[1])}</li>`).join('')+'</ul></details>';
  if((e.stories||[]).length) h+='<details><summary>Voices</summary>'+e.stories.map(s=>`<div class="voice"><span class="e">${s.prop}</span><p><b>${esc(s.role)}</b> ${esc(s.text)}</p></div>`).join('')+'<p class="foot" style="font-size:.92rem;color:var(--ink2);font-style:italic;margin-top:.5em">Representative composites, not quotations.</p></details>';
  let more='';
  if(e.bible) more+=`<div class="note"><b>Scripture and evidence.</b> ${[].concat(e.bible).join(' ')}</div>`;
  if(e.powerCenter){const pc=e.powerCenter;more+=`<div class="note"><b>Ruled from ${esc(pc.city)}.</b> ${esc(pc.kind)}.</div>`;}
  const pop=C.POPULATION[e.id]; if(pop) more+=`<div class="note"><b>${esc(pop.who)}.</b> ${esc(pop.detail)}</div>`;
  if(C.TRADE_INFO[e.id]) more+=`<div class="note">🫒 <b>Trade.</b> ${esc(C.TRADE_INFO[e.id])}</div>`;
  (C.MAP_FACTS[e.id]||[]).forEach(f=>{more+=`<div class="note">${f.icon} <b>${esc(f.title)}.</b> ${esc(f.text)}</div>`;});
  if(more) h+=`<details><summary>People, power and trade</summary>${more}</details>`;
  const m=MUSIC[e.id]; if(m) h+=`<details><summary>The music</summary><div class="note">♪ <b>${esc(m.name)}.</b> ${esc(m.note)}</div></details>`;
  if(st.era===N-1) h+=`<p class="sub" style="margin-top:1em">${esc(C.FOOT)}</p>`;
  return h;
}

/* ---------- music: what each age may have sounded like ---------- */
const PY=[0,204,408,498,702,906,1110];
const MUSIC={
 orientation:{name:'A drone, before music we can name',root:110,cents:[0,702],inst:['voice'],bpm:26,dens:.25,drone:.9,note:'Nothing is known of the music of these millennia. This is only an open fifth.'},
 canaan:{name:'Bronze Age lyre',root:196,cents:PY,inst:['lyre'],bpm:66,dens:.8,drone:.25,note:'Clay tablets from Babylonia and Ugarit record how lyres were tuned, in seven-note scales close to this one, and one hymn of about 1400 BCE survives. The tune here is improvised.'},
 israel:{name:'The kinnor, a lyre',root:185,cents:[0,204,294,498,702,906,996],inst:['lyre'],bpm:60,dens:.75,drone:.3,note:'The Psalms name the kinnor and the nevel, both stringed. Their tuning is not recorded; this borrows the neighbouring Mesopotamian system.'},
 persia:{name:'Lyre and reed pipe',root:174.6,cents:[0,204,294,498,702,792,996],inst:['lyre','ney'],bpm:58,dens:.7,drone:.35,note:'No notation survives from the Persian period. This is a guess, kept close to what came before.'},
 hasmon:{name:'Greek Dorian mode',root:164.8,cents:[0,90,294,498,702,792,996],inst:['lyre'],bpm:70,dens:.8,drone:.2,note:'Greek music theory is well documented, and some sixty fragments of notated music survive. The Dorian was the mode Greeks thought most dignified.'},
 rome:{name:'Greek modes under Rome',root:220,cents:[0,204,408,498,702,906,996],inst:['lyre','ney'],bpm:72,dens:.8,drone:.2,note:'The scale of the Seikilos epitaph, the oldest complete song with notation, from Roman Asia Minor. The tune here is improvised, not that song.'},
 byz:{name:'Byzantine chant over a drone',root:146.8,cents:[0,200,367,500,700,900,1067],inst:['voice'],bpm:44,dens:.85,drone:.8,note:'Byzantine chant is a living tradition with a held bass note, the ison. Its notation begins around the 10th century; the earlier sound is reconstructed.'},
 islam:{name:'Maqam Rast on the oud',root:146.8,cents:[0,204,355,498,702,906,1053],inst:['oud'],bpm:76,dens:.8,drone:.3,note:'Al-Kindi and al-Farabi described the oud and its scales in the 9th and 10th centuries, including the “neutral” third heard here, between major and minor.'},
 crusader:{name:'Plainchant in parallel fifths',root:146.8,cents:[0,204,294,498,702,906,996],inst:['chant'],bpm:46,dens:.85,drone:.5,note:'Latin chant in the Dorian mode, sung in parallel fifths as in the organum of the 12th century. Outside the castle walls the oud played on.'},
 mamluk:{name:'Maqam Bayati, oud and ney',root:146.8,cents:[0,151,294,498,702,792,996],inst:['oud','ney'],bpm:70,dens:.75,drone:.35,note:'By the 13th century Safi al-Din al-Urmawi had set out a full system of modes. Bayati, with its lowered second, is one of the most common in Arab music today.'},
 ottoman:{name:'Makam Hicaz, ney and tanbur',root:146.8,cents:[0,125,385,498,702,820,996],inst:['ney','oud'],bpm:60,dens:.75,drone:.4,note:'Ottoman court music was written down from about 1700. Hicaz, with its wide second step, is the sound many listeners hear as “Eastern”.'},
 mandate:{name:'Oud and piano, side by side',root:146.8,cents:[0,100,300,500,700,800,1000],inst:['oud','piano'],bpm:72,dens:.75,drone:.2,note:'Arab urban song and European concert music shared the same cities. Both instruments here play one scale, taking turns.'},
 '48':{name:'One scale, two names',root:146.8,cents:[0,100,400,500,700,800,1000],inst:['piano','oud'],bpm:56,dens:.6,drone:.3,note:'Jews call this mode Ahava Rabbah or freygish; Arabs call it Hijaz. It is the same set of notes.'},
 '67':{name:'A minor key, plucked',root:146.8,cents:[0,200,300,500,700,800,1000],inst:['guitar'],bpm:64,dens:.65,drone:.25,note:'The era of the guitar on both sides: Israeli folk song, and the Palestinian oud revival.'},
 oslo:{name:'Dorian, guitar and piano',root:146.8,cents:[0,200,300,500,700,900,1000],inst:['guitar','piano'],bpm:68,dens:.65,drone:.25,note:'A modal scale with one raised note: a little more open than minor.'},
 now:{name:'A few notes over a drone',root:130.8,cents:[0,100,400,500,700,800,1000],inst:['piano'],bpm:36,dens:.4,drone:.7,note:'Sparse on purpose.'}
};
const Snd=(function(){
  let ctx=null,master,rev,droneG,dr=[],cfg=null,next=0,timer=null,deg=3,ph=0,phLen=7,instI=0,on=false;
  function init(){
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain();master.gain.value=0;const comp=ctx.createDynamicsCompressor();master.connect(comp);comp.connect(ctx.destination);
    rev=ctx.createConvolver();const len=Math.floor(ctx.sampleRate*2.8),buf=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}
    rev.buffer=buf;const rg=ctx.createGain();rg.gain.value=.5;rev.connect(rg);rg.connect(master);
    // a breathing, wordless voice in place of a flat drone
    droneG=ctx.createGain();droneG.gain.value=0;droneG.connect(master);const dw=ctx.createGain();dw.gain.value=.8;droneG.connect(dw);dw.connect(rev);
    const breath=ctx.createGain();breath.gain.value=.7;breath.connect(droneG);
    const bl=ctx.createOscillator(),bg=ctx.createGain();bl.frequency.value=.11;bg.gain.value=.3;bl.connect(bg);bg.connect(breath.gain);bl.start();
    const src=ctx.createGain();src.gain.value=1;
    const bank=(fs,g0)=>{const g=ctx.createGain();g.gain.value=g0;fs.forEach(f=>{const b=ctx.createBiquadFilter();b.type='bandpass';b.frequency.value=f[0];b.Q.value=7;const a=ctx.createGain();a.gain.value=f[1];src.connect(b);b.connect(a);a.connect(g);});g.connect(breath);return g;};
    const oo=bank([[330,1.6],[880,.7],[2300,.2]],.5),ah=bank([[690,1.3],[1150,.8],[2600,.25]],.5);
    const vl=ctx.createOscillator(),v1=ctx.createGain(),v2=ctx.createGain();vl.frequency.value=.037;v1.gain.value=.45;v2.gain.value=-.45;vl.connect(v1);vl.connect(v2);v1.connect(ah.gain);v2.connect(oo.gain);vl.start();
    const vib=ctx.createOscillator(),vg=ctx.createGain();vib.frequency.value=4.7;vg.gain.value=11;vib.connect(vg);vib.start();
    const dft=ctx.createOscillator(),dg=ctx.createGain();dft.frequency.value=.09;dg.gain.value=8;dft.connect(dg);dft.start();
    [[1,0,.5],[1,7,.4],[1,-6,.4],[1.5,3,.22],[2,-4,.16]].forEach(v=>{const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=110*v[0];o.detune.value=v[1];const g=ctx.createGain();g.gain.value=v[2];vg.connect(o.detune);dg.connect(o.detune);o.connect(g);g.connect(src);o.start();dr.push({o,m:v[0]});});
  }
  function send(n,wet){n.connect(master);const w=ctx.createGain();w.gain.value=wet;n.connect(w);w.connect(rev);}
  function tone(type,f,t,g,chain){const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.connect(chain);o.start(t);return o;}
  function note(inst,f,t,d,v){
    const g=ctx.createGain(),lp=ctx.createBiquadFilter();lp.type='lowpass';lp.connect(g);let os=[],end;
    if(inst==='lyre'||inst==='oud'||inst==='guitar'||inst==='piano'){
      const dec=inst==='oud'?1.0:inst==='piano'?2.4:inst==='guitar'?1.8:1.5;
      lp.frequency.setValueAtTime(f*(inst==='oud'?5:inst==='piano'?7:8),t);lp.frequency.exponentialRampToValueAtTime(f*(inst==='oud'?1.5:2.2),t+.35);lp.Q.value=inst==='oud'?2:.7;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.006);g.gain.exponentialRampToValueAtTime(.0008,t+dec);
      const m1=ctx.createGain();m1.gain.value=.6;m1.connect(lp);const m2=ctx.createGain();m2.gain.value=inst==='piano'?.18:.32;m2.connect(lp);
      os.push(tone('triangle',f,t,0,m1));os.push(tone(inst==='piano'?'sine':'sawtooth',inst==='piano'?f*2:f*(inst==='oud'?1.004:1),t,0,m2));
      if(inst==='oud')os.push(tone('triangle',f/2,t,0,m2));
      end=t+dec+.1;send(g,inst==='piano'?.5:.35);
    }else{ // ney, voice, chant
      const voice=inst!=='ney';
      lp.frequency.value=voice?1500:f*4;
      g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v*(voice?.5:.7),t+(voice?.3:.12));g.gain.setValueAtTime(v*(voice?.5:.7),t+Math.max(.2,d-.15));g.gain.linearRampToValueAtTime(.0001,t+d+(voice?.6:.3));
      let chain=lp;
      if(voice){const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=760;bp.Q.value=.9;bp.connect(lp);chain=bp;}
      const o1=tone(voice?'sawtooth':'sine',f,t,0,chain);os.push(o1);
      if(voice)os.push(tone('sawtooth',f*1.005,t,0,chain));
      else{const h=ctx.createGain();h.gain.value=.16;h.connect(lp);os.push(tone('sine',f*2,t,0,h));
        const l=ctx.createOscillator(),lg=ctx.createGain();l.frequency.value=5.2;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*.007,t+.5);l.connect(lg);lg.connect(o1.frequency);l.start(t);os.push(l);}
      end=t+d+.8;send(g,.7);
    }
    os.forEach(o=>o.stop(end));
  }
  const fq=d=>{const n=cfg.cents.length,o=Math.floor(d/n),k=((d%n)+n)%n;return cfg.root*Math.pow(2,(cfg.cents[k]+1200*o)/1200);};
  function stepNote(t){
    const beat=60/cfg.bpm,n=cfg.cents.length;let len=[1,1,.5,.5,2][Math.floor(Math.random()*5)];
    const inst=cfg.inst[instI%cfg.inst.length],slow=inst==='voice'||inst==='chant'||inst==='ney';
    if(slow)len=[2,2,3,1][Math.floor(Math.random()*4)];
    ph++;
    if(ph>=phLen){ // close the phrase on the root or the fifth, then breathe
      deg=Math.random()<.6?(deg>n/2?n:0):Math.min(4,n-1);len=slow?4:3;ph=0;phLen=5+Math.floor(Math.random()*5);
      play(inst,deg,t,len*beat*.9);instI++;return len*beat+beat*(1+Math.floor(Math.random()*3));
    }
    if(Math.random()>cfg.dens)return len*beat;
    let mv=[-2,-1,-1,1,1,2][Math.floor(Math.random()*6)];if(deg>n+2)mv=-Math.abs(mv);if(deg<-1)mv=Math.abs(mv);deg+=mv;
    play(inst,deg,t,len*beat*.9);return len*beat;
  }
  function play(inst,d,t,dur){
    const v=.2+Math.random()*.08;
    if(inst==='chant'){note('voice',fq(d),t,dur,v);note('voice',fq(d)*1.5,t,dur,v*.6);}
    else note(inst,fq(d)*(inst==='ney'?2:1),t,dur,inst==='ney'?v*.6:v);
  }
  function loop(){if(!on||!cfg)return;const now=ctx.currentTime;if(next<now)next=now+.05;while(next<now+.45)next+=stepNote(next);}
  return {
    set(v){on=v;if(v&&!ctx)init();if(!ctx)return;ctx.resume();master.gain.setTargetAtTime(v?.6:0,ctx.currentTime,.35);clearInterval(timer);if(v){this.era(ERAS[st.era]?ERAS[st.era].id:'orientation',true);timer=setInterval(loop,110);}},
    era(id,force){const c=MUSIC[id];if(!c||(!force&&c===cfg))return;cfg=c;deg=3;ph=0;instI=0;if(!ctx)return;const t=ctx.currentTime;dr.forEach(d=>d.o.frequency.setTargetAtTime(c.root/2*d.m,t,.9));droneG.gain.setTargetAtTime(c.drone*.5,t,1.4);next=Math.max(next,t+1.2);},
    get on(){return on;}
  };
})();

/* ---------- the film: scenes, captions, camera ---------- */
let MAIN=[],SC=[],sc=0,sceneT0=0,inJourney=null;
function buildScenes(){
  const out=[];
  ERAS.forEach((e,i)=>{
    const g=e.geo,list=[{y:g.y[0],kind:'title',era:i,head:e.name,kick:i?e.range+' · '+e.cyr:'The land itself',text:esc(e.essence),cam:{home:1},dur:6500}];
    if(!i)(C.MAP_FACTS.orientation||[]).forEach((f,j)=>list.push({y:g.y[0]+40+j*50,kind:'event',era:i,kick:f.title,text:esc(f.text),cam:{home:1},hl:A.ORIENT_HL[j]}));
    (g.events||[]).forEach(ev=>list.push({y:ev[0],kind:'event',era:i,kick:fmtYs(ev[0]),text:esc(ev[1]),cam:ev[2]&&A.PLACES[ev[2]]?{c:A.PLACES[ev[2]].ll,z:2.2}:{home:1},place:ev[2],hl:ev[3]}));
    (g.caps||[]).forEach(c=>{const d=km(JERU,A.FAR[c[2]][1]);if(d>150)list.push({y:c[0]+(c[1]-c[0])*.03,kind:'power',era:i,kick:'Ruled from elsewhere',text:`The orders now come from <b>${esc(A.FAR[c[2]][0])}</b>, ${Math.round(d*.621/10)*10} miles away.`,cam:{cap:c[2]},dur:6000});});
    const s=(e.stories||[])[0];if(s)list.push({y:REP[e.id],kind:'voice',era:i,kick:'A voice',text:`<span class="emj">${s.prop}</span><b>${esc(s.role)}</b> ${esc(s.text)}`,cam:{c:(A.PLACES[s.loc]||A.PLACES.jerusalem).ll,z:2.6},place:A.PLACES[s.loc]?s.loc:'jerusalem'});
    list.sort((a,b)=>a.kind==='title'?-1:b.kind==='title'?1:a.y-b.y);
    out.push(...list);
  });
  out.forEach(s=>{if(!s.dur)s.dur=Math.max(5000,1600+s.text.replace(/<[^>]+>/g,'').length*60);});
  return out;
}
function sceneAt(y){let k=0;MAIN.forEach((s,i)=>{if(s.y<=y)k=i;});return k;}
function caption(s){
  const k=$('#capKick'),t=$('#capText');
  k.innerHTML=`<span>${esc(s.kick)}</span>`+(inJourney?'<button id="jExit">leave ✕</button>':(Snd.on?`<button id="mNote">♪ ${esc(MUSIC[ERAS[s.era].id].name)}</button>`:''));
  t.classList.add('fade');
  setTimeout(()=>{t.innerHTML=(s.head?`<span class="head">${esc(s.head)}</span>`:'')+s.text;t.classList.remove('fade');},180);
}
function drawHL(s){
  gHL.selectAll('*').remove(); gFx.selectAll('.hlr').remove(); const h=s.hl; let pts=null;
  if(h&&h.route){const r=A.ROUTES.find(r=>r.id===h.route);gHL.append('path').attr('class','hl line').attr('d',smoothOpen(r.p.map(proj)));pts=r.p.filter(p=>p[0]>33.9&&p[1]<33.6);}
  else if(h&&h.p){gHL.append('path').attr('class','hl area').attr('d',smooth(h.p.map(proj)));pts=h.p;}
  else if(h&&h.t){const e=ERAS[s.era];pts=[];e.geo.terr.filter(t=>h.t.includes(t.l)&&active(t,s.y,e)).forEach(t=>{const g=t.clip?gHL.append('g').attr('clip-path',`url(#clip-${t.clip})`):gHL;g.append('path').attr('class','hl area').attr('fill-rule','evenodd').attr('d',terrD(t));pts=pts.concat(terrPts(t));});}
  else if(s.place&&A.PLACES[s.place]){cs(gFx.append('g').attr('class','hlr'),A.PLACES[s.place].ll).append('circle').attr('class','hl ring').attr('r',15);applyCS();}
  if(!pts||!pts.length)return null;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  return [[Math.max(L0+.3,Math.min(...xs)-.12),Math.max(B0+.3,Math.min(...ys)-.1)],[Math.min(L1-.3,Math.max(...xs)+.12),Math.min(B1-.3,Math.max(...ys)+.1)]];
}
function camera(s,dur){
  st.scenePlace=s.place&&A.PLACES[s.place]?s.place:null; sigP='';
  const bb=drawHL(s);
  if(performance.now()<st.free)return;
  if(s.cam.cap){capView(true,s.cam.cap);return;}
  st.capView=false;
  if(bb)fit(bb,{t:150,b:16,l:26,r:26},dur==null?1500:dur,k0*3.2); else if(s.cam.c)flyTo(s.cam.c,s.cam.z||2,dur==null?1500:dur); else home(dur==null?1300:dur);
  if(s.place&&A.PLACES[s.place])setTimeout(()=>pulse(A.PLACES[s.place].ll),700);
}
function showScene(i,o){
  o=o||{}; i=Math.max(0,Math.min(SC.length-1,i)); sc=i; const s=SC[i]; sceneT0=performance.now();
  if(o.tween&&Math.abs(fracOf(s.y)-fracOf(st.year))>.0005){st.tw={a:fracOf(st.year),b:fracOf(s.y),y:s.y,t0:sceneT0,dur:Math.min(2200,700+Math.abs(fracOf(s.y)-fracOf(st.year))*26000)};sceneT0+=st.tw.dur;}
  else {st.tw=null;setYear(s.y,{keepSel:true,force:true});}
  if(!o.noCam)camera(s); caption(s); setTimeout(()=>document.documentElement.style.setProperty('--dockH',$('#dock').offsetHeight+'px'),260); if(!st.tw){drawPlaces(ERAS[st.era],st.year);applyCS();declutter();}
}
function setPlay(on){st.playing=on;$('#bPlay').textContent=on?'❚❚':'▶';if(on){sceneT0=performance.now();}else saveHash();}
function jump(y,keep){if(inJourney)leaveJourney(true);st.tw=null;setYear(y,{keepSel:!!keep});sc=sceneAt(y);caption(SC[sc]);drawHL(SC[sc]);sceneT0=performance.now();}
function capView(on,key){
  key=key||st.cap; st.capView=!!(on&&key);
  if(st.capView){const ll=A.FAR[key][1];fit([[Math.min(33.6,ll[0])-1.5,Math.min(30.6,ll[1])-1.5],[Math.max(36.4,ll[0])+1.5,Math.max(33.2,ll[1])+1.5]],{t:150,b:30,l:30,r:60},1500,k0);}
  else home(900);
  setTimeout(()=>{drawPower(ERAS[st.era],st.year);applyCS();},50);
}
const yearRaw=f=>{f=Math.min(.99999,Math.max(0,f));const i=Math.floor(f*N),g=ERAS[i].geo.y;return g[0]+(f*N-i)*(g[1]-g[0]);};
let last=0;
function tick(now){
  const dt=Math.min(60,now-last||16);last=now;const k=T.k;
  for(let i=anim.length-1;i>=0;i--){const a=anim[i];
    if(a.type==='dot'){a.t=(a.t+a.sp*dt)%1;const u=a.t,q=1-u;a.el.setAttribute('transform',`translate(${q*q*a.a[0]+2*q*u*a.c[0]+u*u*a.b[0]},${q*q*a.a[1]+2*q*u*a.c[1]+u*u*a.b[1]}) scale(${1/k})`);a.el.setAttribute('opacity',Math.min(1,Math.min(u,1-u)*8));}
    else if(a.type==='courier'){a.t=(a.t+a.sp*dt)%1;const p=a.path.getPointAtLength(a.t*a.len);a.el.setAttribute('transform',`translate(${p.x},${p.y}) scale(${1/k})`);}
    else if(a.type==='pulse'){const u=(now-a.t0)/1800;if(u>=1){a.g.remove();anim.splice(i,1);continue;}const v=(u*2)%1;a.el.setAttribute('r',4+v*24);a.el.setAttribute('opacity',1-v);}
  }
  if(st.tw){const w=st.tw,u=Math.min(1,(now-w.t0)/w.dur),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
    if(u>=1){st.tw=null;setYear(w.y,{keepSel:true,noHash:true,force:true});drawPlaces(ERAS[st.era],st.year);applyCS();declutter();}
    else{const f=w.a+(w.b-w.a)*e;setYear(yearRaw(f),{keepSel:true,noHash:true,raw:f});}}
  else if(st.playing&&now-sceneT0>SC[sc].dur){ if(sc<SC.length-1)showScene(sc+1,{tween:true}); else if(inJourney)leaveJourney(); else setPlay(false); }
  if(st.free&&now>st.free){st.free=0;$('#follow').hidden=true;}
  requestAnimationFrame(tick);
}

/* ---------- lens ---------- */
function underEra(){let i=st.era-st.lens.depth; if(i<1) return null; return ERAS[i];}
function drawUnder(){const u=underEra();gUnder.selectAll('*').remove();gLabUnder.selectAll('*').remove();if(u)drawTerr(gUnder,gLabUnder,u,REP[u.id],true);applyCS();
  $('#lensTab').innerHTML=u?`beneath: <b>${esc(u.cnm)}</b> · ${esc(u.cyr)} ▾`:'nothing older is written here ▾';}
function placeLens(){
  const L=st.lens; if(!L.on)return;
  const ring=$('#lensRing'); ring.style.left=(L.x-L.r)+'px';ring.style.top=(L.y-L.r)+'px';ring.style.width=ring.style.height=2*L.r+'px';
  const tab=$('#lensTab'); tab.style.left=L.x+'px';tab.style.top=(L.y+L.r+8)+'px';
  const c=T.invert([L.x,L.y]),r=L.r/T.k;
  lensIn.attr('cx',c[0]).attr('cy',c[1]).attr('r',r);
  lensOut.attr('d',`M-9000,-9000H9000V9000H-9000ZM${c[0]-r},${c[1]}a${r},${r} 0 1,0 ${2*r},0a${r},${r} 0 1,0 ${-2*r},0Z`);
}
function setLens(on){
  const L=st.lens; L.on=on; $('#lens').hidden=!on;
  gUnder.style('display',on?'':'none'); gLabUnder.style('display',on?'':'none');
  gTerr.attr('clip-path',on?'url(#lensOut)':null); gLab.attr('clip-path',on?'url(#lensOut)':null);
  if(on){ if(st.era<2){st.lens.depth=1;} L.x=W/2;L.y=Math.min(H-dockPad()-L.r-50,(H-dockPad())/2+50);L.depth=1;drawUnder();placeLens(); }
}
(function(){const tab=$('#lensTab');let d=null;
  tab.addEventListener('pointerdown',e=>{tab.setPointerCapture(e.pointerId);d={x:e.clientX,y:e.clientY,lx:st.lens.x,ly:st.lens.y,moved:false};e.preventDefault();});
  tab.addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>5)d.moved=true;st.lens.x=Math.max(20,Math.min(W-20,d.lx+dx));st.lens.y=Math.max(20,Math.min(H-dockPad()-40,d.ly+dy));placeLens();});
  tab.addEventListener('pointerup',()=>{if(d&&!d.moved){st.lens.depth=st.lens.depth>=Math.max(1,st.era-1)?1:st.lens.depth+1;drawUnder();}d=null;});
})();

/* ---------- who ruled here ---------- */
function strata(ll){
  const rows=[];
  ERAS.forEach((e,i)=>{ if(!i)return;
    const m=e.geo.terr.filter(t=>terrHas(t,ll));
    const fg=m.filter(t=>!t.bg);
    m.forEach(t=>{const r=t.y||e.geo.y;
      if(t.bg&&fg.some(f=>{const fr=f.y||e.geo.y;return fr[0]<=r[0]&&fr[1]>=r[1];}))return;
      if(!t.l&&fg.some(f=>f!==t&&f.l&&!f.clip))return rows.push({y0:r[0]+.01,y1:r[1],l:t.sub,sub:'',c:t.c,e});
      rows.push({y0:r[0],y1:r[1],l:t.l||t.sub,sub:t.l?t.sub:'',c:t.c,e});});
    if(!m.length) rows.push({y0:e.geo.y[0],y1:e.geo.y[1],l:'—',sub:'beyond the states mapped for this period',c:'#bbb09a',e,none:1});
  });
  return rows.sort((a,b)=>a.y0-b.y0);
}
function strataHTML(ll){
  const y=st.year;
  return '<ul class="strata">'+strata(ll).map(r=>`<li data-y="${Math.max(r.y0,Math.min(r.y1-.01,(r.y0+r.y1)/2))}" class="${y>=r.y0&&y<r.y1?'cur':''}"><span class="sw" style="background:${r.c}"></span><span class="yr">${fmtYs(r.y0)}–${fmtYs(r.y1)}</span><span>${esc(titleCase(r.l))}${r.sub?` <span class="d">· ${esc(r.sub)}</span>`:''}</span></li>`).join('')+'</ul>';
}
const titleCase=s=>s===s.toUpperCase()?s.toLowerCase().replace(/(^|[\s\-(’])([a-zḥṣṭāīū])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(Of|And|The|Al)\b/g,m=>m.toLowerCase()).replace(/^./,m=>m.toUpperCase()):s;
function nearest(ll){let best=null,bd=1e9;Object.keys(A.PLACES).forEach(k=>{const d=km(ll,A.PLACES[k].ll);if(d<bd){bd=d;best=k;}});return [best,bd];}
function nameAt(k,y){const ny=(C.NAME_YEARS||{})[k];let nm=C.CITIES[k].en;if(ny)ny.forEach(n=>{if(n[0]<=y)nm=n[1].split(' · ')[0];});return nm;}
function standHere(ll){
  if(ll[0]<L0||ll[0]>L1||ll[1]<B0||ll[1]>B1) return;
  gFx.selectAll('.herepin').remove(); cs(gFx.append('g').attr('class','herepin'),ll).append('circle').attr('class','here').attr('r',5); applyCS();
  const inLake=G.lakes.some(l=>geomHas(l.g,ll)), onLand=geomHas(G.land,ll)&&!inLake, y=st.year, e=ERAS[st.era], when=st.era?'In '+fmtYs(y):'Before the names';
  if(!onLand){
    const wi=inLake?(ll[1]>32?2:1):(ll[1]<30&&ll[0]>34?4:0),w=A.WATERS[wi],n=w.names.find(n=>y>=n[0]&&y<n[1])||w.names[w.names.length-1];
    card(`<small>${when}, this water is</small><h5>${esc(n[2])}</h5>${w.names.length>1?`<a class="more" data-water="${wi}">Its other names ›</a>`:''}`,false,true); return;
  }
  const rows=strata(ll).filter(r=>y>=r.y0&&y<r.y1&&!r.none), r=rows[rows.length-1], pop=C.POPULATION[e.id];
  card(`<small>${when}, this spot is in</small><h5>${r?esc(titleCase(r.l)):'no state we can name'}</h5>${r&&r.sub?`<p>${esc(r.sub)}.</p>`:''}${pop?`<p class="dim"><b>Who lives here.</b> ${esc(pop.detail)}</p>`:''}<a class="more" data-all="${ll[0].toFixed(3)},${ll[1].toFixed(3)}">Everyone who has ruled it ›</a>`,false,true);
}
function allRulers(ll){
  const [nk,nd]=nearest(ll);
  card(`<small>${nd<1.5?'At':Math.round(nd)+' km from'} ${esc(C.CITIES[nk].en)} · tap a row to go there in time</small><h5>Who has ruled this spot</h5>${strataHTML(ll)}`,true,true);
}
function openPlace(k){
  const c=C.CITIES[k]; st.sel=k; sigP=''; setYear(st.year,{noHash:true,keepSel:true});
  const nm=nameAt(k,st.year);
  card(`${nm!==c.en?`<small>today ${esc(c.en)}</small>`:''}<h5>${esc(nm)}</h5><div>${c.he?`<span class="he">${c.he}</span>`:''}${c.ar?`<span class="ar">${c.ar}</span>`:''}</div><p>${esc(c.blurb)}</p><a class="more" data-place="${k}">Its names and rulers ›</a>`);
}
function placePage(k){
  const c=C.CITIES[k],pl=A.PLACES[k],ny=(C.NAME_YEARS||{})[k];
  let h=`<h5>${esc(c.en)}</h5>`;
  if(ny){let cur=-1;ny.forEach((n,j)=>{if(n[0]<=st.year)cur=j;});
    h+='<h3>Its names, in order</h3><ul class="strata nm">'+ny.map((n,j)=>`<li data-y="${n[0]+1}" class="${j===cur?'cur':''}"><span class="yr">${n[0]<0?'c. ':''}${fmtYs(n[0])}</span><span>${esc(n[1])}${n[2]?` <span class="d">· ${esc(n[2])}</span>`:''}</span></li>`).join('')+'</ul>';}
  else if(c.also) h+=`<p>${esc(c.also)}</p>`;
  if(pl.ll[0]>=L0&&pl.ll[0]<=L1) h+='<h3>Who has ruled it</h3>'+strataHTML(pl.ll);
  card(h,true);
}

/* ---------- bubbles + modals ---------- */
function card(html,big,keepPin){
  if(!keepPin)gFx.selectAll('.herepin').remove();
  const c=$('#card');c.innerHTML='<button class="x" aria-label="Close">×</button>'+html;c.classList.toggle('big',!!big);c.hidden=false;c.scrollTop=0;
  c.style.animation='none';void c.offsetWidth;c.style.animation='';
}
function hideCard(){$('#card').hidden=true;gFx.selectAll('.herepin').remove();}
$('#card').addEventListener('click',e=>{if(e.target.closest('.x'))hideCard();});
function openModal(html){if($('#modal').hidden){st.wasPlaying=st.playing;}setPlay(false);$('#mBody').innerHTML=html;$('#modal').hidden=false;$('#ov').hidden=false;$('#modal').scrollTop=0;hideCard();}
function closeModal(){$('#modal').hidden=true;$('#ov').hidden=true;if(st.wasPlaying){st.wasPlaying=false;setPlay(true);}}
$('#ov').addEventListener('click',closeModal); $('#mClose').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();hideCard();}if(e.key===' '&&e.target===document.body){e.preventDefault();$('#bPlay').click();}});
function hideHint(){}
document.addEventListener('click',e=>{
  const t=e.target;
  const gl=t.closest('a.gl[data-g]'); if(gl){e.preventDefault();const g=C.GLOSSARY[gl.dataset.g];if(g){if(!$('#modal').hidden)closeModal();card(`<small>A word explained</small><h5>${esc(g[0])}</h5><p>${esc(g[1])}</p>`);}return;}
  const pp=t.closest('[data-place]'); if(pp){placePage(pp.dataset.place);return;}
  const al=t.closest('[data-all]'); if(al){allRulers(al.dataset.all.split(',').map(Number));return;}
  const wa=t.closest('[data-water]'); if(wa){const w=A.WATERS[+wa.dataset.water];card(`<h5>What this water has been called</h5><ul class="strata nm" style="margin-top:.5em">${w.names.map(n=>`<li data-y="${Math.max(n[0],-3000)+1}" class="${st.year>=n[0]&&st.year<n[1]?'cur':''}"><span class="yr">${n[0]<-3000?'earliest':'from '+fmtYs(n[0])}</span><span>${esc(n[2])}</span></li>`).join('')}</ul>`,true,true);return;}
  const li=t.closest('#mBody [data-y],#card [data-y]'); if(li){if(!$('#modal').hidden)closeModal();hideCard();jump(+li.dataset.y,true);return;}
  const ju=t.closest('[data-jump]'); if(ju){if(!$('#modal').hidden)closeModal();hideCard();const k=MAIN.findIndex(x=>x.kind==='event'&&x.y===+ju.dataset.jump);if(inJourney)leaveJourney(true);if(k>=0)showScene(k,{tween:true});else jump(+ju.dataset.jump);return;}
  const fb=t.closest('[data-fly]'); if(fb){closeModal();flyTo(A.PLACES[fb.dataset.fly].ll,Math.max(2.4,T.k/k0));return;}
});
svg.on('click',e=>{ if(e.defaultPrevented)return; if(!$('#menu').hidden||!$('#layers').hidden){$('#menu').hidden=true;$('#layers').hidden=true;return;}
  standHere(unproj(T.invert(d3.pointer(e,svg.node())))); });

/* ---------- search ---------- */
let INDEX=null;
function buildIndex(){
  INDEX=[];
  Object.keys(A.PLACES).forEach(k=>{const c=C.CITIES[k];if(!c)return;const ny=((C.NAME_YEARS||{})[k]||[]).map(n=>n[1]).join(' ');
    INDEX.push({t:'Place',title:c.en,sub:[c.he_tr,c.ar_tr].filter(Boolean).join(' · '),hay:[c.en,c.he_tr,c.ar_tr,c.also,ny,c.he,c.ar].join(' '),go:()=>{closeModal();openPlace(k);flyTo(A.PLACES[k].ll,Math.max(2.4,T.k/k0));st.free=performance.now()+20000;$('#follow').hidden=false;}});});
  ERAS.forEach(e=>{if(e.id==='orientation')return;INDEX.push({t:'Era',title:e.name,sub:e.range+' · '+e.cyr,hay:[e.name,e.range,e.cnm,e.land.map(l=>l[1]).join(' ')].join(' '),go:()=>{closeModal();jump(REP[e.id]);}});
    (e.geo.events||[]).forEach(ev=>INDEX.push({t:fmtYs(ev[0]),title:ev[1],sub:'',hay:ev[1]+' '+Math.floor(Math.abs(ev[0])),go:()=>{closeModal();jump(ev[0]);if(ev[2]&&A.PLACES[ev[2]])pulse(A.PLACES[ev[2]].ll);}}));
    e.geo.terr.forEach(t=>{if(t.l&&!t.bg)INDEX.push({t:'Territory',title:titleCase(t.l),sub:t.sub,hay:t.l+' '+t.sub,go:()=>{closeModal();const r=t.y||e.geo.y;jump((r[0]+r[1])/2);}});});});
  Object.keys(C.GLOSSARY).forEach(k=>{const g=C.GLOSSARY[k];INDEX.push({t:'Word',title:g[0],sub:g[1].slice(0,90)+'…',hay:g[0]+' '+g[1],go:()=>openModal(`<h3 style="margin-top:0">A word explained</h3><h2>${esc(g[0])}</h2><p>${esc(g[1])}</p>`)});});
  A.ROUTES.forEach(r=>INDEX.push({t:'Road',title:r.l,sub:r.text,hay:r.l+' '+r.text,go:()=>{closeModal();if(st.year<r.y[0]||st.year>r.y[1])setYear((Math.max(r.y[0],-1500)+r.y[1])/2);}}));
}
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-֑ͯ-ׇً-ْʿʾ’'`]/g,'');
function openSearch(){
  if(!INDEX)buildIndex();
  openModal(`<input id="q" type="search" placeholder="A place, a name, a year, a word…" autocomplete="off" enterkeyhint="search"><ul class="res" id="res"></ul>`);
  const q=$('#q'),res=$('#res');
  const run=()=>{const s=norm(q.value.trim());const hits=!s?INDEX.filter(x=>x.t==='Place').slice(0,12):INDEX.filter(x=>norm(x.hay).includes(s)).sort((a,b)=>(norm(b.title).startsWith(s)-norm(a.title).startsWith(s))||((b.t==='Place')-(a.t==='Place'))).slice(0,40);
    res.innerHTML=hits.length?hits.map((h,i)=>`<li data-i="${INDEX.indexOf(h)}"><em>${esc(h.t)}</em>${esc(h.title)}${h.sub?`<small>${esc(h.sub)}</small>`:''}</li>`).join(''):'<li>Nothing found. Try an older or newer name.</li>';};
  q.addEventListener('input',run); res.addEventListener('click',e=>{const li=e.target.closest('li[data-i]');if(li)INDEX[+li.dataset.i].go();}); run(); setTimeout(()=>q.focus(),50);
}

/* ---------- journeys ---------- */
function openJourneys(){
  openModal('<h2>Short journeys</h2><p class="sub">Each follows one thread through the layers, then returns you to the film.</p><ul class="jlist">'+A.JOURNEYS.map((j,i)=>`<li data-j="${i}"><span class="e">${j.icon}</span><div><b>${esc(j.title)}</b><span>${esc(j.blurb)}</span></div></li>`).join('')+'</ul>');
  $('#mBody .jlist').addEventListener('click',e=>{const li=e.target.closest('li');if(!li)return;closeModal();startJourney(A.JOURNEYS[+li.dataset.j]);});
}
function startJourney(j){
  setLens(false); inJourney=j;
  SC=j.steps.map((s,i)=>({y:s.y,kind:'j',era:eraIdxOf(s.y),kick:j.title+' · '+(i+1)+' of '+j.steps.length,text:s.t,cam:s.cap?{cap:capOf(ERAS[eraIdxOf(s.y)],s.y)}:s.c?{c:s.c,z:Math.min(3,s.z||1.6)}:{home:1},dur:Math.max(6500,2200+s.t.replace(/<[^>]+>/g,'').length*62)}));
  SC.forEach(s=>{if(s.cam.cap===null)s.cam={home:1};});
  showScene(0,{tween:true}); setPlay(true);
}
function leaveJourney(quiet){inJourney=null;SC=MAIN;sc=sceneAt(st.year);sceneT0=performance.now();if(!quiet){caption(SC[sc]);camera(SC[sc]);}}

/* ---------- about, layers ---------- */
function openAbout(){
  openModal(`<h2>Palimpsest</h2><p class="sub">A land rewritten: Canaan, Israel and Judah, Judaea, Palaestina, Filasṭīn, the Holy Land, Eretz Yisrael.</p>
  <p>A palimpsest is a manuscript scraped and written over, with the older words still showing through. This atlas treats one small land the same way, across about 5,000 years.</p>
  <h3>How to use it</h3>
  <p><b>Press play</b> and the land's history runs as a film, with music in the scale of each age. <b>Pause any time</b> and touch the map: tap a spot to see who rules it, tap a town for its name. Drag the coloured bar to jump through time. <b>Read</b> opens the full chapter. Under <b>⋯</b> are short journeys, a lens onto the layer beneath, and the map's layers.</p>
  <h3>A note on fairness</h3>
  <p>This is a guide built to be fair to a contested history, not to settle it. Borders are washes of colour, not survey lines; flows show direction, not exact numbers. Where one event carries two names — 1948 above all — both are given. Colours are pigments, not flags. The last chapter reflects events as of <b>November 2026</b>.</p>
  <h3>Sources</h3>${A.SOURCES.map(s=>`<p><b>${s[0]}.</b> ${s[1]}</p>`).join('')}
  <h3>Share</h3><p><button class="btn" id="bCopy">Copy a link to this view</button> <a class="btn ghost" href="v1/">The first edition (June 2026)</a></p>
  <p class="foot" style="font-style:italic;color:var(--ink2)">SIFRKALON · CC BY-SA 4.0</p>`);
  $('#bCopy').onclick=()=>{saveHash(true);const u=location.href;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{$('#bCopy').textContent='Link copied';},()=>{prompt('Copy this link',u);});};
}
const LAYERS=[['rule','Who rules (colour washes)'],['people','People on the move'],['roads','Roads, rails and trade'],['stories','People and stories'],['sacred','Sacred sites'],['borders','Today’s borders, for reference']];
function buildLayers(){
  const p=$('#layers'); p.innerHTML='<h4>Layers</h4>'+LAYERS.map(l=>`<label><input type="checkbox" data-l="${l[0]}" ${st.layers[l[0]]?'checked':''}>${l[1]}</label>`).join('');
  p.addEventListener('change',e=>{const k=e.target.dataset.l;st.layers[k]=e.target.checked?1:0;applyLayers();});
}
function applyLayers(){
  gTerrWrap.style('display',st.layers.rule?'':'none'); gLab.style('display',st.layers.rule?'':'none');
  gBorders.style('display',st.layers.borders?'':'none');
  sigF=sigR=sigM=''; drawVoices(ERAS[st.era]); setYear(st.year,{noHash:true});
}

/* ---------- timeline ---------- */
function buildTimeline(){
  $('#segs').innerHTML=ERAS.map(e=>`<i style="background:${e.swatch}" title="${esc(e.name)}"></i>`).join('');
  const tr=$('#track'); let drag=false;
  const at=e=>{const r=tr.getBoundingClientRect();return Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));};
  const scrub=e=>{const f=at(e);st.tw=null;setYear(yearOf(f),{raw:f,noHash:true});const k=sceneAt(st.year);if(k!==sc||SC!==MAIN){SC=MAIN;sc=k;caption(SC[sc]);}};
  tr.addEventListener('pointerdown',e=>{drag=true;tr.setPointerCapture(e.pointerId);tr.classList.add('drag');st.wasScrub=st.playing;setPlay(false);if(inJourney)leaveJourney(true);scrub(e);});
  tr.addEventListener('pointermove',e=>{if(drag)scrub(e);});
  const up=()=>{if(!drag)return;drag=false;tr.classList.remove('drag');drawHL(SC[sc]);if(st.wasScrub)setPlay(true);else saveHash();};
  tr.addEventListener('pointerup',up);tr.addEventListener('pointercancel',up);
  tr.addEventListener('keydown',e=>{if(e.key==='ArrowRight')showScene(sc+1,{tween:true});if(e.key==='ArrowLeft')showScene(sc-1,{tween:true});});
  $('#bPrev').onclick=()=>showScene(sc-1,{tween:true});
  $('#bNext').onclick=()=>showScene(sc+1,{tween:true});
  $('#bPlay').onclick=()=>{if(!st.playing&&sc>=SC.length-1&&!inJourney)showScene(0);setPlay(!st.playing);};
}

/* ---------- url ---------- */
let hashT=null;
function saveHash(now){clearTimeout(hashT);const f=()=>{const y=Math.round(st.year*100)/100;history.replaceState(null,'','#y='+y+(st.sel?'&p='+st.sel:''));};now?f():hashT=setTimeout(f,350);}
function readHash(){const m=/y=(-?[\d.]+)/.exec(location.hash),p=/p=([a-z0-9]+)/.exec(location.hash);return {y:m?+m[1]:null,p:p&&A.PLACES[p[1]]?p[1]:null};}

/* ---------- wiring ---------- */
$('#bSearch').onclick=openSearch;
$('#bSound').onclick=()=>{Snd.set(!Snd.on);$('#bSound').classList.toggle('on',Snd.on);caption(SC[sc]);};
$('#bMore').onclick=()=>{$('#layers').hidden=true;$('#menu').hidden=!$('#menu').hidden;};
$('#menu').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('#menu').hidden=true;const m=b.dataset.m;
  if(m==='journeys')openJourneys();else if(m==='lens'){setLens(!st.lens.on);}else if(m==='layers')$('#layers').hidden=false;else if(m==='home')home(800);else openAbout();});
$('#capChip').onclick=()=>{if($('#capChip').dataset.far){st.free=performance.now()+15000;$('#follow').hidden=false;capView(!st.capView);}};
$('#follow').onclick=()=>{st.free=0;$('#follow').hidden=true;camera(SC[sc]);};
$('#bRead').onclick=()=>openModal(chapterHTML(ERAS[st.era]));
$('#cap').addEventListener('click',e=>{
  if(e.target.closest('#jExit')){leaveJourney();return;}
  if(e.target.closest('#mNote')){const m=MUSIC[ERAS[SC[sc].era].id];openModal(`<h3 style="margin-top:0">What you are hearing</h3><h2>♪ ${esc(m.name)}</h2><p>${esc(m.note)}</p><p class="sub">All of the music is generated as you listen, in the scale of each age. Only the scales are historical; the melodies are not.</p>`);return;}
});
function relayout(){
  const k=T.k/k0,c=unproj(T.invert([W/2,(H-dockPad())/2+40]));
  size(); k0=fit(HOME,null,0); zoom.scaleExtent([k0*.03,k0*16]);
  if(Math.abs(k-1)>.02&&!st.capView) flyTo(c,k,0);
  applyCS(); declutter(); placeLens();
}
let rsT; new ResizeObserver(()=>{clearTimeout(rsT);rsT=setTimeout(()=>{const r=$('#mapwrap').getBoundingClientRect();if(Math.abs(r.width-W)>1||Math.abs(r.height-H)>1)relayout();},140);}).observe($('#mapwrap'));

/* ---------- start ---------- */
size(); buildTimeline(); buildLayers();
k0=fit(HOME,null,0); zoom.scaleExtent([k0*.03,k0*16]);
MAIN=buildScenes(); SC=MAIN;
const h0=readHash(); if(h0.p)st.sel=h0.p;
function begin(sound){
  $('#intro').classList.add('gone'); setTimeout(()=>{$('#intro').remove();},900);
  if(sound){Snd.set(true);$('#bSound').classList.add('on');}
  showScene(0,{}); setPlay(true);
}
if(h0.y!=null){ $('#intro').remove(); setYear(h0.y,{noHash:true,keepSel:true}); sc=sceneAt(h0.y); caption(SC[sc]); if(h0.p)flyTo(A.PLACES[h0.p].ll,2.6,0); }
else { setYear(REP.orientation,{noHash:true}); caption(SC[0]); $('#goSound').onclick=()=>begin(true); $('#goQuiet').onclick=()=>begin(false); }
requestAnimationFrame(tick);
window.PAL={setYear,jump,st,flyTo,openPlace,standHere,setLens,startJourney:i=>startJourney(A.JOURNEYS[i]),capView,showScene,setPlay,scenes:()=>SC,Snd,begin};
})();
