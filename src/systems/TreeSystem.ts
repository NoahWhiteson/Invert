import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { placeOnSphere } from '../core/Utils'

export type TreePlacement = {
  phi: number
  theta: number
  scale: number
}

export class TreeSystem {
  public treeMaterial: THREE.ShaderMaterial
  public treeOutlineMaterial: THREE.ShaderMaterial
  private textureLoader = new THREE.TextureLoader()
  private objLoader = new OBJLoader()
  private sourceTree: THREE.Group | null = null
  private container: THREE.Group
  private sphereRadius: number
  private treeLayout: TreePlacement[] = []
  private collisionBodies: { position: THREE.Vector3; radius: number }[] = []

  constructor(scene: THREE.Scene, sphereRadius: number) {
    this.sphereRadius = sphereRadius
    this.container = new THREE.Group()
    this.container.name = 'treeSystemContainer'
    scene.add(this.container)

    const pineTexture = this.textureLoader.load(new URL('../assets/models/grave_map/colormap.png', import.meta.url).href)
    pineTexture.colorSpace = THREE.SRGBColorSpace
    pineTexture.magFilter = THREE.NearestFilter

    const treeVertexShader = `
      varying vec2 vUv;
      varying float vHeight;
      varying float vNoise;
      uniform float uTime;
      uniform float uWindIntensity;
      
      vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                 -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
          dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 a0 = x - floor(x + 0.5);
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vUv = uv;
        vHeight = position.y; 
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        float windSpeed = 0.4;
        float largeSway = snoise(worldPos.xz * 0.03 + uTime * windSpeed);
        float smallSway = snoise(worldPos.xz * 0.2 + uTime * windSpeed * 2.5) * 0.2;
        float noise = largeSway + smallSway;
        vNoise = noise;
        vec3 pos = position;
        #ifdef IS_OUTLINE
          pos += normal * 0.03;
        #endif
        float h = max(0.0, vHeight);
        float bendFactor = pow(h / 6.0, 2.2); 
        vec2 swayDir = vec2(noise, snoise(worldPos.zx * 0.04 + uTime * 0.35));
        pos.xz += swayDir * bendFactor * uWindIntensity * 10.0;
        float horizontalShift = length(swayDir * bendFactor * uWindIntensity * 10.0);
        pos.y -= horizontalShift * 0.15 * (h / 6.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `

    this.treeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWindIntensity: { value: 0.2 },
        uTexture: { value: pineTexture }
      },
      side: THREE.DoubleSide,
      vertexShader: treeVertexShader,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeight;
        varying float vNoise;
        uniform sampler2D uTexture;
        void main() {
          vec4 texColor = texture2D(uTexture, vUv);
          // Convert texture to grayscale and boost it to white-ish
          float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 baseColor = vec3(1.0); // Pure white objects
          
          float hFactor = clamp(vHeight / 5.0, 0.0, 1.0);
          // Subtle shading to give it some form while staying white
          float shade = mix(0.8, 1.0, 0.4 + hFactor * 0.6);
          vec3 color = baseColor * shade;
          
          gl_FragColor = vec4(color, texColor.a);
          if (texColor.a < 0.5) discard;
        }
      `
    })

    this.treeOutlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWindIntensity: { value: 0.2 }
      },
      side: THREE.BackSide,
      defines: { IS_OUTLINE: true },
      vertexShader: treeVertexShader,
      fragmentShader: `
        void main() {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black outlines
        }
      `
    })

  }

  public update(time: number) {
    if (this.treeMaterial.uniforms) this.treeMaterial.uniforms.uTime.value = time
    if (this.treeOutlineMaterial.uniforms) this.treeOutlineMaterial.uniforms.uTime.value = time
  }

  public async init(layout: TreePlacement[]) {
    await this.ensureSourceTreeLoaded()
    this.rebuild(layout)
  }

  private async ensureSourceTreeLoaded() {
    if (this.sourceTree) return
    const object = await this.objLoader.loadAsync(new URL('../assets/models/grave_map/pine.obj', import.meta.url).href)
    const meshes: THREE.Mesh[] = []
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh)
      }
    })

    meshes.forEach((mesh) => {
      mesh.material = this.treeMaterial
      mesh.castShadow = true
      mesh.receiveShadow = true
      const outline = new THREE.Mesh(mesh.geometry, this.treeOutlineMaterial)
      mesh.add(outline)
    })

    this.sourceTree = object
  }

  private rebuild(layout: TreePlacement[]) {
    this.container.clear()
    this.treeLayout = []
    this.collisionBodies = []
    if (!this.sourceTree) return

    for (const tree of layout) {
      const treeGroup = this.sourceTree.clone()
      treeGroup.scale.set(tree.scale, tree.scale, tree.scale)
      placeOnSphere(treeGroup, this.sphereRadius, tree.phi, tree.theta, -0.1)
      treeGroup.userData = { ...tree }
      this.container.add(treeGroup)
      treeGroup.updateWorldMatrix(true, false)

      const position = new THREE.Vector3()
      treeGroup.getWorldPosition(position)
      this.treeLayout.push({ ...tree })
      this.collisionBodies.push({
        position,
        radius: Math.max(0.55, tree.scale * 0.48),
      })
    }
  }

  public getTreeLayout(): TreePlacement[] {
    return this.treeLayout
  }

  public getCollisionBodies(): Array<{ position: THREE.Vector3; radius: number }> {
    return this.collisionBodies
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.container.children
  }
}
