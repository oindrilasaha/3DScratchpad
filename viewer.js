import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 3D Scratchpad Viewer
// Coordinate convention:
// - Right-handed
// - +Z into the screen (camera looks towards +Z)
// - +Y up
// - +X towards LEFT (we mirror X in the scene so Three.js +X appears left)
// Ranges:
// - Y: [-1, +1] with ground at Y=-1
// - Z: [2, 5]

function createCheckeredGround(THREERef) {
    const size = 20;
    const divisions = 40;

    const geometry = new THREERef.PlaneGeometry(size, size);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const square = canvas.width / divisions;
    for (let i = 0; i < divisions; i++) {
        for (let j = 0; j < divisions; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? '#8f8f8f' : '#b0b0b0';
            ctx.fillRect(i * square, j * square, square, square);
        }
    }

    const tex = new THREERef.CanvasTexture(canvas);
    tex.colorSpace = THREERef.SRGBColorSpace;
    tex.wrapS = THREERef.RepeatWrapping;
    tex.wrapT = THREERef.RepeatWrapping;
    tex.repeat.set(1, 1);

    const material = new THREERef.MeshStandardMaterial({
        map: tex,
        roughness: 1.0,
        metalness: 0.0,
        side: THREERef.DoubleSide,
    });

    const plane = new THREERef.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, -1.0, 3.5);
    plane.receiveShadow = true;

    return plane;
}

// Axes at ground origin reference (0,-1,3.5)
// Make axes thicker and 3D-looking, with swapped colors: X=green, Y=blue, Z=red.
function createArrowAxes(THREERef, origin) {
    const group = new THREERef.Group();

    const length = 1.8;
    const headLength = 0.18;
    const headRadius = 0.05;
    const shaftRadius = 0.015;

    // Lift X/Z axes slightly to avoid being embedded in the ground plane.
    const lift = 0.03;

    function makeShaft(dir, shaftLen, centerOffset, color, extraOffset = new THREERef.Vector3()) {
        const geom = new THREERef.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 20);
        const mat = new THREERef.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
        const mesh = new THREERef.Mesh(geom, mat);

        const up = new THREERef.Vector3(0, 1, 0);
        const q = new THREERef.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        mesh.quaternion.copy(q);

        mesh.position
            .copy(origin)
            .add(extraOffset)
            .add(dir.clone().normalize().multiplyScalar(centerOffset));

        mesh.castShadow = true;
        return mesh;
    }

    function makeCone(dir, color, extraOffset = new THREERef.Vector3()) {
        const coneGeom = new THREERef.ConeGeometry(headRadius, headLength, 20);
        const coneMat = new THREERef.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1 });
        const cone = new THREERef.Mesh(coneGeom, coneMat);

        const up = new THREERef.Vector3(0, 1, 0);
        const q = new THREERef.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        cone.quaternion.copy(q);

        cone.position
            .copy(origin)
            .add(extraOffset)
            .add(dir.clone().normalize().multiplyScalar(length - headLength / 2));
        cone.castShadow = true;
        return cone;
    }

    // X axis = green, bidirectional line, arrows on BOTH sides
    {
        const dirPos = new THREERef.Vector3(1, 0, 0);
        const dirNeg = new THREERef.Vector3(-1, 0, 0);
        const offset = new THREERef.Vector3(0, lift, 0);

        // With cones on both ends, shafts should stop at the base of each cone.
        const shaftLen = length - headLength;
        group.add(makeShaft(dirPos, shaftLen, shaftLen / 2, 0x00ff00, offset));
        group.add(makeShaft(dirNeg, shaftLen, shaftLen / 2, 0x00ff00, offset));
        group.add(makeCone(dirPos, 0x00ff00, offset));
        group.add(makeCone(dirNeg, 0x00ff00, offset));
    }

    // Z axis = red, bidirectional line, arrows on BOTH sides
    {
        const dirPos = new THREERef.Vector3(0, 0, 1);
        const dirNeg = new THREERef.Vector3(0, 0, -1);
        const offset = new THREERef.Vector3(0, lift, 0);

        const shaftLen = length - headLength;
        group.add(makeShaft(dirPos, shaftLen, shaftLen / 2, 0xff0000, offset));
        group.add(makeShaft(dirNeg, shaftLen, shaftLen / 2, 0xff0000, offset));
        group.add(makeCone(dirPos, 0xff0000, offset));
        group.add(makeCone(dirNeg, 0xff0000, offset));
    }

    // Y axis = blue, upward arrow only (no lift needed)
    {
        const dirPos = new THREERef.Vector3(0, 1, 0);
        const shaftLen = length - headLength;
        group.add(makeShaft(dirPos, shaftLen, shaftLen / 2, 0x0000ff));
        group.add(makeCone(dirPos, 0x0000ff));
    }

    return group;
}

