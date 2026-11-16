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
const WIDE=()=>window.matchMedia('(min-width:900px)').matches;
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
const st={year:REP.rome,era:-1,layers:{rule:1,people:1,roads:1,voices:1,sacred:0,borders:0},lens:{on:false,x:0,y:0,r:90,depth:1},journey:null,sel:null,cap:null,capView:false,playing:false};
let T=d3.zoomIdentity,k0=1,W=0,H=0;

/* ---------- svg scaffold ---------- */
const svg=d3.select('#map');
const defs=svg.append('defs');
defs.append('clipPath').attr('id','clipLand').append('path').attr('clip-rule','evenodd').attr('d',geomD(G.land));
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
const gTerr=gTerrWrap.append('g'), gUnder=gTerrWrap.append('g').attr('clip-path','url(#lensIn)').style('display','none');
const gRoutes=root.append('g'), gFlows=root.append('g'), gPower=root.append('g');
const gWaterLab=root.append('g'), gLab=root.append('g'), gLabUnder=root.append('g').attr('clip-path','url(#lensIn)').style('display','none');
const gPlaces=root.append('g'), gSacred=root.append('g'), gVoices=root.append('g'), gFx=root.append('g');

/* counter-scaled items: keep constant screen size while the map zooms */
function cs(sel,ll,o){o=o||{};const p=proj(ll);sel.classed('cs',true).each(function(){this.__cs={x:p[0],y:p[1],rot:o.rot||0,minr:o.minr||0,dx:o.dx||0,dy:o.dy||0};});return sel;}
function applyCS(){const k=T.k,r=k/k0;root.selectAll('.cs').each(function(){const c=this.__cs;if(!c)return;this.setAttribute('transform',`translate(${c.x},${c.y}) scale(${1/k})`+(c.dx||c.dy?` translate(${c.dx},${c.dy})`:'')+(c.rot?` rotate(${c.rot})`:''));this.style.display=r<c.minr?'none':'';});}

/* ---------- zoom ---------- */
const zoom=d3.zoom().scaleExtent([.03,20]).translateExtent([[-4500,-3500],[3300,3000]])
  .filter(e=>!e.target.closest||!e.target.closest('#lensTab'))
  .on('zoom',e=>{T=e.transform;root.attr('transform',T);applyCS();placeLens();hideBubble();})
  .on('end',()=>{declutter();});
svg.call(zoom).on('dblclick.zoom',null);
function fit(b,pad,dur,maxK){
  const p0=proj([b[0][0],b[1][1]]),p1=proj([b[1][0],b[0][1]]);
  pad=Object.assign({t:118,b:20,l:16,r:16},pad||{}); pad.b+=dockPad();
  let k=Math.min((W-pad.l-pad.r)/(p1[0]-p0[0]),(H-pad.t-pad.b)/(p1[1]-p0[1])); if(maxK)k=Math.min(k,maxK);
  const t=d3.zoomIdentity.translate((W+pad.l-pad.r)/2-k*(p0[0]+p1[0])/2,(H+pad.t-pad.b)/2-k*(p0[1]+p1[1])/2).scale(k);
  (dur?svg.transition().duration(dur):svg).call(zoom.transform,t); return k;
}
const HOME=[[34.0,29.4],[36.3,33.45]];
function dockPad(){if(WIDE())return 0;const d=$('#dock');return $('#sheet').classList.contains('open')?st.dockH||170:(st.dockH=d.offsetHeight);}
function home(dur){st.capView=false;fit(HOME,null,dur);}
function flyTo(ll,z,dur){const k=k0*z,p=proj(ll);svg.transition().duration(dur==null?900:dur).call(zoom.transform,d3.zoomIdentity.translate(W/2-k*p[0],((H-dockPad())/2+40)-k*p[1]).scale(k));}
function size(){const r=$('#mapwrap').getBoundingClientRect();W=r.width;H=r.height;document.documentElement.style.setProperty('--dockH',(WIDE()?0:$('#dock').offsetHeight)+'px');svg.attr('viewBox',`0 0 ${W} ${H}`);st.lens.r=Math.round(Math.min(W,H)*.2);}

