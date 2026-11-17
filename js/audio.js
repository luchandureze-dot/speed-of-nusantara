        let audioCtx = null;
        let engineOscPrimary = null;
        let engineOscSub = null;
        let engineOscHarmonic2 = null;
        let engineOscHarmonic3 = null;
        let engineSubGain = null;
        let engineHarmonic2Gain = null;
        let engineHarmonic3Gain = null;
        let engineBodyFilter = null;
        let engineFilter = null;
        let engineGain = null;
        let roadNoiseSource = null;
        let roadFilter = null;
        let roadGain = null;
        let brakeFilter = null;
        let brakeMode2Filter = null;
        let brakeMode3Filter = null;
        let brakeHarmonicFilter = null;
        let screechOsc1 = null;
        let screechOsc2 = null;
        let screechOscGain = null;
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

        function createSoftDriveCurve(amount = 2.6) {
            const samples = 512;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
            }
            return curve;
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

                const engineShaper = audioCtx.createWaveShaper();
                engineShaper.curve = createSoftDriveCurve(2.2);
                engineShaper.oversample = '2x';

                engineBodyFilter = audioCtx.createBiquadFilter();
                engineBodyFilter.type = 'peaking';
                engineBodyFilter.frequency.value = 210;
                engineBodyFilter.Q.value = 1.6;
                engineBodyFilter.gain.value = 5.0;

                engineFilter = audioCtx.createBiquadFilter();
                engineFilter.type = 'lowpass';
                engineFilter.frequency.value = 340;
                engineFilter.Q.value = 1.8;

                engineGain = audioCtx.createGain();
                engineGain.gain.value = 0;

                engineOscPrimary = audioCtx.createOscillator();
                engineOscPrimary.type = 'sawtooth';
                engineOscPrimary.frequency.value = 55;

                engineOscSub = audioCtx.createOscillator();
                engineOscSub.type = 'triangle';
                engineOscSub.frequency.value = 27.5;

                engineOscHarmonic2 = audioCtx.createOscillator();
                engineOscHarmonic2.type = 'sawtooth';
                engineOscHarmonic2.frequency.value = 110;

                engineOscHarmonic3 = audioCtx.createOscillator();
                engineOscHarmonic3.type = 'triangle';
                engineOscHarmonic3.frequency.value = 82.5;

                engineSubGain = audioCtx.createGain();
                engineSubGain.gain.value = 0.75;

                engineHarmonic2Gain = audioCtx.createGain();
                engineHarmonic2Gain.gain.value = 0.35;

                engineHarmonic3Gain = audioCtx.createGain();
                engineHarmonic3Gain.gain.value = 0.22;

                engineOscPrimary.connect(engineShaper);
                engineOscSub.connect(engineSubGain);
                engineSubGain.connect(engineShaper);
                engineOscHarmonic2.connect(engineHarmonic2Gain);
                engineHarmonic2Gain.connect(engineShaper);
                engineOscHarmonic3.connect(engineHarmonic3Gain);
                engineHarmonic3Gain.connect(engineShaper);

                engineShaper.connect(engineBodyFilter);
                engineBodyFilter.connect(engineFilter);
                engineFilter.connect(engineGain);
                engineGain.connect(audioCtx.destination);

                engineOscPrimary.start();
                engineOscSub.start();
                engineOscHarmonic2.start();
                engineOscHarmonic3.start();

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

                // Tiga mode resonansi stick-slip ban (mengikuti spektrum decitan ban nyata ~1310 / 1455 / 1645 Hz + harmonik 2x 2620 Hz)
                brakeFilter = audioCtx.createBiquadFilter();
                brakeFilter.type = 'bandpass';
                brakeFilter.frequency.value = 1310;
                brakeFilter.Q.value = 22;

                brakeMode2Filter = audioCtx.createBiquadFilter();
                brakeMode2Filter.type = 'bandpass';
                brakeMode2Filter.frequency.value = 1455;
                brakeMode2Filter.Q.value = 24;

                brakeMode3Filter = audioCtx.createBiquadFilter();
                brakeMode3Filter.type = 'bandpass';
                brakeMode3Filter.frequency.value = 1645;
                brakeMode3Filter.Q.value = 20;

                brakeHarmonicFilter = audioCtx.createBiquadFilter();
                brakeHarmonicFilter.type = 'bandpass';
                brakeHarmonicFilter.frequency.value = 2620;
                brakeHarmonicFilter.Q.value = 16;

                const asphaltScrubFilter = audioCtx.createBiquadFilter();
                asphaltScrubFilter.type = 'bandpass';
                asphaltScrubFilter.frequency.value = 640;
                asphaltScrubFilter.Q.value = 1.6;

                const mode1Gain = audioCtx.createGain();
                mode1Gain.gain.value = 1.45;
                const mode2Gain = audioCtx.createGain();
                mode2Gain.gain.value = 1.25;
                const mode3Gain = audioCtx.createGain();
                mode3Gain.gain.value = 1.55;
                const harmonicGain = audioCtx.createGain();
                harmonicGain.gain.value = 0.85;
                const scrubGain = audioCtx.createGain();
                scrubGain.gain.value = 0.24;

                brakeGain = audioCtx.createGain();
                brakeGain.gain.value = 0;

                brakeNoise.connect(brakeFilter);
                brakeNoise.connect(brakeMode2Filter);
                brakeNoise.connect(brakeMode3Filter);
                brakeNoise.connect(brakeHarmonicFilter);
                brakeNoise.connect(asphaltScrubFilter);

                brakeFilter.connect(mode1Gain);
                brakeMode2Filter.connect(mode2Gain);
                brakeMode3Filter.connect(mode3Gain);
                brakeHarmonicFilter.connect(harmonicGain);
                asphaltScrubFilter.connect(scrubGain);

                mode1Gain.connect(brakeGain);
                mode2Gain.connect(brakeGain);
                mode3Gain.connect(brakeGain);
                harmonicGain.connect(brakeGain);
                scrubGain.connect(brakeGain);

                // Inti stick-slip karet + modulasi getar tapak ban (~34 Hz)
                screechOsc1 = audioCtx.createOscillator();
                screechOsc1.type = 'triangle';
                screechOsc1.frequency.value = 1340;

                screechOsc2 = audioCtx.createOscillator();
                screechOsc2.type = 'sawtooth';
                screechOsc2.frequency.value = 1640;

                const screechLfo = audioCtx.createOscillator();
                screechLfo.type = 'sine';
                screechLfo.frequency.value = 34;

                const screechLfoGain = audioCtx.createGain();
                screechLfoGain.gain.value = 24;
                screechLfo.connect(screechLfoGain);
                screechLfoGain.connect(screechOsc1.frequency);
                screechLfoGain.connect(screechOsc2.frequency);

                const screechCoreFilter = audioCtx.createBiquadFilter();
                screechCoreFilter.type = 'bandpass';
                screechCoreFilter.frequency.value = 1520;
                screechCoreFilter.Q.value = 2.4;

                screechOscGain = audioCtx.createGain();
                screechOscGain.gain.value = 0.14;

                screechOsc1.connect(screechCoreFilter);
                screechOsc2.connect(screechCoreFilter);
                screechCoreFilter.connect(screechOscGain);
                screechOscGain.connect(brakeGain);

                brakeGain.connect(audioCtx.destination);
                brakeNoise.start();
                screechOsc1.start();
                screechOsc2.start();
                screechLfo.start();

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

            if (isMotorcycle) {
                // Karakter 1-silinder skuter CVT (NMAX 155): dentuman kruk-as tunggal & dengungan knalpot naik linear
                const crankHz = Math.max(18, rpm / 60);
                if (engineOscPrimary.type !== 'square') engineOscPrimary.type = 'square';
                if (engineOscHarmonic2.type !== 'sawtooth') engineOscHarmonic2.type = 'sawtooth';
                engineOscPrimary.frequency.setTargetAtTime(crankHz * 1.0, now, 0.045);
                engineOscSub.frequency.setTargetAtTime(crankHz * 0.5, now, 0.045);
                engineOscHarmonic2.frequency.setTargetAtTime(crankHz * 2.0, now, 0.045);
                engineOscHarmonic3.frequency.setTargetAtTime(crankHz * 3.0, now, 0.045);

                engineSubGain.gain.setTargetAtTime(0.45, now, 0.05);
                engineHarmonic2Gain.gain.setTargetAtTime(0.42 + (throttleActive ? 0.16 : 0), now, 0.05);
                engineHarmonic3Gain.gain.setTargetAtTime(0.18, now, 0.05);

                engineBodyFilter.frequency.setTargetAtTime(380 + rpmRatio * 480, now, 0.06);
                engineBodyFilter.gain.setTargetAtTime(3.5, now, 0.06);
                engineFilter.frequency.setTargetAtTime(
                    360 + rpmRatio * (throttleActive ? 1050 : 600),
                    now,
                    0.06
                );
                const targetEngineGain = 0.052 + (throttleActive ? 0.042 : 0.01) + rpmRatio * 0.028;
                engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.06);
            } else {
                // Karakter 4-silinder DOHC Inline-4 (Innova Zenix 2.0): frekuensi firing = 2 * RPM / 60 (order ke-2, ke-4, ke-3)
                const crankHz = Math.max(16, rpm / 60);
                const firingHz = crankHz * 2.0;
                if (engineOscPrimary.type !== 'sawtooth') engineOscPrimary.type = 'sawtooth';
                if (engineOscHarmonic2.type !== 'sawtooth') engineOscHarmonic2.type = 'sawtooth';
                engineOscPrimary.frequency.setTargetAtTime(firingHz, now, 0.04);
                engineOscSub.frequency.setTargetAtTime(crankHz, now, 0.04); // Order 1 (putaran kruk-as halus & dalam)
                engineOscHarmonic2.frequency.setTargetAtTime(firingHz * 2.0, now, 0.04); // Order 4 (raungan 4-silinder saat RPM tinggi)
                engineOscHarmonic3.frequency.setTargetAtTime(firingHz * 1.5, now, 0.04); // Order 3 (karakter intake growl)

                engineSubGain.gain.setTargetAtTime(0.85, now, 0.05);
                engineHarmonic2Gain.gain.setTargetAtTime(
                    0.26 + rpmRatio * 0.42 + (throttleActive ? 0.22 : 0),
                    now,
                    0.05
                );
                engineHarmonic3Gain.gain.setTargetAtTime(throttleActive ? 0.28 : 0.12, now, 0.05);

                engineBodyFilter.frequency.setTargetAtTime(155 + rpmRatio * 340, now, 0.06);
                engineBodyFilter.gain.setTargetAtTime(throttleActive ? 6.5 : 4.2, now, 0.06);
                engineFilter.frequency.setTargetAtTime(
                    235 + rpmRatio * (throttleActive ? 1450 : 720),
                    now,
                    0.05
                );
                const targetEngineGain = 0.068 + (throttleActive ? 0.052 : 0.012) + rpmRatio * 0.036;
                engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.05);
            }

            const speedRatio = THREE.MathUtils.clamp(Math.abs(speedMps) / 50, 0, 1);
            roadFilter.frequency.setTargetAtTime(320 + speedRatio * 900, now, 0.08);
            roadGain.gain.setTargetAtTime(speedRatio * 0.06, now, 0.08);

            // Sintesis decitan ban stick-slip (mengikuti karakter spektrum ~1290-1680 Hz & harmonik 2x)
            const absSpeed = Math.abs(speedMps);
            const slipLevel = Math.max(
                skidIntensity > 0.10 && absSpeed > 1.8 ? skidIntensity : 0,
                brakingActive && absSpeed > 7.5 ? 0.35 * speedRatio : 0
            );
            if (brakeFilter && brakeMode2Filter && brakeMode3Filter && brakeHarmonicFilter) {
                const pitchScale = 0.92 + speedRatio * 0.16 + slipLevel * 0.06;
                const f1 = 1310 * pitchScale;
                const f2 = 1455 * pitchScale;
                const f3 = 1645 * pitchScale;
                brakeFilter.frequency.setTargetAtTime(f1, now, 0.035);
                brakeMode2Filter.frequency.setTargetAtTime(f2, now, 0.035);
                brakeMode3Filter.frequency.setTargetAtTime(f3, now, 0.035);
                brakeHarmonicFilter.frequency.setTargetAtTime(f1 * 2.0, now, 0.035);
                if (screechOsc1 && screechOsc2) {
                    screechOsc1.frequency.setTargetAtTime(f1 * 1.02, now, 0.035);
                    screechOsc2.frequency.setTargetAtTime(f3 * 0.99, now, 0.035);
                }
                if (screechOscGain) {
                    screechOscGain.gain.setTargetAtTime(0.08 + slipLevel * 0.09, now, 0.03);
                }
            }
            const brakeSqueal = brakingActive && absSpeed > 7.5 ? 0.09 * speedRatio : 0;
            const tireScreech = skidIntensity > 0.10 && absSpeed > 1.8
                ? Math.min(0.28, skidIntensity * (0.14 + 0.14 * speedRatio))
                : 0;
            brakeGain.gain.setTargetAtTime(Math.max(brakeSqueal, tireScreech), now, 0.025);

            if (scrapeGain) {
                scrapeGain.gain.setTargetAtTime(scrapeIntensity > 0 ? Math.min(0.09, scrapeIntensity * 0.09) : 0, now, 0.025);
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