// Mesh coloring palette (in order)
const colors = [
    new THREE.Color(1.0, 0.0, 0.0),
    new THREE.Color(0.0, 1.0, 0.0),
    new THREE.Color(0.0, 0.0, 1.0),
    new THREE.Color(1.0, 1.0, 0.0),
    new THREE.Color(0.0, 1.0, 1.0),
    new THREE.Color(1.0, 0.0, 1.0),
    new THREE.Color(1.0, 0.5, 0.0),
];

// Apply a *tint* while preserving original textures.
// We avoid replacing materials; instead we multiply the material's base color.
function applyTintPreserveTextures(root, tint) {
    root.traverse((child) => {
        if (!child || !child.isMesh) return;

        child.castShadow = true;
        child.receiveShadow = true;

        const applyToMaterial = (mat) => {
            if (!mat) return;

            // Strengthen base color tint (still preserves albedo maps).
            if (mat.color && mat.color.isColor) {
                const strength = 0.6; // reduced (was 0.75)
                const mixed = mat.color.clone().lerp(tint, strength);
                mat.color.copy(mixed);
            }

            // Add emissive tint to make it "pop" while keeping texture detail.
            // (Works for MeshStandard/Physical and most PBR materials.)
            if ('emissive' in mat && mat.emissive && mat.emissive.isColor) {
                mat.emissive.copy(tint);
                // Reduced to avoid flattening the shading.
                mat.emissiveIntensity = 0.25; // reduced (was 0.35)
            }

            mat.needsUpdate = true;
        };

        if (Array.isArray(child.material)) {
            child.material.forEach(applyToMaterial);
        } else {
            applyToMaterial(child.material);
        }
    });
}