/* ---------- drawing an era's rule ---------- */
function drawTerr(gT,gL,e,y,under){
  gT.selectAll('*').remove(); gL.selectAll('*').remove();
  const act=e.geo.terr.filter(t=>active(t,y,e));
  act.forEach(t=>{
    let d=t.p?smooth(t.p.map(proj)):t.m?geomD(G.mod[t.m]):t.circ.map((c,i)=>t.circ.length>1?circD(c,i+1):circD(c,0)).join('');
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
    if(!under){gT.append('path').attr('class','routehit').attr('d',d).on('click',ev=>{ev.stopPropagation();bubbleAt(ev,`<h5>${esc(t.l)}</h5><p>${esc(t.sub)}</p>`);});}
  });
  (e.geo.labels||[]).forEach(l=>{cs(gL.append('g'),l[1],{rot:l[2]||0,minr:.4}).append('text').attr('class','gl2').style('font-size','10.5px').attr('dy','.35em').text(l[0]);});
  return act.map(t=>t.l+(t.y?t.y[0]:'')).join('|')+((e.geo.lines||[]).filter(t=>active(t,y,e)).length);
}
function centroid(p){let x=0,y=0;p.forEach(q=>{x+=q[0];y+=q[1];});return [x/p.length,y/p.length];}
const terrSig=(e,y)=>e.id+':'+e.geo.terr.map((t,i)=>active(t,y,e)?i:'').join(',')+':'+(e.geo.lines||[]).map((t,i)=>active(t,y,e)?i:'').join(',');

/* ---------- places ---------- */
function eraPlaces(e,y){
  const seen=new Set(),out=[];
  const labs=new Set();(e.geo.places||[]).concat(e.places||[]).forEach(p=>{if(seen.has(p[0])||labs.has(p[1])||!A.PLACES[p[0]])return;if(p[2]&&y<p[2])return;seen.add(p[0]);labs.add(p[1]);out.push({k:p[0],label:p[1]});});
  if(st.sel&&!seen.has(st.sel)&&A.PLACES[st.sel]){const ny=(C.NAME_YEARS||{})[st.sel];let nm=C.CITIES[st.sel].en;if(ny){ny.forEach(n=>{if(n[0]<=y)nm=n[1].split(' · ')[0];});}out.push({k:st.sel,label:nm});}
  return out;
}
function drawPlaces(e,y){
  gPlaces.selectAll('*').remove();
  eraPlaces(e,y).forEach((p,i)=>{
    const pl=A.PLACES[p.k],left=LEFT.has(p.k);
    const g=cs(gPlaces.append('g').attr('class','pin r'+pl.rank+(st.sel===p.k?' sel':'')),pl.ll,{minr:pl.rank>2?.75:.42}).datum({k:p.k,pri:(st.sel===p.k?0:pl.rank)*100+i,left,len:p.label.length});
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
  g.on('click',ev=>{ev.stopPropagation();bubbleAt(ev,`<h5>${CAPEMO[key]||'🏛️'} ${esc(name)}</h5><p>${main&&pc.kind?esc(pc.kind)+'. ':''}${far?Math.round(dist*.621/10)*10+' miles from Jerusalem'+(main&&pc.travelTime?' — '+esc(pc.travelTime):'')+'.':'The seat of power is inside the land in these years.'}</p>`);});
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
    gRoutes.append('path').attr('class','routehit').attr('d',d).on('click',ev=>{ev.stopPropagation();bubbleAt(ev,`<h5>${esc(r.l)}</h5><p>${esc(r.text)}</p>`);});
    if(r.id==='maris'&&e.id!=='orientation'){['🫒','🏺','🧂'].forEach((em,i)=>{const el=gRoutes.append('text').attr('class','emo sm').text(em).on('click',ev=>{ev.stopPropagation();bubbleAt(ev,`<h5>${em} Trade on the coast road</h5><p>${esc(C.TRADE_INFO[e.id]||'')}</p>`);});anim.push({type:'trade',el:el.node(),path:p.node(),len:p.node().getTotalLength(),t:i/3,sp:.000018});});}
  });
}
const VOFF=[[-30,-28],[32,26],[-30,30],[32,-30]];
function drawVoices(e){
  gVoices.selectAll('*').remove(); gSacred.selectAll('*').remove();
  if(st.layers.voices) (e.stories||[]).forEach((s,i)=>{
    const pl=A.PLACES[s.loc]||A.PLACES.jerusalem,o=VOFF[i%4];
    cs(gVoices.append('g'),pl.ll,{dx:o[0],dy:o[1],minr:.55}).append('text').attr('class','emo').text(s.prop)
      .on('click',ev=>{ev.stopPropagation();bubbleAt(ev,`<h5>${s.prop} ${esc(s.role)}</h5><p>${esc(s.text)}</p>`);});
  });
  if(st.layers.sacred) (C.ERA_SACRED[e.id]||[]).forEach(k=>{
    const s=C.SACRED_SITES[k],dx=k==='temple'?13:k==='sepulchre'?-13:0;
    cs(gSacred.append('g'),A.SACRED_LL[k],{dx,dy:k==='bethlehem'?12:0,minr:.9}).append('text').attr('class','emo sm').text(s.icon)
      .on('click',ev=>{ev.stopPropagation();bubbleAt(ev,`<h5>${s.icon} ${esc(s.name)}</h5><p>${esc(s.text)}</p>`);});
  });
}
function drawWaters(y){
  gWaterLab.selectAll('*').remove();
  A.WATERS.forEach(w=>{const n=w.names.find(n=>y>=n[0]&&y<n[1]);if(!n)return;
    cs(gWaterLab.append('g'),w.at,{rot:w.rot||0,minr:w.size>12?.25:.7}).append('text').attr('class','wl').style('font-size',w.size+'px').attr('text-anchor',w.anchor||'middle').attr('dy','.35em').text(n[2]);});
  hula.style('display',y<A.EXTRA_WATER.hula.y[1]?'':'none');
  return A.WATERS.map(w=>(w.names.find(n=>y>=n[0]&&y<n[1])||[])[2]).join('|');
}
function pulse(ll){const g=cs(gFx.append('g'),ll);const c=g.append('circle').attr('class','pulse').attr('r',4);anim.push({type:'pulse',el:c.node(),g:g.node(),t0:performance.now()});applyCS();}

