        const TRAFFIC_KMH_TO_MPS = 1 / 3.6;
        const LANE_LEFT = -4.8;   // Lajur paling kiri: pelan (60-80 km/h)
        const LANE_MIDDLE = 0;    // Lajur tengah: sedang (80-100 km/h)
        const LANE_RIGHT = 4.8;   // Lajur paling kanan: cepat (100-120 km/h)
        const VALID_LANES = [LANE_LEFT, LANE_MIDDLE, LANE_RIGHT];
        const POLICE_SPEED_LIMIT_MPS = 120 * TRAFFIC_KMH_TO_MPS;
        const POLICE_MAX_CHASE_SPEED_MPS = 222 * TRAFFIC_KMH_TO_MPS;
        const POLICE_VISION_RANGE = 145;
        const POLICE_VISION_COS_HALF_ANGLE = 0.65;
        const POLICE_TAIL_GAP_METERS = 3.0;
        const POLICE_ESCALATION_SECONDS = 600;
        const POLICE_MAX_UNITS = 3;
        const POLICE_INTERCEPTOR_TORQUE_MULT = 1.88;
        const POLICE_INTERCEPTOR_GRIP_MULT = 1.52;
        const POLICE_INTERCEPTOR_BRAKE_MULT = 1.45;
        const POLICE_PIN_SPEED_MPS = 1.6;
        const POLICE_STOPPED_SPEED_MPS = 2.6;
        const POLICE_ESCAPE_SPEED_MPS = 3.2;
        const POLICE_PIN_MAX_BUMPER_GAP = 3.2;
        const POLICE_BUSTED_COUNTDOWN_SECONDS = 5.0;
        const NPC_WALL_INNER_LIMIT = 7.81;
        const POLICE_UNIT_COUNT = 1;
        const MAX_POLICE_POINT_LIGHTS = 2;

        const trafficSharedMaterials = {
            tire: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.85 }),
            rim: new THREE.MeshStandardMaterial({ color: 0xc2c8d1, roughness: 0.35, metalness: 0.75 }),
            glass: new THREE.MeshStandardMaterial({ color: 0x182330, roughness: 0.15, metalness: 0.7 }),
            bumper: new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.75 }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xfff3d1 }),
            taillight: new THREE.MeshBasicMaterial({ color: 0xd61c14 }),
            truckBox: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.6 }),
            policeStripe: new THREE.MeshStandardMaterial({ color: 0x0d2b5c, roughness: 0.35, metalness: 0.45 }),
            policeBarBase: new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.4, metalness: 0.6 })
        };

        const npcHeadGlowMat = new THREE.MeshBasicMaterial({
            color: 0xfff8e2,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const npcTailGlowMat = new THREE.MeshBasicMaterial({
            color: 0xff1c12,
            transparent: true,
            opacity: 0.36,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const npcTailBrakeGlowMat = new THREE.MeshBasicMaterial({
            color: 0xff2b1c,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

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
        let npcHornGlobalCooldown = 0;
        let policeWallPushSide = 1;

        function getActivePoliceSirenIntensity() {
            return activePoliceSirenIntensity;
        }

        function wrapAngleRad(angle) {
            let a = angle;
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            return a;
        }

        function getTrackWorldPointAt(progress, lateral = 0) {
            const t = ((progress % 1) + 1) % 1;
            if (roadSegments.length === trackResolution) {
                const exactIndex = t * trackResolution;
                const index = Math.floor(exactIndex) % trackResolution;
                const frac = exactIndex - Math.floor(exactIndex);
                const seg = roadSegments[index];
                const px = seg.start.x + (seg.end.x - seg.start.x) * frac;
                const py = seg.start.y + (seg.end.y - seg.start.y) * frac;
                const pz = seg.start.z + (seg.end.z - seg.start.z) * frac;
                const dx = seg.end.x - seg.start.x;
                const dz = seg.end.z - seg.start.z;
                const len = Math.hypot(dx, dz) || 1;
                const tx = dx / len;
                const tz = dz / len;
                return {
                    x: px - tz * lateral,
                    y: py,
                    z: pz + tx * lateral,
                    fwdX: tx,
                    fwdZ: tz,
                    rightX: -tz,
                    rightZ: tx,
                    yaw: Math.atan2(-tx, -tz)
                };
            }
            const point = trackCurve.getPointAt(t);
            const tangent = trackCurve.getTangentAt(t);
            return {
                x: point.x - tangent.z * lateral,
                y: point.y,
                z: point.z + tangent.x * lateral,
                fwdX: tangent.x,
                fwdZ: tangent.z,
                rightX: -tangent.z,
                rightZ: tangent.x,
                yaw: Math.atan2(-tangent.x, -tangent.z)
            };
        }

        function getTrackSegmentMetrics(progress) {
            const total = roadSegments.length;
            if (!total) return { slopeSin: 0, curvature: 0 };
            const t = ((progress % 1) + 1) % 1;
            const idx = Math.floor(t * total) % total;
            const nextIdx = (idx + 5) % total;
            const seg = roadSegments[idx];
            const nextSeg = roadSegments[nextIdx];
            const dx = seg.end.x - seg.start.x;
            const dy = seg.end.y - seg.start.y;
            const dz = seg.end.z - seg.start.z;
            const segLen = Math.hypot(dx, dy, dz) || 1;
            const horizLen = Math.hypot(dx, dz) || 1;
            const yaw0 = Math.atan2(-dx, -dz);
            const ndx = nextSeg.end.x - nextSeg.start.x;
            const ndz = nextSeg.end.z - nextSeg.start.z;
            const yaw1 = Math.atan2(-ndx, -ndz);
            const deltaS = Math.max(1, horizLen * 5);
            return {
                slopeSin: dy / segLen,
                curvature: wrapAngleRad(yaw1 - yaw0) / deltaS
            };
        }

        function updateNpcWheelAndSuspensionVisuals(npc, data, dt, isNearPlayer, wheelAngularSpeeds) {
            if (!isNearPlayer || !data.wheelPivots || !data.bodyVisual || dt <= 0) return;

            if (data.freeBodyActive) {
                const pivots = data.wheelPivots;
                const droop = data.fbGrounded ? 0 : -0.08;
                const spinRate = data.fbGrounded ? (data.speed || 0) / (data.wheelRadius || 0.32) : (data.speed || 0) * 0.45 / (data.wheelRadius || 0.32);
                for (let idx = 0; idx < pivots.length; idx++) {
                    const wp = pivots[idx];
                    const u = wp.userData;
                    u.suspensionTravel = THREE.MathUtils.damp(u.suspensionTravel, droop, 10, dt);
                    wp.position.y = u.basePositionY + u.suspensionTravel * 0.45;
                    if (u.axle === 'front') {
                        u.steeringPivot.rotation.y = THREE.MathUtils.damp(u.steeringPivot.rotation.y, 0, 6, dt);
                    }
                    u.spinAngle -= spinRate * dt;
                    u.spinPivot.rotation.x = u.spinAngle;
                }
                data.bodyVisual.position.y = 0;
                data.bodyVisual.rotation.x = 0;
                data.bodyVisual.rotation.z = 0;
                return;
            }

            const vPhys = data.variantPhysics;
            const wb = data.wheelbase || 2.6;
            const trackW = data.trackWidth || 1.6;
            const steerAngle = data.steeringAngleVisual || 0;
            const transfer = vPhys.mass * (data.longitudinalAcceleration || 0) * vPhys.cgHeight / wb;
            const latTransfer = vPhys.mass * (data.lateralAcceleration || 0) * vPhys.cgHeight / trackW;

            let frontTravel = 0;
            let rearTravel = 0;
            let totalTravel = 0;
            const pivots = data.wheelPivots;
            const springFreq = 12;
            const springDamp = 2 * 0.85 * springFreq;

            for (let idx = 0; idx < pivots.length; idx++) {
                const wp = pivots[idx];
                const u = wp.userData;
                const isFront = u.axle === 'front';
                const springRatePerTire = (isFront ? vPhys.frontSpringRate : vPhys.rearSpringRate) * 0.5;
                const longTravel = (isFront ? -transfer : transfer) / springRatePerTire;
                const latTravel = -Math.sign(u.x) * latTransfer / springRatePerTire;
                const targetTravel = THREE.MathUtils.clamp(longTravel + latTravel, -0.11, 0.11);

                const travelAccel = springFreq * springFreq * (targetTravel - u.suspensionTravel) -
                    springDamp * u.suspensionVelocity;
                u.suspensionVelocity += travelAccel * dt;
                u.suspensionTravel = THREE.MathUtils.clamp(u.suspensionTravel + u.suspensionVelocity * dt, -0.11, 0.11);
                wp.position.y = u.basePositionY + u.suspensionTravel * 0.35;

                if (isFront) {
                    frontTravel += u.suspensionTravel;
                    let wheelSteer = steerAngle;
                    if (Math.abs(steerAngle) > 1e-4) {
                        const isInner = u.x * steerAngle < 0;
                        if (!isInner) {
                            const cotInner = 1 / Math.tan(Math.abs(steerAngle));
                            const ackDelta = (trackW / wb) * 0.65;
                            wheelSteer = Math.sign(steerAngle) * Math.atan(1 / (cotInner + ackDelta));
                        }
                    }
                    u.steeringPivot.rotation.y = wheelSteer;
                } else {
                    rearTravel += u.suspensionTravel;
                }
                totalTravel += u.suspensionTravel;

                const spinRate = wheelAngularSpeeds && wheelAngularSpeeds[idx] !== undefined
                    ? wheelAngularSpeeds[idx]
                    : (data.speed / (data.wheelRadius || 0.32));
                u.spinAngle -= spinRate * dt;
                u.spinPivot.rotation.x = u.spinAngle;
            }

            const pitchTarget = THREE.MathUtils.clamp(
                ((rearTravel * 0.5) - (frontTravel * 0.5)) / wb * 0.72,
                -vPhys.maxPitch,
                vPhys.maxPitch
            );
            const pitchFreq = 7.5;
            const pitchAccel = pitchFreq * pitchFreq * (pitchTarget - (data.pitchOffset || 0)) -
                2 * pitchFreq * (data.pitchVelocity || 0);
            data.pitchVelocity = (data.pitchVelocity || 0) + pitchAccel * dt;
            data.pitchOffset = THREE.MathUtils.clamp((data.pitchOffset || 0) + data.pitchVelocity * dt, -vPhys.maxPitch, vPhys.maxPitch);

            const avgTravel = totalTravel / Math.max(1, pivots.length);
            data.bodyVisual.position.y = -(avgTravel * 0.35);
            data.bodyVisual.rotation.x = data.pitchOffset;
            data.bodyVisual.rotation.z = data.rollOffset || 0;
        }

        const _fbComOffsetVec = new THREE.Vector3();

        function computeProjectedHalfHeight(halfW, halfH, halfL, pitch, roll) {
            const cosP = Math.cos(pitch);
            const sinP = Math.sin(pitch);
            const cosR = Math.cos(roll);
            const sinR = Math.sin(roll);
            return halfW * Math.abs(cosP * sinR) * 0.78 + halfH * Math.abs(cosP * cosR) + halfL * Math.abs(sinP) * 0.76;
        }

        function syncNpcMeshFromFreeBody(npc, data) {
            npc.rotation.order = 'YXZ';
            npc.rotation.set(data.fbPitch, data.fbYaw, data.fbRoll);
            _fbComOffsetVec.set(0, data.localComY || 0.7, 0).applyEuler(npc.rotation);
            npc.position.set(
                data.fbX - _fbComOffsetVec.x,
                data.fbY - _fbComOffsetVec.y,
                data.fbZ - _fbComOffsetVec.z
            );
        }

        function enterNpcFreeBodyMode(npc) {
            const data = npc.userData;
            if (!data || data.freeBodyActive) return;
            const localComY = data.localComY || 0.7;

            if (data.isPolice && data.policeState === 'chase' && data.policePhysics && data.policePhysics.initialized) {
                const pp = data.policePhysics;
                data.fbX = pp.x;
                data.fbY = pp.y + localComY;
                data.fbZ = pp.z;
                data.fbVx = pp.vx;
                data.fbVy = 0;
                data.fbVz = pp.vz;
                data.fbYaw = pp.yaw;
                data.fbPitch = 0;
                data.fbRoll = pp.bodyRoll || 0;
                data.fbYawVel = pp.yawRate || 0;
                data.fbPitchVel = 0;
                data.fbRollVel = pp.bodyRollVelocity || 0;
                data.fbHintSegIdx = pp.roadSegmentIndex >= 0 ? pp.roadSegmentIndex : -1;
            } else {
                const roadPt = getTrackWorldPointAt(data.progress, data.lateralPos);
                data.fbX = roadPt.x;
                data.fbY = roadPt.y + localComY;
                data.fbZ = roadPt.z;
                data.fbVx = roadPt.fwdX * (data.speed || 0) + roadPt.rightX * (data.lateralVelocity || 0);
                data.fbVy = 0;
                data.fbVz = roadPt.fwdZ * (data.speed || 0) + roadPt.rightZ * (data.lateralVelocity || 0);
                data.fbYaw = wrapAngleRad(roadPt.yaw + (data.yawOffset || 0));
                data.fbPitch = data.pitchOffset || 0;
                data.fbRoll = data.rollOffset || 0;
                data.fbYawVel = data.yawVelocity || 0;
                data.fbPitchVel = data.pitchVelocity || 0;
                data.fbRollVel = data.rollVelocity || 0;
                data.fbHintSegIdx = -1;
            }

            data.freeBodyActive = true;
            data.recoveringUpright = false;
            data.fbOffTrack = false;
            data.fbRestTimer = 0;
            data.fbLaunchCooldown = 0;
            data.fbGrounded = true;
            syncNpcMeshFromFreeBody(npc, data);
        }

        function stepNpcFreeBodyPhysics(npc, data, dt) {
            if (dt <= 0) return;

            // Gravitasi berat & cepat: hentakan naik singkat lalu ditarik jatuh keras ke aspal
            const effectiveGravity = gravity * (data.fbVy > 0 ? 2.25 : 3.25);
            data.fbVy -= effectiveGravity * dt;
            const airDamp = Math.exp(-0.12 * dt);
            data.fbVx *= airDamp;
            data.fbVz *= airDamp;

            data.fbX += data.fbVx * dt;
            data.fbY += data.fbVy * dt;
            data.fbZ += data.fbVz * dt;

            const angAirDamp = data.fbGrounded ? 1.0 : Math.exp(-0.28 * dt);
            data.fbYawVel *= angAirDamp;
            data.fbPitchVel *= angAirDamp;
            data.fbRollVel *= angAirDamp;

            data.fbYaw = wrapAngleRad(data.fbYaw + data.fbYawVel * dt);
            data.fbPitch = wrapAngleRad(data.fbPitch + data.fbPitchVel * dt);
            data.fbRoll = wrapAngleRad(data.fbRoll + data.fbRollVel * dt);

            const roadContact = findNearestRoadPoint(data.fbX, data.fbY, data.fbZ, data.fbHintSegIdx);
            if (roadContact) {
                data.fbHintSegIdx = roadContact.segmentIndex;
                data.progress = roadContact.progress;
            }

            const halfW = data.halfWidth || 0.9;
            const halfH = data.halfHeight || 0.7;
            const halfL = data.halfLength || 2.1;
            let projHalfH = computeProjectedHalfHeight(halfW, halfH, halfL, data.fbPitch, data.fbRoll);

            let roadRightX = 1;
            let roadRightZ = 0;
            let roadFwdX = 0;
            let roadFwdZ = -1;
            let signedLat = data.lateralPos || 0;

            if (roadContact) {
                roadFwdX = roadContact.tangentX;
                roadFwdZ = roadContact.tangentZ;
                roadRightX = -roadContact.tangentZ;
                roadRightZ = roadContact.tangentX;
                signedLat = (data.fbX - roadContact.x) * roadRightX + (data.fbZ - roadContact.z) * roadRightZ;

                // Interaksi dinding beton pembatas tol: memantul, atau terpental melewati pembatas jika benturan keras / cukup tinggi
                if (!data.fbOffTrack && Math.abs(signedLat) < 9.4) {
                    const fwdX = -Math.sin(data.fbYaw);
                    const fwdZ = -Math.cos(data.fbYaw);
                    const rightX = Math.cos(data.fbYaw);
                    const rightZ = -Math.sin(data.fbYaw);
                    const sideSign = signedLat >= 0 ? 1 : -1;
                    const normalX = roadRightX * sideSign;
                    const normalZ = roadRightZ * sideSign;
                    const latExtent = halfL * Math.abs(fwdX * normalX + fwdZ * normalZ) +
                        halfW * Math.abs(rightX * normalX + rightZ * normalZ);
                    const maxCenterDist = NPC_WALL_INNER_LIMIT - latExtent;

                    if (Math.abs(signedLat) > maxCenterDist) {
                        const outwardSpeed = data.fbVx * normalX + data.fbVz * normalZ;
                        const lowestY = data.fbY - projHalfH;
                        const clearsBarrierTop = lowestY >= roadContact.y + 0.78;
                        const severeVault = outwardSpeed > 18.0 || (outwardSpeed > 13.0 && data.fbY > roadContact.y + 0.98);

                        if (clearsBarrierTop || severeVault) {
                            if (!clearsBarrierTop && outwardSpeed > 0) {
                                data.fbVy = Math.max(data.fbVy, 3.2 + Math.min(8.5, (outwardSpeed - 12.0) * 0.52));
                                data.fbVx -= outwardSpeed * normalX * 0.22;
                                data.fbVz -= outwardSpeed * normalZ * 0.22;
                                data.fbRollVel += sideSign * (3.2 + Math.random() * 2.2);
                                data.fbYawVel += sideSign * 1.35;
                            }
                            data.fbOffTrack = true;
                        } else {
                            const excess = Math.abs(signedLat) - maxCenterDist;
                            data.fbX -= normalX * excess;
                            data.fbZ -= normalZ * excess;
                            signedLat = sideSign * maxCenterDist;

                            if (outwardSpeed > 0) {
                                const bounceRestitution = 0.40;
                                data.fbVx -= outwardSpeed * normalX * (1 + bounceRestitution);
                                data.fbVz -= outwardSpeed * normalZ * (1 + bounceRestitution);
                                if (outwardSpeed > 4.8) {
                                    data.fbVy = Math.max(data.fbVy, Math.min(3.6, outwardSpeed * 0.18));
                                }
                                const wallScrape = Math.max(0.86, 1 - 1.6 * dt);
                                data.fbVx *= wallScrape;
                                data.fbVz *= wallScrape;
                                data.fbYawVel += sideSign * Math.min(3.0, outwardSpeed * 0.18);
                                data.fbRollVel += -sideSign * Math.min(3.2, outwardSpeed * 0.22);
                            }
                        }
                    }
                } else if (Math.abs(signedLat) >= 9.4) {
                    data.fbOffTrack = true;
                }
            }

            let surfaceY = 0;
            if (roadContact && !data.fbOffTrack && Math.abs(signedLat) <= 8.85 && (data.fbY - projHalfH) >= roadContact.y - 1.4) {
                surfaceY = Math.abs(signedLat) > 7.85 ? roadContact.y + 1.18 : roadContact.y;
            }

            const minComY = surfaceY + projHalfH;
            if (data.fbY <= minComY) {
                data.fbY = minComY;
                if (data.fbVy < -3.6) {
                    const impactDown = -data.fbVy;
                    data.fbVy = Math.min(3.2, impactDown * 0.16);
                    data.fbGrounded = false;
                    data.fbRollVel *= 0.68;
                    data.fbPitchVel *= 0.68;
                    data.fbYawVel *= 0.82;
                    data.fbVx *= 0.94;
                    data.fbVz *= 0.94;
                    data.skidIntensity = 1.0;
                    if (impactDown > 5.4 && data.hitCooldown <= 0 && typeof playCrashSound === 'function') {
                        const dxp = data.fbX - playerX;
                        const dzp = data.fbZ - playerZ;
                        if ((dxp * dxp + dzp * dzp) < 8100) {
                            playCrashSound();
                            data.hitCooldown = 0.25;
                        }
                    }
                } else {
                    data.fbVy = 0;
                    data.fbGrounded = true;
                }
            } else {
                data.fbGrounded = false;
            }

            const uprightDot = Math.cos(data.fbPitch) * Math.cos(data.fbRoll);
            let horizSpeed = Math.hypot(data.fbVx, data.fbVz);

            if (data.fbGrounded) {
                if (uprightDot < 0.72) {
                    // Gesekan atap/sisi bodi di aspal saat terbalik atau miring (seretan berat)
                    if (horizSpeed > 0.001) {
                        const decel = Math.min(horizSpeed, 9.5 * dt);
                        const scale = (horizSpeed - decel) / horizSpeed;
                        data.fbVx *= scale;
                        data.fbVz *= scale;
                    }
                    const scrapeRotDamp = Math.exp(-5.6 * dt);
                    data.fbYawVel *= scrapeRotDamp;
                    data.fbPitchVel *= scrapeRotDamp;
                    data.fbRollVel *= scrapeRotDamp;

                    // Rebah cepat rata ke posisi terbalik/miring terdekat agar tidak menyeimbang aneh di sudut
                    const targetFlipRoll = Math.abs(data.fbRoll) > Math.PI * 0.65
                        ? Math.sign(data.fbRoll || 1) * Math.PI
                        : Math.sign(data.fbRoll || 1) * (Math.PI * 0.5);
                    if (!data.recoveringUpright) {
                        data.fbPitch = wrapAngleRad(data.fbPitch * Math.exp(-5.2 * dt));
                        data.fbRoll = wrapAngleRad(data.fbRoll + wrapAngleRad(targetFlipRoll - data.fbRoll) * Math.min(1, 6.8 * dt));
                    }
                    data.skidIntensity = horizSpeed > 1.5 ? THREE.MathUtils.clamp(horizSpeed / 10, 0.2, 1) : 0;
                } else {
                    // Ban tetap menapak di aspal: gesekan ban anisotropik (cengkeram samping kuat + rolling/rem memanjang)
                    const carFwdX = -Math.sin(data.fbYaw);
                    const carFwdZ = -Math.cos(data.fbYaw);
                    const carRightX = Math.cos(data.fbYaw);
                    const carRightZ = -Math.sin(data.fbYaw);
                    const vFwd = data.fbVx * carFwdX + data.fbVz * carFwdZ;
                    const vLat = data.fbVx * carRightX + data.fbVz * carRightZ;

                    const gripCoeff = data.controlLossTimer > 0 ? 0.68 : 0.90;
                    const maxLatGripAccel = gripCoeff * gravity;
                    const latReqAccel = -vLat / Math.max(dt, 1e-4);
                    const appliedLatAccel = THREE.MathUtils.clamp(latReqAccel, -maxLatGripAccel, maxLatGripAccel);
                    const nextVLat = vLat + appliedLatAccel * dt;

                    const longBrakeDecel = (data.pushedTimer > 0 || data.controlLossTimer > 0) ? 4.4 : 3.2;
                    let nextVFwd = vFwd;
                    if (Math.abs(vFwd) > 0.01) {
                        const dvLong = Math.min(Math.abs(vFwd), longBrakeDecel * dt);
                        nextVFwd -= Math.sign(vFwd) * dvLong;
                    }

                    data.fbVx = carFwdX * nextVFwd + carRightX * nextVLat;
                    data.fbVz = carFwdZ * nextVFwd + carRightZ * nextVLat;

                    // Hambatan gesek ban aspal terhadap putaran yaw (mencegah mobil berputar bebas tanpa gesekan)
                    const yawArm = halfL * 0.68;
                    const npcMassVal = data.mass || 1500;
                    const npcIYaw = data.inertiaYaw || (npcMassVal * (halfL * halfL * 4 + halfW * halfW * 4) / 12);
                    const maxYawScrubDecel = (gripCoeff * gravity * yawArm * npcMassVal) / Math.max(400, npcIYaw);
                    if (Math.abs(data.fbYawVel) > 0.001) {
                        const dYaw = Math.min(Math.abs(data.fbYawVel), maxYawScrubDecel * dt);
                        data.fbYawVel -= Math.sign(data.fbYawVel) * dYaw;
                    }

                    // Pegas & peredam suspensi bodi (atau lanjut guling jika sudut roll melebihi batas keseimbangan)
                    if (!data.recoveringUpright) {
                        const cgH = data.cgHeight || 0.65;
                        const tipAngle = Math.atan2(halfW * 0.88, Math.max(0.35, cgH));
                        if (Math.abs(data.fbRoll) >= tipAngle) {
                            const tipDir = Math.sign(data.fbRoll || 1);
                            data.fbRollVel += tipDir * 9.5 * dt;
                            data.fbPitch = wrapAngleRad(data.fbPitch * Math.exp(-5.0 * dt));
                        } else {
                            const rollAccel = -42 * data.fbRoll - 7.5 * data.fbRollVel - appliedLatAccel * 0.24;
                            const pitchAccel = -48 * data.fbPitch - 8.2 * data.fbPitchVel;
                            data.fbRollVel += rollAccel * dt;
                            data.fbPitchVel += pitchAccel * dt;
                        }
                    }

                    const wheelR = data.wheelRadius || 0.32;
                    const spinAng = nextVFwd / wheelR;
                    if (data.wheelAngularSpeeds) {
                        for (let w = 0; w < 4; w++) {
                            data.wheelAngularSpeeds[w] = spinAng;
                        }
                    }
                    data.skidIntensity = (Math.abs(vLat) > 2.2 || Math.abs(data.fbYawVel) > 0.85)
                        ? THREE.MathUtils.clamp((Math.abs(vLat) + Math.abs(data.fbYawVel) * 1.5) / 10, 0.2, 1.0)
                        : 0;
                }
            } else {
                data.skidIntensity = 0;
            }

            horizSpeed = Math.hypot(data.fbVx, data.fbVz);
            const angSpeed = Math.abs(data.fbYawVel) + Math.abs(data.fbPitchVel) + Math.abs(data.fbRollVel);
            const noExternalForce = data.hitCooldown <= 0 && data.pushedTimer <= 0 && data.fbGrounded && Math.abs(data.fbVy) < 0.7;
            const settledEnough = noExternalForce && (
                (uprightDot >= 0.88 && angSpeed < 1.2 && horizSpeed < 16) ||
                (horizSpeed < 2.4 && angSpeed < 0.75)
            );

            const restNeeded = (data.isPolice && data.policeState === 'chase') ? 0.45 : 0.85;
            if (data.pushedTimer > 0) {
                data.recoveringUpright = false;
                data.fbRestTimer = 0;
            } else if (!data.recoveringUpright) {
                if (settledEnough) {
                    data.fbRestTimer += dt;
                    if (data.fbRestTimer >= restNeeded) {
                        data.recoveringUpright = true;
                    }
                } else {
                    data.fbRestTimer = Math.max(0, data.fbRestTimer - dt * 1.4);
                }
            }

            if (data.recoveringUpright) {
                const dampVel = Math.exp(-4.5 * dt);
                data.fbVx *= dampVel;
                data.fbVz *= dampVel;
                data.fbYawVel *= Math.exp(-6.0 * dt);
                data.fbPitchVel *= Math.exp(-8.0 * dt);
                data.fbRollVel *= Math.exp(-8.0 * dt);

                // Tegak bertahap kembali ke posisi normal roda di bawah
                data.fbPitch = wrapAngleRad(data.fbPitch * Math.exp(-4.6 * dt));
                data.fbRoll = wrapAngleRad(data.fbRoll * Math.exp(-4.6 * dt));

                if (data.fbOffTrack && roadContact) {
                    const reentrySide = signedLat >= 0 ? 1 : -1;
                    const reentryLat = reentrySide * 6.25;
                    const reentryPt = getTrackWorldPointAt(roadContact.progress, reentryLat);
                    data.fbX = THREE.MathUtils.damp(data.fbX, reentryPt.x, 3.2, dt);
                    data.fbZ = THREE.MathUtils.damp(data.fbZ, reentryPt.z, 3.2, dt);
                    const clearanceY = Math.abs(signedLat) > 7.4
                        ? reentryPt.y + (data.localComY || halfH) + 1.25
                        : reentryPt.y + (data.localComY || halfH);
                    data.fbY = THREE.MathUtils.damp(data.fbY, clearanceY, 8.0, dt);

                    const updatedLat = (data.fbX - roadContact.x) * roadRightX + (data.fbZ - roadContact.z) * roadRightZ;
                    if (Math.abs(updatedLat) <= 7.1) {
                        data.fbOffTrack = false;
                        signedLat = updatedLat;
                    }
                } else {
                    projHalfH = computeProjectedHalfHeight(halfW, halfH, halfL, data.fbPitch, data.fbRoll);
                    data.fbY = Math.max(surfaceY + projHalfH, THREE.MathUtils.damp(data.fbY, surfaceY + projHalfH, 14.5, dt));
                }

                if (!data.fbOffTrack && Math.abs(data.fbPitch) < 0.05 && Math.abs(data.fbRoll) < 0.05) {
                    data.fbPitch = 0;
                    data.fbRoll = 0;
                    data.freeBodyActive = false;
                    data.recoveringUpright = false;
                    data.fbRestTimer = 0;
                    data.pitchOffset = 0;
                    data.pitchVelocity = 0;
                    data.rollOffset = 0;
                    data.rollVelocity = 0;
                    data.controlLossTimer = 0;
                    data.pushedTimer = 0;

                    if (roadContact) {
                        data.progress = roadContact.progress;
                        data.lateralPos = THREE.MathUtils.clamp(signedLat, -getNpcWallLateralLimit(data), getNpcWallLateralLimit(data));
                        const roadYaw = Math.atan2(-roadContact.tangentX, -roadContact.tangentZ);
                        data.yawOffset = wrapAngleRad(data.fbYaw - roadYaw);
                        data.speed = THREE.MathUtils.clamp(data.fbVx * roadFwdX + data.fbVz * roadFwdZ, 0, 42);
                        data.lateralVelocity = data.fbVx * roadRightX + data.fbVz * roadRightZ;
                        data.yawVelocity = 0;
                        placeOnTrack(npc, data.progress, data.lateralPos);
                        npc.rotation.order = 'YXZ';
                        npc.rotation.set(0, roadYaw + data.yawOffset, 0);
                    }
                    if (data.isPolice && data.policeState === 'chase') {
                        syncPolicePhysicsFromNpc(npc);
                    }
                    return;
                }
            }

            if (roadContact) {
                data.lateralPos = signedLat;
                data.speed = data.fbVx * roadFwdX + data.fbVz * roadFwdZ;
                data.lateralVelocity = data.fbVx * roadRightX + data.fbVz * roadRightZ;
                const roadYaw = Math.atan2(-roadContact.tangentX, -roadContact.tangentZ);
                data.yawOffset = wrapAngleRad(data.fbYaw - roadYaw);
            }
            data.worldVelX = data.fbVx;
            data.worldVelZ = data.fbVz;
            data.yawVelocity = data.fbYawVel;
            data.rollOffset = data.fbRoll;
            data.rollVelocity = data.fbRollVel;
            data.isBraking = uprightDot > 0.65 && horizSpeed > 1.5;

            syncNpcMeshFromFreeBody(npc, data);
        }

        function createPoliceCarPhysicsState() {
            const phys = vehiclePhysicsConfigs.car;
            const policeWeightDistFront = 0.52;
            const frontAxleZ = -innovaZenixSpecs.wheelbase * (1 - policeWeightDistFront);
            const rearAxleZ = innovaZenixSpecs.wheelbase * policeWeightDistFront;
            const halfFrontTrack = innovaZenixSpecs.frontTread / 2;
            const halfRearTrack = innovaZenixSpecs.rearTread / 2;
            return {
                initialized: false,
                x: 0,
                y: 0,
                z: 0,
                yaw: 0,
                vx: 0,
                vz: 0,
                yawRate: 0,
                bodyRoll: 0,
                bodyRollVelocity: 0,
                longitudinalAcceleration: 0,
                lateralAcceleration: 0,
                currentGear: 3,
                engineRpm: 2500,
                gearShiftBlendTimer: 0,
                throttleSmoothed: 0,
                brakeSmoothed: 0,
                reverseSmoothed: 0,
                steerCmdSmoothed: 0,
                throttleCmdSmoothed: 0,
                brakeCmdSmoothed: 0,
                steeringInputSmoothed: 0,
                steeringAngle: 0,
                wheelAngularSpeeds: [0, 0, 0, 0],
                tireLayout: [
                    { axle: 'front', x: -halfFrontTrack, z: frontAxleZ, wheelRadius: phys.wheelRadius, skidIntensity: 0 },
                    { axle: 'front', x: halfFrontTrack, z: frontAxleZ, wheelRadius: phys.wheelRadius, skidIntensity: 0 },
                    { axle: 'rear', x: -halfRearTrack, z: rearAxleZ, wheelRadius: phys.wheelRadius, skidIntensity: 0 },
                    { axle: 'rear', x: halfRearTrack, z: rearAxleZ, wheelRadius: phys.wheelRadius, skidIntensity: 0 }
                ],
                roadSegmentIndex: -1,
                roadSlopeSin: 0
            };
        }

        function syncPolicePhysicsFromNpc(npc) {
            const data = npc.userData;
            if (!data.policePhysics) {
                data.policePhysics = createPoliceCarPhysicsState();
            }
            const pp = data.policePhysics;
            const phys = vehiclePhysicsConfigs.car;
            const baseYaw = npc.rotation.y - (data.yawOffset || 0);
            const fwdX = -Math.sin(baseYaw);
            const fwdZ = -Math.cos(baseYaw);
            const rightX = Math.cos(baseYaw);
            const rightZ = -Math.sin(baseYaw);
            const spd = data.speed || 0;
            const latV = data.lateralVelocity || 0;

            pp.x = npc.position.x;
            pp.y = npc.position.y;
            pp.z = npc.position.z;
            pp.yaw = npc.rotation.y;
            pp.vx = fwdX * spd + rightX * latV;
            pp.vz = fwdZ * spd + rightZ * latV;
            pp.yawRate = data.yawVelocity || 0;
            pp.bodyRoll = data.rollOffset || 0;
            pp.bodyRollVelocity = data.rollVelocity || 0;
            pp.longitudinalAcceleration = 0;
            pp.lateralAcceleration = 0;
            pp.throttleSmoothed = 0.35;
            pp.brakeSmoothed = 0;
            pp.reverseSmoothed = 0;
            pp.steerCmdSmoothed = 0;
            pp.throttleCmdSmoothed = 0.35;
            pp.brakeCmdSmoothed = 0;
            pp.steeringInputSmoothed = 0;
            pp.gearShiftBlendTimer = 0;
            pp.roadSegmentIndex = -1;
            pp.roadSlopeSin = 0;

            const wSpeed = spd / phys.wheelRadius;
            for (let i = 0; i < 4; i++) {
                pp.wheelAngularSpeeds[i] = wSpeed;
            }
            let bestGear = 1;
            for (let g = 0; g < phys.gearRatios.length; g++) {
                const candidateRpm = (Math.abs(wSpeed) * 60 / (2 * Math.PI)) * phys.gearRatios[g] * phys.finalDrive;
                bestGear = g + 1;
                if (candidateRpm <= phys.maxRpm * 0.78) break;
            }
            pp.currentGear = bestGear;
            pp.engineRpm = THREE.MathUtils.clamp(
                (Math.abs(wSpeed) * 60 / (2 * Math.PI)) * phys.gearRatios[bestGear - 1] * phys.finalDrive,
                phys.idleRpm,
                phys.maxRpm
            );
            pp.initialized = true;
        }

        function enforcePoliceConcreteWallCollision(npc, applyDynamics, dt) {
            const data = npc.userData;
            const pp = data.policePhysics;
            const phys = vehiclePhysicsConfigs.car;
            const forwardX = -Math.sin(pp.yaw);
            const forwardZ = -Math.cos(pp.yaw);
            const rightX = Math.cos(pp.yaw);
            const rightZ = -Math.sin(pp.yaw);
            const cgOffsetZ = (0.52 - 0.5) * innovaZenixSpecs.wheelbase;
            const halfLen = (data.halfLength || 2.15) + 0.04;
            const halfWid = (data.halfWidth || 0.91) + 0.03;

            const boxCenterX = pp.x - forwardX * cgOffsetZ;
            const boxCenterZ = pp.z - forwardZ * cgOffsetZ;
            const roadContact = findNearestRoadPoint(boxCenterX, pp.y, boxCenterZ, pp.roadSegmentIndex);
            if (!roadContact) return null;

            pp.roadSegmentIndex = roadContact.segmentIndex;
            if (roadContact.verticalDistance <= 4.0) {
                pp.y = roadContact.y;
                pp.roadSlopeSin = roadContact.slopeSin;

                const dx = boxCenterX - roadContact.x;
                const dz = boxCenterZ - roadContact.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.0001) {
                    const normalX = dx / dist;
                    const normalZ = dz / dist;
                    const latExtent = halfLen * Math.abs(forwardX * normalX + forwardZ * normalZ) +
                        halfWid * Math.abs(rightX * normalX + rightZ * normalZ);
                    const maxCenterDist = NPC_WALL_INNER_LIMIT - latExtent;
                    if (dist > maxCenterDist) {
                        const excess = dist - maxCenterDist;
                        pp.x -= normalX * excess;
                        pp.z -= normalZ * excess;

                        const outwardSpeed = pp.vx * normalX + pp.vz * normalZ;
                        const crossSign = forwardX * normalZ - forwardZ * normalX;
                        if (applyDynamics && outwardSpeed > 0) {
                            pp.vx -= outwardSpeed * normalX * 1.2;
                            pp.vz -= outwardSpeed * normalZ * 1.2;
                            const scrapeFactor = Math.max(0.90, 1 - 1.8 * dt);
                            pp.vx *= scrapeFactor;
                            pp.vz *= scrapeFactor;
                            if (outwardSpeed > 2.2) {
                                const impactFactor = Math.min(1, outwardSpeed / 14);
                                pp.yawRate += Math.sign(crossSign || 1) * impactFactor * 0.85;
                                pp.bodyRollVelocity += Math.sign(crossSign || 1) * impactFactor * 1.3;
                            }
                        } else if (outwardSpeed > 0) {
                            pp.vx -= outwardSpeed * normalX * 1.05;
                            pp.vz -= outwardSpeed * normalZ * 1.05;
                        }
                    }
                }
            }
            return roadContact;
        }

        function stepPoliceCarPhysics(npc, dt, aiControls) {
            if (dt <= 0) return;
            const data = npc.userData;
            if (!data.policePhysics || !data.policePhysics.initialized) {
                syncPolicePhysicsFromNpc(npc);
            }
            const pp = data.policePhysics;
            const phys = vehiclePhysicsConfigs.car;
            const wb = innovaZenixSpecs.wheelbase;
            // Sasis sport interceptor kaku & planted: CG rendah, pegas & anti-roll kaku, redaman tinggi
            const policeCgHeight = 0.45;
            const policeWeightDistFront = 0.52;
            const policeFrontSpringRate = 112000;
            const policeRearSpringRate = 126000;
            const policeAntiRollFront = 46000;
            const policeAntiRollRear = 36000;
            const policeFrontRollCenter = 0.14;
            const policeRearRollCenter = 0.24;
            const policeRollDampingRatio = 0.78;
            const policeMaxBodyRoll = 0.055;

            const frontRollStiffness = (policeFrontSpringRate / 2) * innovaZenixSpecs.frontTread *
                innovaZenixSpecs.frontTread / 2 + policeAntiRollFront;
            const rearRollStiffness = (policeRearSpringRate / 2) * innovaZenixSpecs.rearTread *
                innovaZenixSpecs.rearTread / 2 + policeAntiRollRear;
            const totalRollStiffness = frontRollStiffness + rearRollStiffness;
            const rollInertia = phys.mass * (
                innovaZenixSpecs.width * innovaZenixSpecs.width +
                innovaZenixSpecs.height * innovaZenixSpecs.height
            ) / 12;
            const yawInertia = phys.mass * (
                innovaZenixSpecs.length * innovaZenixSpecs.length +
                innovaZenixSpecs.width * innovaZenixSpecs.width
            ) / 12;
            const policeMaxForwardSpeed = POLICE_MAX_CHASE_SPEED_MPS;

            const physicsSubsteps = 8;
            const substepDt = dt / physicsSubsteps;
            let frameMaxTireSkid = 0;

            for (let step = 0; step < physicsSubsteps; step++) {
                const forwardX = -Math.sin(pp.yaw);
                const forwardZ = -Math.cos(pp.yaw);
                const rightX = Math.cos(pp.yaw);
                const rightZ = -Math.sin(pp.yaw);
                let carSpeed = pp.vx * forwardX + pp.vz * forwardZ;

                const rawThrottle = THREE.MathUtils.clamp(aiControls.throttle || 0, 0, 1);
                const rawBrake = THREE.MathUtils.clamp(aiControls.brake || 0, 0, 1);
                const rawReverse = THREE.MathUtils.clamp(aiControls.reverse || 0, 0, 1);
                const handbrake = THREE.MathUtils.clamp(aiControls.handbrake || 0, 0, 1);
                const targetSteerCmd = THREE.MathUtils.clamp(aiControls.steer || 0, -1, 1);
                pp.steerCmdSmoothed = THREE.MathUtils.damp(pp.steerCmdSmoothed || 0, targetSteerCmd, 11.0, substepDt);
                const rawSteeringInput = pp.steerCmdSmoothed;

                pp.throttleSmoothed = THREE.MathUtils.damp(
                    pp.throttleSmoothed,
                    rawThrottle,
                    rawThrottle > pp.throttleSmoothed ? 9.5 : 11.5,
                    substepDt
                );
                pp.brakeSmoothed = THREE.MathUtils.damp(
                    pp.brakeSmoothed,
                    rawBrake,
                    rawBrake > pp.brakeSmoothed ? 10.0 : 12.5,
                    substepDt
                );
                pp.reverseSmoothed = THREE.MathUtils.damp(
                    pp.reverseSmoothed,
                    rawReverse,
                    rawReverse > pp.reverseSmoothed ? 7.5 : 12.0,
                    substepDt
                );
                if (pp.throttleSmoothed < 0.001 && rawThrottle === 0) pp.throttleSmoothed = 0;
                if (pp.brakeSmoothed < 0.001 && rawBrake === 0) pp.brakeSmoothed = 0;
                if (pp.reverseSmoothed < 0.001 && rawReverse === 0) pp.reverseSmoothed = 0;

                const throttle = pp.throttleSmoothed * (0.4 + 0.6 * pp.throttleSmoothed);
                const brake = pp.brakeSmoothed * (0.35 + 0.65 * pp.brakeSmoothed);
                const reverse = pp.reverseSmoothed * (0.4 + 0.6 * pp.reverseSmoothed);

                const steeringSpeed = Math.abs(carSpeed);
                const lowSpeedAssist = 1 + 0.35 * THREE.MathUtils.clamp(1 - steeringSpeed / 8, 0, 1);
                const isReturningToCenter =
                    Math.abs(rawSteeringInput) < 0.02 ||
                    (pp.steeringInputSmoothed !== 0 &&
                        Math.sign(rawSteeringInput) !== Math.sign(pp.steeringInputSmoothed));
                const policeSteerInRate = 2.6;
                const policeSteerReturnRate = 4.4;
                const policeSteerGamma = 1.5;
                const policeSteerSpeedFalloff = 0.020;
                const activeSteerRate = isReturningToCenter ? policeSteerReturnRate : policeSteerInRate * lowSpeedAssist;
                const maxSteeringStep = activeSteerRate * substepDt;
                pp.steeringInputSmoothed += THREE.MathUtils.clamp(
                    rawSteeringInput - pp.steeringInputSmoothed,
                    -maxSteeringStep,
                    maxSteeringStep
                );
                const steerAbs = Math.abs(pp.steeringInputSmoothed);
                const steeringInput = Math.sign(pp.steeringInputSmoothed) *
                    (0.50 * steerAbs + 0.50 * Math.pow(steerAbs, policeSteerGamma));
                const steeringSpeedScale = 1 + Math.pow(steeringSpeed * policeSteerSpeedFalloff, 2);
                const steeringAngle = steeringInput * phys.maxInnerWheelSteerAngle / steeringSpeedScale;
                pp.steeringAngle = steeringAngle;

                // RPM & Pergantian Gigi AT (identik dengan pemain)
                let frontWheelSum = 0;
                let frontWheelCount = 0;
                for (let t = 0; t < 4; t++) {
                    if (pp.tireLayout[t].axle === phys.drivenAxle) {
                        frontWheelSum += Math.abs(pp.wheelAngularSpeeds[t] || 0);
                        frontWheelCount += 1;
                    }
                }
                const drivenWheelAng = frontWheelCount > 0 ? frontWheelSum / frontWheelCount : Math.abs(carSpeed) / phys.wheelRadius;
                const activeGearRatio = reverse > 0.01 && carSpeed <= 0.15
                    ? phys.gearRatios[0]
                    : phys.gearRatios[pp.currentGear - 1];
                const targetRpm = Math.max(
                    phys.idleRpm,
                    Math.min(phys.maxRpm, (drivenWheelAng * 60 / (2 * Math.PI)) * activeGearRatio * phys.finalDrive)
                );
                pp.engineRpm = THREE.MathUtils.damp(pp.engineRpm, targetRpm, 15, substepDt);

                if (pp.engineRpm >= phys.maxRpm * 0.94 && pp.currentGear < phys.gearRatios.length) {
                    pp.currentGear += 1;
                    pp.gearShiftBlendTimer = 0.10;
                } else if (pp.engineRpm <= phys.maxRpm * 0.48 && pp.currentGear > 1) {
                    pp.currentGear -= 1;
                    pp.gearShiftBlendTimer = 0.10;
                }
                if (pp.gearShiftBlendTimer > 0) {
                    pp.gearShiftBlendTimer = Math.max(0, pp.gearShiftBlendTimer - substepDt);
                }
                const shiftTorqueScale = pp.gearShiftBlendTimer > 0
                    ? 0.55 + 0.45 * (1 - pp.gearShiftBlendTimer / 0.10)
                    : 1.0;

                const gearRatio = (reverse > 0.01 && carSpeed <= 0.15)
                    ? phys.gearRatios[0]
                    : phys.gearRatios[pp.currentGear - 1];
                const torqueFactor = getEngineTorqueFactor(pp.engineRpm, phys.idleRpm, phys.maxRpm);
                const fullDriveTorque = phys.maxTorqueNm * torqueFactor *
                    gearRatio * phys.finalDrive * POLICE_INTERCEPTOR_TORQUE_MULT * shiftTorqueScale;
                const coastEngineTorque = Math.abs(carSpeed) > 0.3
                    ? -Math.sign(carSpeed) * phys.maxTorqueNm * phys.engineBrakingFactor *
                      gearRatio * phys.finalDrive * 0.88
                    : 0;
                let driveTorquePerTire = 0;
                if (reverse > 0.01 && carSpeed <= 0.15) {
                    driveTorquePerTire = -phys.maxTorqueNm * 1.15 * reverse *
                        gearRatio * phys.finalDrive / 2;
                } else if (brake > 0.04) {
                    driveTorquePerTire = coastEngineTorque * (1 - brake * 0.45) / 2;
                } else {
                    driveTorquePerTire = THREE.MathUtils.lerp(coastEngineTorque, fullDriveTorque, throttle) / 2;
                }

                const totalNormalLoad = phys.mass * gravity;
                const maxStaticFront = totalNormalLoad * policeWeightDistFront;
                const maxStaticRear = totalNormalLoad * (1 - policeWeightDistFront);
                const longitudinalLoadTransfer = THREE.MathUtils.clamp(
                    phys.mass * pp.longitudinalAcceleration * policeCgHeight / wb,
                    -maxStaticRear * 0.45,
                    maxStaticFront * 0.45
                );
                const frontAxleLoad = maxStaticFront - longitudinalLoadTransfer;
                const rearAxleLoad = maxStaticRear + longitudinalLoadTransfer;

                let totalForceX = 0;
                let totalForceZ = 0;
                let totalYawTorque = 0;
                const cosYaw = Math.cos(pp.yaw);
                const sinYaw = Math.sin(pp.yaw);

                for (let index = 0; index < 4; index++) {
                    const tire = pp.tireLayout[index];
                    const frontAxle = tire.axle === 'front';
                    const offsetX = tire.x * cosYaw + tire.z * sinYaw;
                    const offsetZ = -tire.x * sinYaw + tire.z * cosYaw;
                    const pointVelocityX = pp.vx + pp.yawRate * offsetZ;
                    const pointVelocityZ = pp.vz - pp.yawRate * offsetX;

                    let tireSteeringAngle = steeringAngle;
                    if (frontAxle && Math.abs(steeringAngle) > 1e-5) {
                        const isInnerWheel = tire.x * steeringAngle < 0;
                        if (!isInnerWheel) {
                            const cotInner = 1 / Math.tan(Math.abs(steeringAngle));
                            const ackermannDelta = (innovaZenixSpecs.frontTread / wb) * (phys.ackermannFactor || 0.65);
                            tireSteeringAngle = Math.sign(steeringAngle) * Math.atan(1 / (cotInner + ackermannDelta));
                        }
                    }

                    const staticToeRad = THREE.MathUtils.degToRad(frontAxle ? phys.frontToeDeg : 0.25);
                    const toeOffset = Math.sign(tire.x) * staticToeRad;
                    const tireAngle = pp.yaw + (frontAxle ? tireSteeringAngle : 0) + toeOffset;
                    const tireForwardX = -Math.sin(tireAngle);
                    const tireForwardZ = -Math.cos(tireAngle);
                    const tireRightX = Math.cos(tireAngle);
                    const tireRightZ = -Math.sin(tireAngle);
                    const longitudinalVelocity = pointVelocityX * tireForwardX + pointVelocityZ * tireForwardZ;
                    const lateralVelocity = pointVelocityX * tireRightX + pointVelocityZ * tireRightZ;

                    const axleWeightShare = frontAxle ? policeWeightDistFront : (1 - policeWeightDistFront);
                    const axleLoad = frontAxle ? frontAxleLoad : rearAxleLoad;
                    const trackWidth = frontAxle ? innovaZenixSpecs.frontTread : innovaZenixSpecs.rearTread;
                    const rollCenterHeight = frontAxle ? policeFrontRollCenter : policeRearRollCenter;
                    const axleRollStiffness = frontAxle ? frontRollStiffness : rearRollStiffness;
                    const rollStiffnessShare = axleRollStiffness / totalRollStiffness;
                    const rawLateralTransfer = phys.mass * pp.lateralAcceleration / trackWidth * (
                        rollCenterHeight * axleWeightShare +
                        (policeCgHeight - rollCenterHeight) * rollStiffnessShare
                    ) * (tire.x < 0 ? 1 : -1);
                    const lateralLoadTransfer = THREE.MathUtils.clamp(rawLateralTransfer, -axleLoad * 0.42, axleLoad * 0.42);
                    const normalLoad = Math.max(0, axleLoad / 2 + lateralLoadTransfer);
                    const axleGripBias = frontAxle ? 1.0 : 1.14;
                    const maximumTireForce = phys.frictionCoefficient * POLICE_INTERCEPTOR_GRIP_MULT * axleGripBias * normalLoad;

                    const wheelAngularSpeed = pp.wheelAngularSpeeds[index];
                    const vDenom = Math.max(Math.abs(longitudinalVelocity), 1.2);
                    const slipRatio = (wheelAngularSpeed * phys.wheelRadius - longitudinalVelocity) / vDenom;
                    const slipAngle = Math.atan2(lateralVelocity, vDenom);
                    const axleLatStiffness = phys.lateralStiffness * (frontAxle ? 1.38 : 1.78);
                    let longitudinalForce = calculateTireForce(slipRatio, phys.longitudinalStiffness * 1.2, maximumTireForce, phys.tireShapeFactor);
                    let lateralForce = -calculateTireForce(slipAngle, axleLatStiffness, maximumTireForce, phys.tireShapeFactor);

                    const staticCamberRad = THREE.MathUtils.degToRad(frontAxle ? -0.8 : -1.55);
                    const rollCompliance = frontAxle ? 0.55 : 0.22;
                    const effectiveWheelTilt = pp.bodyRoll * rollCompliance - Math.sign(tire.x) * staticCamberRad;
                    lateralForce -= phys.camberThrustCoefficient * normalLoad * Math.sin(effectiveWheelTilt);

                    const combinedForce = Math.hypot(longitudinalForce, lateralForce);
                    if (combinedForce > maximumTireForce && combinedForce > 0) {
                        const forceScale = maximumTireForce / combinedForce;
                        longitudinalForce *= forceScale;
                        lateralForce *= forceScale;
                    }

                    const handbrakeOnTire = handbrake > 0 && !frontAxle ? 1 : 0;
                    if (handbrakeOnTire > 0 && Math.abs(longitudinalVelocity) > 0.8) {
                        longitudinalForce *= 0.85;
                        lateralForce *= 0.42;
                    } else if (Math.abs(slipRatio) > 0.75 && Math.abs(longitudinalVelocity) > 1.2) {
                        lateralForce *= 0.78;
                    }

                    const surfaceSpeed = Math.hypot(pointVelocityX, pointVelocityZ);
                    // Skidmark polisi hanya muncul saat rem darurat keras (bukan saat menyalip/menikung normal)
                    const isEmergencyBrakeSkid = (brake > 0.74 && surfaceSpeed > 11.0) ||
                        (handbrakeOnTire > 0 && surfaceSpeed > 6.0);
                    const rawSkid = isEmergencyBrakeSkid
                        ? Math.max(handbrakeOnTire > 0 ? 0.88 : 0, ((brake - 0.74) / 0.26) * 0.85)
                        : 0;
                    const clampedSkid = THREE.MathUtils.clamp(rawSkid, 0, 1);
                    if (clampedSkid > frameMaxTireSkid) frameMaxTireSkid = clampedSkid;

                    const tireForceX = longitudinalForce * tireForwardX + lateralForce * tireRightX;
                    const tireForceZ = longitudinalForce * tireForwardZ + lateralForce * tireRightZ;
                    totalForceX += tireForceX;
                    totalForceZ += tireForceZ;
                    totalYawTorque += offsetZ * tireForceX - offsetX * tireForceZ;

                    const driveTorque = (tire.axle === phys.drivenAxle && !handbrakeOnTire) ? driveTorquePerTire : 0;
                    const axleBrakeBias = frontAxle ? phys.brakeBiasFront : (1 - phys.brakeBiasFront);
                    const absScale = !handbrakeOnTire && brake > 0.02 && longitudinalVelocity > 1.5 && slipRatio < -phys.absSlipThreshold
                        ? THREE.MathUtils.clamp(1 - (-slipRatio - phys.absSlipThreshold) / 0.12, 0.15, 1)
                        : 1;
                    const lowSpeedBrakeScale = THREE.MathUtils.clamp(Math.abs(longitudinalVelocity) / 0.85, 0.25, 1);
                    const brakeTorquePerTire = brake * absScale * lowSpeedBrakeScale * phys.maxBrakingForce * POLICE_INTERCEPTOR_BRAKE_MULT *
                        axleBrakeBias * phys.wheelRadius / 2;
                    const handbrakeTorquePerTire = handbrakeOnTire * (phys.maxHandbrakeForce || 10000) * phys.wheelRadius / 2;
                    const totalBrakeTorquePerTire = brakeTorquePerTire + handbrakeTorquePerTire;

                    const tireLinearGain = maximumTireForce * phys.tireShapeFactor * phys.longitudinalStiffness / vDenom;
                    const effectiveWheelInertia = phys.wheelInertia + substepDt * tireLinearGain * phys.wheelRadius * phys.wheelRadius;
                    let nextWheelSpeed = wheelAngularSpeed + (driveTorque - longitudinalForce * phys.wheelRadius) * substepDt / effectiveWheelInertia;

                    if (totalBrakeTorquePerTire > 0) {
                        if (Math.abs(nextWheelSpeed) > 1e-4) {
                            const brakeDelta = Math.sign(nextWheelSpeed) * totalBrakeTorquePerTire / phys.wheelInertia * substepDt;
                            if (Math.abs(brakeDelta) >= Math.abs(nextWheelSpeed) || (handbrakeOnTire > 0 && Math.abs(nextWheelSpeed) < 3.5)) {
                                nextWheelSpeed = 0;
                            } else {
                                nextWheelSpeed -= brakeDelta;
                            }
                        } else if (handbrakeOnTire > 0 || Math.abs(longitudinalVelocity) < 0.25) {
                            nextWheelSpeed = 0;
                        }
                    }
                    pp.wheelAngularSpeeds[index] = nextWheelSpeed;
                }

                // Gaya lereng flyover
                if (pp.roadSlopeSin !== 0) {
                    const slopeForce = phys.mass * gravity * pp.roadSlopeSin;
                    totalForceX -= slopeForce * forwardX;
                    totalForceZ -= slopeForce * forwardZ;
                }

                // Hambatan udara & rolling resistance
                const speedMagnitude = Math.hypot(pp.vx, pp.vz);
                if (speedMagnitude > 0) {
                    const dragForce = 0.5 * airDensity * phys.dragCoefficient * phys.frontalArea * speedMagnitude * speedMagnitude;
                    const rollingResistance = phys.rollingResistanceCoefficient * totalNormalLoad;
                    const resistance = Math.min(dragForce + rollingResistance, speedMagnitude * phys.mass / substepDt);
                    totalForceX -= pp.vx / speedMagnitude * resistance;
                    totalForceZ -= pp.vz / speedMagnitude * resistance;
                }

                const accelerationX = totalForceX / phys.mass;
                const accelerationZ = totalForceZ / phys.mass;
                pp.vx += accelerationX * substepDt;
                pp.vz += accelerationZ * substepDt;
                pp.longitudinalAcceleration = accelerationX * forwardX + accelerationZ * forwardZ;
                pp.lateralAcceleration = accelerationX * rightX + accelerationZ * rightZ;

                // Dinamika suspensi body roll sport teredam penuh (tidak limbung / elastis)
                const rollCenterHeight = (frontRollStiffness * policeFrontRollCenter + rearRollStiffness * policeRearRollCenter) / totalRollStiffness;
                const rollMomentArm = policeCgHeight - rollCenterHeight;
                const effectiveRollStiffness = Math.max(1, totalRollStiffness - phys.mass * gravity * rollMomentArm);
                const rollDamping = 2 * policeRollDampingRatio * Math.sqrt(effectiveRollStiffness * rollInertia);
                const rollTorque = phys.mass * pp.lateralAcceleration * rollMomentArm;
                const rollAngularAcceleration = (rollTorque - effectiveRollStiffness * pp.bodyRoll - rollDamping * pp.bodyRollVelocity) / rollInertia;
                pp.bodyRollVelocity += rollAngularAcceleration * substepDt;
                const nextBodyRoll = pp.bodyRoll + pp.bodyRollVelocity * substepDt;
                const clampedBodyRoll = THREE.MathUtils.clamp(nextBodyRoll, -policeMaxBodyRoll, policeMaxBodyRoll);
                if (clampedBodyRoll !== nextBodyRoll) pp.bodyRollVelocity = 0;
                pp.bodyRoll = clampedBodyRoll;

                // Kontrol Stabilitas Elektronik (ESC): meredam selip ban belakang agar mobil polisi tetap planted & anti-ngepot
                if (handbrake < 0.1 && Math.abs(carSpeed) > 6) {
                    const desiredYawRate = Math.tan(steeringAngle) * carSpeed / wb;
                    const yawRateErr = pp.yawRate - desiredYawRate;
                    const bodyLatVel = pp.vx * rightX + pp.vz * rightZ;
                    const escTorque = -yawRateErr * 4200 - bodyLatVel * Math.sign(carSpeed) * 520;
                    totalYawTorque += THREE.MathUtils.clamp(escTorque, -12000, 12000);
                }

                pp.yawRate += totalYawTorque / yawInertia * substepDt;
                pp.yaw += pp.yawRate * substepDt;
                pp.x += pp.vx * substepDt;
                pp.z += pp.vz * substepDt;

                const updatedForwardX = -Math.sin(pp.yaw);
                const updatedForwardZ = -Math.cos(pp.yaw);
                carSpeed = pp.vx * updatedForwardX + pp.vz * updatedForwardZ;
                if (carSpeed > policeMaxForwardSpeed) {
                    const excessSpeed = carSpeed - policeMaxForwardSpeed;
                    pp.vx -= updatedForwardX * excessSpeed;
                    pp.vz -= updatedForwardZ * excessSpeed;
                } else if (carSpeed < -phys.reverseSpeed) {
                    const excessSpeed = carSpeed + phys.reverseSpeed;
                    pp.vx -= updatedForwardX * excessSpeed;
                    pp.vz -= updatedForwardZ * excessSpeed;
                }
            }

            const roadContact = enforcePoliceConcreteWallCollision(npc, true, dt);
            const finalFwdX = -Math.sin(pp.yaw);
            const finalFwdZ = -Math.cos(pp.yaw);
            const finalSpeed = pp.vx * finalFwdX + pp.vz * finalFwdZ;

            if (roadContact) {
                data.progress = roadContact.progress;
                const roadRightX = -roadContact.tangentZ;
                const roadRightZ = roadContact.tangentX;
                data.lateralPos = (pp.x - roadContact.x) * roadRightX + (pp.z - roadContact.z) * roadRightZ;
                data.lateralVelocity = pp.vx * roadRightX + pp.vz * roadRightZ;
                const roadYaw = Math.atan2(-roadContact.tangentX, -roadContact.tangentZ);
                data.yawOffset = wrapAngleRad(pp.yaw - roadYaw);
            }
            data.yawVelocity = pp.yawRate;
            data.rollOffset = pp.bodyRoll;
            data.rollVelocity = pp.bodyRollVelocity;
            data.longitudinalAcceleration = pp.longitudinalAcceleration;
            data.lateralAcceleration = pp.lateralAcceleration;
            data.steeringAngleVisual = pp.steeringAngle || 0;
            data.isBraking = pp.brakeSmoothed > 0.12;
            data.speed = finalSpeed;
            data.worldVelX = pp.vx;
            data.worldVelZ = pp.vz;
            data.skidIntensity = frameMaxTireSkid;

            npc.position.set(pp.x, pp.y, pp.z);
            npc.rotation.y = pp.yaw;
            npc.rotation.z = 0;
        }

        function ensurePolicePointLights() {
            if (!scene || policePointLights.length >= MAX_POLICE_POINT_LIGHTS) return;
            while (policePointLights.length < MAX_POLICE_POINT_LIGHTS) {
                const light = new THREE.PointLight(0x2890ff, 0, 46, 1.8);
                light.position.set(0, -100, 0);
                scene.add(light);
                policePointLights.push(light);
            }
        }

        function hidePoliceAlertToast() {
            const toastEl = document.getElementById('police-alert-toast');
            if (toastEl) {
                toastEl.hidden = true;
                toastEl.classList.remove('tier-1', 'tier-2', 'tier-3');
            }
        }

        function showPoliceAlertToast(tier) {
            const toastEl = document.getElementById('police-alert-toast');
            const badgeEl = document.getElementById('police-alert-tier');
            const textEl = document.getElementById('police-alert-text');
            if (!toastEl || !badgeEl || !textEl) return;

            const tierConfigs = {
                1: { badge: 'TINGKAT 1', text: 'Mereka tahu kamu mengebut!' },
                2: { badge: 'TINGKAT 2', text: 'Gass brooo! kabur dari polisi' },
                3: { badge: 'TINGKAT 3', text: 'Uh Oh.. goodluck ya!' }
            };
            const cfg = tierConfigs[tier];
            if (!cfg) return;

            badgeEl.textContent = cfg.badge;
            textEl.textContent = cfg.text;
            toastEl.classList.remove('tier-1', 'tier-2', 'tier-3');
            toastEl.classList.add(`tier-${tier}`);
            toastEl.hidden = false;
            // Restart animation cleanly
            toastEl.style.animation = 'none';
            void toastEl.offsetWidth;
            toastEl.style.animation = '';
            policeToastTimer = 4.2;
        }

        function resetPoliceLightPool() {
            activePoliceSirenIntensity = 0;
            policeThreatLevel = 0;
            policeToastTimer = 0;
            policeEscalationElapsed = 0;
            policeRamPenaltyCooldown = 0;
            hidePoliceAlertToast();
            for (let i = 0; i < policePointLights.length; i++) {
                policePointLights[i].intensity = 0;
                policePointLights[i].position.set(0, -100, 0);
            }
        }

        function getNpcWallLateralLimit(data) {
            const yaw = Math.abs(data.yawOffset || 0);
            const halfLen = data.halfLength || 2.0;
            const halfWid = data.halfWidth || 0.9;
            const latExtent = halfLen * Math.sin(yaw) + halfWid * Math.cos(yaw);
            return Math.max(4.5, NPC_WALL_INNER_LIMIT - latExtent);
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
            const wheelRadius = 0.32;

            // Geometri roda shared (ban + velg) terpisah agar tiap roda NPC bisa berputar, belok, dan punya travel suspensi
            const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.22, 12);
            tireGeo.rotateZ(Math.PI / 2);
            const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.23, 10);
            rimGeo.rotateZ(Math.PI / 2);
            const npcWheelGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries([tireGeo, rimGeo], true);
            tireGeo.dispose();
            rimGeo.dispose();
            if (npcWheelGeometry) npcWheelGeometry.computeBoundingSphere();
            const npcWheelMaterials = [trafficSharedMaterials.tire, trafficSharedMaterials.rim];

            const wheelMounts = [
                { x: -wheelX, z: -wheelZ, axle: 'front' },
                { x: wheelX, z: -wheelZ, axle: 'front' },
                { x: -wheelX, z: wheelZ, axle: 'rear' },
                { x: wheelX, z: wheelZ, axle: 'rear' }
            ];

            const bodyGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(bodyParts, false);
            bodyParts.forEach(geo => geo.dispose());
            if (bodyGeometry) bodyGeometry.computeBoundingSphere();

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
            if (detailGeometry) detailGeometry.computeBoundingSphere();

            const headGlowParts = [];
            const tailGlowParts = [];
            [-lightOffsetX, lightOffsetX].forEach(lx => {
                const headGlow = new THREE.SphereGeometry(0.16, 8, 6);
                headGlow.translate(lx, lightY, -halfLength - 0.05);
                headGlowParts.push(headGlow);

                const tailGlow = new THREE.SphereGeometry(0.14, 6, 5);
                tailGlow.translate(lx, lightY + 0.08, halfLength + 0.06);
                tailGlowParts.push(tailGlow);
            });
            const npcHeadGlowGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(headGlowParts, false);
            headGlowParts.forEach(g => g.dispose());
            if (npcHeadGlowGeometry) npcHeadGlowGeometry.computeBoundingSphere();
            const npcTailGlowGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(tailGlowParts, false);
            tailGlowParts.forEach(g => g.dispose());
            if (npcTailGlowGeometry) npcTailGlowGeometry.computeBoundingSphere();

            const variantPhysics = variant === 'truck'
                ? {
                    mass: 4200,
                    cgHeight: 1.05,
                    weightDistFront: 0.52,
                    maxTorqueNm: 440,
                    finalDrive: 5.1,
                    gearRatios: [3.6, 2.35, 1.55, 1.05, 0.74],
                    maxBrakingForce: 28000,
                    frontalArea: 4.5,
                    dragCoefficient: 0.56,
                    frontSpringRate: 110000,
                    rearSpringRate: 155000,
                    antiRollStiffnessFront: 36000,
                    antiRollStiffnessRear: 42000,
                    maxPitch: 0.055,
                    maxRoll: 0.12
                }
                : variant === 'police'
                    ? {
                        mass: 1620,
                        cgHeight: 0.45,
                        weightDistFront: 0.52,
                        maxTorqueNm: 255,
                        finalDrive: 4.26,
                        gearRatios: [3.38, 2.2, 1.5, 1.0, 0.7],
                        maxBrakingForce: 15500,
                        frontalArea: 2.45,
                        dragCoefficient: 0.29,
                        frontSpringRate: 112000,
                        rearSpringRate: 126000,
                        antiRollStiffnessFront: 46000,
                        antiRollStiffnessRear: 36000,
                        maxPitch: 0.028,
                        maxRoll: 0.055
                    }
                    : variant === 'mpv'
                        ? {
                            mass: 1620,
                            cgHeight: 0.64,
                            weightDistFront: 0.56,
                            maxTorqueNm: 205,
                            finalDrive: 4.26,
                            gearRatios: [3.38, 2.2, 1.5, 1.0, 0.7],
                            maxBrakingForce: 13500,
                            frontalArea: 2.82,
                            dragCoefficient: 0.33,
                            frontSpringRate: 57000,
                            rearSpringRate: 68000,
                            antiRollStiffnessFront: 22500,
                            antiRollStiffnessRear: 13500,
                            maxPitch: 0.075,
                            maxRoll: 0.16
                        }
                    : {
                        mass: 1350,
                        cgHeight: 0.55,
                        weightDistFront: 0.57,
                        maxTorqueNm: 185,
                        finalDrive: 4.15,
                        gearRatios: [3.35, 2.15, 1.48, 1.0, 0.72],
                        maxBrakingForce: 12200,
                        frontalArea: 2.35,
                        dragCoefficient: 0.30,
                        frontSpringRate: 50000,
                        rearSpringRate: 58000,
                        antiRollStiffnessFront: 21000,
                        antiRollStiffnessRear: 12500,
                        maxPitch: 0.07,
                        maxRoll: 0.15
                    };

            const halfHeight = variant === 'truck'
                ? 1.18
                : variant === 'mpv'
                    ? 0.78
                    : variant === 'police'
                        ? 0.74
                        : 0.67;

            trafficVariantTemplates[variant] = {
                bodyGeometry,
                detailGeometry,
                detailMaterials: activeDetailMaterials,
                npcWheelGeometry,
                npcWheelMaterials,
                wheelMounts,
                wheelRadius,
                wheelbase: wheelZ * 2,
                trackWidth: wheelX * 2,
                variantPhysics,
                npcHeadGlowGeometry,
                npcTailGlowGeometry,
                policeBeaconGeometry: variant === 'police' ? new THREE.BoxGeometry(0.46, 0.13, 0.24) : null,
                policeGlowGeometry: variant === 'police' ? new THREE.SphereGeometry(0.48, 8, 6) : null,
                halfLength,
                halfWidth,
                halfHeight,
                localComY: halfHeight
            };
            return trafficVariantTemplates[variant];
        }

        function createTrafficVehicleMesh(variant, colorIndex) {
            const template = getTrafficVariantTemplate(variant);
            const group = new THREE.Group();
            group.rotation.order = 'YXZ';
            const bodyVisual = new THREE.Group();
            group.add(bodyVisual);

            const bodyMat = variant === 'police'
                ? trafficPoliceBodyMaterial
                : trafficBodyMaterials[colorIndex];
            const bodyMesh = new THREE.Mesh(template.bodyGeometry, bodyMat);
            bodyMesh.frustumCulled = true;
            bodyVisual.add(bodyMesh);

            const detailMesh = new THREE.Mesh(template.detailGeometry, template.detailMaterials);
            detailMesh.frustumCulled = true;
            bodyVisual.add(detailMesh);

            const headGlowMesh = new THREE.Mesh(template.npcHeadGlowGeometry, npcHeadGlowMat);
            headGlowMesh.frustumCulled = true;
            bodyVisual.add(headGlowMesh);

            const tailGlowMesh = new THREE.Mesh(template.npcTailGlowGeometry, npcTailGlowMat);
            tailGlowMesh.frustumCulled = true;
            bodyVisual.add(tailGlowMesh);

            const wheelPivots = template.wheelMounts.map(mount => {
                const wheelPivot = new THREE.Group();
                wheelPivot.position.set(mount.x, template.wheelRadius, mount.z);
                const steeringPivot = new THREE.Group();
                const spinPivot = new THREE.Group();
                const wheelMesh = new THREE.Mesh(template.npcWheelGeometry, template.npcWheelMaterials);
                wheelMesh.frustumCulled = true;
                spinPivot.add(wheelMesh);
                steeringPivot.add(spinPivot);
                wheelPivot.add(steeringPivot);
                wheelPivot.userData = {
                    axle: mount.axle,
                    x: mount.x,
                    z: mount.z,
                    basePositionY: template.wheelRadius,
                    steeringPivot,
                    spinPivot,
                    spinAngle: 0,
                    suspensionTravel: 0,
                    suspensionVelocity: 0
                };
                group.add(wheelPivot);
                return wheelPivot;
            });

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
                leftBeacon.frustumCulled = true;
                bodyVisual.add(leftBeacon);

                const rightBeacon = new THREE.Mesh(template.policeBeaconGeometry, rightBeaconMat);
                rightBeacon.position.set(0.34, 1.47, 0.05);
                rightBeacon.frustumCulled = true;
                bodyVisual.add(rightBeacon);

                const beaconGlow = new THREE.Mesh(template.policeGlowGeometry, glowMat);
                beaconGlow.position.set(0, 1.52, 0.05);
                beaconGlow.scale.set(2.4, 1.15, 1.6);
                beaconGlow.visible = false;
                beaconGlow.frustumCulled = true;
                bodyVisual.add(beaconGlow);

                policeVisuals = {
                    leftBeaconMat,
                    rightBeaconMat,
                    glowMat,
                    beaconGlow
                };
            }

            return {
                group,
                bodyVisual,
                wheelPivots,
                template,
                policeVisuals,
                tailGlowMesh,
                halfLength: template.halfLength,
                halfWidth: template.halfWidth,
                halfHeight: template.halfHeight,
                localComY: template.localComY
            };
        }

        function clearTrafficCars() {
            trafficCars.forEach(npc => scene.remove(npc));
            trafficCars = [];
            trafficSortedIndices.length = 0;
            npcHornGlobalCooldown = 0;
            resetPoliceLightPool();
        }

        function sampleOrganicTrafficGap() {
            const roll = Math.random();
            if (roll < 0.25) {
                return 54 + Math.random() * 24;
            }
            if (roll < 0.72) {
                return 82 + Math.random() * 44;
            }
            return 128 + Math.random() * 64;
        }

        function pickVehicleForLane(chosenLane) {
            const roll = Math.random();
            if (chosenLane === LANE_LEFT) {
                if (roll < 0.42) return 'truck';
                if (roll < 0.78) return 'mpv';
                return 'sedan';
            }
            if (chosenLane === LANE_MIDDLE) {
                if (roll < 0.54) return 'sedan';
                if (roll < 0.92) return 'mpv';
                return 'truck';
            }
            return roll < 0.76 ? 'sedan' : 'mpv';
        }

        function pickLaneSpeedTierKmh(chosenLane, variant = 'sedan') {
            if (chosenLane === LANE_LEFT) {
                if (variant === 'truck') {
                    return Math.random() < 0.62 ? 60 : 70;
                }
                const tiers = [60, 70, 80];
                return tiers[Math.floor(Math.random() * tiers.length)];
            }
            if (chosenLane === LANE_MIDDLE) {
                if (variant === 'truck') return 80;
                const tiers = [80, 90, 100];
                return tiers[Math.floor(Math.random() * tiers.length)];
            }
            const tiers = [100, 110, 120];
            return tiers[Math.floor(Math.random() * tiers.length)];
        }

        function getLaneSpeedMps(chosenLane, variant = 'sedan') {
            return pickLaneSpeedTierKmh(chosenLane, variant) * TRAFFIC_KMH_TO_MPS;
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

        function createTrafficNpcUnit(variant, progress, chosenLane, colorIndex, initialSpeedOverride = null) {
            const isPolice = variant === 'police';
            const {
                group,
                bodyVisual,
                wheelPivots,
                template,
                policeVisuals,
                tailGlowMesh,
                halfLength,
                halfWidth,
                halfHeight,
                localComY
            } = createTrafficVehicleMesh(variant, colorIndex);

            const baseSpeed = initialSpeedOverride !== null
                ? initialSpeedOverride
                : (isPolice
                    ? (80 + Math.floor(Math.random() * 3) * 10) * TRAFFIC_KMH_TO_MPS
                    : getLaneSpeedMps(chosenLane, variant));
            const vPhys = template.variantPhysics;
            const initWheelAng = baseSpeed / template.wheelRadius;
            let initGear = 1;
            for (let g = 0; g < vPhys.gearRatios.length; g++) {
                const candRpm = (initWheelAng * 60 / (2 * Math.PI)) * vPhys.gearRatios[g] * vPhys.finalDrive;
                initGear = g + 1;
                if (candRpm <= 6500 * 0.75) break;
            }
            const initRpm = THREE.MathUtils.clamp(
                (initWheelAng * 60 / (2 * Math.PI)) * vPhys.gearRatios[initGear - 1] * vPhys.finalDrive,
                950,
                6500
            );

            const fullLen = halfLength * 2;
            const fullWid = halfWidth * 2;
            const fullHei = halfHeight * 2;
            const npcInertiaYaw = Math.max(450, (vPhys.mass * (fullLen * fullLen + fullWid * fullWid)) / 12);
            const npcInertiaPitch = Math.max(450, (vPhys.mass * (fullLen * fullLen + fullHei * fullHei)) / 12);
            const npcInertiaRoll = Math.max(250, (vPhys.mass * (fullWid * fullWid + fullHei * fullHei)) / 12);

            group.userData = {
                variant,
                speed: baseSpeed,
                targetSpeed: baseSpeed,
                baseCruiseSpeed: baseSpeed,
                speedModPhase: Math.random() * Math.PI * 2,
                speedModFreq: 0.14 + Math.random() * 0.14,
                speedModTargetDelta: 0,
                speedModCurrentDelta: 0,
                speedModShiftTimer: 6 + Math.random() * 9,
                mass: vPhys.mass,
                cgHeight: vPhys.cgHeight || localComY,
                inertiaYaw: npcInertiaYaw,
                inertiaPitch: npcInertiaPitch,
                inertiaRoll: npcInertiaRoll,
                variantPhysics: vPhys,
                wheelRadius: template.wheelRadius,
                wheelbase: template.wheelbase,
                trackWidth: template.trackWidth,
                bodyVisual,
                wheelPivots,
                wheelAngularSpeeds: [initWheelAng, initWheelAng, initWheelAng, initWheelAng],
                currentGear: initGear,
                engineRpm: initRpm,
                gearShiftBlendTimer: 0,
                throttleSmoothed: 0.25,
                brakeSmoothed: 0,
                steeringAngleVisual: 0,
                longitudinalAcceleration: 0,
                lateralAcceleration: 0,
                pitchOffset: 0,
                pitchVelocity: 0,
                progress,
                homeLane: getNearestValidLane(chosenLane),
                lane: chosenLane,
                lateralPos: chosenLane,
                lateralVelocity: 0,
                yawOffset: 0,
                yawVelocity: 0,
                rollOffset: 0,
                rollVelocity: 0,
                hitCooldown: 0,
                pushedTimer: 0,
                controlLossTimer: 0,
                laneChangeCooldown: 0,
                hornCooldown: Math.random() * 1.2,
                isBraking: false,
                tailGlowMesh,
                skidIntensity: 0,
                worldVelX: 0,
                worldVelZ: 0,
                skidTrails: null,
                isPolice,
                policeState: 'patrol',
                chaseCalmTimer: 0,
                policeVisuals,
                policePhysics: isPolice ? createPoliceCarPhysicsState() : null,
                policePassSide: 0,
                halfLength,
                halfWidth,
                halfHeight,
                localComY,
                freeBodyActive: false,
                recoveringUpright: false,
                fbOffTrack: false,
                fbX: 0,
                fbY: 0,
                fbZ: 0,
                fbVx: 0,
                fbVy: 0,
                fbVz: 0,
                fbYaw: 0,
                fbPitch: 0,
                fbRoll: 0,
                fbYawVel: 0,
                fbPitchVel: 0,
                fbRollVel: 0,
                fbRestTimer: 0,
                fbLaunchCooldown: 0,
                fbHintSegIdx: -1,
                fbGrounded: true,
                nearMissed: false
            };

            scene.add(group);
            placeOnTrack(group, progress, chosenLane);
            trafficCars.push(group);
            return group;
        }

        function pickClearRearLateralAtProgress(targetProgress, preferredLateral = 0) {
            const candidates = [0, -4.8, 4.8, -2.4, 2.4, -5.8, 5.8];
            let bestLat = THREE.MathUtils.clamp(preferredLateral, -6.0, 6.0);
            let bestScore = -Infinity;

            for (let c = 0; c < candidates.length; c++) {
                const candLat = candidates[c];
                let minDist = 60;
                for (let i = 0; i < trafficCars.length; i++) {
                    const other = trafficCars[i].userData;
                    let delta = (other.progress - targetProgress) * trackLength;
                    if (delta > trackLength * 0.5) delta -= trackLength;
                    if (delta < -trackLength * 0.5) delta += trackLength;
                    if (Math.abs(delta) < 16 && Math.abs(other.lateralPos - candLat) < ((other.halfWidth || 0.9) + 1.25)) {
                        minDist = Math.min(minDist, Math.abs(delta));
                    }
                }
                const score = minDist - Math.abs(candLat - preferredLateral) * 0.35;
                if (score > bestScore) {
                    bestScore = score;
                    bestLat = candLat;
                }
            }
            return bestLat;
        }

        function spawnEscalationPoliceUnit(desiredTotalUnits) {
            if (!trackLength || !roadSegments.length) return;
            let currentPoliceCount = 0;
            for (let i = 0; i < trafficCars.length; i++) {
                if (trafficCars[i].userData && trafficCars[i].userData.isPolice) {
                    currentPoliceCount++;
                }
            }
            const playerSpd = Math.hypot(velocityX, velocityZ);
            while (currentPoliceCount < desiredTotalUnits && currentPoliceCount < POLICE_MAX_UNITS) {
                const behindMeters = 64 + currentPoliceCount * 14 + Math.random() * 10;
                const spawnProg = ((playerTrackProgress - behindMeters / trackLength) % 1 + 1) % 1;
                const spawnLat = pickClearRearLateralAtProgress(spawnProg, playerRoadLateral);
                const initSpd = THREE.MathUtils.clamp(Math.max(playerSpd + 20, 36), 24, POLICE_MAX_CHASE_SPEED_MPS);
                const unit = createTrafficNpcUnit('police', spawnProg, spawnLat, 0, initSpd);
                unit.userData.policeState = 'chase';
                unit.userData.targetSpeed = initSpd;
                syncPolicePhysicsFromNpc(unit);
                currentPoliceCount++;
            }
            if (trafficSortedIndices.length !== trafficCars.length) {
                trafficSortedIndices.length = trafficCars.length;
                for (let i = 0; i < trafficCars.length; i++) {
                    trafficSortedIndices[i] = i;
                }
                trafficSortedIndices.sort((a, b) => trafficCars[a].userData.progress - trafficCars[b].userData.progress);
            }
        }

        function populateInitialTraffic() {
            clearTrafficCars();
            if (!trackLength || !roadSegments.length) return;
            ensurePolicePointLights();

            const safeMarginMeters = 64;
            const usableTrackMeters = Math.max(200, trackLength - safeMarginMeters * 2);
            const plannedSlots = [];

            for (let laneIdx = 0; laneIdx < VALID_LANES.length; laneIdx++) {
                const chosenLane = VALID_LANES[laneIdx];
                let distAlongUsable = 14 + laneIdx * 24 + Math.random() * 34;

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

            // Hanya 1 unit patroli polisi di jalan tol pada awal permainan (unit ke-2 & ke-3 turun saat eskalasi)
            if (plannedSlots.length >= POLICE_UNIT_COUNT) {
                for (let p = 0; p < POLICE_UNIT_COUNT; p++) {
                    const targetDist = Math.min(usableTrackMeters * 0.45, 165 + p * 120);
                    let bestIdx = -1;
                    let bestScore = Infinity;
                    for (let s = 0; s < plannedSlots.length; s++) {
                        if (plannedSlots[s].variant === 'police') continue;
                        const distErr = Math.abs(plannedSlots[s].distAlongUsable - targetDist);
                        const truckPenalty = plannedSlots[s].variant === 'truck' ? 80 : 0;
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
                const colorIndex = Math.floor(Math.random() * trafficBodyMaterials.length);
                const npc = createTrafficNpcUnit(slot.variant, slot.progress, slot.chosenLane, colorIndex);
                npc.userData.laneChangeCooldown = Math.random() * 2.0;
            }
        }

        function findBestPursuitGapLateral(sortedPos, data, desiredLateral, playerDeltaMeters, minCombinedLen, minCombinedWid, maxLatLimit) {
            const totalCars = trafficCars.length;
            const rawCandidates = [
                desiredLateral,
                -6.15, -5.3, -4.8, -3.6, -2.45, -1.25, 0, 1.25, 2.45, 3.6, 4.8, 5.3, 6.15
            ];
            let bestLat = THREE.MathUtils.clamp(desiredLateral, -maxLatLimit + 0.1, maxLatLimit - 0.1);
            let bestScore = -Infinity;

            for (let c = 0; c < rawCandidates.length; c++) {
                const candLat = THREE.MathUtils.clamp(rawCandidates[c], -maxLatLimit + 0.1, maxLatLimit - 0.1);
                let minAheadClear = 48;
                let immediateBlocked = false;

                for (let step = 1; step < totalCars; step++) {
                    const other = trafficCars[trafficSortedIndices[(sortedPos + step) % totalCars]].userData;
                    let aheadDist = (other.progress - data.progress) * trackLength;
                    if (aheadDist < 0) aheadDist += trackLength;
                    if (aheadDist >= 48) break;

                    const reqLat = (data.halfWidth || 0.91) + (other.halfWidth || 0.9) + 0.28;
                    if (Math.abs(other.lateralPos - candLat) < reqLat) {
                        if (aheadDist < 8.5) immediateBlocked = true;
                        if (aheadDist < minAheadClear) minAheadClear = aheadDist;
                    }
                }

                for (let step = 1; step < totalCars; step++) {
                    const other = trafficCars[trafficSortedIndices[(sortedPos - step + totalCars) % totalCars]].userData;
                    let behindDist = (data.progress - other.progress) * trackLength;
                    if (behindDist < 0) behindDist += trackLength;
                    if (behindDist >= 9.0) break;

                    const reqLat = (data.halfWidth || 0.91) + (other.halfWidth || 0.9) + 0.24;
                    if (Math.abs(other.lateralPos - candLat) < reqLat && behindDist < 5.5) {
                        immediateBlocked = true;
                    }
                }

                let rearConePenalty = 0;
                if (hasStarted && playerDeltaMeters > -1.5 && playerDeltaMeters < minCombinedLen + 9.0 &&
                    Math.abs(candLat - playerRoadLateral) < minCombinedWid + 0.35) {
                    rearConePenalty = 14;
                }

                const score = (immediateBlocked ? -1000 : minAheadClear) -
                    Math.abs(candLat - desiredLateral) * 1.9 -
                    Math.abs(candLat - data.lateralPos) * 0.35 -
                    rearConePenalty;

                if (score > bestScore) {
                    bestScore = score;
                    bestLat = candLat;
                }
            }

            return bestLat;
        }

        function isPursuitCorridorClear(sortedPos, data, targetLat, aheadCheck = 18, behindCheck = 4) {
            const totalCars = trafficCars.length;
            for (let step = 1; step < totalCars; step++) {
                const other = trafficCars[trafficSortedIndices[(sortedPos + step) % totalCars]].userData;
                let aheadDist = (other.progress - data.progress) * trackLength;
                if (aheadDist < 0) aheadDist += trackLength;
                if (aheadDist >= aheadCheck) break;
                const reqLat = (data.halfWidth || 0.91) + (other.halfWidth || 0.9) + 0.3;
                if (Math.abs(other.lateralPos - targetLat) < reqLat) return false;
            }
            for (let step = 1; step < totalCars; step++) {
                const other = trafficCars[trafficSortedIndices[(sortedPos - step + totalCars) % totalCars]].userData;
                let behindDist = (data.progress - other.progress) * trackLength;
                if (behindDist < 0) behindDist += trackLength;
                if (behindDist >= behindCheck) break;
                const reqLat = (data.halfWidth || 0.91) + (other.halfWidth || 0.9) + 0.25;
                if (Math.abs(other.lateralPos - targetLat) < reqLat) return false;
            }
            return true;
        }

        function isTargetLaneClearForNpc(sortedPos, data, candLane, isPursuit = false, incidentActive = false) {
            const totalCars = trafficCars.length;
            const minAhead = isPursuit ? 13 : 20;
            const minBehind = isPursuit ? 10 : 17;

            // Cek NPC di depan dalam lajur target
            for (let step = 1; step < totalCars; step++) {
                const other = trafficCars[trafficSortedIndices[(sortedPos + step) % totalCars]].userData;
                let aheadDist = (other.progress - data.progress) * trackLength;
                if (aheadDist < 0) aheadDist += trackLength;
                if (aheadDist >= 52) break;

                if (Math.abs(other.lateralPos - candLane) <= 2.3 || Math.abs(other.lane - candLane) < 0.6) {
                    const otherIsBlocked = !isPursuit && ((other.isPolice && other.policeState === 'chase') || other.speed < 9.0);
                    if (otherIsBlocked && aheadDist < 46) return false;
                    if (aheadDist < minAhead) return false;
                    if (!isPursuit && other.speed < data.speed - 0.5 && aheadDist < 32) return false;
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

            // Cek jarak aman & hindari lajur tempat pemain/polisi berhenti atau melambat
            if (hasStarted) {
                let playerDelta = (playerTrackProgress - data.progress) * trackLength;
                if (playerDelta > trackLength * 0.5) playerDelta -= trackLength;
                if (playerDelta < -trackLength * 0.5) playerDelta += trackLength;

                if (!isPursuit) {
                    const isPlayerSlow = Math.hypot(velocityX, velocityZ) < 11.5;
                    const aheadCheckRange = (incidentActive || isPlayerSlow) ? 58 : 24;
                    if (Math.abs(playerRoadLateral - candLane) <= 2.65 && playerDelta > -26 && playerDelta < aheadCheckRange) {
                        return false;
                    }
                } else if (playerDelta > -2.5 && playerDelta < 18 && Math.abs(playerRoadLateral - candLane) <= 2.15) {
                    // Polisi yang sedang menyalip/menghindar lalu lintas tidak boleh membelok masuk tepat ke belakang bumper pemain
                    return false;
                }
            }

            return true;
        }

        function resolveNpcToNpcCollisions(totalCars) {
            for (let k = 0; k < totalCars; k++) {
                const npcA = trafficCars[trafficSortedIndices[k]];
                const a = npcA.userData;

                for (let step = 1; step < totalCars; step++) {
                    const npcB = trafficCars[trafficSortedIndices[(k + step) % totalCars]];
                    const b = npcB.userData;
                    let longDist = (b.progress - a.progress) * trackLength;
                    if (longDist < 0) longDist += trackLength;
                    if (longDist >= 9.0) break;

                    const yA = a.freeBodyActive ? (a.fbY - (a.localComY || 0.7)) : npcA.position.y;
                    const yB = b.freeBodyActive ? (b.fbY - (b.localComY || 0.7)) : npcB.position.y;
                    if (Math.abs(yA - yB) > 2.3) continue;

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
                        const pt = getTrackWorldPointAt(a.progress, 0);

                        if (latPen < longPen) {
                            const dir = latDiff >= 0 ? 1 : -1;
                            const sep = latPen + 0.02;
                            if (!a.freeBodyActive) {
                                const limitA = getNpcWallLateralLimit(a);
                                a.lateralPos = THREE.MathUtils.clamp(a.lateralPos - dir * sep * shareA, -limitA, limitA);
                            } else {
                                a.fbX -= pt.rightX * dir * sep * shareA;
                                a.fbZ -= pt.rightZ * dir * sep * shareA;
                            }
                            if (!b.freeBodyActive) {
                                const limitB = getNpcWallLateralLimit(b);
                                b.lateralPos = THREE.MathUtils.clamp(b.lateralPos + dir * sep * shareB, -limitB, limitB);
                            } else {
                                b.fbX += pt.rightX * dir * sep * shareB;
                                b.fbZ += pt.rightZ * dir * sep * shareB;
                            }

                            const velLatA = a.freeBodyActive ? (a.fbVx * pt.rightX + a.fbVz * pt.rightZ) : a.lateralVelocity;
                            const velLatB = b.freeBodyActive ? (b.fbVx * pt.rightX + b.fbVz * pt.rightZ) : b.lateralVelocity;
                            let jLat = 0;
                            const relLatV = velLatA - velLatB;
                            if (relLatV * dir > 0) {
                                const relClosing = relLatV * dir;
                                const restitution = (a.freeBodyActive || b.freeBodyActive) ? 0.25 : 0.08;
                                jLat = (1 + restitution) * relClosing / totalInvM;
                                const latFbThreshA = (a.isPolice && a.policeState === 'chase') ? 8.5 : 4.2;
                                const latFbThreshB = (b.isPolice && b.policeState === 'chase') ? 8.5 : 4.2;

                                if (relClosing > 4.2 || a.freeBodyActive || b.freeBodyActive) {
                                    const deltaVa = jLat * invMa;
                                    const deltaVb = jLat * invMb;
                                    if (relClosing > latFbThreshA && deltaVa > 1.3) enterNpcFreeBodyMode(npcA);
                                    if (relClosing > latFbThreshB && deltaVb > 1.3) enterNpcFreeBodyMode(npcB);
                                    const iRollA = a.inertiaRoll || 700;
                                    const iRollB = b.inertiaRoll || 700;
                                    const iYawA = a.inertiaYaw || 2800;
                                    const iYawB = b.inertiaYaw || 2800;
                                    const cgA = a.cgHeight || 0.65;
                                    const cgB = b.cgHeight || 0.65;
                                    // Lengan offset memanjang dari selisih progress (sejajar = 0 -> hampir tidak memuntir)
                                    const armLong = Math.min(Math.max(a.halfLength, b.halfLength) * 0.45, longDist * 0.35);

                                    if (a.freeBodyActive) {
                                        a.fbVx -= pt.rightX * dir * deltaVa;
                                        a.fbVz -= pt.rightZ * dir * deltaVa;
                                        a.fbRollVel = THREE.MathUtils.clamp((a.fbRollVel || 0) - (dir * jLat * Math.max(0.18, cgA - 0.34)) / iRollA, -5.5, 5.5);
                                        a.fbYawVel = THREE.MathUtils.clamp((a.fbYawVel || 0) + (dir * jLat * armLong) / iYawA, -6.5, 6.5);
                                        const rollThreshA = 9.81 * ((a.halfWidth || 0.9) / Math.max(0.35, cgA)) * 1.15;
                                        if ((a.fbLaunchCooldown || 0) <= 0 && deltaVa > rollThreshA) {
                                            a.fbVy = Math.max(a.fbVy, Math.min(4.2, (deltaVa - rollThreshA) * 0.38));
                                            a.fbGrounded = false;
                                            a.fbLaunchCooldown = 0.25;
                                        }
                                        a.fbRestTimer = 0;
                                        a.recoveringUpright = false;
                                    } else {
                                        a.lateralVelocity -= dir * deltaVa;
                                    }
                                    if (b.freeBodyActive) {
                                        b.fbVx += pt.rightX * dir * deltaVb;
                                        b.fbVz += pt.rightZ * dir * deltaVb;
                                        b.fbRollVel = THREE.MathUtils.clamp((b.fbRollVel || 0) + (dir * jLat * Math.max(0.18, cgB - 0.34)) / iRollB, -5.5, 5.5);
                                        b.fbYawVel = THREE.MathUtils.clamp((b.fbYawVel || 0) + (dir * jLat * armLong) / iYawB, -6.5, 6.5);
                                        const rollThreshB = 9.81 * ((b.halfWidth || 0.9) / Math.max(0.35, cgB)) * 1.15;
                                        if ((b.fbLaunchCooldown || 0) <= 0 && deltaVb > rollThreshB) {
                                            b.fbVy = Math.max(b.fbVy, Math.min(4.2, (deltaVb - rollThreshB) * 0.38));
                                            b.fbGrounded = false;
                                            b.fbLaunchCooldown = 0.25;
                                        }
                                        b.fbRestTimer = 0;
                                        b.recoveringUpright = false;
                                    } else {
                                        b.lateralVelocity += dir * deltaVb;
                                    }
                                } else {
                                    a.lateralVelocity -= dir * jLat * invMa;
                                    b.lateralVelocity += dir * jLat * invMb;
                                    if (Math.abs(relLatV) > 1.4) {
                                        a.controlLossTimer = Math.max(a.controlLossTimer, 0.45);
                                        b.controlLossTimer = Math.max(b.controlLossTimer, 0.55);
                                        b.yawVelocity += dir * 0.35;
                                        b.rollVelocity += dir * 0.55;
                                    }
                                }
                                a.pushedTimer = Math.max(a.pushedTimer, 0.6);
                                b.pushedTimer = Math.max(b.pushedTimer, 0.7);
                            }

                            const aPhysActive = !a.freeBodyActive && a.isPolice && a.policeState === 'chase' && a.policePhysics && a.policePhysics.initialized;
                            const bPhysActive = !b.freeBodyActive && b.isPolice && b.policeState === 'chase' && b.policePhysics && b.policePhysics.initialized;
                            if (aPhysActive) {
                                a.policePhysics.x -= pt.rightX * dir * sep * shareA;
                                a.policePhysics.z -= pt.rightZ * dir * sep * shareA;
                                a.policePhysics.vx -= pt.rightX * dir * jLat * invMa;
                                a.policePhysics.vz -= pt.rightZ * dir * jLat * invMa;
                            }
                            if (bPhysActive) {
                                b.policePhysics.x += pt.rightX * dir * sep * shareB;
                                b.policePhysics.z += pt.rightZ * dir * sep * shareB;
                                b.policePhysics.vx += pt.rightX * dir * jLat * invMb;
                                b.policePhysics.vz += pt.rightZ * dir * jLat * invMb;
                            }
                        } else {
                            const sep = longPen + 0.05;
                            if (!a.freeBodyActive) {
                                a.progress = (a.progress - (sep * shareA) / trackLength + 1) % 1;
                            } else {
                                a.fbX -= pt.fwdX * sep * shareA;
                                a.fbZ -= pt.fwdZ * sep * shareA;
                            }
                            if (!b.freeBodyActive) {
                                b.progress = (b.progress + (sep * shareB) / trackLength) % 1;
                            } else {
                                b.fbX += pt.fwdX * sep * shareB;
                                b.fbZ += pt.fwdZ * sep * shareB;
                            }

                            const velLongA = a.freeBodyActive ? (a.fbVx * pt.fwdX + a.fbVz * pt.fwdZ) : a.speed;
                            const velLongB = b.freeBodyActive ? (b.fbVx * pt.fwdX + b.fbVz * pt.fwdZ) : b.speed;
                            let jLong = 0;
                            const relLongV = velLongA - velLongB;
                            if (relLongV > 0) {
                                const restitution = (a.freeBodyActive || b.freeBodyActive) ? 0.16 : 0.08;
                                jLong = (1 + restitution) * relLongV / totalInvM;
                                const longFbThreshA = (a.isPolice && a.policeState === 'chase') ? 9.0 : 4.5;
                                const longFbThreshB = (b.isPolice && b.policeState === 'chase') ? 9.0 : 4.5;
                                if (relLongV > 4.5 || a.freeBodyActive || b.freeBodyActive) {
                                    const deltaVaLong = jLong * invMa;
                                    const deltaVbLong = jLong * invMb;
                                    if (relLongV > longFbThreshA && deltaVaLong > 1.3) enterNpcFreeBodyMode(npcA);
                                    if (relLongV > longFbThreshB && deltaVbLong > 1.3) enterNpcFreeBodyMode(npcB);
                                    const iYawA = a.inertiaYaw || 2800;
                                    const iYawB = b.inertiaYaw || 2800;
                                    const iPitchA = a.inertiaPitch || 2800;
                                    const iPitchB = b.inertiaPitch || 2800;
                                    // Torsi yaw murni dari selisih offset lateral titik kontak (tanpa nilai acak)
                                    const clampedLatArm = THREE.MathUtils.clamp(latDiff * 0.5, -Math.min(a.halfWidth, b.halfWidth), Math.min(a.halfWidth, b.halfWidth));
                                    const pitchLeverA = Math.min(0.24, Math.max(0.08, (a.cgHeight || 0.65) * 0.25));
                                    const pitchLeverB = Math.min(0.24, Math.max(0.08, (b.cgHeight || 0.65) * 0.25));

                                    if (a.freeBodyActive) {
                                        a.fbVx -= pt.fwdX * deltaVaLong;
                                        a.fbVz -= pt.fwdZ * deltaVaLong;
                                        a.fbPitchVel = THREE.MathUtils.clamp((a.fbPitchVel || 0) - (jLong * pitchLeverA) / iPitchA, -3.5, 3.5);
                                        a.fbYawVel = THREE.MathUtils.clamp((a.fbYawVel || 0) - (jLong * clampedLatArm) / iYawA, -6.5, 6.5);
                                        if ((a.fbLaunchCooldown || 0) <= 0 && relLongV > 25 && deltaVaLong > 12) {
                                            a.fbVy = Math.max(a.fbVy, Math.min(4.0, (relLongV - 25) * 0.18));
                                            a.fbGrounded = false;
                                            a.fbLaunchCooldown = 0.25;
                                        }
                                        a.fbRestTimer = 0;
                                        a.recoveringUpright = false;
                                    } else {
                                        a.speed = Math.max(0, a.speed - deltaVaLong);
                                    }
                                    if (b.freeBodyActive) {
                                        b.fbVx += pt.fwdX * deltaVbLong;
                                        b.fbVz += pt.fwdZ * deltaVbLong;
                                        b.fbPitchVel = THREE.MathUtils.clamp((b.fbPitchVel || 0) + (jLong * pitchLeverB) / iPitchB, -3.5, 3.5);
                                        b.fbYawVel = THREE.MathUtils.clamp((b.fbYawVel || 0) - (jLong * clampedLatArm) / iYawB, -6.5, 6.5);
                                        if ((b.fbLaunchCooldown || 0) <= 0 && relLongV > 25 && deltaVbLong > 12) {
                                            b.fbVy = Math.max(b.fbVy, Math.min(4.6, (relLongV - 25) * 0.20));
                                            b.fbGrounded = false;
                                            b.fbLaunchCooldown = 0.25;
                                        }
                                        b.fbRestTimer = 0;
                                        b.recoveringUpright = false;
                                    } else {
                                        b.speed = Math.min(b.isPolice && b.policeState === 'chase' ? POLICE_MAX_CHASE_SPEED_MPS : 42, b.speed + deltaVbLong);
                                    }
                                } else {
                                    a.speed = Math.max(0, a.speed - jLong * invMa);
                                    b.speed = Math.min(b.isPolice && b.policeState === 'chase' ? POLICE_MAX_CHASE_SPEED_MPS : 42, b.speed + jLong * invMb);
                                    if (relLongV > 2.2) {
                                        a.controlLossTimer = Math.max(a.controlLossTimer, 0.35);
                                        b.controlLossTimer = Math.max(b.controlLossTimer, 0.4);
                                    }
                                }
                                a.pushedTimer = Math.max(a.pushedTimer, 0.6);
                                b.pushedTimer = Math.max(b.pushedTimer, 0.8);
                            }

                            const aPhysActive = !a.freeBodyActive && a.isPolice && a.policeState === 'chase' && a.policePhysics && a.policePhysics.initialized;
                            const bPhysActive = !b.freeBodyActive && b.isPolice && b.policeState === 'chase' && b.policePhysics && b.policePhysics.initialized;
                            if (aPhysActive) {
                                a.policePhysics.x -= pt.fwdX * sep * shareA;
                                a.policePhysics.z -= pt.fwdZ * sep * shareA;
                                a.policePhysics.vx -= pt.fwdX * jLong * invMa;
                                a.policePhysics.vz -= pt.fwdZ * jLong * invMa;
                            }
                            if (bPhysActive) {
                                b.policePhysics.x += pt.fwdX * sep * shareB;
                                b.policePhysics.z += pt.fwdZ * sep * shareB;
                                b.policePhysics.vx += pt.fwdX * jLong * invMb;
                                b.policePhysics.vz += pt.fwdZ * jLong * invMb;
                            }
                        }
                    }
                }
            }
        }

        function updateTrafficFlow(dt) {
            let totalCars = trafficCars.length;
            if (!totalCars) {
                resetPoliceLightPool();
                return;
            }

            policeFlashClock += dt;
            if (policeToastTimer > 0) {
                policeToastTimer = Math.max(0, policeToastTimer - dt);
                if (policeToastTimer <= 0) {
                    hidePoliceAlertToast();
                }
            }
            const playerSpeedMps = Math.hypot(velocityX, velocityZ);
            const playerHalfLen = selectedVehicleType === 'motorcycle'
                ? nmaxNeoSpecs.length / 2
                : innovaZenixSpecs.length / 2;
            const playerHalfWid = selectedVehicleType === 'motorcycle'
                ? nmaxNeoSpecs.width / 2
                : innovaZenixSpecs.width / 2;

            if (trafficSortedIndices.length !== totalCars) {
                trafficSortedIndices.length = totalCars;
                for (let i = 0; i < totalCars; i++) {
                    trafficSortedIndices[i] = i;
                }
            }
            trafficSortedIndices.sort((a, b) => trafficCars[a].userData.progress - trafficCars[b].userData.progress);

            if (policeRamPenaltyCooldown > 0) {
                policeRamPenaltyCooldown = Math.max(0, policeRamPenaltyCooldown - dt);
            }

            // Deteksi 1 unit polisi awal lalu kelola eskalasi 10 menit (Tingkat 1 -> Tingkat 2 -> Tingkat 3)
            const policeCandidates = [];
            let triggeredPoliceCount = 0;
            for (let k = 0; k < totalCars; k++) {
                const npc = trafficCars[trafficSortedIndices[k]];
                const data = npc.userData;
                if (!data.isPolice) continue;

                const toPlayerX = playerX - npc.position.x;
                const toPlayerZ = playerZ - npc.position.z;
                const toPlayerDist = Math.hypot(toPlayerX, toPlayerZ);
                const policeFwdX = -Math.sin(npc.rotation.y);
                const policeFwdZ = -Math.cos(npc.rotation.y);
                const forwardDot = toPlayerDist > 0.001
                    ? (toPlayerX * policeFwdX + toPlayerZ * policeFwdZ) / toPlayerDist
                    : 1;
                const sameElevation = Math.abs(playerY - npc.position.y) < 4.8;
                const inVisionCone = sameElevation &&
                    toPlayerDist <= POLICE_VISION_RANGE &&
                    forwardDot >= POLICE_VISION_COS_HALF_ANGLE;
                const closeSpeedPass = sameElevation && toPlayerDist <= 30;

                if (hasStarted && playerSpeedMps > POLICE_SPEED_LIMIT_MPS && (inVisionCone || closeSpeedPass)) {
                    if (data.policeState !== 'chase') {
                        data.policeState = 'chase';
                        if (!data.freeBodyActive) syncPolicePhysicsFromNpc(npc);
                    }
                    data.chaseCalmTimer = 0;
                }
                if (data.policeState === 'chase') {
                    if (!data.freeBodyActive && (!data.policePhysics || !data.policePhysics.initialized)) {
                        syncPolicePhysicsFromNpc(npc);
                    }
                    triggeredPoliceCount++;
                }
                policeCandidates.push({ npc, data, toPlayerDist, sameElevation });
            }

            if (hasStarted && !isGameOver) {
                if (triggeredPoliceCount >= 1 && policeThreatLevel < 1) {
                    policeThreatLevel = 1;
                    policeEscalationElapsed = 0;
                    showPoliceAlertToast(1);
                }

                if (policeThreatLevel >= 1 && policeThreatLevel < 3 && startCountdownTimer <= 0) {
                    policeEscalationElapsed += dt;
                    if (policeEscalationElapsed >= POLICE_ESCALATION_SECONDS) {
                        policeThreatLevel += 1;
                        policeEscalationElapsed = 0;
                        spawnEscalationPoliceUnit(policeThreatLevel);
                        totalCars = trafficCars.length;
                        for (let c = 0; c < trafficCars.length; c++) {
                            const u = trafficCars[c];
                            if (u.userData && u.userData.isPolice) {
                                if (u.userData.policeState !== 'chase') {
                                    u.userData.policeState = 'chase';
                                    if (!u.userData.freeBodyActive) syncPolicePhysicsFromNpc(u);
                                    triggeredPoliceCount++;
                                }
                                if (!policeCandidates.some(p => p.npc === u)) {
                                    const d = Math.hypot(playerX - u.position.x, playerZ - u.position.z);
                                    policeCandidates.push({
                                        npc: u,
                                        data: u.userData,
                                        toPlayerDist: d,
                                        sameElevation: Math.abs(playerY - u.position.y) < 4.8
                                    });
                                }
                            }
                        }
                        showPoliceAlertToast(policeThreatLevel);
                    }
                }
            }
            const activeTier = Math.max(policeThreatLevel, triggeredPoliceCount >= 3 ? 3 : (triggeredPoliceCount === 2 ? 2 : (triggeredPoliceCount >= 1 ? 1 : 0)));

            if (playerRoadLateral > 0.35) {
                policeWallPushSide = -1; // Pemain lebih dekat dinding kanan -> dorong dari kiri
            } else if (playerRoadLateral < -0.35) {
                policeWallPushSide = 1;  // Pemain lebih dekat dinding kiri -> dorong dari kanan
            }

            const policeTacticalRoles = new Map();
            const policeChaseIndices = new Map();
            const activeChasers = [];
            let activeTacticalPoliceCount = 0;
            if (triggeredPoliceCount > 0) {
                const activePolice = policeCandidates
                    .filter(c => c.data.policeState === 'chase')
                    .sort((a, b) => a.toPlayerDist - b.toPlayerDist);

                const tacticalUnits = [];
                activePolice.forEach((entry, idx) => {
                    policeChaseIndices.set(entry.data, idx);
                    let pDelta = (playerTrackProgress - entry.data.progress) * trackLength;
                    if (pDelta > trackLength * 0.5) pDelta -= trackLength;
                    if (pDelta < -trackLength * 0.5) pDelta += trackLength;

                    // Jika unit pengejar terpental/tertinggal terlalu jauh (>215m), susul kembali dari jarak aman belakang agar tailing tidak pernah putus
                    if (!entry.data.freeBodyActive && hasStarted && !isGameOver && Math.abs(pDelta) > 215) {
                        const redispatchBehind = 72 + idx * 14;
                        const newProg = ((playerTrackProgress - redispatchBehind / trackLength) % 1 + 1) % 1;
                        const newLat = pickClearRearLateralAtProgress(newProg, playerRoadLateral);
                        const catchSpd = THREE.MathUtils.clamp(Math.max(playerSpeedMps + 22, 38), 26, POLICE_MAX_CHASE_SPEED_MPS);
                        entry.data.progress = newProg;
                        entry.data.lateralPos = newLat;
                        entry.data.lane = newLat;
                        entry.data.lateralVelocity = 0;
                        entry.data.yawOffset = 0;
                        entry.data.yawVelocity = 0;
                        entry.data.controlLossTimer = 0;
                        entry.data.pushedTimer = 0;
                        entry.data.speed = catchSpd;
                        placeOnTrack(entry.npc, newProg, newLat);
                        syncPolicePhysicsFromNpc(entry.npc);
                        pDelta = redispatchBehind;
                    }

                    entry.playerDeltaMeters = pDelta;

                    if (!entry.data.freeBodyActive) {
                        activeChasers.push({
                            progress: entry.data.progress,
                            lateralPos: entry.data.lateralPos,
                            speed: entry.data.speed
                        });
                        tacticalUnits.push(entry);
                    } else {
                        policeTacticalRoles.set(entry.data, 'pin_side_wall');
                    }
                });

                activeTacticalPoliceCount = tacticalUnits.length;
                if (tacticalUnits.length === 1) {
                    // Tingkat 1 (1 unit): tailing murni dari belakang tanpa menabrak; Tingkat 3 tetap agresif jika unit lain sedang pulih
                    policeTacticalRoles.set(tacticalUnits[0].data, activeTier >= 3 ? 'pin_side_wall' : 'tail_rear');
                } else if (tacticalUnits.length === 2) {
                    const blocker = tacticalUnits[0].playerDeltaMeters <= tacticalUnits[1].playerDeltaMeters
                        ? tacticalUnits[0]
                        : tacticalUnits[1];
                    const secondUnit = blocker === tacticalUnits[0] ? tacticalUnits[1] : tacticalUnits[0];
                    if (activeTier >= 3) {
                        policeTacticalRoles.set(blocker.data, 'block_front');
                        policeTacticalRoles.set(secondUnit.data, 'pin_side_wall');
                    } else {
                        // Tingkat 2 (2 unit): 1 unit salip lebar & blokir depan halus tanpa tabrak, 1 unit tailing belakang
                        policeTacticalRoles.set(blocker.data, 'block_front_soft');
                        policeTacticalRoles.set(secondUnit.data, 'tail_rear');
                    }
                } else if (tacticalUnits.length >= 3) {
                    // Tingkat 3 (3 unit): mode penuh — 1 blokir depan + 2 jepit kiri-kanan bersamaan menekan ke tembok
                    let blocker = tacticalUnits[0];
                    for (let t = 1; t < tacticalUnits.length; t++) {
                        if (tacticalUnits[t].playerDeltaMeters < blocker.playerDeltaMeters) {
                            blocker = tacticalUnits[t];
                        }
                    }
                    policeTacticalRoles.set(blocker.data, 'block_front');

                    const sideCandidates = tacticalUnits.filter(u => u !== blocker);
                    const pinA = sideCandidates[0];
                    const pinB = sideCandidates[1];
                    const scoreA = (pinA.data.lateralPos - playerRoadLateral) * policeWallPushSide;
                    const scoreB = (pinB.data.lateralPos - playerRoadLateral) * policeWallPushSide;
                    if (scoreA >= scoreB) {
                        policeTacticalRoles.set(pinA.data, 'pin_side_wall');
                        policeTacticalRoles.set(pinB.data, 'pin_side_opposite');
                    } else {
                        policeTacticalRoles.set(pinB.data, 'pin_side_wall');
                        policeTacticalRoles.set(pinA.data, 'pin_side_opposite');
                    }
                    for (let t = 2; t < sideCandidates.length; t++) {
                        policeTacticalRoles.set(sideCandidates[t].data, 'tail_rear');
                    }
                }
            }

            const isPlayerStoppingOrStopped = hasStarted && playerSpeedMps <= 5.5;
            const incidentActive = hasStarted && (playerSpeedMps < 11.5 || triggeredPoliceCount > 0);
            if (npcHornGlobalCooldown > 0) npcHornGlobalCooldown = Math.max(0, npcHornGlobalCooldown - dt);

            for (let k = 0; k < totalCars; k++) {
                const i = trafficSortedIndices[k];
                const npc = trafficCars[i];
                const data = npc.userData;
                const prevSpeed = data.speed;
                const prevControlLoss = data.controlLossTimer > 0;
                const isChasingPolice = data.isPolice && data.policeState === 'chase';

                if (data.hitCooldown > 0) data.hitCooldown = Math.max(0, data.hitCooldown - dt);
                if (data.fbLaunchCooldown > 0) data.fbLaunchCooldown = Math.max(0, data.fbLaunchCooldown - dt);
                if (data.pushedTimer > 0) data.pushedTimer = Math.max(0, data.pushedTimer - dt);
                if (data.controlLossTimer > 0) data.controlLossTimer = Math.max(0, data.controlLossTimer - dt);
                if (data.laneChangeCooldown > 0) data.laneChangeCooldown = Math.max(0, data.laneChangeCooldown - dt);
                if (data.hornCooldown > 0) data.hornCooldown = Math.max(0, data.hornCooldown - dt);

                if (data.freeBodyActive) {
                    stepNpcFreeBodyPhysics(npc, data, dt);
                    continue;
                }

                let closestAheadDist = Infinity;
                let closestAheadSpeed = data.targetSpeed;
                let closestAheadHalfLen = 2.1;
                let closestAheadIsIncident = false;
                let closestAheadIsSlowOrStopped = false;
                let closestAheadLateral = data.lane;

                for (let step = 1; step < totalCars; step++) {
                    const otherIdx = trafficSortedIndices[(k + step) % totalCars];
                    const otherData = trafficCars[otherIdx].userData;
                    let aheadDist = (otherData.progress - data.progress) * trackLength;
                    if (aheadDist < 0) aheadDist += trackLength;
                    if (aheadDist >= 78) break;

                    const lateralClear = Math.abs(otherData.lateralPos - data.lateralPos);
                    const policeClearance = (data.halfWidth || 0.91) + (otherData.halfWidth || 0.9) + 0.28;
                    const laneMatch = isChasingPolice
                        ? lateralClear <= policeClearance
                        : (lateralClear <= 2.2 || Math.abs(otherData.lane - data.lane) < 0.6);
                    if (aheadDist > 0 && laneMatch) {
                        if (aheadDist < closestAheadDist) {
                            closestAheadDist = aheadDist;
                            closestAheadSpeed = otherData.speed;
                            closestAheadHalfLen = otherData.halfLength || 2.1;
                            closestAheadIsIncident = (otherData.isPolice && otherData.policeState === 'chase') || otherData.speed < 8.5;
                            closestAheadIsSlowOrStopped = otherData.speed < Math.max(9.5, data.targetSpeed - 2.6);
                            closestAheadLateral = otherData.lateralPos;
                        }
                    }
                }

                // NPC biasa selalu mendeteksi kendaraan pemain di depannya (terutama saat melambat/berhenti)
                if (!isChasingPolice && hasStarted) {
                    let playerAhead = (playerTrackProgress - data.progress) * trackLength;
                    if (playerAhead < 0) playerAhead += trackLength;
                    if (playerAhead > 0 && playerAhead < 78) {
                        const playerLatClear = Math.abs(playerRoadLateral - data.lateralPos);
                        const latThreshold = Math.max(
                            (data.halfWidth || 0.9) + playerHalfWid + 0.65,
                            playerSpeedMps < 10.5 ? 2.55 : 2.15
                        );
                        const playerLaneMatch = playerLatClear <= latThreshold ||
                            Math.abs(playerRoadLateral - data.lane) <= 2.25;
                        if (playerLaneMatch && playerAhead < closestAheadDist) {
                            closestAheadDist = playerAhead;
                            closestAheadSpeed = Math.max(0, playerSpeedMps);
                            closestAheadHalfLen = playerHalfLen;
                            closestAheadIsIncident = playerSpeedMps < 9.5 || triggeredPoliceCount > 0;
                            closestAheadIsSlowOrStopped = playerSpeedMps < Math.max(10.5, data.targetSpeed - 2.2);
                            closestAheadLateral = playerRoadLateral;
                        }
                    }
                }

                // Logika Pengejaran Presisi Anti-Tabrak: Tingkat 1 tailing belakang, Tingkat 2 blokir depan tanpa tabrak, Tingkat 3 jepit penuh
                let playerDeltaMeters = 0;
                const tacticalRole = isChasingPolice ? (policeTacticalRoles.get(data) || 'tail_rear') : null;
                let pursuitTargetLateral = playerRoadLateral;
                let minCombinedLen = (data.halfLength || 2.15) + playerHalfLen;
                let minCombinedWid = (data.halfWidth || 0.91) + playerHalfWid;

                const tierMaxChaseSpeed = activeTier >= 3
                    ? POLICE_MAX_CHASE_SPEED_MPS
                    : (activeTier === 2 ? 215 * TRAFFIC_KMH_TO_MPS : 208 * TRAFFIC_KMH_TO_MPS);

                if (isChasingPolice) {
                    playerDeltaMeters = (playerTrackProgress - data.progress) * trackLength;
                    if (playerDeltaMeters > trackLength * 0.5) playerDeltaMeters -= trackLength;
                    if (playerDeltaMeters < -trackLength * 0.5) playerDeltaMeters += trackLength;

                    const wallPushSide = policeWallPushSide;
                    const latDiffFromPlayer = data.lateralPos - playerRoadLateral;
                    const latDistToPlayer = Math.abs(latDiffFromPlayer);
                    const inRearDangerCone = playerDeltaMeters > -(minCombinedLen + 0.4) &&
                        playerDeltaMeters < (minCombinedLen + 11.0) &&
                        latDistToPlayer < (minCombinedWid + 0.55);

                    if (tacticalRole === 'tail_rear') {
                        // Tailing murni rapat (~1m) dari belakang: beri tekanan konstan tepat di belakang bumper pemain tanpa menabrak
                        pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.2, 6.2);
                        if (isPlayerStoppingOrStopped && activeTacticalPoliceCount <= 1) {
                            if (playerDeltaMeters >= -(minCombinedLen * 0.35)) {
                                const desiredGap = minCombinedLen + 0.95;
                                const gapError = playerDeltaMeters - desiredGap;
                                if (gapError > 0.14) {
                                    const safeApproach = Math.sqrt(2 * 4.6 * gapError);
                                    data.targetSpeed = THREE.MathUtils.clamp(
                                        playerSpeedMps + Math.min(tierMaxChaseSpeed - playerSpeedMps, safeApproach),
                                        0,
                                        tierMaxChaseSpeed
                                    );
                                } else {
                                    data.targetSpeed = playerSpeedMps <= POLICE_PIN_SPEED_MPS
                                        ? 0
                                        : Math.max(0, playerSpeedMps - 2.0);
                                }
                            } else {
                                data.targetSpeed = 0;
                            }
                        } else {
                            // Hanya geser menyamping jika polisi telanjur sejajar atau di depan bumper belakang pemain
                            if (playerDeltaMeters < minCombinedLen + 0.35 && latDistToPlayer < minCombinedWid + 0.95) {
                                const dodgeSide = playerRoadLateral >= 0 ? -1 : 1;
                                pursuitTargetLateral = THREE.MathUtils.clamp(
                                    playerRoadLateral + dodgeSide * (minCombinedWid + 1.35),
                                    -6.2,
                                    6.2
                                );
                            }
                            const tailGap = minCombinedLen + 1.05;
                            const gapError = playerDeltaMeters - tailGap;
                            if (gapError >= 0) {
                                let catchUp = THREE.MathUtils.clamp(gapError * 1.45, 0, 34);
                                if (gapError < 20) {
                                    catchUp = Math.min(catchUp, Math.sqrt(2 * 6.0 * gapError));
                                }
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + catchUp, 0, tierMaxChaseSpeed);
                            } else {
                                const easeBack = THREE.MathUtils.clamp(gapError * 5.2, -24, -0.6);
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + easeBack, 0, tierMaxChaseSpeed);
                            }
                            if (longitudinalAcceleration < -1.2 && playerDeltaMeters < minCombinedLen + 6.5) {
                                data.targetSpeed = Math.max(0, data.targetSpeed + longitudinalAcceleration * 0.48);
                            }
                        }
                    } else if (tacticalRole === 'block_front_soft') {
                        // Tingkat 2 blokir depan tanpa tabrak: salip lewat koridor samping lebar, masuk halus jauh di depan, lalu perlambat bertahap
                        const prefSide = -wallPushSide;
                        const prefMargin = prefSide > 0 ? (6.6 - playerRoadLateral) : (playerRoadLateral - (-6.6));
                        const altMargin = (-prefSide) > 0 ? (6.6 - playerRoadLateral) : (playerRoadLateral - (-6.6));
                        if (!data.policePassSide || (
                            data.policePassSide > 0 ? (6.6 - playerRoadLateral) : (playerRoadLateral + 6.6)
                        ) < minCombinedWid + 1.2) {
                            data.policePassSide = prefMargin >= (minCombinedWid + 1.85)
                                ? prefSide
                                : (altMargin >= prefMargin ? -prefSide : prefSide);
                        }
                        const passSide = data.policePassSide;

                        if (playerDeltaMeters > -(minCombinedLen + 7.5)) {
                            // Tahap 1: Salip aman di koridor lebar (~2m ruang samping) tanpa menyerempet pemain
                            const passOffset = minCombinedWid + 1.95;
                            pursuitTargetLateral = THREE.MathUtils.clamp(
                                playerRoadLateral + passSide * passOffset,
                                -6.35,
                                6.35
                            );
                            if (inRearDangerCone && latDistToPlayer < (minCombinedWid + 1.0)) {
                                const safeGapErr = playerDeltaMeters - (minCombinedLen + 4.0);
                                data.targetSpeed = THREE.MathUtils.clamp(
                                    playerSpeedMps + THREE.MathUtils.clamp(safeGapErr * 1.1, -12, 1.2),
                                    0,
                                    tierMaxChaseSpeed
                                );
                            } else {
                                data.targetSpeed = THREE.MathUtils.clamp(
                                    Math.max(playerSpeedMps + 18, 38),
                                    0,
                                    tierMaxChaseSpeed
                                );
                            }
                        } else if (Math.abs(data.lateralPos - playerRoadLateral) > 0.85) {
                            // Tahap 2: Sudah aman 7.5m+ di depan pemain -> masuk mulus ke depan jalur pemain
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.25, 6.25);
                            data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + 3.0, 0, tierMaxChaseSpeed);
                        } else {
                            // Tahap 3: Blokir depan halus -> perlambat progresif dengan tetap menjaga jarak aman agar tidak ditabrak belakang
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.25, 6.25);
                            const frontGap = -playerDeltaMeters - minCombinedLen;
                            if (playerSpeedMps <= POLICE_PIN_SPEED_MPS && frontGap <= 3.2) {
                                data.targetSpeed = 0;
                            } else if (frontGap < 4.0) {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + 0.8, 0, tierMaxChaseSpeed);
                            } else if (frontGap > 10.5) {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.72 - 3.2, 0, tierMaxChaseSpeed);
                            } else {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.86 - 1.6, 0, tierMaxChaseSpeed);
                            }
                        }
                    } else if (tacticalRole === 'pin_side_wall' || tacticalRole === 'pin_side_opposite') {
                        // Tingkat 3 penjepit samping kiri/kanan: sejajarkan bodi -> mepet & dorong ke dinding terdekat
                        const isPrimaryWallPin = tacticalRole === 'pin_side_wall';
                        const desiredSide = isPrimaryWallPin ? wallPushSide : -wallPushSide;
                        const wallMargin = desiredSide > 0
                            ? (6.65 - playerRoadLateral)
                            : (playerRoadLateral - (-6.65));
                        const hasSideRoom = wallMargin >= (minCombinedWid + 0.25);

                        if (!hasSideRoom) {
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral + wallPushSide * 0.78, -6.4, 6.4);
                            const boxGap = minCombinedLen + 1.35;
                            const boxErr = playerDeltaMeters - boxGap;
                            data.targetSpeed = THREE.MathUtils.clamp(
                                playerSpeedMps + THREE.MathUtils.clamp(boxErr * 1.45, -16, 22),
                                0,
                                tierMaxChaseSpeed
                            );
                        } else {
                            const isAlongside = playerDeltaMeters <= (minCombinedLen * 0.92) &&
                                playerDeltaMeters >= -(minCombinedLen * 1.05);
                            const isLaterallyClearOutside = (latDiffFromPlayer * desiredSide) >= (minCombinedWid + 0.35);

                            if (!isAlongside) {
                                const approachOffset = minCombinedWid + 0.92;
                                pursuitTargetLateral = THREE.MathUtils.clamp(
                                    playerRoadLateral + desiredSide * approachOffset,
                                    -6.45,
                                    6.45
                                );
                                const alignBoost = THREE.MathUtils.clamp(playerDeltaMeters * 1.65, -18, 36);
                                let desiredSpd = THREE.MathUtils.clamp(playerSpeedMps + alignBoost, 0, tierMaxChaseSpeed);
                                if (inRearDangerCone && !isLaterallyClearOutside) {
                                    const safeTrailErr = playerDeltaMeters - (minCombinedLen + 2.4);
                                    const safeCap = playerSpeedMps + THREE.MathUtils.clamp(safeTrailErr * 1.35, -12, 2.2);
                                    desiredSpd = Math.min(desiredSpd, Math.max(0, safeCap));
                                }
                                data.targetSpeed = desiredSpd;
                            } else {
                                const longOverlapRatio = THREE.MathUtils.clamp(
                                    1 - Math.abs(playerDeltaMeters) / Math.max(1, minCombinedLen),
                                    0,
                                    1
                                );
                                const squeezeDepth = isPrimaryWallPin
                                    ? (0.44 * longOverlapRatio)
                                    : (0.28 * longOverlapRatio);
                                const pinOffset = minCombinedWid + 0.04 - squeezeDepth;
                                pursuitTargetLateral = THREE.MathUtils.clamp(
                                    playerRoadLateral + desiredSide * pinOffset,
                                    -6.58,
                                    6.58
                                );
                                const holdLongBoost = THREE.MathUtils.clamp(playerDeltaMeters * 1.6, -9, 10);
                                let sideHoldSpeed = THREE.MathUtils.clamp(playerSpeedMps + holdLongBoost, 0, tierMaxChaseSpeed);
                                if (isPlayerStoppingOrStopped) {
                                    sideHoldSpeed = playerSpeedMps <= POLICE_PIN_SPEED_MPS
                                        ? 0
                                        : Math.min(sideHoldSpeed, Math.max(0, playerSpeedMps - 1.2));
                                }
                                data.targetSpeed = sideHoldSpeed;
                            }
                        }
                    } else {
                        // Tingkat 3 block_front agresif: salip cepat lewat koridor samping bebas -> masuk di depan -> rem agresif
                        const prefSide = -wallPushSide;
                        const prefMargin = prefSide > 0 ? (6.65 - playerRoadLateral) : (playerRoadLateral - (-6.65));
                        const altMargin = (-prefSide) > 0 ? (6.65 - playerRoadLateral) : (playerRoadLateral - (-6.65));
                        if (!data.policePassSide || (
                            data.policePassSide > 0 ? (6.65 - playerRoadLateral) : (playerRoadLateral + 6.65)
                        ) < minCombinedWid + 0.85) {
                            data.policePassSide = prefMargin >= (minCombinedWid + 1.35)
                                ? prefSide
                                : (altMargin >= prefMargin ? -prefSide : prefSide);
                        }
                        const passSide = data.policePassSide;

                        if (playerDeltaMeters > -(minCombinedLen + 2.3)) {
                            const passOffset = minCombinedWid + 1.45;
                            pursuitTargetLateral = THREE.MathUtils.clamp(
                                playerRoadLateral + passSide * passOffset,
                                -6.45,
                                6.45
                            );
                            if (inRearDangerCone && latDistToPlayer < (minCombinedWid + 0.72)) {
                                const safeGapErr = playerDeltaMeters - (minCombinedLen + 2.8);
                                data.targetSpeed = THREE.MathUtils.clamp(
                                    playerSpeedMps + THREE.MathUtils.clamp(safeGapErr * 1.3, -14, 1.5),
                                    0,
                                    tierMaxChaseSpeed
                                );
                            } else {
                                data.targetSpeed = THREE.MathUtils.clamp(
                                    Math.max(playerSpeedMps + 25, 38),
                                    0,
                                    tierMaxChaseSpeed
                                );
                            }
                        } else if (Math.abs(data.lateralPos - playerRoadLateral) > 0.95) {
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.35, 6.35);
                            data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + 1.8, 0, tierMaxChaseSpeed);
                        } else {
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.35, 6.35);
                            const frontGap = -playerDeltaMeters - minCombinedLen;
                            if (playerSpeedMps <= POLICE_PIN_SPEED_MPS && frontGap <= 3.0) {
                                data.targetSpeed = 0;
                            } else if (frontGap > 7.5) {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.55 - 6.0, 0, tierMaxChaseSpeed);
                            } else if (frontGap > 0.85) {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.36 - 7.5, 0, tierMaxChaseSpeed);
                            } else {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.62 - 3.5, 0, tierMaxChaseSpeed);
                            }
                        }
                    }
                }

                const maxNpcSpeed = isChasingPolice ? tierMaxChaseSpeed : 42;
                const minNpcSpeed = (isChasingPolice && isPlayerStoppingOrStopped) ? -5.0 : 0;

                let isYieldingToPolice = false;
                if (isChasingPolice) {
                    const isEngagedClosePin = Math.abs(playerDeltaMeters) < 9.5 &&
                        (tacticalRole === 'block_front' || tacticalRole === 'pin_side_wall' || tacticalRole === 'pin_side_opposite');
                    const blockedAhead = isEngagedClosePin
                        ? (closestAheadDist < 10.5 && (closestAheadSpeed < data.targetSpeed - 2.0 || closestAheadDist < 7.0))
                        : (closestAheadDist < 34 && (closestAheadSpeed < data.targetSpeed - 0.5 || closestAheadDist < 22));
                    if (blockedAhead) {
                        if (data.laneChangeCooldown <= 0) {
                            const wallLim = getNpcWallLateralLimit(data);
                            data.lane = findBestPursuitGapLateral(
                                k,
                                data,
                                pursuitTargetLateral,
                                playerDeltaMeters,
                                minCombinedLen,
                                minCombinedWid,
                                wallLim
                            );
                            data.laneChangeCooldown = 0.14;
                        }
                    } else if (isEngagedClosePin || (
                        (data.laneChangeCooldown <= 0 || Math.abs(data.lane - data.lateralPos) < 0.85) &&
                        isPursuitCorridorClear(k, data, pursuitTargetLateral, 18, 4)
                    )) {
                        data.lane = pursuitTargetLateral;
                    }
                } else if (data.controlLossTimer <= 0) {
                    // Modulasi kecepatan alami (60–120 km/h) agar NPC tidak kaku dan tidak menumpuk kereta panjang
                    if (!data.isPolice && data.baseCruiseSpeed) {
                        data.speedModPhase = (data.speedModPhase || 0) + (data.speedModFreq || 0.18) * dt;
                        data.speedModShiftTimer = (data.speedModShiftTimer || 0) - dt;
                        if (data.speedModShiftTimer <= 0) {
                            data.speedModShiftTimer = 7.5 + Math.random() * 9.5;
                            const laneSpeeds = data.homeLane === LANE_LEFT
                                ? (data.variant === 'truck' ? [60, 70] : [60, 70, 80])
                                : (data.homeLane === LANE_MIDDLE
                                    ? (data.variant === 'truck' ? [80] : [80, 90, 100])
                                    : [100, 110, 120]);
                            const nextTierMps = laneSpeeds[Math.floor(Math.random() * laneSpeeds.length)] * TRAFFIC_KMH_TO_MPS;
                            data.speedModTargetDelta = nextTierMps - data.baseCruiseSpeed;
                        }
                        data.speedModCurrentDelta = THREE.MathUtils.damp(
                            data.speedModCurrentDelta || 0,
                            data.speedModTargetDelta || 0,
                            0.65,
                            dt
                        );
                        const breathDelta = Math.sin(data.speedModPhase) * (3.5 * TRAFFIC_KMH_TO_MPS);
                        const maxAllowedNpcMps = (data.variant === 'truck' ? 85 : 120) * TRAFFIC_KMH_TO_MPS;
                        data.targetSpeed = THREE.MathUtils.clamp(
                            data.baseCruiseSpeed + data.speedModCurrentDelta + breathDelta,
                            60 * TRAFFIC_KMH_TO_MPS,
                            maxAllowedNpcMps
                        );
                    }

                    // Menepi saat ada polisi mengejar di belakang, atau menyalip kendaraan lebih lambat agar tidak membentuk kereta panjang
                    let baseHomeLane = data.homeLane !== undefined ? data.homeLane : data.lane;
                    let approachingChaser = null;
                    let minChaserDist = Infinity;
                    for (let c = 0; c < activeChasers.length; c++) {
                        const chaser = activeChasers[c];
                        let distAheadOfPolice = (data.progress - chaser.progress) * trackLength;
                        if (distAheadOfPolice > trackLength * 0.5) distAheadOfPolice -= trackLength;
                        if (distAheadOfPolice < -trackLength * 0.5) distAheadOfPolice += trackLength;
                        if (distAheadOfPolice > -14 && distAheadOfPolice < 68 && Math.abs(baseHomeLane - chaser.lateralPos) < 3.6) {
                            const absD = Math.abs(distAheadOfPolice);
                            if (absD < minChaserDist) {
                                minChaserDist = absD;
                                approachingChaser = chaser;
                            }
                        }
                    }

                    if (approachingChaser) {
                        isYieldingToPolice = true;
                        let pullTarget = baseHomeLane;
                        if (baseHomeLane === LANE_LEFT) {
                            pullTarget = -6.45;
                        } else if (baseHomeLane === LANE_RIGHT) {
                            pullTarget = 6.45;
                        } else {
                            pullTarget = approachingChaser.lateralPos >= 0 ? -1.55 : 1.55;
                        }

                        if (hasStarted) {
                            let playerRelToNpc = (playerTrackProgress - data.progress) * trackLength;
                            if (playerRelToNpc > trackLength * 0.5) playerRelToNpc -= trackLength;
                            if (playerRelToNpc < -trackLength * 0.5) playerRelToNpc += trackLength;
                            if (Math.abs(playerRelToNpc) < 38 && Math.abs(playerRoadLateral - pullTarget) < 2.15) {
                                if (baseHomeLane === LANE_MIDDLE) {
                                    const altTarget = -pullTarget;
                                    pullTarget = Math.abs(playerRoadLateral - altTarget) > Math.abs(playerRoadLateral - pullTarget)
                                        ? altTarget
                                        : baseHomeLane;
                                } else {
                                    pullTarget = baseHomeLane;
                                }
                            }
                        }
                        data.lane = pullTarget;
                    } else {
                        // Cek apakah NPC perlu menyalip kendaraan lebih lambat di depannya (anti kereta panjang)
                        const wantsToOvertake = !data.isPolice &&
                            data.laneChangeCooldown <= 0 &&
                            closestAheadDist < 42 &&
                            (closestAheadSpeed < data.targetSpeed - 1.4 || closestAheadDist < 24);

                        if (wantsToOvertake) {
                            const adjacentLanes = baseHomeLane === LANE_LEFT
                                ? [LANE_MIDDLE]
                                : (baseHomeLane === LANE_RIGHT
                                    ? [LANE_MIDDLE]
                                    : (data.targetSpeed >= 92 * TRAFFIC_KMH_TO_MPS ? [LANE_RIGHT, LANE_LEFT] : [LANE_LEFT, LANE_RIGHT]));
                            for (let a = 0; a < adjacentLanes.length; a++) {
                                const candLane = adjacentLanes[a];
                                if (data.variant === 'truck' && candLane === LANE_RIGHT) continue;
                                if (isTargetLaneClearForNpc(k, data, candLane, false, incidentActive)) {
                                    // Pastikan lajur tujuan benar-benar punya ruang lebih lega di depan
                                    let laneClearAhead = 80;
                                    for (let step = 1; step < totalCars; step++) {
                                        const oth = trafficCars[trafficSortedIndices[(k + step) % totalCars]].userData;
                                        let ad = (oth.progress - data.progress) * trackLength;
                                        if (ad < 0) ad += trackLength;
                                        if (ad >= 80) break;
                                        if (Math.abs(oth.lateralPos - candLane) <= 2.2) {
                                            laneClearAhead = ad;
                                            break;
                                        }
                                    }
                                    if (laneClearAhead > closestAheadDist + 14) {
                                        baseHomeLane = candLane;
                                        data.homeLane = candLane;
                                        data.laneChangeCooldown = 4.2 + Math.random() * 2.5;
                                        break;
                                    }
                                }
                            }
                        } else if (!data.isPolice && data.laneChangeCooldown <= 0 && closestAheadDist > 52) {
                            // Kembalikan kendaraan pelan dari lajur kanan ke tengah/kiri jika lajur sebelah kosong agar lajur cepat tetap lega
                            const targetReturnLane = (baseHomeLane === LANE_RIGHT && data.targetSpeed <= 92 * TRAFFIC_KMH_TO_MPS)
                                ? LANE_MIDDLE
                                : ((baseHomeLane === LANE_MIDDLE && data.targetSpeed <= 76 * TRAFFIC_KMH_TO_MPS) ? LANE_LEFT : null);
                            if (targetReturnLane !== null && isTargetLaneClearForNpc(k, data, targetReturnLane, false, incidentActive)) {
                                baseHomeLane = targetReturnLane;
                                data.homeLane = targetReturnLane;
                                data.laneChangeCooldown = 5.0 + Math.random() * 3.0;
                            }
                        }
                        data.lane = baseHomeLane;
                    }

                    const fasterThanAhead = data.speed > closestAheadSpeed + 1.6 || data.targetSpeed > closestAheadSpeed + 2.2;
                    const isBlockedBySlowAhead = closestAheadDist < 62 &&
                        (closestAheadIsSlowOrStopped || closestAheadIsIncident || (fasterThanAhead && closestAheadDist < 38));

                    // Klakson jika terhalang kendaraan melambat/berhenti di lajurnya sendiri
                    if (
                        isBlockedBySlowAhead &&
                        closestAheadDist < 42 &&
                        fasterThanAhead &&
                        data.hornCooldown <= 0 &&
                        npcHornGlobalCooldown <= 0
                    ) {
                        const distToPlayer = Math.hypot(npc.position.x - playerX, npc.position.z - playerZ);
                        if (distToPlayer < 110 && typeof playNpcHornSound === 'function') {
                            const atten = THREE.MathUtils.clamp(1 - distToPlayer / 110, 0.08, 1);
                            const pitch = data.mass > 3000 ? 0.72 : (0.94 + Math.random() * 0.14);
                            playNpcHornSound(0.24 * atten, pitch);
                            npcHornGlobalCooldown = 0.42;
                        }
                        data.hornCooldown = 1.6 + Math.random() * 1.6;
                    }
                }

                // Pengaturan kecepatan (jarak ikut alami anti-kereta panjang)
                let desiredSpeed = data.targetSpeed;
                if (isYieldingToPolice) {
                    desiredSpeed = Math.min(desiredSpeed, Math.max(9.0, data.targetSpeed * 0.62));
                }
                if (isChasingPolice) {
                    if (closestAheadDist < 7.8 && !isPlayerStoppingOrStopped) {
                        desiredSpeed = Math.min(
                            desiredSpeed,
                            closestAheadDist < 4.8 ? closestAheadSpeed * 0.82 : closestAheadSpeed * 0.96
                        );
                    }
                } else if (closestAheadDist < 68) {
                    const dynamicTimeGap = Math.max(0, data.speed) * 0.52;
                    const minJamGap = (data.halfLength || 2.1) + closestAheadHalfLen + 4.2 + dynamicTimeGap;
                    const netGap = closestAheadDist - minJamGap;
                    if (netGap <= 0.25) {
                        desiredSpeed = closestAheadSpeed <= 1.2
                            ? 0
                            : Math.min(desiredSpeed, Math.max(0, closestAheadSpeed - 1.2));
                    } else {
                        const safeApproach = Math.max(0, closestAheadSpeed) + Math.sqrt(2 * 5.2 * netGap);
                        desiredSpeed = Math.min(desiredSpeed, safeApproach);
                    }
                }
                data.isBraking = false;

                if (isChasingPolice) {
                    const pp = data.policePhysics;
                    const physCar = vehiclePhysicsConfigs.car;
                    const fwdX = -Math.sin(pp.yaw);
                    const fwdZ = -Math.cos(pp.yaw);
                    const currentCarSpeed = pp.vx * fwdX + pp.vz * fwdZ;
                    const cappedDesired = THREE.MathUtils.clamp(desiredSpeed, -4.5, tierMaxChaseSpeed);
                    const speedErr = cappedDesired - currentCarSpeed;
                    const isReversingTarget = cappedDesired < -0.2 && currentCarSpeed <= 0.45;
                    const trackMetrics = getTrackSegmentMetrics(data.progress);

                    let throttleCmd = 0;
                    let brakeCmd = 0;
                    let reverseCmd = 0;
                    let steerCmd = 0;

                    if (isReversingTarget) {
                        reverseCmd = THREE.MathUtils.clamp((-speedErr) / 2.8, 0.25, 0.85);
                        const roadPt = getTrackWorldPointAt(data.progress + 10 / trackLength, data.lane);
                        const yawErr = wrapAngleRad(roadPt.yaw - pp.yaw);
                        steerCmd = THREE.MathUtils.clamp(-yawErr * 1.5, -0.5, 0.5);
                    } else {
                        if (cappedDesired <= 0.25 && Math.abs(currentCarSpeed) <= 1.2) {
                            brakeCmd = 1.0;
                        } else if (speedErr < -0.25) {
                            brakeCmd = THREE.MathUtils.clamp((-speedErr - 0.20) / 3.6, 0.14, 1.0);
                        } else if (cappedDesired > 1.0) {
                            const cruiseFeedforward = THREE.MathUtils.clamp(cappedDesired / 56, 0.14, 0.72);
                            throttleCmd = THREE.MathUtils.clamp(cruiseFeedforward + speedErr * 0.45, 0.08, 1.0);
                        } else if (speedErr > 0.12 && cappedDesired > 0.3) {
                            throttleCmd = THREE.MathUtils.clamp(speedErr / 2.1, 0.28, 1.0);
                        }

                        if (cappedDesired <= 0.25 && Math.abs(currentCarSpeed) < 0.4) {
                            steerCmd = 0;
                        } else {
                            let lookaheadDist = THREE.MathUtils.clamp(9.5 + Math.abs(currentCarSpeed) * 0.30, 9.5, 22.0);
                            if (Math.abs(playerDeltaMeters) < 10) {
                                lookaheadDist = THREE.MathUtils.clamp(8.0 + Math.abs(currentCarSpeed) * 0.24, 8.0, 18.0);
                            } else if (isPlayerStoppingOrStopped && Math.abs(playerDeltaMeters) < 15 && Math.abs(playerDeltaMeters) > 2) {
                                lookaheadDist = Math.max(6.5, Math.min(lookaheadDist, Math.abs(playerDeltaMeters) + 2.0));
                            }
                            const targetPt = getTrackWorldPointAt(data.progress + lookaheadDist / trackLength, data.lane);
                            const angleToTarget = Math.atan2(-(targetPt.x - pp.x), -(targetPt.z - pp.z));
                            const headingError = wrapAngleRad(angleToTarget - pp.yaw);

                            const ffSteerAngle = Math.atan(innovaZenixSpecs.wheelbase * trackMetrics.curvature);
                            const currMaxSteer = physCar.maxInnerWheelSteerAngle / (1 + Math.pow(Math.abs(currentCarSpeed) * 0.020, 2));
                            const ffCmd = THREE.MathUtils.clamp(ffSteerAngle / Math.max(0.08, currMaxSteer), -0.60, 0.60);

                            const laneErr = data.lane - data.lateralPos;
                            const steerP = THREE.MathUtils.clamp(1.75 - Math.abs(currentCarSpeed) * 0.008, 1.15, 1.75);
                            const latGain = tacticalRole === 'pin_side_wall' || tacticalRole === 'pin_side_opposite' ? 0.15 : 0.11;
                            const latFeedback = THREE.MathUtils.clamp(-laneErr * latGain, -0.32, 0.32);
                            steerCmd = THREE.MathUtils.clamp(ffCmd + headingError * steerP + latFeedback - pp.yawRate * 0.20, -1, 1);
                        }
                    }

                    pp.throttleCmdSmoothed = THREE.MathUtils.damp(pp.throttleCmdSmoothed || 0, throttleCmd, 7.5, dt);
                    pp.brakeCmdSmoothed = THREE.MathUtils.damp(pp.brakeCmdSmoothed || 0, brakeCmd, 8.5, dt);

                    stepPoliceCarPhysics(npc, dt, {
                        throttle: pp.throttleCmdSmoothed,
                        brake: pp.brakeCmdSmoothed,
                        reverse: reverseCmd,
                        handbrake: 0,
                        steer: steerCmd
                    });
                    continue;
                }

                // Model fisika akselerasi/transmisi, pengereman ABS, kemudi & suspensi NPC biasa
                const yaw = data.yawOffset;
                const cosYaw = Math.cos(yaw);
                const sinYaw = Math.sin(yaw);
                const bodyLongVel = data.speed * cosYaw - data.lateralVelocity * sinYaw;
                const bodyLatSlip = data.speed * sinYaw + data.lateralVelocity * cosYaw;

                const ndx = npc.position.x - playerX;
                const ndz = npc.position.z - playerZ;
                const isDetailedNear = (ndx * ndx + ndz * ndz) < 250 * 250;
                const trackMetrics = getTrackSegmentMetrics(data.progress);
                const isRecoveringTurn = data.controlLossTimer <= 0 && Math.abs(yaw) > 0.32;
                const isSliding = !isRecoveringTurn && (data.controlLossTimer > 0 || Math.abs(bodyLatSlip) > 1.85 || Math.abs(yaw) > 0.18);

                if (isSliding) {
                    const gripFactor = THREE.MathUtils.clamp(1 - data.controlLossTimer * 0.55, 0.35, 0.95);
                    const maxLatAccel = 9.2 * gripFactor;
                    const tireLatAccel = THREE.MathUtils.clamp(-bodyLatSlip * 5.0 * gripFactor, -maxLatAccel, maxLatAccel);
                    const tireLongAccel = -Math.sign(bodyLongVel) * 1.35;

                    const accelFwd = tireLongAccel * cosYaw + tireLatAccel * sinYaw;
                    const accelLat = -tireLongAccel * sinYaw + tireLatAccel * cosYaw;

                    data.longitudinalAcceleration = accelFwd;
                    data.lateralAcceleration = accelLat;
                    data.speed = THREE.MathUtils.clamp(data.speed + accelFwd * dt, minNpcSpeed, maxNpcSpeed);
                    data.lateralVelocity = THREE.MathUtils.clamp(data.lateralVelocity + accelLat * dt, -18, 18);

                    const yawAccel = (-11 * gripFactor * data.yawOffset) - (4.2 + 2.4 * gripFactor) * data.yawVelocity;
                    data.yawVelocity += yawAccel * dt;
                    data.yawOffset = wrapAngleRad(data.yawOffset + data.yawVelocity * dt);

                    const rollTarget = THREE.MathUtils.clamp(-tireLatAccel * 0.014, -0.22, 0.22);
                    const rollAccel = 28 * (rollTarget - data.rollOffset) - 7.5 * data.rollVelocity;
                    data.rollVelocity += rollAccel * dt;
                    data.rollOffset = THREE.MathUtils.clamp(data.rollOffset + data.rollVelocity * dt, -0.24, 0.24);
                    data.steeringAngleVisual = THREE.MathUtils.damp(data.steeringAngleVisual, -yaw * 0.6, 8, dt);
                    data.isBraking = true;
                } else if (isRecoveringTurn) {
                    // Setelah tegak di jalan, pengemudi memutar setir secara bertahap agar menghadap depan lalu menyetir balik ke jalurnya
                    const lateralError = data.lane - data.lateralPos;
                    const targetHeadingOffset = THREE.MathUtils.clamp(-lateralError * 0.12, -0.45, 0.45);
                    const headingError = wrapAngleRad(targetHeadingOffset - data.yawOffset);
                    const turnRate = THREE.MathUtils.clamp(headingError * 3.0, -2.5, 2.5);
                    data.yawOffset = wrapAngleRad(data.yawOffset + turnRate * dt);
                    data.yawVelocity = turnRate;

                    const recoverySpeedTarget = Math.abs(headingError) > 0.75 ? 6.0 : Math.min(desiredSpeed, 14.0);
                    const forwardCarSpeed = THREE.MathUtils.damp(Math.max(3.5, Math.hypot(data.speed, data.lateralVelocity)), recoverySpeedTarget, 3.5, dt);
                    data.speed = forwardCarSpeed * Math.cos(data.yawOffset);
                    data.lateralVelocity = -forwardCarSpeed * Math.sin(data.yawOffset);
                    data.steeringAngleVisual = THREE.MathUtils.damp(data.steeringAngleVisual, THREE.MathUtils.clamp(headingError, -0.58, 0.58), 9, dt);
                    data.rollOffset = THREE.MathUtils.damp(data.rollOffset, -turnRate * 0.03, 8, dt);
                    data.isBraking = Math.abs(headingError) > 0.75;
                    for (let w = 0; w < 4; w++) {
                        data.wheelAngularSpeeds[w] = forwardCarSpeed / (data.wheelRadius || 0.32);
                    }
                } else {
                    if (!isChasingPolice && !isYieldingToPolice && data.homeLane !== undefined) {
                        data.lane = data.homeLane;
                    }

                    const vPhys = data.variantPhysics;
                    const wheelR = data.wheelRadius || 0.32;
                    const substeps = isDetailedNear ? 2 : 1;
                    const subDt = dt / substeps;
                    let frameBrakeActive = false;

                    for (let s = 0; s < substeps; s++) {
                        const speedErr = desiredSpeed - data.speed;
                        let rawThrottle = 0;
                        let rawBrake = 0;
                        if (desiredSpeed <= 0.25 && Math.abs(data.speed) <= 1.2) {
                            rawBrake = 1.0;
                        } else if (speedErr < -0.4) {
                            rawBrake = THREE.MathUtils.clamp((-speedErr - 0.28) / 4.8, 0.14, 1.0);
                        } else if (speedErr > 0.2 && desiredSpeed > 0.3) {
                            rawThrottle = THREE.MathUtils.clamp(speedErr / 4.2, 0.16, 1.0);
                        } else if (desiredSpeed > 1.0 && speedErr > -0.2) {
                            rawThrottle = THREE.MathUtils.clamp(0.14 + speedErr * 0.1, 0.05, 0.35);
                        }

                        data.throttleSmoothed = THREE.MathUtils.damp(
                            data.throttleSmoothed,
                            rawThrottle,
                            rawThrottle > data.throttleSmoothed ? 6.5 : 9.0,
                            subDt
                        );
                        data.brakeSmoothed = THREE.MathUtils.damp(
                            data.brakeSmoothed,
                            rawBrake,
                            rawBrake > data.brakeSmoothed ? 7.2 : 11.0,
                            subDt
                        );
                        if (data.throttleSmoothed < 0.002 && rawThrottle === 0) data.throttleSmoothed = 0;
                        if (data.brakeSmoothed < 0.002 && rawBrake === 0) data.brakeSmoothed = 0;

                        const throttle = data.throttleSmoothed * (0.4 + 0.6 * data.throttleSmoothed);
                        const brake = data.brakeSmoothed * (0.35 + 0.65 * data.brakeSmoothed);
                        if (brake > 0.10) frameBrakeActive = true;

                        // RPM & transmisi otomatis 5 percepatan
                        const gearRatio = vPhys.gearRatios[(data.currentGear || 1) - 1] || 1.5;
                        const drivenWheelAng = (data.wheelAngularSpeeds[0] + data.wheelAngularSpeeds[1]) * 0.5;
                        const targetRpm = Math.max(
                            950,
                            Math.min(6500, (Math.abs(drivenWheelAng) * 60 / (2 * Math.PI)) * gearRatio * vPhys.finalDrive)
                        );
                        data.engineRpm = THREE.MathUtils.damp(data.engineRpm, targetRpm, 14, subDt);

                        if (data.engineRpm >= 5850 && data.currentGear < vPhys.gearRatios.length) {
                            data.currentGear += 1;
                            data.gearShiftBlendTimer = 0.18;
                        } else if (data.engineRpm <= 2450 && data.currentGear > 1) {
                            data.currentGear -= 1;
                            data.gearShiftBlendTimer = 0.18;
                        }
                        if (data.gearShiftBlendTimer > 0) {
                            data.gearShiftBlendTimer = Math.max(0, data.gearShiftBlendTimer - subDt);
                        }
                        const shiftScale = data.gearShiftBlendTimer > 0
                            ? 0.4 + 0.6 * (1 - data.gearShiftBlendTimer / 0.18)
                            : 1.0;

                        const torqueFactor = getEngineTorqueFactor(data.engineRpm, 950, 6500);
                        const driveTorque = vPhys.maxTorqueNm * torqueFactor * gearRatio * vPhys.finalDrive * 0.88 * shiftScale;
                        const coastTorque = Math.abs(data.speed) > 0.35
                            ? -Math.sign(data.speed) * vPhys.maxTorqueNm * 0.13 * gearRatio * vPhys.finalDrive * 0.88
                            : 0;
                        const netDriveTorque = brake > 0.04
                            ? coastTorque * (1 - brake * 0.5)
                            : THREE.MathUtils.lerp(coastTorque, driveTorque, throttle);
                        const driveForce = (data.pushedTimer > 0 ? 0.65 : 1.0) * (netDriveTorque / wheelR);

                        // Gaya rem + modulasi ABS agar tidak selip berlebih
                        const maxGripForce = 0.94 * vPhys.mass * gravity;
                        const rawBrakeForce = brake * vPhys.maxBrakingForce;
                        const absClampedBrake = Math.min(rawBrakeForce, maxGripForce * 0.92);
                        const brakeForce = Math.abs(data.speed) > 0.05
                            ? -Math.sign(data.speed) * absClampedBrake
                            : 0;

                        // Hambatan udara, rolling resistance, dan gaya tanjakan/turunan flyover
                        const aeroDrag = 0.5 * airDensity * vPhys.dragCoefficient * vPhys.frontalArea * data.speed * Math.abs(data.speed);
                        const rollRes = Math.abs(data.speed) > 0.05 ? Math.sign(data.speed) * 0.015 * vPhys.mass * gravity : 0;
                        const slopeForce = vPhys.mass * gravity * trackMetrics.slopeSin;

                        const clampedDrive = THREE.MathUtils.clamp(driveForce, -maxGripForce, maxGripForce);
                        const netLongForce = clampedDrive + brakeForce - aeroDrag - rollRes - slopeForce;
                        const longAccel = netLongForce / vPhys.mass;
                        const nextSpeed = THREE.MathUtils.clamp(data.speed + longAccel * subDt, minNpcSpeed, maxNpcSpeed);

                        // Cegah osilasi di kecepatan ~0 saat berhenti penuh dengan rem ditekan
                        if (brake > 0.4 && Math.abs(data.speed) <= 0.35 && Math.abs(desiredSpeed) <= 0.25) {
                            data.speed = 0;
                            data.longitudinalAcceleration = 0;
                        } else {
                            data.longitudinalAcceleration = (nextSpeed - data.speed) / subDt;
                            data.speed = nextSpeed;
                        }

                        // Update putaran sudut ke-4 roda dengan sedikit efek slip saat akselerasi/rem
                        const baseWheelAng = data.speed / wheelR;
                        const driveSlipAng = throttle > 0.4 ? throttle * 2.2 : 0;
                        const brakeSlipScale = brake > 0.15 && data.speed > 2.5 ? (1 - brake * 0.16) : 1;
                        const targetFrontAng = (baseWheelAng + driveSlipAng) * brakeSlipScale;
                        const targetRearAng = baseWheelAng * brakeSlipScale;
                        data.wheelAngularSpeeds[0] = THREE.MathUtils.damp(data.wheelAngularSpeeds[0], targetFrontAng, 16, subDt);
                        data.wheelAngularSpeeds[1] = THREE.MathUtils.damp(data.wheelAngularSpeeds[1], targetFrontAng, 16, subDt);
                        data.wheelAngularSpeeds[2] = THREE.MathUtils.damp(data.wheelAngularSpeeds[2], targetRearAng, 16, subDt);
                        data.wheelAngularSpeeds[3] = THREE.MathUtils.damp(data.wheelAngularSpeeds[3], targetRearAng, 16, subDt);
                    }

                    data.isBraking = frameBrakeActive || (desiredSpeed <= 0.25 && Math.abs(data.speed) <= 0.8);

                    const lateralError = data.lane - data.lateralPos;
                    const steerFloor = Math.abs(lateralError) > 0.65 ? 2.3 : 0.05;
                    const speedSteerFactor = THREE.MathUtils.clamp(Math.max(Math.abs(data.speed), steerFloor) / 3.0, 0.05, 1);
                    const maxLatSteer = 2.6 * speedSteerFactor;
                    const desiredLatVel = THREE.MathUtils.clamp(lateralError * 1.5, -maxLatSteer, maxLatSteer);
                    const prevLatVel = data.lateralVelocity;
                    data.lateralVelocity = THREE.MathUtils.damp(data.lateralVelocity, desiredLatVel, 5.8, dt);
                    const latSteerAccel = dt > 0 ? (data.lateralVelocity - prevLatVel) / dt : 0;

                    const steerYawTarget = data.speed > 1.4
                        ? -Math.atan2(data.lateralVelocity, Math.max(8, data.speed))
                        : 0;
                    const yawAccel = 22 * (steerYawTarget - data.yawOffset) - 7.5 * data.yawVelocity;
                    data.yawVelocity += yawAccel * dt;
                    data.yawOffset = THREE.MathUtils.clamp(data.yawOffset + data.yawVelocity * dt, -0.45, 0.45);

                    // Akselerasi lateral = sentrifugal tikungan tol + percepatan pindah lajur
                    const curveCentrifugal = data.speed * data.speed * trackMetrics.curvature;
                    data.lateralAcceleration = THREE.MathUtils.clamp(curveCentrifugal - latSteerAccel, -11, 11);

                    // Sudut belok roda depan: kombinasi kelengkungan jalan tol + manuver pindah lajur
                    const roadSteerAngle = Math.atan((data.wheelbase || 2.6) * trackMetrics.curvature);
                    const laneSteerAngle = -steerYawTarget * 1.25;
                    const targetFrontSteer = THREE.MathUtils.clamp(roadSteerAngle + laneSteerAngle, -0.58, 0.58);
                    data.steeringAngleVisual = THREE.MathUtils.damp(data.steeringAngleVisual, targetFrontSteer, 9.5, dt);

                    // Dinamika roll suspensi
                    const rollTarget = THREE.MathUtils.clamp(-data.lateralAcceleration * 0.015, -vPhys.maxRoll, vPhys.maxRoll);
                    const rollAccel = 30 * (rollTarget - data.rollOffset) - 8.5 * data.rollVelocity;
                    data.rollVelocity += rollAccel * dt;
                    data.rollOffset = THREE.MathUtils.clamp(data.rollOffset + data.rollVelocity * dt, -vPhys.maxRoll, vPhys.maxRoll);
                }

                // Integrasi posisi & batas pembatas beton anti-clipping
                data.lateralPos += data.lateralVelocity * dt;
                const npcWallLimit = getNpcWallLateralLimit(data);
                if (Math.abs(data.lateralPos) > npcWallLimit) {
                    data.lateralPos = Math.sign(data.lateralPos) * npcWallLimit;
                    if (Math.sign(data.lateralVelocity) === Math.sign(data.lateralPos)) {
                        data.lateralVelocity *= -0.15;
                    }
                }
                data.progress = (data.progress + data.speed * dt / trackLength + 1) % 1;

                // Hitung intensitas selip ban untuk emisi skidmark NPC (polisi non-freebody hanya saat rem darurat keras)
                const decelRate = dt > 0 ? Math.max(0, (prevSpeed - data.speed) / dt) : 0;
                if (data.isPolice) {
                    const policeBrakeSkid = prevSpeed > 11 ? Math.max(0, (decelRate - 7.8) / 4.2) : 0;
                    data.skidIntensity = THREE.MathUtils.clamp(policeBrakeSkid, 0, 1);
                } else {
                    const latSkid = Math.max(0, (Math.abs(bodyLatSlip) - 1.55) / 4.2);
                    const yawSkid = Math.max(0, (Math.abs(data.yawOffset) - 0.14) / 0.36);
                    const brakeSkid = prevSpeed > 6 ? Math.max(0, (decelRate - 5.2) / 5.5) : 0;
                    data.skidIntensity = THREE.MathUtils.clamp(Math.max(latSkid, yawSkid, brakeSkid), 0, 1);
                }
            }

            resolveNpcToNpcCollisions(totalCars);

            const strobeCycle = (policeFlashClock * 9.0) % 4;
            const leftFlashOn = strobeCycle < 0.7 || (strobeCycle >= 1.0 && strobeCycle < 1.7);
            const rightFlashOn = (strobeCycle >= 2.0 && strobeCycle < 2.7) || (strobeCycle >= 3.0 && strobeCycle < 3.7);
            const chasingUnits = [];

            for (let i = 0; i < totalCars; i++) {
                const npc = trafficCars[i];
                const data = npc.userData;
                const bdx = npc.position.x - playerX;
                const bdz = npc.position.z - playerZ;
                const isNearPlayer = (bdx * bdx + bdz * bdz) < 245 * 245;

                if (data.freeBodyActive) {
                    syncNpcMeshFromFreeBody(npc, data);
                    updateNpcWheelAndSuspensionVisuals(npc, data, dt, isNearPlayer, data.wheelAngularSpeeds);
                } else if (data.isPolice && data.policeState === 'chase' && data.policePhysics && data.policePhysics.initialized) {
                    enforcePoliceConcreteWallCollision(npc, false, dt);
                    npc.position.set(data.policePhysics.x, data.policePhysics.y, data.policePhysics.z);
                    npc.rotation.order = 'YXZ';
                    npc.rotation.set(0, data.policePhysics.yaw, 0);
                    updateNpcWheelAndSuspensionVisuals(npc, data, dt, isNearPlayer, data.policePhysics.wheelAngularSpeeds);
                } else {
                    placeOnTrack(npc, data.progress, data.lateralPos);
                    const baseYaw = npc.rotation.y;
                    const fwdX = -Math.sin(baseYaw);
                    const fwdZ = -Math.cos(baseYaw);
                    const rightX = Math.cos(baseYaw);
                    const rightZ = -Math.sin(baseYaw);
                    data.worldVelX = fwdX * data.speed + rightX * data.lateralVelocity;
                    data.worldVelZ = fwdZ * data.speed + rightZ * data.lateralVelocity;
                    npc.rotation.order = 'YXZ';
                    npc.rotation.set(0, baseYaw + data.yawOffset, 0);
                    updateNpcWheelAndSuspensionVisuals(npc, data, dt, isNearPlayer, data.wheelAngularSpeeds);
                }

                if (data.tailGlowMesh) {
                    const nextTailMat = data.isBraking ? npcTailBrakeGlowMat : npcTailGlowMat;
                    if (data.tailGlowMesh.material !== nextTailMat) {
                        data.tailGlowMesh.material = nextTailMat;
                    }
                }

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
                        chasingUnits.push({
                            npc,
                            distSq,
                            halfLength: data.halfLength || 2.15,
                            elevDiff,
                            speed: data.speed
                        });
                    } else {
                        visuals.leftBeaconMat.color.setHex(0x0b2554);
                        visuals.rightBeaconMat.color.setHex(0x0b2554);
                        visuals.beaconGlow.visible = false;
                        visuals.glowMat.opacity = 0;
                    }
                }
            }

            ensurePolicePointLights();
            const bustedBanner = document.getElementById('busted-banner');
            const bustedCountdownEl = document.getElementById('busted-countdown');

            if (chasingUnits.length > 0) {
                chasingUnits.sort((a, b) => a.distSq - b.distSq);
                const closestUnit = chasingUnits[0];
                const nearestDist = Math.sqrt(closestUnit.distSq);
                const linearAtten = 1 - THREE.MathUtils.clamp((nearestDist - 12) / 220, 0, 1);
                activePoliceSirenIntensity = linearAtten * linearAtten;

                const nearestBumperGap = Math.max(0, nearestDist - (closestUnit.halfLength + playerHalfLen));

                // Countdown 5 detik BUSTED: aktif di SEMUA tingkatan ketika pemain dan polisi sama-sama berhenti mepet
                const isPinnedStopped = activeTier >= 1 &&
                    hasStarted &&
                    !isGameOver &&
                    closestUnit.elevDiff < 4.5 &&
                    nearestBumperGap <= POLICE_PIN_MAX_BUMPER_GAP &&
                    playerSpeedMps <= POLICE_PIN_SPEED_MPS &&
                    Math.abs(closestUnit.speed) <= POLICE_STOPPED_SPEED_MPS;

                if (isPinnedStopped) {
                    policeBustedTimer = Math.max(0, policeBustedTimer - dt);
                    if (bustedBanner) bustedBanner.hidden = false;
                    if (bustedCountdownEl) {
                        bustedCountdownEl.textContent = String(Math.max(1, Math.ceil(policeBustedTimer)));
                    }
                    if (policeBustedTimer <= 0) {
                        if (bustedBanner) bustedBanner.hidden = true;
                        triggerGameOver('busted');
                    }
                } else {
                    if (activeTier < 1 || playerSpeedMps > POLICE_ESCAPE_SPEED_MPS || nearestBumperGap > POLICE_PIN_MAX_BUMPER_GAP + 1.8) {
                        policeBustedTimer = POLICE_BUSTED_COUNTDOWN_SECONDS;
                    }
                    if (bustedBanner) bustedBanner.hidden = true;
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
                policeBustedTimer = POLICE_BUSTED_COUNTDOWN_SECONDS;
                if (bustedBanner) bustedBanner.hidden = true;
                resetPoliceLightPool();
            }
        }
