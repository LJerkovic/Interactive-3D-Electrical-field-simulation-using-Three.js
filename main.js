import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const appRoot = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f15);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(10, 8, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
appRoot.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const grid = new THREE.GridHelper(20, 20, 0x2b3b4f, 0x1a2633);
scene.add(grid);

const axes = new THREE.AxesHelper(5);
scene.add(axes);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x20242a, 0.9);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(10, 12, 5);
scene.add(dirLight);

const chargesGroup = new THREE.Group();
const fieldGroup = new THREE.Group();
scene.add(chargesGroup, fieldGroup);

const chargeGeometry = new THREE.SphereGeometry(0.35, 24, 24);
const chargeMaterials = {
  positive: new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x3a0f0f }),
  negative: new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x0f203a }),
  neutral: new THREE.MeshStandardMaterial({ color: 0xdedede, emissive: 0x111111 })
};

const charges = [];
let nextChargeId = 1;

const ui = {
  value: document.getElementById('charge-value'),
  x: document.getElementById('charge-x'),
  y: document.getElementById('charge-y'),
  z: document.getElementById('charge-z'),
  spacing: document.getElementById('field-spacing'),
  spacingValue: document.getElementById('field-spacing-value'),
  fadeToggle: document.getElementById('fade-toggle'),
  fadeStrength: document.getElementById('fade-strength'),
  fadeStrengthValue: document.getElementById('fade-strength-value'),
  cullToggle: document.getElementById('cull-toggle'),
  cullDistance: document.getElementById('cull-distance'),
  cullDistanceValue: document.getElementById('cull-distance-value'),
  add: document.getElementById('add-charge'),
  list: document.getElementById('charge-list')
};
  // KONFIGURACIJA POLJA  - PRILAGOĐAVANJE VELIČINE REGIJE, RAZMAKA IZMEĐU VEKTORA,
  //  MAKSIMALNE DULJINE VEKTORA, I SKALIRANJA POLJA
const fieldConfig = {
  regionSize: 14,
  spacing: 1,
  maxVectorLength: 2,
  minDistance: 0.4,
  scale: 1,
  fadeEnabled: true,
  fadeStrength: 1,
  fadeStart: 2,
  fadeEnd: 10,
  minOpacity: 0.2,
  maxOpacity: 1,
  cullEnabled: false,
  cullDistance: 8
};

function addCharge({ position, value }) {
  const id = nextChargeId;
  nextChargeId += 1;

  const charge = {
    id,
    value,
    position: position.clone(),
    mesh: null
  };

  const mesh = new THREE.Mesh(
    chargeGeometry,
    value > 0 ? chargeMaterials.positive : value < 0 ? chargeMaterials.negative : chargeMaterials.neutral
  );

  mesh.position.copy(charge.position);
  mesh.userData.chargeId = id;
  chargesGroup.add(mesh);
  charge.mesh = mesh;
  charges.push(charge);

  renderChargeList();
  rebuildFieldVectors();
  return charge;
}

function removeCharge(id) {
  const index = charges.findIndex((charge) => charge.id === id);
  if (index === -1) {
    return;
  }

  const [removed] = charges.splice(index, 1);
  if (removed.mesh) {
    chargesGroup.remove(removed.mesh);
  }

  renderChargeList();
  rebuildFieldVectors();
}

function renderChargeList() {
  ui.list.innerHTML = '';

  if (charges.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'charge-item';
    empty.textContent = 'No charges yet.';
    ui.list.appendChild(empty);
    return;
  }

  for (const charge of charges) {
    const item = document.createElement('div');
    item.className = 'charge-item';

    const info = document.createElement('span');
    info.textContent = `${charge.value.toFixed(2)} @ (${charge.position.x.toFixed(1)}, ${charge.position.y.toFixed(1)}, ${charge.position.z.toFixed(1)})`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      removeCharge(charge.id);
    });

    item.appendChild(info);
    item.appendChild(removeButton);
    ui.list.appendChild(item);
  }
}

function computeFieldAt(point) {
  const field = new THREE.Vector3();

  for (const charge of charges) {
    const direction = new THREE.Vector3().subVectors(point, charge.position);
    const distanceSq = direction.lengthSq();

    if (distanceSq < fieldConfig.minDistance * fieldConfig.minDistance) {
      continue;
    }

    direction.normalize();
    const magnitude = (fieldConfig.scale * charge.value) / distanceSq;
    field.addScaledVector(direction, magnitude);
  }

  return field;
}

