import json,re,hashlib,unicodedata,subprocess,concurrent.futures,datetime,sys
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter,defaultdict
class Node:
 def __init__(self,tag='',attrs=()):self.tag=tag;self.attrs=dict(attrs);self.children=[]
 def has(self,c):return c in self.attrs.get('class','').split()
 def walk(self):
  yield self
  for child in self.children:
   if isinstance(child,Node):yield from child.walk()
 def find(self,c):return next((n for n in self.walk() if n.has(c)),None)
 def text(self):return re.sub(r'\s+',' ',''.join(x.text()+' ' if isinstance(x,Node) else x for x in self.children)).strip()
class DOM(HTMLParser):
 def __init__(self):super().__init__();self.root=Node('root');self.stack=[self.root]
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs);self.stack[-1].children.append(n)
  if tag not in ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']:self.stack.append(n)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag:self.stack=self.stack[:i];break
 def handle_data(self,data):self.stack[-1].children.append(data)
def text(n):return n.text() if n else ''
def norm(s):
 s=re.sub(r'SOLD\s*OUT\b','',s,flags=re.I)
 return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def prices(n):
 result=[]
 for amount,k in re.findall(r'(?<![\w.])(\d[\d.]*)(K)?\b',text(n),re.I):
  number=int(amount.replace('.',''))*(1000 if k else 1)
  if number>=5000:result.append(number)
 return result
codes=['blackowl_pik','blackowl_kg','serpong','surabaya','medan','scbd']
def fetch(job):
 outlet,cat,slug=job;url=f'https://menu.blackowl.id/menu/{cat}/{slug}?area=floor&outlet={codes[outlet-1]}'
 for attempt in range(3):
  try:raw=subprocess.check_output(['curl','-fsSL','--max-time','40',url],stderr=subprocess.PIPE).decode();break
  except Exception:
   if attempt==2:raise
 d=DOM();d.feed(raw);groups=[]
 for group in (n for n in d.root.walk() if n.has('col-menu')):
  heading=text(group.find('col-title')).upper();items=[]
  for item in (n for n in group.walk() if n.has('col-grid') or n.has('col-list')):
   main=item.find('box-main') if item.has('col-list') else item.find('box-name')
   name=text(main.find('title')) if main else ''
   if name:
    for p in prices(main.find('price')):items.append({'name':name,'price':p,'unit':''})
   for box in (n for n in item.walk() if n.has('box-type') or n.has('box-price')):
    title=text(box.find('title'));amounts=prices(box.find('price'))
    unit=title.title() if norm(title) in ['bottle','glass','double','triple','regular','half','full','100g'] else ''
    aliases=[name] if unit else list(dict.fromkeys([title,name] if title else [name]))
    for alias in aliases:
     if not alias:continue
     for p in amounts:items.append({'name':alias,'price':p,'unit':unit})
  if items:groups.append({'subcategory':heading,'items':items})
 print(codes[outlet-1],slug,len(groups),sum(len(g['items']) for g in groups),flush=True)
 return {'outlet':outlet,'category':{1:'Makanan',2:'Minuman',4:'Wine',5:'Spirits'}[cat],'sourceUrl':url,'groups':groups}
jobs=[(o,c,s) for o in range(1,7) for c,s in [(1,'dining'),(2,'beverages'),(4,'wine'),(5,'spirits')]]
if '--from-snapshot' in sys.argv:pages=json.load(open('data/sources/subcategories-source.json'))['pages']
else:
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:pages=list(pool.map(fetch,jobs))
 Path('data/sources/subcategories-source.json').write_text(json.dumps({'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pages':pages},ensure_ascii=False,indent=2))
seed=json.load(open('seed.json'));catalog={c:[] for c in ['Makanan','Minuman','Dessert','Wine','Spirits']};canonical={c:{} for c in catalog}
def register(category,heading):
 if not heading:return ''
 key=norm(heading)
 if key not in canonical[category]:canonical[category][key]=heading;catalog[category].append(heading)
 return canonical[category][key]
for p in pages:
 for g in p['groups']:
  parent='Dessert' if p['category']=='Makanan' and re.search(r'HAPPILY|DESSERT|SWEET',g['subcategory']) else p['category']
  register(parent,g['subcategory'])
