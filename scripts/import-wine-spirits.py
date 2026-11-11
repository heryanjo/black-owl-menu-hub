import json,re,hashlib
from pathlib import Path
pages=json.load(open('data/sources/wine-spirits-pages.json'))
for p in pages:
 if p['id']==5:p['text']+='\n'+'-'*30+'\n'+Path('data/sources/medan-wine.txt').read_text()
headings=set('PREMIUM CHAMPAGNE|BOTTLE PROMO|WINE OF THE MONTH|RED WINE|WHITE WINE|SPARKLING WINE & CHAMPAGNE|ICE WINE|PORT STYLE|PREMIUM BOTTLES|SPECIAL PACKAGE|VODKA & GIN PROMOTION|COGNAC PROMOTION|SINGLE MALT PROMOTION|TEQUILA PROMOTION|COGNAC|SINGLE MALT|TEQUILA|BLENDED|AMERICAN STYLE, JAPANESE & IRISH WHISKIES|VODKA|GIN|APERITIF & DIGESTIVE|RUM|WHISKY|PROMOTION'.split('|'))
countries=r'^(france|italy|spain|usa|argentina|germany|chili|chile|australia|aust|indonesia|canada|portugal|new zealand)(\b|,)'
rows=[]
for p in pages:
 for chunk in re.split(r'\n-{20,}\n',p['text']):
  if 'WINE -' not in chunk and 'SPIRITS -' not in chunk:continue
  cat='Wine' if 'WINE -' in chunk else 'Spirits'
  lines=[]
  for l in chunk.splitlines():
   m=re.match(r'L\d+:\s*(.*)',l)
   if m:
    v=m[1].strip()
    if 'SOLDOUT' in v:v='SOLD OUT'
    v=re.sub(r'【[^】]*】','',v).replace('❄','').replace('\ufe0f','').strip()
    if v:lines.append(v)
  section='';buf=[];last_name='';last_desc='';last_status='Aktif';last_row=None
  for v in lines:
   if v.upper() in headings or re.match(r'^PROMO\s+[\d.]',v,re.I):
    section=v;buf=[];last_name='';continue
   if v=='SOLD OUT':
    if last_row:last_row['status']='Tidak tersedia'
    continue
   price=re.fullmatch(r'(\d[\d.]*)(K)?',v,re.I)
   if not price:buf.append(v);continue
   raw=[x for x in buf if x.upper() not in ['BOTTLE','GLASS','DOUBLE','TRIPLE','REGULAR']]
   unit=next((x.title() for x in reversed(buf) if x.upper() in ['BOTTLE','GLASS','DOUBLE','TRIPLE','REGULAR']), 'Paket' if 'PROMO' in section.upper() or 'PACKAGE' in section.upper() else 'Bottle')
   desc=''
   if raw:
    if re.match(countries,raw[-1],re.I):
     desc=raw[-1];raw=raw[:-1]
    if not raw:buf=[];continue
    name=raw[-1];status='Tidak tersedia' if re.search(r'SOLD\s*OUT',name,re.I) else 'Aktif';name=re.sub(r'\s*SOLD\s*OUT','',name,flags=re.I).strip()
    last_name,last_desc,last_status=name,desc,status
   else:name,desc,status=last_name,last_desc,last_status
   buf=[]
   if not name:continue
   amount=int(price[1].replace('.',''))*(1000 if price[2] else 1)
   if amount<10000:continue
   promo='Promo' if 'PROMO' in section.upper() or 'PACKAGE' in section.upper() else ''
   label=f'{name} — {unit}'+(' (Promo)' if promo else '')
   item={'name':label,'category':cat,'description':f'{section.title()} · {unit}'+(f'. {desc}' if desc else '')+'. Harga mengikuti menu sumber outlet.','price':amount,'image':'','status':status,'outlets':[p['id']]}
   rows.append(item);last_row=item
items={}
for item in rows:
 key=(item['category'],item['name'].casefold(),item['price'],item['status'])
 if key not in items:
  item['id']='ws-'+hashlib.sha1('|'.join(map(str,key)).encode()).hexdigest()[:16];items[key]=item
 else:items[key]['outlets']=sorted(set(items[key]['outlets']+item['outlets']))
seed=[m for m in json.load(open('seed.json')) if m['category'] not in ['Wine','Spirits']]+list(items.values())
json.dump(seed,open('seed.json','w'),ensure_ascii=False,indent=2)
json.dump(list(items.values()),open('data/sources/wine-spirits-import.json','w'),ensure_ascii=False,indent=2)
print({c:sum(m['category']==c for m in items.values()) for c in ['Wine','Spirits']})
for c in ['Wine','Spirits']:
 print(c,[(x['name'],x['price'],x['outlets']) for x in items.values() if x['category']==c][:8])
