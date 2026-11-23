
        function init() {
            // 1. Scene & Renderer
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x020308); // Malam gelap pekat
            scene.fog = new THREE.Fog(0x020308, 250, 1100);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);
            setupCameraControls(renderer.domElement);

            // 2. Camera
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400);
            previewScene = new THREE.Scene();
            previewScene.background = new THREE.Color(0x11151d);
            previewCamera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
            previewCamera.position.set(0, 2.5, 8);
            previewCamera.lookAt(0, 0.9, 0);
            previewScene.add(new THREE.HemisphereLight(0xffffff, 0x303743, 2));
            const previewKeyLight = new THREE.DirectionalLight(0xffffff, 3);
            previewKeyLight.position.set(-4, 7, 5);
            previewScene.add(previewKeyLight);
            const previewFillLight = new THREE.DirectionalLight(0xffcc88, 1.4);
            previewFillLight.position.set(4, 2, -4);
            previewScene.add(previewFillLight);

            // 3. Lighting (Malam Gelap: hanya tersinari lampu kendaraan, lampu kota PJU, dan cahaya gedung)
            const ambientLight = new THREE.AmbientLight(0x0b1224, 0.045);
            scene.add(ambientLight);

            // 4. Buat Dunia Tol
            const roadTexturesReady = createEnvironment();
            initSkidmarksSystem();
            initDynamicNightLighting();
            initHighSpeedPostProcess();

            // 5. Event Listeners
            window.addEventListener('resize', onWindowResize);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            document.getElementById('setup-form').addEventListener('submit', startGame);
            document.getElementById('loading-screen').addEventListener('click', enterVehicleSelection);
            document.getElementById('loading-start').addEventListener('click', enterVehicleSelection);
            document.getElementById('loading-retry').addEventListener('click', () => window.location.reload());
            document.getElementById('previous-vehicle').addEventListener('click', () => {
                updateVehicleSelection(selectedVehicleType === 'car' ? 'motorcycle' : 'car');
            });
            document.getElementById('next-vehicle').addEventListener('click', () => {
                updateVehicleSelection(selectedVehicleType === 'car' ? 'motorcycle' : 'car');
            });
            document.getElementById('choose-vehicle').addEventListener('click', () => {
                document.getElementById('plate-dialog').showModal();
                document.getElementById('player-name').focus();
            });
            document.getElementById('back-to-selection').addEventListener('click', () => {
                document.getElementById('plate-dialog').close();
            });
            const pauseGameButton = document.getElementById('pause-game');
            if (pauseGameButton) {
                pauseGameButton.addEventListener('click', () => togglePauseGame());
            }
            const pauseResumeButton = document.getElementById('pause-resume');
            if (pauseResumeButton) {
                pauseResumeButton.addEventListener('click', () => togglePauseGame(false));
            }
            const pauseResetButton = document.getElementById('pause-reset');
            if (pauseResetButton) {
                pauseResetButton.addEventListener('click', () => {
                    isPaused = false;
                    const pauseMenu = document.getElementById('pause-menu');
                    if (pauseMenu) pauseMenu.hidden = true;
                    restartGame();
                });
            }
            const pauseBackMenuButton = document.getElementById('pause-back-menu');
            if (pauseBackMenuButton) {
                pauseBackMenuButton.addEventListener('click', () => {
                    isPaused = false;
                    const pauseMenu = document.getElementById('pause-menu');
                    if (pauseMenu) pauseMenu.hidden = true;
                    exitToHome();
                });
            }
            const controlsToggle = document.getElementById('controls-toggle');
            const controlsHint = document.getElementById('controls-hint');
            controlsToggle.addEventListener('click', () => {
                controlsHint.hidden = !controlsHint.hidden;
                controlsToggle.setAttribute('aria-expanded', String(!controlsHint.hidden));
                controlsToggle.setAttribute(
                    'aria-label',
                    controlsHint.hidden ? 'Tampilkan petunjuk kontrol' : 'Sembunyikan petunjuk kontrol'
                );
            });
            document.querySelectorAll('.brand-tab').forEach(button => {
                button.addEventListener('click', () => {
                    const vehicleType = button.dataset.brand === 'yamaha' ? 'motorcycle' : 'car';
                    updateVehicleSelection(vehicleType);
                });
            });

            const hueSlider = document.getElementById('color-hue');
            const lightnessSlider = document.getElementById('color-lightness');
            const applyColorSliders = () => {
                if (!hueSlider || !lightnessSlider) return;
                const hue = Number(hueSlider.value);
                const lightness = Number(lightnessSlider.value);
                setVehicleColor(hslToVehicleHex(hue, lightness));
                lightnessSlider.style.background =
                    `linear-gradient(90deg, #0d0d0d 0%, hsl(${hue}, 90%, 50%) 50%, #f2f2f2 100%)`;
            };
            if (hueSlider && lightnessSlider) {
                hueSlider.addEventListener('input', applyColorSliders);
                lightnessSlider.addEventListener('input', applyColorSliders);
                applyColorSliders();
            }

            const audioToggle = document.getElementById('audio-toggle');
            if (audioToggle) {
                audioToggle.addEventListener('click', toggleAudioMute);
            }
            updateAudioButtonUi();
            const bestScoreEl = document.getElementById('best-score');
            if (bestScoreEl) bestScoreEl.innerText = formatLapTime(bestLapTimeSeconds);

            clock = new THREE.Clock();
            animate();
            loadStartupAssets(roadTexturesReady);
            setupPreviewControls(renderer.domElement);
            setupTouchControls();
        }

        const _tmpLightWorldPos = new THREE.Vector3();
        const _tmpTailWorldPos = new THREE.Vector3();
        const _tmpCamDir = new THREE.Vector3();
        let currentCameraFov = 60;
        let currentTunnelEffect = 0;
        let highSpeedPost = null;

        function initHighSpeedPostProcess() {
            if (!renderer || highSpeedPost) return;
            const width = Math.max(1, window.innerWidth);
            const height = Math.max(1, window.innerHeight);
            const pixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
            const renderTarget = new THREE.WebGLRenderTarget(
                Math.floor(width * pixelRatio),
                Math.floor(height * pixelRatio),
                {
                    minFilter: THREE.LinearFilter,
                    magFilter: THREE.LinearFilter,
                    format: THREE.RGBAFormat
                }
            );
            const postScene = new THREE.Scene();
            const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const postMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tDiffuse: { value: renderTarget.texture },
                    uBlurAmount: { value: 0 },
                    uTunnelAmount: { value: 0 },
                    uAspect: { value: width / height },
                    uCenter: { value: new THREE.Vector2(0.5, 0.52) }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position.xy, 0.0, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D tDiffuse;
                    uniform float uBlurAmount;
                    uniform float uTunnelAmount;
                    uniform float uAspect;
                    uniform vec2 uCenter;
                    varying vec2 vUv;

                    void main() {
                        vec2 dir = vUv - uCenter;
                        vec2 aspectDir = vec2(dir.x * uAspect, dir.y);
                        float dist = length(aspectDir);

                        // Zona tengah tetap tajam agar jalur lalu lintas di depan terlihat jelas
                        float edgeMask = smoothstep(0.14, 0.70, dist);
                        float blurStrength = uBlurAmount * edgeMask;

                        vec3 col = vec3(0.0);
                        if (blurStrength > 0.0005) {
                            vec2 stepUv = dir * (blurStrength * 0.115);
                            float totalWeight = 0.0;
                            for (int i = 0; i < 10; i++) {
                                float t = float(i) / 9.0;
                                float w = 1.0 - t * 0.52;
                                vec2 sampleUv = clamp(vUv - stepUv * t, vec2(0.001), vec2(0.999));
                                col += texture2D(tDiffuse, sampleUv).rgb * w;
                                totalWeight += w;
                            }
                            col /= totalWeight;

                            // Fringe kromatik radial halus di tepi luar saat kecepatan tinggi
                            float chroma = blurStrength * 0.010;
                            vec2 chromaOffset = dir * chroma;
                            float rSample = texture2D(tDiffuse, clamp(vUv - chromaOffset, vec2(0.001), vec2(0.999))).r;
                            float bSample = texture2D(tDiffuse, clamp(vUv + chromaOffset, vec2(0.001), vec2(0.999))).b;
                            col.r = mix(col.r, rSample, 0.58);
                            col.b = mix(col.b, bSample, 0.58);
                        } else {
                            col = texture2D(tDiffuse, vUv).rgb;
                        }

                        // Vignette tunnel vision yang menutup tepi perifer saat ngebut
                        float tunnelMask = smoothstep(0.24, 0.88, dist);
                        float vignette = 1.0 - tunnelMask * uTunnelAmount * 0.68;
                        col *= clamp(vignette, 0.22, 1.0);

                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
                depthTest: false,
                depthWrite: false
            });
            const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
            postQuad.frustumCulled = false;
            postScene.add(postQuad);

            highSpeedPost = {
                renderTarget,
                postScene,
                postCamera,
                postMaterial
            };
        }

        function resizeHighSpeedPostProcess(width, height) {
            if (!highSpeedPost || !renderer) return;
            const w = Math.max(1, width);
            const h = Math.max(1, height);
            const pr = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
            highSpeedPost.renderTarget.setSize(Math.floor(w * pr), Math.floor(h * pr));
            highSpeedPost.postMaterial.uniforms.uAspect.value = w / h;
        }

        function initDynamicNightLighting() {
            if (nightLightingPool.initialized) return;
            nightLightingPool.initialized = true;

            for (let i = 0; i < 2; i++) {
                const spot = new THREE.SpotLight(0xfff4de, 0, 115, 0.42, 0.85, 1.65);
                spot.position.set(0, -100, 0);
                spot.target.position.set(0, -100, -10);
                if (i === 0) {
                    spot.castShadow = true;
                    spot.shadow.mapSize.width = 512;
                    spot.shadow.mapSize.height = 512;
                    spot.shadow.camera.near = 0.9;
                    spot.shadow.camera.far = 115;
                    spot.shadow.bias = -0.0008;
                }
                scene.add(spot);
                scene.add(spot.target);
                nightLightingPool.playerHeadlights.push(spot);
            }

            const playerTail = new THREE.PointLight(0xff2016, 0, 9, 2.0);
            playerTail.position.set(0, -100, 0);
            scene.add(playerTail);
            nightLightingPool.playerTaillight = playerTail;

            for (let i = 0; i < 6; i++) {
                const npcSpot = new THREE.SpotLight(0xfff1d0, 0, 110, 0.44, 0.82, 1.55);
                npcSpot.position.set(0, -100, 0);
                npcSpot.target.position.set(0, -100, -10);
                scene.add(npcSpot);
                scene.add(npcSpot.target);
                nightLightingPool.npcHeadlights.push(npcSpot);
            }

            for (let i = 0; i < 4; i++) {
                const pjuLight = new THREE.PointLight(0xffb85c, 0, 54, 1.65);
                pjuLight.position.set(0, -100, 0);
                scene.add(pjuLight);
                nightLightingPool.streetLights.push(pjuLight);
            }
        }

        function resetDynamicNightLighting() {
            nightLightingPool.playerHeadlights.forEach(light => {
                light.intensity = 0;
                light.position.set(0, -100, 0);
            });
            if (nightLightingPool.playerTaillight) {
                nightLightingPool.playerTaillight.intensity = 0;
                nightLightingPool.playerTaillight.position.set(0, -100, 0);
            }
            nightLightingPool.npcHeadlights.forEach(light => {
                light.intensity = 0;
                light.position.set(0, -100, 0);
            });
            nightLightingPool.streetLights.forEach(light => {
                light.intensity = 0;
                light.position.set(0, -100, 0);
            });
        }

        function updateDynamicNightLighting(isPlayerBraking = false) {
            if (!nightLightingPool.initialized) return;

            const refX = hasStarted ? playerX : camera.position.x;
            const refZ = hasStarted ? playerZ : camera.position.z;

            // 1. Lampu depan & belakang kendaraan pemain
            if (hasStarted && playerCar) {
                const isMoto = selectedVehicleType === 'motorcycle';
                const fwdX = -Math.sin(playerYaw);
                const fwdZ = -Math.cos(playerYaw);
                const rightX = Math.cos(playerYaw);
                const rightZ = -Math.sin(playerYaw);
                const slopeOffset = Math.sin(roadPitchAngle) * 38;
                const targetDist = 38;

                playerCar.updateMatrixWorld(true);
                const headFlares = playerCar.userData.headlightFlares || [];
                const tailFlares = playerCar.userData.taillightFlares || [];

                if (isMoto) {
                    const mainSpot = nightLightingPool.playerHeadlights[0];
                    const fillSpot = nightLightingPool.playerHeadlights[1];
                    if (headFlares[0]) {
                        headFlares[0].getWorldPosition(_tmpLightWorldPos);
                    } else {
                        _tmpLightWorldPos.set(playerX + fwdX * 0.84, playerY + 0.78, playerZ + fwdZ * 0.84);
                    }
                    mainSpot.position.copy(_tmpLightWorldPos);
                    mainSpot.target.position.set(
                        playerX + fwdX * targetDist,
                        playerY - 0.35 + slopeOffset,
                        playerZ + fwdZ * targetDist
                    );
                    mainSpot.angle = 0.40;
                    mainSpot.intensity = 4.2;

                    fillSpot.position.set(_tmpLightWorldPos.x, _tmpLightWorldPos.y + 0.05, _tmpLightWorldPos.z);
                    fillSpot.target.position.set(
                        playerX + fwdX * 24,
                        playerY - 0.45 + Math.sin(roadPitchAngle) * 24,
                        playerZ + fwdZ * 24
                    );
                    fillSpot.angle = 0.58;
                    fillSpot.intensity = 1.7;
                } else {
                    const sideOffsets = [-0.67, 0.67];
                    for (let i = 0; i < 2; i++) {
                        const spot = nightLightingPool.playerHeadlights[i];
                        const sx = sideOffsets[i];
                        if (headFlares[i]) {
                            headFlares[i].getWorldPosition(_tmpLightWorldPos);
                            spot.position.copy(_tmpLightWorldPos);
                        } else {
                            spot.position.set(
                                playerX + fwdX * 1.91 + rightX * sx,
                                playerY + 0.90,
                                playerZ + fwdZ * 1.91 + rightZ * sx
                            );
                        }
                        spot.target.position.set(
                            playerX + fwdX * targetDist + rightX * (sx * 0.85),
                            playerY - 0.35 + slopeOffset,
                            playerZ + fwdZ * targetDist + rightZ * (sx * 0.85)
                        );
                        spot.angle = 0.42;
                        spot.intensity = 3.5;
                    }
                }

                const tailLight = nightLightingPool.playerTaillight;
                if (tailLight) {
                    if (tailFlares.length > 0) {
                        _tmpTailWorldPos.set(0, 0, 0);
                        for (let f = 0; f < tailFlares.length; f++) {
                            tailFlares[f].getWorldPosition(_tmpLightWorldPos);
                            _tmpTailWorldPos.add(_tmpLightWorldPos);
                        }
                        _tmpTailWorldPos.multiplyScalar(1 / tailFlares.length);
                        tailLight.position.set(
                            _tmpTailWorldPos.x - fwdX * 0.18,
                            _tmpTailWorldPos.y,
                            _tmpTailWorldPos.z - fwdZ * 0.18
                        );
                    } else {
                        const rearOffset = isMoto ? -1.05 : -2.65;
                        tailLight.position.set(
                            playerX + fwdX * rearOffset,
                            playerY + (isMoto ? 0.68 : 1.07),
                            playerZ + fwdZ * rearOffset
                        );
                    }
                    tailLight.intensity = isPlayerBraking ? 1.35 : 0.45;
                }
                if (playerCar.userData.taillightGlowMat) {
                    playerCar.userData.taillightGlowMat.opacity = isPlayerBraking ? 0.85 : 0.58;
                }
                if (playerCar.userData.taillightHaloMat) {
                    playerCar.userData.taillightHaloMat.opacity = isPlayerBraking ? 0.45 : 0.20;
                }
                if (playerCar.userData.taillightGlowMeshes) {
                    const tailScale = isPlayerBraking ? 1.18 : 1.0;
                    playerCar.userData.taillightGlowMeshes.forEach(mesh => {
                        mesh.scale.setScalar(tailScale);
                    });
                }
            } else {
                nightLightingPool.playerHeadlights.forEach(spot => {
                    spot.intensity = 0;
                });
                if (nightLightingPool.playerTaillight) {
                    nightLightingPool.playerTaillight.intensity = 0;
                }
            }

            // 2. Pool Lampu Kota / PJU Jalan Tol (4 gerbang PJU di arah pandang kamera + smoothstep fade agar masuk dari 0% tanpa pop)
            _tmpCamDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
            const camLenXZ = Math.hypot(_tmpCamDir.x, _tmpCamDir.z) || 1;
            const camFwdX = _tmpCamDir.x / camLenXZ;
            const camFwdZ = _tmpCamDir.z / camLenXZ;
            if (streetLightStations.length > 0) {
                const lookX = hasStarted ? (refX + camFwdX * 32) : refX;
                const lookZ = hasStarted ? (refZ + camFwdZ * 32) : refZ;
                const topStations = [];
                for (let i = 0; i < streetLightStations.length; i++) {
                    const st = streetLightStations[i];
                    const dx = st.x - lookX;
                    const dz = st.z - lookZ;
                    const distSq = dx * dx + dz * dz;
                    if (distSq > 76 * 76) continue;
                    topStations.push({ st, distSq });
                }
                topStations.sort((a, b) => a.distSq - b.distSq);
                for (let l = 0; l < nightLightingPool.streetLights.length; l++) {
                    const light = nightLightingPool.streetLights[l];
                    if (l < topStations.length) {
                        const { st, distSq } = topStations[l];
                        const dist = Math.sqrt(distSq);
                        const tFade = 1 - THREE.MathUtils.clamp((dist - 34) / 38, 0, 1);
                        const fade = tFade * tFade * (3 - 2 * tFade);
                        light.position.set(st.x, st.y, st.z);
                        light.intensity = 4.5 * fade;
                    } else {
                        light.intensity = 0;
                        light.position.set(0, -100, 0);
                    }
                }
            }

            // 3. Pool Lampu Depan Mobil NPC (6 NPC terdekat di arah pandang kamera — depan maupun belakang — aktif sejak awal)
            if (hasStarted && trafficCars.length > 0) {
                const lookNpcX = refX + camFwdX * 22;
                const lookNpcZ = refZ + camFwdZ * 22;
                const nearestNpcs = [];
                for (let i = 0; i < trafficCars.length; i++) {
                    const npc = trafficCars[i];
                    const dx = npc.position.x - refX;
                    const dz = npc.position.z - refZ;
                    const distSq = dx * dx + dz * dz;
                    if (distSq > 175 * 175) continue;
                    const ldx = npc.position.x - lookNpcX;
                    const ldz = npc.position.z - lookNpcZ;
                    nearestNpcs.push({ npc, distSq, sortDistSq: ldx * ldx + ldz * ldz });
                }
                nearestNpcs.sort((a, b) => a.sortDistSq - b.sortDistSq);
                for (let l = 0; l < nightLightingPool.npcHeadlights.length; l++) {
                    const spot = nightLightingPool.npcHeadlights[l];
                    if (l < nearestNpcs.length) {
                        const { npc, distSq } = nearestNpcs[l];
                        const dist = Math.sqrt(distSq);
                        const tFade = 1 - THREE.MathUtils.clamp((dist - 115) / 60, 0, 1);
                        const fade = tFade * tFade * (3 - 2 * tFade);
                        const npcYaw = npc.rotation.y;
                        const fwdX = -Math.sin(npcYaw);
                        const fwdZ = -Math.cos(npcYaw);
                        const frontOff = (npc.userData.halfLength || 2.1) + 0.12;
                        spot.position.set(
                            npc.position.x + fwdX * frontOff,
                            npc.position.y + 0.80,
                            npc.position.z + fwdZ * frontOff
                        );
                        spot.target.position.set(
                            npc.position.x + fwdX * (frontOff + 36),
                            npc.position.y - 0.35,
                            npc.position.z + fwdZ * (frontOff + 36)
                        );
                        spot.intensity = 4.8 * fade;
                    } else {
                        spot.intensity = 0;
                        spot.position.set(0, -100, 0);
                    }
                }
            } else {
                nightLightingPool.npcHeadlights.forEach(spot => {
                    spot.intensity = 0;
                });
            }
        }

        function formatLapTime(seconds) {
            if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
                return '--:--.--';
            }
            const totalCentis = Math.round(seconds * 100);
            const centis = totalCentis % 100;
            const totalSecs = Math.floor(totalCentis / 100);
            const secs = totalSecs % 60;
            const mins = Math.floor(totalSecs / 60);
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
        }

        function updateRollingStartAutoDrive(dt) {
            const rollingSpeed = 60 / 3.6;
            const leftLaneLateral = -4.8;
            const phys = vehiclePhysicsConfigs[selectedVehicleType];
            playerTrackProgress = (playerTrackProgress + (rollingSpeed * dt) / trackLength) % 1;
            const point = trackCurve.getPointAt(playerTrackProgress);
            const tangent = trackCurve.getTangentAt(playerTrackProgress).normalize();

            playerX = point.x - tangent.z * leftLaneLateral;
            playerY = point.y;
            playerZ = point.z + tangent.x * leftLaneLateral;
            playerYaw = Math.atan2(-tangent.x, -tangent.z);
            yawRate = 0;
            bodyRoll = 0;
            bodyRollVelocity = 0;
            bodyPitch = 0;
            bodyPitchVelocity = 0;
            motorcyclePitch = 0;
            motorcyclePitchVelocity = 0;
            roadPitchAngle = Math.asin(THREE.MathUtils.clamp(tangent.y, -0.45, 0.45));
            roadSlopeSin = Math.sin(roadPitchAngle);
            steeringInputSmoothed = 0;
            throttleSmoothed = 0.28;
            brakeSmoothed = 0;
            reverseSmoothed = 0;
            gearShiftBlendTimer = 0;
            velocityX = tangent.x * rollingSpeed;
            velocityZ = tangent.z * rollingSpeed;
            carSpeed = rollingSpeed;
            playerRoadLateral = leftLaneLateral;
            longitudinalAcceleration = 0;
            lateralAcceleration = 0;
            verticalVelocity = 0;
            isAirborne = false;
            chassisSuspensionOffset = 0;
            maxTireSkid = 0;
            currentGear = phys.isCvt ? 2 : 3;
            engineRpm = selectedVehicleType === 'motorcycle' ? 4200 : 3150;

            tireLayout.forEach((tire, index) => {
                tire.longitudinalVelocity = rollingSpeed;
                tire.steeringAngle = 0;
                tire.skidIntensity = 0;
                wheelAngularSpeeds[index] = rollingSpeed / (tire.wheelRadius || phys.wheelRadius);
            });

            document.getElementById('rpm-value').innerText = String(Math.round(engineRpm));
            document.getElementById('gear-value').innerText = String(currentGear);
            const gearLabelEl = document.getElementById('gear-label');
            if (gearLabelEl) {
                gearLabelEl.innerText = phys.isCvt ? 'RASIO' : (isManualTransmission ? 'GIGI MT' : 'GIGI AT');
            }
            const rpmPercent = THREE.MathUtils.clamp(
                (engineRpm - phys.idleRpm) / Math.max(1, phys.maxRpm - phys.idleRpm) * 100,
                0,
                100
            );
            const rpmBarFill = document.getElementById('rpm-bar-fill');
            if (rpmBarFill) rpmBarFill.style.width = `${rpmPercent.toFixed(1)}%`;
            const gasMeterFill = document.getElementById('gas-meter-fill');
            if (gasMeterFill) gasMeterFill.style.height = '28%';
            const brakeMeterFill = document.getElementById('brake-meter-fill');
            if (brakeMeterFill) brakeMeterFill.style.height = '0%';
            const handbrakeMeterFill = document.getElementById('handbrake-meter-fill');
            if (handbrakeMeterFill) handbrakeMeterFill.style.height = '0%';
            const steerDot = document.getElementById('steer-indicator-dot');
            if (steerDot) steerDot.style.left = '50%';
            const steerIcon = document.getElementById('steering-wheel-icon');
            if (steerIcon) steerIcon.style.transform = 'rotate(0deg)';
        }

        function setStartupProgress(completed, message) {
            const percent = Math.floor(completed / 4 * 100);
            const ring = document.getElementById('loading-ring-progress');
            const progress = document.querySelector('.loading-ring');
            ring.style.strokeDashoffset = String(276.46 * (1 - percent / 100));
            progress.setAttribute('aria-valuenow', String(percent));
            document.getElementById('loading-percent').innerText = `${percent}%`;
            document.getElementById('loading-message').innerText = message;
        }

        async function loadStartupAssets(roadTexturesReady) {
            const logo = document.querySelector('.game-logo');
            let completed = 0;
            const markLoaded = message => {
                completed += 1;
                setStartupProgress(completed, message);
            };
            const logoReady = (logo.decode
                ? logo.decode()
                : new Promise((resolve, reject) => {
                    if (logo.complete && logo.naturalWidth) resolve();
                    else {
                        logo.addEventListener('load', resolve, { once: true });
                        logo.addEventListener('error', () => reject(new Error('Logo gagal dimuat.')), { once: true });
                    }
                })).then(() => markLoaded('Logo siap.'));

            const vehicleModelsReady = Promise.all([
                loadDetailedVehicleModel(
                    'assets/toyota-innova-zenix-2023/model.dae',
                    'Innova Zenix',
                    'car',
                    selectedVehicleColor
                ).then(model => {
                    previewVehicleModels.car = model;
                    previewVehiclePivots.car = new THREE.Group();
                    previewVehiclePivots.car.add(model);
                    markLoaded('Model Innova Zenix siap.');
                }),
                loadDetailedVehicleModel(
                    'assets/yamaha-nmax-neo-155/model.dae',
                    'Yamaha NMAX 155 Neo',
                    'motorcycle',
                    selectedVehicleColor
                ).then(model => {
                    previewVehicleModels.motorcycle = model;
                    previewVehiclePivots.motorcycle = new THREE.Group();
                    previewVehiclePivots.motorcycle.add(model);
                    markLoaded('Model Yamaha NMAX siap.');
                })
            ]);
            const roadAssetsReady = roadTexturesReady.then(() => {
                markLoaded('Tekstur jalan siap.');
            });

            try {
                await Promise.all([logoReady, vehicleModelsReady, roadAssetsReady]);
                startupAssetsReady = true;
                setStartupProgress(4, 'Semua aset siap.');
                document.getElementById('loading-screen').setAttribute('aria-busy', 'false');
                document.getElementById('loading-start').hidden = false;
            } catch (error) {
                console.error('Gagal memuat aset awal:', error);
                document.getElementById('loading-screen').setAttribute('aria-busy', 'false');
                document.getElementById('loading-message').innerText =
                    'Sebagian aset gagal dimuat. Periksa koneksi atau file aset, lalu coba lagi.';
                document.getElementById('loading-retry').hidden = false;
            }
        }

        function enterVehicleSelection() {
            if (!startupAssetsReady || isVehicleSelectionOpen) return;
            isVehicleSelectionOpen = true;
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('vehicle-selection').hidden = false;
            document.body.classList.add('vehicle-selection-open');
            updateVehicleSelection(selectedVehicleType);
            window.__shouldStartDefaultMusic = true;
            if (window.gameMusicPlayer && typeof window.gameMusicPlayer.playDefaultSoundtrack === 'function') {
                window.gameMusicPlayer.playDefaultSoundtrack();
            }
        }

        function updateVehicleSelection(vehicleType) {
            selectedVehicleType = vehicleType;
            const model = previewVehicleModels[vehicleType];
            Object.values(previewVehiclePivots).forEach(pivot => previewScene.remove(pivot));
            if (model) {
                const pivot = previewVehiclePivots[vehicleType];
                pivot.rotation.y = previewRotation;
                previewScene.add(pivot);
            }
            const isCar = vehicleType === 'car';
            const activeBrand = isCar ? 'toyota' : 'yamaha';
            document.querySelectorAll('.brand-tab').forEach(tab => {
                tab.setAttribute('aria-pressed', String(tab.dataset.brand === activeBrand));
            });
            document.getElementById('selected-vehicle-name').innerText =
                isCar ? 'Innova Zenix' : 'Yamaha NMAX 155 Neo';
            document.getElementById('vehicle-page').innerText = isCar ? '01 / 02' : '02 / 02';
            updatePreviewCameraFraming(vehicleType);
        }

        function updatePreviewCameraFraming(vehicleType) {
            const isCar = vehicleType === 'car';
            const distance = isCar ? 8 : 4.2;
            const leftArrow = document.getElementById('previous-vehicle').getBoundingClientRect();
            const rightArrow = document.getElementById('next-vehicle').getBoundingClientRect();
            const targetScreenX = (leftArrow.left + leftArrow.width / 2 +
                rightArrow.left + rightArrow.width / 2) / 2;
            const horizontalViewScale = Math.tan(THREE.MathUtils.degToRad(previewCamera.fov / 2)) *
                previewCamera.aspect;
            const cameraOffset = (targetScreenX / window.innerWidth - 0.5) *
                2 * distance * horizontalViewScale;
            previewCamera.position.set(-cameraOffset, isCar ? 2.5 : 1.4, distance);
            previewCamera.lookAt(-cameraOffset, isCar ? 0.9 : 0.65, 0);
        }

        function hslToVehicleHex(hue, lightnessPercent) {
            let saturation = 90;
            if (lightnessPercent <= 15) {
                saturation = (lightnessPercent / 15) * 90;
            } else if (lightnessPercent >= 85) {
                saturation = ((100 - lightnessPercent) / 15) * 90;
            }
            const adjustedLightness = 5 + lightnessPercent * 0.9;
            const color = new THREE.Color();
            color.setHSL((hue % 360) / 360, saturation / 100, adjustedLightness / 100);
            return `#${color.getHexString()}`;
        }

        function setVehicleColor(color) {
            selectedVehicleColor = color;
            const previewChip = document.getElementById('color-preview-chip');
            if (previewChip) {
                previewChip.style.background = color;
            }
            Object.values(previewVehicleModels).forEach(model => {
                model.traverse(child => {
                    if (!child.isMesh) return;
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => {
                        if (material.userData.isVehiclePaint) material.color.set(color);
                    });
                });
            });
        }

        function setupPreviewControls(canvas) {
            canvas.addEventListener('pointerdown', event => {
                if (!isVehicleSelectionOpen || event.button !== 0) return;
                previewPointerDown = true;
                previewPointerX = event.clientX;
                canvas.setPointerCapture(event.pointerId);
            });
            canvas.addEventListener('pointermove', event => {
                if (!previewPointerDown) return;
                previewRotation += (event.clientX - previewPointerX) * 0.01;
                previewPointerX = event.clientX;
                const pivot = previewVehiclePivots[selectedVehicleType];
                if (pivot) pivot.rotation.y = previewRotation;
            });
            const stopPreviewDrag = event => {
                if (!previewPointerDown) return;
                previewPointerDown = false;
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            };
            canvas.addEventListener('pointerup', stopPreviewDrag);
            canvas.addEventListener('pointercancel', stopPreviewDrag);
        }

        const _satCollisionResult = { hit: false, nx: 0, nz: 0, penetration: 0, contactX: 0, contactZ: 0 };
        let activeScrapeIntensity = 0;

        function computeObbCollision2D(ax, az, aYaw, aHalfL, aHalfW, bx, bz, bYaw, bHalfL, bHalfW) {
            const aFwdX = -Math.sin(aYaw);
            const aFwdZ = -Math.cos(aYaw);
            const aRightX = Math.cos(aYaw);
            const aRightZ = -Math.sin(aYaw);

            const bFwdX = -Math.sin(bYaw);
            const bFwdZ = -Math.cos(bYaw);
            const bRightX = Math.cos(bYaw);
            const bRightZ = -Math.sin(bYaw);

            const dx = ax - bx;
            const dz = az - bz;

            let minOverlap = Infinity;
            let bestNx = 0;
            let bestNz = 0;
            let bestAxis = 0;

            for (let axis = 0; axis < 4; axis++) {
                let ux, uz;
                if (axis === 0) { ux = aFwdX; uz = aFwdZ; }
                else if (axis === 1) { ux = aRightX; uz = aRightZ; }
                else if (axis === 2) { ux = bFwdX; uz = bFwdZ; }
                else { ux = bRightX; uz = bRightZ; }

                const centerDist = Math.abs(dx * ux + dz * uz);
                const projA = aHalfL * Math.abs(aFwdX * ux + aFwdZ * uz) +
                    aHalfW * Math.abs(aRightX * ux + aRightZ * uz);
                const projB = bHalfL * Math.abs(bFwdX * ux + bFwdZ * uz) +
                    bHalfW * Math.abs(bRightX * ux + bRightZ * uz);
                const overlap = projA + projB - centerDist;

                if (overlap <= 0) {
                    _satCollisionResult.hit = false;
                    return _satCollisionResult;
                }

                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    const sign = (dx * ux + dz * uz) >= 0 ? 1 : -1;
                    bestNx = ux * sign;
                    bestNz = uz * sign;
                    bestAxis = axis;
                }
            }

            // Hitung titik kontak sebenarnya lewat edge-clipping 2D (reference face vs incident face)
            const refIsA = bestAxis < 2;
            const refNx = refIsA ? -bestNx : bestNx;
            const refNz = refIsA ? -bestNz : bestNz;
            const refTx = -refNz;
            const refTz = refNx;
            const refCenterX = refIsA ? ax : bx;
            const refCenterZ = refIsA ? az : bz;
            const refHalfDist = bestAxis === 0 ? aHalfL : (bestAxis === 1 ? aHalfW : (bestAxis === 2 ? bHalfL : bHalfW));
            const refHalfPerp = bestAxis === 0 ? aHalfW : (bestAxis === 1 ? aHalfL : (bestAxis === 2 ? bHalfW : bHalfL));
            const refFaceX = refCenterX + refNx * refHalfDist;
            const refFaceZ = refCenterZ + refNz * refHalfDist;

            const incCenterX = refIsA ? bx : ax;
            const incCenterZ = refIsA ? bz : az;
            const incFwdX = refIsA ? bFwdX : aFwdX;
            const incFwdZ = refIsA ? bFwdZ : aFwdZ;
            const incRightX = refIsA ? bRightX : aRightX;
            const incRightZ = refIsA ? bRightZ : aRightZ;
            const incHalfL = refIsA ? bHalfL : aHalfL;
            const incHalfW = refIsA ? bHalfW : aHalfW;

            const dotFwd = incFwdX * refNx + incFwdZ * refNz;
            const dotRight = incRightX * refNx + incRightZ * refNz;
            let incFaceNx, incFaceNz, incPerpX, incPerpZ, incFaceDist, incPerpHalf;
            if (Math.abs(dotFwd) >= Math.abs(dotRight)) {
                const s = dotFwd <= 0 ? 1 : -1;
                incFaceNx = incFwdX * s;
                incFaceNz = incFwdZ * s;
                incPerpX = incRightX;
                incPerpZ = incRightZ;
                incFaceDist = incHalfL;
                incPerpHalf = incHalfW;
            } else {
                const s = dotRight <= 0 ? 1 : -1;
                incFaceNx = incRightX * s;
                incFaceNz = incRightZ * s;
                incPerpX = incFwdX;
                incPerpZ = incFwdZ;
                incFaceDist = incHalfW;
                incPerpHalf = incHalfL;
            }

            const incFaceCx = incCenterX + incFaceNx * incFaceDist;
            const incFaceCz = incCenterZ + incFaceNz * incFaceDist;
            const p1x = incFaceCx - incPerpX * incPerpHalf;
            const p1z = incFaceCz - incPerpZ * incPerpHalf;
            const p2x = incFaceCx + incPerpX * incPerpHalf;
            const p2z = incFaceCz + incPerpZ * incPerpHalf;

            const s1 = (p1x - refFaceX) * refTx + (p1z - refFaceZ) * refTz;
            const s2 = (p2x - refFaceX) * refTx + (p2z - refFaceZ) * refTz;
            const ds = s2 - s1;
            let tMin = 0;
            let tMax = 1;
            if (Math.abs(ds) > 1e-6) {
                const tA = (-refHalfPerp - s1) / ds;
                const tB = (refHalfPerp - s1) / ds;
                const lo = Math.min(tA, tB);
                const hi = Math.max(tA, tB);
                tMin = Math.max(0, lo);
                tMax = Math.min(1, hi);
            }

            let contactX, contactZ;
            if (tMin <= tMax) {
                const c1x = p1x + (p2x - p1x) * tMin;
                const c1z = p1z + (p2z - p1z) * tMin;
                const c2x = p1x + (p2x - p1x) * tMax;
                const c2z = p1z + (p2z - p1z) * tMax;
                const d1 = (c1x - refFaceX) * refNx + (c1z - refFaceZ) * refNz;
                const d2 = (c2x - refFaceX) * refNx + (c2z - refFaceZ) * refNz;
                if (d1 <= 0.05 && d2 <= 0.05) {
                    contactX = (c1x + c2x) * 0.5;
                    contactZ = (c1z + c2z) * 0.5;
                } else if (d1 <= d2) {
                    contactX = c1x;
                    contactZ = c1z;
                } else {
                    contactX = c2x;
                    contactZ = c2z;
                }
            } else {
                const clampedS = THREE.MathUtils.clamp((s1 + s2) * 0.5, -refHalfPerp, refHalfPerp);
                contactX = refFaceX + refTx * clampedS;
                contactZ = refFaceZ + refTz * clampedS;
            }

            _satCollisionResult.hit = true;
            _satCollisionResult.nx = bestNx;
            _satCollisionResult.nz = bestNz;
            _satCollisionResult.penetration = minOverlap;
            _satCollisionResult.contactX = contactX;
            _satCollisionResult.contactZ = contactZ;
            return _satCollisionResult;
        }

        // Loop Animasi Utama Game
        function animate() {
            if (isGameOver) return;

            requestAnimationFrame(animate);
            const dt = Math.min(clock.getDelta(), 0.05);
            if (!hasStarted) {
                if (isVehicleSelectionOpen) {
                    if (!previewPointerDown && previewVehicleModels[selectedVehicleType]) {
                        previewRotation += dt * 0.3;
                        previewVehiclePivots[selectedVehicleType].rotation.y = previewRotation;
                    }
                    renderer.render(previewScene, previewCamera);
                } else {
                    updateDynamicNightLighting(false);
                    renderer.render(scene, camera);
                }
                return;
            }
            if (isPaused) {
                renderer.render(scene, camera);
                return;
            }

            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            const isRollingCountdown = startCountdownTimer > 0;
            let roadContact;
            let onRoad = true;

            if (isRollingCountdown) {
                updateRollingStartAutoDrive(dt);
                startCountdownTimer = Math.max(0, startCountdownTimer - dt);
                const countdownEl = document.getElementById('start-countdown');
                const countdownValEl = document.getElementById('start-countdown-value');
                if (startCountdownTimer > 0) {
                    if (countdownEl && countdownValEl) {
                        countdownEl.classList.remove('is-go');
                        countdownValEl.innerText = String(Math.ceil(startCountdownTimer));
                        countdownEl.hidden = false;
                    }
                } else {
                    startGoFlashTimer = 0.9;
                    prevLapTrackProgress = playerTrackProgress;
                    lapTrackProgressAccumulator = 0;
                    lapRawElapsedSeconds = 0;
                    lapNearMissBonusSeconds = 0;
                    lapTimeSeconds = 0;
                    if (countdownEl && countdownValEl) {
                        countdownEl.classList.add('is-go');
                        countdownValEl.innerText = 'GO!';
                        countdownEl.hidden = false;
                    }
                }
                roadContact = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
                if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;
            } else {
                if (startGoFlashTimer > 0) {
                    startGoFlashTimer = Math.max(0, startGoFlashTimer - dt);
                    if (startGoFlashTimer <= 0) {
                        const countdownEl = document.getElementById('start-countdown');
                        if (countdownEl) countdownEl.hidden = true;
                    }
                }

                updateVehiclePhysics(dt);

                roadContact = enforcePlayerConcreteWallCollision(dt, true);
                const overRoad = Boolean(roadContact) && roadContact.horizontalDistance <= 7.81 && Math.abs(playerY - roadContact.y) <= 6.0;
                const groundY = overRoad ? roadContact.y : 0;
                const wasAirborne = isAirborne;
                const prevVerticalVelocity = verticalVelocity;
                const verticalSubsteps = 8;
                const subDt = dt / verticalSubsteps;
                const totalSuspensionStiffness = physics.frontSpringRate + physics.rearSpringRate;
                const criticalDamping = 2 * Math.sqrt(totalSuspensionStiffness * physics.mass);
                let wheelsInContact = false;

                for (let step = 0; step < verticalSubsteps; step++) {
                    const compression = groundY - playerY;
                    if (compression >= -physics.suspensionMaxDroop) {
                        wheelsInContact = true;
                        const dampingRatio = verticalVelocity < 0
                            ? physics.dampingCompression
                            : physics.dampingRelaxation;
                        const damping = dampingRatio * criticalDamping;
                        const springForce = physics.mass * gravity +
                            totalSuspensionStiffness * compression -
                            damping * verticalVelocity;
                        const normalAccel = Math.max(0, springForce / physics.mass);
                        verticalVelocity += (normalAccel - gravity) * subDt;
                        playerY += verticalVelocity * subDt;
                        const minRideY = groundY - physics.suspensionMaxCompression;
                        if (playerY < minRideY) {
                            playerY = minRideY;
                            if (verticalVelocity < 0) verticalVelocity = 0;
                        }
                    } else {
                        wheelsInContact = false;
                        verticalVelocity -= gravity * subDt;
                        playerY += verticalVelocity * subDt;
                        if (playerY < 0) {
                            playerY = 0;
                            if (verticalVelocity < 0) verticalVelocity = 0;
                            wheelsInContact = true;
                        }
                    }
                }

                isAirborne = !wheelsInContact;
                chassisSuspensionOffset = THREE.MathUtils.clamp(
                    playerY - groundY,
                    -physics.suspensionMaxCompression,
                    physics.suspensionMaxDroop
                );

                if (wasAirborne && !isAirborne && prevVerticalVelocity < -1.0) {
                    const landingImpact = Math.min(1, Math.abs(prevVerticalVelocity) / 6.5);
                    cameraShakeIntensity = Math.max(cameraShakeIntensity, landingImpact * 0.24);
                    bodyPitchVelocity += landingImpact * 0.8;
                    motorcyclePitchVelocity += landingImpact * 0.65;
                }

                onRoad = overRoad && !isAirborne;
                if (onRoad) {
                    const headingAlign =
                        (-Math.sin(playerYaw)) * roadContact.tangentX +
                        (-Math.cos(playerYaw)) * roadContact.tangentZ;
                    roadSlopeSin = THREE.MathUtils.clamp(
                        headingAlign * roadContact.slopeSin,
                        -0.45,
                        0.45
                    );
                    roadPitchAngle = Math.asin(roadSlopeSin);
                } else {
                    roadSlopeSin = 0;
                    roadPitchAngle = THREE.MathUtils.damp(roadPitchAngle, 0, isAirborne ? 2.2 : 4, dt);
                    if (!overRoad && !isAirborne) {
                        const speedMagnitude = Math.hypot(velocityX, velocityZ);
                        if (speedMagnitude > 0) {
                            const speedAfterOffRoadDrag = Math.max(0, speedMagnitude - 5 * dt);
                            const speedScale = speedAfterOffRoadDrag / speedMagnitude;
                            velocityX *= speedScale;
                            velocityZ *= speedScale;
                        }
                    }
                }

                const bodyForwardX = -Math.sin(playerYaw);
                const bodyForwardZ = -Math.cos(playerYaw);
                carSpeed = velocityX * bodyForwardX + velocityZ * bodyForwardZ;
                playerTrackProgress = roadContact ? roadContact.progress : playerTrackProgress;
                if (roadContact) {
                    const roadRightX = -roadContact.tangentZ;
                    const roadRightZ = roadContact.tangentX;
                    playerRoadLateral = (playerX - roadContact.x) * roadRightX + (playerZ - roadContact.z) * roadRightZ;
                }
            }

            playerCar.position.set(
                playerX,
                playerY + vehiclePhysicsConfigs[selectedVehicleType].cgHeight,
                playerZ
            );
            playerCar.rotation.x = roadPitchAngle;
            playerCar.rotation.y = playerYaw;
            playerCar.rotation.z = 0;
            updatePlayerWheelVisuals(dt, onRoad);
            updatePlayerSkidmarks(onRoad, roadContact);

            totalDistance += Math.hypot(velocityX, velocityZ) * dt;
            if (startCountdownTimer <= 0 && !isGameOver) {
                lapRawElapsedSeconds += dt;
                let deltaProg = playerTrackProgress - prevLapTrackProgress;
                if (deltaProg < -0.5) deltaProg += 1;
                if (deltaProg > 0.5) deltaProg -= 1;
                lapTrackProgressAccumulator += deltaProg;
                prevLapTrackProgress = playerTrackProgress;

                lapTimeSeconds = Math.max(0, lapRawElapsedSeconds - lapNearMissBonusSeconds);

                if (lapTrackProgressAccumulator >= 1.0) {
                    lapTrackProgressAccumulator -= 1.0;
                    const finishedLapTime = Math.max(0.01, lapTimeSeconds);
                    lastLapTimeSeconds = finishedLapTime;
                    const isBestLap = bestLapTimeSeconds === null || finishedLapTime < bestLapTimeSeconds;
                    if (isBestLap) {
                        bestLapTimeSeconds = finishedLapTime;
                        hasNewLapRecordThisRun = true;
                        try {
                            localStorage.setItem(
                                'speed_of_nusantara_best_lap_ms',
                                String(Math.round(bestLapTimeSeconds * 1000))
                            );
                        } catch {
                            // Abaikan jika penyimpanan lokal dinonaktifkan.
                        }
                    }
                    const lapToastEl = document.getElementById('lap-complete-toast');
                    if (lapToastEl) {
                        lapToastEl.innerText = isBestLap
                            ? `LAP ${currentLap} SELESAI · ${formatLapTime(finishedLapTime)} (REKOR!)`
                            : `LAP ${currentLap} SELESAI · ${formatLapTime(finishedLapTime)}`;
                        lapToastEl.hidden = false;
                        lapBannerTimer = 3.2;
                    }
                    currentLap += 1;
                    lapRawElapsedSeconds = 0;
                    lapNearMissBonusSeconds = 0;
                    lapTimeSeconds = 0;
                }
            }

            const lapCountEl = document.getElementById('lap-count');
            if (lapCountEl) lapCountEl.innerText = String(currentLap);
            document.getElementById('score').innerText = formatLapTime(lapTimeSeconds);
            document.getElementById('best-score').innerText = formatLapTime(bestLapTimeSeconds);

            const activePhysics = vehiclePhysicsConfigs[selectedVehicleType];
            const measuredSpeed = Math.hypot(velocityX, velocityZ) * 3.6;
            document.getElementById('speed-value').innerText = Math.floor(carSpeed < 0 ? -measuredSpeed : measuredSpeed);
            const speedBarFill = document.getElementById('speed-bar-fill');
            if (speedBarFill) {
                const maxKmh = activePhysics.maxSpeed * 3.6;
                const speedPercent = THREE.MathUtils.clamp((measuredSpeed / Math.max(1, maxKmh)) * 100, 0, 100);
                speedBarFill.style.width = `${speedPercent.toFixed(1)}%`;
            }

            const brakingNow = !isRollingCountdown && brakeSmoothed > 0.08 && carSpeed > 0.5;
            updateGameAudio(
                engineRpm,
                activePhysics.idleRpm,
                activePhysics.maxRpm,
                carSpeed,
                isRollingCountdown ? true : throttleSmoothed > 0.05,
                brakingNow,
                selectedVehicleType,
                true,
                maxTireSkid,
                activeScrapeIntensity,
                getActivePoliceSirenIntensity()
            );

            if (crashDamageCooldown > 0) {
                crashDamageCooldown = Math.max(0, crashDamageCooldown - dt);
            }
            if (crashDamageToastTimer > 0) {
                crashDamageToastTimer -= dt;
                if (crashDamageToastTimer <= 0) {
                    const crashToast = document.getElementById('crash-damage-toast');
                    if (crashToast) crashToast.hidden = true;
                }
            }
            if (nearMissBannerTimer > 0) {
                nearMissBannerTimer -= dt;
                if (nearMissBannerTimer <= 0) {
                    const toast = document.getElementById('near-miss-toast');
                    if (toast) toast.hidden = true;
                }
            }
            if (lapBannerTimer > 0) {
                lapBannerTimer -= dt;
                if (lapBannerTimer <= 0) {
                    const lapToast = document.getElementById('lap-complete-toast');
                    if (lapToast) lapToast.hidden = true;
                }
            }

            // Update Posisi Kamera + FOV Dinamis Agresif + Efek Tunnel Vision Kecepatan Tinggi
            const speedMps = Math.hypot(velocityX, velocityZ);
            const speedKmh = speedMps * 3.6;
            const isMoto = selectedVehicleType === 'motorcycle';
            const lowNorm = THREE.MathUtils.clamp((speedKmh - 42) / (isMoto ? 34 : 58), 0, 1);
            const highNorm = THREE.MathUtils.clamp((speedKmh - (isMoto ? 74 : 100)) / (isMoto ? 46 : 100), 0, 1);
            const accelSurge = THREE.MathUtils.clamp((longitudinalAcceleration - 1.2) * 0.45, 0, 4.5);
            const targetFov = THREE.MathUtils.clamp(
                60 + Math.pow(lowNorm, 0.85) * 16.0 + Math.pow(highNorm, 1.08) * (isMoto ? 26.0 : 32.0) + accelSurge,
                60,
                112
            );
            const fovDampRate = targetFov > currentCameraFov ? 7.2 : 5.8;
            currentCameraFov = THREE.MathUtils.damp(currentCameraFov, targetFov, fovDampRate, dt);
            if (Math.abs(camera.fov - currentCameraFov) > 0.02) {
                camera.fov = currentCameraFov;
                camera.updateProjectionMatrix();
            }

            const blurStartKmh = isMoto ? 72 : 98;
            const blurSpanKmh = isMoto ? 48 : 102;
            const blurSpeedNorm = THREE.MathUtils.clamp((speedKmh - blurStartKmh) / blurSpanKmh, 0, 1);
            const accelTunnelBoost = THREE.MathUtils.clamp((longitudinalAcceleration - 2.0) * 0.025, 0, 0.10) * blurSpeedNorm;
            const targetTunnelEffect = THREE.MathUtils.clamp(
                Math.pow(blurSpeedNorm, 1.15) * (isMoto ? 0.90 : 1.0) + accelTunnelBoost,
                0,
                1
            );
            currentTunnelEffect = THREE.MathUtils.damp(
                currentTunnelEffect,
                targetTunnelEffect,
                targetTunnelEffect > currentTunnelEffect ? 6.8 : 5.2,
                dt
            );

            const orbit = cameraOrbits[cameraMode];
            if (!isCameraDragging) {
                orbit.yawVelocity += (-36 * orbit.yaw - 12 * orbit.yawVelocity) * dt;
                orbit.pitchVelocity += (-36 * orbit.pitch - 12 * orbit.pitchVelocity) * dt;
                orbit.yaw += orbit.yawVelocity * dt;
                orbit.pitch += orbit.pitchVelocity * dt;
            }

            const camPreset = getCameraPreset(cameraMode, selectedVehicleType);
            const focusX = playerX;
            const focusY = playerY + camPreset.focusHeight;
            const focusZ = playerZ;
            const neutralPitch = camPreset.neutralPitch;
            const cameraPitch = Math.max(-0.15, Math.min(1.35, neutralPitch + orbit.pitch));
            const chaseTunnelZoom = cameraMode === 1 ? (1 - currentTunnelEffect * 0.09) : 1;
            const effectiveOrbitDist = orbit.distance * chaseTunnelZoom;
            const horizontalDistance = effectiveOrbitDist * Math.cos(cameraPitch);
            const isLookingBack = Boolean(keys.lookBack);
            if (cameraMode === 2 && isLookingBack) {
                const roofHeight = selectedVehicleType === 'motorcycle' ? 1.55 : 2.05;
                camera.position.set(playerX, playerY + roofHeight, playerZ);
            } else {
                const orbitYaw = playerYaw + (cameraMode === 1 ? (isLookingBack ? Math.PI : 0) : Math.PI) + orbit.yaw;
                camera.position.set(
                    focusX + Math.sin(orbitYaw) * horizontalDistance,
                    focusY + Math.sin(cameraPitch) * effectiveOrbitDist,
                    focusZ + Math.cos(orbitYaw) * horizontalDistance
                );
            }
            const cameraRoadPoint = findNearestRoadPoint(
                camera.position.x,
                camera.position.y,
                camera.position.z,
                lastPlayerSegmentIndex
            );
            if (cameraRoadPoint && cameraRoadPoint.horizontalDistance <= 8) {
                camera.position.y = Math.max(camera.position.y, cameraRoadPoint.y + 0.35);
            }
            if (cameraShakeIntensity > 0.001) {
                camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
                camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
                cameraShakeIntensity *= Math.max(0, 1 - dt * 10);
            }
            if (cameraMode === 1) {
                camera.lookAt(focusX, focusY, focusZ);
            } else {
                const viewPitch = (isLookingBack ? -0.05 : Math.atan2(0.15, 20.65)) + orbit.pitch;
                const viewDistance = Math.hypot(20.65, 0.15);
                const viewHorizontalDistance = viewDistance * Math.cos(viewPitch);
                const viewYaw = playerYaw + (isLookingBack ? 0 : Math.PI) + orbit.yaw;
                camera.lookAt(
                    camera.position.x + Math.sin(viewYaw) * viewHorizontalDistance,
                    camera.position.y + Math.sin(viewPitch) * viewDistance,
                    camera.position.z + Math.cos(viewYaw) * viewHorizontalDistance
                );
            }

            // Gerakkan & Cek Tabrakan dengan Mobil Lain (NPC) tanpa clipping (SAT 2D + grinding + dorongan)
            updateTrafficFlow(dt);
            const playerDimensions = selectedVehicleType === 'motorcycle' ? nmaxNeoSpecs : innovaZenixSpecs;
            const playerHalfLength = playerDimensions.length / 2 + 0.05;
            const playerHalfWidth = playerDimensions.width / 2 + 0.03;
            const playerCgOffsetZ = (activePhysics.weightDistributionFront - 0.5) * playerDimensions.wheelbase;
            const playerMass = activePhysics.mass;
            const forwardX = -Math.sin(playerYaw);
            const forwardZ = -Math.cos(playerYaw);
            const playerRightX = Math.cos(playerYaw);
            const playerRightZ = -Math.sin(playerYaw);
            let frameScrapeIntensity = 0;

            for (let i = trafficCars.length - 1; i >= 0; i--) {
                const npc = trafficCars[i];
                const npcData = npc.userData;
                const playerBoxCenterX = playerX - forwardX * playerCgOffsetZ;
                const playerBoxCenterZ = playerZ - forwardZ * playerCgOffsetZ;
                const rawDx = npc.position.x - playerBoxCenterX;
                const rawDz = npc.position.z - playerBoxCenterZ;

                if (Math.abs(rawDx) > 8.5 || Math.abs(rawDz) > 8.5) {
                    if (npcData.nearMissed) {
                        const wrappedDelta = Math.abs(npcData.progress - playerTrackProgress);
                        const distFromPlayer = Math.min(wrappedDelta, 1 - wrappedDelta) * trackLength;
                        if (distFromPlayer > 35) npcData.nearMissed = false;
                    }
                    continue;
                }

                const sameRoadLevel = Math.abs(playerY - npc.position.y) < 2.2;
                if (!sameRoadLevel) continue;

                const npcHalfLength = (npcData.halfLength || 2.0) + 0.08;
                const npcHalfWidth = (npcData.halfWidth || 0.9) + 0.04;
                const sat = computeObbCollision2D(
                    playerBoxCenterX,
                    playerBoxCenterZ,
                    playerYaw,
                    playerHalfLength,
                    playerHalfWidth,
                    npc.position.x,
                    npc.position.z,
                    npc.rotation.y,
                    npcHalfLength,
                    npcHalfWidth
                );

                if (sat.hit) {
                    const nx = sat.nx; // Dari NPC ke Pemain
                    const nz = sat.nz;
                    const penetration = sat.penetration;
                    const wasFreeBodyBefore = Boolean(npcData.freeBodyActive);
                    const hasPolicePhysBefore = Boolean(
                        !wasFreeBodyBefore &&
                        npcData.isPolice &&
                        npcData.policeState === 'chase' &&
                        npcData.policePhysics &&
                        npcData.policePhysics.initialized
                    );
                    const npcYaw = wasFreeBodyBefore
                        ? npcData.fbYaw
                        : hasPolicePhysBefore
                            ? npcData.policePhysics.yaw
                            : (npc.rotation.y - (npcData.yawOffset || 0));
                    const roadFwdX = -Math.sin(npcYaw);
                    const roadFwdZ = -Math.cos(npcYaw);
                    const roadRightX = Math.cos(npcYaw);
                    const roadRightZ = -Math.sin(npcYaw);

                    const npcVelX = wasFreeBodyBefore
                        ? npcData.fbVx
                        : hasPolicePhysBefore
                            ? npcData.policePhysics.vx
                            : (roadFwdX * (npcData.speed || 0) + roadRightX * (npcData.lateralVelocity || 0));
                    const npcVelZ = wasFreeBodyBefore
                        ? npcData.fbVz
                        : hasPolicePhysBefore
                            ? npcData.policePhysics.vz
                            : (roadFwdZ * (npcData.speed || 0) + roadRightZ * (npcData.lateralVelocity || 0));
                    const relVx = velocityX - npcVelX;
                    const relVz = velocityZ - npcVelZ;
                    const vNormal = relVx * nx + relVz * nz;
                    const closingSpeedPre = vNormal < 0 ? -vNormal : 0;

                    // Benturan keras memberi kerusakan acak pada kendaraan (bukan Game Over)
                    if (closingSpeedPre > 11.5) {
                        if (applyRandomCrashDamage(closingSpeedPre)) {
                            npcData.hitCooldown = Math.max(npcData.hitCooldown || 0, 0.45);
                        }
                    }

                    if (npcData.isPolice) {
                        if (npcData.policeState !== 'chase') {
                            npcData.policeState = 'chase';
                            if (!npcData.freeBodyActive) syncPolicePhysicsFromNpc(npc);
                        }
                        npcData.chaseCalmTimer = 0;
                    }

                    // Lepaskan NPC dari aspal ke mode fisika 3D bebas saat terkena gaya luar yang cukup kuat
                    const npcMass = (npcData.isPolice && npcData.policeState === 'chase')
                        ? vehiclePhysicsConfigs.car.mass
                        : (npcData.mass || 1450);
                    const invPlayerMass = 1 / playerMass;
                    const invNpcMass = 1 / npcMass;
                    const totalInvMass = invPlayerMass + invNpcMass;
                    const playerShare = invPlayerMass / totalInvMass;
                    const npcShare = invNpcMass / totalInvMass;

                    const isActiveChaser = Boolean(npcData.isPolice && npcData.policeState === 'chase');
                    const fbClosingThreshold = isActiveChaser ? 5.2 : 3.2;
                    const fbDeltaThreshold = isActiveChaser ? 3.4 : 1.35;
                    const estimatedNpcDeltaV = closingSpeedPre * (invNpcMass / totalInvMass);
                    if (!npcData.freeBodyActive && (
                        (closingSpeedPre > fbClosingThreshold && estimatedNpcDeltaV > fbDeltaThreshold) ||
                        estimatedNpcDeltaV > 2.2
                    )) {
                        if (typeof enterNpcFreeBodyMode === 'function') {
                            enterNpcFreeBodyMode(npc);
                        }
                    }

                    const isFreeBody = Boolean(npcData.freeBodyActive);
                    if (npcData.isPolice && policeThreatLevel >= 1 && policeThreatLevel < 3 &&
                        policeRamPenaltyCooldown <= 0 && closingSpeedPre > 4.2) {
                        policeEscalationElapsed += (isFreeBody || closingSpeedPre > 11.5) ? 150 : 75;
                        policeRamPenaltyCooldown = 2.0;
                    }
                    const hasPolicePhys = Boolean(
                        !isFreeBody &&
                        npcData.isPolice &&
                        npcData.policeState === 'chase' &&
                        npcData.policePhysics &&
                        npcData.policePhysics.initialized
                    );

                    // 1. Pisahkan posisi secara presisi sesuai rasio massa agar bodi TIDAK clipping
                    const separation = penetration + 0.008;
                    const npcMoveX = -nx * separation * npcShare;
                    const npcMoveZ = -nz * separation * npcShare;

                    if (isFreeBody) {
                        npcData.fbX += npcMoveX;
                        npcData.fbZ += npcMoveZ;
                        npcData.fbRestTimer = 0;
                        npcData.recoveringUpright = false;
                        if (typeof syncNpcMeshFromFreeBody === 'function') {
                            syncNpcMeshFromFreeBody(npc, npcData);
                        }
                        playerX += nx * separation * playerShare;
                        playerZ += nz * separation * playerShare;
                    } else if (hasPolicePhys) {
                        const pp = npcData.policePhysics;
                        pp.x += npcMoveX;
                        pp.z += npcMoveZ;
                        const preWallX = pp.x;
                        const preWallZ = pp.z;
                        enforcePoliceConcreteWallCollision(npc, false, dt);
                        const wallReactionX = pp.x - preWallX;
                        const wallReactionZ = pp.z - preWallZ;
                        npc.position.set(pp.x, pp.y, pp.z);
                        playerX += nx * separation * playerShare + wallReactionX;
                        playerZ += nz * separation * playerShare + wallReactionZ;
                    } else {
                        const npcShiftFwd = npcMoveX * roadFwdX + npcMoveZ * roadFwdZ;
                        const npcShiftLat = npcMoveX * roadRightX + npcMoveZ * roadRightZ;

                        npcData.progress = (npcData.progress + npcShiftFwd / trackLength + 1) % 1;
                        const desiredLatPos = (npcData.lateralPos !== undefined ? npcData.lateralPos : npcData.lane) + npcShiftLat;
                        const npcYawAbs = Math.abs(npcData.yawOffset || 0);
                        const npcWallLimit = Math.max(
                            4.5,
                            7.81 - (npcHalfLength * Math.sin(npcYawAbs) + npcHalfWidth * Math.cos(npcYawAbs))
                        );
                        const clampedLatPos = THREE.MathUtils.clamp(desiredLatPos, -npcWallLimit, npcWallLimit);
                        const leftoverLat = desiredLatPos - clampedLatPos;
                        npcData.lateralPos = clampedLatPos;

                        placeOnTrack(npc, npcData.progress, clampedLatPos);
                        npc.rotation.y += npcData.yawOffset;
                        npc.rotation.z = npcData.rollOffset;

                        playerX += nx * separation * playerShare + roadRightX * (-leftoverLat);
                        playerZ += nz * separation * playerShare + roadRightZ * (-leftoverLat);
                    }

                    // 2. Solver Impuls Rigid-Body Sejati (massa riil, titik kontak SAT, & momen inersia)
                    const npcYawVelCurr = isFreeBody
                        ? (npcData.fbYawVel || 0)
                        : hasPolicePhys
                            ? (npcData.policePhysics.yawRate || 0)
                            : (npcData.yawVelocity || 0);
                    const rAx = sat.contactX - playerBoxCenterX;
                    const rAz = sat.contactZ - playerBoxCenterZ;
                    const rBx = sat.contactX - npc.position.x;
                    const rBz = sat.contactZ - npc.position.z;

                    const vContactAX = velocityX + yawRate * rAz;
                    const vContactAZ = velocityZ - yawRate * rAx;
                    const vContactBX = npcVelX + npcYawVelCurr * rBz;
                    const vContactBZ = npcVelZ - npcYawVelCurr * rBx;
                    const vRelContactX = vContactAX - vContactBX;
                    const vRelContactZ = vContactAZ - vContactBZ;
                    const vContactNormal = vRelContactX * nx + vRelContactZ * nz;

                    if (vContactNormal < 0 || vNormal < 0) {
                        const closingSpeed = Math.max(0, vContactNormal < 0 ? -vContactNormal : -vNormal);
                        const playerFullL = playerHalfLength * 2;
                        const playerFullW = playerHalfWidth * 2;
                        const playerYawInertia = Math.max(120, playerMass * (playerFullL * playerFullL + playerFullW * playerFullW) / 12);

                        const npcFullL = (npcData.halfLength || 2.0) * 2;
                        const npcFullW = (npcData.halfWidth || 0.9) * 2;
                        const npcFullH = (npcData.halfHeight || 0.7) * 2;
                        const npcCgH = npcData.cgHeight || (npcData.localComY || 0.65);
                        const npcInertiaYaw = npcData.inertiaYaw || Math.max(450, npcMass * (npcFullL * npcFullL + npcFullW * npcFullW) / 12);
                        const npcInertiaPitch = npcData.inertiaPitch || Math.max(450, npcMass * (npcFullL * npcFullL + npcFullH * npcFullH) / 12);
                        const npcInertiaRoll = npcData.inertiaRoll || Math.max(250, npcMass * (npcFullW * npcFullW + npcFullH * npcFullH) / 12);

                        const rACrossN = rAz * nx - rAx * nz;
                        const rBCrossN = rBz * nx - rBx * nz;
                        const denomN = invPlayerMass + invNpcMass +
                            (rACrossN * rACrossN) / playerYawInertia +
                            (rBCrossN * rBCrossN) / npcInertiaYaw;
                        const restitution = closingSpeed < 3.0 ? 0.08 : 0.16;
                        const jn = (1 + restitution) * closingSpeed / denomN;

                        const tx = -nz;
                        const tz = nx;
                        const vTangent = vRelContactX * tx + vRelContactZ * tz;
                        const rACrossT = rAz * tx - rAx * tz;
                        const rBCrossT = rBz * tx - rBx * tz;
                        const denomT = invPlayerMass + invNpcMass +
                            (rACrossT * rACrossT) / playerYawInertia +
                            (rBCrossT * rBCrossT) / npcInertiaYaw;
                        const muContact = 0.26;
                        const jt = THREE.MathUtils.clamp(-vTangent / denomT, -muContact * jn, muContact * jn);

                        const jxPlayer = jn * nx + jt * tx;
                        const jzPlayer = jn * nz + jt * tz;
                        const jxNpc = -jxPlayer;
                        const jzNpc = -jzPlayer;

                        velocityX += jxPlayer * invPlayerMass;
                        velocityZ += jzPlayer * invPlayerMass;
                        const playerTorqueImpulse = (rAz * jxPlayer - rAx * jzPlayer) / playerYawInertia;
                        yawRate = THREE.MathUtils.clamp(yawRate + playerTorqueImpulse * 0.45, -2.6, 2.6);

                        const npcPushX = jxNpc * invNpcMass;
                        const npcPushZ = jzNpc * invNpcMass;
                        const pushFwd = npcPushX * roadFwdX + npcPushZ * roadFwdZ;
                        const pushLat = npcPushX * roadRightX + npcPushZ * roadRightZ;
                        const jFwd = jxNpc * roadFwdX + jzNpc * roadFwdZ;
                        const jLat = jxNpc * roadRightX + jzNpc * roadRightZ;
                        const npcDeltaYaw = (rBz * jxNpc - rBx * jzNpc) / npcInertiaYaw;

                        if (isFreeBody) {
                            npcData.fbVx += npcPushX;
                            npcData.fbVz += npcPushZ;
                            npcData.fbRestTimer = 0;
                            npcData.recoveringUpright = false;
                            npcData.fbYawVel = THREE.MathUtils.clamp((npcData.fbYawVel || 0) + npcDeltaYaw, -8.5, 8.5);

                            // Reaksi suspensi pitch & roll murni dari tinggi pusat massa dan impuls horizontal
                            const pitchLever = Math.min(0.24, Math.max(0.08, npcCgH * 0.25));
                            const rollLever = Math.max(0.18, npcCgH - 0.34);
                            npcData.fbPitchVel = THREE.MathUtils.clamp(
                                (npcData.fbPitchVel || 0) + (jFwd * pitchLever) / npcInertiaPitch,
                                -3.8,
                                3.8
                            );
                            npcData.fbRollVel = THREE.MathUtils.clamp(
                                (npcData.fbRollVel || 0) + (jLat * rollLever) / npcInertiaRoll,
                                -6.5,
                                6.5
                            );

                            // Jangan angkat kendaraan pada tabrakan datar; terangkat hanya jika terguling (rollover) atau benturan ekstrim
                            const latDeltaV = Math.abs(pushLat);
                            const rolloverDeltaV = 9.81 * ((npcData.halfWidth || 0.9) / Math.max(0.35, npcCgH)) * 1.15;
                            const isExtremeWreck = closingSpeed > 26 && (playerMass / npcMass) >= 0.85;
                            if ((npcData.fbLaunchCooldown || 0) <= 0 && (latDeltaV > rolloverDeltaV || isExtremeWreck)) {
                                const rolloverLift = latDeltaV > rolloverDeltaV
                                    ? Math.min(4.6, (latDeltaV - rolloverDeltaV) * 0.42)
                                    : 0;
                                const wreckLift = isExtremeWreck
                                    ? Math.min(5.2, (closingSpeed - 26) * 0.22 * Math.min(1.3, playerMass / npcMass))
                                    : 0;
                                const verticalPop = Math.max(rolloverLift, wreckLift);
                                if (verticalPop > 0.6) {
                                    npcData.fbVy = Math.max(npcData.fbVy || 0, verticalPop);
                                    npcData.fbGrounded = false;
                                    npcData.fbLaunchCooldown = 0.28;
                                }
                            }
                        } else if (hasPolicePhys) {
                            const pp = npcData.policePhysics;
                            pp.vx += npcPushX;
                            pp.vz += npcPushZ;
                            const ppFwdX = -Math.sin(pp.yaw);
                            const ppFwdZ = -Math.cos(pp.yaw);
                            const ppFwdSpeed = pp.vx * ppFwdX + pp.vz * ppFwdZ;
                            if (ppFwdSpeed > POLICE_MAX_CHASE_SPEED_MPS) {
                                const ex = ppFwdSpeed - POLICE_MAX_CHASE_SPEED_MPS;
                                pp.vx -= ppFwdX * ex;
                                pp.vz -= ppFwdZ * ex;
                            }
                            npcData.speed = pp.vx * ppFwdX + pp.vz * ppFwdZ;
                            const yawScale = closingSpeed < 3.5 ? 0.45 : 0.85;
                            pp.yawRate = THREE.MathUtils.clamp(pp.yawRate + npcDeltaYaw * yawScale, -2.2, 2.2);
                        } else {
                            const isChasingUnit = npcData.isPolice && npcData.policeState === 'chase';
                            const npcMaxSpd = isChasingUnit ? POLICE_MAX_CHASE_SPEED_MPS : 42;
                            const npcMinSpd = 0;
                            npcData.speed = THREE.MathUtils.clamp(npcData.speed + pushFwd, npcMinSpd, npcMaxSpd);
                            npcData.lateralVelocity = THREE.MathUtils.clamp(npcData.lateralVelocity + pushLat, -18, 18);
                            npcData.yawVelocity = THREE.MathUtils.clamp((npcData.yawVelocity || 0) + npcDeltaYaw, -3.5, 3.5);
                        }
                        npcData.pushedTimer = Math.max(npcData.pushedTimer || 0, 1.1);
                        npcData.controlLossTimer = Math.max(
                            npcData.controlLossTimer || 0,
                            Math.min(1.5, 0.25 + Math.abs(npcDeltaYaw) * 0.35 + closingSpeed * 0.05)
                        );
                        if (closingSpeed > 1.5 && (!npcData.isPolice || isFreeBody || closingSpeed > 9.5)) {
                            npcData.skidIntensity = Math.max(
                                npcData.skidIntensity || 0,
                                THREE.MathUtils.clamp(closingSpeed / 8, 0.25, 1)
                            );
                        }

                        const latPushFactor = Math.min(1, closingSpeed / 12);
                        if (closingSpeed > 1.8) {
                            const sideSign = Math.sign(pushLat) || Math.sign(nx * roadRightX + nz * roadRightZ) || 1;
                            if (!isFreeBody) {
                                if (hasPolicePhys) {
                                    npcData.policePhysics.bodyRollVelocity += sideSign * latPushFactor * 1.15;
                                } else {
                                    npcData.rollVelocity += sideSign * latPushFactor * 1.15;
                                }
                            }
                            bodyRollVelocity += -sideSign * latPushFactor * 0.7;
                        }

                        if (closingSpeed > 4.2 && (!npcData.hitCooldown || npcData.hitCooldown <= 0)) {
                            playCrashSound();
                            cameraShakeIntensity = Math.max(
                                cameraShakeIntensity,
                                Math.min(0.28, 0.06 + closingSpeed * 0.016)
                            );
                            npcData.hitCooldown = 0.32;
                        }
                    }

                    // 3. Gesekan Grinding (seretan samping & transfer dorongan saat bersinggungan)
                    const tangentX = -nz;
                    const tangentZ = nx;
                    const relTangent = (velocityX - npcVelX) * tangentX + (velocityZ - npcVelZ) * tangentZ;
                    const absRelTangent = Math.abs(relTangent);
                    if (absRelTangent > 0.35) {
                        const grindFriction = Math.min(absRelTangent * 0.5, 4.8 * dt);
                        const grindSign = Math.sign(relTangent);
                        velocityX -= tangentX * grindSign * grindFriction;
                        velocityZ -= tangentZ * grindSign * grindFriction;

                        const npcGrindPush = grindFriction * (playerMass / npcMass) * 0.55;
                        const npcGrindWorldX = tangentX * grindSign * npcGrindPush;
                        const npcGrindWorldZ = tangentZ * grindSign * npcGrindPush;
                        if (isFreeBody) {
                            npcData.fbVx += npcGrindWorldX;
                            npcData.fbVz += npcGrindWorldZ;
                            npcData.fbRestTimer = 0;
                            npcData.recoveringUpright = false;
                        } else if (hasPolicePhys) {
                            const pp = npcData.policePhysics;
                            pp.vx += npcGrindWorldX;
                            pp.vz += npcGrindWorldZ;
                        } else {
                            const npcGrindFwd = npcGrindWorldX * roadFwdX + npcGrindWorldZ * roadFwdZ;
                            const npcGrindLat = npcGrindWorldX * roadRightX + npcGrindWorldZ * roadRightZ;
                            const isChasingUnit = npcData.isPolice && npcData.policeState === 'chase';
                            const npcMaxSpd = isChasingUnit ? POLICE_MAX_CHASE_SPEED_MPS : 42;
                            const npcMinSpd = 0;
                            npcData.speed = THREE.MathUtils.clamp(npcData.speed + npcGrindFwd, npcMinSpd, npcMaxSpd);
                            npcData.lateralVelocity = THREE.MathUtils.clamp(npcData.lateralVelocity + npcGrindLat, -18, 18);
                        }
                        npcData.pushedTimer = Math.max(npcData.pushedTimer || 0, 0.7);
                        npcData.controlLossTimer = Math.max(npcData.controlLossTimer || 0, 0.35);
                        if (!npcData.isPolice || isFreeBody || absRelTangent > 10.5) {
                            npcData.skidIntensity = Math.max(
                                npcData.skidIntensity || 0,
                                THREE.MathUtils.clamp(absRelTangent / 12, 0.2, 0.85)
                            );
                        }

                        // Sedikit tarikan setir ke arah gesekan bodi saat grinding
                        const sideDot = nx * playerRightX + nz * playerRightZ;
                        yawRate += -Math.sign(sideDot || 1) * Math.min(0.35, absRelTangent * 0.025) * dt * 12;

                        const scrapeLevel = THREE.MathUtils.clamp(absRelTangent / 14, 0.18, 1);
                        frameScrapeIntensity = Math.max(frameScrapeIntensity, scrapeLevel);
                        cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.022 + scrapeLevel * 0.045);
                    }

                    npcData.nearMissed = true;
                    continue;
                }

                const relativeX = npc.position.x - playerX;
                const relativeZ = npc.position.z - playerZ;
                const longitudinalOffset = Math.abs(relativeX * forwardX + relativeZ * forwardZ);
                const lateralOffset = Math.abs(relativeX * playerRightX + relativeZ * playerRightZ);

                if (
                    startCountdownTimer <= 0 &&
                    !npcData.nearMissed &&
                    Math.abs(carSpeed) > 12 &&
                    longitudinalOffset < playerHalfLength + npcHalfLength + 0.6 &&
                    lateralOffset < playerHalfWidth + npcHalfWidth + 1.1
                ) {
                    npcData.nearMissed = true;
                    lapNearMissBonusSeconds += 0.5;
                    lapTimeSeconds = Math.max(0, lapRawElapsedSeconds - lapNearMissBonusSeconds);
                    playNearMissSound();
                    const toast = document.getElementById('near-miss-toast');
                    if (toast) {
                        toast.hidden = false;
                        nearMissBannerTimer = 1.1;
                    }
                }
            }
            activeScrapeIntensity = frameScrapeIntensity;
            updateNpcSkidmarks();
            flushSkidmarksUpload();

            // Jaga agar seluruh sudut bodi mobil tidak menembus tembok pembatas beton setelah tumbukan NPC
            enforcePlayerConcreteWallCollision(dt, false);
            playerCar.position.x = playerX;
            playerCar.position.z = playerZ;
            updateDynamicNightLighting(brakingNow);

            if (highSpeedPost && currentTunnelEffect > 0.003) {
                highSpeedPost.postMaterial.uniforms.uBlurAmount.value = currentTunnelEffect * 0.96;
                highSpeedPost.postMaterial.uniforms.uTunnelAmount.value = currentTunnelEffect * 0.88;
                highSpeedPost.postMaterial.uniforms.uCenter.value.set(0.5, cameraMode === 2 ? 0.50 : 0.53);
                renderer.setRenderTarget(highSpeedPost.renderTarget);
                renderer.render(scene, camera);
                renderer.setRenderTarget(null);
                renderer.render(highSpeedPost.postScene, highSpeedPost.postCamera);
            } else {
                renderer.setRenderTarget(null);
                renderer.render(scene, camera);
            }
        }

        function enforcePlayerConcreteWallCollision(dt, applyDynamics) {
            const dims = selectedVehicleType === 'motorcycle' ? nmaxNeoSpecs : innovaZenixSpecs;
            const phys = vehiclePhysicsConfigs[selectedVehicleType];
            const forwardX = -Math.sin(playerYaw);
            const forwardZ = -Math.cos(playerYaw);
            const rightX = Math.cos(playerYaw);
            const rightZ = -Math.sin(playerYaw);
            const cgOffsetZ = (phys.weightDistributionFront - 0.5) * dims.wheelbase;
            const halfLen = dims.length / 2 + 0.04;
            const halfWid = dims.width / 2 + 0.03;

            const boxCenterX = playerX - forwardX * cgOffsetZ;
            const boxCenterZ = playerZ - forwardZ * cgOffsetZ;
            let roadContact = findNearestRoadPoint(boxCenterX, playerY, boxCenterZ, lastPlayerSegmentIndex);
            if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;

            if (roadContact && roadContact.verticalDistance <= 3.5) {
                const dx = boxCenterX - roadContact.x;
                const dz = boxCenterZ - roadContact.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.0001) {
                    const normalX = dx / dist;
                    const normalZ = dz / dist;
                    const latExtent = halfLen * Math.abs(forwardX * normalX + forwardZ * normalZ) +
                        halfWid * Math.abs(rightX * normalX + rightZ * normalZ);
                    const maxCenterDist = 7.81 - latExtent;
                    if (dist > maxCenterDist) {
                        const excess = dist - maxCenterDist;
                        playerX -= normalX * excess;
                        playerZ -= normalZ * excess;

                        const outwardSpeed = velocityX * normalX + velocityZ * normalZ;
                        const crossSign = forwardX * normalZ - forwardZ * normalX;
                        if (applyDynamics) {
                            if (outwardSpeed > 0) {
                                velocityX -= outwardSpeed * normalX * 1.25;
                                velocityZ -= outwardSpeed * normalZ * 1.25;
                                const scrapeFactor = Math.max(0.90, 1 - 1.8 * dt);
                                velocityX *= scrapeFactor;
                                velocityZ *= scrapeFactor;
                                if (outwardSpeed > 2.2) {
                                    const impactFactor = Math.min(1, outwardSpeed / 14);
                                    yawRate += Math.sign(crossSign || 1) * impactFactor * 0.9;
                                    bodyRollVelocity += Math.sign(crossSign || 1) * impactFactor * 1.4;
                                    cameraShakeIntensity = Math.max(
                                        cameraShakeIntensity,
                                        Math.min(0.32, outwardSpeed * 0.028)
                                    );
                                }
                                if (outwardSpeed > 9.5) {
                                    applyRandomCrashDamage(outwardSpeed);
                                }
                            }
                            const intoWallDot = forwardX * normalX + forwardZ * normalZ;
                            if (intoWallDot > 0.02) {
                                // Belokkan moncong menjauhi dinding beton secara halus agar tidak menempel
                                playerYaw += Math.sign(crossSign || 1) * intoWallDot * Math.min(1, dt * 6.5);
                                yawRate *= 0.68;
                            }
                        } else if (outwardSpeed > 0) {
                            velocityX -= outwardSpeed * normalX * 1.05;
                            velocityZ -= outwardSpeed * normalZ * 1.05;
                        }

                        roadContact = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
                        if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;
                    }
                }
            }
            return roadContact;
        }

        function syncDamageHud() {
            const hud = document.getElementById('damage-hud');
            const detailsEl = document.getElementById('damage-hud-details');
            if (!hud || !detailsEl) return;

            const parts = [];
            if (damageAccelHits > 0) {
                const accelLoss = Math.round((1 - Math.max(0.25, Math.pow(0.98, damageAccelHits))) * 100);
                parts.push(`AKSEL -${accelLoss}%`);
            }
            if (damageTopSpeedHits > 0) {
                const topLoss = Math.round((1 - Math.max(0.25, Math.pow(0.98, damageTopSpeedHits))) * 100);
                parts.push(`TOP -${topLoss}%`);
            }
            if (damageHandlingHits > 0) {
                const handlingDiff = Math.round((1 - Math.max(0.45, Math.pow(0.99, damageHandlingHits))) * 100);
                parts.push(`KONTROL +${handlingDiff}%`);
            }

            if (parts.length === 0) {
                hud.hidden = true;
                detailsEl.innerText = '';
            } else {
                detailsEl.innerText = parts.join(' · ');
                hud.hidden = false;
            }
        }

        function showCrashDamageToast(badge, text) {
            const toast = document.getElementById('crash-damage-toast');
            const badgeEl = document.getElementById('crash-damage-badge');
            const textEl = document.getElementById('crash-damage-text');
            if (!toast || !badgeEl || !textEl) return;

            badgeEl.innerText = badge;
            textEl.innerText = text;
            toast.hidden = false;
            toast.style.animation = 'none';
            void toast.offsetWidth;
            toast.style.animation = '';
            crashDamageToastTimer = 2.4;
        }

        function applyRandomCrashDamage(impactSpeed = 12) {
            if (isGameOver || !hasStarted || crashDamageCooldown > 0) return false;

            const damageType = Math.floor(Math.random() * 3);
            let badge = 'KERUSAKAN';
            let text = '';

            if (damageType === 0) {
                damageAccelHits += 1;
                badge = 'MESIN RUSAK';
                text = 'Akselerasi turun 2%';
            } else if (damageType === 1) {
                damageTopSpeedHits += 1;
                badge = 'TRANSMISI RUSAK';
                text = 'Top speed turun 2%';
            } else {
                damageHandlingHits += 1;
                damagePullSign = Math.random() < 0.5 ? -1 : 1;
                badge = 'KEMUDI RUSAK';
                text = 'Kendali 1% lebih sulit';
            }

            crashDamageCooldown = 1.1;
            playCrashSound();
            cameraShakeIntensity = Math.max(
                cameraShakeIntensity,
                Math.min(0.55, 0.24 + impactSpeed * 0.015)
            );
            syncDamageHud();
            showCrashDamageToast(badge, text);
            return true;
        }

        function togglePauseGame(forceState) {
            if (!hasStarted || isGameOver) return;
            const nextPaused = typeof forceState === 'boolean' ? forceState : !isPaused;
            if (nextPaused === isPaused) return;
            isPaused = nextPaused;

            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.hidden = !isPaused;
            const pauseButton = document.getElementById('pause-game');
            if (pauseButton) pauseButton.setAttribute('aria-pressed', String(isPaused));

            if (isPaused) {
                isCameraDragging = false;
                resetInputs();
                updateGameAudio(0, 1000, 6000, 0, false, false, selectedVehicleType, false);
                window.gameMusicPlayer?.pauseForGamePause?.();
            } else {
                clock.getDelta();
                window.gameMusicPlayer?.resumeFromGamePause?.();
            }
        }

        function triggerGameOver(reason = 'crash') {
            if (isGameOver) return;
            isGameOver = true;
            isPaused = false;
            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.hidden = true;
            const pauseButton = document.getElementById('pause-game');
            if (pauseButton) pauseButton.setAttribute('aria-pressed', 'false');
            const isBusted = reason === 'busted';
            activeScrapeIntensity = 0;
            cameraShakeIntensity = isBusted ? 0.15 : 0.45;
            updateGameAudio(0, 1000, 6000, 0, false, false, selectedVehicleType, false);
            window.gameMusicPlayer?.clearGamePauseFlag?.();
            if (!isBusted) {
                playCrashSound();
            }
            resetInputs();

            const bustedBanner = document.getElementById('busted-banner');
            if (bustedBanner) bustedBanner.hidden = true;
            const countdownEl = document.getElementById('start-countdown');
            if (countdownEl) countdownEl.hidden = true;
            const lapToast = document.getElementById('lap-complete-toast');
            if (lapToast) lapToast.hidden = true;
            const crashToast = document.getElementById('crash-damage-toast');
            if (crashToast) crashToast.hidden = true;
            const damageHud = document.getElementById('damage-hud');
            if (damageHud) damageHud.hidden = true;
            if (typeof hidePoliceAlertToast === 'function') hidePoliceAlertToast();
            policeToastTimer = 0;
            crashDamageCooldown = 0;
            crashDamageToastTimer = 0;

            const completedLaps = Math.max(0, currentLap - 1);
            const displayTime = lastLapTimeSeconds !== null ? lastLapTimeSeconds : lapTimeSeconds;

            const gameOverEl = document.getElementById('game-over');
            const titleEl = document.getElementById('game-over-title');
            const messageEl = document.getElementById('game-over-message');
            if (gameOverEl) gameOverEl.classList.toggle('is-busted', isBusted);
            if (titleEl) titleEl.innerText = isBusted ? 'BUSTED!' : 'KECELAKAAN!';
            if (messageEl) {
                messageEl.innerText = isBusted
                    ? 'Kamu dikepung dan ditahan oleh Polisi Patroli Tol.'
                    : 'Kamu menabrak kendaraan lain di Tol Dalam Kota.';
            }

            const finalLapsEl = document.getElementById('final-laps');
            if (finalLapsEl) finalLapsEl.innerText = String(completedLaps);
            document.getElementById('final-score').innerText = formatLapTime(displayTime);
            const finalBestEl = document.getElementById('final-best-score');
            if (finalBestEl) finalBestEl.innerText = formatLapTime(bestLapTimeSeconds);
            const bestScoreEl = document.getElementById('best-score');
            if (bestScoreEl) bestScoreEl.innerText = formatLapTime(bestLapTimeSeconds);
            const newRecordBadge = document.getElementById('new-record-badge');
            if (newRecordBadge) newRecordBadge.hidden = !hasNewLapRecordThisRun;
            if (gameOverEl) gameOverEl.style.display = 'block';
        }

        function restartGame() {
            const wasGameOver = isGameOver;
            isGameOver = false;
            isPaused = false;
            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.hidden = true;
            const pauseButton = document.getElementById('pause-game');
            if (pauseButton) pauseButton.setAttribute('aria-pressed', 'false');
            window.gameMusicPlayer?.resumeFromGamePause?.();
            const phys = vehiclePhysicsConfigs[selectedVehicleType];
            currentGear = phys.isCvt ? 2 : 3;
            policeBustedTimer = 5;
            policeThreatLevel = 0;
            policeToastTimer = 0;
            policeEscalationElapsed = 0;
            policeRamPenaltyCooldown = 0;
            damageAccelHits = 0;
            damageTopSpeedHits = 0;
            damageHandlingHits = 0;
            damagePullSign = 1;
            crashDamageCooldown = 0;
            crashDamageToastTimer = 0;
            currentLap = 1;
            lapRawElapsedSeconds = 0;
            lapNearMissBonusSeconds = 0;
            lapTimeSeconds = 0;
            lastLapTimeSeconds = null;
            hasNewLapRecordThisRun = false;
            lapTrackProgressAccumulator = 0;
            lapBannerTimer = 0;
            startCountdownTimer = 3.0;
            startGoFlashTimer = 0;
            if (typeof hidePoliceAlertToast === 'function') hidePoliceAlertToast();
            syncDamageHud();
            engineRpm = selectedVehicleType === 'motorcycle' ? 4200 : 3150;
            totalDistance = 0;
            bonusScore = 0;
            score = 0;
            lastPlayerSegmentIndex = -1;
            cameraShakeIntensity = 0;
            currentCameraFov = 60;
            currentTunnelEffect = 0;
            if (camera.fov !== 60) {
                camera.fov = 60;
                camera.updateProjectionMatrix();
            }
            nearMissBannerTimer = 0;
            activeScrapeIntensity = 0;
            resetInputs();
            resetPlayerPosition();
            prevLapTrackProgress = playerTrackProgress;
            clearSkidmarks();

            // Siapkan ulang seluruh 240 mobil NPC langsung sejak awal
            populateInitialTraffic();

            const toast = document.getElementById('near-miss-toast');
            if (toast) toast.hidden = true;
            const lapToast = document.getElementById('lap-complete-toast');
            if (lapToast) lapToast.hidden = true;
            const crashToast = document.getElementById('crash-damage-toast');
            if (crashToast) crashToast.hidden = true;
            const bustedBanner = document.getElementById('busted-banner');
            if (bustedBanner) bustedBanner.hidden = true;
            const newRecordBadge = document.getElementById('new-record-badge');
            if (newRecordBadge) newRecordBadge.hidden = true;

            const countdownEl = document.getElementById('start-countdown');
            const countdownValEl = document.getElementById('start-countdown-value');
            if (countdownEl && countdownValEl) {
                countdownEl.classList.remove('is-go');
                countdownValEl.innerText = '3';
                countdownEl.hidden = false;
            }

            const gameOverEl = document.getElementById('game-over');
            if (gameOverEl) {
                gameOverEl.style.display = 'none';
                gameOverEl.classList.remove('is-busted');
            }
            const lapCountEl = document.getElementById('lap-count');
            if (lapCountEl) lapCountEl.innerText = '1';
            document.getElementById('score').innerText = '00:00.00';
            document.getElementById('best-score').innerText = formatLapTime(bestLapTimeSeconds);
            document.getElementById('speed-value').innerText = '60';
            document.getElementById('rpm-value').innerText = String(Math.round(engineRpm));
            document.getElementById('gear-value').innerText = String(currentGear);
            syncTransmissionUi();
            const speedBarFill = document.getElementById('speed-bar-fill');
            if (speedBarFill) speedBarFill.style.width = `${THREE.MathUtils.clamp((60 / (phys.maxSpeed * 3.6)) * 100, 0, 100).toFixed(1)}%`;
            const rpmBarFill = document.getElementById('rpm-bar-fill');
            if (rpmBarFill) rpmBarFill.style.width = '0%';
            const gasMeterFill = document.getElementById('gas-meter-fill');
            if (gasMeterFill) gasMeterFill.style.height = '0%';
            const brakeMeterFill = document.getElementById('brake-meter-fill');
            if (brakeMeterFill) brakeMeterFill.style.height = '0%';
            const handbrakeMeterFill = document.getElementById('handbrake-meter-fill');
            if (handbrakeMeterFill) handbrakeMeterFill.style.height = '0%';
            const steerDot = document.getElementById('steer-indicator-dot');
            if (steerDot) steerDot.style.left = '50%';
            const steerIcon = document.getElementById('steering-wheel-icon');
            if (steerIcon) steerIcon.style.transform = 'rotate(0deg)';
            clock.getDelta();
            if (wasGameOver) {
                animate();
            }
        }

        async function exitToHome() {
            if (!hasStarted && !isGameOver) return;
            const wasGameOver = isGameOver;
            hasStarted = false;
            isGameOver = false;
            isPaused = false;
            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.hidden = true;
            const pauseButton = document.getElementById('pause-game');
            if (pauseButton) pauseButton.setAttribute('aria-pressed', 'false');
            window.gameMusicPlayer?.resumeFromGamePause?.();
            isCameraDragging = false;
            carSpeed = 0;
            yawRate = 0;
            bodyRoll = 0;
            bodyRollVelocity = 0;
            bodyPitch = 0;
            bodyPitchVelocity = 0;
            motorcyclePitch = 0;
            motorcyclePitchVelocity = 0;
            velocityX = 0;
            velocityZ = 0;
            verticalVelocity = 0;
            isAirborne = false;
            chassisSuspensionOffset = 0;
            longitudinalAcceleration = 0;
            lateralAcceleration = 0;
            nearMissBannerTimer = 0;
            cameraShakeIntensity = 0;
            maxTireSkid = 0;
            activeScrapeIntensity = 0;
            playerRoadLateral = 0;
            policeBustedTimer = 5;
            policeThreatLevel = 0;
            policeToastTimer = 0;
            policeEscalationElapsed = 0;
            policeRamPenaltyCooldown = 0;
            damageAccelHits = 0;
            damageTopSpeedHits = 0;
            damageHandlingHits = 0;
            damagePullSign = 1;
            crashDamageCooldown = 0;
            crashDamageToastTimer = 0;
            currentLap = 1;
            lapRawElapsedSeconds = 0;
            lapNearMissBonusSeconds = 0;
            lapTimeSeconds = 0;
            lastLapTimeSeconds = null;
            hasNewLapRecordThisRun = false;
            lapTrackProgressAccumulator = 0;
            lapBannerTimer = 0;
            startCountdownTimer = 0;
            startGoFlashTimer = 0;
            isManualTransmission = false;
            if (typeof hidePoliceAlertToast === 'function') hidePoliceAlertToast();
            syncDamageHud();
            resetInputs();
            clearSkidmarks();

            updateGameAudio(0, 1000, 6000, 0, false, false, selectedVehicleType, false);

            if (playerCar) {
                scene.remove(playerCar);
                playerCar = null;
            }
            playerWheelPivots = [];
            clearTrafficCars();
            resetDynamicNightLighting();
            currentCameraFov = 60;
            currentTunnelEffect = 0;
            if (camera.fov !== 60) {
                camera.fov = 60;
                camera.updateProjectionMatrix();
            }

            const toast = document.getElementById('near-miss-toast');
            if (toast) toast.hidden = true;
            const lapToast = document.getElementById('lap-complete-toast');
            if (lapToast) lapToast.hidden = true;
            const crashToast = document.getElementById('crash-damage-toast');
            if (crashToast) crashToast.hidden = true;
            const countdownEl = document.getElementById('start-countdown');
            if (countdownEl) countdownEl.hidden = true;
            const bustedBanner = document.getElementById('busted-banner');
            if (bustedBanner) bustedBanner.hidden = true;
            const newRecordBadge = document.getElementById('new-record-badge');
            if (newRecordBadge) newRecordBadge.hidden = true;
            const controlsHint = document.getElementById('controls-hint');
            if (controlsHint) controlsHint.hidden = true;
            const controlsToggle = document.getElementById('controls-toggle');
            if (controlsToggle) {
                controlsToggle.setAttribute('aria-expanded', 'false');
                controlsToggle.setAttribute('aria-label', 'Tampilkan petunjuk kontrol');
            }
            const gameOverEl = document.getElementById('game-over');
            if (gameOverEl) {
                gameOverEl.style.display = 'none';
                gameOverEl.classList.remove('is-busted');
            }
            syncTransmissionUi();
            document.body.classList.remove('game-active');
            document.body.classList.add('vehicle-selection-open');
            document.getElementById('vehicle-selection').hidden = false;
            isVehicleSelectionOpen = true;

            updateVehicleSelection(selectedVehicleType);

            if (wasGameOver) {
                clock.getDelta();
                animate();
            }

            const missingTypes = ['car', 'motorcycle'].filter(type => !previewVehicleModels[type]);
            await Promise.all(missingTypes.map(async type => {
                const isCar = type === 'car';
                try {
                    const model = await loadDetailedVehicleModel(
                        isCar ? 'assets/toyota-innova-zenix-2023/model.dae' : 'assets/yamaha-nmax-neo-155/model.dae',
                        isCar ? 'Innova Zenix' : 'Yamaha NMAX 155 Neo',
                        type,
                        selectedVehicleColor
                    );
                    if (previewVehicleModels[type]) return;
                    previewVehicleModels[type] = model;
                    previewVehiclePivots[type] = new THREE.Group();
                    previewVehiclePivots[type].add(model);
                    setVehicleColor(selectedVehicleColor);
                    if (!hasStarted && isVehicleSelectionOpen && selectedVehicleType === type) {
                        updateVehicleSelection(type);
                    }
                } catch (error) {
                    console.warn('Gagal memuat ulang preview kendaraan:', error);
                }
            }));
        }

        // Mulai Game
        init();
