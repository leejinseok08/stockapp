// Cloudflare Pages uploads skip any folder named node_modules, but Expo's web export puts font
// files under dist/assets/node_modules/... With them missing the app waits for fonts forever and
// shows a blank screen. Move that folder and point the bundle at the new path.
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");
const from = path.join(dist, "assets", "node_modules");
const to = path.join(dist, "assets", "pkg");

if (!fs.existsSync(from)) {
  console.log("fix-web-assets: nothing to move");
  process.exit(0);
}
fs.renameSync(from, to);

let patched = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|html|json)$/.test(entry.name)) {
      const src = fs.readFileSync(p, "utf8");
      const out = src.split("/assets/node_modules/").join("/assets/pkg/");
      if (out !== src) {
        fs.writeFileSync(p, out);
        patched++;
      }
    }
  }
}
walk(dist);
console.log(`fix-web-assets: moved assets/node_modules -> assets/pkg, patched ${patched} file(s)`);
