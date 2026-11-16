import json,pickle
from shapely.geometry import box, mapping, LineString, MultiLineString
from shapely.ops import unary_union, linemerge
g=pickle.load(open('geo.pkl','rb')); cc,dd,land=g['cc'],g['dd'],g['land10']
out=json.load(open('geo_tmp.json'))['out']
def gj(geom,nd=3):
    m=mapping(geom)
    def r(c):
        if isinstance(c[0],(int,float)): return [round(c[0],nd),round(c[1],nd)]
        return [r(x) for x in c]
    return {'type':m['type'],'coordinates':r(m['coordinates'])}
S=lambda x: x.simplify(0.0015)
isr=unary_union([dd['Israel'],dd['Mount Scopus']]).buffer(0.0008).buffer(-0.0008)
wb=unary_union([dd['West Bank'],dd['East Jerusalem'],dd["No Man's Land (Fort Latrun)"],dd["No Man's Land (Jerusalem)"]]).buffer(0.0008).buffer(-0.0008)
gaza=dd['Gaza']; golan=unary_union([dd['Golan Heights'],dd['Shebaa Farms']]).buffer(0.0008).buffer(-0.0008)
sinai=cc['Egypt'].intersection(box(32.34,27,35.3,31.7))
mand=unary_union([isr,wb,gaza]).buffer(0.002).buffer(-0.002)
out['mod']={k:gj(S(v)) for k,v in dict(israel=isr,westbank=wb,gaza=gaza,golan=golan,sinai=sinai,mandate=mand,ejer=dd['East Jerusalem'],jordan=cc['Jordan'],lebanon=cc['Lebanon'],undof=dd['UNDOF Zone']).items()}
coast=land.boundary.buffer(0.012); edge=box(31.0,27.0,39.0,35.6).boundary.buffer(0.01)
lines=[]
for n,c in cc.items():
    b=c.boundary.difference(coast).difference(edge)
    if not b.is_empty: lines.append(b)
for k in ['West Bank','Gaza','Golan Heights']:
    lines.append(dd[k].boundary.difference(coast))
u=unary_union(lines).simplify(0.002)
out['borders']=gj(u)
for k in out['mod']: print(k,len(json.dumps(out['mod'][k])))
print('borders',len(json.dumps(out['borders'])))
print('israel bounds',isr.bounds,'wb',wb.bounds,'gaza',gaza.bounds,'golan',golan.bounds)
from shapely.geometry import shape
D=box(31.0,27.0,39.0,35.6); Wb=box(-12,10,62,58)
out['coast']=gj(land.boundary.difference(D.boundary.buffer(0.004)))
lw=shape(out['landWide'])
out['coastWide']=gj(lw.boundary.difference(D.boundary.buffer(0.03)).difference(Wb.boundary.buffer(0.03)),2)
print('coast',len(json.dumps(out['coast'])),'coastWide',len(json.dumps(out['coastWide'])))
open('geo.js','w').write('window.GEO='+json.dumps(out,separators=(',',':'))+';')
import os; print('geo.js',os.path.getsize('geo.js'))
