// Lecture minimale d'une archive ZIP dans le navigateur, sans bibliothèque : seules les entrées demandées
// sont lues (par tranches du fichier), ce qui évite de charger plusieurs centaines de Mo en mémoire.
const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser les archives ZIP : extrais le fichier activities.csv et importe-le directement.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Renvoie la liste des entrées : { name, read() → Uint8Array }.
export async function readZip(blob) {
  const tailSize = Math.min(blob.size, 66000);
  const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archive ZIP illisible.');
  const count = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error('Archive trop volumineuse (ZIP64) : extrais le fichier activities.csv et importe-le directement.');
  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const decoder = new TextDecoder();
  const out = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength && u32(cd, p) === 0x02014b50; i++) {
    const method = u16(cd, p + 10);
    const csize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    const offset = u32(cd, p + 42);
    const name = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    out.push({
      name,
      async read() {
        const head = new DataView(await blob.slice(offset, offset + 30).arrayBuffer());
        if (u32(head, 0) !== 0x04034b50) throw new Error('Archive ZIP corrompue.');
        const start = offset + 30 + u16(head, 26) + u16(head, 28);
        const raw = new Uint8Array(await blob.slice(start, start + csize).arrayBuffer());
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new Error('Méthode de compression ZIP non prise en charge.');
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
