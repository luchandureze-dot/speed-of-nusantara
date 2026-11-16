        const MAX_SKID_SEGMENTS = 4800;
        const _skidRoadHint = { segmentIndex: -1 };
        let skidMesh = null;
        let skidGeometry = null;
        let skidPositions = null;
        let skidUvs = null;
        let skidAlphas = null;
        let skidWriteIndex = 0;
        let skidHasPendingUpload = false;
        let skidTrails = [];

        function createSkidmarkTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            ctx.clearRect(0, 0, 64, 64);

            // Pola jejak ban dengan dua alur tipis di tengah dan tepi halus
            const horizGrad = ctx.createLinearGradient(0, 0, 64, 0);
            horizGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
            horizGrad.addColorStop(0.14, 'rgba(0, 0, 0, 0.92)');
            horizGrad.addColorStop(0.36, 'rgba(0, 0, 0, 0.98)');
            horizGrad.addColorStop(0.41, 'rgba(0, 0, 0, 0.45)');
            horizGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.96)');
            horizGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.96)');
            horizGrad.addColorStop(0.59, 'rgba(0, 0, 0, 0.45)');
            horizGrad.addColorStop(0.64, 'rgba(0, 0, 0, 0.98)');
            horizGrad.addColorStop(0.86, 'rgba(0, 0, 0, 0.92)');
            horizGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = horizGrad;
            ctx.fillRect(0, 0, 64, 64);

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }

        function initSkidmarksSystem() {
            if (skidMesh || !scene) return;

            const vertexCount = MAX_SKID_SEGMENTS * 4;
            const indexCount = MAX_SKID_SEGMENTS * 6;
            skidPositions = new Float32Array(vertexCount * 3);
            skidUvs = new Float32Array(vertexCount * 2);
            skidAlphas = new Float32Array(vertexCount);
            const indices = new Uint16Array(indexCount);

            for (let i = 0; i < MAX_SKID_SEGMENTS; i++) {
                const v = i * 4;
                const idx = i * 6;
                indices[idx] = v;
                indices[idx + 1] = v + 1;
                indices[idx + 2] = v + 2;
                indices[idx + 3] = v + 1;
                indices[idx + 4] = v + 3;
                indices[idx + 5] = v + 2;
            }

            skidGeometry = new THREE.BufferGeometry();
            skidGeometry.setAttribute('position', new THREE.BufferAttribute(skidPositions, 3));
            skidGeometry.setAttribute('uv', new THREE.BufferAttribute(skidUvs, 2));
            skidGeometry.setAttribute('alpha', new THREE.BufferAttribute(skidAlphas, 1));
            skidGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

            const skidTexture = createSkidmarkTexture();
            const fogColor = scene.fog ? scene.fog.color.clone() : new THREE.Color(0x0a0a1a);
            const fogDensity = scene.fog && typeof scene.fog.density === 'number' ? scene.fog.density : 0.0022;

            const skidMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uMap: { value: skidTexture },
                    uColor: { value: new THREE.Color(0x08090c) },
                    uFogColor: { value: fogColor },
                    uFogDensity: { value: fogDensity }
                },
                vertexShader: `
                    attribute float alpha;
                    varying vec2 vUv;
                    varying float vAlpha;
                    varying float vViewDepth;
                    void main() {
                        vUv = uv;
                        vAlpha = alpha;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        vViewDepth = -mvPosition.z;
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uMap;
                    uniform vec3 uColor;
                    uniform vec3 uFogColor;
                    uniform float uFogDensity;
                    varying vec2 vUv;
                    varying float vAlpha;
                    varying float vViewDepth;
                    void main() {
                        float texAlpha = texture2D(uMap, vUv).a;
                        float finalAlpha = texAlpha * vAlpha;
                        if (finalAlpha < 0.01) discard;
                        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
                        vec3 color = mix(uColor, uFogColor, clamp(fogFactor, 0.0, 1.0));
                        gl_FragColor = vec4(color, finalAlpha);
                    }
                `,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -3,
                polygonOffsetUnits: -3,
                side: THREE.DoubleSide
            });

            skidMesh = new THREE.Mesh(skidGeometry, skidMaterial);
            skidMesh.frustumCulled = false;
            skidMesh.renderOrder = 2;
            scene.add(skidMesh);
        }

        function createEmptyTrailState() {
            return {
                active: false,
                x: 0,
                y: 0,
                z: 0,
                lx: 0,
                ly: 0,
                lz: 0,
                rx: 0,
                ry: 0,
                rz: 0,
                alpha: 0,
                vCoord: 0
            };
        }

        function resetSkidTrails() {
            for (let i = 0; i < skidTrails.length; i++) {
                skidTrails[i].active = false;
            }
            for (let i = 0; i < trafficCars.length; i++) {
                const trails = trafficCars[i].userData && trafficCars[i].userData.skidTrails;
                if (trails) {
                    for (let w = 0; w < trails.length; w++) {
                        trails[w].active = false;
                    }
                }
            }
        }

        function clearSkidmarks() {
            resetSkidTrails();
            skidTrails = [];
            skidWriteIndex = 0;
            if (!skidGeometry || !skidAlphas) return;
            skidAlphas.fill(0);
            skidGeometry.attributes.alpha.needsUpdate = true;
            skidHasPendingUpload = false;
        }

        function emitSkidQuad(p0Lx, p0Ly, p0Lz, p0Rx, p0Ry, p0Rz, p1Lx, p1Ly, p1Lz, p1Rx, p1Ry, p1Rz, a0, a1, v0, v1) {
            const vBase = skidWriteIndex * 4;
            const pOffset = vBase * 3;
            const uvOffset = vBase * 2;

            skidPositions[pOffset] = p0Lx;
            skidPositions[pOffset + 1] = p0Ly;
            skidPositions[pOffset + 2] = p0Lz;

            skidPositions[pOffset + 3] = p0Rx;
            skidPositions[pOffset + 4] = p0Ry;
            skidPositions[pOffset + 5] = p0Rz;

            skidPositions[pOffset + 6] = p1Lx;
            skidPositions[pOffset + 7] = p1Ly;
            skidPositions[pOffset + 8] = p1Lz;

            skidPositions[pOffset + 9] = p1Rx;
            skidPositions[pOffset + 10] = p1Ry;
            skidPositions[pOffset + 11] = p1Rz;

            skidUvs[uvOffset] = 0;
            skidUvs[uvOffset + 1] = v0;
            skidUvs[uvOffset + 2] = 1;
            skidUvs[uvOffset + 3] = v0;
            skidUvs[uvOffset + 4] = 0;
            skidUvs[uvOffset + 5] = v1;
            skidUvs[uvOffset + 6] = 1;
            skidUvs[uvOffset + 7] = v1;

            skidAlphas[vBase] = a0;
            skidAlphas[vBase + 1] = a0;
            skidAlphas[vBase + 2] = a1;
            skidAlphas[vBase + 3] = a1;

            skidWriteIndex = (skidWriteIndex + 1) % MAX_SKID_SEGMENTS;
            skidHasPendingUpload = true;
        }

        function stepSkidTrail(trail, wx, wy, wz, halfWidth, skidIntensity, velX, velZ, fallbackDirX, fallbackDirZ) {
            const targetAlpha = THREE.MathUtils.clamp(0.22 + skidIntensity * 0.66, 0.2, 0.88);

            if (!trail.active) {
                let dirX = velX;
                let dirZ = velZ;
                const velMag = Math.hypot(dirX, dirZ);
                if (velMag > 0.25) {
                    dirX /= velMag;
                    dirZ /= velMag;
                } else {
                    dirX = fallbackDirX;
                    dirZ = fallbackDirZ;
                }
                const perpX = -dirZ;
                const perpZ = dirX;
                trail.active = true;
                trail.x = wx;
                trail.y = wy;
                trail.z = wz;
                trail.lx = wx - perpX * halfWidth;
                trail.ly = wy;
                trail.lz = wz - perpZ * halfWidth;
                trail.rx = wx + perpX * halfWidth;
                trail.ry = wy;
                trail.rz = wz + perpZ * halfWidth;
                trail.alpha = targetAlpha;
                trail.vCoord = 0;
                return;
            }

            const dx = wx - trail.x;
            const dz = wz - trail.z;
            const stepDist = Math.hypot(dx, dz);
            if (stepDist < 0.22) return;

            if (stepDist > 4.5) {
                trail.active = false;
                return;
            }

            const dirX = dx / stepDist;
            const dirZ = dz / stepDist;
            const perpX = -dirZ;
            const perpZ = dirX;
            const currLx = wx - perpX * halfWidth;
            const currLy = wy;
            const currLz = wz - perpZ * halfWidth;
            const currRx = wx + perpX * halfWidth;
            const currRy = wy;
            const currRz = wz + perpZ * halfWidth;
            const nextVCoord = trail.vCoord + stepDist * 0.6;

            emitSkidQuad(
                trail.lx, trail.ly, trail.lz,
                trail.rx, trail.ry, trail.rz,
                currLx, currLy, currLz,
                currRx, currRy, currRz,
                trail.alpha, targetAlpha,
                trail.vCoord, nextVCoord
            );

            trail.x = wx;
            trail.y = wy;
            trail.z = wz;
            trail.lx = currLx;
            trail.ly = currLy;
            trail.lz = currLz;
            trail.rx = currRx;
            trail.ry = currRy;
            trail.rz = currRz;
            trail.alpha = targetAlpha;
            trail.vCoord = nextVCoord;
        }

        function sampleRoadHeightByProgress(progress) {
            if (!roadSegments.length) return 0;
            const t = ((progress % 1) + 1) % 1;
            const exactIndex = t * roadSegments.length;
            const index = Math.floor(exactIndex) % roadSegments.length;
            const frac = exactIndex - Math.floor(exactIndex);
            const seg = roadSegments[index];
            return seg.start.y + (seg.end.y - seg.start.y) * frac;
        }

        function updatePlayerSkidmarks(onRoad, roadContact) {
            if (!skidMesh || !hasStarted || !playerCar || !onRoad || isAirborne || !tireLayout.length) {
                for (let i = 0; i < skidTrails.length; i++) {
                    skidTrails[i].active = false;
                }
                return;
            }

            const cosYaw = Math.cos(playerYaw);
            const sinYaw = Math.sin(playerYaw);
            const fallbackFwdX = -sinYaw;
            const fallbackFwdZ = -cosYaw;
            const isMotorcycle = selectedVehicleType === 'motorcycle';
            _skidRoadHint.segmentIndex = roadContact ? roadContact.segmentIndex : lastPlayerSegmentIndex;

            for (let index = 0; index < tireLayout.length; index++) {
                const tire = tireLayout[index];
                if (!skidTrails[index]) {
                    skidTrails[index] = createEmptyTrailState();
                }
                const trail = skidTrails[index];
                const isWheelLifted = isMotorcycle && (
                    (tire.axle === 'front' && motorcycleFrontWheelLifted) ||
                    (tire.axle === 'rear' && motorcycleRearWheelLifted)
                );
                const skidIntensity = tire.skidIntensity || 0;

                if (isWheelLifted || skidIntensity <= 0.08) {
                    trail.active = false;
                    continue;
                }

                const wx = playerX + tire.x * cosYaw + tire.z * sinYaw;
                const wz = playerZ - tire.x * sinYaw + tire.z * cosYaw;
                const tireRoad = findNearestRoadPoint(wx, playerY, wz, _skidRoadHint.segmentIndex);
                if (!tireRoad || tireRoad.horizontalDistance > 7.8) {
                    trail.active = false;
                    continue;
                }
                _skidRoadHint.segmentIndex = tireRoad.segmentIndex;

                const wy = tireRoad.y + 0.025;
                const halfWidth = (tire.width || (isMotorcycle ? 0.12 : 0.205)) * 0.54;
                stepSkidTrail(
                    trail,
                    wx, wy, wz,
                    halfWidth,
                    skidIntensity,
                    tire.worldVelX || 0,
                    tire.worldVelZ || 0,
                    fallbackFwdX,
                    fallbackFwdZ
                );
            }
        }

        function updateNpcSkidmarks() {
            if (!skidMesh || !hasStarted || !trafficCars.length) return;

            for (let i = 0; i < trafficCars.length; i++) {
                const npc = trafficCars[i];
                const data = npc.userData;
                const skidIntensity = data.skidIntensity || 0;

                if (skidIntensity <= 0.08) {
                    if (data.skidTrails) {
                        for (let w = 0; w < data.skidTrails.length; w++) {
                            data.skidTrails[w].active = false;
                        }
                    }
                    continue;
                }

                if (!data.skidTrails) {
                    data.skidTrails = [
                        createEmptyTrailState(),
                        createEmptyTrailState(),
                        createEmptyTrailState(),
                        createEmptyTrailState()
                    ];
                }

                const npcYaw = npc.rotation.y;
                const cosY = Math.cos(npcYaw);
                const sinY = Math.sin(npcYaw);
                const fallbackFwdX = -sinY;
                const fallbackFwdZ = -cosY;
                const wheelX = (data.halfWidth || 0.9) - 0.11;
                const wheelZ = (data.halfLength || 2.0) * 0.62;
                const velX = data.worldVelX || 0;
                const velZ = data.worldVelZ || 0;

                for (let w = 0; w < 4; w++) {
                    const lx = (w === 0 || w === 2) ? -wheelX : wheelX;
                    const lz = w < 2 ? -wheelZ : wheelZ;
                    const wx = npc.position.x + lx * cosY + lz * sinY;
                    const wz = npc.position.z - lx * sinY + lz * cosY;
                    const wheelProgress = data.progress - lz / trackLength;
                    const wy = sampleRoadHeightByProgress(wheelProgress) + 0.025;

                    stepSkidTrail(
                        data.skidTrails[w],
                        wx, wy, wz,
                        0.11,
                        skidIntensity,
                        velX,
                        velZ,
                        fallbackFwdX,
                        fallbackFwdZ
                    );
                }
            }
        }

        function flushSkidmarksUpload() {
            if (!skidHasPendingUpload || !skidGeometry) return;
            skidGeometry.attributes.position.needsUpdate = true;
            skidGeometry.attributes.uv.needsUpdate = true;
            skidGeometry.attributes.alpha.needsUpdate = true;
            skidHasPendingUpload = false;
        }
