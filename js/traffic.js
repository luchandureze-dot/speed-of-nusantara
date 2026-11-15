        const trafficSharedMaterials = {
            tire: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.85 }),
            rim: new THREE.MeshStandardMaterial({ color: 0xc2c8d1, roughness: 0.35, metalness: 0.75 }),
            glass: new THREE.MeshStandardMaterial({ color: 0x182330, roughness: 0.15, metalness: 0.7 }),
            bumper: new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.75 }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xfff3d1 }),
            taillight: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
            truckBox: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.6 })
        };

        const trafficWheelGeo = (() => {
            const geo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16);
            geo.rotateZ(Math.PI / 2);
            return geo;
        })();

        const trafficRimGeo = (() => {
            const geo = new THREE.CylinderGeometry(0.19, 0.19, 0.23, 12);
            geo.rotateZ(Math.PI / 2);
            return geo;
        })();

        function createTrafficVehicleMesh(variant, color) {
            const group = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });

            let length = 4.2;
            let width = 1.8;

            if (variant === 'truck') {
                length = 5.6;
                width = 2.1;
                const cab = new THREE.Mesh(new THREE.BoxGeometry(1.92, 1.45, 1.55), bodyMat);
                cab.position.set(0, 1.05, -1.75);
                cab.castShadow = true;
                group.add(cab);

                const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.65, 0.08), trafficSharedMaterials.glass);
                windshield.position.set(0, 1.32, -2.51);
                group.add(windshield);

                const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.08, 1.95, 3.65), trafficSharedMaterials.truckBox);
                cargo.position.set(0, 1.38, 0.92);
                cargo.castShadow = true;
                group.add(cargo);
            } else if (variant === 'mpv') {
                length = 4.55;
                width = 1.84;
                const lower = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.68, 4.45), bodyMat);
                lower.position.set(0, 0.64, 0);
                lower.castShadow = true;
                group.add(lower);

                const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.62, 2.85), bodyMat);
                cabin.position.set(0, 1.24, 0.38);
                cabin.castShadow = true;
                group.add(cabin);

                const glass = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.44, 2.55), trafficSharedMaterials.glass);
                glass.position.set(0, 1.24, 0.35);
                group.add(glass);
            } else {
                length = 4.15;
                width = 1.78;
                const lower = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.58, 4.1), bodyMat);
                lower.position.set(0, 0.58, 0);
                lower.castShadow = true;
                group.add(lower);

                const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.5, 2.05), bodyMat);
                cabin.position.set(0, 1.08, 0.12);
                cabin.castShadow = true;
                group.add(cabin);

                const glass = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.36, 1.85), trafficSharedMaterials.glass);
                glass.position.set(0, 1.08, 0.12);
                group.add(glass);
            }

            const halfLength = length / 2;
            const halfWidth = width / 2;

            const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.16), trafficSharedMaterials.bumper);
            frontBumper.position.set(0, 0.34, -halfLength);
            group.add(frontBumper);

            const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.16), trafficSharedMaterials.bumper);
            rearBumper.position.set(0, 0.34, halfLength);
            group.add(rearBumper);

            const lightOffsetX = halfWidth * 0.66;
            const lightY = variant === 'truck' ? 0.64 : 0.72;
            [-lightOffsetX, lightOffsetX].forEach(lx => {
                const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), trafficSharedMaterials.headlight);
                headlight.position.set(lx, lightY, -halfLength - 0.02);
                group.add(headlight);

                const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.08), trafficSharedMaterials.taillight);
                taillight.position.set(lx, lightY + 0.08, halfLength + 0.02);
                group.add(taillight);
            });

            const wheelX = halfWidth - 0.11;
            const wheelZ = halfLength * 0.62;
            [
                [-wheelX, -wheelZ],
                [wheelX, -wheelZ],
                [-wheelX, wheelZ],
                [wheelX, wheelZ]
            ].forEach(([wx, wz]) => {
                const tire = new THREE.Mesh(trafficWheelGeo, trafficSharedMaterials.tire);
                tire.position.set(wx, 0.32, wz);
                group.add(tire);

                const rim = new THREE.Mesh(trafficRimGeo, trafficSharedMaterials.rim);
                rim.position.set(wx, 0.32, wz);
                group.add(rim);
            });

            return { group, halfLength, halfWidth };
        }

        function spawnTrafficCar() {
            if (isGameOver || !hasStarted) return;
            if (trafficCars.length >= 18) return;

            const spawnProgress = (playerTrackProgress + 310 / trackLength) % 1;
            const lanes = [-4.5, 0, 4.5];
            // Acak urutan lajur lalu pilih lajur pertama yang cukup aman (jarak >= 45 m).
            for (let i = lanes.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
            }

            let chosenLane = null;
            for (const lane of lanes) {
                const blocked = trafficCars.some(npc => {
                    if (npc.userData.lane !== lane) return false;
                    const delta = Math.abs(npc.userData.progress - spawnProgress);
                    const wrappedDelta = Math.min(delta, 1 - delta);
                    return wrappedDelta * trackLength < 45;
                });
                if (!blocked) {
                    chosenLane = lane;
                    break;
                }
            }
            if (chosenLane === null) return;

            const variants = ['sedan', 'mpv', 'sedan', 'truck'];
            const variant = chosenLane === -4.5 && Math.random() < 0.7
                ? 'sedan'
                : variants[Math.floor(Math.random() * variants.length)];
            const colors = [0x1565c0, 0xf2f4f7, 0x2c3038, 0xd49b1a, 0x8d959e, 0xa82424];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];

            const { group, halfLength, halfWidth } = createTrafficVehicleMesh(variant, randomColor);

            // Lajur kiri (kecepatan lebih tinggi) vs kanan/tengah.
            let baseSpeed = 24 + Math.random() * 12;
            if (chosenLane === -4.5) baseSpeed = 30 + Math.random() * 12;
            if (variant === 'truck') baseSpeed = 19 + Math.random() * 7;

            group.userData = {
                speed: baseSpeed,
                targetSpeed: baseSpeed,
                progress: spawnProgress,
                lane: chosenLane,
                halfLength,
                halfWidth,
                nearMissed: false
            };

            scene.add(group);
            placeOnTrack(group, spawnProgress, chosenLane);
            trafficCars.push(group);
        }

        function updateTrafficFlow(dt) {
            for (let i = 0; i < trafficCars.length; i++) {
                const npc = trafficCars[i];
                let desiredSpeed = npc.userData.targetSpeed;

                for (let j = 0; j < trafficCars.length; j++) {
                    if (i === j) continue;
                    const other = trafficCars[j];
                    if (other.userData.lane !== npc.userData.lane) continue;
                    const aheadDist = ((other.userData.progress - npc.userData.progress + 1) % 1) * trackLength;
                    if (aheadDist > 0 && aheadDist < 28) {
                        desiredSpeed = Math.min(desiredSpeed, other.userData.speed * (aheadDist < 14 ? 0.85 : 0.98));
                    }
                }

                npc.userData.speed += (desiredSpeed - npc.userData.speed) * Math.min(1, dt * 4);
                npc.userData.progress = (npc.userData.progress + npc.userData.speed * dt / trackLength) % 1;
                placeOnTrack(npc, npc.userData.progress, npc.userData.lane);
            }
        }
