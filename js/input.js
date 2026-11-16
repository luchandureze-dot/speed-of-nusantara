        function onKeyDown(e) {
            if (e.target && e.target.tagName === 'INPUT') return;
            if (isVehicleSelectionOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                updateVehicleSelection(selectedVehicleType === 'car' ? 'motorcycle' : 'car');
                e.preventDefault();
                return;
            }
            if (!hasStarted) return;
            if (e.key === 'w' || e.key === 'ArrowUp') keys.forward = true;
            if (e.key === 's' || e.key === 'ArrowDown') keys.backward = true;
            if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
            if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                keys.handbrake = true;
            }
            if (e.key === 'c' || e.key === 'C') {
                cameraMode = cameraMode === 1 ? 2 : 1;
            }
        }

        function onKeyUp(e) {
            if (e.target && e.target.tagName === 'INPUT') return;
            if (e.key === 'w' || e.key === 'ArrowUp') keys.forward = false;
            if (e.key === 's' || e.key === 'ArrowDown') keys.backward = false;
            if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
            if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
            if (e.code === 'Space' || e.key === ' ') {
                if (hasStarted) e.preventDefault();
                keys.handbrake = false;
            }
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            previewCamera.aspect = window.innerWidth / window.innerHeight;
            previewCamera.updateProjectionMatrix();
            if (isVehicleSelectionOpen) updatePreviewCameraFraming(selectedVehicleType);
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function setupCameraControls(canvas) {
            canvas.style.cursor = 'grab';
            canvas.addEventListener('pointerdown', event => {
                if (!hasStarted || event.button !== 0) return;

                isCameraDragging = true;
                lastCameraPointerX = event.clientX;
                lastCameraPointerY = event.clientY;
                cameraOrbits[cameraMode].yawVelocity = 0;
                cameraOrbits[cameraMode].pitchVelocity = 0;
                canvas.setPointerCapture(event.pointerId);
                canvas.style.cursor = 'grabbing';
                event.preventDefault();
            });

            canvas.addEventListener('pointermove', event => {
                if (!isCameraDragging) return;

                const orbit = cameraOrbits[cameraMode];
                orbit.yaw -= (event.clientX - lastCameraPointerX) * 0.005;
                const cgHeight = vehiclePhysicsConfigs[selectedVehicleType].cgHeight;
                const neutralPitch = cameraMode === 1
                    ? Math.atan2(3.5 - cgHeight, 9)
                    : Math.atan2(1.25 - cgHeight, 1.35);
                orbit.pitch = Math.max(
                    -0.15 - neutralPitch,
                    Math.min(
                        1.35 - neutralPitch,
                        orbit.pitch - (event.clientY - lastCameraPointerY) * 0.005
                    )
                );
                lastCameraPointerX = event.clientX;
                lastCameraPointerY = event.clientY;
            });

            const stopDragging = event => {
                if (!isCameraDragging) return;

                isCameraDragging = false;
                if (canvas.hasPointerCapture(event.pointerId)) {
                    canvas.releasePointerCapture(event.pointerId);
                }
                canvas.style.cursor = 'grab';
            };
            canvas.addEventListener('pointerup', stopDragging);
            canvas.addEventListener('pointercancel', stopDragging);

            canvas.addEventListener('wheel', event => {
                if (!hasStarted) return;

                event.preventDefault();
                const orbit = cameraOrbits[cameraMode];
                const minimumDistance = cameraMode === 1 ? 3 : 0.75;
                orbit.distance = Math.max(
                    minimumDistance,
                    Math.min(40, orbit.distance * Math.exp(event.deltaY * 0.001))
                );
            }, { passive: false });
        }

        function resetInputs() {
            keys.forward = false;
            keys.backward = false;
            keys.left = false;
            keys.right = false;
            keys.handbrake = false;
            steeringInputSmoothed = 0;
            throttleVisual = 0;
            brakeVisual = 0;
            handbrakeVisual = 0;
            document.querySelectorAll('.touch-btn.is-active').forEach(btn => {
                btn.classList.remove('is-active');
            });
        }

        function setupTouchControls() {
            const bindings = [
                { id: 'touch-left', key: 'left' },
                { id: 'touch-right', key: 'right' },
                { id: 'touch-handbrake', key: 'handbrake' },
                { id: 'touch-brake', key: 'backward' },
                { id: 'touch-gas', key: 'forward' }
            ];
            bindings.forEach(({ id, key }) => {
                const button = document.getElementById(id);
                if (!button) return;
                const activePointers = new Set();

                const releasePointer = event => {
                    activePointers.delete(event.pointerId);
                    if (activePointers.size === 0) {
                        keys[key] = false;
                        button.classList.remove('is-active');
                    }
                    if (button.hasPointerCapture(event.pointerId)) {
                        button.releasePointerCapture(event.pointerId);
                    }
                };

                button.addEventListener('pointerdown', event => {
                    if (!hasStarted || isGameOver) return;
                    event.preventDefault();
                    initGameAudio();
                    activePointers.add(event.pointerId);
                    keys[key] = true;
                    button.classList.add('is-active');
                    button.setPointerCapture(event.pointerId);
                });
                button.addEventListener('pointerup', releasePointer);
                button.addEventListener('pointercancel', releasePointer);
            });

            const camButton = document.getElementById('touch-camera');
            if (camButton) {
                camButton.addEventListener('click', () => {
                    if (!hasStarted || isGameOver) return;
                    cameraMode = cameraMode === 1 ? 2 : 1;
                });
            }
        }


