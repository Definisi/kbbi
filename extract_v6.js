const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const { streamXOR } = require("@stablelib/salsa20");

const DICTDATA = path.join(__dirname, "apk_v6/assets/composeResources/kbbi6.composeapp.generated.resources/files/dictdata");

// ==================== Key ====================
function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++)
    b[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return b;
}

const KEY = hexToBytes(
  "ffef8a8d11f535b73cd24fd31ef296d0573ade68b1f079cbdea460149ed4036e"
);
const NONCE = hexToBytes("fa1f5b7694c268fc");

// ==================== ValueReader ====================
class ValueReader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  readUint8() { return this.buf[this.pos++]; }
  readVarint() {
    const b = this.buf[this.pos++];
    if (b < 240) return b;
    if (b === 254) return this.buf[this.pos++];
    if (b === 253) return this.buf[this.pos++] | 256;
    if (b === 252) return (this.buf[this.pos++] << 8) | this.buf[this.pos++];
    if (b === 251) return (this.buf[this.pos++] << 8) | 65536 | this.buf[this.pos++];
    if (b === 250) return (this.buf[this.pos++] << 16) | (this.buf[this.pos++] << 8) | this.buf[this.pos++];
    throw new Error("varint: 0x" + b.toString(16));
  }
  readRawString(len) { const s = Buffer.from(this.buf.buffer || this.buf, this.pos, len).toString("utf8"); this.pos += len; return s; }
  readString() { return this.readRawString(this.readVarint()); }
  skip(n) { this.pos += n; }
}

// ==================== CodeArg ====================
const codeArg = new Array(256).fill(0);
[0,1,2,3,4,5].forEach(c => codeArg[c] = 3);
[10,11,12,13,14,15].forEach(c => codeArg[c] = 1);
[20,21,22,23,24,25].forEach(c => codeArg[c] = 3);
[30,31,32,33,34].forEach(c => codeArg[c] = 1);
codeArg[40] = 2; codeArg[41] = 2; codeArg[42] = 3; codeArg[50] = 3;
[60,61,62,63].forEach(c => codeArg[c] = 3);
codeArg[74] = 3; codeArg[255] = 1;

// ==================== Parse entry ====================
function parseEntry(buf, offset, words) {
  const r = new ValueReader(buf);
  r.skip(offset);

  const entry = {
    lema: [],
    pelafalan: "",
    etimologi: "",
    makna: [],
    contoh: [],
    turunan: [],
    gabungan_kata: [],
    peribahasa: [],
    kiasan: [],
    varian: [],
    dasar: [],
  };

  let currentMakna = "";
  let currentSection = "makna";

  const flushMakna = () => {
    const t = currentMakna.trim();
    if (t) entry.makna.push(t);
    currentMakna = "";
  };

  while (true) {
    const code = r.readUint8();
    const arg = codeArg[code];
    let str = null, num = 0;
    if (arg === 1) { /* no data */ }
    else if (arg === 2) { num = r.readVarint(); str = (num > 0 && num <= words.length) ? words[num - 1] : `#${num}`; }
    else if (arg === 3) { str = r.readString(); }
    else break;

    switch (code) {
      case 1: case 5: // lema
        entry.lema.push(str);
        break;
      case 2: entry.pelafalan = str; break;
      case 3: // entri terkait - acts as lema display
        if (entry.lema.length === 0 || !entry.lema.includes(str))
          entry.lema.push(str);
        break;
      case 4: entry.etimologi = str; break;
      case 0: // text
        if (currentSection === "makna") currentMakna += str;
        break;
      case 20: currentMakna += `[${str}] `; break; // kelas kata
      case 21: currentMakna += `<${str}> `; break;  // bahasa
      case 22: currentMakna += `{${str}} `; break;  // bidang
      case 23: currentMakna += str; break;           // ilmiah
      case 24: currentMakna += str; break;           // kimia
      case 25: currentMakna += `(${str}) `; break;   // ragam
      case 30: currentMakna += "ki "; break;
      case 31: currentMakna += "kp "; break;
      case 32: currentMakna += "akr "; break;
      case 33: currentMakna += "ukp "; break;
      case 34: currentMakna += "sing "; break;
      case 42: case 60: case 61: case 62: case 63: case 74:
        currentMakna += str; break;
      case 50: entry.contoh.push(str); break;
      case 40: case 41: // rujukan
        if (currentSection === "turunan") entry.turunan.push(str);
        else if (currentSection === "gabungan") entry.gabungan_kata.push(str);
        else if (currentSection === "peribahasa") entry.peribahasa.push(str);
        else if (currentSection === "kiasan") entry.kiasan.push(str);
        else if (currentSection === "varian") entry.varian.push(str);
        else if (currentSection === "dasar") entry.dasar.push(str);
        else currentMakna += str;
        break;
      case 10: flushMakna(); currentSection = "varian"; break;
      case 11: flushMakna(); currentSection = "dasar"; break;
      case 12: flushMakna(); currentSection = "gabungan"; break;
      case 13: flushMakna(); currentSection = "turunan"; break;
      case 14: flushMakna(); currentSection = "peribahasa"; break;
      case 15: flushMakna(); currentSection = "kiasan"; break;
      case 255:
        flushMakna();
        break;
    }
    if (code === 255) break;
  }

  // Clean up empty fields
  for (const key of Object.keys(entry)) {
    if (Array.isArray(entry[key]) && entry[key].length === 0) delete entry[key];
    if (typeof entry[key] === "string" && !entry[key]) delete entry[key];
  }

  return entry;
}

