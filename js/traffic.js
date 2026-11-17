        const TRAFFIC_KMH_TO_MPS = 1 / 3.6;
        const LANE_LEFT = -4.8;   // Lajur paling kiri: paling pelan (60-65 km/h)
        const LANE_MIDDLE = 0;    // Lajur tengah: sedang (66-74 km/h)
        const LANE_RIGHT = 4.8;   // Lajur paling kanan: cepat (75-80 km/h)
        const VALID_LANES = [LANE_LEFT, LANE_MIDDLE, LANE_RIGHT];
        const POLICE_SPEED_LIMIT_MPS = 85 * TRAFFIC_KMH_TO_MPS;
        const POLICE_MAX_CHASE_SPEED_MPS = 135 * TRAFFIC_KMH_TO_MPS;
        const POLICE_VISION_RANGE = 115;
        const POLICE_VISION_COS_HALF_ANGLE = 0.72;
        const POLICE_TAIL_GAP_METERS = 3.0;
        const POLICE_VOICE_DISTANCE_METERS = 10.0;
        const POLICE_RECRUIT_RANGE = 280;
        const POLICE_PIN_SPEED_MPS = 1.6;
        const POLICE_STOPPED_SPEED_MPS = 2.6;
        const POLICE_ESCAPE_SPEED_MPS = 3.2;
        const POLICE_PIN_MAX_BUMPER_GAP = 3.2;
        const POLICE_BUSTED_COUNTDOWN_SECONDS = 5.0;
        const NPC_WALL_INNER_LIMIT = 7.81;
        const POLICE_UNIT_COUNT = 10;
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

        function createPoliceCarPhysicsState() {
            const phys = vehiclePhysicsConfigs.car;
            const frontAxleZ = -innovaZenixSpecs.wheelbase * (1 - phys.weightDistributionFront);
            const rearAxleZ = innovaZenixSpecs.wheelbase * phys.weightDistributionFront;
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
                steeringInputSmoothed: 0,
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
            const cgOffsetZ = (phys.weightDistributionFront - 0.5) * innovaZenixSpecs.wheelbase;
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
            const frontRollStiffness = (phys.frontSpringRate / 2) * innovaZenixSpecs.frontTread *
                innovaZenixSpecs.frontTread / 2 + (phys.antiRollStiffnessFront || 0);
            const rearRollStiffness = (phys.rearSpringRate / 2) * innovaZenixSpecs.rearTread *
                innovaZenixSpecs.rearTread / 2 + (phys.antiRollStiffnessRear || 0);
            const totalRollStiffness = frontRollStiffness + rearRollStiffness;
            const rollInertia = phys.mass * (
                innovaZenixSpecs.width * innovaZenixSpecs.width +
                innovaZenixSpecs.height * innovaZenixSpecs.height
            ) / 12;
            const yawInertia = phys.mass * (
                innovaZenixSpecs.length * innovaZenixSpecs.length +
                innovaZenixSpecs.width * innovaZenixSpecs.width
            ) / 12;
            const policeMaxForwardSpeed = Math.min(phys.maxSpeed, POLICE_MAX_CHASE_SPEED_MPS);

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
                const rawSteeringInput = THREE.MathUtils.clamp(aiControls.steer || 0, -1, 1);

                pp.throttleSmoothed = THREE.MathUtils.damp(
                    pp.throttleSmoothed,
                    rawThrottle,
                    rawThrottle > pp.throttleSmoothed ? 6.8 : 9.2,
                    substepDt
                );
                pp.brakeSmoothed = THREE.MathUtils.damp(
                    pp.brakeSmoothed,
                    rawBrake,
                    rawBrake > pp.brakeSmoothed ? 7.4 : 11.0,
                    substepDt
                );
                pp.reverseSmoothed = THREE.MathUtils.damp(
                    pp.reverseSmoothed,
                    rawReverse,
                    rawReverse > pp.reverseSmoothed ? 5.2 : 10.5,
                    substepDt
                );
                if (pp.throttleSmoothed < 0.001 && rawThrottle === 0) pp.throttleSmoothed = 0;
                if (pp.brakeSmoothed < 0.001 && rawBrake === 0) pp.brakeSmoothed = 0;
                if (pp.reverseSmoothed < 0.001 && rawReverse === 0) pp.reverseSmoothed = 0;

                const throttle = pp.throttleSmoothed * (0.4 + 0.6 * pp.throttleSmoothed);
                const brake = pp.brakeSmoothed * (0.35 + 0.65 * pp.brakeSmoothed);
                const reverse = pp.reverseSmoothed * (0.4 + 0.6 * pp.reverseSmoothed);

                const steeringSpeed = Math.abs(carSpeed);
                const lowSpeedAssist = 1 + 0.4 * THREE.MathUtils.clamp(1 - steeringSpeed / 8, 0, 1);
                const isReturningToCenter =
                    Math.abs(rawSteeringInput) < 0.02 ||
                    (pp.steeringInputSmoothed !== 0 &&
                        Math.sign(rawSteeringInput) !== Math.sign(pp.steeringInputSmoothed));
                const activeSteerRate = isReturningToCenter ? phys.steerReturnRate : phys.steerInRate * lowSpeedAssist;
                const maxSteeringStep = activeSteerRate * substepDt;
                pp.steeringInputSmoothed += THREE.MathUtils.clamp(
                    rawSteeringInput - pp.steeringInputSmoothed,
                    -maxSteeringStep,
                    maxSteeringStep
                );
                const steerAbs = Math.abs(pp.steeringInputSmoothed);
                const steeringInput = Math.sign(pp.steeringInputSmoothed) *
                    (0.45 * steerAbs + 0.55 * Math.pow(steerAbs, phys.steerGamma));
                const steeringSpeedScale = 1 + Math.pow(steeringSpeed * phys.steeringSpeedFalloff, 2);
                const steeringAngle = steeringInput * phys.maxInnerWheelSteerAngle / steeringSpeedScale;

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

                if (pp.engineRpm >= phys.maxRpm * 0.90 && pp.currentGear < phys.gearRatios.length) {
                    pp.currentGear += 1;
                    pp.gearShiftBlendTimer = 0.18;
                } else if (pp.engineRpm <= phys.maxRpm * 0.38 && pp.currentGear > 1) {
                    pp.currentGear -= 1;
                    pp.gearShiftBlendTimer = 0.18;
                }
                if (pp.gearShiftBlendTimer > 0) {
                    pp.gearShiftBlendTimer = Math.max(0, pp.gearShiftBlendTimer - substepDt);
                }
                const shiftTorqueScale = pp.gearShiftBlendTimer > 0
                    ? 0.38 + 0.62 * (1 - pp.gearShiftBlendTimer / 0.18)
                    : 1.0;

                const gearRatio = (reverse > 0.01 && carSpeed <= 0.15)
                    ? phys.gearRatios[0]
                    : phys.gearRatios[pp.currentGear - 1];
                const torqueFactor = getEngineTorqueFactor(pp.engineRpm, phys.idleRpm, phys.maxRpm);
                const fullDriveTorque = phys.maxTorqueNm * torqueFactor *
                    gearRatio * phys.finalDrive * 0.88 * shiftTorqueScale;
                const coastEngineTorque = Math.abs(carSpeed) > 0.3
                    ? -Math.sign(carSpeed) * phys.maxTorqueNm * phys.engineBrakingFactor *
                      gearRatio * phys.finalDrive * 0.88
                    : 0;
                let driveTorquePerTire = 0;
                if (reverse > 0.01 && carSpeed <= 0.15) {
                    driveTorquePerTire = -phys.maxTorqueNm * 0.78 * reverse *
                        gearRatio * phys.finalDrive * 0.88 / 2;
                } else if (brake > 0.04) {
                    driveTorquePerTire = coastEngineTorque * (1 - brake * 0.45) / 2;
                } else {
                    driveTorquePerTire = THREE.MathUtils.lerp(coastEngineTorque, fullDriveTorque, throttle) / 2;
                }

                const totalNormalLoad = phys.mass * gravity;
                const maxStaticFront = totalNormalLoad * phys.weightDistributionFront;
                const maxStaticRear = totalNormalLoad * (1 - phys.weightDistributionFront);
                const longitudinalLoadTransfer = THREE.MathUtils.clamp(
                    phys.mass * pp.longitudinalAcceleration * phys.cgHeight / wb,
                    -maxStaticRear,
                    maxStaticFront
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

                    const staticToeRad = THREE.MathUtils.degToRad(frontAxle ? phys.frontToeDeg : phys.rearToeDeg);
                    const toeOffset = Math.sign(tire.x) * staticToeRad;
                    const tireAngle = pp.yaw + (frontAxle ? tireSteeringAngle : 0) + toeOffset;
                    const tireForwardX = -Math.sin(tireAngle);
                    const tireForwardZ = -Math.cos(tireAngle);
                    const tireRightX = Math.cos(tireAngle);
                    const tireRightZ = -Math.sin(tireAngle);
                    const longitudinalVelocity = pointVelocityX * tireForwardX + pointVelocityZ * tireForwardZ;
                    const lateralVelocity = pointVelocityX * tireRightX + pointVelocityZ * tireRightZ;

                    const axleWeightShare = frontAxle ? phys.weightDistributionFront : (1 - phys.weightDistributionFront);
                    const axleLoad = frontAxle ? frontAxleLoad : rearAxleLoad;
                    const trackWidth = frontAxle ? innovaZenixSpecs.frontTread : innovaZenixSpecs.rearTread;
                    const rollCenterHeight = frontAxle ? phys.frontRollCenterHeight : phys.rearRollCenterHeight;
                    const axleRollStiffness = frontAxle ? frontRollStiffness : rearRollStiffness;
                    const rollStiffnessShare = axleRollStiffness / totalRollStiffness;
                    const rawLateralTransfer = phys.mass * pp.lateralAcceleration / trackWidth * (
                        rollCenterHeight * axleWeightShare +
                        (phys.cgHeight - rollCenterHeight) * rollStiffnessShare
                    ) * (tire.x < 0 ? 1 : -1);
                    const lateralLoadTransfer = THREE.MathUtils.clamp(rawLateralTransfer, -axleLoad / 2, axleLoad / 2);
                    const normalLoad = Math.max(0, axleLoad / 2 + lateralLoadTransfer);
                    const maximumTireForce = phys.frictionCoefficient * normalLoad;

                    const wheelAngularSpeed = pp.wheelAngularSpeeds[index];
                    const vDenom = Math.max(Math.abs(longitudinalVelocity), 1.2);
                    const slipRatio = (wheelAngularSpeed * phys.wheelRadius - longitudinalVelocity) / vDenom;
                    const slipAngle = Math.atan2(lateralVelocity, vDenom);
                    let longitudinalForce = calculateTireForce(slipRatio, phys.longitudinalStiffness, maximumTireForce, phys.tireShapeFactor);
                    let lateralForce = -calculateTireForce(slipAngle, phys.lateralStiffness, maximumTireForce, phys.tireShapeFactor);

                    const staticCamberRad = THREE.MathUtils.degToRad(frontAxle ? phys.frontCamberDeg : phys.rearCamberDeg);
                    const rollCompliance = frontAxle ? phys.frontCamberRollCompliance : phys.rearCamberRollCompliance;
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
                        lateralForce *= 0.65;
                    }

                    const surfaceSpeed = Math.hypot(pointVelocityX, pointVelocityZ);
                    const longSlipSpeed = Math.abs(wheelAngularSpeed * phys.wheelRadius - longitudinalVelocity);
                    const latSlipRatio = Math.max(0, (Math.abs(lateralVelocity) - 2.2) / 5.5);
                    const longSlipRatio = Math.max(0, (longSlipSpeed - 3.2) / 9.0);
                    const hbSkid = handbrakeOnTire > 0 && surfaceSpeed > 1.5 ? 0.92 : 0;
                    const rawSkid = surfaceSpeed > 1.5 ? Math.max(hbSkid, latSlipRatio, longSlipRatio) : 0;
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
                    const brakeTorquePerTire = brake * absScale * lowSpeedBrakeScale * phys.maxBrakingForce *
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

                // Dinamika suspensi body roll
                const rollCenterHeight = (frontRollStiffness * phys.frontRollCenterHeight + rearRollStiffness * phys.rearRollCenterHeight) / totalRollStiffness;
                const rollMomentArm = phys.cgHeight - rollCenterHeight;
                const effectiveRollStiffness = Math.max(1, totalRollStiffness - phys.mass * gravity * rollMomentArm);
                const rollDampingRatio = (frontRollStiffness * phys.frontDampingRatio + rearRollStiffness * phys.rearDampingRatio) / totalRollStiffness;
                const rollDamping = 2 * rollDampingRatio * Math.sqrt(effectiveRollStiffness * rollInertia);
                const rollTorque = phys.mass * pp.lateralAcceleration * rollMomentArm;
                const rollAngularAcceleration = (rollTorque - effectiveRollStiffness * pp.bodyRoll - rollDamping * pp.bodyRollVelocity) / rollInertia;
                pp.bodyRollVelocity += rollAngularAcceleration * substepDt;
                const nextBodyRoll = pp.bodyRoll + pp.bodyRollVelocity * substepDt;
                const clampedBodyRoll = THREE.MathUtils.clamp(nextBodyRoll, -phys.maxBodyRoll, phys.maxBodyRoll);
                if (clampedBodyRoll !== nextBodyRoll) pp.bodyRollVelocity = 0;
                pp.bodyRoll = clampedBodyRoll;

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
            data.speed = finalSpeed;
            data.worldVelX = pp.vx;
            data.worldVelZ = pp.vz;
            data.skidIntensity = frameMaxTireSkid;

            npc.position.set(pp.x, pp.y, pp.z);
            npc.rotation.y = pp.yaw;
            npc.rotation.z = pp.bodyRoll;
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
            policeVoiceCooldownTimer = 0;
            policeThreatLevel = 0;
            policeToastTimer = 0;
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

            const safeMarginMeters = 64;
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
                    policePhysics: isPolice ? createPoliceCarPhysicsState() : null,
                    halfLength,
                    halfWidth,
                    nearMissed: false
                };

                scene.add(group);
                placeOnTrack(group, slot.progress, slot.chosenLane);
                trafficCars.push(group);
            }
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
            if (hasStarted && !isPursuit) {
                let playerDelta = (playerTrackProgress - data.progress) * trackLength;
                if (playerDelta > trackLength * 0.5) playerDelta -= trackLength;
                if (playerDelta < -trackLength * 0.5) playerDelta += trackLength;

                const aheadCheckRange = incidentActive ? 58 : 22;
                if (Math.abs(playerRoadLateral - candLane) <= 2.65 && playerDelta > -26 && playerDelta < aheadCheckRange) {
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
                            const limitA = getNpcWallLateralLimit(a);
                            const limitB = getNpcWallLateralLimit(b);
                            a.lateralPos = THREE.MathUtils.clamp(a.lateralPos - dir * sep * shareA, -limitA, limitA);
                            b.lateralPos = THREE.MathUtils.clamp(b.lateralPos + dir * sep * shareB, -limitB, limitB);

                            let jLat = 0;
                            const relLatV = a.lateralVelocity - b.lateralVelocity;
                            if (relLatV * dir > 0) {
                                jLat = (1 + 0.08) * (relLatV * dir) / totalInvM;
                                a.lateralVelocity -= dir * jLat * invMa;
                                b.lateralVelocity += dir * jLat * invMb;
                                if (Math.abs(relLatV) > 1.4) {
                                    a.controlLossTimer = Math.max(a.controlLossTimer, 0.45);
                                    b.controlLossTimer = Math.max(b.controlLossTimer, 0.55);
                                    b.yawVelocity += dir * 0.45;
                                    b.rollVelocity += dir * 0.7;
                                }
                            }

                            const aPhysActive = a.isPolice && a.policeState === 'chase' && a.policePhysics && a.policePhysics.initialized;
                            const bPhysActive = b.isPolice && b.policeState === 'chase' && b.policePhysics && b.policePhysics.initialized;
                            if (aPhysActive || bPhysActive) {
                                const pt = getTrackWorldPointAt(a.progress, 0);
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
                            }
                        } else {
                            const sep = longPen + 0.05;
                            a.progress = (a.progress - (sep * shareA) / trackLength + 1) % 1;
                            b.progress = (b.progress + (sep * shareB) / trackLength) % 1;

                            let jLong = 0;
                            const relLongV = a.speed - b.speed;
                            if (relLongV > 0) {
                                jLong = (1 + 0.08) * relLongV / totalInvM;
                                a.speed = Math.max(0, a.speed - jLong * invMa);
                                b.speed = Math.min(b.isPolice && b.policeState === 'chase' ? POLICE_MAX_CHASE_SPEED_MPS : 42, b.speed + jLong * invMb);
                                b.pushedTimer = Math.max(b.pushedTimer, 0.7);
                                if (relLongV > 2.2) {
                                    a.controlLossTimer = Math.max(a.controlLossTimer, 0.35);
                                    b.controlLossTimer = Math.max(b.controlLossTimer, 0.4);
                                }
                            }

                            const aPhysActive = a.isPolice && a.policeState === 'chase' && a.policePhysics && a.policePhysics.initialized;
                            const bPhysActive = b.isPolice && b.policeState === 'chase' && b.policePhysics && b.policePhysics.initialized;
                            if (aPhysActive || bPhysActive) {
                                const pt = getTrackWorldPointAt(a.progress, 0);
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

            // Deteksi bertahap 3 tingkatan polisi berdasarkan unit yang benar-benar ter-trigger pemain
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
                const sameElevation = Math.abs(playerY - npc.position.y) < 4.5;
                const inVisionCone = sameElevation &&
                    toPlayerDist <= POLICE_VISION_RANGE &&
                    forwardDot >= POLICE_VISION_COS_HALF_ANGLE;

                if (hasStarted && playerSpeedMps > POLICE_SPEED_LIMIT_MPS && inVisionCone) {
                    if (data.policeState !== 'chase') {
                        data.policeState = 'chase';
                        syncPolicePhysicsFromNpc(npc);
                    }
                    data.chaseCalmTimer = 0;
                }
                if (data.policeState === 'chase') {
                    if (!data.policePhysics || !data.policePhysics.initialized) {
                        syncPolicePhysicsFromNpc(npc);
                    }
                    triggeredPoliceCount++;
                }
                policeCandidates.push({ data, toPlayerDist, sameElevation });
            }

            const newThreatTier = triggeredPoliceCount >= 3 ? 3 : (triggeredPoliceCount === 2 ? 2 : (triggeredPoliceCount === 1 ? 1 : 0));
            if (hasStarted && !isGameOver && newThreatTier > policeThreatLevel) {
                policeThreatLevel = newThreatTier;
                showPoliceAlertToast(policeThreatLevel);
            }
            const activeTier = Math.max(policeThreatLevel, newThreatTier);

            const policeTacticalRoles = new Map();
            const policeChaseIndices = new Map();
            if (triggeredPoliceCount > 0) {
                const activePolice = policeCandidates
                    .filter(c => c.data.policeState === 'chase')
                    .sort((a, b) => a.toPlayerDist - b.toPlayerDist);

                activePolice.forEach((entry, idx) => {
                    policeChaseIndices.set(entry.data, idx);
                    if (activeTier >= 3) {
                        let role = 'pin_side';
                        if (idx === 0) {
                            role = 'block_front';
                        } else if (idx === 1) {
                            role = 'pin_rear';
                        } else {
                            role = 'pin_side';
                        }
                        policeTacticalRoles.set(entry.data, role);
                    } else {
                        policeTacticalRoles.set(entry.data, 'follow');
                    }
                });
            }

            const isPlayerStoppingOrStopped = hasStarted && playerSpeedMps <= 5.5;
            const incidentActive = hasStarted && (playerSpeedMps < 11.5 || triggeredPoliceCount > 0);

            for (let k = 0; k < totalCars; k++) {
                const i = trafficSortedIndices[k];
                const npc = trafficCars[i];
                const data = npc.userData;
                const prevSpeed = data.speed;
                const prevControlLoss = data.controlLossTimer > 0;
                const isChasingPolice = data.isPolice && data.policeState === 'chase';

                if (data.hitCooldown > 0) data.hitCooldown = Math.max(0, data.hitCooldown - dt);
                if (data.pushedTimer > 0) data.pushedTimer = Math.max(0, data.pushedTimer - dt);
                if (data.controlLossTimer > 0) data.controlLossTimer = Math.max(0, data.controlLossTimer - dt);
                if (data.laneChangeCooldown > 0) data.laneChangeCooldown = Math.max(0, data.laneChangeCooldown - dt);

                let closestAheadDist = Infinity;
                let closestAheadSpeed = data.targetSpeed;
                let closestAheadHalfLen = 2.1;
                let closestAheadIsIncident = false;

                for (let step = 1; step < totalCars; step++) {
                    const otherIdx = trafficSortedIndices[(k + step) % totalCars];
                    const otherData = trafficCars[otherIdx].userData;
                    let aheadDist = (otherData.progress - data.progress) * trackLength;
                    if (aheadDist < 0) aheadDist += trackLength;
                    if (aheadDist >= 78) break;

                    const lateralClear = Math.abs(otherData.lateralPos - data.lateralPos);
                    const laneMatch = isChasingPolice
                        ? lateralClear <= 2.35
                        : (lateralClear <= 2.2 || Math.abs(otherData.lane - data.lane) < 0.6);
                    if (aheadDist > 0 && laneMatch) {
                        if (aheadDist < closestAheadDist) {
                            closestAheadDist = aheadDist;
                            closestAheadSpeed = otherData.speed;
                            closestAheadHalfLen = otherData.halfLength || 2.1;
                            closestAheadIsIncident = (otherData.isPolice && otherData.policeState === 'chase') || otherData.speed < 8.5;
                        }
                    }
                }

                // NPC biasa juga mendeteksi posisi pemain di depan saat peristiwa pengejaran / berhenti berlangsung
                if (!isChasingPolice && hasStarted && incidentActive) {
                    let playerAhead = (playerTrackProgress - data.progress) * trackLength;
                    if (playerAhead < 0) playerAhead += trackLength;
                    if (playerAhead > 0 && playerAhead < 78) {
                        const playerLatClear = Math.abs(playerRoadLateral - data.lateralPos);
                        const latThreshold = Math.max(
                            (data.halfWidth || 0.9) + playerHalfWid + 0.65,
                            playerSpeedMps < 8.5 ? 2.55 : 2.15
                        );
                        const playerLaneMatch = playerLatClear <= latThreshold ||
                            Math.abs(playerRoadLateral - data.lane) <= 2.25;
                        if (playerLaneMatch && playerAhead < closestAheadDist) {
                            closestAheadDist = playerAhead;
                            closestAheadSpeed = Math.max(0, playerSpeedMps);
                            closestAheadHalfLen = playerHalfLen;
                            closestAheadIsIncident = true;
                        }
                    }
                }

                // Logika Pengejaran Bertingkat & Berhenti Mepet saat Pemain Berhenti
                let playerDeltaMeters = 0;
                const tacticalRole = isChasingPolice ? (policeTacticalRoles.get(data) || 'follow') : null;
                const chaseUnitRank = isChasingPolice ? (policeChaseIndices.get(data) || 0) : 0;
                let pursuitTargetLateral = playerRoadLateral;

                const tierMaxChaseSpeed = activeTier >= 3
                    ? POLICE_MAX_CHASE_SPEED_MPS
                    : (activeTier === 2 ? 128 * TRAFFIC_KMH_TO_MPS : 115 * TRAFFIC_KMH_TO_MPS);

                if (isChasingPolice) {
                    playerDeltaMeters = (playerTrackProgress - data.progress) * trackLength;
                    if (playerDeltaMeters > trackLength * 0.5) playerDeltaMeters -= trackLength;
                    if (playerDeltaMeters < -trackLength * 0.5) playerDeltaMeters += trackLength;

                    const minCombinedLen = (data.halfLength || 2.15) + playerHalfLen;
                    const minCombinedWid = (data.halfWidth || 0.91) + playerHalfWid;
                    const sideSign = playerRoadLateral > 0.5 ? -1 : 1;

                    if (isPlayerStoppingOrStopped) {
                        // Pemain melambat / berhenti: polisi ikut mendekat mepet banget lalu ikut berhenti di SEMUA tingkatan
                        if (chaseUnitRank === 0) {
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.4, 6.4);
                            if (playerDeltaMeters >= -(minCombinedLen * 0.45)) {
                                const desiredGap = minCombinedLen + 0.35;
                                const gapError = playerDeltaMeters - desiredGap;
                                if (gapError > 0.12) {
                                    const safeApproach = Math.sqrt(2 * 5.6 * gapError);
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
                                const aheadGap = -playerDeltaMeters - (minCombinedLen + 0.45);
                                if (aheadGap > 0.35 && aheadGap < 24 && playerSpeedMps <= 2.5) {
                                    data.targetSpeed = -THREE.MathUtils.clamp(Math.sqrt(2 * 3.5 * aheadGap), 0.8, 4.5);
                                } else {
                                    data.targetSpeed = 0;
                                }
                            }
                        } else if (chaseUnitRank === 1) {
                            // Unit kedua menempel mepet di sisi bodi pemain
                            pursuitTargetLateral = THREE.MathUtils.clamp(
                                playerRoadLateral + sideSign * (minCombinedWid + 0.22),
                                -6.45,
                                6.45
                            );
                            if (Math.abs(playerDeltaMeters) <= 0.35 && playerSpeedMps <= POLICE_PIN_SPEED_MPS) {
                                data.targetSpeed = 0;
                            } else if (playerDeltaMeters > 0.2) {
                                const safeApproach = Math.sqrt(2 * 5.6 * playerDeltaMeters);
                                data.targetSpeed = THREE.MathUtils.clamp(
                                    playerSpeedMps + Math.min(tierMaxChaseSpeed - playerSpeedMps, safeApproach),
                                    0,
                                    tierMaxChaseSpeed
                                );
                            } else if (-playerDeltaMeters > 0.35 && -playerDeltaMeters < 24 && playerSpeedMps <= 2.5) {
                                data.targetSpeed = -THREE.MathUtils.clamp(Math.sqrt(2 * 3.5 * (-playerDeltaMeters)), 0.8, 4.5);
                            } else {
                                data.targetSpeed = 0;
                            }
                        } else {
                            // Unit tambahan menutup sisi seberang atau depan pemain
                            const extraSideSign = chaseUnitRank % 2 === 0 ? -sideSign : sideSign;
                            pursuitTargetLateral = THREE.MathUtils.clamp(
                                playerRoadLateral + extraSideSign * (minCombinedWid + 0.26),
                                -6.45,
                                6.45
                            );
                            const desiredGap = minCombinedLen + 0.45;
                            const gapError = playerDeltaMeters - desiredGap;
                            if (gapError > 0.15) {
                                const safeApproach = Math.sqrt(2 * 5.6 * gapError);
                                data.targetSpeed = THREE.MathUtils.clamp(
                                    playerSpeedMps + Math.min(tierMaxChaseSpeed - playerSpeedMps, safeApproach),
                                    0,
                                    tierMaxChaseSpeed
                                );
                            } else {
                                data.targetSpeed = 0;
                            }
                        }
                    } else if (activeTier === 1) {
                        // Tingkat 1: mengikuti wajar dari belakang dengan akselerasi sekelas mobil penumpang (Zenix)
                        pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.2, 6.2);
                        const followGap = 9.0 + minCombinedLen;
                        const gapError = playerDeltaMeters - followGap;
                        const adjustSpeed = THREE.MathUtils.clamp(gapError * 0.75, -14, 14);
                        data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + adjustSpeed, 4, tierMaxChaseSpeed);
                    } else if (activeTier === 2) {
                        // Tingkat 2: dua polisi mulai ngebut kencang mengejar & membuntuti dekat (belum menabrak/menahan)
                        const latSpread = chaseUnitRank === 0 ? 0 : sideSign * 2.4;
                        pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral + latSpread, -6.3, 6.3);
                        const followGap = (chaseUnitRank === 0 ? 3.8 : 6.0) + minCombinedLen;
                        const gapError = playerDeltaMeters - followGap;
                        const boost = gapError >= 0
                            ? THREE.MathUtils.clamp(gapError * 1.05, 0, 22)
                            : THREE.MathUtils.clamp(gapError * 1.4, -18, 0);
                        data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + boost, 4, tierMaxChaseSpeed);
                    } else if (tacticalRole === 'block_front') {
                        // Tingkat 3 (Front): menyalip ke depan lalu memotong & mengerem keras untuk menghentikan pemain
                        if (playerDeltaMeters <= -(minCombinedLen - 0.35)) {
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.35, 6.35);
                            const frontGap = -playerDeltaMeters - minCombinedLen;
                            if (frontGap > 2.2) {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.52 - 4.5, 0, tierMaxChaseSpeed);
                            } else {
                                data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps * 0.4 - 3.0, 0, tierMaxChaseSpeed);
                            }
                        } else {
                            pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral + sideSign * 2.55, -6.4, 6.4);
                            data.targetSpeed = THREE.MathUtils.clamp(
                                Math.max(playerSpeedMps + 18, 30),
                                0,
                                tierMaxChaseSpeed
                            );
                        }
                    } else if (tacticalRole === 'pin_side') {
                        // Tingkat 3 (Flank): memepet & menyerempet bodi samping pemain
                        pursuitTargetLateral = THREE.MathUtils.clamp(
                            playerRoadLateral + sideSign * (minCombinedWid - 0.08),
                            -6.45,
                            6.45
                        );
                        const sideBoost = THREE.MathUtils.clamp(playerDeltaMeters * 1.65, -24, 30);
                        data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + sideBoost, 0, tierMaxChaseSpeed);
                    } else {
                        // Tingkat 3 (Rear): aktif menabrak & menekan dari belakang sampai berhenti
                        pursuitTargetLateral = THREE.MathUtils.clamp(playerRoadLateral, -6.35, 6.35);
                        const desiredTailOffset = (playerSpeedMps <= 6.0 ? 0.15 : 1.6) + minCombinedLen;
                        const gapError = playerDeltaMeters - desiredTailOffset;
                        if (gapError >= 0) {
                            const catchupBoost = THREE.MathUtils.clamp(gapError * 1.35, 0, 32);
                            data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + catchupBoost, 0, tierMaxChaseSpeed);
                        } else {
                            const brakeBack = THREE.MathUtils.clamp(gapError * 1.8, -24, 0);
                            data.targetSpeed = THREE.MathUtils.clamp(playerSpeedMps + brakeBack, 0, tierMaxChaseSpeed);
                        }
                    }
                }

                const maxNpcSpeed = isChasingPolice ? tierMaxChaseSpeed : 42;
                const minNpcSpeed = (isChasingPolice && isPlayerStoppingOrStopped) ? -5.0 : 0;

                // Pindah lajur otonom: polisi mengejar, NPC biasa menghindari peristiwa berhenti / macet
                if (data.controlLossTimer <= 0) {
                    if (isChasingPolice) {
                        const blockedAhead = closestAheadDist < 32 &&
                            (closestAheadSpeed < data.targetSpeed - 0.5 || closestAheadDist < 20);
                        if (blockedAhead) {
                            if (data.laneChangeCooldown <= 0) {
                                const sortedLanes = VALID_LANES.slice().sort((a, b) =>
                                    Math.abs(a - pursuitTargetLateral) - Math.abs(b - pursuitTargetLateral)
                                );
                                for (let c = 0; c < sortedLanes.length; c++) {
                                    const candLane = sortedLanes[c];
                                    if (Math.abs(candLane - data.lateralPos) < 1.8) continue;
                                    if (isTargetLaneClearForNpc(k, data, candLane, true, incidentActive)) {
                                        data.lane = candLane;
                                        data.laneChangeCooldown = activeTier >= 3 ? 0.4 : 0.75;
                                        break;
                                    }
                                }
                            }
                        } else if (data.laneChangeCooldown <= 0 || Math.abs(data.lane - data.lateralPos) < 0.8) {
                            data.lane = pursuitTargetLateral;
                        }
                    } else if (
                        data.speed > 2.2 &&
                        data.laneChangeCooldown <= 0 &&
                        Math.abs(data.lane - data.lateralPos) < 0.65 &&
                        closestAheadDist < (closestAheadIsIncident ? 56 : 32) &&
                        (closestAheadIsIncident || closestAheadSpeed < data.targetSpeed - 0.45 || closestAheadDist < 20)
                    ) {
                        let candidates = data.lane === LANE_LEFT
                            ? [LANE_MIDDLE]
                            : data.lane === LANE_MIDDLE
                                ? [LANE_RIGHT, LANE_LEFT]
                                : [LANE_MIDDLE];
                        if (incidentActive && candidates.length > 1) {
                            candidates = candidates.slice().sort((a, b) =>
                                Math.abs(b - playerRoadLateral) - Math.abs(a - playerRoadLateral)
                            );
                        }

                        for (let c = 0; c < candidates.length; c++) {
                            const candLane = candidates[c];
                            if (isTargetLaneClearForNpc(k, data, candLane, false, incidentActive)) {
                                data.lane = candLane;
                                data.targetSpeed = getLaneSpeedMps(candLane);
                                data.laneChangeCooldown = closestAheadIsIncident
                                    ? (1.6 + Math.random() * 1.1)
                                    : (3.2 + Math.random() * 2.5);
                                break;
                            }
                        }
                    }
                }

                // Pengaturan kecepatan (akselerasi normal / pengereman halus sampai berhenti di kemacetan)
                let desiredSpeed = data.targetSpeed;
                if (isChasingPolice) {
                    if (closestAheadDist < 24 && !isPlayerStoppingOrStopped) {
                        if (closestAheadDist < 12) {
                            desiredSpeed = Math.min(desiredSpeed, closestAheadSpeed * 0.78);
                        } else {
                            desiredSpeed = Math.min(desiredSpeed, closestAheadSpeed * 0.96);
                        }
                    }
                } else if (closestAheadDist < 58) {
                    const minJamGap = (data.halfLength || 2.1) + closestAheadHalfLen + 2.6;
                    const netGap = closestAheadDist - minJamGap;
                    if (netGap <= 0.25) {
                        desiredSpeed = closestAheadSpeed <= 1.2
                            ? 0
                            : Math.min(desiredSpeed, Math.max(0, closestAheadSpeed - 1.5));
                    } else {
                        const safeApproach = Math.max(0, closestAheadSpeed) + Math.sqrt(2 * 6.5 * netGap);
                        desiredSpeed = Math.min(desiredSpeed, safeApproach);
                    }
                }

                if (isChasingPolice) {
                    const pp = data.policePhysics;
                    const fwdX = -Math.sin(pp.yaw);
                    const fwdZ = -Math.cos(pp.yaw);
                    const currentCarSpeed = pp.vx * fwdX + pp.vz * fwdZ;
                    const cappedDesired = THREE.MathUtils.clamp(desiredSpeed, -4.5, tierMaxChaseSpeed);
                    const speedErr = cappedDesired - currentCarSpeed;
                    const isReversingTarget = cappedDesired < -0.2 && currentCarSpeed <= 0.45;

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
                        } else if (speedErr < -0.45) {
                            brakeCmd = THREE.MathUtils.clamp((-speedErr - 0.35) / 5.0, 0.2, 1.0);
                        } else if (speedErr > 0.2 && cappedDesired > 0.3) {
                            const maxThrottleCap = activeTier === 1 ? 0.82 : 1.0;
                            const throttleScale = activeTier === 1 ? 6.0 : 3.8;
                            throttleCmd = THREE.MathUtils.clamp(speedErr / throttleScale, 0.18, maxThrottleCap);
                        } else if (cappedDesired > 1.0 && speedErr > -0.2) {
                            throttleCmd = 0.16;
                        }

                        if (cappedDesired <= 0.25 && Math.abs(currentCarSpeed) < 0.4) {
                            steerCmd = 0;
                        } else {
                            let lookaheadDist = THREE.MathUtils.clamp(7.5 + Math.abs(currentCarSpeed) * 0.42, 7.5, 22);
                            if (isPlayerStoppingOrStopped && Math.abs(playerDeltaMeters) < 15 && Math.abs(playerDeltaMeters) > 2) {
                                lookaheadDist = Math.max(5.0, Math.min(lookaheadDist, Math.abs(playerDeltaMeters) + 1.5));
                            }
                            const targetPt = getTrackWorldPointAt(data.progress + lookaheadDist / trackLength, data.lane);
                            const angleToTarget = Math.atan2(-(targetPt.x - pp.x), -(targetPt.z - pp.z));
                            const headingError = wrapAngleRad(angleToTarget - pp.yaw);
                            const steerP = THREE.MathUtils.clamp(1.75 - Math.abs(currentCarSpeed) * 0.018, 0.85, 1.75);
                            steerCmd = THREE.MathUtils.clamp(headingError * steerP - pp.yawRate * 0.28, -1, 1);
                        }
                    }

                    stepPoliceCarPhysics(npc, dt, {
                        throttle: throttleCmd,
                        brake: brakeCmd,
                        reverse: reverseCmd,
                        handbrake: 0,
                        steer: steerCmd
                    });
                    continue;
                }

                // Model fisika ban NPC biasa: saat terdorong / hilang traksi vs berkendara normal
                const yaw = data.yawOffset;
                const cosYaw = Math.cos(yaw);
                const sinYaw = Math.sin(yaw);
                const bodyLongVel = data.speed * cosYaw - data.lateralVelocity * sinYaw;
                const bodyLatSlip = data.speed * sinYaw + data.lateralVelocity * cosYaw;

                const isSliding = data.controlLossTimer > 0 || Math.abs(bodyLatSlip) > 1.85 || Math.abs(yaw) > 0.18;
                if (isSliding) {
                    const gripFactor = THREE.MathUtils.clamp(1 - data.controlLossTimer * 0.55, 0.35, 0.95);
                    const maxLatAccel = 9.2 * gripFactor;
                    const tireLatAccel = THREE.MathUtils.clamp(-bodyLatSlip * 5.0 * gripFactor, -maxLatAccel, maxLatAccel);
                    const tireLongAccel = -Math.sign(bodyLongVel) * 1.35;

                    const accelFwd = tireLongAccel * cosYaw + tireLatAccel * sinYaw;
                    const accelLat = -tireLongAccel * sinYaw + tireLatAccel * cosYaw;

                    data.speed = THREE.MathUtils.clamp(data.speed + accelFwd * dt, minNpcSpeed, maxNpcSpeed);
                    data.lateralVelocity = THREE.MathUtils.clamp(data.lateralVelocity + accelLat * dt, -14, 14);

                    const yawAccel = (-11 * gripFactor * data.yawOffset) - (4.2 + 2.4 * gripFactor) * data.yawVelocity;
                    data.yawVelocity += yawAccel * dt;
                    data.yawOffset = THREE.MathUtils.clamp(data.yawOffset + data.yawVelocity * dt, -1.25, 1.25);

                    const rollTarget = THREE.MathUtils.clamp(-tireLatAccel * 0.014, -0.22, 0.22);
                    const rollAccel = 28 * (rollTarget - data.rollOffset) - 7.5 * data.rollVelocity;
                    data.rollVelocity += rollAccel * dt;
                    data.rollOffset = THREE.MathUtils.clamp(data.rollOffset + data.rollVelocity * dt, -0.24, 0.24);
                } else {
                    if (prevControlLoss || Math.abs(data.lane - data.lateralPos) > 2.4) {
                        const nearestLane = getNearestValidLane(data.lateralPos);
                        if (nearestLane !== data.lane) {
                            data.lane = nearestLane;
                            data.targetSpeed = getLaneSpeedMps(nearestLane);
                        }
                    }

                    const speedDiff = desiredSpeed - data.speed;
                    const accelLimit = speedDiff < 0
                        ? 11.5
                        : (data.pushedTimer > 0 ? 2.2 : 3.4);
                    const responseGain = 2.8;
                    data.speed += THREE.MathUtils.clamp(speedDiff * responseGain, -accelLimit, accelLimit) * dt;
                    data.speed = THREE.MathUtils.clamp(data.speed, minNpcSpeed, maxNpcSpeed);

                    const lateralError = data.lane - data.lateralPos;
                    const speedSteerFactor = THREE.MathUtils.clamp(Math.abs(data.speed) / 3.0, 0.05, 1);
                    const maxLatSteer = 2.6 * speedSteerFactor;
                    const steerGain = 1.5;
                    const steerDamp = 5.8;
                    const desiredLatVel = THREE.MathUtils.clamp(lateralError * steerGain, -maxLatSteer, maxLatSteer);
                    data.lateralVelocity = THREE.MathUtils.damp(data.lateralVelocity, desiredLatVel, steerDamp, dt);

                    const steerYawTarget = data.speed > 1.4
                        ? -Math.atan2(data.lateralVelocity, Math.max(8, data.speed))
                        : 0;
                    const yawAccel = 22 * (steerYawTarget - data.yawOffset) - 7.5 * data.yawVelocity;
                    data.yawVelocity += yawAccel * dt;
                    data.yawOffset = THREE.MathUtils.clamp(data.yawOffset + data.yawVelocity * dt, -0.45, 0.45);

                    const rollTarget = THREE.MathUtils.clamp(-data.lateralVelocity * 0.025, -0.1, 0.1);
                    const rollAccel = 30 * (rollTarget - data.rollOffset) - 8.5 * data.rollVelocity;
                    data.rollVelocity += rollAccel * dt;
                    data.rollOffset = THREE.MathUtils.clamp(data.rollOffset + data.rollVelocity * dt, -0.22, 0.22);
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
                if (data.isPolice && data.policeState === 'chase' && data.policePhysics && data.policePhysics.initialized) {
                    enforcePoliceConcreteWallCollision(npc, false, dt);
                    npc.position.set(data.policePhysics.x, data.policePhysics.y, data.policePhysics.z);
                    npc.rotation.y = data.policePhysics.yaw;
                    npc.rotation.z = data.policePhysics.bodyRoll;
                } else {
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
