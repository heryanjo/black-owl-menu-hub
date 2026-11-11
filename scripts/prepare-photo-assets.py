import json,re,hashlib,unicodedata,subprocess,concurrent.futures,io,os
from pathlib import Path
from PIL import Image,ImageOps
root=Path('data/photos');root.mkdir(exist_ok=True)
def norm(n):
 n=n.split(' — ')[0];n=re.sub(r'\s+(Twin|Triple|Double)\b','',n,flags=re.I)
 return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',n).encode('ascii','ignore').decode().lower())
results=json.load(open('data/sources/product-photo-results.json'))
reject={3,4,11,23,44,54,61,68,77,91,93,106,107,109,110,115,116,129}
external={}
def from_result(r):
 text=r.get('result','');url=re.search(r'^Image URL:\s*(https://\S+?)(?:#|\s|$)',text,re.M)
 page=re.search(r'\((https://[^\s]+)\)',text.split('Image URL:')[0])
 if not url:return None
 return {'image':url[1],'sourceUrl':page[1] if page else url[1],'kind':'product-reference'}
for i,r in enumerate(results):
 p=from_result(r)
 if i not in reject and p:external[(r['category'],norm(r['name']))]=p
retry=json.load(open('data/sources/product-photo-retries.json'))
rename={0:['Mignon Boulard Champagne Brut'],3:['Balvenie 14'],6:['Singleton 15'],7:['Hibiki Harmony'],9:['Black Jack','Black Jack Whisky'],11:['Maze Maze Cranberry'],12:['1800 Milenio'],13:['Glenlivet 25']}
for i,names in rename.items():
 p=from_result(retry[i])
 if p:
  for n in names:external[('Wine' if i==0 else 'Spirits',norm(n))]=p
# Source spelling variants of the same identified product.
for alias,target in [('Hennessy X0','Hennessy XO'),('John Jameson','Jameson'),('Martel Cordon Bleu','Martell Cordon Bleu'),('Maze Maze Gold Whisky','Maze Maze Gold')]:
 if ('Spirits',norm(target)) in external:external[('Spirits',norm(alias))]=external[('Spirits',norm(target))]
extra=json.load(open('data/sources/product-photo-extra.json'))
for i,r in enumerate(extra):
 if i in [3,4,8,9,10,11,12,19,21,24,25]:continue
 p=from_result(r)
 if p:external[(r['category'],norm(r['name']))]=p
for r in json.load(open('data/sources/product-photo-final.json')):
 p=from_result(r)
 if p:external[(r['category'],norm(r['name']))]=p
for i in [2,16,35,64,83]:
 r=results[i];blocks=[b.strip() for b in r['result'].split('--------------------------------------------------------------------------------') if b.strip()]
 if len(blocks)>1:
  p=from_result({'result':blocks[1]})
  if p:external[(r['category'],norm(r['name']))]=p
origin={m['menuId']:{**m,'kind':'blackowl-menu'} for m in json.load(open('data/sources/photo-matches.json'))}
seed=json.load(open('data/sources/pre-photo-seed.json'));plans=[]
for m in seed:
 p=origin.get(m['id']) or external.get((m['category'],norm(m['name'])))
 if not p and m['image']:p={'image':m['image'],'sourceUrl':'https://menu.blackowl.id/','kind':'blackowl-menu'}
 if p and p['image'] != 'https://www.petitceller.com/media/catalog/product/cache/7a3fa0484781d2636dd01e2eae40c92d/0/1/016b42647ee0ac21f5ec9d762fd6d1f61f2509c60ee6e59f770879bbfa8ff1a7.jpeg':plans.append({'id':m['id'],'name':m['name'],'previousImage':m['image'],**p})
# Remove source-only menuId key from merged source audit.
urls=sorted(set(p['image'] for p in plans));assets={};failures=[]
def download(url):
 key=hashlib.sha256(url.encode()).hexdigest()[:20];path=root/(key+'.webp')
 try:
  if not path.exists():
   raw=subprocess.check_output(['curl','-fsSL','--max-time','35','--max-filesize','15000000',url],stderr=subprocess.PIPE)
   im=Image.open(io.BytesIO(raw));im=ImageOps.exif_transpose(im);im.thumbnail((420,630))
   if im.width<40 or im.height<40:raise ValueError('Image too small')
   if im.mode not in ('RGB','RGBA'):im=im.convert('RGBA' if 'transparency' in im.info else 'RGB')
   im.save(path,'WEBP',quality=67,method=5)
  return url,{'path':'/photos/'+path.name,'file':str(path),'size':path.stat().st_size}
 except Exception as e:return url,{'error':type(e).__name__}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for i,(url,result) in enumerate(pool.map(download,urls)):
  if 'error' in result:failures.append({'image':url,**result})
  else:assets[url]=result
  if (i+1)%50==0:print('Verified and optimized',i+1,'/',len(urls),flush=True)
credits={};backfill=[];seedById={m['id']:m for m in seed}
for p in plans:
 asset=assets.get(p['image'])
 if not asset:continue
 credits[asset['path']]={'sourceUrl':p['sourceUrl'],'kind':p['kind']}
 m=seedById[p['id']];backfill.append({'id':m['id'],'name':m['name'],'oldImage':p['previousImage'],'image':asset['path']});m['image']=asset['path']
for m in seed:
 if m['image'] and not m['image'].startswith('/photos/'):
  backfill.append({'id':m['id'],'name':m['name'],'oldImage':m['image'],'image':''});m['image']=''
Path('data/photo-assets.json').write_text(json.dumps(list(assets.values()),indent=2))
Path('data/photo-credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2))
Path('data/photo-backfill.json').write_text(json.dumps(backfill,ensure_ascii=False,indent=2))
Path('data/sources/photo-download-failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2))
Path('data/sources/photo-remaining.json').write_text(json.dumps([{'id':m['id'],'name':m['name'],'category':m['category']} for m in seed if not m['image'].startswith('/photos/')],ensure_ascii=False,indent=2))
Path('seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2))
print('RESULT',len(backfill),'menu records;',len(assets),'verified local images;',sum(a['size'] for a in assets.values()),'bytes;',len(failures),'unavailable image URLs;',len(seed)-len(backfill),'records remain',flush=True)