let last=0;
function tick(now){
  const dt=Math.min(60,now-last||16);last=now;const k=T.k;
  for(let i=anim.length-1;i>=0;i--){const a=anim[i];
    if(a.type==='dot'){a.t=(a.t+a.sp*dt)%1;const u=a.t,q=1-u;a.el.setAttribute('transform',`translate(${q*q*a.a[0]+2*q*u*a.c[0]+u*u*a.b[0]},${q*q*a.a[1]+2*q*u*a.c[1]+u*u*a.b[1]}) scale(${1/k})`);a.el.setAttribute('opacity',Math.min(1,Math.min(u,1-u)*8));}
    else if(a.type==='courier'||a.type==='trade'){if(a.type==='trade')a.el.style.display=k/k0<.5?'none':'';a.t=(a.t+a.sp*dt)%1;const p=a.path.getPointAtLength(a.t*a.len);a.el.setAttribute('transform',`translate(${p.x},${p.y}) scale(${1/k})`);}
    else if(a.type==='pulse'){const u=(now-a.t0)/1800;if(u>=1){a.g.remove();anim.splice(i,1);continue;}const v=(u*2)%1;a.el.setAttribute('r',4+v*24);a.el.setAttribute('opacity',1-v);}
  }
  if(st.playing){const f=fracOf(st.year)+dt/(N*6500);if(f>=.9995){setPlay(false);}else setYear(yearOf(f),{noHash:true,raw:f});}
  requestAnimationFrame(tick);
}

