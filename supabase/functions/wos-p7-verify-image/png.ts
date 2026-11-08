// Web-standard, bounded PNG parser shared by Edge runtime and Node QA tests.
// Never accept caller MIME, name, SHA or magic bytes alone.
const MAX_FILE=20*1024*1024,MAX_PIXELS=16*1024*1024,MAX_RAW=64*1024*1024;
const MAGIC=new Uint8Array([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  let c=i;
  for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(buf:Uint8Array):number {
  let c=0xffffffff;
  for(const byte of buf)c=crcTable[(c^byte)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function u32(v:Uint8Array,i:number) {
  return (((v[i]<<24)>>>0)+(v[i+1]<<16)+(v[i+2]<<8)+v[i+3])>>>0;
}
async function pngValid(bytes:Uint8Array,expectedSha:string):Promise<boolean>{
  if(bytes.length<60||bytes.length>MAX_FILE) return false;
  if(!MAGIC.every((v,i)=>bytes[i]===v))return false;
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==expectedSha)return false;
  let off=8,chunks=0,header=false,seenData=false,ended=false,idatEnded=false;
  let width=0,height=0,channels=0;
  const compressed:Uint8Array[]=[];
  let compressedSize=0;
  while(off<bytes.length&&chunks++<1000) {
    if(off+12>bytes.length)return false;
    const n=u32(bytes,off),kind=String.fromCharCode(...bytes.subarray(off+4,off+8));
    const end=off+8+n;
    if(n>MAX_FILE||end+4>bytes.length||!/^[A-Za-z]{4}$/.test(kind)
      ||crc32(bytes.subarray(off+4,end))!==u32(bytes,end))return false;
    if(!header&&kind!=='IHDR')return false;
    if(kind==='IHDR'){
      if(header||n!==13||chunks!==1)return false;
      width=u32(bytes,off+8);height=u32(bytes,off+12);
      const depth=bytes[off+16],color=bytes[off+17];
      if(!width||!height||width*height>MAX_PIXELS||depth!==8
        ||![0,2,4,6].includes(color)||bytes[off+18]!==0
        ||bytes[off+19]!==0||bytes[off+20]!==0)return false;
      channels=({0:1,2:3,4:2,6:4} as Record<number,number>)[color];
      header=true;
    }else if(kind==='IDAT'){
      if(ended||idatEnded||n===0)return false;
      compressed.push(bytes.subarray(off+8,end));
      compressedSize+=n;if(compressedSize>MAX_FILE)return false;
      seenData=true;
    }else if(kind==='IEND'){
      if(!seenData||ended||n!==0||end+4!==bytes.length)return false;
      ended=true;
    }else{
      if(seenData)idatEnded=true;
      if(kind==='acTL'||kind==='fcTL'||kind==='fdAT'
        ||kind.charCodeAt(0)>=65&&kind.charCodeAt(0)<=90)return false;
    }
    off=end+4;
  }
  if(!ended||!header||!seenData||off!==bytes.length)return false;
  const rowBytes=1+width*channels,expected=rowBytes*height;
  if(!Number.isSafeInteger(expected)||expected>MAX_RAW)return false;
  const input=new Uint8Array(compressedSize);
  let at=0;for(const chunk of compressed){input.set(chunk,at);at+=chunk.length;}
  try{
    // Streaming inflation with an exact maximum, to avoid zip bombs.
    const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(input);c.close();}})
      .pipeThrough(new DecompressionStream('deflate'));
    const reader=stream.getReader();let produced=0;
    const raw=new Uint8Array(expected);
    while(true){
      const part=await reader.read();
      if(part.done)break;
      if(produced+part.value.length>expected){await reader.cancel();return false;}
      raw.set(part.value,produced);produced+=part.value.length;
    }
    if(produced!==expected)return false;
    for(let row=0;row<height;row++)if(raw[row*rowBytes]>4)return false;
    return true;
  }catch{return false;}
}

export { pngValid };
