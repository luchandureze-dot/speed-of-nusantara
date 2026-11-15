        function calculateTireForce(slip, stiffness, peakForce, shapeFactor) {
            return peakForce * Math.sin(shapeFactor * Math.atan(stiffness * slip));
        }

        function updateVehiclePhysics(dt) {
            const physicsSubsteps = 8;
            const substepDt = dt / physicsSubsteps;
            for (let step = 0; step < physicsSubsteps; step++) {
                updateVehiclePhysicsStep(substepDt);
            }
            document.getElementById('rpm-value').innerText = Math.round(engineRpm);
            document.getElementById('gear-value').innerText = currentGear;
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
            const throttle = keys.forward ? 1 : 0;
            const brake = reverseRequested && carSpeed > 0 ? 1 : 0;
            const reverse = reverseRequested && carSpeed <= 0;
            const steeringInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
            const steeringSpeed = Math.abs(carSpeed);
            const steeringSpeedScale =
                1 + steeringSpeed * physics.steeringSpeedFalloff;
            const steeringAngle = steeringInput * (isMotorcycle
                ? physics.maxSteeringAngle
                : physics.maxInnerWheelSteerAngle) /
                steeringSpeedScale;
            const frontRollStiffness = isMotorcycle ? 0 :
                physics.frontSpringRate * innovaZenixSpecs.frontTread *
                innovaZenixSpecs.frontTread / 2;
            const rearRollStiffness = isMotorcycle ? 0 :
                physics.rearSpringRate * innovaZenixSpecs.rearTread *
                innovaZenixSpecs.rearTread / 2;
            const totalRollStiffness = frontRollStiffness + rearRollStiffness;

            const getEngineRpm = () => {
                const gearRatio = physics.gearRatios[currentGear - 1];
                const wheelRpm = Math.abs(carSpeed) * 60 / (2 * Math.PI * physics.wheelRadius);
                return Math.max(
                    physics.idleRpm,
                    Math.min(physics.maxRpm, wheelRpm * gearRatio * physics.finalDrive)
                );
            };

            engineRpm = getEngineRpm();
            if (engineRpm >= physics.maxRpm * 0.92 && currentGear < physics.gearRatios.length) {
                currentGear += 1;
            } else if (engineRpm <= physics.maxRpm * 0.35 && currentGear > 1) {
                currentGear -= 1;
            }

            const gearRatio = physics.gearRatios[currentGear - 1];
            const drivenTireCount = tireLayout.filter(tire => tire.axle === physics.drivenAxle).length;
            const engineTorque = physics.maxTorqueNm * (throttle || reverse ? 1 : 0) *
                gearRatio * physics.finalDrive * 0.88;
            const driveTorquePerTire = engineTorque * (reverse ? -1 : 1) / drivenTireCount;
            const longitudinalLoadTransfer = physics.mass * longitudinalAcceleration *
                physics.cgHeight / wheelbase;
            const frontAxleLoad = physics.mass * gravity *
                physics.weightDistributionFront - longitudinalLoadTransfer;
            const rearAxleLoad = physics.mass * gravity *
                (1 - physics.weightDistributionFront) + longitudinalLoadTransfer;
            motorcycleFrontWheelLifted = isMotorcycle && frontAxleLoad <= 0;
            motorcycleRearWheelLifted = isMotorcycle && rearAxleLoad <= 0;
            let totalForceX = 0;
            let totalForceZ = 0;
            let totalYawTorque = 0;
            const nextWheelAngularSpeeds = [];

            tireLayout.forEach((tire, index) => {
                const cosYaw = Math.cos(playerYaw);
                const sinYaw = Math.sin(playerYaw);
                const offsetX = tire.x * cosYaw + tire.z * sinYaw;
                const offsetZ = -tire.x * sinYaw + tire.z * cosYaw;
                const pointVelocityX = velocityX + yawRate * offsetZ;
                const pointVelocityZ = velocityZ - yawRate * offsetX;
                let tireSteeringAngle = steeringAngle;
                if (!isMotorcycle && tire.axle === 'front' && steeringInput !== 0) {
                    const isInnerWheel = tire.x * steeringInput < 0;
                    if (!isInnerWheel) {
                        tireSteeringAngle = steeringInput *
                            physics.maxOuterWheelSteerAngle /
                            steeringSpeedScale;
                    }
                }
                tire.steeringAngle = tire.axle === 'front'
                    ? tireSteeringAngle
                    : 0;
                const tireAngle = playerYaw +
                    (tire.axle === 'front' ? tireSteeringAngle : 0);
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
                const frontAxle = tire.axle === 'front';
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
                    lateralLoadTransfer = physics.mass * lateralAcceleration /
                        (2 * trackWidth) * (
                            rollCenterHeight * axleWeightShare +
                            (physics.cgHeight - rollCenterHeight) * rollStiffnessShare
                        ) *
                        (tire.x < 0 ? 1 : -1);
                }
                const normalLoad = Math.max(0, axleLoad / axleTireCount + lateralLoadTransfer);
                const leanGrip = isMotorcycle ? Math.cos(bodyRoll) : 1;
                const maximumTireForce = physics.frictionCoefficient * normalLoad * leanGrip;
                const wheelAngularSpeed = wheelAngularSpeeds[index];
                const tireWheelRadius = tire.wheelRadius || physics.wheelRadius;
                const slipRatio = (
                    wheelAngularSpeed * tireWheelRadius - longitudinalVelocity
                ) / Math.max(Math.abs(longitudinalVelocity), 0.5);
                const slipAngle = Math.atan2(
                    lateralVelocity,
                    Math.max(Math.abs(longitudinalVelocity), 0.5)
                );
                let longitudinalForce = calculateTireForce(
                    slipRatio,
                    physics.longitudinalStiffness,
                    maximumTireForce,
                    physics.tireShapeFactor
                );
                let lateralForce = -calculateTireForce(
                    slipAngle,
                    physics.lateralStiffness,
                    maximumTireForce,
                    physics.tireShapeFactor
                );
                if (isMotorcycle) {
                    lateralForce -= physics.camberThrustCoefficient *
                        normalLoad * Math.sin(bodyRoll);
                }
                const combinedForce = Math.hypot(longitudinalForce, lateralForce);
                if (combinedForce > maximumTireForce) {
                    const forceScale = maximumTireForce / combinedForce;
                    longitudinalForce *= forceScale;
                    lateralForce *= forceScale;
                }

                const tireForceX = longitudinalForce * tireForwardX + lateralForce * tireRightX;
                const tireForceZ = longitudinalForce * tireForwardZ + lateralForce * tireRightZ;
                totalForceX += tireForceX;
                totalForceZ += tireForceZ;
                totalYawTorque += offsetZ * tireForceX - offsetX * tireForceZ;

                const driveTorque = tire.axle === physics.drivenAxle ? driveTorquePerTire : 0;
                const axleBrakeBias = frontAxle
                    ? physics.brakeBiasFront
                    : 1 - physics.brakeBiasFront;
                const brakeTorquePerTire = brake * physics.maxBrakingForce *
                    axleBrakeBias * tireWheelRadius / axleTireCount;
                const brakeDirection = Math.sign(
                    wheelAngularSpeed !== 0 ? wheelAngularSpeed : longitudinalVelocity
                );
                let nextWheelSpeed = wheelAngularSpeed + (
                    driveTorque - longitudinalForce * tireWheelRadius -
                    brakeTorquePerTire * brakeDirection
                ) / physics.wheelInertia * dt;
                if (brake && longitudinalVelocity > 0 && nextWheelSpeed < 0) {
                    nextWheelSpeed = 0;
                }
                nextWheelAngularSpeeds.push(nextWheelSpeed);
            });

            const speedMagnitude = Math.hypot(velocityX, velocityZ);
            if (speedMagnitude > 0) {
                const dragForce = 0.5 * airDensity * physics.dragCoefficient *
                    physics.frontalArea * speedMagnitude * speedMagnitude;
                const rollingResistance = physics.rollingResistanceCoefficient *
                    physics.mass * gravity;
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
                const leanSpeedScale = THREE.MathUtils.clamp(
                    (Math.abs(carSpeed) - 3) / 7,
                    0,
                    1
                );
                const inputLeanTarget = steeringInput * physics.maxBodyRoll * leanSpeedScale;
                const idealLeanAngle = Math.atan2(carSpeed * yawRate, gravity);
                const leanTarget = THREE.MathUtils.clamp(
                    inputLeanTarget * 0.65 + idealLeanAngle * 0.35,
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
                const pitchTarget = motorcycleFrontWheelLifted
                    ? physics.maxPitch
                    : motorcycleRearWheelLifted ? -physics.maxPitch : 0;
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
            if (carSpeed > physics.maxSpeed) {
                const excessSpeed = carSpeed - physics.maxSpeed;
                velocityX -= updatedForwardX * excessSpeed;
                velocityZ -= updatedForwardZ * excessSpeed;
            } else if (carSpeed < -physics.reverseSpeed) {
                const excessSpeed = carSpeed + physics.reverseSpeed;
                velocityX -= updatedForwardX * excessSpeed;
                velocityZ -= updatedForwardZ * excessSpeed;
            }

            carSpeed = velocityX * updatedForwardX + velocityZ * updatedForwardZ;
            engineRpm = getEngineRpm();
        }