/* ---------- year + era rendering ---------- */
let sigT='',sigP='',sigF='',sigW='',sigR='',lastEv=null;
function setYear(y,o){
  o=o||{}; const i=eraIdxOf(y),e=ERAS[i]; y=Math.max(ERAS[0].geo.y[0],Math.min(y,ERAS[N-1].geo.y[1])); st.year=y;
  if(i!==st.era){if(st.sel&&!o.keepSel)st.sel=null;st.era=i;renderEra(e);sigT=sigP=sigF=sigR='';lastEv=null;}
  const s1=terrSig(e,y); if(s1!==sigT){sigT=s1;drawTerr(gTerr,gLab,e,y);}
  const s2=e.id+eraPlaces(e,y).map(p=>p.k+p.label).join()+st.sel; if(s2!==sigP){sigP=s2;drawPlaces(e,y);}
  const s3=e.id+(e.geo.flows||[]).map((f,j)=>active(f,y,e)?j:'').join()+st.layers.people; if(s3!==sigF){sigF=s3;drawFlows(e,y);}
  const s4=e.id+A.ROUTES.map((r,j)=>y>=r.y[0]&&y<=r.y[1]?j:'').join()+st.layers.roads; if(s4!==sigR){sigR=s4;drawRoutes(e,y);}
  const w=A.WATERS.map(w=>w.names.findIndex(n=>y>=n[0]&&y<n[1])).join()+(y<1958); if(w!==sigW){sigW=w;drawWaters(y);}
  const ck=capOf(e,y); if(ck!==st.cap||o.force){drawPower(e,y);}
  applyCS(); declutter();
  // header
  const yb=$('#yearBig'); if(e.id==='orientation') yb.innerHTML='<span style="font-size:.62em">Before the names</span>'; else {const f=fmtY(y);yb.innerHTML=f[0]+(f[1]?`<small>${f[1]}</small>`:'');}
  $('#thumb').style.left=(o.raw!=null?o.raw:fracOf(y))*100+'%'; $('#thumbLab').textContent=e.id==='orientation'?'the land itself':fmtYs(y);
  // chronicle
  const evs=e.geo.events||[]; let cur=-1; evs.forEach((ev,j)=>{if(ev[0]<=y)cur=j;});
  document.querySelectorAll('#body .chron li').forEach((li,j)=>{li.classList.toggle('past',j<=cur);li.classList.toggle('cur',j===cur);});
  const pk=$('#peek');
  if(cur>=0){const ev=evs[cur];pk.innerHTML=`<div class="ev"><b>${fmtYs(ev[0])}</b>${esc(ev[1])}</div><div class="more">Open the chapter</div>`;
    if(lastEv!==null&&lastEv!==e.id+cur&&ev[2]&&A.PLACES[ev[2]]&&!st.journey) pulse(A.PLACES[ev[2]].ll);}
  else pk.innerHTML=`<div class="ess">${esc(e.essence)}</div><div class="more">Open the chapter</div>`;
  lastEv=e.id+cur;
  if(st.lens.on) drawUnder();
  if(!o.noHash) saveHash();
}
function renderEra(e){
  document.querySelectorAll('#segs i').forEach((s,j)=>s.classList.toggle('on',j===st.era));
  $('#eraLine').innerHTML=`<b>${esc(e.name)}</b><br><i>${esc(e.range)}${e.id==='orientation'?'':' · '+esc(e.cyr)}</i>`;
  drawVoices(e);
  // chapter body
  let h='';
  h+='<div class="names">'+e.land.map(l=>`<span><em>${esc(l[0])}</em>${esc(l[1])}</span>`).join('')+'</div>';
  h+=`<p class="lead" style="margin-top:.8em">${esc(e.essence)}</p>`;
  const evs=e.geo.events||[];
  if(evs.length) h+='<h3>Chronicle</h3><ul class="chron">'+evs.map((ev,j)=>`<li data-ev="${j}"><b>${fmtYs(ev[0])}</b>${esc(ev[1])}</li>`).join('')+'</ul>';
  h+='<h3>The chapter</h3>'+e.body.map(p=>`<p>${p}</p>`).join('');
  if(e.bible) h+=`<h3>Scripture and evidence</h3><div class="note">${[].concat(e.bible).join('<br>')}</div>`;
  if(e.gap) h+=`<h3>What carries over</h3><div class="note">${e.gap}</div>`;
  if(e.powerCenter){const pc=e.powerCenter;h+=`<h3>Ruled from</h3><div class="note"><b>${esc(pc.city)}</b> — ${esc(pc.kind)}.${pc.distanceMiles?` Travel time: ${esc(pc.travelTime)}.`:''}</div>`;}
  const pop=C.POPULATION[e.id]; if(pop) h+=`<h3>Who calls it home</h3><div class="note"><b>${esc(pop.who)}.</b> ${esc(pop.detail)}</div>`;
  const facts=C.MAP_FACTS[e.id]||[]; if(facts.length) h+='<h3>In the margins</h3>'+facts.map(f=>`<div class="note">${f.icon} <b>${esc(f.title)}.</b> ${esc(f.text)}</div>`).join('');
  if(C.TRADE_INFO[e.id]) h+=`<h3>Trade</h3><div class="note">🫒 ${esc(C.TRADE_INFO[e.id])}</div>`;
  if((e.stories||[]).length) h+='<h3>Voices</h3>'+e.stories.map(s=>`<div class="voice"><span class="e">${s.prop}</span><p><b>${esc(s.role)}</b> ${esc(s.text)}</p></div>`).join('')+'<p class="foot" style="margin-top:.5em">These voices are representative composites, not quotations.</p>';
  const cols=[...new Set((e.geo.flows||[]).map(f=>f.col))]; if(cols.length) h+='<h3>People on the move</h3><div class="legend">'+cols.map(c=>`<span><i style="background:${C.FLOWCOL[c][0]}"></i>${esc(C.FLOWCOL[c][1])}</span>`).join('')+'</div>';
  if(C.SLIDE_NOTES[e.id]) h+=`<p class="foot">${esc(C.SLIDE_NOTES[e.id])}</p>`;
  if(st.era===N-1) h+=`<p class="foot">${esc(C.FOOT)}</p>`;
  h+='<p class="foot">Borders here are washes of colour, not survey lines. Tap any spot on the map to see who has ruled it.</p>';
  const b=$('#body'); b.innerHTML=h; b.scrollTop=0;
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
  const L=st.lens; L.on=on; $('#bLens').classList.toggle('on',on); $('#lens').hidden=!on;
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
function standHere(ll){
  if(ll[0]<L0||ll[0]>L1||ll[1]<B0||ll[1]>B1) return;
  gFx.selectAll('.herepin').remove(); cs(gFx.append('g').attr('class','herepin'),ll).append('circle').attr('class','here').attr('r',5); applyCS();
  const inLake=G.lakes.some(l=>geomHas(l.g,ll)), onLand=geomHas(G.land,ll)&&!inLake;
  const lat=Math.abs(ll[1]).toFixed(2)+'° N',lon=ll[0].toFixed(2)+'° E';
  if(!onLand){
    const w=inLake?(ll[1]>32?A.WATERS[2]:A.WATERS[1]):(ll[1]<30&&ll[0]>34?A.WATERS[4]:A.WATERS[0]);
    openModal(`<h2>Open water</h2><p class="sub">${lat}, ${lon}</p><h3>What this water has been called</h3><ul class="strata nm">${w.names.map(n=>`<li data-y="${Math.max(n[0],-3000)+1}" class="${st.year>=n[0]&&st.year<n[1]?'cur':''}"><span class="yr">${n[0]<-3000?'earliest':'from '+fmtYs(n[0])}</span><span>${esc(n[2])}</span></li>`).join('')}</ul>`);
    return;
  }
  const [nk,nd]=nearest(ll);
  openModal(`<h2>Standing here</h2><p class="sub">${lat}, ${lon} · ${nd<1.5?'at':Math.round(nd)+' km from'} <a class="gl" data-place="${nk}">${esc(C.CITIES[nk].en)}</a></p><h3>Who has ruled this spot</h3>${strataHTML(ll)}<p class="foot" style="font-style:italic;color:var(--ink2);margin-top:.8em">Tap a row to travel to that time. Outlines are approximate, so places near a border may fall on either side.</p>`);
}
function openPlace(k){
  const c=C.CITIES[k],pl=A.PLACES[k]; st.sel=k; sigP=''; setYear(st.year,{noHash:true}); saveHash();
  const ny=(C.NAME_YEARS||{})[k];
  let h=`<h2>${esc(c.en)}</h2><div class="tri">${c.he?`<div><span class="he">${c.he}</span><small>Hebrew · ${esc(c.he_tr||'')}</small></div>`:''}${c.ar?`<div><span class="ar">${c.ar}</span><small>Arabic · ${esc(c.ar_tr||'')}</small></div>`:''}</div>`;
  if(c.also) h+=`<p class="sub">${esc(c.also)}</p>`;
  h+=`<p>${esc(c.blurb)}</p>`;
  if(ny){let cur=-1;ny.forEach((n,j)=>{if(n[0]<=st.year)cur=j;});
    h+='<h3>Its names, in order</h3><ul class="strata nm">'+ny.map((n,j)=>`<li data-y="${n[0]+1}" class="${j===cur?'cur':''}"><span class="yr">${n[0]<0?'c. ':''}${fmtYs(n[0])}</span><span>${esc(n[1])}${n[2]?` <span class="d">· ${esc(n[2])}</span>`:''}</span></li>`).join('')+'</ul>';}
  else if(C.NAME_STACKS[k]) h+='<h3>Its names</h3><ul class="strata nm">'+C.NAME_STACKS[k].map(n=>`<li><span class="yr">${esc(n[0])}</span><span>${esc(n[1])}</span></li>`).join('')+'</ul>';
  if(pl.ll[0]>=L0&&pl.ll[0]<=L1) h+='<h3>Who has ruled it</h3>'+strataHTML(pl.ll);
  const vs=[];ERAS.forEach(e=>(e.stories||[]).forEach(s=>{if(s.loc===k)vs.push([e,s]);}));
  if(vs.length) h+='<h3>Voices from here</h3>'+vs.map(([e,s])=>`<div class="voice" data-y="${REP[e.id]}" style="cursor:pointer"><span class="e">${s.prop}</span><p><b>${esc(s.role)}</b> ${esc(s.text)}</p></div>`).join('');
  h+=`<p style="margin-top:1em"><button class="btn" data-fly="${k}">Show on the map</button></p>`;
  openModal(h);
}

/* ---------- bubbles + modals ---------- */
function bubbleAt(ev,html){
  const r=$('#mapwrap').getBoundingClientRect(),b=$('#bubble'),x=ev.clientX-r.left,y=ev.clientY-r.top;
  b.innerHTML=`<button class="x" aria-label="Close">×</button>`+html; b.hidden=false;
  const below=y<170; b.classList.toggle('below',below);
  b.style.left=Math.max(155,Math.min(W-155,x))+'px'; b.style.top=(below?y+22:y-22)+'px';
  hideHint();
}
function hideBubble(){$('#bubble').hidden=true;}
$('#bubble').addEventListener('click',hideBubble);
function openModal(html){$('#mBody').innerHTML=html;$('#modal').hidden=false;$('#ov').hidden=false;$('#modal').scrollTop=0;hideBubble();hideHint();}
function closeModal(){$('#modal').hidden=true;$('#ov').hidden=true;gFx.selectAll('.herepin').remove();}
$('#ov').addEventListener('click',closeModal); $('#mClose').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();hideBubble();}});
function hideHint(){$('#hint').classList.add('gone');}

