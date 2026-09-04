// Build art/scene.aseprite from the split layer data, over the aseprite MCP
// server (pixel-mcp) on stdio. The sprite is rebuilt from scratch every run, so
// the result never depends on what was in it before.
//
//   node art/build-aseprite.js
//
// PIXEL_MCP overrides the server binary; it reads the Aseprite path from
// ~/.config/pixel-mcp/config.json.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SP = process.env.SP || path.join(ROOT, 'art/.build');
const MCP = process.env.PIXEL_MCP || path.join(process.env.HOME, '.local/bin/pixel-mcp');
const SPRITE = process.env.SPRITE || path.join(ROOT, 'art/scene.aseprite');
// Layer names and their order come from the data, so this builds any split.
const LAYERS = Object.keys(JSON.parse(fs.readFileSync(SP + '/layers.json','utf8'))).sort();
const PALETTE = JSON.parse(fs.readFileSync(SP + '/palette.json', 'utf8'));
const data = JSON.parse(fs.readFileSync(SP + '/layers.json', 'utf8'));

const p = spawn(MCP, [], { stdio: ['pipe','pipe','ignore'] });
let buf = '', pending = new Map(), id = 1;
p.stdout.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const rpc = (method, params) => new Promise(res => {
  const myId = id++; pending.set(myId, res);
  p.stdin.write(JSON.stringify({ jsonrpc:'2.0', id:myId, method, params }) + '\n');
});
async function call(tool, args) {
  const r = await rpc('tools/call', { name: tool, arguments: args });
  const txt = (r.result?.content || []).map(x => x.text).join('');
  if (r.result?.isError || r.error) throw new Error(tool + ': ' + txt + JSON.stringify(r.error || ''));
  return txt;
}
(async () => {
  await rpc('initialize', { protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{ name:'build', version:'1' } });
  p.stdin.write(JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized' }) + '\n');

  try { fs.unlinkSync(SPRITE); } catch {}
  const created = JSON.parse(await call('create_canvas', { width:160, height:288, color_mode:'rgb' }));
  let sprite = created.file_path;
  for (const n of LAYERS) await call('add_layer', { sprite_path: sprite, layer_name: n });
  await call('delete_layer', { sprite_path: sprite, layer_name: 'Layer 1' });
  await call('set_palette', { sprite_path: sprite, colors: PALETTE });

  const CHUNK = 2500;
  for (const n of LAYERS) {
    const pix = data[n] || [];
    for (let i = 0; i < pix.length; i += CHUNK) {
      await call('draw_pixels', { sprite_path: sprite, layer_name: n, frame_number: 1, pixels: pix.slice(i, i + CHUNK) });
    }
    process.stderr.write('  ' + n + ' ' + pix.length + '\n');
  }
  await call('save_as', { sprite_path: sprite, output_path: SPRITE });
  console.error('saved ' + SPRITE);
  p.stdin.end(); process.exit(0);
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