function createViewer({ containerId, modelPaths, colorOffset = 0, onLoadComplete }) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Viewer container not found: ${containerId}`);
        return null;
    }

    function getContainerSize() {
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width || container.clientWidth || 1));
        const height = Math.max(1, Math.floor(rect.height || container.clientHeight || 1));
        return { width, height };
    }

    // Scene + "scratchpad" root. We mirror X so +X is visually to the LEFT.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7fbff);

    const scratchpad = new THREE.Group();
    scene.add(scratchpad);

    const { width: w0, height: h0 } = getContainerSize();

    // Default camera: positioned behind the near Z-plane, looking towards +Z.
    const camera = new THREE.PerspectiveCamera(55, w0 / h0, 0.01, 2000);
    // Place camera slightly in front of Z=2 near plane (i.e., smaller Z) and above ground.
    camera.position.set(0, 0.3, 0.0);
    // Look towards center of the scratchpad range
    camera.lookAt(0, 0.0, 3.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xf7fbff, 1);
    // Ensure correct color management so colors don't appear washed out.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setSize(w0, h0, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const existingCanvas = container.querySelector('canvas');
    if (existingCanvas) existingCanvas.remove();
    container.appendChild(renderer.domElement);

    // Create interaction hint overlay
    const hint = document.createElement('div');
    hint.className = 'interaction-hint';
    hint.innerHTML = `
        <div class="hint-icon-container">
            <svg viewBox="0 0 100 100" width="48" height="48" style="overflow: visible;">
                <!-- Curved Arrow (Rotation) -->
                <path d="M 20 60 A 30 30 0 0 1 65 25" fill="none" stroke="#2c3e50" stroke-width="6" stroke-linecap="round" />
                <path d="M 20 60 L 8 45 M 20 60 L 35 52" fill="none" stroke="#2c3e50" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>

                <!-- Cursor -->
                <path d="M 50 40 L 50 78 L 60 68 L 71 88 L 80 83 L 69 63 L 82 63 Z" 
                      fill="white" stroke="#2c3e50" stroke-width="4" stroke-linejoin="round"/>
            </svg>
        </div>
    `;
    const existingHint = container.querySelector('.interaction-hint');
    if (existingHint) existingHint.remove();
    container.appendChild(hint);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(4, 8, 1);
    dir.castShadow = true;
    scene.add(dir);

    // Ground + axes inside mirrored scratchpad
    scratchpad.add(createCheckeredGround(THREE));

    const axesOrigin = new THREE.Vector3(0, -1.0, 3.5);
    scratchpad.add(createArrowAxes(THREE, axesOrigin));

    // Controls: default view, no motion unless user interacts
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 0.0, 3.5);
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.update();

    function enableUserControls() {
        controls.enableRotate = true;
        controls.enableZoom = true;
        hint.classList.add('fade-out');
        setTimeout(() => hint.remove(), 500);
    }
    renderer.domElement.addEventListener('pointerdown', enableUserControls, { once: true });
    renderer.domElement.addEventListener('wheel', enableUserControls, { once: true });

    const loader = new GLTFLoader();
    function loadModel(path) {
        return new Promise((resolve, reject) => {
            loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
        });
    }

    const modelGroup = new THREE.Group();
    scratchpad.add(modelGroup);

    function renderOnce() {
        renderer.render(scene, camera);
    }

    async function initModels() {
        try {
            const models = await Promise.all(modelPaths.map((p) => loadModel(p)));
            models.forEach((m, i) => {
                applyTintPreserveTextures(m, colors[(colorOffset + i) % colors.length]);
                modelGroup.add(m);
            });
            renderOnce();
        } catch (e) {
            console.error(`Failed to load one or more GLB models for ${containerId}:`, e);
        } finally {
            if (onLoadComplete) onLoadComplete();
        }
    }

    function resizeToContainer() {
        const { width, height } = getContainerSize();
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        renderOnce();
    }

    controls.addEventListener('change', renderOnce);
    const ro = new ResizeObserver(() => resizeToContainer());
    ro.observe(container);

    resizeToContainer();
    renderOnce();
    initModels();

    // Some containers (especially those below the fold / in a new row) can briefly
    // report an incorrect size during initial layout. Force one more pass.
    requestAnimationFrame(() => {
        resizeToContainer();
    });

    return { scene, camera, renderer, controls, scratchpad };
}


// Use Manifest for Model Discovery
let gManifest = null;
async function fetchManifest() {
    if (gManifest) return gManifest;
    try {
        const res = await fetch('assets_manifest.json');
        if (res.ok) {
            gManifest = await res.json();
            return gManifest;
        }
    } catch (e) {
        console.warn("Could not load assets_manifest.json, falling back to probing.");
    }
    return null;
}

// Probing fallback
function modelPathsForFallback(folderIndex, agent) {
    const agentStr = String(agent);
    const paths = [];
    const maxMeshesToTry = 10; // reduced
    for (let i = 0; i < maxMeshesToTry; i++) {
        paths.push(`assets/${folderIndex}/obj_mesh_placed_agent${agentStr}_${i}.glb`);
    }
    return paths;
}

async function getModelPaths(folder, agent) {
    const manifest = await fetchManifest();
    if (manifest && manifest[folder] && manifest[folder][agent]) {
        // Use manifest
        return manifest[folder][agent].map(f => `assets/${folder}/${f}`);
    } else {
        // Fallback to probing
        const candidates = modelPathsForFallback(folder, agent);
        const checks = await Promise.all(
            candidates.map(async (p) => {
                try {
                    const res = await fetch(p, { method: 'HEAD' });
                    return res.ok ? p : null;
                } catch { return null; }
            })
        );
        return checks.filter(Boolean);
    }
}

function initAllScratchpads() {
    const els = Array.from(document.querySelectorAll('.scratchpad'));
    if (els.length === 0) return;

    // Lazy Load Observer
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const el = entry.target;
                obs.unobserve(el); // only init once

                const folder = el.dataset.folder;
                const agent = el.dataset.agent;

                // Add Spinner
                const spinner = document.createElement('div');
                spinner.className = 'viewer-spinner';
                el.appendChild(spinner);

                getModelPaths(folder, agent).then((existing) => {
                    if (existing.length > 0) {
                        createViewer({
                            containerId: el.id,
                            modelPaths: existing,
                            colorOffset: 0,
                            onLoadComplete: () => {
                                if(spinner.parentNode) spinner.remove();
                            }
                        });
                    } else {
                        if(spinner.parentNode) spinner.remove();
                        el.textContent = "No models found.";
                    }
                });
            }
        });
    }, { rootMargin: '200px' }); // start loading 200px before view

    els.forEach((el) => {
        const folder = el.dataset.folder;
        const agent = el.dataset.agent;
        if (!folder || !agent) return;

        if (!el.id) el.id = `scratchpad-${folder}-${agent}`;
        
        observer.observe(el);
    });
}

function initAllResultImages() {
    const images = Array.from(document.querySelectorAll('.result-image'));

    const kindToFile = {
        rendered: 'rendered_best_cam.png',
        generated: 'flux_image_sigmagen.png',
    };

    images.forEach((img) => {
        const folder = img.dataset.folder;
        const kind = img.dataset.kind;
        const file = kindToFile[kind];

        if (!folder || !file) {
            console.warn('Result image missing data-folder or has unknown data-kind:', img);
            return;
        }

        img.src = `assets/${folder}/${file}`;
        img.loading = 'lazy';

        // If an image is missing, don't show a broken icon.
        img.addEventListener(
            'error',
            () => {
                img.style.display = 'none';
            },
            { once: true }
        );
    });
}

async function initAllPrompts() {
    const prompts = Array.from(document.querySelectorAll('.prompt'));

    await Promise.all(
        prompts.map(async (el) => {
            const folder = el.dataset.folder;
            if (!folder) return;

            const url = `assets/${folder}/prompt_full.txt`;
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

                const text = (await res.text()).trim();
                const shown = text.length ? `"${text}"` : '"(empty prompt)"';
                el.textContent = shown;
            } catch (e) {
                console.warn(`Failed to load prompt for folder=${folder} (${url})`, e);
                // Hide if missing to avoid distracting error text on the page
                el.style.display = 'none';
            }
        })
    );
}

initAllScratchpads();
initAllResultImages();
initAllPrompts();
