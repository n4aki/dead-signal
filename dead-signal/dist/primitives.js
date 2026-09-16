import * as THREE from './vendor/three.module.js';
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitSphere = new THREE.IcosahedronGeometry(1, 1);
const mats = {};
export function mat(color, opts = {}) { const key = color + JSON.stringify(opts); return mats[key] ||= new THREE.MeshStandardMaterial({ color, roughness: .82, ...opts }); }
export function box(parent, x, y, z, w, h, d, material, shadow = true) {
  const mesh = new THREE.Mesh(unitBox, typeof material === 'string' ? mat(material) : material);
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = shadow; mesh.receiveShadow = shadow; parent.add(mesh); return mesh;
}
export function orb(parent, x, y, z, w, h, d, material) {
  const mesh = new THREE.Mesh(unitSphere, typeof material === 'string' ? mat(material) : material);
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; parent.add(mesh); return mesh;
}
