import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Settings
const WEPS_PATH = '/src/assets/player/weps/'
const ANIMS_PATH = '/src/assets/player/animations/'

// State
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let mixer: THREE.AnimationMixer | null = null

let playerModel: THREE.Group | undefined
let currentWeapon: THREE.Group | undefined
let rightHandBone: THREE.Bone | undefined
let weaponAnchor: THREE.Group | undefined
let currentAction: THREE.AnimationAction | null = null

const clock = new THREE.Clock()
const loader = new FBXLoader()

// UI Elements
const wepSelect = document.getElementById('wepSelect') as HTMLSelectElement
const animSelect = document.getElementById('animSelect') as HTMLSelectElement
const toggleAnimBtn = document.getElementById('toggleAnimBtn') as HTMLButtonElement
const resetTransformBtn = document.getElementById('resetTransformBtn') as HTMLButtonElement
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement
const output = document.getElementById('output') as HTMLDivElement

const inputs = {
  px: document.getElementById('posX') as HTMLInputElement,
  py: document.getElementById('posY') as HTMLInputElement,
  pz: document.getElementById('posZ') as HTMLInputElement,
  rx: document.getElementById('rotX') as HTMLInputElement,
  ry: document.getElementById('rotY') as HTMLInputElement,
  rz: document.getElementById('rotZ') as HTMLInputElement,
  s: document.getElementById('scale') as HTMLInputElement
}

const displays = {
  px: document.getElementById('valPosX') as HTMLSpanElement,
  py: document.getElementById('valPosY') as HTMLSpanElement,
  pz: document.getElementById('valPosZ') as HTMLSpanElement,
  rx: document.getElementById('valRotX') as HTMLSpanElement,
  ry: document.getElementById('valRotY') as HTMLSpanElement,
  rz: document.getElementById('valRotZ') as HTMLSpanElement,
  s: document.getElementById('valScale') as HTMLSpanElement
}

const WEP_DEFAULTS: Record<string, {px:number, py:number, pz:number, rx:number, ry:number, rz:number, s:number}> = {
  'ak47.fbx': { px: 0.14, py: -0.11, pz: -0.42, rx: 0, ry: 1.57, rz: 0, s: 0.0085 },
  'shotgun.fbx': { px: 0.13, py: -0.1, pz: -0.38, rx: 0.03, ry: 1.7, rz: 0, s: 0.0085 },
  'nade_low.fbx': { px: 0.18, py: -0.14, pz: -0.32, rx: -0.35, ry: 0.25, rz: 0.15, s: 0.012 }
}

async function init() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x333333)
  scene.fog = new THREE.Fog(0x333333, 10, 50)

  const gridHelper = new THREE.GridHelper(20, 20, 0x555555, 0x444444)
  scene.add(gridHelper)

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8)
  hemiLight.position.set(0, 20, 0)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(3, 10, -10)
  scene.add(dirLight)

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(1, 1.5, -2)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.update()

  try {
    console.log("Loading player model...")
    playerModel = await loader.loadAsync(ANIMS_PATH + 'Idle.fbx')
    
    playerModel.scale.setScalar(0.01)
    const box = new THREE.Box3().setFromObject(playerModel)
    const size = new THREE.Vector3()
    box.getSize(size)
    if (size.y > 0 && size.y < 0.25) {
      playerModel.scale.setScalar(1)
    }

    const meshes: THREE.Mesh[] = []
    playerModel.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        meshes.push(c as THREE.Mesh)
      }
    })

    for (const m of meshes) {
      m.castShadow = true
      m.receiveShadow = true
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        ;(m as THREE.SkinnedMesh).frustumCulled = false
      }
      
      m.material = new THREE.MeshToonMaterial({
        color: 0xaaaaaa,
        side: THREE.DoubleSide,
      })

      // Add black outline exactly like PlayerModel.ts
      const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
      const outlineMesh = new THREE.Mesh(m.geometry, outlineMat)
      outlineMesh.scale.multiplyScalar(1.05)
      m.add(outlineMesh)
    }
    
    scene.add(playerModel)
    mixer = new THREE.AnimationMixer(playerModel)

    playerModel.traverse((c) => {
      if ((c as THREE.Bone).isBone) {
         const boneName = c.name.toLowerCase()
         // Exact match to avoid partial matches on 'mixamorigLeftHand' which contains 'r'
         if (boneName.includes('righthand') && !boneName.includes('index') && !boneName.includes('thumb') && !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
           if (!rightHandBone) rightHandBone = c as THREE.Bone
         }
      }
    })

    weaponAnchor = new THREE.Group()
    const axesHelper = new THREE.AxesHelper(0.5)
    weaponAnchor.add(axesHelper)
    
    if (rightHandBone) {
      console.log("Found Right Hand Bone:", rightHandBone.name)
      rightHandBone.add(weaponAnchor)
    } else {
      console.warn("Could not find right hand bone. Attaching to root.")
      playerModel.add(weaponAnchor)
    }

    await loadWeapon(wepSelect.value)
    await loadAnimation(animSelect.value)

  } catch (e) {
    console.error("Error loading base model:", e)
    output.textContent = "ERROR Loading model. Check console."
  }

  wepSelect.addEventListener('change', () => void loadWeapon(wepSelect.value))
  animSelect.addEventListener('change', () => void loadAnimation(animSelect.value))
  
  toggleAnimBtn.addEventListener('click', () => {
    if (!currentAction) return
    currentAction.paused = !currentAction.paused
  })

  resetTransformBtn.addEventListener('click', () => {
    if (!currentWeapon) return
    const fn = wepSelect.value
    const d = WEP_DEFAULTS[fn] || { px:0, py:0, pz:0, rx:0, ry:0, rz:0, s:0.01 }
    
    inputs.px.value = d.px.toString()
    inputs.py.value = d.py.toString()
    inputs.pz.value = d.pz.toString()
    inputs.rx.value = d.rx.toString()
    inputs.ry.value = d.ry.toString()
    inputs.rz.value = d.rz.toString()
    inputs.s.value = d.s.toString()
    
    updateWeaponTransform()
  })

  copyBtn.addEventListener('click', () => {
    const px = parseFloat(inputs.px.value)
    const py = parseFloat(inputs.py.value)
    const pz = parseFloat(inputs.pz.value)
    const rx = parseFloat(inputs.rx.value)
    const ry = parseFloat(inputs.ry.value)
    const rz = parseFloat(inputs.rz.value)
    const s = parseFloat(inputs.s.value)

    const str = `
{
  pos: new THREE.Vector3(${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)}),
  rot: new THREE.Euler(${rx.toFixed(2)}, ${ry.toFixed(2)}, ${rz.toFixed(2)}),
  uniformScale: ${s.toFixed(4)}
}`
    void navigator.clipboard.writeText(str)
    copyBtn.textContent = "Copied!"
    setTimeout(() => copyBtn.textContent = "Copy Config JSON", 2000)
  })

  Object.values(inputs).forEach(input => {
    input.addEventListener('input', updateWeaponTransform)
  })

  window.addEventListener('resize', onWindowResize)
  
  animate()
}

