        let audioCtx = null;
        let engineOscPrimary = null;
        let engineOscSub = null;
        let engineFilter = null;
        let engineGain = null;
        let roadNoiseSource = null;
        let roadFilter = null;
        let roadGain = null;
        let brakeGain = null;
        let audioInitialized = false;

        function createNoiseBuffer(context) {
            const sampleRate = context.sampleRate;
            const length = sampleRate * 2;
            const buffer = context.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            return buffer;
        }

        function initGameAudio() {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;

                if (!audioCtx) {
                    audioCtx = new AudioContextClass();
                }
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                if (audioInitialized) return;

                engineFilter = audioCtx.createBiquadFilter();
                engineFilter.type = 'lowpass';
                engineFilter.frequency.value = 320;
                engineFilter.Q.value = 2.2;

                engineGain = audioCtx.createGain();
                engineGain.gain.value = 0;

                engineOscPrimary = audioCtx.createOscillator();
                engineOscPrimary.type = 'sawtooth';
                engineOscPrimary.frequency.value = 55;

                engineOscSub = audioCtx.createOscillator();
                engineOscSub.type = 'triangle';
                engineOscSub.frequency.value = 27.5;

                const subGain = audioCtx.createGain();
                subGain.gain.value = 0.65;

                engineOscPrimary.connect(engineFilter);
                engineOscSub.connect(subGain);
                subGain.connect(engineFilter);
                engineFilter.connect(engineGain);
                engineGain.connect(audioCtx.destination);

                engineOscPrimary.start();
                engineOscSub.start();

                const noiseBuffer = createNoiseBuffer(audioCtx);

                roadNoiseSource = audioCtx.createBufferSource();
                roadNoiseSource.buffer = noiseBuffer;
                roadNoiseSource.loop = true;

                roadFilter = audioCtx.createBiquadFilter();
                roadFilter.type = 'bandpass';
                roadFilter.frequency.value = 420;
                roadFilter.Q.value = 0.8;

                roadGain = audioCtx.createGain();
                roadGain.gain.value = 0;

                roadNoiseSource.connect(roadFilter);
                roadFilter.connect(roadGain);
                roadGain.connect(audioCtx.destination);
                roadNoiseSource.start();

                const brakeNoise = audioCtx.createBufferSource();
                brakeNoise.buffer = noiseBuffer;
                brakeNoise.loop = true;

                const brakeFilter = audioCtx.createBiquadFilter();
                brakeFilter.type = 'bandpass';
                brakeFilter.frequency.value = 1850;
                brakeFilter.Q.value = 5.5;

                brakeGain = audioCtx.createGain();
                brakeGain.gain.value = 0;

                brakeNoise.connect(brakeFilter);
                brakeFilter.connect(brakeGain);
                brakeGain.connect(audioCtx.destination);
                brakeNoise.start();

                audioInitialized = true;
            } catch (error) {
                console.warn('Audio tidak dapat diaktifkan:', error);
            }
        }

        function updateAudioButtonUi() {
            const button = document.getElementById('audio-toggle');
            if (!button) return;
            button.setAttribute('aria-pressed', String(isAudioMuted));
            button.setAttribute('aria-label', isAudioMuted ? 'Nyalakan suara' : 'Bisukan suara');
            button.innerText = isAudioMuted ? '🔇' : '🔊';
        }

        function toggleAudioMute() {
            isAudioMuted = !isAudioMuted;
            updateAudioButtonUi();
            if (!isAudioMuted) {
                initGameAudio();
            } else if (audioCtx && engineGain && roadGain && brakeGain) {
                const now = audioCtx.currentTime;
                engineGain.gain.setTargetAtTime(0, now, 0.04);
                roadGain.gain.setTargetAtTime(0, now, 0.04);
                brakeGain.gain.setTargetAtTime(0, now, 0.04);
            }
        }

        function updateGameAudio(rpm, idleRpm, maxRpm, speedMps, throttleActive, brakingActive, vehicleType, active) {
            if (!audioInitialized || !audioCtx) return;
            const now = audioCtx.currentTime;

            if (!active || isAudioMuted) {
                engineGain.gain.setTargetAtTime(0, now, 0.06);
                roadGain.gain.setTargetAtTime(0, now, 0.06);
                brakeGain.gain.setTargetAtTime(0, now, 0.04);
                return;
            }

            const rpmRatio = THREE.MathUtils.clamp((rpm - idleRpm) / Math.max(1, maxRpm - idleRpm), 0, 1);
            const isMotorcycle = vehicleType === 'motorcycle';
            const baseFreq = isMotorcycle ? 48 + rpmRatio * 138 : 34 + rpmRatio * 88;
            engineOscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.05);
            engineOscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);
            engineFilter.frequency.setTargetAtTime(
                (isMotorcycle ? 360 : 240) + rpmRatio * (throttleActive ? 950 : 520),
                now,
                0.06
            );

            const targetEngineGain = (isMotorcycle ? 0.055 : 0.065) + (throttleActive ? 0.045 : 0.01) + rpmRatio * 0.03;
            engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.06);

            const speedRatio = THREE.MathUtils.clamp(Math.abs(speedMps) / 50, 0, 1);
            roadFilter.frequency.setTargetAtTime(320 + speedRatio * 900, now, 0.08);
            roadGain.gain.setTargetAtTime(speedRatio * 0.06, now, 0.08);

            const showBrakeSqueal = brakingActive && Math.abs(speedMps) > 8;
            brakeGain.gain.setTargetAtTime(showBrakeSqueal ? 0.025 * speedRatio : 0, now, 0.04);
        }

        function playCrashSound() {
            if (!audioInitialized || !audioCtx || isAudioMuted) return;
            try {
                const now = audioCtx.currentTime;
                const impactBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.55, audioCtx.sampleRate);
                const data = impactBuffer.getChannelData(0);
                for (let i = 0; i < data.length; i++) {
                    const decay = Math.exp(-i / (audioCtx.sampleRate * 0.14));
                    data[i] = (Math.random() * 2 - 1) * decay;
                }
                const source = audioCtx.createBufferSource();
                source.buffer = impactBuffer;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(650, now);
                filter.frequency.exponentialRampToValueAtTime(110, now + 0.45);

                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

                source.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                source.start(now);

                const thudOsc = audioCtx.createOscillator();
                thudOsc.type = 'sine';
                thudOsc.frequency.setValueAtTime(125, now);
                thudOsc.frequency.exponentialRampToValueAtTime(32, now + 0.3);

                const thudGain = audioCtx.createGain();
                thudGain.gain.setValueAtTime(0.28, now);
                thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

                thudOsc.connect(thudGain);
                thudGain.connect(audioCtx.destination);
                thudOsc.start(now);
                thudOsc.stop(now + 0.35);
            } catch (error) {
                console.warn('Gagal memutar suara tabrakan:', error);
            }
        }

        function playNearMissSound() {
            if (!audioInitialized || !audioCtx || isAudioMuted) return;
            try {
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(580, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);

                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.18);
            } catch (error) {
                console.warn('Gagal memutar suara salip tipis:', error);
            }
        }
