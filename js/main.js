
        function init() {
            // 1. Scene & Renderer
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0a1a); // Nuansa malam senja kota
            scene.fog = new THREE.FogExp2(0x0a0a1a, 0.0022);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);
            setupCameraControls(renderer.domElement);

            // 2. Camera
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2500);
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

            // 3. Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(20, 40, 20);
            dirLight.castShadow = true;
            scene.add(dirLight);

            // 4. Buat Dunia Tol
            const roadTexturesReady = createEnvironment();
            initSkidmarksSystem();

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
            const exitGameButton = document.getElementById('exit-game');
            if (exitGameButton) {
                exitGameButton.addEventListener('click', exitToHome);
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
            if (bestScoreEl) bestScoreEl.innerText = String(bestScore);

            clock = new THREE.Clock();
            animate();
            loadStartupAssets(roadTexturesReady);
            setupPreviewControls(renderer.domElement);
            setupTouchControls();
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

        const _satCollisionResult = { hit: false, nx: 0, nz: 0, penetration: 0 };
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
                }
            }

            _satCollisionResult.hit = true;
            _satCollisionResult.nx = bestNx;
            _satCollisionResult.nz = bestNz;
            _satCollisionResult.penetration = minOverlap;
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
                    renderer.render(scene, camera);
                }
                return;
            }

            updateVehiclePhysics(dt);

            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            let roadContact = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
            if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;
            if (roadContact && roadContact.horizontalDistance > 7.1 && roadContact.verticalDistance <= 3.5) {
                const distance = roadContact.horizontalDistance || 1;
                const normalX = (playerX - roadContact.x) / distance;
                const normalZ = (playerZ - roadContact.z) / distance;
                playerX = roadContact.x + normalX * 7.1;
                playerZ = roadContact.z + normalZ * 7.1;
                const outwardSpeed = velocityX * normalX + velocityZ * normalZ;
                const wallForwardX = -Math.sin(playerYaw);
                const wallForwardZ = -Math.cos(playerYaw);
                const crossSign = wallForwardX * normalZ - wallForwardZ * normalX;
                if (outwardSpeed > 0) {
                    velocityX -= outwardSpeed * normalX * 1.28;
                    velocityZ -= outwardSpeed * normalZ * 1.28;
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
                }
                const intoWallDot = wallForwardX * normalX + wallForwardZ * normalZ;
                if (intoWallDot > 0.02) {
                    // Belokkan moncong menjauhi pembatas jalan secara halus agar tidak menempel
                    playerYaw += Math.sign(crossSign || 1) * intoWallDot * Math.min(1, dt * 6.5);
                    yawRate *= 0.68;
                }
                roadContact = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
                if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;
            }

            const overRoad = Boolean(roadContact) && roadContact.horizontalDistance <= 7.2 && Math.abs(playerY - roadContact.y) <= 6.0;
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

            const onRoad = overRoad && !isAirborne;
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
            playerCar.position.set(
                playerX,
                playerY + vehiclePhysicsConfigs[selectedVehicleType].cgHeight,
                playerZ
            );
            playerCar.rotation.x = roadPitchAngle;
            playerCar.rotation.y = playerYaw;
            playerCar.rotation.z = 0;
            if (roadContact) {
                const roadRightX = -roadContact.tangentZ;
                const roadRightZ = roadContact.tangentX;
                playerRoadLateral = (playerX - roadContact.x) * roadRightX + (playerZ - roadContact.z) * roadRightZ;
            }
            updatePlayerWheelVisuals(dt, onRoad);
            updatePlayerSkidmarks(onRoad, roadContact);
            totalDistance += Math.hypot(velocityX, velocityZ) * dt;
            score = Math.floor(totalDistance) + bonusScore;
            document.getElementById('score').innerText = score;
            if (score > bestScore) {
                document.getElementById('best-score').innerText = String(score);
            }
            const activePhysics = vehiclePhysicsConfigs[selectedVehicleType];
            const measuredSpeed = Math.hypot(velocityX, velocityZ) * 3.6;
            document.getElementById('speed-value').innerText = Math.floor(carSpeed < 0 ? -measuredSpeed : measuredSpeed);
            const speedBarFill = document.getElementById('speed-bar-fill');
            if (speedBarFill) {
                const maxKmh = activePhysics.maxSpeed * 3.6;
                const speedPercent = THREE.MathUtils.clamp((measuredSpeed / Math.max(1, maxKmh)) * 100, 0, 100);
                speedBarFill.style.width = `${speedPercent.toFixed(1)}%`;
            }

            const brakingNow = keys.backward && !keys.forward && carSpeed > 0.5;
            updateGameAudio(
                engineRpm,
                activePhysics.idleRpm,
                activePhysics.maxRpm,
                carSpeed,
                keys.forward,
                brakingNow,
                selectedVehicleType,
                true,
                maxTireSkid,
                activeScrapeIntensity,
                getActivePoliceSirenIntensity()
            );

            if (nearMissBannerTimer > 0) {
                nearMissBannerTimer -= dt;
                if (nearMissBannerTimer <= 0) {
                    const toast = document.getElementById('near-miss-toast');
                    if (toast) toast.hidden = true;
                }
            }

            // Update Posisi Kamera
            const orbit = cameraOrbits[cameraMode];
            if (!isCameraDragging) {
                orbit.yawVelocity += (-36 * orbit.yaw - 12 * orbit.yawVelocity) * dt;
                orbit.pitchVelocity += (-36 * orbit.pitch - 12 * orbit.pitchVelocity) * dt;
                orbit.yaw += orbit.yawVelocity * dt;
                orbit.pitch += orbit.pitchVelocity * dt;
            }

            const cgHeight = vehiclePhysicsConfigs[selectedVehicleType].cgHeight;
            const focusX = playerX;
            const focusY = playerY + cgHeight;
            const focusZ = playerZ;
            const neutralPitch = cameraMode === 1
                ? Math.atan2(3.5 - cgHeight, 9)
                : Math.atan2(1.25 - cgHeight, 1.35);
            const cameraPitch = Math.max(-0.15, Math.min(1.35, neutralPitch + orbit.pitch));
            const horizontalDistance = orbit.distance * Math.cos(cameraPitch);
            const orbitYaw = playerYaw + (cameraMode === 1 ? 0 : Math.PI) + orbit.yaw;
            camera.position.set(
                focusX + Math.sin(orbitYaw) * horizontalDistance,
                focusY + Math.sin(cameraPitch) * orbit.distance,
                focusZ + Math.cos(orbitYaw) * horizontalDistance
            );
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
                const viewPitch = Math.atan2(0.15, 20.65) + orbit.pitch;
                const viewDistance = Math.hypot(20.65, 0.15);
                const viewHorizontalDistance = viewDistance * Math.cos(viewPitch);
                const viewYaw = playerYaw + Math.PI + orbit.yaw;
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

                const sameRoadLevel = Math.abs(playerY - npc.position.y) < 2;
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
                    const npcYaw = npc.rotation.y - (npcData.yawOffset || 0);
                    const roadFwdX = -Math.sin(npcYaw);
                    const roadFwdZ = -Math.cos(npcYaw);
                    const roadRightX = Math.cos(npcYaw);
                    const roadRightZ = -Math.sin(npcYaw);

                    const npcVelX = roadFwdX * (npcData.speed || 0) + roadRightX * (npcData.lateralVelocity || 0);
                    const npcVelZ = roadFwdZ * (npcData.speed || 0) + roadRightZ * (npcData.lateralVelocity || 0);
                    const relVx = velocityX - npcVelX;
                    const relVz = velocityZ - npcVelZ;
                    const vNormal = relVx * nx + relVz * nz;

                    // Tabrakan frontal/belakang berkecepatan relatif sangat tinggi tetap Game Over
                    if (-vNormal > 16.5) {
                        cameraShakeIntensity = 0.55;
                        triggerGameOver();
                        break;
                    }

                    if (npcData.isPolice) {
                        npcData.policeState = 'chase';
                        npcData.chaseCalmTimer = 0;
                    }

                    // 1. Pisahkan posisi secara presisi sesuai rasio massa agar bodi TIDAK clipping
                    const npcMass = npcData.mass || 1450;
                    const invPlayerMass = 1 / playerMass;
                    const invNpcMass = 1 / npcMass;
                    const totalInvMass = invPlayerMass + invNpcMass;
                    const playerShare = invPlayerMass / totalInvMass;
                    const npcShare = invNpcMass / totalInvMass;

                    const separation = penetration + 0.008;
                    const npcMoveX = -nx * separation * npcShare;
                    const npcMoveZ = -nz * separation * npcShare;
                    const npcShiftFwd = npcMoveX * roadFwdX + npcMoveZ * roadFwdZ;
                    const npcShiftLat = npcMoveX * roadRightX + npcMoveZ * roadRightZ;

                    npcData.progress = (npcData.progress + npcShiftFwd / trackLength + 1) % 1;
                    const desiredLatPos = (npcData.lateralPos !== undefined ? npcData.lateralPos : npcData.lane) + npcShiftLat;
                    const clampedLatPos = THREE.MathUtils.clamp(desiredLatPos, -6.75, 6.75);
                    const leftoverLat = desiredLatPos - clampedLatPos;
                    npcData.lateralPos = clampedLatPos;

                    placeOnTrack(npc, npcData.progress, clampedLatPos);
                    npc.rotation.y += npcData.yawOffset;
                    npc.rotation.z = npcData.rollOffset;

                    playerX += nx * separation * playerShare + roadRightX * (-leftoverLat);
                    playerZ += nz * separation * playerShare + roadRightZ * (-leftoverLat);

                    // 2. Resolusi kecepatan normal (inelastis) + efek kedorong & hilang traksi ban NPC
                    if (vNormal < 0) {
                        const closingSpeed = -vNormal;
                        const restitution = 0.06;
                        const j = (1 + restitution) * closingSpeed / totalInvMass;

                        const playerDeltaV = j * invPlayerMass;
                        velocityX += nx * playerDeltaV;
                        velocityZ += nz * playerDeltaV;

                        const npcDeltaV = j * invNpcMass;
                        const npcPushX = -nx * npcDeltaV;
                        const npcPushZ = -nz * npcDeltaV;
                        const pushFwd = npcPushX * roadFwdX + npcPushZ * roadFwdZ;
                        const pushLat = npcPushX * roadRightX + npcPushZ * roadRightZ;

                        const npcMaxSpd = npcData.isPolice && npcData.policeState === 'chase' ? 65 : 42;
                        npcData.speed = THREE.MathUtils.clamp(npcData.speed + pushFwd, 4, npcMaxSpd);
                        npcData.lateralVelocity = THREE.MathUtils.clamp(npcData.lateralVelocity + pushLat, -14, 14);
                        npcData.pushedTimer = Math.max(npcData.pushedTimer || 0, 1.1);
                        npcData.controlLossTimer = Math.max(
                            npcData.controlLossTimer || 0,
                            Math.min(1.5, 0.35 + closingSpeed * 0.09)
                        );
                        if (closingSpeed > 1.5) {
                            npcData.skidIntensity = Math.max(
                                npcData.skidIntensity || 0,
                                THREE.MathUtils.clamp(closingSpeed / 8, 0.25, 1)
                            );
                        }

                        // Torsi yaw realistis berdasarkan titik benturan depan/belakang (efek PIT maneuver)
                        const relNpcX = playerBoxCenterX - npc.position.x;
                        const relNpcZ = playerBoxCenterZ - npc.position.z;
                        const contactFwdOffset = THREE.MathUtils.clamp(
                            relNpcX * roadFwdX + relNpcZ * roadFwdZ,
                            -npcHalfLength,
                            npcHalfLength
                        );
                        const contactLatOffset = THREE.MathUtils.clamp(
                            relNpcX * roadRightX + relNpcZ * roadRightZ,
                            -npcHalfWidth,
                            npcHalfWidth
                        );
                        const pitTorque = contactFwdOffset * (-pushLat) + contactLatOffset * pushFwd;
                        npcData.yawVelocity += THREE.MathUtils.clamp(pitTorque * 0.32, -2.4, 2.4);

                        const latPushFactor = Math.min(1, closingSpeed / 12);
                        if (closingSpeed > 1.8) {
                            const sideSign = Math.sign(pushLat) || Math.sign(nx * roadRightX + nz * roadRightZ) || 1;
                            npcData.rollVelocity += sideSign * latPushFactor * 1.15;
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
                        const npcGrindFwd = (tangentX * grindSign * npcGrindPush) * roadFwdX +
                            (tangentZ * grindSign * npcGrindPush) * roadFwdZ;
                        const npcGrindLat = (tangentX * grindSign * npcGrindPush) * roadRightX +
                            (tangentZ * grindSign * npcGrindPush) * roadRightZ;
                        const npcMaxSpd = npcData.isPolice && npcData.policeState === 'chase' ? 65 : 42;
                        npcData.speed = THREE.MathUtils.clamp(npcData.speed + npcGrindFwd, 4, npcMaxSpd);
                        npcData.lateralVelocity = THREE.MathUtils.clamp(npcData.lateralVelocity + npcGrindLat, -14, 14);
                        npcData.pushedTimer = Math.max(npcData.pushedTimer || 0, 0.7);
                        npcData.controlLossTimer = Math.max(npcData.controlLossTimer || 0, 0.35);
                        npcData.skidIntensity = Math.max(
                            npcData.skidIntensity || 0,
                            THREE.MathUtils.clamp(absRelTangent / 12, 0.2, 0.85)
                        );

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
                    !npcData.nearMissed &&
                    Math.abs(carSpeed) > 12 &&
                    longitudinalOffset < playerHalfLength + npcHalfLength + 0.6 &&
                    lateralOffset < playerHalfWidth + npcHalfWidth + 1.1
                ) {
                    npcData.nearMissed = true;
                    bonusScore += 25;
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

            // Jaga agar pemain tidak terdorong menembus pembatas jalan setelah resolusi tumbukan NPC
            const postCollisionRoad = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
            if (postCollisionRoad && postCollisionRoad.horizontalDistance > 7.1 && postCollisionRoad.verticalDistance <= 3.5) {
                const dist = postCollisionRoad.horizontalDistance || 1;
                const clampNx = (playerX - postCollisionRoad.x) / dist;
                const clampNz = (playerZ - postCollisionRoad.z) / dist;
                playerX = postCollisionRoad.x + clampNx * 7.1;
                playerZ = postCollisionRoad.z + clampNz * 7.1;
                const outV = velocityX * clampNx + velocityZ * clampNz;
                if (outV > 0) {
                    velocityX -= outV * clampNx * 1.05;
                    velocityZ -= outV * clampNz * 1.05;
                }
            }
            playerCar.position.x = playerX;
            playerCar.position.z = playerZ;

            renderer.render(scene, camera);
        }

        function triggerGameOver() {
            if (isGameOver) return;
            isGameOver = true;
            activeScrapeIntensity = 0;
            cameraShakeIntensity = 0.45;
            updateGameAudio(0, 1000, 6000, 0, false, false, selectedVehicleType, false);
            stopPoliceVoice();
            playCrashSound();
            resetInputs();

            const isNewRecord = score > bestScore;
            if (isNewRecord) {
                bestScore = score;
                try {
                    localStorage.setItem('speed_of_nusantara_best_score', String(bestScore));
                } catch {
                    // Abaikan jika penyimpanan lokal dinonaktifkan.
                }
            }

            document.getElementById('final-score').innerText = score;
            const finalBestEl = document.getElementById('final-best-score');
            if (finalBestEl) finalBestEl.innerText = String(bestScore);
            const bestScoreEl = document.getElementById('best-score');
            if (bestScoreEl) bestScoreEl.innerText = String(bestScore);
            const newRecordBadge = document.getElementById('new-record-badge');
            if (newRecordBadge) newRecordBadge.hidden = !isNewRecord;
            document.getElementById('game-over').style.display = 'block';
        }

        function restartGame() {
            isGameOver = false;
            carSpeed = 0;
            currentGear = 1;
            engineRpm = vehiclePhysicsConfigs[selectedVehicleType].idleRpm;
            totalDistance = 0;
            bonusScore = 0;
            score = 0;
            lastPlayerSegmentIndex = -1;
            cameraShakeIntensity = 0;
            nearMissBannerTimer = 0;
            activeScrapeIntensity = 0;
            resetInputs();
            stopPoliceVoice();
            resetPlayerPosition();
            clearSkidmarks();

            // Siapkan ulang seluruh 240 mobil NPC langsung sejak awal
            populateInitialTraffic();

            const toast = document.getElementById('near-miss-toast');
            if (toast) toast.hidden = true;
            const newRecordBadge = document.getElementById('new-record-badge');
            if (newRecordBadge) newRecordBadge.hidden = true;

            document.getElementById('game-over').style.display = 'none';
            document.getElementById('score').innerText = '0';
            document.getElementById('best-score').innerText = String(bestScore);
            document.getElementById('speed-value').innerText = '0';
            document.getElementById('rpm-value').innerText = Math.round(engineRpm);
            document.getElementById('gear-value').innerText = currentGear;
            const speedBarFill = document.getElementById('speed-bar-fill');
            if (speedBarFill) speedBarFill.style.width = '0%';
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
            animate();
        }

        async function exitToHome() {
            if (!hasStarted && !isGameOver) return;
            const wasGameOver = isGameOver;
            hasStarted = false;
            isGameOver = false;
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
            resetInputs();
            clearSkidmarks();

            updateGameAudio(0, 1000, 6000, 0, false, false, selectedVehicleType, false);
            stopPoliceVoice();

            if (playerCar) {
                scene.remove(playerCar);
                playerCar = null;
            }
            playerWheelPivots = [];
            clearTrafficCars();

            const toast = document.getElementById('near-miss-toast');
            if (toast) toast.hidden = true;
            const newRecordBadge = document.getElementById('new-record-badge');
            if (newRecordBadge) newRecordBadge.hidden = true;
            const controlsHint = document.getElementById('controls-hint');
            if (controlsHint) controlsHint.hidden = true;
            const controlsToggle = document.getElementById('controls-toggle');
            if (controlsToggle) {
                controlsToggle.setAttribute('aria-expanded', 'false');
                controlsToggle.setAttribute('aria-label', 'Tampilkan petunjuk kontrol');
            }
            document.getElementById('game-over').style.display = 'none';
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
