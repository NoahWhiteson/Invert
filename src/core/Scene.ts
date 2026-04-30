import * as THREE from 'three'

export class SceneSetup {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  public renderer: THREE.WebGLRenderer

  private getViewportSize(): { width: number; height: number } {
    const vv = window.visualViewport
    const width = Math.max(1, Math.round(vv?.width ?? window.innerWidth))
    const height = Math.max(1, Math.round(vv?.height ?? window.innerHeight))
    return { width, height }
  }

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xffffff)

    const initial = this.getViewportSize()
    this.camera = new THREE.PerspectiveCamera(75, initial.width / initial.height, 0.1, 1000)
    this.camera.rotation.order = 'YXZ'

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.setSize(initial.width, initial.height)
    const maxDpr = 1.25 // Capped to 1.25 to prevent massive lag on high DPI screens (like MacBooks)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr))
    this.renderer.sortObjects = false
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    document.body.appendChild(this.renderer.domElement)

    const onViewportChange = () => this.onResize()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)
    window.visualViewport?.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('scroll', onViewportChange)
    window.setTimeout(onViewportChange, 50)
    window.setTimeout(onViewportChange, 250)
  }

  private onResize() {
    const { width, height } = this.getViewportSize()
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    this.renderer.setSize(width, height)
  }

  public render() {
    this.renderer.render(this.scene, this.camera)
  }
}
