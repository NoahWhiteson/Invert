import * as THREE from 'three'

export class GrassSystem {
  public grassBladeMat: THREE.ShaderMaterial
  public grassChunks: THREE.InstancedMesh[] = []

  constructor(scene: THREE.Scene, sphereRadius: number, grassCount: number = 200000, _chunksCount: number = 20) {
    const bladeWidth = 0.16
    const bladeHeight = 0.55
    const bladeSegments = 6
    const grassBladeGeo = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 2, bladeSegments)
    grassBladeGeo.translate(0, bladeHeight / 2, 0)

    const posAttr = grassBladeGeo.attributes.position
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i)
      const y = posAttr.getY(i)
      const fold = (1.0 - Math.abs(x / (bladeWidth / 2))) * 0.02
      posAttr.setZ(i, fold + Math.pow(y / bladeHeight, 2.0) * 0.05)
    }

    this.grassBladeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWindIntensity: { value: 0.8 },
        uColor: { value: new THREE.Color(0x4da64d) }
      },
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying float vHeight;
        varying vec3 vColor;
        varying float vNoise;
        varying float vDepth;
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
          vHeight = position.y / 0.5;
          vColor = instanceColor;
          vec4 worldInstancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float windSpeed = 0.6;
          float noise1 = snoise(worldInstancePos.xz * 0.05 + uTime * windSpeed);
          float noise2 = snoise(worldInstancePos.xz * 0.2 + uTime * windSpeed * 1.5);
          float wind = (noise1 * 0.7 + noise2 * 0.3);
          vNoise = wind;
          float bladeId = worldInstancePos.x * 12.34 + worldInstancePos.z * 56.78;
          float naturalBend = 0.15 * sin(bladeId);
          float bendAmount = pow(vHeight, 2.2) * (wind * uWindIntensity + naturalBend);
          vec3 pos = position;
          float taper = 1.0 - pow(vHeight, 1.5);
          pos.x *= taper;
          pos.x += bendAmount;
          pos.z += bendAmount * 0.4 * wind;
          float twist = 0.2 * vHeight * sin(bladeId);
          float cosT = cos(twist);
          float sinT = sin(twist);
          float nx = pos.x * cosT - pos.z * sinT;
          float nz = pos.x * sinT + pos.z * cosT;
          pos.x = nx;
          pos.z = nz;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeight;
        varying vec3 vColor;
        varying float vNoise;
        varying float vDepth;
        void main() {
          vec3 baseColor = vec3(1.0); // Pure white blades
          
          // Determine LOD weights based on distance
          float nearWeight = 1.0 - smoothstep(8.0, 14.0, vDepth);
          float midWeight = smoothstep(8.0, 14.0, vDepth) * (1.0 - smoothstep(30.0, 45.0, vDepth));
          float farWeight = smoothstep(30.0, 45.0, vDepth);
          
          // 1. Near Detail: Outlines + Shading
          // Using fwidth() for perfectly stable anti-aliased outlines
          float edgeDist = abs(vUv.x - 0.5);
          float fw = fwidth(edgeDist);
          float edgeWidth = 0.42;
          float edge = smoothstep(edgeWidth - fw, edgeWidth + fw, edgeDist);
          
          float tipDist = 1.0 - vUv.y;
          float fwTip = fwidth(tipDist);
          float tip = 1.0 - smoothstep(0.02 - fwTip, 0.02 + fwTip, tipDist);
          
          float outline = max(edge, tip);
          
          // 2. Mid Detail: Shading only
          float shade = mix(0.7, 1.0, vHeight);
          
          // Composite the result
          vec3 color = baseColor;
          
          // Apply shading to near and mid
          color *= mix(1.0, shade, nearWeight + midWeight);
          
          // Apply outlines only to near, with fading
          color = mix(color, vec3(0.0), outline * nearWeight);
          
          // For far, we just use the flat base color (no shading, no outline)
          color = mix(color, baseColor, farWeight);
          
          color *= smoothstep(-0.1, 0.2, vHeight);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    })

    const grassData: { matrix: THREE.Matrix4, color: THREE.Color }[] = []
    const dummy = new THREE.Object3D()

    for (let i = 0; i < grassCount; i++) {
      const phi = Math.acos(-1 + (2 * Math.random()))
      const theta = 2 * Math.PI * Math.random()
      const pos = new THREE.Vector3().setFromSphericalCoords(sphereRadius, phi, theta)
      dummy.position.copy(pos)
      dummy.lookAt(0, 0, 0)
      dummy.rotateX(Math.PI / 2)
      dummy.rotateY(Math.random() * Math.PI)
      const hBase = 0.6 + Math.pow(Math.random(), 1.5) * 1.2
      dummy.scale.set(0.8 + Math.random() * 0.4, hBase, 0.8 + Math.random() * 0.4)
      dummy.updateMatrix()
      
      grassData.push({ matrix: dummy.matrix.clone(), color: new THREE.Color(1, 1, 1) })
    }

    // Spatial partitioning into a 3D grid for frustum culling
    const gridSize = 4 // 64 regional chunks
    const buckets: { matrix: THREE.Matrix4, color: THREE.Color }[][] = Array.from({ length: gridSize * gridSize * gridSize }, () => [])

    for (const data of grassData) {
      const pos = new THREE.Vector3().setFromMatrixPosition(data.matrix)
      const cx = Math.max(0, Math.min(gridSize - 1, Math.floor(((pos.x / sphereRadius) + 1) / 2 * gridSize)))
      const cy = Math.max(0, Math.min(gridSize - 1, Math.floor(((pos.y / sphereRadius) + 1) / 2 * gridSize)))
      const cz = Math.max(0, Math.min(gridSize - 1, Math.floor(((pos.z / sphereRadius) + 1) / 2 * gridSize)))
      const bucketIdx = cx + cy * gridSize + cz * gridSize * gridSize
      buckets[bucketIdx].push(data)
    }

    for (const bucket of buckets) {
      if (bucket.length === 0) continue
      
      // Clone geometry for each chunk to assign unique bounding spheres
      const chunkGeo = grassBladeGeo.clone()
      const chunk = new THREE.InstancedMesh(chunkGeo, this.grassBladeMat, bucket.length)
      chunk.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      chunk.receiveShadow = false
      
      const center = new THREE.Vector3()
      for (let i = 0; i < bucket.length; i++) {
        chunk.setMatrixAt(i, bucket[i].matrix)
        chunk.setColorAt(i, bucket[i].color)
        const pos = new THREE.Vector3().setFromMatrixPosition(bucket[i].matrix)
        center.add(pos)
      }
      center.divideScalar(bucket.length)
      
      let maxRadiusSq = 0
      for (let i = 0; i < bucket.length; i++) {
        const pos = new THREE.Vector3().setFromMatrixPosition(bucket[i].matrix)
        const distSq = pos.distanceToSquared(center)
        if (distSq > maxRadiusSq) maxRadiusSq = distSq
      }
      
      chunkGeo.boundingSphere = new THREE.Sphere(center, Math.sqrt(maxRadiusSq) + 1.0)
      chunk.frustumCulled = true
      
      scene.add(chunk)
      this.grassChunks.push(chunk)
    }
  }

  public update(time: number) {
    if (this.grassBladeMat.uniforms) {
      this.grassBladeMat.uniforms.uTime.value = time
    }
  }

  public setVisible(visible: boolean) {
    for (const chunk of this.grassChunks) {
      chunk.visible = visible
    }
  }
}
