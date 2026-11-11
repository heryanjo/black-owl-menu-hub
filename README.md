# Black Owl — Menu Hub

Katalog menu untuk enam outlet dengan tampilan biru dan lime yang mengikuti referensi.

## Jalankan

Memerlukan Node.js 24 atau yang lebih baru. Aplikasi dan pengujian dapat berjalan tanpa menginstal dependency.

```sh
npm run build
npm test
npm start
```

Buka http://127.0.0.1:4173. Data lokal tersimpan di `.sites-runtime/menu.sqlite`, jadi perubahan tetap ada setelah server dimatikan. Untuk melihat dari perangkat berbeda, deploy Worker dengan database D1 bersama. Jangan membagikan file SQLite untuk pengeditan serentak.

## Fitur

- Kartu foto dengan nama, kategori, deskripsi, harga, status, dan outlet.
- Pencarian, filter outlet/kategori/status/subkategori, pengurutan, serta tampilan Card, daftar, dan Sheet.
- Detail menu bertautan langsung melalui `#menu/<id>`.
- Tambah dan edit menu; perubahan dicatat dengan nilai sebelum/sesudah dan catatan.
- Pengumuman perubahan otomatis berakhir setelah 7 hari. Riwayat tetap tersimpan.
- Tabel perubahan dengan tautan menu dan export CSV.
- Nama enam outlet asli, dapat diubah.
- Pemeriksaan konflik agar perubahan tim tidak saling menimpa.
- Pembaruan data saat halaman terbuka setiap 60 detik.

## Data awal dan foto

Data diimpor dari https://menu.blackowl.id/ pada 27 Oktober 2026. Saat ini ada 932 kombinasi menu/harga (termasuk 105 Wine dan 450 Spirits); nama menu yang sama dapat memiliki harga berbeda pada outlet berbeda. Foto terverifikasi sudah tersedia untuk 810 record, menggunakan 465 gambar WebP lokal; 122 record belum memiliki foto yang cocok. Menu lain menampilkan placeholder dan dapat dilengkapi lewat form edit. Beberapa deskripsi ringkas masih perlu dilengkapi tim. Foto terverifikasi disimpan bersama website, sedangkan font dimuat dari sumber eksternal. Kredit foto ada di detail menu. Foto botol referensi diberi keterangan bahwa label/vintage dapat berbeda.

Snapshot ini bukan sinkronisasi langsung dengan situs sumber. Harga dan penempatan outlet mengikuti halaman yang diambil saat impor dan tetap perlu ditinjau sebelum penggunaan operasional. Bukti sumber disimpan di `data/sources/`, metadata di `source-info.json`.

Untuk impor ulang sebelum database pertama kali digunakan:

```sh
npm run import:source
npm run build
```

Wine dan Spirits diimpor secara aditif dengan penanda versi terpisah: tidak menimpa revisi, harga, atau riwayat menu yang sudah ada. Pilihan Bottle, Glass, dan paket promo menjadi record berbeda. Impor awal tidak menambahkan riwayat revisi palsu. Database yang sudah digunakan tidak ditimpa oleh perubahan `seed.json`.

## Pratinjau mandiri

`npm run preview:standalone` membuat HTML yang dapat dibuka langsung. Pada pratinjau ini, edit hanya simulasi dalam memori dan hilang saat reload. Aplikasi server tetap menggunakan database bersama, bukan browser storage.

## Hosting

Identitas Sites tersimpan di `.openai/hosting.json`. Site memakai halaman login email + PIN untuk membatasi akses katalog kepada anggota terdaftar. Jangan membuat Site baru untuk melanjutkan publikasi.

Build Worker ada di `dist/server/index.js`. Sertakan `.openai/hosting.json` dan `drizzle/` dalam arsip deployment. Migrasi awal disiapkan manual sesuai `db/schema.js` karena dependency Drizzle tidak tersedia di lingkungan ini. Setelah migrasi diterapkan, pertahankan file tersebut dan gunakan migrasi lanjutan untuk perubahan schema.

Pengujian server, logika tampilan, seluruh aset foto, dan backfill tanpa menimpa foto milik tim lulus. Pengujian browser visual belum dilakukan karena sandbox menolak server preview lokal.

Pembaruan foto untuk database yang sudah berjalan memakai `data/photo-backfill.json` dan penanda `verified_photos_2026_10_28_v1`. Hanya URL foto awal atau kolom kosong dengan nama menu yang sama yang dilengkapi; foto milik tim dan revisi lain dipertahankan. Daftar foto yang masih perlu disediakan ada di `data/sources/photo-remaining.csv`.

## Admin Control dan login anggota

Akses katalog menggunakan email + PIN yang didaftarkan oleh superadmin. Halaman login dapat dibuka lewat link; menu, foto, dan seluruh API data memerlukan sesi yang sah. Peran diperiksa kembali oleh server pada setiap permintaan:

- Superadmin: mengelola anggota, peran, PIN, dan seluruh katalog.
- Editor: menambah/mengedit menu dan informasi outlet; tidak mengelola anggota.
- Viewer: melihat katalog, detail, dan riwayat, tanpa izin menulis.

Admin Control mendukung tambah anggota, ubah peran, nonaktifkan/aktifkan akun, serta reset PIN. Perubahan email/PIN/peran/status membatalkan sesi lama. Akun superadmin sendiri dilindungi dari penonaktifan atau penurunan peran. Pembaruan bersamaan tetap menjaga minimal satu superadmin aktif.

PIN disimpan sebagai hash PBKDF2-SHA256 dengan salt acak, bukan PIN mentah. Sesi berakhir setelah 8 jam dan menggunakan cookie HttpOnly, Secure pada HTTPS, dan SameSite=Strict. Token sesi hanya disimpan sebagai hash di database. Kegagalan login dibatasi per akun dan alamat jaringan selama 15 menit. Respons anggota tidak mengandung hash/salt PIN.

Bootstrap superadmin hanya dijalankan satu kali. Runtime server memerlukan `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_PIN_HASH`, dan `BOOTSTRAP_PIN_SALT` melalui secret environment Sites (atau environment lokal untuk pengembangan). Jangan memasukkan nilai tersebut ke source, frontend, atau hosting manifest. Mengganti runtime bootstrap tidak mereset akun yang sudah terbentuk.

Migrasi tambahan: `drizzle/0001_member_access.sql`. Migrasi pertama dan database menu yang ada tetap dipertahankan. Jalankan build sebelum test; pengujian menggunakan akun fixture terpisah, tanpa kredensial produksi.

## Subkategori menu

Kelompok dari halaman dining, beverages, wine, dan spirits enam outlet disimpan di `data/subcategories.json` dan `taxonomy.js`. Audit sumber ada di `data/sources/subcategories-source.json`; bukti snapshot sebelumnya dipakai untuk entri lama yang masih dipertahankan. Label promo sesuai sumber, termasuk PROMO 888.888 dan PROMO 988.888 yang dibedakan.

Kolom `menus.subcategory` bersifat opsional dengan default string kosong, ditambahkan melalui migrasi schema-only `0002_menu_subcategory.sql`. Backfill hanya mengisi entri sumber yang nama/kategorinya masih sama dan subkategorinya kosong; tidak menimpa harga, foto, deskripsi, atau pilihan subkategori yang sudah ada. Penanda impor memastikan pilihan yang dikosongkan oleh editor tidak diisi ulang.

Form tambah/edit menampilkan dropdown subkategori yang mengikuti kategori utama, menyediakan Tanpa subkategori, dan mengosongkan pilihan lama saat kategori berganti. Server memvalidasi pasangan kategori/subkategori; perubahan manual dicatat dengan nilai sebelum/sesudah di riwayat. Filter subkategori tampil setelah kategori utama dipilih.

Untuk memperbarui audit dari sumber: `python3 scripts/collect-subcategories.py`. Untuk memproses ulang snapshot tanpa akses jaringan: tambahkan `--from-snapshot`. Tinjau hasil dan backfill sebelum publikasi; jangan memakai penanda impor lama untuk menimpa pilihan pengguna.


## Menu Sheet

Buka `#sheet` atau tombol Sheet di katalog. Halaman ini menggunakan `/api/data` dan `/api/menus/:id` yang sama dengan Card, dengan foto mini, kolom tetap saat digeser, dan pilihan 25/50/100 baris per halaman. Pencarian, filter, dan pengurutan berlaku pada kedua tampilan.

Editor/superadmin dapat klik sel untuk mengedit nama, kategori, subkategori, harga, status, atau deskripsi. Isi catatan perubahan, lalu Simpan baris. Foto dan outlet diubah melalui tombol edit lengkap pada baris. Viewer hanya melihat data. Subkategori mengikuti kategori utama; perubahan kategori mengosongkan pilihan lama.

Perubahan langsung tersimpan di database bersama, tampak di Card dan Sheet, serta tercatat di riwayat dan banner tujuh hari. Pengguna lain menerima penyegaran otomatis setiap 60 detik. Selama satu baris diedit, penyegaran data dan filter ditahan agar draft tidak hilang. Penulisan menggunakan versi `updatedAt` awal untuk menolak konflik dengan revisi anggota lain; draft tidak dibuang saat penyimpanan gagal. Tidak ada migrasi atau penyalinan database untuk tampilan Sheet.

`node scripts/test-sheet.mjs` menguji sinkronisasi dua arah melalui handler UI dan database lokal, termasuk konflik, riwayat, subkategori, pagination, izin Viewer, dan pembersihan saat keluar.