document.addEventListener('click',e=>{
  const gl=e.target.closest('a.gl');
  if(gl){e.preventDefault();
    if(gl.dataset.place){openPlace(gl.dataset.place);return;}
    const t=C.GLOSSARY[gl.dataset.g]; if(t) openModal(`<h3 style="margin-top:0">A word explained</h3><h2>${esc(t[0])}</h2><p>${esc(t[1])}</p>`); return;}
  const li=e.target.closest('#mBody [data-y]'); if(li){closeModal();setYear(+li.dataset.y,{keepSel:true});return;}
  const fb=e.target.closest('[data-fly]'); if(fb){closeModal();flyTo(A.PLACES[fb.dataset.fly].ll,Math.max(2.4,T.k/k0));return;}
  const cl=e.target.closest('.chron li'); if(cl){const ev=ERAS[st.era].geo.events[+cl.dataset.ev];setYear(ev[0]);if(ev[2]&&A.PLACES[ev[2]]){pulse(A.PLACES[ev[2]].ll);if(!WIDE())$('#sheet').classList.remove('open');}return;}
});
svg.on('click',e=>{ if(e.defaultPrevented)return; if(!$('#bubble').hidden){hideBubble();return;} if(!$('#layers').hidden){$('#layers').hidden=true;return;}
  const p=d3.pointer(e,svg.node()); standHere(unproj(T.invert(p))); });

