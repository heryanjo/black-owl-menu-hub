import json,re,hashlib,subprocess,io
from pathlib import Path
from PIL import Image,ImageOps
seed=json.load(open('seed.json'));previous={m['id']:m for m in json.load(open('data/sources/pre-photo-seed.json'))}
assets=json.load(open('data/photo-assets.json'));credits=json.load(open('data/photo-credits.json'));backfill=json.load(open('data/photo-backfill.json'));byid={m['id']:m for m in backfill}
approved=['Avocean Tacos','Calamari Crunch','Cartilage With Garlic Aioli','Truffle Chips & Sausages']
for r in json.load(open('data/sources/remaining-blackowl-photo-search.json')):
 if r['name'] not in approved:continue
 url=re.search(r'^Image URL:\s*(https://\S+?)(?:#|\s|$)',r['result'],re.M)[1];page=re.search(r'\((https://[^\s]+)\)',r['result'])[1]
 path=Path('data/photos')/(hashlib.sha256(url.encode()).hexdigest()[:20]+'.webp')
 try:
  raw=subprocess.check_output(['curl','-fsSL','--max-time','20',url],stderr=subprocess.PIPE);im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB');im.thumbnail((420,630));im.save(path,'WEBP',quality=67,method=5)
 except Exception:print('Unavailable source photo:',r['name']);continue
 image='/photos/'+path.name
 if not any(a['path']==image for a in assets):assets.append({'path':image,'file':str(path),'size':path.stat().st_size})
 credits[image]={'sourceUrl':page,'kind':'blackowl-menu'}
 for m in seed:
  if m['name']==r['name']:
   m['image']=image;byid[m['id']]={'id':m['id'],'name':m['name'],'oldImage':previous[m['id']]['image'],'image':image}
 print('Added verified Black Owl photo:',r['name'])
for p,value in [('seed.json',seed),('data/photo-assets.json',assets),('data/photo-credits.json',credits),('data/photo-backfill.json',list(byid.values()))]:Path(p).write_text(json.dumps(value,ensure_ascii=False,indent=2))
Path('data/sources/photo-remaining.json').write_text(json.dumps([{'id':m['id'],'name':m['name'],'category':m['category']} for m in seed if not m['image']],ensure_ascii=False,indent=2))
print('Final photo coverage:',sum(bool(m['image']) for m in seed),'/',len(seed))
