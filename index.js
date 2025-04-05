import { compile, createFileManager } from "@noir-lang/noir_wasm"

import { UltraHonkBackend, BarretenbergSync } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { poseidon2HashAsync } from "@zkpassport/poseidon2";

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

// WASM
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

function stringToReadableStream(str) {
  return new Response(new TextEncoder().encode(str)).body;
}

export async function getCircuit() {
  const fm = createFileManager("/");

  const mainNr = `
use std::hash::poseidon2::Poseidon2::hash;

fn main(secret_path: [Field; 3], user_path: [Field; 3], public_hash: pub Field) {
    for i in 0..3 {
        assert(secret_path[i] == user_path[i]);
    }

    assert(hash(secret_path, 3) == public_hash);
}
`.trim();

  const nargoToml = `
[package]
name = "circuit"
type = "bin"
`.trim();

  fm.writeFile("./src/main.nr", stringToReadableStream(mainNr));
  fm.writeFile("./Nargo.toml", stringToReadableStream(nargoToml));

  return await compile(fm);
}

// Basic scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
scene.fog = new THREE.Fog(0x000000, 10, 30);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 9);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit controls setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableRotate = false;
controls.enableDamping = true;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const directional = new THREE.DirectionalLight(0xffffff, 2);
scene.add(directional);

// SpotLight for goal celebration
const successLight = new THREE.SpotLight(0xffff88, 3, 10, Math.PI / 4);
scene.add(successLight);
successLight.visible = false;

// Player model (human shape with limbs)
const player = new THREE.Group();
const bodyColor = 0x26717e;
const skinColor = 0xffccaa;

const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), new THREE.MeshStandardMaterial({ color: bodyColor }));
body.position.y = 0.6;
player.add(body);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), new THREE.MeshStandardMaterial({ color: skinColor }));
head.position.y = 1.1;
player.add(head);

const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: bodyColor }));
leftLeg.position.set(-0.1, 0.15, 0);
player.add(leftLeg);

const rightLeg = leftLeg.clone();
rightLeg.position.x = 0.1;
player.add(rightLeg);

player.position.set(0, 0, 2);
scene.add(player);

// Start platform
const startPlatform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
startPlatform.position.set(0, -1, 1.5);
scene.add(startPlatform);

// Glass tiles
const tileSize = 1;
const tileGap = 1.5;
const tileOffset = 0.8;
const numTiles = 3;
const tiles = [];

// To create proof
const secretPath = [];

for (let i = 0; i < numTiles; i++) {
  const z = -i * (tileSize + tileGap);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xaaffff, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.8
  });
  const left = new THREE.Mesh(new THREE.BoxGeometry(tileSize, 0.1, tileSize), mat.clone());
  const right = new THREE.Mesh(new THREE.BoxGeometry(tileSize, 0.1, tileSize), mat.clone());
  const safeIndex = Math.random() < 0.5 ? 0 : 1;
  
  secretPath.push(BigInt(safeIndex));

  if (safeIndex === 0) right.userData.break = true;
  else left.userData.break = true;
  left.position.set(-tileOffset, 0, z);
  right.position.set(tileOffset, 0, z);
  scene.add(left, right);
  tiles.push(left, right);
}

// To create proof
const api = await BarretenbergSync.initSingleton();
// const publicHash = await poseidon2HashAsync(secretPath);
const publicHash = api.poseidon2Hash(secretPath);
document.getElementById("public-hash-value").textContent =
 publicHash.toString(16).padStart(64, "0");

document.getElementById("copy-public-hash").addEventListener("click", () => {
  const hex = publicHash.toString(16).padStart(64, "0");
  navigator.clipboard.writeText(hex);
  alert("✅ Public hash copied to clipboard!");
});

// Goal platform
const gateZ = -numTiles * (tileSize + tileGap) - 2;
const goalPlatform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 3), new THREE.MeshStandardMaterial({ color: 0x444444 }));
goalPlatform.position.set(0, -0.25, gateZ - 3);
scene.add(goalPlatform);
successLight.position.set(0, 5, gateZ - 3);
successLight.target.position.set(0, 0, gateZ - 3);

// Light bulbs along bridge
function createLightLine(zStart, zEnd, x, interval = 1) {
  const group = new THREE.Group();
  const steps = Math.floor(Math.abs(zEnd - zStart) / interval);
  for (let i = 0; i <= steps; i++) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshStandardMaterial({ emissive: 0xffddaa, emissiveIntensity: 10 })
    );
    bulb.position.set(x, 0.7, zStart - i * interval);
    group.add(bulb);
  }
  scene.add(group);
}
createLightLine(0, -numTiles * (tileSize + tileGap), -2);
createLightLine(0, -numTiles * (tileSize + tileGap), 2);

// Click event handler
let isJumping = false;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// To create proof
const userPath = [];

