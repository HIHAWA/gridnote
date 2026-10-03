// Copies the parts of three.js used by the 3D preview into src/vendor/three,
// keeping the folder layout so the relative imports inside the add-ons still work.
// Run with: npm run vendor
const fs = require("node:fs");
const path = require("node:path");

const from = path.join(__dirname, "..", "node_modules", "three");
const to = path.join(__dirname, "..", "src", "vendor", "three");
const files = [
  "LICENSE",
  "build/three.module.js",
  "build/three.core.js",
  "examples/jsm/controls/OrbitControls.js",
  "examples/jsm/loaders/GLTFLoader.js",
  "examples/jsm/loaders/OBJLoader.js",
  "examples/jsm/loaders/FBXLoader.js",
  "examples/jsm/loaders/STLLoader.js",
  "examples/jsm/curves/NURBSCurve.js",
  "examples/jsm/curves/NURBSUtils.js",
  "examples/jsm/utils/SkeletonUtils.js",
  "examples/jsm/utils/BufferGeometryUtils.js",
  "examples/jsm/libs/fflate.module.js",
];
fs.rmSync(to, { recursive: true, force: true });
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(to, f)), { recursive: true });
  fs.copyFileSync(path.join(from, f), path.join(to, f));
}
console.log(`Copied ${files.length} three.js files to src/vendor/three`);
