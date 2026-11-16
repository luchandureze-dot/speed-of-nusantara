        let audioCtx = null;
        let engineOscPrimary = null;
        let engineOscSub = null;
        let engineFilter = null;
        let engineGain = null;
        let roadNoiseSource = null;
        let roadFilter = null;
        let roadGain = null;
        let brakeGain = null;
        let scrapeGain = null;
        let sirenOsc = null;
        let sirenGain = null;
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

                const scrapeNoise = audioCtx.createBufferSource();
                scrapeNoise.buffer = noiseBuffer;
                scrapeNoise.loop = true;

                const scrapeFilter = audioCtx.createBiquadFilter();
                scrapeFilter.type = 'bandpass';
                scrapeFilter.frequency.value = 920;
                scrapeFilter.Q.value = 1.9;

                scrapeGain = audioCtx.createGain();
                scrapeGain.gain.value = 0;

                scrapeNoise.connect(scrapeFilter);
                scrapeFilter.connect(scrapeGain);
                scrapeGain.connect(audioCtx.destination);
                scrapeNoise.start();

                const sirenFilter = audioCtx.createBiquadFilter();
                sirenFilter.type = 'bandpass';
                sirenFilter.frequency.value = 1050;
                sirenFilter.Q.value = 1.4;

                sirenGain = audioCtx.createGain();
                sirenGain.gain.value = 0;

                sirenOsc = audioCtx.createOscillator();
                sirenOsc.type = 'sawtooth';
                sirenOsc.frequency.value = 720;

                sirenOsc.connect(sirenFilter);
                sirenFilter.connect(sirenGain);
                sirenGain.connect(audioCtx.destination);
                sirenOsc.start();

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
            } else if (audioCtx && engineGain && roadGain && brakeGain && scrapeGain) {
                const now = audioCtx.currentTime;
                engineGain.gain.setTargetAtTime(0, now, 0.04);
                roadGain.gain.setTargetAtTime(0, now, 0.04);
                brakeGain.gain.setTargetAtTime(0, now, 0.04);
                scrapeGain.gain.setTargetAtTime(0, now, 0.04);
                if (sirenGain) sirenGain.gain.setTargetAtTime(0, now, 0.04);
                stopPoliceVoice();
            }
        }

        function updateGameAudio(rpm, idleRpm, maxRpm, speedMps, throttleActive, brakingActive, vehicleType, active, skidIntensity = 0, scrapeIntensity = 0, sirenIntensity = 0) {
            if (!audioInitialized || !audioCtx) return;
            const now = audioCtx.currentTime;

            if (!active || isAudioMuted) {
                engineGain.gain.setTargetAtTime(0, now, 0.06);
                roadGain.gain.setTargetAtTime(0, now, 0.06);
                brakeGain.gain.setTargetAtTime(0, now, 0.04);
                if (scrapeGain) scrapeGain.gain.setTargetAtTime(0, now, 0.04);
                if (sirenGain) sirenGain.gain.setTargetAtTime(0, now, 0.04);
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

            const brakeSqueal = brakingActive && Math.abs(speedMps) > 8 ? 0.025 * speedRatio : 0;
            const tireScreech = skidIntensity > 0.12 && Math.abs(speedMps) > 2.5
                ? skidIntensity * (0.018 + 0.026 * speedRatio)
                : 0;
            brakeGain.gain.setTargetAtTime(Math.max(brakeSqueal, tireScreech), now, 0.035);

            if (scrapeGain) {
                scrapeGain.gain.setTargetAtTime(scrapeIntensity > 0 ? Math.min(0.08, scrapeIntensity * 0.08) : 0, now, 0.025);
            }

            if (sirenGain && sirenOsc) {
                if (sirenIntensity > 0.01) {
                    const sweepRate = sirenIntensity > 0.5 ? 2.6 : 1.15;
                    const sirenWave = 0.5 - 0.5 * Math.cos(now * Math.PI * 2 * sweepRate);
                    const sirenFreq = 640 + sirenWave * 460;
                    sirenOsc.frequency.setTargetAtTime(sirenFreq, now, 0.02);
                    sirenGain.gain.setTargetAtTime(THREE.MathUtils.clamp(sirenIntensity * 0.085, 0, 0.085), now, 0.04);
                } else {
                    sirenGain.gain.setTargetAtTime(0, now, 0.06);
                }
            }
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

        function stopPoliceVoice() {
            try {
                if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }
            } catch {
                // Abaikan jika SpeechSynthesis tidak tersedia.
            }
        }

        function playPolicePullOverVoice() {
            if (isAudioMuted) return;
            try {
                if (audioInitialized && audioCtx) {
                    const now = audioCtx.currentTime;
                    const chirpOsc = audioCtx.createOscillator();
                    chirpOsc.type = 'square';
                    chirpOsc.frequency.setValueAtTime(1180, now);
                    chirpOsc.frequency.setValueAtTime(860, now + 0.055);

                    const chirpFilter = audioCtx.createBiquadFilter();
                    chirpFilter.type = 'bandpass';
                    chirpFilter.frequency.value = 1100;
                    chirpFilter.Q.value = 2.0;

                    const chirpGain = audioCtx.createGain();
                    chirpGain.gain.setValueAtTime(0.07, now);
                    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

                    chirpOsc.connect(chirpFilter);
                    chirpFilter.connect(chirpGain);
                    chirpGain.connect(audioCtx.destination);
                    chirpOsc.start(now);
                    chirpOsc.stop(now + 0.14);
                }

                if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
                    const synth = window.speechSynthesis;
                    if (!synth) return;
                    if (synth.speaking) synth.cancel();

                    const utterance = new SpeechSynthesisUtterance('Harap menepi sekarang juga!');
                    utterance.lang = 'id-ID';
                    utterance.rate = 1.06;
                    utterance.pitch = 0.92;
                    utterance.volume = 1.0;

                    const voices = synth.getVoices ? synth.getVoices() : [];
                    const idVoice = voices.find(v => /^id[-_]/i.test(v.lang)) ||
                        voices.find(v => /indonesia/i.test(v.name));
                    if (idVoice) utterance.voice = idVoice;

                    synth.speak(utterance);
                }
            } catch (error) {
                console.warn('Suara pengeras suara polisi gagal diputar:', error);
            }
        }
