import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pngValid} from '../../supabase/functions/wos-p7-verify-image/png';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
assert.equal(await pngValid(png,hash(png)),true,'real valid PNG must pass');
const invalidOld=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=','base64');
assert.equal(await pngValid(invalidOld,hash(invalidOld)),false,'historical invalid CRC must fail');
const corrupt=Buffer.from(png);corrupt[45]^=1;
assert.equal(await pngValid(corrupt,hash(corrupt)),false,'IDAT CRC tamper must fail');
assert.equal(await pngValid(png,'0'.repeat(64)),false,'incorrect hash must fail');
const extra=Buffer.concat([png,Buffer.from('<script>alert(1)</script>')]);
assert.equal(await pngValid(extra,hash(extra)),false,'trailing payload must fail');
assert.equal(await pngValid(png.subarray(0,png.length-12),hash(png.subarray(0,png.length-12))),false,'missing IEND must fail');
console.log('WOS_P7_EDGE_PNG_BYTE_TESTS=PASS');
