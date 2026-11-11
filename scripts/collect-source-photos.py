import json,re,html,unicodedata,hashlib,concurrent.futures,urllib.request,time,subprocess
from html.parser import HTMLParser
from pathlib import Path
BASE='https://menu.blackowl.id'
codes=['blackowl_pik','blackowl_kg','serpong','surabaya','medan','scbd']
class Images(HTMLParser):
 def __init__(self):super().__init__();self.names={}
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='img' and a.get('id','').startswith('menu-item-'):self.names[a['id'][10:]]=re.sub(r'^Image\s*','',a.get('alt',''))
def norm(s):
 s=re.sub(r'\s*—.*$','',s);s=re.sub(r'\bSOLD\s*OUT\b','',s,flags=re.I)
 return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def fetch(job):
 outlet,cat,slug=job;url=f'{BASE}/menu/{cat}/{slug}?area=floor&outlet={codes[outlet-1]}'
 for attempt in range(3):
  try:
   data=subprocess.check_output(['curl','-fsSL','--max-time','40',url],stderr=subprocess.PIPE).decode();break
  except Exception:
   if attempt==2:raise
 parser=Images();parser.feed(data)
 m=re.search(r'let arr_img_menu_item\s*=\s*(\[.*?\]);',data,re.S)
 if not m:return []
 category={1:'Makanan',2:'Minuman',4:'Wine',5:'Spirits'}[cat]
 photos=[{'name':parser.names.get(str(p['menu_item_id']),''),'image':p['img_resize'],'outlet':outlet,'category':category,'sourceUrl':url} for p in json.loads(m[1]) if p.get('img_resize') and parser.names.get(str(p['menu_item_id']))]
 print(codes[outlet-1],slug,len(photos),flush=True)
 return photos
jobs=[(o,c,s) for o in range(1,7) for c,s in [(1,'dining'),(2,'beverages'),(4,'wine'),(5,'spirits')]]
photos=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for j,result in zip(jobs,pool.map(fetch,jobs)):photos.extend(result)
Path('data/sources/full-photo-catalog.json').write_text(json.dumps(photos,ensure_ascii=False,indent=2))
seed=json.load(open('seed.json'));matches=[];missing=[]
for menu in seed:
 cat='Makanan' if menu['category']=='Dessert' else menu['category']
 candidates=[p for p in photos if p['category']==cat and norm(p['name'])==norm(menu['name'])]
 preferred=next((p for p in candidates if p['outlet'] in menu['outlets']),next(iter(candidates),None))
 if preferred:matches.append({'menuId':menu['id'],'name':menu['name'],'previousImage':menu['image'],'image':preferred['image'],'sourceUrl':preferred['sourceUrl']})
 else:missing.append({'name':menu['name'],'category':menu['category'],'image':menu['image']})
Path('data/sources/photo-matches.json').write_text(json.dumps(matches,ensure_ascii=False,indent=2))
Path('data/sources/photos-unmatched.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2))
print('Matched',len(matches),'of',len(seed),'Unmatched',len(missing),'Unique URLs',len(set(p['image'] for p in matches)),flush=True)
