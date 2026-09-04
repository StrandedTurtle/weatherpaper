// Reduce forest-cabin-reference.png to the 160x288 canvas.
//
// THIS IS THE SOURCE OF TRUTH FOR THE ARTWORK. art/scene.aseprite is generated
// output - regenerate it freely with art/rebuild.sh. If you start editing the
// sprite by hand instead, say so, because then this relationship inverts.
//
// Crops the reference to the canvas aspect, area-downsamples in LINEAR light
// (averaging in sRGB washes out a picture this dark), then quantises to a
// k-means palette. Averaging first and quantising second is deliberate: the
// other order throws away the sub-pixel detail that makes the reduction read.
//
//   node art/reduce-reference.js [paletteSize]     default 40
//
// Intermediates land in art/.build (override with SP=<dir>).

// Crop the reference to the canvas aspect, area-downsample to 160x288, then
// quantise to a k-means palette. Area averaging first, quantise second - the
// other order throws away the sub-pixel detail that makes the reduction read.
const path=require('path');
const ROOT=path.join(__dirname,'..');
const {decodePNG}=require(path.join(ROOT,'tools/png-decode.js'));
const {encodePNGA}=require(path.join(ROOT,'tools/png.js'));
const fs=require('fs');
const SP=process.env.SP||path.join(ROOT,'art/.build');
fs.mkdirSync(SP,{recursive:true});
const W=160,H=288;
const K=+(process.argv[2]||40);

const REF=path.join(ROOT,'forest-cabin-reference.png');
if(!fs.existsSync(REF)){
  console.error('Missing '+REF+'\n\n'+
    'The scene is derived from that reference painting, which is deliberately NOT\n'+
    'committed: it is a signed piece by someone else, and this repo and its APK are\n'+
    'public. The generated art in art/layers/ is committed, so the app builds without\n'+
    'it - you only need it to regenerate the scene from scratch.');
  process.exit(1);
}
const img=decodePNG(fs.readFileSync(REF));
const D=img.rgba;
// 1200x2400 -> keep the top (the moon lives there) and drop 240 rows off the
// bottom, which also removes the artist's signature.
const CX=0, CY=0, CW=1200, CH=2160;
const sx=CW/W, sy=CH/H;
const lin=new Float64Array(W*H*3);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let r=0,g=0,b=0,n=0;
  const y0=CY+Math.floor(y*sy), y1=CY+Math.floor((y+1)*sy);
  const x0=CX+Math.floor(x*sx), x1=CX+Math.floor((x+1)*sx);
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){
    const o=(yy*img.width+xx)*4;
    // average in linear light so the dark mass does not wash out
    r+=Math.pow(D[o]/255,2.2); g+=Math.pow(D[o+1]/255,2.2); b+=Math.pow(D[o+2]/255,2.2); n++;
  }
  const t=(y*W+x)*3;
  lin[t]=Math.pow(r/n,1/2.2)*255; lin[t+1]=Math.pow(g/n,1/2.2)*255; lin[t+2]=Math.pow(b/n,1/2.2)*255;
}

// k-means over the reduced image
const pts=[];
for(let i=0;i<W*H;i++) pts.push([lin[i*3],lin[i*3+1],lin[i*3+2]]);
const lum=c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
const sorted=[...pts].sort((a,b)=>lum(a)-lum(b));
let cent=[]; for(let i=0;i<K;i++) cent.push(sorted[Math.floor((i+0.5)*sorted.length/K)].slice());
for(let it=0;it<40;it++){
  const sum=cent.map(()=>[0,0,0,0]);
  for(const p of pts){
    let bi=0,bd=1e18;
    for(let c=0;c<K;c++){const d=(p[0]-cent[c][0])**2+(p[1]-cent[c][1])**2+(p[2]-cent[c][2])**2;if(d<bd){bd=d;bi=c;}}
    const s=sum[bi]; s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++;
  }
  for(let c=0;c<K;c++) if(sum[c][3]) cent[c]=[sum[c][0]/sum[c][3],sum[c][1]/sum[c][3],sum[c][2]/sum[c][3]];
}
cent=cent.map(c=>c.map(v=>Math.max(0,Math.min(255,Math.round(v)))));

const idx=new Uint8Array(W*H);
for(let i=0;i<W*H;i++){
  const p=[lin[i*3],lin[i*3+1],lin[i*3+2]];
  let bi=0,bd=1e18;
  for(let c=0;c<K;c++){const d=(p[0]-cent[c][0])**2+(p[1]-cent[c][1])**2+(p[2]-cent[c][2])**2;if(d<bd){bd=d;bi=c;}}
  idx[i]=bi;
}
const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
const out=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++){const c=cent[idx[i]];out[i*4]=c[0];out[i*4+1]=c[1];out[i*4+2]=c[2];out[i*4+3]=255;}
fs.writeFileSync(SP+'/reduced.png',encodePNGA(out,W,H));
fs.writeFileSync(SP+'/reduced.json',JSON.stringify({
  width:W,height:H,palette:cent.map(hex),index:Array.from(idx)}));
// magnified copy for looking at
const S=2,ow=W*S,oh=H*S,big=Buffer.alloc(ow*oh*4);
for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
  const s=((y/S|0)*W+(x/S|0))*4,d=(y*ow+x)*4;
  big[d]=out[s];big[d+1]=out[s+1];big[d+2]=out[s+2];big[d+3]=255;}
fs.writeFileSync(SP+'/reduced-big.png',encodePNGA(big,ow,oh));
console.log('K='+K+'  palette:');
cent.map((c,i)=>({c,i})).sort((a,b)=>lum(a.c)-lum(b.c)).forEach(o=>process.stdout.write(hex(o.c)+' '));
console.log();
