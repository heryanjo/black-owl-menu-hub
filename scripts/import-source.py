import json,re,hashlib,os
pages=json.load(open('data/sources/source-pages.json'))
items={}
for page in pages:
 chunks=re.split(r'\n-{20,}\n',page['text'])
 for chunk in chunks:
  kind='Minuman' if 'BEVERAGES -' in chunk else 'Makanan'
  lines=[]
  for line in chunk.splitlines():
   m=re.match(r'L\d+:\s*(.*)',line)
   if m:
    line=re.sub(r'【[^】]*】','',m.group(1)).strip()
    if line:lines.append(line)
  for i,line in enumerate(lines):
   price=re.match(r'^(\d[\d.]*)K$',line,re.I)
   if not price or i==0:continue
   name=lines[i-1]
   if name in ['HALF','FULL','RIBEYE','TENDERLOIN','Bottle','BOTTLE','GLASS','Hot / Iced','HOT / ICED','Hot / Iced','HOT','HOT / ICED','/100G','Striploin','Ribeye','TEA BAG','LOOSE TEA']:continue
   if re.match(r'^\d',name):continue
   key=(name.lower(),int(price.group(1).replace('.',''))*1000)
   if key not in items:
    cat='Dessert' if any(x in name.lower() for x in ['tartine','mousse','brûlée','profiterol','tiram','crepes','lava cake','hidden paradise','lost forest','fruit platter','popsicle']) else kind
    items[key]={'id':'bo-'+hashlib.sha1((key[0]+str(key[1])).encode()).hexdigest()[:12],'name':name.title(),'category':cat,'description':'','price':key[1],'image':'','status':'Aktif','outlets':[]}
   if page['id'] not in items[key]['outlets']:items[key]['outlets'].append(page['id'])
photos=json.load(open('data/sources/photos.json')) if os.path.isfile('data/sources/photos.json') else []
known={'Kungpao Chicken':'Ayam kungpao dari koleksi menu Black Owl, dengan karakter rasa gurih dan pedas.','Quattro Fungi Pasta':'Pasta dengan pilihan jamur, untuk pencinta sajian yang gurih.','Black Squid Ink Rice':'Sajian nasi tinta cumi dari koleksi Rice Me Up.','King Prawn And Olio':'Pasta aglio olio dengan king prawn dari koleksi Slurp & Twirl.','Matcha Latte':'Racikan matcha dan susu dari Matcha Series Black Owl.','Iced Matcha':'Sajian matcha dingin dari Matcha Series Black Owl.','Ice Coffee Matcha':'Perpaduan kopi dan matcha, disajikan dingin.','Bone Marrow Wagyu Soto':'Soto dengan potongan wagyu dan bone marrow, ditemani pelengkap khasnya.','Barramundi Sauce Nyonya':'Sajian barramundi dengan saus Nyonya dari koleksi Rice Me Up.','Midnight Garlic Bread':'Roti bawang putih untuk melengkapi pilihan sajian Black Owl.','Hidden Paradise':'Pilihan dessert khas Black Owl dari koleksi Happily Ever After.','Lost Forest':'Sajian penutup Black Owl dari koleksi Happily Ever After.','Surf \'N Turf':'Kombinasi daging sapi dan lobster dengan pelengkap dalam satu sajian.'}

for item in items.values():
 normalized=re.sub('[^a-z0-9]','',item['name'].lower())
 match=next((p for p in photos if re.sub('[^a-z0-9]','',p['name'].lower())==normalized),None)
 if match:item['image']=match['image']
 item['description']=(match or {}).get('description') or {'Makanan':'Sajian pilihan Black Owl. Detail resep dan penyajian dapat dilengkapi oleh tim.','Minuman':'Racikan minuman Black Owl. Detail bahan dan penyajian dapat dilengkapi oleh tim.','Dessert':'Pilihan manis dari Black Owl. Detail bahan dan penyajian dapat dilengkapi oleh tim.'}[item['category']]
for item in items.values():
 if item['name'] in known: item['description']=known[item['name']]
# Keep a useful first collection and preserve original source extracts for extending it.
selected=sorted(items.values(),key=lambda m:(not bool(m['image']),m['name']))
json.dump(selected,open('seed.json','w'),ensure_ascii=False,indent=2)
json.dump({'source':'https://menu.blackowl.id/','importedAt':'2026-10-27','note':'Nama dan harga diambil dari menu sumber per outlet. Deskripsi ringkas disusun untuk katalog dan perlu dilengkapi tim. Foto menggunakan URL sumber; dapat berubah di situs asli. Ketersediaan berdasarkan halaman outlet saat impor, bukan sinkronisasi langsung.','outlets':[{k:p[k] for k in ['id','name','code']} for p in pages]},open('source-info.json','w'),ensure_ascii=False,indent=2)
print(f'Imported {len(selected)} menu/price records across {len(pages)} outlets; {sum(bool(m["image"]) for m in selected)} have matching source images.')
