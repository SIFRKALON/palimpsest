import numpy as np, pickle, json, math
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import box
L0,L1,B0,B1=31.0,39.0,27.0,35.6
W=1500
my=lambda la: math.degrees(math.log(math.tan(math.pi/4+math.radians(la)/2)))
Y0,Y1=my(B0),my(B1); H=int(round(W*(Y1-Y0)/(L1-L0)))
xs=np.linspace(L0,L1,W); ys=np.linspace(Y1,Y0,H)
lon,my_=np.meshgrid(xs,ys); lat=np.degrees(2*np.arctan(np.exp(np.radians(my_)))-np.pi/2)
coslat=np.cos(np.radians(31.5))
def segdist(px,py,a,b):
    ax,ay=a[0]*coslat,a[1]; bx,by=b[0]*coslat,b[1]
    dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
    t=np.clip(((px-ax)*dx+(py-ay)*dy)/L,0,1)
    return np.hypot(px-(ax+t*dx),py-(ay+t*dy)),t
PX,PY=lon*coslat,lat
def ridge(pts,width):
    # pts: (lon,lat,height); returns field of height with gaussian falloff
    out=np.zeros_like(lon)
    for a,b in zip(pts[:-1],pts[1:]):
        d,t=segdist(PX,PY,a,b); h=a[2]+(b[2]-a[2])*t
        w=width if not isinstance(width,(tuple,list)) else width[0]
        out=np.maximum(out,h*np.exp(-(d/w)**2))
    return out
E=np.zeros_like(lon)+30
R=[
 ([(34.98,31.25,520),(35.08,31.50,950),(35.18,31.72,820),(35.22,31.95,880),(35.27,32.20,860),(35.28,32.40,480)],0.16),   # Judea-Samaria
 ([(35.20,32.72,380),(35.42,32.98,1150),(35.40,33.12,850)],0.16),  # Galilee
 ([(34.98,32.80,480),(35.12,32.64,420)],0.07),  # Carmel
 ([(35.38,32.42,480),(35.45,32.50,400)],0.05),  # Gilboa
 ([(35.45,33.35,1000),(35.70,33.80,1900),(36.02,34.28,2900),(36.22,34.58,1800)],0.17), # Lebanon
 ([(35.84,33.40,2700),(36.15,33.72,2300),(36.55,34.15,2300),(36.9,34.45,1500)],0.15), # Anti-Lebanon
 ([(35.75,32.95,900),(35.85,33.15,1100)],0.14), # Golan
 ([(35.80,32.55,1000),(35.78,32.28,1150),(35.88,31.98,1000),(35.78,31.60,900),(35.75,31.25,1150),(35.62,30.75,1500),(35.50,30.35,1600),(35.45,29.90,1500),(35.35,29.3,1500),(35.6,28.4,1900),(36.2,27.4,1900)],0.22), # Transjordan scarp
 ([(34.55,30.35,800),(34.78,30.62,1000),(34.95,30.85,650)],0.22), # Negev highlands
 ([(33.2,29.6,800),(33.9,29.8,1000),(34.4,29.7,850)],0.35), # Tih
 ([(33.7,28.75,1700),(33.97,28.55,2500),(34.2,28.3,1700)],0.22), # S Sinai
 ([(36.60,32.55,1100),(36.75,32.70,1750),(36.8,32.9,1300)],0.20), # Jebel Druze
 ([(32.6,34.9,1100),(32.87,34.93,1900),(33.2,34.9,900)],0.16), # Troodos
 ([(33.0,35.3,700),(33.9,35.35,800),(34.4,35.6,500)],0.05), # Kyrenia
 ([(36.15,34.8,1100),(36.25,35.6,1400)],0.13), # Nusayriyah
 ([(32.5,28.6,1200),(33.0,27.6,1700),(33.4,27.0,1500)],0.25), # Red Sea hills
 ([(31.9,29.9,600),(32.2,29.4,900)],0.15),
]
for pts,w in R: E=np.maximum(E,ridge(pts,w))
# eastern plateau
ss=lambda v:v*v*(3-2*v)
plat=ss(np.clip((lon-35.6)/0.7,0,1))*np.clip((35.2-lat)/1.0+3,0,1)
E=np.maximum(E, plat*(850-np.clip(lon-36.2,0,3)*90))
# syrian plain
E=np.maximum(E, ss(np.clip((lon-35.9)/0.6,0,1))*ss(np.clip((lat-32.2)/0.6,0,1))*650)
# rift
rift=[(36.25,34.6,500),(36.05,34.0,950),(35.85,33.55,850),(35.62,33.20,90),(35.60,33.05,70),(35.59,32.82,-210),(35.56,32.50,-260),(35.55,32.10,-320),(35.53,31.80,-400),(35.48,31.50,-430),(35.45,31.10,-400),(35.38,30.80,-150),(35.25,30.30,150),(35.10,29.80,80),(35.00,29.55,0),(34.75,28.9,-300),(34.55,28.1,-500)]
for a,b in zip(rift[:-1],rift[1:]):
    d,t=segdist(PX,PY,a,b); h=a[2]+(b[2]-a[2])*t; wd=0.075 if a[1]>31.0 else 0.045
    w=np.exp(-(d/wd)**2)*(1.0 if a[1]>31.0 else 0.8)
    E=E*(1-w)+h*w