/* ---------- search ---------- */
let INDEX=null;
function buildIndex(){
  INDEX=[];
  Object.keys(A.PLACES).forEach(k=>{const c=C.CITIES[k];if(!c)return;const ny=((C.NAME_YEARS||{})[k]||[]).map(n=>n[1]).join(' ');
    INDEX.push({t:'Place',title:c.en,sub:[c.he_tr,c.ar_tr].filter(Boolean).join(' · '),hay:[c.en,c.he_tr,c.ar_tr,c.also,ny,c.he,c.ar].join(' '),go:()=>{openPlace(k);}});});
  ERAS.forEach(e=>{if(e.id==='orientation')return;INDEX.push({t:'Era',title:e.name,sub:e.range+' · '+e.cyr,hay:[e.name,e.range,e.cnm,e.land.map(l=>l[1]).join(' ')].join(' '),go:()=>{closeModal();setYear(REP[e.id]);}});
    (e.geo.events||[]).forEach(ev=>INDEX.push({t:fmtYs(ev[0]),title:ev[1],sub:'',hay:ev[1]+' '+Math.floor(Math.abs(ev[0])),go:()=>{closeModal();setYear(ev[0]);if(ev[2]&&A.PLACES[ev[2]])pulse(A.PLACES[ev[2]].ll);}}));
    e.geo.terr.forEach(t=>{if(t.l&&!t.bg)INDEX.push({t:'Territory',title:titleCase(t.l),sub:t.sub,hay:t.l+' '+t.sub,go:()=>{closeModal();const r=t.y||e.geo.y;setYear((r[0]+r[1])/2);}});});});
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
  openModal('<h2>Journeys</h2><p class="sub">Short guided walks through the layers.</p><ul class="jlist">'+A.JOURNEYS.map((j,i)=>`<li data-j="${i}"><span class="e">${j.icon}</span><div><b>${esc(j.title)}</b><span>${esc(j.blurb)} · ${j.steps.length} stops</span></div></li>`).join('')+'</ul>');
  $('#mBody .jlist').addEventListener('click',e=>{const li=e.target.closest('li');if(!li)return;closeModal();startJourney(A.JOURNEYS[+li.dataset.j]);});
}
function startJourney(j){setPlay(false);setLens(false);st.journey={j,i:0};$('#sheet').classList.add('journey');$('#sheet').classList.remove('open');$('#jcard').hidden=false;step(0,true);afterLayout();}
function endJourney(){st.journey=null;$('#sheet').classList.remove('journey');$('#jcard').hidden=true;afterLayout();}
function step(i,skipCam){
  const J=st.journey,s=J.j.steps[i];J.i=i;setYear(s.y,{force:true});
  $('#jcard').innerHTML=`<div class="jt"><span>${J.j.icon} ${esc(J.j.title)}</span><span>${i+1} / ${J.j.steps.length}</span></div><p>${s.t}</p><div class="jn"><button id="jPrev" ${i?'':'disabled'}>‹ Back</button><button id="jExit">Leave</button><button id="jNext" class="go">${i<J.j.steps.length-1?'Next ›':'Finish'}</button></div>`;
  $('#jPrev').onclick=()=>step(i-1); $('#jExit').onclick=endJourney; $('#jNext').onclick=()=>i<J.j.steps.length-1?step(i+1):endJourney();
  if(!skipCam) setTimeout(journeyCam,60);
}
function journeyCam(){
  const J=st.journey; if(!J)return; const s=J.j.steps[J.i];
  if(s.cap&&st.cap&&km(JERU,A.FAR[st.cap][1])>150) capView(true); else {st.capView=false; if(s.c) flyTo(s.c,s.z||1.6); else home(900);} if(s.c&&s.z>=3) pulse(s.c);
}
function capView(on){
  st.capView=on; const key=st.cap;
  if(on&&key){const ll=A.FAR[key][1];fit([[Math.min(33.6,ll[0])-1.5,Math.min(30.6,ll[1])-1.5],[Math.max(36.4,ll[0])+1.5,Math.max(33.2,ll[1])+1.5]],{t:150,b:30,l:30,r:60},1100,k0);}
  else home(900);
  drawPower(ERAS[st.era],st.year); applyCS();
}

