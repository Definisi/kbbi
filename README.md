# KBBI (Kamus Besar Bahasa Indonesia) - Data Lengkap

Data lengkap **Kamus Besar Bahasa Indonesia (KBBI)** Edisi VI yang diekstrak dari aplikasi resmi KBBI Kemendikdasmen versi 6.1.0.

**194.692 entri** dengan definisi, contoh, kata turunan, gabungan kata, peribahasa, dan lainnya.

> Mau lihat data versi sebelumnya (6.0.2)? Cek branch [`v6.0.2`](https://github.com/Definisi/kbbi/tree/v6.0.2).

## Perubahan dari Versi 6.0.2

- Jumlah entri sama (194.692), tidak ada kata yang ditambah atau dihapus.
- Isi makna, contoh, kata turunan, gabungan kata, dan peribahasa tidak berubah.
- Ada label baru `sing` (singkatan) dengan code `34`. Sebagian besar label `kp` (kependekan) sekarang dipecah jadi `sing`.
  - Versi 6.0.2: 3.723 label `kp`
  - Versi 6.1.0: 285 label `kp` + 3.438 label `sing`
- Total 3.104 entri berubah labelnya, contoh `AABI`:
  - 6.0.2: `[n]  {Hub}  kp  Anemer Aspal dan Beton Indonesia`
  - 6.1.0: `[n]  {Hub}  sing  Anemer Aspal dan Beton Indonesia`
- `extract_v6.js` sudah diupdate untuk membaca code `34`. Extractor lama akan berhenti membaca entri saat ketemu code ini, jadi makna dari 3.104 entri tersebut akan hilang.

## Statistik Data

| Field | Jumlah |
|-------|--------|
| Total entri | 194.692 |
| Entri dengan makna/definisi | 193.869 |
| Entri dengan contoh penggunaan | 35.072 |
| Entri dengan kata turunan | 11.481 |
| Entri dengan gabungan kata | 10.187 |
| Entri dengan peribahasa | 1.407 |
| Entri dengan etimologi | 102 |
| Error | 0 |

## Format Data

File `kbbi_v6_data.json` berisi array of objects dengan struktur:

```json
{
  "kata": "rumah",
  "lema": ["ru.mah"],
  "makna": [
    "1. [n]  bangunan untuk tempat tinggal\n\n2. [n]  bangunan pada umumnya (seperti gedung)"
  ],
  "contoh": ["..."],
  "turunan": ["berumah", "perumahan", "..."],
  "gabungan_kata": ["rumah makan", "rumah sakit", "..."],
  "peribahasa": ["..."],
  "kiasan": ["..."],
  "varian": ["..."],
  "dasar": ["..."],
  "pelafalan": "...",
  "etimologi": "..."
}
```

### Penjelasan Field

| Field | Keterangan |
|-------|------------|
| `kata` | Kata kunci (headword) |
| `lema` | Lema dengan penanda suku kata (titik) dan homonim |
| `makna` | Definisi/arti. Prefix: `[n]` = nomina, `[v]` = verba, `[a]` = adjektiva, `[adv]` = adverbia, dll. `<It>` = bahasa asal, `{Olr}` = bidang ilmu |
| `contoh` | Contoh penggunaan dalam kalimat |
| `pelafalan` | Cara pelafalan |
| `etimologi` | Asal-usul kata |
| `turunan` | Kata turunan |
| `gabungan_kata` | Gabungan kata / frasa |
| `peribahasa` | Peribahasa terkait |
| `kiasan` | Ungkapan kiasan |
| `varian` | Varian kata |
| `dasar` | Kata dasar |

> Field yang kosong tidak disertakan dalam entri untuk menghemat ukuran file.

## Contoh Entri

### "tifosi"
```json
{
  "kata": "tifosi",
  "lema": ["ti.fo.si"],
  "makna": ["[n]  <It>  {Olr}  sebutan untuk pendukung fanatik klub olahraga, khususnya yang tergabung dalam tifo"]
}
```

### "cinta"
```json
{
  "kata": "cinta",
  "lema": ["cin.ta"],
  "makna": [
    "1. [a]  suka sekali; sayang benar\n\n2. [a]  kasih sekali; terpikat (antara laki-laki dan perempuan)\n\n3. [a]  ingin sekali; berharap sekali; rindu\n\n4. [a]  (kl)  susah hati (khawatir); risau"
  ]
}
```

## Cara Ekstraksi (Teknis)

Data ini diekstrak dari APK resmi KBBI Kemendikdasmen v6.1.0 melalui proses reverse engineering berikut:

### 1. Ekstrak APK

APK adalah file ZIP biasa. Ekstrak untuk mendapatkan `assets/` yang berisi data kamus:

```
assets/composeResources/.../files/dictdata/
  acu_nilai.txt      # Daftar kata (word list)
  acu_offlens.txt    # Offset & file number tiap entri
  acu_desc_0.s       # Data deskripsi terenkripsi (file 0-27)
  ...
  acu_desc_27.s
```

### 2. Decompile APK

Gunakan [jadx](https://github.com/skylot/jadx) untuk decompile APK ke source code Java:

```bash
# Download jadx
# https://github.com/skylot/jadx/releases

# Decompile
jadx -d output_dir kbbi.apk
```

Dari source code yang di-decompile, ditemukan:
- Enkripsi menggunakan **Salsa20** stream cipher
- Data dikompresi dengan **GZIP** setelah enkripsi
- Key 32 byte dan nonce 8 byte di-hardcode dalam aplikasi (di-obfuscate melalui hash computation)

### 3. Format Binary Kustom

Aplikasi menggunakan format binary kustom:

**ValueReader (Varint Encoding):**
- Byte `0-239`: nilai langsung
- Byte `254`: 1 byte berikutnya
- Byte `253`: 1 byte berikutnya | 256
- Byte `252`: 2 byte berikutnya (big-endian)
- Byte `251`: 2 byte berikutnya | 65536
- Byte `250`: 3 byte berikutnya (big-endian)

**acu_nilai.txt** (Word List):
```
[varint: jumlah kata]
[uint8: panjang kata 1][raw string: kata 1]
[uint8: panjang kata 2][raw string: kata 2]
...
```

**acu_offlens.txt** (Offsets):
```
[varint: jumlah entri]
Untuk setiap entri:
  [varint: delta offset]     # jika 65535 → file number baru, baca varint lagi
  File number disimpan di bit 24-31, offset di bit 0-23
```

**Entry Format (CAV - Code-Attribute-Value):**

Setiap entri adalah sequence byte codes:

| Code | Tipe Arg | Keterangan |
|------|----------|------------|
| 0 | string | Teks definisi |
| 1 | string | Lema |
| 2 | string | Pelafalan |
| 3 | string | Entri terkait |
| 4 | string | Etimologi |
| 5 | string | Lema (bold italic) |
| 10 | - | Penanda bagian: Varian |
| 11 | - | Penanda bagian: Dasar |
| 12 | - | Penanda bagian: Gabungan kata |
| 13 | - | Penanda bagian: Kata turunan |
| 14 | - | Penanda bagian: Peribahasa |
| 15 | - | Penanda bagian: Kiasan |
| 20 | string | Kelas kata |
| 21 | string | Bahasa asal |
| 22 | string | Bidang ilmu |
| 23 | string | Nama ilmiah |
| 24 | string | Rumus kimia |
| 25 | string | Ragam |
| 30 | - | Label: ki (kiasan) |
| 31 | - | Label: kp (kepanjangan) |
| 32 | - | Label: akr (akronim) |
| 33 | - | Label: ukp (ungkapan) |
| 34 | - | Label: sing (singkatan) |
| 40 | number | Rujukan (index ke word list) |
| 41 | number | Rujukan panah |
| 42 | string | Teks bold |
| 50 | string | Contoh penggunaan |
| 60 | string | Bold |
| 61 | string | Italic |
| 62 | string | Subscript |
| 63 | string | Superscript |
| 74 | string | Subscript berwarna |
| 255 | - | End of entry |

### 4. Pipeline Dekripsi

```
File .s (encrypted) → Salsa20 decrypt → GZIP decompress → Binary data → Parse CAV codes → JSON
```

### 5. Jalankan Extractor

```bash
npm install @stablelib/salsa20
node extract_v6.js
```

## Catatan Penting tentang Decompiler

Saat men-decompile dengan jadx, terdapat **bug decompiler** pada operasi Kotlin `hashCode().toLong() shl 31`. jadx menerjemahkan ini sebagai Java `hashCode() << 31` (operasi 32-bit), padahal seharusnya `((long) hashCode) << 31` (operasi 64-bit). Perbedaan ini menghasilkan key enkripsi yang salah. Perlu verifikasi dengan bytecode asli atau source code original untuk mendapatkan key yang benar.

## Privasi & Kontak

Data ini diekstrak dari aplikasi KBBI yang tersedia secara publik di Google Play Store untuk keperluan pendidikan dan penelitian.

Jika ada masalah terkait privasi, hak cipta, atau permintaan penghapusan, silakan hubungi:

**Email:** prasetyo.rahman@icloud.com

## Lisensi

Data kamus adalah milik **Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen Republik Indonesia**.

Script ekstraksi dalam repository ini disediakan apa adanya (*as-is*) untuk keperluan pendidikan dan penelitian.

## Kredit

- **KBBI**: Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI
- **Aplikasi KBBI**: [yuku](https://github.com/yukuku/kbbi4)
- **Decompiler**: [jadx](https://github.com/skylot/jadx)
- **Salsa20**: [@stablelib/salsa20](https://www.npmjs.com/package/@stablelib/salsa20) 
