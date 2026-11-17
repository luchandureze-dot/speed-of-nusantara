        function resetPlayerPosition() {
            const rollingSpeed = 60 / 3.6;
            const leftLaneLateral = -4.8;
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            playerTrackProgress = 0.08;
            const point = trackCurve.getPointAt(playerTrackProgress);
            const tangent = trackCurve.getTangentAt(playerTrackProgress).normalize();
            playerX = point.x - tangent.z * leftLaneLateral;
            playerY = point.y;
            playerZ = point.z + tangent.x * leftLaneLateral;
            playerYaw = Math.atan2(-tangent.x, -tangent.z);
            yawRate = 0;
            bodyRoll = 0;
            bodyRollVelocity = 0;
            bodyPitch = 0;
            bodyPitchVelocity = 0;
            motorcyclePitch = 0;
            motorcyclePitchVelocity = 0;
            motorcycleFrontWheelLifted = false;
            motorcycleRearWheelLifted = false;
            roadPitchAngle = Math.asin(THREE.MathUtils.clamp(tangent.y, -0.45, 0.45));
            roadSlopeSin = Math.sin(roadPitchAngle);
            steeringInputSmoothed = 0;
            throttleSmoothed = 0.28;
            brakeSmoothed = 0;
            reverseSmoothed = 0;
            gearShiftBlendTimer = 0;
            velocityX = tangent.x * rollingSpeed;
            velocityZ = tangent.z * rollingSpeed;
            playerRoadLateral = leftLaneLateral;
            longitudinalAcceleration = 0;
            lateralAcceleration = 0;
            wheelAngularSpeeds = tireLayout.length
                ? tireLayout.map(tire => rollingSpeed / (tire.wheelRadius || physics.wheelRadius))
                : wheelAngularSpeeds.map(() => rollingSpeed / physics.wheelRadius);
            carSpeed = rollingSpeed;
            currentGear = physics.isCvt ? 2 : 3;
            verticalVelocity = 0;
            isAirborne = false;
            chassisSuspensionOffset = 0;
            maxTireSkid = 0;
            if (typeof resetSkidTrails === 'function') resetSkidTrails();
            playerCar.position.set(
                playerX,
                playerY + vehiclePhysicsConfigs[selectedVehicleType].cgHeight,
                playerZ
            );
            playerCar.rotation.set(0, playerYaw, 0);
            if (playerCar.userData.leanPivot) {
                playerCar.userData.leanPivot.rotation.z = 0;
            }
            playerCar.userData.bodyVisual.rotation.set(0, 0, 0);
            playerWheelPivots.forEach(wheelPivot => {
                wheelPivot.position.y = wheelPivot.userData.basePositionY;
                wheelPivot.userData.spinAngle = 0;
                wheelPivot.userData.spinPivot.rotation.x = 0;
                wheelPivot.userData.steeringPivot.rotation.y = 0;
                wheelPivot.userData.suspensionTravel = 0;
                wheelPivot.userData.suspensionVelocity = 0;
            });
            playerCar.userData.bodyVisual.position.y = playerCar.userData.bodyVisualBaseY || 0;
        }

        function configureTireLayout() {
            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            if (selectedVehicleType === 'motorcycle') {
                const frontAxleZ = -nmaxNeoSpecs.wheelbase *
                    (1 - physics.weightDistributionFront);
                const rearAxleZ = nmaxNeoSpecs.wheelbase *
                    physics.weightDistributionFront;
                tireLayout = [
                    {
                        x: 0,
                        z: frontAxleZ,
                        axle: 'front',
                        wheelRadius: nmaxNeoSpecs.frontTireRadius,
                        width: nmaxNeoSpecs.frontTireWidth
                    },
                    {
                        x: 0,
                        z: rearAxleZ,
                        axle: 'rear',
                        wheelRadius: nmaxNeoSpecs.rearTireRadius,
                        width: nmaxNeoSpecs.rearTireWidth
                    }
                ];
            } else {
                const frontAxleZ = -innovaZenixSpecs.wheelbase *
                    (1 - physics.weightDistributionFront);
                const rearAxleZ = innovaZenixSpecs.wheelbase *
                    physics.weightDistributionFront;
                tireLayout = [
                    {
                        x: -innovaZenixSpecs.frontTread / 2,
                        z: frontAxleZ,
                        axle: 'front',
                        wheelRadius: innovaZenixSpecs.dynamicTireRadius,
                        width: innovaZenixSpecs.tireWidth
                    },
                    {
                        x: innovaZenixSpecs.frontTread / 2,
                        z: frontAxleZ,
                        axle: 'front',
                        wheelRadius: innovaZenixSpecs.dynamicTireRadius,
                        width: innovaZenixSpecs.tireWidth
                    },
                    {
                        x: -innovaZenixSpecs.rearTread / 2,
                        z: rearAxleZ,
                        axle: 'rear',
                        wheelRadius: innovaZenixSpecs.dynamicTireRadius,
                        width: innovaZenixSpecs.tireWidth
                    },
                    {
                        x: innovaZenixSpecs.rearTread / 2,
                        z: rearAxleZ,
                        axle: 'rear',
                        wheelRadius: innovaZenixSpecs.dynamicTireRadius,
                        width: innovaZenixSpecs.tireWidth
                    }
                ];
            }
            const rollingSpeed = 60 / 3.6;
            tireLayout.forEach(tire => {
                tire.steeringAngle = 0;
                tire.skidIntensity = 0;
                tire.worldVelX = 0;
                tire.worldVelZ = 0;
                tire.longitudinalVelocity = rollingSpeed;
            });
            wheelAngularSpeeds = tireLayout.map(
                tire => rollingSpeed / (tire.wheelRadius || physics.wheelRadius)
            );
        }

        function addLicensePlate(parent, text, width, height, z, y, front) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 160;
            const context = canvas.getContext('2d');
            context.fillStyle = '#f2f0e5';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.strokeStyle = '#171717';
            context.lineWidth = 12;
            context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
            let fontSize = 84;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            do {
                context.font = `bold ${fontSize}px monospace`;
                fontSize -= 2;
            } while (context.measureText(text).width > 450 && fontSize > 24);
            context.fillStyle = '#111111';
            context.fillText(text, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            const backing = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, 0.06),
                new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
            );
            backing.position.set(0, y, z);
            parent.add(backing);

            const plate = new THREE.Mesh(
                new THREE.PlaneGeometry(width - 0.08, height - 0.06),
                new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
            );
            plate.position.set(0, y, z + (front ? -0.036 : 0.036));
            if (front) plate.rotation.y = Math.PI;
            parent.add(plate);
        }

        function getVisualWheelMounts(vehicleType, model) {
            const mounts = vehicleType === 'motorcycle'
                ? [
                    { x: 0, y: 0.2379, z: -0.73, radius: nmaxNeoSpecs.frontTireRadius, width: nmaxNeoSpecs.frontTireWidth, axle: 'front' },
                    { x: 0, y: 0.2379, z: 0.6234, radius: nmaxNeoSpecs.rearTireRadius, width: nmaxNeoSpecs.rearTireWidth, axle: 'rear' }
                ]
                : [
                    { x: -0.7757, y: 0.3402, z: -1.4477, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'front' },
                    { x: 0.7757, y: 0.3402, z: -1.4477, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'front' },
                    { x: -0.7757, y: 0.3402, z: 1.4041, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'rear' },
                    { x: 0.7757, y: 0.3402, z: 1.4041, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'rear' }
                ];

            mounts.forEach(mount => {
                mount.worldCenter = new THREE.Vector3(mount.x, mount.y, mount.z);
                mount.center = model.worldToLocal(mount.worldCenter.clone());
            });
            return mounts;
        }

        function createGeometryFromVertices(attributes, vertices) {
            const geometry = new THREE.BufferGeometry();
            Object.keys(attributes).forEach(name => {
                const attribute = attributes[name];
                const values = vertices[name];
                geometry.setAttribute(
                    name,
                    new THREE.BufferAttribute(
                        new attribute.array.constructor(values),
                        attribute.itemSize,
                        attribute.normalized
                    )
                );
            });
            return geometry;
        }

        function splitWheelGeometry(geometry, vehicleToModel, vehicleToWorld, wheelMounts) {
            const source = geometry.index ? geometry.toNonIndexed() : geometry;
            const attributes = source.attributes;
            const attributeNames = Object.keys(attributes);
            const buckets = Array.from({ length: wheelMounts.length + 1 }, () => {
                const vertices = {};
                attributeNames.forEach(name => {
                    vertices[name] = [];
                });
                return vertices;
            });
            const positions = attributes.position;
            const modelVertex = new THREE.Vector3();
            let wheelTriangleCount = 0;

            for (let first = 0; first + 2 < positions.count; first += 3) {
                let wheelIndex = -1;
                for (let index = 0; index < wheelMounts.length; index++) {
                    const mount = wheelMounts[index];
                    let insideWheel = true;
                    for (let corner = 0; corner < 3; corner++) {
                        modelVertex.fromBufferAttribute(positions, first + corner)
                            .applyMatrix4(vehicleToWorld);
                        const radialDistance = Math.hypot(
                            modelVertex.y - mount.worldCenter.y,
                            modelVertex.z - mount.worldCenter.z
                        );
                        if (
                            Math.abs(modelVertex.x - mount.worldCenter.x) > mount.width / 2 + 0.025 ||
                            radialDistance < mount.radius * 0.12 ||
                            radialDistance > mount.radius * 1.16
                        ) {
                            insideWheel = false;
                            break;
                        }
                    }
                    if (insideWheel) {
                        wheelIndex = index;
                        break;
                    }
                }

                const bucket = buckets[wheelIndex + 1];
                for (let corner = 0; corner < 3; corner++) {
                    const vertexIndex = first + corner;
                    attributeNames.forEach(name => {
                        const attribute = attributes[name];
                        const vertexOffset = vertexIndex * attribute.itemSize;
                        for (let component = 0; component < attribute.itemSize; component++) {
                            bucket[name].push(attribute.array[vertexOffset + component]);
                        }
                    });
                }
                if (wheelIndex >= 0) wheelTriangleCount += 1;
            }

            if (source !== geometry) source.dispose();
            if (!wheelTriangleCount) {
                return { bodyGeometry: geometry, wheelGeometries: [] };
            }

            const bodyGeometry = buckets[0].position.length
                ? createGeometryFromVertices(attributes, buckets[0])
                : null;
            const wheelGeometries = wheelMounts.map((mount, index) => {
                const vertices = buckets[index + 1];
                if (!vertices.position.length) return null;
                const wheelGeometry = createGeometryFromVertices(attributes, vertices);
                wheelGeometry.applyMatrix4(vehicleToModel);
                wheelGeometry.translate(-mount.center.x, -mount.center.y, -mount.center.z);
                return wheelGeometry;
            });

            return { bodyGeometry, wheelGeometries };
        }

        function finalizePlayerCar(carGroup, vehicleType) {
            const isMotorcycle = vehicleType === 'motorcycle';
            const bodyVisual = new THREE.Group();
            const bodyContent = new THREE.Group();
            const physics = vehiclePhysicsConfigs[vehicleType];
            const dimensions = isMotorcycle
                ? nmaxNeoSpecs
                : innovaZenixSpecs;
            const cgOffsetZ = (physics.weightDistributionFront - 0.5) *
                dimensions.wheelbase;
            bodyContent.position.set(0, -physics.cgHeight, cgOffsetZ);

            let leanPivot = null;
            if (isMotorcycle) {
                leanPivot = new THREE.Group();
                leanPivot.position.set(0, -physics.cgHeight, 0);
            }

            playerWheelPivots = [];
            carGroup.updateMatrixWorld(true);
            carGroup.children.forEach(model => {
                (model.userData.wheelPivots || []).forEach(wheelPivot => {
                    const modelPosition = model.localToWorld(wheelPivot.position.clone());
                    wheelPivot.position.copy(carGroup.worldToLocal(modelPosition));
                    model.remove(wheelPivot);
                    (leanPivot || carGroup).add(wheelPivot);
                    wheelPivot.rotation.set(0, 0, 0);
                    wheelPivot.scale.set(1, 1, 1);
                    const geometryTransform = new THREE.Group();
                    geometryTransform.rotation.copy(model.rotation);
                    geometryTransform.scale.copy(model.scale);
                    [...wheelPivot.userData.spinPivot.children].forEach(mesh => {
                        geometryTransform.add(mesh);
                    });
                    wheelPivot.userData.spinPivot.add(geometryTransform);
                    if (!isMotorcycle) {
                        wheelPivot.position.y -= physics.cgHeight;
                    }
                    wheelPivot.position.z += cgOffsetZ;
                    wheelPivot.userData.basePositionY = wheelPivot.position.y;
                    playerWheelPivots.push(wheelPivot);
                });
            });
            [...carGroup.children].forEach(child => {
                if (!child.userData.isWheelPivot) bodyContent.add(child);
            });
            bodyVisual.add(bodyContent);
            if (leanPivot) {
                bodyVisual.position.y = physics.cgHeight;
                carGroup.userData.bodyVisualBaseY = physics.cgHeight;
                leanPivot.add(bodyVisual);
                carGroup.add(leanPivot);
            } else {
                carGroup.userData.bodyVisualBaseY = 0;
                carGroup.add(bodyVisual);
            }
            carGroup.userData.leanPivot = leanPivot;
            carGroup.userData.bodyVisual = bodyVisual;
            carGroup.userData.wheelPivots = playerWheelPivots;
            carGroup.rotation.order = 'YXZ';
            playerCar = carGroup;
            scene.add(playerCar);
            resetPlayerPosition();
        }

        function updatePlayerWheelVisuals(dt, onRoad) {
            if (!playerCar || !playerWheelPivots.length) return;

            const physics = vehiclePhysicsConfigs[selectedVehicleType];
            const isMotorcycle = selectedVehicleType === 'motorcycle';
            const transfer = physics.mass * longitudinalAcceleration *
                physics.cgHeight / wheelbase;
            let frontTravel = 0;
            let frontWheelCount = 0;
            let rearTravel = 0;
            let rearWheelCount = 0;
            const averageTravel = playerWheelPivots.reduce((total, wheelPivot, index) => {
                const tire = tireLayout[index];
                if (!tire) return total;

                const frontAxle = tire.axle === 'front';
                const axleSpringRate = frontAxle
                    ? physics.frontSpringRate
                    : physics.rearSpringRate;
                const axleTireCount = tireLayout.filter(item => item.axle === tire.axle).length;
                const springRatePerTire = axleSpringRate / axleTireCount;
                const longitudinalTravel = (frontAxle ? -transfer : transfer) /
                    springRatePerTire;
                let lateralTravel = 0;
                if (!isMotorcycle) {
                    const trackWidth = frontAxle
                        ? innovaZenixSpecs.frontTread
                        : innovaZenixSpecs.rearTread;
                    const lateralTransfer = physics.mass * lateralAcceleration *
                        physics.cgHeight / trackWidth;
                    lateralTravel = -Math.sign(tire.x) * lateralTransfer /
                        springRatePerTire;
                }

                const maximumTravel = isMotorcycle ? 0.16 : 0.12;
                const targetTravel = THREE.MathUtils.clamp(
                    longitudinalTravel + lateralTravel,
                    -maximumTravel,
                    maximumTravel
                );
                const springFrequency = isMotorcycle ? 16 : 12;
                const damping = 2 * 0.85 * springFrequency;
                const travelAcceleration = springFrequency * springFrequency *
                    (targetTravel - wheelPivot.userData.suspensionTravel) -
                    damping * wheelPivot.userData.suspensionVelocity;
                wheelPivot.userData.suspensionVelocity += travelAcceleration * dt;
                wheelPivot.userData.suspensionTravel = THREE.MathUtils.clamp(
                    wheelPivot.userData.suspensionTravel +
                        wheelPivot.userData.suspensionVelocity * dt,
                    -maximumTravel,
                    maximumTravel
                );

                const roadProgress = (playerTrackProgress - tire.z / trackLength + 1) % 1;
                const roadHeight = onRoad
                    ? trackCurve.getPointAt(roadProgress).y
                    : playerY;
                const pitchedHeightAtWheel = playerY - tire.z * Math.sin(roadPitchAngle);
                const maxDroop = physics.suspensionMaxDroop || 0.16;
                const maxCompression = physics.suspensionMaxCompression || 0.14;
                const roadTravel = onRoad
                    ? THREE.MathUtils.clamp(roadHeight - pitchedHeightAtWheel, -maxDroop, maxCompression)
                    : -maxDroop;
                wheelPivot.position.y = wheelPivot.userData.basePositionY +
                    roadTravel + wheelPivot.userData.suspensionTravel * 0.25;
                const maxVisualSteer = isMotorcycle ? physics.maxSteeringAngle : physics.maxInnerWheelSteerAngle;
                const rawVisualSteer = frontAxle ? (tire.steeringAngle || 0) * 1.25 : 0;
                const clampedVisualSteer = THREE.MathUtils.clamp(rawVisualSteer, -maxVisualSteer, maxVisualSteer);
                if (!isMotorcycle) {
                    const staticCamberRad = THREE.MathUtils.degToRad(
                        frontAxle ? physics.frontCamberDeg : physics.rearCamberDeg
                    );
                    const staticToeRad = THREE.MathUtils.degToRad(
                        frontAxle ? physics.frontToeDeg : physics.rearToeDeg
                    );
                    wheelPivot.rotation.z = -Math.sign(tire.x) * staticCamberRad;
                    wheelPivot.userData.steeringPivot.rotation.y =
                        clampedVisualSteer + Math.sign(tire.x) * staticToeRad;
                } else {
                    wheelPivot.rotation.z = 0;
                    wheelPivot.userData.steeringPivot.rotation.y = clampedVisualSteer;
                }
                const wheelSpinRate = wheelAngularSpeeds[index] !== undefined
                    ? wheelAngularSpeeds[index]
                    : (tire.longitudinalVelocity || 0) / tire.wheelRadius;
                wheelPivot.userData.spinAngle -= wheelSpinRate * dt;
                wheelPivot.userData.spinPivot.rotation.x = wheelPivot.userData.spinAngle;
                if (frontAxle) {
                    frontTravel += wheelPivot.userData.suspensionTravel;
                    frontWheelCount += 1;
                } else {
                    rearTravel += wheelPivot.userData.suspensionTravel;
                    rearWheelCount += 1;
                }
                return total + wheelPivot.userData.suspensionTravel;
            }, 0) / playerWheelPivots.length;

            if (!isMotorcycle) {
                const pitchTarget = THREE.MathUtils.clamp(
                    (
                        rearTravel / rearWheelCount -
                        frontTravel / frontWheelCount
                    ) / wheelbase * 0.65,
                    -0.09,
                    0.09
                );
                const pitchFrequency = 6;
                const pitchAcceleration = pitchFrequency * pitchFrequency *
                    (pitchTarget - bodyPitch) - 2 * pitchFrequency * bodyPitchVelocity;
                bodyPitchVelocity += pitchAcceleration * dt;
                bodyPitch += bodyPitchVelocity * dt;
            }

            const bodyVisual = playerCar.userData.bodyVisual;
            const bodyBaseY = playerCar.userData.bodyVisualBaseY || 0;
            bodyVisual.position.y = bodyBaseY - averageTravel * 0.35;
            bodyVisual.rotation.x = isMotorcycle ? motorcyclePitch : bodyPitch;
            if (playerCar.userData.leanPivot) {
                playerCar.userData.leanPivot.rotation.z = bodyRoll;
                bodyVisual.rotation.z = 0;
            } else {
                bodyVisual.rotation.z = bodyRoll;
            }
        }

        function getVehicleObjectPath(object, root) {
            const parts = [];
            let current = object;
            while (current && current !== root) {
                const parent = current.parent;
                if (!parent) return null;
                parts.push(parent.children.indexOf(current));
                current = parent;
            }
            return current === root ? parts.reverse().join('/') : null;
        }

        function loadWheelAnnotationAssignments(modelPath, modelName, vehicleType) {
            const annotationsPath = modelPath.replace(/model\.dae$/i, 'wheel-annotations.json');
            return new Promise((resolve, reject) => {
                const request = new XMLHttpRequest();
                const resolveWithoutAnnotations = () => {
                    if (vehicleType === 'car') {
                        reject(new Error(
                            `Konfigurasi roda ${modelName} wajib tersedia di ${annotationsPath}.`
                        ));
                        return;
                    }
                    console.warn(`Konfigurasi roda ${modelName} belum ada; memakai deteksi roda lama.`);
                    resolve(null);
                };
                request.open('GET', annotationsPath, true);
                request.onload = () => {
                    const isLocalFile = window.location.protocol === 'file:';
                    const hasLocalResponse = isLocalFile && request.status === 0 &&
                        request.responseText.length > 0;
                    const contentType = request.getResponseHeader('content-type') || '';
                    const trimmedResponse = (request.responseText || '').trimStart();
                    if (
                        request.status === 404 ||
                        contentType.includes('text/html') ||
                        trimmedResponse.startsWith('<') ||
                        (isLocalFile && request.status === 0 && !request.responseText)
                    ) {
                        resolveWithoutAnnotations();
                        return;
                    }
                    if (!hasLocalResponse && (request.status < 200 || request.status >= 300)) {
                        reject(new Error(
                            `Gagal memuat konfigurasi roda ${modelName} (HTTP ${request.status}).`
                        ));
                        return;
                    }

                    try {
                        const annotations = JSON.parse(request.responseText);
                        const expectedWheelIds = vehicleType === 'motorcycle'
                            ? ['front', 'rear']
                            : ['front-left', 'front-right', 'rear-left', 'rear-right'];
                        if (
                            !annotations ||
                            annotations.version !== 1 ||
                            annotations.vehicleType !== vehicleType ||
                            !Array.isArray(annotations.wheels)
                        ) {
                            throw new Error(`Format konfigurasi roda ${modelName} tidak valid.`);
                        }

                        const assignments = new Map();
                        const configuredWheelIds = new Set();
                        annotations.wheels.forEach(wheel => {
                            if (
                                !wheel ||
                                !expectedWheelIds.includes(wheel.id) ||
                                !Array.isArray(wheel.objects) ||
                                configuredWheelIds.has(wheel.id)
                            ) {
                                throw new Error(`Daftar roda konfigurasi ${modelName} tidak valid.`);
                            }
                            configuredWheelIds.add(wheel.id);
                            wheel.objects.forEach(path => {
                                if (typeof path !== 'string' || assignments.has(path)) {
                                    throw new Error(
                                        `Penetapan mesh roda ${modelName} tidak valid atau duplikat.`
                                    );
                                }
                                assignments.set(path, expectedWheelIds.indexOf(wheel.id));
                            });
                        });
                        if (
                            expectedWheelIds.some(id => !configuredWheelIds.has(id)) ||
                            annotations.wheels.some(wheel => !wheel.objects.length)
                        ) {
                            throw new Error(
                                `Setiap roda ${modelName} harus memiliki setidaknya satu mesh.`
                            );
                        }
                        resolve(assignments);
                    } catch (error) {
                        reject(error);
                    }
                };
                request.onerror = () => {
                    if (window.location.protocol === 'file:' && vehicleType === 'motorcycle') {
                        resolveWithoutAnnotations();
                    } else {
                        reject(new Error(`Gagal membaca konfigurasi roda ${modelName}.`));
                    }
                };
                request.send();
            });
        }

        function createProceduralWheel(radius, width, rimRadius, spokeCount) {
            const wheelGroup = new THREE.Group();
            const tireMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a1c20,
                roughness: 0.85,
                metalness: 0.08
            });
            const sidewallGeo = new THREE.CylinderGeometry(radius, radius, width, 28);
            sidewallGeo.rotateZ(Math.PI / 2);
            const tireMesh = new THREE.Mesh(sidewallGeo, tireMaterial);
            tireMesh.castShadow = true;
            tireMesh.receiveShadow = true;
            wheelGroup.add(tireMesh);

            const rimMaterial = new THREE.MeshStandardMaterial({
                color: 0xc8cdd4,
                roughness: 0.3,
                metalness: 0.82
            });
            const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width + 0.012, 20);
            rimGeo.rotateZ(Math.PI / 2);
            const rimMesh = new THREE.Mesh(rimGeo, rimMaterial);
            wheelGroup.add(rimMesh);

            const hubMaterial = new THREE.MeshStandardMaterial({
                color: 0x262930,
                roughness: 0.45,
                metalness: 0.65
            });
            for (let i = 0; i < spokeCount; i++) {
                const angle = (i / spokeCount) * Math.PI * 2;
                const spokeGeo = new THREE.BoxGeometry(width + 0.022, rimRadius * 1.75, 0.032);
                const spoke = new THREE.Mesh(spokeGeo, hubMaterial);
                spoke.rotation.x = angle;
                wheelGroup.add(spoke);
            }
            return wheelGroup;
        }

        function createProceduralVehicleModel(vehicleType, color) {
            const model = new THREE.Group();
            model.userData.isProceduralModel = true;

            const paintMaterial = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.28,
                metalness: 0.55
            });
            paintMaterial.userData.isVehiclePaint = true;

            const darkTrimMaterial = new THREE.MeshStandardMaterial({
                color: 0x1b1e24,
                roughness: 0.72,
                metalness: 0.15
            });
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xd4d9e0,
                roughness: 0.22,
                metalness: 0.88
            });
            const glassMaterial = new THREE.MeshStandardMaterial({
                color: 0x162230,
                roughness: 0.12,
                metalness: 0.75
            });
            const headlightMaterial = new THREE.MeshStandardMaterial({
                color: 0xfff6dc,
                emissive: 0xfff1bf,
                emissiveIntensity: 0.85,
                roughness: 0.2
            });
            const taillightMaterial = new THREE.MeshStandardMaterial({
                color: 0xd91c1c,
                emissive: 0xaa0000,
                emissiveIntensity: 0.75,
                roughness: 0.25
            });

            if (vehicleType === 'motorcycle') {
                const specs = nmaxNeoSpecs;
                const wheelMounts = [
                    { x: 0, y: specs.frontTireRadius, z: -0.67, radius: specs.frontTireRadius, width: specs.frontTireWidth, axle: 'front' },
                    { x: 0, y: specs.rearTireRadius, z: 0.67, radius: specs.rearTireRadius, width: specs.rearTireWidth, axle: 'rear' }
                ];

                const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 1.15), darkTrimMaterial);
                lowerFrame.position.set(0, 0.34, 0.05);
                lowerFrame.castShadow = true;
                model.add(lowerFrame);

                const frontFairing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.56), paintMaterial);
                frontFairing.position.set(0, 0.68, -0.52);
                frontFairing.rotation.x = 0.22;
                frontFairing.castShadow = true;
                model.add(frontFairing);

                const frontFender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.36), paintMaterial);
                frontFender.position.set(0, 0.44, -0.68);
                frontFender.castShadow = true;
                model.add(frontFender);

                const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.04), glassMaterial);
                windscreen.position.set(0, 0.98, -0.56);
                windscreen.rotation.x = 0.46;
                model.add(windscreen);

                const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.68, 12), chromeMaterial);
                handlebar.rotation.z = Math.PI / 2;
                handlebar.position.set(0, 0.96, -0.36);
                model.add(handlebar);

                const rearBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.84), paintMaterial);
                rearBody.position.set(0, 0.58, 0.38);
                rearBody.castShadow = true;
                model.add(rearBody);

                const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.72), darkTrimMaterial);
                seat.position.set(0, 0.74, 0.24);
                seat.castShadow = true;
                model.add(seat);

                const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.62, 14), darkTrimMaterial);
                exhaust.rotation.x = Math.PI / 2;
                exhaust.position.set(0.22, 0.28, 0.48);
                model.add(exhaust);

                const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.06), headlightMaterial);
                headlight.position.set(0, 0.68, -0.8);
                model.add(headlight);

                const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.06), taillightMaterial);
                taillight.position.set(0, 0.64, 0.8);
                model.add(taillight);

                const wheelPivots = wheelMounts.map(mount => {
                    const wheelPivot = new THREE.Group();
                    wheelPivot.position.set(mount.x, mount.y, mount.z);
                    wheelPivot.userData.isWheelPivot = true;
                    wheelPivot.userData.axle = mount.axle;
                    wheelPivot.userData.spinAngle = 0;
                    wheelPivot.userData.suspensionTravel = 0;
                    wheelPivot.userData.suspensionVelocity = 0;
                    wheelPivot.userData.steeringPivot = new THREE.Group();
                    wheelPivot.userData.spinPivot = new THREE.Group();
                    wheelPivot.add(wheelPivot.userData.steeringPivot);
                    wheelPivot.userData.steeringPivot.add(wheelPivot.userData.spinPivot);
                    wheelPivot.userData.spinPivot.add(
                        createProceduralWheel(mount.radius, mount.width, mount.radius * 0.62, 5)
                    );
                    model.add(wheelPivot);
                    return wheelPivot;
                });

                model.userData.wheelPivots = wheelPivots;
                return model;
            }

            const wheelMounts = [
                { x: -0.82, y: innovaZenixSpecs.dynamicTireRadius, z: -1.25, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'front' },
                { x: 0.82, y: innovaZenixSpecs.dynamicTireRadius, z: -1.25, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'front' },
                { x: -0.82, y: innovaZenixSpecs.dynamicTireRadius, z: 1.59, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'rear' },
                { x: 0.82, y: innovaZenixSpecs.dynamicTireRadius, z: 1.59, radius: innovaZenixSpecs.dynamicTireRadius, width: innovaZenixSpecs.tireWidth, axle: 'rear' }
            ];

            const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.68, 4.62), paintMaterial);
            lowerBody.position.set(0, 0.64, 0.04);
            lowerBody.castShadow = true;
            lowerBody.receiveShadow = true;
            model.add(lowerBody);

            const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.24, 1.3), paintMaterial);
            hood.position.set(0, 0.98, -1.58);
            hood.rotation.x = 0.08;
            hood.castShadow = true;
            model.add(hood);

            const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.64, 2.95), paintMaterial);
            cabin.position.set(0, 1.3, 0.56);
            cabin.castShadow = true;
            cabin.receiveShadow = true;
            model.add(cabin);

            const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.58, 0.06), glassMaterial);
            windshield.position.set(0, 1.24, -0.92);
            windshield.rotation.x = 0.52;
            model.add(windshield);

            const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.48, 0.06), glassMaterial);
            rearWindow.position.set(0, 1.3, 2.04);
            rearWindow.rotation.x = -0.22;
            model.add(rearWindow);

            const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.44, 2.48), glassMaterial);
            sideWindows.position.set(0, 1.32, 0.58);
            model.add(sideWindows);

            const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.34, 0.08), darkTrimMaterial);
            frontGrille.position.set(0, 0.68, -2.28);
            model.add(frontGrille);

            const grilleTrim = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.05, 0.09), chromeMaterial);
            grilleTrim.position.set(0, 0.84, -2.28);
            model.add(grilleTrim);

            [-0.64, 0.64].forEach(sideX => {
                const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), headlightMaterial);
                headlight.position.set(sideX, 0.84, -2.27);
                model.add(headlight);

                const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.08), taillightMaterial);
                taillight.position.set(sideX, 0.92, 2.35);
                model.add(taillight);

                const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.14), paintMaterial);
                mirror.position.set(sideX > 0 ? 0.94 : -0.94, 1.08, -0.78);
                model.add(mirror);
            });

            const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.2, 0.22), darkTrimMaterial);
            frontBumper.position.set(0, 0.34, -2.24);
            model.add(frontBumper);

            const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.2, 0.22), darkTrimMaterial);
            rearBumper.position.set(0, 0.34, 2.28);
            model.add(rearBumper);

            const wheelPivots = wheelMounts.map(mount => {
                const wheelPivot = new THREE.Group();
                wheelPivot.position.set(mount.x, mount.y, mount.z);
                wheelPivot.userData.isWheelPivot = true;
                wheelPivot.userData.axle = mount.axle;
                wheelPivot.userData.spinAngle = 0;
                wheelPivot.userData.suspensionTravel = 0;
                wheelPivot.userData.suspensionVelocity = 0;
                wheelPivot.userData.steeringPivot = new THREE.Group();
                wheelPivot.userData.spinPivot = new THREE.Group();
                wheelPivot.add(wheelPivot.userData.steeringPivot);
                wheelPivot.userData.steeringPivot.add(wheelPivot.userData.spinPivot);
                wheelPivot.userData.spinPivot.add(
                    createProceduralWheel(mount.radius, mount.width, mount.radius * 0.65, 5)
                );
                model.add(wheelPivot);
                return wheelPivot;
            });

            model.userData.wheelPivots = wheelPivots;
            return model;
        }

        async function isGitLfsPointer(modelPath) {
            try {
                const response = await fetch(modelPath, {
                    headers: { Range: 'bytes=0-127' }
                });
                if (!response.ok) return false;
                const contentLength = Number(response.headers.get('content-length') || 0);
                if (contentLength > 1024) {
                    if (response.body) await response.body.cancel();
                    return false;
                }
                const snippet = await response.text();
                return snippet.startsWith('version https://git-lfs.github.com/spec/v1');
            } catch {
                return false;
            }
        }

        async function loadChunkedColladaText(modelPath) {
            try {
                const manifestRes = await fetch(`${modelPath}.chunks.json`);
                if (!manifestRes.ok) return null;
                const contentType = manifestRes.headers.get('content-type') || '';
                if (contentType.includes('text/html')) return null;
                const manifest = await manifestRes.json();
                if (!manifest || !Array.isArray(manifest.chunks) || !manifest.chunks.length) {
                    return null;
                }
                const baseUrl = THREE.LoaderUtils.extractUrlBase(modelPath);
                const buffers = await Promise.all(
                    manifest.chunks.map(async chunkName => {
                        const chunkRes = await fetch(`${baseUrl}${chunkName}`);
                        if (!chunkRes.ok) {
                            throw new Error(`Gagal mengunduh bagian model (${chunkName}: HTTP ${chunkRes.status}).`);
                        }
                        return chunkRes.arrayBuffer();
                    })
                );
                const compressedBlob = new Blob(buffers);
                if (manifest.encoding === 'gzip') {
                    if (typeof DecompressionStream === 'undefined') {
                        throw new Error('Browser tidak mendukung DecompressionStream untuk model terkompresi.');
                    }
                    const decompressedStream = compressedBlob.stream()
                        .pipeThrough(new DecompressionStream('gzip'));
                    return await new Response(decompressedStream).text();
                }
                return await compressedBlob.text();
            } catch (error) {
                console.warn(`Gagal memuat model terpecah untuk ${modelPath}:`, error);
                return null;
            }
        }

        async function loadDetailedVehicleModel(modelPath, modelName, vehicleType, color, onProgress) {
            if (!THREE.ColladaLoader || !THREE.BufferGeometryUtils) {
                throw new Error('Loader model 3D tidak tersedia.');
            }
            const annotatedWheelAssignments = await loadWheelAnnotationAssignments(
                modelPath,
                modelName,
                vehicleType
            );

            const loader = new THREE.ColladaLoader();
            const processCollada = (collada) => {
                            const sketchUpScene = collada.scene.children.find(child => child.name === 'SketchUp');
                            const vehicle = sketchUpScene &&
                                sketchUpScene.children.find(child => child.name === 'group_0');
                            if (!vehicle) {
                                throw new Error(`Grup model ${modelName} tidak ditemukan.`);
                            }

                            const model = new THREE.Group();
                            model.rotation.copy(collada.scene.rotation);
                            model.scale.copy(collada.scene.scale);
                            const facing = new THREE.Group();
                            facing.rotation.z = vehicleType === 'motorcycle'
                                ? Math.PI * 1.5
                                : Math.PI;
                            facing.add(vehicle);
                            model.add(facing);
                            model.updateWorldMatrix(true, true);
                            let bounds = new THREE.Box3().setFromObject(model);
                            let size = bounds.getSize(new THREE.Vector3());
                            if (!size.toArray().every(value => Number.isFinite(value) && value > 0)) {
                                throw new Error(`Ukuran model ${modelName} tidak valid.`);
                            }
                            if (vehicleType === 'motorcycle') {
                                const scale = nmaxNeoSpecs.length / Math.max(size.x, size.z);
                                model.scale.multiplyScalar(scale);
                                model.updateWorldMatrix(true, true);
                                bounds = new THREE.Box3().setFromObject(model);
                                size = bounds.getSize(new THREE.Vector3());
                            }
                            const center = bounds.getCenter(new THREE.Vector3());
                            model.position.set(
                                -center.x,
                                -bounds.min.y,
                                -center.z
                            );
                            model.updateWorldMatrix(true, true);

                            const wheelMounts = getVisualWheelMounts(vehicleType, model);
                            const vehicleToModel = model.matrixWorld.clone().invert()
                                .multiply(vehicle.matrixWorld);
                            const inverseVehicleMatrix = vehicle.matrixWorld.clone().invert();
                            const batches = new Map();
                            const sourceGeometries = new Set();
                            const foundAnnotatedPaths = new Set();
                            vehicle.traverse((child) => {
                                if (child.geometry) sourceGeometries.add(child.geometry);
                                if (child.isLine || !child.isMesh) return;
                                const objectPath = annotatedWheelAssignments
                                    ? getVehicleObjectPath(child, vehicle)
                                    : null;
                                const assignedWheelIndex = annotatedWheelAssignments
                                    ? annotatedWheelAssignments.get(objectPath)
                                    : undefined;
                                if (assignedWheelIndex !== undefined) {
                                    foundAnnotatedPaths.add(objectPath);
                                }
                                const materials = Array.isArray(child.material)
                                    ? child.material
                                    : [child.material];
                                const attributes = Object.keys(child.geometry.attributes)
                                    .sort()
                                    .map(name => {
                                        const attribute = child.geometry.attributes[name];
                                        return `${name}:${attribute.itemSize}:${attribute.array.constructor.name}`;
                                    })
                                    .join('|');

                                materials.forEach(material => {
                                    const key = `${material.uuid}|${attributes}`;
                                    let batch = batches.get(key);
                                    if (!batch) {
                                        const vehicleMaterial = material.clone();
                                        if ((vehicleType === 'car' && material.name === 'Metallic') ||
                                            (vehicleType === 'motorcycle' &&
                                                material.name === 'ko_copy_0')) {
                                            vehicleMaterial.color.set(color);
                                            vehicleMaterial.userData.isVehiclePaint = true;
                                        }
                                        batch = {
                                            material: vehicleMaterial,
                                            geometries: [],
                                            wheelGeometries: wheelMounts.map(() => [])
                                        };
                                        batches.set(key, batch);
                                    }

                                    const geometry = child.geometry.clone();
                                    geometry.applyMatrix4(
                                        inverseVehicleMatrix.clone().multiply(child.matrixWorld)
                                    );
                                    if (annotatedWheelAssignments) {
                                        if (assignedWheelIndex === undefined) {
                                            batch.geometries.push(geometry);
                                        } else {
                                            const wheelGeometry = geometry.clone();
                                            wheelGeometry.applyMatrix4(vehicleToModel);
                                            wheelGeometry.translate(
                                                -wheelMounts[assignedWheelIndex].center.x,
                                                -wheelMounts[assignedWheelIndex].center.y,
                                                -wheelMounts[assignedWheelIndex].center.z
                                            );
                                            geometry.dispose();
                                            batch.wheelGeometries[assignedWheelIndex].push(wheelGeometry);
                                        }
                                        return;
                                    }
                                    const split = (
                                        vehicleType === 'car' &&
                                        batch.material.userData.isVehiclePaint
                                    )
                                        ? { bodyGeometry: geometry, wheelGeometries: [] }
                                        : splitWheelGeometry(
                                            geometry,
                                            vehicleToModel,
                                            vehicle.matrixWorld,
                                            wheelMounts
                                        );
                                    if (split.wheelGeometries.length) {
                                        geometry.dispose();
                                        if (split.bodyGeometry) {
                                            batch.geometries.push(split.bodyGeometry);
                                        }
                                        split.wheelGeometries.forEach((wheelGeometry, index) => {
                                            if (wheelGeometry) {
                                                batch.wheelGeometries[index].push(wheelGeometry);
                                            }
                                        });
                                    } else {
                                        batch.geometries.push(split.bodyGeometry);
                                    }
                                });
                            });
                            if (annotatedWheelAssignments) {
                                const missingPaths = [...annotatedWheelAssignments.keys()]
                                    .filter(path => !foundAnnotatedPaths.has(path));
                                if (missingPaths.length) {
                                    throw new Error(
                                        `Objek roda ${modelName} tidak ditemukan: ${missingPaths.join(', ')}`
                                    );
                                }
                            }

                            const wheelPivots = wheelMounts.map(mount => {
                                const wheelPivot = new THREE.Group();
                                wheelPivot.position.copy(mount.center);
                                wheelPivot.userData.isWheelPivot = true;
                                wheelPivot.userData.axle = mount.axle;
                                wheelPivot.userData.spinAngle = 0;
                                wheelPivot.userData.suspensionTravel = 0;
                                wheelPivot.userData.suspensionVelocity = 0;
                                wheelPivot.userData.steeringPivot = new THREE.Group();
                                wheelPivot.userData.spinPivot = new THREE.Group();
                                wheelPivot.add(wheelPivot.userData.steeringPivot);
                                wheelPivot.userData.steeringPivot.add(wheelPivot.userData.spinPivot);
                                model.add(wheelPivot);
                                return wheelPivot;
                            });

                            vehicle.clear();
                            batches.forEach(batch => {
                                if (batch.geometries.length) {
                                    const geometry = THREE.BufferGeometryUtils.mergeBufferGeometries(
                                        batch.geometries,
                                        false
                                    );
                                    batch.geometries.forEach(sourceGeometry => sourceGeometry.dispose());
                                    if (!geometry) {
                                        throw new Error(`Geometri model ${modelName} gagal digabungkan.`);
                                    }
                                    const mesh = new THREE.Mesh(geometry, batch.material);
                                    mesh.castShadow = true;
                                    mesh.receiveShadow = true;
                                    vehicle.add(mesh);
                                }

                                batch.wheelGeometries.forEach((geometries, index) => {
                                    if (!geometries.length) return;
                                    const geometry = THREE.BufferGeometryUtils.mergeBufferGeometries(
                                        geometries,
                                        false
                                    );
                                    geometries.forEach(wheelGeometry => wheelGeometry.dispose());
                                    if (!geometry) {
                                        throw new Error(`Geometri roda ${modelName} gagal digabungkan.`);
                                    }
                                    const mesh = new THREE.Mesh(
                                        geometry,
                                        batch.material
                                    );
                                    const materialColor = batch.material.color;
                                    if (
                                        batch.material.userData.isVehiclePaint ||
                                        (
                                            materialColor &&
                                            materialColor.r > 0.92 &&
                                            materialColor.g > 0.92 &&
                                            materialColor.b > 0.92
                                        )
                                    ) {
                                        mesh.material = batch.material.clone();
                                        mesh.material.userData.isVehiclePaint = false;
                                        mesh.material.color.set(
                                            vehicleType === 'motorcycle' &&
                                            batch.material.userData.isVehiclePaint &&
                                            batch.material.map
                                                ? 0xffffff
                                                : 0x111111
                                        );
                                    }
                                    mesh.castShadow = true;
                                    mesh.receiveShadow = true;
                                    wheelPivots[index].userData.spinPivot.add(mesh);
                                    wheelPivots[index].userData.vertexCount =
                                        (wheelPivots[index].userData.vertexCount || 0) +
                                        geometry.attributes.position.count;
                                });
                            });
                            sourceGeometries.forEach(geometry => geometry.dispose());

                            if (wheelPivots.some(wheelPivot =>
                                !wheelPivot.userData.vertexCount ||
                                wheelPivot.userData.vertexCount < 90
                            )) {
                                throw new Error(`Geometri roda model ${modelName} tidak lengkap.`);
                            }
                            model.userData.wheelPivots = wheelPivots;
                            return model;
            };

            const chunkedText = await loadChunkedColladaText(modelPath);
            if (chunkedText) {
                const baseUrl = THREE.LoaderUtils.extractUrlBase(modelPath);
                const collada = loader.parse(chunkedText, baseUrl);
                return processCollada(collada);
            }

            if (await isGitLfsPointer(modelPath)) {
                console.warn(`Model ${modelName} berupa pointer Git LFS; memakai model 3D prosedural.`);
                return createProceduralVehicleModel(vehicleType, color);
            }

            return new Promise((resolve, reject) => {
                loader.load(
                    modelPath,
                    (collada) => {
                        try {
                            resolve(processCollada(collada));
                        } catch (error) {
                            reject(error);
                        }
                    },
                    onProgress,
                    (error) => {
                        reject(error instanceof Error ? error : new Error(`Gagal memuat model ${modelName}.`));
                    }
                );
            });
        }

        async function createPlayerCar(vehicleType, color, name, onModelProgress) {
            const carGroup = new THREE.Group();
            const cachedModel = previewVehicleModels[vehicleType];
            if (cachedModel) {
                previewScene.remove(previewVehiclePivots[vehicleType]);
                delete previewVehiclePivots[vehicleType];
                delete previewVehicleModels[vehicleType];
                carGroup.add(cachedModel);
            } else if (vehicleType === 'car') {
                carGroup.add(await loadDetailedVehicleModel(
                    'assets/toyota-innova-zenix-2023/model.dae',
                    'Innova Zenix',
                    vehicleType,
                    color,
                    onModelProgress
                ));
            } else if (vehicleType === 'motorcycle') {
                carGroup.add(await loadDetailedVehicleModel(
                    'assets/yamaha-nmax-neo-155/model.dae',
                    'Yamaha NMAX 155 Neo',
                    vehicleType,
                    color,
                    onModelProgress
                ));
            } else {
                throw new Error(`Jenis kendaraan tidak didukung: ${vehicleType}`);
            }

            if (vehicleType === 'motorcycle') {
                const specs = nmaxNeoSpecs;
                addLicensePlate(carGroup, name, 0.2, 0.11, specs.length / 2 - 0.05, 0.48, false);
            } else if (carGroup.children.some(child => child.userData.isProceduralModel)) {
                const specs = innovaZenixSpecs;
                addLicensePlate(carGroup, name, 0.46, 0.14, -specs.length / 2 + 0.02, 0.45, true);
                addLicensePlate(carGroup, name, 0.46, 0.14, specs.length / 2 - 0.01, 0.68, false);
            }

            finalizePlayerCar(carGroup, vehicleType);
            return carGroup;
        }

