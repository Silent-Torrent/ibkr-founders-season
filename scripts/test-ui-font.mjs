// Verify actual bundled cmap coverage, independent of installed fallback fonts.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
const font=readFileSync(process.argv[2] || 'src/assets/season-ui.woff')
assert.equal(font.toString('ascii',0,4),'wOFF')
let cmap
for(let i=0;i<font.readUInt16BE(12);i++){
  const p=44+i*20
  if(font.toString('ascii',p,p+4)!=='cmap')continue
  const offset=font.readUInt32BE(p+4),length=font.readUInt32BE(p+8),original=font.readUInt32BE(p+12)
  const bytes=font.subarray(offset,offset+length)
  cmap=length<original?inflateSync(bytes):bytes
}
assert(cmap,'WOFF needs a Unicode cmap')
const points=new Set()
for(let t=0;t<cmap.readUInt16BE(2);t++){
  const entry=4+t*8,platform=cmap.readUInt16BE(entry),encoding=cmap.readUInt16BE(entry+2)
  if(platform!==0 && !(platform===3 && [1,10].includes(encoding)))continue
  const p=cmap.readUInt32BE(entry+4),format=cmap.readUInt16BE(p)
  if(format===12){
    for(let i=0;i<cmap.readUInt32BE(p+12);i++){
      const at=p+16+i*12,start=cmap.readUInt32BE(at),end=cmap.readUInt32BE(at+4),glyph=cmap.readUInt32BE(at+8)
      for(let c=start;c<=end;c++)if(glyph+c-start)points.add(c)
    }
  } else if(format===4){
    const n=cmap.readUInt16BE(p+6)/2,end=p+14,start=end+n*2+2,delta=start+n*2,offset=delta+n*2
    for(let i=0;i<n;i++)for(let c=cmap.readUInt16BE(start+i*2);c<=cmap.readUInt16BE(end+i*2)&&c<65535;c++){
      const shift=cmap.readInt16BE(delta+i*2),distance=cmap.readUInt16BE(offset+i*2)
      const base=distance?cmap.readUInt16BE(offset+i*2+distance+2*(c-cmap.readUInt16BE(start+i*2))):c
      const glyph=distance&&base===0?0:(base+shift)&65535
      if(glyph)points.add(c)
    }
  }
}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):/\.tsx?$/.test(e.name)?[join(dir,e.name)]:[])}
const required=new Set(walk('src').flatMap(p=>[...readFileSync(p,'utf8')]).filter(c=>c.codePointAt(0)>=0x3000&&c.codePointAt(0)<=0x9fff))
const missing=[...required].filter(c=>!points.has(c.codePointAt(0)))
assert.deepEqual(missing,[],'Missing self-hosted CJK glyphs: '+missing.join(''))
console.log('Self-hosted UI font covers',required.size,'CJK codepoints used by source.')