function toHex(array) {
  return "0x" + Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

window.addEventListener("click", (event) => {
  if (isJumping) return;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(tiles);
  if (intersects.length > 0) {
    const tile = intersects[0].object;
    const { x, z } = tile.position;
    
    const direction = tile.position.x < 0 ? 0 : 1;
    userPath.push(BigInt(direction));
    
    const dz = Math.abs(z - player.position.z);
    if (z >= player.position.z || dz > tileSize + tileGap + 0.1) return;
    isJumping = true;

    // Jump animation
    gsap.to(player.position, {
      x, z, y: 1, duration: 0.3,
      onComplete: () => {
        gsap.to(player.position, {
          y: 0.3, duration: 0.2,
          onComplete: () => {
            if (!tile.userData.break) isJumping = false;
          }
        });
      }
    });
    gsap.to(camera.position, {
      x, z: z + 6, y: 5.5, duration: 1
    });

    // Goal check
    const isLastTile = z === tiles[tiles.length - 1].position.z;
    if (isLastTile && !tile.userData.break) {
      setTimeout(() => {
        gsap.to(player.position, {
          x: 0, z: gateZ - 3, y: 1, duration: 0.5,
          onComplete: () => {
            gsap.to(player.position, {
              y: 0.3, duration: 0.2,
              onComplete: async () => {
                successLight.visible = true;
                successLight.intensity = 10;
                scene.background = new THREE.Color(0x222233);
                spawnFireworks(player.position);
                document.getElementById("victory-text").style.opacity = 1;

                // Generate proof
								try {
									const { program } = await getCircuit();
									const noir = new Noir(program);
									const backend = new UltraHonkBackend(program.bytecode);
							
									const noirInputs = {
										secret_path: secretPath.map(v => v.toString()),
										user_path: userPath.map(v => v.toString()),
										public_hash: publicHash.toString()
									};

									const { witness } = await noir.execute(noirInputs);
									const { proof, publicInputs } = await backend.generateProof(witness)

                  document.getElementById("copy-buttons").style.display = "flex";

                  document.getElementById("copy-proof").addEventListener("click", async () => {
                    const hexProof = toHex(proof); 
                    await navigator.clipboard.writeText(hexProof);
                    alert("✅ Proof copied!");
                  });
                  
                  // const verified = await backend.verifyProof({ proof, publicInputs })
                  // console.log(verified)

                  // document.getElementById("copy-sol").addEventListener("click", async () => {
                  //   const solCode = await fetch("/circuit/verify.sol").then(r => r.text());
                  //   await navigator.clipboard.writeText(solCode);
                  //   alert("✅ Verifier copied!");
                  // });

								} catch(e) {
									console.log(e);
								}
              }
            });
          }
        });
        gsap.to(camera.position, {
          x: 0, z: gateZ + 2, y: 5, duration: 1
        });
      }, 800);
    }

    if (tile.userData.break) {
      setTimeout(() => fall(tile), 600);
    }
  }
});

// Shattering glass animation
function spawnShards(tile) {
  for (let i = 0; i < 6; i++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.05, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xaaffff, transparent: true, opacity: 0.6 })
    );
    shard.position.set(
      tile.position.x + (Math.random() - 0.5) * 0.5,
      tile.position.y,
      tile.position.z + (Math.random() - 0.5) * 0.5
    );
    scene.add(shard);
    gsap.to(shard.position, { y: -5, duration: 1 + Math.random() });
    gsap.to(shard.rotation, { x: Math.random() * Math.PI, z: Math.random() * Math.PI });
    gsap.to(shard.material, { opacity: 0, duration: 1.5 });
  }
  tile.visible = false;
}

// Falling animation
function fall(tile) {
  gsap.to(player.position, { y: -5, duration: 1 });
  spawnShards(tile);
  setTimeout(() => {
    alert("💥 The glass broke!");
    location.reload();
  }, 1500);
}

// Fireworks celebration effect
function spawnFireworks(center) {
  for (let i = 0; i < 100; i++) {
    const geom = new THREE.SphereGeometry(0.08, 8, 8);
    const color = new THREE.Color(`hsl(${Math.random() * 360}, 100%, 70%)`);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 10,
      transparent: true,
      opacity: 1
    });

    const particle = new THREE.Mesh(geom, mat);
    particle.position.copy(center.clone().add(new THREE.Vector3(0, 1.5, 0)));
    scene.add(particle);

    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 3 + 2,
      (Math.random() - 0.5) * 4
    );

    gsap.to(particle.position, {
      x: particle.position.x + dir.x,
      y: particle.position.y + dir.y,
      z: particle.position.z + dir.z,
      duration: 1.2,
      ease: "power2.out"
    });

    gsap.to(particle.material, {
      opacity: 0,
      duration: 1.2,
      ease: "power1.in",
      onComplete: () => {
        scene.remove(particle);
      }
    });
  }
}

// Resize handler + main animation loop
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  camera.lookAt(player.position);
  directional.position.set(player.position.x + 2, player.position.y + 5, player.position.z + 2);
  renderer.render(scene, camera);
}
animate();

