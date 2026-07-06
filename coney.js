import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createConeyIsland(mainScene, mainCamera, mainRenderer) {
  let scene = null;
  let camera = mainCamera;
  let renderer = mainRenderer;

  const originalGetElementById = document.getElementById;
  document.getElementById = function(id) {
    const el = originalGetElementById.call(document, id);
    if (el) return el;
    return {
      textContent: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      appendChild: () => {},
      setAttribute: () => {},
      dataset: {}
    };
  };









      /* ============================================================
       *  STATE
       * ============================================================ */
      let composer, bloomPass, fxaaPass;
      let groundMesh, oceanMesh, sky, sun, directionalLight, ambientLight, hemisphereLight;
      let clock;
      let windowTexture;

      // Dynamic group containers
      let buildingGroup = new THREE.Group();
      let subwayGroup = new THREE.Group();
      let highwayGroup = new THREE.Group();
      let vehicleGroup = new THREE.Group();
      let peopleGroup = new THREE.Group();
      const rideLights = []; // tracked refs, lights remain parented to rideGroup

      // Tracked dynamic instances
      const trains = [];
      const buses = [];
      const cars = [];
      const people = [];
      const clouds = [];
      const helicopters = [];

      // Static ride references
      let spinningRide, swingRideTop, wheelMesh, dropTowerRide,
        simpleFerrisWheel, pirateShipRide;
      // New named-ride refs
      let cycloneTrackCurve, cycloneTrain;
      let thunderboltCurve, thunderboltCar;
      let parachuteWarningLight;
      const bulbMeshes = []; // tracked emissive bulb InstancedMeshes
      const seagulls = [];
      let sunSprite; // lens flare

      // Weather
      let weatherParticles, weatherGeo, weatherMaterial;
      let lightning;
      let weatherObjects = [];

      // Population
      let estimatedPopulation = 0;
      const VISUAL_PEOPLE_RATIO = 0.05;

      // Track building positions for decoration overlays
      let cafePositions = [];
      let apartmentPositions = [];
      let brownstonePositions = [];

      const settings = {
        timeOfDay: 50,
        weather: "sunny",
        numBuildings: 520,
        numSubwayLines: 4,
        numHighways: 1,
        numBuses: 130,
        numVehicles: 520,
      };

      const moveState = {
        forward: 0, backward: 0, left: 0, right: 0,
        up: 0, down: 0, rotateLeft: 0, rotateRight: 0,
      };
      const lookState = {
        isMouseDown: false, isTouchingLook: false,
        prevMouseX: 0, prevMouseY: 0,
        lon: -90, lat: 0,
      };
      const moveSpeed = 100.0;
      const lookSpeed = 0.15;
      const rotateSpeed = 1.0;

      let joystickTouchId = null, lookTouchId = null;
      let joystickStartX = 0, joystickStartY = 0;
      let joystickDeltaX = 0, joystickDeltaY = 0;
      const joystickRadius = 40;
      let joystickBaseElement, joystickHandleElement;
      let buttonUpElement, buttonDownElement,
        buttonRotateLeftElement, buttonRotateRightElement;

      // Constants
      const terrainAmp = 1.5;
      const groundSize = 2400;
      const maxBuildingZ = -80;
      const buildingAreaMinZ = -groundSize * 0.3;   // fewer distant blocks — the near city carries the look
      const buildingAreaSpread = groundSize * 0.8;
      const buildingAreaMinX = -buildingAreaSpread / 2;
      const buildingAreaMaxX = buildingAreaSpread / 2;
      const beachDepth = 80;
      const boardwalkWidth = 10;
      const boardwalkEndZ = 40 + beachDepth * 0.5;
      const streetGridEndZ = boardwalkEndZ - beachDepth - boardwalkWidth;

      const streetWidth = 10;
      const gridLength = groundSize * 0.9;
      const gridSpacingZ = 80;
      const streetLevelY = -1.0 + terrainAmp + 0.1;

      const BUS_CAPACITY = 60;
      const TRAIN_CAR_CAPACITY = 150;
      const NUM_CARS_PER_TRAIN = 4;
      const POPULATION_DENSITY_FACTOR = 0.1;

      // Loader
      const loaderEl = document.getElementById("loader");
      const loadBarFill = document.getElementById("load-bar-fill");
      const loadHint = document.getElementById("load-hint");
      function setLoad(pct, msg) {
        loadBarFill.style.width = `${Math.min(100, pct)}%`;
        if (msg) loadHint.textContent = msg;
      }

      /* ============================================================
       *  HELPERS
       * ============================================================ */
      function getTerrainHeight(x, z) {
        if (!groundMesh) return 0;
        return (
          Math.sin(x * 0.02) * Math.cos(z * 0.03) * terrainAmp
        );
      }

      function disposeObject(object) {
        if (!object) return;
        while (object.children.length > 0) disposeObject(object.children[0]);
        if (object.parent) object.parent.remove(object);
        else if (scene) scene.remove(object);
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose && m.dispose());
          } else if (object.material.dispose) {
            object.material.dispose();
          }
        }
      }

      function createWindowTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        ctx.scale(2, 2);
        // Facade gradient with baked ground-level ambient occlusion
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#eef2f6");
        g.addColorStop(0.8, "#c9d2db");
        g.addColorStop(1, "#9aa3ac");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 256);
        // grime streaks
        for (let i = 0; i < 26; i++) { ctx.fillStyle = "rgba(70,80,90," + (0.03 + Math.random() * 0.05).toFixed(2) + ")";
          const x = Math.random() * 128; ctx.fillRect(x, Math.random() * 40, 1 + Math.random() * 2, 60 + Math.random() * 190); }
        // Window grid
        const ww = 20, wh = 30, gx = 15, gy = 20;
        const cols = Math.floor((canvas.width - gx) / (ww + gx));
        const rows = Math.floor((canvas.height - gy) / (wh + gy));
        const tw = cols * (ww + gx) + gx;
        const th = rows * (wh + gy) + gy;
        const ox = (canvas.width - tw) / 2;
        const oy = (canvas.height - th) / 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = ox + gx + c * (ww + gx);
            const y = oy + gy + r * (wh + gy);
            // Sky-reflecting glass with depth, AC units, and warm-lit rooms
            const lit = Math.random() < 0.1;
            const wg = ctx.createLinearGradient(x, y, x, y + wh);
            if (lit) { wg.addColorStop(0, "#ffe9a8"); wg.addColorStop(1, "#e8b968"); }
            else { const sh = 0.75 + Math.random() * 0.35;
              wg.addColorStop(0, "rgba(" + (150 * sh | 0) + "," + (175 * sh | 0) + "," + (205 * sh | 0) + ",1)");
              wg.addColorStop(1, "rgba(" + (95 * sh | 0) + "," + (115 * sh | 0) + "," + (140 * sh | 0) + ",1)"); }
            ctx.fillStyle = wg;
            ctx.fillRect(x, y, ww, wh);
            ctx.fillStyle = "rgba(255,255,255,0.28)";       // glass glint
            ctx.fillRect(x + 2, y + 2, ww - 4, 3);
            ctx.fillStyle = "rgba(30,40,55,0.35)";          // sill shadow
            ctx.fillRect(x, y + wh - 2, ww, 2);
            if (Math.random() < 0.12) { ctx.fillStyle = "#b9bfc4"; ctx.fillRect(x + ww / 2 - 4, y + wh - 6, 8, 5); } // AC unit
            ctx.strokeStyle = "rgba(40,55,75,0.3)";
            ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, wh - 1);
          }
        }
        const t = new THREE.CanvasTexture(canvas);
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      }

      /* ============================================================
       *  OCEAN — vertex-shader water (no CPU work)
       * ============================================================ */
      function createOcean() {
        const geo = new THREE.PlaneGeometry(
          groundSize * 1.4,
          groundSize * 1.6,
          120,
          80
        );

        const uniforms = {
          uTime: { value: 0 },
          uColorDeep: { value: new THREE.Color(0x012845) },
          uColorShallow: { value: new THREE.Color(0x0a7fb8) },
          uColorFoam: { value: new THREE.Color(0xeaf6ff) },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        };

        const mat = new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          vertexShader: /* glsl */ `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vWaveHeight;

            float wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
              return sin(dot(p, dir) * freq + uTime * speed) * amp;
            }

            void main() {
              vec3 pos = position;
              vec2 p = pos.xy;
              float h = 0.0;
              h += wave(p, vec2(1.0, 0.2), 0.045, 0.9, 3.0);
              h += wave(p, vec2(0.3, 1.0), 0.06,  1.3, 1.8);
              h += wave(p, vec2(0.8, -0.4),0.10,  1.7, 1.0);
              h += wave(p, vec2(-0.6,0.9), 0.022, 0.6, 2.4);
              pos.z += h;
              vWaveHeight = h;

              // approximate normal via derivative
              float e = 1.0;
              float hL = 0.0, hR = 0.0, hD = 0.0, hU = 0.0;
              vec2 pl = p + vec2(-e, 0.0);
              vec2 pr = p + vec2( e, 0.0);
              vec2 pd = p + vec2(0.0,-e);
              vec2 pu = p + vec2(0.0, e);
              hL += wave(pl,vec2(1.0,0.2),0.045,0.9,3.0);
              hL += wave(pl,vec2(0.3,1.0),0.06, 1.3,1.8);
              hL += wave(pl,vec2(0.8,-0.4),0.10,1.7,1.0);
              hL += wave(pl,vec2(-0.6,0.9),0.022,0.6,2.4);
              hR += wave(pr,vec2(1.0,0.2),0.045,0.9,3.0);
              hR += wave(pr,vec2(0.3,1.0),0.06, 1.3,1.8);
              hR += wave(pr,vec2(0.8,-0.4),0.10,1.7,1.0);
              hR += wave(pr,vec2(-0.6,0.9),0.022,0.6,2.4);
              hD += wave(pd,vec2(1.0,0.2),0.045,0.9,3.0);
              hD += wave(pd,vec2(0.3,1.0),0.06, 1.3,1.8);
              hD += wave(pd,vec2(0.8,-0.4),0.10,1.7,1.0);
              hD += wave(pd,vec2(-0.6,0.9),0.022,0.6,2.4);
              hU += wave(pu,vec2(1.0,0.2),0.045,0.9,3.0);
              hU += wave(pu,vec2(0.3,1.0),0.06, 1.3,1.8);
              hU += wave(pu,vec2(0.8,-0.4),0.10,1.7,1.0);
              hU += wave(pu,vec2(-0.6,0.9),0.022,0.6,2.4);
              vec3 n = normalize(vec3(hL - hR, hD - hU, 2.0 * e));
              vNormal = (modelMatrix * vec4(n, 0.0)).xyz;

              vec4 wp = modelMatrix * vec4(pos, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3 uColorDeep;
            uniform vec3 uColorShallow;
            uniform vec3 uColorFoam;
            uniform vec3 uSunDir;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vWaveHeight;

            void main() {
              vec3 n = normalize(vNormal);
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

              // Mix based on wave height & fresnel
              float depthMix = clamp(0.5 + vWaveHeight * 0.12, 0.0, 1.0);
              vec3 col = mix(uColorDeep, uColorShallow, depthMix);

              // Sun specular highlight
              vec3 h = normalize(viewDir + uSunDir);
              float spec = pow(max(dot(n, h), 0.0), 80.0);
              col += spec * vec3(1.0, 0.9, 0.7) * 1.5;

              // Foam on peaks
              float foam = smoothstep(2.2, 3.4, vWaveHeight);
              col = mix(col, uColorFoam, foam * 0.6);

              // Subtle sky reflection via fresnel
              col = mix(col, vec3(0.7, 0.85, 1.0), fres * 0.35);

              gl_FragColor = vec4(col, 0.95);
            }
          `,
        });

        oceanMesh = new THREE.Mesh(geo, mat);
        oceanMesh.rotation.x = -Math.PI / 2;
        oceanMesh.position.set(
          0,
          -1.0 + terrainAmp + 0.05,
          boardwalkEndZ + (groundSize * 1.6) / 2
        );
        oceanMesh.receiveShadow = false;
        scene.add(oceanMesh);
      }

      /* ============================================================
       *  BOARDWALK + BEACH + RAILING + LAMPPOSTS + BENCHES
       *  Real Coney layout (south of rides): wooden plank boardwalk,
       *  then 50ft of sand, then surf.
       * ============================================================ */

      // Procedural plank texture for the boardwalk
      function createPlankTexture() {
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        // base wood
        const baseGrad = ctx.createLinearGradient(0, 0, 0, 256);
        baseGrad.addColorStop(0, "#a87a4f");
        baseGrad.addColorStop(1, "#8a6238");
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, 256, 256);
        // Planks running along Y axis (will be oriented to E-W)
        const plankWidth = 24;
        for (let y = 0; y < 256; y += plankWidth) {
          // Plank tint variation
          const lightness = 28 + Math.random() * 24;
          ctx.fillStyle = `hsl(${22 + Math.random() * 12}, ${30 + Math.random() * 20}%, ${lightness}%)`;
          ctx.fillRect(0, y, 256, plankWidth - 1);
          // gap shadow
          ctx.fillStyle = "rgba(20, 12, 6, 0.65)";
          ctx.fillRect(0, y + plankWidth - 1, 256, 1);
          // grain
          ctx.strokeStyle = "rgba(60, 35, 18, 0.18)";
          ctx.lineWidth = 1;
          for (let g = 0; g < 4; g++) {
            ctx.beginPath();
            ctx.moveTo(0, y + 2 + g * 6 + Math.random() * 2);
            ctx.bezierCurveTo(
              64, y + 4 + g * 6,
              192, y + 1 + g * 6,
              256, y + 3 + g * 6
            );
            ctx.stroke();
          }
          // nail heads at ends
          ctx.fillStyle = "#2a1a0d";
          ctx.beginPath(); ctx.arc(8, y + plankWidth / 2, 1.4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(248, y + plankWidth / 2, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }

      // Procedural sand texture
      function createSandTexture() {
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#d8b87a");
        grad.addColorStop(1, "#c4a169");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        // Fine grain noise
        const img = ctx.getImageData(0, 0, 256, 256);
        for (let i = 0; i < img.data.length; i += 4) {
          const n = (Math.random() - 0.5) * 30;
          img.data[i]     = Math.max(0, Math.min(255, img.data[i]     + n));
          img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n * 0.8));
          img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.5));
        }
        ctx.putImageData(img, 0, 0);
        // Subtle footprints / divots
        ctx.fillStyle = "rgba(120, 85, 45, 0.18)";
        for (let i = 0; i < 60; i++) {
          ctx.beginPath();
          ctx.arc(Math.random() * 256, Math.random() * 256, 1.5 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }

      // Module-scoped exposure for new geometry
      let boardwalkZ, boardwalkSouthZ; // for spawning seagulls/pier/people

      function createBoardwalkAndBeach() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const W = groundSize * 0.95; // E-W length of boardwalk and sand

        // The boardwalk strip sits between the rides and the sand
        const boardwalkDepth = 14;
        // Place boardwalk just south of the rides cluster (rides are at z ~ -30..30)
        const bwCenterZ = 38;
        boardwalkZ = bwCenterZ;

        // Plank texture
        const plankTex = createPlankTexture();
        plankTex.repeat.set(W / 5, boardwalkDepth / 5);

        const bwMat = new THREE.MeshStandardMaterial({
          map: plankTex, roughness: 0.85, metalness: 0.02,
        });
        const bw = new THREE.Mesh(
          new THREE.PlaneGeometry(W, boardwalkDepth, 64, 4),
          bwMat
        );
        bw.rotation.x = -Math.PI / 2;
        bw.position.set(0, baseY + 0.4, bwCenterZ);
        bw.receiveShadow = true;
        scene.add(bw);

        // Boardwalk side trim (wooden lip on north + south edges)
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 });
        const trimN = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, 0.6), trimMat);
        trimN.position.set(0, baseY + 0.4, bwCenterZ - boardwalkDepth / 2);
        trimN.castShadow = true; trimN.receiveShadow = true;
        scene.add(trimN);
        const trimS = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, 0.6), trimMat);
        trimS.position.set(0, baseY + 0.4, bwCenterZ + boardwalkDepth / 2);
        trimS.castShadow = true; trimS.receiveShadow = true;
        scene.add(trimS);

        // Sand: dry berm behind, then a real shore slope that runs down under the waterline
        boardwalkSouthZ = bwCenterZ + boardwalkDepth / 2;
        const sandDepth = 140 - boardwalkSouthZ;                 // extends past the waterline
        const sandCenterZ = boardwalkSouthZ + sandDepth / 2;
        const sandTex = createSandTexture();
        sandTex.repeat.set(W / 20, sandDepth / 20);
        const sandMat = new THREE.MeshStandardMaterial({
          map: sandTex, roughness: 0.95, metalness: 0,
        });
        const sandGeom = new THREE.PlaneGeometry(W, sandDepth, 96, 28);
        {
          const pa = sandGeom.getAttribute('position');
          const vv = new THREE.Vector3();
          for (let i = 0; i < pa.count; i++) {
            vv.fromBufferAttribute(pa, i);
            const lz = sandCenterZ - vv.y;                       // world-local z of this vertex
            const ripple = Math.sin(vv.x * 0.08) * 0.06 + Math.sin(vv.x * 0.021 + lz * 0.2) * 0.05;
            let y = 0.62 + ripple;                               // dry sand height
            if (lz > 70) { const u = Math.min(1, (lz - 70) / 70); y = (0.62 + ripple) * (1 - u) + (-2.4) * u; }
            pa.setZ(i, y - (baseY + 0.05));
          }
          sandGeom.computeVertexNormals();
        }
        const sand = new THREE.Mesh(sandGeom, sandMat);
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(0, baseY + 0.05, sandCenterZ);
        sand.receiveShadow = true;
        scene.add(sand);

        // Cover the strip north of the boardwalk (between streets and boardwalk)
        // with a worn asphalt/concrete plaza so the rides have a floor.
        const plazaDepth = bwCenterZ - boardwalkDepth / 2 - streetGridEndZ;
        if (plazaDepth > 1) {
          const plazaCenterZ = streetGridEndZ + plazaDepth / 2;
          const plaza = new THREE.Mesh(
            new THREE.PlaneGeometry(W, plazaDepth),
            new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.92, metalness: 0.03 })
          );
          plaza.rotation.x = -Math.PI / 2;
          plaza.position.set(0, baseY + 0.05, plazaCenterZ);
          plaza.receiveShadow = true;
          scene.add(plaza);
        }

        // Ocean-side railing along the boardwalk
        const railingMat = new THREE.MeshStandardMaterial({
          color: 0x2c3540, metalness: 0.7, roughness: 0.45,
        });
        const railTop = new THREE.Mesh(
          new THREE.BoxGeometry(W, 0.08, 0.15), railingMat
        );
        railTop.position.set(0, baseY + 1.5, bwCenterZ + boardwalkDepth / 2 - 0.2);
        railTop.castShadow = true;
        scene.add(railTop);
        const railMid = new THREE.Mesh(
          new THREE.BoxGeometry(W, 0.05, 0.1), railingMat
        );
        railMid.position.set(0, baseY + 0.9, bwCenterZ + boardwalkDepth / 2 - 0.2);
        scene.add(railMid);
        // Posts (instanced)
        const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6);
        const postCount = Math.floor(W / 4);
        const postInst = new THREE.InstancedMesh(postGeom, railingMat, postCount);
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < postCount; i++) {
          const x = -W / 2 + (i + 0.5) * (W / postCount);
          v.set(x, baseY + 0.75, bwCenterZ + boardwalkDepth / 2 - 0.2);
          m4.compose(v, q, s);
          postInst.setMatrixAt(i, m4);
        }
        postInst.instanceMatrix.needsUpdate = true;
        postInst.castShadow = true;
        scene.add(postInst);

        // Lampposts every 30ft along the boardwalk (instanced)
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x1a2230, metalness: 0.6, roughness: 0.5,
        });
        const lampGeom = new THREE.CylinderGeometry(0.12, 0.18, 5, 6);
        const lampCount = Math.floor(W / 12);
        const lampInst = new THREE.InstancedMesh(lampGeom, lampMat, lampCount);
        lampInst.castShadow = true;
        // Bulb at top of each lamp — separate emissive InstancedMesh
        const bulbGeom = new THREE.SphereGeometry(0.32, 8, 6);
        const bulbMat = new THREE.MeshStandardMaterial({
          color: 0xfff6c8, emissive: 0xffd07a, emissiveIntensity: 0.4,
        });
        const bulbInst = new THREE.InstancedMesh(bulbGeom, bulbMat, lampCount);
        bulbMeshes.push(bulbInst);
        for (let i = 0; i < lampCount; i++) {
          const x = -W / 2 + (i + 0.5) * (W / lampCount);
          v.set(x, baseY + 2.5, bwCenterZ - boardwalkDepth / 2 + 1.0);
          m4.compose(v, q, s);
          lampInst.setMatrixAt(i, m4);
          v.set(x, baseY + 5.1, bwCenterZ - boardwalkDepth / 2 + 1.0);
          m4.compose(v, q, s);
          bulbInst.setMatrixAt(i, m4);
        }
        lampInst.instanceMatrix.needsUpdate = true;
        bulbInst.instanceMatrix.needsUpdate = true;
        scene.add(lampInst);
        scene.add(bulbInst);

        // Benches between lampposts
        const benchGeom = new THREE.BoxGeometry(2.4, 0.4, 0.7);
        const benchMat = new THREE.MeshStandardMaterial({
          color: 0x4a3220, roughness: 0.85,
        });
        const benchCount = Math.floor(W / 14);
        const benchInst = new THREE.InstancedMesh(benchGeom, benchMat, benchCount);
        benchInst.castShadow = true;
        for (let i = 0; i < benchCount; i++) {
          const x = -W / 2 + 6 + i * (W / benchCount);
          v.set(x, baseY + 0.7, bwCenterZ + 2.5);
          m4.compose(v, q, s);
          benchInst.setMatrixAt(i, m4);
        }
        benchInst.instanceMatrix.needsUpdate = true;
        scene.add(benchInst);
      }

      /* ============================================================
       *  SUBWAY LINES
       * ============================================================ */
      function createSubwayLines(count) {
        disposeObject(subwayGroup);
        trains.length = 0;
        subwayGroup = new THREE.Group();
        scene.add(subwayGroup);
        if (count <= 0) return;

        const configs = [
          { position: new THREE.Vector3(0, 0, -70), length: 1800, heightOffset: 18, addStations: true },
          { position: new THREE.Vector3(0, 0, -180), length: 1900, heightOffset: 20, addStations: false },
          { position: new THREE.Vector3(0, 0, -290), length: 2000, heightOffset: 22, addStations: false },
          { position: new THREE.Vector3(0, 0, -400), length: 2100, heightOffset: 24, addStations: false },
          { position: new THREE.Vector3(0, 0, -510), length: 2200, heightOffset: 26, addStations: true },
          { position: new THREE.Vector3(0, 0, -620), length: 2300, heightOffset: 28, addStations: false },
        ];

        const trackMat = new THREE.MeshStandardMaterial({
          color: 0x3a4350, metalness: 0.7, roughness: 0.45,
        });
        const pillarMat = new THREE.MeshStandardMaterial({
          color: 0x5a6470, metalness: 0.25, roughness: 0.75,
        });
        const stationMat = new THREE.MeshStandardMaterial({
          color: 0xa0adaf, roughness: 0.8,
        });
        const stationRoofMat = new THREE.MeshStandardMaterial({
          color: 0x6a3d20, roughness: 0.85,
        });
        const trainMat = new THREE.MeshStandardMaterial({
          color: 0xc0d2e8, metalness: 0.7, roughness: 0.25,
          emissive: 0x223344, emissiveIntensity: 0.2,
        });
        const trainCarGeom = new THREE.BoxGeometry(12, 3, 2.5);
        const pillarGeom = new THREE.CylinderGeometry(1.2, 1.2, 1, 10);
        /* R68-style stainless car sides: corrugation, window band, door pairs, orange F bullet */
        const trainSideTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128;
          const g = c.getContext('2d');
          const bg = g.createLinearGradient(0, 0, 0, 128);
          bg.addColorStop(0, '#dde5ee'); bg.addColorStop(0.5, '#b8c2cd'); bg.addColorStop(1, '#929ca7');
          g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
          for (let y = 8; y < 128; y += 9) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0, y, 512, 2);
            g.fillStyle = 'rgba(60,70,80,0.14)'; g.fillRect(0, y + 2, 512, 1); }
          g.fillStyle = '#16222e'; g.fillRect(0, 28, 512, 34);
          for (let x = 14; x < 470, x < 512 - 44; x += 64) { g.fillStyle = '#31465c'; g.fillRect(x, 32, 42, 26);
            g.fillStyle = 'rgba(200,225,255,0.3)'; g.fillRect(x + 2, 34, 38, 6); }
          for (const dx of [128, 320]) { g.fillStyle = '#8b95a0'; g.fillRect(dx, 20, 4, 90); g.fillRect(dx + 44, 20, 4, 90);
            g.fillStyle = '#22303c'; g.fillRect(dx + 18, 30, 12, 62); }
          g.fillStyle = '#ff6319'; g.beginPath(); g.arc(486, 92, 14, 0, 6.283); g.fill();
          g.fillStyle = '#fff'; g.font = 'bold 20px Helvetica,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 486, 93);
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
        /* windows-only emissive map so cars glow warm from inside at night */
        const trainGlowTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128;
          const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128);
          for (let x = 14; x < 512 - 44; x += 64) { g.fillStyle = '#ffdf9e'; g.fillRect(x, 32, 42, 26); }
          for (const dx of [128, 320]) { g.fillStyle = '#ffe7b0'; g.fillRect(dx + 18, 30, 12, 62); }
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
        const trainSideMat = new THREE.MeshStandardMaterial({ map: trainSideTex, metalness: 0.5, roughness: 0.38,
          emissive: 0xffedb8, emissiveMap: trainGlowTex, emissiveIntensity: 0 });
        trainSideMat.userData.nightGlow = 0.95;   // survives the Lambert conversion via userData
        const bogGeom = new THREE.BoxGeometry(2.2, 0.8, 1.9);
        const bogMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.9 });
        const trainEndMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.55, roughness: 0.42 });
        const trainCarMats = [trainEndMat, trainEndMat, trainEndMat, trainEndMat, trainSideMat, trainSideMat];

        for (let i = 0; i < count && i < configs.length; i++) {
          const cfg = configs[i];
          const group = new THREE.Group();

          const trackYPos = groundMesh.position.y + terrainAmp + cfg.heightOffset;
          const trackGeom = new THREE.BoxGeometry(cfg.length, 1.5, 5);
          const track = new THREE.Mesh(trackGeom, trackMat);
          track.position.set(cfg.position.x, trackYPos, cfg.position.z);
          track.castShadow = true;
          track.receiveShadow = true;
          group.add(track);

          // Pillars - use InstancedMesh for performance
          const pillarSpacing = 45;
          const pillarCount = Math.floor(cfg.length / pillarSpacing);
          const pillars = new THREE.InstancedMesh(pillarGeom, pillarMat, pillarCount);
          pillars.castShadow = true;
          const m4 = new THREE.Matrix4();
          let p = 0;
          for (
            let j = -cfg.length / 2 + pillarSpacing / 2;
            j <= cfg.length / 2 - pillarSpacing / 2 && p < pillarCount;
            j += pillarSpacing
          ) {
            const px = cfg.position.x + j;
            const baseY = groundMesh.position.y + getTerrainHeight(px, cfg.position.z);
            m4.makeScale(1, cfg.heightOffset, 1);
            m4.setPosition(px, baseY + cfg.heightOffset / 2, cfg.position.z);
            pillars.setMatrixAt(p++, m4);
          }
          pillars.count = p;
          pillars.instanceMatrix.needsUpdate = true;
          group.add(pillars);

          // Stations — line 0 gets the real Brighton/Culver line stops with MTA signage
          if (cfg.addStations && i === 0) {
            const stops = [
              { name: 'CONEY ISLAND–STILLWELL AV', x: -600, bullets: [['D','#ff6319'],['F','#ff6319'],['N','#fccc0a'],['Q','#fccc0a']], terminal: true },
              { name: 'W 8 ST–NY AQUARIUM',        x: -200, bullets: [['F','#ff6319'],['Q','#fccc0a']] },
              { name: 'OCEAN PKWY',                x:  150, bullets: [['Q','#fccc0a']] },
              { name: 'BRIGHTON BEACH',            x:  550, bullets: [['B','#ff6319'],['Q','#fccc0a']] },
            ];
            subwayStations = stops.map(s => ({ name: s.name, x: cfg.position.x + s.x, z: cfg.position.z }));
            const mkStationSign = (st) => {
              const c = document.createElement('canvas'); c.width = 512; c.height = 96;
              const g = c.getContext('2d');
              g.fillStyle = '#0f0f0f'; g.fillRect(0, 0, 512, 96);
              g.fillStyle = '#fff'; g.fillRect(0, 6, 512, 3);
              g.font = 'bold 34px Helvetica,Arial,sans-serif'; g.fillStyle = '#fff';
              g.textAlign = 'left'; g.textBaseline = 'middle';
              g.fillText(st.name, 16, 52);
              let bx = 500 - st.bullets.length * 42;
              for (const [ltr, col] of st.bullets) {
                g.fillStyle = col; g.beginPath(); g.arc(bx + 18, 52, 18, 0, 6.283); g.fill();
                g.fillStyle = (col === '#fccc0a') ? '#000' : '#fff';
                g.font = 'bold 26px Helvetica,Arial,sans-serif'; g.textAlign = 'center';
                g.fillText(ltr, bx + 18, 53); g.textAlign = 'left';
                g.font = 'bold 34px Helvetica,Arial,sans-serif'; bx += 42;
              }
              const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
            };
            for (const st of stops) {
              const sx = cfg.position.x + st.x;
              const pw = st.terminal ? 78 : 52, pd = 14, rh = 5;
              const platform = new THREE.Mesh(new THREE.BoxGeometry(pw, 1, pd), stationMat);
              platform.position.set(sx, trackYPos - 1, cfg.position.z + pd / 2 + 2.5);
              platform.castShadow = true; platform.receiveShadow = true; group.add(platform);
              const roof = new THREE.Mesh(new THREE.BoxGeometry(pw + 5, rh, pd + 2), stationRoofMat);
              roof.position.set(sx, trackYPos + rh / 2 + 1.5, cfg.position.z + pd / 2 + 2.5);
              roof.castShadow = true; group.add(roof);
              const edge = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.07, 0.55),   // yellow tactile platform edge
                new THREE.MeshStandardMaterial({ color: 0xf7c948, roughness: 0.6 }));
              edge.position.set(sx, trackYPos - 0.46, cfg.position.z + 3.0);
              group.add(edge);
              const benchM = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.85 });
              for (const bx of [-pw / 4, pw / 4]) {
                const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.8), benchM);
                bench.position.set(sx + bx, trackYPos - 0.2, cfg.position.z + pd / 2 + 6.5);
                group.add(bench); }
              const signMat = new THREE.MeshBasicMaterial({ map: mkStationSign(st) });
              for (const dz of [-1, 1]) {
                const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), signMat);
                sign.position.set(sx, trackYPos + 3.6, cfg.position.z + pd / 2 + 2.5 + dz * (pd / 2 - 0.5));
                if (dz < 0) sign.rotation.y = Math.PI;
                group.add(sign);
              }
              const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, rh + 2, 6),
                new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.7 }), 6);
              const cm = new THREE.Matrix4();
              for (let ci = 0; ci < 6; ci++) { cm.setPosition(sx - pw / 2 + (ci + 0.5) * (pw / 6), trackYPos + rh / 2 - 1, cfg.position.z + pd / 2 + 2.5);
                cols.setMatrixAt(ci, cm); }
              group.add(cols);

              /* ---- shared authentic furniture: hunter-green windscreens w/ ad posters, stairs to street ---- */
              const green = new THREE.MeshStandardMaterial({ color: 0x1e4d3b, metalness: 0.35, roughness: 0.6 });
              const adTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64;
                const g2 = c.getContext('2d'); const cols2 = ['#e8503a', '#2a7fd4', '#f2b430'];
                for (let k = 0; k < 3; k++) { g2.fillStyle = '#f4f1ea'; g2.fillRect(k * 86 + 4, 4, 78, 56);
                  g2.fillStyle = cols2[k]; g2.fillRect(k * 86 + 8, 8, 70, 34);
                  g2.fillStyle = '#333'; g2.fillRect(k * 86 + 8, 46, 70, 4); g2.fillRect(k * 86 + 8, 53, 50, 3); }
                const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
              const screen = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.6, 2.4, 0.15), green);
              screen.position.set(sx, trackYPos + 0.75, cfg.position.z + pd / 2 + 9.4); group.add(screen);
              const ads = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.55, 1.7), new THREE.MeshBasicMaterial({ map: adTex }));
              ads.rotation.y = Math.PI; ads.position.set(sx, trackYPos + 0.8, cfg.position.z + pd / 2 + 9.3); group.add(ads);
              { const gY = groundMesh.position.y + terrainAmp + 0.1;  // stairway to the street
                const steps = 20, rise = (trackYPos - 1 - gY) / steps, runZ = 0.95;
                for (let si2 = 0; si2 < steps; si2++) {
                  const stp = new THREE.Mesh(new THREE.BoxGeometry(3, rise, runZ + 0.15), stationMat);
                  stp.position.set(sx + pw / 2 + 2, gY + rise * (si2 + 0.5), cfg.position.z + pd / 2 + 2.5 + (steps - si2) * runZ);
                  group.add(stp); }
                const runL = steps * runZ;
                for (const rx of [-1.6, 1.6]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, Math.hypot(runL, trackYPos - 1 - gY)), green);
                  rail.position.set(sx + pw / 2 + 2 + rx, gY + (trackYPos - 1 - gY) * 0.55 + 0.5, cfg.position.z + pd / 2 + 2.5 + runL * 0.5);
                  rail.rotation.x = Math.atan2(trackYPos - 1 - gY, runL); group.add(rail); } }

              /* ---- per-station signatures ---- */
              if (st.name.includes('STILLWELL')) {
                // glass barrel-vault train shed with white ribs
                const shed = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, pw + 18, 14, 1, true, 0, Math.PI),
                  new THREE.MeshStandardMaterial({ color: 0xcfe4ee, roughness: 0.25, metalness: 0.15,
                    transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
                shed.rotation.z = Math.PI / 2; shed.position.set(sx, trackYPos + 5.5, cfg.position.z + 2);
                group.add(shed);
                for (let ri = 0; ri <= 6; ri++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(15, 0.18, 6, 18, Math.PI),
                    new THREE.MeshStandardMaterial({ color: 0xe8ebe6, roughness: 0.5, metalness: 0.3 }));
                  rib.rotation.y = Math.PI / 2; rib.position.set(sx - (pw + 18) / 2 + ri * (pw + 18) / 6, trackYPos + 5.5, cfg.position.z + 2);
                  group.add(rib); }
                // cream-brick terminal headhouse with the big arch + name band
                const hh = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 8),
                  new THREE.MeshStandardMaterial({ color: 0xe3cf9e, roughness: 0.85 }));
                hh.position.set(sx, groundMesh.position.y + terrainAmp + 6, cfg.position.z + pd / 2 + 16); group.add(hh);
                const arch = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.7, 8, 16, Math.PI),
                  new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 }));
                arch.position.set(sx, groundMesh.position.y + terrainAmp + 4.5, cfg.position.z + pd / 2 + 20.1); group.add(arch);
                const nb = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 64;
                  const g2 = c.getContext('2d'); g2.fillStyle = '#233c2e'; g2.fillRect(0, 0, 512, 64);
                  g2.fillStyle = '#f2ead6'; g2.font = 'bold 30px Georgia,serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
                  g2.fillText('CONEY ISLAND — STILLWELL AVENUE TERMINAL', 256, 33);
                  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
                const band = new THREE.Mesh(new THREE.PlaneGeometry(28, 3.2), new THREE.MeshBasicMaterial({ map: nb }));
                band.position.set(sx, groundMesh.position.y + terrainAmp + 10.2, cfg.position.z + pd / 2 + 20.05); group.add(band);
                // second island platform (it's an 8-track terminal)
                const p2 = new THREE.Mesh(new THREE.BoxGeometry(pw, 1, pd * 0.7), stationMat);
                p2.position.set(sx, trackYPos - 1, cfg.position.z - pd * 0.55); p2.receiveShadow = true; group.add(p2);
              } else if (st.name.includes('AQUARIUM')) {
                // W 8 St: stacked second deck + the curved white screen + footbridge toward the beach
                const deck2 = new THREE.Mesh(new THREE.BoxGeometry(pw, 1, pd * 0.8), stationMat);
                deck2.position.set(sx, trackYPos + 5.5, cfg.position.z + pd / 2 + 2.5); group.add(deck2);
                const curve = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, pw, 16, 1, true, Math.PI * 0.15, Math.PI * 0.7),
                  new THREE.MeshStandardMaterial({ color: 0xe8eaea, roughness: 0.55, metalness: 0.2,
                    transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
                curve.rotation.z = Math.PI / 2; curve.position.set(sx, trackYPos + 3, cfg.position.z - 3.5); group.add(curve);
                const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 46), stationMat);
                bridge.position.set(sx, trackYPos - 1, cfg.position.z + pd / 2 + 26); group.add(bridge);
                for (const bx of [-1.7, 1.7]) { const br2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 46), green);
                  br2.position.set(sx + bx, trackYPos - 0.2, cfg.position.z + pd / 2 + 26); group.add(br2); }
              } else if (st.name.includes('OCEAN')) {
                // Ocean Pkwy: concrete viaduct — parapet walls + arched spandrels
                const conc = new THREE.MeshStandardMaterial({ color: 0xd3cdc0, roughness: 0.9 });
                for (const dz of [-1, 1]) { const parapet = new THREE.Mesh(new THREE.BoxGeometry(pw + 8, 1.6, 0.5), conc);
                  parapet.position.set(sx, trackYPos + 0.3, cfg.position.z + dz * 3.4); group.add(parapet); }
                for (let ai = 0; ai < 4; ai++) { const archV = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.0, 6, 12, Math.PI), conc);
                  archV.position.set(sx - 22 + ai * 15, groundMesh.position.y + terrainAmp + 4.4, cfg.position.z);
                  group.add(archV); }
              } else {
                // Brighton Beach: dark-steel el — lattice girders under the platform
                const steel = new THREE.MeshStandardMaterial({ color: 0x2e3d33, metalness: 0.5, roughness: 0.55 });
                const girder = new THREE.Mesh(new THREE.BoxGeometry(pw + 6, 1.4, 0.4), steel);
                girder.position.set(sx, trackYPos - 2.2, cfg.position.z + 2.8); group.add(girder);
                for (let li = 0; li < 10; li++) { const diag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), steel);
                  diag.position.set(sx - (pw + 6) / 2 + li * (pw + 6) / 9, trackYPos - 2.2, cfg.position.z + 2.8);
                  diag.rotation.z = (li % 2 ? 1 : -1) * 0.7; group.add(diag); }
              }
            }
          }

          subwayGroup.add(group);

          // Trains
          const trainsOnLine = 2;
          for (let k = 0; k < trainsOnLine; k++) {
            const train = new THREE.Group();
            train.userData = { isTrain: true, numCars: NUM_CARS_PER_TRAIN };
            for (let j = 0; j < NUM_CARS_PER_TRAIN; j++) {
              const car = new THREE.Mesh(trainCarGeom, trainCarMats);
              car.position.x = j * -13;
              car.castShadow = true;
              train.add(car);
              for (const bx of [-3.6, 3.6]) {                       // undercarriage bogies
                const bog = new THREE.Mesh(bogGeom, bogMat);
                bog.position.set(car.position.x + bx, -1.85, 0);
                train.add(bog); }
            }
            const startX = cfg.position.x + (k === 0 ? -cfg.length / 2 : cfg.length / 2);
            train.position.set(startX, trackYPos + 1.5 + 0.75, cfg.position.z);
            subwayGroup.add(train);
            trains.push({
              mesh: train,
              speed: (k === 0 ? 1.5 : -1.5) * (Math.random() * 0.2 + 0.9),
              trackLength: cfg.length,
              trackCenterX: cfg.position.x,
              stations: (i === 0 && subwayStations.length) ? subwayStations.map(s => s.x) : null,
              dwell: 0, lastStop: null, atStation: null,
            });
          }
        }
      }

      /* ============================================================
       *  HIGHWAYS
       * ============================================================ */
      function createHighways(count) {
        disposeObject(highwayGroup);
        highwayGroup = new THREE.Group();
        scene.add(highwayGroup);
        if (count <= 0) return;

        const configs = [
          { z: -700, heightOffset: 35 },
          { z: -850, heightOffset: 40 },
          { z: -1000, heightOffset: 45 },
          { z: -1150, heightOffset: 50 },
        ];
        const roadMat = new THREE.MeshStandardMaterial({ color: 0x444a52, roughness: 0.85 });
        const lineMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.6, emissive: 0xfafafa, emissiveIntensity: 0.05,
        });
        const pillarMat = new THREE.MeshStandardMaterial({
          color: 0x6a7280, metalness: 0.2, roughness: 0.8,
        });
        const pillarGeom = new THREE.CylinderGeometry(2, 2.5, 1, 12);

        for (let i = 0; i < count && i < configs.length; i++) {
          const cfg = configs[i];
          const g = new THREE.Group();
          const len = groundSize * 0.95;
          const wd = 25;
          const y = groundMesh.position.y + terrainAmp + cfg.heightOffset;
          const road = new THREE.Mesh(
            new THREE.BoxGeometry(len, 2, wd),
            roadMat
          );
          road.position.set(0, y - 1, cfg.z);
          road.castShadow = true;
          road.receiveShadow = true;
          g.add(road);

          // Lines
          const lineGeom = new THREE.BoxGeometry(len, 0.1, 0.15);
          const off = wd / 4;
          [-off, off].forEach((dz) => {
            const line = new THREE.Mesh(lineGeom, lineMat);
            line.position.set(0, y + 0.05, cfg.z + dz);
            g.add(line);
          });

          // Pillars (instanced)
          const spacing = 60;
          const pCount = Math.floor(len / spacing);
          const pillars = new THREE.InstancedMesh(pillarGeom, pillarMat, pCount);
          pillars.castShadow = true;
          const m4 = new THREE.Matrix4();
          let p = 0;
          for (
            let j = -len / 2 + spacing / 2;
            j <= len / 2 - spacing / 2 && p < pCount;
            j += spacing
          ) {
            const baseY = groundMesh.position.y + getTerrainHeight(j, cfg.z);
            m4.makeScale(1, cfg.heightOffset, 1);
            m4.setPosition(j, baseY + cfg.heightOffset / 2, cfg.z);
            pillars.setMatrixAt(p++, m4);
          }
          pillars.count = p;
          pillars.instanceMatrix.needsUpdate = true;
          g.add(pillars);

          highwayGroup.add(g);
          g.userData.highwayRoad = road;
        }
      }

      /* ============================================================
       *  VEHICLES (Buses + Cars) — InstancedMesh per color
       * ============================================================ */
      function createVehicles(busCount, carCount) {
        disposeObject(vehicleGroup);
        buses.length = 0;
        cars.length = 0;
        vehicleGroup = new THREE.Group();
        scene.add(vehicleGroup);

        if (busCount <= 0 && carCount <= 0) return;

        // Find e-w streets
        const ewStreets = [];
        scene.traverse((object) => {
          if (
            object.isMesh &&
            object.geometry instanceof THREE.PlaneGeometry &&
            object.geometry.parameters.width === gridLength &&
            object.userData.isEWStreet
          ) {
            ewStreets.push(object);
          }
        });

        // --- Buses (single instanced mesh) ---
        if (busCount > 0 && ewStreets.length > 0) {
          const busGeom = new THREE.BoxGeometry(6, 2.5, 2);
          const busMat = new THREE.MeshStandardMaterial({
            color: 0x2563eb, metalness: 0.35, roughness: 0.55,
            emissive: 0x0a1530, emissiveIntensity: 0.15,
          });
          const inst = new THREE.InstancedMesh(busGeom, busMat, busCount);
          inst.castShadow = true;
          const m4 = new THREE.Matrix4();
          for (let i = 0; i < busCount; i++) {
            const street = ewStreets[i % ewStreets.length];
            const startX = Math.random() * gridLength - gridLength / 2;
            const busY = street.position.y + 1.25;
            m4.makeTranslation(startX, busY, street.position.z);
            inst.setMatrixAt(i, m4);
            buses.push({
              idx: i,
              x: startX,
              y: busY,
              z: street.position.z,
              speed: (Math.random() * 0.5 + 0.3) * (i < busCount / 2 ? 1 : -1),
              streetLength: gridLength,
            });
          }
          inst.instanceMatrix.needsUpdate = true;
          vehicleGroup.add(inst);
          vehicleGroup.userData.busInst = inst;
        }

        // --- Cars (multi-piece: lower body + cabin) ---
        const carGeom = new THREE.BoxGeometry(4, 0.95, 1.8);
        const cabinGeom = new THREE.BoxGeometry(2.5, 0.75, 1.6);
        const windowMat = new THREE.MeshStandardMaterial({
          color: 0x202830, metalness: 0.45, roughness: 0.2,
          emissive: 0x0a1820, emissiveIntensity: 0.4,
        });
        // NYC street palette: heavy yellow (cabs), then civilian colors,
        // black town cars, NYPD blue/white, occasional brown UPS / white USPS /
        // FedEx purple, etc.
        const carPalette = [
          // Yellow cabs — heaviest weight (8 entries)
          0xfacc15, 0xfacc15, 0xfacc15, 0xfacc15,
          0xfacc15, 0xfacc15, 0xfacc15, 0xfacc15,
          // Black town cars / SUVs (5 entries)
          0x111418, 0x111418, 0x111418, 0x111418, 0x111418,
          // Silvers / whites (5)
          0xc8ccd2, 0xeaeaea, 0xc8ccd2, 0xffffff, 0xa8acb2,
          // NYPD blue (2)
          0x1f3a8a, 0x1f3a8a,
          // Civilian color mix
          0xef4444, 0x22c55e, 0xf97316, 0x06b6d4, 0xa855f7, 0x8b4513,
          // UPS brown, FedEx purple, school bus yellow
          0x6a4520, 0x6a3a8a, 0xfdd835,
        ];
        const highwayRatio =
          highwayGroup.children.length > 0 ? 0.4 : 0;
        const numHighway = Math.floor(carCount * highwayRatio);
        const numStreet = carCount - numHighway;

        if (carCount > 0) {
          // Use InstancedMesh with per-instance color
          const carMatBase = new THREE.MeshPhysicalMaterial({
            metalness: 0.7, roughness: 0.35,
            clearcoat: 0.85, clearcoatRoughness: 0.15,
            envMapIntensity: 1.2,
          });
          const carInst = new THREE.InstancedMesh(carGeom, carMatBase, carCount);
          carInst.castShadow = true;
          carInst.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(carCount * 3), 3
          );
          // Cabin: separate InstancedMesh that tracks the body, dark glass
          const cabinInst = new THREE.InstancedMesh(cabinGeom, windowMat, carCount);
          cabinInst.castShadow = true;
          const color = new THREE.Color();
          const m4 = new THREE.Matrix4();
          let idx = 0;

          // Street cars
          if (numStreet > 0 && ewStreets.length > 0) {
            for (let i = 0; i < numStreet; i++) {
              const street = ewStreets[Math.floor(Math.random() * ewStreets.length)];
              const startX = Math.random() * gridLength - gridLength / 2;
              const carY = street.position.y + 0.475; // lower body baseline
              m4.makeTranslation(startX, carY, street.position.z);
              carInst.setMatrixAt(idx, m4);
              m4.makeTranslation(startX, carY + 0.85, street.position.z);
              cabinInst.setMatrixAt(idx, m4);
              color.setHex(carPalette[Math.floor(Math.random() * carPalette.length)]);
              carInst.setColorAt(idx, color);
              cars.push({
                idx,
                x: startX, y: carY, z: street.position.z,
                speed: (Math.random() * 0.8 + 0.5) * (Math.random() < 0.5 ? 1 : -1),
                streetLength: gridLength,
                isHighway: false,
              });
              idx++;
            }
          }
          // Highway cars
          if (numHighway > 0 && highwayGroup.children.length > 0) {
            const roads = [];
            highwayGroup.children.forEach((g) => {
              if (g.userData.highwayRoad) roads.push(g.userData.highwayRoad);
            });
            if (roads.length > 0) {
              for (let i = 0; i < numHighway; i++) {
                const road = roads[i % roads.length];
                const len = road.geometry.parameters.width;
                const wd = road.geometry.parameters.depth;
                const carY = road.position.y + 1 + 0.475;
                const lineOff = wd / 4;
                const startX = Math.random() * len - len / 2;
                const laneZ =
                  road.position.z +
                  (Math.random() < 0.5 ? -lineOff / 1.5 : lineOff / 1.5) +
                  (Math.random() * 4 - 2);
                m4.makeTranslation(startX, carY, laneZ);
                carInst.setMatrixAt(idx, m4);
                m4.makeTranslation(startX, carY + 0.85, laneZ);
                cabinInst.setMatrixAt(idx, m4);
                color.setHex(carPalette[Math.floor(Math.random() * carPalette.length)]);
                carInst.setColorAt(idx, color);
                cars.push({
                  idx,
                  x: startX, y: carY, z: laneZ,
                  speed: (Math.random() * 2.5 + 2.0) * (Math.random() < 0.5 ? 1 : -1),
                  streetLength: len,
                  isHighway: true,
                });
                idx++;
              }
            }
          }
          carInst.count = idx;
          cabinInst.count = idx;
          carInst.instanceMatrix.needsUpdate = true;
          cabinInst.instanceMatrix.needsUpdate = true;
          if (carInst.instanceColor) carInst.instanceColor.needsUpdate = true;
          vehicleGroup.add(carInst);
          vehicleGroup.add(cabinInst);
          vehicleGroup.userData.carInst = carInst;
          vehicleGroup.userData.cabinInst = cabinInst;
        }
      }

      /* ============================================================
       *  PARK / PLAZA HELPERS (simplified, kept)
       * ============================================================ */
      function createTreesAndBushes(count, area, baseY) {
        const group = new THREE.Group();
        // Tree
        const trunkGeom = new THREE.CylinderGeometry(0.4, 0.5, 4, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.92 });
        const leavesGeom = new THREE.IcosahedronGeometry(2.5, 1);
        const leavesMatBase = new THREE.MeshStandardMaterial({ roughness: 0.85 });

        const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, count);
        trunkInst.castShadow = true;
        const leavesInst = new THREE.InstancedMesh(leavesGeom, leavesMatBase, count);
        leavesInst.castShadow = true;
        leavesInst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(count * 3), 3
        );

        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const v = new THREE.Vector3();
        const col = new THREE.Color();

        for (let i = 0; i < count; i++) {
          const tx = area.x + Math.random() * (area.w - 5) - (area.w / 2 - 2.5);
          const tz = area.z + Math.random() * (area.d - 5) - (area.d / 2 - 2.5);
          const ty = groundMesh.position.y + getTerrainHeight(tx, tz);
          // Trunk
          s.set(1, 1, 1);
          v.set(tx, ty + 2, tz);
          m4.compose(v, q, s);
          trunkInst.setMatrixAt(i, m4);
          // Leaves
          const sc = Math.random() * 0.4 + 0.8;
          s.set(sc, sc, sc);
          v.set(tx, ty + 4 + 1.2 * sc, tz);
          m4.compose(v, q, s);
          leavesInst.setMatrixAt(i, m4);
          col.setHSL(0.3 + Math.random() * 0.1, 0.5 + Math.random() * 0.2, 0.3 + Math.random() * 0.1);
          leavesInst.setColorAt(i, col);
        }
        trunkInst.instanceMatrix.needsUpdate = true;
        leavesInst.instanceMatrix.needsUpdate = true;
        if (leavesInst.instanceColor) leavesInst.instanceColor.needsUpdate = true;
        group.add(trunkInst);
        group.add(leavesInst);

        // Bushes
        const numBushes = count * 4;
        const bushGeom = new THREE.IcosahedronGeometry(0.8, 0);
        const bushMatBase = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        const bushInst = new THREE.InstancedMesh(bushGeom, bushMatBase, numBushes);
        bushInst.castShadow = true;
        bushInst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(numBushes * 3), 3
        );
        for (let i = 0; i < numBushes; i++) {
          const bx = area.x + Math.random() * (area.w - 2) - (area.w / 2 - 1);
          const bz = area.z + Math.random() * (area.d - 2) - (area.d / 2 - 1);
          const by = groundMesh.position.y + getTerrainHeight(bx, bz);
          const sc = Math.random() * 0.5 + 0.7;
          s.set(sc, sc, sc);
          v.set(bx, by + 0.4 * sc, bz);
          m4.compose(v, q, s);
          bushInst.setMatrixAt(i, m4);
          col.setHSL(0.3 + Math.random() * 0.15, 0.4 + Math.random() * 0.3, 0.25 + Math.random() * 0.1);
          bushInst.setColorAt(i, col);
        }
        bushInst.instanceMatrix.needsUpdate = true;
        if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
        group.add(bushInst);

        return group;
      }

      function createPlaygroundEquipment(position) {
        const g = new THREE.Group();
        const eqMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.65, roughness: 0.4 });
        const seatMat = new THREE.MeshStandardMaterial({ color: 0xd14848, roughness: 0.6 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.85 });
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.9 });

        // Slide
        const slide = new THREE.Group();
        const slideRamp = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 6), eqMat);
        slideRamp.rotation.x = Math.PI / 6;
        slideRamp.position.set(0, 2, 1.8);
        slideRamp.castShadow = true;
        slide.add(slideRamp);
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.2, 0.2), eqMat);
        ladder.position.set(0, 1.6, -2.4);
        ladder.rotation.x = -Math.PI / 12;
        ladder.castShadow = true;
        slide.add(ladder);
        slide.position.set(position.x + 5, 0, position.z + 5);
        g.add(slide);

        // Swing
        const swing = new THREE.Group();
        const swingPostGeom = new THREE.CylinderGeometry(0.2, 0.2, 5, 6);
        const p1 = new THREE.Mesh(swingPostGeom, eqMat); p1.position.set(-3, 2.5, 0); p1.castShadow = true;
        const p2 = new THREE.Mesh(swingPostGeom, eqMat); p2.position.set(3, 2.5, 0); p2.castShadow = true;
        const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), eqMat);
        topBar.rotation.z = Math.PI / 2; topBar.position.y = 5; topBar.castShadow = true;
        swing.add(p1, p2, topBar);
        const sg = new THREE.BoxGeometry(1, 0.2, 0.5);
        const s1 = new THREE.Mesh(sg, seatMat); s1.position.set(-1.5, 3.5, 0); s1.castShadow = true;
        const s2 = new THREE.Mesh(sg, seatMat); s2.position.set(1.5, 3.5, 0); s2.castShadow = true;
        swing.add(s1, s2);
        swing.position.set(position.x - 3, 0, position.z - 4);
        g.add(swing);

        // Sandbox
        const sb = new THREE.Group();
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), sandMat);
        floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05;
        sb.add(floor);
        const wGeom = new THREE.BoxGeometry(4, 0.3, 0.2);
        const w1 = new THREE.Mesh(wGeom, woodMat); w1.position.set(0, 0.15, 2);
        const w2 = new THREE.Mesh(wGeom, woodMat); w2.position.set(0, 0.15, -2);
        const w3 = new THREE.Mesh(wGeom, woodMat); w3.rotation.y = Math.PI / 2; w3.position.set(2, 0.15, 0);
        const w4 = new THREE.Mesh(wGeom, woodMat); w4.rotation.y = Math.PI / 2; w4.position.set(-2, 0.15, 0);
        sb.add(w1, w2, w3, w4);
        sb.position.set(position.x + 4, 0, position.z - 5);
        g.add(sb);

        return g;
      }

      function createParkArea(config) {
        const { x, z, w, d, addPlayground } = config;
        const g = new THREE.Group();
        const grass = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ color: 0x6b8e23, roughness: 0.92 })
        );
        grass.rotation.x = -Math.PI / 2;
        const parkY = groundMesh.position.y + getTerrainHeight(x, z) + 0.05;
        grass.position.set(x, parkY, z);
        grass.receiveShadow = true;
        g.add(grass);
        g.add(createTreesAndBushes(Math.floor((w * d) / 15), config, parkY));
        if (addPlayground) {
          const pg = createPlaygroundEquipment({ x, z });
          pg.position.y = parkY;
          g.add(pg);
        }
        return g;
      }

      function createPlaza(config) {
        const { x, z, w, d } = config;
        const g = new THREE.Group();
        const stone = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.75 })
        );
        stone.rotation.x = -Math.PI / 2;
        const plazaY = groundMesh.position.y + getTerrainHeight(x, z) + 0.06;
        stone.position.set(x, plazaY, z);
        stone.receiveShadow = true;
        g.add(stone);

        // Benches (instanced)
        const benchGeom = new THREE.BoxGeometry(3, 0.5, 0.8);
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.85 });
        const numBenches = 12;
        const benchInst = new THREE.InstancedMesh(benchGeom, benchMat, numBenches);
        benchInst.castShadow = true;
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < numBenches; i++) {
          const bx = x + (Math.random() * (w * 0.8) - w * 0.4);
          const bz = z + (Math.random() * (d * 0.8) - d * 0.4);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
          v.set(bx, plazaY + 0.25, bz);
          m4.compose(v, q, s);
          benchInst.setMatrixAt(i, m4);
        }
        benchInst.instanceMatrix.needsUpdate = true;
        g.add(benchInst);
        return g;
      }

      /* ============================================================
       *  HELICOPTERS
       * ============================================================ */
      function createHelicopter(position) {
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.75, roughness: 0.3 });
        const rotorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 2.5), bodyMat);
        body.castShadow = true;
        g.add(body);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 5, 6), bodyMat);
        tail.rotation.x = Math.PI / 2;
        tail.position.set(0, 0.5, -3.75);
        tail.castShadow = true;
        g.add(tail);
        const mainRotor = new THREE.Group();
        const bladeGeom = new THREE.BoxGeometry(0.2, 0.1, 7);
        mainRotor.add(new THREE.Mesh(bladeGeom, rotorMat));
        const b2 = new THREE.Mesh(bladeGeom, rotorMat); b2.rotation.y = Math.PI / 2;
        mainRotor.add(b2);
        mainRotor.position.y = 1.2;
        g.add(mainRotor);
        const tailRotor = new THREE.Group();
        const tBladeGeom = new THREE.BoxGeometry(0.1, 0.05, 1.5);
        tailRotor.add(new THREE.Mesh(tBladeGeom, rotorMat));
        const tb2 = new THREE.Mesh(tBladeGeom, rotorMat); tb2.rotation.x = Math.PI / 2;
        tailRotor.add(tb2);
        tailRotor.position.set(0.3, 0.7, -6.2);
        g.add(tailRotor);
        g.position.copy(position);
        helicopters.push({
          mesh: g, mainRotor, tailRotor,
          angle: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.005 + 0.005,
          radius: Math.random() * 150 + 250,
        });
        return g;
      }

      /* ============================================================
       *  PEOPLE — InstancedMesh
       * ============================================================ */
      function createPeople(estPop) {
        disposeObject(peopleGroup);
        people.length = 0;
        peopleGroup = new THREE.Group();
        scene.add(peopleGroup);

        const count = Math.max(0, Math.floor(estPop * VISUAL_PEOPLE_RATIO));
        if (count <= 0) return;

        const personHeight = 1.8;
        // low-poly humanoid (torso + legs + arms merged), heads separate so they keep skin tones
        /* slimmer GTA-ish proportions; shirt / pants / head are separate instanced meshes for real clothing */
        const torso = new THREE.CapsuleGeometry(0.19, 0.52, 4, 8); torso.translate(0, 1.14, 0);
        const armL = new THREE.CapsuleGeometry(0.05, 0.52, 3, 6);
        armL.rotateZ(0.12); armL.translate(-0.28, 1.05, 0);
        const armR = new THREE.CapsuleGeometry(0.05, 0.52, 3, 6);
        armR.rotateZ(-0.12); armR.translate(0.28, 1.05, 0);
        const geom = mergeGeometries([torso, armL, armR]);
        const legL = new THREE.CapsuleGeometry(0.075, 0.68, 3, 6); legL.translate(-0.1, 0.45, 0);
        const legR = legL.clone();                                  legR.translate(0.2, 0, 0);
        const legsGeom = mergeGeometries([legL, legR]);
        const matBase = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        const inst = new THREE.InstancedMesh(geom, matBase, count);
        inst.castShadow = true;
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(count * 3), 3
        );
        const legsInst = new THREE.InstancedMesh(legsGeom, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
        legsInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
        const headGeom = new THREE.SphereGeometry(0.155, 10, 8); headGeom.translate(0, 1.6, 0);
        const headInst = new THREE.InstancedMesh(headGeom, new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
        headInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
        const hairGeom = new THREE.SphereGeometry(0.165, 9, 7, 0, 6.29, 0, 1.7); hairGeom.translate(0, 1.63, -0.01);
        const hairInst = new THREE.InstancedMesh(hairGeom, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
        hairInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        const v = new THREE.Vector3();
        const col = new THREE.Color();

        const boardwalkY = groundMesh.position.y + terrainAmp + 0.5; // on top of planks
        const beachWidth = groundSize;
        const bMinX = -beachWidth * 0.4;
        const bMaxX = beachWidth * 0.4;
        // Walk along the boardwalk (z ~ 32..44) instead of on the sand
        const walkZMin = 32, walkZMax = 44;

        const deckY = groundMesh.position.y + terrainAmp + 0.45;   // feet on the planks
        for (let i = 0; i < count; i++) {
          const startX = Math.random() * (bMaxX - bMinX) + bMinX;
          const startZ = walkZMin + Math.random() * (walkZMax - walkZMin);
          const targetZ = walkZMin + Math.random() * (walkZMax - walkZMin);
          v.set(startX, deckY, startZ);
          m4.compose(v, q, s);
          inst.setMatrixAt(i, m4);
          headInst.setMatrixAt(i, m4);
          legsInst.setMatrixAt(i, m4);
          col.setHSL(Math.random(), 0.45 + Math.random() * 0.3, 0.35 + Math.random() * 0.3);  // shirts
          inst.setColorAt(i, col);
          const pr = Math.random();  // pants: denim / khaki / black / grey
          if (pr < 0.45) col.setHSL(0.6, 0.45, 0.2 + Math.random() * 0.15);
          else if (pr < 0.65) col.setHSL(0.1, 0.3, 0.4 + Math.random() * 0.15);
          else col.setHSL(0, 0, 0.1 + Math.random() * 0.25);
          legsInst.setColorAt(i, col);
          col.setHSL(0.07 + Math.random() * 0.02, 0.45 + Math.random() * 0.2, 0.28 + Math.random() * 0.42);
          headInst.setColorAt(i, col);
          hairInst.setMatrixAt(i, m4);
          col.setHSL(0.06 + Math.random() * 0.05, 0.4 + Math.random() * 0.3, 0.06 + Math.random() * 0.2);
          hairInst.setColorAt(i, col);
          people.push({
            idx: i, x: startX, y: deckY, z: startZ,
            targetZ, currentZ: startZ,
            speed: Math.random() * 0.3 + 0.1,
            rot: 0, bobT: Math.random() * 6.28,
          });
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        headInst.instanceMatrix.needsUpdate = true;
        if (headInst.instanceColor) headInst.instanceColor.needsUpdate = true;
        legsInst.instanceMatrix.needsUpdate = true;
        if (legsInst.instanceColor) legsInst.instanceColor.needsUpdate = true;
        hairInst.instanceMatrix.needsUpdate = true;
        if (hairInst.instanceColor) hairInst.instanceColor.needsUpdate = true;
        peopleGroup.add(inst); peopleGroup.add(headInst); peopleGroup.add(legsInst); peopleGroup.add(hairInst);
        peopleGroup.userData.inst = inst;
        peopleGroup.userData.head = headInst;
        peopleGroup.userData.legs = legsInst;
        peopleGroup.userData.hair = hairInst;
      }

      /* ============================================================
       *  BUILDINGS — InstancedMesh (apartments + cafe + brownstone)
       * ============================================================ */
      function generateBuildings(numBuildings) {
        disposeObject(buildingGroup);
        buildingGroup = new THREE.Group();
        scene.add(buildingGroup);

        if (!windowTexture) windowTexture = createWindowTexture();
        estimatedPopulation = 0;

        // Categorize — NYC palette: brick apartments, prewar tan apartments,
        // brick brownstones (red/brown), corner cafes (lighter stucco)
        const apartmentsBrick = [];
        const apartmentsTan = [];
        const cafes = [];
        const brownstones = [];

        const buildingSpread = groundSize * 0.8;
        const buildingAreaMin = -buildingSpread / 2;

        for (let i = 0; i < numBuildings; i++) {
          const t = Math.random();
          let h, w, d, bucket, color;
          if (t < 0.3) {
            h = Math.random() * 10 + 8;
            w = Math.random() * 8 + 8;
            d = Math.random() * 8 + 8;
            bucket = "cafe";
            // light stucco / painted corner buildings
            color = new THREE.Color().setHSL(
              0.08 + Math.random() * 0.08,
              0.15 + Math.random() * 0.25,
              0.55 + Math.random() * 0.25
            );
          } else if (t < 0.4) {
            h = Math.random() * 15 + 15;
            w = Math.random() * 5 + 7;
            d = Math.random() * 8 + 12;
            bucket = "brownstone";
            // brick reds and browns
            color = new THREE.Color().setHSL(
              0.02 + Math.random() * 0.05,
              0.55 + Math.random() * 0.25,
              0.28 + Math.random() * 0.18
            );
          } else {
            h = Math.random() * 80 + 30;
            w = Math.random() * 10 + 10;
            d = Math.random() * 10 + 10;
            // 55% brick (warmer reds), 45% prewar tan/cream
            if (Math.random() < 0.55) {
              bucket = "apartmentBrick";
              color = new THREE.Color().setHSL(
                0.03 + Math.random() * 0.04, // narrow red-orange band
                0.45 + Math.random() * 0.25,
                0.32 + Math.random() * 0.15
              );
            } else {
              bucket = "apartmentTan";
              color = new THREE.Color().setHSL(
                0.09 + Math.random() * 0.05,
                0.18 + Math.random() * 0.25,
                0.55 + Math.random() * 0.22
              );
            }
          }
          estimatedPopulation += Math.floor(w * h * d * POPULATION_DENSITY_FACTOR);

          // Reject any position that sits on a street so we can actually
          // drive. Streets run E-W at z = maxBuildingZ-20 - i*gridSpacingZ
          // (12 of them) and N-S at x = buildingAreaMinX + 50 + i*100.
          let x, z;
          let tries = 0;
          const halfStreet = streetWidth / 2 + 1.5;
          const streetGridSpacingX = 100;
          while (tries++ < 12) {
            x = Math.random() * buildingSpread + buildingAreaMin;
            z = Math.random() * (maxBuildingZ - buildingAreaMinZ) + buildingAreaMinZ;
            // Check distance to nearest EW street z
            let onStreet = false;
            for (let s = 0; s < 12; s++) {
              const sz = maxBuildingZ - 20 - s * gridSpacingZ;
              if (Math.abs(z - sz) < halfStreet + d / 2) { onStreet = true; break; }
            }
            if (!onStreet) {
              for (let s = 0; s < 12; s++) {
                const sx = buildingAreaMinX + streetGridSpacingX / 2 + s * streetGridSpacingX;
                if (Math.abs(x - sx) < halfStreet + w / 2) { onStreet = true; break; }
              }
            }
            if (!onStreet) break;
          }
          const y = groundMesh.position.y + getTerrainHeight(x, z) + h / 2;
          const data = { x, y, z, w, h, d, color };
          if (bucket === "cafe") cafes.push(data);
          else if (bucket === "brownstone") brownstones.push(data);
          else if (bucket === "apartmentBrick") apartmentsBrick.push(data);
          else apartmentsTan.push(data);
        }

        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const c = new THREE.Color();

        const buildInstanced = (list, mat) => {
          if (list.length === 0) return null;
          const inst = new THREE.InstancedMesh(baseGeom, mat, list.length);
          inst.castShadow = true;
          inst.receiveShadow = true;
          inst.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(list.length * 3), 3
          );
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            s.set(b.w, b.h, b.d);
            v.set(b.x, b.y, b.z);
            m4.compose(v, q, s);
            inst.setMatrixAt(i, m4);
            inst.setColorAt(i, b.color);
          }
          inst.instanceMatrix.needsUpdate = true;
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          buildingGroup.add(inst);
          return inst;
        };

        // Brick apartments: brick texture overlay
        const brickTex = brickTexture().clone();
        brickTex.needsUpdate = true;
        brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
        brickTex.colorSpace = THREE.SRGBColorSpace;

        const uvModifier = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                // Recalculate UVs based on scaled instance dimensions to prevent stretching
                vec4 worldPos = instanceMatrix * vec4(position, 1.0);
                vec3 absNormal = abs(normal);
                if (absNormal.x > 0.5) {
                    vMapUv = vec2(worldPos.z, worldPos.y) * 0.3;
                } else if (absNormal.z > 0.5) {
                    vMapUv = vec2(worldPos.x, worldPos.y) * 0.3;
                } else {
                    vMapUv = vec2(worldPos.x, worldPos.z) * 0.3;
                }
                `
            );
        };

        const apartmentBrickMat = new THREE.MeshStandardMaterial({
          map: brickTex, roughness: 0.85, metalness: 0.02,
        });
        apartmentBrickMat.onBeforeCompile = uvModifier;

        const apartmentTanMat = new THREE.MeshStandardMaterial({
          map: windowTexture, metalness: 0.1, roughness: 0.75,
        });
        apartmentTanMat.onBeforeCompile = uvModifier;

        const cafeMat = new THREE.MeshStandardMaterial({
          roughness: 0.7,
        });
        const brownstoneMat = new THREE.MeshStandardMaterial({
          map: brickTexture(), roughness: 0.88,
        });
        brownstoneMat.onBeforeCompile = uvModifier;
        buildInstanced(apartmentsBrick, apartmentBrickMat);
        buildInstanced(apartmentsTan, apartmentTanMat);
        buildInstanced(cafes, cafeMat);
        buildInstanced(brownstones, brownstoneMat);
        /* NYC rooftop water towers on the taller buildings */
        { const all = [...apartmentsBrick, ...apartmentsTan, ...brownstones].filter(b => b.h > 16);
          const picks = all.filter((_, i) => i % 3 === 0);
          if (picks.length) {
            const tank = new THREE.CylinderGeometry(1.5, 1.7, 2.6, 10); tank.translate(0, 1.3, 0);
            const roofc = new THREE.ConeGeometry(1.75, 1.1, 10); roofc.translate(0, 3.1, 0);
            const parts = [tank, roofc];
            for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              const l = new THREE.CylinderGeometry(0.09, 0.09, 1.8, 5); l.translate(lx * 1.05, -0.9, lz * 1.05); parts.push(l); }
            const towerGeom = mergeGeometries(parts);
            const towerInst = new THREE.InstancedMesh(towerGeom,
              new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85 }), picks.length);
            const tm = new THREE.Matrix4();
            picks.forEach((b, i) => { tm.makeRotationY(Math.random() * 6.28);
              tm.setPosition(b.x + (Math.random() - 0.5) * b.w * 0.3, b.y + b.h / 2 + 0.9, b.z + (Math.random() - 0.5) * b.d * 0.3);
              towerInst.setMatrixAt(i, tm); });
            towerInst.castShadow = true; buildingGroup.add(towerInst); }
        }

        // expose merged apartment list for rooftop decoration
        const apartments = apartmentsBrick.concat(apartmentsTan);

        // Save positions for overlay decoration passes
        cafePositions = cafes.slice();
        apartmentPositions = apartments.slice();
        brownstonePositions = brownstones.slice();

        createPeople(estimatedPopulation);
        document.getElementById("m-bld").textContent = numBuildings.toLocaleString();
      }

      /* ============================================================
       *  CONEY ISLAND LANDMARKS — Wonder Wheel, Cyclone,
       *  Parachute Jump, Thunderbolt, Nathan's Famous
       * ============================================================ */

      // Helper: chain of emissive "bulbs" along a circle (for Wonder Wheel rim)
      const bulbCache = new Map();
      function getBulbGeom() {
        if (!bulbCache.has("geom")) {
          bulbCache.set("geom", new THREE.SphereGeometry(0.18, 6, 5));
        }
        return bulbCache.get("geom");
      }
      function bulbMaterial(color) {
        // Bulbs that bloom hard — emissive intensity scales at night via global
        return new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: color,
          emissiveIntensity: 1.6,
          roughness: 0.3,
          metalness: 0.0,
        });
      }
      function makeBulbsAlongCircle(radius, count, color, parent, axis = "z") {
        const mat = bulbMaterial(color);
        const geom = getBulbGeom();
        const inst = new THREE.InstancedMesh(geom, mat, count);
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          if (axis === "z") v.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
          else if (axis === "y") v.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
          else v.set(0, Math.cos(a) * radius, Math.sin(a) * radius);
          m4.compose(v, q, s);
          inst.setMatrixAt(i, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        bulbMeshes.push(inst);
        parent.add(inst);
        return inst;
      }
      function makeBulbsAlongLine(from, to, count, color, parent) {
        const mat = bulbMaterial(color);
        const geom = getBulbGeom();
        const inst = new THREE.InstancedMesh(geom, mat, count);
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          v.lerpVectors(from, to, t);
          m4.compose(v, q, s);
          inst.setMatrixAt(i, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        bulbMeshes.push(inst);
        parent.add(inst);
        return inst;
      }

      // Helper: tinted text-on-canvas signage texture
      function signTexture(text, bg = "#cc0000", fg = "#ffffff", w = 512, h = 128) {
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        // subtle inner border
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.fillStyle = fg;
        ctx.font = `bold ${Math.floor(h * 0.55)}px "Inter", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, w / 2, h / 2 + 2);
        const t = new THREE.CanvasTexture(cv);
        t.anisotropy = 8;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }

      function buildWonderWheel(parent) {
        // The real Wonder Wheel: 150 ft, 16 swinging cabins (red/blue alternating)
        //  + 8 stationary white cabins on the outer ring. Spider-web frame.
        const wheelG = new THREE.Group();
        wheelG.position.set(-55, 0, 10);
        parent.add(wheelG);

        const R = 22;          // wheel radius
        const towerH = 48;     // overall height to hub

        // Twin A-frame supports (steel painted white)
        const supportMat = new THREE.MeshStandardMaterial({
          color: 0xe8e8e6, metalness: 0.55, roughness: 0.5,
        });
        const legGeom = new THREE.CylinderGeometry(0.5, 0.9, towerH, 8);
        const legPositions = [
          [-6, 0, 3], [ 6, 0, 3], [-6, 0, -3], [ 6, 0, -3]
        ];
        legPositions.forEach(([x, _, z]) => {
          const leg = new THREE.Mesh(legGeom, supportMat);
          // splay outwards
          leg.position.set(x, towerH / 2, z);
          // tilt the legs toward the hub
          leg.rotation.z = (x > 0 ? -1 : 1) * 0.10;
          leg.rotation.x = (z > 0 ? 1 : -1) * 0.05;
          leg.castShadow = true;
          wheelG.add(leg);
        });
        // steel X-bracing between the legs — real Wonder Wheel lattice
        {
          const braceMat = supportMat;
          const braceFromTo = (a, b) => {
            const dv = new THREE.Vector3().subVectors(b, a);
            const br = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, dv.length(), 5), braceMat);
            br.position.copy(a).addScaledVector(dv, 0.5);
            br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.clone().normalize());
            wheelG.add(br);
          };
          for (let i = 0; i < legPositions.length; i++) {
            const [ax, , az] = legPositions[i];
            const [bx, , bz] = legPositions[(i + 1) % legPositions.length];
            for (const [f1, f2] of [[0.1, 0.45], [0.45, 0.1], [0.45, 0.8], [0.8, 0.45]]) {
              braceFromTo(new THREE.Vector3(ax * (1 - f1 * 0.6), towerH * f1, az * (1 - f1 * 0.6)),
                          new THREE.Vector3(bx * (1 - f2 * 0.6), towerH * f2, bz * (1 - f2 * 0.6)));
            }
          }
        }

        // Hub
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(1.4, 1.4, 6, 12),
          new THREE.MeshStandardMaterial({ color: 0xc41e3a, metalness: 0.5, roughness: 0.4 })
        );
        hub.rotation.x = Math.PI / 2;
        hub.position.set(0, towerH - 6, 0);
        hub.castShadow = true;
        wheelG.add(hub);

        // The wheel itself — rotating group (assigned to wheelMesh for anim)
        const wheel = new THREE.Group();
        wheel.position.set(0, towerH - 6, 0);
        wheelG.add(wheel);
        wheelMesh = wheel;

        // Outer rim (two parallel rings for depth)
        const rimMat = new THREE.MeshStandardMaterial({
          color: 0xc41e3a, metalness: 0.6, roughness: 0.4,
        });
        [-1.6, 1.6].forEach((dz) => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(R, 0.35, 10, 64),
            rimMat
          );
          ring.position.z = dz;
          ring.castShadow = true;
          wheel.add(ring);
        });

        // Inner ring (smaller, where swinging cabins ride)
        const innerR = R * 0.55;
        const innerRing = new THREE.Mesh(
          new THREE.TorusGeometry(innerR, 0.3, 8, 48),
          rimMat
        );
        innerRing.castShadow = true;
        wheel.add(innerRing);

        // Spokes — 24 going to outer rim, 24 going to inner ring
        const spokeMat = new THREE.MeshStandardMaterial({
          color: 0xe6e6e0, metalness: 0.5, roughness: 0.5,
        });
        const spokeGeom = new THREE.CylinderGeometry(0.12, 0.12, R * 2, 6);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const spoke = new THREE.Mesh(spokeGeom, spokeMat);
          spoke.rotation.z = a + Math.PI / 2;
          spoke.castShadow = true;
          wheel.add(spoke);
        }

        // 8 stationary white cabins on outer rim
        const cabinW = 2.4, cabinH = 1.8, cabinD = 2.2;
        const statCabinGeom = new THREE.BoxGeometry(cabinW, cabinH, cabinD);
        const statCabinMat = new THREE.MeshStandardMaterial({
          color: 0xfafafa, roughness: 0.55, metalness: 0.2,
          emissive: 0x222222, emissiveIntensity: 0.05,
        });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const cabin = new THREE.Mesh(statCabinGeom, statCabinMat);
          cabin.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
          cabin.castShadow = true;
          wheel.add(cabin);
        }

        // 16 swinging cabins on the inner track — alternate red & royal blue
        // These swing as the wheel turns — keyed via userData and animated in animateRides
        const swingCabins = [];
        const redMat = new THREE.MeshStandardMaterial({
          color: 0xd61d2c, roughness: 0.45, metalness: 0.4,
          emissive: 0x550000, emissiveIntensity: 0.15,
        });
        const blueMat = new THREE.MeshStandardMaterial({
          color: 0x1d4ed8, roughness: 0.45, metalness: 0.4,
          emissive: 0x001a55, emissiveIntensity: 0.15,
        });
        const swingCabinGeom = new THREE.BoxGeometry(cabinW, cabinH, cabinD);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          // Attach a pivot at the spoke, the cabin hangs below it via gravity
          const pivot = new THREE.Group();
          pivot.position.set(Math.cos(a) * innerR, Math.sin(a) * innerR, 0);
          wheel.add(pivot);
          // The cabin hangs ~0.8 below the pivot
          const cabin = new THREE.Mesh(
            swingCabinGeom,
            i % 2 === 0 ? redMat : blueMat
          );
          cabin.position.set(0, -0.9, 0);
          cabin.castShadow = true;
          pivot.add(cabin);
          // Cable from pivot to cabin top
          const cable = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4),
            spokeMat
          );
          cable.position.set(0, -0.45, 0);
          pivot.add(cable);
          // Each pivot needs to counter-rotate against the wheel's spin so it
          // stays roughly upright due to gravity (we'll fake this in anim)
          pivot.userData = {
            isWonderCabin: true,
            initialAngle: a, // angle relative to wheel
          };
          swingCabins.push(pivot);
        }
        wheel.userData.swingCabins = swingCabins;

        // Bulb chains on outer rim and inner ring
        const outerBulbs = makeBulbsAlongCircle(R, 64, 0xffe2a0, wheel);
        // bulb pairs at front/back
        const outerBulbs2 = makeBulbsAlongCircle(R, 64, 0xffe2a0, wheel);
        outerBulbs.position.z = -1.65;
        outerBulbs2.position.z = 1.65;
        // Bulbs on inner ring
        makeBulbsAlongCircle(innerR, 32, 0xfff0c0, wheel);

        // "WONDER WHEEL" sign at the top — large rectangular signboard
        const signTex = signTexture("WONDER WHEEL", "#d61d2c", "#ffffff", 1024, 192);
        const signMat = new THREE.MeshStandardMaterial({
          map: signTex,
          emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25,
          roughness: 0.6,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), signMat);
        sign.position.set(0, towerH + 3, 0);
        sign.castShadow = false;
        wheelG.add(sign);
        // Sign frame bulbs
        const corner = 11;
        const top = towerH + 5;
        const bot = towerH + 1;
        makeBulbsAlongLine(
          new THREE.Vector3(-corner, top, 0),
          new THREE.Vector3(corner, top, 0),
          22, 0xffe2a0, wheelG
        );
        makeBulbsAlongLine(
          new THREE.Vector3(-corner, bot, 0),
          new THREE.Vector3(corner, bot, 0),
          22, 0xffe2a0, wheelG
        );

        return wheelG;
      }

      function buildCyclone(parent) {
        // 1927 wooden coaster — distinctive white lattice
        const g = new THREE.Group();
        g.position.set(35, 0, -5);
        parent.add(g);

        const woodMat = new THREE.MeshStandardMaterial({
          color: 0xf3ead5, roughness: 0.85, metalness: 0.0,
        });

        // Build a profile curve for the track (lift + first drop + bunny hops)
        const trackPts = [];
        for (let i = 0; i <= 80; i++) {
          const t = i / 80;
          const x = THREE.MathUtils.lerp(-22, 22, t);
          // Up the lift, then big drop, then hops
          let y;
          if (t < 0.25) y = THREE.MathUtils.lerp(2, 22, t / 0.25);
          else if (t < 0.40) y = THREE.MathUtils.lerp(22, 4, (t - 0.25) / 0.15);
          else {
            const hop = (t - 0.40) / 0.60;
            y = 4 + Math.sin(hop * Math.PI * 4) * 3.5 * (1 - hop * 0.4);
          }
          const z = Math.sin(t * Math.PI * 2) * 6 + (t - 0.5) * 8;
          trackPts.push(new THREE.Vector3(x, y, z));
        }
        const curve = new THREE.CatmullRomCurve3(trackPts);
        cycloneTrackCurve = curve; // module-scoped, used to animate the train

        // Track rails (two parallel tubes)
        const railMat = new THREE.MeshStandardMaterial({
          color: 0x5a4031, metalness: 0.6, roughness: 0.5,
        });
        const tubeGeom = new THREE.TubeGeometry(curve, 200, 0.15, 6, false);
        const rail1 = new THREE.Mesh(tubeGeom, railMat); rail1.castShadow = true; g.add(rail1);

        // For the second rail, offset along the curve binormal — approximate by re-extracting at high res
        const railOffsetGeom = new THREE.BufferGeometry();
        {
          const segs = 240;
          const verts = [];
          const indices = [];
          const upVec = new THREE.Vector3(0, 1, 0);
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const p = curve.getPointAt(t);
            const tan = curve.getTangentAt(t).normalize();
            const bin = new THREE.Vector3().crossVectors(tan, upVec).normalize();
            const offs = bin.multiplyScalar(0.9);
            verts.push(p.x + offs.x, p.y + offs.y, p.z + offs.z);
          }
          // Will create a tube on the offset path instead
          const offsetPts = [];
          for (let i = 0; i <= segs; i++) {
            offsetPts.push(new THREE.Vector3(verts[i*3], verts[i*3+1], verts[i*3+2]));
          }
          const offsetCurve = new THREE.CatmullRomCurve3(offsetPts);
          const tube2 = new THREE.TubeGeometry(offsetCurve, 200, 0.15, 6, false);
          const rail2 = new THREE.Mesh(tube2, railMat); rail2.castShadow = true; g.add(rail2);
        }

        // Cross ties (wooden planks across rails)
        const tieGeom = new THREE.BoxGeometry(1.2, 0.15, 0.4);
        const tieCount = 60;
        const tieInst = new THREE.InstancedMesh(tieGeom, woodMat, tieCount);
        tieInst.castShadow = true;
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < tieCount; i++) {
          const t = (i + 0.5) / tieCount;
          const p = curve.getPointAt(t);
          const tan = curve.getTangentAt(t).normalize();
          // Orient the tie perpendicular to the track
          const yaw = Math.atan2(tan.x, tan.z);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2);
          m4.compose(p, q, s);
          tieInst.setMatrixAt(i, m4);
        }
        tieInst.instanceMatrix.needsUpdate = true;
        g.add(tieInst);

        // White lattice support structure underneath — vertical posts with X-bracing
        const postGeom = new THREE.BoxGeometry(0.25, 1, 0.25);
        const numPosts = 40;
        const postsInst = new THREE.InstancedMesh(postGeom, woodMat, numPosts * 2);
        postsInst.castShadow = true;
        let pi = 0;
        const tmpV = new THREE.Vector3();
        for (let i = 0; i < numPosts; i++) {
          const t = (i + 0.5) / numPosts;
          const p = curve.getPointAt(t);
          const groundY = 0;
          if (p.y - groundY < 1) continue;
          const h = p.y - groundY;
          // Two posts (front + back)
          for (let side = -1; side <= 1; side += 2) {
            tmpV.set(p.x, h / 2, p.z + side * 0.7);
            const ss = new THREE.Vector3(1, h, 1);
            m4.compose(tmpV, q, ss);
            postsInst.setMatrixAt(pi++, m4);
          }
        }
        postsInst.count = pi;
        postsInst.instanceMatrix.needsUpdate = true;
        g.add(postsInst);

        // X-bracing between posts (cheap, as crossed boxes at intervals)
        const braceGeom = new THREE.BoxGeometry(2.0, 0.15, 0.15);
        const braceMat = woodMat;
        for (let i = 0; i < numPosts; i += 2) {
          const t = (i + 0.5) / numPosts;
          const p = curve.getPointAt(t);
          if (p.y < 3) continue;
          for (let h = 1; h < p.y - 1; h += 2) {
            const br = new THREE.Mesh(braceGeom, braceMat);
            br.position.set(p.x, h, p.z);
            br.rotation.z = Math.PI / 6;
            br.castShadow = true;
            g.add(br);
            const br2 = new THREE.Mesh(braceGeom, braceMat);
            br2.position.set(p.x, h, p.z);
            br2.rotation.z = -Math.PI / 6;
            br2.castShadow = true;
            g.add(br2);
          }
        }

        // The train: a small group that rides the curve
        const trainG = new THREE.Group();
        const carMat = new THREE.MeshStandardMaterial({
          color: 0xb91c1c, metalness: 0.5, roughness: 0.4,
          emissive: 0x440000, emissiveIntensity: 0.2,
        });
        for (let c = 0; c < 3; c++) {
          const car = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.7), carMat);
          car.position.x = c * -1.5;
          car.castShadow = true;
          trainG.add(car);
        }
        g.add(trainG);
        cycloneTrain = trainG;

        // "CYCLONE" sign
        const sg = signTexture("CYCLONE", "#cc0000", "#ffffff", 768, 160);
        const signM = new THREE.MeshStandardMaterial({
          map: sg, emissive: 0xffffff, emissiveMap: sg, emissiveIntensity: 0.25,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.8), signM);
        sign.position.set(-18, 25, 0);
        sign.rotation.y = Math.PI / 8;
        g.add(sign);

        return g;
      }

      function buildParachuteJump(parent) {
        // The 262 ft "Eiffel Tower of Brooklyn" — landmark only (no operation)
        // Painted Coney orange-red. Spider-leg base + open lattice tower + radial top.
        const g = new THREE.Group();
        g.position.set(100, 0, 10); // boardwalk-adjacent
        parent.add(g);

        const orange = 0xe04525;
        const towerMat = new THREE.MeshStandardMaterial({
          color: orange, metalness: 0.55, roughness: 0.45,
        });

        // Total height ~80 (scaled — full 262ft would dwarf rides)
        const H = 80;

        // Four spider legs splaying out at the base
        const legGeom = new THREE.CylinderGeometry(0.3, 0.9, H * 0.4, 6);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const leg = new THREE.Mesh(legGeom, towerMat);
          const r = 7;
          leg.position.set(Math.cos(a) * r * 0.5, H * 0.2, Math.sin(a) * r * 0.5);
          leg.rotation.z = Math.cos(a) * 0.18;
          leg.rotation.x = -Math.sin(a) * 0.18;
          leg.castShadow = true;
          g.add(leg);
        }

        // Main lattice tower — 4 vertical chord posts + cross-bracing
        const chordGeom = new THREE.CylinderGeometry(0.35, 0.35, H, 6);
        const cornerR = 2.2;
        const corners = [
          [ cornerR, 0,  cornerR], [-cornerR, 0,  cornerR],
          [-cornerR, 0, -cornerR], [ cornerR, 0, -cornerR],
        ];
        corners.forEach(([x, , z]) => {
          // Taper the tower inward (use scaled cylinder)
          const post = new THREE.Mesh(chordGeom, towerMat);
          post.position.set(x * 0.7, H * 0.55, z * 0.7);
          // slight inward tilt
          post.rotation.x = -Math.sign(z) * 0.04;
          post.rotation.z = Math.sign(x) * 0.04;
          post.castShadow = true;
          g.add(post);
        });

        // Horizontal cross bracing every 6m
        const hBraceMat = towerMat;
        const hBraceGeom = new THREE.BoxGeometry(0.15, 0.15, cornerR * 2 * 0.95);
        const levels = 12;
        for (let lvl = 1; lvl < levels; lvl++) {
          const y = (lvl / levels) * H;
          const taper = 1 - (y / H) * 0.4;
          const r = cornerR * taper;
          // four sides
          const sides = [
            { from: [ r, y,  r], to: [-r, y,  r] },
            { from: [-r, y,  r], to: [-r, y, -r] },
            { from: [-r, y, -r], to: [ r, y, -r] },
            { from: [ r, y, -r], to: [ r, y,  r] },
          ];
          sides.forEach((side) => {
            const from = new THREE.Vector3(...side.from);
            const to = new THREE.Vector3(...side.to);
            const mid = from.clone().add(to).multiplyScalar(0.5);
            const len = from.distanceTo(to);
            const br = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, len), hBraceMat);
            br.position.copy(mid);
            br.lookAt(to);
            br.castShadow = true;
            g.add(br);
            // X-braces
            const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len * 1.05), hBraceMat);
            x1.position.copy(mid);
            x1.position.y -= 3;
            x1.lookAt(to.x, to.y - 6, to.z);
            x1.castShadow = true;
            g.add(x1);
          });
        }

        // Radial top "spokes" — the iconic parachute arms (12 radial beams)
        const radialMat = towerMat;
        const radialGeom = new THREE.BoxGeometry(0.25, 0.25, 7);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const beam = new THREE.Mesh(radialGeom, radialMat);
          beam.position.set(Math.cos(a) * 3.5, H, Math.sin(a) * 3.5);
          beam.rotation.y = -a + Math.PI / 2;
          beam.castShadow = true;
          g.add(beam);
        }
        // Top crown ring
        const crown = new THREE.Mesh(
          new THREE.TorusGeometry(7, 0.3, 8, 24),
          radialMat
        );
        crown.position.y = H;
        crown.rotation.x = Math.PI / 2;
        crown.castShadow = true;
        g.add(crown);

        // Central spike at very top
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.4, 5, 8),
          radialMat
        );
        spike.position.y = H + 2.5;
        spike.castShadow = true;
        g.add(spike);

        // Aircraft warning light at the top (always-on red, flashes at night)
        const warningLight = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 8, 6),
          new THREE.MeshStandardMaterial({
            color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0,
          })
        );
        warningLight.position.y = H + 5.2;
        g.add(warningLight);
        parachuteWarningLight = warningLight;

        // Bulb chains down each chord — the iconic lit-up silhouette
        corners.forEach(([x, , z]) => {
          makeBulbsAlongLine(
            new THREE.Vector3(x * 0.7, 2, z * 0.7),
            new THREE.Vector3(x * 0.42, H, z * 0.42),
            18, 0xffe2a0, g
          );
        });
        // Bulbs around crown
        makeBulbsAlongCircle(7, 24, 0xffe2a0, g, "y").position.y = H;

        return g;
      }

      function buildThunderbolt(parent) {
        // Modern red steel coaster — small loop circuit, animated car
        const g = new THREE.Group();
        g.position.set(80, 0, -15);
        parent.add(g);

        const steelMat = new THREE.MeshStandardMaterial({
          color: 0xc41e3a, metalness: 0.65, roughness: 0.35,
        });
        const supportMat = new THREE.MeshStandardMaterial({
          color: 0xe5e7eb, metalness: 0.4, roughness: 0.5,
        });

        // Build a closed track curve — vertical loop
        const pts = [];
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          // First a lift hill (low->high)
          if (t < 0.20) {
            const tt = t / 0.20;
            pts.push(new THREE.Vector3(-15 + tt * 6, 3 + tt * 22, 0));
          } else if (t < 0.40) {
            // Drop and curve
            const tt = (t - 0.20) / 0.20;
            pts.push(new THREE.Vector3(
              -9 + tt * 8,
              25 - tt * 18,
              Math.sin(tt * Math.PI) * 4
            ));
          } else if (t < 0.65) {
            // Vertical loop
            const tt = (t - 0.40) / 0.25;
            const loopA = tt * Math.PI * 2;
            pts.push(new THREE.Vector3(
              -1 + 5 * Math.sin(loopA),
              10 + 5 - 5 * Math.cos(loopA),
              0
            ));
          } else {
            // Return curve
            const tt = (t - 0.65) / 0.35;
            pts.push(new THREE.Vector3(
              -1 + tt * (-14),
              10 - tt * 7,
              -tt * 4
            ));
          }
        }
        const curve = new THREE.CatmullRomCurve3(pts, true);
        thunderboltCurve = curve;

        const tube = new THREE.TubeGeometry(curve, 200, 0.18, 6, true);
        const rail = new THREE.Mesh(tube, steelMat);
        rail.castShadow = true;
        g.add(rail);

        // Vertical supports
        const supportGeom = new THREE.CylinderGeometry(0.18, 0.18, 1, 6);
        for (let i = 0; i < 24; i++) {
          const t = i / 24;
          const p = curve.getPointAt(t);
          if (p.y < 1.5) continue;
          const h = p.y;
          const sup = new THREE.Mesh(supportGeom, supportMat);
          sup.position.set(p.x, h / 2, p.z);
          sup.scale.y = h;
          sup.castShadow = true;
          g.add(sup);
        }

        // The car
        const carG = new THREE.Group();
        const carMat = new THREE.MeshStandardMaterial({
          color: 0xfacc15, roughness: 0.4, metalness: 0.5,
          emissive: 0x553300, emissiveIntensity: 0.2,
        });
        const carBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.9), carMat);
        carBody.castShadow = true;
        carG.add(carBody);
        g.add(carG);
        thunderboltCar = carG;

        return g;
      }

      function buildNathans(parent) {
        // Corner stand at Surf & Stillwell — yellow/green awning + signage
        const g = new THREE.Group();
        g.position.set(-20, 0, 30); // boardwalk-adjacent
        parent.add(g);

        const wallMat = new THREE.MeshStandardMaterial({
          color: 0xf8f8f5, roughness: 0.75,
        });
        const trimMat = new THREE.MeshStandardMaterial({
          color: 0x046a38, roughness: 0.5,
        });

        // Building footprint
        const W = 18, D = 12, H = 7;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(W, H, D), wallMat
        );
        building.position.y = H / 2;
        building.castShadow = true;
        building.receiveShadow = true;
        g.add(building);

        // Green trim band
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(W + 0.2, 1.2, D + 0.2), trimMat
        );
        trim.position.y = H - 0.6;
        g.add(trim);

        // Yellow signage panel running across the top — "NATHAN'S FAMOUS"
        const sg = signTexture("NATHAN'S FAMOUS", "#fbbf24", "#046a38", 1024, 192);
        const signMat = new THREE.MeshStandardMaterial({
          map: sg, emissive: 0xffffff, emissiveMap: sg, emissiveIntensity: 0.45,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.6), signMat);
        sign.position.set(0, H + 1, D / 2 + 0.05);
        g.add(sign);
        // Sign on the other side too
        const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.6), signMat);
        sign2.position.set(0, H + 1, -D / 2 - 0.05);
        sign2.rotation.y = Math.PI;
        g.add(sign2);

        // Striped awning (yellow + green) over the front
        const awningGeom = new THREE.BoxGeometry(W - 2, 0.3, 2);
        const awning = new THREE.Mesh(awningGeom, new THREE.MeshStandardMaterial({
          color: 0xfbbf24, roughness: 0.65,
        }));
        awning.position.set(0, 4, D / 2 + 1);
        awning.castShadow = true;
        g.add(awning);

        // Bulb chain along sign
        makeBulbsAlongLine(
          new THREE.Vector3(-W / 2 + 1, H + 2, D / 2 + 0.1),
          new THREE.Vector3( W / 2 - 1, H + 2, D / 2 + 0.1),
          24, 0xffe2a0, g
        );

        return g;
      }

      function buildRides(rideGroup) {
        buildWonderWheel(rideGroup);
        buildCyclone(rideGroup);
        buildParachuteJump(rideGroup);
        buildThunderbolt(rideGroup);
        buildNathans(rideGroup);

        // Keep some of the original rides as "Luna Park" interior — repurposed
        // Drop tower (Zumanjaro/Drop) — Luna Park
        const dropG = new THREE.Group();
        dropG.position.set(50, 0, -30);
        const dropTower = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 60, 10),
          new THREE.MeshStandardMaterial({ color: 0x4444ff, metalness: 0.5, roughness: 0.4 })
        );
        dropTower.position.y = 30;
        dropTower.castShadow = true;
        dropG.add(dropTower);
        dropTowerRide = new THREE.Mesh(
          new THREE.TorusGeometry(3, 0.8, 6, 16),
          new THREE.MeshStandardMaterial({
            color: 0xffaa00, roughness: 0.5,
            emissive: 0xffaa00, emissiveIntensity: 0.5,
          })
        );
        dropTowerRide.position.y = 5;
        dropTowerRide.rotation.x = Math.PI / 2;
        dropTowerRide.castShadow = true;
        dropG.add(dropTowerRide);
        rideGroup.add(dropG);

        // Scrambler (spinningRide)
        const spinG = new THREE.Group();
        spinG.position.set(-22, 0.5, -18);
        const spinCenter = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1, 5, 8),
          new THREE.MeshStandardMaterial({
            color: 0xffff00, roughness: 0.4,
            emissive: 0xffff00, emissiveIntensity: 0.4,
          })
        );
        spinCenter.position.y = 3;
        spinCenter.castShadow = true;
        spinG.add(spinCenter);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });
        const podMat = new THREE.MeshStandardMaterial({
          color: 0xff1493, roughness: 0.5,
          emissive: 0xff1493, emissiveIntensity: 0.4,
        });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), armMat);
          arm.position.set(Math.cos(a) * 2, 3.5, Math.sin(a) * 2);
          arm.lookAt(spinCenter.position.x, arm.position.y, spinCenter.position.z);
          arm.castShadow = true;
          spinG.add(arm);
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.5, 8), podMat);
          pod.position.set(Math.cos(a) * 4, 3, Math.sin(a) * 4);
          pod.castShadow = true;
          spinG.add(pod);
        }
        spinningRide = spinG;
        rideGroup.add(spinG);

        // Swing ride (the chair swings at Luna)
        const swingG = new THREE.Group();
        swingG.position.set(18, 0, -28);
        const sPole = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1.5, 25, 12),
          new THREE.MeshStandardMaterial({ color: 0x4682b4, metalness: 0.7, roughness: 0.3 })
        );
        sPole.position.y = 12.5; sPole.castShadow = true;
        swingG.add(sPole);
        swingRideTop = new THREE.Group();
        const swingTop = new THREE.Mesh(
          new THREE.TorusGeometry(6, 0.8, 8, 32),
          new THREE.MeshStandardMaterial({
            color: 0xffd700, metalness: 0.55, roughness: 0.4,
            emissive: 0xffd700, emissiveIntensity: 0.45,
          })
        );
        swingTop.rotation.x = Math.PI / 2;
        swingRideTop.position.y = 23;
        swingRideTop.add(swingTop);
        const chainGeom = new THREE.CylinderGeometry(0.1, 0.1, 8, 4);
        const chainMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.2 });
        const seatGeom2 = new THREE.BoxGeometry(1, 0.3, 1);
        const seatMat2 = new THREE.MeshStandardMaterial({ color: 0x800080, roughness: 0.7 });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = 5.5;
          const ch = new THREE.Mesh(chainGeom, chainMat);
          ch.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
          ch.castShadow = true;
          swingRideTop.add(ch);
          const se = new THREE.Mesh(seatGeom2, seatMat2);
          se.position.set(Math.cos(a) * r, -8.15, Math.sin(a) * r);
          se.castShadow = true;
          swingRideTop.add(se);
        }
        swingG.add(swingRideTop);
        rideGroup.add(swingG);
        // Bulbs around swing top
        makeBulbsAlongCircle(6, 24, 0xffe2a0, swingRideTop);

        // Astroland / Deno's second wheel
        const fwG = new THREE.Group();
        fwG.position.set(-90, 0, -8);
        simpleFerrisWheel = new THREE.Mesh(
          new THREE.TorusGeometry(10, 0.8, 8, 32),
          new THREE.MeshStandardMaterial({
            color: 0x10b981, metalness: 0.4, roughness: 0.55,
            emissive: 0x10b981, emissiveIntensity: 0.25,
          })
        );
        simpleFerrisWheel.position.y = 11;
        simpleFerrisWheel.castShadow = true;
        fwG.add(simpleFerrisWheel);
        makeBulbsAlongCircle(10, 32, 0xffe2a0, simpleFerrisWheel);
        const fwSupGeom = new THREE.CylinderGeometry(0.6, 0.8, 22, 6);
        const fwSupMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.4 });
        const fws1 = new THREE.Mesh(fwSupGeom, fwSupMat); fws1.position.set(0, 11, 1.2); fws1.castShadow = true; fwG.add(fws1);
        const fws2 = new THREE.Mesh(fwSupGeom, fwSupMat); fws2.position.set(0, 11, -1.2); fws2.castShadow = true; fwG.add(fws2);
        rideGroup.add(fwG);

        // Pirate ship
        const psG = new THREE.Group();
        psG.position.set(0, 5, -55);
        const hull = new THREE.Mesh(
          new THREE.BoxGeometry(15, 4, 5),
          new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.65 })
        );
        hull.position.y = -1; hull.castShadow = true;
        psG.add(hull);
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x966f33, roughness: 0.75 })
        );
        mast.position.y = 4; mast.castShadow = true;
        psG.add(mast);
        const psSupGeom = new THREE.CylinderGeometry(1, 1, 10, 8);
        const psSupMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.3 });
        const ps1 = new THREE.Mesh(psSupGeom, psSupMat); ps1.position.set(-5, 0, 0); ps1.castShadow = true; psG.add(ps1);
        const ps2 = new THREE.Mesh(psSupGeom, psSupMat); ps2.position.set(5, 0, 0); ps2.castShadow = true; psG.add(ps2);
        pirateShipRide = psG;
        rideGroup.add(psG);

        // Point lights at landmarks for night
        const addRideLight = (color, x, y, z, dist) => {
          const l = new THREE.PointLight(color, 0, dist, 2);
          l.position.set(x, y, z);
          rideGroup.add(l);
          rideLights.push(l);
        };
        addRideLight(0xffe2a0, -55, 35, 10, 110);  // Wonder Wheel
        addRideLight(0xffd6a0,  35, 20, -5, 90);   // Cyclone
        addRideLight(0xffaa55, 100, 60, 10, 130);  // Parachute Jump
        addRideLight(0xffcc44,  80, 25, -15, 80);  // Thunderbolt
        addRideLight(0xfbbf24, -20,  8, 30, 70);   // Nathan's
        addRideLight(0xffaa55,  50, 40, -30, 60);  // Drop tower
        addRideLight(0xff66cc, -22,  8, -18, 50);  // Scrambler
        addRideLight(0xffe066,  18, 23, -28, 60);  // Swing
      }

      /* ============================================================
       *  POST-FX SHADERS — vignette + chromatic aberration + grain
       * ============================================================ */
      const PhotoFXShader = {
        uniforms: {
          tDiffuse: { value: null },
          time: { value: 0.0 },
          vignetteStrength: { value: 0.55 },
          grainStrength: { value: 0.045 },
          chromaAmount: { value: 0.0035 },
          warmth: { value: 0.05 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float time;
          uniform float vignetteStrength;
          uniform float grainStrength;
          uniform float chromaAmount;
          uniform float warmth;
          varying vec2 vUv;
          float random(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }
          void main() {
            vec2 uv = vUv;
            vec2 centerOff = uv - 0.5;
            float distFromCenter = length(centerOff);
            float aberration = chromaAmount * distFromCenter * 2.0;
            float r = texture2D(tDiffuse, uv + centerOff * aberration).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - centerOff * aberration).b;
            vec3 col = vec3(r, g, b);
            float vig = smoothstep(0.95, 0.25, distFromCenter);
            col *= mix(1.0 - vignetteStrength, 1.0, vig);
            float grain = (random(uv + fract(time * 0.13)) - 0.5) * grainStrength;
            col += grain;
            col.r += col.r * warmth * 0.5;
            col.b -= col.b * warmth * 0.4;
            col = pow(col, vec3(0.97));
            col = col * 1.04 - 0.015;
            gl_FragColor = vec4(col, 1.0);
          }
        `
      };
      let photoFXPass = null;

      /* ============================================================
       *  LENS FLARE — procedural disc texture, multi-element flare
       * ============================================================ */
      function makeFlareTexture(color = "#ffffff", soft = 1.0) {
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0, color);
        grad.addColorStop(soft * 0.4, color.length === 7 ? color + "80" : color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }
      let sunFlareLight = null; // procedural flare (no external Lensflare dep)

      /* ============================================================
       *  REALISM ADDITIONS — Coney landmarks & GTA-level urban fabric
       * ============================================================ */

      // --- Animated/tracked refs ---
      const carouselsAnim = []; // {root, horses[], rotSpeed, horseAmp}
      const steamPlumes = [];   // {points, posAttr, base, lifeSecs, count, scale}
      const pigeonsArr = [];    // {mesh, theta, r, baseY, speed}
      const aquaSharks = [], aquaSeals = [];
      let subwayStations = []; // real Brighton/Culver line stops on line 0
      const trafficLightSets = []; // {red, yellow, green, phase, period}
      const sidewalkPeople = []; // {inst, idx, x, y, z, speed, dirX}
      let sidewalkPersonInst = null;
      const flyingGulls = []; // {mesh, cx, cz, baseY, r, theta, speed, wing}
      const wavingFlags = []; // {mesh, anchor, baseRotY, amp, speed, phase}
      const extraVehicles = []; // {bodyInst, cabinInst, items[]}

      // --- Texture caches ---
      let __brickTex = null, __paverTex = null, __crosswalkTex = null,
          __asphaltTex = null, __terracottaTex = null, __sidewalkTex = null;

      function brickTexture() {
        if (__brickTex) return __brickTex;
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#7a2b1e";
        ctx.fillRect(0, 0, 256, 256);
        const bw = 32, bh = 12;
        for (let r = 0; r < 256 / bh; r++) {
          const offset = (r % 2) * (bw / 2);
          for (let c = -1; c < 256 / bw + 1; c++) {
            const x = c * bw + offset;
            const y = r * bh;
            const tint = Math.random() * 28 - 14;
            ctx.fillStyle = `rgb(${Math.max(60, 122 + tint)},${Math.max(20, 43 + tint * 0.5)},${Math.max(20, 30 + tint * 0.3)})`;
            ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          }
        }
        // mortar lines via lighter overlay strokes
        ctx.strokeStyle = "rgba(220,210,190,0.18)";
        ctx.lineWidth = 1;
        for (let r = 0; r <= 256 / bh; r++) {
          ctx.beginPath();
          ctx.moveTo(0, r * bh);
          ctx.lineTo(256, r * bh);
          ctx.stroke();
        }
        __brickTex = new THREE.CanvasTexture(cv);
        __brickTex.wrapS = __brickTex.wrapT = THREE.RepeatWrapping;
        __brickTex.colorSpace = THREE.SRGBColorSpace;
        __brickTex.anisotropy = 8;
        return __brickTex;
      }

      function paverTexture() {
        if (__paverTex) return __paverTex;
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#bdb6a6";
        ctx.fillRect(0, 0, 256, 256);
        // Diamond pattern of pavers
        const sz = 32;
        for (let y = 0; y < 256; y += sz) {
          for (let x = 0; x < 256; x += sz) {
            const shade = 170 + Math.random() * 35;
            ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 18})`;
            ctx.fillRect(x + 1, y + 1, sz - 2, sz - 2);
          }
        }
        // grout lines
        ctx.strokeStyle = "rgba(60,55,45,0.4)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i <= 256; i += sz) {
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
        }
        __paverTex = new THREE.CanvasTexture(cv);
        __paverTex.wrapS = __paverTex.wrapT = THREE.RepeatWrapping;
        __paverTex.colorSpace = THREE.SRGBColorSpace;
        __paverTex.anisotropy = 8;
        return __paverTex;
      }

      function crosswalkTexture() {
        if (__crosswalkTex) return __crosswalkTex;
        const cv = document.createElement("canvas");
        cv.width = 128; cv.height = 64;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#2b2e35";
        ctx.fillRect(0, 0, 128, 64);
        ctx.fillStyle = "#f5f5f3";
        // 6 stripes
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(8 + i * 20, 6, 12, 52);
        }
        __crosswalkTex = new THREE.CanvasTexture(cv);
        __crosswalkTex.colorSpace = THREE.SRGBColorSpace;
        __crosswalkTex.anisotropy = 4;
        return __crosswalkTex;
      }

      function asphaltTexture() {
        if (__asphaltTex) return __asphaltTex;
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#3a3c40";
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1400; i++) {
          ctx.fillStyle = `rgba(${20 + Math.random() * 40},${20 + Math.random() * 40},${20 + Math.random() * 40},0.7)`;
          ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
        }
        // cracks
        ctx.strokeStyle = "rgba(20,20,20,0.45)";
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(Math.random() * 256, Math.random() * 256);
          ctx.bezierCurveTo(
            Math.random() * 256, Math.random() * 256,
            Math.random() * 256, Math.random() * 256,
            Math.random() * 256, Math.random() * 256
          );
          ctx.stroke();
        }
        __asphaltTex = new THREE.CanvasTexture(cv);
        __asphaltTex.wrapS = __asphaltTex.wrapT = THREE.RepeatWrapping;
        __asphaltTex.colorSpace = THREE.SRGBColorSpace;
        __asphaltTex.anisotropy = 8;
        return __asphaltTex;
      }

      function terracottaTexture() {
        if (__terracottaTex) return __terracottaTex;
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#c87a4a";
        ctx.fillRect(0, 0, 256, 256);
        // tile pattern with nautical motif streaks
        for (let y = 0; y < 256; y += 32) {
          for (let x = 0; x < 256; x += 32) {
            const sh = 180 + Math.random() * 40;
            ctx.fillStyle = `rgb(${sh},${Math.floor(sh * 0.65)},${Math.floor(sh * 0.45)})`;
            ctx.fillRect(x + 1, y + 1, 30, 30);
            // little decoration
            ctx.fillStyle = "rgba(255,240,210,0.35)";
            ctx.fillRect(x + 14, y + 10, 4, 12);
          }
        }
        __terracottaTex = new THREE.CanvasTexture(cv);
        __terracottaTex.wrapS = __terracottaTex.wrapT = THREE.RepeatWrapping;
        __terracottaTex.colorSpace = THREE.SRGBColorSpace;
        __terracottaTex.anisotropy = 8;
        return __terracottaTex;
      }

      function sidewalkTexture() {
        if (__sidewalkTex) return __sidewalkTex;
        const cv = document.createElement("canvas");
        cv.width = 128; cv.height = 128;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#9ea2a6";
        ctx.fillRect(0, 0, 128, 128);
        // speckles
        for (let i = 0; i < 600; i++) {
          ctx.fillStyle = `rgba(${100 + Math.random() * 80},${100 + Math.random() * 80},${100 + Math.random() * 80},0.6)`;
          ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
        }
        // expansion joints
        ctx.strokeStyle = "rgba(40,45,55,0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.stroke();
        __sidewalkTex = new THREE.CanvasTexture(cv);
        __sidewalkTex.wrapS = __sidewalkTex.wrapT = THREE.RepeatWrapping;
        __sidewalkTex.colorSpace = THREE.SRGBColorSpace;
        __sidewalkTex.anisotropy = 8;
        return __sidewalkTex;
      }

      // --- Steam plume factory (for grills, fryers, vents) ---
      function spawnSteam(x, y, z, opts = {}) {
        const count = opts.count || 60;
        const scale = opts.scale || 1;
        const color = opts.color || 0xeaeaea;
        const positions = new Float32Array(count * 3);
        const lifeArr = new Float32Array(count);
        const base = new THREE.Vector3(x, y, z);
        for (let i = 0; i < count; i++) {
          positions[i * 3] = x + (Math.random() - 0.5) * 0.6 * scale;
          positions[i * 3 + 1] = y;
          positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6 * scale;
          lifeArr[i] = Math.random();
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
          color, size: 1.2 * scale, transparent: true, opacity: 0.55,
          depthWrite: false, sizeAttenuation: true, blending: THREE.NormalBlending,
        });
        const pts = new THREE.Points(geom, mat);
        scene.add(pts);
        steamPlumes.push({
          points: pts, posAttr: geom.attributes.position, base,
          life: lifeArr, scale, riseSpeed: opts.riseSpeed || 1.6,
        });
        return pts;
      }

      // --- Signage helper that draws multi-line text ---
      function multiLineSignTex(lines, bg, fg, w, h) {
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontSize = Math.floor(h / (lines.length + 0.6));
        ctx.font = `bold ${fontSize}px "Inter", system-ui, sans-serif`;
        lines.forEach((ln, i) => {
          ctx.fillText(ln, w / 2, h / (lines.length + 1) * (i + 1) + 2);
        });
        const t = new THREE.CanvasTexture(cv);
        t.anisotropy = 8;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }

      /* ----------------------------------------------------------------
       *  LANDMARK: Steeplechase Pier
       *  Wooden plank pier from boardwalk south edge into the ocean.
       * ---------------------------------------------------------------- */
      function buildSteeplechasePier() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const startZ = 45.5; // just south of boardwalk railing
        const length = 130;
        const width = 7;
        const deckY = baseY + 1.6;
        const pierG = new THREE.Group();

        const plankTex = createPlankTexture();
        plankTex.repeat.set(width / 5, length / 5);
        plankTex.needsUpdate = true;
        const deckMat = new THREE.MeshStandardMaterial({
          map: plankTex, roughness: 0.85, metalness: 0.02,
        });
        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.4, length),
          deckMat
        );
        deck.position.set(20, deckY, startZ + length / 2);
        deck.castShadow = true; deck.receiveShadow = true;
        pierG.add(deck);

        // T-shaped bend at end
        const bend = new THREE.Mesh(
          new THREE.BoxGeometry(20, 0.4, 8),
          deckMat
        );
        bend.position.set(20, deckY, startZ + length - 4);
        bend.castShadow = true;
        pierG.add(bend);

        // Pier pilings beneath
        const pilingMat = new THREE.MeshStandardMaterial({
          color: 0x3c2a1a, roughness: 0.9,
        });
        const pilingGeom = new THREE.CylinderGeometry(0.3, 0.4, 8, 6);
        const pilingCount = 24;
        const pilingInst = new THREE.InstancedMesh(pilingGeom, pilingMat, pilingCount);
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        let pi = 0;
        for (let i = 0; i < pilingCount / 2; i++) {
          const z = startZ + 6 + (i / (pilingCount / 2 - 1)) * (length - 12);
          [-width / 2 + 0.4, width / 2 - 0.4].forEach((dx) => {
            v.set(20 + dx, deckY - 4, z);
            m4.compose(v, q, s);
            pilingInst.setMatrixAt(pi++, m4);
          });
        }
        pilingInst.count = pi;
        pilingInst.instanceMatrix.needsUpdate = true;
        pilingInst.castShadow = true;
        pierG.add(pilingInst);

        // Railings (both sides + at the end)
        const railMat = new THREE.MeshStandardMaterial({
          color: 0x2c3540, metalness: 0.7, roughness: 0.45,
        });
        [-width / 2 + 0.1, width / 2 - 0.1].forEach((dx) => {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.08, length), railMat
          );
          rail.position.set(20 + dx, deckY + 1.1, startZ + length / 2);
          pierG.add(rail);
          const mid = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.05, length), railMat
          );
          mid.position.set(20 + dx, deckY + 0.55, startZ + length / 2);
          pierG.add(mid);
        });

        // End-cap railing wraps around the bend
        [-10, 10].forEach((dx) => {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 8), railMat);
          r.position.set(20 + dx, deckY + 1.1, startZ + length - 4);
          pierG.add(r);
        });
        const endRail = new THREE.Mesh(new THREE.BoxGeometry(20, 0.08, 0.1), railMat);
        endRail.position.set(20, deckY + 1.1, startZ + length);
        pierG.add(endRail);

        // Posts
        const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6);
        const postInst = new THREE.InstancedMesh(postGeom, railMat, 60);
        let pcount = 0;
        for (let i = 0; i <= 20; i++) {
          const z = startZ + (i / 20) * length;
          [-width / 2 + 0.1, width / 2 - 0.1].forEach((dx) => {
            v.set(20 + dx, deckY + 0.65, z);
            m4.compose(v, q, s);
            postInst.setMatrixAt(pcount++, m4);
          });
        }
        // posts at bend end
        for (let i = 0; i <= 8; i++) {
          v.set(20 - 10 + (i / 8) * 20, deckY + 0.65, startZ + length);
          m4.compose(v, q, s);
          postInst.setMatrixAt(pcount++, m4);
          if (pcount >= 60) break;
        }
        postInst.count = pcount;
        postInst.instanceMatrix.needsUpdate = true;
        pierG.add(postInst);

        // Lamp posts every ~25 units
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x1a2230, metalness: 0.6, roughness: 0.5,
        });
        const lampGeom = new THREE.CylinderGeometry(0.1, 0.15, 4, 6);
        const bulbGeom = new THREE.SphereGeometry(0.28, 8, 6);
        const lampBulbMat = new THREE.MeshStandardMaterial({
          color: 0xfff6c8, emissive: 0xffd07a, emissiveIntensity: 0.4,
        });
        const lampCount = 5;
        const lampInst = new THREE.InstancedMesh(lampGeom, lampMat, lampCount);
        const lampBulbInst = new THREE.InstancedMesh(bulbGeom, lampBulbMat, lampCount);
        bulbMeshes.push(lampBulbInst);
        for (let i = 0; i < lampCount; i++) {
          const z = startZ + 10 + (i / (lampCount - 1)) * (length - 20);
          v.set(20 + (i % 2 === 0 ? -width / 2 + 0.5 : width / 2 - 0.5), deckY + 2, z);
          m4.compose(v, q, s);
          lampInst.setMatrixAt(i, m4);
          v.set(20 + (i % 2 === 0 ? -width / 2 + 0.5 : width / 2 - 0.5), deckY + 4.1, z);
          m4.compose(v, q, s);
          lampBulbInst.setMatrixAt(i, m4);
        }
        lampInst.instanceMatrix.needsUpdate = true;
        lampBulbInst.instanceMatrix.needsUpdate = true;
        pierG.add(lampInst);
        pierG.add(lampBulbInst);

        // Anglers at the end — capsules with little rods
        const personMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.85 });
        const rodMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.4 });
        const rodGeom = new THREE.CylinderGeometry(0.02, 0.01, 3, 4);
        for (let i = 0; i < 5; i++) {
          const x = 20 + (Math.random() - 0.5) * 16;
          const z = startZ + length - 4 + (Math.random() - 0.5) * 6;
          const person = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6), personMat
          );
          person.position.set(x, deckY + 0.9, z);
          person.castShadow = true;
          pierG.add(person);
          const rod = new THREE.Mesh(rodGeom, rodMat);
          rod.position.set(x + 0.4, deckY + 2.2, z);
          rod.rotation.z = -Math.PI / 3.4;
          pierG.add(rod);
        }

        scene.add(pierG);
        return pierG;
      }

      /* ----------------------------------------------------------------
       *  LANDMARK: Stillwell Avenue Terminal
       *  The big yellow elevated F/Q/D/N station at the west of Coney.
       * ---------------------------------------------------------------- */
      function buildStillwellTerminal() {
        const g = new THREE.Group();
        // Anchor it on the existing subway line z=-70, west side at x=-460.
        const cx = -460, cz = -70;
        const platformY = groundMesh.position.y + terrainAmp + 22;

        // Building footprint at ground (ticketing / entrance hall)
        const baseMat = new THREE.MeshStandardMaterial({
          color: 0xc97e29, roughness: 0.75, metalness: 0.1,
        });
        const trimMat = new THREE.MeshStandardMaterial({
          color: 0x2a2f38, metalness: 0.55, roughness: 0.55,
        });
        const groundY = groundMesh.position.y + terrainAmp + 0.05;
        const baseB = new THREE.Mesh(
          new THREE.BoxGeometry(70, 14, 22), baseMat
        );
        baseB.position.set(cx, groundY + 7, cz);
        baseB.castShadow = true; baseB.receiveShadow = true;
        g.add(baseB);

        // Storefront strip with brown trim along the bottom
        const stripMat = new THREE.MeshStandardMaterial({ color: 0x2c241a, roughness: 0.7 });
        const strip = new THREE.Mesh(new THREE.BoxGeometry(70.2, 3, 22.2), stripMat);
        strip.position.set(cx, groundY + 1.5, cz);
        g.add(strip);

        // The huge yellow elevated canopy — long box covering platforms
        const canopyW = 80, canopyD = 32, canopyH = 7;
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(canopyW, canopyH, canopyD), baseMat
        );
        canopy.position.set(cx, platformY + canopyH / 2 + 2, cz);
        canopy.castShadow = true;
        g.add(canopy);

        // Arched ribs on the canopy (the distinctive curved trusses)
        const ribMat = new THREE.MeshStandardMaterial({
          color: 0xb86e1a, metalness: 0.4, roughness: 0.55,
        });
        const ribCount = 9;
        for (let i = 0; i < ribCount; i++) {
          const u = i / (ribCount - 1);
          const rx = cx - canopyW / 2 + 6 + u * (canopyW - 12);
          const archShape = new THREE.Shape();
          archShape.moveTo(-canopyD / 2, 0);
          archShape.bezierCurveTo(-canopyD / 2, 6, canopyD / 2, 6, canopyD / 2, 0);
          const archGeom = new THREE.ExtrudeGeometry(archShape, {
            depth: 0.4, bevelEnabled: false,
          });
          const arch = new THREE.Mesh(archGeom, ribMat);
          arch.position.set(rx, platformY + canopyH + 2, cz);
          arch.rotation.y = Math.PI / 2;
          arch.castShadow = true;
          g.add(arch);
        }

        // Skylight strip running along the top of the canopy
        const skyMat = new THREE.MeshStandardMaterial({
          color: 0xa8d8ee, transparent: true, opacity: 0.6,
          metalness: 0.4, roughness: 0.2, emissive: 0x4a6678, emissiveIntensity: 0.1,
        });
        const skylightBar = new THREE.Mesh(
          new THREE.BoxGeometry(canopyW - 4, 0.5, 6), skyMat
        );
        skylightBar.position.set(cx, platformY + canopyH + 2.2, cz);
        g.add(skylightBar);

        // Platforms — 4 tracks
        const platMat = new THREE.MeshStandardMaterial({ color: 0x6b6e74, roughness: 0.9 });
        const platGeom = new THREE.BoxGeometry(canopyW - 4, 0.6, 4);
        for (let i = -2; i <= 1; i++) {
          const platform = new THREE.Mesh(platGeom, platMat);
          platform.position.set(cx, platformY + 1, cz + i * 6 - 1);
          platform.castShadow = true; platform.receiveShadow = true;
          g.add(platform);
        }

        // Trusses (legs holding canopy up) — diagonal X-braces
        const legMat = new THREE.MeshStandardMaterial({
          color: 0x946228, metalness: 0.5, roughness: 0.5,
        });
        const legGeom = new THREE.CylinderGeometry(0.6, 0.6, platformY - groundY, 8);
        const legCount = 12;
        const legInst = new THREE.InstancedMesh(legGeom, legMat, legCount * 4);
        let li = 0;
        const m4l = new THREE.Matrix4();
        const vl = new THREE.Vector3();
        const ql = new THREE.Quaternion();
        const sl = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < legCount; i++) {
          const u = i / (legCount - 1);
          const lx = cx - canopyW / 2 + 4 + u * (canopyW - 8);
          [-canopyD / 2 + 1, canopyD / 2 - 1].forEach((dz) => {
            vl.set(lx, (groundY + platformY) / 2, cz + dz);
            m4l.compose(vl, ql, sl);
            legInst.setMatrixAt(li++, m4l);
          });
        }
        legInst.count = li;
        legInst.instanceMatrix.needsUpdate = true;
        legInst.castShadow = true;
        g.add(legInst);

        // X-braces between legs (a series of thin diagonals)
        const braceMat = legMat;
        const braceGeom = new THREE.BoxGeometry(0.3, 0.3, 10);
        for (let i = 0; i < legCount - 1; i++) {
          const u1 = i / (legCount - 1);
          const u2 = (i + 1) / (legCount - 1);
          const x1 = cx - canopyW / 2 + 4 + u1 * (canopyW - 8);
          const x2 = cx - canopyW / 2 + 4 + u2 * (canopyW - 8);
          const xm = (x1 + x2) / 2;
          [-canopyD / 2 + 1, canopyD / 2 - 1].forEach((dz) => {
            const b1 = new THREE.Mesh(braceGeom, braceMat);
            b1.position.set(xm, (groundY + platformY) / 2, cz + dz);
            const angle = Math.atan2(platformY - groundY, x2 - x1);
            b1.rotation.y = Math.atan2(0, 1);
            b1.rotation.z = angle;
            b1.scale.z = Math.hypot(x2 - x1, platformY - groundY) / 10;
            g.add(b1);
            const b2 = b1.clone();
            b2.rotation.z = -angle;
            g.add(b2);
          });
        }

        // Big "STILLWELL AVENUE" signage on the front
        const signTex = signTexture("STILLWELL AVENUE", "#c97e29", "#1a1a1a", 2048, 256);
        const signMat = new THREE.MeshStandardMaterial({
          map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.2,
          roughness: 0.7,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(56, 4.5), signMat);
        sign.position.set(cx, groundY + 12, cz + 11.1);
        g.add(sign);

        // F/Q/D/N route bullets (4 colored circles on the side)
        const routes = [
          { letter: "F", color: "#ff6319", bg: "#ff6319" },
          { letter: "Q", color: "#fccc0a", bg: "#fccc0a" },
          { letter: "D", color: "#ff6319", bg: "#ff6319" },
          { letter: "N", color: "#fccc0a", bg: "#fccc0a" },
        ];
        routes.forEach((r, idx) => {
          const tex = signTexture(r.letter, r.bg, "#000", 256, 256);
          const m = new THREE.MeshStandardMaterial({
            map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5,
          });
          const bullet = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), m);
          bullet.position.set(cx - 24 + idx * 5, groundY + 5, cz + 11.15);
          g.add(bullet);
        });

        // Entrance overhang
        const oh = new THREE.Mesh(
          new THREE.BoxGeometry(20, 0.5, 4), baseMat
        );
        oh.position.set(cx, groundY + 5, cz + 13);
        oh.castShadow = true;
        g.add(oh);

        // Subtle interior emissive (warm yellow glow from inside the hall)
        const interiorLight = new THREE.PointLight(0xffd07a, 0.0, 80, 2);
        interiorLight.position.set(cx, groundY + 8, cz);
        g.add(interiorLight);
        rideLights.push(interiorLight);

        scene.add(g);
        return g;
      }

      /* ----------------------------------------------------------------
       *  LANDMARK: B&B Carousell pavilion
       *  Glass-walled pavilion with rotating carousel horses inside.
       * ---------------------------------------------------------------- */
      function buildBnBCarousell() {
        const g = new THREE.Group();
        // Place between Wonder Wheel and Nathan's, on the boardwalk-adjacent plaza
        const cx = -35, cz = 22;
        const groundY = groundMesh.position.y + terrainAmp + 0.5;
        g.position.set(cx, groundY, cz);

        // Glass pavilion walls (curved-ish, octagonal)
        const radius = 12;
        const sides = 8;
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xa8d8f0, transparent: true, opacity: 0.28,
          metalness: 0.4, roughness: 0.1, transmission: 0.5,
        });
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0xd61d2c, metalness: 0.55, roughness: 0.4,
        });
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          const x = Math.cos(a) * radius;
          const z = Math.sin(a) * radius;
          const wall = new THREE.Mesh(
            new THREE.PlaneGeometry(2 * radius * Math.tan(Math.PI / sides), 6),
            glassMat
          );
          wall.position.set(x, 3, z);
          wall.lookAt(0, 3, 0);
          g.add(wall);
          // Vertical frame at corner
          const corner = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 6.5, 0.25), frameMat
          );
          corner.position.set(x * 1.02, 3.25, z * 1.02);
          corner.castShadow = true;
          g.add(corner);
        }

        // Roof — domed
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0xc41e3a, metalness: 0.3, roughness: 0.55,
        });
        const dome = new THREE.Mesh(
          new THREE.ConeGeometry(radius + 1, 5, 16),
          roofMat
        );
        dome.position.y = 8;
        dome.castShadow = true;
        g.add(dome);

        // Roof finial
        const finial = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 2, 6),
          new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 })
        );
        finial.position.y = 11.5;
        g.add(finial);

        // Bulb chain around roofline
        makeBulbsAlongCircle(radius + 0.5, 48, 0xffe2a0, g, "y");

        // The carousel platform inside
        const platformMat = new THREE.MeshStandardMaterial({
          color: 0x8b4513, roughness: 0.85,
        });
        const platform = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 7.2, 0.6, 24), platformMat
        );
        platform.position.y = 0.3;
        platform.castShadow = true;
        g.add(platform);

        // Center column
        const center = new THREE.Mesh(
          new THREE.CylinderGeometry(1.2, 1.2, 7, 12),
          new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.85, roughness: 0.2 })
        );
        center.position.y = 3.5;
        g.add(center);

        // Rotating carousel group (platform + horses + poles)
        const rotor = new THREE.Group();
        rotor.position.y = 0.6;
        g.add(rotor);

        // Horses on poles
        const horseColors = [0xfafafa, 0x444444, 0xc8b48f, 0x8b4513];
        const horseGeom = new THREE.BoxGeometry(1.4, 1.1, 0.5);
        const poleGeom = new THREE.CylinderGeometry(0.08, 0.08, 4, 6);
        const poleMat = new THREE.MeshStandardMaterial({
          color: 0xffd700, metalness: 0.85, roughness: 0.25,
        });
        const numHorses = 10;
        const horses = [];
        for (let i = 0; i < numHorses; i++) {
          const a = (i / numHorses) * Math.PI * 2;
          const hr = 4.8;
          const horseMat = new THREE.MeshStandardMaterial({
            color: horseColors[i % horseColors.length], roughness: 0.55, metalness: 0.2,
          });
          // Pole
          const pole = new THREE.Mesh(poleGeom, poleMat);
          pole.position.set(Math.cos(a) * hr, 2, Math.sin(a) * hr);
          rotor.add(pole);
          // Horse body
          const horse = new THREE.Mesh(horseGeom, horseMat);
          horse.position.set(Math.cos(a) * hr, 2.1, Math.sin(a) * hr);
          horse.rotation.y = a + Math.PI / 2;
          horse.castShadow = true;
          rotor.add(horse);
          // Head (sphere on top)
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 6), horseMat
          );
          head.position.set(
            Math.cos(a) * (hr + 0.45),
            2.5,
            Math.sin(a) * (hr + 0.45)
          );
          rotor.add(head);
          horses.push({ horse, pole, head, baseY: 2.1, phase: i });
        }

        // Outer decorative band
        const bandTex = signTexture("B&B CAROUSELL", "#c41e3a", "#ffd700", 1024, 96);
        const bandMat = new THREE.MeshStandardMaterial({
          map: bandTex, emissive: 0xffffff, emissiveMap: bandTex, emissiveIntensity: 0.3,
        });
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(7.5, 7.5, 0.8, 24, 1, true), bandMat
        );
        band.position.y = 6;
        band.rotation.y = 0;
        g.add(band);

        carouselsAnim.push({
          rotor, horses, rotSpeed: 0.012, horseAmp: 0.25,
        });

        scene.add(g);
        return g;
      }

      /* ----------------------------------------------------------------
       *  LANDMARK: Childs Restaurant / Ford Amphitheater
       *  Terracotta nautical-motif facade east of the rides.
       * ---------------------------------------------------------------- */
      function buildChildsRestaurant() {
        const g = new THREE.Group();
        const cx = 90, cz = 30;
        const groundY = groundMesh.position.y + terrainAmp + 0.05;

        const facadeTex = terracottaTexture();
        facadeTex.repeat.set(2, 1);
        const facadeMat = new THREE.MeshStandardMaterial({
          map: facadeTex, roughness: 0.75, metalness: 0.05,
        });
        const trimMat = new THREE.MeshStandardMaterial({
          color: 0xeae3d4, roughness: 0.6,
        });

        // Main building (longer than wide, facing south to the boardwalk)
        const W = 40, H = 14, D = 22;
        const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), facadeMat);
        main.position.set(cx, groundY + H / 2, cz);
        main.castShadow = true; main.receiveShadow = true;
        g.add(main);

        // Cornice / parapet on top
        const cornice = new THREE.Mesh(
          new THREE.BoxGeometry(W + 1, 1.5, D + 1), trimMat
        );
        cornice.position.set(cx, groundY + H + 0.75, cz);
        g.add(cornice);

        // Three central arch entries
        const arch = new THREE.Mesh(
          new THREE.CylinderGeometry(3, 3, 1, 16, 1, false, 0, Math.PI),
          trimMat
        );
        for (let i = -1; i <= 1; i++) {
          const a = new THREE.Mesh(arch.geometry, trimMat);
          a.position.set(cx + i * 8, groundY + 7, cz + D / 2 + 0.05);
          a.rotation.x = Math.PI / 2;
          a.rotation.z = Math.PI;
          g.add(a);
          // Inset dark "window"
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(4.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x1a1814, roughness: 0.7 })
          );
          win.position.set(cx + i * 8, groundY + 4, cz + D / 2 + 0.1);
          g.add(win);
        }

        // Nautical motif: ship, fish, shells along the trim
        const motifMat = new THREE.MeshStandardMaterial({
          color: 0xf2dab2, roughness: 0.7,
        });
        for (let i = 0; i < 7; i++) {
          const motif = new THREE.Mesh(
            new THREE.TorusGeometry(0.6, 0.18, 4, 8),
            motifMat
          );
          motif.position.set(
            cx - W / 2 + 2 + i * (W - 4) / 6,
            groundY + H - 2,
            cz + D / 2 + 0.05
          );
          motif.castShadow = true;
          g.add(motif);
        }

        // "CHILDS" sign (cornice frieze)
        const sg = signTexture("CHILDS RESTAURANT", "#eae3d4", "#7a3a1a", 2048, 192);
        const signMat = new THREE.MeshStandardMaterial({
          map: sg, emissive: 0xffffff, emissiveMap: sg, emissiveIntensity: 0.3,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(28, 2.2), signMat);
        sign.position.set(cx, groundY + H - 0.5, cz + D / 2 + 0.06);
        g.add(sign);

        // Amphitheater stage behind the facade
        const stageMat = new THREE.MeshStandardMaterial({
          color: 0x3a3022, roughness: 0.85,
        });
        const stage = new THREE.Mesh(
          new THREE.BoxGeometry(28, 1, 14), stageMat
        );
        stage.position.set(cx, groundY + 0.5, cz - D / 2 - 8);
        stage.castShadow = true; stage.receiveShadow = true;
        g.add(stage);

        scene.add(g);
        return g;
      }

      /* ----------------------------------------------------------------
       *  LANDMARK: Coney Island Houses
       *  The 14-story brick NYCHA towers behind the rides (Surfside
       *  Gardens/Coney Island Houses cluster).
       * ---------------------------------------------------------------- */
      function buildConeyIslandHouses() {
        const g = new THREE.Group();
        const groundY = groundMesh.position.y + terrainAmp + 0.05;
        const brickTex = brickTexture();

        const towerConfigs = [
          { x: -80, z: -120, w: 22, h: 56, d: 14 },
          { x: -40, z: -140, w: 22, h: 62, d: 14 },
          { x:   0, z: -125, w: 22, h: 50, d: 14 },
          { x:  40, z: -150, w: 22, h: 60, d: 14 },
          { x:  80, z: -130, w: 22, h: 54, d: 14 },
          { x: 130, z: -160, w: 22, h: 58, d: 14 },
          { x: -130, z: -170, w: 22, h: 56, d: 14 },
          { x: -180, z: -140, w: 22, h: 52, d: 14 },
          { x: 180, z: -140, w: 22, h: 58, d: 14 },
        ];

        towerConfigs.forEach((c) => {
          const tx = brickTex.clone();
          tx.needsUpdate = true;
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.repeat.set(c.w / 3, c.h / 3);
          tx.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.MeshStandardMaterial({
            map: tx, roughness: 0.85, metalness: 0.02,
          });
          const tower = new THREE.Mesh(
            new THREE.BoxGeometry(c.w, c.h, c.d), mat
          );
          tower.position.set(c.x, groundY + c.h / 2, c.z);
          tower.castShadow = true;
          tower.receiveShadow = true;
          g.add(tower);

          // Window grid overlay (dark slits)
          const winMat = new THREE.MeshStandardMaterial({
            color: 0x222831, emissive: 0x6e5a30, emissiveIntensity: 0.0, roughness: 0.4,
          });
          const winInst = new THREE.InstancedMesh(
            new THREE.PlaneGeometry(1.2, 1.6), winMat,
            Math.floor(c.h / 4) * 6 * 2
          );
          const m4 = new THREE.Matrix4();
          const vv = new THREE.Vector3();
          const qq = new THREE.Quaternion();
          const ss = new THREE.Vector3(1, 1, 1);
          let wi = 0;
          const rows = Math.floor((c.h - 6) / 4);
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < 5; col++) {
              const y = 4 + row * 4;
              const x = -c.w / 2 + 2 + col * (c.w - 4) / 4;
              // South face
              vv.set(c.x + x, groundY + y, c.z + c.d / 2 + 0.02);
              qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
              m4.compose(vv, qq, ss);
              if (wi < winInst.count) winInst.setMatrixAt(wi++, m4);
              // North face
              vv.set(c.x + x, groundY + y, c.z - c.d / 2 - 0.02);
              qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
              m4.compose(vv, qq, ss);
              if (wi < winInst.count) winInst.setMatrixAt(wi++, m4);
            }
          }
          winInst.count = wi;
          winInst.instanceMatrix.needsUpdate = true;
          g.add(winInst);

          // Roof water tank (NYCHA wooden tanks)
          const tankMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.9 });
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 3, 10), tankMat
          );
          tank.position.set(c.x + 2, groundY + c.h + 1.5, c.z);
          tank.castShadow = true;
          g.add(tank);
          const tankTop = new THREE.Mesh(
            new THREE.ConeGeometry(2.2, 1.5, 10), tankMat
          );
          tankTop.position.set(c.x + 2, groundY + c.h + 3.5, c.z);
          g.add(tankTop);
          // Tank legs
          const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.5 });
          [-1.3, 1.3].forEach((dx) => [-1.3, 1.3].forEach((dz) => {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.1, 0.1, 2, 5), legMat
            );
            leg.position.set(c.x + 2 + dx, groundY + c.h + 0.5, c.z + dz);
            g.add(leg);
          }));
        });

        scene.add(g);
        return g;
      }

      /* ----------------------------------------------------------------
       *  LANDMARK: Verrazzano-Narrows Bridge silhouette on horizon
       *  Visible to the west from the boardwalk on clear days.
       * ---------------------------------------------------------------- */
      function buildVerrazzanoBridge() {
        const g = new THREE.Group();
        // Place far west at x = -1400, on the ocean horizon at z = 250 (south of camera)
        const cx = -1400, cz = 250;
        const baseY = groundMesh.position.y + terrainAmp;

        const towerH = 85;
        const towerW = 8;
        const spanLength = 380;
        const towerMat = new THREE.MeshStandardMaterial({
          color: 0x8a8a86, metalness: 0.4, roughness: 0.65,
        });
        const cableMat = new THREE.MeshStandardMaterial({
          color: 0x5a5a58, metalness: 0.8, roughness: 0.3,
        });

        // Two towers
        const towerPositions = [-spanLength / 2, spanLength / 2];
        towerPositions.forEach((dx) => {
          // H-shape: two legs with a horizontal connector at top
          [-towerW * 0.6, towerW * 0.6].forEach((legDx) => {
            const leg = new THREE.Mesh(
              new THREE.BoxGeometry(2.5, towerH, 2.5), towerMat
            );
            leg.position.set(cx + dx + legDx, baseY + towerH / 2, cz);
            leg.castShadow = true;
            g.add(leg);
          });
          // Cross-brace high
          const cross = new THREE.Mesh(
            new THREE.BoxGeometry(towerW * 1.6, 1.5, 2.2), towerMat
          );
          cross.position.set(cx + dx, baseY + towerH - 4, cz);
          g.add(cross);
          // Crown
          const crown = new THREE.Mesh(
            new THREE.BoxGeometry(towerW * 1.8, 2, 2.5), towerMat
          );
          crown.position.set(cx + dx, baseY + towerH + 1, cz);
          g.add(crown);
        });

        // Main cables (two parabolic arcs) — built from segmented box pieces
        const segs = 30;
        const cableYat = (t) => {
          // catenary-ish parabola from tower-top to mid-span sag
          const mid = (t - 0.5) * 2; // -1..1
          const sag = 32;
          return baseY + towerH - sag * (1 - mid * mid);
        };
        for (let s of [-1, 1]) {
          const dxOff = s * towerW * 0.6;
          for (let i = 0; i < segs; i++) {
            const u1 = i / segs;
            const u2 = (i + 1) / segs;
            const x1 = cx - spanLength / 2 + u1 * spanLength;
            const x2 = cx - spanLength / 2 + u2 * spanLength;
            const y1 = cableYat(u1);
            const y2 = cableYat(u2);
            const len = Math.hypot(x2 - x1, y2 - y1);
            const seg = new THREE.Mesh(
              new THREE.BoxGeometry(len, 0.5, 0.5), cableMat
            );
            seg.position.set((x1 + x2) / 2 + dxOff, (y1 + y2) / 2, cz);
            seg.rotation.z = Math.atan2(y2 - y1, x2 - x1);
            g.add(seg);
          }
          // suspender vertical cables every few segments
          for (let i = 4; i < segs - 4; i += 3) {
            const u = i / segs;
            const x = cx - spanLength / 2 + u * spanLength;
            const yTop = cableYat(u);
            const yBot = baseY + 12;
            const v = new THREE.Mesh(
              new THREE.BoxGeometry(0.2, yTop - yBot, 0.2), cableMat
            );
            v.position.set(x + dxOff, (yTop + yBot) / 2, cz);
            g.add(v);
          }
        }

        // Deck (roadway)
        const deckMat = new THREE.MeshStandardMaterial({
          color: 0x4a4d54, roughness: 0.85,
        });
        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(spanLength, 1.5, 7), deckMat
        );
        deck.position.set(cx, baseY + 11, cz);
        g.add(deck);
        // Side approach spans (stubs)
        const stubL = new THREE.Mesh(
          new THREE.BoxGeometry(80, 1.5, 7), deckMat
        );
        stubL.position.set(cx - spanLength / 2 - 40, baseY + 11, cz);
        g.add(stubL);
        const stubR = stubL.clone();
        stubR.position.set(cx + spanLength / 2 + 40, baseY + 11, cz);
        g.add(stubR);

        scene.add(g);
        return g;
      }

      /* ----------------------------------------------------------------
       *  MCU Park upgrade — light towers + retro arched sign
       * ---------------------------------------------------------------- */
      function upgradeMCUPark(stadiumG) {
        // stadiumG is parented at (-180, baseY+0.1, -60). All additions
        // below are in LOCAL coordinates of stadiumG.

        // Light towers at 4 corners of the field
        const towerMat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a, metalness: 0.7, roughness: 0.45,
        });
        const lightHeadMat = new THREE.MeshStandardMaterial({
          color: 0xfffff0, emissive: 0xfffaa0, emissiveIntensity: 0.9,
        });
        const towerPositions = [
          { x: -40, z: -40 }, { x: 40, z: -40 },
          { x: -40, z:  40 }, { x: 40, z:  40 },
        ];
        towerPositions.forEach((p) => {
          const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 1.0, 28, 8), towerMat
          );
          tower.position.set(p.x, 14, p.z);
          tower.castShadow = true;
          stadiumG.add(tower);
          // Light rack at top
          const rack = new THREE.Mesh(
            new THREE.BoxGeometry(4, 1, 0.5), towerMat
          );
          rack.position.set(p.x, 28.5, p.z);
          stadiumG.add(rack);
          const bulbs = new THREE.Mesh(
            new THREE.BoxGeometry(3.8, 0.7, 0.5), lightHeadMat
          );
          bulbs.position.set(p.x, 28.5, p.z);
          stadiumG.add(bulbs);
          bulbMeshes.push(bulbs);
        });

        // Big "MCU PARK / BROOKLYN CYCLONES" sign behind home plate
        const sg = multiLineSignTex(
          ["MCU PARK", "BROOKLYN CYCLONES"],
          "#1c4a8a", "#ffd700", 1024, 256
        );
        const signMat = new THREE.MeshStandardMaterial({
          map: sg, emissive: 0xffffff, emissiveMap: sg, emissiveIntensity: 0.35,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(28, 8), signMat);
        sign.position.set(0, 12, -42);
        stadiumG.add(sign);

        // Infield dirt (diamond rotated 45°)
        const dirtMat = new THREE.MeshStandardMaterial({ color: 0x9c6135, roughness: 0.95 });
        const diamond = new THREE.Mesh(
          new THREE.PlaneGeometry(22, 22),
          dirtMat
        );
        diamond.rotation.x = -Math.PI / 2;
        diamond.rotation.z = Math.PI / 4;
        diamond.position.set(0, 0.05, 0);
        stadiumG.add(diamond);
        // Pitcher's mound
        const mound = new THREE.Mesh(
          new THREE.CircleGeometry(1.2, 12),
          dirtMat
        );
        mound.rotation.x = -Math.PI / 2;
        mound.position.set(0, 0.06, 0);
        stadiumG.add(mound);

        // Scoreboard above outfield
        const sbMat = new THREE.MeshStandardMaterial({
          color: 0x111419, emissive: 0x0a2a4a, emissiveIntensity: 0.3,
        });
        const scoreboard = new THREE.Mesh(
          new THREE.BoxGeometry(12, 6, 1), sbMat
        );
        scoreboard.position.set(0, 16, 38);
        stadiumG.add(scoreboard);
      }

      /* ----------------------------------------------------------------
       *  BOARDWALK VENDOR CARTS — Italian ice, funnel cake, pretzel, gyro
       * ---------------------------------------------------------------- */
      function buildBoardwalkVendors() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const bwCenterZ = 38;
        const vendors = [
          { label: "ITALIAN ICE", x: -180, color: "#1976d2", awning: 0xfa3030, steam: false },
          { label: "FUNNEL CAKE", x: -60,  color: "#fbbf24", awning: 0xfacc15, steam: true },
          { label: "PRETZELS",    x: 60,   color: "#7a3a1a", awning: 0x7a3a1a, steam: true },
          { label: "HALAL GYRO",  x: 160,  color: "#0a7a40", awning: 0x0a7a40, steam: true },
          { label: "LEMONADE",    x: 240,  color: "#ffeb3b", awning: 0xffeb3b, steam: false },
        ];

        vendors.forEach((v) => {
          const g = new THREE.Group();
          g.position.set(v.x, baseY + 0.45, bwCenterZ + 0.5);

          // Cart body
          const cartMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5f3, roughness: 0.7, metalness: 0.1,
          });
          const cart = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 1.8), cartMat);
          cart.position.y = 0.8;
          cart.castShadow = true; cart.receiveShadow = true;
          g.add(cart);

          // Bottom shelf / wheel housing
          const lower = new THREE.Mesh(
            new THREE.BoxGeometry(3.4, 0.4, 2),
            new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.6 })
          );
          lower.position.y = 0.2;
          g.add(lower);

          // Wheels
          const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, metalness: 0.4, roughness: 0.65,
          });
          const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 10);
          [[-1.2, -0.85], [1.2, -0.85], [-1.2, 0.85], [1.2, 0.85]].forEach(([wx, wz]) => {
            const w = new THREE.Mesh(wheelGeom, wheelMat);
            w.rotation.z = Math.PI / 2;
            w.position.set(wx, 0.05, wz);
            g.add(w);
          });

          // Awning / umbrella
          const awningMat = new THREE.MeshStandardMaterial({
            color: v.awning, roughness: 0.55,
            emissive: v.awning, emissiveIntensity: 0.05,
          });
          const awning = new THREE.Mesh(
            new THREE.ConeGeometry(2.2, 0.6, 8), awningMat
          );
          awning.position.y = 3.5;
          awning.castShadow = true;
          g.add(awning);

          // Pole
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 2, 6),
            new THREE.MeshStandardMaterial({ color: 0x2c3540, metalness: 0.7, roughness: 0.4 })
          );
          pole.position.y = 2.4;
          g.add(pole);

          // Signage panel
          const sigTex = signTexture(v.label, v.color, "#ffffff", 1024, 128);
          const sigMat = new THREE.MeshStandardMaterial({
            map: sigTex, emissive: 0xffffff, emissiveMap: sigTex, emissiveIntensity: 0.4,
          });
          const sig = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), sigMat);
          sig.position.set(0, 2.0, 0.92);
          g.add(sig);

          // Vendor figure behind cart
          const vendorMat = new THREE.MeshStandardMaterial({
            color: 0x7a3a1a, roughness: 0.85,
          });
          const vendor = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6), vendorMat
          );
          vendor.position.set(0, 1.5, -1.1);
          vendor.castShadow = true;
          g.add(vendor);

          // Customer
          if (Math.random() > 0.3) {
            const custMat = new THREE.MeshStandardMaterial({
              color: 0x3a4a8a, roughness: 0.85,
            });
            const cust = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 1.2, 4, 6), custMat
            );
            cust.position.set(0.6, 1.5, 1.7);
            cust.castShadow = true;
            g.add(cust);
          }

          scene.add(g);

          // Steam plume if cooking
          if (v.steam) {
            spawnSteam(v.x, baseY + 1.7, bwCenterZ + 0.5, {
              count: 28, scale: 0.8, riseSpeed: 1.4,
            });
          }
        });
      }

      /* ----------------------------------------------------------------
       *  LIFEGUARD CHAIRS — tall white wood with orange flag
       * ---------------------------------------------------------------- */
      function buildLifeguardChairs() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const sandCenterZ = 62.5;
        const positions = [
          -380, -240, -100, 40, 180, 320, 460,
        ];
        const woodMat = new THREE.MeshStandardMaterial({
          color: 0xf5f0e0, roughness: 0.8,
        });
        const flagMat = new THREE.MeshStandardMaterial({
          color: 0xff5a1f, roughness: 0.6, emissive: 0x4a1a0a, emissiveIntensity: 0.1,
        });

        positions.forEach((x) => {
          const g = new THREE.Group();
          g.position.set(x, baseY, sandCenterZ);

          // Four legs (X-frame)
          const legGeom = new THREE.BoxGeometry(0.18, 6, 0.18);
          [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeom, woodMat);
            leg.position.set(lx, 3, lz);
            leg.castShadow = true;
            g.add(leg);
          });
          // Seat
          const seat = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.2, 2.5), woodMat
          );
          seat.position.set(0, 4.5, 0);
          seat.castShadow = true;
          g.add(seat);
          // Backrest
          const back = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 2.2, 0.2), woodMat
          );
          back.position.set(0, 5.6, -1.15);
          g.add(back);
          // Ladder
          for (let r = 0; r < 4; r++) {
            const rung = new THREE.Mesh(
              new THREE.BoxGeometry(2.5, 0.12, 0.12), woodMat
            );
            rung.position.set(0, 0.8 + r * 0.9, 1.25);
            g.add(rung);
          }
          // Sun roof
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.12, 2.5),
            new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 })
          );
          roof.position.set(0, 7.4, 0);
          roof.castShadow = true;
          g.add(roof);
          // Flagpole
          const fp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 4, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          fp.position.set(1.3, 8.5, 0);
          g.add(fp);
          // Flag
          const flag = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.8), flagMat
          );
          flag.position.set(2.0, 9.5, 0);
          flag.rotation.y = -0.2;
          g.add(flag);

          // Lifeguard figure on the chair half the time
          if (Math.random() > 0.4) {
            const lgMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.7 });
            const lg = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.28, 1.0, 4, 6), lgMat
            );
            lg.position.set(0.2, 5.4, 0);
            lg.castShadow = true;
            g.add(lg);
          }

          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  ROCK JETTIES — extend from shore into the surf every ~200u
       * ---------------------------------------------------------------- */
      function buildBeachJetties() {
        const baseY = groundMesh.position.y + terrainAmp;
        const jettySpacing = 240;
        const numJetties = 7;
        const startX = -700;
        const rockMat = new THREE.MeshStandardMaterial({
          color: 0x4f4946, roughness: 0.95, metalness: 0.0,
        });
        const rockGeoms = [
          new THREE.DodecahedronGeometry(1.0, 0),
          new THREE.DodecahedronGeometry(1.2, 0),
          new THREE.IcosahedronGeometry(0.9, 0),
        ];

        for (let j = 0; j < numJetties; j++) {
          const jx = startX + j * jettySpacing;
          const g = new THREE.Group();
          const length = 28;
          const rockCount = 28;
          for (let i = 0; i < rockCount; i++) {
            const u = i / (rockCount - 1);
            const rz = 78 + u * length; // from sand edge (~78) into water
            const offset = (Math.random() - 0.5) * 1.6;
            const rg = rockGeoms[i % rockGeoms.length];
            const rock = new THREE.Mesh(rg, rockMat);
            rock.position.set(
              jx + offset,
              baseY + 0.3 + Math.random() * 0.5,
              rz + (Math.random() - 0.5) * 0.8
            );
            const scl = 0.7 + Math.random() * 1.2;
            rock.scale.set(scl, scl * 0.7, scl);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true; rock.receiveShadow = true;
            g.add(rock);
            // smaller scatter rocks adjacent
            if (Math.random() > 0.4) {
              const small = new THREE.Mesh(rg, rockMat);
              small.position.set(
                jx + offset + (Math.random() - 0.5) * 2.5,
                baseY + 0.15,
                rz + (Math.random() - 0.5) * 1.5
              );
              small.scale.setScalar(0.35);
              g.add(small);
            }
          }
          scene.add(g);
        }
      }

      /* ----------------------------------------------------------------
       *  Beach wrack — seaweed/shells/imperfection line at high-tide mark
       * ---------------------------------------------------------------- */
      function buildBeachWrack() {
        const baseY = groundMesh.position.y + terrainAmp + 0.06;
        const wrackZ = 72; // where high tide stopped
        const W = groundSize * 0.95;
        // Seaweed clumps as flat patches
        const weedMat = new THREE.MeshStandardMaterial({
          color: 0x3a4a30, roughness: 0.9,
        });
        const shellMat = new THREE.MeshStandardMaterial({
          color: 0xeae0c5, roughness: 0.6,
        });
        const weedGeom = new THREE.CircleGeometry(0.6, 6);
        const shellGeom = new THREE.SphereGeometry(0.08, 5, 4);

        const numClumps = 220;
        const weedInst = new THREE.InstancedMesh(weedGeom, weedMat, numClumps);
        const shellInst = new THREE.InstancedMesh(shellGeom, shellMat, numClumps * 4);
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        let si = 0;
        for (let i = 0; i < numClumps; i++) {
          const x = -W / 2 + Math.random() * W;
          const z = wrackZ + (Math.random() - 0.5) * 4;
          const scl = 0.7 + Math.random() * 1.5;
          s.set(scl, scl, scl);
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
          v.set(x, baseY, z);
          m4.compose(v, q, s);
          weedInst.setMatrixAt(i, m4);
          // shells
          for (let j = 0; j < 4; j++) {
            const sx = x + (Math.random() - 0.5) * 2;
            const sz = z + (Math.random() - 0.5) * 1.5;
            v.set(sx, baseY + 0.04, sz);
            s.set(1, 1, 1);
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
            m4.compose(v, q, s);
            shellInst.setMatrixAt(si++, m4);
            if (si >= shellInst.count) break;
          }
        }
        weedInst.instanceMatrix.needsUpdate = true;
        shellInst.count = si;
        shellInst.instanceMatrix.needsUpdate = true;
        weedInst.receiveShadow = true;
        scene.add(weedInst);
        scene.add(shellInst);

        // A few scattered stray cups / debris near the wrack line
        const cupMat = new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.6 });
        for (let i = 0; i < 12; i++) {
          const x = -W / 2 + Math.random() * W;
          const z = wrackZ + (Math.random() - 0.5) * 6;
          const cup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.12, 0.32, 8),
            cupMat
          );
          cup.position.set(x, baseY + 0.16, z);
          cup.rotation.z = Math.random() * 0.4;
          scene.add(cup);
        }
      }

      /* ----------------------------------------------------------------
       *  Plank variation — overlay patches of different wood/concrete
       *  onto the boardwalk surface so it doesn't look uniform.
       * ---------------------------------------------------------------- */
      function addPlankVariation() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const bwCenterZ = 38, boardwalkDepth = 14;
        const W = groundSize * 0.95;
        // Lighter wood patches (replaced planks)
        const lightWoodMat = new THREE.MeshStandardMaterial({
          color: 0xc4a47a, roughness: 0.8,
        });
        // Darker weathered patches
        const darkWoodMat = new THREE.MeshStandardMaterial({
          color: 0x4a3220, roughness: 0.92,
        });
        // Concrete paver patches
        const paveMat = new THREE.MeshStandardMaterial({
          map: paverTexture(), roughness: 0.85,
        });

        for (let i = 0; i < 16; i++) {
          const w = 4 + Math.random() * 10;
          const d = 2 + Math.random() * 3;
          const x = -W / 2 + Math.random() * (W - w);
          const z = bwCenterZ + (Math.random() - 0.5) * (boardwalkDepth - 4);
          const t = Math.random();
          const mat = t < 0.4 ? lightWoodMat : t < 0.75 ? darkWoodMat : paveMat;
          if (mat === paveMat) {
            const ptex = paverTexture().clone();
            ptex.needsUpdate = true;
            ptex.repeat.set(w / 3, d / 3);
          }
          const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d), mat
          );
          patch.rotation.x = -Math.PI / 2;
          patch.position.set(x + w / 2, baseY + 0.43, z);
          patch.receiveShadow = true;
          scene.add(patch);
        }
      }

      /* ----------------------------------------------------------------
       *  PIGEONS — smaller ground-walking birds near Nathan's
       * ---------------------------------------------------------------- */
      function createPigeons() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const nathanX = -20, nathanZ = 45;
        const count = 22;
        const pigeonMat = new THREE.MeshStandardMaterial({
          color: 0x6a7079, roughness: 0.7,
        });
        const headMat = new THREE.MeshStandardMaterial({
          color: 0x44494f, roughness: 0.7,
        });

        for (let i = 0; i < count; i++) {
          const g = new THREE.Group();
          const r = Math.random() * 8 + 1;
          const a = Math.random() * Math.PI * 2;
          g.position.set(nathanX + Math.cos(a) * r, baseY + 0.15, nathanZ + Math.sin(a) * r);
          // Body
          const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 6, 5), pigeonMat
          );
          body.scale.set(1, 0.75, 1.4);
          g.add(body);
          // Head
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 5, 4), headMat
          );
          head.position.set(0, 0.13, 0.22);
          g.add(head);
          // Tail
          const tail = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.18, 5), pigeonMat
          );
          tail.rotation.x = Math.PI / 2;
          tail.position.set(0, 0, -0.22);
          g.add(tail);
          // Random rotation
          g.rotation.y = Math.random() * Math.PI * 2;
          scene.add(g);
          pigeonsArr.push({
            mesh: g,
            theta: Math.random() * Math.PI * 2,
            r: 1 + Math.random() * 7,
            baseY: baseY + 0.15,
            speed: 0.05 + Math.random() * 0.08,
            wanderPhase: Math.random() * 100,
            pecking: 0,
          });
        }
      }

      /* ----------------------------------------------------------------
       *  Nathan's grill steam vents
       * ---------------------------------------------------------------- */
      function createNathansSteam() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const nathanX = -20, nathanZ = 30;
        // Three steam plumes from grill/fryer vents on the roof
        spawnSteam(nathanX - 4, baseY + 8, nathanZ + 2, { count: 50, scale: 1.0, riseSpeed: 2.0 });
        spawnSteam(nathanX + 4, baseY + 8, nathanZ + 2, { count: 50, scale: 1.0, riseSpeed: 2.0 });
        spawnSteam(nathanX, baseY + 8, nathanZ - 3, { count: 35, scale: 0.8, riseSpeed: 1.6 });
      }

      /* ----------------------------------------------------------------
       *  Detailed Park — GTA-level. Paths, benches along paths,
       *  basketball half-court, dog run, picnic tables, lamp posts,
       *  trash cans, drinking fountain.
       * ---------------------------------------------------------------- */
      function createParkAreaDetailed(config) {
        const { x, z, w, d, addPlayground } = config;
        const g = new THREE.Group();
        const parkY = groundMesh.position.y + getTerrainHeight(x, z) + 0.05;

        // Grass base
        const grass = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ color: 0x6b8e23, roughness: 0.92 })
        );
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(x, parkY, z);
        grass.receiveShadow = true;
        g.add(grass);

        // Walking path — a "cross" through the park in lighter material
        const pathMat = new THREE.MeshStandardMaterial({
          map: sidewalkTexture(), roughness: 0.85,
        });
        const pathTex1 = sidewalkTexture().clone();
        pathTex1.needsUpdate = true;
        pathTex1.repeat.set(w / 4, 1);
        const path1 = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.95, 3.5),
          new THREE.MeshStandardMaterial({ map: pathTex1, roughness: 0.85 })
        );
        path1.rotation.x = -Math.PI / 2;
        path1.position.set(x, parkY + 0.01, z);
        path1.receiveShadow = true;
        g.add(path1);
        const pathTex2 = sidewalkTexture().clone();
        pathTex2.needsUpdate = true;
        pathTex2.repeat.set(1, d / 4);
        const path2 = new THREE.Mesh(
          new THREE.PlaneGeometry(3.5, d * 0.95),
          new THREE.MeshStandardMaterial({ map: pathTex2, roughness: 0.85 })
        );
        path2.rotation.x = -Math.PI / 2;
        path2.position.set(x, parkY + 0.01, z);
        path2.receiveShadow = true;
        g.add(path2);

        // Trees and bushes (sparser to leave room for furniture)
        g.add(createTreesAndBushes(Math.floor((w * d) / 22), config, parkY));

        // Lamp posts along the main path
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x1a2230, metalness: 0.6, roughness: 0.5,
        });
        const lampBulbMat = new THREE.MeshStandardMaterial({
          color: 0xfff6c8, emissive: 0xffd07a, emissiveIntensity: 0.4,
        });
        const lampCount = Math.max(2, Math.floor(w / 14));
        for (let i = 0; i < lampCount; i++) {
          const lx = x - w / 2 + (i + 0.5) * (w / lampCount);
          const lamp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.18, 4.5, 6), lampMat
          );
          lamp.position.set(lx, parkY + 2.25, z + 2.5);
          lamp.castShadow = true;
          g.add(lamp);
          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 6), lampBulbMat
          );
          bulb.position.set(lx, parkY + 4.7, z + 2.5);
          g.add(bulb);
          bulbMeshes.push(bulb);
        }

        // Benches along the path (alternating sides)
        const benchGeom = new THREE.BoxGeometry(2.2, 0.45, 0.7);
        const benchMat = new THREE.MeshStandardMaterial({
          color: 0x4a3220, roughness: 0.85,
        });
        const benchBackGeom = new THREE.BoxGeometry(2.2, 0.9, 0.1);
        const benchCount = Math.max(2, Math.floor(w / 10));
        for (let i = 0; i < benchCount; i++) {
          const bx = x - w / 2 + 4 + i * (w / benchCount);
          const bz = z + (i % 2 === 0 ? -2.8 : 2.8);
          const bench = new THREE.Mesh(benchGeom, benchMat);
          bench.position.set(bx, parkY + 0.22, bz);
          bench.castShadow = true;
          g.add(bench);
          const back = new THREE.Mesh(benchBackGeom, benchMat);
          back.position.set(bx, parkY + 0.85, bz + (i % 2 === 0 ? -0.3 : 0.3));
          back.castShadow = true;
          g.add(back);
          // Legs
          const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6 });
          [-0.9, 0.9].forEach((dx) => {
            const lg = new THREE.Mesh(
              new THREE.BoxGeometry(0.1, 0.5, 0.7), legMat
            );
            lg.position.set(bx + dx, parkY + 0.1, bz);
            g.add(lg);
          });
        }

        // Basketball half-court (NW corner if park large enough)
        if (w >= 50 && d >= 40) {
          const courtMat = new THREE.MeshStandardMaterial({
            color: 0x6e3a1a, roughness: 0.85,
          });
          const court = new THREE.Mesh(
            new THREE.PlaneGeometry(14, 12), courtMat
          );
          court.rotation.x = -Math.PI / 2;
          court.position.set(x - w / 2 + 10, parkY + 0.02, z - d / 2 + 8);
          g.add(court);
          // White lines
          const lineMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
          const lineEdge = new THREE.Mesh(
            new THREE.RingGeometry(2.4, 2.55, 24),
            lineMat
          );
          lineEdge.rotation.x = -Math.PI / 2;
          lineEdge.position.set(x - w / 2 + 10, parkY + 0.04, z - d / 2 + 8);
          g.add(lineEdge);
          // Hoop pole and backboard
          const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6 });
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 4, 6), poleMat
          );
          pole.position.set(x - w / 2 + 10, parkY + 2, z - d / 2 + 13.5);
          pole.castShadow = true;
          g.add(pole);
          const board = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1.4, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 })
          );
          board.position.set(x - w / 2 + 10, parkY + 3.5, z - d / 2 + 13);
          board.castShadow = true;
          g.add(board);
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.05, 6, 12),
            new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.6 })
          );
          rim.position.set(x - w / 2 + 10, parkY + 3.1, z - d / 2 + 12.5);
          rim.rotation.x = Math.PI / 2;
          g.add(rim);
        }

        // Dog run (fenced area, opposite corner)
        if (w >= 60 && d >= 40) {
          const runMat = new THREE.MeshStandardMaterial({
            color: 0xa07050, roughness: 0.9,
          });
          const run = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 10), runMat
          );
          run.rotation.x = -Math.PI / 2;
          run.position.set(x + w / 2 - 8, parkY + 0.02, z + d / 2 - 7);
          g.add(run);
          // Fence (4 sides of thin posts + a wire)
          const fenceMat = new THREE.MeshStandardMaterial({
            color: 0x6a6a6a, metalness: 0.4, roughness: 0.5,
          });
          for (let s = 0; s < 4; s++) {
            const isX = s % 2 === 0;
            const len = isX ? 12 : 10;
            const segPosts = Math.floor(len / 1.5);
            for (let p = 0; p <= segPosts; p++) {
              const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4), fenceMat
              );
              const u = p / segPosts;
              const pos = new THREE.Vector3(x + w / 2 - 8, parkY + 0.75, z + d / 2 - 7);
              if (s === 0) { pos.x = pos.x - 6 + u * 12; pos.z -= 5; }
              else if (s === 1) { pos.x += 6; pos.z = pos.z - 5 + u * 10; }
              else if (s === 2) { pos.x = pos.x - 6 + u * 12; pos.z += 5; }
              else { pos.x -= 6; pos.z = pos.z - 5 + u * 10; }
              post.position.copy(pos);
              g.add(post);
            }
          }
        }

        // Picnic tables — 2-3 per park
        const tableMat = new THREE.MeshStandardMaterial({
          color: 0x8b5a2b, roughness: 0.85,
        });
        const numTables = w >= 50 ? 2 : 1;
        for (let i = 0; i < numTables; i++) {
          const tx = x + (Math.random() - 0.5) * (w - 8);
          const tz = z + (Math.random() - 0.5) * (d - 8);
          // table top
          const top = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 0.1, 1.2), tableMat
          );
          top.position.set(tx, parkY + 0.75, tz);
          top.castShadow = true;
          g.add(top);
          // benches each side
          [-1, 1].forEach((sgn) => {
            const benchT = new THREE.Mesh(
              new THREE.BoxGeometry(2.5, 0.08, 0.4), tableMat
            );
            benchT.position.set(tx, parkY + 0.5, tz + sgn * 0.8);
            g.add(benchT);
          });
          // legs
          [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
            const lg = new THREE.Mesh(
              new THREE.BoxGeometry(0.1, 0.75, 0.1), tableMat
            );
            lg.position.set(tx + sx * 1.1, parkY + 0.37, tz + sz * 0.5);
            g.add(lg);
          }));
        }

        // Trash cans (NYC dome-top)
        const canMat = new THREE.MeshStandardMaterial({
          color: 0x2a4a2a, roughness: 0.7, metalness: 0.2,
        });
        for (let i = 0; i < 3; i++) {
          const cx = x + (Math.random() - 0.5) * w * 0.85;
          const cz = z + (Math.random() - 0.5) * d * 0.85;
          const can = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.5, 1.2, 12), canMat
          );
          can.position.set(cx, parkY + 0.6, cz);
          can.castShadow = true;
          g.add(can);
          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            canMat
          );
          dome.position.set(cx, parkY + 1.2, cz);
          g.add(dome);
        }

        // Drinking fountain
        const fountainMat = new THREE.MeshStandardMaterial({
          color: 0x6a6a6a, metalness: 0.55, roughness: 0.5,
        });
        const fx = x + 4, fz = z + 4;
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.22, 0.95, 8), fountainMat
        );
        stem.position.set(fx, parkY + 0.5, fz);
        g.add(stem);
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.3, 0.18, 12), fountainMat
        );
        basin.position.set(fx, parkY + 1.05, fz);
        g.add(basin);

        if (addPlayground) {
          const pg = createPlaygroundEquipmentDetailed({ x: x - w / 4, z: z + d / 4 });
          pg.position.y = parkY;
          g.add(pg);
        }

        // Tennis court in the biggest parks
        if (w >= 80 && d >= 60) {
          g.add(buildTennisCourt(x + w / 4, parkY + 0.02, z - d / 4));
        }

        // NYC Parks entrance sign
        const parkNames = ["STEEPLECHASE PARK", "DREAMLAND PARK", "ASSER LEVY PARK",
          "KAISER PARK", "SURF PLAYGROUND", "GRAVESEND PARK"];
        const pname = parkNames[Math.floor(Math.random() * parkNames.length)];
        g.add(buildParkSign(x, parkY, z + d / 2 - 1, pname));

        // Spray park / sprinkler in mid-sized parks
        if (w >= 50 && d >= 40 && !addPlayground) {
          const spray = new THREE.Group();
          spray.position.set(x + w / 3, parkY + 0.05, z - d / 3);
          // Concrete pad
          const pad = new THREE.Mesh(
            new THREE.CircleGeometry(4, 16),
            new THREE.MeshStandardMaterial({ color: 0x9ec4d8, roughness: 0.85 })
          );
          pad.rotation.x = -Math.PI / 2;
          spray.add(pad);
          // 3 spray nozzles
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const noz = new THREE.Mesh(
              new THREE.CylinderGeometry(0.18, 0.18, 0.7, 6),
              new THREE.MeshStandardMaterial({ color: 0x6a6a6a, metalness: 0.55 })
            );
            noz.position.set(Math.cos(a) * 1.6, 0.35, Math.sin(a) * 1.6);
            spray.add(noz);
            // little spray cone
            const water = new THREE.Mesh(
              new THREE.ConeGeometry(0.4, 1.5, 8),
              new THREE.MeshStandardMaterial({
                color: 0xa8d8f0, transparent: true, opacity: 0.5,
                emissive: 0x6a8a9c, emissiveIntensity: 0.2,
              })
            );
            water.position.set(Math.cos(a) * 1.6, 1.4, Math.sin(a) * 1.6);
            water.rotation.x = Math.PI;
            spray.add(water);
          }
          g.add(spray);
        }

        return g;
      }

      /* ----------------------------------------------------------------
       *  Detailed Plaza — pavers, big planters, kiosk, food cart,
       *  chess tables, fountain, lamp posts.
       * ---------------------------------------------------------------- */
      function createPlazaDetailed(config) {
        const { x, z, w, d } = config;
        const g = new THREE.Group();
        const plazaY = groundMesh.position.y + getTerrainHeight(x, z) + 0.06;

        // Paver floor
        const pTex = paverTexture().clone();
        pTex.needsUpdate = true;
        pTex.repeat.set(w / 4, d / 4);
        const stone = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.75 })
        );
        stone.rotation.x = -Math.PI / 2;
        stone.position.set(x, plazaY, z);
        stone.receiveShadow = true;
        g.add(stone);

        // Big circular planters at corners
        const planterMat = new THREE.MeshStandardMaterial({
          color: 0x4a3a2a, roughness: 0.85,
        });
        const soilMat = new THREE.MeshStandardMaterial({
          color: 0x3a2810, roughness: 0.95,
        });
        const planterPositions = [
          { x: x - w / 2 + 5, z: z - d / 2 + 5 },
          { x: x + w / 2 - 5, z: z - d / 2 + 5 },
          { x: x - w / 2 + 5, z: z + d / 2 - 5 },
          { x: x + w / 2 - 5, z: z + d / 2 - 5 },
        ];
        planterPositions.forEach((p) => {
          const pl = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2.2, 1.2, 12), planterMat
          );
          pl.position.set(p.x, plazaY + 0.6, p.z);
          pl.castShadow = true;
          g.add(pl);
          const soil = new THREE.Mesh(
            new THREE.CylinderGeometry(1.85, 1.85, 0.1, 12), soilMat
          );
          soil.position.set(p.x, plazaY + 1.22, p.z);
          g.add(soil);
          // Tree in the planter
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 2.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
          );
          trunk.position.set(p.x, plazaY + 2.45, p.z);
          trunk.castShadow = true;
          g.add(trunk);
          const leaves = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.5, 1),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(0.27, 0.55, 0.32), roughness: 0.85,
            })
          );
          leaves.position.set(p.x, plazaY + 4.5, p.z);
          leaves.castShadow = true;
          g.add(leaves);
        });

        // Newsstand kiosk
        const kioskMat = new THREE.MeshStandardMaterial({
          color: 0x2a3a4a, roughness: 0.65,
        });
        const kioskTopMat = new THREE.MeshStandardMaterial({
          color: 0x444a55, roughness: 0.65,
        });
        const kiosk = new THREE.Mesh(
          new THREE.BoxGeometry(3, 2.4, 2), kioskMat
        );
        kiosk.position.set(x - w / 4, plazaY + 1.2, z);
        kiosk.castShadow = true;
        g.add(kiosk);
        const kioskRoof = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 0.3, 2.4), kioskTopMat
        );
        kioskRoof.position.set(x - w / 4, plazaY + 2.55, z);
        g.add(kioskRoof);
        // Window front
        const winMat = new THREE.MeshStandardMaterial({
          color: 0xcfdbe3, emissive: 0x222a30, emissiveIntensity: 0.4,
          transparent: true, opacity: 0.7,
        });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.4), winMat);
        win.position.set(x - w / 4, plazaY + 1.5, z + 1.05);
        g.add(win);

        // Coffee cart
        const cartG = new THREE.Group();
        cartG.position.set(x + w / 4, plazaY, z);
        const cartBody = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 1.4, 1.4),
          new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.7 })
        );
        cartBody.position.y = 0.7;
        cartBody.castShadow = true;
        cartG.add(cartBody);
        const cartUmb = new THREE.Mesh(
          new THREE.ConeGeometry(1.8, 0.5, 8),
          new THREE.MeshStandardMaterial({
            color: 0x8b3a3a, roughness: 0.55,
            emissive: 0x8b3a3a, emissiveIntensity: 0.05,
          })
        );
        cartUmb.position.y = 3.2;
        cartG.add(cartUmb);
        const cartPole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.8, 4),
          new THREE.MeshStandardMaterial({ color: 0x2c3540 })
        );
        cartPole.position.y = 2.2;
        cartG.add(cartPole);
        const coffeeSign = signTexture("COFFEE", "#3a1a0a", "#fff", 256, 96);
        const csMat = new THREE.MeshStandardMaterial({
          map: coffeeSign, emissive: 0xffffff, emissiveMap: coffeeSign,
          emissiveIntensity: 0.35,
        });
        const cs = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), csMat);
        cs.position.set(0, 1.8, 0.72);
        cartG.add(cs);
        g.add(cartG);

        // Chess tables (2)
        const tableMat = new THREE.MeshStandardMaterial({
          color: 0xd0c8b8, roughness: 0.8,
        });
        const stoolMat = new THREE.MeshStandardMaterial({
          color: 0x8a8278, roughness: 0.8,
        });
        const personMat = new THREE.MeshStandardMaterial({
          color: 0x4a5060, roughness: 0.85,
        });
        for (let t = 0; t < 2; t++) {
          const tx = x + (t === 0 ? -8 : 8);
          const tz = z + d / 4;
          const top = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), tableMat
          );
          top.position.set(tx, plazaY + 0.7, tz);
          top.castShadow = true;
          g.add(top);
          // checkered top texture proxy: a darker disc
          const board = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.6, 0.02, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          board.position.set(tx, plazaY + 0.76, tz);
          board.rotation.y = Math.PI / 4;
          g.add(board);
          // pedestal
          const ped = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.7, 8), tableMat
          );
          ped.position.set(tx, plazaY + 0.35, tz);
          g.add(ped);
          // stools (4 around)
          [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]].forEach(([dx, dz]) => {
            const stool = new THREE.Mesh(
              new THREE.CylinderGeometry(0.25, 0.25, 0.4, 8), stoolMat
            );
            stool.position.set(tx + dx, plazaY + 0.2, tz + dz);
            stool.castShadow = true;
            g.add(stool);
          });
          // seated players (capsules)
          [[-1.5, 0], [1.5, 0]].forEach(([dx, dz]) => {
            const p = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 0.8, 4, 6), personMat
            );
            p.position.set(tx + dx, plazaY + 0.95, tz + dz);
            p.castShadow = true;
            g.add(p);
          });
        }

        // Central fountain (optional, big plazas only)
        if (w >= 60 && d >= 60) {
          const fountainMat = new THREE.MeshStandardMaterial({
            color: 0x9aa0a8, metalness: 0.3, roughness: 0.45,
          });
          const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4a8ab8, roughness: 0.15, metalness: 0.4,
            emissive: 0x2a4a6a, emissiveIntensity: 0.1,
          });
          const basin = new THREE.Mesh(
            new THREE.CylinderGeometry(3.5, 3.7, 0.8, 24), fountainMat
          );
          basin.position.set(x, plazaY + 0.4, z);
          basin.castShadow = true;
          g.add(basin);
          const water = new THREE.Mesh(
            new THREE.CylinderGeometry(3.3, 3.3, 0.2, 24), waterMat
          );
          water.position.set(x, plazaY + 0.7, z);
          g.add(water);
          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.4, 1.5, 8), fountainMat
          );
          stem.position.set(x, plazaY + 1.55, z);
          g.add(stem);
          const top = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.6, 0.3, 12), fountainMat
          );
          top.position.set(x, plazaY + 2.4, z);
          g.add(top);
        }

        // Lamp posts at the corners (alternate the planter spots)
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x1a2230, metalness: 0.6, roughness: 0.5,
        });
        const lampBulbMat = new THREE.MeshStandardMaterial({
          color: 0xfff6c8, emissive: 0xffd07a, emissiveIntensity: 0.4,
        });
        [[0, -d / 2 + 2], [0, d / 2 - 2]].forEach((p) => {
          const lp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.2, 5, 6), lampMat
          );
          lp.position.set(x + p[0], plazaY + 2.5, z + p[1]);
          lp.castShadow = true;
          g.add(lp);
          const lb = new THREE.Mesh(
            new THREE.SphereGeometry(0.32, 8, 6), lampBulbMat
          );
          lb.position.set(x + p[0], plazaY + 5.2, z + p[1]);
          g.add(lb);
          bulbMeshes.push(lb);
        });

        // Public sculpture (off-center, not where fountain is)
        if (!(w >= 60 && d >= 60)) {
          // small plazas get a sculpture instead of fountain
          g.add(buildPlazaSculpture(x - w / 6, plazaY, z + d / 6));
        }

        return g;
      }

      /* ----------------------------------------------------------------
       *  Streetscape Detail — sidewalks, hydrants, traffic lights,
       *  mailboxes, trash bags, news boxes, bike racks, parked cars,
       *  crosswalks.
       * ---------------------------------------------------------------- */
      function buildStreetscapeDetail() {
        const baseY = groundMesh.position.y + terrainAmp + 0.1;

        // Collect EW street positions from scene
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        // --- Sidewalks alongside each EW street ---
        const sidewalkMat = new THREE.MeshStandardMaterial({
          map: sidewalkTexture(), roughness: 0.85,
        });
        ewStreets.forEach((st) => {
          const stex = sidewalkTexture().clone();
          stex.needsUpdate = true;
          stex.repeat.set(gridLength / 4, 1);
          stex.wrapS = stex.wrapT = THREE.RepeatWrapping;
          const mat = new THREE.MeshStandardMaterial({ map: stex, roughness: 0.85 });
          [-(streetWidth / 2 + 2), (streetWidth / 2 + 2)].forEach((dz) => {
            const sw = new THREE.Mesh(
              new THREE.PlaneGeometry(gridLength, 4), mat
            );
            sw.rotation.x = -Math.PI / 2;
            sw.position.set(0, st.position.y + 0.01, st.position.z + dz);
            sw.receiveShadow = true;
            scene.add(sw);
          });
        });

        // Determine intersection X positions (cross streets every gridSpacingX = 100)
        const intersectionXs = [];
        for (let i = 0; i < 12; i++) {
          const sx = buildingAreaMinX + 100 / 2 + i * 100;
          if (Math.abs(sx) <= gridLength / 2) intersectionXs.push(sx);
        }

        // --- Fire hydrants (instanced) at random street corners ---
        const hydrantMat = new THREE.MeshStandardMaterial({
          color: 0xcc0a0a, roughness: 0.6, metalness: 0.15,
        });
        const hydrantBaseGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8);
        const hydrantBalls = []; // we'll just add as instanced base meshes
        const maxHydrants = Math.min(120, ewStreets.length * intersectionXs.length);
        const hInst = new THREE.InstancedMesh(hydrantBaseGeom, hydrantMat, maxHydrants);
        const hMat = new THREE.Matrix4();
        const hV = new THREE.Vector3();
        const hQ = new THREE.Quaternion();
        const hS = new THREE.Vector3(1, 1, 1);
        let hi = 0;
        ewStreets.forEach((st) => {
          intersectionXs.forEach((ix) => {
            if (Math.random() < 0.5 && hi < maxHydrants) {
              const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 3);
              hV.set(ix + (Math.random() - 0.5) * 6, st.position.y + 0.45, st.position.z + dz);
              hMat.compose(hV, hQ, hS);
              hInst.setMatrixAt(hi++, hMat);
            }
          });
        });
        hInst.count = hi;
        hInst.instanceMatrix.needsUpdate = true;
        hInst.castShadow = true;
        scene.add(hInst);
        // Caps on hydrants
        const capGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.18, 8);
        const capInst = new THREE.InstancedMesh(capGeom, hydrantMat, hi);
        const m4tmp = new THREE.Matrix4();
        for (let i = 0; i < hi; i++) {
          hInst.getMatrixAt(i, m4tmp);
          const pos = new THREE.Vector3().setFromMatrixPosition(m4tmp);
          hV.set(pos.x, pos.y + 0.55, pos.z);
          hMat.compose(hV, hQ, hS);
          capInst.setMatrixAt(i, hMat);
        }
        capInst.instanceMatrix.needsUpdate = true;
        scene.add(capInst);

        // --- Traffic lights at every intersection ---
        const poleMat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a, metalness: 0.6, roughness: 0.5,
        });
        const boxMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, roughness: 0.4,
        });
        const redMat = new THREE.MeshStandardMaterial({
          color: 0xff0a0a, emissive: 0xff0a0a, emissiveIntensity: 1.4,
        });
        const yellowMat = new THREE.MeshStandardMaterial({
          color: 0xffd000, emissive: 0xffd000, emissiveIntensity: 0.3,
        });
        const greenMat = new THREE.MeshStandardMaterial({
          color: 0x00cc44, emissive: 0x00cc44, emissiveIntensity: 0.3,
        });
        ewStreets.forEach((st) => {
          intersectionXs.forEach((ix) => {
            // Performance gate: only build detailed traffic lights within
            // a 380u "near zone" of the rides center where the camera spawns.
            if (Math.hypot(ix, st.position.z - 15) > 380) return;
            const tlG = new THREE.Group();
            tlG.position.set(ix + streetWidth / 2 + 1.5, st.position.y, st.position.z - streetWidth / 2 - 1.5);
            const pole = new THREE.Mesh(
              new THREE.CylinderGeometry(0.12, 0.15, 5, 6), poleMat
            );
            pole.position.y = 2.5;
            pole.castShadow = true;
            tlG.add(pole);
            // arm
            const arm = new THREE.Mesh(
              new THREE.BoxGeometry(0.12, 0.12, 2), poleMat
            );
            arm.position.set(0, 4.8, -1);
            tlG.add(arm);
            // light box
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 1.5, 0.5), boxMat
            );
            box.position.set(0, 4.4, -2);
            tlG.add(box);
            // lights
            const r = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), redMat.clone());
            r.position.set(0, 4.85, -1.74);
            tlG.add(r);
            const y = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), yellowMat.clone());
            y.position.set(0, 4.4, -1.74);
            tlG.add(y);
            const grn = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), greenMat.clone());
            grn.position.set(0, 3.95, -1.74);
            tlG.add(grn);
            scene.add(tlG);
            bulbMeshes.push(r, y, grn);
            trafficLightSets.push({
              red: r.material, yellow: y.material, green: grn.material,
              phase: Math.random() * 6, period: 6 + Math.random() * 2,
            });
          });
        });

        // --- Crosswalks at intersections ---
        const xwTex = crosswalkTexture();
        const xwMat = new THREE.MeshStandardMaterial({
          map: xwTex, roughness: 0.7, transparent: false,
        });
        ewStreets.forEach((st) => {
          intersectionXs.forEach((ix) => {
            if (Math.hypot(ix, st.position.z - 15) > 500) return;
            // crosswalk across the EW street (perpendicular to driving direction)
            const xw = new THREE.Mesh(
              new THREE.PlaneGeometry(4, streetWidth - 0.4),
              xwMat
            );
            xw.rotation.x = -Math.PI / 2;
            xw.position.set(ix, st.position.y + 0.02, st.position.z);
            scene.add(xw);
          });
        });

        // --- Parked cars at the curb ---
        const carPalette = [
          0xef4444, 0x22c55e, 0xeab308, 0x94a3b8, 0xffffff, 0x06b6d4, 0x444444, 0x1a1a1a,
        ];
        const parkGeom = new THREE.BoxGeometry(4, 1.7, 1.7);
        const parkMatBase = new THREE.MeshPhysicalMaterial({
          metalness: 0.7, roughness: 0.35,
          clearcoat: 0.85, clearcoatRoughness: 0.15,
          envMapIntensity: 1.2,
        });
        const maxParked = 240;
        const parkInst = new THREE.InstancedMesh(parkGeom, parkMatBase, maxParked);
        parkInst.castShadow = true;
        parkInst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(maxParked * 3), 3
        );
        let pi = 0;
        const pcol = new THREE.Color();
        ewStreets.forEach((st) => {
          // park cars along both curbs, skip near intersections
          [-(streetWidth / 2 + 1.5), (streetWidth / 2 + 1.5)].forEach((dz) => {
            for (let x = -gridLength / 2 + 8; x < gridLength / 2 - 8; x += 6) {
              // skip if too close to an intersection
              if (intersectionXs.some((ix) => Math.abs(x - ix) < 9)) continue;
              if (pi >= maxParked) return;
              if (Math.random() < 0.55) {
                const m = new THREE.Matrix4();
                m.makeTranslation(x, st.position.y + 0.85, st.position.z + dz);
                parkInst.setMatrixAt(pi, m);
                pcol.setHex(carPalette[Math.floor(Math.random() * carPalette.length)]);
                parkInst.setColorAt(pi, pcol);
                pi++;
              }
            }
          });
        });
        parkInst.count = pi;
        parkInst.instanceMatrix.needsUpdate = true;
        if (parkInst.instanceColor) parkInst.instanceColor.needsUpdate = true;
        scene.add(parkInst);

        // --- Mailboxes (USPS blue) ---
        const mailMat = new THREE.MeshStandardMaterial({
          color: 0x002b5c, roughness: 0.55, metalness: 0.2,
        });
        const mailGeom = new THREE.BoxGeometry(0.7, 1.0, 0.5);
        const mailInst = new THREE.InstancedMesh(mailGeom, mailMat, 60);
        let mi = 0;
        ewStreets.forEach((st) => {
          intersectionXs.forEach((ix) => {
            if (Math.random() < 0.18 && mi < 60) {
              const m = new THREE.Matrix4();
              const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 2.5);
              m.makeTranslation(ix + 4, st.position.y + 0.6, st.position.z + dz);
              mailInst.setMatrixAt(mi++, m);
            }
          });
        });
        mailInst.count = mi;
        mailInst.instanceMatrix.needsUpdate = true;
        mailInst.castShadow = true;
        scene.add(mailInst);

        // --- Trash bags piled at curbs (instanced) ---
        const bagMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.5 });
        const bagGeom = new THREE.SphereGeometry(0.45, 6, 5);
        const bagInst = new THREE.InstancedMesh(bagGeom, bagMat, 220);
        let bi = 0;
        const bm4 = new THREE.Matrix4();
        const bv = new THREE.Vector3();
        const bs = new THREE.Vector3();
        ewStreets.forEach((st) => {
          for (let x = -gridLength / 2 + 15; x < gridLength / 2 - 15; x += 12) {
            if (Math.random() < 0.25 && bi < 220) {
              const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 2.8);
              const scl = 0.7 + Math.random() * 0.6;
              bv.set(x + (Math.random() - 0.5) * 2, st.position.y + 0.35 * scl, st.position.z + dz);
              bs.set(scl, scl * 0.7, scl);
              bm4.compose(bv, new THREE.Quaternion(), bs);
              bagInst.setMatrixAt(bi++, bm4);
              // stacked second bag
              if (bi < 220 && Math.random() < 0.5) {
                bv.set(bv.x + 0.4, st.position.y + 0.9 * scl, bv.z);
                bs.set(scl * 0.85, scl * 0.6, scl * 0.85);
                bm4.compose(bv, new THREE.Quaternion(), bs);
                bagInst.setMatrixAt(bi++, bm4);
              }
            }
          }
        });
        bagInst.count = bi;
        bagInst.instanceMatrix.needsUpdate = true;
        scene.add(bagInst);

        // --- Bike racks (U-shape rails) ---
        const rackMat = new THREE.MeshStandardMaterial({
          color: 0x4a5060, metalness: 0.6, roughness: 0.45,
        });
        for (let i = 0; i < 18; i++) {
          const st = ewStreets[Math.floor(Math.random() * ewStreets.length)];
          const ix = intersectionXs[Math.floor(Math.random() * intersectionXs.length)] + (Math.random() - 0.5) * 30;
          const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 3);
          const g = new THREE.Group();
          g.position.set(ix, st.position.y + 0.5, st.position.z + dz);
          // U-shape: 2 verticals + arc
          [-0.5, 0.5].forEach((dx) => {
            const v = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.04, 1, 5), rackMat
            );
            v.position.set(dx, 0, 0);
            g.add(v);
          });
          const arc = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.04, 5, 12, Math.PI), rackMat
          );
          arc.rotation.z = Math.PI / 2;
          arc.position.set(0, 0.5, 0);
          arc.rotation.x = Math.PI / 2;
          g.add(arc);
          // Bike on rack sometimes
          if (Math.random() > 0.5) {
            const bikeMat = new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5),
              metalness: 0.5, roughness: 0.5,
            });
            const wheel1 = new THREE.Mesh(
              new THREE.TorusGeometry(0.32, 0.04, 4, 12), bikeMat
            );
            wheel1.position.set(0.7, 0, 0);
            wheel1.rotation.y = Math.PI / 2;
            g.add(wheel1);
            const wheel2 = wheel1.clone();
            wheel2.position.set(-0.7, 0, 0);
            g.add(wheel2);
            const frame = new THREE.Mesh(
              new THREE.BoxGeometry(1.5, 0.06, 0.06), bikeMat
            );
            frame.position.set(0, 0.2, 0);
            g.add(frame);
          }
          scene.add(g);
        }

        // --- News boxes (newspaper vending) ---
        const newsColors = [0xb71c1c, 0x0d47a1, 0x2e7d32];
        for (let i = 0; i < 24; i++) {
          const st = ewStreets[Math.floor(Math.random() * ewStreets.length)];
          const ix = intersectionXs[Math.floor(Math.random() * intersectionXs.length)] + (Math.random() - 0.5) * 8;
          const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 2.5);
          const nb = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1.1, 0.5),
            new THREE.MeshStandardMaterial({
              color: newsColors[Math.floor(Math.random() * newsColors.length)],
              roughness: 0.55,
            })
          );
          nb.position.set(ix + (Math.random() - 0.5) * 4, st.position.y + 0.55, st.position.z + dz);
          nb.castShadow = true;
          scene.add(nb);
        }
      }

      /* ----------------------------------------------------------------
       *  Cafe storefront overlays — applied to nearest cafe-bucket buildings.
       *  positions: array of {x, y, z, w, h, d}
       * ---------------------------------------------------------------- */
      function addCafeStorefronts(cafes) {
        // Only detail the cafes within the near zone (closer to rides)
        const nearCafes = cafes
          .map((c) => ({ ...c, dist: Math.hypot(c.x, c.z + 80) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 32);

        const awningColors = [0x8b3a3a, 0x0a7a40, 0x1f4e9c, 0xfbbf24, 0x6a3a8a];
        const cafeNames = [
          "BAGELS", "PIZZA", "DELI", "CAFE", "COFFEE",
          "TACOS", "DINER", "BAKERY", "ESPRESSO", "JUICE",
        ];

        nearCafes.forEach((c, idx) => {
          const facadeY = c.y - c.h / 2; // ground level
          const ac = awningColors[idx % awningColors.length];
          const front = c.z + c.d / 2 + 0.05;

          // Striped awning above the front
          const awningMat = new THREE.MeshStandardMaterial({
            color: ac, roughness: 0.55,
            emissive: ac, emissiveIntensity: 0.05,
          });
          const aw = new THREE.Mesh(
            new THREE.BoxGeometry(c.w - 0.5, 0.3, 2), awningMat
          );
          aw.position.set(c.x, facadeY + 3.4, front + 1);
          aw.castShadow = true;
          scene.add(aw);
          // Awning underside trim
          const lipMat = new THREE.MeshStandardMaterial({
            color: 0xfafafa, roughness: 0.6,
          });
          const lip = new THREE.Mesh(
            new THREE.BoxGeometry(c.w - 0.5, 0.08, 0.1), lipMat
          );
          lip.position.set(c.x, facadeY + 3.2, front + 2);
          scene.add(lip);

          // Storefront window strip (lit)
          const winMat = new THREE.MeshStandardMaterial({
            color: 0xddeaf2, emissive: 0xfff0c0, emissiveIntensity: 0.5,
            roughness: 0.4, metalness: 0.2,
          });
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(c.w - 1, 2.4), winMat
          );
          win.position.set(c.x, facadeY + 1.6, front + 0.02);
          scene.add(win);

          // Cafe name signage on the awning
          const nm = cafeNames[idx % cafeNames.length];
          const sgT = signTexture(nm, "#" + ac.toString(16).padStart(6, "0"), "#ffffff", 1024, 96);
          const sgM = new THREE.MeshStandardMaterial({
            map: sgT, emissive: 0xffffff, emissiveMap: sgT, emissiveIntensity: 0.5,
          });
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(c.w - 1, 0.6), sgM);
          sg.position.set(c.x, facadeY + 3.5, front + 2.04);
          scene.add(sg);

          // Bistro tables (only if facade is wide enough)
          if (c.w >= 10 && idx < 14) {
            const tableMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.5 });
            const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.3, roughness: 0.55 });
            const numTables = 2 + Math.floor(c.w / 8);
            for (let t = 0; t < numTables; t++) {
              const tx = c.x - c.w / 2 + 2 + t * (c.w - 4) / Math.max(1, numTables - 1);
              const tz = front + 2.8;
              // table top
              const top = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), tableMat
              );
              top.position.set(tx, facadeY + 0.75, tz);
              top.castShadow = true;
              scene.add(top);
              // table leg
              const tlg = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), tableMat
              );
              tlg.position.set(tx, facadeY + 0.35, tz);
              scene.add(tlg);
              // chairs
              [-0.7, 0.7].forEach((dx) => {
                const ch = new THREE.Mesh(
                  new THREE.BoxGeometry(0.4, 0.4, 0.4), chairMat
                );
                ch.position.set(tx + dx, facadeY + 0.4, tz);
                ch.castShadow = true;
                scene.add(ch);
                const back = new THREE.Mesh(
                  new THREE.BoxGeometry(0.4, 0.5, 0.06), chairMat
                );
                back.position.set(tx + dx, facadeY + 0.7, tz + 0.18 * (dx > 0 ? 1 : -1));
                scene.add(back);
              });
            }
          }

          // Sandwich board
          if (idx < 22) {
            const sbMat = new THREE.MeshStandardMaterial({
              color: 0x3a2810, roughness: 0.85,
            });
            const sb = new THREE.Mesh(
              new THREE.BoxGeometry(0.7, 1.1, 0.05), sbMat
            );
            sb.position.set(c.x + c.w / 2 - 1, facadeY + 0.55, front + 1.4);
            sb.rotation.y = -Math.PI / 8;
            sb.castShadow = true;
            scene.add(sb);
          }

          // Planters flanking the door
          const plMat = new THREE.MeshStandardMaterial({ color: 0x3a2810, roughness: 0.9 });
          const folMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.27, 0.55, 0.32), roughness: 0.85,
          });
          [-1.5, 1.5].forEach((dx) => {
            const pl = new THREE.Mesh(
              new THREE.CylinderGeometry(0.3, 0.32, 0.55, 10), plMat
            );
            pl.position.set(c.x + dx, facadeY + 0.27, front + 0.5);
            scene.add(pl);
            const fol = new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.4, 0), folMat
            );
            fol.position.set(c.x + dx, facadeY + 0.8, front + 0.5);
            fol.castShadow = true;
            scene.add(fol);
          });
        });
      }

      /* ----------------------------------------------------------------
       *  Rooftop details — water tanks, AC units, antennas, parapets.
       *  Iconic NYC. Decorate apartment buildings.
       * ---------------------------------------------------------------- */
      function buildRoofDetails(apartments) {
        if (!apartments || apartments.length === 0) return;

        // Use instanced meshes for the components since we'll have hundreds.
        const tankCount = Math.min(apartments.length, 280);
        const acCount = tankCount * 3;
        const antennaCount = Math.floor(tankCount * 0.4);
        const parapetCount = tankCount;

        // -- Water tank (cylinder + cone top + four legs) — pack as 3 instances --
        const tankBodyGeom = new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10);
        const tankTopGeom = new THREE.ConeGeometry(1.6, 1.2, 10);
        const tankLegGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 5);
        const tankBodyMat = new THREE.MeshStandardMaterial({
          color: 0x3a2818, roughness: 0.9,
        });
        const tankLegMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, metalness: 0.5, roughness: 0.5,
        });

        const tankBodyInst = new THREE.InstancedMesh(tankBodyGeom, tankBodyMat, tankCount);
        const tankTopInst = new THREE.InstancedMesh(tankTopGeom, tankBodyMat, tankCount);
        const tankLegInst = new THREE.InstancedMesh(tankLegGeom, tankLegMat, tankCount * 4);
        tankBodyInst.castShadow = true;
        tankTopInst.castShadow = true;
        tankLegInst.castShadow = true;

        // -- AC condenser units --
        const acGeom = new THREE.BoxGeometry(1.6, 0.9, 1.4);
        const acMat = new THREE.MeshStandardMaterial({
          color: 0xcfcfcf, metalness: 0.4, roughness: 0.55,
        });
        const acInst = new THREE.InstancedMesh(acGeom, acMat, acCount);
        acInst.castShadow = true;

        // -- Antennas (thin emissive-tipped poles) --
        const antBodyGeom = new THREE.CylinderGeometry(0.06, 0.06, 4, 4);
        const antBodyMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, metalness: 0.5, roughness: 0.4,
        });
        const antTipGeom = new THREE.SphereGeometry(0.16, 6, 4);
        const antTipMat = new THREE.MeshStandardMaterial({
          color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.9,
        });
        const antBodyInst = new THREE.InstancedMesh(antBodyGeom, antBodyMat, antennaCount);
        const antTipInst = new THREE.InstancedMesh(antTipGeom, antTipMat, antennaCount);
        bulbMeshes.push(antTipInst);

        // -- Parapet (small rim around the roof to hide the flat top) --
        const parapetMat = new THREE.MeshStandardMaterial({
          color: 0x4a4438, roughness: 0.85,
        });
        // Parapets aren't instanced because each has a unique width — but we
        // can use a Group of 4 thin boxes per building. To keep draw calls
        // reasonable, we sample only the closer buildings for parapets.

        // Sample closer apartments first (sort by distance to rides)
        const sorted = apartments
          .map((a) => ({ ...a, _dist: Math.hypot(a.x, a.z + 80) }))
          .sort((aa, bb) => aa._dist - bb._dist);

        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sV = new THREE.Vector3(1, 1, 1);
        let ti = 0, li = 0, ai = 0, anti = 0;

        for (let i = 0; i < sorted.length && ti < tankCount; i++) {
          const b = sorted[i];
          const roofY = b.y + b.h / 2;

          // Tank: place at random spot on roof
          const tx = b.x + (Math.random() - 0.5) * (b.w - 4);
          const tz = b.z + (Math.random() - 0.5) * (b.d - 4);
          // Skip if building is too small
          if (b.w < 6 || b.d < 6) continue;

          // Legs (4)
          [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].forEach(([dx, dz]) => {
            v.set(tx + dx, roofY + 0.8, tz + dz);
            m4.compose(v, q, sV);
            tankLegInst.setMatrixAt(li++, m4);
          });
          // Tank body
          v.set(tx, roofY + 3.0, tz);
          m4.compose(v, q, sV);
          tankBodyInst.setMatrixAt(ti, m4);
          // Tank top
          v.set(tx, roofY + 4.7, tz);
          m4.compose(v, q, sV);
          tankTopInst.setMatrixAt(ti, m4);
          ti++;

          // AC units: 2-4 per building
          const numAc = 2 + Math.floor(Math.random() * 3);
          for (let k = 0; k < numAc && ai < acCount; k++) {
            const ax = b.x + (Math.random() - 0.5) * (b.w - 2);
            const az = b.z + (Math.random() - 0.5) * (b.d - 2);
            v.set(ax, roofY + 0.45, az);
            m4.compose(v, q, sV);
            acInst.setMatrixAt(ai++, m4);
          }

          // Antenna (occasional)
          if (b.h > 50 && anti < antennaCount && Math.random() < 0.6) {
            const ax = b.x + (Math.random() - 0.5) * b.w * 0.4;
            const az = b.z + (Math.random() - 0.5) * b.d * 0.4;
            v.set(ax, roofY + 2, az);
            m4.compose(v, q, sV);
            antBodyInst.setMatrixAt(anti, m4);
            v.set(ax, roofY + 4, az);
            m4.compose(v, q, sV);
            antTipInst.setMatrixAt(anti, m4);
            anti++;
          }

          // Parapet (only for first 80 buildings — visual near zone)
          if (i < 80) {
            const parapetHeight = 0.7;
            const sides = [
              { w: b.w + 0.4, d: 0.3, dx: 0, dz: b.d / 2 + 0.15 },
              { w: b.w + 0.4, d: 0.3, dx: 0, dz: -b.d / 2 - 0.15 },
              { w: 0.3, d: b.d + 0.4, dx: b.w / 2 + 0.15, dz: 0 },
              { w: 0.3, d: b.d + 0.4, dx: -b.w / 2 - 0.15, dz: 0 },
            ];
            sides.forEach((sd) => {
              const pp = new THREE.Mesh(
                new THREE.BoxGeometry(sd.w, parapetHeight, sd.d),
                parapetMat
              );
              pp.position.set(b.x + sd.dx, roofY + parapetHeight / 2, b.z + sd.dz);
              buildingGroup.add(pp);
            });
          }
        }
        tankBodyInst.count = ti;
        tankTopInst.count = ti;
        tankLegInst.count = li;
        acInst.count = ai;
        antBodyInst.count = anti;
        antTipInst.count = anti;
        tankBodyInst.instanceMatrix.needsUpdate = true;
        tankTopInst.instanceMatrix.needsUpdate = true;
        tankLegInst.instanceMatrix.needsUpdate = true;
        acInst.instanceMatrix.needsUpdate = true;
        antBodyInst.instanceMatrix.needsUpdate = true;
        antTipInst.instanceMatrix.needsUpdate = true;
        buildingGroup.add(tankBodyInst);
        buildingGroup.add(tankTopInst);
        buildingGroup.add(tankLegInst);
        buildingGroup.add(acInst);
        buildingGroup.add(antBodyInst);
        buildingGroup.add(antTipInst);
      }

      /* ----------------------------------------------------------------
       *  Fire escapes — zigzag iron ladders on brownstone front facades.
       *  Apply to nearest brownstones for visual impact near camera.
       * ---------------------------------------------------------------- */
      function buildFireEscapes(brownstones) {
        if (!brownstones || brownstones.length === 0) return;

        const sorted = brownstones
          .map((b) => ({ ...b, _dist: Math.hypot(b.x, b.z + 80) }))
          .sort((a, b) => a._dist - b._dist)
          .slice(0, 40);

        const ironMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, metalness: 0.7, roughness: 0.5,
        });

        sorted.forEach((b) => {
          const front = b.z + b.d / 2 + 0.05;
          const facadeY = b.y - b.h / 2;
          const numLandings = Math.max(2, Math.floor(b.h / 5));
          const landingW = Math.min(2.4, b.w * 0.4);

          for (let i = 0; i < numLandings; i++) {
            const ly = facadeY + 4 + i * 4;
            if (ly > facadeY + b.h - 2) break;

            // Landing platform
            const land = new THREE.Mesh(
              new THREE.BoxGeometry(landingW, 0.1, 0.7), ironMat
            );
            land.position.set(b.x, ly, front + 0.4);
            buildingGroup.add(land);

            // Railing (front bar)
            const rail = new THREE.Mesh(
              new THREE.BoxGeometry(landingW, 0.05, 0.05), ironMat
            );
            rail.position.set(b.x, ly + 0.9, front + 0.75);
            buildingGroup.add(rail);

            // Vertical posts
            [-landingW / 2, landingW / 2].forEach((dx) => {
              const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 1, 0.05), ironMat
              );
              post.position.set(b.x + dx, ly + 0.5, front + 0.75);
              buildingGroup.add(post);
            });

            // Zigzag ladder down — alternating diagonal
            if (i < numLandings - 1) {
              const ladderLen = 4.4;
              const ladder = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, ladderLen, 0.08), ironMat
              );
              const lx = b.x + (i % 2 === 0 ? -landingW / 2 + 0.3 : landingW / 2 - 0.3);
              ladder.position.set(lx, ly + 2, front + 0.55);
              ladder.rotation.x = -Math.PI / 2.4;
              buildingGroup.add(ladder);
            }
          }
        });
      }

      /* ----------------------------------------------------------------
       *  Bodegas — corner stores with neon awning, fruit stand, ATM sign
       * ---------------------------------------------------------------- */
      function buildBodegas() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const positions = [
          { x: -80, z: -80, name: "DELI" },
          { x: 80,  z: -80, name: "BODEGA" },
          { x: -190, z: -160, name: "GROCERY" },
          { x: 190, z: -160, name: "DELI · ATM" },
          { x: -310, z: -120, name: "OPEN 24 HR" },
          { x: 310, z: -120, name: "LOTTO · ATM" },
          { x: -60, z: -200, name: "FOOD MART" },
          { x: 60, z: -200, name: "DELI" },
          { x: -240, z: -260, name: "BODEGA" },
          { x: 240, z: -260, name: "DELI" },
        ];

        positions.forEach((p, idx) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);

          // Building body
          const W = 18, H = 12, D = 14;
          const wallTex = brickTexture().clone();
          wallTex.needsUpdate = true;
          wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
          wallTex.repeat.set(2, 2);
          wallTex.colorSpace = THREE.SRGBColorSpace;
          const wallMat = new THREE.MeshStandardMaterial({
            map: wallTex, roughness: 0.85,
          });
          const building = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
          building.position.y = H / 2;
          building.castShadow = true; building.receiveShadow = true;
          g.add(building);

          // Storefront dark band (lit windows)
          const winMat = new THREE.MeshStandardMaterial({
            color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 0.7,
            roughness: 0.35,
          });
          const winStrip = new THREE.Mesh(
            new THREE.PlaneGeometry(W - 2, 2.6), winMat
          );
          winStrip.position.set(0, 1.6, D / 2 + 0.02);
          g.add(winStrip);

          // Awning (red/yellow/green based on bodega convention)
          const awnColors = [0xc41e3a, 0xfacc15, 0x0a7a40, 0x1f4e9c];
          const awnColor = awnColors[idx % awnColors.length];
          const awningMat = new THREE.MeshStandardMaterial({
            color: awnColor, roughness: 0.55,
          });
          const awning = new THREE.Mesh(
            new THREE.BoxGeometry(W - 1, 0.4, 2), awningMat
          );
          awning.position.set(0, 3.4, D / 2 + 1);
          awning.castShadow = true;
          g.add(awning);

          // Neon storefront sign on the awning
          const nmTex = signTexture(p.name, "#" + awnColor.toString(16).padStart(6, "0"), "#ffffff", 1024, 128);
          const nmMat = new THREE.MeshStandardMaterial({
            map: nmTex, emissive: 0xffffff, emissiveMap: nmTex, emissiveIntensity: 0.7,
          });
          const nm = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, 0.9), nmMat);
          nm.position.set(0, 3.4, D / 2 + 2.05);
          g.add(nm);

          // Secondary neon (ATM/OPEN) in window
          const secondaries = ["OPEN 24HR", "ATM", "LOTTO", "BEER COLD"];
          const sec = secondaries[idx % secondaries.length];
          const secTex = signTexture(sec, "#000000", "#ff3a3a", 512, 96);
          const secMat = new THREE.MeshStandardMaterial({
            map: secTex, emissive: 0xff3a3a, emissiveMap: secTex,
            emissiveIntensity: 1.4, transparent: true,
          });
          const secM = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), secMat);
          secM.position.set(W / 2 - 3, 2.4, D / 2 + 0.05);
          g.add(secM);

          // Fruit stand outside
          const standMat = new THREE.MeshStandardMaterial({
            color: 0x6a4a2a, roughness: 0.85,
          });
          const stand = new THREE.Mesh(
            new THREE.BoxGeometry(5, 0.8, 1.3), standMat
          );
          stand.position.set(-W / 2 + 2.5, 0.4, D / 2 + 1.5);
          stand.castShadow = true;
          g.add(stand);

          // Fruit boxes on top — colored cubes
          const fruitColors = [0xf73e3e, 0xff8800, 0xffe300, 0x88dd44, 0xbb22aa];
          for (let i = 0; i < 8; i++) {
            const fc = fruitColors[i % fruitColors.length];
            const fruit = new THREE.Mesh(
              new THREE.BoxGeometry(0.4, 0.3, 0.4),
              new THREE.MeshStandardMaterial({ color: fc, roughness: 0.6 })
            );
            fruit.position.set(
              -W / 2 + 0.5 + (i % 5) * 1.0,
              1.0,
              D / 2 + 1.2 + Math.floor(i / 5) * 0.4
            );
            g.add(fruit);
          }

          // Sidewalk in front
          const swTex = sidewalkTexture().clone();
          swTex.needsUpdate = true;
          swTex.repeat.set(2, 1);
          const sw = new THREE.Mesh(
            new THREE.PlaneGeometry(W + 6, 4),
            new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.85 })
          );
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(0, 0.01, D / 2 + 3);
          sw.receiveShadow = true;
          g.add(sw);

          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Sidewalk sheds — NYC green scaffolding over some sidewalks.
       * ---------------------------------------------------------------- */
      function buildSidewalkSheds() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const greenMat = new THREE.MeshStandardMaterial({
          color: 0x2a6a3a, roughness: 0.7, metalness: 0.2,
        });
        const plywoodMat = new THREE.MeshStandardMaterial({
          color: 0x8b6a4a, roughness: 0.85,
        });
        const poleMat = new THREE.MeshStandardMaterial({
          color: 0x4a4a4a, metalness: 0.6, roughness: 0.55,
        });

        // 6 sheds at random near-zone positions
        const shedConfigs = [
          { x: -50, z: -45, len: 14 },
          { x: 55, z: -50, len: 18 },
          { x: -150, z: -85, len: 16 },
          { x: 150, z: -100, len: 22 },
          { x: -80, z: -180, len: 18 },
          { x: 100, z: -160, len: 14 },
        ];

        shedConfigs.forEach((cfg) => {
          const g = new THREE.Group();
          g.position.set(cfg.x, baseY, cfg.z);

          // Roof deck
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(cfg.len, 0.25, 4), greenMat
          );
          roof.position.y = 3.2;
          roof.castShadow = true;
          g.add(roof);

          // Plywood ceiling underside
          const ceiling = new THREE.Mesh(
            new THREE.BoxGeometry(cfg.len - 0.2, 0.05, 3.8), plywoodMat
          );
          ceiling.position.y = 3.05;
          g.add(ceiling);

          // Vertical poles every 3 units
          const numPoles = Math.floor(cfg.len / 3);
          for (let i = 0; i <= numPoles; i++) {
            const px = -cfg.len / 2 + i * (cfg.len / numPoles);
            [-1.8, 1.8].forEach((dz) => {
              const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 3.2, 5), poleMat
              );
              pole.position.set(px, 1.6, dz);
              g.add(pole);
            });
          }

          // Top rail
          [-1.8, 1.8].forEach((dz) => {
            const rail = new THREE.Mesh(
              new THREE.BoxGeometry(cfg.len, 0.1, 0.1), poleMat
            );
            rail.position.set(0, 2.8, dz);
            g.add(rail);
          });

          // Diagonal braces for X
          for (let i = 0; i < numPoles; i += 2) {
            const px = -cfg.len / 2 + i * (cfg.len / numPoles) + (cfg.len / numPoles) / 2;
            [-1.8, 1.8].forEach((dz) => {
              const br = new THREE.Mesh(
                new THREE.BoxGeometry(cfg.len / numPoles * 1.5, 0.08, 0.08), poleMat
              );
              br.position.set(px, 1.6, dz);
              br.rotation.z = 0.5;
              g.add(br);
            });
          }

          // String of lights underneath
          makeBulbsAlongLine(
            new THREE.Vector3(-cfg.len / 2 + 0.5, 2.95, 0),
            new THREE.Vector3(cfg.len / 2 - 0.5, 2.95, 0),
            Math.max(6, Math.floor(cfg.len / 1.5)),
            0xffe2a0, g
          );

          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Coney Art Walls — graffiti mural panels behind the rides.
       * ---------------------------------------------------------------- */
      function graffitiTexture(seed) {
        const cv = document.createElement("canvas");
        cv.width = 512; cv.height = 256;
        const ctx = cv.getContext("2d");
        // base
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, 512, 256);
        // random colorful splotches
        const palettes = [
          ["#ff3a8a", "#fcd84e", "#00b8d9", "#7b3aff", "#0aff7e"],
          ["#ff7b3a", "#ffe53a", "#00cc88", "#3a8eff", "#ff3a3a"],
          ["#ff0a8a", "#fffa3a", "#00aaff", "#aa3aff", "#ff3a3a"],
        ];
        const palette = palettes[seed % palettes.length];
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
          ctx.beginPath();
          const x = Math.random() * 512;
          const y = Math.random() * 256;
          ctx.ellipse(x, y, 30 + Math.random() * 80, 20 + Math.random() * 50, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        // bold tag text
        ctx.fillStyle = palette[0];
        ctx.font = `900 ${60 + Math.random() * 30}px "Inter", sans-serif`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#000";
        const tags = ["CONEY", "BKLYN", "1234", "BOMB", "AERO", "FEAR", "RAGE"];
        const tag = tags[seed % tags.length];
        ctx.translate(60 + Math.random() * 60, 130 + Math.random() * 40);
        ctx.rotate((Math.random() - 0.5) * 0.3);
        ctx.strokeText(tag, 0, 0);
        ctx.fillText(tag, 0, 0);
        const t = new THREE.CanvasTexture(cv);
        t.anisotropy = 4;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }

      function buildConeyArtWalls() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        // A row of mural walls behind the rides on the north plaza edge
        const wallPositions = [
          { x: -90, z: -8 }, { x: -60, z: -8 }, { x: -30, z: -8 },
          { x: 0, z: -8 },   { x: 30, z: -8 },  { x: 60, z: -8 },
          { x: 90, z: -8 },
        ];
        wallPositions.forEach((p, i) => {
          const tex = graffitiTexture(i);
          const wallMat = new THREE.MeshStandardMaterial({
            map: tex, roughness: 0.85,
          });
          const wall = new THREE.Mesh(
            new THREE.BoxGeometry(28, 8, 0.4),
            wallMat
          );
          wall.position.set(p.x, baseY + 4, p.z);
          wall.castShadow = true;
          wall.receiveShadow = true;
          scene.add(wall);
          // Cap on top
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(28.2, 0.4, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 })
          );
          cap.position.set(p.x, baseY + 8.2, p.z);
          scene.add(cap);
        });
      }

      /* ----------------------------------------------------------------
       *  Character figures — dog walkers, joggers, strollers, buskers,
       *  scattered along the boardwalk.
       * ---------------------------------------------------------------- */
      function addCharacterFigures() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const bwCenterZ = 38;

        // Dog walker (capsule + small leashed dog ahead)
        for (let i = 0; i < 5; i++) {
          const g = new THREE.Group();
          const x = (Math.random() - 0.5) * 600;
          g.position.set(x, baseY, bwCenterZ + (Math.random() - 0.5) * 6);
          const shirtCol = new THREE.Color().setHSL(Math.random(), 0.5, 0.45);
          const person = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({ color: shirtCol, roughness: 0.85 })
          );
          person.position.y = 0.9;
          person.castShadow = true;
          g.add(person);
          // Dog ahead (small lower capsule)
          const dogMat = new THREE.MeshStandardMaterial({
            color: [0x8b5a2b, 0x1a1a1a, 0xeaeaea, 0xc4a060][i % 4], roughness: 0.85,
          });
          const dog = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.18, 0.4, 4, 6),
            dogMat
          );
          dog.position.set(0.7, 0.25, 0);
          dog.rotation.z = Math.PI / 2;
          dog.castShadow = true;
          g.add(dog);
          // Leash (thin line)
          const leash = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4),
            new THREE.MeshStandardMaterial({ color: 0x111418 })
          );
          leash.position.set(0.45, 0.5, 0);
          leash.rotation.z = Math.PI / 3.5;
          g.add(leash);
          scene.add(g);
        }

        // Joggers (athletic capsule + slightly faster animation hook)
        for (let i = 0; i < 4; i++) {
          const x = (Math.random() - 0.5) * 600;
          const z = bwCenterZ + (Math.random() - 0.5) * 6;
          const jogger = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.28, 1.3, 4, 6),
            new THREE.MeshStandardMaterial({
              color: 0xff3a3a, roughness: 0.8,
            })
          );
          jogger.position.set(x, baseY + 0.95, z);
          jogger.castShadow = true;
          scene.add(jogger);
        }

        // Strollers — parent + low stroller box on wheels
        for (let i = 0; i < 4; i++) {
          const g = new THREE.Group();
          const x = (Math.random() - 0.5) * 600;
          g.position.set(x, baseY, bwCenterZ + (Math.random() - 0.5) * 4);
          const parent = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.4, 0.5),
              roughness: 0.85,
            })
          );
          parent.position.y = 0.9;
          parent.castShadow = true;
          g.add(parent);
          // Stroller frame
          const stroller = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.6, 0.5),
            new THREE.MeshStandardMaterial({
              color: 0x1a3a6a, roughness: 0.55,
            })
          );
          stroller.position.set(0.65, 0.45, 0);
          stroller.castShadow = true;
          g.add(stroller);
          // Handle
          const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          handle.position.set(0.4, 1.0, 0);
          handle.rotation.z = Math.PI / 2;
          g.add(handle);
          // Wheels
          [-0.2, 0.2].forEach((dx) => [-0.25, 0.25].forEach((dz) => {
            const w = new THREE.Mesh(
              new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8),
              new THREE.MeshStandardMaterial({ color: 0x111418 })
            );
            w.rotation.z = Math.PI / 2;
            w.position.set(0.65 + dx, 0.1, dz);
            g.add(w);
          }));
          scene.add(g);
        }

        // Buskers — guitar player with case open
        for (let i = 0; i < 3; i++) {
          const g = new THREE.Group();
          const x = -200 + i * 200;
          g.position.set(x, baseY, bwCenterZ + 2.5);
          // Player
          const player = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: [0x2a2a2a, 0x6a3a6a, 0x3a6a4a][i % 3], roughness: 0.85,
            })
          );
          player.position.y = 0.9;
          player.castShadow = true;
          g.add(player);
          // Guitar (held angled)
          const guitar = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.25, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x8b3a1a, roughness: 0.5 })
          );
          guitar.position.set(0.4, 1.0, 0.3);
          guitar.rotation.z = -Math.PI / 5;
          g.add(guitar);
          // Open guitar case on ground in front
          const caseBottom = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.1, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })
          );
          caseBottom.position.set(0, 0.1, 0.8);
          g.add(caseBottom);
          const caseLid = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.1, 0.5),
            new THREE.MeshStandardMaterial({
              color: 0x6a3a1a, roughness: 0.6,
              emissive: 0x6a3a1a, emissiveIntensity: 0.1,
            })
          );
          caseLid.position.set(0, 0.4, 0.55);
          caseLid.rotation.x = -Math.PI / 3.5;
          g.add(caseLid);
          // Dollar bills inside (yellowish patches)
          for (let j = 0; j < 4; j++) {
            const bill = new THREE.Mesh(
              new THREE.PlaneGeometry(0.18, 0.08),
              new THREE.MeshStandardMaterial({ color: 0xa8c46a, roughness: 0.5 })
            );
            bill.rotation.x = -Math.PI / 2;
            bill.position.set((Math.random() - 0.5) * 0.8, 0.16, 0.65 + (Math.random() - 0.5) * 0.3);
            g.add(bill);
          }
          scene.add(g);
        }

        // Skateboarders — for variety on the boardwalk
        for (let i = 0; i < 3; i++) {
          const g = new THREE.Group();
          const x = (Math.random() - 0.5) * 500;
          g.position.set(x, baseY, bwCenterZ);
          const skater = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.28, 1.25, 4, 6),
            new THREE.MeshStandardMaterial({
              color: 0x2a3a6a, roughness: 0.85,
            })
          );
          skater.position.y = 1.0;
          skater.castShadow = true;
          g.add(skater);
          const board = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.06, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 })
          );
          board.position.set(0, 0.18, 0);
          g.add(board);
          scene.add(g);
        }
      }

      /* ----------------------------------------------------------------
       *  Bus stop shelters — glass walls + bench + route sign
       * ---------------------------------------------------------------- */
      function buildBusStops() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xaad0e6, transparent: true, opacity: 0.35,
          metalness: 0.4, roughness: 0.1, transmission: 0.5,
        });
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a, metalness: 0.6, roughness: 0.4,
        });
        const seatMat = new THREE.MeshStandardMaterial({
          color: 0x6a4a2a, roughness: 0.85,
        });
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0x1a3a6a, roughness: 0.55,
        });

        // Pick 8 near-zone bus stop spots
        let placed = 0;
        for (const st of ewStreets) {
          if (placed >= 8) break;
          if (Math.abs(st.position.z - 15) > 360) continue;
          // Two stops per street, on alternating sides
          for (let i = 0; i < 2 && placed < 8; i++) {
            const sx = -120 + i * 240;
            const dz = (placed % 2 === 0 ? -1 : 1) * (streetWidth / 2 + 2);
            const g = new THREE.Group();
            g.position.set(sx, st.position.y, st.position.z + dz);

            // Back wall (glass)
            const back = new THREE.Mesh(
              new THREE.PlaneGeometry(4, 2.5), glassMat
            );
            back.position.set(0, 1.3, dz > 0 ? -0.5 : 0.5);
            back.rotation.y = dz > 0 ? 0 : Math.PI;
            g.add(back);
            // Side glass walls
            [-2, 2].forEach((sx2) => {
              const sd = new THREE.Mesh(
                new THREE.PlaneGeometry(1.6, 2.5), glassMat
              );
              sd.position.set(sx2, 1.3, dz > 0 ? 0.3 : -0.3);
              sd.rotation.y = Math.PI / 2;
              g.add(sd);
            });
            // Roof (blue MTA-style)
            const roof = new THREE.Mesh(
              new THREE.BoxGeometry(4.4, 0.18, 2), roofMat
            );
            roof.position.set(0, 2.65, 0);
            roof.castShadow = true;
            g.add(roof);
            // Frame columns
            [-2, 2].forEach((cx) => [-0.7, 0.7].forEach((cz) => {
              const col = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 2.6, 0.12), frameMat
              );
              col.position.set(cx, 1.3, cz * (dz > 0 ? 1 : -1));
              g.add(col);
            }));
            // Bench
            const bench = new THREE.Mesh(
              new THREE.BoxGeometry(3.4, 0.4, 0.6), seatMat
            );
            bench.position.set(0, 0.45, dz > 0 ? -0.2 : 0.2);
            bench.castShadow = true;
            g.add(bench);
            // Bench legs
            [-1.5, 1.5].forEach((bx) => {
              const lg = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.4, 0.6), frameMat
              );
              lg.position.set(bx, 0.2, dz > 0 ? -0.2 : 0.2);
              g.add(lg);
            });

            // Route sign — "B36 / B68 SURF AVE" lit panel
            const routeTex = signTexture("B36  B68", "#0a2266", "#ffffff", 256, 96);
            const routeMat = new THREE.MeshStandardMaterial({
              map: routeTex, emissive: 0xffffff, emissiveMap: routeTex,
              emissiveIntensity: 0.6,
            });
            const route = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), routeMat);
            route.position.set(1.6, 2.0, dz > 0 ? -0.45 : 0.45);
            g.add(route);

            // Sometimes a person waiting
            if (Math.random() > 0.4) {
              const pers = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
                new THREE.MeshStandardMaterial({
                  color: new THREE.Color().setHSL(Math.random(), 0.5, 0.5),
                  roughness: 0.85,
                })
              );
              pers.position.set((Math.random() - 0.5) * 2, 0.95, dz > 0 ? -0.1 : 0.1);
              pers.castShadow = true;
              g.add(pers);
            }
            scene.add(g);
            placed++;
          }
        }
      }

      /* ----------------------------------------------------------------
       *  Subway entrances — stairway with green globe sign
       * ---------------------------------------------------------------- */
      function buildSubwayEntrances() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const positions = [
          { x: -120, z: -45, line: "F" },
          { x: 80, z: -50, line: "Q" },
          { x: -250, z: -120, line: "D" },
          { x: 200, z: -110, line: "N" },
          { x: 0, z: -140, line: "F" },
          { x: -60, z: -220, line: "Q" },
        ];

        positions.forEach((p) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);

          // Stair pit (dark rectangle going down)
          const pit = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.5, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 })
          );
          pit.position.set(0, -0.2, 0);
          g.add(pit);

          // Stair steps inside (visual hint)
          for (let i = 0; i < 5; i++) {
            const step = new THREE.Mesh(
              new THREE.BoxGeometry(2.7, 0.12, 0.5),
              new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.75 })
            );
            step.position.set(0, -0.05 - i * 0.08, -1.5 + i * 0.6);
            g.add(step);
          }

          // Side walls / railings (low concrete)
          [-1.6, 1.6].forEach((dx) => {
            const wall = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 1.0, 5),
              new THREE.MeshStandardMaterial({ color: 0xa8a8a4, roughness: 0.85 })
            );
            wall.position.set(dx, 0.4, 0);
            wall.castShadow = true;
            g.add(wall);
          });

          // The iconic green globe sign on a pole
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6 })
          );
          pole.position.set(1.6, 1.7, -2);
          pole.castShadow = true;
          g.add(pole);
          // Green globe (means open 24h)
          const globe = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 12, 8),
            new THREE.MeshStandardMaterial({
              color: 0x4aff7a, emissive: 0x2afa6a, emissiveIntensity: 0.6,
              roughness: 0.4,
            })
          );
          globe.position.set(1.6, 3.55, -2);
          g.add(globe);
          bulbMeshes.push(globe);

          // SUBWAY sign panel
          const subTex = signTexture("SUBWAY", "#000000", "#ffffff", 256, 64);
          const subMat = new THREE.MeshStandardMaterial({
            map: subTex, emissive: 0xffffff, emissiveMap: subTex,
            emissiveIntensity: 0.5,
          });
          const subSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4), subMat);
          subSign.position.set(1.6, 2.7, -2);
          g.add(subSign);

          // Route bullet
          const routeColors = { F: "#ff6319", Q: "#fccc0a", D: "#ff6319", N: "#fccc0a" };
          const rgB = signTexture(p.line, routeColors[p.line], "#000", 128, 128);
          const rgM = new THREE.MeshStandardMaterial({
            map: rgB, emissive: 0xffffff, emissiveMap: rgB, emissiveIntensity: 0.55,
          });
          const rgMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), rgM);
          rgMesh.position.set(2.2, 2.7, -2);
          g.add(rgMesh);

          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Citi Bike docking stations — blue bikes in row
       * ---------------------------------------------------------------- */
      function buildCitiBikeDocks() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const dockPositions = [
          { x: -40, z: -45 },
          { x: 60, z: -50 },
          { x: -160, z: -90 },
          { x: 170, z: -100 },
          { x: -90, z: -170 },
          { x: 100, z: -180 },
        ];

        dockPositions.forEach((p) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);

          // Base rail (long platform)
          const numDocks = 10;
          const railLen = numDocks * 1.2;
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(railLen, 0.3, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x222831, metalness: 0.55, roughness: 0.5 })
          );
          rail.position.y = 0.15;
          rail.castShadow = true;
          g.add(rail);

          // Kiosk at the end
          const kiosk = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 2.0, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x0033a0, roughness: 0.6 })
          );
          kiosk.position.set(-railLen / 2 - 1, 1.0, 0);
          kiosk.castShadow = true;
          g.add(kiosk);
          // "Citi Bike" logo (just a blue panel with text)
          const cbTex = signTexture("Citi Bike", "#0033a0", "#ffffff", 512, 128);
          const cbMat = new THREE.MeshStandardMaterial({
            map: cbTex, emissive: 0xffffff, emissiveMap: cbTex, emissiveIntensity: 0.5,
          });
          const cb = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), cbMat);
          cb.position.set(-railLen / 2 - 1, 1.5, 0.35);
          g.add(cb);

          // Bikes — most slots filled
          const bikeBlueMat = new THREE.MeshStandardMaterial({
            color: 0x0033a0, metalness: 0.4, roughness: 0.5,
          });
          const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, metalness: 0.3, roughness: 0.6,
          });
          for (let i = 0; i < numDocks; i++) {
            if (Math.random() < 0.25) continue; // some empty
            const bx = -railLen / 2 + 0.6 + i * 1.2;
            const bg = new THREE.Group();
            bg.position.set(bx, 0.5, 0);
            // Frame
            const frame = new THREE.Mesh(
              new THREE.BoxGeometry(1.0, 0.08, 0.06), bikeBlueMat
            );
            frame.position.y = 0.2;
            bg.add(frame);
            // Vertical stem
            const stem = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, 0.6, 0.06), bikeBlueMat
            );
            stem.position.set(0.2, 0.4, 0);
            bg.add(stem);
            // Seat
            const seat = new THREE.Mesh(
              new THREE.BoxGeometry(0.18, 0.06, 0.1),
              new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
            );
            seat.position.set(0.2, 0.75, 0);
            bg.add(seat);
            // Handlebars
            const bars = new THREE.Mesh(
              new THREE.BoxGeometry(0.04, 0.04, 0.4), bikeBlueMat
            );
            bars.position.set(-0.4, 0.5, 0);
            bg.add(bars);
            // Wheels
            [-0.4, 0.4].forEach((wx) => {
              const w = new THREE.Mesh(
                new THREE.TorusGeometry(0.22, 0.04, 5, 12), wheelMat
              );
              w.rotation.y = Math.PI / 2;
              w.position.set(wx, 0, 0);
              bg.add(w);
            });
            g.add(bg);
          }

          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Manhole covers + storm drains + parking meters
       * ---------------------------------------------------------------- */
      function buildManholesAndDrains() {
        const baseY = groundMesh.position.y + terrainAmp + 0.06;
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        // Manhole covers — round dark discs in the road
        const mhMat = new THREE.MeshStandardMaterial({
          color: 0x222628, metalness: 0.65, roughness: 0.6,
        });
        const mhGeom = new THREE.CircleGeometry(0.5, 16);
        const mhInst = new THREE.InstancedMesh(mhGeom, mhMat, 80);
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        const sV = new THREE.Vector3(1, 1, 1);
        let mhi = 0;
        ewStreets.forEach((st) => {
          for (let x = -gridLength / 2 + 30; x < gridLength / 2 - 30; x += 30) {
            if (Math.random() < 0.5 && mhi < 80 && Math.abs(x) < 500) {
              v.set(x + (Math.random() - 0.5) * 10, st.position.y + 0.05, st.position.z + (Math.random() - 0.5) * 4);
              m4.compose(v, q, sV);
              mhInst.setMatrixAt(mhi++, m4);
            }
          }
        });
        mhInst.count = mhi;
        mhInst.instanceMatrix.needsUpdate = true;
        scene.add(mhInst);

        // Storm drain grates at curbs
        const gdMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, metalness: 0.5, roughness: 0.6,
        });
        const gdGeom = new THREE.PlaneGeometry(0.9, 0.4);
        const gdInst = new THREE.InstancedMesh(gdGeom, gdMat, 60);
        let gdi = 0;
        ewStreets.forEach((st) => {
          for (let x = -gridLength / 2 + 50; x < gridLength / 2 - 50; x += 40) {
            if (Math.random() < 0.6 && gdi < 60 && Math.abs(x) < 500) {
              const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 - 0.4);
              v.set(x, st.position.y + 0.04, st.position.z + dz);
              m4.compose(v, q, sV);
              gdInst.setMatrixAt(gdi++, m4);
            }
          }
        });
        gdInst.count = gdi;
        gdInst.instanceMatrix.needsUpdate = true;
        scene.add(gdInst);

        // Muni meters (one tall pole + box, every couple of car spots)
        const meterPoleMat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a, metalness: 0.6, roughness: 0.5,
        });
        const meterBoxMat = new THREE.MeshStandardMaterial({
          color: 0x6a6a6a, metalness: 0.55, roughness: 0.55,
        });
        const meterScreenMat = new THREE.MeshStandardMaterial({
          color: 0x111418, emissive: 0x2a4a2a, emissiveIntensity: 0.5,
        });
        ewStreets.forEach((st) => {
          if (Math.abs(st.position.z - 15) > 400) return;
          for (let x = -gridLength / 2 + 30; x < gridLength / 2 - 30; x += 50) {
            if (Math.random() < 0.5) {
              const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 2.8);
              const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), meterPoleMat
              );
              pole.position.set(x, st.position.y + 0.9, st.position.z + dz);
              scene.add(pole);
              const box = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.6, 0.25), meterBoxMat
              );
              box.position.set(x, st.position.y + 1.95, st.position.z + dz);
              box.castShadow = true;
              scene.add(box);
              const screen = new THREE.Mesh(
                new THREE.PlaneGeometry(0.28, 0.18), meterScreenMat
              );
              screen.position.set(x, st.position.y + 2.05, st.position.z + dz + (dz > 0 ? -0.13 : 0.13));
              if (dz < 0) screen.rotation.y = Math.PI;
              scene.add(screen);
            }
          }
        });
      }

      /* ----------------------------------------------------------------
       *  Street markings — dashed center lines, painted bike lanes
       * ---------------------------------------------------------------- */
      /* N-S avenues completing the street grid (the same lines the building generator avoids) */
      function buildAvenues() {
        const y = streetLevelY + 0.03;
        const aveLen = maxBuildingZ - buildingAreaMinZ;
        const aveMat = new THREE.MeshStandardMaterial({ color: 0x464c54, roughness: 0.88 });
        const dashMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.55 });
        const walkMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 });
        const g = new THREE.Group();
        const dashGeom = new THREE.PlaneGeometry(0.2, 2.5);
        const walkGeom = new THREE.PlaneGeometry(0.6, streetWidth - 2);
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xbdbdb4, roughness: 0.82 });
        const curbMat = new THREE.MeshStandardMaterial({ color: 0x9d9d96, roughness: 0.75 });
        /* sidewalks + curbs along the E-W streets */
        scene.traverse((o) => { if (!o.userData?.isEWStreet) return;
          for (const dz of [-1, 1]) {
            const sw = new THREE.Mesh(new THREE.PlaneGeometry(gridLength, 2.6), sideMat);
            sw.rotation.x = -Math.PI / 2;
            sw.position.set(o.position.x, y + 0.005, o.position.z + dz * (streetWidth / 2 + 1.3));
            sw.receiveShadow = true; g.add(sw);
            const curb = new THREE.Mesh(new THREE.BoxGeometry(gridLength, 0.14, 0.24), curbMat);
            curb.position.set(o.position.x, y + 0.07, o.position.z + dz * (streetWidth / 2 + 0.12));
            g.add(curb); } });
        for (let s = 0; s < 12; s++) {
          const sx = buildingAreaMinX + 50 + s * 100;
          const ave = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, aveLen), aveMat);
          ave.rotation.x = -Math.PI / 2;
          ave.position.set(sx, y, buildingAreaMinZ + aveLen / 2);
          ave.receiveShadow = true; g.add(ave);
          for (const dx of [-1, 1]) {                              // avenue sidewalks + curbs
            const sw = new THREE.Mesh(new THREE.PlaneGeometry(2.6, aveLen), sideMat);
            sw.rotation.x = -Math.PI / 2;
            sw.position.set(sx + dx * (streetWidth / 2 + 1.3), y + 0.004, buildingAreaMinZ + aveLen / 2);
            sw.receiveShadow = true; g.add(sw);
            const curb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, aveLen), curbMat);
            curb.position.set(sx + dx * (streetWidth / 2 + 0.12), y + 0.07, buildingAreaMinZ + aveLen / 2);
            g.add(curb); }
          const nd = Math.floor(aveLen / 7);
          const dashes = new THREE.InstancedMesh(dashGeom, dashMat, nd);
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
          for (let i = 0; i < nd; i++) { v.set(sx, y + 0.02, buildingAreaMinZ + 3 + i * 7); m4.compose(v, q, sv); dashes.setMatrixAt(i, m4); }
          g.add(dashes);
          // crosswalks where avenues meet the E-W streets
          for (let e = 0; e < 12; e++) {
            const ez = maxBuildingZ - 20 - e * gridSpacingZ;
            if (ez < buildingAreaMinZ) break;
            for (let w2 = 0; w2 < 5; w2++) {
              const stripe = new THREE.Mesh(walkGeom, walkMat);
              stripe.rotation.x = -Math.PI / 2;
              stripe.position.set(sx - 2.4 + w2 * 1.2, y + 0.025, ez + gridSpacingZ * 0);
              stripe.position.z = ez + streetWidth / 2 + 1.2;
              g.add(stripe);
            }
          }
        }
        scene.add(g);
      }

      function buildStreetMarkings() {
        const baseY = groundMesh.position.y + terrainAmp + 0.06;
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        // Dashed yellow center lines on every street
        const dashMat = new THREE.MeshStandardMaterial({
          color: 0xffcc00, roughness: 0.55,
        });
        const dashGeom = new THREE.PlaneGeometry(2.5, 0.2);
        ewStreets.forEach((st) => {
          const numDashes = Math.floor(gridLength / 6);
          const dashInst = new THREE.InstancedMesh(dashGeom, dashMat, numDashes);
          const m4 = new THREE.Matrix4();
          const v = new THREE.Vector3();
          const q = new THREE.Quaternion();
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
          const sV = new THREE.Vector3(1, 1, 1);
          for (let i = 0; i < numDashes; i++) {
            v.set(-gridLength / 2 + 3 + i * 6, st.position.y + 0.025, st.position.z);
            m4.compose(v, q, sV);
            dashInst.setMatrixAt(i, m4);
          }
          dashInst.instanceMatrix.needsUpdate = true;
          scene.add(dashInst);
        });

        // Painted green bike lanes on a couple of near-zone streets
        const bikeMat = new THREE.MeshStandardMaterial({
          color: 0x1a8c4a, roughness: 0.7,
        });
        const nearStreets = ewStreets.filter(
          (st) => Math.abs(st.position.z - 15) < 200
        ).slice(0, 2);
        nearStreets.forEach((st) => {
          const bl = new THREE.Mesh(
            new THREE.PlaneGeometry(gridLength, 1.6), bikeMat
          );
          bl.rotation.x = -Math.PI / 2;
          bl.position.set(0, st.position.y + 0.025, st.position.z + streetWidth / 2 - 1);
          scene.add(bl);
          // Bike symbol painted every few meters — just little white rectangles
          const symMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.5,
          });
          const symGeom = new THREE.PlaneGeometry(0.6, 0.4);
          const numSym = Math.floor(gridLength / 20);
          const symInst = new THREE.InstancedMesh(symGeom, symMat, numSym);
          const m4 = new THREE.Matrix4();
          const v = new THREE.Vector3();
          const q = new THREE.Quaternion();
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
          const sV = new THREE.Vector3(1, 1, 1);
          for (let i = 0; i < numSym; i++) {
            v.set(-gridLength / 2 + 10 + i * 20, st.position.y + 0.04, st.position.z + streetWidth / 2 - 1);
            m4.compose(v, q, sV);
            symInst.setMatrixAt(i, m4);
          }
          symInst.instanceMatrix.needsUpdate = true;
          scene.add(symInst);
        });
      }

      /* ----------------------------------------------------------------
       *  Food carts — halal cart + hot dog cart at street corners
       * ---------------------------------------------------------------- */
      function buildFoodCarts() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const carts = [
          { x: -110, z: -30, type: "halal", label: "HALAL" },
          { x: 110, z: -30, type: "hotdog", label: "HOT DOG" },
          { x: -50, z: -130, type: "halal", label: "HALAL · GYRO" },
          { x: 80, z: -130, type: "hotdog", label: "PRETZEL" },
          { x: -180, z: -200, type: "halal", label: "HALAL" },
          { x: 170, z: -200, type: "hotdog", label: "ICES" },
        ];

        carts.forEach((c) => {
          const g = new THREE.Group();
          g.position.set(c.x, baseY, c.z);

          // Cart body
          const bodyColor = c.type === "halal" ? 0xc0c4c8 : 0xff5a3a;
          const cart = new THREE.Mesh(
            new THREE.BoxGeometry(3.0, 1.6, 1.6),
            new THREE.MeshStandardMaterial({
              color: bodyColor, metalness: 0.4, roughness: 0.55,
            })
          );
          cart.position.y = 0.9;
          cart.castShadow = true;
          g.add(cart);
          // Yellow trim (halal carts have it)
          if (c.type === "halal") {
            const trim = new THREE.Mesh(
              new THREE.BoxGeometry(3.05, 0.4, 1.65),
              new THREE.MeshStandardMaterial({
                color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.15,
              })
            );
            trim.position.y = 1.0;
            g.add(trim);
          }

          // Umbrella
          const umb = new THREE.Mesh(
            new THREE.ConeGeometry(2.0, 0.55, 8),
            new THREE.MeshStandardMaterial({
              color: c.type === "halal" ? 0xfacc15 : 0xff5a3a, roughness: 0.55,
            })
          );
          umb.position.y = 3.3;
          umb.castShadow = true;
          g.add(umb);
          // Pole
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5),
            new THREE.MeshStandardMaterial({ color: 0x2c3540 })
          );
          pole.position.y = 2.3;
          g.add(pole);

          // Signage
          const sigBg = c.type === "halal" ? "#fcc20a" : "#c41e3a";
          const sigFg = c.type === "halal" ? "#000" : "#fff";
          const sigT = signTexture(c.label, sigBg, sigFg, 1024, 128);
          const sigM = new THREE.MeshStandardMaterial({
            map: sigT, emissive: 0xffffff, emissiveMap: sigT, emissiveIntensity: 0.55,
          });
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), sigM);
          sg.position.set(0, 1.8, 0.83);
          g.add(sg);

          // Wheels
          const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
          [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]].forEach(([wx, wz]) => {
            const w = new THREE.Mesh(
              new THREE.CylinderGeometry(0.3, 0.3, 0.15, 10), wheelMat
            );
            w.rotation.z = Math.PI / 2;
            w.position.set(wx, 0.15, wz);
            g.add(w);
          });

          // Vendor
          const vendor = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.85 })
          );
          vendor.position.set(0, 1.5, -1.0);
          vendor.castShadow = true;
          g.add(vendor);

          // Customer queue
          for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
            const cust = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
              new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.5, 0.5),
                roughness: 0.85,
              })
            );
            cust.position.set(0.5 + i * 0.7, 1.5, 1.4 + i * 0.4);
            cust.castShadow = true;
            g.add(cust);
          }

          scene.add(g);

          // Steam plume from cart
          spawnSteam(c.x, baseY + 1.7, c.z, {
            count: 28, scale: 0.8, riseSpeed: 1.5,
          });
        });
      }

      /* ----------------------------------------------------------------
       *  Construction details — cones + jersey barriers
       * ---------------------------------------------------------------- */
      function buildConstructionDetails() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;

        // Cones (instanced)
        const coneOrange = new THREE.MeshStandardMaterial({
          color: 0xff6020, roughness: 0.7,
          emissive: 0xff6020, emissiveIntensity: 0.05,
        });
        const coneGeom = new THREE.ConeGeometry(0.25, 0.8, 6);
        const numCones = 80;
        const coneInst = new THREE.InstancedMesh(coneGeom, coneOrange, numCones);
        coneInst.castShadow = true;
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sV = new THREE.Vector3(1, 1, 1);
        let ci = 0;

        // Cone clusters at ~6 spots
        const coneClusters = [
          { x: -80, z: -30, n: 8 },
          { x: 90, z: -30, n: 10 },
          { x: -180, z: -90, n: 6 },
          { x: 200, z: -100, n: 8 },
          { x: -130, z: -190, n: 7 },
          { x: 120, z: -200, n: 9 },
        ];
        coneClusters.forEach((cl) => {
          for (let i = 0; i < cl.n && ci < numCones; i++) {
            const angle = (i / cl.n) * Math.PI * 2;
            const r = 1.5 + Math.random() * 2;
            v.set(
              cl.x + Math.cos(angle) * r,
              baseY + 0.4,
              cl.z + Math.sin(angle) * r
            );
            m4.compose(v, q, sV);
            coneInst.setMatrixAt(ci++, m4);
          }
        });
        coneInst.count = ci;
        coneInst.instanceMatrix.needsUpdate = true;
        scene.add(coneInst);

        // Reflective bands on cones (white rings)
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2,
        });
        const ringGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 6, 1, true);
        const ringInst = new THREE.InstancedMesh(ringGeom, ringMat, ci);
        for (let i = 0; i < ci; i++) {
          coneInst.getMatrixAt(i, m4);
          const pos = new THREE.Vector3().setFromMatrixPosition(m4);
          v.set(pos.x, pos.y, pos.z);
          m4.compose(v, q, sV);
          ringInst.setMatrixAt(i, m4);
        }
        ringInst.instanceMatrix.needsUpdate = true;
        scene.add(ringInst);

        // Jersey barriers (white concrete with reflective top stripe)
        const jbWhite = new THREE.MeshStandardMaterial({
          color: 0xe8e8e0, roughness: 0.85,
        });
        const jbGeom = new THREE.BoxGeometry(3, 1, 0.6);
        const jbConfigs = [
          { x: -80, z: -36, count: 4 },
          { x: 90, z: -36, count: 4 },
          { x: -180, z: -95, count: 3 },
        ];
        jbConfigs.forEach((cfg) => {
          for (let i = 0; i < cfg.count; i++) {
            const jb = new THREE.Mesh(jbGeom, jbWhite);
            jb.position.set(cfg.x + (i - cfg.count / 2) * 3.1, baseY + 0.5, cfg.z);
            jb.castShadow = true;
            scene.add(jb);
            // Orange stripe on top
            const stripe = new THREE.Mesh(
              new THREE.BoxGeometry(3.05, 0.1, 0.65),
              new THREE.MeshStandardMaterial({
                color: 0xff6020, emissive: 0xff6020, emissiveIntensity: 0.2,
              })
            );
            stripe.position.set(cfg.x + (i - cfg.count / 2) * 3.1, baseY + 1.05, cfg.z);
            scene.add(stripe);
          }
        });
      }

      /* ----------------------------------------------------------------
       *  Sideshow by the Seashore facade
       * ---------------------------------------------------------------- */
      function buildSideshowFacade() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const g = new THREE.Group();
        g.position.set(60, baseY, -3);

        // Building body
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0xc41e3a, roughness: 0.85,
        });
        const W = 28, H = 11, D = 14;
        const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
        main.position.y = H / 2;
        main.castShadow = true;
        main.receiveShadow = true;
        g.add(main);

        // Painted sideshow banner — colorful illustrated text panel across front
        const bannerCanvas = document.createElement("canvas");
        bannerCanvas.width = 2048; bannerCanvas.height = 384;
        const bctx = bannerCanvas.getContext("2d");
        // Yellow background with stripes
        const grad = bctx.createLinearGradient(0, 0, 2048, 0);
        grad.addColorStop(0, "#fcd84e");
        grad.addColorStop(0.5, "#ff8a00");
        grad.addColorStop(1, "#fcd84e");
        bctx.fillStyle = grad;
        bctx.fillRect(0, 0, 2048, 384);
        // "SIDESHOWS BY THE SEASHORE"
        bctx.fillStyle = "#000000";
        bctx.strokeStyle = "#fff";
        bctx.lineWidth = 8;
        bctx.font = "900 110px Inter, sans-serif";
        bctx.textAlign = "center";
        bctx.textBaseline = "middle";
        bctx.strokeText("SIDESHOWS", 1024, 100);
        bctx.fillText("SIDESHOWS", 1024, 100);
        bctx.font = "900 80px Inter, sans-serif";
        bctx.strokeText("BY THE SEASHORE", 1024, 220);
        bctx.fillText("BY THE SEASHORE", 1024, 220);
        bctx.font = "bold 50px Inter, sans-serif";
        bctx.fillStyle = "#c41e3a";
        bctx.fillText("★ LIVE ACTS ★ FREAKS ★ FIRE EATERS ★", 1024, 320);
        const bannerTex = new THREE.CanvasTexture(bannerCanvas);
        bannerTex.anisotropy = 8;
        bannerTex.colorSpace = THREE.SRGBColorSpace;
        const bannerMat = new THREE.MeshStandardMaterial({
          map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.3,
        });
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 5), bannerMat);
        banner.position.set(0, H - 2.5, D / 2 + 0.05);
        g.add(banner);

        // Side "act" banners — vertical narrow painted panels with attractions
        const acts = ["TWO-HEADED", "FIRE EATER", "SWORD SWALLOWER", "CONTORTIONIST"];
        for (let i = 0; i < 4; i++) {
          const cv = document.createElement("canvas");
          cv.width = 256; cv.height = 512;
          const c = cv.getContext("2d");
          const hue = [40, 200, 320, 120][i];
          c.fillStyle = `hsl(${hue}, 75%, 50%)`;
          c.fillRect(0, 0, 256, 512);
          c.fillStyle = "#000";
          c.strokeStyle = "#fff";
          c.lineWidth = 4;
          c.font = "bold 36px Inter, sans-serif";
          c.textAlign = "center";
          c.translate(128, 256);
          c.rotate(-Math.PI / 2);
          c.strokeText(acts[i], 0, 0);
          c.fillText(acts[i], 0, 0);
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          const ban = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 6),
            new THREE.MeshStandardMaterial({
              map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25,
            })
          );
          ban.position.set(-W / 2 + 3 + i * 6, H / 2 - 1, D / 2 + 0.06);
          g.add(ban);
        }

        // Marquee bulbs around the main banner
        makeBulbsAlongLine(
          new THREE.Vector3(-W / 2 + 1, H - 0.5, D / 2 + 0.1),
          new THREE.Vector3(W / 2 - 1, H - 0.5, D / 2 + 0.1),
          40, 0xffe2a0, g
        );
        makeBulbsAlongLine(
          new THREE.Vector3(-W / 2 + 1, H - 4.5, D / 2 + 0.1),
          new THREE.Vector3(W / 2 - 1, H - 4.5, D / 2 + 0.1),
          40, 0xffe2a0, g
        );

        // Ticket booth in front
        const booth = new THREE.Mesh(
          new THREE.BoxGeometry(3, 3, 2.5),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 })
        );
        booth.position.set(-W / 2 + 3, 1.5, D / 2 + 1.8);
        booth.castShadow = true;
        g.add(booth);
        const boothRoof = new THREE.Mesh(
          new THREE.ConeGeometry(2.5, 1, 4),
          new THREE.MeshStandardMaterial({ color: 0xc41e3a, roughness: 0.6 })
        );
        boothRoof.position.set(-W / 2 + 3, 3.5, D / 2 + 1.8);
        boothRoof.rotation.y = Math.PI / 4;
        g.add(boothRoof);
        const tixSign = signTexture("TICKETS", "#c41e3a", "#fff", 256, 96);
        const tixMat = new THREE.MeshStandardMaterial({
          map: tixSign, emissive: 0xffffff, emissiveMap: tixSign, emissiveIntensity: 0.55,
        });
        const tix = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.6), tixMat);
        tix.position.set(-W / 2 + 3, 2, D / 2 + 3.07);
        g.add(tix);

        scene.add(g);
      }

      /* ----------------------------------------------------------------
       *  Full playground equipment — replaces minimal version. Climbing
       *  structure with bridge, spring riders, see-saw, merry-go-round,
       *  multiple swings, rubber safety mat, fence, kid figures.
       * ---------------------------------------------------------------- */
      function createPlaygroundEquipmentDetailed(position) {
        const g = new THREE.Group();
        const eqMat = new THREE.MeshStandardMaterial({
          color: 0x4a5060, metalness: 0.45, roughness: 0.5,
        });
        const seatMat = new THREE.MeshStandardMaterial({
          color: 0xd14848, roughness: 0.6,
        });
        const woodMat = new THREE.MeshStandardMaterial({
          color: 0x8b5a2b, roughness: 0.85,
        });
        // Rubber safety surface — primary color blobs
        const rubberColors = [0xc8e63a, 0xf78ab0, 0x44c8ec, 0xffd348];
        const matBlobs = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const blob = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 12),
            new THREE.MeshStandardMaterial({
              color: rubberColors[i], roughness: 0.85,
            })
          );
          blob.rotation.x = -Math.PI / 2;
          blob.position.set(
            position.x + (i % 2) * 11 - 5.5,
            0.04,
            position.z + Math.floor(i / 2) * 11 - 5.5
          );
          blob.receiveShadow = true;
          matBlobs.add(blob);
        }
        g.add(matBlobs);

        // Climbing structure — two platforms + slide + bridge
        const platMat = new THREE.MeshStandardMaterial({
          color: 0xffaa00, roughness: 0.7,
        });
        const plat1 = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 0.2, 2.5), platMat
        );
        plat1.position.set(position.x - 4, 2, position.z + 4);
        plat1.castShadow = true;
        g.add(plat1);
        const plat2 = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 0.2, 2.5), platMat
        );
        plat2.position.set(position.x + 4, 2.5, position.z + 4);
        plat2.castShadow = true;
        g.add(plat2);
        // Posts for the platforms
        [-4, 4].forEach((cx) => [-1.1, 1.1].forEach((dz) => [-1.1, 1.1].forEach((dx) => {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 3.0, 6), eqMat
          );
          post.position.set(position.x + cx + dx, 1.5, position.z + 4 + dz);
          post.castShadow = true;
          g.add(post);
        })));
        // Bridge between platforms (slats)
        for (let i = 0; i < 6; i++) {
          const slat = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.1, 0.4), woodMat
          );
          slat.position.set(position.x - 2.5 + i * 1.1, 2.05, position.z + 4);
          g.add(slat);
        }
        // Bridge rope sides
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb8a070 });
        [-0.7, 0.7].forEach((dz) => {
          const rope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 6, 5), ropeMat
          );
          rope.position.set(position.x, 2.5, position.z + 4 + dz);
          rope.rotation.z = Math.PI / 2;
          g.add(rope);
        });

        // Slide off plat2
        const slide = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 0.15, 5), platMat
        );
        slide.position.set(position.x + 5, 1, position.z + 1.5);
        slide.rotation.x = -Math.PI / 6;
        slide.castShadow = true;
        g.add(slide);

        // Climb-ladder to plat1
        const ladderMat = eqMat;
        for (let i = 0; i < 4; i++) {
          const rung = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.08, 0.08), ladderMat
          );
          rung.position.set(position.x - 4, 0.4 + i * 0.45, position.z + 5.5);
          g.add(rung);
        }

        // Swing set (4 swings)
        const swingSet = new THREE.Group();
        swingSet.position.set(position.x, 0, position.z - 4);
        const swingP1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6), eqMat
        );
        swingP1.position.set(-4, 2.25, 0);
        swingP1.rotation.z = 0.1;
        swingSet.add(swingP1);
        const swingP2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6), eqMat
        );
        swingP2.position.set(4, 2.25, 0);
        swingP2.rotation.z = -0.1;
        swingSet.add(swingP2);
        const swingBar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 8, 6), eqMat
        );
        swingBar.rotation.z = Math.PI / 2;
        swingBar.position.set(0, 4.4, 0);
        swingBar.castShadow = true;
        swingSet.add(swingBar);
        // Swings
        for (let i = 0; i < 4; i++) {
          const sx = -3 + i * 2;
          // Chain
          [-0.3, 0.3].forEach((cd) => {
            const chain = new THREE.Mesh(
              new THREE.CylinderGeometry(0.025, 0.025, 2.8, 4),
              new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6 })
            );
            chain.position.set(sx + cd, 3.0, 0);
            swingSet.add(chain);
          });
          // Seat
          const seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.08, 0.3), seatMat
          );
          seat.position.set(sx, 1.6, 0);
          seat.castShadow = true;
          swingSet.add(seat);
        }
        g.add(swingSet);

        // See-saw
        const ssGroup = new THREE.Group();
        ssGroup.position.set(position.x - 4, 0, position.z - 1);
        const ssBase = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.6, 0.6), eqMat
        );
        ssBase.position.set(0, 0.3, 0);
        ssGroup.add(ssBase);
        const ssBeam = new THREE.Mesh(
          new THREE.BoxGeometry(4, 0.2, 0.3), platMat
        );
        ssBeam.position.set(0, 0.7, 0);
        ssBeam.rotation.z = 0.15; // tilted
        ssBeam.castShadow = true;
        ssGroup.add(ssBeam);
        [-1.7, 1.7].forEach((sx) => {
          const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.4, 5), eqMat
          );
          handle.position.set(sx, 1.0, 0);
          ssGroup.add(handle);
        });
        g.add(ssGroup);

        // Merry-go-round
        const mgGroup = new THREE.Group();
        mgGroup.position.set(position.x + 5, 0, position.z - 3);
        const mgFloor = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 0.12, 16),
          new THREE.MeshStandardMaterial({ color: 0x4ac8e8, roughness: 0.55 })
        );
        mgFloor.position.y = 0.3;
        mgFloor.castShadow = true;
        mgGroup.add(mgFloor);
        const mgCenter = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), eqMat
        );
        mgCenter.position.y = 0.6;
        mgGroup.add(mgCenter);
        // Handles around the edge
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), eqMat
          );
          handle.position.set(Math.cos(a) * 1.4, 0.85, Math.sin(a) * 1.4);
          mgGroup.add(handle);
        }
        g.add(mgGroup);

        // Spring riders — 3 small animal-shape blocks
        const riders = [
          { x: -3, z: 2, color: 0xff6a3a }, // horse
          { x: 0, z: 2.5, color: 0xfacc15 }, // duck
          { x: 3, z: 2, color: 0x4aff7a }, // frog
        ];
        riders.forEach((r) => {
          const spring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.45, 4),
            new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5 })
          );
          spring.position.set(position.x + r.x, 0.25, position.z + r.z);
          g.add(spring);
          const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 6),
            new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.65 })
          );
          body.position.set(position.x + r.x, 0.7, position.z + r.z);
          body.scale.set(1.1, 0.8, 1.3);
          body.castShadow = true;
          g.add(body);
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 6, 5),
            new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.65 })
          );
          head.position.set(position.x + r.x + 0.35, 1.0, position.z + r.z);
          g.add(head);
        });

        // Sandbox
        const sb = new THREE.Group();
        sb.position.set(position.x - 6, 0, position.z + 2);
        const sandFloor = new THREE.Mesh(
          new THREE.PlaneGeometry(3, 3),
          new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.95 })
        );
        sandFloor.rotation.x = -Math.PI / 2;
        sandFloor.position.y = 0.06;
        sb.add(sandFloor);
        const sboxGeom = new THREE.BoxGeometry(3, 0.25, 0.2);
        const sw1 = new THREE.Mesh(sboxGeom, woodMat); sw1.position.set(0, 0.13, 1.5);
        const sw2 = new THREE.Mesh(sboxGeom, woodMat); sw2.position.set(0, 0.13, -1.5);
        const sw3 = new THREE.Mesh(sboxGeom, woodMat); sw3.rotation.y = Math.PI / 2; sw3.position.set(1.5, 0.13, 0);
        const sw4 = new THREE.Mesh(sboxGeom, woodMat); sw4.rotation.y = Math.PI / 2; sw4.position.set(-1.5, 0.13, 0);
        sb.add(sw1, sw2, sw3, sw4);
        g.add(sb);

        // Fence perimeter (chain-link feel)
        const fenceMat = new THREE.MeshStandardMaterial({
          color: 0x6a6a6a, metalness: 0.5, roughness: 0.5,
        });
        const fenceR = 12;
        for (let s = 0; s < 4; s++) {
          const isX = s % 2 === 0;
          const dir = s < 2 ? 1 : -1;
          const len = fenceR * 2;
          const segPosts = 8;
          for (let p = 0; p <= segPosts; p++) {
            const u = p / segPosts;
            const post = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.06, 1.4, 4), fenceMat
            );
            const pos = new THREE.Vector3(position.x, 0.7, position.z);
            if (s === 0) { pos.x = pos.x - fenceR + u * len; pos.z -= fenceR; }
            else if (s === 1) { pos.x += fenceR; pos.z = pos.z - fenceR + u * len; }
            else if (s === 2) { pos.x = pos.x - fenceR + u * len; pos.z += fenceR; }
            else { pos.x -= fenceR; pos.z = pos.z - fenceR + u * len; }
            post.position.copy(pos);
            g.add(post);
          }
          // Top rail
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(len, 0.05, 0.05), fenceMat
          );
          if (isX) {
            rail.position.set(position.x, 1.4, position.z + (s === 0 ? -fenceR : fenceR));
          } else {
            rail.position.set(position.x + (s === 1 ? fenceR : -fenceR), 1.4, position.z);
            rail.rotation.y = Math.PI / 2;
          }
          g.add(rail);
        }

        // Kid figures (small capsules)
        for (let i = 0; i < 8; i++) {
          const kid = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.18, 0.6, 4, 5),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55),
              roughness: 0.8,
            })
          );
          // Place randomly around equipment
          const spots = [
            { x: -4, z: 4, y: 2.5 },     // on plat1
            { x: 5, z: 1.5, y: 0.7 },    // at slide bottom
            { x: 5, z: -3, y: 0.7 },     // at merry-go-round
            { x: -4, z: -1, y: 1.2 },    // on see-saw end
            { x: -2, z: -4, y: 1.8 },    // on swing
            { x: -6, z: 2, y: 0.5 },     // in sandbox
            { x: 0, z: 2.5, y: 1.0 },    // on duck springer
            { x: 3, z: 2, y: 1.0 },      // on frog springer
          ];
          const spot = spots[i];
          kid.position.set(position.x + spot.x, spot.y, position.z + spot.z);
          kid.castShadow = true;
          g.add(kid);
        }

        // Parents watching — sit on benches just outside fence
        for (let i = 0; i < 3; i++) {
          const benchG = new THREE.Group();
          const bx = position.x + (i - 1) * 5;
          const bz = position.z - fenceR - 1.5;
          // Bench
          const bench = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.4, 0.7), woodMat
          );
          bench.position.set(bx, 0.45, bz);
          g.add(bench);
          // Parent
          const parent = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.0, 4, 6),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.4, 0.5),
              roughness: 0.85,
            })
          );
          parent.position.set(bx + (Math.random() - 0.5) * 1.2, 0.95, bz);
          parent.castShadow = true;
          g.add(parent);
        }

        return g;
      }

      /* ----------------------------------------------------------------
       *  NYC Parks Dept signs + tennis court + spray park
       * ---------------------------------------------------------------- */
      function buildParkSign(x, y, z, parkName) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        // Two posts
        const postMat = new THREE.MeshStandardMaterial({
          color: 0x1a4a2a, metalness: 0.4, roughness: 0.6,
        });
        [-0.9, 0.9].forEach((dx) => {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.08, 2.4, 5), postMat
          );
          post.position.set(dx, 1.2, 0);
          post.castShadow = true;
          g.add(post);
        });
        // Sign panel (Parks Dept green)
        const tex = signTexture(parkName, "#1a4a2a", "#ffffff", 512, 192);
        const mat = new THREE.MeshStandardMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), mat);
        sign.position.set(0, 1.8, 0);
        g.add(sign);
        // Little acorn icon — gold circle on top
        const acorn = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 5),
          new THREE.MeshStandardMaterial({
            color: 0xfcd84e, emissive: 0xfcd84e, emissiveIntensity: 0.4,
          })
        );
        acorn.position.set(0, 2.5, 0);
        g.add(acorn);
        return g;
      }

      function buildTennisCourt(x, y, z) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        // Surface
        const courtMat = new THREE.MeshStandardMaterial({
          color: 0x2a6cc4, roughness: 0.85,
        });
        const court = new THREE.Mesh(
          new THREE.PlaneGeometry(23, 11), courtMat
        );
        court.rotation.x = -Math.PI / 2;
        court.position.y = 0.04;
        court.receiveShadow = true;
        g.add(court);
        // Inner green court
        const inner = new THREE.Mesh(
          new THREE.PlaneGeometry(18, 9),
          new THREE.MeshStandardMaterial({ color: 0x2aa564, roughness: 0.85 })
        );
        inner.rotation.x = -Math.PI / 2;
        inner.position.y = 0.05;
        g.add(inner);
        // White lines (just a single thin perimeter)
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        const linePerim = new THREE.Mesh(
          new THREE.RingGeometry(8.4, 8.6, 4, 1, 0, Math.PI * 2),
          lineMat
        );
        linePerim.rotation.x = -Math.PI / 2;
        linePerim.position.y = 0.06;
        g.add(linePerim);
        // Center line — thin box across
        const centerLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.01, 9),
          lineMat
        );
        centerLine.position.y = 0.06;
        g.add(centerLine);
        // Net
        const netPostMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5 });
        [-4.5, 4.5].forEach((nz) => {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), netPostMat
          );
          post.position.set(0, 0.6, nz);
          post.castShadow = true;
          g.add(post);
        });
        const net = new THREE.Mesh(
          new THREE.PlaneGeometry(9, 1.0),
          new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, transparent: true, opacity: 0.5,
          })
        );
        net.position.set(0, 0.5, 0);
        net.rotation.y = Math.PI / 2;
        g.add(net);
        // Fence around (chain link feel)
        const fenceMat = new THREE.MeshStandardMaterial({
          color: 0x4a4a4a, metalness: 0.5, roughness: 0.55,
        });
        for (let s = 0; s < 4; s++) {
          const len = s % 2 === 0 ? 23 : 11;
          const numPosts = Math.floor(len / 3);
          for (let p = 0; p <= numPosts; p++) {
            const u = p / numPosts;
            const post = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.06, 3, 5), fenceMat
            );
            const pos = new THREE.Vector3(0, 1.5, 0);
            if (s === 0) { pos.x = -11.5 + u * 23; pos.z = -5.5; }
            else if (s === 1) { pos.x = 11.5; pos.z = -5.5 + u * 11; }
            else if (s === 2) { pos.x = -11.5 + u * 23; pos.z = 5.5; }
            else { pos.x = -11.5; pos.z = -5.5 + u * 11; }
            post.position.copy(pos);
            g.add(post);
          }
        }
        return g;
      }

      /* ----------------------------------------------------------------
       *  Public sculpture for plazas — abstract red cube on a pedestal
       *  with a hole through it (inspired by NYC public art)
       * ---------------------------------------------------------------- */
      function buildPlazaSculpture(x, y, z) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        const pedestal = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.8, 2.2),
          new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.85 })
        );
        pedestal.position.y = 0.4;
        pedestal.castShadow = true;
        g.add(pedestal);
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 1.8, 1.8),
          new THREE.MeshStandardMaterial({
            color: 0xd61d2c, metalness: 0.4, roughness: 0.5,
          })
        );
        cube.position.y = 1.7;
        cube.rotation.set(0.4, 0.7, 0.2);
        cube.castShadow = true;
        g.add(cube);
        return g;
      }

      /* ----------------------------------------------------------------
       *  Sidewalk trees in tree pits along every EW street
       * ---------------------------------------------------------------- */
      function buildSidewalkTrees() {
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        const trunkGeom = new THREE.CylinderGeometry(0.18, 0.25, 4, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
          color: 0x6b4423, roughness: 0.92,
        });
        const leavesGeom = new THREE.IcosahedronGeometry(1.6, 1);
        const leavesMatBase = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        const pitGeom = new THREE.PlaneGeometry(1.4, 1.4);
        const pitMat = new THREE.MeshStandardMaterial({
          color: 0x2c2820, roughness: 0.9,
        });

        // Estimate total tree count
        const treesPerStreet = Math.floor(gridLength / 12);
        const totalMax = ewStreets.length * treesPerStreet * 2;

        const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, totalMax);
        const leavesInst = new THREE.InstancedMesh(leavesGeom, leavesMatBase, totalMax);
        leavesInst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(totalMax * 3), 3
        );
        const pitInst = new THREE.InstancedMesh(pitGeom, pitMat, totalMax);
        trunkInst.castShadow = true;
        leavesInst.castShadow = true;

        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const qPit = new THREE.Quaternion();
        qPit.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        const sV = new THREE.Vector3(1, 1, 1);
        const col = new THREE.Color();
        let ti = 0;

        const intersectionXs = [];
        for (let i = 0; i < 12; i++) {
          const sx = buildingAreaMinX + 100 / 2 + i * 100;
          if (Math.abs(sx) <= gridLength / 2) intersectionXs.push(sx);
        }

        ewStreets.forEach((st) => {
          // sidewalks at offset +/- (streetWidth/2 + 2). Tree pits at sidewalk inner edge
          [-(streetWidth / 2 + 3), (streetWidth / 2 + 3)].forEach((dz) => {
            for (let x = -gridLength / 2 + 8; x < gridLength / 2 - 8; x += 12) {
              // skip near intersections (where hydrants, traffic lights are)
              if (intersectionXs.some((ix) => Math.abs(x - ix) < 7)) continue;
              if (ti >= totalMax) break;
              const tx = x + (Math.random() - 0.5) * 2;
              const tz = st.position.z + dz + (Math.random() - 0.5) * 0.4;
              // Tree pit (dark patch on sidewalk)
              v.set(tx, st.position.y + 0.06, tz);
              m4.compose(v, qPit, sV);
              pitInst.setMatrixAt(ti, m4);
              // Trunk
              v.set(tx, st.position.y + 2.0, tz);
              m4.compose(v, q, sV);
              trunkInst.setMatrixAt(ti, m4);
              // Leaves
              const sc = 0.9 + Math.random() * 0.5;
              const sV2 = new THREE.Vector3(sc, sc * 1.1, sc);
              v.set(tx, st.position.y + 4.5 + 0.6 * sc, tz);
              m4.compose(v, q, sV2);
              leavesInst.setMatrixAt(ti, m4);
              col.setHSL(0.27 + Math.random() * 0.08, 0.45 + Math.random() * 0.25, 0.3 + Math.random() * 0.1);
              leavesInst.setColorAt(ti, col);
              ti++;
            }
          });
        });

        trunkInst.count = ti;
        leavesInst.count = ti;
        pitInst.count = ti;
        trunkInst.instanceMatrix.needsUpdate = true;
        leavesInst.instanceMatrix.needsUpdate = true;
        pitInst.instanceMatrix.needsUpdate = true;
        if (leavesInst.instanceColor) leavesInst.instanceColor.needsUpdate = true;
        scene.add(trunkInst);
        scene.add(leavesInst);
        scene.add(pitInst);
      }

      /* ----------------------------------------------------------------
       *  Midway carnival game booths in the rides plaza
       * ---------------------------------------------------------------- */
      function buildMidwayGames() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const games = [
          { x: -75, z: 20, name: "RING TOSS", color: 0xff3a8a },
          { x: -75, z: 5, name: "BALLOON DART", color: 0x4aff7a },
          { x: -75, z: -10, name: "BASKET SHOOT", color: 0xff8a00 },
          { x: 5, z: -22, name: "MILK BOTTLES", color: 0x4a8ef0 },
          { x: 20, z: -22, name: "WATER GUN", color: 0xaa3aff },
          { x: 80, z: 20, name: "WHACK-A-MOLE", color: 0xff3a3a },
          { x: 80, z: 5, name: "STRENGTH TEST", color: 0xfacc15 },
          { x: 80, z: -10, name: "FROG HOPPER", color: 0x0aff8a },
          { x: -10, z: 20, name: "FORTUNE TELLER", color: 0x6a3a8a },
          { x: 35, z: 20, name: "PHOTO BOOTH", color: 0xff5a3a },
        ];

        games.forEach((g, idx) => {
          const grp = new THREE.Group();
          grp.position.set(g.x, baseY, g.z);

          // Booth body — striped roof
          const W = 5, H = 5, D = 4;
          // Back wall (where prizes hang)
          const back = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, 0.3),
            new THREE.MeshStandardMaterial({ color: 0xc0c4c8, roughness: 0.7 })
          );
          back.position.set(0, H / 2, -D / 2);
          back.castShadow = true;
          grp.add(back);
          // Side walls
          [-W / 2, W / 2].forEach((sx) => {
            const side = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, H, D),
              new THREE.MeshStandardMaterial({ color: 0xeae3d4, roughness: 0.7 })
            );
            side.position.set(sx, H / 2, 0);
            grp.add(side);
          });
          // Counter front
          const counter = new THREE.Mesh(
            new THREE.BoxGeometry(W, 1, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x6a3a8a, roughness: 0.7 })
          );
          counter.position.set(0, 1, D / 2 - 0.3);
          counter.castShadow = true;
          grp.add(counter);

          // Striped roof (pyramidal)
          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(W * 0.7, 1.8, 4),
            new THREE.MeshStandardMaterial({
              color: g.color, roughness: 0.55,
              emissive: g.color, emissiveIntensity: 0.05,
            })
          );
          roof.position.set(0, H + 0.9, 0);
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          grp.add(roof);

          // Stripes — alternating panels on roof can't be easily, so add ribbon below roof
          const ribbon = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.4, 0.4, D + 0.4),
            new THREE.MeshStandardMaterial({
              color: 0xfff0a0, emissive: 0xfff0a0, emissiveIntensity: 0.15,
            })
          );
          ribbon.position.set(0, H, 0);
          grp.add(ribbon);

          // Signage
          const sg = signTexture(g.name, "#" + g.color.toString(16).padStart(6, "0"), "#ffffff", 1024, 128);
          const sgM = new THREE.MeshStandardMaterial({
            map: sg, emissive: 0xffffff, emissiveMap: sg, emissiveIntensity: 0.6,
          });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, 0.9), sgM);
          sign.position.set(0, H - 0.5, D / 2 + 0.05);
          grp.add(sign);

          // Stuffed animal prize wall — random colored spheres in a grid
          const animalColors = [0xff3a8a, 0xfcd84e, 0x4aff7a, 0x4a8ef0, 0xff8a00, 0xaa3aff];
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 5; c++) {
              const animal = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 6, 5),
                new THREE.MeshStandardMaterial({
                  color: animalColors[(r * 5 + c) % animalColors.length],
                  roughness: 0.75,
                })
              );
              animal.position.set(
                -W / 2 + 0.7 + c * 0.9,
                H - 1.2 - r * 0.8,
                -D / 2 + 0.5
              );
              animal.scale.set(1, 1.2, 1);
              grp.add(animal);
            }
          }

          // Game-specific props (just hints)
          if (g.name.includes("BOTTLE")) {
            // Stack of bottles
            const bottleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
            for (let i = 0; i < 6; i++) {
              const b = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.22, 0.5, 6), bottleMat
              );
              b.position.set(
                -1 + (i % 3) * 1, 0.25 + Math.floor(i / 3) * 0.6,
                -0.5
              );
              grp.add(b);
            }
          } else if (g.name.includes("BASKET")) {
            // Hoops
            const hoop = new THREE.Mesh(
              new THREE.TorusGeometry(0.5, 0.06, 6, 12),
              new THREE.MeshStandardMaterial({ color: 0xff5a1f })
            );
            hoop.rotation.x = Math.PI / 2;
            hoop.position.set(0, 3, -1);
            grp.add(hoop);
          }

          // Vendor behind counter
          const vendorColors = [0x2a2a2a, 0x6a3a6a, 0x3a6a4a, 0xaa3a3a];
          const vendor = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: vendorColors[idx % vendorColors.length], roughness: 0.85,
            })
          );
          vendor.position.set(0, 1.8, -1);
          vendor.castShadow = true;
          grp.add(vendor);

          // Customer in front
          if (Math.random() > 0.4) {
            const cust = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
              new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5),
                roughness: 0.85,
              })
            );
            cust.position.set((Math.random() - 0.5) * 2, 1.5, D / 2 + 0.5);
            cust.castShadow = true;
            grp.add(cust);
          }

          // Bulb chains around the sign
          makeBulbsAlongLine(
            new THREE.Vector3(-W / 2 + 0.2, H, D / 2 + 0.1),
            new THREE.Vector3(W / 2 - 0.2, H, D / 2 + 0.1),
            16, 0xffe2a0, grp
          );

          scene.add(grp);
        });
      }

      /* ----------------------------------------------------------------
       *  Welcome to Coney Island arch + string lights overhead
       * ---------------------------------------------------------------- */
      function buildWelcomeArchAndLights() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;

        // Big arch over the entry to the rides area from the boardwalk
        const archG = new THREE.Group();
        archG.position.set(0, baseY, 30);

        const towerMat = new THREE.MeshStandardMaterial({
          color: 0xd61d2c, metalness: 0.4, roughness: 0.55,
        });
        // Twin towers
        [-12, 12].forEach((dx) => {
          const tower = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 12, 2.5), towerMat
          );
          tower.position.set(dx, 6, 0);
          tower.castShadow = true;
          archG.add(tower);
          // Decorative cap
          const cap = new THREE.Mesh(
            new THREE.SphereGeometry(1.4, 12, 8),
            new THREE.MeshStandardMaterial({
              color: 0xfcd84e, metalness: 0.5, roughness: 0.4,
              emissive: 0xfcd84e, emissiveIntensity: 0.15,
            })
          );
          cap.position.set(dx, 13, 0);
          archG.add(cap);
        });
        // Arch span
        const archShape = new THREE.Shape();
        archShape.moveTo(-13, 0);
        archShape.lineTo(-13, 1);
        archShape.bezierCurveTo(-13, 4, 13, 4, 13, 1);
        archShape.lineTo(13, 0);
        archShape.bezierCurveTo(13, 3, -13, 3, -13, 0);
        const archGeom = new THREE.ExtrudeGeometry(archShape, {
          depth: 1.5, bevelEnabled: false,
        });
        const arch = new THREE.Mesh(archGeom, towerMat);
        arch.position.set(0, 11.5, -0.75);
        arch.castShadow = true;
        archG.add(arch);

        // "WELCOME TO CONEY ISLAND" big sign
        const wTex = signTexture("WELCOME TO CONEY ISLAND", "#d61d2c", "#fcd84e", 2048, 256);
        const wMat = new THREE.MeshStandardMaterial({
          map: wTex, emissive: 0xffffff, emissiveMap: wTex, emissiveIntensity: 0.55,
        });
        const wSign = new THREE.Mesh(new THREE.PlaneGeometry(24, 3), wMat);
        wSign.position.set(0, 13.2, 0.85);
        archG.add(wSign);
        // Back side
        const wSign2 = wSign.clone();
        wSign2.position.set(0, 13.2, -0.85);
        wSign2.rotation.y = Math.PI;
        archG.add(wSign2);

        // Bulbs around the arch
        makeBulbsAlongLine(
          new THREE.Vector3(-13, 14.8, 0),
          new THREE.Vector3(13, 14.8, 0),
          40, 0xffe2a0, archG
        );
        makeBulbsAlongLine(
          new THREE.Vector3(-13, 11.5, 0),
          new THREE.Vector3(13, 11.5, 0),
          40, 0xffe2a0, archG
        );

        scene.add(archG);

        // String lights criss-crossing the rides plaza overhead
        // 8 strands at different angles between Wonder Wheel area and Cyclone area
        const strandConfigs = [
          { from: [-55, 12, 25], to: [35, 14, -5] },
          { from: [35, 14, -5], to: [80, 12, -15] },
          { from: [-55, 12, 25], to: [-20, 11, 30] },
          { from: [-20, 11, 30], to: [35, 14, -5] },
          { from: [-55, 12, 25], to: [50, 12, -30] },
          { from: [50, 12, -30], to: [80, 12, -15] },
          { from: [-22, 11, -18], to: [18, 12, -28] },
          { from: [18, 12, -28], to: [50, 12, -30] },
        ];
        strandConfigs.forEach((cfg) => {
          const from = new THREE.Vector3(...cfg.from);
          const to = new THREE.Vector3(...cfg.to);
          const len = from.distanceTo(to);
          const numBulbs = Math.floor(len / 1.2);
          // Cord (sagging slightly — for simplicity, straight cylinder)
          const cord = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, len, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
          cord.position.copy(mid);
          const dir = new THREE.Vector3().subVectors(to, from).normalize();
          const up = new THREE.Vector3(0, 1, 0);
          cord.quaternion.setFromUnitVectors(up, dir);
          scene.add(cord);
          // Bulbs along the strand
          makeBulbsAlongLine(from, to, numBulbs, 0xffe2a0, scene);
        });
      }

      /* ----------------------------------------------------------------
       *  Beach activity — towels, umbrellas, volleyball net, sandcastles
       * ---------------------------------------------------------------- */
      function buildBeachActivity() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const sandCenterZ = 62.5;
        const W = groundSize * 0.95;
        const beachW = W * 0.8;

        // Beach umbrellas (instanced)
        const numUmbrellas = 14;
        const umbrellaColors = [0xff3a3a, 0x4a8ef0, 0xfcd84e, 0x4aff7a, 0xff8a00, 0xaa3aff];
        for (let i = 0; i < numUmbrellas; i++) {
          const ux = (Math.random() - 0.5) * beachW;
          const uz = sandCenterZ + (Math.random() - 0.5) * 28;
          const col = umbrellaColors[i % umbrellaColors.length];
          // Pole
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          pole.position.set(ux, baseY + 1.1, uz);
          scene.add(pole);
          // Umbrella canopy (cone)
          const canopy = new THREE.Mesh(
            new THREE.ConeGeometry(1.4, 0.45, 8),
            new THREE.MeshStandardMaterial({
              color: col, roughness: 0.55,
              side: THREE.DoubleSide,
            })
          );
          canopy.position.set(ux, baseY + 2.4, uz);
          canopy.castShadow = true;
          scene.add(canopy);
          // Towel below
          const towel = new THREE.Mesh(
            new THREE.PlaneGeometry(1.8, 0.9),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55),
              roughness: 0.7,
            })
          );
          towel.rotation.x = -Math.PI / 2;
          towel.position.set(ux + 0.5, baseY + 0.07, uz);
          towel.rotation.z = Math.random() * Math.PI * 2;
          scene.add(towel);
          // Sunbather on towel (laying flat capsule)
          if (Math.random() > 0.3) {
            const sun = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.22, 1.2, 4, 5),
              new THREE.MeshStandardMaterial({
                color: 0xf2cbb0, roughness: 0.85,
              })
            );
            sun.position.set(ux + 0.5, baseY + 0.3, uz);
            sun.rotation.z = Math.PI / 2;
            scene.add(sun);
          }
        }

        // Loose towels (no umbrella)
        for (let i = 0; i < 12; i++) {
          const tx = (Math.random() - 0.5) * beachW;
          const tz = sandCenterZ + (Math.random() - 0.5) * 30;
          const towel = new THREE.Mesh(
            new THREE.PlaneGeometry(1.8, 0.9),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5),
              roughness: 0.7,
            })
          );
          towel.rotation.x = -Math.PI / 2;
          towel.position.set(tx, baseY + 0.07, tz);
          towel.rotation.z = Math.random() * Math.PI * 2;
          scene.add(towel);
          // Sometimes a sitter
          if (Math.random() > 0.5) {
            const sitter = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.28, 0.7, 4, 5),
              new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.55, 0.55),
                roughness: 0.85,
              })
            );
            sitter.position.set(tx, baseY + 0.55, tz);
            scene.add(sitter);
          }
        }

        // Volleyball court (2 nets)
        const netPositions = [{ x: -180, z: 60 }, { x: 200, z: 60 }];
        netPositions.forEach((p) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);
          // Posts
          [-4, 4].forEach((dx) => {
            const post = new THREE.Mesh(
              new THREE.CylinderGeometry(0.08, 0.08, 3, 6),
              new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5 })
            );
            post.position.set(dx, 1.5, 0);
            post.castShadow = true;
            g.add(post);
          });
          // Net (translucent dark mesh-like)
          const net = new THREE.Mesh(
            new THREE.PlaneGeometry(8, 1.2),
            new THREE.MeshStandardMaterial({
              color: 0x1a1a1a, transparent: true, opacity: 0.4,
            })
          );
          net.position.set(0, 2.0, 0);
          g.add(net);
          // White top band
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(8, 0.1, 0.05),
            new THREE.MeshStandardMaterial({ color: 0xffffff })
          );
          band.position.set(0, 2.6, 0);
          g.add(band);
          // 4 players around net
          for (let i = 0; i < 4; i++) {
            const player = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 1.3, 4, 6),
              new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.5, 0.5),
                roughness: 0.85,
              })
            );
            player.position.set((i - 1.5) * 2, 0.95, (i % 2 === 0 ? -3 : 3));
            player.castShadow = true;
            g.add(player);
          }
          // Ball
          const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 6),
            new THREE.MeshStandardMaterial({
              color: 0xffffff, roughness: 0.6,
            })
          );
          ball.position.set(0, 3.5, 0);
          g.add(ball);
          scene.add(g);
        });

        // Sandcastles — small cone+box piles
        for (let i = 0; i < 8; i++) {
          const sx = (Math.random() - 0.5) * beachW;
          const sz = sandCenterZ + (Math.random() - 0.5) * 26;
          const castleMat = new THREE.MeshStandardMaterial({
            color: 0xeac88f, roughness: 0.92,
          });
          // Central tower
          const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.4, 0.7, 8), castleMat
          );
          tower.position.set(sx, baseY + 0.35, sz);
          tower.castShadow = true;
          scene.add(tower);
          // Cone top
          const top = new THREE.Mesh(
            new THREE.ConeGeometry(0.32, 0.4, 8), castleMat
          );
          top.position.set(sx, baseY + 0.9, sz);
          scene.add(top);
          // Walls — 4 cubes around
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2;
            const w = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.4, 0.3), castleMat
            );
            w.position.set(sx + Math.cos(a) * 0.7, baseY + 0.2, sz + Math.sin(a) * 0.7);
            scene.add(w);
          }
        }

        // Beach bags / coolers
        for (let i = 0; i < 14; i++) {
          const bx = (Math.random() - 0.5) * beachW;
          const bz = sandCenterZ + (Math.random() - 0.5) * 26;
          const bagColors = [0xc41e3a, 0x1a3a6a, 0x2a8a4a, 0xfcd84e];
          const bag = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.4, 0.4),
            new THREE.MeshStandardMaterial({
              color: bagColors[i % bagColors.length], roughness: 0.7,
            })
          );
          bag.position.set(bx, baseY + 0.2, bz);
          bag.castShadow = true;
          scene.add(bag);
        }

        // Kids building castle (1-2 small capsules near castles)
        for (let i = 0; i < 4; i++) {
          const kx = (Math.random() - 0.5) * beachW;
          const kz = sandCenterZ + (Math.random() - 0.5) * 26;
          const kid = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.16, 0.5, 4, 5),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55),
              roughness: 0.85,
            })
          );
          kid.position.set(kx, baseY + 0.45, kz);
          kid.castShadow = true;
          scene.add(kid);
        }
      }

      /* ----------------------------------------------------------------
       *  Manhattan silhouette far to the north
       * ---------------------------------------------------------------- */
      function buildManhattanSilhouette() {
        // Place far north, far enough to read as horizon
        const baseY = groundMesh.position.y + terrainAmp;
        const cz = -1800;
        const g = new THREE.Group();
        const silMat = new THREE.MeshStandardMaterial({
          color: 0x8a98a8, roughness: 0.95, metalness: 0.05,
        });
        // 40 buildings of varying heights spread along x
        const spread = 1400;
        for (let i = 0; i < 60; i++) {
          const x = -spread / 2 + (i / 59) * spread + (Math.random() - 0.5) * 20;
          // Manhattan profile: taller in middle (midtown), shorter at edges
          const centerness = 1 - Math.abs(x) / (spread / 2);
          const baseH = 60 + Math.pow(centerness, 1.5) * 180;
          const h = baseH + (Math.random() - 0.5) * 60;
          const w = 20 + Math.random() * 30;
          const d = 15 + Math.random() * 25;
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d), silMat
          );
          b.position.set(x, baseY + h / 2, cz + (Math.random() - 0.5) * 40);
          g.add(b);
          // Occasionally a taller spire on top
          if (centerness > 0.6 && Math.random() < 0.3) {
            const spire = new THREE.Mesh(
              new THREE.ConeGeometry(2, 30 + Math.random() * 30, 6), silMat
            );
            spire.position.set(x, baseY + h + 15, cz);
            g.add(spire);
          }
        }
        scene.add(g);
      }

      /* ----------------------------------------------------------------
       *  NYC street name signs + stop signs at intersections
       * ---------------------------------------------------------------- */
      function buildStreetSigns() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        const intersectionXs = [];
        for (let i = 0; i < 12; i++) {
          const sx = buildingAreaMinX + 100 / 2 + i * 100;
          if (Math.abs(sx) <= gridLength / 2) intersectionXs.push(sx);
        }

        const surfStreetNames = [
          "SURF AVE", "MERMAID AVE", "NEPTUNE AVE", "BRIGHTON BCH AVE",
          "OCEAN PKWY", "STILLWELL AVE", "W 8 ST", "W 12 ST", "W 15 ST",
          "W 17 ST", "W 21 ST", "W 23 ST",
        ];
        const ewStreetNames = [
          "SURF AVE", "MERMAID AVE", "NEPTUNE AVE", "BRIGHTON BCH AVE",
          "OCEAN PKWY", "SHELL ROAD", "AVE Z", "AVE Y",
        ];

        ewStreets.forEach((st, stIdx) => {
          intersectionXs.forEach((ix, ixIdx) => {
            if (Math.hypot(ix, st.position.z - 15) > 500) return;
            const g = new THREE.Group();
            g.position.set(ix - streetWidth / 2 - 1.5, st.position.y, st.position.z - streetWidth / 2 - 1.5);

            // Pole
            const pole = new THREE.Mesh(
              new THREE.CylinderGeometry(0.1, 0.12, 5, 5),
              new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 })
            );
            pole.position.y = 2.5;
            pole.castShadow = true;
            g.add(pole);

            // EW street sign (parallel to street direction = X)
            const ewTex = signTexture(ewStreetNames[stIdx % ewStreetNames.length], "#1a4a2a", "#ffffff", 512, 96);
            const ewMat = new THREE.MeshStandardMaterial({
              map: ewTex, emissive: 0xffffff, emissiveMap: ewTex, emissiveIntensity: 0.4,
            });
            const ewSign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.5), ewMat);
            ewSign.position.set(0, 4.3, 0);
            g.add(ewSign);

            // NS street sign (perpendicular)
            const nsTex = signTexture(surfStreetNames[ixIdx % surfStreetNames.length], "#1a4a2a", "#ffffff", 512, 96);
            const nsMat = new THREE.MeshStandardMaterial({
              map: nsTex, emissive: 0xffffff, emissiveMap: nsTex, emissiveIntensity: 0.4,
            });
            const nsSign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.5), nsMat);
            nsSign.position.set(0, 4.7, 0);
            nsSign.rotation.y = Math.PI / 2;
            g.add(nsSign);

            // Stop sign on same pole (lower)
            const stopTex = signTexture("STOP", "#c41e3a", "#ffffff", 256, 256);
            const stopMat = new THREE.MeshStandardMaterial({
              map: stopTex, emissive: 0xffffff, emissiveMap: stopTex, emissiveIntensity: 0.4,
              side: THREE.DoubleSide,
            });
            // Octagonal-ish stop sign
            const stop = new THREE.Mesh(
              new THREE.CircleGeometry(0.5, 8), stopMat
            );
            stop.position.set(0, 3.0, 0.06);
            stop.rotation.y = -Math.PI / 8;
            g.add(stop);

            // "No Parking" white sign on opposite side
            const npTex = signTexture("NO PARKING", "#ffffff", "#c41e3a", 256, 128);
            const npMat = new THREE.MeshStandardMaterial({
              map: npTex, side: THREE.DoubleSide,
            });
            const np = new THREE.Mesh(
              new THREE.PlaneGeometry(0.7, 0.45), npMat
            );
            np.position.set(0, 2.3, -0.06);
            np.rotation.y = Math.PI;
            g.add(np);

            scene.add(g);
          });
        });
      }

      /* ----------------------------------------------------------------
       *  LinkNYC kiosks (tall digital displays at corners)
       * ---------------------------------------------------------------- */
      function buildLinkNYC() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const positions = [
          { x: -110, z: -45 },
          { x: 100, z: -45 },
          { x: -210, z: -100 },
          { x: 220, z: -100 },
          { x: -60, z: -160 },
          { x: 80, z: -160 },
        ];
        positions.forEach((p) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);
          // Slim tall column
          const col = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 9, 0.8),
            new THREE.MeshStandardMaterial({
              color: 0x1a1a1a, metalness: 0.4, roughness: 0.4,
            })
          );
          col.position.y = 4.5;
          col.castShadow = true;
          g.add(col);
          // Screen (front + back) — emissive
          [0.31, -0.31].forEach((dz, idx) => {
            const screenColors = [0x4a8ef0, 0xff3a8a, 0xfcd84e, 0x4aff7a];
            const sc = screenColors[Math.floor(Math.random() * screenColors.length)];
            const screen = new THREE.Mesh(
              new THREE.PlaneGeometry(0.46, 4),
              new THREE.MeshStandardMaterial({
                color: sc, emissive: sc, emissiveIntensity: 0.9,
                roughness: 0.3,
              })
            );
            screen.position.set(0, 6.5, dz);
            if (idx === 1) screen.rotation.y = Math.PI;
            g.add(screen);
            bulbMeshes.push(screen);
          });
          // Top antenna
          const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          antenna.position.y = 9.7;
          g.add(antenna);
          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Boats and ferries on the ocean
       * ---------------------------------------------------------------- */
      function buildBoatsOnOcean() {
        const baseY = groundMesh.position.y + terrainAmp;
        // Large ferries / boats far out, small boats closer
        const boats = [
          { x: -800, z: 600, size: "ferry", color: 0xffffff },
          { x: 600, z: 800, size: "ferry", color: 0xeaeaea },
          { x: -300, z: 350, size: "boat", color: 0x6a3a8a },
          { x: 200, z: 380, size: "boat", color: 0xc41e3a },
          { x: -100, z: 280, size: "boat", color: 0xffffff },
          { x: 350, z: 240, size: "boat", color: 0x4a8ef0 },
          { x: -550, z: 1000, size: "freighter", color: 0xc8b890 },
          { x: 900, z: 1200, size: "freighter", color: 0x8a8a86 },
        ];
        boats.forEach((b) => {
          const g = new THREE.Group();
          const yWater = baseY + 1.2;
          g.position.set(b.x, yWater, b.z);
          const mat = new THREE.MeshStandardMaterial({
            color: b.color, roughness: 0.55, metalness: 0.15,
          });
          if (b.size === "ferry") {
            const hull = new THREE.Mesh(new THREE.BoxGeometry(28, 4, 8), mat);
            hull.position.y = 2;
            hull.castShadow = true;
            g.add(hull);
            // Decks
            const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 3, 7), mat);
            deck.position.y = 5;
            g.add(deck);
            const top = new THREE.Mesh(new THREE.BoxGeometry(8, 2.5, 5), mat);
            top.position.y = 7.5;
            g.add(top);
            // Stack
            const stack = new THREE.Mesh(
              new THREE.CylinderGeometry(0.8, 1, 3, 8),
              new THREE.MeshStandardMaterial({ color: 0xc41e3a, roughness: 0.5 })
            );
            stack.position.set(2, 9, 0);
            g.add(stack);
          } else if (b.size === "freighter") {
            const hull = new THREE.Mesh(new THREE.BoxGeometry(50, 6, 12), mat);
            hull.position.y = 3;
            hull.castShadow = true;
            g.add(hull);
            // Containers on top — random colored stack
            const containerColors = [0xc41e3a, 0x1a3a6a, 0x2a8a4a, 0xfcd84e, 0xff8a00];
            for (let i = 0; i < 24; i++) {
              const ct = new THREE.Mesh(
                new THREE.BoxGeometry(4, 2, 4),
                new THREE.MeshStandardMaterial({
                  color: containerColors[i % containerColors.length], roughness: 0.6,
                })
              );
              ct.position.set(
                -20 + (i % 8) * 5,
                7 + Math.floor(i / 16) * 2.2,
                ((Math.floor(i / 8) % 2) - 0.5) * 5
              );
              g.add(ct);
            }
            // Bridge tower
            const bridge = new THREE.Mesh(
              new THREE.BoxGeometry(6, 8, 8), mat
            );
            bridge.position.set(22, 8, 0);
            g.add(bridge);
          } else {
            // Small boat
            const hull = new THREE.Mesh(
              new THREE.BoxGeometry(6, 1.5, 2.5), mat
            );
            hull.position.y = 0.7;
            g.add(hull);
            const cabin = new THREE.Mesh(
              new THREE.BoxGeometry(2.5, 1.5, 2),
              new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
            );
            cabin.position.set(0, 2, 0);
            g.add(cabin);
          }
          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  DSNY Sanitation truck on a near-zone street
       * ---------------------------------------------------------------- */
      function buildDSNYTruck() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const g = new THREE.Group();
        g.position.set(-95, baseY + 0.95, -70);
        const whiteMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.55, metalness: 0.1,
        });
        const darkMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, roughness: 0.65,
        });
        // Cab
        const cab = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 2.6, 2.3), whiteMat
        );
        cab.position.y = 1.3;
        cab.castShadow = true;
        g.add(cab);
        // Body (large garbage compactor)
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(6, 3.0, 2.5), whiteMat
        );
        body.position.set(-4.2, 1.5, 0);
        body.castShadow = true;
        g.add(body);
        // Black stripe across body
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(6.05, 0.5, 2.55), darkMat
        );
        stripe.position.set(-4.2, 2.7, 0);
        g.add(stripe);
        // DSNY sign on cab door
        const dsnyTex = signTexture("NYC DSNY", "#ffffff", "#1a4a8a", 512, 128);
        const dsnyMat = new THREE.MeshStandardMaterial({ map: dsnyTex });
        const dsny = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4), dsnyMat);
        dsny.position.set(0.5, 1.5, 1.16);
        g.add(dsny);
        // Wheels
        const wMat = new THREE.MeshStandardMaterial({ color: 0x111418 });
        const wGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10);
        [[1.0, -0.95, 1.15], [1.0, -0.95, -1.15],
         [-3.5, -0.95, 1.15], [-3.5, -0.95, -1.15],
         [-5.5, -0.95, 1.15], [-5.5, -0.95, -1.15]].forEach(([wx, wy, wz]) => {
          const w = new THREE.Mesh(wGeom, wMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, wy, wz);
          g.add(w);
        });
        // Trash hopper at back
        const hopper = new THREE.Mesh(
          new THREE.BoxGeometry(2, 2, 2.4), darkMat
        );
        hopper.position.set(-8, 0.5, 0);
        g.add(hopper);
        // Roof beacon (yellow)
        const beacon = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.2, 1.2),
          new THREE.MeshStandardMaterial({
            color: 0xfcd84e, emissive: 0xfcd84e, emissiveIntensity: 1.0,
          })
        );
        beacon.position.set(0, 2.7, 0);
        g.add(beacon);
        bulbMeshes.push(beacon);
        scene.add(g);
      }

      /* ----------------------------------------------------------------
       *  Dense boardwalk crowd — many static walking figures along
       *  the entire length of the boardwalk to sell "Coney on a Saturday"
       * ---------------------------------------------------------------- */
      function buildDenseBoardwalkCrowd() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const bwCenterZ = 38;
        const W = groundSize * 0.95;

        // Use a single InstancedMesh for performance
        const count = 220;
        const personGeom = new THREE.CapsuleGeometry(0.3, 1.2, 4, 6);
        const personMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        const inst = new THREE.InstancedMesh(personGeom, personMat, count);
        inst.castShadow = true;
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(count * 3), 3
        );
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sV = new THREE.Vector3(1, 1, 1);
        const col = new THREE.Color();

        for (let i = 0; i < count; i++) {
          // Cluster more densely near rides center
          const x = -W / 2 + Math.random() * W;
          const distFromRides = Math.abs(x);
          // Rejection sampling — denser near center
          if (distFromRides > 100 && Math.random() < distFromRides / 600) continue;
          const z = bwCenterZ + (Math.random() - 0.5) * 10;
          // Random rotation (walking direction)
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
          v.set(x, baseY + 0.9, z);
          m4.compose(v, q, sV);
          inst.setMatrixAt(i, m4);
          col.setHSL(Math.random(), 0.55, 0.5);
          inst.setColorAt(i, col);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        scene.add(inst);
      }

      /* ----------------------------------------------------------------
       *  Building side-wall billboards — huge painted ads on tall buildings
       * ---------------------------------------------------------------- */
      function buildBuildingBillboards(apartments) {
        if (!apartments || apartments.length === 0) return;
        // Only the closest tall buildings (camera at z=130)
        const sorted = apartments
          .filter((a) => a.h > 35)
          .map((a) => ({ ...a, _dist: Math.hypot(a.x, a.z + 80) }))
          .sort((x, y) => x._dist - y._dist)
          .slice(0, 24);

        const ads = [
          { lines: ["EAT AT", "NATHAN'S"], bg: "#fcd84e", fg: "#0a6a3a" },
          { lines: ["DRINK", "COCA-COLA"], bg: "#c41e3a", fg: "#ffffff" },
          { lines: ["MTA", "METROCARD"], bg: "#fbbf24", fg: "#0a2266" },
          { lines: ["RIDE THE", "CYCLONE"], bg: "#1f4e9c", fg: "#fcd84e" },
          { lines: ["BROOKLYN", "BREWERY"], bg: "#0a3a1a", fg: "#c8a060" },
          { lines: ["YANKEES", "WORLD SERIES"], bg: "#0a2266", fg: "#ffffff" },
          { lines: ["BROOKLYN", "NETS"], bg: "#111418", fg: "#ffffff" },
          { lines: ["VERIZON", "5G NYC"], bg: "#c41e3a", fg: "#ffffff" },
          { lines: ["PEPSI", "GENERATION"], bg: "#1a3a8a", fg: "#ffffff" },
          { lines: ["TRY OUR", "SLICE!"], bg: "#fcd84e", fg: "#c41e3a" },
          { lines: ["BUDWEISER", "KING OF BEERS"], bg: "#c41e3a", fg: "#ffffff" },
          { lines: ["NEW YORK", "POST"], bg: "#1a1a1a", fg: "#fcd84e" },
        ];

        sorted.forEach((b, idx) => {
          const ad = ads[idx % ads.length];
          // Big painted ad on one tall side wall (east or west)
          const side = idx % 2 === 0 ? 1 : -1;
          const tex = multiLineSignTex(ad.lines, ad.bg, ad.fg, 1024, 1024);
          const mat = new THREE.MeshStandardMaterial({
            map: tex, emissive: 0xffffff, emissiveMap: tex,
            emissiveIntensity: 0.18, roughness: 0.85,
          });
          // Plane sized to fit on building side
          const billW = Math.min(b.d - 1, 16);
          const billH = Math.min(b.h - 4, 22);
          const billboard = new THREE.Mesh(
            new THREE.PlaneGeometry(billW, billH), mat
          );
          billboard.position.set(
            b.x + side * (b.w / 2 + 0.05),
            b.y - b.h / 2 + b.h * 0.55,
            b.z
          );
          billboard.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          billboard.castShadow = false;
          buildingGroup.add(billboard);
        });
      }

      /* ----------------------------------------------------------------
       *  Rooftop ad billboards — giant vintage Coney advertising
       * ---------------------------------------------------------------- */
      function buildRooftopAds(apartments) {
        if (!apartments || apartments.length === 0) return;
        const sorted = apartments
          .filter((a) => a.h > 45)
          .map((a) => ({ ...a, _dist: Math.hypot(a.x, a.z + 60) }))
          .sort((x, y) => x._dist - y._dist)
          .slice(0, 14);

        const ads = [
          { text: "CONEY ISLAND", bg: "#c41e3a", fg: "#fcd84e", w: 30, h: 8 },
          { text: "STEEPLECHASE PARK", bg: "#1a4a8a", fg: "#ffffff", w: 30, h: 7 },
          { text: "CYCLONE • SINCE 1927", bg: "#fcd84e", fg: "#c41e3a", w: 30, h: 7 },
          { text: "EAT AT NATHAN'S", bg: "#0a6a3a", fg: "#fcd84e", w: 30, h: 8 },
          { text: "WONDER WHEEL", bg: "#d61d2c", fg: "#ffffff", w: 30, h: 8 },
          { text: "BROOKLYN BORN", bg: "#fcd84e", fg: "#1a1a1a", w: 30, h: 7 },
          { text: "VISIT BRIGHTON BEACH", bg: "#1f4e9c", fg: "#ffffff", w: 30, h: 7 },
          { text: "LUNA PARK", bg: "#3a8aff", fg: "#fcd84e", w: 30, h: 8 },
          { text: "MERMAID PARADE", bg: "#0aa8c4", fg: "#ffffff", w: 30, h: 7 },
          { text: "FREAK SHOW LIVE", bg: "#aa3aff", fg: "#fcd84e", w: 30, h: 7 },
          { text: "HOT DOG EATING CHAMPS", bg: "#fcd84e", fg: "#0a6a3a", w: 30, h: 7 },
          { text: "DREAMLAND", bg: "#c41e3a", fg: "#fcd84e", w: 30, h: 7 },
        ];

        sorted.forEach((b, idx) => {
          const ad = ads[idx % ads.length];
          const roofY = b.y + b.h / 2;
          // Frame the billboard with support struts
          const supportMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a, metalness: 0.6, roughness: 0.5,
          });
          // Vertical posts
          [-ad.w / 2 + 1, ad.w / 2 - 1].forEach((dx) => {
            const post = new THREE.Mesh(
              new THREE.BoxGeometry(0.4, ad.h + 2, 0.4), supportMat
            );
            post.position.set(b.x + dx, roofY + (ad.h + 2) / 2, b.z);
            post.castShadow = true;
            buildingGroup.add(post);
          });
          // Cross beam at bottom (above roof)
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry(ad.w, 0.3, 0.3), supportMat
          );
          beam.position.set(b.x, roofY + 1, b.z);
          buildingGroup.add(beam);
          // The actual ad — double-sided
          const tex = signTexture(ad.text, ad.bg, ad.fg, 2048, 512);
          const mat = new THREE.MeshStandardMaterial({
            map: tex, emissive: 0xffffff, emissiveMap: tex,
            emissiveIntensity: 0.3, roughness: 0.8,
            side: THREE.DoubleSide,
          });
          const billboard = new THREE.Mesh(
            new THREE.PlaneGeometry(ad.w, ad.h), mat
          );
          billboard.position.set(b.x, roofY + ad.h / 2 + 1.5, b.z);
          buildingGroup.add(billboard);
          // Spotlights on a horizontal bar in front pointing up at billboard
          const spotBar = new THREE.Mesh(
            new THREE.BoxGeometry(ad.w * 0.9, 0.2, 0.2), supportMat
          );
          spotBar.position.set(b.x, roofY + 1.4, b.z + 1.2);
          buildingGroup.add(spotBar);
          for (let i = 0; i < 4; i++) {
            const spot = new THREE.Mesh(
              new THREE.CylinderGeometry(0.25, 0.18, 0.4, 6),
              new THREE.MeshStandardMaterial({
                color: 0xffffe0, emissive: 0xffffe0, emissiveIntensity: 0.6,
              })
            );
            spot.position.set(
              b.x - ad.w / 2 + 3 + i * (ad.w - 6) / 3,
              roofY + 1.5, b.z + 1.2
            );
            spot.rotation.x = -Math.PI / 3;
            buildingGroup.add(spot);
            bulbMeshes.push(spot);
          }
        });
      }

      /* ----------------------------------------------------------------
       *  Active construction site — tower crane + scaffold + dumpster +
       *  porta-potty + plywood fence
       * ---------------------------------------------------------------- */
      function buildConstructionSite() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const g = new THREE.Group();
        const cx = -200, cz = -50;
        g.position.set(cx, baseY, cz);

        const W = 36, D = 28;

        // Plywood fence around perimeter
        const plyMat = new THREE.MeshStandardMaterial({
          color: 0x8b6a4a, roughness: 0.85,
        });
        const fenceSides = [
          { len: W, dx: 0, dz: -D / 2, rotY: 0 },
          { len: W, dx: 0, dz: D / 2, rotY: 0 },
          { len: D, dx: -W / 2, dz: 0, rotY: Math.PI / 2 },
          { len: D, dx: W / 2, dz: 0, rotY: Math.PI / 2 },
        ];
        fenceSides.forEach((f) => {
          const wall = new THREE.Mesh(
            new THREE.BoxGeometry(f.len, 2.4, 0.2), plyMat
          );
          wall.position.set(f.dx, 1.2, f.dz);
          wall.rotation.y = f.rotY;
          wall.castShadow = true;
          g.add(wall);
        });

        // Tower crane — tall central column + horizontal jib + counter-jib
        const craneMat = new THREE.MeshStandardMaterial({
          color: 0xfcd84e, metalness: 0.4, roughness: 0.5,
        });
        const craneH = 70;
        // Tower (lattice represented by single tall box)
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(2, craneH, 2), craneMat
        );
        tower.position.set(-5, craneH / 2, -3);
        tower.castShadow = true;
        g.add(tower);
        // Lattice X-braces (a few visible diagonals)
        for (let i = 0; i < 10; i++) {
          const dy = i * (craneH / 10) + 3;
          const xb = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.15, 0.15), craneMat
          );
          xb.position.set(-5, dy, -2);
          xb.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.7;
          g.add(xb);
        }
        // Top operator cabin
        const cab = new THREE.Mesh(
          new THREE.BoxGeometry(3, 2, 2.5),
          new THREE.MeshStandardMaterial({ color: 0x6a3a3a, roughness: 0.6 })
        );
        cab.position.set(-5, craneH + 1, -3);
        cab.castShadow = true;
        g.add(cab);
        // Horizontal jib (long arm)
        const jib = new THREE.Mesh(
          new THREE.BoxGeometry(40, 1.2, 0.8), craneMat
        );
        jib.position.set(8, craneH + 2.5, -3);
        jib.castShadow = true;
        g.add(jib);
        // Counter-jib (shorter, opposite side)
        const cJib = new THREE.Mesh(
          new THREE.BoxGeometry(12, 1.0, 0.8), craneMat
        );
        cJib.position.set(-13, craneH + 2.5, -3);
        cJib.castShadow = true;
        g.add(cJib);
        // Top mast (small spire)
        const mast = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 4, 0.4),
          new THREE.MeshStandardMaterial({ color: 0xc41e3a })
        );
        mast.position.set(-5, craneH + 5, -3);
        g.add(mast);
        // Warning light at top
        const warn = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 8, 5),
          new THREE.MeshStandardMaterial({
            color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 1.4,
          })
        );
        warn.position.set(-5, craneH + 7.2, -3);
        g.add(warn);
        bulbMeshes.push(warn);

        // Hook hanging from jib
        const cable = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 30, 4),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
        );
        cable.position.set(20, craneH - 13, -3);
        g.add(cable);
        const hook = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.6, 0.6),
          new THREE.MeshStandardMaterial({ color: 0x6a6a6a, metalness: 0.7 })
        );
        hook.position.set(20, craneH - 28, -3);
        g.add(hook);

        // The new construction (rebar + concrete floor in progress)
        const concrete = new THREE.MeshStandardMaterial({
          color: 0x9a9a96, roughness: 0.9,
        });
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(16, 0.6, 12), concrete
        );
        slab.position.set(6, 0.3, 0);
        slab.castShadow = true;
        slab.receiveShadow = true;
        g.add(slab);
        // Rebar grid emerging from slab
        const rebarMat = new THREE.MeshStandardMaterial({
          color: 0xa05a30, roughness: 0.8, metalness: 0.4,
        });
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 8; j++) {
            const rb = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.04, 3, 4), rebarMat
            );
            rb.position.set(-2 + i * 1.2, 1.8, -5 + j * 1.4);
            g.add(rb);
          }
        }
        // Wall going up (partial)
        const wallUp = new THREE.Mesh(
          new THREE.BoxGeometry(12, 6, 0.5), concrete
        );
        wallUp.position.set(6, 3.3, -5.5);
        wallUp.castShadow = true;
        g.add(wallUp);

        // Scaffolding on the wall
        const scaffoldMat = new THREE.MeshStandardMaterial({
          color: 0x4a4a4a, metalness: 0.6, roughness: 0.5,
        });
        for (let lvl = 0; lvl < 3; lvl++) {
          for (let i = 0; i < 6; i++) {
            // Vertical post
            const pst = new THREE.Mesh(
              new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5), scaffoldMat
            );
            pst.position.set(0 + i * 2.4, 1.5 + lvl * 2, -4.8);
            g.add(pst);
          }
          // Horizontal plank
          const plank = new THREE.Mesh(
            new THREE.BoxGeometry(12, 0.15, 0.5),
            new THREE.MeshStandardMaterial({ color: 0xb18752, roughness: 0.85 })
          );
          plank.position.set(6, 0.6 + lvl * 2, -4.8);
          g.add(plank);
        }

        // Dumpster
        const dumpMat = new THREE.MeshStandardMaterial({
          color: 0x4a8e2a, roughness: 0.7,
        });
        const dump = new THREE.Mesh(
          new THREE.BoxGeometry(6, 2.4, 2.5), dumpMat
        );
        dump.position.set(-12, 1.2, 8);
        dump.castShadow = true;
        g.add(dump);
        // Trash overflowing
        const trashMat = new THREE.MeshStandardMaterial({
          color: 0x8b6a4a, roughness: 0.85,
        });
        for (let i = 0; i < 5; i++) {
          const t = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.4, 0.5), trashMat
          );
          t.position.set(-13 + i * 0.6, 2.65, 8 + (Math.random() - 0.5) * 1.5);
          g.add(t);
        }

        // Porta-potty
        const ppMat = new THREE.MeshStandardMaterial({
          color: 0x4ab8f0, roughness: 0.55,
        });
        const pp = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 2.4, 1.4), ppMat
        );
        pp.position.set(-12, 1.2, 4);
        pp.castShadow = true;
        g.add(pp);
        const ppTop = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.3, 1.5),
          new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.6 })
        );
        ppTop.position.set(-12, 2.55, 4);
        g.add(ppTop);

        // Construction worker figures (orange vests)
        const vestMat = new THREE.MeshStandardMaterial({
          color: 0xff7a1f, roughness: 0.7,
          emissive: 0xff7a1f, emissiveIntensity: 0.1,
        });
        const helmetMat = new THREE.MeshStandardMaterial({
          color: 0xfcd84e, roughness: 0.55,
        });
        for (let i = 0; i < 5; i++) {
          const wkG = new THREE.Group();
          wkG.position.set(
            (Math.random() - 0.5) * 14,
            0,
            (Math.random() - 0.5) * 8
          );
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6), vestMat
          );
          body.position.y = 0.9;
          body.castShadow = true;
          wkG.add(body);
          const helmet = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
            helmetMat
          );
          helmet.position.y = 1.7;
          wkG.add(helmet);
          g.add(wkG);
        }

        // Stacked materials (bags of cement, pallets)
        const palletMat = new THREE.MeshStandardMaterial({
          color: 0x9c6a3a, roughness: 0.85,
        });
        const bagMat = new THREE.MeshStandardMaterial({
          color: 0xc8c4ba, roughness: 0.9,
        });
        for (let p = 0; p < 3; p++) {
          const pallet = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.2, 1.2), palletMat
          );
          pallet.position.set(10 - p * 2, 0.1, 6);
          g.add(pallet);
          for (let b = 0; b < 4; b++) {
            const bag = new THREE.Mesh(
              new THREE.BoxGeometry(0.7, 0.25, 0.5), bagMat
            );
            bag.position.set(10 - p * 2 + (b % 2 === 0 ? -0.3 : 0.3), 0.35 + Math.floor(b / 2) * 0.28, 6);
            g.add(bag);
          }
        }

        // "SITE SAFETY · HARD HAT AREA" sign
        const safetyTex = signTexture("HARD HAT AREA", "#ffe200", "#000", 512, 128);
        const safetyMat = new THREE.MeshStandardMaterial({
          map: safetyTex, emissive: 0xffffff, emissiveMap: safetyTex, emissiveIntensity: 0.3,
        });
        const safety = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.0), safetyMat);
        safety.position.set(0, 2.5, -D / 2 + 0.15);
        g.add(safety);

        scene.add(g);
      }

      /* ----------------------------------------------------------------
       *  Lit-window emissive overlay — random windows glow warm.
       *  Applied to closer apartments. Always-on (not animated).
       * ---------------------------------------------------------------- */
      function buildLitWindows(apartments) {
        if (!apartments || apartments.length === 0) return;
        const sorted = apartments
          .map((a) => ({ ...a, _dist: Math.hypot(a.x, a.z + 80) }))
          .sort((x, y) => x._dist - y._dist)
          .slice(0, 120);

        const litMat = new THREE.MeshStandardMaterial({
          color: 0xfff0c0, emissive: 0xffd07a, emissiveIntensity: 1.2,
          roughness: 0.4,
        });
        const dimMat = new THREE.MeshStandardMaterial({
          color: 0xddeaf2, emissive: 0x4a3a20, emissiveIntensity: 0.3,
          roughness: 0.4,
        });
        // We'll use two big InstancedMeshes for lit and dim windows
        const winGeom = new THREE.PlaneGeometry(0.8, 1.1);

        let totalCount = 0;
        sorted.forEach((b) => {
          const rows = Math.floor((b.h - 4) / 3);
          const cols = Math.floor((b.w - 1) / 1.8);
          totalCount += rows * cols * 2; // both visible faces
        });

        const litInst = new THREE.InstancedMesh(winGeom, litMat, totalCount);
        const dimInst = new THREE.InstancedMesh(winGeom, dimMat, totalCount);
        bulbMeshes.push(litInst);

        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sV = new THREE.Vector3(1, 1, 1);
        let li = 0, di = 0;

        sorted.forEach((b) => {
          const rows = Math.floor((b.h - 4) / 3);
          const cols = Math.floor((b.w - 1) / 1.8);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const wy = b.y - b.h / 2 + 3 + r * 3;
              const wx = b.x - b.w / 2 + 1.5 + c * 1.8;
              const lit = Math.random() < 0.22;
              const inst = lit ? litInst : dimInst;
              const idx = lit ? li++ : di++;
              // South face
              v.set(wx, wy, b.z + b.d / 2 + 0.05);
              q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
              m4.compose(v, q, sV);
              inst.setMatrixAt(idx, m4);
            }
          }
          // Also east + west faces
          for (let r = 0; r < rows; r++) {
            const cols2 = Math.floor((b.d - 1) / 1.8);
            for (let c = 0; c < cols2; c++) {
              const wy = b.y - b.h / 2 + 3 + r * 3;
              const wz = b.z - b.d / 2 + 1.5 + c * 1.8;
              const lit = Math.random() < 0.22;
              const inst = lit ? litInst : dimInst;
              const idx = lit ? li++ : di++;
              if (idx >= totalCount) continue;
              v.set(b.x + b.w / 2 + 0.05, wy, wz);
              q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
              m4.compose(v, q, sV);
              inst.setMatrixAt(idx, m4);
            }
          }
        });
        litInst.count = li;
        dimInst.count = di;
        litInst.instanceMatrix.needsUpdate = true;
        dimInst.instanceMatrix.needsUpdate = true;
        buildingGroup.add(litInst);
        buildingGroup.add(dimInst);
      }

      /* ----------------------------------------------------------------
       *  Manhole steam plumes
       * ---------------------------------------------------------------- */
      function buildManholeSteam() {
        const baseY = groundMesh.position.y + terrainAmp + 0.06;
        // Steam from ~6 manholes in the near-zone streets
        const positions = [
          { x: -80, z: -30 }, { x: 70, z: -30 },
          { x: -180, z: -100 }, { x: 200, z: -120 },
          { x: -50, z: -180 }, { x: 100, z: -200 },
          { x: -300, z: -60 }, { x: 320, z: -60 },
        ];
        positions.forEach((p) => {
          spawnSteam(p.x, baseY + 0.5, p.z, {
            count: 40, scale: 1.2, riseSpeed: 1.8,
          });
        });
      }

      /* ----------------------------------------------------------------
       *  Specialized people: kids, NYPD pairs, tourists, elderly, smokers
       * ---------------------------------------------------------------- */
      function buildPeopleVariety() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const bwCenterZ = 38;
        const W = groundSize * 0.95 * 0.7;

        // NYPD officers — pairs in blue, white shirts on top
        const nypdBlue = new THREE.MeshStandardMaterial({
          color: 0x0a2266, roughness: 0.7,
        });
        const nypdWhite = new THREE.MeshStandardMaterial({
          color: 0xeaeaea, roughness: 0.7,
        });
        const beltMat = new THREE.MeshStandardMaterial({
          color: 0x111418, roughness: 0.6,
        });
        for (let i = 0; i < 6; i++) {
          const px = (Math.random() - 0.5) * W;
          const pz = bwCenterZ + (Math.random() - 0.5) * 4;
          for (let p = 0; p < 2; p++) {
            const cop = new THREE.Group();
            cop.position.set(px + p * 0.7, baseY, pz);
            // Body (pants)
            const pants = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 0.6, 4, 5), nypdBlue
            );
            pants.position.y = 0.55;
            pants.castShadow = true;
            cop.add(pants);
            // Shirt (lighter blue)
            const shirt = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 0.7, 4, 5),
              new THREE.MeshStandardMaterial({ color: 0x3a5a8a, roughness: 0.7 })
            );
            shirt.position.y = 1.35;
            cop.add(shirt);
            // Belt
            const belt = new THREE.Mesh(
              new THREE.CylinderGeometry(0.34, 0.34, 0.12, 8), beltMat
            );
            belt.position.y = 0.95;
            cop.add(belt);
            // Head (skin)
            const head = new THREE.Mesh(
              new THREE.SphereGeometry(0.18, 8, 5),
              new THREE.MeshStandardMaterial({ color: 0xeac8a0, roughness: 0.85 })
            );
            head.position.y = 1.85;
            cop.add(head);
            // Hat (dark cap)
            const cap = new THREE.Mesh(
              new THREE.CylinderGeometry(0.21, 0.21, 0.1, 8), beltMat
            );
            cap.position.y = 2.02;
            cop.add(cap);
            scene.add(cop);
          }
        }

        // Kids (smaller capsules in bright colors) on boardwalk
        for (let i = 0; i < 25; i++) {
          const kid = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.18, 0.55, 4, 5),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.75, 0.55),
              roughness: 0.85,
            })
          );
          kid.position.set(
            (Math.random() - 0.5) * W,
            baseY + 0.45,
            bwCenterZ + (Math.random() - 0.5) * 8
          );
          kid.castShadow = true;
          scene.add(kid);
        }

        // Elderly with canes
        for (let i = 0; i < 10; i++) {
          const g = new THREE.Group();
          g.position.set(
            (Math.random() - 0.5) * W,
            baseY,
            bwCenterZ + (Math.random() - 0.5) * 6
          );
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.28, 1.0, 4, 5),
            new THREE.MeshStandardMaterial({
              color: [0x6a4a3a, 0x4a4a4a, 0x8a6a4a, 0x3a3a5a][i % 4],
              roughness: 0.85,
            })
          );
          body.position.y = 0.8;
          body.castShadow = true;
          // Slight forward lean
          body.rotation.x = 0.08;
          g.add(body);
          // Cane
          const cane = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          cane.position.set(0.4, 0.45, 0);
          cane.rotation.z = 0.15;
          g.add(cane);
          scene.add(g);
        }

        // Tourists with cameras held up
        for (let i = 0; i < 14; i++) {
          const g = new THREE.Group();
          g.position.set(
            (Math.random() - 0.5) * W,
            baseY,
            bwCenterZ + (Math.random() - 0.5) * 6
          );
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: [0xff8a3a, 0xfcd84e, 0x4aff7a, 0xff3a8a][i % 4],
              roughness: 0.85,
            })
          );
          body.position.y = 0.9;
          body.castShadow = true;
          g.add(body);
          // Camera held up to face
          const cam = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.18, 0.15),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
          );
          cam.position.set(0.25, 1.75, 0.25);
          g.add(cam);
          // Backpack
          const bp = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.55, 0.25),
            new THREE.MeshStandardMaterial({
              color: [0xc41e3a, 0x0a3a8a, 0x4a8a3a][i % 3], roughness: 0.7,
            })
          );
          bp.position.set(0, 1.2, -0.35);
          g.add(bp);
          scene.add(g);
        }

        // Smokers — body with tiny emissive dot for cigarette tip
        for (let i = 0; i < 12; i++) {
          const g = new THREE.Group();
          g.position.set(
            (Math.random() - 0.5) * W,
            baseY,
            bwCenterZ + (Math.random() - 0.5) * 5
          );
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.4, 0.45),
              roughness: 0.85,
            })
          );
          body.position.y = 0.9;
          body.castShadow = true;
          g.add(body);
          // Cigarette tip
          const cig = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 5, 4),
            new THREE.MeshStandardMaterial({
              color: 0xff7a3a, emissive: 0xff5a1a, emissiveIntensity: 1.6,
            })
          );
          cig.position.set(0.3, 1.7, 0.3);
          g.add(cig);
          bulbMeshes.push(cig);
          // Tiny steam (smoke)
          spawnSteam(g.position.x + 0.3, baseY + 1.75, g.position.z + 0.3, {
            count: 6, scale: 0.3, riseSpeed: 0.8, color: 0xccccd0,
          });
          scene.add(g);
        }

        // Phone users — figure with small emissive square at chin level
        for (let i = 0; i < 18; i++) {
          const g = new THREE.Group();
          g.position.set(
            (Math.random() - 0.5) * W,
            baseY,
            bwCenterZ + (Math.random() - 0.5) * 7
          );
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.6, 0.45),
              roughness: 0.85,
            })
          );
          body.position.y = 0.9;
          body.castShadow = true;
          g.add(body);
          // Phone glow
          const phone = new THREE.Mesh(
            new THREE.PlaneGeometry(0.12, 0.18),
            new THREE.MeshStandardMaterial({
              color: 0xa8d8f0, emissive: 0x4a8ec8, emissiveIntensity: 1.2,
            })
          );
          phone.position.set(0.3, 1.5, 0.3);
          phone.rotation.y = -Math.PI / 4;
          g.add(phone);
          scene.add(g);
        }
      }

      /* ----------------------------------------------------------------
       *  Crowd clusters at attractions (Nathan's, midway, Cyclone, etc.)
       * ---------------------------------------------------------------- */
      function buildAttractionCrowds() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        // Each cluster: { center: [x, z], count, radius }
        const clusters = [
          { x: -20, z: 38, n: 40, r: 6 },   // Nathan's front line
          { x: 35, z: 10, n: 30, r: 7 },    // Cyclone queue
          { x: -55, z: 25, n: 28, r: 8 },   // Wonder Wheel queue
          { x: 60, z: 0, n: 25, r: 6 },     // Sideshow front
          { x: 0, z: 25, n: 22, r: 5 },     // Welcome arch
          { x: -75, z: 5, n: 18, r: 6 },    // West midway
          { x: 80, z: 5, n: 18, r: 6 },     // East midway
          { x: 100, z: 60, n: 20, r: 10 },  // Childs / Ford Amph
        ];

        const totalPeople = clusters.reduce((a, c) => a + c.n, 0);
        const geom = new THREE.CapsuleGeometry(0.3, 1.2, 4, 6);
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        const inst = new THREE.InstancedMesh(geom, mat, totalPeople);
        inst.castShadow = true;
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(totalPeople * 3), 3
        );
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sV = new THREE.Vector3(1, 1, 1);
        const col = new THREE.Color();
        let idx = 0;

        clusters.forEach((c) => {
          for (let i = 0; i < c.n; i++) {
            // Gaussian-ish distribution
            const r = Math.sqrt(Math.random()) * c.r;
            const a = Math.random() * Math.PI * 2;
            const px = c.x + Math.cos(a) * r;
            const pz = c.z + Math.sin(a) * r;
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
            v.set(px, baseY + 0.9, pz);
            m4.compose(v, q, sV);
            inst.setMatrixAt(idx, m4);
            col.setHSL(Math.random(), 0.55, 0.5);
            inst.setColorAt(idx, col);
            idx++;
          }
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        scene.add(inst);
      }

      /* ----------------------------------------------------------------
       *  Street trash — pizza boxes, coffee cups, newspaper
       * ---------------------------------------------------------------- */
      function buildStreetTrash() {
        const baseY = groundMesh.position.y + terrainAmp + 0.07;
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });

        // Pizza boxes (small white squares)
        const pizzaMat = new THREE.MeshStandardMaterial({
          color: 0xeaeaea, roughness: 0.85,
        });
        // Coffee cups (Anthora blue/white cups)
        const cupMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.7,
        });
        const cupBlueMat = new THREE.MeshStandardMaterial({
          color: 0x1a4a8a, roughness: 0.7,
        });
        // Newspaper pages
        const newsMat = new THREE.MeshStandardMaterial({
          color: 0xdadcd8, roughness: 0.85,
        });

        ewStreets.forEach((st) => {
          if (Math.abs(st.position.z - 15) > 350) return;
          for (let x = -gridLength / 2 + 20; x < gridLength / 2 - 20; x += 18) {
            // Pizza box?
            if (Math.random() < 0.18) {
              const dz = (Math.random() - 0.5) * (streetWidth + 4);
              const pb = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.06, 0.5), pizzaMat
              );
              pb.position.set(x, baseY, st.position.z + dz);
              pb.rotation.y = Math.random() * Math.PI;
              scene.add(pb);
            }
            // Coffee cup
            if (Math.random() < 0.28) {
              const dz = (Math.random() - 0.5) * (streetWidth + 4);
              const cup = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.07, 0.18, 6),
                Math.random() < 0.5 ? cupBlueMat : cupMat
              );
              cup.position.set(x + (Math.random() - 0.5) * 2, baseY + 0.09, st.position.z + dz);
              cup.rotation.z = (Math.random() - 0.5) * 0.4;
              scene.add(cup);
            }
            // Newspaper page (flat sheet)
            if (Math.random() < 0.12) {
              const dz = (Math.random() - 0.5) * (streetWidth + 4);
              const np = new THREE.Mesh(
                new THREE.PlaneGeometry(0.5, 0.4), newsMat
              );
              np.rotation.x = -Math.PI / 2;
              np.rotation.z = Math.random() * Math.PI;
              np.position.set(x + (Math.random() - 0.5) * 3, baseY, st.position.z + dz);
              scene.add(np);
            }
          }
        });
      }

      /* ----------------------------------------------------------------
       *  NYC pole sign stacks at intersections + flags + phone booths
       * ---------------------------------------------------------------- */
      function buildPoleSignsFlagsPhones() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });
        const intersectionXs = [];
        for (let i = 0; i < 12; i++) {
          const sx = buildingAreaMinX + 100 / 2 + i * 100;
          if (Math.abs(sx) <= gridLength / 2) intersectionXs.push(sx);
        }

        // Stack of parking signs on poles at ~half of near intersections
        const stackSigns = [
          "NO STANDING\n8AM-6PM",
          "TOW ZONE",
          "STREET CLEANING\nTUES THURS",
          "1 HR PARKING\nMON-SAT",
        ];
        ewStreets.forEach((st) => {
          intersectionXs.forEach((ix) => {
            if (Math.hypot(ix, st.position.z - 15) > 360) return;
            if (Math.random() < 0.4) {
              const dz = (Math.random() < 0.5 ? -1 : 1) * (streetWidth / 2 + 3);
              const g = new THREE.Group();
              g.position.set(ix + (Math.random() - 0.5) * 20, st.position.y, st.position.z + dz);
              const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.1, 4, 5),
                new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6 })
              );
              pole.position.y = 2;
              g.add(pole);
              const numSigns = 1 + Math.floor(Math.random() * 3);
              for (let s = 0; s < numSigns; s++) {
                const sgT = signTexture(
                  stackSigns[Math.floor(Math.random() * stackSigns.length)].replace("\n", " "),
                  "#ffffff", "#1a1a1a", 256, 96
                );
                const sgM = new THREE.MeshStandardMaterial({
                  map: sgT, side: THREE.DoubleSide,
                });
                const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), sgM);
                sg.position.set(0.25, 3.6 - s * 0.65, 0);
                g.add(sg);
              }
              scene.add(g);
            }
          });
        });

        // Flagpoles at landmarks — US + NYC flag together
        const flagPositions = [
          { x: -460, z: -60, label: "Stillwell" },  // near Stillwell
          { x: -180, z: -60, label: "Stadium" },     // MCU Park
          { x: 0, z: -8, label: "Plaza" },           // welcome arch area
          { x: 100, z: -120, label: "School" },
          { x: -100, z: -200, label: "Hall" },
        ];
        flagPositions.forEach((p) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.12, 10, 6),
            new THREE.MeshStandardMaterial({
              color: 0xeaeaea, metalness: 0.55, roughness: 0.5,
            })
          );
          pole.position.y = 5;
          pole.castShadow = true;
          g.add(pole);
          // Gold ball on top
          const top = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 6),
            new THREE.MeshStandardMaterial({
              color: 0xfcd84e, metalness: 0.85, roughness: 0.25,
            })
          );
          top.position.y = 10.2;
          g.add(top);
          // US flag
          const usCanvas = document.createElement("canvas");
          usCanvas.width = 256; usCanvas.height = 160;
          const uc = usCanvas.getContext("2d");
          uc.fillStyle = "#ffffff";
          uc.fillRect(0, 0, 256, 160);
          // Stripes
          for (let i = 0; i < 13; i++) {
            uc.fillStyle = i % 2 === 0 ? "#c41e3a" : "#ffffff";
            uc.fillRect(0, i * 12.3, 256, 12.3);
          }
          uc.fillStyle = "#0a2266";
          uc.fillRect(0, 0, 100, 80);
          // Stars
          uc.fillStyle = "#ffffff";
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
              uc.beginPath();
              uc.arc(10 + c * 18, 10 + r * 14, 2, 0, Math.PI * 2);
              uc.fill();
            }
          }
          const usTex = new THREE.CanvasTexture(usCanvas);
          usTex.colorSpace = THREE.SRGBColorSpace;
          const usFlag = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 1.5),
            new THREE.MeshStandardMaterial({
              map: usTex, side: THREE.DoubleSide, roughness: 0.7,
            })
          );
          usFlag.position.set(1.2, 8.5, 0);
          g.add(usFlag);
          trackWavingFlag(usFlag, { amp: 0.35, speed: 2.2 });
          // NYC flag (blue/white/orange tricolor)
          const nyCanvas = document.createElement("canvas");
          nyCanvas.width = 240; nyCanvas.height = 160;
          const nc = nyCanvas.getContext("2d");
          nc.fillStyle = "#0a3a8a";
          nc.fillRect(0, 0, 80, 160);
          nc.fillStyle = "#ffffff";
          nc.fillRect(80, 0, 80, 160);
          nc.fillStyle = "#ff8a1a";
          nc.fillRect(160, 0, 80, 160);
          // NYC seal (simplified - just text)
          nc.fillStyle = "#0a3a8a";
          nc.font = "bold 22px Inter";
          nc.textAlign = "center";
          nc.fillText("NYC", 120, 85);
          const nyTex = new THREE.CanvasTexture(nyCanvas);
          nyTex.colorSpace = THREE.SRGBColorSpace;
          const nyFlag = new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, 1.4),
            new THREE.MeshStandardMaterial({
              map: nyTex, side: THREE.DoubleSide, roughness: 0.7,
            })
          );
          nyFlag.position.set(1.1, 6.5, 0);
          g.add(nyFlag);
          trackWavingFlag(nyFlag, { amp: 0.32, speed: 1.9 });
          scene.add(g);
        });

        // Old NYC pay phones — blue, on poles, occasional
        const phonePositions = [
          { x: -130, z: -40 },
          { x: 130, z: -40 },
          { x: -90, z: -130 },
          { x: 110, z: -130 },
          { x: -250, z: -90 },
        ];
        phonePositions.forEach((p) => {
          const g = new THREE.Group();
          g.position.set(p.x, baseY, p.z);
          // Booth body
          const booth = new THREE.Mesh(
            new THREE.BoxGeometry(1, 2.4, 1),
            new THREE.MeshStandardMaterial({
              color: 0x1a3a8a, roughness: 0.6,
            })
          );
          booth.position.y = 1.2;
          booth.castShadow = true;
          g.add(booth);
          // Phone (silver panel on front)
          const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.6),
            new THREE.MeshStandardMaterial({
              color: 0x8a8a8a, metalness: 0.5, roughness: 0.4,
            })
          );
          panel.position.set(0, 1.7, 0.51);
          g.add(panel);
          // Sign on top
          const tex = signTexture("PHONE", "#fcd84e", "#1a3a8a", 256, 64);
          const sig = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 0.3),
            new THREE.MeshStandardMaterial({
              map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45,
            })
          );
          sig.position.set(0, 2.55, 0.51);
          g.add(sig);
          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Painted advertisements on the ground-level walls of cafes
       *  ("Slice $1", "Open 24 Hours", etc.)
       * ---------------------------------------------------------------- */
      function buildExtraCafeAds() {
        // Wider coverage of cafe storefronts: every near-zone cafe also gets
        // an A-frame chalkboard out front and additional signage.
        const sorted = cafePositions
          .map((c) => ({ ...c, _dist: Math.hypot(c.x, c.z + 80) }))
          .sort((a, b) => a._dist - b._dist)
          .slice(0, 80);
        const messages = [
          "SLICE $3", "FRESH BAGELS", "ICED COFFEE",
          "OPEN LATE", "DELIVERY", "HAPPY HOUR",
          "FREE WIFI", "BEST IN BKLYN", "VEGAN OK",
        ];
        sorted.forEach((c, idx) => {
          const front = c.z + c.d / 2 + 0.4;
          const facadeY = c.y - c.h / 2;
          // A-frame sandwich board
          const sb = new THREE.Group();
          sb.position.set(c.x - c.w / 2 + 2 + Math.random() * (c.w - 4), facadeY + 0.55, front + 1.6);
          const aMat = new THREE.MeshStandardMaterial({
            color: 0x111418, roughness: 0.85,
          });
          const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), aMat);
          leg1.rotation.x = 0.3;
          leg1.position.set(0, 0, 0.1);
          sb.add(leg1);
          const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), aMat);
          leg2.rotation.x = -0.3;
          leg2.position.set(0, 0, -0.1);
          sb.add(leg2);
          // Chalkboard text
          const msg = messages[idx % messages.length];
          const tex = signTexture(msg, "#0a1a0a", "#fff", 256, 192);
          const m = new THREE.MeshStandardMaterial({
            map: tex, roughness: 0.85,
          });
          const board = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), m);
          board.position.set(0, 0.1, 0.18);
          board.rotation.x = 0.3;
          sb.add(board);
          scene.add(sb);
        });
      }

      /* ----------------------------------------------------------------
       *  Sidewalk pedestrians — many moving figures along each sidewalk
       * ---------------------------------------------------------------- */
      function buildSidewalkPedestrians() {
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });
        // Two sidewalks per street, ~25 people each near zone, ~10 far
        const personGeom = new THREE.CapsuleGeometry(0.3, 1.2, 4, 6);
        const personMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        const totalMax = ewStreets.length * 50;
        const inst = new THREE.InstancedMesh(personGeom, personMat, totalMax);
        inst.castShadow = true;
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(totalMax * 3), 3
        );
        sidewalkPersonInst = inst;
        scene.add(inst);

        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sV = new THREE.Vector3(1, 1, 1);
        const col = new THREE.Color();
        let idx = 0;

        ewStreets.forEach((st) => {
          // Density depends on near-zone proximity
          const near = Math.abs(st.position.z - 15) < 360;
          const perSide = near ? 25 : 8;
          [-(streetWidth / 2 + 2), (streetWidth / 2 + 2)].forEach((dz) => {
            for (let k = 0; k < perSide; k++) {
              if (idx >= totalMax) break;
              const x = -gridLength / 2 + Math.random() * gridLength;
              const z = st.position.z + dz + (Math.random() - 0.5) * 1.5;
              const y = st.position.y + 0.9;
              const dirX = Math.random() < 0.5 ? 1 : -1;
              q.setFromAxisAngle(new THREE.Vector3(0, 1, 0),
                dirX > 0 ? -Math.PI / 2 : Math.PI / 2);
              v.set(x, y, z);
              m4.compose(v, q, sV);
              inst.setMatrixAt(idx, m4);
              col.setHSL(Math.random(), 0.55, 0.5);
              inst.setColorAt(idx, col);
              sidewalkPeople.push({
                idx, x, y, z, speed: 1.2 + Math.random() * 1.4,
                dirX, near,
              });
              idx++;
            }
          });
        });
        inst.count = idx;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      }

      /* ----------------------------------------------------------------
       *  Vehicle variety — vans, box trucks, motorcycles, school buses
       *  Each kind is its own instanced pair (body + cabin) that moves
       *  on the same animation tick as the cars.
       * ---------------------------------------------------------------- */
      function buildExtraVehicles() {
        const ewStreets = [];
        scene.traverse((o) => {
          if (o.userData?.isEWStreet) ewStreets.push(o);
        });
        if (ewStreets.length === 0) return;

        const builds = [
          // Vans — box body, no separate cabin (just body)
          {
            count: 24,
            body: new THREE.BoxGeometry(5, 2.4, 2.1),
            colors: [0xeaeaea, 0xc41e3a, 0x1a4a8a, 0xfcd84e, 0x4a8a3a],
            yOff: 1.2, cabin: null, speed: 1.0,
          },
          // Box trucks — body + cab
          {
            count: 16,
            body: new THREE.BoxGeometry(7, 3.0, 2.4),
            colors: [0xeaeaea, 0x4a8a3a, 0xc8a060, 0x6a3a8a],
            yOff: 1.5, speed: 0.8,
            cab: { geom: new THREE.BoxGeometry(2.4, 2.4, 2.4), color: 0x4a4a4a, dx: -4.0, dy: 1.2 },
          },
          // Motorcycles — tiny body
          {
            count: 14,
            body: new THREE.BoxGeometry(2.2, 1.0, 0.6),
            colors: [0x111418, 0xc41e3a, 0x1a4a8a, 0xfcd84e],
            yOff: 0.5, cabin: null, speed: 1.8,
          },
          // School buses — yellow, long
          {
            count: 8,
            body: new THREE.BoxGeometry(8.5, 2.8, 2.4),
            colors: [0xfdd835],
            yOff: 1.4, speed: 0.7,
            cabin: { geom: new THREE.BoxGeometry(8, 0.6, 2.45), color: 0x202830, dy: 1.55 },
          },
        ];

        const m4 = new THREE.Matrix4();
        builds.forEach((b) => {
          const mat = new THREE.MeshStandardMaterial({
            metalness: 0.35, roughness: 0.5,
          });
          const bodyInst = new THREE.InstancedMesh(b.body, mat, b.count);
          bodyInst.castShadow = true;
          bodyInst.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(b.count * 3), 3
          );
          let cabinInst = null, cabMat;
          if (b.cabin) {
            cabMat = new THREE.MeshStandardMaterial({
              color: b.cabin.color, metalness: 0.4, roughness: 0.4,
              emissive: 0x0a1820, emissiveIntensity: 0.3,
            });
            cabinInst = new THREE.InstancedMesh(b.cabin.geom, cabMat, b.count);
            cabinInst.castShadow = true;
          }
          let extraCabInst = null, extraCabMat;
          if (b.cab) {
            // Box truck has a distinct front cab box
            extraCabMat = new THREE.MeshStandardMaterial({
              color: b.cab.color, metalness: 0.4, roughness: 0.45,
            });
            extraCabInst = new THREE.InstancedMesh(b.cab.geom, extraCabMat, b.count);
            extraCabInst.castShadow = true;
          }
          const items = [];
          const color = new THREE.Color();
          for (let i = 0; i < b.count; i++) {
            const st = ewStreets[Math.floor(Math.random() * ewStreets.length)];
            const startX = Math.random() * gridLength - gridLength / 2;
            const y = st.position.y + b.yOff;
            m4.makeTranslation(startX, y, st.position.z);
            bodyInst.setMatrixAt(i, m4);
            color.setHex(b.colors[Math.floor(Math.random() * b.colors.length)]);
            bodyInst.setColorAt(i, color);
            if (cabinInst) {
              m4.makeTranslation(startX, y + b.cabin.dy, st.position.z);
              cabinInst.setMatrixAt(i, m4);
            }
            if (extraCabInst) {
              m4.makeTranslation(startX + b.cab.dx, y + b.cab.dy, st.position.z);
              extraCabInst.setMatrixAt(i, m4);
            }
            const dirSign = Math.random() < 0.5 ? 1 : -1;
            items.push({
              i, x: startX, y, z: st.position.z,
              speed: b.speed * (0.7 + Math.random() * 0.6) * dirSign,
              streetLength: gridLength,
              cabinDy: b.cabin ? b.cabin.dy : null,
              cabDx: b.cab ? b.cab.dx : null,
              cabDy: b.cab ? b.cab.dy : null,
            });
          }
          bodyInst.instanceMatrix.needsUpdate = true;
          if (cabinInst) cabinInst.instanceMatrix.needsUpdate = true;
          if (extraCabInst) extraCabInst.instanceMatrix.needsUpdate = true;
          if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
          scene.add(bodyInst);
          if (cabinInst) scene.add(cabinInst);
          if (extraCabInst) scene.add(extraCabInst);
          extraVehicles.push({ bodyInst, cabinInst, extraCabInst, items });
        });
      }

      function animateExtraVehicles(delta) {
        const _m = new THREE.Matrix4();
        extraVehicles.forEach((set) => {
          set.items.forEach((it) => {
            it.x += it.speed;
            const half = it.streetLength / 2;
            if (it.speed > 0 && it.x > half) it.x = -half;
            else if (it.speed < 0 && it.x < -half) it.x = half;
            _m.makeTranslation(it.x, it.y, it.z);
            set.bodyInst.setMatrixAt(it.i, _m);
            if (set.cabinInst && it.cabinDy != null) {
              _m.makeTranslation(it.x, it.y + it.cabinDy, it.z);
              set.cabinInst.setMatrixAt(it.i, _m);
            }
            if (set.extraCabInst && it.cabDx != null) {
              _m.makeTranslation(it.x + it.cabDx, it.y + it.cabDy, it.z);
              set.extraCabInst.setMatrixAt(it.i, _m);
            }
          });
          set.bodyInst.instanceMatrix.needsUpdate = true;
          if (set.cabinInst) set.cabinInst.instanceMatrix.needsUpdate = true;
          if (set.extraCabInst) set.extraCabInst.instanceMatrix.needsUpdate = true;
        });
      }

      /* ----------------------------------------------------------------
       *  Bus upgrade — overlay window strip and white roof
       * ---------------------------------------------------------------- */
      function buildBusUpgrade() {
        // The original buses are already at vehicleGroup.userData.busInst.
        // We add two more instanced meshes that track each bus: a white
        // roof box and an emissive window strip.
        const busInst = vehicleGroup.userData.busInst;
        if (!busInst) return;
        const count = buses.length;

        const roofGeom = new THREE.BoxGeometry(6.1, 0.5, 2.05);
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0xeaeaea, roughness: 0.55,
        });
        const roofInst = new THREE.InstancedMesh(roofGeom, roofMat, count);
        roofInst.castShadow = true;

        const winGeom = new THREE.BoxGeometry(5.8, 0.7, 2.07);
        const winMat = new THREE.MeshStandardMaterial({
          color: 0x202830, metalness: 0.45, roughness: 0.2,
          emissive: 0x4a8ec8, emissiveIntensity: 0.45,
        });
        const winInst = new THREE.InstancedMesh(winGeom, winMat, count);

        const m4 = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
          const b = buses[i];
          m4.makeTranslation(b.x, b.y + 1.25, b.z);
          roofInst.setMatrixAt(i, m4);
          m4.makeTranslation(b.x, b.y + 0.4, b.z);
          winInst.setMatrixAt(i, m4);
        }
        roofInst.instanceMatrix.needsUpdate = true;
        winInst.instanceMatrix.needsUpdate = true;
        scene.add(roofInst);
        scene.add(winInst);
        vehicleGroup.userData.busRoofInst = roofInst;
        vehicleGroup.userData.busWinInst = winInst;
      }

      /* ----------------------------------------------------------------
       *  Flying seagulls — circle overhead in flocks
       * ---------------------------------------------------------------- */
      function buildFlyingGulls() {
        const baseY = groundMesh.position.y + terrainAmp;
        const gullMat = new THREE.MeshStandardMaterial({
          color: 0xf6f6f0, roughness: 0.6,
        });
        const tipMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a, roughness: 0.55,
        });

        // Flocks at several centers
        const flockCenters = [
          { x: -200, z: 100, n: 18, radius: 60, y: 40 },
          { x: 0, z: 80, n: 14, radius: 50, y: 50 },
          { x: 250, z: 120, n: 16, radius: 55, y: 45 },
          { x: -400, z: 250, n: 10, radius: 80, y: 30 },
          { x: 400, z: 240, n: 12, radius: 70, y: 35 },
        ];

        flockCenters.forEach((fc) => {
          for (let i = 0; i < fc.n; i++) {
            const g = new THREE.Group();
            // V-shape wings via 3 boxes (body + 2 wings)
            const body = new THREE.Mesh(
              new THREE.SphereGeometry(0.18, 6, 4), gullMat
            );
            body.scale.set(1, 0.7, 1.6);
            g.add(body);
            const wingL = new THREE.Mesh(
              new THREE.BoxGeometry(1.4, 0.06, 0.3), gullMat
            );
            wingL.position.set(-0.6, 0, 0);
            wingL.rotation.z = 0.2;
            g.add(wingL);
            const wingR = new THREE.Mesh(
              new THREE.BoxGeometry(1.4, 0.06, 0.3), gullMat
            );
            wingR.position.set(0.6, 0, 0);
            wingR.rotation.z = -0.2;
            g.add(wingR);
            // Black wing tips
            const tipL = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.05, 0.3), tipMat
            );
            tipL.position.set(-1.2, -0.1, 0);
            g.add(tipL);
            const tipR = tipL.clone();
            tipR.position.set(1.2, -0.1, 0);
            g.add(tipR);

            const r = fc.radius * (0.6 + Math.random() * 0.5);
            const theta = Math.random() * Math.PI * 2;
            const speed = 0.18 + Math.random() * 0.18;
            const wingPhase = Math.random() * 10;
            g.position.set(
              fc.x + Math.cos(theta) * r,
              baseY + fc.y + (Math.random() - 0.5) * 10,
              fc.z + Math.sin(theta) * r
            );
            scene.add(g);
            flyingGulls.push({
              mesh: g, cx: fc.x, cz: fc.z, baseY: baseY + fc.y,
              r, theta, speed, wingL, wingR, wingPhase,
            });
          }
        });
      }

      function animateFlyingGulls(t, delta) {
        for (let i = 0; i < flyingGulls.length; i++) {
          const g = flyingGulls[i];
          g.theta += g.speed * delta;
          g.mesh.position.x = g.cx + Math.cos(g.theta) * g.r;
          g.mesh.position.z = g.cz + Math.sin(g.theta) * g.r;
          g.mesh.position.y = g.baseY + Math.sin(t * 0.5 + g.wingPhase) * 1.5;
          g.mesh.rotation.y = -g.theta + Math.PI / 2;
          // Wing flap
          const flap = Math.sin(t * 6 + g.wingPhase) * 0.4;
          g.wingL.rotation.z = 0.2 + flap;
          g.wingR.rotation.z = -0.2 - flap;
        }
      }

      /* ----------------------------------------------------------------
       *  Ride queue stanchions with red ropes + people in line
       * ---------------------------------------------------------------- */
      function buildRideQueues() {
        const baseY = groundMesh.position.y + terrainAmp + 0.5;
        const queues = [
          // Cyclone queue (leading to x=35, z=-5)
          { name: "Cyclone", from: [35, 30], to: [35, 5], width: 1.5 },
          // Wonder Wheel queue
          { name: "WonderWheel", from: [-55, 32], to: [-55, 14], width: 1.5 },
          // Sideshow queue
          { name: "Sideshow", from: [60, 30], to: [60, 8], width: 1.4 },
          // Thunderbolt queue
          { name: "Thunderbolt", from: [80, 30], to: [80, 0], width: 1.4 },
          // Parachute Jump queue
          { name: "Parachute", from: [100, 30], to: [100, 12], width: 1.4 },
        ];

        const postMat = new THREE.MeshStandardMaterial({
          color: 0x6a6a6a, metalness: 0.7, roughness: 0.3,
        });
        const baseMat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a, metalness: 0.5, roughness: 0.5,
        });
        const ropeMat = new THREE.MeshStandardMaterial({
          color: 0xc41e3a, roughness: 0.55,
          emissive: 0x6a0a0a, emissiveIntensity: 0.15,
        });

        queues.forEach((q) => {
          const g = new THREE.Group();
          const fromV = new THREE.Vector3(q.from[0], baseY, q.from[1]);
          const toV = new THREE.Vector3(q.to[0], baseY, q.to[1]);
          const totalLen = fromV.distanceTo(toV);
          const numPosts = Math.max(3, Math.floor(totalLen / 2));
          const sideOffset = q.width / 2;

          for (let side = 0; side < 2; side++) {
            const off = side === 0 ? -sideOffset : sideOffset;
            const offsetVec = new THREE.Vector3();
            // perpendicular direction
            const dir = new THREE.Vector3().subVectors(toV, fromV).normalize();
            offsetVec.set(-dir.z, 0, dir.x).multiplyScalar(off);
            for (let i = 0; i <= numPosts; i++) {
              const u = i / numPosts;
              const pos = new THREE.Vector3().lerpVectors(fromV, toV, u).add(offsetVec);
              // Post base
              const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.22, 0.1, 8), baseMat
              );
              base.position.set(pos.x, pos.y + 0.05, pos.z);
              g.add(base);
              // Post column
              const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), postMat
              );
              post.position.set(pos.x, pos.y + 0.55, pos.z);
              g.add(post);
              // Ball top
              const top = new THREE.Mesh(
                new THREE.SphereGeometry(0.07, 8, 5), postMat
              );
              top.position.set(pos.x, pos.y + 1.05, pos.z);
              g.add(top);
              // Rope segment between this and next post
              if (i < numPosts) {
                const next = new THREE.Vector3().lerpVectors(fromV, toV, (i + 1) / numPosts).add(offsetVec);
                const segLen = pos.distanceTo(next);
                const rope = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.04, 0.04, segLen, 5), ropeMat
                );
                const mid = new THREE.Vector3().addVectors(pos, next).multiplyScalar(0.5);
                mid.y += 0.85; // sag is approximate
                rope.position.copy(mid);
                const segDir = new THREE.Vector3().subVectors(next, pos).normalize();
                const up = new THREE.Vector3(0, 1, 0);
                rope.quaternion.setFromUnitVectors(up, segDir);
                g.add(rope);
              }
            }
          }

          // Fill the queue with line-of-people
          const numInLine = Math.floor(totalLen / 1.0);
          for (let i = 0; i < numInLine; i++) {
            const u = (i + 0.5) / numInLine;
            const pos = new THREE.Vector3().lerpVectors(fromV, toV, u);
            // Stagger left/right
            const dir = new THREE.Vector3().subVectors(toV, fromV).normalize();
            const offsetVec = new THREE.Vector3(-dir.z, 0, dir.x)
              .multiplyScalar((Math.random() - 0.5) * (q.width - 0.2));
            const finalPos = pos.add(offsetVec);
            const person = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
              new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5),
                roughness: 0.85,
              })
            );
            person.position.set(finalPos.x, finalPos.y + 0.9, finalPos.z);
            person.castShadow = true;
            g.add(person);
          }

          scene.add(g);
        });
      }

      /* ----------------------------------------------------------------
       *  Storefront window displays — produce, mannequins, baked goods,
       *  electronics. Overlaid on near-zone cafe storefronts.
       * ---------------------------------------------------------------- */
      function buildStorefrontDisplays() {
        const sorted = cafePositions
          .map((c) => ({ ...c, _dist: Math.hypot(c.x, c.z + 80) }))
          .sort((a, b) => a._dist - b._dist)
          .slice(0, 40);

        const displays = [
          "produce", "mannequin", "baked", "electronics", "produce",
          "mannequin", "baked", "electronics",
        ];

        sorted.forEach((c, idx) => {
          const front = c.z + c.d / 2 + 0.08;
          const facadeY = c.y - c.h / 2;
          const kind = displays[idx % displays.length];

          if (kind === "produce") {
            // 6 colorful boxes in front of the window
            const fruitColors = [0xf73e3e, 0xff8800, 0xffe300, 0x88dd44, 0xbb22aa];
            for (let i = 0; i < 6; i++) {
              const f = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.5, 0.5),
                new THREE.MeshStandardMaterial({
                  color: fruitColors[i % fruitColors.length], roughness: 0.6,
                })
              );
              f.position.set(
                c.x - 2 + (i % 3) * 1.0,
                facadeY + 0.95,
                front + 0.4 + Math.floor(i / 3) * 0.55
              );
              scene.add(f);
            }
          } else if (kind === "mannequin") {
            // 2 mannequins behind the window
            for (let i = 0; i < 2; i++) {
              const dressColor = i === 0 ? 0xc41e3a : 0x1a3a8a;
              const mann = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.25, 1.0, 4, 5),
                new THREE.MeshStandardMaterial({
                  color: dressColor, roughness: 0.5,
                })
              );
              mann.position.set(
                c.x - 1.5 + i * 3,
                facadeY + 1.1,
                front - 0.3
              );
              scene.add(mann);
              // Head
              const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 6, 5),
                new THREE.MeshStandardMaterial({ color: 0xeac8a0, roughness: 0.85 })
              );
              head.position.set(c.x - 1.5 + i * 3, facadeY + 2.0, front - 0.3);
              scene.add(head);
            }
          } else if (kind === "baked") {
            // Tiered cake stand + breads
            const standMat = new THREE.MeshStandardMaterial({
              color: 0xeaeaea, roughness: 0.55,
            });
            for (let i = 0; i < 3; i++) {
              const tier = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5 - i * 0.1, 0.5 - i * 0.1, 0.1, 16),
                standMat
              );
              tier.position.set(c.x, facadeY + 0.5 + i * 0.4, front);
              scene.add(tier);
              const cake = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4 - i * 0.1, 0.4 - i * 0.1, 0.2, 16),
                new THREE.MeshStandardMaterial({
                  color: 0xf4d8c8, roughness: 0.7,
                })
              );
              cake.position.set(c.x, facadeY + 0.65 + i * 0.4, front);
              scene.add(cake);
            }
            // Breads to the side
            for (let i = 0; i < 4; i++) {
              const br = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 8, 5),
                new THREE.MeshStandardMaterial({ color: 0xc8924a, roughness: 0.85 })
              );
              br.position.set(c.x - 2 + i * 0.4, facadeY + 1.6, front + 0.2);
              br.scale.set(1.5, 0.7, 0.7);
              scene.add(br);
            }
          } else {
            // electronics — TV wall (emissive grid)
            for (let r = 0; r < 2; r++) {
              for (let cc = 0; cc < 4; cc++) {
                const screenCols = [0x4a8ef0, 0xff3a8a, 0xfcd84e, 0x4aff7a];
                const sc = screenCols[(r + cc) % screenCols.length];
                const tv = new THREE.Mesh(
                  new THREE.PlaneGeometry(0.6, 0.4),
                  new THREE.MeshStandardMaterial({
                    color: sc, emissive: sc, emissiveIntensity: 0.7,
                  })
                );
                tv.position.set(
                  c.x - 1.5 + cc * 1.0,
                  facadeY + 1.0 + r * 0.6,
                  front - 0.05
                );
                scene.add(tv);
              }
            }
          }
        });
      }

      /* ----------------------------------------------------------------
       *  Animated waving flags — replace static flag planes with ones
       *  that sway. We scan existing scene for tracked flags via the
       *  wavingFlags array (populated by flag-creating builders).
       * ---------------------------------------------------------------- */
      function trackWavingFlag(mesh, options = {}) {
        wavingFlags.push({
          mesh,
          baseRotY: mesh.rotation.y,
          amp: options.amp || 0.25,
          speed: options.speed || 2.5,
          phase: Math.random() * Math.PI * 2,
        });
      }

      function animateWavingFlags(t) {
        for (let i = 0; i < wavingFlags.length; i++) {
          const f = wavingFlags[i];
          f.mesh.rotation.y = f.baseRotY + Math.sin(t * f.speed + f.phase) * f.amp;
          // Tiny vertical bob too
          f.mesh.rotation.z = Math.sin(t * f.speed * 1.3 + f.phase) * f.amp * 0.4;
        }
      }

      /* ----------------------------------------------------------------
       *  Mermaid statue + boardwalk back-railing murals + Parade flags
       * ---------------------------------------------------------------- */
      function buildMermaidAndMurals() {
        const baseY = groundMesh.position.y + terrainAmp + 0.05;
        const bwCenterZ = 38;

        // Bronze mermaid statue on a pedestal at boardwalk plaza
        const sg = new THREE.Group();
        sg.position.set(15, baseY, 24);
        const bronzeMat = new THREE.MeshStandardMaterial({
          color: 0xa07840, metalness: 0.65, roughness: 0.5,
        });
        const stoneMat = new THREE.MeshStandardMaterial({
          color: 0x6a6862, roughness: 0.85,
        });
        // Pedestal
        const ped = new THREE.Mesh(
          new THREE.BoxGeometry(2, 1.5, 2), stoneMat
        );
        ped.position.y = 0.75;
        ped.castShadow = true;
        sg.add(ped);
        // Mermaid body — capsule, curved tail (cone)
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.35, 1.2, 4, 6), bronzeMat
        );
        body.position.y = 2.4;
        body.rotation.z = -0.2;
        body.castShadow = true;
        sg.add(body);
        // Tail (cone)
        const tail = new THREE.Mesh(
          new THREE.ConeGeometry(0.4, 1.8, 8), bronzeMat
        );
        tail.position.set(0.4, 1.2, 0);
        tail.rotation.x = 0.4;
        tail.rotation.z = 0.5;
        sg.add(tail);
        // Tail fluke (flattened cone)
        const fluke = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, 0.8, 4), bronzeMat
        );
        fluke.position.set(0.7, 0.5, 0);
        fluke.rotation.z = Math.PI / 2;
        fluke.scale.set(1, 1, 0.3);
        sg.add(fluke);
        // Head
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6), bronzeMat
        );
        head.position.y = 3.3;
        sg.add(head);
        // Plaque
        const plaqueTex = signTexture("CONEY ISLAND MERMAID PARADE", "#3a2810", "#fcd84e", 512, 96);
        const plaqueMat = new THREE.MeshStandardMaterial({
          map: plaqueTex, emissive: 0xffffff, emissiveMap: plaqueTex, emissiveIntensity: 0.2,
        });
        const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), plaqueMat);
        plaque.position.set(0, 1.0, 1.01);
        sg.add(plaque);
        scene.add(sg);

        // Mermaid Parade colorful flags strung across the boardwalk plaza
        const parade = [
          0xff3a8a, 0x4a8ef0, 0xfcd84e, 0x4aff7a, 0xaa3aff,
          0xff8a00, 0x0aaae8, 0xff5a5a,
        ];
        // String runs from x=-100 to x=100 above boardwalk at y=8
        const strandY = baseY + 8;
        const strandZ = bwCenterZ;
        const numFlags = 18;
        for (let i = 0; i < numFlags; i++) {
          const u = i / (numFlags - 1);
          const x = -100 + u * 200;
          const flag = new THREE.Mesh(
            new THREE.PlaneGeometry(2.5, 1.5),
            new THREE.MeshStandardMaterial({
              color: parade[i % parade.length], roughness: 0.6,
              side: THREE.DoubleSide,
            })
          );
          flag.position.set(x, strandY, strandZ);
          flag.castShadow = false;
          scene.add(flag);
          trackWavingFlag(flag, { amp: 0.3, speed: 2 + Math.random() });
        }
        // Cord between flags
        const cord = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 200, 4),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
        );
        cord.rotation.z = Math.PI / 2;
        cord.position.set(0, strandY + 0.6, strandZ);
        scene.add(cord);

        // Painted murals on the BACK of the boardwalk railing (visible from rides plaza)
        const W = groundSize * 0.95;
        const muralPositions = [
          { x: -300, label: "CONEY ISLAND" },
          { x: -200, label: "★ FUN ZONE ★" },
          { x: -100, label: "BROOKLYN" },
          { x: 0, label: "EST. 1847" },
          { x: 100, label: "WAVES" },
          { x: 200, label: "FREAKS" },
          { x: 300, label: "SUMMER" },
        ];
        muralPositions.forEach((m) => {
          // Random colorful background
          const tex = graffitiTexture(Math.floor(m.x + 1000) % 3);
          const mat = new THREE.MeshStandardMaterial({
            map: tex, roughness: 0.8,
          });
          const mural = new THREE.Mesh(
            new THREE.PlaneGeometry(36, 5), mat
          );
          // Position on the north side of the boardwalk railing
          // (so it faces the rides plaza)
          mural.position.set(m.x, baseY + 2.5, bwCenterZ - 7.1);
          mural.rotation.y = Math.PI;
          scene.add(mural);
        });
      }

      /* ----------------------------------------------------------------
       *  Helicopter searchlight beam + rooftop life details
       * ---------------------------------------------------------------- */
      function buildHeliBeamsAndRooftopLife() {
        // Searchlight beam: a long cone pointed down from each helicopter
        helicopters.forEach((h) => {
          const beam = new THREE.Mesh(
            new THREE.ConeGeometry(20, 80, 16, 1, true),
            new THREE.MeshStandardMaterial({
              color: 0xffffe0, transparent: true, opacity: 0.18,
              emissive: 0xffffe0, emissiveIntensity: 0.6,
              side: THREE.DoubleSide, depthWrite: false,
            })
          );
          beam.position.y = -40;
          beam.rotation.x = Math.PI; // point down
          h.mesh.add(beam);
        });

        // Rooftop satellite dishes, additional pigeon clusters,
        // laundry lines on a few nearby apartment buildings.
        const sorted = apartmentPositions
          .map((a) => ({ ...a, _dist: Math.hypot(a.x, a.z + 80) }))
          .sort((x, y) => x._dist - y._dist)
          .slice(0, 40);

        sorted.forEach((b, idx) => {
          const roofY = b.y + b.h / 2;
          // Satellite dish
          if (Math.random() < 0.5) {
            const dish = new THREE.Mesh(
              new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
              new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.5 })
            );
            dish.position.set(
              b.x + (Math.random() - 0.5) * b.w * 0.5,
              roofY + 0.3,
              b.z + (Math.random() - 0.5) * b.d * 0.5
            );
            dish.rotation.x = -Math.PI / 3;
            scene.add(dish);
          }
          // Laundry line (a couple of small fabric squares strung on a thin line)
          if (idx < 12 && Math.random() < 0.5) {
            const linePoints = [
              new THREE.Vector3(b.x - b.w / 2 + 1, roofY + 1.4, b.z),
              new THREE.Vector3(b.x + b.w / 2 - 1, roofY + 1.4, b.z),
            ];
            const cord = new THREE.Mesh(
              new THREE.CylinderGeometry(0.02, 0.02, b.w - 2, 4),
              new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
            );
            cord.rotation.z = Math.PI / 2;
            cord.position.set(b.x, roofY + 1.4, b.z);
            scene.add(cord);
            const laundryColors = [0xeaeaea, 0xc41e3a, 0xfcd84e, 0x4a8a4a, 0x1f4e9c];
            for (let i = 0; i < 5; i++) {
              const item = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.8),
                new THREE.MeshStandardMaterial({
                  color: laundryColors[i], roughness: 0.85,
                  side: THREE.DoubleSide,
                })
              );
              item.position.set(b.x - b.w / 2 + 1.5 + i * (b.w - 3) / 4, roofY + 0.9, b.z);
              scene.add(item);
              trackWavingFlag(item, { amp: 0.15, speed: 1.5 });
            }
          }
          // Pigeon cluster on the parapet (just spheres for distance)
          if (Math.random() < 0.7) {
            const pigeonMat = new THREE.MeshStandardMaterial({
              color: 0x6a7079, roughness: 0.7,
            });
            const numP = 3 + Math.floor(Math.random() * 5);
            for (let i = 0; i < numP; i++) {
              const p = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 5, 4), pigeonMat
              );
              p.scale.set(1, 0.7, 1.4);
              const edgeSide = Math.floor(Math.random() * 4);
              let px = b.x, pz = b.z;
              if (edgeSide === 0) { px += (Math.random() - 0.5) * b.w; pz += b.d / 2 - 0.1; }
              else if (edgeSide === 1) { px += (Math.random() - 0.5) * b.w; pz -= b.d / 2 - 0.1; }
              else if (edgeSide === 2) { px += b.w / 2 - 0.1; pz += (Math.random() - 0.5) * b.d; }
              else { px -= b.w / 2 - 0.1; pz += (Math.random() - 0.5) * b.d; }
              p.position.set(px, roofY + 0.85, pz);
              scene.add(p);
            }
          }
        });
      }

      /* ============================================================
       *  PLAYER MODES — free / BMW / F train
       * ============================================================ */
      let appMode = "menu"; // "menu" | "free" | "bmw" | "ftrain"
      let bmwCar = null; // {group, vel:{x,z}, heading, headingVel, ...}
      let fTrainCar = null; // {group, state, stationIdx, traveled, ...}
      let player = { mesh: null, velY: 0, isGrounded: false };
      const tireSmokeSystem = { points: null, posAttr: null, life: null, idx: 0, max: 200 };

      function showStartMenu() {
        const menu = document.getElementById("start-menu");
        if (menu) menu.classList.remove("hidden");
        const hud = document.getElementById("hud-mode");
        if (hud) hud.classList.add("hidden");
        appMode = "menu";
      }
      function setHudText(text, ctrl) {
        const t = document.getElementById("hud-mode-text");
        const c = document.getElementById("hud-mode-ctrl");
        if (t) t.textContent = text;
        if (c) c.textContent = ctrl;
        const hud = document.getElementById("hud-mode");
        if (hud) hud.classList.remove("hidden");
      }

      function chooseMode(mode) {
        const menu = document.getElementById("start-menu");
        if (menu) menu.classList.add("hidden");
        appMode = mode;
        if (mode === "free") {
          setHudText("FREE EXPLORE · FLY CAM",
            "WASD move · Mouse look · Space/Shift up/down · ESC menu");
          // Hide the walking player — this is fly-cam mode
          if (player.mesh) player.mesh.visible = false;
          camera.position.set(0, 80, 180);
          lookState.lat = -12;
          lookState.lon = -90;
          updateCameraLook();
          if (bmwCar) bmwCar.group.visible = true;
          if (fTrainCar) fTrainCar.group.visible = true;
        } else if (mode === "bmw") {
          setHudText("DRIVING · 2006 BMW 5 SERIES (E60)",
            "W / S gas+brake · A / D steer · SHIFT handbrake (drift!) · Mouse look · V exit vehicle · ESC menu");
          if (player.mesh) player.mesh.visible = false;
          if (bmwCar) {
            bmwCar.group.visible = true;
            // Always reset to the street spawn on entry. updateBMW uses
            // velX/velZ/heading internally — initialise them safely.
            bmwCar.group.position.set(-450, streetLevelY, 30);
            bmwCar.heading = Math.PI / 2;
            bmwCar.group.rotation.y = bmwCar.heading;
            bmwCar.vel = 0;
            bmwCar.velX = 0;
            bmwCar.velZ = 0;
            bmwCar.steer = 0;
            lookState.lat = -8;
          }
          if (fTrainCar) fTrainCar.group.visible = true;
        } else if (mode === "ftrain") {
          setHudText("F TRAIN · INBOUND TO STILLWELL AVE",
            "Mouse to look around · Look across to see the other window · ESC menu");
          if (player.mesh) player.mesh.visible = false;
          if (fTrainCar) {
            fTrainCar.group.visible = true;
            if (fTrainCar.stationIdx === undefined) {
              // Start at first station (Brighton Beach east end)
              fTrainCar.state = "departing";
              fTrainCar.stationIdx = 0;
              fTrainCar.dwellTimer = 0;
              const firstStationX = fTrainCar.stations[0].x;
              fTrainCar.group.position.set(firstStationX + 5, groundMesh.position.y + terrainAmp + 19, -70);
              fTrainCar.group.rotation.y = Math.PI / 2;
              fTrainCar.speed = 0;
            }
            // Reset look to look out south window
            lookState.lon = -90;
            lookState.lat = 0;
          }
          if (bmwCar) bmwCar.group.visible = true;
        }
      }

      /* ----------------------------------------------------------------
       *  Tire smoke particle pool (shared across both rear wheels)
       * ---------------------------------------------------------------- */
      function initTireSmoke() {
        const sys = tireSmokeSystem;
        const positions = new Float32Array(sys.max * 3);
        // Hide all initially by placing far below ground
        for (let i = 0; i < sys.max; i++) {
          positions[i * 3 + 1] = -1000;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
          color: 0xeeeeee, size: 1.4, transparent: true, opacity: 0.6,
          depthWrite: false, sizeAttenuation: true,
        });
        sys.points = new THREE.Points(geom, mat);
        sys.posAttr = geom.attributes.position;
        sys.life = new Float32Array(sys.max);
        sys.vel = new Float32Array(sys.max * 3);
        scene.add(sys.points);
      }

      function emitTireSmoke(worldX, worldZ, headingX, headingZ) {
        const sys = tireSmokeSystem;
        if (!sys.points) return;
        const i = sys.idx;
        sys.idx = (sys.idx + 1) % sys.max;
        const baseY = streetLevelY + 0.05;
        sys.posAttr.array[i * 3] = worldX + (Math.random() - 0.5) * 0.5;
        sys.posAttr.array[i * 3 + 1] = baseY;
        sys.posAttr.array[i * 3 + 2] = worldZ + (Math.random() - 0.5) * 0.5;
        // Initial velocity: backward + slight up
        sys.vel[i * 3] = -headingX * (1.5 + Math.random()) + (Math.random() - 0.5) * 0.6;
        sys.vel[i * 3 + 1] = 0.8 + Math.random() * 0.6;
        sys.vel[i * 3 + 2] = -headingZ * (1.5 + Math.random()) + (Math.random() - 0.5) * 0.6;
        sys.life[i] = 1.0; // 1 second life
      }

      function animateTireSmoke(delta) {
        const sys = tireSmokeSystem;
        if (!sys.points) return;
        const arr = sys.posAttr.array;
        for (let i = 0; i < sys.max; i++) {
          if (sys.life[i] > 0) {
            sys.life[i] -= delta;
            arr[i * 3] += sys.vel[i * 3] * delta;
            arr[i * 3 + 1] += sys.vel[i * 3 + 1] * delta;
            arr[i * 3 + 2] += sys.vel[i * 3 + 2] * delta;
            // Decay velocity
            sys.vel[i * 3] *= 0.95;
            sys.vel[i * 3 + 1] *= 0.95;
            sys.vel[i * 3 + 2] *= 0.95;
            if (sys.life[i] <= 0) arr[i * 3 + 1] = -1000;
          }
        }
        sys.posAttr.needsUpdate = true;
      }

      function buildPlayer() {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
            color: 0x3366ff, roughness: 0.8, metalness: 0.1
        });
        // Capsule body
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), mat);
        body.position.y = 0.9; // Capsule is 1.8 tall, center is at 0.9
        body.castShadow = true;
        g.add(body);
        
        // Add a "head" to indicate direction
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xffccaa, roughness: 0.5
        });
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), headMat);
        head.position.set(0, 1.6, 0.2); // slightly forward to show facing direction
        head.castShadow = true;
        g.add(head);

        g.position.set(-455, 10, 30); // Spawn in the sky, gravity will pull down
        scene.add(g);
        player.mesh = g;
        g.visible = false;
      }

      /* ----------------------------------------------------------------
       *  Build a 2006 BMW 5 Series (E60) — detailed sedan model
       * ---------------------------------------------------------------- */
      function buildBMW() {
        const g = new THREE.Group();
        g.visible = false;
        // E60 is dark gray metallic — classic
        const bodyColor = 0x1a1f24;
        const bodyMat = new THREE.MeshPhysicalMaterial({
          color: bodyColor, metalness: 0.85, roughness: 0.28,
          clearcoat: 1.0, clearcoatRoughness: 0.08,
          envMapIntensity: 1.4,
        });
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0x101418, metalness: 0.3, roughness: 0.08,
          transmission: 0.0, opacity: 0.85, transparent: true,
          envMapIntensity: 1.2,
        });
        const chromeMat = new THREE.MeshStandardMaterial({
          color: 0xdadcd8, metalness: 0.95, roughness: 0.18,
        });
        const blackPlasticMat = new THREE.MeshStandardMaterial({
          color: 0x0a0d0f, roughness: 0.55, metalness: 0.2,
        });
        const rubberMat = new THREE.MeshStandardMaterial({
          color: 0x0c0d0e, roughness: 0.95, metalness: 0.05,
        });
        const rimMat = new THREE.MeshStandardMaterial({
          color: 0xa8a8a8, metalness: 0.85, roughness: 0.25,
        });
        const haloMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: 0xfaf8f2, emissiveIntensity: 1.4,
        });
        const tailMat = new THREE.MeshStandardMaterial({
          color: 0xc41e3a, emissive: 0xc41e3a, emissiveIntensity: 0.45,
        });

        // Body — three tiers: lower body, mid cabin, upper roof
        // Lower body (most of the chassis)
        const lower = new THREE.Mesh(
          new THREE.BoxGeometry(4.85, 0.9, 1.85), bodyMat
        );
        lower.position.y = 0.55;
        lower.castShadow = true;
        lower.receiveShadow = true;
        g.add(lower);

        // Mid cabin (slightly narrower, tapered)
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.7, 1.75), bodyMat
        );
        cabin.position.set(-0.15, 1.30, 0);
        cabin.castShadow = true;
        g.add(cabin);

        // Roof
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 0.05, 1.6), bodyMat
        );
        roof.position.set(-0.15, 1.68, 0);
        g.add(roof);

        // Hood — slight bulge at front
        const hood = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.08, 1.7), bodyMat
        );
        hood.position.set(1.3, 0.99, 0);
        g.add(hood);

        // Trunk lid
        const trunk = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.05, 1.78), bodyMat
        );
        trunk.position.set(-1.55, 1.0, 0);
        g.add(trunk);

        // Windows — windshield, rear window, side windows
        // Windshield (sloped)
        const windshield = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 0.85), glassMat
        );
        windshield.position.set(0.95, 1.32, 0);
        windshield.rotation.y = Math.PI / 2;
        windshield.rotation.x = Math.PI / 2;
        windshield.rotation.z = -0.4;
        g.add(windshield);

        // Side windows (left + right) — tinted strips
        [-0.88, 0.88].forEach((dz) => {
          const sw = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 0.55), glassMat
          );
          sw.position.set(-0.15, 1.36, dz);
          sw.rotation.y = dz > 0 ? 0 : Math.PI;
          g.add(sw);
        });

        // Rear window
        const rearWin = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, 0.7), glassMat
        );
        rearWin.position.set(-1.2, 1.32, 0);
        rearWin.rotation.y = -Math.PI / 2;
        rearWin.rotation.x = Math.PI / 2;
        rearWin.rotation.z = 0.45;
        g.add(rearWin);

        // BMW kidney grille — two black ovals with chrome surround
        const grilleAssembly = new THREE.Group();
        grilleAssembly.position.set(2.42, 0.7, 0);
        [-0.32, 0.32].forEach((dz) => {
          const kidney = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.35, 0.5), blackPlasticMat
          );
          kidney.position.set(0, 0, dz);
          grilleAssembly.add(kidney);
          // Chrome surround
          const surround = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.38, 0.54), chromeMat
          );
          surround.position.set(0.02, 0, dz);
          grilleAssembly.add(surround);
          // Vertical slats inside kidney
          for (let i = 0; i < 7; i++) {
            const slat = new THREE.Mesh(
              new THREE.BoxGeometry(0.02, 0.32, 0.03), chromeMat
            );
            slat.position.set(0.04, 0, dz - 0.22 + i * 0.07);
            grilleAssembly.add(slat);
          }
        });
        g.add(grilleAssembly);

        // BMW roundel on hood
        const roundel = new THREE.Mesh(
          new THREE.CircleGeometry(0.12, 16),
          new THREE.MeshStandardMaterial({
            color: 0x1a3a8a, metalness: 0.6, roughness: 0.3,
            emissive: 0x1a3a8a, emissiveIntensity: 0.1,
          })
        );
        roundel.position.set(2.43, 0.98, 0);
        roundel.rotation.y = Math.PI / 2;
        g.add(roundel);

        // Halo "angel-eye" headlights — E60's signature
        // Two round halos per side stacked horizontally
        [-0.55, 0.55].forEach((dz) => {
          // Outer halo
          const halo1 = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.04, 8, 18), haloMat
          );
          halo1.position.set(2.43, 0.85, dz - 0.12);
          halo1.rotation.y = Math.PI / 2;
          g.add(halo1);
          bulbMeshes.push(halo1);
          // Inner halo (smaller, adjacent)
          const halo2 = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.035, 8, 18), haloMat
          );
          halo2.position.set(2.43, 0.85, dz + 0.12);
          halo2.rotation.y = Math.PI / 2;
          g.add(halo2);
          bulbMeshes.push(halo2);
          // Housing (black behind halos)
          const housing = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.4, 0.7), blackPlasticMat
          );
          housing.position.set(2.41, 0.85, dz);
          g.add(housing);
        });

        // Tail lights — red strips on the back
        [-0.6, 0.6].forEach((dz) => {
          const tail = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.18, 0.5), tailMat
          );
          tail.position.set(-2.41, 0.88, dz);
          g.add(tail);
          bulbMeshes.push(tail);
        });

        // Lower bumper/spoiler
        const fBumper = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.32, 1.9), blackPlasticMat
        );
        fBumper.position.set(2.4, 0.32, 0);
        g.add(fBumper);
        const rBumper = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.32, 1.9), blackPlasticMat
        );
        rBumper.position.set(-2.4, 0.32, 0);
        g.add(rBumper);

        // Side mirrors
        [-0.95, 0.95].forEach((dz) => {
          const mount = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.06, 0.1), bodyMat
          );
          mount.position.set(0.85, 1.20, dz);
          g.add(mount);
          const mirror = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.16, 0.12), bodyMat
          );
          mirror.position.set(0.85, 1.22, dz + (dz > 0 ? 0.13 : -0.13));
          mirror.castShadow = true;
          g.add(mirror);
          const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(0.18, 0.12), glassMat
          );
          glass.position.set(0.74, 1.22, dz + (dz > 0 ? 0.13 : -0.13));
          glass.rotation.y = Math.PI / 2 + (dz > 0 ? -0.1 : 0.1);
          g.add(glass);
        });

        // License plate (rear)
        const plateTex = signTexture("DR1V3 2C1", "#ffffff", "#1a1a1a", 256, 96);
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 0.22),
          new THREE.MeshStandardMaterial({
            map: plateTex, side: THREE.DoubleSide, roughness: 0.6,
          })
        );
        plate.position.set(-2.43, 0.55, 0);
        plate.rotation.y = -Math.PI / 2;
        g.add(plate);

        // Door lines (subtle grooves) — represented as thin dark slivers
        [-0.4, -1.0].forEach((dx) => {
          [-0.93, 0.93].forEach((dz) => {
            const line = new THREE.Mesh(
              new THREE.BoxGeometry(0.02, 0.85, 0.02), blackPlasticMat
            );
            line.position.set(dx, 0.95, dz);
            g.add(line);
          });
        });

        // Exhaust tips (dual)
        [-0.4, 0.4].forEach((dz) => {
          const exhaust = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), chromeMat
          );
          exhaust.position.set(-2.45, 0.32, dz);
          exhaust.rotation.z = Math.PI / 2;
          g.add(exhaust);
        });

        // Wheels — 4 corners
        // Tire: torus, Rim: thin cylinder, "spokes": 5 boxes
        const wheels = [];
        const wheelPositions = [
          [1.55, 0.42, 0.9, "FL"],
          [1.55, 0.42, -0.9, "FR"],
          [-1.55, 0.42, 0.9, "BL"],
          [-1.55, 0.42, -0.9, "BR"],
        ];
        wheelPositions.forEach(([wx, wy, wz, name]) => {
          const wg = new THREE.Group();
          wg.position.set(wx, wy, wz);
          // Tire
          const tire = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.13, 8, 18), rubberMat
          );
          tire.rotation.y = Math.PI / 2;
          tire.castShadow = true;
          wg.add(tire);
          // Rim disc
          const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16), rimMat
          );
          rim.rotation.z = Math.PI / 2;
          wg.add(rim);
          // Center cap (with mini roundel)
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.19, 12),
            new THREE.MeshStandardMaterial({ color: 0x1a3a8a, metalness: 0.5, roughness: 0.4 })
          );
          cap.rotation.z = Math.PI / 2;
          wg.add(cap);
          // 5 alloy spokes
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const spoke = new THREE.Mesh(
              new THREE.BoxGeometry(0.18, 0.04, 0.55), rimMat
            );
            spoke.position.set(0, Math.sin(a) * 0.15, Math.cos(a) * 0.15);
            spoke.rotation.x = a;
            wg.add(spoke);
          }
          g.add(wg);
          wheels.push({ group: wg, name });
        });

        scene.add(g);
        bmwCar = {
          group: g,
          vel: 0,
          steer: 0,
          wheels,
          maxSpeed: 36,
          accel: 12,
          brake: 22,
          steerMax: 0.6,
        };
        return g;
      }

      function updateBMW(delta) {
        if (!bmwCar) return;
        const c = bmwCar;

        // Initialize advanced physics state if missing
        if (c.heading === undefined) c.heading = c.group.rotation.y;
        if (c.velX === undefined) c.velX = 0;
        if (c.velZ === undefined) c.velZ = 0;

        const throttle = moveState.forward - moveState.backward;
        const steerInput = moveState.left - moveState.right;

        // Throttle/brake
        let accelForce = 0;
        if (throttle > 0) {
          accelForce = c.accel;
        } else if (throttle < 0) {
          accelForce = -c.brake * 1.5; // Strong brakes
        }

        // Apply throttle to local forward velocity (vel is magnitude)
        if (throttle !== 0) {
            c.vel += accelForce * delta;
        } else {
            // Drag / Friction
            c.vel *= (1.0 - 1.5 * delta); 
        }
        c.vel = THREE.MathUtils.clamp(c.vel, -c.maxSpeed * 0.4, c.maxSpeed);

        // Steering — GTA style aggressive drift
        // Turn rate depends on speed, but allows snapping the car sideways
        const targetSteer = steerInput * c.steerMax;
        c.steer = THREE.MathUtils.lerp(c.steer, targetSteer, delta * 12);
        
        // Snappy heading rotation for drifting feeling
        const turnRate = c.steer * Math.max(0.5, Math.abs(c.vel) / c.maxSpeed) * 2.5;
        c.heading += turnRate * delta;
        c.group.rotation.y = c.heading;

        // Velocity vector lerps towards heading (slip angle / drifting)
        // High speed + sharp turn = more slip (lower lerp factor)
        const slipFactor = Math.max(2.0, 10.0 - Math.abs(c.steer) * 8.0);
        
        const idealVelX = Math.sin(c.heading) * c.vel * -1;
        const idealVelZ = Math.cos(c.heading) * c.vel * -1;

        c.velX = THREE.MathUtils.lerp(c.velX, idealVelX, delta * slipFactor);
        c.velZ = THREE.MathUtils.lerp(c.velZ, idealVelZ, delta * slipFactor);

        let nextX = c.group.position.x + c.velX * delta;
        let nextZ = c.group.position.z + c.velZ * delta;

        // Basic collision check (prevent driving into the dense city blocks)
        // Buildings are typically away from Z=30 (street). Let's keep the car on the roads.
        // We know roads are at Z ~ 30, and cross streets exist.
        // A simple approach: limit Z if X is not near a cross street.
        // Or simply bounce off buildings using the global arrays!
        let collision = false;
        const checkCollision = (arr) => {
            if (!arr || collision) return;
            for (let i = 0; i < arr.length; i++) {
                const b = arr[i];
                if (Math.abs(nextX - b.x) < b.w / 2 + 1.5 && Math.abs(nextZ - b.z) < b.d / 2 + 1.5) {
                    collision = true;
                    break;
                }
            }
        };
        // Use global arrays populated in generateBuildings
        if (typeof cafePositions !== "undefined") checkCollision(cafePositions);
        if (typeof brownstonePositions !== "undefined") checkCollision(brownstonePositions);
        if (typeof apartmentPositions !== "undefined") checkCollision(apartmentPositions);

        if (collision) {
            c.vel *= 0.5; // crash penalty
            c.velX *= -0.5; // bounce
            c.velZ *= -0.5;
            nextX = c.group.position.x + c.velX * delta;
            nextZ = c.group.position.z + c.velZ * delta;
        }

        c.group.position.x = nextX;
        c.group.position.z = nextZ;

        // Lock car to the flat street plane (not the undulating terrain).
        // streetLevelY puts wheel bottoms exactly on the asphalt.
        c.group.position.y = streetLevelY;

        // Emit tire smoke when slipping hard (drift) or handbraking with motion.
        // Slip = magnitude of velocity component perpendicular to heading.
        const speed = Math.sqrt(c.velX * c.velX + c.velZ * c.velZ);
        if (speed > 4) {
          // Forward direction in world XZ
          const fwdX = -Math.sin(c.heading);
          const fwdZ = -Math.cos(c.heading);
          // Lateral direction (right of car)
          const rightX = fwdZ;
          const rightZ = -fwdX;
          const lateralSpeed = Math.abs(c.velX * rightX + c.velZ * rightZ);
          const isHandbrake = moveState.down > 0; // SHIFT key
          const isDrifting = lateralSpeed > 3 || (isHandbrake && speed > 5);
          if (isDrifting) {
            // Emit from each rear wheel
            const rearOffset = 1.55; // local rear wheel X position
            // Rear wheel world positions (rotate local -1.55 X by heading)
            const rearLocalX = -1.55;
            [-0.9, 0.9].forEach((lz) => {
              const wx = c.group.position.x + Math.cos(c.heading) * rearLocalX - Math.sin(c.heading) * lz;
              const wz = c.group.position.z + Math.sin(c.heading) * rearLocalX + Math.cos(c.heading) * lz;
              emitTireSmoke(wx, wz, fwdX, fwdZ);
              emitTireSmoke(wx, wz, fwdX, fwdZ);
            });
          }
        }

        // Rotate wheels
        const wheelSpin = speed * delta * 2.4 * Math.sign(c.vel);
        c.wheels.forEach((w) => {
          w.group.children.forEach((child) => {
            if (child.geometry?.type === "TorusGeometry" || child.geometry?.type === "CylinderGeometry") {
              child.rotation.x = (child.rotation.x || 0) + wheelSpin;
            }
          });
          if (w.name === "FL" || w.name === "FR") {
            // Front wheels match steer angle visually
            w.group.rotation.y = c.steer * 1.5; 
          }
        });

        // Dynamic Chase Camera - GTA Style
        // Camera looks at car, positioned behind it along the velocity vector to show drifts!
        const speedRatio = Math.abs(c.vel) / c.maxSpeed;
        
        // Calculate velocity direction (fallback to heading if stopped)
        let travelHeading = c.heading;
        if (Math.abs(c.vel) > 1.0) {
            travelHeading = Math.atan2(-c.velX, -c.velZ);
        }
        
        const back = new THREE.Vector3(
          Math.sin(travelHeading), 0, Math.cos(travelHeading)
        ).multiplyScalar(7.5 + speedRatio * 3.0); // Pulls back further at high speeds
        
        const targetCamPos = new THREE.Vector3(
          c.group.position.x + back.x,
          c.group.position.y + 3.0 + speedRatio * 1.0,
          c.group.position.z + back.z
        );
        camera.position.lerp(targetCamPos, Math.min(1, delta * 5));
        
        const lookAt = new THREE.Vector3(
          c.group.position.x,
          c.group.position.y + 1.2,
          c.group.position.z
        );
        camera.lookAt(lookAt);
      }

      /* ----------------------------------------------------------------
       *  Build the F train R160 car — exterior + interior
       * ---------------------------------------------------------------- */
      function buildFTrain() {
        const g = new THREE.Group();
        g.visible = false;

        // Exterior — silver/aluminum body
        const bodyL = 18.3, bodyH = 3.5, bodyW = 3.0;
        const skinMat = new THREE.MeshPhysicalMaterial({
          color: 0xc8ccd0, metalness: 0.7, roughness: 0.3,
          clearcoat: 0.4, clearcoatRoughness: 0.3,
          envMapIntensity: 1.0,
        });
        const exterior = new THREE.Mesh(
          new THREE.BoxGeometry(bodyL, bodyH, bodyW), skinMat
        );
        exterior.position.y = bodyH / 2;
        exterior.castShadow = true;
        exterior.receiveShadow = true;
        g.add(exterior);

        // Ceiling/roof rib
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(bodyL, 0.18, bodyW + 0.1),
          new THREE.MeshStandardMaterial({ color: 0xa8acb0, roughness: 0.7 })
        );
        roof.position.y = bodyH + 0.05;
        g.add(roof);

        // Orange F bullet on the side
        const fBulletTex = signTexture("F", "#ff6319", "#ffffff", 256, 256);
        const bulletMat = new THREE.MeshStandardMaterial({
          map: fBulletTex, emissive: 0xffffff, emissiveMap: fBulletTex,
          emissiveIntensity: 0.4,
        });
        [-1, 1].forEach((side) => {
          const bullet = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), bulletMat);
          bullet.position.set(0, bodyH * 0.55, side * (bodyW / 2 + 0.01));
          if (side < 0) bullet.rotation.y = Math.PI;
          g.add(bullet);
        });

        // Window strips on both sides (long horizontal windows)
        const winMat = new THREE.MeshPhysicalMaterial({
          color: 0x1a2a3a, metalness: 0.4, roughness: 0.1,
          transmission: 0.9, opacity: 0.4, transparent: true,
          side: THREE.DoubleSide, envMapIntensity: 1.0
        });
        [-1, 1].forEach((side) => {
          const winStrip = new THREE.Mesh(
            new THREE.PlaneGeometry(bodyL - 2, 1.0), winMat
          );
          winStrip.position.set(0, bodyH * 0.55, side * (bodyW / 2 + 0.02));
          if (side < 0) winStrip.rotation.y = Math.PI;
          g.add(winStrip);
          // Window frames — vertical dividers
          for (let i = -7; i <= 7; i++) {
            const divider = new THREE.Mesh(
              new THREE.BoxGeometry(0.1, 1.2, 0.02), skinMat
            );
            divider.position.set(i * 1.1, bodyH * 0.55, side * (bodyW / 2 + 0.03));
            g.add(divider);
          }
        });

        // Doors (closed) — 4 sets per side
        const doorMat = new THREE.MeshStandardMaterial({
          color: 0x6a6e72, metalness: 0.5, roughness: 0.4,
        });
        const doorPositions = [-6, -2, 2, 6];
        doorPositions.forEach((dx) => {
          [-1, 1].forEach((side) => {
            const door = new THREE.Mesh(
              new THREE.BoxGeometry(1.6, 2.4, 0.04), doorMat
            );
            door.position.set(dx, 1.4, side * (bodyW / 2 + 0.04));
            g.add(door);
            // Door split line
            const split = new THREE.Mesh(
              new THREE.BoxGeometry(0.04, 2.4, 0.06), skinMat
            );
            split.position.set(dx, 1.4, side * (bodyW / 2 + 0.05));
            g.add(split);
          });
        });

        // Interior — visible through windows
        const interior = new THREE.Group();
        interior.position.set(0, 0, 0);
        // Floor
        const floor = new THREE.Mesh(
          new THREE.BoxGeometry(bodyL - 0.3, 0.08, bodyW - 0.3),
          new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.85 })
        );
        floor.position.y = 0.4;
        interior.add(floor);
        // Ceiling (white with fluorescent strips)
        const ceiling = new THREE.Mesh(
          new THREE.BoxGeometry(bodyL - 0.3, 0.08, bodyW - 0.3),
          new THREE.MeshStandardMaterial({
            color: 0xfaf8f2, emissive: 0xfff6e0, emissiveIntensity: 0.4,
            roughness: 0.7,
          })
        );
        ceiling.position.y = bodyH - 0.2;
        interior.add(ceiling);
        bulbMeshes.push(ceiling);
        // Side walls (interior) — light gray
        [-1, 1].forEach((side) => {
          const wall = new THREE.Mesh(
            new THREE.PlaneGeometry(bodyL - 0.3, bodyH - 0.5),
            new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.8 })
          );
          wall.position.set(0, bodyH / 2, side * (bodyW / 2 - 0.15));
          wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          interior.add(wall);
        });

        // Bench seats — long row each side, blue/orange/teal MTA seats
        const seatColors = [0x1a4a8a, 0xff6319, 0x0aa8c4, 0x1a4a8a, 0xff6319, 0x0aa8c4];
        [-1, 1].forEach((side) => {
          for (let i = 0; i < 6; i++) {
            const sx = -bodyL / 2 + 1.5 + i * 2.8;
            // Skip seat near doors
            if (doorPositions.some((dx) => Math.abs(sx - dx) < 0.9)) continue;
            // Seat base
            const seat = new THREE.Mesh(
              new THREE.BoxGeometry(2.2, 0.12, 0.6),
              new THREE.MeshStandardMaterial({
                color: seatColors[i % seatColors.length],
                roughness: 0.65, metalness: 0.1,
              })
            );
            seat.position.set(sx, 0.95, side * (bodyW / 2 - 0.45));
            interior.add(seat);
            // Backrest (against side wall)
            const back = new THREE.Mesh(
              new THREE.BoxGeometry(2.2, 0.9, 0.08),
              new THREE.MeshStandardMaterial({
                color: seatColors[i % seatColors.length],
                roughness: 0.65, metalness: 0.1,
              })
            );
            back.position.set(sx, 1.45, side * (bodyW / 2 - 0.18));
            interior.add(back);
          }
        });

        // Stainless steel poles + hand straps
        const poleMat = new THREE.MeshStandardMaterial({
          color: 0xdadcd8, metalness: 0.85, roughness: 0.2,
        });
        for (let i = -7; i <= 7; i += 2) {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, bodyH - 0.4, 8), poleMat
          );
          pole.position.set(i, bodyH / 2, 0);
          interior.add(pole);
        }
        // Horizontal hand-strap bars
        [-1, 1].forEach((side) => {
          const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, bodyL - 2, 8), poleMat
          );
          rail.rotation.z = Math.PI / 2;
          rail.position.set(0, bodyH - 0.65, side * 0.6);
          interior.add(rail);
          // Hanging straps
          for (let i = -8; i <= 8; i++) {
            const strap = new THREE.Mesh(
              new THREE.BoxGeometry(0.04, 0.45, 0.04),
              new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.6 })
            );
            strap.position.set(i * 1.1, bodyH - 0.92, side * 0.6);
            interior.add(strap);
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.08, 0.015, 4, 8),
              new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 })
            );
            ring.position.set(i * 1.1, bodyH - 1.18, side * 0.6);
            ring.rotation.x = Math.PI / 2;
            interior.add(ring);
          }
        });

        // Advertising panels above the windows (interior)
        const adColors = [0xc41e3a, 0xfcd84e, 0x0a3a8a, 0xff6319];
        const adTexts = ["DR. SO YO BUNION CLINIC · CALL 718-555-FEET",
          "INJURED? CALL THE LAWYER · 1-800-WIN-CASH",
          "GUARDIAN MORTGAGE · YOUR HOME · YOUR FUTURE",
          "MISS NEW YORK PAGEANT · TRYOUTS THIS JUNE"];
        [-1, 1].forEach((side) => {
          for (let i = 0; i < 4; i++) {
            const t = signTexture(
              adTexts[i % adTexts.length],
              "#" + adColors[i % adColors.length].toString(16).padStart(6, "0"),
              "#ffffff", 1024, 128
            );
            const ad = new THREE.Mesh(
              new THREE.PlaneGeometry(3.5, 0.5),
              new THREE.MeshStandardMaterial({
                map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5,
              })
            );
            ad.position.set(-bodyL / 2 + 3 + i * 4.5, bodyH - 0.35, side * (bodyW / 2 - 0.2));
            ad.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            interior.add(ad);
          }
        });

        // Passenger figures sitting on benches
        [-1, 1].forEach((side) => {
          for (let i = 0; i < 8; i++) {
            const sx = -bodyL / 2 + 2 + i * 2.0 + (Math.random() - 0.5) * 0.5;
            if (doorPositions.some((dx) => Math.abs(sx - dx) < 1.2)) continue;
            const passenger = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.28, 1.0, 4, 5),
              new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.5, 0.5),
                roughness: 0.85,
              })
            );
            passenger.position.set(sx, 1.5, side * (bodyW / 2 - 0.5));
            interior.add(passenger);
          }
        });

        // Standing passengers (between benches)
        for (let i = 0; i < 6; i++) {
          const sx = -bodyL / 2 + 3 + i * 2.5;
          const sz = (Math.random() - 0.5) * 0.6;
          const stander = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.2, 4, 6),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5),
              roughness: 0.85,
            })
          );
          stander.position.set(sx, 1.55, sz);
          interior.add(stander);
        }

        // Front conductor cab (front end)
        const cabWall = new THREE.Mesh(
          new THREE.PlaneGeometry(bodyW - 0.3, bodyH - 0.5),
          new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.8 })
        );
        cabWall.position.set(-bodyL / 2 + 0.5, bodyH / 2, 0);
        cabWall.rotation.y = Math.PI / 2;
        interior.add(cabWall);

        g.add(interior);
        scene.add(g);

        // F-line station route — west-bound to Stillwell
        // Real Brooklyn F-line south of Avenue X: Avenue X → Neptune Av →
        // West 8 St (NY Aquarium) → Coney Island-Stillwell Av. We sample
        // four stops along the elevated section of our scene.
        const stations = [
          { name: "AVENUE X",                     x:  720 },
          { name: "NEPTUNE AV",                   x:  340 },
          { name: "W 8 ST · NY AQUARIUM",         x:  -60 },
          { name: "CONEY ISLAND · STILLWELL AV",  x: -460 },
        ];
        fTrainCar = {
          group: g,
          stations,
          stationIdx: 0,
          state: "departing", // "departing" | "cruising" | "arriving" | "dwelling"
          dwellTimer: 0,
          speed: 0,
          maxSpeed: 72,
          accel: 18,
          brake: 14,
          bodyL,
          bodyH,
        };
        return g;
      }

      /* ----------------------------------------------------------------
       *  Build station platforms (elevated) for each F-line stop.
       *  These appear at trackside so you see them through the window.
       * ---------------------------------------------------------------- */
      function buildFLineStations(stations) {
        if (!stations) return;
        const baseY = groundMesh.position.y + terrainAmp;
        const platformY = baseY + 18;
        const platMat = new THREE.MeshStandardMaterial({
          color: 0x9a9da2, roughness: 0.85,
        });
        const tileMat = new THREE.MeshStandardMaterial({
          color: 0xb8bcc0, roughness: 0.55, metalness: 0.1,
        });
        const canopyMat = new THREE.MeshStandardMaterial({
          color: 0x4a3220, roughness: 0.85,
        });
        const beamMat = new THREE.MeshStandardMaterial({
          color: 0x5a6470, metalness: 0.4, roughness: 0.6,
        });
        const stripMat = new THREE.MeshStandardMaterial({
          color: 0xfcd84e, roughness: 0.4,
          emissive: 0xfcd84e, emissiveIntensity: 0.2,
        });

        stations.forEach((st, idx) => {
          // Skip Stillwell — we already have the big terminal there
          if (idx === stations.length - 1) return;
          const g = new THREE.Group();
          g.position.set(st.x, 0, -70);

          const platLen = 70;
          const platDepth = 8;
          // Two platforms (one each side of tracks)
          [-1, 1].forEach((side) => {
            const platZ = side * (3.5 + platDepth / 2);
            // Platform deck
            const deck = new THREE.Mesh(
              new THREE.BoxGeometry(platLen, 0.6, platDepth), platMat
            );
            deck.position.set(0, platformY, platZ);
            deck.castShadow = true;
            deck.receiveShadow = true;
            g.add(deck);
            // Yellow safety stripe along track edge
            const stripe = new THREE.Mesh(
              new THREE.BoxGeometry(platLen, 0.05, 0.8), stripMat
            );
            stripe.position.set(0, platformY + 0.35, platZ - side * (platDepth / 2 - 0.4));
            g.add(stripe);
            // Brown wood-look canopy roof
            const canopy = new THREE.Mesh(
              new THREE.BoxGeometry(platLen, 0.4, platDepth + 1), canopyMat
            );
            canopy.position.set(0, platformY + 5, platZ);
            canopy.castShadow = true;
            g.add(canopy);
            // Canopy support columns
            for (let i = -3; i <= 3; i++) {
              const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 4.6, 0.3), beamMat
              );
              post.position.set(i * (platLen / 7), platformY + 2.5, platZ + side * (platDepth / 2 - 0.4));
              post.castShadow = true;
              g.add(post);
            }
            // Station name signage (back wall facing the train)
            const tex = signTexture(st.name, "#000000", "#ffffff", 1024, 96);
            const sigMat = new THREE.MeshStandardMaterial({
              map: tex, emissive: 0xffffff, emissiveMap: tex,
              emissiveIntensity: 0.6, side: THREE.DoubleSide,
            });
            const sig = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.6), sigMat);
            sig.position.set(0, platformY + 3.5, platZ + side * (platDepth / 2 - 0.5));
            sig.rotation.y = side > 0 ? Math.PI : 0;
            g.add(sig);
            // Trackside benches with a few waiting passengers
            for (let i = 0; i < 3; i++) {
              const benchX = -platLen / 3 + i * (platLen / 3);
              const bench = new THREE.Mesh(
                new THREE.BoxGeometry(2.2, 0.4, 0.6),
                new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.85 })
              );
              bench.position.set(benchX, platformY + 0.55, platZ);
              g.add(bench);
              if (Math.random() > 0.4) {
                const wait = new THREE.Mesh(
                  new THREE.CapsuleGeometry(0.3, 1.0, 4, 6),
                  new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(Math.random(), 0.5, 0.5),
                    roughness: 0.85,
                  })
                );
                wait.position.set(benchX + (Math.random() - 0.5) * 1.2, platformY + 1.05, platZ);
                g.add(wait);
              }
            }
          });

          // Track-end lights to read in the dark
          [-platLen / 2, platLen / 2].forEach((dx) => {
            const lampBulb = new THREE.Mesh(
              new THREE.SphereGeometry(0.25, 8, 6),
              new THREE.MeshStandardMaterial({
                color: 0xfff6c8, emissive: 0xffd07a, emissiveIntensity: 0.5,
              })
            );
            lampBulb.position.set(dx, platformY + 4.6, 0);
            g.add(lampBulb);
            bulbMeshes.push(lampBulb);
          });

          scene.add(g);
        });
      }

      function updateFTrain(delta, t) {
        if (!fTrainCar || appMode !== "ftrain") return;
        const c = fTrainCar;

        const targetStation = c.stations[c.stationIdx];
        const distToStation = c.group.position.x - targetStation.x;
        // We always travel west (toward -X) since stations are sorted by descending x

        if (c.state === "departing") {
          c.speed = Math.min(c.maxSpeed, c.speed + c.accel * delta);
          if (distToStation < 80) c.state = "arriving";
          else c.state = "cruising";
        } else if (c.state === "cruising") {
          c.speed = Math.min(c.maxSpeed, c.speed + c.accel * 0.4 * delta);
          if (distToStation < 80) c.state = "arriving";
        } else if (c.state === "arriving") {
          // Decelerate proportionally to distance
          const targetSpeed = Math.max(0.4, distToStation * 0.35);
          c.speed = Math.min(c.speed, targetSpeed);
          c.speed = Math.max(0, c.speed - c.brake * delta);
          if (distToStation < 1.2) {
            c.speed = 0;
            c.group.position.x = targetStation.x;
            c.state = "dwelling";
            c.dwellTimer = 0;
          }
        } else if (c.state === "dwelling") {
          c.speed = 0;
          c.dwellTimer += delta;
          // Update HUD with station name
          setHudText("F TRAIN · NOW ARRIVING: " + targetStation.name,
            "Mouse to look around · ESC menu");
          if (c.dwellTimer > 2.2) {
            // Move to next station, or loop back
            c.stationIdx = (c.stationIdx + 1) % c.stations.length;
            // Loop: if we just left the last (Stillwell), teleport east of first
            if (c.stationIdx === 0) {
              c.group.position.x = c.stations[0].x + 120;
            }
            c.state = "departing";
          }
        }

        // Apply movement (always toward -X)
        c.group.position.x -= c.speed * delta;
        c.group.position.y = groundMesh.position.y + terrainAmp + 19 + Math.sin(t * 5) * 0.04 * Math.min(1, c.speed / 10);
        c.group.position.z = -70;
        c.group.rotation.y = Math.PI / 2;

        // Camera at seat — south side, mid-car, eye height.
        // The seat faces north (looking through south window initially).
        // Camera is at standing-passenger eye level in the center aisle —
        // so seat backrests (top ~1.9) don't block your view, and you can
        // look to either window when you turn.
        const seatLocalX = 1.5;   // mid-car
        const seatLocalY = 2.15;  // above the bench backrest
        const seatLocalZ = 0.0;   // dead center of the aisle
        const camTarget = new THREE.Vector3(seatLocalX, seatLocalY, seatLocalZ);
        c.group.localToWorld(camTarget);
        camera.position.copy(camTarget);
        // Re-apply look orientation so mouse turning shows the opposite window
        updateCameraLook();
      }

      /* ============================================================
       *  INIT
       * ============================================================ */
      async function init() {
        setLoad(5, "Creating scene…");
        await frame();

        scene = new THREE.Scene();
        clock = new THREE.Clock();
        camera = new THREE.PerspectiveCamera(
          70,
          window.innerWidth / window.innerHeight,
          0.1,
          200000
        );
        // Cinematic spawn: high enough to see the rides + skyline + boardwalk
        camera.position.set(0, 80, 180);
        lookState.lat = -12; // gently looking down
        updateCameraLook();

        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.6;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        document.body.appendChild(renderer.domElement);

        // Postprocessing — clean stack (SSAO removed: was over-darkening at this scene scale)
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(
          // Bloom at half resolution — 4× perf win, visually almost identical
          new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
          0.32,
          0.6,
          0.95
        );
        composer.addPass(bloomPass);
        // Vignette + chromatic aberration + film grain + color grade
        photoFXPass = new ShaderPass(PhotoFXShader);
        photoFXPass.material.uniforms.vignetteStrength.value = 0.25;
        photoFXPass.material.uniforms.grainStrength.value = 0.02;
        photoFXPass.material.uniforms.chromaAmount.value = 0.0015;
        composer.addPass(photoFXPass);
        fxaaPass = new ShaderPass(FXAAShader);
        fxaaPass.material.uniforms.resolution.value.set(
          1 / (window.innerWidth * renderer.getPixelRatio()),
          1 / (window.innerHeight * renderer.getPixelRatio())
        );
        composer.addPass(fxaaPass);
        composer.addPass(new OutputPass());

        // Lighting
        ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        hemisphereLight = new THREE.HemisphereLight(0xb1d4ff, 0x4a3a26, 0.6);
        scene.add(hemisphereLight);
        directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
        directionalLight.position.set(70, 120, 90);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 600;
        directionalLight.shadow.camera.left = -220;
        directionalLight.shadow.camera.right = 220;
        directionalLight.shadow.camera.top = 220;
        directionalLight.shadow.camera.bottom = -220;
        directionalLight.shadow.bias = -0.0005;
        directionalLight.shadow.normalBias = 0.02;
        scene.add(directionalLight);

        // Sky
        sky = new Sky();
        sky.scale.setScalar(450000);
        scene.add(sky);
        sun = new THREE.Vector3();
        const u = sky.material.uniforms;
        u.turbidity.value = 2;
        u.rayleigh.value = 2.8;
        u.mieCoefficient.value = 0.004;
        u.mieDirectionalG.value = 0.82;

        // PMREM env map from a generated sky background — IBL reflections.
        // Doing it AFTER an initial sun position update gives a colored env.
        // Wrapped in try/catch so any failure won't break the scene.
        try {
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          const skyScene = new THREE.Scene();
          skyScene.background = new THREE.Color(0xb8d4ec);
          const envRT = pmrem.fromScene(skyScene, 0.04);
          scene.environment = envRT.texture;
          pmrem.dispose();
        } catch (e) {
          console.warn("PMREM env map setup failed", e);
        }

        // Procedural sun glow — small subtle disc, NOT a giant flare.
        sunFlareLight = new THREE.Group();
        const flareDisc = new THREE.Mesh(
          new THREE.PlaneGeometry(120, 120),
          new THREE.MeshBasicMaterial({
            map: makeFlareTexture("#fff8d8"),
            transparent: true, opacity: 0.35,
            depthWrite: false, depthTest: true,
            blending: THREE.AdditiveBlending,
          })
        );
        flareDisc.renderOrder = 999;
        sunFlareLight.add(flareDisc);
        scene.add(sunFlareLight);

        // scene.fog = new THREE.Fog(0xcfe4f5, 10000, groundSize * 8);

        setLoad(20, "Building terrain…");
        await frame();

        // Terrain
        const segs = 80;
        const groundGeom = new THREE.PlaneGeometry(groundSize, groundSize, segs, segs);
        const groundMat = new THREE.MeshStandardMaterial({
          color: 0xa8b1ba, roughness: 0.85, metalness: 0.05,
        });
        const posAttr = groundGeom.getAttribute("position");
        const vert = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          vert.fromBufferAttribute(posAttr, i);
          posAttr.setZ(
            i,
            Math.sin(vert.x * 0.02) * Math.cos(vert.y * 0.03) * terrainAmp
          );
        }
        groundGeom.computeVertexNormals();
        groundMesh = new THREE.Mesh(groundGeom, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = -1.0;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        // --- Boardwalk + Beach (Riegelmann boardwalk over sand) ---
        createBoardwalkAndBeach();

        // Ocean
        createOcean();

        // May 2026 color tuning — early-season Coney has a cooler, hazier
        // ocean, slightly muted grass, and the haze that drifts in off the
        // Atlantic before summer humidity kicks in.
        if (oceanMesh && oceanMesh.material.uniforms) {
          oceanMesh.material.uniforms.uColorShallow.value.setHex(0x4f86a0);
          oceanMesh.material.uniforms.uColorDeep.value.setHex(0x0a3a55);
        }
        // scene.fog.color.setHex(0xb8d4e8);
        hemisphereLight.color.setHex(0xb8d4ec);
        hemisphereLight.groundColor.setHex(0x554639);

        setLoad(35, "Crafting amusement park…");
        await frame();

        // Rides
        const rideGroup = new THREE.Group();
        rideGroup.position.set(0, groundMesh.position.y + terrainAmp + 0.5, 15);
        scene.add(rideGroup);
        buildRides(rideGroup);

        // Coney landmarks anchored to the boardwalk/rides area
        buildSteeplechasePier();
        buildBnBCarousell();
        buildBoardwalkVendors();
        buildLifeguardChairs();
        buildBeachJetties();
        buildBeachWrack();
        addPlankVariation();
        buildChildsRestaurant();
        createNathansSteam();
        createPigeons();
        buildConeyIslandHouses();
        buildVerrazzanoBridge();
        buildConeyArtWalls();
        addCharacterFigures();
        buildSideshowFacade();
        buildMidwayGames();
        buildWelcomeArchAndLights();
        buildBeachActivity();
        buildManhattanSilhouette();
        buildBoatsOnOcean();
        buildDenseBoardwalkCrowd();
        buildPeopleVariety();
        buildAttractionCrowds();
        buildMermaidAndMurals();
        buildRideQueues();
        buildFlyingGulls();

        // Street grid
        const streetsGroup = new THREE.Group();
        const gridSpacingX = 100;
        const numStreetsZ = 12;
        const numStreetsX = 12;
        const streetMat = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.85 });
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 });
        const lineGeomZ = new THREE.BoxGeometry(gridLength, 0.1, 0.15);
        const streetLengthX = streetGridEndZ - buildingAreaMinZ;
        const lineGeomX = new THREE.BoxGeometry(streetLengthX, 0.1, 0.15);

        const streetGeomZ = new THREE.PlaneGeometry(gridLength, streetWidth);
        for (let i = 0; i < numStreetsZ; i++) {
          const sz = maxBuildingZ - 20 - i * gridSpacingZ;
          if (sz < buildingAreaMinZ || sz > streetGridEndZ + streetWidth / 2) continue;
          const st = new THREE.Mesh(streetGeomZ, streetMat);
          st.rotation.x = -Math.PI / 2;
          st.position.set(0, streetLevelY, sz);
          st.receiveShadow = true;
          st.userData.isEWStreet = true;
          streetsGroup.add(st);
          const cl = new THREE.Mesh(lineGeomZ, lineMat);
          cl.position.set(0, streetLevelY + 0.01, sz);
          streetsGroup.add(cl);
        }
        const streetGeomX = new THREE.PlaneGeometry(streetWidth, streetLengthX);
        for (let i = 0; i < numStreetsX; i++) {
          const sx = buildingAreaMinX + gridSpacingX / 2 + i * gridSpacingX;
          if (Math.abs(sx) > gridLength / 2) continue;
          const st = new THREE.Mesh(streetGeomX, streetMat);
          st.rotation.x = -Math.PI / 2;
          st.position.set(sx, streetLevelY + 0.01, buildingAreaMinZ + streetLengthX / 2);
          st.receiveShadow = true;
          streetsGroup.add(st);
          const cl = new THREE.Mesh(lineGeomX, lineMat);
          cl.position.set(sx, streetLevelY + 0.02, buildingAreaMinZ + streetLengthX / 2);
          cl.rotation.y = Math.PI / 2;
          streetsGroup.add(cl);
        }
        scene.add(streetsGroup);

        setLoad(50, "Populating city…");
        await frame();

        // Containers
        scene.add(buildingGroup);
        scene.add(subwayGroup);
        scene.add(highwayGroup);
        scene.add(vehicleGroup);
        scene.add(peopleGroup);

        generateBuildings(settings.numBuildings);
        // Overlay storefront detail on the closest cafe buildings
        addCafeStorefronts(cafePositions);
        // Rooftop water tanks + AC + antennas — the NYC skyline maker
        buildRoofDetails(apartmentPositions);
        // Zigzag fire escapes on brownstones nearest the rides
        buildFireEscapes(brownstonePositions);
        // Massive painted billboards on tall building sides
        buildBuildingBillboards(apartmentPositions);
        // Rooftop ad billboards — vintage Coney advertising
        buildRooftopAds(apartmentPositions);
        // Lit-window emissive overlay so apartments glow at night
        buildLitWindows(apartmentPositions);
        // Extra cafe signage and sandwich boards
        buildExtraCafeAds();
        // Standalone bodegas with neon signs at near-zone intersections
        buildBodegas();
        // NYC green sidewalk sheds (scaffolding) on some blocks
        buildSidewalkSheds();
        // Active construction site with crane
        buildConstructionSite();

        setLoad(65, "Laying subway tracks…");
        await frame();
        createSubwayLines(settings.numSubwayLines);
        buildStillwellTerminal();
        createHighways(settings.numHighways);
        setLoad(75, "Spawning traffic…");
        await frame();
        createVehicles(settings.numBuses, settings.numVehicles);
        buildBusUpgrade();
        buildExtraVehicles();

        // GTA-level streetscape detailing on the urban grid
        buildStreetscapeDetail();
        // Additional street furniture
        buildBusStops();
        buildSubwayEntrances();
        buildCitiBikeDocks();
        buildManholesAndDrains();
        buildStreetMarkings();
        buildFoodCarts();
        buildConstructionDetails();
        buildSidewalkTrees();
        buildStreetSigns();
        buildLinkNYC();
        buildDSNYTruck();
        buildManholeSteam();
        buildStreetTrash();
        buildPoleSignsFlagsPhones();
        buildSidewalkPedestrians();
        buildStorefrontDisplays();
        buildHeliBeamsAndRooftopLife();

        setWeather(settings.weather);
        updateSunPosition();
        updateMetricsDisplay();

        setLoad(85, "Adding parks and plazas…");
        await frame();

        // Parks/plazas
        const community = new THREE.Group();
        const parkConfigs = [
          { x: -90, z: -110, w: 50, d: 40, addPlayground: true },
          { x: 90, z: -90, w: 40, d: 30, addPlayground: false },
          { x: -200, z: -150, w: 60, d: 50, addPlayground: false },
          { x: 200, z: -200, w: 50, d: 50, addPlayground: true },
          { x: -300, z: -250, w: 70, d: 60, addPlayground: false },
          { x: 300, z: -300, w: 40, d: 70, addPlayground: true },
          { x: 150, z: -350, w: 50, d: 40, addPlayground: false },
          { x: -400, z: -400, w: 80, d: 80, addPlayground: true },
          { x: 400, z: -150, w: 60, d: 40, addPlayground: false },
          { x: -500, z: -100, w: 50, d: 50, addPlayground: false },
          { x: 500, z: -250, w: 70, d: 50, addPlayground: true },
          { x: -600, z: -350, w: 60, d: 60, addPlayground: false },
          { x: 600, z: -450, w: 50, d: 70, addPlayground: false },
          { x: -700, z: -500, w: 90, d: 70, addPlayground: true },
          { x: 700, z: -100, w: 60, d: 60, addPlayground: false },
          { x: -800, z: -200, w: 70, d: 70, addPlayground: false },
          { x: 800, z: -300, w: 80, d: 50, addPlayground: true },
          { x: -100, z: -500, w: 60, d: 40, addPlayground: false },
          { x: 100, z: -600, w: 50, d: 50, addPlayground: true },
          { x: -900, z: -400, w: 70, d: 50, addPlayground: false },
          { x: 900, z: -500, w: 60, d: 60, addPlayground: true },
          { x: -350, z: -600, w: 80, d: 50, addPlayground: false },
          { x: 450, z: -650, w: 70, d: 60, addPlayground: true },
        ];
        const plazaConfigs = [
          { x: 0, z: -250, w: 70, d: 70 },
          { x: -150, z: -300, w: 50, d: 50 },
          { x: 250, z: -400, w: 60, d: 60 },
          { x: 0, z: -450, w: 80, d: 40 },
          { x: -450, z: -200, w: 50, d: 50 },
          { x: 450, z: -350, w: 60, d: 40 },
          { x: -250, z: -500, w: 70, d: 50 },
          { x: 350, z: -550, w: 50, d: 60 },
          { x: -650, z: -150, w: 40, d: 40 },
          { x: 650, z: -200, w: 50, d: 50 },
          { x: -50, z: -600, w: 60, d: 60 },
          { x: 550, z: -500, w: 40, d: 40 },
          { x: -750, z: -300, w: 50, d: 50 },
          { x: 750, z: -400, w: 60, d: 60 },
          { x: -550, z: -650, w: 70, d: 40 },
          { x: 50, z: -700, w: 50, d: 50 },
        ];
        // Upgrade the parks/plazas closest to the rides to GTA-level detail;
        // distant ones stay simple to keep performance in check.
        const ridesCenter = new THREE.Vector3(0, 0, 15);
        const sortedParks = parkConfigs
          .map((c) => ({ ...c, _dist: Math.hypot(c.x - ridesCenter.x, c.z - ridesCenter.z) }))
          .sort((a, b) => a._dist - b._dist);
        sortedParks.forEach((c, i) => {
          community.add(i < 10 ? createParkAreaDetailed(c) : createParkArea(c));
        });
        const sortedPlazas = plazaConfigs
          .map((c) => ({ ...c, _dist: Math.hypot(c.x - ridesCenter.x, c.z - ridesCenter.z) }))
          .sort((a, b) => a._dist - b._dist);
        sortedPlazas.forEach((c, i) => {
          community.add(i < 8 ? createPlazaDetailed(c) : createPlaza(c));
        });
        scene.add(community);

        // Helicopters
        const numHelis = 6;
        for (let i = 0; i < numHelis; i++) {
          const pos = new THREE.Vector3(
            Math.random() * 400 - 200,
            150 + Math.random() * 40 - 20,
            Math.random() * 400 - 200
          );
          scene.add(createHelicopter(pos));
        }

        // Aquarium + Stadium (landmarks)
        const aqMat = new THREE.MeshStandardMaterial({ color: 0xb0e0e6, roughness: 0.65 });
        const aquariumG = new THREE.Group();
        const aqMain = new THREE.Mesh(new THREE.BoxGeometry(40, 15, 30), aqMat);
        aqMain.castShadow = true; aqMain.receiveShadow = true;
        const aqWingGeom = new THREE.BoxGeometry(20, 10, 25);
        const aqW1 = new THREE.Mesh(aqWingGeom, aqMat); aqW1.position.set(-30, -2.5, 0); aqW1.castShadow = true;
        const aqW2 = new THREE.Mesh(aqWingGeom, aqMat); aqW2.position.set(30, -2.5, 0); aqW2.castShadow = true;
        const aqCyl = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 12, 16), aqMat);
        aqCyl.position.set(0, -1.5, 25); aqCyl.castShadow = true;
        aquariumG.add(aqMain, aqW1, aqW2, aqCyl);
        aquariumG.position.set(120, groundMesh.position.y + getTerrainHeight(120, 65) + 7.5, 65);
        scene.add(aquariumG);

        const stadiumG = new THREE.Group();
        const stadMat = new THREE.MeshStandardMaterial({ color: 0xd6d8de, roughness: 0.75 });
        const field = new THREE.Mesh(
          new THREE.PlaneGeometry(70, 77),
          new THREE.MeshStandardMaterial({ color: 0x66bb66, roughness: 0.9 })
        );
        field.rotation.x = -Math.PI / 2;
        field.receiveShadow = true;
        stadiumG.add(field);
        const standH = 20, standD = 30;
        const numSeg = 12;
        const angleStep = (Math.PI * 1.2) / numSeg;
        const standR = 70 / 2 + standD / 2 - 5;
        const segW = Math.tan(angleStep / 2) * standR * 2.2;
        const segGeom = new THREE.BoxGeometry(segW, standH, standD);
        for (let i = 0; i < numSeg; i++) {
          const a = -Math.PI * 0.1 - angleStep / 2 + i * angleStep;
          const stand = new THREE.Mesh(segGeom, stadMat);
          stand.position.set(Math.cos(a) * standR, standH / 2, Math.sin(a) * standR);
          stand.lookAt(0, standH / 2, 0);
          stand.castShadow = true; stand.receiveShadow = true;
          stadiumG.add(stand);
        }
        stadiumG.position.set(-180, groundMesh.position.y + getTerrainHeight(-180, -60) + 0.1, -60);
        scene.add(stadiumG);
        upgradeMCUPark(stadiumG);

        // Clouds (better than planes: soft sprites)
        const cloudMat = new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const numClouds = 30;
        for (let i = 0; i < numClouds; i++) {
          const w = Math.random() * 80 + 40;
          const d = Math.random() * 30 + 20;
          const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cloudMat);
          cloud.position.set(
            Math.random() * 1600 - 800,
            200 + Math.random() * 30,
            Math.random() * 1600 - 800
          );
          cloud.rotation.x = -Math.PI / 2;
          scene.add(cloud);
          clouds.push({ mesh: cloud, speed: Math.random() * 0.08 + 0.02 });
        }

        setLoad(98, "Almost there…");
        await frame();

        // Touch refs
        joystickBaseElement = document.getElementById("joystick-base");
        joystickHandleElement = document.getElementById("joystick-handle");
        buttonUpElement = document.getElementById("button-up");
        buttonDownElement = document.getElementById("button-down");
        buttonRotateLeftElement = document.getElementById("button-rotate-left");
        buttonRotateRightElement = document.getElementById("button-rotate-right");
        resetJoystickHandle();

        // Performance pass — disable shadow casting on all InstancedMesh
        // pedestrians/trees/small instanced objects. The shadow pass renders
        // every castShadow=true mesh; instanced people add no real shadow
        // value but dominate the shadow-pass cost.
        scene.traverse((o) => {
          if (o.isInstancedMesh && o.geometry &&
              (o.geometry.type === "CapsuleGeometry" ||
               o.geometry.type === "IcosahedronGeometry" ||
               o.geometry.type === "SphereGeometry" ||
               o.geometry.type === "CircleGeometry" ||
               o.geometry.type === "PlaneGeometry")) {
            o.castShadow = false;
          }
        });

        setupEventListeners();
        setupUI();

        // Build the player vehicles — each wrapped so one bad build can't
        // throw the entire init away (we'd lose the whole scene).
        try { buildPlayer(); } catch (e) { console.error("buildPlayer failed:", e); }
        try { buildBMW(); } catch (e) { console.error("buildBMW failed:", e); }
        try { buildFTrain(); } catch (e) { console.error("buildFTrain failed:", e); }
        try { if (fTrainCar && fTrainCar.stations) buildFLineStations(fTrainCar.stations); }
        catch (e) { console.error("buildFLineStations failed:", e); }
        try { if (typeof initTireSmoke === "function") initTireSmoke(); }
        catch (e) { console.error("initTireSmoke failed:", e); }

        // Wire the start menu — hidden on boot. Press M to open later.
        try {
          const startMenuEl = document.getElementById("start-menu");
          if (startMenuEl) {
            startMenuEl.classList.add("hidden");
            startMenuEl.querySelectorAll(".start-option").forEach((btn) => {
              btn.addEventListener("click", () => {
                const mode = btn.dataset.mode;
                try { chooseMode(mode); } catch (e) { console.error("chooseMode failed:", e); }
              });
            });
          }
          document.addEventListener("keydown", (e) => {
            if (e.code === "KeyM") {
              showStartMenu();
            } else if (e.code === "Escape") {
              try { chooseMode("free"); } catch (e) { console.error("ESC chooseMode failed:", e); }
            }
          });
        } catch (e) {
          console.error("Menu setup failed:", e);
        }

        // Boot directly into fly cam — done INLINE so a chooseMode failure
        // can't blank the scene. Set the minimum required state explicitly.
        appMode = "free";
        if (player && player.mesh) player.mesh.visible = false;
        if (bmwCar && bmwCar.group) bmwCar.group.visible = true;
        if (fTrainCar && fTrainCar.group) fTrainCar.group.visible = true;
        camera.position.set(0, 80, 180);
        lookState.lat = -12;
        lookState.lon = -90;
        updateCameraLook();
        try { setHudText("FREE EXPLORE · FLY CAM",
          "WASD move · Mouse look · Space/Shift up/down · M menu · V for BMW · Esc fly cam"); } catch (e) {}

        setLoad(100, "Ready");
        setTimeout(() => loaderEl.classList.add("hidden"), 400);

        // Fade hint after a few seconds
        setTimeout(() => {
          const h = document.getElementById("hint");
          if (h) h.classList.add("hidden");
        }, 8000);
      }

      function frame() {
        return new Promise((r) => requestAnimationFrame(() => r()));
      }

      /* ============================================================
       *  UI
       * ============================================================ */
      function setupUI() {
        const timeSlider = document.getElementById("time-slider");
        const bldSlider = document.getElementById("bld-slider");
        const subSlider = document.getElementById("sub-slider");
        const hwSlider = document.getElementById("hw-slider");
        const busSlider = document.getElementById("bus-slider");
        const carSlider = document.getElementById("car-slider");
        const settingsEl = document.getElementById("settings");
        const toggleBtn = document.getElementById("settings-toggle");
        const applyBtn = document.getElementById("apply-btn");
        const chips = document.getElementById("weather-chips");

        // Init values
        timeSlider.value = settings.timeOfDay;
        bldSlider.value = settings.numBuildings;
        subSlider.value = settings.numSubwayLines;
        hwSlider.value = settings.numHighways;
        busSlider.value = settings.numBuses;
        carSlider.value = settings.numVehicles;

        document.getElementById("v-bld").textContent = settings.numBuildings;
        document.getElementById("v-sub").textContent = settings.numSubwayLines;
        document.getElementById("v-hw").textContent = settings.numHighways;
        document.getElementById("v-bus").textContent = settings.numBuses;
        document.getElementById("v-car").textContent = settings.numVehicles;
        updateTimeDisplay(settings.timeOfDay);

        // Mark selected weather chip
        const updateChips = () => {
          chips.querySelectorAll(".weather-chip").forEach((c) => {
            c.classList.toggle("active", c.dataset.w === settings.weather);
          });
        };
        updateChips();
        chips.addEventListener("click", (e) => {
          const chip = e.target.closest(".weather-chip");
          if (!chip) return;
          settings.weather = chip.dataset.w;
          updateChips();
        });

        // Time-of-day preset chips
        const todChips = document.getElementById("tod-chips");
        if (todChips) {
          todChips.addEventListener("click", (e) => {
            const chip = e.target.closest(".weather-chip");
            if (!chip) return;
            const val = parseInt(chip.dataset.t);
            timeSlider.value = val;
            settings.timeOfDay = val;
            updateSunPosition();
            todChips.querySelectorAll(".weather-chip").forEach((c) => {
              c.classList.toggle("active", c === chip);
            });
          });
        }

        timeSlider.addEventListener("input", () => updateTimeDisplay(timeSlider.value));
        bldSlider.addEventListener("input", () => (document.getElementById("v-bld").textContent = bldSlider.value));
        subSlider.addEventListener("input", () => (document.getElementById("v-sub").textContent = subSlider.value));
        hwSlider.addEventListener("input", () => (document.getElementById("v-hw").textContent = hwSlider.value));
        busSlider.addEventListener("input", () => (document.getElementById("v-bus").textContent = busSlider.value));
        carSlider.addEventListener("input", () => (document.getElementById("v-car").textContent = carSlider.value));

        // Live time-of-day (no apply needed)
        timeSlider.addEventListener("input", () => {
          settings.timeOfDay = parseInt(timeSlider.value);
          updateSunPosition();
        });

        toggleBtn.addEventListener("click", () => {
          settingsEl.classList.toggle("open");
          toggleBtn.classList.toggle("open");
        });

        applyBtn.addEventListener("click", () => {
          settings.timeOfDay = parseInt(timeSlider.value);
          settings.numBuildings = parseInt(bldSlider.value);
          settings.numSubwayLines = parseInt(subSlider.value);
          settings.numHighways = parseInt(hwSlider.value);
          settings.numBuses = parseInt(busSlider.value);
          settings.numVehicles = parseInt(carSlider.value);
          recreateDynamicEnvironment();
        });
      }

      function updateTimeDisplay(v) {
        const hour = Math.floor(THREE.MathUtils.mapLinear(v, 0, 100, 0, 24));
        const minute = v % (100 / 24) < 100 / 48 ? "00" : "30";
        const txt = `${String(hour).padStart(2, "0")}:${minute}`;
        document.getElementById("v-time").textContent = txt;
        document.getElementById("m-time").textContent = txt;
      }

      function recreateDynamicEnvironment() {
        setWeather(settings.weather);
        updateSunPosition();
        generateBuildings(settings.numBuildings);
        createSubwayLines(settings.numSubwayLines);
        createHighways(settings.numHighways);
        createVehicles(settings.numBuses, settings.numVehicles);
        updateMetricsDisplay();
      }

      /* ============================================================
       *  TIME / SUN
       * ============================================================ */
      function updateSunPosition() {
        const v = settings.timeOfDay;
        updateTimeDisplay(v);
        const elev = THREE.MathUtils.mapLinear(v, 0, 100, 5, 175);
        const azim = 180;
        const phi = THREE.MathUtils.degToRad(90 - elev);
        const theta = THREE.MathUtils.degToRad(azim);
        sun.setFromSphericalCoords(1, phi, theta);
        sky.material.uniforms.sunPosition.value.copy(sun);

        let modDir = 1.0, modAmb = 1.0;
        switch (settings.weather) {
          case "cloudy": modDir = 0.6; modAmb = 0.8; break;
          case "rainy": modDir = 0.4; modAmb = 0.6; break;
          case "stormy": modDir = 0.2; modAmb = 0.4; break;
          case "snowy": modDir = 0.5; modAmb = 0.9; break;
        }

        directionalLight.position.set(sun.x * 100, sun.y * 100, sun.z * 100);
        directionalLight.intensity = (1.0 + Math.sin(phi) * 1.0) * modDir;
        ambientLight.intensity = (0.4 + Math.sin(phi) * 0.3) * modAmb;
        hemisphereLight.intensity = (0.3 + Math.sin(phi) * 0.3) * modAmb;

        // Position the sun flare far along the sun direction; hide at night
        if (sunFlareLight) {
          sunFlareLight.position.copy(sun).multiplyScalar(2500);
          sunFlareLight.visible = sun.y > 0.08;
        }

        // Color the sun warm near horizons
        if (settings.weather !== "snowy") {
          const colorLerp = Math.abs(v - 50) / 50;
          directionalLight.color.lerpColors(
            new THREE.Color(0xffffff),
            new THREE.Color(0xffaa55),
            colorLerp * 0.7
          );
        } else {
          directionalLight.color.set(0xffffff);
        }

        // Update ocean sun direction
        if (oceanMesh && oceanMesh.material.uniforms) {
          oceanMesh.material.uniforms.uSunDir.value.copy(sun);
        }

        // Ride lights: turn on at dusk/night
        const isNight = sun.y < 0.25;
        const targetIntensity = isNight ? 1.5 : 0.0;
        rideLights.forEach((light) => { light.intensity = targetIntensity; });

        // Decorative ride bulbs: invisibly dim in day, blazing at night
        // (use a continuous curve based on sun height so it ramps with dusk)
        const bulbBoost = THREE.MathUtils.smoothstep(0.4 - Math.max(0, sun.y), 0, 0.6);
        const bulbI = 0.15 + bulbBoost * 3.5;
        for (const m of bulbMeshes) {
          if (m.material && m.material.emissiveIntensity !== undefined) {
            m.material.emissiveIntensity = bulbI;
          }
        }

        // Bloom strength: stronger at night, gentle in daytime to avoid whiteout
        if (bloomPass) {
          bloomPass.strength = isNight ? 0.9 : 0.32;
          bloomPass.threshold = isNight ? 0.4 : 0.95;
        }

        // Exposure scales with sun height — kept low to prevent whiteout
        renderer.toneMappingExposure = 0.35 + Math.max(0, sun.y) * 0.35;
      }

      /* ============================================================
       *  WEATHER
       * ============================================================ */
      function setWeather(type) {
        weatherObjects.forEach((o) => disposeObject(o));
        weatherObjects = [];
        if (lightning) { disposeObject(lightning); lightning = null; }
        if (weatherParticles) { weatherParticles = null; weatherGeo = null; weatherMaterial = null; }

        // Default = sunny: clean sky, fog pushed effectively off-screen
        // scene.fog.color.setHex(0xb8d4e8);
        // scene.fog.near = 10000;
        // scene.fog.far = groundSize * 8;

        switch (type) {
          case "sunny": break;
          case "cloudy":
            // scene.fog.color.setHex(0xb8c2cc);
            // scene.fog.near = 1500;
            // scene.fog.far = groundSize * 1.4;
            break;
          case "rainy":
            // scene.fog.color.setHex(0x7d8a99);
            // scene.fog.near = 600;
            // scene.fog.far = 1600;
            createWeatherParticles(10000, 0.5, 0xb0c0d0, 150);
            break;
          case "stormy":
            // scene.fog.color.setHex(0x3a4555);
            // scene.fog.near = 400;
            // scene.fog.far = 1100;
            createWeatherParticles(15000, 0.6, 0x99aabb, 200);
            lightning = new THREE.PointLight(0xffffff, 0, 800);
            lightning.position.set(Math.random() * 400 - 200, 200, Math.random() * 400 - 200);
            scene.add(lightning);
            weatherObjects.push(lightning);
            break;
          case "snowy":
            // scene.fog.color.setHex(0xddeeee);
            // scene.fog.near = 600;
            // scene.fog.far = 1600;
            createWeatherParticles(8000, 0.8, 0xffffff, 50, true);
            break;
        }
      }

      function createWeatherParticles(count, size, color, speed, isSnow = false) {
        const verts = [];
        for (let i = 0; i < count; i++) {
          verts.push(
            Math.random() * groundSize - groundSize / 2,
            Math.random() * 200 + 50,
            Math.random() * groundSize - groundSize / 2
          );
        }
        weatherGeo = new THREE.BufferGeometry();
        weatherGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
        weatherMaterial = new THREE.PointsMaterial({
          color, size, transparent: true, opacity: 0.7, sizeAttenuation: true,
        });
        weatherParticles = new THREE.Points(weatherGeo, weatherMaterial);
        weatherParticles.userData.fallSpeed = speed;
        weatherParticles.userData.isSnow = isSnow;
        scene.add(weatherParticles);
        weatherObjects.push(weatherParticles);
      }

      /* ============================================================
       *  METRICS
       * ============================================================ */
      function updateMetricsDisplay() {
        const total = estimatedPopulation;
        const totalBus = settings.numBuses * BUS_CAPACITY;
        const vis = people.length;
        let totalTrain = 0;
        trains.forEach((t) => {
          totalTrain += (t.mesh.userData.numCars || NUM_CARS_PER_TRAIN) * TRAIN_CAR_CAPACITY;
        });
        const totalTransit = totalBus + totalTrain;
        let ratio = "—";
        if (totalTransit > 0) ratio = (total / totalTransit).toFixed(2);
        else if (total === 0) ratio = "0.00";

        document.getElementById("m-pop").textContent = total.toLocaleString();
        document.getElementById("m-vis").textContent = vis.toLocaleString();
        document.getElementById("m-ratio").textContent = ratio;
      }

      /* ============================================================
       *  INPUT
       * ============================================================ */
      function setupEventListeners() {
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        renderer.domElement.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
        renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
        renderer.domElement.addEventListener("touchend", onTouchEnd);
        renderer.domElement.addEventListener("touchcancel", onTouchEnd);

        const bindHold = (el, key) => {
          const down = (e) => { e.preventDefault?.(); moveState[key] = 1; el.classList.add("active"); };
          const up = () => { moveState[key] = 0; el.classList.remove("active"); };
          el.addEventListener("touchstart", down, { passive: false });
          el.addEventListener("touchend", up);
          el.addEventListener("mousedown", down);
          el.addEventListener("mouseup", up);
          el.addEventListener("mouseleave", up);
        };
        bindHold(buttonUpElement, "up");
        bindHold(buttonDownElement, "down");
        bindHold(buttonRotateLeftElement, "rotateLeft");
        bindHold(buttonRotateRightElement, "rotateRight");

        window.addEventListener("resize", onWindowResize, false);
      }

      function onKeyDown(e) {
        switch (e.code) {
          case "KeyW": moveState.forward = 1; break;
          case "KeyS": moveState.backward = 1; break;
          case "KeyA": moveState.left = 1; break;
          case "KeyD": moveState.right = 1; break;
          case "KeyR": case "Space": moveState.up = 1; break;
          case "KeyF": case "ShiftLeft": moveState.down = 1; break;
          case "KeyQ": case "ArrowLeft": case "KeyJ": moveState.rotateLeft = 1; break;
          case "KeyE": case "ArrowRight": case "KeyL": moveState.rotateRight = 1; break;
          
          case "KeyV":
            // V toggles BMW driving from any non-train mode. No proximity
            // check (no more "too far from car" when there's no walking
            // player). Snaps the BMW to the camera's current position.
            if (appMode === "bmw") {
              chooseMode("free");
            } else if (bmwCar) {
              chooseMode("bmw");
              // Spawn the BMW under the camera so you can actually find it
              const cx = camera.position.x;
              const cz = camera.position.z;
              bmwCar.group.position.set(cx, streetLevelY, cz + 6);
            }
            break;
        }
      }
      function onKeyUp(e) {
        switch (e.code) {
          case "KeyW": moveState.forward = 0; break;
          case "KeyS": moveState.backward = 0; break;
          case "KeyA": moveState.left = 0; break;
          case "KeyD": moveState.right = 0; break;
          case "KeyR": case "Space": moveState.up = 0; break;
          case "KeyF": case "ShiftLeft": moveState.down = 0; break;
          case "KeyQ": case "ArrowLeft": case "KeyJ": moveState.rotateLeft = 0; break;
          case "KeyE": case "ArrowRight": case "KeyL": moveState.rotateRight = 0; break;
        }
      }
      function onMouseDown(e) {
        if (e.target === renderer.domElement) {
          lookState.isMouseDown = true;
          lookState.prevMouseX = e.clientX;
          lookState.prevMouseY = e.clientY;
          e.target.style.cursor = "grabbing";
        }
      }
      function onMouseUp() {
        if (lookState.isMouseDown) {
          lookState.isMouseDown = false;
          renderer.domElement.style.cursor = "grab";
        }
      }
      function onMouseMove(e) {
        if (!lookState.isMouseDown) return;
        const dx = e.clientX - lookState.prevMouseX;
        const dy = e.clientY - lookState.prevMouseY;
        lookState.lon -= dx * lookSpeed;
        lookState.lat -= dy * lookSpeed;
        lookState.lat = Math.max(-85, Math.min(85, lookState.lat));
        lookState.prevMouseX = e.clientX;
        lookState.prevMouseY = e.clientY;
        updateCameraLook();
      }

      function onTouchStart(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.clientX < window.innerWidth / 3 && joystickTouchId === null) {
            joystickTouchId = t.identifier;
            joystickStartX = t.clientX;
            joystickStartY = t.clientY;
          } else if (t.clientX > window.innerWidth / 2 && lookTouchId === null) {
            lookTouchId = t.identifier;
            lookState.isTouchingLook = true;
            lookState.prevMouseX = t.clientX;
            lookState.prevMouseY = t.clientY;
          }
        }
      }
      function onTouchMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === joystickTouchId) {
            joystickDeltaX = t.clientX - joystickStartX;
            joystickDeltaY = t.clientY - joystickStartY;
            const dist = Math.hypot(joystickDeltaX, joystickDeltaY);
            let cx = joystickDeltaX, cy = joystickDeltaY;
            if (dist > joystickRadius) {
              cx = (joystickDeltaX / dist) * joystickRadius;
              cy = (joystickDeltaY / dist) * joystickRadius;
            }
            const hx = joystickBaseElement.offsetLeft + joystickBaseElement.offsetWidth / 2 + cx - joystickHandleElement.offsetWidth / 2;
            const hy = joystickBaseElement.offsetTop + joystickBaseElement.offsetHeight / 2 + cy - joystickHandleElement.offsetHeight / 2;
            joystickHandleElement.style.left = `${hx}px`;
            joystickHandleElement.style.top = `${hy}px`;
            const mx = cx / joystickRadius;
            const my = cy / joystickRadius;
            moveState.forward = Math.max(0, -my);
            moveState.backward = Math.max(0, my);
            moveState.right = Math.max(0, mx);
            moveState.left = Math.max(0, -mx);
          } else if (t.identifier === lookTouchId) {
            const dx = t.clientX - lookState.prevMouseX;
            const dy = t.clientY - lookState.prevMouseY;
            lookState.lon -= dx * lookSpeed;
            lookState.lat -= dy * lookSpeed;
            lookState.lat = Math.max(-85, Math.min(85, lookState.lat));
            lookState.prevMouseX = t.clientX;
            lookState.prevMouseY = t.clientY;
            updateCameraLook();
          }
        }
      }
      function onTouchEnd(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === joystickTouchId) {
            joystickTouchId = null;
            resetJoystickHandle();
            moveState.forward = moveState.backward = moveState.left = moveState.right = 0;
          }
          if (t.identifier === lookTouchId) {
            lookTouchId = null;
            lookState.isTouchingLook = false;
          }
        }
      }
      function resetJoystickHandle() {
        if (!joystickBaseElement || !joystickHandleElement) return;
        const bx = joystickBaseElement.offsetLeft + joystickBaseElement.offsetWidth / 2;
        const by = joystickBaseElement.offsetTop + joystickBaseElement.offsetHeight / 2;
        joystickHandleElement.style.left = `${bx - joystickHandleElement.offsetWidth / 2}px`;
        joystickHandleElement.style.top = `${by - joystickHandleElement.offsetHeight / 2}px`;
      }
      function updateCameraLook() {
        const phi = THREE.MathUtils.degToRad(90 - lookState.lat);
        const theta = THREE.MathUtils.degToRad(lookState.lon);
        const tgt = new THREE.Vector3(
          camera.position.x + 100 * Math.sin(phi) * Math.cos(theta),
          camera.position.y + 100 * Math.cos(phi),
          camera.position.z + 100 * Math.sin(phi) * Math.sin(theta)
        );
        camera.lookAt(tgt);
      }
      function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
        if (fxaaPass) {
          fxaaPass.material.uniforms.resolution.value.set(
            1 / (window.innerWidth * renderer.getPixelRatio()),
            1 / (window.innerHeight * renderer.getPixelRatio())
          );
        }
        resetJoystickHandle();
      }

      /* ============================================================
       *  ANIMATION
       * ============================================================ */
      function animateRides(t) {
        // Wonder Wheel: rotate frame, counter-rotate swinging cabin pivots so they hang
        if (wheelMesh) {
          wheelMesh.rotation.z += 0.004;
          if (wheelMesh.userData.swingCabins) {
            const frameZ = wheelMesh.rotation.z;
            const cabins = wheelMesh.userData.swingCabins;
            for (let i = 0; i < cabins.length; i++) {
              const pivot = cabins[i];
              // Gravity pull keeps cabin upright relative to world.
              // Pivot has its own rotation; world orientation = frame + pivot,
              // we want world ~= 0 (with tiny swing), so pivot = -frame + sway
              const sway = Math.sin(t * 1.2 + i * 0.7) * 0.12;
              pivot.rotation.z = -frameZ + sway;
            }
          }
        }
        // Cyclone train rides the curve
        if (cycloneTrain && cycloneTrackCurve) {
          const u = (t * 0.06) % 1;
          const p = cycloneTrackCurve.getPointAt(u);
          const tan = cycloneTrackCurve.getTangentAt(u);
          cycloneTrain.position.copy(p);
          cycloneTrain.position.y += 0.5;
          cycloneTrain.rotation.y = Math.atan2(tan.x, tan.z) - Math.PI / 2;
        }
        // Thunderbolt car loops the curve
        if (thunderboltCar && thunderboltCurve) {
          const u = (t * 0.12) % 1;
          const p = thunderboltCurve.getPointAt(u);
          const tan = thunderboltCurve.getTangentAt(u);
          thunderboltCar.position.copy(p);
          thunderboltCar.position.y += 0.35;
          thunderboltCar.rotation.y = Math.atan2(tan.x, tan.z) - Math.PI / 2;
        }
        // Parachute Jump warning beacon flashes
        if (parachuteWarningLight) {
          const flash = (Math.sin(t * 2.2) > 0.6) ? 1.5 : 0.4;
          parachuteWarningLight.material.emissiveIntensity = flash;
        }
        if (spinningRide) spinningRide.rotation.y += 0.02;
        if (swingRideTop) swingRideTop.rotation.y += 0.03;
        if (simpleFerrisWheel) simpleFerrisWheel.rotation.z -= 0.008;
        if (dropTowerRide) {
          dropTowerRide.position.y = 5 + ((Math.sin(t * 1.5) + 1) / 2) * 50;
        }
        if (pirateShipRide) pirateShipRide.rotation.x = Math.sin(t * 0.8) * 0.7;
      }

      function animateClouds() {
        clouds.forEach((c) => {
          c.mesh.position.x += c.speed;
          if (c.mesh.position.x > 1000) {
            c.mesh.position.x = -1000;
            c.mesh.position.z = Math.random() * 1200 - 600;
            c.speed = Math.random() * 0.08 + 0.02;
          }
        });
      }

      function animateTrains(delta) {
        trains.forEach((t) => {
          if (t.dwell > 0) { t.dwell -= (delta || 0.016); return; }   // doors open at the platform
          let f = 1;
          if (t.stations) {
            let nd = 1e9, nx = 0;
            for (const sx of t.stations) { const d = Math.abs(t.mesh.position.x - sx); if (d < nd) { nd = d; nx = sx; } }
            if (nd < 30 && (Math.sign(nx - t.mesh.position.x) === Math.sign(t.speed) || nd < 2)) {
              f = Math.max(0.12, nd / 30);                            // brake into the station
              if (nd < 1.6 && t.lastStop !== nx) { t.dwell = 2.6; t.lastStop = nx; t.atStation = nx; return; }
            }
            if (nd > 6) t.atStation = null;
            if (t.lastStop != null && Math.abs(t.mesh.position.x - t.lastStop) > 40) t.lastStop = null;
          }
          t.mesh.position.x += t.speed * f * ((delta || 0.016) * 60);   // dt-based: consistent at any framerate
          const half = t.trackLength / 2;
          const buf = 30;
          if (t.speed > 0 && t.mesh.position.x - t.trackCenterX > half + buf) {
            t.mesh.position.x = t.trackCenterX - half - buf; t.lastStop = null;
          } else if (t.speed < 0 && t.mesh.position.x - t.trackCenterX < -half - buf) {
            t.mesh.position.x = t.trackCenterX + half + buf; t.lastStop = null;
          }
        });
      }

      // Instanced vehicles need matrix updates
      const _tmpM = new THREE.Matrix4();
      function animateVehicles() {
        const busInst = vehicleGroup.userData.busInst;
        if (busInst) {
          buses.forEach((b) => {
            b.x += b.speed;
            const half = b.streetLength / 2;
            if (b.speed > 0 && b.x > half) b.x = -half;
            else if (b.speed < 0 && b.x < -half) b.x = half;
            _tmpM.makeTranslation(b.x, b.y, b.z);
            busInst.setMatrixAt(b.idx, _tmpM);
          });
          busInst.instanceMatrix.needsUpdate = true;
        }
        const carInst = vehicleGroup.userData.carInst;
        const cabinInst = vehicleGroup.userData.cabinInst;
        if (carInst) {
          cars.forEach((c) => {
            c.x += c.speed;
            const half = c.streetLength / 2;
            if (c.speed > 0 && c.x > half) c.x = -half;
            else if (c.speed < 0 && c.x < -half) c.x = half;
            _tmpM.makeTranslation(c.x, c.y, c.z);
            carInst.setMatrixAt(c.idx, _tmpM);
            if (cabinInst) {
              _tmpM.makeTranslation(c.x, c.y + 0.85, c.z);
              cabinInst.setMatrixAt(c.idx, _tmpM);
            }
          });
          carInst.instanceMatrix.needsUpdate = true;
          if (cabinInst) cabinInst.instanceMatrix.needsUpdate = true;
        }
      }

      function animateHelicopters(t, delta) {
        const rotorSpeed = delta * 25;
        helicopters.forEach((h) => {
          h.mainRotor.rotation.y += rotorSpeed;
          h.tailRotor.rotation.x += rotorSpeed * 1.5;
          h.angle += h.speed;
          h.mesh.position.x = Math.cos(h.angle) * h.radius;
          h.mesh.position.z = Math.sin(h.angle) * h.radius;
          h.mesh.rotation.z = -h.speed * 50;
          h.mesh.rotation.y = -h.angle + Math.PI / 2;
        });
      }

      const _peopleM = new THREE.Matrix4();
      const _peopleQ = new THREE.Quaternion();
      const _peopleS = new THREE.Vector3(1, 1, 1);
      const _peopleV = new THREE.Vector3();
      function animatePeople(delta) {
        const inst = peopleGroup.userData.inst;
        const head = peopleGroup.userData.head;
        if (!inst) return;
        const upAxis = new THREE.Vector3(0, 1, 0);
        people.forEach((p) => {
          const dir = Math.sign(p.targetZ - p.currentZ);
          p.currentZ += dir * p.speed * 10 * delta;
          if (dir > 0 && p.currentZ >= p.targetZ) {
            p.targetZ = boardwalkEndZ - beachDepth * 0.5 + Math.random() * beachDepth * 0.2;
          } else if (dir < 0 && p.currentZ <= p.targetZ) {
            p.targetZ = boardwalkEndZ - beachDepth * 0.5 + Math.random() * beachDepth * 0.8;
          }
          p.rot = dir > 0 ? Math.PI : 0;
          p.bobT += delta * (2 + p.speed * 22);
          const bob = Math.abs(Math.sin(p.bobT)) * 0.055;        // step bounce
          _peopleQ.setFromAxisAngle(upAxis, p.rot + Math.sin(p.bobT) * 0.05);
          _peopleV.set(p.x, p.y + bob, p.currentZ);
          _peopleM.compose(_peopleV, _peopleQ, _peopleS);
          inst.setMatrixAt(p.idx, _peopleM);
          if (head) head.setMatrixAt(p.idx, _peopleM);
          const legs = peopleGroup.userData.legs;
          if (legs) legs.setMatrixAt(p.idx, _peopleM);
          const hair = peopleGroup.userData.hair;
          if (hair) hair.setMatrixAt(p.idx, _peopleM);
        });
        inst.instanceMatrix.needsUpdate = true;
        if (head) head.instanceMatrix.needsUpdate = true;
        if (peopleGroup.userData.legs) peopleGroup.userData.legs.instanceMatrix.needsUpdate = true;
        if (peopleGroup.userData.hair) peopleGroup.userData.hair.instanceMatrix.needsUpdate = true;
      }

      function animateCarousels(t, delta) {
        carouselsAnim.forEach((c) => {
          c.rotor.rotation.y += c.rotSpeed;
          // Horses bob up and down (sinusoidal)
          for (let i = 0; i < c.horses.length; i++) {
            const h = c.horses[i];
            const y = h.baseY + Math.sin(t * 2 + i * 0.6) * c.horseAmp;
            h.horse.position.y = y;
            h.pole.position.y = y - 0.1;
            h.head.position.y = y + 0.4;
          }
        });
      }

      function animateSteam(delta, t) {
        for (let i = 0; i < steamPlumes.length; i++) {
          const p = steamPlumes[i];
          const arr = p.posAttr.array;
          const n = arr.length / 3;
          for (let j = 0; j < n; j++) {
            const yi = j * 3 + 1;
            arr[yi] += p.riseSpeed * delta * (0.7 + Math.random() * 0.4);
            arr[j * 3] += (Math.random() - 0.5) * 0.04 * p.scale;
            arr[j * 3 + 2] += (Math.random() - 0.5) * 0.04 * p.scale;
            if (arr[yi] - p.base.y > 8 * p.scale) {
              arr[j * 3] = p.base.x + (Math.random() - 0.5) * 0.6 * p.scale;
              arr[yi] = p.base.y;
              arr[j * 3 + 2] = p.base.z + (Math.random() - 0.5) * 0.6 * p.scale;
            }
          }
          // fade opacity for top half of the lifecycle
          p.posAttr.needsUpdate = true;
        }
      }

      function animatePigeons(delta, t) {
        pigeonsArr.forEach((p) => {
          // Mostly walk in a slow circle, occasionally peck
          p.theta += p.speed * delta;
          // Pecking: 1/200 chance to start a peck
          if (p.pecking <= 0 && Math.random() < 0.005) {
            p.pecking = 0.4;
          }
          if (p.pecking > 0) {
            p.pecking -= delta;
            p.mesh.position.y = p.baseY - 0.04;
          } else {
            p.mesh.position.y = p.baseY;
          }
          const nx = Math.cos(p.theta + p.wanderPhase) * p.r;
          const nz = Math.sin(p.theta + p.wanderPhase) * p.r;
          const ox = p.mesh.position.x;
          const oz = p.mesh.position.z;
          // Compute heading
          p.mesh.rotation.y = Math.atan2(nx - (ox - p.mesh.position.x + nx) * 0.1, nz - (oz - p.mesh.position.z + nz) * 0.1);
          // Use simpler heading from velocity direction
          p.mesh.rotation.y = p.theta + p.wanderPhase + Math.PI / 2;
          // Offset around Nathan's
          p.mesh.position.x = -20 + nx;
          p.mesh.position.z = 45 + nz;
        });
      }

      function animateSidewalkPeople(delta) {
        if (!sidewalkPersonInst) return;
        const _m = new THREE.Matrix4();
        const _v = new THREE.Vector3();
        const _q = new THREE.Quaternion();
        const _s = new THREE.Vector3(1, 1, 1);
        const half = gridLength / 2;
        for (let i = 0; i < sidewalkPeople.length; i++) {
          const p = sidewalkPeople[i];
          p.x += p.dirX * p.speed * delta;
          if (p.dirX > 0 && p.x > half) p.x = -half;
          else if (p.dirX < 0 && p.x < -half) p.x = half;
          _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.dirX > 0 ? -Math.PI / 2 : Math.PI / 2);
          _v.set(p.x, p.y, p.z);
          _m.compose(_v, _q, _s);
          sidewalkPersonInst.setMatrixAt(p.idx, _m);
        }
        sidewalkPersonInst.instanceMatrix.needsUpdate = true;
      }

      function animateBusOverlay() {
        const roofInst = vehicleGroup.userData.busRoofInst;
        const winInst = vehicleGroup.userData.busWinInst;
        if (!roofInst || !winInst) return;
        const _m = new THREE.Matrix4();
        for (let i = 0; i < buses.length; i++) {
          const b = buses[i];
          _m.makeTranslation(b.x, b.y + 1.25, b.z);
          roofInst.setMatrixAt(i, _m);
          _m.makeTranslation(b.x, b.y + 0.4, b.z);
          winInst.setMatrixAt(i, _m);
        }
        roofInst.instanceMatrix.needsUpdate = true;
        winInst.instanceMatrix.needsUpdate = true;
      }

      function animateTrafficLights(t) {
        for (let i = 0; i < trafficLightSets.length; i++) {
          const tl = trafficLightSets[i];
          const phase = ((t + tl.phase) % tl.period) / tl.period;
          // 45% red, 10% yellow, 45% green
          let r = 0.1, y = 0.1, g = 0.1;
          if (phase < 0.45) r = 1.4;
          else if (phase < 0.55) y = 1.4;
          else g = 1.4;
          tl.red.emissiveIntensity = r;
          tl.yellow.emissiveIntensity = y;
          tl.green.emissiveIntensity = g;
        }
      }

      function animateWeather(delta) {
        if (weatherParticles && weatherGeo?.attributes.position) {
          const pos = weatherGeo.attributes.position.array;
          const fall = weatherParticles.userData.fallSpeed * delta;
          const wind = weatherParticles.userData.isSnow ? 0.5 * delta : 0;
          for (let i = 0; i < pos.length; i += 3) {
            pos[i] += wind * (Math.random() - 0.5) * 2;
            pos[i + 1] -= fall * (Math.random() * 0.5 + 0.75);
            pos[i + 2] += wind * (Math.random() - 0.5);
            if (pos[i + 1] < -10) {
              pos[i] = Math.random() * groundSize - groundSize / 2;
              pos[i + 1] = 200 + Math.random() * 50;
              pos[i + 2] = Math.random() * groundSize - groundSize / 2;
            }
          }
          weatherGeo.attributes.position.needsUpdate = true;
        }
        if (lightning && settings.weather === "stormy") {
          if (!lightning.userData.nextFlash) {
            lightning.userData.nextFlash = performance.now() + Math.random() * 5000 + 3000;
          }
          const now = performance.now();
          if (now > lightning.userData.nextFlash) {
            lightning.position.set(Math.random() * 600 - 300, 150 + Math.random() * 100, Math.random() * 600 - 300);
            lightning.intensity = 2.0 + Math.random() * 2.0;
            lightning.distance = 800 + Math.random() * 400;
            const flashStart = now;
            const dur = 100 + Math.random() * 100;
            const fade = () => {
              const e = performance.now() - flashStart;
              if (e < dur && lightning) {
                lightning.intensity = THREE.MathUtils.lerp(lightning.intensity, 0, (e / dur) * 0.5);
                requestAnimationFrame(fade);
              } else if (lightning) {
                lightning.intensity = 0;
              }
            };
            fade();
            lightning.userData.nextFlash = now + Math.random() * 6000 + 4000;
          }
        }
      }

      function updatePlayer(delta) {
        if (!player.mesh || appMode !== "free") return;
        
        // Physics constants
        const gravity = -30;
        const jumpVelocity = 12;
        const walkSpeed = moveState.down ? 25 : 12; // Sprint with shift (down)

        // Apply Gravity
        player.velY += gravity * delta;
        player.mesh.position.y += player.velY * delta;

        // Ground Collision
        const terrainY = groundMesh.position.y + getTerrainHeight(player.mesh.position.x, player.mesh.position.z);
        if (player.mesh.position.y <= terrainY) { 
            player.mesh.position.y = terrainY;
            player.velY = 0;
            player.isGrounded = true;
        } else {
            player.isGrounded = false;
        }

        // Jump
        if (moveState.up && player.isGrounded) {
            player.velY = jumpVelocity;
            player.isGrounded = false;
        }

        // Movement relative to camera look
        const dir = new THREE.Vector3(
          moveState.right - moveState.left,
          0,
          moveState.backward - moveState.forward
        );
        
        if (dir.lengthSq() > 0) {
          dir.normalize();
          
          // Determine forward direction from camera's rotation (lon)
          // lookState.lon is in degrees, 0 is east (+x), -90 is north (-z)
          const camRad = THREE.MathUtils.degToRad(lookState.lon);
          const fwd = new THREE.Vector3(Math.cos(camRad), 0, Math.sin(camRad)).normalize();
          const right = new THREE.Vector3().crossVectors(camera.up, fwd).normalize();
          
          // Move player
          player.mesh.position.addScaledVector(fwd, -dir.z * walkSpeed * delta);
          player.mesh.position.addScaledVector(right, dir.x * walkSpeed * delta);
          
          // Rotate player to face movement
          const moveDir = new THREE.Vector3().addScaledVector(fwd, -dir.z).addScaledVector(right, dir.x).normalize();
          player.mesh.rotation.y = Math.atan2(moveDir.x, moveDir.z);
        }

        // Update Camera Look Angles (mouse/touch input)
        const rs = delta * rotateSpeed * 50;
        const rot = (moveState.rotateRight - moveState.rotateLeft) * rs;
        if (rot !== 0) {
          lookState.lon -= rot;
          updateCameraLook();
        }

        // Simple building collision
        let collision = false;
        let pX = player.mesh.position.x;
        let pZ = player.mesh.position.z;
        const checkCollision = (arr) => {
            if (!arr || collision) return;
            for (let i = 0; i < arr.length; i++) {
                const b = arr[i];
                if (Math.abs(pX - b.x) < b.w / 2 + 0.6 && Math.abs(pZ - b.z) < b.d / 2 + 0.6) {
                    collision = true;
                    // simple push out
                    const dx = pX - b.x;
                    const dz = pZ - b.z;
                    if (Math.abs(dx) > Math.abs(dz)) {
                        player.mesh.position.x += Math.sign(dx) * 0.5;
                    } else {
                        player.mesh.position.z += Math.sign(dz) * 0.5;
                    }
                    break;
                }
            }
        };
        if (typeof cafePositions !== "undefined") checkCollision(cafePositions);
        if (typeof brownstonePositions !== "undefined") checkCollision(brownstonePositions);
        if (typeof apartmentPositions !== "undefined") checkCollision(apartmentPositions);

        // Third Person Camera Follow
        const camDist = 6;
        const camHeight = 2.5;
        
        const lonRad = THREE.MathUtils.degToRad(lookState.lon);
        const latRad = THREE.MathUtils.degToRad(lookState.lat);

        // Calculate offset behind player based on camera rotation
        const offset = new THREE.Vector3(
            camDist * Math.cos(latRad) * Math.cos(lonRad),
            camDist * Math.sin(latRad),
            camDist * Math.cos(latRad) * Math.sin(lonRad)
        );
        
        // Target is slightly above player center
        const target = new THREE.Vector3(player.mesh.position.x, player.mesh.position.y + 1.2, player.mesh.position.z);
        camera.position.copy(target).sub(offset);
        camera.lookAt(target);
      }

      // FPS counter
      let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;
      const fpsVal = document.getElementById("fps-val");

      // Compass needle
      const compassNeedle = document.getElementById("compass-needle");

      function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const t = clock.getElapsedTime();

        // Camera/control update branches by mode
        if (appMode === "bmw") {
          updateBMW(delta);
        } else if (appMode === "ftrain") {
          updateFTrain(delta, t);
        } else {
          // free / menu — true fly cam, inlined since updateCameraPosition
          // was deleted at some point and the missing-function call was
          // killing the render loop.
          const ms = delta * 100.0;
          const rs = delta * 50.0;
          const rot = (moveState.rotateRight - moveState.rotateLeft) * rs;
          if (rot !== 0) {
            lookState.lon -= rot;
            updateCameraLook();
          }
          const dir = new THREE.Vector3(
            moveState.right - moveState.left,
            0,
            moveState.backward - moveState.forward
          );
          if (dir.lengthSq() > 0) {
            dir.normalize();
            const fwd = new THREE.Vector3();
            camera.getWorldDirection(fwd);
            fwd.y = 0;
            fwd.normalize();
            const right = new THREE.Vector3().crossVectors(camera.up, fwd).normalize();
            camera.position.addScaledVector(fwd, -dir.z * ms);
            camera.position.addScaledVector(right, dir.x * ms);
          }
          camera.position.y += (moveState.up - moveState.down) * ms;
        }

        // Update ocean time
        if (oceanMesh && oceanMesh.material.uniforms) {
          oceanMesh.material.uniforms.uTime.value = t;
        }

        animateTrains();
        animateTireSmoke(delta);
        animateRides(t);
        animateCarousels(t, delta);
        animateSteam(delta, t);
        animatePigeons(delta, t);
        animateTrafficLights(t);
        animateClouds();
        animateVehicles();
        animateBusOverlay();
        animateExtraVehicles(delta);
        animateSidewalkPeople(delta);
        animateFlyingGulls(t, delta);
        animateWavingFlags(t);
        animateHelicopters(t, delta);
        animateWeather(delta);
        animatePeople(delta);

        // Update photoFX time for film grain
        if (photoFXPass) {
          photoFXPass.material.uniforms.time.value = t;
        }

        // Sun flare faces the camera (billboard)
        if (sunFlareLight && sunFlareLight.visible) {
          sunFlareLight.children.forEach((c) => c.lookAt(camera.position));
        }

        composer.render(delta);

        // FPS
        fpsTimer += delta;
        fpsFrames++;
        if (fpsTimer >= 0.5) {
          fpsAccum = Math.round(fpsFrames / fpsTimer);
          fpsVal.textContent = fpsAccum;
          fpsTimer = 0; fpsFrames = 0;
        }

        // Compass
        compassNeedle.style.transform = `rotate(${-lookState.lon - 90}deg)`;
      }

      /* ============================================================
       *  BOOT
       * ============================================================ */
      // DOMContentLoaded listener disabled
  function buildConey(parentGroup, onDone) {
    // Create ES6 Proxy for scene redirection
    scene = new Proxy(mainScene, {
      get(target, prop) {
        if (prop === 'add') {
          return function(obj) { parentGroup.add(obj); };
        }
        if (prop === 'remove') {
          return function(obj) { parentGroup.remove(obj); };
        }
        if (prop === 'children') {
          return parentGroup.children;
        }
        const val = target[prop];
        if (typeof val === 'function') {
          return val.bind(target);
        }
        return val;
      }
    });
    
    // Create the terrain inside parentGroup
    const segs = 80;
    const groundGeom = new THREE.PlaneGeometry(groundSize, groundSize, segs, segs);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xa8b1ba, roughness: 0.85, metalness: 0.05,
    });
    const posAttr = groundGeom.getAttribute("position");
    const vert = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      vert.fromBufferAttribute(posAttr, i);
      let h = Math.sin(vert.x * 0.02) * Math.cos(vert.y * 0.03) * terrainAmp;
      // sink the plate under the sea past the shoreline so no grey bumps poke through the water
      const lz = -vert.y; // world-local z (positive = toward the ocean)
      let u = Math.min(1, Math.max(0, (lz - 50) / 90)); u = u * u * (3 - 2 * u);
      h = h * (1 - u) + (-3.5) * u;
      posAttr.setZ(i, h);
    }
    groundGeom.computeVertexNormals();
    groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -1.0;
    groundMesh.receiveShadow = true;
    parentGroup.add(groundMesh);

    // Builders run one per tick so the game stays responsive while the city assembles
    const steps = [
      createBoardwalkAndBeach,
      () => createSubwayLines(settings.numSubwayLines),
      () => createHighways(settings.numHighways),
      () => createVehicles(settings.numBuses, settings.numVehicles),
      () => createTreesAndBushes(400, groundSize, groundMesh.position.y + terrainAmp),
      () => createParkArea({ x: -180, z: -120 }),
      () => { estimatedPopulation = 100; createPeople(estimatedPopulation); },   // handful of realistic locals
      () => generateBuildings(settings.numBuildings),
      buildAvenues,
      () => { const rideGroup = new THREE.Group();
        rideGroup.position.set(0, groundMesh.position.y + terrainAmp + 0.5, 15);
        parentGroup.add(rideGroup); buildRides(rideGroup); },
      buildSteeplechasePier,
      buildBnBCarousell,
      buildBoardwalkVendors,
      buildLifeguardChairs,
      buildBeachJetties,
      buildBeachWrack,
      addPlankVariation,
      buildChildsRestaurant,
      createNathansSteam,
      createPigeons,
      buildConeyIslandHouses,
      buildVerrazzanoBridge,
      buildAquarium,
      () => upgradeMCUPark(parentGroup),
    ];
    let si = 0;
    (function slice(){
      const t0 = performance.now();
      while (si < steps.length && performance.now() - t0 < 40) {   // 40ms budget per slice
        try { steps[si++](); } catch (e) { console.warn('coney build step ' + si + ' failed:', e); }
      }
      window.__coneyStep = si;
      if (si < steps.length) setTimeout(slice, 0);
      else if (onDone) onDone();
    })();
  }

  function updateConey(dt, t) {
    animateTrains(dt);
    animateRides(t);
    animateCarousels(t, dt);
    animateSteam(dt, t);
    animatePigeons(dt, t);
    animateTrafficLights(t);
    animateClouds();
    animateVehicles();
    animateExtraVehicles(dt);
    animateSidewalkPeople(dt);
    animateFlyingGulls(t, dt);
    animateWavingFlags(t);
    animateHelicopters(t, dt);
    animatePeople(dt);
    animateAquarium(t);
  }

  /* Attractions the player can ride: seat = animated node to attach to (world transform includes
     all ride motion), off = seat offset in that node's space, gate = where you board (world node
     or local x/z for the subway station), gr = boarding radius around the gate */
  function getRideables() {
    const out = [];
    const cab = wheelMesh && (wheelMesh.userData.swingCabins || [])[0];
    if (cab) out.push({ name: 'WONDER WHEEL', seat: cab, off: new THREE.Vector3(0, -0.35, 0), gate: wheelMesh, gr: 18 });
    if (cycloneTrain) out.push({ name: 'CYCLONE', seat: cycloneTrain, off: new THREE.Vector3(0, 0.85, 0), gate: cycloneTrain.parent || cycloneTrain, gr: 30 });
    if (carouselsAnim.length && carouselsAnim[0].horses.length)
      out.push({ name: 'CAROUSEL', seat: carouselsAnim[0].horses[0].horse, off: new THREE.Vector3(0, 0.55, 0), gate: carouselsAnim[0].rotor, gr: 14 });
    if (trains.length) out.push({ name: 'SUBWAY', seat: trains[0].mesh, off: new THREE.Vector3(0, 1.55, 0),
      seats: trains.slice(0, 2).map(t => t.mesh),
      gates: subwayStations.map(s => ({ x: s.x, z: s.z })), gr: 26,
      gateLocal: { x: trains[0].trackCenterX, z: trains[0].mesh.position.z } });
    return out;
  }
  function getTrainStateFor(px) {
    let best = null, bd = 1e9;
    for (const t of trains.slice(0, 2)) { const d = Math.abs(t.mesh.position.x - px);
      if (d < bd) { bd = d; best = t; } }
    if (!best) return null;
    return { x: best.mesh.position.x, z: best.mesh.position.z, dwell: best.dwell || 0, dir: Math.sign(best.speed), at: best.atStation };
  }

  /* NEW YORK AQUARIUM at the W 8 St footbridge — shark tunnel + seal pool */
  function buildAquarium(){
    const g = new THREE.Group(); scene.add(g);
    const baseY = groundMesh.position.y + terrainAmp + 0.1;
    const cx = -200, cz = -16;
    const teal = new THREE.MeshStandardMaterial({ color: 0x1f6f8a, roughness: 0.6 });
    const main = new THREE.Mesh(new THREE.BoxGeometry(46, 9, 22), teal);
    main.position.set(cx, baseY + 4.5, cz); main.castShadow = true; g.add(main);
    const wave = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 46, 14, 1, true, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2a8aa8, roughness: 0.5, side: THREE.DoubleSide }));
    wave.rotation.z = Math.PI / 2; wave.position.set(cx, baseY + 9, cz); g.add(wave);
    const nb = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 64;
      const s = c.getContext('2d'); s.fillStyle = '#0b3c4e'; s.fillRect(0, 0, 512, 64);
      s.fillStyle = '#8fe0f2'; s.font = 'bold 34px Helvetica,Arial'; s.textAlign = 'center'; s.textBaseline = 'middle';
      s.fillText('NEW YORK AQUARIUM', 256, 33);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const band = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.4), new THREE.MeshBasicMaterial({ map: nb }));
    band.position.set(cx, baseY + 7.6, cz + 11.05); g.add(band);
    const tun = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 26, 12, 1, true, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2fa3c8, roughness: 0.15, metalness: 0.1,
        transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    tun.rotation.z = Math.PI / 2; tun.position.set(cx, baseY + 0.2, cz + 18); g.add(tun);
    const sharkM = new THREE.MeshStandardMaterial({ color: 0x5a6c78, roughness: 0.5 });
    for (let i = 0; i < 3; i++) { const sh2 = new THREE.Group();
      const b2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.6, 4, 8), sharkM); b2.rotation.x = Math.PI / 2; sh2.add(b2);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), sharkM); fin.scale.set(0.3, 1, 1); fin.position.y = 0.5; sh2.add(fin);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), sharkM); tail.scale.set(0.25, 1, 1); tail.rotation.x = -Math.PI / 2; tail.position.z = -1.5; sh2.add(tail);
      g.add(sh2); aquaSharks.push({ m: sh2, cx, cy: baseY + 2.4, cz: cz + 18, ph: i * 2.1 }); }
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.8, 18),
      new THREE.MeshStandardMaterial({ color: 0x2a8fae, roughness: 0.25 }));
    pool.position.set(cx - 30, baseY + 0.4, cz + 14); g.add(pool);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.4, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(cx - 30, baseY + 0.8, cz + 14); g.add(rim);
    const sealM = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.6 });
    for (let i = 0; i < 2; i++) { const se = new THREE.Group();
      const b3 = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 8), sealM); b3.rotation.x = Math.PI / 2 - 0.3; se.add(b3);
      const h3 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), sealM); h3.position.set(0, 0.45, 0.5); se.add(h3);
      g.add(se); aquaSeals.push({ m: se, cx: cx - 30, cy: baseY + 0.85, cz: cz + 14, ph: i * 3 }); }
  }
  function animateAquarium(t){
    for (const s of aquaSharks) { const a = t * 0.5 + s.ph;
      s.m.position.set(s.cx + Math.cos(a) * 9, s.cy + Math.sin(t * 0.8 + s.ph) * 0.4, s.cz + Math.sin(a) * 1.4);
      s.m.rotation.y = Math.atan2(-Math.sin(a) * 9, Math.cos(a) * 1.4); }
    for (const s of aquaSeals) { const a = t * 0.4 + s.ph;
      s.m.position.set(s.cx + Math.cos(a) * 3.4, s.cy + Math.abs(Math.sin(t * 1.2 + s.ph)) * 0.25, s.cz + Math.sin(a) * 3.4);
      s.m.rotation.y = -a + Math.PI / 2; }
  }

  /* Real Verrazzano-Narrows: twin portal towers, double deck, catenary cables + suspenders
     (overrides the earlier simple builder via declaration hoisting) */
  function buildVerrazzanoBridge(){
    const g = new THREE.Group(); g.position.set(-1450, 0, 200); g.rotation.y = -0.35; scene.add(g);
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.45, roughness: 0.55 });
    const cableM = new THREE.MeshStandardMaterial({ color: 0x3c4248, metalness: 0.7, roughness: 0.35 });
    const deckM = new THREE.MeshStandardMaterial({ color: 0x565e66, roughness: 0.8 });
    const span = 720, towerH = 100, deckY = 24, sag = 56, side = 170;
    for (const tx of [-span / 2, span / 2]) {
      for (const tz of [-7, 7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(5, towerH, 5), steel);
        leg.position.set(tx, towerH / 2, tz); g.add(leg); }
      for (const hy of [towerH * 0.55, towerH * 0.8, towerH * 0.98]) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(6, 4.5, 19), steel); cross.position.set(tx, hy, 0); g.add(cross); }
    }
    for (const dy of [0, -6]) { const deck = new THREE.Mesh(new THREE.BoxGeometry(span + side * 2, 2.2, 16), deckM);
      deck.position.set(0, deckY + dy, 0); g.add(deck); }
    for (let i = 0; i < 42; i++) { const x = -(span + side * 2) / 2 + i * ((span + side * 2) / 41);
      for (const pz of [-7, 7]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), steel);
        post.position.set(x, deckY - 3, pz); g.add(post); } }
    for (const cz2 of [-7.5, 7.5]) {
      let prev = null;
      for (let i = 0; i <= 56; i++) { const x = -(span / 2 + side) + i * ((span + side * 2) / 56);
        const ax = Math.abs(x); let y;
        if (ax <= span / 2) { const u = x / (span / 2); y = towerH - 2 - sag * (1 - u * u); }
        else { const f = (ax - span / 2) / side; y = (towerH - 2) * (1 - f) + (deckY + 2) * f; }
        const p = new THREE.Vector3(x, y, cz2);
        if (prev) { const dv = new THREE.Vector3().subVectors(p, prev);
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, dv.length(), 6), cableM);
          seg.position.copy(prev).addScaledVector(dv, 0.5);
          seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.clone().normalize()); g.add(seg); }
        prev = p; }
      for (let i = 1; i < 28; i++) { const x = -span / 2 + i * (span / 28); const u = x / (span / 2);
        const top = towerH - 2 - sag * (1 - u * u); const len = top - (deckY + 1);
        if (len > 1.5) { const sus = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 4), cableM);
          sus.position.set(x, deckY + 1 + len / 2, cz2); g.add(sus); } }
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  function getSubwayStations(){ return subwayStations; }
  function getTrainState(){ const t = trains[0]; if (!t) return null;
    return { x: t.mesh.position.x, z: t.mesh.position.z, dwell: t.dwell || 0, dir: Math.sign(t.speed), at: t.atStation }; }

  /* everything that moves — excluded from static-geometry merging */
  function getDynamicRoots(){
    const roots = [subwayGroup, vehicleGroup, peopleGroup, wheelMesh, cycloneTrain, thunderboltCar,
      dropTowerRide, spinningRide, swingRideTop, simpleFerrisWheel, pirateShipRide, parachuteWarningLight];
    carouselsAnim.forEach(c => roots.push(c.rotor));
    trains.forEach(t => roots.push(t.mesh));
    for (const arr of [helicopters, seagulls]) arr.forEach(h => { for (const v of Object.values(h)) if (v && v.isObject3D) roots.push(v); });
    pigeonsArr.forEach(p => { if (p.mesh) roots.push(p.mesh); });
    aquaSharks.forEach(s => roots.push(s.m)); aquaSeals.forEach(s => roots.push(s.m));
    wavingFlags.forEach(f => { if (f.mesh) roots.push(f.mesh); });
    clouds.forEach(c => { if (c.mesh) roots.push(c.mesh); });
    weatherObjects.forEach(w => { if (w && w.isObject3D) roots.push(w); });
    bulbMeshes.forEach(b => roots.push(b));
    return roots.filter(Boolean);
  }

  let moodMats = null;
  function setMood(f){   // 0 = day … 1 = night: boardwalk bulbs blaze, apartment windows glow
    if (!moodMats) { moodMats = { bulb: [], win: [], glow: [] };
      bulbMeshes.forEach(b => { if (b.material) moodMats.bulb.push(b.material); });
      buildingGroup.traverse(o => { if (o.isMesh && o.material && o.material.map && !moodMats.win.includes(o.material)) moodMats.win.push(o.material); });
      subwayGroup.traverse(o => { const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m && m.userData && m.userData.nightGlow != null && !moodMats.glow.includes(m)) moodMats.glow.push(m); }); });
    }
    moodMats.bulb.forEach(m => { m.emissiveIntensity = 0.4 + 2.4 * f; });
    moodMats.glow.forEach(m => { m.emissiveIntensity = m.userData.nightGlow * f; });
    moodMats.win.forEach(m => { if (!m.emissiveMap) { m.emissiveMap = m.map; m.emissive = new THREE.Color(0xffe9b0); m.needsUpdate = true; }
      m.emissiveIntensity = 0.75 * f; });
  }

  return {
    build: buildConey,
    update: updateConey,
    getPeople: () => people,
    getRideables,
    getSubwayStations,
    getTrainState,
    getTrainStateFor,
    getDynamicRoots,
    setMood,
    getTerrainHeight
  };
}
