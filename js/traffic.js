        const TRAFFIC_KMH_TO_MPS = 1 / 3.6;
        const LANE_LEFT = -4.8;   // Lajur paling kiri: paling pelan (60-65 km/h)
        const LANE_MIDDLE = 0;    // Lajur tengah: sedang (66-74 km/h)
        const LANE_RIGHT = 4.8;   // Lajur paling kanan: cepat (75-80 km/h)
        const VALID_LANES = [LANE_LEFT, LANE_MIDDLE, LANE_RIGHT];
        const POLICE_SPEED_LIMIT_MPS = 85 * TRAFFIC_KMH_TO_MPS;
        const POLICE_MAX_CHASE_SPEED_MPS = 225 * TRAFFIC_KMH_TO_MPS;
        const POLICE_VISION_RANGE = 115;
        const POLICE_VISION_COS_HALF_ANGLE = 0.72;
        const POLICE_TAIL_GAP_METERS = 3.0;
        const POLICE_VOICE_DISTANCE_METERS = 10.0;
        const POLICE_UNIT_COUNT = 8;
        const MAX_POLICE_POINT_LIGHTS = 2;

        const trafficSharedMaterials = {
            tire: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.85 }),
            rim: new THREE.MeshStandardMaterial({ color: 0xc2c8d1, roughness: 0.35, metalness: 0.75 }),
            glass: new THREE.MeshStandardMaterial({ color: 0x182330, roughness: 0.15, metalness: 0.7 }),
            bumper: new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.75 }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xfff3d1 }),
            taillight: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
            truckBox: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.6 }),
            policeStripe: new THREE.MeshStandardMaterial({ color: 0x0d2b5c, roughness: 0.35, metalness: 0.45 }),
            policeBarBase: new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.4, metalness: 0.6 })
        };

        const trafficPaletteColors = [0x1565c0, 0xf2f4f7, 0x2c3038, 0xd49b1a, 0x8d959e, 0xa82424];
        const trafficBodyMaterials = trafficPaletteColors.map(color =>
            new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 })
        );
        const trafficPoliceBodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xf4f7fb,
            roughness: 0.3,
            metalness: 0.35
        });
        const trafficVariantTemplates = {};
        const trafficSortedIndices = [];
        const policePointLights = [];
        let policeFlashClock = 0;
        let activePoliceSirenIntensity = 0;
        let policeVoiceCooldownTimer = 0;

        function getActivePoliceSirenIntensity() {
            return activePoliceSirenIntensity;
        }

        function ensurePolicePointLights() {
            if (!scene || policePointLights.length >= MAX_POLICE_POINT_LIGHTS) return;
            while (policePointLights.length < MAX_POLICE_POINT_LIGHTS) {
                const light = new THREE.PointLight(0x1e90ff, 0, 38, 2);
                light.position.set(0, -100, 0);
                scene.add(light);
                policePointLights.push(light);
            }
        }

        function resetPoliceLightPool() {
            activePoliceSirenIntensity = 0;
            policeVoiceCooldownTimer = 0;
            for (let i = 0; i < policePointLights.length; i++) {
                policePointLights[i].intensity = 0;
                policePointLights[i].position.set(0, -100, 0);
            }
        }

        function buildTrafficPart(geometry, x, y, z) {
            geometry.translate(x, y, z);
            return geometry;
        }

        function getTrafficVariantTemplate(variant) {
            if (trafficVariantTemplates[variant]) return trafficVariantTemplates[variant];

            const bodyParts = [];
            const detailGroups = [
                { material: trafficSharedMaterials.glass, geometries: [] },
                { material: trafficSharedMaterials.bumper, geometries: [] },
                { material: trafficSharedMaterials.headlight, geometries: [] },
                { material: trafficSharedMaterials.taillight, geometries: [] },
                { material: trafficSharedMaterials.tire, geometries: [] },
                { material: trafficSharedMaterials.rim, geometries: [] },
                { material: trafficSharedMaterials.truckBox, geometries: [] },
                { material: trafficSharedMaterials.policeStripe, geometries: [] },
                { material: trafficSharedMaterials.policeBarBase, geometries: [] }
            ];

            let length = 4.15;
            let width = 1.78;

            if (variant === 'truck') {
                length = 5.6;
                width = 2.1;
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.92, 1.45, 1.55), 0, 1.05, -1.75));
                detailGroups[0].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.74, 0.65, 0.08), 0, 1.32, -2.51));
                detailGroups[6].geometries.push(buildTrafficPart(new THREE.BoxGeometry(2.08, 1.95, 3.65), 0, 1.38, 0.92));
            } else if (variant === 'mpv') {
                length = 4.55;
                width = 1.84;
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.82, 0.68, 4.45), 0, 0.64, 0));
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.66, 0.62, 2.85), 0, 1.24, 0.38));
                detailGroups[0].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.68, 0.44, 2.55), 0, 1.24, 0.35));
            } else if (variant === 'police') {
                length = 4.3;
                width = 1.82;
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.8, 0.6, 4.24), 0, 0.59, 0));
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.58, 0.52, 2.1), 0, 1.1, 0.1));
                detailGroups[0].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.6, 0.38, 1.88), 0, 1.1, 0.1));
                // Garis biru polisi di sisi bodi & kap mesin + dudukan lightbar atap
                detailGroups[7].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.83, 0.22, 1.55), 0, 0.63, 0.05));
                detailGroups[7].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.52, 0.04, 1.18), 0, 0.9, -1.32));
                detailGroups[8].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.16, 0.07, 0.28), 0, 1.39, 0.05));
            } else {
                length = 4.15;
                width = 1.78;
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.76, 0.58, 4.1), 0, 0.58, 0));
                bodyParts.push(buildTrafficPart(new THREE.BoxGeometry(1.56, 0.5, 2.05), 0, 1.08, 0.12));
                detailGroups[0].geometries.push(buildTrafficPart(new THREE.BoxGeometry(1.58, 0.36, 1.85), 0, 1.08, 0.12));
            }

            const halfLength = length / 2;
            const halfWidth = width / 2;

            detailGroups[1].geometries.push(buildTrafficPart(new THREE.BoxGeometry(width, 0.22, 0.16), 0, 0.34, -halfLength));
            detailGroups[1].geometries.push(buildTrafficPart(new THREE.BoxGeometry(width, 0.22, 0.16), 0, 0.34, halfLength));

            const lightOffsetX = halfWidth * 0.66;
            const lightY = variant === 'truck' ? 0.64 : 0.72;
            [-lightOffsetX, lightOffsetX].forEach(lx => {
                detailGroups[2].geometries.push(buildTrafficPart(new THREE.BoxGeometry(0.32, 0.14, 0.08), lx, lightY, -halfLength - 0.02));
                detailGroups[3].geometries.push(buildTrafficPart(new THREE.BoxGeometry(0.34, 0.15, 0.08), lx, lightY + 0.08, halfLength + 0.02));
            });

            const wheelX = halfWidth - 0.11;
            const wheelZ = halfLength * 0.62;
            [
                [-wheelX, -wheelZ],
                [wheelX, -wheelZ],
                [-wheelX, wheelZ],
                [wheelX, wheelZ]
            ].forEach(([wx, wz]) => {
                const tireGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
                tireGeo.rotateZ(Math.PI / 2);
                tireGeo.translate(wx, 0.32, wz);
                detailGroups[4].geometries.push(tireGeo);

                const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.23, 10);
                rimGeo.rotateZ(Math.PI / 2);
                rimGeo.translate(wx, 0.32, wz);
                detailGroups[5].geometries.push(rimGeo);
            });

            const bodyGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(bodyParts, false);
            bodyParts.forEach(geo => geo.dispose());

            const activeDetailMaterials = [];
            const activeDetailMerged = [];
            detailGroups.forEach(group => {
                if (!group.geometries.length) return;
                const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(group.geometries, false);
                group.geometries.forEach(geo => geo.dispose());
                if (merged) {
                    activeDetailMaterials.push(group.material);
                    activeDetailMerged.push(merged);
                }
            });

            const detailGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(activeDetailMerged, true);
            activeDetailMerged.forEach(geo => geo.dispose());

            trafficVariantTemplates[variant] = {
                bodyGeometry,
                detailGeometry,
                detailMaterials: activeDetailMaterials,
                policeBeaconGeometry: variant === 'police' ? new THREE.BoxGeometry(0.46, 0.13, 0.24) : null,
                policeGlowGeometry: variant === 'police' ? new THREE.SphereGeometry(0.48, 10, 8) : null,
                halfLength,
                halfWidth
            };
            return trafficVariantTemplates[variant];
        }

        function createTrafficVehicleMesh(variant, colorIndex) {
            const template = getTrafficVariantTemplate(variant);
            const group = new THREE.Group();

            const bodyMat = variant === 'police'
                ? trafficPoliceBodyMaterial
                : trafficBodyMaterials[colorIndex];
            const bodyMesh = new THREE.Mesh(template.bodyGeometry, bodyMat);
            bodyMesh.frustumCulled = false;
            group.add(bodyMesh);

            const detailMesh = new THREE.Mesh(template.detailGeometry, template.detailMaterials);
            detailMesh.frustumCulled = false;
            group.add(detailMesh);

            let policeVisuals = null;
            if (variant === 'police') {
                const leftBeaconMat = new THREE.MeshBasicMaterial({ color: 0x0b2554 });
                const rightBeaconMat = new THREE.MeshBasicMaterial({ color: 0x0b2554 });
                const glowMat = new THREE.MeshBasicMaterial({
                    color: 0x2699ff,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });

                const leftBeacon = new THREE.Mesh(template.policeBeaconGeometry, leftBeaconMat);
                leftBeacon.position.set(-0.34, 1.47, 0.05);
                leftBeacon.frustumCulled = false;
                group.add(leftBeacon);

                const rightBeacon = new THREE.Mesh(template.policeBeaconGeometry, rightBeaconMat);
                rightBeacon.position.set(0.34, 1.47, 0.05);
                rightBeacon.frustumCulled = false;
                group.add(rightBeacon);

                const beaconGlow = new THREE.Mesh(template.policeGlowGeometry, glowMat);
                beaconGlow.position.set(0, 1.52, 0.05);
                beaconGlow.scale.set(2.4, 1.15, 1.6);
                beaconGlow.visible = false;
                beaconGlow.frustumCulled = false;
                group.add(beaconGlow);

                policeVisuals = {
                    leftBeaconMat,
                    rightBeaconMat,
                    glowMat,
                    beaconGlow
                };
            }

            return {
                group,
                policeVisuals,
                halfLength: template.halfLength,
                halfWidth: template.halfWidth
            };
        }

        function clearTrafficCars() {
            trafficCars.forEach(npc => scene.remove(npc));
            trafficCars = [];
            trafficSortedIndices.length = 0;
            resetPoliceLightPool();
        }

        function sampleOrganicTrafficGap() {
            const roll = Math.random();
            if (roll < 0.28) {
                return 36 + Math.random() * 24;
            }
            if (roll < 0.74) {
                return 64 + Math.random() * 48;
            }
            return 118 + Math.random() * 68;
        }

        function pickVehicleForLane(chosenLane) {
            const roll = Math.random();
            if (chosenLane === LANE_LEFT) {
                if (roll < 0.45) return 'truck';
                if (roll < 0.8) return 'mpv';
                return 'sedan';
            }
            if (chosenLane === LANE_MIDDLE) {
                if (roll < 0.55) return 'sedan';
                if (roll < 0.92) return 'mpv';
                return 'truck';
            }
            return roll < 0.76 ? 'sedan' : 'mpv';
        }

        function getLaneSpeedMps(chosenLane) {
            if (chosenLane === LANE_LEFT) {
                return (60 + Math.random() * 5) * TRAFFIC_KMH_TO_MPS;
            }
            if (chosenLane === LANE_MIDDLE) {
                return (66 + Math.random() * 8) * TRAFFIC_KMH_TO_MPS;
            }
            return (75 + Math.random() * 5) * TRAFFIC_KMH_TO_MPS;
        }

        function getNearestValidLane(lateralPos) {
            let bestLane = LANE_MIDDLE;
            let bestDist = Infinity;
            for (let i = 0; i < VALID_LANES.length; i++) {
                const dist = Math.abs(lateralPos - VALID_LANES[i]);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestLane = VALID_LANES[i];
                }
            }
            return bestLane;
        }

        function populateInitialTraffic() {
            clearTrafficCars();
            if (!trackLength || !roadSegments.length) return;
            ensurePolicePointLights();

            const safeMarginMeters = 42;
            const usableTrackMeters = Math.max(200, trackLength - safeMarginMeters * 2);
            const plannedSlots = [];

            for (let laneIdx = 0; laneIdx < VALID_LANES.length; laneIdx++) {
                const chosenLane = VALID_LANES[laneIdx];
                let distAlongUsable = 10 + Math.random() * 55;

                while (distAlongUsable < usableTrackMeters - 28) {
                    const progress = (playerTrackProgress + (safeMarginMeters + distAlongUsable) / trackLength) % 1;
                    plannedSlots.push({
                        chosenLane,
                        distAlongUsable,
                        progress,
                        variant: pickVehicleForLane(chosenLane)
                    });
                    distAlongUsable += sampleOrganicTrafficGap();
                }
            }

            // Sebar 8 unit patroli polisi secara merata di sepanjang jalan tol sejak awal
            if (plannedSlots.length >= POLICE_UNIT_COUNT) {
                for (let p = 0; p < POLICE_UNIT_COUNT; p++) {
                    const targetDist = 85 + (p / POLICE_UNIT_COUNT) * (usableTrackMeters - 120);
                    let bestIdx = -1;
                    let bestScore = Infinity;
                    for (let s = 0; s < plannedSlots.length; s++) {
                        if (plannedSlots[s].variant === 'police') continue;
                        const distErr = Math.abs(plannedSlots[s].distAlongUsable - targetDist);
                        const truckPenalty = plannedSlots[s].variant === 'truck' ? 40 : 0;
                        if (distErr + truckPenalty < bestScore) {
                            bestScore = distErr + truckPenalty;
                            bestIdx = s;
                        }
                    }
                    if (bestIdx !== -1) {
                        plannedSlots[bestIdx].variant = 'police';
                    }
                }
            }

            for (let s = 0; s < plannedSlots.length; s++) {
                const slot = plannedSlots[s];
                const isPolice = slot.variant === 'police';
                const colorIndex = Math.floor(Math.random() * trafficBodyMaterials.length);
                const { group, policeVisuals, halfLength, halfWidth } = createTrafficVehicleMesh(slot.variant, colorIndex);

                const baseSpeed = isPolice
                    ? Math.max(getLaneSpeedMps(slot.chosenLane), (70 + Math.random() * 9) * TRAFFIC_KMH_TO_MPS)
                    : getLaneSpeedMps(slot.chosenLane);
                const vehicleMass = slot.variant === 'truck' ? 4200 : (slot.variant === 'mpv' || isPolice ? 1620 : 1350);

                group.userData = {
                    speed: baseSpeed,
                    targetSpeed: baseSpeed,
                    mass: vehicleMass,
                    progress: slot.progress,
                    lane: slot.chosenLane,
                    lateralPos: slot.chosenLane,
                    lateralVelocity: 0,
                    yawOffset: 0,
                    yawVelocity: 0,
                    rollOffset: 0,
                    rollVelocity: 0,
                    hitCooldown: 0,
                    pushedTimer: 0,
                    controlLossTimer: 0,
                    laneChangeCooldown: Math.random() * 2.0,
                    skidIntensity: 0,
                    worldVelX: 0,
                    worldVelZ: 0,
                    skidTrails: null,
                    isPolice,
                    policeState: 'patrol',
                    chaseCalmTimer: 0,
                    policeVisuals,
                    halfLength,
                    halfWidth,
                    nearMissed: false
                };

                scene.add(group);
                placeOnTrack(group, slot.progress, slot.chosenLane);
                trafficCars.push(group);
            }
        }

        function isTargetLaneClearForNpc(sortedPos, data, candLane, isPursuit = false) {
            const totalCars = trafficCars.length;
            const minAhead = isPursuit ? 13 : 26;
            const minBehind = isPursuit ? 10 : 20;

            // Cek NPC di depan dalam lajur target
            for (let step = 1; step < totalCars; step++) {
                const other = trafficCars[trafficSortedIndices[(sortedPos + step) % totalCars]].userData;
                let aheadDist = (other.progress - data.progress) * trackLength;
                if (aheadDist < 0) aheadDist += trackLength;
                if (aheadDist >= 42) break;

                if (Math.abs(other.lateralPos - candLane) <= 2.3 || Math.abs(other.lane - candLane) < 0.6) {
                    if (aheadDist < minAhead) return false;
                    if (!isPursuit && other.speed < data.speed - 0.5) return false;
                }
            }

            // Cek NPC di belakang dalam lajur target
            for (let step = 1; step < totalCars; step++) {
                const other = trafficCars[trafficSortedIndices[(sortedPos - step + totalCars) % totalCars]].userData;
                let behindDist = (data.progress - other.progress) * trackLength;
                if (behindDist < 0) behindDist += trackLength;
                if (behindDist >= 26) break;

                if (Math.abs(other.lateralPos - candLane) <= 2.3 || Math.abs(other.lane - candLane) < 0.6) {
                    if (behindDist < minBehind) return false;
                }
            }

            // Cek jarak aman terhadap mobil/motor pemain agar NPC biasa tidak memotong mendadak
            if (hasStarted && !isPursuit) {
                let playerDelta = (playerTrackProgress - data.progress) * trackLength;
                if (playerDelta > trackLength * 0.5) playerDelta -= trackLength;
                if (playerDelta < -trackLength * 0.5) playerDelta += trackLength;

                if (Math.abs(playerRoadLateral - candLane) <= 2.65 && playerDelta > -28 && playerDelta < 22) {
                    return false;
                }
            }

            return true;
        }

        function resolveNpcToNpcCollisions(totalCars) {
            for (let k = 0; k < totalCars; k++) {
                const a = trafficCars[trafficSortedIndices[k]].userData;

                for (let step = 1; step < totalCars; step++) {
                    const b = trafficCars[trafficSortedIndices[(k + step) % totalCars]].userData;
                    let longDist = (b.progress - a.progress) * trackLength;
                    if (longDist < 0) longDist += trackLength;
                    if (longDist >= 9.0) break;

                    const reqLong = a.halfLength + b.halfLength + 0.25;
                    const latDiff = b.lateralPos - a.lateralPos;
                    const reqLat = a.halfWidth + b.halfWidth + 0.18;

                    if (longDist < reqLong && Math.abs(latDiff) < reqLat) {
                        const longPen = reqLong - longDist;
                        const latPen = reqLat - Math.abs(latDiff);
                        const invMa = 1 / (a.mass || 1450);
                        const invMb = 1 / (b.mass || 1450);
                        const totalInvM = invMa + invMb;
                        const shareA = invMa / totalInvM;
                        const shareB = invMb / totalInvM;

                        if (latPen < longPen) {
                            const dir = latDiff >= 0 ? 1 : -1;
                            const sep = latPen + 0.02;
                            a.lateralPos = THREE.MathUtils.clamp(a.lateralPos - dir * sep * shareA, -6.75, 6.75);
                            b.lateralPos = THREE.MathUtils.clamp(b.lateralPos + dir * sep * shareB, -6.75, 6.75);

                            const relLatV = a.lateralVelocity - b.lateralVelocity;
                            if (relLatV * dir > 0) {
                                const j = (1 + 0.08) * (relLatV * dir) / totalInvM;
                                a.lateralVelocity -= dir * j * invMa;
                                b.lateralVelocity += dir * j * invMb;
                                if (Math.abs(relLatV) > 1.4) {
                                    a.controlLossTimer = Math.max(a.controlLossTimer, 0.45);
                                    b.controlLossTimer = Math.max(b.controlLossTimer, 0.55);
                                    b.yawVelocity += dir * 0.45;
                                    b.rollVelocity += dir * 0.7;
                                }
                            }
                        } else {
                            const sep = longPen + 0.05;
                            a.progress = (a.progress - (sep * shareA) / trackLength + 1) % 1;
                            b.progress = (b.progress + (sep * shareB) / trackLength) % 1;

                            const relLongV = a.speed - b.speed;
                            if (relLongV > 0) {
                                const j = (1 + 0.08) * relLongV / totalInvM;
                                a.speed = Math.max(4, a.speed - j * invMa);
                                b.speed = Math.min(b.isPolice && b.policeState === 'chase' ? 65 : 42, b.speed + j * invMb);
                                b.pushedTimer = Math.max(b.pushedTimer, 0.7);
                                if (relLongV > 2.2) {
                                    a.controlLossTimer = Math.max(a.controlLossTimer, 0.35);
                                    b.controlLossTimer = Math.max(b.controlLossTimer, 0.4);
                                }
                            }
                        }
                    }
                }
            }
        }

        function updateTrafficFlow(dt) {
            const totalCars = trafficCars.length;
            if (!totalCars) {
                resetPoliceLightPool();
                return;
            }

            policeFlashClock += dt;
            if (policeVoiceCooldownTimer > 0) {
                policeVoiceCooldownTimer = Math.max(0, policeVoiceCooldownTimer - dt);
            }
            const playerSpeedMps = Math.hypot(velocityX, velocityZ);
            const playerHalfLen = selectedVehicleType === 'motorcycle'
                ? nmaxNeoSpecs.length / 2
                : innovaZenixSpecs.length / 2;

            if (trafficSortedIndices.length !== totalCars) {
                trafficSortedIndices.length = totalCars;
                for (let i = 0; i < totalCars; i++) {
                    trafficSortedIndices[i] = i;
                }
            }
            trafficSortedIndices.sort((a, b) => trafficCars[a].userData.progress - trafficCars[b].userData.progress);

            for (let k = 0; k < totalCars; k++) {
                const i = trafficSortedIndices[k];
                const npc = trafficCars[i];
                const data = npc.userData;
                const prevSpeed = data.speed;
                const prevControlLoss = data.controlLossTimer > 0;

                if (data.hitCooldown > 0) data.hitCooldown = Math.max(0, data.hitCooldown - dt);
                if (data.pushedTimer > 0) data.pushedTimer = Math.max(0, data.pushedTimer - dt);
                if (data.controlLossTimer > 0) data.controlLossTimer = Math.max(0, data.controlLossTimer - dt);
                if (data.laneChangeCooldown > 0) data.laneChangeCooldown = Math.max(0, data.laneChangeCooldown - dt);

                let closestAheadDist = Infinity;
                let closestAheadSpeed = data.targetSpeed;

                for (let step = 1; step < totalCars; step++) {
                    const otherIdx = trafficSortedIndices[(k + step) % totalCars];
                    const otherData = trafficCars[otherIdx].userData;
                    let aheadDist = (otherData.progress - data.progress) * trackLength;
                    if (aheadDist < 0) aheadDist += trackLength;
                    if (aheadDist >= 42) break;

                    const lateralClear = Math.abs(otherData.lateralPos - data.lateralPos);
                    const laneMatch = data.isPolice && data.policeState === 'chase'
                        ? lateralClear <= 2.35
                        : (lateralClear <= 2.15 || Math.abs(otherData.lane - data.lane) < 0.6);
                    if (aheadDist > 0 && laneMatch) {
                        if (aheadDist < closestAheadDist) {
                            closestAheadDist = aheadDist;
                            closestAheadSpeed = otherData.speed;
                        }
                    }
                }

                // Logika Patroli & Cone of Vision Polisi (> 85 km/h) + Buntuti 3 meter
                let playerDeltaMeters = 0;
                if (data.isPolice) {
                    playerDeltaMeters = (playerTrackProgress - data.progress) * trackLength;
                    if (playerDeltaMeters > trackLength * 0.5) playerDeltaMeters -= trackLength;
                    if (playerDeltaMeters < -trackLength * 0.5) playerDeltaMeters += trackLength;

                    const toPlayerX = playerX - npc.position.x;
                    const toPlayerZ = playerZ - npc.position.z;
                    const toPlayerDist = Math.hypot(toPlayerX, toPlayerZ);
                    const policeFwdX = -Math.sin(npc.rotation.y);
                    const policeFwdZ = -Math.cos(npc.rotation.y);
                    const forwardDot = toPlayerDist > 0.001
                        ? (toPlayerX * policeFwdX + toPlayerZ * policeFwdZ) / toPlayerDist
                        : 1;
                    const sameElevation = Math.abs(playerY - npc.position.y) < 4.5;
                    const inVisionCone = sameElevation &&
                        toPlayerDist <= POLICE_VISION_RANGE &&
                        forwardDot >= POLICE_VISION_COS_HALF_ANGLE;

                    if (
                        hasStarted &&
                        playerSpeedMps > POLICE_SPEED_LIMIT_MPS &&
                        inVisionCone
                    ) {
                        data.policeState = 'chase';
                        data.chaseCalmTimer = 0;
                    } else if (data.policeState === 'chase') {
                        if (!hasStarted || playerSpeedMps <= POLICE_SPEED_LIMIT_MPS) {
                            data.chaseCalmTimer += dt;
                        } else {
                            data.chaseCalmTimer = Math.max(0, data.chaseCalmTimer - dt * 0.5);
                        }
                        if (data.chaseCalmTimer > 12.0 || Math.abs(playerDeltaMeters) > 750) {
                            data.policeState = 'patrol';
                            data.chaseCalmTimer = 0;
                            data.lane = getNearestValidLane(data.lateralPos);
                            data.targetSpeed = Math.max(getLaneSpeedMps(data.lane), 72 * TRAFFIC_KMH_TO_MPS);
                        }
                    }

                    if (data.policeState === 'chase') {
                        const desiredTailDist = POLICE_TAIL_GAP_METERS + (data.halfLength || 2.15) + playerHalfLen;
                        const gapError = playerDeltaMeters - desiredTailDist;
                        if (gapError >= 0) {
                            const catchupBoost = THREE.MathUtils.clamp(gapError * 1.15, 0, 28);
                            data.targetSpeed = THREE.MathUtils.clamp(
                                playerSpeedMps + catchupBoost,
                                10,
                                POLICE_MAX_CHASE_SPEED_MPS
                            );
                        } else {
                            const brakeBack = THREE.MathUtils.clamp(gapError * 1.4, -18, 0);
                            data.targetSpeed = THREE.MathUtils.clamp(
                                playerSpeedMps + brakeBack,
                                8,
                                POLICE_MAX_CHASE_SPEED_MPS
                            );
                        }
                    }
                }

                const isChasingPolice = data.isPolice && data.policeState === 'chase';
                const maxNpcSpeed = isChasingPolice ? 65 : 42;

                // Pindah lajur otonom & pelacakan jalur langsung untuk polisi mengejar
                if (data.controlLossTimer <= 0) {
                    if (isChasingPolice) {
                        const blockedAhead = closestAheadDist < 34 &&
                            (closestAheadSpeed < data.targetSpeed - 0.5 || closestAheadDist < 22);
                        if (blockedAhead) {
                            if (data.laneChangeCooldown <= 0) {
                                const sortedLanes = VALID_LANES.slice().sort((a, b) =>
                                    Math.abs(a - playerRoadLateral) - Math.abs(b - playerRoadLateral)
                                );
                                for (let c = 0; c < sortedLanes.length; c++) {
                                    const candLane = sortedLanes[c];
                                    if (Math.abs(candLane - data.lateralPos) < 1.8) continue;
                                    if (isTargetLaneClearForNpc(k, data, candLane, true)) {
                                        data.lane = candLane;
                                        data.laneChangeCooldown = 0.45;
                                        break;
                                    }
                                }
                            }
                        } else if (data.laneChangeCooldown <= 0 || Math.abs(data.lane - data.lateralPos) < 0.8) {
                            // Langsung buntuti garis lateral pemain
                            data.lane = THREE.MathUtils.clamp(playerRoadLateral, -6.2, 6.2);
                        }
                    } else if (
                        data.laneChangeCooldown <= 0 &&
                        Math.abs(data.lane - data.lateralPos) < 0.65 &&
                        closestAheadDist < 30 &&
                        (closestAheadSpeed < data.targetSpeed - 0.45 || closestAheadDist < 20)
                    ) {
                        const candidates = data.lane === LANE_LEFT
                            ? [LANE_MIDDLE]
                            : data.lane === LANE_MIDDLE
                                ? [LANE_RIGHT, LANE_LEFT]
                                : [LANE_MIDDLE];

                        for (let c = 0; c < candidates.length; c++) {
                            const candLane = candidates[c];
                            if (isTargetLaneClearForNpc(k, data, candLane, false)) {
                                data.lane = candLane;
                                data.targetSpeed = getLaneSpeedMps(candLane);
                                data.laneChangeCooldown = 3.2 + Math.random() * 2.5;
                                break;
                            }
                        }
                    }
                }

                // Pengaturan kecepatan (akselerasi normal / pengereman jika terhalang di depan)
                let desiredSpeed = data.targetSpeed;
                if (closestAheadDist < (isChasingPolice ? 24 : 32)) {
                    if (closestAheadDist < (isChasingPolice ? 12 : 17)) {
                        desiredSpeed = Math.min(desiredSpeed, closestAheadSpeed * 0.78);
                    } else {
                        desiredSpeed = Math.min(desiredSpeed, closestAheadSpeed * 0.96);
                    }
                }

                // Model fisika ban NPC: saat terdorong / hilang traksi vs berkendara normal
                const yaw = data.yawOffset;
                const cosYaw = Math.cos(yaw);
                const sinYaw = Math.sin(yaw);
                const bodyLongVel = data.speed * cosYaw - data.lateralVelocity * sinYaw;
                const bodyLatSlip = data.speed * sinYaw + data.lateralVelocity * cosYaw;

                const isSliding = data.controlLossTimer > 0 || Math.abs(bodyLatSlip) > 1.85 || Math.abs(yaw) > 0.18;
                if (isSliding) {
                    // Gesekan ban lateral nyata (tanpa snap balik mendadak)
                    const gripFactor = THREE.MathUtils.clamp(1 - data.controlLossTimer * 0.55, 0.35, 0.95);
                    const maxLatAccel = 9.2 * gripFactor;
                    const tireLatAccel = THREE.MathUtils.clamp(-bodyLatSlip * 5.0 * gripFactor, -maxLatAccel, maxLatAccel);
                    const tireLongAccel = -Math.sign(bodyLongVel) * 1.35;

                    const accelFwd = tireLongAccel * cosYaw + tireLatAccel * sinYaw;
                    const accelLat = -tireLongAccel * sinYaw + tireLatAccel * cosYaw;

                    data.speed = THREE.MathUtils.clamp(data.speed + accelFwd * dt, 4, maxNpcSpeed);
                    data.lateralVelocity = THREE.MathUtils.clamp(data.lateralVelocity + accelLat * dt, -14, 14);

                    // Torsi pelurus alami ban depan + peredam yaw
                    const yawAccel = (-11 * gripFactor * data.yawOffset) - (4.2 + 2.4 * gripFactor) * data.yawVelocity;
                    data.yawVelocity += yawAccel * dt;
                    data.yawOffset = THREE.MathUtils.clamp(data.yawOffset + data.yawVelocity * dt, -1.25, 1.25);

                    const rollTarget = THREE.MathUtils.clamp(-tireLatAccel * 0.014, -0.22, 0.22);
                    const rollAccel = 28 * (rollTarget - data.rollOffset) - 7.5 * data.rollVelocity;
                    data.rollVelocity += rollAccel * dt;
                    data.rollOffset = THREE.MathUtils.clamp(data.rollOffset + data.rollVelocity * dt, -0.24, 0.24);
                } else {
                    if (!isChasingPolice && (prevControlLoss || Math.abs(data.lane - data.lateralPos) > 2.4)) {
                        const nearestLane = getNearestValidLane(data.lateralPos);
                        if (nearestLane !== data.lane) {
                            data.lane = nearestLane;
                            data.targetSpeed = getLaneSpeedMps(nearestLane);
                        }
                    }

                    const speedDiff = desiredSpeed - data.speed;
                    const accelLimit = speedDiff < 0
                        ? (isChasingPolice ? 22.0 : 10.5)
                        : (data.pushedTimer > 0 ? 2.2 : (isChasingPolice ? 20.0 : 3.4));
                    const responseGain = isChasingPolice ? 4.5 : 2.5;
                    data.speed += THREE.MathUtils.clamp(speedDiff * responseGain, -accelLimit, accelLimit) * dt;
                    data.speed = THREE.MathUtils.clamp(data.speed, 4, maxNpcSpeed);

                    // Kemudi halus menuju target lajur / jalur pemain
                    const lateralError = data.lane - data.lateralPos;
                    const maxLatSteer = isChasingPolice ? 5.6 : 2.6;
                    const desiredLatVel = THREE.MathUtils.clamp(lateralError * (isChasingPolice ? 3.1 : 1.4), -maxLatSteer, maxLatSteer);
                    data.lateralVelocity = THREE.MathUtils.damp(data.lateralVelocity, desiredLatVel, isChasingPolice ? 9.0 : 5.5, dt);

                    const steerYawTarget = -Math.atan2(data.lateralVelocity, Math.max(8, data.speed));
                    const yawAccel = 22 * (steerYawTarget - data.yawOffset) - 7.5 * data.yawVelocity;
                    data.yawVelocity += yawAccel * dt;
                    data.yawOffset = THREE.MathUtils.clamp(data.yawOffset + data.yawVelocity * dt, -0.45, 0.45);

                    const rollTarget = THREE.MathUtils.clamp(-data.lateralVelocity * 0.025, -0.1, 0.1);
                    const rollAccel = 30 * (rollTarget - data.rollOffset) - 8.5 * data.rollVelocity;
                    data.rollVelocity += rollAccel * dt;
                    data.rollOffset = THREE.MathUtils.clamp(data.rollOffset + data.rollVelocity * dt, -0.22, 0.22);
                }

                // Integrasi posisi & batas pembatas jalan
                data.lateralPos += data.lateralVelocity * dt;
                if (Math.abs(data.lateralPos) > 6.75) {
                    data.lateralPos = Math.sign(data.lateralPos) * 6.75;
                    if (Math.sign(data.lateralVelocity) === Math.sign(data.lateralPos)) {
                        data.lateralVelocity *= -0.15;
                    }
                }
                data.progress = (data.progress + data.speed * dt / trackLength + 1) % 1;

                // Hitung intensitas selip ban untuk emisi skidmark NPC
                const decelRate = dt > 0 ? Math.max(0, (prevSpeed - data.speed) / dt) : 0;
                const latSkid = Math.max(0, (Math.abs(bodyLatSlip) - 1.55) / 4.2);
                const yawSkid = Math.max(0, (Math.abs(data.yawOffset) - 0.14) / 0.36);
                const brakeSkid = prevSpeed > 6 ? Math.max(0, (decelRate - 5.2) / 5.5) : 0;
                data.skidIntensity = THREE.MathUtils.clamp(Math.max(latSkid, yawSkid, brakeSkid), 0, 1);
            }

            resolveNpcToNpcCollisions(totalCars);

            const strobeCycle = (policeFlashClock * 9.0) % 4;
            const leftFlashOn = strobeCycle < 0.7 || (strobeCycle >= 1.0 && strobeCycle < 1.7);
            const rightFlashOn = (strobeCycle >= 2.0 && strobeCycle < 2.7) || (strobeCycle >= 3.0 && strobeCycle < 3.7);
            const chasingUnits = [];

            for (let i = 0; i < totalCars; i++) {
                const npc = trafficCars[i];
                const data = npc.userData;
                placeOnTrack(npc, data.progress, data.lateralPos);
                const baseYaw = npc.rotation.y;
                const fwdX = -Math.sin(baseYaw);
                const fwdZ = -Math.cos(baseYaw);
                const rightX = Math.cos(baseYaw);
                const rightZ = -Math.sin(baseYaw);
                data.worldVelX = fwdX * data.speed + rightX * data.lateralVelocity;
                data.worldVelZ = fwdZ * data.speed + rightZ * data.lateralVelocity;
                npc.rotation.y = baseYaw + data.yawOffset;
                npc.rotation.z = data.rollOffset;

                if (data.isPolice && data.policeVisuals) {
                    const visuals = data.policeVisuals;
                    if (data.policeState === 'chase') {
                        visuals.leftBeaconMat.color.setHex(leftFlashOn ? 0x4cc3ff : 0x0b2554);
                        visuals.rightBeaconMat.color.setHex(rightFlashOn ? 0x4cc3ff : 0x0b2554);
                        visuals.beaconGlow.visible = leftFlashOn || rightFlashOn;
                        visuals.glowMat.opacity = (leftFlashOn || rightFlashOn) ? 0.52 : 0.08;

                        const dx = npc.position.x - playerX;
                        const dz = npc.position.z - playerZ;
                        const distSq = dx * dx + dz * dz;
                        const elevDiff = Math.abs(npc.position.y - playerY);
                        chasingUnits.push({ npc, distSq, halfLength: data.halfLength || 2.15, elevDiff });
                    } else {
                        visuals.leftBeaconMat.color.setHex(0x0b2554);
                        visuals.rightBeaconMat.color.setHex(0x0b2554);
                        visuals.beaconGlow.visible = false;
                        visuals.glowMat.opacity = 0;
                    }
                }
            }

            ensurePolicePointLights();
            if (chasingUnits.length > 0) {
                chasingUnits.sort((a, b) => a.distSq - b.distSq);
                const closestUnit = chasingUnits[0];
                const nearestDist = Math.sqrt(closestUnit.distSq);
                const linearAtten = 1 - THREE.MathUtils.clamp((nearestDist - 12) / 220, 0, 1);
                activePoliceSirenIntensity = linearAtten * linearAtten;

                const nearestBumperGap = Math.max(0, nearestDist - (closestUnit.halfLength + playerHalfLen));
                if (
                    hasStarted &&
                    !isGameOver &&
                    closestUnit.elevDiff < 4.5 &&
                    nearestBumperGap <= POLICE_VOICE_DISTANCE_METERS &&
                    policeVoiceCooldownTimer <= 0
                ) {
                    playPolicePullOverVoice();
                    policeVoiceCooldownTimer = 8.5;
                }

                const anyFlashOn = leftFlashOn || rightFlashOn;
                for (let l = 0; l < policePointLights.length; l++) {
                    const light = policePointLights[l];
                    if (l < chasingUnits.length && chasingUnits[l].distSq < 240 * 240) {
                        const targetNpc = chasingUnits[l].npc;
                        light.position.set(targetNpc.position.x, targetNpc.position.y + 2.0, targetNpc.position.z);
                        light.intensity = anyFlashOn ? 8.0 : 1.4;
                    } else {
                        light.intensity = 0;
                        light.position.set(0, -100, 0);
                    }
                }
            } else {
                resetPoliceLightPool();
            }
        }