// ==================== Main ====================
function main() {
  console.log("=== KBBI v6 Data Extractor ===\n");

  // Read words
  const nilaiData = fs.readFileSync(path.join(DICTDATA, "acu_nilai.txt"));
  const vr = new ValueReader(nilaiData);
  const wordCount = vr.readVarint();
  const words = [];
  for (let i = 0; i < wordCount; i++) words.push(vr.readRawString(vr.readUint8()));
  console.log(`Words: ${wordCount}`);

  // Read offlens
  const offlensData = fs.readFileSync(path.join(DICTDATA, "acu_offlens.txt"));
  const vr2 = new ValueReader(offlensData);
  const offlenCount = vr2.readVarint();
  const offlens = new Array(offlenCount);
  let fileNo = -1, offset = 0;
  for (let i = 0; i < offlenCount; i++) {
    let v = vr2.readVarint();
    if (v === 65535) { fileNo++; v = vr2.readVarint(); offset = 0; }
    offlens[i] = (fileNo << 24) | offset;
    offset += v;
  }

  // Find max file number
  let maxFileNo = 0;
  for (let i = 0; i < offlenCount; i++) {
    const fn = (offlens[i] >> 24) & 0xff;
    if (fn > maxFileNo) maxFileNo = fn;
  }
  console.log(`Max file number: ${maxFileNo}`);

  // Decrypt desc files
  const descBuffers = {};
  for (let i = 0; i <= maxFileNo; i++) {
    const fp = path.join(DICTDATA, `acu_desc_${i}.s`);
    const enc = fs.readFileSync(fp);
    const dst = new Uint8Array(enc.length);
    streamXOR(KEY, NONCE, new Uint8Array(enc), dst);
    descBuffers[i] = zlib.gunzipSync(Buffer.from(dst));
    console.log(`  File ${i}: OK (${descBuffers[i].length} bytes)`);
  }

  // Extract
  console.log("\nExtracting...");
  const entries = [];
  let errors = 0;
  for (let i = 0; i < wordCount; i++) {
    const ol = offlens[i];
    const fn = (ol >> 24) & 0xff;
    const off = ol & 0xffffff;
    try {
      const entry = parseEntry(descBuffers[fn], off, words);
      entry.kata = words[i];
      entries.push(entry);
    } catch (e) {
      errors++;
      if (errors <= 10) console.log(`  Error "${words[i]}": ${e.message}`);
      entries.push({ kata: words[i], error: e.message });
    }
    if ((i + 1) % 20000 === 0) console.log(`  ${i + 1}/${wordCount}...`);
  }

  console.log(`\nDone! ${entries.length} entries, ${errors} errors`);

  // Save
  const outPath = path.join(__dirname, "kbbi_v6_data.json");
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf8");
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`Saved: ${outPath} (${mb} MB)`);

  // Search for tifosi
  const tifosi = entries.find(x => x.kata === "tifosi");
  if (tifosi) {
    console.log("\n=== TIFOSI FOUND ===");
    console.log(JSON.stringify(tifosi, null, 2));
  } else {
    console.log("\ntifosi: NOT FOUND");
  }

  // Samples
  for (const s of ["rumah", "makan", "cinta", "tifosi"]) {
    const e = entries.find(x => x.kata === s);
    if (e) console.log(`\n[${e.kata}]`, JSON.stringify(e, null, 2).substring(0, 500));
  }
}

main();
