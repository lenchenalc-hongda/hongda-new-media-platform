/**
 * Byte-level PNG integrity check for the isolated WOS P7 synthetic QA path.
 * This is stricter than relying on the browser-provided MIME/extension or just
 * its PNG magic bytes. No third-party dependency or new server secret required.
 *
 * IMPORTANT: Only validates the Next.js QA HTTP flow. Direct authenticated
 * Supabase RPC calls are not cryptographically coupled to this result. The
 * final Production verifier must enforce trusted proof at the DB boundary.
 */
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const PNG_MAGIC = Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_COMPRESSED = 20 * 1024 * 1024;
const MAX_INFLATED = 64 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({length:256},(_,i)=>{
  let c=i; for(let j=0;j<8;j++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(buf:Buffer):number {
  let c=0xffffffff;
  for (const b of buf) c=CRC_TABLE[(c^b)&255] ^ (c>>>8);
  return (c^0xffffffff)>>>0;
}

export function verifyWosSyntheticPngBinary(value:Uint8Array, claimedSha256:string):boolean {
  if (!(value instanceof Uint8Array) || value.byteLength<60 || value.byteLength>MAX_COMPRESSED) return false;
  if (!/^[a-f0-9]{64}$/.test(claimedSha256)) return false;
  const buf=Buffer.from(value);
  if (!buf.subarray(0,8).equals(PNG_MAGIC)) return false;
  if (createHash('sha256').update(buf).digest('hex')!==claimedSha256) return false;
  let offset=8, chunks=0, seenHeader=false, seenData=false, seenEnd=false;
  let width=0,height=0,channels=0,depth=0;
  const compressed:Buffer[]=[];
  while (offset<buf.length && chunks++<1000) {
    if (offset+12>buf.length) return false;
    const n=buf.readUInt32BE(offset);
    if (n>MAX_COMPRESSED || offset+12+n>buf.length) return false;
    const kind=buf.toString('ascii',offset+4,offset+8);
    const dataStart=offset+8, dataEnd=dataStart+n;
    if (!/^[A-Za-z]{4}$/.test(kind)) return false;
    if (crc32(buf.subarray(offset+4,dataEnd))!==buf.readUInt32BE(dataEnd)) return false;
    if (!seenHeader && kind!=='IHDR') return false;
    if (kind==='IHDR') {
      if (seenHeader || n!==13 || chunks!==1) return false;
      width=buf.readUInt32BE(dataStart);height=buf.readUInt32BE(dataStart+4);
      depth=buf[dataStart+8];
      const color=buf[dataStart+9];
      if (width===0 || height===0 || width*height>MAX_PIXELS
          || depth!==8 || ![0,2,4,6].includes(color)
          || buf[dataStart+10]!==0 || buf[dataStart+11]!==0
          || buf[dataStart+12]!==0) return false;
      channels=({0:1,2:3,4:2,6:4} as Record<number,number>)[color];
      seenHeader=true;
    } else if (kind==='IDAT') {
      if (seenEnd || n===0) return false;
      compressed.push(buf.subarray(dataStart,dataEnd));seenData=true;
    } else if (kind==='IEND') {
      if (!seenData || seenEnd || n!==0 || dataEnd+4!==buf.length) return false;
      seenEnd=true;
    } else if (kind.charCodeAt(0)>=65 && kind.charCodeAt(0)<=90) {
      // Reject unknown critical PNG chunks and palette mode on this QA path.
      return false;
    } else if (kind==='acTL' || kind==='fcTL' || kind==='fdAT') return false;
    offset=dataEnd+4;
  }
  if (!seenEnd || !seenHeader || !seenData || offset!==buf.length) return false;
  const scanlineBytes=1+width*channels*(depth/8);
  const expected=scanlineBytes*height;
  if (!Number.isSafeInteger(expected) || expected>MAX_INFLATED) return false;
  try {
    const raw=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected+1});
    if (raw.length!==expected) return false;
    for (let row=0;row<height;row++) if(raw[row*scanlineBytes]>4) return false;
    return true;
  } catch { return false; }
}