/* ---------- about, layers ---------- */
function openAbout(){
  openModal(`<h2>Palimpsest</h2><p class="sub">A land rewritten: Canaan, Israel and Judah, Judaea, Palaestina, Filasṭīn, the Holy Land, Eretz Yisrael.</p>
  <p>A palimpsest is a manuscript scraped and written over, with the older words still showing through. This atlas treats one small land the same way, across about 5,000 years.</p>
  <h3>How to use it</h3>
  <p><b>Drag the timeline</b> to move through the years. <b>Tap any spot</b> to see everyone who has ruled it. <b>Tap a town</b> for its names in order. <b>◐ Scrape</b> opens a lens onto the layer beneath. <b>✦ Journeys</b> are guided walks. <b>⌕</b> searches places, years and words.</p>
  <h3>A note on fairness</h3>
  <p>This is a guide built to be fair to a contested history, not to settle it. Borders are washes of colour, not survey lines; flows show direction, not exact numbers. Where one event carries two names — 1948 above all — both are given. Colours are pigments, not flags. The last chapter reflects events as of <b>November 2026</b>.</p>
  <h3>Sources</h3>${A.SOURCES.map(s=>`<p><b>${s[0]}.</b> ${s[1]}</p>`).join('')}
  <h3>Share</h3><p><button class="btn" id="bCopy">Copy a link to this view</button> <a class="btn ghost" href="v1/">The first edition (June 2026)</a></p>
  <p class="foot" style="font-style:italic;color:var(--ink2)">SIFRKALON · CC BY-SA 4.0</p>`);
  $('#bCopy').onclick=()=>{saveHash(true);const u=location.href;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{$('#bCopy').textContent='Link copied';},()=>{prompt('Copy this link',u);});};
}
const LAYERS=[['rule','Who rules (colour washes)'],['people','People on the move'],['roads','Roads, rails and trade'],['voices','Voices'],['sacred','Sacred sites'],['borders','Today’s borders, for reference']];
function buildLayers(){
  const p=$('#layers'); p.innerHTML='<h4>Layers</h4>'+LAYERS.map(l=>`<label><input type="checkbox" data-l="${l[0]}" ${st.layers[l[0]]?'checked':''}>${l[1]}</label>`).join('');
  p.addEventListener('change',e=>{const k=e.target.dataset.l;st.layers[k]=e.target.checked?1:0;applyLayers();});
}
function applyLayers(){
  gTerrWrap.style('display',st.layers.rule?'':'none'); gLab.style('display',st.layers.rule?'':'none');
  gBorders.style('display',st.layers.borders?'':'none');
  sigF=sigR=''; drawVoices(ERAS[st.era]); setYear(st.year,{noHash:true});
}

