
        function init() {
            // 1. Scene & Renderer
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0a1a); // Nuansa malam senja kota
            scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);
            setupCameraControls(renderer.domElement);

            // 2. Camera
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
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
            document.querySelectorAll('.color-swatch').forEach(button => {
                button.addEventListener('click', () => {
                    setVehicleColor(button.dataset.color);
                });
            });

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

        function setVehicleColor(color) {
            selectedVehicleColor = color;
            document.querySelectorAll('.color-swatch').forEach(swatch => {
                swatch.setAttribute('aria-pressed', String(swatch.dataset.color === color));
            });
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

            playerCar.rotation.x = 0;
            playerCar.rotation.z = 0;

            let roadContact = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
            if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;
            if (roadContact && roadContact.horizontalDistance > 7.1 && roadContact.verticalDistance <= 2.5) {
                const distance = roadContact.horizontalDistance || 1;
                const normalX = (playerX - roadContact.x) / distance;
                const normalZ = (playerZ - roadContact.z) / distance;
                playerX = roadContact.x + normalX * 7.1;
                playerZ = roadContact.z + normalZ * 7.1;
                const outwardSpeed = velocityX * normalX + velocityZ * normalZ;
                if (outwardSpeed > 0) {
                    velocityX -= outwardSpeed * normalX;
                    velocityZ -= outwardSpeed * normalZ;
                    velocityX *= 0.85;
                    velocityZ *= 0.85;
                }
                roadContact = findNearestRoadPoint(playerX, playerY, playerZ, lastPlayerSegmentIndex);
                if (roadContact) lastPlayerSegmentIndex = roadContact.segmentIndex;
            }

            const onRoad = Boolean(roadContact) && roadContact.horizontalDistance <= 7.2 && roadContact.verticalDistance <= 2.5;
            if (onRoad) {
                playerY = roadContact.y;
                verticalVelocity = 0;
            } else {
                verticalVelocity -= 9.81 * dt;
                playerY = Math.max(0, playerY + verticalVelocity * dt);
                if (playerY === 0) verticalVelocity = 0;
                const speedMagnitude = Math.hypot(velocityX, velocityZ);
                if (speedMagnitude > 0) {
                    const speedAfterOffRoadDrag = Math.max(0, speedMagnitude - 5 * dt);
                    const speedScale = speedAfterOffRoadDrag / speedMagnitude;
                    velocityX *= speedScale;
                    velocityZ *= speedScale;
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
            playerCar.rotation.y = playerYaw;
            updatePlayerWheelVisuals(dt, onRoad);
            totalDistance += Math.hypot(velocityX, velocityZ) * dt;
            score = Math.floor(totalDistance) + bonusScore;
            document.getElementById('score').innerText = score;
            if (score > bestScore) {
                document.getElementById('best-score').innerText = String(score);
            }
            const measuredSpeed = Math.hypot(velocityX, velocityZ) * 3.6;
            document.getElementById('speed-value').innerText = Math.floor(carSpeed < 0 ? -measuredSpeed : measuredSpeed);

            const activePhysics = vehiclePhysicsConfigs[selectedVehicleType];
            const brakingNow = keys.backward && !keys.forward && carSpeed > 0.5;
            updateGameAudio(
                engineRpm,
                activePhysics.idleRpm,
                activePhysics.maxRpm,
                carSpeed,
                keys.forward,
                brakingNow,
                selectedVehicleType,
                true
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

            // Gerakkan & Cek Tabrakan dengan Mobil Lain (NPC)
            updateTrafficFlow(dt);
            const playerHalfLength = selectedVehicleType === 'motorcycle'
                ? nmaxNeoSpecs.length / 2
                : innovaZenixSpecs.length / 2;
            const playerHalfWidth = selectedVehicleType === 'motorcycle'
                ? nmaxNeoSpecs.width / 2
                : innovaZenixSpecs.width / 2;
            const forwardX = -Math.sin(playerYaw);
            const forwardZ = -Math.cos(playerYaw);

            for (let i = trafficCars.length - 1; i >= 0; i--) {
                const npc = trafficCars[i];
                const relativeX = npc.position.x - playerX;
                const relativeZ = npc.position.z - playerZ;
                const longitudinalOffset = Math.abs(relativeX * forwardX + relativeZ * forwardZ);
                const lateralOffset = Math.abs(relativeX * Math.cos(playerYaw) - relativeZ * Math.sin(playerYaw));
                const npcHalfLength = npc.userData.halfLength || 2.0;
                const npcHalfWidth = npc.userData.halfWidth || 0.9;
                const sameRoadLevel = Math.abs(playerY - npc.position.y) < 2;

                if (
                    sameRoadLevel &&
                    longitudinalOffset < playerHalfLength + npcHalfLength &&
                    lateralOffset < playerHalfWidth + npcHalfWidth
                ) {
                    triggerGameOver();
                    break;
                }

                if (
                    sameRoadLevel &&
                    !npc.userData.nearMissed &&
                    Math.abs(carSpeed) > 12 &&
                    longitudinalOffset < playerHalfLength + npcHalfLength + 0.6 &&
                    lateralOffset < playerHalfWidth + npcHalfWidth + 1.1
                ) {
                    npc.userData.nearMissed = true;
                    bonusScore += 25;
                    playNearMissSound();
                    const toast = document.getElementById('near-miss-toast');
                    if (toast) {
                        toast.hidden = false;
                        nearMissBannerTimer = 1.1;
                    }
                }

                // Hapus NPC yang sudah dilewati pemain.
                const distanceBehind = ((playerTrackProgress - npc.userData.progress + 1) % 1) * trackLength;
                if (distanceBehind < 20) {
                    scene.remove(npc);
                    trafficCars.splice(i, 1);
                }
            }

            renderer.render(scene, camera);
        }

        function triggerGameOver() {
            if (isGameOver) return;
            isGameOver = true;
            cameraShakeIntensity = 0.45;
            updateGameAudio(0, 1000, 6000, 0, false, false, selectedVehicleType, false);
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
            resetInputs();
            resetPlayerPosition();

            // Bersihkan sisa mobil NPC
            trafficCars.forEach(npc => scene.remove(npc));
            trafficCars = [];

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
            clock.getDelta();
            animate();
        }

        // Mulai Game
        init();
