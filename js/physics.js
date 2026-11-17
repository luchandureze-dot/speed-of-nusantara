        function calculateTireForce(slip, stiffness, peakForce, shapeFactor) {
            return peakForce * Math.sin(shapeFactor * Math.atan(stiffness * slip));
        }

        function getEngineTorqueFactor(rpm, idleRpm, maxRpm) {
            const normalized = THREE.MathUtils.clamp(
                (rpm - idleRpm) / Math.max(1, maxRpm - idleRpm),
                0,
                1
            );
            if (normalized >= 0.995) return 0;
            const limiterFade = normalized > 0.93
                ? 1 - (normalized - 0.93) / 0.065
                : 1;
            const curveFactor = normalized < 0.68
                ? 0.68 + 0.32 * Math.sin((normalized / 0.68) * (Math.PI / 2))
                : 1.0 - 0.14 * ((normalized - 0.68) / 0.32);
            return Math.max(0, curveFactor * limiterFade);
        }

        function updateVehiclePhysics(dt) {
            const physicsSubsteps = 8;
            const substepDt = dt / physicsSubsteps;
            for (let step = 0; step < physicsSubsteps; step++) {
                updateVehiclePhysicsStep(substepDt);
            }
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            const targetHandbrake = keys.handbrake ? 1 : 0;
            const handbrakeRate = targetHandbrake > handbrakeVisual ? 22 : 16;
            throttleVisual = throttleSmoothed;
            brakeVisual = Math.max(brakeSmoothed, reverseSmoothed);
            handbrakeVisual = THREE.MathUtils.clamp(
                handbrakeVisual + Math.sign(targetHandbrake - handbrakeVisual) * Math.min(Math.abs(targetHandbrake - handbrakeVisual), handbrakeRate * dt),
                0,
                1
            );

            const isReversing = carSpeed < -0.25 || (reverseSmoothed > 0.15 && carSpeed <= 0.15);
            const displayGear = isReversing && selectedVehicleType === 'car' ? 'R' : currentGear;
            const rpmPercent = THREE.MathUtils.clamp(
                (engineRpm - physics.idleRpm) / Math.max(1, physics.maxRpm - physics.idleRpm) * 100,
                0,
                100
            );
            const steerNormalized = THREE.MathUtils.clamp(-steeringInputSmoothed, -1, 1);

            document.getElementById('rpm-value').innerText = Math.round(engineRpm);
            document.getElementById('gear-value').innerText = displayGear;
            const gearLabelEl = document.getElementById('gear-label');
            if (gearLabelEl) {
                gearLabelEl.innerText = physics.isCvt
                    ? 'RASIO'
                    : (isManualTransmission ? 'GIGI MT' : 'GIGI AT');
            }

            const rpmBarFill = document.getElementById('rpm-bar-fill');
            if (rpmBarFill) rpmBarFill.style.width = `${rpmPercent.toFixed(1)}%`;

            const gasMeterFill = document.getElementById('gas-meter-fill');
            if (gasMeterFill) gasMeterFill.style.height = `${(throttleVisual * 100).toFixed(1)}%`;

            const brakeMeterFill = document.getElementById('brake-meter-fill');
            if (brakeMeterFill) brakeMeterFill.style.height = `${(brakeVisual * 100).toFixed(1)}%`;

            const handbrakeMeterFill = document.getElementById('handbrake-meter-fill');
            if (handbrakeMeterFill) handbrakeMeterFill.style.height = `${(handbrakeVisual * 100).toFixed(1)}%`;

            const steerDot = document.getElementById('steer-indicator-dot');
            if (steerDot) steerDot.style.left = `${(steerNormalized * 50 + 50).toFixed(1)}%`;

            const steerIcon = document.getElementById('steering-wheel-icon');
            if (steerIcon) steerIcon.style.transform = `rotate(${(steerNormalized * 90).toFixed(1)}deg)`;
        }

        function updateVehiclePhysicsStep(dt) {
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            const isMotorcycle = selectedVehicleType === 'motorcycle';
            const forwardX = -Math.sin(playerYaw);
            const forwardZ = -Math.cos(playerYaw);
            const rightX = Math.cos(playerYaw);
            const rightZ = -Math.sin(playerYaw);
            carSpeed = velocityX * forwardX + velocityZ * forwardZ;

            const reverseRequested = keys.backward && !keys.forward;
            const rawThrottle = keys.forward ? 1 : 0;
            const rawBrake = reverseRequested && carSpeed > 0.15 ? 1 : 0;
            const rawReverse = reverseRequested && carSpeed <= 0.15 ? 1 : 0;
            const handbrake = keys.handbrake ? 1 : 0;

            throttleSmoothed = THREE.MathUtils.damp(
                throttleSmoothed,
                rawThrottle,
                rawThrottle > throttleSmoothed ? 6.8 : 9.2,
                dt
            );
            brakeSmoothed = THREE.MathUtils.damp(
                brakeSmoothed,
                rawBrake,
                rawBrake > brakeSmoothed ? 7.4 : 11.0,
                dt
            );
            reverseSmoothed = THREE.MathUtils.damp(
                reverseSmoothed,
                rawReverse,
                rawReverse > reverseSmoothed ? 5.2 : 10.5,
                dt
            );
            if (throttleSmoothed < 0.001 && rawThrottle === 0) throttleSmoothed = 0;
            if (brakeSmoothed < 0.001 && rawBrake === 0) brakeSmoothed = 0;
            if (reverseSmoothed < 0.001 && rawReverse === 0) reverseSmoothed = 0;

            const throttle = throttleSmoothed * (0.4 + 0.6 * throttleSmoothed);
            const brake = brakeSmoothed * (0.35 + 0.65 * brakeSmoothed);
            const reverse = reverseSmoothed * (0.4 + 0.6 * reverseSmoothed);

            const accelDamageScale = Math.max(0.25, Math.pow(0.98, damageAccelHits));
            const topSpeedDamageScale = Math.max(0.25, Math.pow(0.98, damageTopSpeedHits));
            const handlingGripScale = Math.max(0.45, Math.pow(0.99, damageHandlingHits));
            const handlingReturnScale = Math.max(0.45, Math.pow(0.99, damageHandlingHits));
            const effectiveMaxSpeed = physics.maxSpeed * topSpeedDamageScale;

            const rawSteeringInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
            const steeringSpeed = Math.abs(carSpeed);
            const lowSpeedAssist = 1 + 0.35 * THREE.MathUtils.clamp(1 - steeringSpeed / 8, 0, 1);
            const highSpeedSteerSmooth = 1 / (1 + Math.max(0, steeringSpeed - 18) * 0.016);
            const isCounterSteering =
                rawSteeringInput !== 0 &&
                steeringInputSmoothed !== 0 &&
                Math.sign(rawSteeringInput) !== Math.sign(steeringInputSmoothed);

            if (rawSteeringInput === 0) {
                steeringInputSmoothed = THREE.MathUtils.damp(
                    steeringInputSmoothed,
                    0,
                    physics.steerReturnRate * 1.5 * handlingReturnScale,
                    dt
                );
                if (Math.abs(steeringInputSmoothed) < 0.001) steeringInputSmoothed = 0;
            } else if (isCounterSteering) {
                const maxCounterStep = physics.steerReturnRate * 1.05 * handlingReturnScale * dt;
                steeringInputSmoothed += THREE.MathUtils.clamp(
                    rawSteeringInput - steeringInputSmoothed,
                    -maxCounterStep,
                    maxCounterStep
                );
            } else {
                const progressiveSlope = 0.48 + 0.82 * Math.abs(steeringInputSmoothed);
                const steerRate = physics.steerInRate * lowSpeedAssist * highSpeedSteerSmooth * progressiveSlope;
                const maxSteerStep = steerRate * dt;
                steeringInputSmoothed += THREE.MathUtils.clamp(
                    rawSteeringInput - steeringInputSmoothed,
                    -maxSteerStep,
                    maxSteerStep
                );
            }

            const steerAbs = Math.abs(steeringInputSmoothed);
            const baseSteeringInput = Math.sign(steeringInputSmoothed) *
                (0.18 * steerAbs + 0.82 * Math.pow(steerAbs, physics.steerGamma));
            const alignmentPull = damageHandlingHits > 0 && Math.abs(carSpeed) > 1.5
                ? damagePullSign * Math.min(0.18, damageHandlingHits * 0.008) * THREE.MathUtils.clamp(Math.abs(carSpeed) / 14, 0, 1)
                : 0;
            const steeringInput = THREE.MathUtils.clamp(baseSteeringInput + alignmentPull, -1, 1);
            const steeringSpeedScale =
                1 + Math.pow(steeringSpeed * physics.steeringSpeedFalloff, 2);
            const steeringAngle = steeringInput * (isMotorcycle
                ? physics.maxSteeringAngle
                : physics.maxInnerWheelSteerAngle) /
                steeringSpeedScale;
            const frontRollStiffness = isMotorcycle ? 0 :
                (physics.frontSpringRate / 2) * innovaZenixSpecs.frontTread *
                innovaZenixSpecs.frontTread / 2 + (physics.antiRollStiffnessFront || 0);
            const rearRollStiffness = isMotorcycle ? 0 :
                (physics.rearSpringRate / 2) * innovaZenixSpecs.rearTread *
                innovaZenixSpecs.rearTread / 2 + (physics.antiRollStiffnessRear || 0);
            const totalRollStiffness = frontRollStiffness + rearRollStiffness;

            const getActiveGearRatio = () => {
                if (physics.isCvt) {
                    const speedRatio = THREE.MathUtils.clamp(
                        Math.abs(carSpeed) / physics.maxSpeed,
                        0,
                        1
                    );
                    const blend = Math.pow(speedRatio, throttle ? 0.72 : 0.55);
                    return THREE.MathUtils.lerp(
                        physics.cvtLowRatio,
                        physics.cvtHighRatio,
                        blend
                    );
                }
                if (reverse) return physics.gearRatios[0];
                return physics.gearRatios[currentGear - 1];
            };

            const getDrivenWheelAngularSpeed = (speeds = wheelAngularSpeeds) => {
                let sum = 0;
                let count = 0;
                tireLayout.forEach((tire, index) => {
                    if (tire.axle === physics.drivenAxle) {
                        sum += Math.abs(speeds[index] || 0);
                        count += 1;
                    }
                });
                return count > 0
                    ? sum / count
                    : Math.abs(carSpeed) / physics.wheelRadius;
            };

            const getEngineRpm = (speeds = wheelAngularSpeeds) => {
                const gearRatio = getActiveGearRatio();
                const wheelRpm = getDrivenWheelAngularSpeed(speeds) * 60 / (2 * Math.PI);
                const clutchEngageFloor = physics.isCvt && throttle && Math.abs(carSpeed) < 6
                    ? 3400
                    : physics.idleRpm;
                return Math.max(
                    clutchEngageFloor,
                    Math.min(physics.maxRpm, wheelRpm * gearRatio * physics.finalDrive)
                );
            };

            engineRpm = THREE.MathUtils.damp(engineRpm, getEngineRpm(), 15, dt);
            const activeGearRatio = getActiveGearRatio();
            if (physics.isCvt) {
                currentGear = activeGearRatio > 1.95 ? 1 : activeGearRatio > 1.3 ? 2 : 3;
            } else if (!isManualTransmission) {
                if (engineRpm >= physics.maxRpm * 0.90 && currentGear < physics.gearRatios.length) {
                    currentGear += 1;
                    gearShiftBlendTimer = 0.18;
                } else if (engineRpm <= physics.maxRpm * 0.38 && currentGear > 1) {
                    currentGear -= 1;
                    gearShiftBlendTimer = 0.18;
                }
            }
            if (gearShiftBlendTimer > 0) {
                gearShiftBlendTimer = Math.max(0, gearShiftBlendTimer - dt);
            }
            const shiftTorqueScale = gearShiftBlendTimer > 0
                ? 0.38 + 0.62 * (1 - gearShiftBlendTimer / 0.18)
                : 1.0;

            const gearRatio = getActiveGearRatio();
            const drivenTireCount = tireLayout.filter(tire => tire.axle === physics.drivenAxle).length || 1;
            const torqueFactor = getEngineTorqueFactor(engineRpm, physics.idleRpm, physics.maxRpm);
            const fullDriveTorque = physics.maxTorqueNm * accelDamageScale * torqueFactor *
                gearRatio * physics.finalDrive * 0.88 * shiftTorqueScale;
            const coastEngineTorque = Math.abs(carSpeed) > 0.3
                ? -Math.sign(carSpeed) * physics.maxTorqueNm * physics.engineBrakingFactor *
                  gearRatio * physics.finalDrive * 0.88
                : 0;
            let driveTorquePerTire = 0;
            if (reverse > 0.01 && carSpeed <= 0.15) {
                driveTorquePerTire = -physics.maxTorqueNm * accelDamageScale * 0.78 * reverse *
                    gearRatio * physics.finalDrive * 0.88 / drivenTireCount;
            } else if (brake > 0.04) {
                driveTorquePerTire = coastEngineTorque * (1 - brake * 0.45) / drivenTireCount;
            } else {
                driveTorquePerTire = THREE.MathUtils.lerp(coastEngineTorque, fullDriveTorque, throttle) / drivenTireCount;
            }

            const cosRoadPitch = Math.cos(roadPitchAngle);
            const totalNormalLoad = physics.mass * gravity * cosRoadPitch;
            const maxStaticFront = totalNormalLoad * physics.weightDistributionFront;
            const maxStaticRear = totalNormalLoad * (1 - physics.weightDistributionFront);
            const longitudinalLoadTransfer = THREE.MathUtils.clamp(
                physics.mass * longitudinalAcceleration * physics.cgHeight / wheelbase,
                -maxStaticRear,
                maxStaticFront
            );
            const frontAxleLoad = maxStaticFront - longitudinalLoadTransfer;
            const rearAxleLoad = maxStaticRear + longitudinalLoadTransfer;
            motorcycleFrontWheelLifted = isMotorcycle && frontAxleLoad <= 0.5;
            motorcycleRearWheelLifted = isMotorcycle && rearAxleLoad <= 0.5;
            let totalForceX = 0;
            let totalForceZ = 0;
            let totalYawTorque = 0;
            let frameMaxTireSkid = 0;
            const nextWheelAngularSpeeds = [];

            tireLayout.forEach((tire, index) => {
                const cosYaw = Math.cos(playerYaw);
                const sinYaw = Math.sin(playerYaw);
                const offsetX = tire.x * cosYaw + tire.z * sinYaw;
                const offsetZ = -tire.x * sinYaw + tire.z * cosYaw;
                const pointVelocityX = velocityX + yawRate * offsetZ;
                const pointVelocityZ = velocityZ - yawRate * offsetX;
                let tireSteeringAngle = steeringAngle;
                if (!isMotorcycle && tire.axle === 'front' && Math.abs(steeringAngle) > 1e-5) {
                    const isInnerWheel = tire.x * steeringAngle < 0;
                    if (!isInnerWheel) {
                        const cotInner = 1 / Math.tan(Math.abs(steeringAngle));
                        const ackermannDelta = (innovaZenixSpecs.frontTread / wheelbase) *
                            (physics.ackermannFactor || 0.65);
                        tireSteeringAngle = Math.sign(steeringAngle) *
                            Math.atan(1 / (cotInner + ackermannDelta));
                    }
                }
                const frontAxle = tire.axle === 'front';
                tire.steeringAngle = frontAxle ? tireSteeringAngle : 0;
                const groundSteerAngle = isMotorcycle
                    ? tireSteeringAngle * Math.cos(THREE.MathUtils.degToRad(nmaxNeoSpecs.rakeDeg))
                    : tireSteeringAngle;
                const staticToeRad = isMotorcycle
                    ? 0
                    : THREE.MathUtils.degToRad(frontAxle ? physics.frontToeDeg : physics.rearToeDeg);
                const toeOffset = Math.sign(tire.x) * staticToeRad;
                const tireAngle = playerYaw +
                    (frontAxle ? groundSteerAngle : 0) + toeOffset;
                const tireForwardX = -Math.sin(tireAngle);
                const tireForwardZ = -Math.cos(tireAngle);
                const tireRightX = Math.cos(tireAngle);
                const tireRightZ = -Math.sin(tireAngle);
                const longitudinalVelocity = pointVelocityX * tireForwardX +
                    pointVelocityZ * tireForwardZ;
                const lateralVelocity = pointVelocityX * tireRightX +
                    pointVelocityZ * tireRightZ;
                tire.longitudinalVelocity = longitudinalVelocity;
                const axleTireCount = tireLayout.filter(item => item.axle === tire.axle).length;
                const axleWeightShare = frontAxle
                    ? physics.weightDistributionFront
                    : 1 - physics.weightDistributionFront;
                const axleLoad = frontAxle ? frontAxleLoad : rearAxleLoad;
                let lateralLoadTransfer = 0;
                if (axleTireCount > 1) {
                    const trackWidth = frontAxle
                        ? innovaZenixSpecs.frontTread
                        : innovaZenixSpecs.rearTread;
                    const rollCenterHeight = frontAxle
                        ? physics.frontRollCenterHeight
                        : physics.rearRollCenterHeight;
                    const axleRollStiffness = frontAxle
                        ? frontRollStiffness
                        : rearRollStiffness;
                    const rollStiffnessShare = axleRollStiffness / totalRollStiffness;
                    const rawLateralTransfer = physics.mass * lateralAcceleration /
                        trackWidth * (
                            rollCenterHeight * axleWeightShare +
                            (physics.cgHeight - rollCenterHeight) * rollStiffnessShare
                        ) *
                        (tire.x < 0 ? 1 : -1);
                    lateralLoadTransfer = THREE.MathUtils.clamp(
                        rawLateralTransfer,
                        -axleLoad / 2,
                        axleLoad / 2
                    );
                }
                const groundGripScale = isAirborne ? 0 : 1;
                const normalLoad = Math.max(0, (axleLoad / axleTireCount + lateralLoadTransfer) * groundGripScale);
                const maximumTireForce = physics.frictionCoefficient * normalLoad;
                const wheelAngularSpeed = wheelAngularSpeeds[index];
                const tireWheelRadius = tire.wheelRadius || physics.wheelRadius;
                const vDenom = Math.max(Math.abs(longitudinalVelocity), 1.2);
                const slipRatio = (
                    wheelAngularSpeed * tireWheelRadius - longitudinalVelocity
                ) / vDenom;
                const slipAngle = Math.atan2(lateralVelocity, vDenom);
                let longitudinalForce = calculateTireForce(
                    slipRatio,
                    physics.longitudinalStiffness,
                    maximumTireForce,
                    physics.tireShapeFactor
                );
                let lateralForce = -calculateTireForce(
                    slipAngle,
                    physics.lateralStiffness * handlingGripScale,
                    maximumTireForce * handlingGripScale,
                    physics.tireShapeFactor
                );
                if (isMotorcycle) {
                    lateralForce -= physics.camberThrustCoefficient *
                        normalLoad * Math.sin(bodyRoll);
                } else {
                    const staticCamberRad = THREE.MathUtils.degToRad(
                        frontAxle ? physics.frontCamberDeg : physics.rearCamberDeg
                    );
                    const rollCompliance = frontAxle
                        ? physics.frontCamberRollCompliance
                        : physics.rearCamberRollCompliance;
                    const effectiveWheelTilt = bodyRoll * rollCompliance -
                        Math.sign(tire.x) * staticCamberRad;
                    lateralForce -= physics.camberThrustCoefficient *
                        normalLoad * Math.sin(effectiveWheelTilt);
                }
                const combinedForce = Math.hypot(longitudinalForce, lateralForce);
                if (combinedForce > maximumTireForce && combinedForce > 0) {
                    const forceScale = maximumTireForce / combinedForce;
                    longitudinalForce *= forceScale;
                    lateralForce *= forceScale;
                }

                const handbrakeOnTire = handbrake && !frontAxle ? 1 : 0;
                const isLockedByHandbrake = handbrakeOnTire > 0 && Math.abs(longitudinalVelocity) > 0.8;
                if (isLockedByHandbrake) {
                    longitudinalForce *= 0.85;
                    lateralForce *= 0.42;
                } else if (Math.abs(slipRatio) > 0.75 && Math.abs(longitudinalVelocity) > 1.2) {
                    lateralForce *= 0.65;
                }

                const surfaceSpeed = Math.hypot(pointVelocityX, pointVelocityZ);
                const longitudinalSlipSpeed = Math.abs(wheelAngularSpeed * tireWheelRadius - longitudinalVelocity);
                const lateralSlipRatio = Math.max(0, (Math.abs(lateralVelocity) - 2.2) / 5.5);
                const longSlipRatio = Math.max(0, (longitudinalSlipSpeed - 3.2) / 9.0);
                const handbrakeSkid = handbrakeOnTire > 0 && surfaceSpeed > 1.5 ? 0.92 : 0;
                const rawSkid = groundGripScale > 0 && surfaceSpeed > 1.5
                    ? Math.max(handbrakeSkid, lateralSlipRatio, longSlipRatio)
                    : 0;
                tire.skidIntensity = THREE.MathUtils.clamp(rawSkid, 0, 1);
                tire.worldVelX = pointVelocityX;
                tire.worldVelZ = pointVelocityZ;
                if (tire.skidIntensity > frameMaxTireSkid) {
                    frameMaxTireSkid = tire.skidIntensity;
                }

                const tireForceX = longitudinalForce * tireForwardX + lateralForce * tireRightX;
                const tireForceZ = longitudinalForce * tireForwardZ + lateralForce * tireRightZ;
                totalForceX += tireForceX;
                totalForceZ += tireForceZ;
                totalYawTorque += offsetZ * tireForceX - offsetX * tireForceZ;

                const driveTorque = (tire.axle === physics.drivenAxle && !handbrakeOnTire) ? driveTorquePerTire : 0;
                const axleBrakeBias = frontAxle
                    ? physics.brakeBiasFront
                    : 1 - physics.brakeBiasFront;
                const absScale = !handbrakeOnTire && brake > 0.02 && longitudinalVelocity > 1.5 && slipRatio < -physics.absSlipThreshold
                    ? THREE.MathUtils.clamp(
                        1 - (-slipRatio - physics.absSlipThreshold) / 0.12,
                        0.15,
                        1
                    )
                    : 1;
                const lowSpeedBrakeScale = THREE.MathUtils.clamp(Math.abs(longitudinalVelocity) / 0.85, 0.25, 1);
                const brakeTorquePerTire = brake * absScale * lowSpeedBrakeScale * physics.maxBrakingForce *
                    axleBrakeBias * tireWheelRadius / axleTireCount;
                const handbrakeTorquePerTire = handbrakeOnTire *
                    (physics.maxHandbrakeForce || 10000) * tireWheelRadius / axleTireCount;
                const totalBrakeTorquePerTire = brakeTorquePerTire + handbrakeTorquePerTire;

                // Semi-implicit stabilization prevents Euler oscillation of wheel speed at near-zero velocity
                const tireLinearGain = maximumTireForce * physics.tireShapeFactor *
                    physics.longitudinalStiffness / vDenom;
                const effectiveWheelInertia = physics.wheelInertia +
                    dt * tireLinearGain * tireWheelRadius * tireWheelRadius;
                let nextWheelSpeed = wheelAngularSpeed + (
                    driveTorque - longitudinalForce * tireWheelRadius
                ) * dt / effectiveWheelInertia;

                if (totalBrakeTorquePerTire > 0) {
                    if (Math.abs(nextWheelSpeed) > 1e-4) {
                        const brakeDelta = Math.sign(nextWheelSpeed) *
                            totalBrakeTorquePerTire / physics.wheelInertia * dt;
                        if (Math.abs(brakeDelta) >= Math.abs(nextWheelSpeed) || (handbrakeOnTire > 0 && Math.abs(nextWheelSpeed) < 3.5)) {
                            nextWheelSpeed = 0;
                        } else {
                            nextWheelSpeed -= brakeDelta;
                        }
                    } else if (handbrakeOnTire > 0 || Math.abs(longitudinalVelocity) < 0.25) {
                        nextWheelSpeed = 0;
                    }
                }
                nextWheelAngularSpeeds.push(nextWheelSpeed);
            });
            maxTireSkid = frameMaxTireSkid;

            // Gaya gravitasi lereng tanjakan/turunan flyover
            if (roadSlopeSin !== 0) {
                const slopeForce = physics.mass * gravity * roadSlopeSin;
                totalForceX -= slopeForce * forwardX;
                totalForceZ -= slopeForce * forwardZ;
            }

            const speedMagnitude = Math.hypot(velocityX, velocityZ);
            if (speedMagnitude > 0) {
                const dragForce = 0.5 * airDensity * physics.dragCoefficient *
                    physics.frontalArea * speedMagnitude * speedMagnitude;
                const rollingResistance = isAirborne ? 0 : physics.rollingResistanceCoefficient * totalNormalLoad;
                const resistance = Math.min(
                    dragForce + rollingResistance,
                    speedMagnitude * physics.mass / dt
                );
                totalForceX -= velocityX / speedMagnitude * resistance;
                totalForceZ -= velocityZ / speedMagnitude * resistance;
            }

            const accelerationX = totalForceX / physics.mass;
            const accelerationZ = totalForceZ / physics.mass;
            velocityX += accelerationX * dt;
            velocityZ += accelerationZ * dt;
            longitudinalAcceleration = accelerationX * forwardX + accelerationZ * forwardZ;
            lateralAcceleration = accelerationX * rightX + accelerationZ * rightZ;

            const vehicleDimensions = selectedVehicleType === 'motorcycle'
                ? nmaxNeoSpecs
                : innovaZenixSpecs;
            let rollAngularAcceleration;
            if (isMotorcycle) {
                const speedMag = Math.abs(carSpeed);
                const riderLeanBias = steeringInput * physics.maxBodyRoll *
                    THREE.MathUtils.clamp((speedMag - 1.5) / 14, 0, 0.42);
                const idealLeanAngle = Math.atan2(carSpeed * yawRate, gravity);
                const leanTarget = THREE.MathUtils.clamp(
                    idealLeanAngle * 0.85 + riderLeanBias,
                    -physics.maxBodyRoll,
                    physics.maxBodyRoll
                );
                rollAngularAcceleration = physics.leanSpring * (leanTarget - bodyRoll) -
                    physics.leanDamper * bodyRollVelocity;
            } else {
                const rollInertia = physics.mass * (
                    vehicleDimensions.width * vehicleDimensions.width +
                    vehicleDimensions.height * vehicleDimensions.height
                ) / 12;
                const rollCenterHeight = (
                    frontRollStiffness * physics.frontRollCenterHeight +
                    rearRollStiffness * physics.rearRollCenterHeight
                ) / totalRollStiffness;
                const rollMomentArm = physics.cgHeight - rollCenterHeight;
                const effectiveRollStiffness = Math.max(
                    1,
                    totalRollStiffness - physics.mass * gravity * rollMomentArm
                );
                const rollDampingRatio = (
                    frontRollStiffness * physics.frontDampingRatio +
                    rearRollStiffness * physics.rearDampingRatio
                ) / totalRollStiffness;
                const rollDamping = 2 * rollDampingRatio *
                    Math.sqrt(effectiveRollStiffness * rollInertia);
                const rollTorque = physics.mass * lateralAcceleration * rollMomentArm;
                rollAngularAcceleration = (
                    rollTorque - effectiveRollStiffness * bodyRoll -
                    rollDamping * bodyRollVelocity
                ) / rollInertia;
            }
            bodyRollVelocity += rollAngularAcceleration * dt;
            const nextBodyRoll = bodyRoll + bodyRollVelocity * dt;
            const clampedBodyRoll = THREE.MathUtils.clamp(
                nextBodyRoll,
                -physics.maxBodyRoll,
                physics.maxBodyRoll
            );
            if (clampedBodyRoll !== nextBodyRoll) {
                bodyRollVelocity = 0;
            }
            bodyRoll = clampedBodyRoll;

            if (isMotorcycle) {
                const proportionalPitch = THREE.MathUtils.clamp(
                    longitudinalAcceleration / gravity * 0.09,
                    -physics.maxPitch * 0.65,
                    physics.maxPitch * 0.65
                );
                const pitchTarget = motorcycleFrontWheelLifted
                    ? physics.maxPitch
                    : motorcycleRearWheelLifted ? -physics.maxPitch : proportionalPitch;
                const frontPitchLever = (1 - physics.weightDistributionFront) * wheelbase;
                const rearPitchLever = physics.weightDistributionFront * wheelbase;
                const pitchInertia = physics.mass * (
                    vehicleDimensions.length * vehicleDimensions.length +
                    vehicleDimensions.height * vehicleDimensions.height
                ) / 12;
                const pitchStiffness = physics.frontSpringRate *
                    frontPitchLever * frontPitchLever +
                    physics.rearSpringRate * rearPitchLever * rearPitchLever;
                const pitchDampingRatio = physics.weightDistributionFront *
                    physics.frontDampingRatio +
                    (1 - physics.weightDistributionFront) * physics.rearDampingRatio;
                const pitchDamping = 2 * pitchDampingRatio *
                    Math.sqrt(pitchStiffness * pitchInertia);
                const pitchAcceleration = (
                    pitchStiffness * (pitchTarget - motorcyclePitch) -
                    pitchDamping * motorcyclePitchVelocity
                ) / pitchInertia;
                motorcyclePitchVelocity += pitchAcceleration * dt;
                const nextMotorcyclePitch = motorcyclePitch + motorcyclePitchVelocity * dt;
                const clampedMotorcyclePitch = THREE.MathUtils.clamp(
                    nextMotorcyclePitch,
                    -physics.maxPitch,
                    physics.maxPitch
                );
                if (clampedMotorcyclePitch !== nextMotorcyclePitch) {
                    motorcyclePitchVelocity = 0;
                }
                motorcyclePitch = clampedMotorcyclePitch;
            } else {
                motorcyclePitch = 0;
                motorcyclePitchVelocity = 0;
                motorcycleFrontWheelLifted = false;
                motorcycleRearWheelLifted = false;
            }

            const yawInertia = physics.mass * (
                vehicleDimensions.length * vehicleDimensions.length +
                vehicleDimensions.width * vehicleDimensions.width
            ) / 12;
            yawRate += totalYawTorque / yawInertia * dt;
            playerYaw += yawRate * dt;
            playerX += velocityX * dt;
            playerZ += velocityZ * dt;
            wheelAngularSpeeds = nextWheelAngularSpeeds;

            const updatedForwardX = -Math.sin(playerYaw);
            const updatedForwardZ = -Math.cos(playerYaw);
            carSpeed = velocityX * updatedForwardX + velocityZ * updatedForwardZ;
            if (carSpeed > effectiveMaxSpeed) {
                const excessSpeed = carSpeed - effectiveMaxSpeed;
                velocityX -= updatedForwardX * excessSpeed;
                velocityZ -= updatedForwardZ * excessSpeed;
            } else if (carSpeed < -physics.reverseSpeed) {
                const excessSpeed = carSpeed + physics.reverseSpeed;
                velocityX -= updatedForwardX * excessSpeed;
                velocityZ -= updatedForwardZ * excessSpeed;
            }

            carSpeed = velocityX * updatedForwardX + velocityZ * updatedForwardZ;
            engineRpm = THREE.MathUtils.damp(engineRpm, getEngineRpm(wheelAngularSpeeds), 15, dt);
        }

        function syncTransmissionUi() {
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            const gearLabelEl = document.getElementById('gear-label');
            if (gearLabelEl && physics) {
                gearLabelEl.innerText = physics.isCvt
                    ? 'RASIO'
                    : (isManualTransmission ? 'GIGI MT' : 'GIGI AT');
            }
            const touchTransBtn = document.getElementById('touch-transmission');
            const shiftCluster = document.getElementById('touch-shift-controls');
            if (touchTransBtn) {
                const isManualActive = isManualTransmission && (!physics || !physics.isCvt);
                touchTransBtn.innerText = isManualActive ? 'MT' : 'AT';
                touchTransBtn.classList.toggle('is-active', isManualActive);
                touchTransBtn.disabled = Boolean(physics && physics.isCvt);
            }
            if (shiftCluster) {
                const showManualTouch = isManualTransmission && (!physics || !physics.isCvt);
                shiftCluster.classList.toggle('is-manual', showManualTouch);
            }
        }

        function toggleTransmissionMode() {
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            if (!physics || physics.isCvt) return;
            isManualTransmission = !isManualTransmission;
            syncTransmissionUi();
        }

        function shiftGearUp() {
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            if (!physics || physics.isCvt || !isManualTransmission) return;
            if (currentGear < physics.gearRatios.length) {
                currentGear += 1;
                gearShiftBlendTimer = 0.16;
            }
            document.getElementById('gear-value').innerText = currentGear;
        }

        function shiftGearDown() {
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            if (!physics || physics.isCvt || !isManualTransmission) return;
            if (currentGear > 1) {
                currentGear -= 1;
                gearShiftBlendTimer = 0.16;
            }
            document.getElementById('gear-value').innerText = currentGear;
        }

