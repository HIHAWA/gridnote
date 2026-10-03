// 3D preview for model files. Loaded on demand the first time a model is opened.
import * as THREE from "three";
import { OrbitControls } from "./vendor/three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "./vendor/three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "./vendor/three/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "./vendor/three/examples/jsm/loaders/STLLoader.js";

async function load(url, ext) {
  switch (ext) {
    case "glb":
    case "gltf": {
      const g = await new GLTFLoader().loadAsync(url);
      return { object: g.scene, clips: g.animations || [] };
    }
    case "fbx": {
      const o = await new FBXLoader().loadAsync(url);
      return { object: o, clips: o.animations || [] };
    }
    case "obj":
      return { object: await new OBJLoader().loadAsync(url), clips: [] };
    case "stl": {
      const geo = await new STLLoader().loadAsync(url);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: 0xc3c9d6, roughness: 0.55, metalness: 0.1 });
      return { object: new THREE.Mesh(geo, mat), clips: [] };
    }
    default:
      throw new Error("No preview for ." + ext + " files.");
  }
}

export async function mountModel(container, url, ext) {
  const { object, clips } = await load(url, ext);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;outline:none";
  container.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f38, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.0);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  // Center the model and scale it to a 2-unit box so any file fits the view.
  const holder = new THREE.Group();
  holder.add(object);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2 / (Math.max(size.x, size.y, size.z) || 1);
  object.position.sub(center);
  holder.scale.setScalar(scale);
  scene.add(holder);

  const grid = new THREE.GridHelper(4, 16, 0x3b4252, 0x242932);
  grid.position.y = -(size.y * scale) / 2;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  camera.position.set(2.4, 1.7, 3.1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.update();

  let meshes = 0, triangles = 0;
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const g = o.geometry;
    triangles += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });

  const mixer = clips.length ? new THREE.AnimationMixer(object) : null;
  function playClip(i) {
    if (!mixer) return;
    mixer.stopAllAction();
    if (clips[i]) mixer.clipAction(clips[i]).reset().play();
  }
  playClip(0);

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0, last = performance.now();
  const tick = (now = performance.now()) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (mixer) mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  return {
    info: {
      meshes,
      triangles: Math.round(triangles),
      clips: clips.map((c, i) => c.name || "Animation " + (i + 1)),
    },
    playClip,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose && x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