async function loadWeapon(filename: string) {
  if (currentWeapon && weaponAnchor) {
    weaponAnchor.remove(currentWeapon)
  }
  try {
    currentWeapon = await loader.loadAsync(WEPS_PATH + filename)
    
    const weaponMeshes: THREE.Mesh[] = []
    currentWeapon.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        weaponMeshes.push(c as THREE.Mesh)
      }
    })

    for (const m of weaponMeshes) {
      m.castShadow = true
      m.receiveShadow = true
      m.material = new THREE.MeshToonMaterial({ color: 0xffffff })

      const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
      const outlineMesh = new THREE.Mesh(m.geometry, outlineMat)
      outlineMesh.scale.multiplyScalar(1.05)
      m.add(outlineMesh)
    }

    if (weaponAnchor) {
      weaponAnchor.add(currentWeapon)
    }
    
    const d = WEP_DEFAULTS[filename]
    if (d) {
       inputs.px.value = d.px.toString()
       inputs.py.value = d.py.toString()
       inputs.pz.value = d.pz.toString()
       inputs.rx.value = d.rx.toString()
       inputs.ry.value = d.ry.toString()
       inputs.rz.value = d.rz.toString()
       inputs.s.value = d.s.toString()
    }

    updateWeaponTransform()
  } catch (e) {
     console.error("Error loading weapon:", e)
  }
}

async function loadAnimation(filename: string) {
  if (!mixer) return
  try {
    const animFbx = await loader.loadAsync(ANIMS_PATH + filename)
    const clip = animFbx.animations[0]
    if (!clip) return

    // Apply stationary root motion to keep the character in place
    clip.tracks = clip.tracks.filter(track => {
      const isRootPos = track.name.endsWith('.position') && 
                       (track.name.includes('Hips') || track.name.includes('Root') || track.name.split('.')[0] === '0')
      if (isRootPos) {
        // Safe access ignoring TS warnings for built-in ThreeJS track structures
        const values = (track as any).values as Float32Array
        for (let j = 0; j < values.length; j += 3) {
          values[j] = 0     // X
          values[j + 1] = 0 // Y 
          values[j + 2] = 0 // Z
        }
      }
      return true 
    })

    mixer.stopAllAction()
    currentAction = mixer.clipAction(clip)
    currentAction.play()
    // By default keep it playing but they can pause it
  } catch (e) {
      console.error("Error loading animation:", e)
  }
}

function updateWeaponTransform() {
  if (!currentWeapon) return

  const px = parseFloat(inputs.px.value)
  const py = parseFloat(inputs.py.value)
  const pz = parseFloat(inputs.pz.value)
  
  const rx = parseFloat(inputs.rx.value)
  const ry = parseFloat(inputs.ry.value)
  const rz = parseFloat(inputs.rz.value)
  
  const s = parseFloat(inputs.s.value)

  currentWeapon.position.set(px, py, pz)
  currentWeapon.rotation.set(rx, ry, rz, 'YXZ')
  currentWeapon.scale.setScalar(s)

  displays.px.textContent = px.toFixed(3)
  displays.py.textContent = py.toFixed(3)
  displays.pz.textContent = pz.toFixed(3)
  displays.rx.textContent = rx.toFixed(2)
  displays.ry.textContent = ry.toFixed(2)
  displays.rz.textContent = rz.toFixed(2)
  displays.s.textContent = s.toFixed(4)

  const str = `
{
  pos: new THREE.Vector3(${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)}),
  rot: new THREE.Euler(${rx.toFixed(2)}, ${ry.toFixed(2)}, ${rz.toFixed(2)}, 'YXZ'),
  uniformScale: ${s.toFixed(4)}
}`
  output.textContent = str
}

function onWindowResize() {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
}

function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()
  if (mixer) mixer.update(delta)
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

void init()
