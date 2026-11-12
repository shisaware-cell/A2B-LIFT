import { build } from 'esbuild';
await build({stdin:{contents:'import QRCode from "qrcode"; window.A2BQRCode = { toDataURL: QRCode.toDataURL };',resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',minify:true,outfile:'website/assets/celbux-qr.js'});
// Preserve the upstream licence notices with the redistributed browser bundle.
const { readFile, writeFile } = await import('node:fs/promises');
await writeFile('website/assets/celbux-qr.LICENSE.txt', [await readFile('node_modules/qrcode/license','utf8'), await readFile('node_modules/dijkstrajs/LICENSE.md','utf8')].join('\n\n'));