function rebuildFieldVectors() {
  fieldGroup.clear();

  if (charges.length === 0) {
    return;
  }

  const half = fieldConfig.regionSize * 0.5;
  const spacing = fieldConfig.spacing;
  const origin = new THREE.Vector3();
  const fadeRange = Math.max(fieldConfig.fadeEnd - fieldConfig.fadeStart, 0.0001);

  for (let x = -half; x <= half; x += spacing) {
    for (let y = -half; y <= half; y += spacing) {
      for (let z = -half; z <= half; z += spacing) {
        origin.set(x, y, z);
        const field = computeFieldAt(origin);
        const length = Math.min(field.length(), fieldConfig.maxVectorLength);

        if (length === 0) {
          continue;
        }

        const direction = field.normalize();
        let minChargeDistance = Infinity;
        for (const charge of charges) {
          const distance = origin.distanceTo(charge.position);
          if (distance < minChargeDistance) {
            minChargeDistance = distance;
          }
        }

        if (fieldConfig.cullEnabled && minChargeDistance > fieldConfig.cullDistance) {
          continue;
        }

        const fadeT = Math.min(
          Math.max((minChargeDistance - fieldConfig.fadeStart) / fadeRange, 0),
          1
        );
        const minOpacity =
          fieldConfig.maxOpacity -
          (fieldConfig.maxOpacity - fieldConfig.minOpacity) * fieldConfig.fadeStrength;
        const opacity = fieldConfig.fadeEnabled
          ? fieldConfig.maxOpacity - (fieldConfig.maxOpacity - minOpacity) * fadeT
          : fieldConfig.maxOpacity;

        const arrow = new THREE.ArrowHelper(direction, origin, length, 0xefe6a4, 0.2, 0.12);
        arrow.line.material.transparent = true;
        arrow.line.material.opacity = opacity;
        arrow.cone.material.transparent = true;
        arrow.cone.material.opacity = opacity;
        fieldGroup.add(arrow);
      }
    }
  }
}

function updateSpacingLabel() {
  ui.spacingValue.textContent = Number(fieldConfig.spacing).toFixed(1);
}

function updateFadeLabel() {
  ui.fadeStrengthValue.textContent = Number(fieldConfig.fadeStrength).toFixed(1);
  ui.fadeToggle.textContent = fieldConfig.fadeEnabled ? 'Fade: On' : 'Fade: Off';
}

function updateCullLabel() {
  ui.cullToggle.textContent = fieldConfig.cullEnabled ? 'Cull far: On' : 'Cull far: Off';
  ui.cullDistanceValue.textContent = Math.round(fieldConfig.cullDistance).toString();
}

ui.add.addEventListener('click', () => {
  const value = Number.parseFloat(ui.value.value);
  const x = Number.parseFloat(ui.x.value);
  const y = Number.parseFloat(ui.y.value);
  const z = Number.parseFloat(ui.z.value);

  if (Number.isNaN(value) || Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
    return;
  }

  addCharge({ position: new THREE.Vector3(x, y, z), value });
});

ui.spacing.addEventListener('input', () => {
  const spacing = Number.parseFloat(ui.spacing.value);
  if (Number.isNaN(spacing) || spacing <= 0) {
    return;
  }

  fieldConfig.spacing = spacing;
  updateSpacingLabel();
  rebuildFieldVectors();
});

ui.fadeToggle.addEventListener('click', () => {
  fieldConfig.fadeEnabled = !fieldConfig.fadeEnabled;
  updateFadeLabel();
  rebuildFieldVectors();
});

ui.fadeStrength.addEventListener('input', () => {
  const strength = Number.parseFloat(ui.fadeStrength.value);
  if (Number.isNaN(strength)) {
    return;
  }

  fieldConfig.fadeStrength = Math.min(Math.max(strength, 0), 1);
  updateFadeLabel();
  rebuildFieldVectors();
});

ui.cullToggle.addEventListener('click', () => {
  fieldConfig.cullEnabled = !fieldConfig.cullEnabled;
  updateCullLabel();
  rebuildFieldVectors();
});

ui.cullDistance.addEventListener('input', () => {
  const distance = Number.parseFloat(ui.cullDistance.value);
  if (Number.isNaN(distance)) {
    return;
  }

  fieldConfig.cullDistance = Math.min(Math.max(distance, 4), 20);
  updateCullLabel();
  rebuildFieldVectors();
});

renderChargeList();
updateSpacingLabel();
updateFadeLabel();
updateCullLabel();

ui.cullDistance.value = fieldConfig.cullDistance.toString();

function animate() {
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});