/* ---------- timeline ---------- */
function buildTimeline(){
  $('#segs').innerHTML=ERAS.map(e=>`<i style="background:${e.swatch}" title="${esc(e.name)}"></i>`).join('');
  const tr=$('#track'); let drag=false;
  const at=e=>{const r=tr.getBoundingClientRect();return Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));};
  tr.addEventListener('pointerdown',e=>{drag=true;tr.setPointerCapture(e.pointerId);tr.classList.add('drag');setPlay(false);if(st.journey)endJourney();const f=at(e);setYear(yearOf(f),{raw:f,noHash:true});hideHint();});
  tr.addEventListener('pointermove',e=>{if(!drag)return;const f=at(e);setYear(yearOf(f),{raw:f,noHash:true});});
  const up=()=>{if(!drag)return;drag=false;tr.classList.remove('drag');setYear(st.year);};
  tr.addEventListener('pointerup',up);tr.addEventListener('pointercancel',up);
  tr.addEventListener('keydown',e=>{const g=ERAS[st.era].geo.y,stp=(g[1]-g[0])/40;if(e.key==='ArrowRight')setYear(st.year+stp);if(e.key==='ArrowLeft')setYear(st.year-stp);});
  $('#bPrev').onclick=()=>{setPlay(false);if(st.journey)endJourney();setYear(REP[ERAS[Math.max(0,st.era-1)].id]);};
  $('#bNext').onclick=()=>{setPlay(false);if(st.journey)endJourney();setYear(REP[ERAS[Math.min(N-1,st.era+1)].id]);};
  $('#bPlay').onclick=()=>{if(st.journey)endJourney();if(!st.playing&&fracOf(st.year)>.99)setYear(ERAS[1].geo.y[0]);setPlay(!st.playing);};
}
function setPlay(on){st.playing=on;$('#bPlay').textContent=on?'❚❚':'▶';if(!on)saveHash();}

/* ---------- url ---------- */
let hashT=null;
function saveHash(now){clearTimeout(hashT);const f=()=>{const y=Math.round(st.year*100)/100;history.replaceState(null,'','#y='+y+(st.sel?'&p='+st.sel:''));};now?f():hashT=setTimeout(f,350);}
function readHash(){const m=/y=(-?[\d.]+)/.exec(location.hash),p=/p=([a-z0-9]+)/.exec(location.hash);return {y:m?+m[1]:null,p:p&&A.PLACES[p[1]]?p[1]:null};}

/* ---------- wiring ---------- */
$('#bSearch').onclick=openSearch; $('#bJourneys').onclick=openJourneys; $('#bAbout').onclick=openAbout;
$('#bLens').onclick=()=>{setLens(!st.lens.on);hideHint();};
$('#bLayers').onclick=()=>{$('#layers').hidden=!$('#layers').hidden;};
$('#bHome').onclick=()=>home(800);
$('#capChip').onclick=()=>{if($('#capChip').dataset.far)capView(!st.capView);};
const toggleSheet=()=>{$('#sheet').classList.toggle('open');hideHint();};
$('#grip').onclick=toggleSheet; $('#peek').onclick=toggleSheet;
function relayout(keep){
  const k=T.k/k0,c=unproj(T.invert([W/2,(H-dockPad())/2+40]));
  size(); st.dockH=0; const hk=fit(HOME,null,0); k0=hk; zoom.scaleExtent([k0*.03,k0*16]);
  if(st.journey) journeyCam(); else if(keep&&Math.abs(k-1)>.02) flyTo(c,k,0);
  applyCS(); declutter(); placeLens();
}
function afterLayout(){setTimeout(()=>relayout(true),420);}
let rsT; new ResizeObserver(()=>{clearTimeout(rsT);rsT=setTimeout(()=>{const r=$('#mapwrap').getBoundingClientRect();if(Math.abs(r.width-W)>1||Math.abs(r.height-H)>1)relayout(true);},140);}).observe($('#mapwrap'));

/* ---------- start ---------- */
size(); buildTimeline(); buildLayers();
k0=fit(HOME,null,0); zoom.scaleExtent([k0*.03,k0*16]);
const h0=readHash(); if(h0.p)st.sel=h0.p;
setYear(h0.y!=null?h0.y:REP.orientation,{noHash:true});
if(h0.p)flyTo(A.PLACES[h0.p].ll,2.6,0);
setTimeout(hideHint,9000);
requestAnimationFrame(tick);
window.PAL={setYear,st,flyTo,openPlace,standHere,setLens,startJourney:i=>startJourney(A.JOURNEYS[i]),capView};
})();
