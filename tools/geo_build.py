import json, shapely
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union
D=box(31.0,27.0,39.0,35.6); W=box(-12,10,62,58)
def load(n): return json.load(open(f'ne/{n}.geojson'))['features']
def rnd(g,nd):
    return shapely.set_precision(g, 10**-nd)
def clip(feats,b,tol,nd,keep=lambda p:True):
    out=[]
    for f in feats:
        if not keep(f['properties']): continue
        g=shape(f['geometry'])
        if not g.is_valid: g=g.buffer(0)
        g=g.intersection(b)
        if g.is_empty: continue
        g=g.simplify(tol,preserve_topology=True)
        if g.is_empty: continue
        out.append((f['properties'],g))
    return out
def gj(g,nd):
    m=mapping(g)
    def r(c):
        if isinstance(c[0],(int,float)): return [round(c[0],nd),round(c[1],nd)]
        return [r(x) for x in c]
    return {'type':m['type'],'coordinates':r(m['coordinates'])} if m['type']!='GeometryCollection' else None
out={}
land10=unary_union([g for p,g in clip(load('ne_10m_land'),D,0.0015,3)])
out['land']=gj(land10,3)
land50=unary_union([g for p,g in clip(load('ne_50m_land'),W,0.02,2)]).difference(D)
out['landWide']=gj(land50,2)
lk=clip(load('ne_10m_lakes'),D,0.0015,3)
out['lakes']=[{'name':p.get('name'),'g':gj(g,3)} for p,g in lk]
print('lakes',[p.get('name') for p,g in lk])
rv=clip(load('ne_10m_rivers_lake_centerlines'),D,0.002,3)
out['rivers']=[{'name':p.get('name'),'w':p.get('strokeweig'),'g':gj(g,3)} for p,g in rv if g.geom_type in('LineString','MultiLineString')]
print('rivers',sorted(set(str(p.get('name')) for p,g in rv)))
rvw=clip(load('ne_50m_rivers_lake_centerlines'),W,0.03,2,lambda p:p.get('name') in('Nile','Euphrates','Tigris','Danube','Dnieper','Don','Volga','Po','Rhine','Rhône','Loire','Seine','Tagus','Ebro','Indus','Kizil','Kızılırmak','Orontes','Thames'))
out['riversWide']=[{'name':p.get('name'),'g':gj(g.difference(D),2)} for p,g in rvw if not g.difference(D).is_empty]
lkw=clip(load('ne_50m_lakes'),W,0.03,2)
out['lakesWide']=[{'name':p.get('name'),'g':gj(g,2)} for p,g in lkw if g.difference(D).area>0.05]
pl=clip(load('ne_10m_playas'),D,0.003,3)
print('playas',[p.get('name') for p,g in pl])
C=load('ne_10m_admin_0_countries')
names=['Israel','Palestine','Lebanon','Syria','Jordan','Egypt','Saudi Arabia','Cyprus','Iraq','Turkey','N. Cyprus']
cc={}
for f in C:
    n=f['properties']['NAME']
    if n in names:
        g=shape(f['geometry']).buffer(0).intersection(D)
        if not g.is_empty: cc[n]=g
print('countries',list(cc))
isr=cc['Israel']; pal=cc['Palestine']
parts=sorted(list(pal.geoms) if pal.geom_type=='MultiPolygon' else [pal],key=lambda g:-g.area)
print('pal parts',[(round(p.area,3),[round(x,2) for x in p.centroid.coords[0]]) for p in parts])
print('israel type',isr.geom_type, [round(x,2) for x in isr.bounds])
dis=load('ne_10m_admin_0_disputed_areas')
dd={}
for f in dis:
    g=shape(f['geometry']).buffer(0)
    if g.intersects(D):
        p=f['properties']; print('disputed',p.get('NAME'),p.get('ADMIN'),p.get('NOTE_BRK'),round(g.area,4),[round(x,2) for x in g.centroid.coords[0]])
        dd[p.get('NAME')]=g.intersection(D)
json.dump({'out':out},open('geo_tmp.json','w'))
import pickle; pickle.dump({'cc':cc,'dd':dd,'land10':land10},open('geo.pkl','wb'))
import os; print('size',os.path.getsize('geo_tmp.json'))
for k,v in out.items(): print(k,len(json.dumps(v)))