rows=[]
for p in pages:
 for g in p['groups']:
  for item in g['items']:rows.append({**item,'category':p['category'],'outlet':p['outlet'],'subcategory':g['subcategory'],'sourceUrl':p['sourceUrl']})
# Preserve grouping evidence for older menu entries retained in the app.
legacy={}
headings={h for values in catalog.values() for h in values}|{'PAIR FOR YOUR DRINK'}
for page in json.load(open('data/sources/source-pages.json')):
 for chunk in re.split(r'\n-{20,}\n',page['text']):
  if 'DINING -' not in chunk and 'BEVERAGES -' not in chunk:continue
  lines=[re.sub(r'【[^】]*】','',m[1]).strip() for l in chunk.splitlines() if (m:=re.match(r'L\d+:\s*(.*)',l))]
  lines=[l for l in lines if l];section=''
  for i,line in enumerate(lines):
   if line.upper() in headings:section=line.upper()
   price=re.fullmatch(r'(\d[\d.]*)K',line,re.I)
   if price and i and section:
    name=lines[i-1];amount=int(price[1].replace('.',''))*1000
    id='bo-'+hashlib.sha1((name.lower()+str(amount)).encode()).hexdigest()[:12]
    legacy.setdefault(id,{'subcategory':section,'sourceUrl':'https://menu.blackowl.id/','evidence':'original-source-snapshot'})
for item in json.load(open('data/sources/wine-spirits-import.json')):
 section=item['description'].split(' · ')[0].upper()
 if any(norm(section)==norm(h) for h in catalog.get(item['category'],[])):
  legacy[item['id']]={'subcategory':section,'sourceUrl':'https://menu.blackowl.id/','evidence':'original-wine-spirits-snapshot'}
backfill=[];unmatched=[];conflicts=[]
for menu in seed:
 name=menu['name'].split(' — ')[0];unit=menu['name'].split(' — ')[1].split(' (')[0] if ' — ' in menu['name'] else ''
 parent='Makanan' if menu['category']=='Dessert' else menu['category']
 candidates=[r for r in rows if r['category']==parent and r['outlet'] in menu['outlets'] and norm(r['name'])==norm(name) and r['price']==menu['price'] and (not unit or unit=='Paket' or not r['unit'] or norm(r['unit'])==norm(unit))]
 # Never infer a different promo tier from product name alone.
 if not candidates:
  candidates=[r for r in rows if r['category']==parent and r['outlet'] in menu['outlets'] and norm(r['name'])==norm(name) and not re.search(r'^PROMO\s+\d',r['subcategory'])]
  if len(set(norm(r['subcategory']) for r in candidates))!=1:candidates=[]
 if candidates:
  counts=Counter(norm(r['subcategory']) for r in candidates);key=counts.most_common(1)[0][0];best=next(r for r in candidates if norm(r['subcategory'])==key)
  sub=register(menu['category'],best['subcategory']);menu['subcategory']=sub
  backfill.append({'id':menu['id'],'name':menu['name'],'category':menu['category'],'subcategory':sub,'sourceUrl':best['sourceUrl']})
  if len(counts)>1:conflicts.append({'id':menu['id'],'name':menu['name'],'selected':sub,'sourceOptions':sorted(set(r['subcategory'] for r in candidates))})
 elif menu['id'] in legacy:
  evidence=legacy[menu['id']];sub=register(menu['category'],evidence['subcategory']);menu['subcategory']=sub;backfill.append({'id':menu['id'],'name':menu['name'],'category':menu['category'],**evidence,'subcategory':sub})
 else:menu['subcategory']='';unmatched.append({'id':menu['id'],'name':menu['name'],'category':menu['category']})
Path('seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2))
Path('data/subcategories.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2))
Path('data/subcategory-backfill.json').write_text(json.dumps(backfill,ensure_ascii=False,indent=2))
Path('data/sources/subcategories-review.json').write_text(json.dumps({'unmatched':unmatched,'differentOutletHeadings':conflicts},ensure_ascii=False,indent=2))
Path('taxonomy.js').write_text('export const subcategoryCatalog = '+json.dumps(catalog,ensure_ascii=False)+';\nexport const subcategoryBackfill = '+json.dumps(backfill,ensure_ascii=False)+';\n')
print('Matched',len(backfill),'/',len(seed),'Conflicting labels',len(conflicts),flush=True)
for k,v in catalog.items():print(k,v,flush=True)