# valleys
for (a,b,h,wd) in [((35.05,32.72),(35.50,32.52),60,0.07),((34.80,31.25),(35.05,31.22),300,0.08)]:
    d,t=segdist(PX,PY,a,b); w=np.exp(-(d/wd)**2)*0.85; E=E*(1-w)+h*w
# noise
def fnoise(shape,beta,seed):
    rng=np.random.default_rng(seed); f=np.fft.fft2(rng.standard_normal(shape))
    fy=np.fft.fftfreq(shape[0])[:,None]; fx=np.fft.fftfreq(shape[1])[None,:]
    k=np.hypot(fx,fy); k[0,0]=1; n=np.real(np.fft.ifft2(f/k**beta)); return (n-n.mean())/n.std()
n1=fnoise(E.shape,1.7,7); n2=1-np.abs(fnoise(E.shape,1.5,11)); n2=(n2-n2.mean())/n2.std()
rough=110+np.clip(E,0,2500)*0.15
E=E+n1*rough*1.1+n2*rough*0.7
# land mask
g=pickle.load(open('geo.pkl','rb')); land=g['land10']
def toxy(c): return [((x-L0)/(L1-L0)*(W-1),(Y1-my(y))/(Y1-Y0)*(H-1)) for x,y in c]
SS=2
m=Image.new('L',(W*SS,H*SS),0); dr=ImageDraw.Draw(m)
polys=list(land.geoms) if land.geom_type=='MultiPolygon' else [land]
for p in polys:
    dr.polygon([(x*SS,y*SS) for x,y in toxy(p.exterior.coords)],fill=255)
    for r in p.interiors: dr.polygon([(x*SS,y*SS) for x,y in toxy(r.coords)],fill=0)
lakes=json.load(open('geo_tmp.json'))['out']['lakes']
for l in lakes:
    gg=l['g']; cs=gg['coordinates'] if gg['type']=='Polygon' else [c for mp in gg['coordinates'] for c in mp][:1]
    ps=[gg['coordinates']] if gg['type']=='Polygon' else gg['coordinates']
    for poly in ps: dr.polygon([(x*SS,y*SS) for x,y in toxy(poly[0])],fill=0)
m=m.resize((W,H),Image.LANCZOS); mask=np.asarray(m)/255.0
# hillshade
gy,gx=np.gradient(E, 650.0)
z=1.9; az=math.radians(315); alt=math.radians(48)
slope=np.arctan(z*np.hypot(gx,gy)); aspect=np.arctan2(gy,-gx)
hs=np.sin(alt)*np.cos(slope)+np.cos(alt)*np.sin(slope)*np.cos(az-np.pi/2-aspect)
hs=np.clip(hs,0,1); flat=math.sin(alt); sh=(hs-flat)
# vellum colours
paper=np.array([231,218,186.]); 
grain=fnoise(E.shape,0.6,3)*1.6+fnoise(E.shape,1.6,5)*5.0
land_rgb=np.zeros(E.shape+(3,))
# hypsometric tint: lowlands slightly greener, highlands warmer, desert paler
dry=np.clip((31.6-lat)/1.2,0,1)*0.8+np.clip((lon-35.9)/0.8,0,1)*0.7; dry=np.clip(dry,0,1)
low=np.array([222,214,176.]); high=np.array([226,203,160.]); des=np.array([236,221,184.])
t=np.clip(E/1400,0,1)[...,None]
base=low*(1-t)+high*t; base=base*(1-dry[...,None])+des*dry[...,None]
shade=np.where(sh<0, sh*1.55, sh*0.75)[...,None]
land_rgb=base*(1+shade*0.95)+grain[...,None]
# below sea level tint
bsl=np.clip(-E/350,0,1)[...,None]; land_rgb=land_rgb*(1-bsl*0.10)+np.array([150,160,140.])*bsl*0.10
# sea
from scipy import ndimage
dist=ndimage.distance_transform_edt(mask<0.5)
sea=np.array([196,208,198.]); deep=np.array([176,194,190.])
td=np.clip(dist/260,0,1)[...,None]
sea_rgb=sea*(1-td)+deep*td
# engraved waterlines near the coast
for k,(r,a) in enumerate([(5,0.20),(11,0.13),(18,0.08),(26,0.05)]):
    band=np.exp(-((dist-r)/1.3)**2)[...,None]; sea_rgb=sea_rgb*(1-band*a)+np.array([92,112,116.])*band*a
sea_rgb=sea_rgb+grain[...,None]*0.8
img=land_rgb*mask[...,None]+sea_rgb*(1-mask[...,None])
# feather edges to flat tones
FL=np.array([228,216,184.]); FS=np.array([176,194,190.])
flatimg=FL*mask[...,None]+FS*(1-mask[...,None])
yy,xx=np.mgrid[0:H,0:W]; e=np.minimum.reduce([xx,yy,W-1-xx,H-1-yy]); f=np.clip(e/90,0,1)[...,None]
img=img*f+flatimg*(1-f)
Image.fromarray(np.clip(img,0,255).astype('uint8')).save('relief.jpg',quality=74,optimize=True,progressive=True)
Image.fromarray(np.clip(img,0,255).astype('uint8')).resize((W//3,H//3)).save('relief_preview.png')
import os; print(W,H,os.path.getsize('relief.jpg'), 'merc',Y0,Y1)
