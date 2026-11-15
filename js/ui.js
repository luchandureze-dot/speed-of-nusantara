        async function startGame(event) {
            event.preventDefault();
            if (isLoadingVehicle) return;

            const nameInput = document.getElementById('player-name');
            const enteredName = nameInput.value.trim();
            if (!enteredName) {
                nameInput.setCustomValidity('Masukkan nama untuk plat nomor.');
                nameInput.reportValidity();
                return;
            }

            nameInput.setCustomValidity('');
            playerName = enteredName.toUpperCase();
            wheelbase = selectedVehicleType === 'car' ? innovaZenixSpecs.wheelbase : nmaxNeoSpecs.wheelbase;
            const cgHeight = vehiclePhysicsConfigs[selectedVehicleType].cgHeight;
            cameraOrbits[1].distance = Math.hypot(9, 3.5 - cgHeight);
            cameraOrbits[2].distance = Math.hypot(1.35, 1.25 - cgHeight);
            [1, 2].forEach(mode => {
                const orbit = cameraOrbits[mode];
                orbit.yaw = 0;
                orbit.pitch = 0;
                orbit.yawVelocity = 0;
                orbit.pitchVelocity = 0;
            });
            isLoadingVehicle = true;
            const startButton = document.getElementById('start-button');
            const startError = document.getElementById('start-error');
            startButton.disabled = true;
            startError.hidden = true;

            if (playerCar) {
                scene.remove(playerCar);
                playerCar = null;
            }

            try {
                initGameAudio();
                lastPlayerSegmentIndex = -1;
                bonusScore = 0;
                totalDistance = 0;
                score = 0;
                cameraShakeIntensity = 0;
                nearMissBannerTimer = 0;
                resetInputs();
                await createPlayerCar(selectedVehicleType, selectedVehicleColor, playerName);
                configureTireLayout();
                currentGear = 1;
                engineRpm = vehiclePhysicsConfigs[selectedVehicleType].idleRpm;
                document.getElementById('score').innerText = '0';
                document.getElementById('best-score').innerText = String(bestScore);
                document.getElementById('rpm-value').innerText = Math.round(engineRpm);
                document.getElementById('gear-label').innerText =
                    selectedVehicleType === 'motorcycle' ? 'RASIO' : 'GIGI';
                document.getElementById('gear-value').innerText = currentGear;
                hasStarted = true;
                isLoadingVehicle = false;
                document.getElementById('plate-dialog').close();
                document.getElementById('vehicle-selection').hidden = true;
                document.body.classList.remove('vehicle-selection-open');
                document.body.classList.add('game-active');
            } catch (error) {
                console.error('Gagal memulai game:', error);
                if (playerCar) {
                    scene.remove(playerCar);
                    playerCar = null;
                }
                isLoadingVehicle = false;
                startError.innerText = `Kendaraan gagal disiapkan: ${error.message}`;
                startError.hidden = false;
            } finally {
                startButton.disabled = false;
            }
        }

        // Spawn Mobil Lawan (Lalu Lintas Tol)
