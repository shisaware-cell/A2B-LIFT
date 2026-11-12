import { build } from 'esbuild';
await build({stdin:{contents:'import QRCode from "qrcode"; window.A2BQRCode = { toDataURL: QRCode.toDataURL };',resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',minify:true,outfile:'website/assets/celbux-qr.js'});
