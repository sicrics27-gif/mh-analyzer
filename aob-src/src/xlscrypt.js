// 잠긴(비밀번호) 엑셀 풀기 — 휴대폰·브라우저 안에서만 처리 (파일을 밖으로 보내지 않음)
// 지원: 옛 엑셀(.xls) RC4 · RC4 CryptoAPI, 새 엑셀(.xlsx) 표준(AES-ECB) · Agile(AES-CBC)
// 사용: await XlsCrypt.decrypt(Uint8Array, '비밀번호') → 풀린 파일(Uint8Array). 틀리면 Error('BADPW'), 잠겨 있지 않으면 Error('NOTENC')
(function (root) {
  var te = new TextEncoder();
  function u16(s) { var o = new Uint8Array(s.length * 2); for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); o[i * 2] = c & 255; o[i * 2 + 1] = c >> 8; } return o; }
  function cat() { var n = 0, i; for (i = 0; i < arguments.length; i++) n += arguments[i].length; var o = new Uint8Array(n), p = 0; for (i = 0; i < arguments.length; i++) { o.set(arguments[i], p); p += arguments[i].length; } return o; }
  function le32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
  function rd16(b, o) { return b[o] | (b[o + 1] << 8); }
  function rd32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function eq(a, b, n) { for (var i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; }
  function err(c) { var e = new Error(c); e.code = c; return e; }
  var subtle = root.crypto && root.crypto.subtle;
  async function H(alg, data) { return new Uint8Array(await subtle.digest(alg, data)); }

  // ---------- MD5 (옛 RC4 방식용, 브라우저에 없어 직접) ----------
  function md5(bytes) {
    var K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], i;
    for (i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    var len = bytes.length, nb = ((len + 8) >> 6) + 1, W = new Uint32Array(nb * 16);
    for (i = 0; i < len; i++) W[i >> 2] |= bytes[i] << ((i % 4) * 8);
    W[len >> 2] |= 0x80 << ((len % 4) * 8); W[nb * 16 - 2] = (len * 8) >>> 0; W[nb * 16 - 1] = Math.floor(len / 536870912);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var blk = 0; blk < nb; blk++) {
      var A = a0, B = b0, C = c0, D = d0;
      for (i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        var t = D; D = C; C = B; var x = (A + F + K[i] + W[blk * 16 + g]) >>> 0, s = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((x << s) | (x >>> (32 - s)))) >>> 0; A = t;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    var o = new Uint8Array(16); [a0, b0, c0, d0].forEach(function (v, j) { o[j * 4] = v & 255; o[j * 4 + 1] = (v >>> 8) & 255; o[j * 4 + 2] = (v >>> 16) & 255; o[j * 4 + 3] = (v >>> 24) & 255; }); return o;
  }
  // ---------- RC4 ----------
  function rc4(key, n) { var s = new Uint8Array(256), i, j = 0, t; for (i = 0; i < 256; i++) s[i] = i; for (i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; t = s[i]; s[i] = s[j]; s[j] = t; } var o = new Uint8Array(n); i = 0; j = 0; for (var k = 0; k < n; k++) { i = (i + 1) & 255; j = (j + s[i]) & 255; t = s[i]; s[i] = s[j]; s[j] = t; o[k] = s[(s[i] + s[j]) & 255]; } return o; }

  // ---------- 옛 엑셀 (.xls, BIFF8) ----------
  var NOENC = { 0x0809: 1, 0x002F: 1, 0x0194: 1, 0x0195: 1, 0x00E1: 1, 0x0196: 1, 0x0138: 1 };
  async function xlsKeyFn(fp, pw) {
    var type = rd16(fp, 0); if (type !== 1) throw err('UNSUPPORTED'); // 0 = XOR 난독화 (드묾)
    var vMaj = rd16(fp, 2), vMin = rd16(fp, 4);
    if (vMaj === 1 && vMin === 1) { // RC4 (MD5, 40비트)
      var salt = fp.slice(6, 22), ev = fp.slice(22, 38), evh = fp.slice(38, 54);
      var h0 = md5(u16(pw)).slice(0, 5), buf = new Uint8Array(21 * 16); for (var i = 0; i < 16; i++) { buf.set(h0, i * 21); buf.set(salt, i * 21 + 5); }
      var h1 = md5(buf).slice(0, 5), key = function (b) { return md5(cat(h1, le32(b))); };
      var ks = rc4(key(0), 32), v = new Uint8Array(16), vh = new Uint8Array(16); for (var k = 0; k < 16; k++) { v[k] = ev[k] ^ ks[k]; vh[k] = evh[k] ^ ks[16 + k]; }
      if (!eq(md5(v), vh, 16)) throw err('BADPW');
      return async function (b) { return key(b); };
    }
    if ((vMaj === 2 || vMaj === 3 || vMaj === 4) && vMin === 2) { // RC4 CryptoAPI (SHA1)
      var p = 10, hs = rd32(fp, p); p += 4; var keyBits = rd32(fp, p + 16) || 40; p += hs;
      var ss = rd32(fp, p); p += 4; var salt2 = fp.slice(p, p + ss); p += ss; var ev2 = fp.slice(p, p + 16); p += 16; var vhs = rd32(fp, p); p += 4; var evh2 = fp.slice(p, p + 20);
      var h0b = await H('SHA-1', cat(salt2, u16(pw)));
      var key2 = async function (b) { var hf = await H('SHA-1', cat(h0b, le32(b))); if (keyBits === 40) { var kk = new Uint8Array(16); kk.set(hf.slice(0, 5)); return kk; } return hf.slice(0, keyBits / 8); };
      var ks2 = rc4(await key2(0), 36), v2 = new Uint8Array(16), vh2 = new Uint8Array(20); for (var m = 0; m < 16; m++) v2[m] = ev2[m] ^ ks2[m]; for (m = 0; m < 20; m++) vh2[m] = evh2[m] ^ ks2[16 + m];
      if (!eq(await H('SHA-1', v2), vh2, Math.min(20, vhs || 20))) throw err('BADPW');
      return key2;
    }
    throw err('UNSUPPORTED');
  }
  async function decryptBiff(wb, pw) {
    var pos = 0, fpAt = -1, fpLen = 0, fp = null;
    while (pos + 4 <= wb.length) { var t = rd16(wb, pos), l = rd16(wb, pos + 2); if (t === 0x002F) { fpAt = pos; fpLen = 4 + l; fp = wb.slice(pos + 4, pos + 4 + l); break; } if (t === 0x000A && pos > 0) break; pos += 4 + l; }
    if (!fp) throw err('NOTENC');
    var keyOf = await xlsKeyFn(fp, pw);
    // 위치 기준 키 흐름 (1024바이트마다 새 키)
    var ks = new Uint8Array(wb.length);
    for (var b = 0; b * 1024 < wb.length; b++) { var part = rc4(await keyOf(b), 1024); ks.set(part.subarray(0, Math.min(1024, wb.length - b * 1024)), b * 1024); }
    var out = new Uint8Array(wb.length - fpLen), q = 0, sheets = [];
    pos = 0;
    while (pos + 4 <= wb.length) {
      var ty = rd16(wb, pos), ln = rd16(wb, pos + 2), st = pos + 4, en = Math.min(st + ln, wb.length);
      if (pos === fpAt) { pos = en; continue; }
      out.set(wb.subarray(pos, st), q); q += 4;
      for (var i = st; i < en; i++) { var plain = NOENC[ty] || (ty === 0x0085 && i < st + 4); out[q++] = plain ? wb[i] : (wb[i] ^ ks[i]); }
      if (ty === 0x0085) sheets.push(q - (en - st));
      pos = en;
    }
    // 시트 위치(lbPlyPos) 고치기: 지운 FILEPASS 길이만큼 앞으로
    sheets.forEach(function (o) { var v = rd32(out, o); if (v > fpAt) { v -= fpLen; out[o] = v & 255; out[o + 1] = (v >>> 8) & 255; out[o + 2] = (v >>> 16) & 255; out[o + 3] = (v >>> 24) & 255; } });
    return out.subarray(0, q);
  }

  // ---------- 새 엑셀 (.xlsx) 암호: AES ----------
  async function aesCbcRaw(key, iv, data) { // 패딩 없는 AES-CBC 복호화 (웹 암호 기능은 패딩을 요구해서 끝에 맞춤 블록을 붙임)
    var k = await subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
    var last = data.slice(data.length - 16), pad = new Uint8Array(16).fill(16), x = new Uint8Array(16); for (var i = 0; i < 16; i++) x[i] = pad[i] ^ last[i];
    var ex = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, x)).slice(0, 16);
    return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: iv }, k, cat(data, ex)));
  }
  async function aesEcb(key, data) { var p = await aesCbcRaw(key, new Uint8Array(16), data); for (var i = 16; i < p.length; i++) p[i] ^= data[i - 16]; return p; }
  function b64(s) { var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  var HN = { SHA1: 'SHA-1', 'SHA-1': 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' };
  function fit(b, n, c) { if (b.length >= n) return b.slice(0, n); var o = new Uint8Array(n).fill(c); o.set(b); return o; }
  async function decryptOoxml(info, pkg, pw) {
    var vMaj = rd16(info, 0), vMin = rd16(info, 2), size = Number(rd32(pkg, 0)) + rd32(pkg, 4) * 4294967296, body = pkg.subarray(8);
    if (vMaj === 4 && vMin === 4) { // Agile
      var xml = new TextDecoder().decode(info.subarray(8)), doc = new DOMParser().parseFromString(xml, 'application/xml');
      var kd = doc.getElementsByTagName('keyData')[0], ek = doc.getElementsByTagNameNS('*', 'encryptedKey')[0] || doc.querySelector('[spinCount]');
      var ha = HN[ek.getAttribute('hashAlgorithm')] || 'SHA-1', salt = b64(ek.getAttribute('saltValue')), spin = +ek.getAttribute('spinCount'), kb = +ek.getAttribute('keyBits'), bs = +ek.getAttribute('blockSize') || 16;
      var h = await H(ha, cat(salt, u16(pw))); for (var i = 0; i < spin; i++) h = await H(ha, cat(le32(i), h));
      var dk = async function (blk) { return fit(await H(ha, cat(h, blk)), kb / 8, 0x36); };
      var iv = fit(salt, bs, 0x36);
      var vIn = await aesCbcRaw(await dk(new Uint8Array([0xFE, 0xA7, 0xD2, 0x76, 0x3B, 0x4B, 0x9E, 0x79])), iv, b64(ek.getAttribute('encryptedVerifierHashInput')));
      var vHv = await aesCbcRaw(await dk(new Uint8Array([0xD7, 0xAA, 0x0F, 0x6D, 0x30, 0x61, 0x34, 0x4E])), iv, b64(ek.getAttribute('encryptedVerifierHashValue')));
      var hv = await H(ha, vIn.slice(0, +ek.getAttribute('saltSize') || 16)); if (!eq(hv, vHv, hv.length)) throw err('BADPW');
      var secret = (await aesCbcRaw(await dk(new Uint8Array([0x14, 0x6E, 0x0B, 0xE7, 0xAB, 0xAC, 0xD0, 0xD6])), iv, b64(ek.getAttribute('encryptedKeyValue')))).slice(0, (+kd.getAttribute('keyBits')) / 8);
      var kdSalt = b64(kd.getAttribute('saltValue')), kha = HN[kd.getAttribute('hashAlgorithm')] || 'SHA-1', out = new Uint8Array(size), p = 0;
      for (var s = 0; p < size; s++) { var seg = body.subarray(s * 4096, Math.min((s + 1) * 4096, body.length)); if (!seg.length) break; var d = await aesCbcRaw(secret, (await H(kha, cat(kdSalt, le32(s)))).slice(0, 16), seg); var n = Math.min(d.length, size - p); out.set(d.subarray(0, n), p); p += n; }
      return out;
    }
    if ((vMaj === 3 || vMaj === 4) && vMin === 2) { // Standard
      var hs = rd32(info, 8), hp = 12, keyBits = rd32(info, hp + 16), vp = hp + hs, ss = rd32(info, vp), salt2 = info.slice(vp + 4, vp + 4 + ss), ev = info.slice(vp + 4 + ss, vp + 20 + ss), evh = info.slice(vp + 24 + ss, vp + 56 + ss);
      var h2 = await H('SHA-1', cat(salt2, u16(pw))); for (var j = 0; j < 50000; j++) h2 = await H('SHA-1', cat(le32(j), h2));
      var hf = await H('SHA-1', cat(h2, le32(0))), b1 = new Uint8Array(64).fill(0x36); for (j = 0; j < 20; j++) b1[j] ^= hf[j];
      var b2 = new Uint8Array(64).fill(0x5c); for (j = 0; j < 20; j++) b2[j] ^= hf[j];
      var key = cat(await H('SHA-1', b1), await H('SHA-1', b2)).slice(0, keyBits / 8);
      var v = await aesEcb(key, ev), vh = await aesEcb(key, evh); if (!eq(await H('SHA-1', v.slice(0, 16)), vh, 20)) throw err('BADPW');
      var dec = await aesEcb(key, body.subarray(0, body.length - (body.length % 16))); return dec.slice(0, size);
    }
    throw err('UNSUPPORTED');
  }

  async function decrypt(data, pw) {
    var CFB = root.XLSX && root.XLSX.CFB; if (!CFB) throw new Error('엑셀 모듈 없음');
    var u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!(u8[0] === 0xD0 && u8[1] === 0xCF)) throw err('NOTENC');
    var cfb = CFB.read(u8, { type: 'array' });
    var ei = CFB.find(cfb, 'EncryptionInfo'), ep = CFB.find(cfb, 'EncryptedPackage');
    if (ei && ep) return decryptOoxml(new Uint8Array(ei.content), new Uint8Array(ep.content), pw);
    var w = CFB.find(cfb, 'Workbook') || CFB.find(cfb, 'Book'); if (!w) throw err('NOTENC');
    var plain = await decryptBiff(new Uint8Array(w.content), pw);
    w.content = plain; w.size = plain.length;
    return new Uint8Array(CFB.write(cfb, { type: 'array', fileType: 'cfb' }));
  }
  // 여러 비밀번호 후보를 차례로 시도
  async function tryAll(data, pws) { var last = null; for (var i = 0; i < pws.length; i++) { try { return { data: await decrypt(data, String(pws[i])), pw: pws[i] }; } catch (e) { last = e; if (e.code !== 'BADPW') throw e; } } throw last || err('BADPW'); }
  root.XlsCrypt = { decrypt: decrypt, tryAll: tryAll, _md5: md5 };
})(this);
