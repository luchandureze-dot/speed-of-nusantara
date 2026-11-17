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
            cameraOrbits[1].distance = getCameraPreset(1, selectedVehicleType).distance;
            cameraOrbits[2].distance = getCameraPreset(2, selectedVehicleType).distance;
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
                clearSkidmarks();
                await createPlayerCar(selectedVehicleType, selectedVehicleColor, playerName);
                configureTireLayout();
                populateInitialTraffic();
                const physics = vehiclePhysicsConfigs[selectedVehicleType];
                currentGear = physics.isCvt ? 2 : 3;
                policeBustedTimer = 5;
                policeThreatLevel = 0;
                policeToastTimer = 0;
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
                prevLapTrackProgress = playerTrackProgress;
                lapBannerTimer = 0;
                startCountdownTimer = 3.0;
                startGoFlashTimer = 0;
                if (typeof hidePoliceAlertToast === 'function') hidePoliceAlertToast();
                if (typeof syncDamageHud === 'function') syncDamageHud();
                if (selectedVehicleType === 'motorcycle') isManualTransmission = false;
                engineRpm = selectedVehicleType === 'motorcycle' ? 4200 : 3150;
                const lapCountEl = document.getElementById('lap-count');
                if (lapCountEl) lapCountEl.innerText = '1';
                document.getElementById('score').innerText = '00:00.00';
                document.getElementById('best-score').innerText = typeof formatLapTime === 'function'
                    ? formatLapTime(bestLapTimeSeconds)
                    : '--:--.--';
                document.getElementById('speed-value').innerText = '60';
                document.getElementById('rpm-value').innerText = String(Math.round(engineRpm));
                document.getElementById('gear-value').innerText = String(currentGear);
                syncTransmissionUi();
                const bustedBanner = document.getElementById('busted-banner');
                if (bustedBanner) bustedBanner.hidden = true;
                const crashToast = document.getElementById('crash-damage-toast');
                if (crashToast) crashToast.hidden = true;
                const lapToast = document.getElementById('lap-complete-toast');
                if (lapToast) lapToast.hidden = true;
                const countdownEl = document.getElementById('start-countdown');
                const countdownValEl = document.getElementById('start-countdown-value');
                if (countdownEl && countdownValEl) {
                    countdownEl.classList.remove('is-go');
                    countdownValEl.innerText = '3';
                    countdownEl.hidden = false;
                }
                const pauseMenu = document.getElementById('pause-menu');
                if (pauseMenu) pauseMenu.hidden = true;
                const pauseButton = document.getElementById('pause-game');
                if (pauseButton) pauseButton.setAttribute('aria-pressed', 'false');
                isPaused = false;
                hasStarted = true;
                isVehicleSelectionOpen = false;
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
